// Primitives
export { Box, type BoxProps } from "./primitives/box";
export { Text, type TextProps, type TextVariant } from "./primitives/text";
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./primitives/button";
export { Input, type InputProps, type InputVariant } from "./primitives/input";
export { Card, CardHeader, CardContent, CardFooter, type CardProps, type CardHeaderProps, type CardContentProps, type CardFooterProps } from "./primitives/card";

// Composites
export { EmailList, type EmailListProps, type EmailListItem } from "./composites/email-list";
export { EmailViewer, type EmailViewerProps, type EmailMessage, type EmailBodyPart, type EmailAttachment } from "./composites/email-viewer";
export { ComposeEditor, type ComposeEditorProps, type ComposeData, type AISuggestion, type CalendarSlotRequestFn } from "./composites/compose-editor";
export { DomainCard, type DomainCardProps, type DnsRecord, type DomainVerificationState } from "./composites/domain-card";
export { AnalyticsChart, type AnalyticsChartProps, type ChartDataPoint, type ChartType } from "./composites/analytics-chart";
export { StatCard, type StatCardProps, type StatTrend } from "./composites/stat-card";
export { SlotPicker, type SlotPickerProps, type SlotOption } from "./composites/slot-picker";
export { CalendarSlotSuggestion, type CalendarSlotSuggestionProps, type MeetingIntentInfo } from "./composites/calendar-slot-suggestion";
export { SendTimeSuggestion, type SendTimeSuggestionProps, type SendTimeSlot, type ConfidenceLevel, type DataSource } from "./composites/send-time-suggestion";
export { UnsubscribeButton, type UnsubscribeButtonProps, type UnsubscribeStatus, type UnsubscribeOption, type UnsubscribeResult } from "./composites/unsubscribe-button";
export { TranslationBadge, type TranslationBadgeProps, type TranslationBadgeData, type TranslationContent, type TranslationRecord, type TranslationViewMode } from "./composites/translation-badge";
export { SpellCheckSuggestions, type SpellCheckSuggestionsProps, type SpellCheckIssue, type SpellCheckResult, type SpellCheckRequestFn, type AddToDictionaryFn } from "./composites/spellcheck-suggestions";
export { InboxZeroCelebration, type InboxZeroCelebrationProps, type NewAchievement } from "./composites/inbox-zero-celebration";
export { StreakCounter, type StreakCounterProps } from "./composites/streak-counter";
export { AchievementBadge, type AchievementBadgeProps, type AchievementBadgeData } from "./composites/achievement-badge";
export { AchievementPanel, type AchievementPanelProps, type AchievementFilter } from "./composites/achievement-panel";
export { WeeklyStatsCard, type WeeklyStatsCardProps, type DailyStatEntry } from "./composites/weekly-stats-card";
export { GamificationToggle, type GamificationToggleProps } from "./composites/gamification-toggle";
export { SenderTrustBadge, type SenderTrustBadgeProps, type SenderVerificationData, type SenderTrustLevel, type SenderVerificationIndicator, type TyposquatMatch, type DnsAuthRecords } from "./composites/sender-trust-badge";
export { PhishingWarningBanner, type PhishingWarningBannerProps, type PhishingAnalysisData, type PhishingRiskLevel, type PhishingSuggestedAction, type PhishingIndicator, type PhishingSeverity } from "./composites/phishing-warning-banner";
export { SecurityReport, type SecurityReportProps, type SecurityReportData } from "./composites/security-report";
export { CollaboratorAvatars, type CollaboratorAvatarsProps, type Collaborator } from "./composites/collaborator-avatars";
export { CollaborationPanel, type CollaborationPanelProps, type CollabPanelView, type CollabInvite, type CollabHistoryEntry, type CollabSessionInfo, type CollabSessionStatus } from "./composites/collaboration-panel";
export { CollaborativeEditor, type CollaborativeEditorProps, type CollaborativeEditorConfig, type ConnectionStatus, type AwarenessUserState } from "./composites/collaborative-editor";
export { ActionItemList, type ActionItemListProps, type ExtractedActionItem, type TaskProvider, type TaskPriority, type ExtractionState, type CreateState } from "./composites/action-item-list";
export { MeetingLinkCard, type MeetingLinkCardProps, type MeetingLinkData, type MeetingProvider, type MeetingLinkStatus } from "./composites/meeting-link-card";
export { SnoozeCalendar, type SnoozeCalendarProps, type SnoozeTimeSlot, type SnoozePreset } from "./composites/snooze-calendar";
export { DraggableEmailRow, type DraggableEmailRowProps, type DraggableEmailData } from "./composites/draggable-email-row";
export { SnoozeDropOverlay, type SnoozeDropOverlayProps } from "./composites/snooze-drop-overlay";
// SpatialInboxView and SpatialControls are NOT barrel-exported because they
// depend on @react-three/fiber + three which break React 19 SSR/SSG.
// Import directly from "@alecrae/ui/src/composites/spatial-inbox-view" and
// "@alecrae/ui/src/composites/spatial-controls" where needed (with dynamic import).
export type { SpatialInboxViewProps, SpatialThread, SpatialAxis, SpatialColorScheme, SpatialFilterState, ThreadCategory } from "./composites/spatial-inbox-view";
export type { SpatialControlsProps } from "./composites/spatial-controls";
export { InboxHeatmap, type InboxHeatmapProps, type HeatmapDayData, type HeatmapMode } from "./composites/inbox-heatmap";
export { HourlyActivityChart, type HourlyActivityChartProps, type HourlyBucket } from "./composites/hourly-activity-chart";
export { EmailStatsDashboard, type EmailStatsDashboardProps, type EmailStatsMetrics, type EmailStatsCompare, type StatsPeriod } from "./composites/email-stats-dashboard";

