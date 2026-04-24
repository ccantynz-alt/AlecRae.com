// Client
export {
  getDatabase,
  getDb,
  db,
  createMigrationClient,
  closeConnection,
  checkConnectionHealth,
  poolConfig,
} from "./client/connection.js";
export type {
  Database,
  DatabaseSchema,
  ConnectionConfig,
} from "./client/connection.js";

// Schema - Users & Accounts
export {
  accounts,
  users,
  planTierEnum,
  userRoleEnum,
  accountsRelations,
  usersRelations,
} from "./schema/users.js";

// Schema - Emails
export {
  emails,
  attachments,
  deliveryResults,
  emailStatusEnum,
  attachmentDispositionEnum,
  virusScanStatusEnum,
  emailsRelations,
  attachmentsRelations,
  deliveryResultsRelations,
} from "./schema/emails.js";

// Schema - Domains
export {
  domains,
  dnsRecords,
  domainVerificationStatusEnum,
  dnsRecordTypeEnum,
  domainsRelations,
  dnsRecordsRelations,
} from "./schema/domains.js";

// Schema - Connected Accounts (Gmail, Outlook, IMAP)
export {
  connectedAccounts,
  emailProviderEnum,
  connectedAccountsRelations,
} from "./schema/connected-accounts.js";

// Schema - Events & Webhooks
export {
  events,
  webhooks,
  webhookDeliveries,
  emailEventTypeEnum,
  bounceTypeEnum,
  bounceCategoryEnum,
  feedbackTypeEnum,
  eventsRelations,
  webhooksRelations,
  webhookDeliveriesRelations,
} from "./schema/events.js";

// Schema - API Keys
export {
  apiKeys,
  apiKeyUsage,
  apiKeysRelations,
  apiKeyUsageRelations,
} from "./schema/api-keys.js";

// Schema - Suppressions
export {
  suppressionLists,
  suppressionReasonEnum,
  suppressionListsRelations,
} from "./schema/suppressions.js";

// Schema - Warmup
export {
  warmupSessions,
  warmupStatusEnum,
  warmupScheduleTypeEnum,
  warmupSessionsRelations,
} from "./schema/warmup.js";

// Schema - Templates
export {
  templates,
  templatesRelations,
} from "./schema/templates.js";

// Schema - Email Embeddings (semantic vector search)
export {
  emailEmbeddings,
  emailEmbeddingsRelations,
  vector,
} from "./schema/email-embeddings.js";

// Schema - Draft Snapshots (CRDT collaborative drafting)
export {
  draftSnapshots,
  draftSnapshotsRelations,
  type DraftSnapshot,
  type NewDraftSnapshot,
} from "./schema/draft-snapshots.js";

// Schema - Passkeys (WebAuthn credentials)
export {
  passkeys,
  passkeyChallenges,
  passkeysRelations,
  passkeyChallengesRelations,
} from "./schema/passkeys.js";

// Schema - Contacts
export {
  contacts,
  contactsRelations,
} from "./schema/contacts.js";

// Schema - Contacts Extended (CRM-lite interactions + reminders)
export {
  contactInteractions,
  contactReminders,
  contactInteractionTypeEnum,
  contactInteractionsRelations,
  contactRemindersRelations,
} from "./schema/contacts-extended.js";

// Schema - Recall Records
export {
  recallRecords,
  recallRecordsRelations,
} from "./schema/recall.js";

// Schema - Recipient Engagement (send-time optimization)
export {
  recipientEngagement,
  engagementEvents,
  recipientEngagementRelations,
  engagementEventsRelations,
  type HourlyDistribution,
  type DailyDistribution,
} from "./schema/recipient-engagement.js";

// Schema - Custom Dictionaries (spell check)
export {
  customDictionaries,
  customDictionariesRelations,
} from "./schema/custom-dictionaries.js";

// Schema - Screener, Commitments, Inbox Categories
export {
  screenerDecisions,
  screenerQueue,
  commitments,
  inboxCategories,
  screenerDecisionEnum,
  commitmentActorEnum,
  commitmentStatusEnum,
  inboxCategorySourceEnum,
  screenerDecisionsRelations,
  screenerQueueRelations,
  commitmentsRelations,
  inboxCategoriesRelations,
} from "./schema/screener.js";

// Schema - Unsubscribe History
export {
  unsubscribeHistory,
  unsubscribeMethodEnum,
  unsubscribeStatusEnum,
  unsubscribeHistoryRelations,
} from "./schema/unsubscribe-history.js";

// Schema - Tasks & Task Provider Configs (S8)
export {
  tasks,
  taskProviderConfigs,
  taskPriorityEnum,
  taskStatusEnum,
  taskProviderEnum,
  tasksRelations,
  taskProviderConfigsRelations,
} from "./schema/tasks.js";
export type {
  TaskSource,
  ProviderCredentials,
} from "./schema/tasks.js";

// Schema - Email Translations
export {
  emailTranslations,
  emailTranslationsRelations,
} from "./schema/translations.js";
export type { TranslationContent } from "./schema/translations.js";

// Schema - Gamification (A7 — inbox zero streaks, achievements, daily stats)
export {
  userStreaks,
  userAchievements,
  dailyStats,
  achievementKeyEnum,
  userStreaksRelations,
  userAchievementsRelations,
  dailyStatsRelations,
} from "./schema/gamification.js";

