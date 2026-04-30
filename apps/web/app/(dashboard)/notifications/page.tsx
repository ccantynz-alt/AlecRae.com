"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Box,
  Text,
  Card,
  CardContent,
  CardHeader,
  Button,
  PageLayout,
  Input,
} from "@alecrae/ui";
import { motion, AnimatePresence, type Variants } from "motion/react";
import {
  staggerSlow,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
  SPRING_BOUNCY,
} from "../../../lib/animations";

// ─── Types ──────────────────────────────────────────────────────────────────

type FilterTab = "all" | "urgent" | "mentions" | "updates" | "digests";
type NotificationPriority = "critical" | "high" | "normal" | "low";
type NotificationType = "urgent" | "mention" | "update" | "digest" | "calendar" | "security";
type TimeGroup = "just-now" | "earlier-today" | "yesterday" | "this-week";

interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  description: string;
  timestamp: string;
  timeLabel: string;
  group: TimeGroup;
  read: boolean;
  senderName: string;
  actionLabel: string;
}

interface PreferenceToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string; count: number }[] = [
  { key: "all", label: "All", count: 15 },
  { key: "urgent", label: "Urgent", count: 3 },
  { key: "mentions", label: "Mentions", count: 4 },
  { key: "updates", label: "Updates", count: 5 },
  { key: "digests", label: "Digests", count: 3 },
];

