// =============================================================================
// @alecrae/ai-engine — Core Type Definitions
// =============================================================================

// ---------------------------------------------------------------------------
// Common / Shared
// ---------------------------------------------------------------------------

/** Generic result type for operations that can fail gracefully */
export type Result<T, E = AIEngineError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface AIEngineError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
}

export interface ConfidenceScore {
  /** 0.0 – 1.0 confidence level */
  readonly score: number;
  /** Human-readable label */
  readonly level: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
}

export interface AuditEntry {
  readonly timestamp: number;
  readonly action: string;
  readonly modelVersion: string;
  readonly inputHash: string;
  readonly decision: string;
  readonly confidence: ConfidenceScore;
  readonly durationMs: number;
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Email Primitives
// ---------------------------------------------------------------------------

export interface EmailAddress {
  readonly name?: string;
  readonly address: string;
  readonly domain: string;
}

export interface EmailHeaders {
  readonly messageId: string;
  readonly from: EmailAddress;
  readonly to: readonly EmailAddress[];
  readonly cc?: readonly EmailAddress[];
  readonly bcc?: readonly EmailAddress[];
  readonly replyTo?: EmailAddress;
  readonly subject: string;
  readonly date: Date;
  readonly receivedChain: readonly ReceivedHeader[];
  readonly authenticationResults?: AuthenticationResults;
  readonly raw: ReadonlyMap<string, readonly string[]>;
}

export interface ReceivedHeader {
  readonly from: string;
  readonly by: string;
  readonly with: string;
  readonly timestamp: Date;
  readonly tlsVersion?: string;
}

export interface AuthenticationResults {
  readonly spf: AuthResult;
  readonly dkim: AuthResult;
  readonly dmarc: AuthResult;
  readonly arc?: AuthResult;
}

export type AuthResult = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror';

export interface EmailContent {
  readonly textBody?: string;
  readonly htmlBody?: string;
  readonly attachments: readonly EmailAttachment[];
  readonly inlineImages: readonly EmailAttachment[];
}

export interface EmailAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly hash: string;
}

export interface EmailMessage {
  readonly id: string;
  readonly accountId: string;
  readonly headers: EmailHeaders;
  readonly content: EmailContent;
  readonly size: number;
  readonly receivedAt: Date;
}

// ---------------------------------------------------------------------------
// Spam Classification
// ---------------------------------------------------------------------------

export interface SpamClassificationResult {
  readonly verdict: SpamVerdict;
  readonly score: number;
  readonly confidence: ConfidenceScore;
  readonly layers: SpamLayerResults;
  readonly reasons: readonly SpamReason[];
  readonly processingTimeMs: number;
  readonly modelVersion: string;
}

export type SpamVerdict = 'ham' | 'spam' | 'likely_spam' | 'likely_ham' | 'uncertain';

export interface SpamLayerResults {
  readonly bayesian: BayesianResult;
  readonly contentAnalysis: ContentAnalysisResult;
  readonly headerAnalysis: HeaderAnalysisResult;
  readonly claudeAnalysis?: ClaudeAnalysisResult;
}

export interface BayesianResult {
  readonly spamProbability: number;
  readonly topSpamTokens: readonly TokenScore[];
  readonly topHamTokens: readonly TokenScore[];
  readonly totalTokensAnalyzed: number;
}

export interface TokenScore {
  readonly token: string;
  readonly score: number;
  readonly occurrences: number;
}

export interface ContentAnalysisResult {
  readonly spamPatternScore: number;
  readonly suspiciousUrls: readonly SuspiciousUrl[];
  readonly capsRatio: number;
  readonly exclamationDensity: number;
  readonly spamPhraseMatches: readonly string[];
  readonly imageToTextRatio: number;
}

export interface SuspiciousUrl {
  readonly url: string;
  readonly reason: string;
  readonly riskScore: number;
}

export interface HeaderAnalysisResult {
  readonly authenticationScore: number;
  readonly routingAnomalyScore: number;
  readonly headerForgeScore: number;
  readonly envelopeMismatch: boolean;
  readonly details: readonly string[];
}

export interface ClaudeAnalysisResult {
  readonly verdict: SpamVerdict;
  readonly confidence: number;
  readonly reasoning: string;
  readonly categories: readonly string[];
}

export interface SpamReason {
  readonly code: string;
  readonly description: string;
  readonly weight: number;
  readonly layer: 'bayesian' | 'content' | 'header' | 'claude';
}

/** Training data for the Bayesian classifier */
export interface TrainingDocument {
  readonly id: string;
  readonly tokens: readonly string[];
  readonly label: 'spam' | 'ham';
  readonly source: 'user_report' | 'automated' | 'manual_review' | 'feedback_loop';
  readonly timestamp: number;
}

