import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { envConfig, baseTags, environment } from "./config";

// ─── VPC ────────────────────────────────────────────────────────────────────

export const vpc = new aws.ec2.Vpc("alecrae-vpc", {
  cidrBlock: envConfig.vpcCidr,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-vpc`,
  },
});

// ─── Internet Gateway ───────────────────────────────────────────────────────

const igw = new aws.ec2.InternetGateway("alecrae-igw", {
  vpcId: vpc.id,
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-igw`,
  },
});

// ─── Availability Zones ─────────────────────────────────────────────────────

const azs = aws.getAvailabilityZones({
  state: "available",
});

// ─── Public Subnets ─────────────────────────────────────────────────────────

export const publicSubnets: aws.ec2.Subnet[] = [];
for (let i = 0; i < envConfig.azCount; i++) {
  const subnet = new aws.ec2.Subnet(`alecrae-public-${i}`, {
    vpcId: vpc.id,
    cidrBlock: `${envConfig.vpcCidr.split(".")[0]}.${envConfig.vpcCidr.split(".")[1]}.${i * 16}.0/20`,
    availabilityZone: azs.then((az) => az.names[i]),
    mapPublicIpOnLaunch: true,
    tags: {
      ...baseTags,
      Name: `alecrae-${environment}-public-${i}`,
      "kubernetes.io/role/elb": "1",
      [`kubernetes.io/cluster/alecrae-${environment}`]: "shared",
    },
  });
  publicSubnets.push(subnet);
}

// ─── Private Subnets ────────────────────────────────────────────────────────

export const privateSubnets: aws.ec2.Subnet[] = [];
for (let i = 0; i < envConfig.azCount; i++) {
  const subnet = new aws.ec2.Subnet(`alecrae-private-${i}`, {
    vpcId: vpc.id,
    cidrBlock: `${envConfig.vpcCidr.split(".")[0]}.${envConfig.vpcCidr.split(".")[1]}.${128 + i * 16}.0/20`,
    availabilityZone: azs.then((az) => az.names[i]),
    tags: {
      ...baseTags,
      Name: `alecrae-${environment}-private-${i}`,
      "kubernetes.io/role/internal-elb": "1",
      [`kubernetes.io/cluster/alecrae-${environment}`]: "shared",
    },
  });
  privateSubnets.push(subnet);
}

// ─── NAT Gateways (one per AZ for HA in prod, single in dev) ────────────────

const natEips: aws.ec2.Eip[] = [];
const natGateways: aws.ec2.NatGateway[] = [];
const natCount = environment === "prod" ? envConfig.azCount : 1;

for (let i = 0; i < natCount; i++) {
  const eip = new aws.ec2.Eip(`alecrae-nat-eip-${i}`, {
    domain: "vpc",
    tags: {
      ...baseTags,
      Name: `alecrae-${environment}-nat-eip-${i}`,
    },
  });
  natEips.push(eip);

  const natGw = new aws.ec2.NatGateway(`alecrae-nat-${i}`, {
    allocationId: eip.id,
    subnetId: publicSubnets[i].id,
    tags: {
      ...baseTags,
      Name: `alecrae-${environment}-nat-${i}`,
    },
  });
  natGateways.push(natGw);
}

// ─── Route Tables ───────────────────────────────────────────────────────────

const publicRouteTable = new aws.ec2.RouteTable("alecrae-public-rt", {
  vpcId: vpc.id,
  routes: [
    {
      cidrBlock: "0.0.0.0/0",
      gatewayId: igw.id,
    },
  ],
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-public-rt`,
  },
});

for (let i = 0; i < envConfig.azCount; i++) {
  new aws.ec2.RouteTableAssociation(`alecrae-public-rta-${i}`, {
    subnetId: publicSubnets[i].id,
    routeTableId: publicRouteTable.id,
  });
}

for (let i = 0; i < envConfig.azCount; i++) {
  const natIndex = environment === "prod" ? i : 0;
  const privateRt = new aws.ec2.RouteTable(`alecrae-private-rt-${i}`, {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: "0.0.0.0/0",
        natGatewayId: natGateways[natIndex].id,
      },
    ],
    tags: {
      ...baseTags,
      Name: `alecrae-${environment}-private-rt-${i}`,
    },
  });

  new aws.ec2.RouteTableAssociation(`alecrae-private-rta-${i}`, {
    subnetId: privateSubnets[i].id,
    routeTableId: privateRt.id,
  });
}

// ─── Security Groups ────────────────────────────────────────────────────────

export const albSecurityGroup = new aws.ec2.SecurityGroup("alecrae-alb-sg", {
  vpcId: vpc.id,
  description: "Security group for the ALB — allows HTTP/HTTPS from internet",
  ingress: [
    {
      description: "HTTP",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      description: "HTTPS",
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-alb-sg`,
  },
});

export const eksSecurityGroup = new aws.ec2.SecurityGroup("alecrae-eks-sg", {
  vpcId: vpc.id,
  description: "Security group for EKS worker nodes",
  ingress: [
    {
      description: "Allow ALB traffic",
      fromPort: 0,
      toPort: 65535,
      protocol: "tcp",
      securityGroups: [albSecurityGroup.id],
    },
    {
      description: "Allow node-to-node communication",
      fromPort: 0,
      toPort: 65535,
      protocol: "-1",
      self: true,
    },
  ],
  egress: [
    {
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-eks-sg`,
  },
});

export const dbSecurityGroup = new aws.ec2.SecurityGroup("alecrae-db-sg", {
  vpcId: vpc.id,
  description: "Security group for RDS — allows PostgreSQL from EKS only",
  ingress: [
    {
      description: "PostgreSQL from EKS nodes",
      fromPort: 5432,
      toPort: 5432,
      protocol: "tcp",
      securityGroups: [eksSecurityGroup.id],
    },
  ],
  egress: [],
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-db-sg`,
  },
});

export const redisSecurityGroup = new aws.ec2.SecurityGroup(
  "alecrae-redis-sg",
  {
    vpcId: vpc.id,
    description: "Security group for ElastiCache — allows Redis from EKS only",
    ingress: [
      {
        description: "Redis from EKS nodes",
        fromPort: 6379,
        toPort: 6379,
        protocol: "tcp",
        securityGroups: [eksSecurityGroup.id],
      },
    ],
    egress: [],
    tags: {
      ...baseTags,
      Name: `alecrae-${environment}-redis-sg`,
    },
  },
);

export const mtaSecurityGroup = new aws.ec2.SecurityGroup("alecrae-mta-sg", {
  vpcId: vpc.id,
  description: "Security group for MTA NLB — allows SMTP from internet",
  ingress: [
    {
      description: "SMTP",
      fromPort: 25,
      toPort: 25,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      description: "SMTP Submission",
      fromPort: 587,
      toPort: 587,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      description: "SMTP Submissions (implicit TLS)",
      fromPort: 465,
      toPort: 465,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-mta-sg`,
  },
});