// Schema - AI Inbox Agent (runs, drafts, config)
export {
  agentRuns,
  agentDrafts,
  agentConfigs,
  agentRunStatusEnum,
  agentDraftStatusEnum,
  triageCategoryEnum,
  triagePriorityEnum,
  triageActionEnum,
  agentRunsRelations,
  agentDraftsRelations,
  agentConfigsRelations,
} from "./schema/agent.js";
export type {
  AgentRunStats,
  StoredTriageDecision,
  StoredCommitment,
  StoredAgentSuggestion,
  AgentCategoryRule,
  AgentScheduleConfig,
} from "./schema/agent.js";

// Schema - Collaboration (CRDT real-time collaborative drafting — S2)
export {
  collaborationSessions,
  collaborationInvites,
  collaborationParticipants,
  collaborationHistory,
  collabSessionStatusEnum,
  collabInviteStatusEnum,
  collabRoleEnum,
  collaborationSessionsRelations,
  collaborationInvitesRelations,
  collaborationParticipantsRelations,
  collaborationHistoryRelations,
} from "./schema/collaboration.js";
export type {
  CollaborationSession,
  NewCollaborationSession,
  CollaborationInvite,
  NewCollaborationInvite,
  CollaborationParticipant,
  NewCollaborationParticipant,
  CollaborationHistoryEntry,
  NewCollaborationHistoryEntry,
} from "./schema/collaboration.js";

// Schema - Meeting Links (S9 — email thread → meeting transcript link)
export {
  meetingLinks,
  meetingProviderEnum,
  meetingLinkStatusEnum,
  meetingLinksRelations,
  meetingProviderConnections,
  transcriptProviderEnum,
  meetingProviderConnectionsRelations,
} from "./schema/meeting-links.js";

// Schema - Saved Queries & Query History (B2 — email-as-database)
export {
  savedQueries,
  queryHistory,
  queryTypeEnum,
  savedQueriesRelations,
  queryHistoryRelations,
} from "./schema/saved-queries.js";

// Schema - Email Scripts (B1 — programmable email TypeScript snippets)
export {
  emailScripts,
  scriptRuns,
  scriptTriggerEnum,
  scriptRunStatusEnum,
  emailScriptsRelations,
  scriptRunsRelations,
} from "./schema/email-scripts.js";
export type { ScriptAction } from "./schema/email-scripts.js";

// Schema - Changelog Entries (C8 — public changelog page)
export {
  changelogEntries,
  changelogCategoryEnum,
} from "./schema/changelog.js";

// Schema - Voice Clone Profiles (S4 — voice cloning for AI replies)
export {
  voiceStyleProfiles,
  voiceTrainingSamples,
  voiceStyleProfilesRelations,
  voiceTrainingSamplesRelations,
} from "./schema/voice-clone.js";
export type {
  StyleFingerprintData,
  ExtractedFeaturesData,
  RhythmFingerprintData,
  VocabularyFingerprintData,
  PunctuationStyleData,
} from "./schema/voice-clone.js";

// Schema - Signatures (multiple per account, auto-switch by context)
export {
  signatures,
  signaturesRelations,
} from "./schema/signatures.js";
export type { SignatureContext } from "./schema/signatures.js";

// Schema - Contact Groups / Distribution Lists
export {
  contactGroups,
  contactGroupMembers,
  contactGroupsRelations,
  contactGroupMembersRelations,
} from "./schema/contact-groups.js";

// Schema - Link Previews (cached URL metadata for rich unfurling)
export {
  linkPreviews,
} from "./schema/link-previews.js";
export type { LinkPreviewData } from "./schema/link-previews.js";

// Schema - Webhook Integrations (Zapier/Make/n8n connectors)
export {
  webhookIntegrations,
  integrationPlatformEnum,
  webhookIntegrationsRelations,
} from "./schema/webhook-integrations.js";
export type { IntegrationTriggerConfig } from "./schema/webhook-integrations.js";

// Schema - Auto-Responder / Vacation Mode
export {
  autoResponders,
  autoResponderLog,
  autoResponderModeEnum,
  autoRespondersRelations,
  autoResponderLogRelations,
} from "./schema/auto-responder.js";
export type {
  AutoResponderSchedule,
  AutoResponderRules,
} from "./schema/auto-responder.js";

// Schema - Push Notifications (Web Push + mobile tokens)
export {
  pushSubscriptions,
  pushNotificationPreferences,
  pushPlatformEnum,
  pushSubscriptionsRelations,
  pushNotificationPreferencesRelations,
} from "./schema/push-subscriptions.js";
export type { WebPushKeys } from "./schema/push-subscriptions.js";

// Schema - Refresh Tokens (JWT rotation with theft detection)
export {
  refreshTokens,
  refreshTokensRelations,
} from "./schema/refresh-tokens.js";

// Schema - Smart Folders / Saved Searches
export {
  smartFolders,
  smartFolderTypeEnum,
  smartFoldersRelations,
} from "./schema/smart-folders.js";
export type { SmartFolderFilter } from "./schema/smart-folders.js";

// Schema - Labels / Tags
export {
  labels,
  emailLabels,
  labelsRelations,
  emailLabelsRelations,
} from "./schema/labels.js";

// Schema - Thread Mutes
export {
  threadMutes,
  threadMutesRelations,
} from "./schema/thread-mutes.js";

// Schema - A/B Tests
export {
  abTests,
  abTestStatusEnum,
  abTestsRelations,
} from "./schema/ab-tests.js";
export type { ABTestVariant, ABTestResults } from "./schema/ab-tests.js";