const NOTIFICATIONS: Notification[] = [
  // Just now
  {
    id: "n-1",
    type: "urgent",
    priority: "critical",
    title: "Production deployment requires approval",
    description: "Lisa Park requested approval for deploy #1248 to production. 3 migrations pending.",
    timestamp: "2026-04-30T10:28:00Z",
    timeLabel: "2 min ago",
    group: "just-now",
    read: false,
    senderName: "Lisa Park",
    actionLabel: "Review",
  },
  {
    id: "n-2",
    type: "mention",
    priority: "high",
    title: "@craig mentioned in Q3 budget thread",
    description: "Sarah Chen tagged you: 'Craig, can you confirm the marketing allocation before EOD?'",
    timestamp: "2026-04-30T10:25:00Z",
    timeLabel: "5 min ago",
    group: "just-now",
    read: false,
    senderName: "Sarah Chen",
    actionLabel: "View",
  },
  {
    id: "n-3",
    type: "urgent",
    priority: "critical",
    title: "Security alert: New login from unknown device",
    description: "A login attempt was detected from Chrome on Windows in San Francisco. If this was not you, take action immediately.",
    timestamp: "2026-04-30T10:22:00Z",
    timeLabel: "8 min ago",
    group: "just-now",
    read: false,
    senderName: "AlecRae Security",
    actionLabel: "Review",
  },
  // Earlier today
  {
    id: "n-4",
    type: "update",
    priority: "normal",
    title: "PR #847 merged successfully",
    description: "Your pull request 'fix: edge caching for Workers' was merged into main. CI passed.",
    timestamp: "2026-04-30T09:15:00Z",
    timeLabel: "1h ago",
    group: "earlier-today",
    read: false,
    senderName: "GitHub",
    actionLabel: "View",
  },
  {
    id: "n-5",
    type: "mention",
    priority: "high",
    title: "Tagged in contract discussion",
    description: "Marcus Johnson mentioned you: 'Need Craig to sign off on the updated enterprise terms.'",
    timestamp: "2026-04-30T08:51:00Z",
    timeLabel: "1.5h ago",
    group: "earlier-today",
    read: false,
    senderName: "Marcus Johnson",
    actionLabel: "View",
  },
  {
    id: "n-6",
    type: "digest",
    priority: "low",
    title: "Morning AI Briefing ready",
    description: "Your autopilot processed 47 emails overnight. 4 replies drafted, 3 newsletters summarized.",
    timestamp: "2026-04-30T06:30:00Z",
    timeLabel: "4h ago",
    group: "earlier-today",
    read: true,
    senderName: "AlecRae AI",
    actionLabel: "View",
  },
  {
    id: "n-7",
    type: "update",
    priority: "normal",
    title: "April payout processed",
    description: "Your Stripe payout of $4,218.00 has been processed and will arrive in 2 business days.",
    timestamp: "2026-04-30T06:00:00Z",
    timeLabel: "4.5h ago",
    group: "earlier-today",
    read: true,
    senderName: "Stripe",
    actionLabel: "View",
  },
  // Yesterday
  {
    id: "n-8",
    type: "mention",
    priority: "high",
    title: "Design review requested",
    description: "Elena Rodriguez needs your feedback: 'Craig, which direction for the brand refresh? B or C?'",
    timestamp: "2026-04-29T16:20:00Z",
    timeLabel: "Yesterday",
    group: "yesterday",
    read: true,
    senderName: "Elena Rodriguez",
    actionLabel: "View",
  },
  {
    id: "n-9",
    type: "update",
    priority: "normal",
    title: "Team wiki updated",
    description: "Alex Kim updated the onboarding documentation with new developer setup instructions.",
    timestamp: "2026-04-29T14:10:00Z",
    timeLabel: "Yesterday",
    group: "yesterday",
    read: true,
    senderName: "Alex Kim",
    actionLabel: "View",
  },
  {
    id: "n-10",
    type: "calendar",
    priority: "normal",
    title: "Meeting reminder: Investor call tomorrow",
    description: "Due diligence follow-up with Tom Nakamura. Prep your technical architecture doc.",
    timestamp: "2026-04-29T12:00:00Z",
    timeLabel: "Yesterday",
    group: "yesterday",
    read: true,
    senderName: "Calendar",
    actionLabel: "View",
  },
  {
    id: "n-11",
    type: "digest",
    priority: "low",
    title: "Weekly newsletter digest",
    description: "3 newsletters summarized: Stratechery, TLDR Tech, Lenny's Newsletter. Key themes: AI infra, pricing.",
    timestamp: "2026-04-29T09:00:00Z",
    timeLabel: "Yesterday",
    group: "yesterday",
    read: true,
    senderName: "AlecRae AI",
    actionLabel: "View",
  },
  // This week
  {
    id: "n-12",
    type: "update",
    priority: "normal",
    title: "Inbox zero streak: 3 days",
    description: "Congratulations! You have maintained inbox zero for 3 consecutive days. Personal best: 7 days.",
    timestamp: "2026-04-28T18:00:00Z",
    timeLabel: "Mon",
    group: "this-week",
    read: true,
    senderName: "AlecRae",
    actionLabel: "View",
  },
  {
    id: "n-13",
    type: "urgent",
    priority: "high",
    title: "Rate limit warning on API",
    description: "Your /v1/ai/compose endpoint hit 80% of the rate limit. Consider upgrading or optimizing calls.",
    timestamp: "2026-04-28T11:30:00Z",
    timeLabel: "Mon",
    group: "this-week",
    read: true,
    senderName: "AlecRae Infra",
    actionLabel: "View",
  },
  {
    id: "n-14",
    type: "mention",
    priority: "normal",
    title: "Feedback on mobile build",
    description: "Jamie left a comment: 'The swipe gestures feel great on iOS but slightly laggy on older Android devices.'",
    timestamp: "2026-04-27T15:45:00Z",
    timeLabel: "Sun",
    group: "this-week",
    read: true,
    senderName: "Jamie",
    actionLabel: "View",
  },
  {
    id: "n-15",
    type: "digest",
    priority: "low",
    title: "Email health report",
    description: "Your email health score improved to 82 (Excellent). Avg response time down 18% this week.",
    timestamp: "2026-04-27T09:00:00Z",
    timeLabel: "Sun",
    group: "this-week",
    read: true,
    senderName: "AlecRae Analytics",
    actionLabel: "View",
  },
];

const DEFAULT_PREFERENCES: PreferenceToggle[] = [
  {
    id: "push",
    label: "Push Notifications",
    description: "Receive push notifications for urgent and high-priority items",
    enabled: true,
  },
  {
    id: "digest",
    label: "Daily Digest",
    description: "Receive a summary of activity each morning at 7 AM",
    enabled: true,
  },
  {
    id: "ai-triage",
    label: "AI Triage Alerts",
    description: "Get notified when AI autopilot drafts replies or triages emails",
    enabled: false,
  },
  {
    id: "calendar",
    label: "Calendar Reminders",
    description: "Show meeting prep notifications 15 minutes before events",
    enabled: true,
  },
];

