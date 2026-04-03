// ─── IP Warm-up Types ─────────────────────────────────────────────────────────

/** ISP identifiers for provider-specific strategies */
export type IspProvider = "gmail" | "yahoo" | "microsoft" | "apple" | "aol" | "comcast" | "generic";

/** Warm-up phase representing a stage of the ramp-up schedule */
export interface WarmupPhase {
  day: number;
  dailyVolume: number;
  hourlyLimit: number;
  description: string;
}

/** Warm-up schedule for a specific IP address */
export interface WarmupSchedule {
  ipAddress: string;
  domain: string;
  provider: IspProvider;
  phases: WarmupPhase[];
  currentPhase: number;
  startDate: Date;
  status: WarmupStatus;
  /** Adaptive modifier applied to volumes based on signals (0.0 - 2.0, 1.0 = normal) */
  adaptiveMultiplier: number;
  metrics: WarmupMetrics;
}

export type WarmupStatus = "pending" | "active" | "paused" | "completed" | "failed";

/** Aggregated metrics tracked during warm-up */
export interface WarmupMetrics {
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalDeferred: number;
  totalComplaints: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  deferralRate: number;
  /** Daily metric snapshots */
  dailySnapshots: DailySnapshot[];
}

export interface DailySnapshot {
  date: string; // ISO date
  sent: number;
  delivered: number;
  bounced: number;
  deferred: number;
  complaints: number;
}

/** Signal received from an ISP during warm-up */
export interface IspSignal {
  type: "delivery" | "bounce" | "deferral" | "complaint" | "block";
  provider: IspProvider;
  timestamp: Date;
  code?: string;
  message?: string;
  ipAddress: string;
}

/** ISP-specific warm-up strategy configuration */
export interface IspStrategy {
  provider: IspProvider;
  /** Initial daily volume for day 1 */
  initialVolume: number;
  /** Daily volume growth rate (e.g., 1.5 = 50% daily increase) */
  growthRate: number;
  /** Maximum daily volume ceiling */
  maxDailyVolume: number;
  /** Maximum acceptable bounce rate before throttling */
  bounceThreshold: number;
  /** Maximum acceptable complaint rate before throttling */
  complaintThreshold: number;
  /** Maximum acceptable deferral rate before throttling */
  deferralThreshold: number;
  /** Hours of day with best delivery (ISP-specific) */
  preferredSendingHours: number[];
  /** Minimum days in warm-up */
  minimumDays: number;
}

// ─── Reputation Scoring Types ─────────────────────────────────────────────────

/** IP reputation score */
export interface IpReputationScore {
  ipAddress: string;
  overallScore: number; // 0-100
  category: ReputationCategory;
  signals: ReputationSignal[];
  calculatedAt: Date;
  factors: ReputationFactors;
}

/** Domain reputation score */
export interface DomainReputationScore {
  domain: string;
  overallScore: number; // 0-100
  category: ReputationCategory;
  signals: ReputationSignal[];
  calculatedAt: Date;
  factors: ReputationFactors;
}

export type ReputationCategory = "excellent" | "good" | "neutral" | "poor" | "critical";

export interface ReputationSignal {
  source: string;
  score: number;
  weight: number;
  description: string;
  lastUpdated: Date;
}

export interface ReputationFactors {
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  spamTrapHits: number;
  blocklistPresence: number; // count of blocklists
  authenticationScore: number; // SPF/DKIM/DMARC pass rate
  engagementScore: number;
  volumeConsistency: number;
  ageInDays: number;
}

// ─── Feedback Loop Types ──────────────────────────────────────────────────────

/** An ARF (Abuse Reporting Format) complaint */
export interface ArfComplaint {
  id: string;
  feedbackType: ArfFeedbackType;
  userAgent: string;
  version: string;
  originalMailFrom: string;
  originalRcptTo: string;
  reportedDomain: string;
  reportedUri?: string;
  arrivalDate: Date;
  sourceIp: string;
  authenticationResults?: string;
  reportingMta?: string;
  /** The original email headers (subset) */
  originalHeaders: Map<string, string>;
  /** Raw ARF message for archival */
  rawMessage: string;
  processedAt: Date;
}

export type ArfFeedbackType = "abuse" | "fraud" | "virus" | "other" | "not-spam";

/** FBL subscription for an ISP */
export interface FblSubscription {
  id: string;
  provider: IspProvider;
  feedbackAddress: string;
  enrolledDomains: string[];
  enrolledIps: string[];
  status: "active" | "pending" | "suspended";
  lastReceivedAt?: Date;
}

/** Suppression entry for a complained address */
export interface SuppressionEntry {
  email: string;
  reason: SuppressionReason;
  source: string;
  domain: string;
  createdAt: Date;
  expiresAt?: Date;
}

export type SuppressionReason = "complaint" | "bounce" | "unsubscribe" | "spam_trap" | "manual";

// ─── Blocklist Types ──────────────────────────────────────────────────────────

/** A DNS-based blocklist (DNSBL) */
export interface Blocklist {
  id: string;
  name: string;
  dnsZone: string;
  type: "ip" | "domain" | "both";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  lookupMethod: "dns" | "api";
  delistUrl?: string;
}

/** Result of checking an IP/domain against a blocklist */
export interface BlocklistCheckResult {
  blocklist: Blocklist;
  listed: boolean;
  listedValue: string; // IP or domain that was checked
  returnCode?: string;
  reason?: string;
  checkedAt: Date;
}

/** Blocklist alert when an IP or domain is found listed */
export interface BlocklistAlert {
  id: string;
  blocklist: Blocklist;
  listedValue: string;
  detectedAt: Date;
  resolvedAt?: Date;
  status: "active" | "resolving" | "resolved";
  remediationSteps: string[];
}

// ─── Compliance Types ─────────────────────────────────────────────────────────

/** Supported compliance frameworks */
export type ComplianceFramework = "can-spam" | "gdpr" | "casl";

/** Result of a compliance check on an email */
export interface ComplianceCheckResult {
  framework: ComplianceFramework;
  compliant: boolean;
  violations: ComplianceViolation[];
  warnings: string[];
  checkedAt: Date;
}

export interface ComplianceViolation {
  rule: string;
  description: string;
  severity: "critical" | "warning";
  field?: string;
  recommendation: string;
}

/** Consent record for a subscriber */
export interface ConsentRecord {
  email: string;
  domain: string;
  consentType: "explicit" | "implicit" | "transactional";
  consentSource: string;
  consentDate: Date;
  ipAddress?: string;
  proofUrl?: string;
  withdrawnAt?: Date;
}

/** Email message metadata for compliance checking */
export interface EmailMetadata {
  from: string;
  to: string;
  subject: string;
  headers: Map<string, string>;
  hasUnsubscribeHeader: boolean;
  hasUnsubscribeLink: boolean;
  hasPhysicalAddress: boolean;
  contentType: "marketing" | "transactional";
  senderDomain: string;
  listId?: string;
}