// Schema - Mail Merge
export {
  mailMerges,
  mailMergeStatusEnum,
  mailMergesRelations,
} from "./schema/mail-merge.js";
export type { MailMergeRecipient } from "./schema/mail-merge.js";

// Schema - Contact Enrichment
export {
  contactEnrichments,
  contactEnrichmentsRelations,
} from "./schema/contact-enrichment.js";
export type { EnrichmentData } from "./schema/contact-enrichment.js";

// Schema - Notes (email-linked)
export {
  notes,
  notesRelations,
} from "./schema/notes.js";

// Schema - Files (attachment management + cloud storage)
export {
  files,
  fileSourceEnum,
  filesRelations,
} from "./schema/files.js";

// Schema - Chat (secure internal messaging)
export {
  chatChannels,
  chatMembers,
  chatMessages,
  chatChannelTypeEnum,
  chatChannelsRelations,
  chatMembersRelations,
  chatMessagesRelations,
} from "./schema/chat.js";

// Schema - Onboarding Records (guided setup wizard)
export {
  onboardingRecords,
  onboardingStepEnum,
  onboardingProviderEnum,
  onboardingRecordsRelations,
} from "./schema/onboarding.js";
export type { OnboardingPreferences } from "./schema/onboarding.js";

// Schema - Documents (AlecRae Docs/Sheets/Slides)
export {
  documents,
  documentFolders,
  documentVersions,
  documentTypeEnum,
  documentsRelations,
  documentFoldersRelations,
  documentVersionsRelations,
} from "./schema/documents.js";

// Schema - Video Meetings (AlecRae Meet — rooms + recordings)
export {
  meetingRooms,
  meetingRecordings,
  meetingRoomsRelations,
  meetingRecordingsRelations,
} from "./schema/video-meetings.js";

// Schema - AI Writing Intelligence (profiles + suggestion log)
export {
  writingProfiles,
  writingSuggestionsLog,
  suggestionTypeEnum,
  writingProfilesRelations,
  writingSuggestionsLogRelations,
} from "./schema/ai-writing.js";

// Schema - Calendar Events & Availability
export {
  calendarEvents,
  calendarAvailability,
  calendarEventStatusEnum,
  calendarEventsRelations,
  calendarAvailabilityRelations,
} from "./schema/calendar-events.js";
export type {
  RecurrenceRule,
  EventAttendee,
  EventReminder,
} from "./schema/calendar-events.js";

// Schema - Notification Intelligence (smart notifications + focus sessions)
export {
  notificationRules,
  notificationBatches,
  focusSessions,
  notificationActionEnum,
  focusModeEnum,
  notificationRulesRelations,
  notificationBatchesRelations,
  focusSessionsRelations,
} from "./schema/notification-intelligence.js";
export type { NotificationRuleConditions } from "./schema/notification-intelligence.js";

// Schema - Email Hygiene (habits, subscriptions, productivity goals)
export {
  emailHabits,
  subscriptionTracker,
  emailProductivityGoals,
  emailHabitsRelations,
  subscriptionTrackerRelations,
  emailProductivityGoalsRelations,
} from "./schema/email-hygiene.js";
export type { ProductivityGoals } from "./schema/email-hygiene.js";

// Schema - AI Intelligence (priority scoring, relationship insights, smart replies, sentiment, writing coach, predictive actions)
export {
  emailPriorityScores,
  relationshipInsights,
  smartReplies,
  emailSentiments,
  writingCoachResults,
  predictiveActions,
  urgencyLevelEnum,
  emailSentimentEnum,
  emailPriorityScoresRelations,
  relationshipInsightsRelations,
  smartRepliesRelations,
  emailSentimentsRelations,
  writingCoachResultsRelations,
  predictiveActionsRelations,
} from "./schema/ai-intelligence.js";
export type {
  ContentSignals,
  SmartReplyOption,
  WritingCoachSuggestion,
} from "./schema/ai-intelligence.js";

// Schema - Analytics Dashboard (snapshots + goals)
export {
  analyticsSnapshots,
  analyticsGoals,
  analyticsSnapshotsRelations,
  analyticsGoalsRelations,
} from "./schema/analytics-dashboard.js";

// Schema - Delegation (email delegation + shared drafts)
export {
  emailDelegations,
  sharedDrafts,
  emailDelegationsRelations,
  sharedDraftsRelations,
} from "./schema/delegation.js";
export type {
  DelegationPermissions,
  SharedDraftComment,
} from "./schema/delegation.js";

// Schema - Workflows (automated email workflows)
export {
  workflows,
  workflowRuns,
  workflowTemplates,
  workflowTriggerTypeEnum,
  workflowActionTypeEnum,
  workflowRunStatusEnum,
  workflowTemplateCategoryEnum,
  workflowsRelations,
  workflowRunsRelations,
} from "./schema/workflows.js";
export type {
  WorkflowTrigger,
  WorkflowAction,
  WorkflowTriggerConditions,
} from "./schema/workflows.js";

// Schema - AI Categorization (email categories + smart labels + feedback)
export {
  emailCategories,
  smartLabelRules,
  categoryFeedback,
  emailPrimaryCategoryEnum,
  emailCategoriesRelations,
  smartLabelRulesRelations,
  categoryFeedbackRelations,
} from "./schema/ai-categorization.js";
export type { SmartLabelConditions } from "./schema/ai-categorization.js";

