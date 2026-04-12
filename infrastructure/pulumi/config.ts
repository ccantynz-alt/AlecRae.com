import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config("alecrae");

export type Environment = "dev" | "staging" | "prod";

export const environment = config.require("environment") as Environment;
export const domain = config.require("domain");

// ─── Environment-Specific Configuration ─────────────────────────────────────

interface EnvironmentConfig {
  /** VPC CIDR block */
  vpcCidr: string;
  /** Number of availability zones */
  azCount: number;
  /** EKS cluster version */
  eksVersion: string;
  /** EKS node instance types */
  nodeInstanceTypes: string[];
  /** EKS desired node count */
  nodeDesiredCount: number;
  /** EKS minimum node count */
  nodeMinCount: number;
  /** EKS maximum node count */
  nodeMaxCount: number;
  /** RDS instance class */
  rdsInstanceClass: string;
  /** RDS allocated storage (GB) */
  rdsAllocatedStorage: number;
  /** RDS max allocated storage (GB) for autoscaling */
  rdsMaxAllocatedStorage: number;
  /** RDS multi-AZ deployment */
  rdsMultiAz: boolean;
  /** RDS backup retention (days) */
  rdsBackupRetentionDays: number;
  /** ElastiCache node type */
  redisNodeType: string;
  /** ElastiCache number of replicas */
  redisNumReplicas: number;
  /** Enable deletion protection on critical resources */
  deletionProtection: boolean;
  /** Enable enhanced monitoring */
  enhancedMonitoring: boolean;
  /** Tags applied to all resources */
  tags: Record<string, string>;
}

const configs: Record<Environment, EnvironmentConfig> = {
  dev: {
    vpcCidr: "10.0.0.0/16",
    azCount: 2,
    eksVersion: "1.29",
    nodeInstanceTypes: ["t3.large"],
    nodeDesiredCount: 2,
    nodeMinCount: 1,
    nodeMaxCount: 5,
    rdsInstanceClass: "db.t4g.medium",
    rdsAllocatedStorage: 20,
    rdsMaxAllocatedStorage: 100,
    rdsMultiAz: false,
    rdsBackupRetentionDays: 7,
    redisNodeType: "cache.t4g.small",
    redisNumReplicas: 0,
    deletionProtection: false,
    enhancedMonitoring: false,
    tags: {
      Environment: "dev",
      Project: "alecrae",
      ManagedBy: "pulumi",
    },
  },

  staging: {
    vpcCidr: "10.1.0.0/16",
    azCount: 2,
    eksVersion: "1.29",
    nodeInstanceTypes: ["t3.xlarge", "t3a.xlarge"],
    nodeDesiredCount: 3,
    nodeMinCount: 2,
    nodeMaxCount: 10,
    rdsInstanceClass: "db.r6g.large",
    rdsAllocatedStorage: 50,
    rdsMaxAllocatedStorage: 200,
    rdsMultiAz: true,
    rdsBackupRetentionDays: 14,
    redisNodeType: "cache.r6g.large",
    redisNumReplicas: 1,
    deletionProtection: false,
    enhancedMonitoring: true,
    tags: {
      Environment: "staging",
      Project: "alecrae",
      ManagedBy: "pulumi",
    },
  },

  prod: {
    vpcCidr: "10.2.0.0/16",
    azCount: 3,
    eksVersion: "1.29",
    nodeInstanceTypes: ["m6i.xlarge", "m6a.xlarge", "m5.xlarge"],
    nodeDesiredCount: 6,
    nodeMinCount: 3,
    nodeMaxCount: 30,
    rdsInstanceClass: "db.r6g.xlarge",
    rdsAllocatedStorage: 100,
    rdsMaxAllocatedStorage: 1000,
    rdsMultiAz: true,
    rdsBackupRetentionDays: 35,
    redisNodeType: "cache.r6g.xlarge",
    redisNumReplicas: 2,
    deletionProtection: true,
    enhancedMonitoring: true,
    tags: {
      Environment: "prod",
      Project: "alecrae",
      ManagedBy: "pulumi",
    },
  },
};

export const envConfig = configs[environment];

export const baseTags = {
  ...envConfig.tags,
  Domain: domain,
};
