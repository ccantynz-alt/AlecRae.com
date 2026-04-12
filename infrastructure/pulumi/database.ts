import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { envConfig, baseTags, environment } from "./config";
import { vpc, privateSubnets, dbSecurityGroup } from "./networking";

// ─── RDS Subnet Group ───────────────────────────────────────────────────────

const dbSubnetGroup = new aws.rds.SubnetGroup("alecrae-db-subnet", {
  subnetIds: privateSubnets.map((s) => s.id),
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-db-subnet`,
  },
});

// ─── RDS Parameter Group ────────────────────────────────────────────────────

const dbParameterGroup = new aws.rds.ParameterGroup("alecrae-db-params", {
  family: "postgres15",
  description: `AlecRae ${environment} PostgreSQL 15 parameter group`,
  parameters: [
    // Performance
    { name: "shared_buffers", value: "{DBInstanceClassMemory/4}" },
    { name: "effective_cache_size", value: "{DBInstanceClassMemory*3/4}" },
    { name: "maintenance_work_mem", value: "524288" }, // 512MB in KB
    { name: "checkpoint_completion_target", value: "0.9" },
    { name: "wal_buffers", value: "16384" }, // 16MB in KB
    { name: "random_page_cost", value: "1.1" },
    { name: "effective_io_concurrency", value: "200" },
    { name: "max_connections", value: "200" },

    // WAL / Replication
    { name: "wal_level", value: "replica" },
    { name: "max_wal_senders", value: "10" },
    { name: "max_replication_slots", value: "10" },

    // Logging
    { name: "log_min_duration_statement", value: "1000" }, // Log queries > 1s
    { name: "log_checkpoints", value: "1" },
    { name: "log_connections", value: "1" },
    { name: "log_disconnections", value: "1" },
    { name: "log_lock_waits", value: "1" },
    { name: "log_temp_files", value: "0" },
    { name: "log_autovacuum_min_duration", value: "0" },

    // Autovacuum tuning
    { name: "autovacuum_max_workers", value: "4" },
    { name: "autovacuum_naptime", value: "30" },
    { name: "autovacuum_vacuum_threshold", value: "50" },
    { name: "autovacuum_analyze_threshold", value: "50" },
    { name: "autovacuum_vacuum_scale_factor", value: "0.05" },
    { name: "autovacuum_analyze_scale_factor", value: "0.025" },

    // Security
    { name: "ssl", value: "1" },
    { name: "password_encryption", value: "scram-sha-256" },
  ],
  tags: baseTags,
});

// ─── RDS Instance ───────────────────────────────────────────────────────────

const dbPassword = new pulumi.Config("alecrae").requireSecret("dbPassword");

export const rdsInstance = new aws.rds.Instance("alecrae-db", {
  identifier: `alecrae-${environment}`,
  engine: "postgres",
  engineVersion: "15.7",
  instanceClass: envConfig.rdsInstanceClass,

  // Storage
  allocatedStorage: envConfig.rdsAllocatedStorage,
  maxAllocatedStorage: envConfig.rdsMaxAllocatedStorage,
  storageType: "gp3",
  storageEncrypted: true,

  // Database
  dbName: "alecrae",
  username: "alecrae",
  password: dbPassword,
  parameterGroupName: dbParameterGroup.name,

  // Networking
  dbSubnetGroupName: dbSubnetGroup.name,
  vpcSecurityGroupIds: [dbSecurityGroup.id],
  publiclyAccessible: false,
  multiAz: envConfig.rdsMultiAz,

  // Backup
  backupRetentionPeriod: envConfig.rdsBackupRetentionDays,
  backupWindow: "03:00-04:00",
  maintenanceWindow: "sun:04:30-sun:05:30",
  copyTagsToSnapshot: true,
  finalSnapshotIdentifier: `alecrae-${environment}-final`,
  skipFinalSnapshot: environment === "dev",

  // Monitoring
  performanceInsightsEnabled: envConfig.enhancedMonitoring,
  performanceInsightsRetentionPeriod: envConfig.enhancedMonitoring ? 7 : undefined,
  monitoringInterval: envConfig.enhancedMonitoring ? 60 : 0,
  enabledCloudwatchLogsExports: ["postgresql", "upgrade"],

  // Protection
  deletionProtection: envConfig.deletionProtection,

  // Auto minor version upgrade
  autoMinorVersionUpgrade: true,

  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-postgres`,
  },
});

// ─── Outputs ────────────────────────────────────────────────────────────────

export const dbEndpoint = rdsInstance.endpoint;
export const dbAddress = rdsInstance.address;
export const dbPort = rdsInstance.port;
