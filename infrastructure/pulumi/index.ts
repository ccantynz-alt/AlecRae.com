import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { environment, domain, envConfig, baseTags } from "./config";
import {
  vpc,
  publicSubnets,
  privateSubnets,
  albSecurityGroup,
} from "./networking";
import { rdsInstance, dbEndpoint, dbAddress } from "./database";
import {
  cluster,
  k8sProvider,
  clusterName,
  kubeconfig,
  clusterEndpoint,
} from "./kubernetes";

// ─── S3 Buckets ─────────────────────────────────────────────────────────────

const attachmentsBucket = new aws.s3.BucketV2("alecrae-attachments", {
  bucket: `alecrae-${environment}-attachments`,
  forceDestroy: environment === "dev",
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-attachments`,
  },
});

new aws.s3.BucketVersioningV2("attachments-versioning", {
  bucket: attachmentsBucket.id,
  versioningConfiguration: {
    status: "Enabled",
  },
});

new aws.s3.BucketServerSideEncryptionConfigurationV2("attachments-encryption", {
  bucket: attachmentsBucket.id,
  rules: [
    {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "aws:kms",
      },
      bucketKeyEnabled: true,
    },
  ],
});

new aws.s3.BucketLifecycleConfigurationV2("attachments-lifecycle", {
  bucket: attachmentsBucket.id,
  rules: [
    {
      id: "transition-to-ia",
      status: "Enabled",
      transitions: [
        {
          days: 90,
          storageClass: "STANDARD_IA",
        },
        {
          days: 365,
          storageClass: "GLACIER",
        },
      ],
    },
  ],
});

new aws.s3.BucketPublicAccessBlock("attachments-public-access", {
  bucket: attachmentsBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// Backup bucket
const backupBucket = new aws.s3.BucketV2("alecrae-backups", {
  bucket: `alecrae-${environment}-backups`,
  forceDestroy: environment === "dev",
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-backups`,
  },
});

new aws.s3.BucketVersioningV2("backups-versioning", {
  bucket: backupBucket.id,
  versioningConfiguration: {
    status: "Enabled",
  },
});

new aws.s3.BucketServerSideEncryptionConfigurationV2("backups-encryption", {
  bucket: backupBucket.id,
  rules: [
    {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "aws:kms",
      },
      bucketKeyEnabled: true,
    },
  ],
});

