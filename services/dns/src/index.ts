export { AuthoritativeDnsServer, parseDnsMessage, serializeDnsMessage, encodeName, decodeName, encodeRdata } from "./authoritative/server";
export { DnsRecordManager } from "./records/manager";
export { DnsHealthMonitor, type HealthMonitorConfig, type HealthAlert } from "./monitoring/health";
export { DnsPropagationChecker, type PropagationCheckerConfig, type PropagationCheckOptions } from "./propagation/checker";
export {
  generateDomainConfig,
  verifyDomainConfig,
  checkDomainHealth,
  rotateDkimKey,
  type DnsRecordEntry,
  type DomainConfigResult,
  type VerificationStatus,
  type RecordVerification,
  type HealthReport,
} from "./auto-config";
export {
  runLivenessCheck,
  checkDomainLiveness,
  type LivenessResult,
  type LivenessReport,
} from "./liveness-checker";
export {
  registerDnsLivenessJob,
  closeDnsLivenessQueue,
} from "./jobs/dns-liveness-job";
export {
  RecordType,
  RecordClass,
  ResponseCode,
  type DnsHeader,
  type DnsQuestion,
  type DnsResourceRecord,
  type DnsMessage,
  type DnsRecord,
  type CreateRecordInput,
  type UpdateRecordInput,
  type DkimConfig,
  type DmarcPolicy,
  type SpfConfig,
  type DnsZone,
  type SoaRecord,
  type HealthCheckResult,
  type PropagationStatus,
  type ResolverResult,
  type DnsServerConfig,
  type ValidationResult,
} from "./types";