// Schema - Search Intelligence (history + bookmarks + suggestions)
export {
  searchHistory,
  searchBookmarks,
  searchSuggestions,
  searchTypeEnum,
  searchSuggestionCategoryEnum,
  searchHistoryRelations,
  searchBookmarksRelations,
  searchSuggestionsRelations,
} from "./schema/search-intelligence.js";
export type { SearchBookmarkFilters } from "./schema/search-intelligence.js";

// Schema - Security Intelligence (threats + policies + audit log)
export {
  threatDetections,
  securityPolicies,
  securityAuditLog,
  threatTypeEnum,
  threatSeverityEnum,
  threatUserActionEnum,
  securityPolicyTypeEnum,
  securityEventTypeEnum,
  threatDetectionsRelations,
  securityPoliciesRelations,
  securityAuditLogRelations,
} from "./schema/security-intelligence.js";
export type { ThreatSignals } from "./schema/security-intelligence.js";

// Schema - Attachment Intelligence (AI-powered attachment analysis + smart file organization)
export {
  attachmentAnalysis,
  smartFileOrganization,
  attachmentThreatLevelEnum,
  attachmentVirusScanStatusEnum,
  fileImportanceEnum,
  attachmentAnalysisRelations,
  smartFileOrganizationRelations,
} from "./schema/attachment-intelligence.js";

// Schema - Sentiment Timeline (sentiment tracking + relationship health)
export {
  sentimentTimeline,
  relationshipHealth,
  sentimentLevelEnum,
  sentimentTimelineRelations,
  relationshipHealthRelations,
} from "./schema/sentiment-timeline.js";

// Schema - Scheduling Intelligence (meeting proposals + availability patterns)
export {
  meetingProposals,
  availabilityPatterns,
  meetingTypeEnum,
  meetingProposalStatusEnum,
  meetingProposalsRelations,
  availabilityPatternsRelations,
} from "./schema/scheduling-intelligence.js";
export type {
  ProposedTimeSlot,
  MeetingPreferences,
  BusyBlock,
} from "./schema/scheduling-intelligence.js";

// Schema - Context Intelligence (action items + deadlines + promises)
export {
  emailActionItems,
  emailDeadlines,
  emailPromises,
  actionItemPriorityEnum,
  actionItemStatusEnum,
  actionItemSourceEnum,
  promiseStatusEnum,
  emailActionItemsRelations,
  emailDeadlinesRelations,
  emailPromisesRelations,
} from "./schema/context-intelligence.js";

// Schema - Productivity Analytics (time tracking + insights + behavior patterns)
export {
  emailTimeTracking,
  productivityInsights,
  emailBehaviorPatterns,
  emailActivityTypeEnum,
  insightTypeEnum,
  insightSeverityEnum,
  emailTimeTrackingRelations,
  productivityInsightsRelations,
  emailBehaviorPatternsRelations,
} from "./schema/productivity-analytics.js";

// Schema - Knowledge Graph (entities + relationships + extractions)
export {
  knowledgeEntities,
  knowledgeRelationships,
  knowledgeExtractions,
  knowledgeEntityTypeEnum,
  knowledgeEntitiesRelations,
  knowledgeRelationshipsRelations,
  knowledgeExtractionsRelations,
} from "./schema/knowledge-graph.js";

// ---------------------------------------------------------------------------
// Inferred types from schemas
// ---------------------------------------------------------------------------

import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { accounts, users } from "./schema/users.js";
import type { emails, attachments, deliveryResults } from "./schema/emails.js";
import type { domains, dnsRecords } from "./schema/domains.js";
import type { apiKeys, apiKeyUsage } from "./schema/api-keys.js";
import type {
  events,
  webhooks,
  webhookDeliveries,
} from "./schema/events.js";
import type { suppressionLists } from "./schema/suppressions.js";
import type { warmupSessions } from "./schema/warmup.js";
import type { templates } from "./schema/templates.js";
import type { emailEmbeddings } from "./schema/email-embeddings.js";
import type { passkeys, passkeyChallenges } from "./schema/passkeys.js";
import type { contacts } from "./schema/contacts.js";
import type { contactInteractions, contactReminders } from "./schema/contacts-extended.js";
import type { recallRecords } from "./schema/recall.js";
import type {
  screenerDecisions,
  screenerQueue,
  commitments,
  inboxCategories,
} from "./schema/screener.js";
import type { unsubscribeHistory } from "./schema/unsubscribe-history.js";
import type { customDictionaries } from "./schema/custom-dictionaries.js";
import type { emailTranslations } from "./schema/translations.js";
import type {
  recipientEngagement,
  engagementEvents,
} from "./schema/recipient-engagement.js";
import type { tasks, taskProviderConfigs } from "./schema/tasks.js";
import type {
  agentRuns,
  agentDrafts,
  agentConfigs,
} from "./schema/agent.js";
import type {
  userStreaks,
  userAchievements,
  dailyStats,
} from "./schema/gamification.js";
import type {
  meetingLinks,
  meetingProviderConnections,
} from "./schema/meeting-links.js";
import type { savedQueries, queryHistory } from "./schema/saved-queries.js";
import type { emailScripts, scriptRuns } from "./schema/email-scripts.js";
import type { changelogEntries } from "./schema/changelog.js";
import type {
  voiceStyleProfiles,
  voiceTrainingSamples,
} from "./schema/voice-clone.js";
import type { refreshTokens } from "./schema/refresh-tokens.js";
import type { signatures } from "./schema/signatures.js";
import type { contactGroups, contactGroupMembers } from "./schema/contact-groups.js";
import type { smartFolders } from "./schema/smart-folders.js";
import type { labels, emailLabels } from "./schema/labels.js";
import type { threadMutes } from "./schema/thread-mutes.js";
import type { autoResponders, autoResponderLog } from "./schema/auto-responder.js";
import type { pushSubscriptions, pushNotificationPreferences } from "./schema/push-subscriptions.js";
import type { abTests } from "./schema/ab-tests.js";
import type { mailMerges } from "./schema/mail-merge.js";
import type { contactEnrichments } from "./schema/contact-enrichment.js";
import type { notes } from "./schema/notes.js";
import type { files } from "./schema/files.js";
import type { chatChannels, chatMembers, chatMessages } from "./schema/chat.js";
import type { linkPreviews } from "./schema/link-previews.js";
import type { webhookIntegrations } from "./schema/webhook-integrations.js";
import type { onboardingRecords } from "./schema/onboarding.js";
import type { documents, documentFolders, documentVersions } from "./schema/documents.js";
import type { meetingRooms, meetingRecordings } from "./schema/video-meetings.js";
import type { writingProfiles, writingSuggestionsLog } from "./schema/ai-writing.js";
import type { calendarEvents, calendarAvailability } from "./schema/calendar-events.js";
import type { notificationRules, notificationBatches, focusSessions } from "./schema/notification-intelligence.js";
import type { emailHabits, subscriptionTracker, emailProductivityGoals } from "./schema/email-hygiene.js";
import type {
  emailPriorityScores,
  relationshipInsights,
  smartReplies,
  emailSentiments,
  writingCoachResults,
  predictiveActions,
} from "./schema/ai-intelligence.js";

