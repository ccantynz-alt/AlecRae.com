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

type LayoutMode = "2-col" | "3-col";

interface AccountEmail {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  preview: string;
  time: string;
  unread: boolean;
}

interface EmailAccount {
  id: string;
  label: string;
  email: string;
  dotColor: string;
  dotBg: string;
  headerBg: string;
  headerBorder: string;
  unreadCount: number;
  emails: AccountEmail[];
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const ACCOUNTS: EmailAccount[] = [
  {
    id: "work",
    label: "Work",
    email: "craig@alecrae.com",
    dotColor: "bg-blue-500",
    dotBg: "bg-blue-50",
    headerBg: "bg-blue-50/50",
    headerBorder: "border-blue-200",
    unreadCount: 18,
    emails: [
      {
        id: "w-1",
        sender: "Sarah Chen",
        senderEmail: "sarah.chen@acmecorp.com",
        subject: "Q3 Budget Review Meeting",
        preview: "Hi Craig, attached is the updated budget for Q3. Please review the marketing line item before Thursday.",
        time: "9:42 AM",
        unread: true,
      },
      {
        id: "w-2",
        sender: "DevOps Bot",
        senderEmail: "alerts@infra.alecrae.com",
        subject: "Deploy #1247 succeeded",
        preview: "Production deployment completed successfully. All health checks passing. Zero downtime.",
        time: "9:15 AM",
        unread: true,
      },
      {
        id: "w-3",
        sender: "Marcus Johnson",
        senderEmail: "m.johnson@vendorlink.io",
        subject: "Contract Renewal - Updated Terms",
        preview: "Marcus here. We have updated the enterprise pricing for 2026. The new terms reflect a 12% adjustment.",
        time: "8:51 AM",
        unread: true,
      },
      {
        id: "w-4",
        sender: "Lisa Park",
        senderEmail: "lisa.park@consultancy.com",
        subject: "Updated Proposal - Please Review",
        preview: "Hey Craig, I have incorporated all the feedback from the last review. Key changes are on pages 4-7.",
        time: "8:20 AM",
        unread: false,
      },
      {
        id: "w-5",
        sender: "GitHub",
        senderEmail: "notifications@github.com",
        subject: "[alecrae/core] PR #847 merged",
        preview: "Pull request #847 has been merged into main. 14 files changed, 892 additions, 43 deletions.",
        time: "7:45 AM",
        unread: false,
      },
      {
        id: "w-6",
        sender: "Tom Nakamura",
        senderEmail: "t.nakamura@investgroup.com",
        subject: "Due Diligence Follow-up",
        preview: "Craig, following up on our call yesterday. Can you send over the technical architecture doc by EOD?",
        time: "7:12 AM",
        unread: true,
      },
      {
        id: "w-7",
        sender: "Stripe",
        senderEmail: "notifications@stripe.com",
        subject: "April payout processed",
        preview: "Your April 2026 payout of $4,218.00 has been processed and will arrive in 2 business days.",
        time: "6:00 AM",
        unread: false,
      },
    ],
  },
  {
    id: "personal",
    label: "Personal",
    email: "craig@gmail.com",
    dotColor: "bg-emerald-500",
    dotBg: "bg-emerald-50",
    headerBg: "bg-emerald-50/50",
    headerBorder: "border-emerald-200",
    unreadCount: 14,
    emails: [
      {
        id: "p-1",
        sender: "Air New Zealand",
        senderEmail: "noreply@airnz.co.nz",
        subject: "Your booking confirmation - AKL to SFO",
        preview: "Booking reference: NZ4821. Departing Auckland 15 May 2026, 11:30 PM. Seat 24A confirmed.",
        time: "10:02 AM",
        unread: true,
      },
      {
        id: "p-2",
        sender: "Netflix",
        senderEmail: "info@mailer.netflix.com",
        subject: "New arrivals this week",
        preview: "Check out this week's new releases including the latest season of your favorite show.",
        time: "9:30 AM",
        unread: false,
      },
      {
        id: "p-3",
        sender: "Mom",
        senderEmail: "janet.c@outlook.com",
        subject: "Sunday dinner?",
        preview: "Hi love, are you free this Sunday for dinner? Dad wants to fire up the BBQ if the weather holds.",
        time: "8:45 AM",
        unread: true,
      },
      {
        id: "p-4",
        sender: "Spotify",
        senderEmail: "no-reply@spotify.com",
        subject: "Your 2026 listening so far",
        preview: "You have listened to 847 songs across 42 artists this year. Your top genre is electronic.",
        time: "8:00 AM",
        unread: false,
      },
      {
        id: "p-5",
        sender: "Amazon",
        senderEmail: "ship-confirm@amazon.com",
        subject: "Your package has shipped",
        preview: "Your order #114-7293847 has shipped and is expected to arrive by Thursday, May 1.",
        time: "7:20 AM",
        unread: true,
      },
    ],
  },
  {
    id: "side-project",
    label: "Side Project",
    email: "hello@sideproject.dev",
    dotColor: "bg-violet-500",
    dotBg: "bg-violet-50",
    headerBg: "bg-violet-50/50",
    headerBorder: "border-violet-200",
    unreadCount: 10,
    emails: [
      {
        id: "s-1",
        sender: "Vercel",
        senderEmail: "notifications@vercel.com",
        subject: "Build failed: main branch",
        preview: "Build for commit a3f29c1 failed. Error: Module not found: @sideproject/utils. Check your imports.",
        time: "10:15 AM",
        unread: true,
      },
      {
        id: "s-2",
        sender: "Product Hunt",
        senderEmail: "crew@producthunt.com",
        subject: "Your launch is scheduled",
        preview: "Your product is scheduled for launch on May 5, 2026. Here is your pre-launch checklist.",
        time: "9:55 AM",
        unread: true,
      },
      {
        id: "s-3",
        sender: "Alex Kim",
        senderEmail: "alex@contributor.dev",
        subject: "PR: Add dark mode support",
        preview: "Hey, I submitted a PR adding dark mode support. Used CSS custom properties for the token system.",
        time: "9:10 AM",
        unread: true,
      },
      {
        id: "s-4",
        sender: "Cloudflare",
        senderEmail: "billing@cloudflare.com",
        subject: "May invoice ready",
        preview: "Your Cloudflare invoice for May 2026 is ready. Total: $12.47. Workers usage: 2.1M requests.",
        time: "8:30 AM",
        unread: false,
      },
      {
        id: "s-5",
        sender: "Beta User",
        senderEmail: "jamie@earlyuser.com",
        subject: "Bug report: search not working",
        preview: "Love the product so far! Found a bug: search returns empty results when using special characters.",
        time: "7:50 AM",
        unread: true,
      },
      {
        id: "s-6",
        sender: "Hacker News",
        senderEmail: "hn@ycombinator.com",
        subject: "Show HN comment notification",
        preview: "Someone commented on your Show HN post: 'This is really impressive for a solo project. How do you handle...'",
        time: "6:30 AM",
        unread: true,
      },
    ],
  },
];

const TOTAL_ACCOUNTS = ACCOUNTS.length;
const TOTAL_UNREAD = ACCOUNTS.reduce((sum, a) => sum + a.unreadCount, 0);

// ─── Helpers ────────────────────────────────────────────────────────────────

function filterEmails(emails: AccountEmail[], query: string): AccountEmail[] {
  if (!query.trim()) return emails;
  const lower = query.toLowerCase();
  return emails.filter(
    (e) =>
      e.sender.toLowerCase().includes(lower) ||
      e.subject.toLowerCase().includes(lower) ||
      e.preview.toLowerCase().includes(lower),
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function LayoutToggle({
  mode,
  onToggle,
}: {
  mode: LayoutMode;
  onToggle: (m: LayoutMode) => void;
}): React.ReactNode {
  return (
    <Box className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
      <Button
        variant={mode === "2-col" ? "primary" : "ghost"}
        size="sm"
        onClick={() => onToggle("2-col")}
      >
        <Text className="text-xs font-medium">2-Col</Text>
      </Button>
      <Button
        variant={mode === "3-col" ? "primary" : "ghost"}
        size="sm"
        onClick={() => onToggle("3-col")}
      >
        <Text className="text-xs font-medium">3-Col</Text>
      </Button>
    </Box>
  );
}

function AccountHeader({
  account,
}: {
  account: EmailAccount;
}): React.ReactNode {
  return (
    <Box className={`flex items-center justify-between px-3 py-2.5 ${account.headerBg} border-b ${account.headerBorder}`}>
      <Box className="flex items-center gap-2 min-w-0">
        <Box className={`w-2.5 h-2.5 rounded-full shrink-0 ${account.dotColor}`} />
        <Box className="min-w-0">
          <Text className="text-sm font-semibold text-content truncate">
            {account.label}
          </Text>
          <Text className="text-xs text-content-tertiary truncate">
            {account.email}
          </Text>
        </Box>
      </Box>
      <Box className="shrink-0">
        {account.unreadCount > 0 ? (
          <Box className={`px-2 py-0.5 rounded-full ${account.dotBg}`}>
            <Text className={`text-xs font-bold ${account.dotColor.replace("bg-", "text-")}`}>
              {account.unreadCount}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function EmailRow({
  email,
  isSelected,
  isDragging,
  onSelect,
  onDragStart,
  onDragEnd,
  variants,
}: {
  email: AccountEmail;
  isSelected: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  variants: Variants;
}): React.ReactNode {
  return (
    <motion.div
      variants={variants}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? "bg-blue-50 border-l-2 border-l-blue-500"
          : "hover:bg-gray-50 border-l-2 border-l-transparent"
      } ${isDragging ? "opacity-50" : "opacity-100"}`}
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      draggable
      whileHover={{ x: 2, transition: { duration: 0.15 } }}
    >
      <Box className="px-3 py-2.5">
        <Box className="flex items-center justify-between mb-0.5">
          <Box className="flex items-center gap-2 min-w-0">
            {email.unread ? (
              <Box className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            ) : (
              <Box className="w-2 h-2 shrink-0" />
            )}
            <Text
              className={`text-sm truncate ${
                email.unread ? "font-semibold text-content" : "font-normal text-content-secondary"
              }`}
            >
              {email.sender}
            </Text>
          </Box>
          <Text className="text-xs text-content-tertiary shrink-0 ml-2">
            {email.time}
          </Text>
        </Box>
        <Box className="pl-4">
          <Text
            className={`text-sm truncate ${
              email.unread ? "font-medium text-content" : "text-content-secondary"
            }`}
          >
            {email.subject}
          </Text>
          <Text className="text-xs text-content-tertiary truncate mt-0.5">
            {email.preview}
          </Text>
        </Box>
      </Box>
    </motion.div>
  );
}

function AccountColumn({
  account,
  selectedEmailId,
  draggingEmailId,
  searchQuery,
  onSearchChange,
  onSelectEmail,
  onDragStart,
  onDragEnd,
  variants,
  columnVariants,
}: {
  account: EmailAccount;
  selectedEmailId: string | null;
  draggingEmailId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectEmail: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  variants: Variants;
  columnVariants: Variants;
}): React.ReactNode {
  const filtered = useMemo(
    () => filterEmails(account.emails, searchQuery),
    [account.emails, searchQuery],
  );

  return (
    <motion.div variants={columnVariants} className="flex-1 min-w-0">
      <Card className="h-full overflow-hidden">
        <AccountHeader account={account} />
        <Box className="p-2 border-b border-gray-100">
          <Input
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            variant="ghost"
          />
        </Box>
        <CardContent className="p-0">
          <Box className="divide-y divide-gray-100">
            <AnimatePresence mode="popLayout">
              {filtered.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  isSelected={selectedEmailId === email.id}
                  isDragging={draggingEmailId === email.id}
                  onSelect={() => onSelectEmail(email.id)}
                  onDragStart={() => onDragStart(email.id)}
                  onDragEnd={onDragEnd}
                  variants={variants}
                />
              ))}
            </AnimatePresence>
            {filtered.length === 0 ? (
              <Box className="p-6 text-center">
                <Text className="text-sm text-content-tertiary">
                  No emails match your search
                </Text>
              </Box>
            ) : null}
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatsBar({
  variants,
}: {
  variants: Variants;
}): React.ReactNode {
  return (
    <motion.div variants={variants}>
      <Card>
        <CardContent>
          <Box className="flex items-center justify-between py-1">
            <Box className="flex items-center gap-6">
              <Box className="flex items-center gap-2">
                <Box className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Text className="text-sm font-bold text-blue-700">A</Text>
                </Box>
                <Box>
                  <Text className="text-lg font-bold text-content">
                    {TOTAL_ACCOUNTS}
                  </Text>
                  <Text className="text-xs text-content-tertiary">
                    accounts
                  </Text>
                </Box>
              </Box>
              <Box className="w-px h-8 bg-gray-200" />
              <Box className="flex items-center gap-2">
                <Box className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <Text className="text-sm font-bold text-red-700">U</Text>
                </Box>
                <Box>
                  <Text className="text-lg font-bold text-content">
                    {TOTAL_UNREAD}
                  </Text>
                  <Text className="text-xs text-content-tertiary">
                    unread total
                  </Text>
                </Box>
              </Box>
              <Box className="w-px h-8 bg-gray-200" />
              <Box className="flex items-center gap-2">
                <Box className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Text className="text-sm font-bold text-emerald-700">E</Text>
                </Box>
                <Box>
                  <Text className="text-lg font-bold text-content">
                    {ACCOUNTS.reduce((s, a) => s + a.emails.length, 0)}
                  </Text>
                  <Text className="text-xs text-content-tertiary">
                    emails visible
                  </Text>
                </Box>
              </Box>
            </Box>
            <Box className="flex items-center gap-2">
              {ACCOUNTS.map((a) => (
                <Box key={a.id} className="flex items-center gap-1">
                  <Box className={`w-2 h-2 rounded-full ${a.dotColor}`} />
                  <Text className="text-xs text-content-secondary">{a.label}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SelectedEmailPreview({
  email,
  account,
  variants,
}: {
  email: AccountEmail;
  account: EmailAccount;
  variants: Variants;
}): React.ReactNode {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <Card>
        <CardHeader>
          <Box className="flex items-center gap-2">
            <Box className={`w-2.5 h-2.5 rounded-full ${account.dotColor}`} />
            <Text className="text-sm font-semibold text-content">
              {account.label}
            </Text>
            <Text className="text-xs text-content-tertiary">
              {account.email}
            </Text>
          </Box>
        </CardHeader>
        <CardContent>
          <Box className="space-y-3">
            <Box className="flex items-center justify-between">
              <Box>
                <Text className="text-base font-semibold text-content">
                  {email.subject}
                </Text>
                <Text className="text-sm text-content-secondary mt-0.5">
                  {email.sender}
                </Text>
                <Text className="text-xs text-content-tertiary">
                  {email.senderEmail}
                </Text>
              </Box>
              <Text className="text-xs text-content-tertiary shrink-0">
                {email.time}
              </Text>
            </Box>
            <Box className="h-px bg-gray-100" />
            <Text className="text-sm text-content-secondary leading-relaxed">
              {email.preview}
            </Text>
            <Box className="flex items-center gap-2 pt-2">
              <Button variant="primary" size="sm">
                <Text className="text-xs">Reply</Text>
              </Button>
              <Button variant="ghost" size="sm">
                <Text className="text-xs">Forward</Text>
              </Button>
              <Button variant="ghost" size="sm">
                <Text className="text-xs">Archive</Text>
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SplitViewPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const itemVariants = withReducedMotion(fadeInUp, reduced);

  const [layout, setLayout] = useState<LayoutMode>("3-col");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [draggingEmailId, setDraggingEmailId] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({
    work: "",
    personal: "",
    "side-project": "",
  });

  const handleSearchChange = useCallback(
    (accountId: string, query: string): void => {
      setSearchQueries((prev) => ({ ...prev, [accountId]: query }));
    },
    [],
  );

  const handleSelectEmail = useCallback((emailId: string): void => {
    setSelectedEmailId((prev) => (prev === emailId ? null : emailId));
  }, []);

  const handleDragStart = useCallback((emailId: string): void => {
    setDraggingEmailId(emailId);
  }, []);

  const handleDragEnd = useCallback((): void => {
    setDraggingEmailId(null);
  }, []);

  const handleLayoutToggle = useCallback((mode: LayoutMode): void => {
    setLayout(mode);
  }, []);

  const selectedEmail = useMemo((): {
    email: AccountEmail;
    account: EmailAccount;
  } | null => {
    if (!selectedEmailId) return null;
    for (const account of ACCOUNTS) {
      const found = account.emails.find((e) => e.id === selectedEmailId);
      if (found) return { email: found, account };
    }
    return null;
  }, [selectedEmailId]);

  const visibleAccounts = layout === "2-col" ? ACCOUNTS.slice(0, 2) : ACCOUNTS;

  return (
    <PageLayout
      title="Split View"
      description="View all your accounts side by side."
    >
      {/* Header Controls */}
      <motion.div
        variants={itemVariants}
        initial="initial"
        animate="animate"
      >
        <Box className="flex items-center justify-between mb-6">
          <Box className="flex items-center gap-3">
            <Text className="text-sm text-content-secondary">
              {TOTAL_ACCOUNTS} accounts, {TOTAL_UNREAD} unread total
            </Text>
          </Box>
          <LayoutToggle mode={layout} onToggle={handleLayoutToggle} />
        </Box>
      </motion.div>

      {/* Account Columns */}
      <motion.div
        className={`grid gap-4 mb-6 ${
          layout === "2-col"
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        }`}
        variants={staggerSlow}
        initial="initial"
        animate="animate"
      >
        {visibleAccounts.map((account) => (
          <AccountColumn
            key={account.id}
            account={account}
            selectedEmailId={selectedEmailId}
            draggingEmailId={draggingEmailId}
            searchQuery={searchQueries[account.id] ?? ""}
            onSearchChange={(q) => handleSearchChange(account.id, q)}
            onSelectEmail={handleSelectEmail}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            variants={itemVariants}
            columnVariants={itemVariants}
          />
        ))}
      </motion.div>

      {/* Selected Email Preview */}
      <AnimatePresence mode="wait">
        {selectedEmail ? (
          <SelectedEmailPreview
            key={selectedEmail.email.id}
            email={selectedEmail.email}
            account={selectedEmail.account}
            variants={itemVariants}
          />
        ) : null}
      </AnimatePresence>

      {/* Stats Bar */}
      <motion.div
        className="mt-6"
        variants={itemVariants}
        initial="initial"
        animate="animate"
      >
        <StatsBar variants={itemVariants} />
      </motion.div>
    </PageLayout>
  );
}