export interface BayesianModelState {
  readonly spamTokenCounts: ReadonlyMap<string, number>;
  readonly hamTokenCounts: ReadonlyMap<string, number>;
  readonly totalSpamDocuments: number;
  readonly totalHamDocuments: number;
  readonly version: string;
  readonly lastTrainedAt: number;
}

// ---------------------------------------------------------------------------
// Phishing Detection
// ---------------------------------------------------------------------------

export interface PhishingDetectionResult {
  readonly isPhishing: boolean;
  readonly confidence: ConfidenceScore;
  readonly score: number;
  readonly urlAnalysis: readonly UrlAnalysisResult[];
  readonly domainSpoofing: DomainSpoofingResult;
  readonly contentPatterns: ContentPatternResult;
  readonly urgencyAnalysis: UrgencyAnalysisResult;
  readonly indicators: readonly PhishingIndicator[];
}

export interface UrlAnalysisResult {
  readonly url: string;
  readonly displayText?: string;
  readonly isSuspicious: boolean;
  readonly reasons: readonly string[];
  readonly domainAge?: number;
  readonly redirectChain?: readonly string[];
  readonly usesUrlShortener: boolean;
  readonly levenshteinToKnownBrand?: { brand: string; distance: number };
  readonly hasIpAddress: boolean;
  readonly hasMismatchedDisplay: boolean;
  readonly riskScore: number;
}

export interface DomainSpoofingResult {
  readonly isSpoofed: boolean;
  readonly legitimateDomain?: string;
  readonly spoofingTechnique?: 'homoglyph' | 'typosquat' | 'subdomain' | 'tld_swap' | 'combosquat';
  readonly similarity: number;
}

export interface ContentPatternResult {
  readonly accountVerification: boolean;
  readonly passwordReset: boolean;
  readonly suspendedAccount: boolean;
  readonly paymentRequired: boolean;
  readonly prizeClaim: boolean;
  readonly documentSharing: boolean;
  readonly matchedPatterns: readonly string[];
  readonly patternScore: number;
}

export interface UrgencyAnalysisResult {
  readonly hasDeadline: boolean;
  readonly hasThreats: boolean;
  readonly hasScarcityLanguage: boolean;
  readonly urgencyScore: number;
  readonly matchedPhrases: readonly string[];
}

