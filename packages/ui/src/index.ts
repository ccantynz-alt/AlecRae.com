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

// Layouts
export { Sidebar, type SidebarProps, type SidebarNavItem, type SidebarSection } from "./layouts/sidebar";
export { PageLayout, type PageLayoutProps } from "./layouts/page-layout";

// Theme
export { ThemeProvider, useTheme, type ThemeProviderProps } from "./theme/provider";
export { tokens, colors, spacing, typography, shadows, borders, type Tokens } from "./theme/tokens";