const GROUP_LABELS: Record<TimeGroup, string> = {
  "just-now": "Just now",
  "earlier-today": "Earlier today",
  "yesterday": "Yesterday",
  "this-week": "This week",
};

const GROUP_ORDER: TimeGroup[] = ["just-now", "earlier-today", "yesterday", "this-week"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function priorityDotColor(priority: NotificationPriority): string {
  switch (priority) {
    case "critical":
      return "bg-red-500";
    case "high":
      return "bg-amber-500";
    case "normal":
      return "bg-blue-500";
    case "low":
      return "bg-gray-400";
  }
}

function priorityBadgeBg(priority: NotificationPriority): string {
  switch (priority) {
    case "critical":
      return "bg-red-50 text-red-700";
    case "high":
      return "bg-amber-50 text-amber-700";
    case "normal":
      return "bg-blue-50 text-blue-700";
    case "low":
      return "bg-gray-50 text-gray-500";
  }
}

function priorityLabel(priority: NotificationPriority): string {
  switch (priority) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "normal":
      return "Normal";
    case "low":
      return "Low";
  }
}

function typeIcon(type: NotificationType): string {
  switch (type) {
    case "urgent":
      return "!";
    case "mention":
      return "@";
    case "update":
      return "U";
    case "digest":
      return "D";
    case "calendar":
      return "C";
    case "security":
      return "S";
  }
}

function typeIconBg(type: NotificationType): string {
  switch (type) {
    case "urgent":
      return "bg-red-100 text-red-700";
    case "mention":
      return "bg-violet-100 text-violet-700";
    case "update":
      return "bg-blue-100 text-blue-700";
    case "digest":
      return "bg-emerald-100 text-emerald-700";
    case "calendar":
      return "bg-amber-100 text-amber-700";
    case "security":
      return "bg-red-100 text-red-700";
  }
}

