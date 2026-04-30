"use client";

import { useState, useMemo } from "react";
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
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  staggerSlow,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
  SPRING_BOUNCY,
} from "../../../lib/animations";

// ─── Types ──────────────────────────────────────────────────────────────────

type LinkCategory =
  | "all"
  | "articles"
  | "documents"
  | "images"
  | "videos"
  | "bookmarked";

type ViewMode = "grid" | "list";

interface SavedLink {
  id: string;
  title: string;
  url: string;
  domain: string;
  faviconLetter: string;
  faviconColor: string;
  preview: string;
  sourceEmail: string;
  senderName: string;
  category: LinkCategory;
  date: string;
  bookmarked: boolean;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_LINKS: SavedLink[] = [
  {
    id: "lnk-001",
    title: "Building AI-Native Applications with Edge Computing",
    url: "https://blog.cloudflare.com/ai-native-edge-apps",
    domain: "blog.cloudflare.com",
    faviconLetter: "C",
    faviconColor: "bg-orange-500",
    preview: "A deep dive into deploying machine learning models at the edge for sub-50ms inference...",
    sourceEmail: "Weekly DevOps Digest",
    senderName: "DevOps Weekly",
    category: "articles",
    date: "2026-04-29",
    bookmarked: true,
  },
  {
    id: "lnk-002",
    title: "Q1 2026 Product Roadmap",
    url: "https://docs.google.com/document/d/1abc-roadmap",
    domain: "docs.google.com",
    faviconLetter: "G",
    faviconColor: "bg-blue-500",
    preview: "Strategic product roadmap covering new feature launches, market expansion targets...",
    sourceEmail: "Re: Product Planning Meeting",
    senderName: "Craig Murray",
    category: "documents",
    date: "2026-04-28",
    bookmarked: true,
  },
  {
    id: "lnk-003",
    title: "Fix: Thread view scroll position reset on new message",
    url: "https://github.com/alecrae/alecrae.com/pull/247",
    domain: "github.com",
    faviconLetter: "G",
    faviconColor: "bg-gray-800",
    preview: "Fixes the scroll position jump when new messages arrive in an active thread view...",
    sourceEmail: "PR Review Request",
    senderName: "Sarah Chen",
    category: "articles",
    date: "2026-04-27",
    bookmarked: false,
  },
  {
    id: "lnk-004",
    title: "Dashboard Redesign Mockups v3",
    url: "https://figma.com/file/xyz-dashboard-v3",
    domain: "figma.com",
    faviconLetter: "F",
    faviconColor: "bg-purple-500",
    preview: "Updated high-fidelity mockups for the analytics dashboard including heatmap and charts...",
    sourceEmail: "Design Review: Dashboard",
    senderName: "Amy Zhang",
    category: "images",
    date: "2026-04-26",
    bookmarked: true,
  },
  {
    id: "lnk-005",
    title: "How Superhuman Lost Its Edge",
    url: "https://techcrunch.com/superhuman-analysis-2026",
    domain: "techcrunch.com",
    faviconLetter: "T",
    faviconColor: "bg-green-600",
    preview: "An analysis of how the premium email client failed to innovate beyond keyboard shortcuts...",
    sourceEmail: "Competitor Intelligence",
    senderName: "James Wilson",
    category: "articles",
    date: "2026-04-25",
    bookmarked: true,
  },
  {
    id: "lnk-006",
    title: "AlecRae Launch Demo Recording",
    url: "https://youtube.com/watch?v=alecrae-demo-2026",
    domain: "youtube.com",
    faviconLetter: "Y",
    faviconColor: "bg-red-600",
    preview: "Full walkthrough of the AlecRae email client showing AI compose, voice profile, and triage...",
    sourceEmail: "Demo Day Materials",
    senderName: "Craig Murray",
    category: "videos",
    date: "2026-04-24",
    bookmarked: false,
  },
  {
    id: "lnk-007",
    title: "Neon Serverless Postgres: Branching for CI/CD",
    url: "https://neon.tech/blog/branching-ci-cd",
    domain: "neon.tech",
    faviconLetter: "N",
    faviconColor: "bg-emerald-500",
    preview: "How to use Neon database branches for preview deployments and zero-downtime migrations...",
    sourceEmail: "Infrastructure Updates",
    senderName: "DevOps Bot",
    category: "articles",
    date: "2026-04-23",
    bookmarked: false,
  },
  {
    id: "lnk-008",
    title: "Contract Amendment - Consulting Agreement",
    url: "https://docs.google.com/document/d/contract-amendment-v2",
    domain: "docs.google.com",
    faviconLetter: "G",
    faviconColor: "bg-blue-500",
    preview: "Updated consulting agreement with revised payment terms and scope of work definitions...",
    sourceEmail: "Signed Contract Amendment",
    senderName: "Legal Team",
    category: "documents",
    date: "2026-04-22",
    bookmarked: false,
  },
  {
    id: "lnk-009",
    title: "Brand Asset Package - Final Exports",
    url: "https://figma.com/file/brand-assets-final",
    domain: "figma.com",
    faviconLetter: "F",
    faviconColor: "bg-purple-500",
    preview: "Final logo variations, icon set, typography guide, and color palette for launch materials...",
    sourceEmail: "Brand Assets Ready",
    senderName: "Amy Zhang",
    category: "images",
    date: "2026-04-21",
    bookmarked: true,
  },
  {
    id: "lnk-010",
    title: "WebGPU Inference Benchmarks 2026",
    url: "https://arxiv.org/abs/2026-webgpu-inference",
    domain: "arxiv.org",
    faviconLetter: "A",
    faviconColor: "bg-red-700",
    preview: "Benchmarking LLM inference on consumer GPUs via WebGPU, comparing WASM vs native backends...",
    sourceEmail: "Research Digest",
    senderName: "AI Research Bot",
    category: "articles",
    date: "2026-04-20",
    bookmarked: true,
  },
  {
    id: "lnk-011",
    title: "Sprint Retrospective Notes - April",
    url: "https://docs.google.com/document/d/retro-april-2026",
    domain: "docs.google.com",
    faviconLetter: "G",
    faviconColor: "bg-blue-500",
    preview: "Key takeaways from April sprint including velocity improvements and blockers resolved...",
    sourceEmail: "Sprint Retro Follow-up",
    senderName: "Sarah Chen",
    category: "documents",
    date: "2026-04-19",
    bookmarked: false,
  },
  {
    id: "lnk-012",
    title: "Drizzle ORM Advanced Patterns for Edge Deployments",
    url: "https://github.com/drizzle-team/drizzle-orm/discussions/1842",
    domain: "github.com",
    faviconLetter: "G",
    faviconColor: "bg-gray-800",
    preview: "Discussion on optimal query patterns for Drizzle ORM when targeting Cloudflare Workers...",
    sourceEmail: "Re: ORM Performance Issues",
    senderName: "Tomasz Kowalski",
    category: "articles",
    date: "2026-04-18",
    bookmarked: false,
  },
  {
    id: "lnk-013",
    title: "Product Launch Countdown Timer Design",
    url: "https://youtube.com/watch?v=countdown-timer-tutorial",
    domain: "youtube.com",
    faviconLetter: "Y",
    faviconColor: "bg-red-600",
    preview: "Tutorial on building animated countdown timers with Framer Motion spring physics...",
    sourceEmail: "Design Inspiration",
    senderName: "Mike Reynolds",
    category: "videos",
    date: "2026-04-17",
    bookmarked: false,
  },
  {
    id: "lnk-014",
    title: "SOC 2 Compliance Checklist PDF",
    url: "https://example.com/soc2-checklist-2026.pdf",
    domain: "example.com",
    faviconLetter: "E",
    faviconColor: "bg-gray-500",
    preview: "Complete checklist for achieving SOC 2 Type I certification with timeline estimates...",
    sourceEmail: "Compliance Requirements",
    senderName: "Legal Team",
    category: "documents",
    date: "2026-04-16",
    bookmarked: true,
  },
  {
    id: "lnk-015",
    title: "Mobile App UI Screens - React Native Expo",
    url: "https://figma.com/file/mobile-screens-rn",
    domain: "figma.com",
    faviconLetter: "F",
    faviconColor: "bg-purple-500",
    preview: "All mobile app screens exported from Figma for React Native implementation reference...",
    sourceEmail: "Mobile Design Handoff",
    senderName: "Amy Zhang",
    category: "images",
    date: "2026-04-15",
    bookmarked: false,
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Filter Config ──────────────────────────────────────────────────────────

const FILTER_OPTIONS: { value: LinkCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "articles", label: "Articles" },
  { value: "documents", label: "Documents" },
  { value: "images", label: "Images" },
  { value: "videos", label: "Videos" },
  { value: "bookmarked", label: "Bookmarked" },
];

// ─── Sub-Components ─────────────────────────────────────────────────────────

function FaviconCircle({
  letter,
  color,
}: {
  letter: string;
  color: string;
}): React.ReactNode {
  return (
    <Box
      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${color}`}
    >
      <Text className="text-sm font-bold text-white">{letter}</Text>
    </Box>
  );
}

function LinkGridCard({
  link,
  variants,
  onToggleBookmark,
}: {
  link: SavedLink;
  variants: Variants;
  onToggleBookmark: (id: string) => void;
}): React.ReactNode {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      variants={variants}
      onMouseEnter={(): void => setHovered(true)}
      onMouseLeave={(): void => setHovered(false)}
    >
      <Card
        className={`transition-shadow duration-200 cursor-pointer h-full ${
          hovered ? "shadow-lg ring-1 ring-border" : "shadow-sm"
        }`}
      >
        <CardHeader className="pb-2">
          <Box className="flex items-start gap-3">
            <FaviconCircle letter={link.faviconLetter} color={link.faviconColor} />
            <Box className="flex-1 min-w-0">
              <Text
                className="text-sm font-medium text-content line-clamp-2"
                title={link.title}
              >
                {link.title}
              </Text>
              <Text className="text-xs text-content-tertiary mt-0.5">
                {link.domain}
              </Text>
            </Box>
            <Button
              variant="ghost"
              size="sm"
              onClick={(): void => onToggleBookmark(link.id)}
            >
              <Text className={`text-sm ${link.bookmarked ? "text-amber-500" : "text-content-tertiary"}`}>
                {link.bookmarked ? "★" : "☆"}
              </Text>
            </Button>
          </Box>
        </CardHeader>
        <CardContent className="py-2">
          <Text className="text-xs text-content-secondary line-clamp-2 mb-3">
            {link.preview}
          </Text>
          <Box className="flex items-center gap-1.5 mb-1">
            <Text className="text-xs text-content-tertiary">From:</Text>
            <Text className="text-xs text-content-secondary font-medium truncate">
              {link.sourceEmail}
            </Text>
          </Box>
          <Box className="flex items-center gap-1.5 mb-3">
            <Text className="text-xs text-content-tertiary">Sent by:</Text>
            <Text className="text-xs text-content-secondary truncate">
              {link.senderName}
            </Text>
          </Box>
          <Box className="flex items-center justify-between">
            <Text className="text-xs text-content-tertiary">
              {formatDate(link.date)}
            </Text>
            <Box
              className={`flex gap-1 transition-opacity duration-150 ${
                hovered ? "opacity-100" : "opacity-0"
              }`}
            >
              <Button variant="ghost" size="sm">
                <Text className="text-xs">Open</Text>
              </Button>
              <Button variant="ghost" size="sm">
                <Text className="text-xs">Copy</Text>
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function LinkListRow({
  link,
  variants,
  onToggleBookmark,
}: {
  link: SavedLink;
  variants: Variants;
  onToggleBookmark: (id: string) => void;
}): React.ReactNode {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      variants={variants}
      onMouseEnter={(): void => setHovered(true)}
      onMouseLeave={(): void => setHovered(false)}
    >
      <Card
        className={`transition-shadow duration-200 cursor-pointer ${
          hovered ? "shadow-md ring-1 ring-border" : "shadow-sm"
        }`}
      >
        <CardContent className="py-3">
          <Box className="flex items-center gap-4">
            <FaviconCircle letter={link.faviconLetter} color={link.faviconColor} />
            <Box className="flex-1 min-w-0">
              <Box className="flex items-center gap-2">
                <Text className="text-sm font-medium text-content truncate">
                  {link.title}
                </Text>
                <Text className="text-xs text-content-tertiary flex-shrink-0">
                  {link.domain}
                </Text>
              </Box>
              <Text className="text-xs text-content-secondary mt-0.5 truncate">
                {link.preview}
              </Text>
              <Box className="flex items-center gap-3 mt-1">
                <Text className="text-xs text-content-tertiary">
                  {link.senderName}
                </Text>
                <Text className="text-xs text-content-tertiary">
                  {formatDate(link.date)}
                </Text>
              </Box>
            </Box>
            <Box className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={(): void => onToggleBookmark(link.id)}
              >
                <Text className={`text-sm ${link.bookmarked ? "text-amber-500" : "text-content-tertiary"}`}>
                  {link.bookmarked ? "★" : "☆"}
                </Text>
              </Button>
              <Box
                className={`flex gap-1 transition-opacity duration-150 ${
                  hovered ? "opacity-100" : "opacity-0"
                }`}
              >
                <Button variant="ghost" size="sm">
                  <Text className="text-xs">Open</Text>
                </Button>
                <Button variant="ghost" size="sm">
                  <Text className="text-xs">Copy</Text>
                </Button>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function LinksPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const itemVariants = withReducedMotion(fadeInUp, reduced);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<LinkCategory>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [bookmarks, setBookmarks] = useState<Set<string>>(
    () => new Set(MOCK_LINKS.filter((l) => l.bookmarked).map((l) => l.id)),
  );

  const handleToggleBookmark = (id: string): void => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const linksWithBookmarkState = useMemo((): SavedLink[] => {
    return MOCK_LINKS.map((link) => ({
      ...link,
      bookmarked: bookmarks.has(link.id),
    }));
  }, [bookmarks]);

  const filtered = useMemo((): SavedLink[] => {
    let result = linksWithBookmarkState;

    if (activeFilter === "bookmarked") {
      result = result.filter((l) => l.bookmarked);
    } else if (activeFilter !== "all") {
      result = result.filter((l) => l.category === activeFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.domain.toLowerCase().includes(q) ||
          l.senderName.toLowerCase().includes(q) ||
          l.sourceEmail.toLowerCase().includes(q) ||
          l.preview.toLowerCase().includes(q),
      );
    }

    return result;
  }, [search, activeFilter, linksWithBookmarkState]);

  const bookmarkedCount = linksWithBookmarkState.filter((l) => l.bookmarked).length;

  return (
    <PageLayout
      title="Link Library"
      description="Every link from every email, organized and searchable."
    >
      {/* Search + View Toggle */}
      <motion.div variants={itemVariants} initial="initial" animate="animate">
        <Box className="flex flex-col sm:flex-row gap-3 mb-6">
          <Box className="flex-1">
            <Input
              placeholder="Search links by title, domain, sender..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                setSearch(e.target.value)
              }
            />
          </Box>
          <Box className="flex items-center gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={(): void => setViewMode("grid")}
            >
              <Text className="text-xs font-medium">Grid</Text>
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={(): void => setViewMode("list")}
            >
              <Text className="text-xs font-medium">List</Text>
            </Button>
          </Box>
        </Box>
      </motion.div>

      {/* Filter Tabs */}
      <motion.div variants={itemVariants} initial="initial" animate="animate">
        <Box className="flex flex-wrap gap-2 mb-6">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={activeFilter === opt.value ? "default" : "ghost"}
              size="sm"
              onClick={(): void => setActiveFilter(opt.value)}
            >
              <Text className="text-xs font-medium">{opt.label}</Text>
            </Button>
          ))}
        </Box>
      </motion.div>

      {/* Stats Banner */}
      <motion.div variants={itemVariants} initial="initial" animate="animate">
        <Card className="mb-6">
          <CardContent>
            <Box className="flex items-center gap-6 py-2">
              <Box>
                <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                  Links Saved
                </Text>
                <Text className="text-2xl font-bold text-content">234</Text>
              </Box>
              <Box className="w-px h-10 bg-border" />
              <Box>
                <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                  Bookmarked
                </Text>
                <Text className="text-2xl font-bold text-amber-500">
                  {bookmarkedCount}
                </Text>
              </Box>
              <Box className="w-px h-10 bg-border hidden sm:block" />
              <Box className="hidden sm:block">
                <Text className="text-xs text-content-tertiary uppercase tracking-wider font-medium">
                  Showing
                </Text>
                <Text className="text-2xl font-bold text-content">
                  {filtered.length}
                </Text>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </motion.div>

      {/* Link Grid / List */}
      <AnimatePresence mode="wait">
        {filtered.length > 0 ? (
          <motion.div
            key={`${viewMode}-${activeFilter}-${search}`}
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                : "flex flex-col gap-3"
            }
            variants={staggerSlow}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {filtered.map((link) =>
              viewMode === "grid" ? (
                <LinkGridCard
                  key={link.id}
                  link={link}
                  variants={itemVariants}
                  onToggleBookmark={handleToggleBookmark}
                />
              ) : (
                <LinkListRow
                  key={link.id}
                  link={link}
                  variants={itemVariants}
                  onToggleBookmark={handleToggleBookmark}
                />
              ),
            )}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            variants={itemVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Box className="flex flex-col items-center justify-center py-24">
              <Box className="w-16 h-16 rounded-full bg-surface-secondary flex items-center justify-center mb-4">
                <Text className="text-2xl text-content-tertiary">{"🔗"}</Text>
              </Box>
              <Text className="text-lg font-medium text-content-secondary mb-1">
                No links found
              </Text>
              <Text className="text-sm text-content-tertiary">
                Try adjusting your search or filters.
              </Text>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
}