export { ChangelogEntry, type ChangelogEntryProps, type ChangelogEntryData, type ChangelogCategory } from "./composites/changelog-entry";
export { ChangelogFeed, type ChangelogFeedProps } from "./composites/changelog-feed";
export { VoiceProfileSelector, type VoiceProfileSelectorProps, type VoiceProfileData, type ConfidenceTier } from "./composites/voice-profile-selector";
export { VoiceRecorder, type VoiceRecorderProps, type VoiceRecordingResult, type RecordingState } from "./composites/voice-recorder";
export { VoiceMessagePlayer, type VoiceMessagePlayerProps, type VoiceMessageData, type PlaybackSpeed } from "./composites/voice-message-player";
export { ScriptEditor, type ScriptEditorProps, type ScriptData, type ScriptTemplate, type ScriptRunEntry, type ScriptTrigger, type ScriptRunStatus, type TestResult } from "./composites/script-editor";
export { QueryConsole, type QueryConsoleProps, type QueryMode, type QueryState, type ConsolePanelView, type QueryResultData, type QueryExplanationData, type QueryHistoryEntry, type SavedQueryEntry, type QueryResultColumn } from "./composites/query-console";
export { SwipeableEmailRow as SwipeableEmailRowUI, type SwipeableEmailRowProps as SwipeableEmailRowUIProps, type SwipeableEmailRowData, type SwipeActionKind, type SwipeAction, type SwipeConfig } from "./composites/swipeable-email-row";
export { QuickReplySheet as QuickReplySheetUI, type QuickReplySheetProps as QuickReplySheetUIProps, type QuickReplySuggestion, type ThreadContextMessage, type ReplyLength } from "./composites/quick-reply-sheet";

// Layouts
export { Sidebar, type SidebarProps, type SidebarNavItem, type SidebarSection } from "./layouts/sidebar";
export { PageLayout, type PageLayoutProps } from "./layouts/page-layout";

// Theme
export { ThemeProvider, useTheme, type ThemeProviderProps } from "./theme/provider";
export { tokens, colors, spacing, typography, shadows, borders, type Tokens } from "./theme/tokens";