// Select types (what you get back from queries)
export type Account = InferSelectModel<typeof accounts>;
export type User = InferSelectModel<typeof users>;
export type Email = InferSelectModel<typeof emails>;
export type Attachment = InferSelectModel<typeof attachments>;
export type DeliveryResult = InferSelectModel<typeof deliveryResults>;
export type Domain = InferSelectModel<typeof domains>;
export type DnsRecord = InferSelectModel<typeof dnsRecords>;
export type ApiKey = InferSelectModel<typeof apiKeys>;
export type ApiKeyUsage = InferSelectModel<typeof apiKeyUsage>;
export type Event = InferSelectModel<typeof events>;
export type Webhook = InferSelectModel<typeof webhooks>;
export type WebhookDelivery = InferSelectModel<typeof webhookDeliveries>;

// Insert types (what you pass when creating rows)
export type NewAccount = InferInsertModel<typeof accounts>;
export type NewUser = InferInsertModel<typeof users>;
export type NewEmail = InferInsertModel<typeof emails>;
export type NewAttachment = InferInsertModel<typeof attachments>;
export type NewDeliveryResult = InferInsertModel<typeof deliveryResults>;
export type NewDomain = InferInsertModel<typeof domains>;
export type NewDnsRecord = InferInsertModel<typeof dnsRecords>;
export type NewApiKey = InferInsertModel<typeof apiKeys>;
export type NewApiKeyUsage = InferInsertModel<typeof apiKeyUsage>;
export type NewEvent = InferInsertModel<typeof events>;
export type NewWebhook = InferInsertModel<typeof webhooks>;
export type NewWebhookDelivery = InferInsertModel<typeof webhookDeliveries>;
export type SuppressionList = InferSelectModel<typeof suppressionLists>;
export type NewSuppressionList = InferInsertModel<typeof suppressionLists>;
export type WarmupSession = InferSelectModel<typeof warmupSessions>;
export type NewWarmupSession = InferInsertModel<typeof warmupSessions>;
export type Template = InferSelectModel<typeof templates>;
export type NewTemplate = InferInsertModel<typeof templates>;
export type EmailEmbedding = InferSelectModel<typeof emailEmbeddings>;
export type NewEmailEmbedding = InferInsertModel<typeof emailEmbeddings>;
export type Passkey = InferSelectModel<typeof passkeys>;
export type NewPasskey = InferInsertModel<typeof passkeys>;
export type PasskeyChallenge = InferSelectModel<typeof passkeyChallenges>;
export type NewPasskeyChallenge = InferInsertModel<typeof passkeyChallenges>;
export type Contact = InferSelectModel<typeof contacts>;
export type NewContact = InferInsertModel<typeof contacts>;
export type ContactInteraction = InferSelectModel<typeof contactInteractions>;
export type NewContactInteraction = InferInsertModel<typeof contactInteractions>;
export type ContactReminder = InferSelectModel<typeof contactReminders>;
export type NewContactReminder = InferInsertModel<typeof contactReminders>;
export type RecallRecord = InferSelectModel<typeof recallRecords>;
export type NewRecallRecord = InferInsertModel<typeof recallRecords>;
export type ScreenerDecision = InferSelectModel<typeof screenerDecisions>;
export type NewScreenerDecision = InferInsertModel<typeof screenerDecisions>;
export type ScreenerQueueEntry = InferSelectModel<typeof screenerQueue>;
export type NewScreenerQueueEntry = InferInsertModel<typeof screenerQueue>;
export type CommitmentRecord = InferSelectModel<typeof commitments>;
export type NewCommitmentRecord = InferInsertModel<typeof commitments>;
export type InboxCategoryRecord = InferSelectModel<typeof inboxCategories>;
export type NewInboxCategoryRecord = InferInsertModel<typeof inboxCategories>;
export type RecipientEngagement = InferSelectModel<typeof recipientEngagement>;
export type NewRecipientEngagement = InferInsertModel<typeof recipientEngagement>;
export type EngagementEvent = InferSelectModel<typeof engagementEvents>;
export type NewEngagementEvent = InferInsertModel<typeof engagementEvents>;
export type UnsubscribeHistoryRecord = InferSelectModel<typeof unsubscribeHistory>;
export type NewUnsubscribeHistoryRecord = InferInsertModel<typeof unsubscribeHistory>;
export type EmailTranslation = InferSelectModel<typeof emailTranslations>;
export type NewEmailTranslation = InferInsertModel<typeof emailTranslations>;
export type CustomDictionary = InferSelectModel<typeof customDictionaries>;
export type NewCustomDictionary = InferInsertModel<typeof customDictionaries>;
export type AgentRun = InferSelectModel<typeof agentRuns>;
export type NewAgentRun = InferInsertModel<typeof agentRuns>;
export type AgentDraft = InferSelectModel<typeof agentDrafts>;
export type NewAgentDraft = InferInsertModel<typeof agentDrafts>;
export type AgentConfig = InferSelectModel<typeof agentConfigs>;
export type NewAgentConfig = InferInsertModel<typeof agentConfigs>;
export type UserStreak = InferSelectModel<typeof userStreaks>;
export type NewUserStreak = InferInsertModel<typeof userStreaks>;
export type UserAchievement = InferSelectModel<typeof userAchievements>;
export type NewUserAchievement = InferInsertModel<typeof userAchievements>;
export type DailyStat = InferSelectModel<typeof dailyStats>;
export type NewDailyStat = InferInsertModel<typeof dailyStats>;
export type Task = InferSelectModel<typeof tasks>;
export type NewTask = InferInsertModel<typeof tasks>;
export type TaskProviderConfig = InferSelectModel<typeof taskProviderConfigs>;
export type NewTaskProviderConfig = InferInsertModel<typeof taskProviderConfigs>;
export type MeetingLink = InferSelectModel<typeof meetingLinks>;
export type NewMeetingLink = InferInsertModel<typeof meetingLinks>;
export type MeetingProviderConnection = InferSelectModel<typeof meetingProviderConnections>;
export type NewMeetingProviderConnection = InferInsertModel<typeof meetingProviderConnections>;
export type SavedQuery = InferSelectModel<typeof savedQueries>;
export type NewSavedQuery = InferInsertModel<typeof savedQueries>;
export type QueryHistoryRecord = InferSelectModel<typeof queryHistory>;
export type NewQueryHistoryRecord = InferInsertModel<typeof queryHistory>;
export type ChangelogEntry = InferSelectModel<typeof changelogEntries>;
export type NewChangelogEntry = InferInsertModel<typeof changelogEntries>;
export type VoiceStyleProfile = InferSelectModel<typeof voiceStyleProfiles>;
export type NewVoiceStyleProfile = InferInsertModel<typeof voiceStyleProfiles>;
export type VoiceTrainingSample = InferSelectModel<typeof voiceTrainingSamples>;
export type NewVoiceTrainingSample = InferInsertModel<typeof voiceTrainingSamples>;
export type EmailScript = InferSelectModel<typeof emailScripts>;
export type NewEmailScript = InferInsertModel<typeof emailScripts>;
export type ScriptRun = InferSelectModel<typeof scriptRuns>;
export type NewScriptRun = InferInsertModel<typeof scriptRuns>;
export type RefreshToken = InferSelectModel<typeof refreshTokens>;
export type NewRefreshToken = InferInsertModel<typeof refreshTokens>;
export type Signature = InferSelectModel<typeof signatures>;
export type NewSignature = InferInsertModel<typeof signatures>;
export type ContactGroup = InferSelectModel<typeof contactGroups>;
export type NewContactGroup = InferInsertModel<typeof contactGroups>;
export type ContactGroupMember = InferSelectModel<typeof contactGroupMembers>;
export type NewContactGroupMember = InferInsertModel<typeof contactGroupMembers>;
export type SmartFolder = InferSelectModel<typeof smartFolders>;
export type NewSmartFolder = InferInsertModel<typeof smartFolders>;
export type Label = InferSelectModel<typeof labels>;
export type NewLabel = InferInsertModel<typeof labels>;
export type EmailLabel = InferSelectModel<typeof emailLabels>;
export type NewEmailLabel = InferInsertModel<typeof emailLabels>;
export type ThreadMute = InferSelectModel<typeof threadMutes>;
export type NewThreadMute = InferInsertModel<typeof threadMutes>;
export type AutoResponder = InferSelectModel<typeof autoResponders>;
export type NewAutoResponder = InferInsertModel<typeof autoResponders>;
export type AutoResponderLogEntry = InferSelectModel<typeof autoResponderLog>;
export type NewAutoResponderLogEntry = InferInsertModel<typeof autoResponderLog>;
export type PushSubscription = InferSelectModel<typeof pushSubscriptions>;
export type NewPushSubscription = InferInsertModel<typeof pushSubscriptions>;
export type PushNotificationPreference = InferSelectModel<typeof pushNotificationPreferences>;
export type NewPushNotificationPreference = InferInsertModel<typeof pushNotificationPreferences>;
export type ABTest = InferSelectModel<typeof abTests>;
export type NewABTest = InferInsertModel<typeof abTests>;
export type MailMerge = InferSelectModel<typeof mailMerges>;
export type NewMailMerge = InferInsertModel<typeof mailMerges>;
export type ContactEnrichment = InferSelectModel<typeof contactEnrichments>;
export type NewContactEnrichment = InferInsertModel<typeof contactEnrichments>;
export type Note = InferSelectModel<typeof notes>;
export type NewNote = InferInsertModel<typeof notes>;
export type File = InferSelectModel<typeof files>;
export type NewFile = InferInsertModel<typeof files>;
export type ChatChannel = InferSelectModel<typeof chatChannels>;
export type NewChatChannel = InferInsertModel<typeof chatChannels>;
export type ChatMember = InferSelectModel<typeof chatMembers>;
export type NewChatMember = InferInsertModel<typeof chatMembers>;
export type ChatMessage = InferSelectModel<typeof chatMessages>;
export type NewChatMessage = InferInsertModel<typeof chatMessages>;
export type LinkPreview = InferSelectModel<typeof linkPreviews>;
export type NewLinkPreview = InferInsertModel<typeof linkPreviews>;
export type WebhookIntegration = InferSelectModel<typeof webhookIntegrations>;
export type NewWebhookIntegration = InferInsertModel<typeof webhookIntegrations>;
export type OnboardingRecord = InferSelectModel<typeof onboardingRecords>;
export type NewOnboardingRecord = InferInsertModel<typeof onboardingRecords>;
export type Document = InferSelectModel<typeof documents>;
export type NewDocument = InferInsertModel<typeof documents>;
export type DocumentFolder = InferSelectModel<typeof documentFolders>;
export type NewDocumentFolder = InferInsertModel<typeof documentFolders>;
export type DocumentVersion = InferSelectModel<typeof documentVersions>;
export type NewDocumentVersion = InferInsertModel<typeof documentVersions>;
export type MeetingRoom = InferSelectModel<typeof meetingRooms>;
export type NewMeetingRoom = InferInsertModel<typeof meetingRooms>;
export type MeetingRecording = InferSelectModel<typeof meetingRecordings>;
export type NewMeetingRecording = InferInsertModel<typeof meetingRecordings>;
export type WritingProfile = InferSelectModel<typeof writingProfiles>;
export type NewWritingProfile = InferInsertModel<typeof writingProfiles>;
export type WritingSuggestionLog = InferSelectModel<typeof writingSuggestionsLog>;
export type NewWritingSuggestionLog = InferInsertModel<typeof writingSuggestionsLog>;
export type CalendarEvent = InferSelectModel<typeof calendarEvents>;
export type NewCalendarEvent = InferInsertModel<typeof calendarEvents>;
export type CalendarAvailability = InferSelectModel<typeof calendarAvailability>;
export type NewCalendarAvailability = InferInsertModel<typeof calendarAvailability>;
export type NotificationRule = InferSelectModel<typeof notificationRules>;
export type NewNotificationRule = InferInsertModel<typeof notificationRules>;
export type NotificationBatch = InferSelectModel<typeof notificationBatches>;
export type NewNotificationBatch = InferInsertModel<typeof notificationBatches>;
export type FocusSession = InferSelectModel<typeof focusSessions>;
export type NewFocusSession = InferInsertModel<typeof focusSessions>;
export type EmailHabit = InferSelectModel<typeof emailHabits>;
export type NewEmailHabit = InferInsertModel<typeof emailHabits>;
export type SubscriptionTracker = InferSelectModel<typeof subscriptionTracker>;
export type NewSubscriptionTracker = InferInsertModel<typeof subscriptionTracker>;
export type EmailProductivityGoal = InferSelectModel<typeof emailProductivityGoals>;
export type NewEmailProductivityGoal = InferInsertModel<typeof emailProductivityGoals>;
export type EmailPriorityScore = InferSelectModel<typeof emailPriorityScores>;
export type NewEmailPriorityScore = InferInsertModel<typeof emailPriorityScores>;
export type RelationshipInsight = InferSelectModel<typeof relationshipInsights>;
export type NewRelationshipInsight = InferInsertModel<typeof relationshipInsights>;
export type SmartReply = InferSelectModel<typeof smartReplies>;
export type NewSmartReply = InferInsertModel<typeof smartReplies>;
export type EmailSentiment = InferSelectModel<typeof emailSentiments>;
export type NewEmailSentiment = InferInsertModel<typeof emailSentiments>;
export type WritingCoachResult = InferSelectModel<typeof writingCoachResults>;
export type NewWritingCoachResult = InferInsertModel<typeof writingCoachResults>;
export type PredictiveAction = InferSelectModel<typeof predictiveActions>;
export type NewPredictiveAction = InferInsertModel<typeof predictiveActions>;

