import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { envConfig, baseTags, environment } from "./config";
import { vpc, privateSubnets, publicSubnets, eksSecurityGroup } from "./networking";

// ─── IAM Roles ──────────────────────────────────────────────────────────────

const eksRole = new aws.iam.Role("emailed-eks-role", {
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

const nodeRole = new aws.iam.Role("emailed-node-role", {
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

export const cluster = new eks.Cluster(`emailed-${environment}`, {
  name: `emailed-${environment}`,
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
    Name: `emailed-${environment}`,
  },
});

// ─── Managed Node Groups ────────────────────────────────────────────────────

// General workload node group
const generalNodeGroup = new eks.ManagedNodeGroup("emailed-general", {
  cluster: cluster,
  nodeGroupName: `emailed-${environment}-general`,
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
    "emailed.dev/node-type": "general",
    "emailed.dev/environment": environment,
  },
  tags: {
    ...baseTags,
    Name: `emailed-${environment}-general`,
  },
});

// MTA-dedicated node group (on-demand for reliability, tainted to isolate MTA pods)
const mtaNodeGroup = new eks.ManagedNodeGroup("emailed-mta", {
  cluster: cluster,
  nodeGroupName: `emailed-${environment}-mta`,
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
    "emailed.dev/node-type": "mta",
    "emailed.dev/environment": environment,
  },
  taints: [
    {
      key: "emailed.dev/mta",
      value: "true",
      effect: "NO_SCHEDULE",
    },
  ],
  tags: {
    ...baseTags,
    Name: `emailed-${environment}-mta`,
  },
});

// ─── Kubernetes Provider ────────────────────────────────────────────────────

export const k8sProvider = new k8s.Provider("emailed-k8s", {
  kubeconfig: cluster.kubeconfigJson,
});

// ─── Namespace ──────────────────────────────────────────────────────────────

const namespace = new k8s.core.v1.Namespace(
  "emailed",
  {
    metadata: {
      name: "emailed",
      labels: {
        "app.kubernetes.io/part-of": "emailed-platform",
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
    `emailed-${sa}`,
    {
      metadata: {
        name: `emailed-${sa}`,
        namespace: "emailed",
        labels: {
          "app.kubernetes.io/name": sa,
          "app.kubernetes.io/part-of": "emailed-platform",
        },
      },
    },
    { provider: k8sProvider, dependsOn: [namespace] },
  );
}

// Read-only role for most services
const readOnlyRole = new k8s.rbac.v1.Role(
  "emailed-readonly",
  {
    metadata: {
      name: "emailed-readonly",
      namespace: "emailed",
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
    `emailed-${sa}-readonly`,
    {
      metadata: {
        name: `emailed-${sa}-readonly`,
        namespace: "emailed",
      },
      roleRef: {
        apiGroup: "rbac.authorization.k8s.io",
        kind: "Role",
        name: "emailed-readonly",
      },
      subjects: [
        {
          kind: "ServiceAccount",
          name: `emailed-${sa}`,
          namespace: "emailed",
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
