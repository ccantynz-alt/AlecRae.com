// =============================================================================
// Vieanna — On-Device AI (Zero-Latency, Zero-Privacy-Risk)
// =============================================================================

export {
  EdgeAIEngine,
  type ModelManifest,
  type ModelCapability,
  type InferenceResult,
  type Prediction,
  type TriageResult,
  type NotificationDecision,
  type QuickReply,
  type EdgeAIConfig,
  type InferenceMetrics,
} from './edge-ai.js';

export {
  EmailFeatureExtractor,
  type EmailInput,
  type ContactContext,
  type FeatureVector,
  FEATURE_VECTOR_LENGTH,
} from './feature-extractor.js';

export {
  ModelManager,
  type CachedModel,
  type ModelUpdateCheck,
  type ModelManagerConfig,
  type DownloadProgress,
} from './model-manager.js';