function matchesFilter(notification: Notification, filter: FilterTab): boolean {
  if (filter === "all") return true;
  if (filter === "urgent") return notification.priority === "critical" || notification.priority === "high";
  if (filter === "mentions") return notification.type === "mention";
  if (filter === "updates") return notification.type === "update" || notification.type === "calendar";
  if (filter === "digests") return notification.type === "digest";
  return true;
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function FilterTabs({
  active,
  onSelect,
}: {
  active: FilterTab;
  onSelect: (tab: FilterTab) => void;
}): React.ReactNode {
  return (
    <Box className="flex items-center gap-1 overflow-x-auto pb-1">
      {FILTER_TABS.map((tab) => (
        <Button
          key={tab.key}
          variant={active === tab.key ? "primary" : "ghost"}
          size="sm"
          onClick={() => onSelect(tab.key)}
        >
          <Box className="flex items-center gap-1.5">
            <Text className="text-xs font-medium">{tab.label}</Text>
            <Box
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                active === tab.key
                  ? "bg-white/20 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <Text className="text-[10px] font-bold">{tab.count}</Text>
            </Box>
          </Box>
        </Button>
      ))}
    </Box>
  );
}

function UrgencyBanner({
  count,
  variants,
}: {
  count: number;
  variants: Variants;
}): React.ReactNode {
  if (count === 0) return null;
  return (
    <motion.div variants={variants}>
      <Card className="border-red-200 bg-red-50/50">
        <CardContent>
          <Box className="flex items-center gap-3 py-0.5">
            <Box className="relative flex items-center justify-center">
              <Box className="w-3 h-3 rounded-full bg-red-500" />
              <motion.div
                className="absolute w-3 h-3 rounded-full bg-red-500"
                animate={{
                  scale: [1, 1.8, 1],
                  opacity: [1, 0, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </Box>
            <Box className="flex-1">
              <Text className="text-sm font-semibold text-red-800">
                {count} notification{count > 1 ? "s" : ""} need your attention
              </Text>
              <Text className="text-xs text-red-600 mt-0.5">
                Critical and high-priority items require action
              </Text>
            </Box>
            <Button variant="primary" size="sm">
              <Text className="text-xs">Review all</Text>
            </Button>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function NotificationCard({
  notification,
  onDismiss,
  onSnooze,
  variants,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  variants: Variants;
}): React.ReactNode {
  return (
    <motion.div
      variants={variants}
      layout
      exit={{ opacity: 0, x: -60, height: 0, marginBottom: 0, transition: { duration: 0.25 } }}
    >
      <Card
        className={`transition-colors ${
          notification.read
            ? "opacity-70 hover:opacity-100"
            : "border-l-2 border-l-blue-500"
        }`}
      >
        <CardContent>
          <Box className="flex items-start gap-3 py-0.5">
            {/* Type Icon */}
            <Box
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${typeIconBg(notification.type)}`}
            >
              <Text className="text-sm font-bold">
                {typeIcon(notification.type)}
              </Text>
            </Box>

            {/* Content */}
            <Box className="flex-1 min-w-0">
              <Box className="flex items-center gap-2 mb-0.5">
                {/* Priority Badge */}
                <Box className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${priorityBadgeBg(notification.priority)}`}>
                  <Text className="text-[10px] font-bold">
                    {priorityLabel(notification.priority)}
                  </Text>
                </Box>
                {/* Unread indicator */}
                {!notification.read ? (
                  <Box className={`w-2 h-2 rounded-full ${priorityDotColor(notification.priority)}`} />
                ) : null}
                <Text className="text-xs text-content-tertiary ml-auto shrink-0">
                  {notification.timeLabel}
                </Text>
              </Box>

              <Text
                className={`text-sm ${
                  notification.read
                    ? "font-normal text-content-secondary"
                    : "font-semibold text-content"
                }`}
              >
                {notification.title}
              </Text>
              <Text className="text-xs text-content-tertiary mt-0.5 line-clamp-2">
                {notification.description}
              </Text>
              <Text className="text-xs text-content-tertiary mt-1">
                {notification.senderName}
              </Text>

              {/* Actions */}
              <Box className="flex items-center gap-2 mt-2">
                <Button variant="primary" size="sm">
                  <Text className="text-xs">{notification.actionLabel}</Text>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDismiss(notification.id)}
                >
                  <Text className="text-xs">Dismiss</Text>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSnooze(notification.id)}
                >
                  <Text className="text-xs">Snooze</Text>
                </Button>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function NotificationGroup({
  groupKey,
  notifications,
  onDismiss,
  onSnooze,
  itemVariants,
}: {
  groupKey: TimeGroup;
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  itemVariants: Variants;
}): React.ReactNode {
  if (notifications.length === 0) return null;

  return (
    <Box className="mb-6">
      <Box className="mb-3">
        <Text className="text-xs font-semibold text-content-tertiary uppercase tracking-wider">
          {GROUP_LABELS[groupKey]}
        </Text>
      </Box>
      <Box className="space-y-3">
        <AnimatePresence mode="popLayout">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onDismiss={onDismiss}
              onSnooze={onSnooze}
              variants={itemVariants}
            />
          ))}
        </AnimatePresence>
      </Box>
    </Box>
  );
}

function PreferencesSection({
  preferences,
  onToggle,
  variants,
}: {
  preferences: PreferenceToggle[];
  onToggle: (id: string) => void;
  variants: Variants;
}): React.ReactNode {
  return (
    <motion.div variants={variants}>
      <Card>
        <CardHeader>
          <Box>
            <Text className="text-sm font-semibold text-content">
              Notification Preferences
            </Text>
            <Text className="text-xs text-content-tertiary mt-0.5">
              Control what notifications you receive
            </Text>
          </Box>
        </CardHeader>
        <CardContent>
          <Box className="space-y-4">
            {preferences.map((pref) => (
              <Box key={pref.id} className="flex items-center justify-between">
                <Box className="min-w-0 mr-4">
                  <Text className="text-sm font-medium text-content">
                    {pref.label}
                  </Text>
                  <Text className="text-xs text-content-tertiary mt-0.5">
                    {pref.description}
                  </Text>
                </Box>
                <Button
                  variant={pref.enabled ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => onToggle(pref.id)}
                >
                  <Text className="text-xs font-medium">
                    {pref.enabled ? "On" : "Off"}
                  </Text>
                </Button>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function NotificationsPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const itemVariants = withReducedMotion(fadeInUp, reduced);

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const [allRead, setAllRead] = useState(false);
  const [preferences, setPreferences] = useState<PreferenceToggle[]>(DEFAULT_PREFERENCES);

  const handleDismiss = useCallback((id: string): void => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleSnooze = useCallback((id: string): void => {
    setSnoozedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleMarkAllRead = useCallback((): void => {
    setAllRead(true);
  }, []);

  const handleClearAll = useCallback((): void => {
    setDismissedIds(new Set(NOTIFICATIONS.map((n) => n.id)));
  }, []);

  const handleTogglePreference = useCallback((id: string): void => {
    setPreferences((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
    );
  }, []);

  const handleFilterSelect = useCallback((tab: FilterTab): void => {
    setActiveFilter(tab);
  }, []);

  const visibleNotifications = useMemo((): Notification[] => {
    return NOTIFICATIONS.filter(
      (n) =>
        !dismissedIds.has(n.id) &&
        !snoozedIds.has(n.id) &&
        matchesFilter(n, activeFilter),
    ).map((n) => (allRead ? { ...n, read: true } : n));
  }, [activeFilter, dismissedIds, snoozedIds, allRead]);

  const groupedNotifications = useMemo((): Record<TimeGroup, Notification[]> => {
    const groups: Record<TimeGroup, Notification[]> = {
      "just-now": [],
      "earlier-today": [],
      "yesterday": [],
      "this-week": [],
    };
    for (const n of visibleNotifications) {
      groups[n.group].push(n);
    }
    return groups;
  }, [visibleNotifications]);

  const urgentCount = useMemo(
    () =>
      visibleNotifications.filter(
        (n) =>
          !n.read &&
          (n.priority === "critical" || n.priority === "high"),
      ).length,
    [visibleNotifications],
  );

  return (
    <PageLayout
      title="Notifications"
      description="Stay on top of what matters most."
    >
      {/* Filter Tabs */}
      <motion.div
        variants={itemVariants}
        initial="initial"
        animate="animate"
        className="mb-6"
      >
        <Box className="flex items-center justify-between">
          <FilterTabs active={activeFilter} onSelect={handleFilterSelect} />
          <Box className="flex items-center gap-2 shrink-0 ml-4">
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
              <Text className="text-xs">Mark all read</Text>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              <Text className="text-xs">Clear all</Text>
            </Button>
          </Box>
        </Box>
      </motion.div>

      {/* AI Urgency Banner */}
      <motion.div
        className="mb-6"
        variants={staggerSlow}
        initial="initial"
        animate="animate"
      >
        <UrgencyBanner count={urgentCount} variants={itemVariants} />
      </motion.div>

      {/* Notification Groups */}
      <motion.div
        variants={staggerSlow}
        initial="initial"
        animate="animate"
      >
        {GROUP_ORDER.map((groupKey) => (
          <NotificationGroup
            key={groupKey}
            groupKey={groupKey}
            notifications={groupedNotifications[groupKey]}
            onDismiss={handleDismiss}
            onSnooze={handleSnooze}
            itemVariants={itemVariants}
          />
        ))}
      </motion.div>

      {/* Empty state */}
      {visibleNotifications.length === 0 ? (
        <motion.div
          variants={itemVariants}
          initial="initial"
          animate="animate"
        >
          <Card>
            <CardContent>
              <Box className="py-12 text-center">
                <Box className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Text className="text-lg text-gray-400">N</Text>
                </Box>
                <Text className="text-sm font-semibold text-content">
                  All caught up
                </Text>
                <Text className="text-xs text-content-tertiary mt-1">
                  No notifications to show. Check back later.
                </Text>
              </Box>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      {/* Preferences */}
      <motion.div
        className="mt-8"
        variants={staggerSlow}
        initial="initial"
        animate="animate"
      >
        <PreferencesSection
          preferences={preferences}
          onToggle={handleTogglePreference}
          variants={itemVariants}
        />
      </motion.div>
    </PageLayout>
  );
}