new aws.s3.BucketPublicAccessBlock("backups-public-access", {
  bucket: backupBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// ─── ElastiCache Redis ──────────────────────────────────────────────────────

import { redisSecurityGroup } from "./networking";

const redisSubnetGroup = new aws.elasticache.SubnetGroup("alecrae-redis-subnet", {
  subnetIds: privateSubnets.map((s) => s.id),
  tags: baseTags,
});

const redisParameterGroup = new aws.elasticache.ParameterGroup("alecrae-redis-params", {
  family: "redis7",
  description: `AlecRae ${environment} Redis 7 parameter group`,
  parameters: [
    { name: "maxmemory-policy", value: "allkeys-lru" },
    { name: "notify-keyspace-events", value: "Ex" },
    { name: "timeout", value: "300" },
    { name: "tcp-keepalive", value: "60" },
  ],
  tags: baseTags,
});

const redisCluster = new aws.elasticache.ReplicationGroup("alecrae-redis", {
  replicationGroupId: `alecrae-${environment}`,
  description: `AlecRae ${environment} Redis cluster`,
  nodeType: envConfig.redisNodeType,
  numCacheClusters: 1 + envConfig.redisNumReplicas,
  parameterGroupName: redisParameterGroup.name,
  subnetGroupName: redisSubnetGroup.name,
  securityGroupIds: [redisSecurityGroup.id],
  port: 6379,
  atRestEncryptionEnabled: true,
  transitEncryptionEnabled: true,
  automaticFailoverEnabled: envConfig.redisNumReplicas > 0,
  multiAzEnabled: envConfig.redisNumReplicas > 0,
  snapshotRetentionLimit: environment === "prod" ? 7 : 1,
  snapshotWindow: "02:00-03:00",
  maintenanceWindow: "sun:03:30-sun:04:30",
  autoMinorVersionUpgrade: true,
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-redis`,
  },
});

// ─── Route53 DNS ────────────────────────────────────────────────────────────

const hostedZone = new aws.route53.Zone("alecrae-zone", {
  name: domain,
  comment: `AlecRae ${environment} DNS zone`,
  tags: baseTags,
});

// MX record for inbound mail
new aws.route53.Record("alecrae-mx", {
  zoneId: hostedZone.zoneId,
  name: domain,
  type: "MX",
  ttl: 3600,
  records: [
    `10 mail.${domain}`,
    `20 mail2.${domain}`,
  ],
});

// SPF record
new aws.route53.Record("alecrae-spf", {
  zoneId: hostedZone.zoneId,
  name: domain,
  type: "TXT",
  ttl: 3600,
  records: [`v=spf1 include:${domain} -all`],
});

// DMARC record
new aws.route53.Record("alecrae-dmarc", {
  zoneId: hostedZone.zoneId,
  name: `_dmarc.${domain}`,
  type: "TXT",
  ttl: 3600,
  records: [
    `v=DMARC1; p=reject; rua=mailto:dmarc-reports@${domain}; ruf=mailto:dmarc-forensics@${domain}; fo=1; adkim=s; aspf=s; pct=100`,
  ],
});

// ─── ACM Certificates ───────────────────────────────────────────────────────

const certificate = new aws.acm.Certificate("alecrae-cert", {
  domainName: domain,
  subjectAlternativeNames: [`*.${domain}`],
  validationMethod: "DNS",
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-cert`,
  },
  lifecycle: {
    createBeforeDestroy: true,
  },
});

// DNS validation records
const certValidation = new aws.route53.Record("alecrae-cert-validation", {
  zoneId: hostedZone.zoneId,
  name: certificate.domainValidationOptions[0].resourceRecordName,
  type: certificate.domainValidationOptions[0].resourceRecordType,
  records: [certificate.domainValidationOptions[0].resourceRecordValue],
  ttl: 60,
});

const certValidated = new aws.acm.CertificateValidation("alecrae-cert-validated", {
  certificateArn: certificate.arn,
  validationRecordFqdns: [certValidation.fqdn],
});

// ─── Application Load Balancer ──────────────────────────────────────────────

const alb = new aws.lb.LoadBalancer("alecrae-alb", {
  name: `alecrae-${environment}`,
  internal: false,
  loadBalancerType: "application",
  securityGroups: [albSecurityGroup.id],
  subnets: publicSubnets.map((s) => s.id),
  enableDeletionProtection: envConfig.deletionProtection,
  enableHttp2: true,
  idleTimeout: 120,
  dropInvalidHeaderFields: true,
  tags: {
    ...baseTags,
    Name: `alecrae-${environment}-alb`,
  },
});

// HTTPS listener
const httpsListener = new aws.lb.Listener("alecrae-https", {
  loadBalancerArn: alb.arn,
  port: 443,
  protocol: "HTTPS",
  sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
  certificateArn: certValidated.certificateArn,
  defaultActions: [
    {
      type: "fixed-response",
      fixedResponse: {
        contentType: "text/plain",
        messageBody: "Not Found",
        statusCode: "404",
      },
    },
  ],
  tags: baseTags,
});

// HTTP -> HTTPS redirect
new aws.lb.Listener("alecrae-http-redirect", {
  loadBalancerArn: alb.arn,
  port: 80,
  protocol: "HTTP",
  defaultActions: [
    {
      type: "redirect",
      redirect: {
        port: "443",
        protocol: "HTTPS",
        statusCode: "HTTP_301",
      },
    },
  ],
  tags: baseTags,
});

// Route53 alias for ALB
new aws.route53.Record("alecrae-app-alias", {
  zoneId: hostedZone.zoneId,
  name: `app.${domain}`,
  type: "A",
  aliases: [
    {
      name: alb.dnsName,
      zoneId: alb.zoneId,
      evaluateTargetHealth: true,
    },
  ],
});

new aws.route53.Record("alecrae-api-alias", {
  zoneId: hostedZone.zoneId,
  name: `api.${domain}`,
  type: "A",
  aliases: [
    {
      name: alb.dnsName,
      zoneId: alb.zoneId,
      evaluateTargetHealth: true,
    },
  ],
});

// ─── Exports ────────────────────────────────────────────────────────────────

export const vpcId = vpc.id;
export const eksClusterName = clusterName;
export const eksClusterEndpoint = clusterEndpoint;
export const eksKubeconfig = kubeconfig;
export const rdsEndpoint = dbEndpoint;
export const rdsAddress = dbAddress;
export const redisEndpoint = redisCluster.primaryEndpointAddress;
export const albDnsName = alb.dnsName;
export const albArn = alb.arn;
export const certificateArn = certificate.arn;
export const hostedZoneId = hostedZone.zoneId;
export const hostedZoneNameServers = hostedZone.nameServers;
export const attachmentsBucketName = attachmentsBucket.id;
export const backupBucketName = backupBucket.id;