// Tier 7 types
import type { analyticsSnapshots, analyticsGoals } from "./schema/analytics-dashboard.js";
import type { emailDelegations, sharedDrafts } from "./schema/delegation.js";
import type { workflows, workflowRuns, workflowTemplates } from "./schema/workflows.js";
import type { emailCategories, smartLabelRules, categoryFeedback } from "./schema/ai-categorization.js";
import type { searchHistory, searchBookmarks, searchSuggestions } from "./schema/search-intelligence.js";
import type { threatDetections, securityPolicies, securityAuditLog } from "./schema/security-intelligence.js";

export type AnalyticsSnapshot = InferSelectModel<typeof analyticsSnapshots>;
export type NewAnalyticsSnapshot = InferInsertModel<typeof analyticsSnapshots>;
export type AnalyticsGoal = InferSelectModel<typeof analyticsGoals>;
export type NewAnalyticsGoal = InferInsertModel<typeof analyticsGoals>;
export type EmailDelegation = InferSelectModel<typeof emailDelegations>;
export type NewEmailDelegation = InferInsertModel<typeof emailDelegations>;
export type SharedDraft = InferSelectModel<typeof sharedDrafts>;
export type NewSharedDraft = InferInsertModel<typeof sharedDrafts>;
export type Workflow = InferSelectModel<typeof workflows>;
export type NewWorkflow = InferInsertModel<typeof workflows>;
export type WorkflowRun = InferSelectModel<typeof workflowRuns>;
export type NewWorkflowRun = InferInsertModel<typeof workflowRuns>;
export type WorkflowTemplate = InferSelectModel<typeof workflowTemplates>;
export type NewWorkflowTemplate = InferInsertModel<typeof workflowTemplates>;
export type EmailCategory = InferSelectModel<typeof emailCategories>;
export type NewEmailCategory = InferInsertModel<typeof emailCategories>;
export type SmartLabelRule = InferSelectModel<typeof smartLabelRules>;
export type NewSmartLabelRule = InferInsertModel<typeof smartLabelRules>;
export type CategoryFeedbackRecord = InferSelectModel<typeof categoryFeedback>;
export type NewCategoryFeedbackRecord = InferInsertModel<typeof categoryFeedback>;
export type SearchHistoryRecord = InferSelectModel<typeof searchHistory>;
export type NewSearchHistoryRecord = InferInsertModel<typeof searchHistory>;
export type SearchBookmark = InferSelectModel<typeof searchBookmarks>;
export type NewSearchBookmark = InferInsertModel<typeof searchBookmarks>;
export type SearchSuggestion = InferSelectModel<typeof searchSuggestions>;
export type NewSearchSuggestion = InferInsertModel<typeof searchSuggestions>;
export type ThreatDetection = InferSelectModel<typeof threatDetections>;
export type NewThreatDetection = InferInsertModel<typeof threatDetections>;
export type SecurityPolicy = InferSelectModel<typeof securityPolicies>;
export type NewSecurityPolicy = InferInsertModel<typeof securityPolicies>;
export type SecurityAuditLogEntry = InferSelectModel<typeof securityAuditLog>;
export type NewSecurityAuditLogEntry = InferInsertModel<typeof securityAuditLog>;