export interface PhishingIndicator {
  readonly type: 'url' | 'domain' | 'content' | 'urgency' | 'sender';
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

// ---------------------------------------------------------------------------
// Reputation Scoring
// ---------------------------------------------------------------------------

export interface ReputationScore {
  readonly overallScore: number;
  readonly grade: ReputationGrade;
  readonly factors: ReputationFactors;
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly lastUpdated: number;
  readonly history: readonly ReputationSnapshot[];
}

export type ReputationGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ReputationFactors {
  readonly sendingVolume: FactorScore;
  readonly bounceRate: FactorScore;
  readonly complaintRate: FactorScore;
  readonly authentication: FactorScore;
  readonly contentQuality: FactorScore;
  readonly engagementRate: FactorScore;
  readonly listHygiene: FactorScore;
  readonly infrastructureAge: FactorScore;
}

export interface FactorScore {
  readonly score: number;
  readonly weight: number;
  readonly details: string;
  readonly rawValue: number;
}

export interface ReputationSnapshot {
  readonly timestamp: number;
  readonly score: number;
  readonly grade: ReputationGrade;
}

export interface SenderProfile {
  readonly identifier: string;
  readonly type: 'ip' | 'domain' | 'email';
  readonly firstSeen: number;
  readonly lastSeen: number;
  readonly totalSent: number;
  readonly totalBounced: number;
  readonly totalComplaints: number;
  readonly totalOpens: number;
  readonly totalClicks: number;
  readonly authenticationRecord: AuthenticationRecord;
}

export interface AuthenticationRecord {
  readonly spfPassRate: number;
  readonly dkimPassRate: number;
  readonly dmarcPassRate: number;
  readonly tlsUsageRate: number;
}

// ---------------------------------------------------------------------------
// Internet Scanning
// ---------------------------------------------------------------------------

export interface InternetScanResult {
  readonly identifier: string;
  readonly scanTimestamp: number;
  readonly blocklistResults: readonly BlocklistResult[];
  readonly whoisData?: WhoisData;
  readonly domainAge?: number;
  readonly webPresence: WebPresenceResult;
  readonly socialSignals: SocialSignalResult;
  readonly overallRisk: number;
  readonly scanDurationMs: number;
}

export interface BlocklistResult {
  readonly listName: string;
  readonly listed: boolean;
  readonly reason?: string;
  readonly listedSince?: number;
}

export interface WhoisData {
  readonly registrar: string;
  readonly registrationDate: Date;
  readonly expirationDate: Date;
  readonly nameservers: readonly string[];
  readonly privacyProtected: boolean;
  readonly country?: string;
}

export interface WebPresenceResult {
  readonly hasWebsite: boolean;
  readonly hasMxRecords: boolean;
  readonly hasSslCertificate: boolean;
  readonly sslGrade?: string;
  readonly webTechnologies?: readonly string[];
}

export interface SocialSignalResult {
  readonly hasLinkedIn: boolean;
  readonly hasTwitter: boolean;
  readonly hasFacebook: boolean;
  readonly domainMentions: number;
  readonly presenceScore: number;
}

// ---------------------------------------------------------------------------
// Content Analysis
// ---------------------------------------------------------------------------

export interface ContentAnalysis {
  readonly language: LanguageDetection;
  readonly topics: readonly TopicClassification[];
  readonly sentiment: SentimentResult;
  readonly toxicity: ToxicityResult;
  readonly promotional: PromotionalResult;
  readonly readability: ReadabilityResult;
  readonly entities: readonly NamedEntity[];
  readonly processingTimeMs: number;
}

export interface LanguageDetection {
  readonly primary: string;
  readonly confidence: number;
  readonly alternatives: readonly { language: string; confidence: number }[];
}

export interface TopicClassification {
  readonly topic: string;
  readonly confidence: number;
  readonly subtopics?: readonly string[];
}

export interface SentimentResult {
  readonly overall: 'positive' | 'negative' | 'neutral' | 'mixed';
  readonly score: number;
  readonly magnitude: number;
}

export interface ToxicityResult {
  readonly isToxic: boolean;
  readonly score: number;
  readonly categories: {
    readonly profanity: number;
    readonly harassment: number;
    readonly hate: number;
    readonly threat: number;
    readonly sexually_explicit: number;
  };
}

export interface PromotionalResult {
  readonly isPromotional: boolean;
  readonly score: number;
  readonly indicators: readonly string[];
  readonly type?: 'marketing' | 'transactional' | 'newsletter' | 'personal';
}

export interface ReadabilityResult {
  readonly fleschKincaid: number;
  readonly gradeLevel: number;
  readonly averageSentenceLength: number;
  readonly complexWordRatio: number;
}

export interface NamedEntity {
  readonly text: string;
  readonly type: 'person' | 'organization' | 'location' | 'date' | 'money' | 'url' | 'email';
  readonly start: number;
  readonly end: number;
}

// ---------------------------------------------------------------------------
// Compose Assistant
// ---------------------------------------------------------------------------

export interface ComposeRequest {
  readonly userId: string;
  readonly type: 'draft' | 'reply' | 'forward';
  readonly context?: EmailMessage;
  readonly instructions?: string;
  readonly tone?: ComposeTone;
  readonly length?: 'brief' | 'moderate' | 'detailed';
  readonly language?: string;
}

export type ComposeTone = 'professional' | 'casual' | 'friendly' | 'formal' | 'urgent' | 'empathetic' | 'assertive';

export interface ComposeResult {
  readonly draft: ComposedDraft;
  readonly alternatives: readonly ComposedDraft[];
  readonly subjectSuggestions: readonly SubjectSuggestion[];
  readonly processingTimeMs: number;
}

export interface ComposedDraft {
  readonly subject?: string;
  readonly body: string;
  readonly tone: ComposeTone;
  readonly confidence: number;
}

export interface SubjectSuggestion {
  readonly text: string;
  readonly score: number;
  readonly reasoning: string;
}

export interface UserVoiceProfile {
  readonly userId: string;
  readonly averageSentenceLength: number;
  readonly vocabularyLevel: 'simple' | 'moderate' | 'advanced';
  readonly preferredGreetings: readonly string[];
  readonly preferredSignoffs: readonly string[];
  readonly commonPhrases: readonly string[];
  readonly toneDistribution: ReadonlyMap<ComposeTone, number>;
  readonly formality: number;
  readonly emojiUsage: number;
  readonly lastUpdated: number;
  readonly sampleCount: number;
}

// ---------------------------------------------------------------------------
// Priority / Inbox Ranking
// ---------------------------------------------------------------------------

export interface PriorityRankingResult {
  readonly emailId: string;
  readonly score: number;
  readonly tier: PriorityTier;
  readonly signals: readonly PrioritySignal[];
  readonly actionRequired: boolean;
  readonly suggestedActions: readonly SuggestedAction[];
  readonly expiresAt?: number;
}

export type PriorityTier = 'critical' | 'high' | 'medium' | 'low' | 'background';

export interface PrioritySignal {
  readonly type: string;
  readonly weight: number;
  readonly value: number;
  readonly description: string;
}

export interface SuggestedAction {
  readonly type: 'reply' | 'forward' | 'archive' | 'schedule' | 'delegate' | 'unsubscribe';
  readonly confidence: number;
  readonly reason: string;
}

export interface UserBehaviorProfile {
  readonly userId: string;
  readonly openPatterns: ReadonlyMap<string, number>;
  readonly replyPatterns: ReadonlyMap<string, number>;
  readonly importantSenders: readonly WeightedSender[];
  readonly importantKeywords: readonly WeightedKeyword[];
  readonly activeHours: readonly number[];
  readonly averageResponseTimeMs: number;
  readonly lastUpdated: number;
}

export interface WeightedSender {
  readonly address: string;
  readonly weight: number;
  readonly replyRate: number;
  readonly averageResponseTimeMs: number;
}

export interface WeightedKeyword {
  readonly keyword: string;
  readonly weight: number;
  readonly associatedAction: string;
}

// ---------------------------------------------------------------------------
// Relationship Graph
// ---------------------------------------------------------------------------

export interface ContactNode {
  readonly id: string;
  readonly emailAddresses: readonly string[];
  readonly name?: string;
  readonly organization?: string;
  readonly firstContact: number;
  readonly lastContact: number;
  readonly totalInteractions: number;
}

export interface RelationshipEdge {
  readonly sourceId: string;
  readonly targetId: string;
  readonly strength: number;
  readonly frequency: CommunicationFrequency;
  readonly sentiment: SentimentTrend;
  readonly lastInteraction: number;
  readonly totalEmails: number;
  readonly bidirectional: boolean;
  readonly averageResponseTimeMs: number;
}

export interface CommunicationFrequency {
  readonly daily: number;
  readonly weekly: number;
  readonly monthly: number;
  readonly trend: 'increasing' | 'stable' | 'decreasing';
}

export interface SentimentTrend {
  readonly current: number;
  readonly average: number;
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly recentScores: readonly number[];
}

export interface RelationshipInsight {
  readonly type: 'key_contact' | 'fading_relationship' | 'new_connection' | 'follow_up_needed' | 'sentiment_shift';
  readonly contactId: string;
  readonly description: string;
  readonly confidence: number;
  readonly actionable: boolean;
  readonly suggestedAction?: string;
}

// ---------------------------------------------------------------------------
// Threat Intelligence
// ---------------------------------------------------------------------------

export interface ThreatSignal {
  readonly id: string;
  readonly type: ThreatType;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly source: string;
  readonly indicators: readonly ThreatIndicator[];
  readonly firstSeen: number;
  readonly lastSeen: number;
  readonly affectedCount: number;
  readonly status: 'active' | 'mitigated' | 'expired';
}

export type ThreatType = 'phishing_campaign' | 'spam_wave' | 'malware_distribution' | 'credential_harvesting' | 'bec_attack' | 'domain_spoofing';

export interface ThreatIndicator {
  readonly type: 'domain' | 'ip' | 'url' | 'email' | 'hash' | 'pattern';
  readonly value: string;
  readonly confidence: number;
}

export interface ThreatFeed {
  readonly name: string;
  readonly url: string;
  readonly format: 'stix' | 'csv' | 'json' | 'custom';
  readonly lastPolled: number;
  readonly signalCount: number;
  readonly reliability: number;
}

// ---------------------------------------------------------------------------
// Model Management
// ---------------------------------------------------------------------------

export interface ModelMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly type: ModelType;
  readonly status: ModelStatus;
  readonly createdAt: number;
  readonly deployedAt?: number;
  readonly metrics: ModelMetrics;
  readonly config: Record<string, unknown>;
}

export type ModelType = 'bayesian_spam' | 'reputation' | 'content_classifier' | 'priority_ranker' | 'voice_profile' | 'relationship_scorer';

export type ModelStatus = 'training' | 'validating' | 'staged' | 'deployed' | 'canary' | 'deprecated' | 'rolled_back';

export interface ModelMetrics {
  readonly accuracy: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1Score: number;
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly latencyP50Ms: number;
  readonly latencyP99Ms: number;
  readonly sampleSize: number;
}

export interface ABTestConfig {
  readonly id: string;
  readonly controlModelId: string;
  readonly treatmentModelId: string;
  readonly trafficSplitPercent: number;
  readonly startedAt: number;
  readonly endsAt: number;
  readonly targetMetric: string;
  readonly minimumSampleSize: number;
  readonly status: 'running' | 'completed' | 'cancelled';
}

export interface ABTestResult {
  readonly testId: string;
  readonly controlMetrics: ModelMetrics;
  readonly treatmentMetrics: ModelMetrics;
  readonly winner: 'control' | 'treatment' | 'inconclusive';
  readonly pValue: number;
  readonly confidenceInterval: { lower: number; upper: number };
  readonly recommendation: string;
}
