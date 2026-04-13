import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { envConfig, baseTags, environment } from "./config";
import { vpc, privateSubnets, publicSubnets, eksSecurityGroup } from "./networking";

// ─── IAM Roles ──────────────────────────────────────────────────────────────

const eksRole = new aws.iam.Role("alecrae-eks-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "eks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
  tags: baseTags,
});

new aws.iam.RolePolicyAttachment("eks-cluster-policy", {
  role: eksRole.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
});

new aws.iam.RolePolicyAttachment("eks-vpc-cni-policy", {
  role: eksRole.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController",
});

const nodeRole = new aws.iam.Role("alecrae-node-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ec2.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
  tags: baseTags,
});

const nodePolicies = [
  "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
  "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
  "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
  "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
];

nodePolicies.forEach((policyArn, index) => {
  new aws.iam.RolePolicyAttachment(`node-policy-${index}`, {
    role: nodeRole.name,
    policyArn,
  });
});

// ─── EKS Cluster ────────────────────────────────────────────────────────────

export const cluster = new eks.Cluster(`alecrae-${environment}`, {
  name: `alecrae-${environment}`,
  version: envConfig.eksVersion,
  vpcId: vpc.id,
  subnetIds: privateSubnets.map((s) => s.id),
  publicSubnetIds: publicSubnets.map((s) => s.id),
  nodeAssociatePublicIpAddress: false,
  endpointPrivateAccess: true,
  endpointPublicAccess: true,
  serviceRole: eksRole,
  instanceRole: nodeRole,
  clusterSecurityGroup: eksSecurityGroup,
  createOidcProvider: true,

  // Enable control plane logging
  enabledClusterLogTypes: [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler",
  ],

  tags: {
    ...baseTags,
    Name: `alecrae-${environment}`,
  },
});

// ─── Managed Node Groups ────────────────────────────────────────────────────

// General workload node group
const generalNodeGroup = new eks.ManagedNodeGroup("alecrae-general", {
  cluster: cluster,
  nodeGroupName: `alecrae-${environment}-general`,
  instanceTypes: envConfig.nodeInstanceTypes,
  scalingConfig: {
    desiredSize: envConfig.nodeDesiredCount,
    minSize: envConfig.nodeMinCount,
    maxSize: envConfig.nodeMaxCount,
  },
  diskSize: 100,
  amiType: "AL2_x86_64",
  capacityType: environment === "prod" ? "ON_DEMAND" : "SPOT",
  labels: {
    "alecrae.dev/node-type": "general",
    "alecrae.dev/environment": environment,
  },
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-general`,
  },
});

// MTA-dedicated node group (on-demand for reliability, tainted to isolate MTA pods)
const mtaNodeGroup = new eks.ManagedNodeGroup("alecrae-mta", {
  cluster: cluster,
  nodeGroupName: `alecrae-${environment}-mta`,
  instanceTypes: environment === "prod" ? ["c6i.xlarge", "c6a.xlarge"] : ["t3.large"],
  scalingConfig: {
    desiredSize: environment === "prod" ? 3 : 1,
    minSize: environment === "prod" ? 3 : 1,
    maxSize: environment === "prod" ? 10 : 3,
  },
  diskSize: 50,
  amiType: "AL2_x86_64",
  capacityType: "ON_DEMAND",
  labels: {
    "alecrae.dev/node-type": "mta",
    "alecrae.dev/environment": environment,
  },
  taints: [
    {
      key: "alecrae.dev/mta",
      value: "true",
      effect: "NO_SCHEDULE",
    },
  ],
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-mta`,
  },
});

// ─── Kubernetes Provider ────────────────────────────────────────────────────

export const k8sProvider = new k8s.Provider("alecrae-k8s", {
  kubeconfig: cluster.kubeconfigJson,
});

// ─── Namespace ──────────────────────────────────────────────────────────────

const namespace = new k8s.core.v1.Namespace(
  "alecrae",
  {
    metadata: {
      name: "alecrae",
      labels: {
        "app.kubernetes.io/part-of": "alecrae-platform",
        "app.kubernetes.io/managed-by": "pulumi",
      },
    },
  },
  { provider: k8sProvider },
);

// ─── RBAC ───────────────────────────────────────────────────────────────────

// Service accounts for each workload
const serviceAccounts = ["web", "api", "mta", "admin"] as const;

for (const sa of serviceAccounts) {
  new k8s.core.v1.ServiceAccount(
    `alecrae-${sa}`,
    {
      metadata: {
        name: `alecrae-${sa}`,
        namespace: "alecrae",
        labels: {
          "app.kubernetes.io/name": sa,
          "app.kubernetes.io/part-of": "alecrae-platform",
        },
      },
    },
    { provider: k8sProvider, dependsOn: [namespace] },
  );
}

// Read-only role for most services
const readOnlyRole = new k8s.rbac.v1.Role(
  "alecrae-readonly",
  {
    metadata: {
      name: "alecrae-readonly",
      namespace: "alecrae",
    },
    rules: [
      {
        apiGroups: [""],
        resources: ["configmaps", "secrets"],
        verbs: ["get", "list", "watch"],
      },
      {
        apiGroups: [""],
        resources: ["pods", "services"],
        verbs: ["get", "list"],
      },
    ],
  },
  { provider: k8sProvider, dependsOn: [namespace] },
);

for (const sa of serviceAccounts) {
  new k8s.rbac.v1.RoleBinding(
    `alecrae-${sa}-readonly`,
    {
      metadata: {
        name: `alecrae-${sa}-readonly`,
        namespace: "alecrae",
      },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "Role",
        name: "alecrae-readonly",
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: `alecrae-${sa}`,
          namespace: "alecrae",
        },
      ],
    },
    { provider: k8sProvider, dependsOn: [namespace] },
  );
}

// ─── Outputs ────────────────────────────────────────────────────────────────

export const clusterName = cluster.eksCluster.name;
export const kubeconfig = cluster.kubeconfig;
export const clusterEndpoint = cluster.eksCluster.endpoint;
export const clusterOidcIssuer = cluster.eksCluster.identities[0].oidcs[0].issuer;