// Attachment Intelligence types
import type { attachmentAnalysis, smartFileOrganization } from "./schema/attachment-intelligence.js";

export type AttachmentAnalysis = InferSelectModel<typeof attachmentAnalysis>;
export type NewAttachmentAnalysis = InferInsertModel<typeof attachmentAnalysis>;
export type SmartFileOrganization = InferSelectModel<typeof smartFileOrganization>;
export type NewSmartFileOrganization = InferInsertModel<typeof smartFileOrganization>;

// Tier 8 types
import type { sentimentTimeline, relationshipHealth } from "./schema/sentiment-timeline.js";
import type { meetingProposals, availabilityPatterns } from "./schema/scheduling-intelligence.js";
import type { emailActionItems, emailDeadlines, emailPromises } from "./schema/context-intelligence.js";
import type { emailTimeTracking, productivityInsights, emailBehaviorPatterns } from "./schema/productivity-analytics.js";
import type { knowledgeEntities, knowledgeRelationships, knowledgeExtractions } from "./schema/knowledge-graph.js";

export type SentimentTimelineEntry = InferSelectModel<typeof sentimentTimeline>;
export type NewSentimentTimelineEntry = InferInsertModel<typeof sentimentTimeline>;
export type RelationshipHealthRecord = InferSelectModel<typeof relationshipHealth>;
export type NewRelationshipHealthRecord = InferInsertModel<typeof relationshipHealth>;
export type MeetingProposal = InferSelectModel<typeof meetingProposals>;
export type NewMeetingProposal = InferInsertModel<typeof meetingProposals>;
export type AvailabilityPattern = InferSelectModel<typeof availabilityPatterns>;
export type NewAvailabilityPattern = InferInsertModel<typeof availabilityPatterns>;
export type EmailActionItem = InferSelectModel<typeof emailActionItems>;
export type NewEmailActionItem = InferInsertModel<typeof emailActionItems>;
export type EmailDeadline = InferSelectModel<typeof emailDeadlines>;
export type NewEmailDeadline = InferInsertModel<typeof emailDeadlines>;
export type EmailPromise = InferSelectModel<typeof emailPromises>;
export type NewEmailPromise = InferInsertModel<typeof emailPromises>;
export type EmailTimeTrackingRecord = InferSelectModel<typeof emailTimeTracking>;
export type NewEmailTimeTrackingRecord = InferInsertModel<typeof emailTimeTracking>;
export type ProductivityInsight = InferSelectModel<typeof productivityInsights>;
export type NewProductivityInsight = InferInsertModel<typeof productivityInsights>;
export type EmailBehaviorPattern = InferSelectModel<typeof emailBehaviorPatterns>;
export type NewEmailBehaviorPattern = InferInsertModel<typeof emailBehaviorPatterns>;
export type KnowledgeEntity = InferSelectModel<typeof knowledgeEntities>;
export type NewKnowledgeEntity = InferInsertModel<typeof knowledgeEntities>;
export type KnowledgeRelationship = InferSelectModel<typeof knowledgeRelationships>;
export type NewKnowledgeRelationship = InferInsertModel<typeof knowledgeRelationships>;
export type KnowledgeExtraction = InferSelectModel<typeof knowledgeExtractions>;
export type NewKnowledgeExtraction = InferInsertModel<typeof knowledgeExtractions>;
