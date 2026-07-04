"use client";

import type { Route } from "next";
import type { JSX, ReactNode } from "react";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box, Text } from "@alecrae/ui";
import { AnimatedPage } from "../../components/AnimatedPage";
import { FocusModeOverlay, type FocusModeOverlayEmail } from "../../components/FocusModeOverlay";
import { FocusModeToggle } from "../../components/FocusModeToggle";
import { useFocusMode } from "../../lib/focus-mode";
import { useCommandPalette } from "../../lib/command-palette-store";
import { authApi } from "../../lib/api";
import { KeyboardShortcutHelp } from "../../components/KeyboardShortcutHelp";
import { CommandPalette } from "../../components/CommandPalette";
import { OfflineBadge } from "../../components/SyncStatusBar";
import { InstallPrompt } from "../../components/InstallPrompt";
import { PlanBadge } from "../../components/plan-gate";
import { WorkspaceSwitcher } from "../../components/WorkspaceSwitcher";
import type { PlanTier } from "../../lib/plan";

// ─── SVG icon path data (Heroicons outline 24px) ─────────────────────────────

const ICONS: Record<string, string> = {
  inbox: "M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z",
  compose: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
  sent: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
  drafts: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  snoozed: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  agent: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.698-1.382 2.698H4.18c-1.412 0-2.382-1.698-1.382-2.698L4.2 15.3",
  voice: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  translate: "M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802",
  achievements: "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0",
  hygiene: "M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  templates: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125v-.375c0-.621.504-1.125 1.125-1.125h.375m-1.5 0V4.875C2.25 4.254 2.754 3.75 3.375 3.75h.375m-1.5 0h1.5M6 18.375V9m0 9.375c0 .621.504 1.125 1.125 1.125h10.875M6 18.375c0 .621-.504 1.125-1.125 1.125M6 9h12m-12 0c0-.621.504-1.125 1.125-1.125h10.875c.621 0 1.125.504 1.125 1.125M6 9v9.375",
  contacts: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  tasks: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  files: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z",
  documents: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z",
  "smart-folders": "M3 7.5L7.5 3h13.125c.621 0 1.125.504 1.125 1.125v15.75c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 012.25 19.875V8.625c0-.621.504-1.125 1.125-1.125H3zm0 0L7.5 3M3 7.5h4.5",
  scripts: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
  automations: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  "auto-responder": "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3",
  "ab-tests": "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5",
  "mail-merge": "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  security: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  notifications: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  integrations: "M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z",
  analytics: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  chat: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  "shared-inboxes": "M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z",
  delegation: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  settings: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  billing: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
  developer: "M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z",
  workspace: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  admin: "M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z",
};

// ─── Nav data structures ──────────────────────────────────────────────────────

interface NavEntry {
  id: string;
  label: string;
  href: string;
  planBadge?: PlanTier;
}

interface NavSection {
  title?: string;
  entries: NavEntry[];
}

const BASE_SECTIONS: NavSection[] = [
  {
    title: "Mail",
    entries: [
      { id: "inbox", label: "Inbox", href: "/inbox" },
      { id: "compose", label: "Compose", href: "/compose" },
      { id: "sent", label: "Sent", href: "/sent" },
      { id: "drafts", label: "Drafts", href: "/drafts" },
      { id: "snoozed", label: "Snoozed", href: "/snoozed" },
    ],
  },
  {
    title: "AI Features",
    entries: [
      { id: "agent", label: "AI Agent", href: "/agent", planBadge: "pro" },
      { id: "ai-triage", label: "AI Triage", href: "/ai-triage", planBadge: "personal" },
      { id: "voice", label: "Voice", href: "/voice", planBadge: "personal" },
      { id: "translate", label: "Translation", href: "/translate", planBadge: "personal" },
      { id: "achievements", label: "Achievements", href: "/achievements" },
      { id: "hygiene", label: "Hygiene", href: "/hygiene", planBadge: "personal" },
    ],
  },
  {
    title: "Tools",
    entries: [
      { id: "templates", label: "Templates", href: "/templates" },
      { id: "contacts", label: "Contacts", href: "/contacts" },
      { id: "calendar", label: "Calendar", href: "/calendar" },
      { id: "tasks", label: "Tasks", href: "/tasks" },
      { id: "files", label: "Files", href: "/files", planBadge: "personal" },
      { id: "documents", label: "Documents", href: "/documents" },
      { id: "search", label: "Search", href: "/search" },
      { id: "smart-folders", label: "Smart Folders", href: "/smart-folders" },
      { id: "scripts", label: "Scripts", href: "/scripts" },
    ],
  },
  {
    title: "Automation",
    entries: [
      { id: "automations", label: "Automations", href: "/automations" },
      { id: "auto-responder", label: "Auto-Responder", href: "/auto-responder" },
      { id: "ab-tests", label: "A/B Testing", href: "/ab-tests", planBadge: "pro" },
      { id: "mail-merge", label: "Mail Merge", href: "/mail-merge", planBadge: "pro" },
    ],
  },
  {
    title: "Security & Compliance",
    entries: [
      { id: "security", label: "Security", href: "/security-center" },
      { id: "notifications", label: "Notifications", href: "/notifications" },
    ],
  },
  {
    title: "Integrations",
    entries: [
      { id: "integrations", label: "Integrations", href: "/integrations", planBadge: "pro" },
    ],
  },
  {
    title: "Insights",
    entries: [
      { id: "analytics", label: "Analytics", href: "/analytics" },
    ],
  },
  {
    title: "Team",
    entries: [
      { id: "chat", label: "Team Chat", href: "/chat", planBadge: "team" },
      { id: "shared-inboxes", label: "Shared Inboxes", href: "/shared-inboxes", planBadge: "team" },
      { id: "delegation", label: "Delegation", href: "/shared-inboxes", planBadge: "team" },
    ],
  },
];

const SETTINGS_ENTRIES: NavEntry[] = [
  { id: "settings", label: "Settings", href: "/settings" },
  { id: "billing", label: "Billing", href: "/billing" },
  { id: "developer", label: "Developer", href: "/settings/developer" },
];

const ADMIN_ENTRIES: NavEntry[] = [
  { id: "workspace", label: "Workspace", href: "/workspace" },
  { id: "admin", label: "Admin", href: "/admin" },
];

interface UserInfo {
  name: string;
  email: string;
  role: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<UserInfo>({ name: "User", email: "", role: "" });
  const hydrate = useFocusMode((s) => s.hydrate);
  const toggleFocusMode = useFocusMode((s) => s.toggleFocusMode);
  const openCommandPalette = useCommandPalette((s) => s.setOpen);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void toggleFocusMode();
      }
      // Toggle sidebar collapse/expand — guaranteed keyboard path back
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleFocusMode]);

  useEffect(() => {
    authApi
      .me()
      .then((res) => {
        setUser({ name: res.data.name, email: res.data.email, role: res.data.role });
      })
      .catch(() => {
        // Fallback to stored token info or defaults
      });
  }, []);

  const isAdmin = user.role === "owner" || user.role === "admin";

  const settingsEntries = isAdmin
    ? [...SETTINGS_ENTRIES, ...ADMIN_ENTRIES]
    : SETTINGS_ENTRIES;

  const initials =
    user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  const brand = (
    <Box className="space-y-2">
      <Box className={`flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
        {/* Wordmark hidden when collapsed so the toggle button stays visible */}
        {!collapsed && (
          <Box
            as="span"
            className="text-3xl leading-none text-content select-none"
            style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
          >
            AlecRae
          </Box>
        )}
        <Box
          as="button"
          className="flex-shrink-0 text-content-tertiary hover:text-content transition-colors"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar (⌘\\)" : "Collapse sidebar (⌘\\)"}
        >
          <Text as="span" variant="body-sm">
            {collapsed ? "❯" : "❮"}
          </Text>
        </Box>
      </Box>
      <WorkspaceSwitcher collapsed={collapsed} />
    </Box>
  );

  const handleLogout = (): void => {
    authApi.logout();
    window.location.href = "/login";
  };

  const footer = (
    <Box className="flex items-center gap-3">
      <Box className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
        <Text variant="caption" className="text-brand-700 font-semibold">
          {initials}
        </Text>
      </Box>
      {!collapsed && (
        <>
          <Box className="flex-1 min-w-0">
            <Box className="flex items-center gap-1.5 min-w-0">
              <Text variant="body-sm" className="truncate font-medium">
                {user.name}
              </Text>
              {(user.role === "owner" || user.role === "admin") && (
                <Text
                  as="span"
                  variant="caption"
                  className="px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 font-medium uppercase tracking-wide text-[10px] flex-shrink-0"
                >
                  {user.role}
                </Text>
              )}
            </Box>
            <Text variant="caption" className="truncate">
              {user.email}
            </Text>
          </Box>
          <Box
            as="button"
            className="text-content-tertiary hover:text-content transition-colors p-1"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            <Text as="span" variant="caption">
              Sign out
            </Text>
          </Box>
        </>
      )}
    </Box>
  );

  const focusModeEmails: FocusModeOverlayEmail[] = [];

  return (
    <Box className="flex h-full">
      <SidebarNav
        collapsed={collapsed}
        pathname={pathname}
        baseSections={BASE_SECTIONS}
        settingsEntries={settingsEntries}
        brand={brand}
        footer={footer}
        onNavigate={(href) => router.push(href as Route)}
      />
      <Box as="main" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <Box className="flex items-center justify-end gap-2 px-4 py-2 border-b border-border bg-surface-secondary/50">
          <OfflineBadge />
          <Box className="flex-1" />
          <Box
            as="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface text-content-secondary hover:text-content hover:border-border-strong transition-colors"
            onClick={() => openCommandPalette(true)}
            aria-label="Open command palette"
          >
            <Text as="span" variant="caption">
              Ask AlecRae
            </Text>
            <Text
              as="span"
              variant="caption"
              className="px-1.5 py-0.5 rounded bg-surface-tertiary text-content-tertiary font-mono text-[10px]"
            >
              ⌘K
            </Text>
          </Box>
          <FocusModeToggle />
        </Box>
        <AnimatedPage pageKey={pathname ?? "dashboard"} mode="slide" className="flex flex-col flex-1 min-h-0">
          {children}
        </AnimatedPage>
      </Box>
      <FocusModeOverlay emails={focusModeEmails} />

      {/* Keyboard shortcut help — toggle with ? */}
      <KeyboardShortcutHelp />

      {/* Command palette — Cmd+K */}
      <CommandPalette />

      {/* PWA install prompt */}
      <InstallPrompt />
    </Box>
  );
}

// ─── Sidebar with plan badges ─────────────────────────────────────────────────

interface SidebarNavProps {
  collapsed: boolean;
  pathname: string | null;
  baseSections: NavSection[];
  settingsEntries: NavEntry[];
  brand: ReactNode;
  footer: ReactNode;
  onNavigate: (href: string) => void;
}

function SidebarNav({
  collapsed,
  pathname,
  baseSections,
  settingsEntries,
  brand,
  footer,
  onNavigate,
}: SidebarNavProps): ReactNode {
  const settingsSection: NavSection = { entries: settingsEntries };
  const allSections: NavSection[] = [...baseSections, settingsSection];

  return (
    <nav
      aria-label="Main navigation"
      className="flex flex-col h-full bg-surface border-r border-border overflow-hidden flex-shrink-0"
      style={{
        width: collapsed ? 64 : 256,
        transition: "width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <div className="px-4 py-5 border-b border-border">
        {brand}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {allSections.map((section, si) => (
          <div key={si} className="px-2">
            {/* Group label */}
            {section.title && !collapsed && (
              <span className="block px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest opacity-50 text-content">
                {section.title}
              </span>
            )}
            {/* Spacer when collapsed */}
            {section.title && collapsed && <div className="h-2" />}
            <ul role="list" className="space-y-0.5">
              {section.entries.map((entry) => {
                const isActive =
                  pathname === entry.href ||
                  (pathname?.startsWith(entry.href + "/") ?? false);
                const iconPath = ICONS[entry.id] ?? ICONS.inbox;

                return (
                  <li key={entry.id}>
                    <a
                      href={entry.href}
                      className={[
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                        isActive
                          ? "bg-brand-50 text-brand-700 font-medium"
                          : "text-content-secondary hover:bg-surface-tertiary hover:text-content",
                        collapsed ? "justify-center" : "",
                      ].join(" ")}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(entry.href);
                      }}
                      title={collapsed ? entry.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {/* Icon */}
                      <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.75}
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                        </svg>
                      </span>

                      {/* Label + plan badge (hidden when collapsed) */}
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{entry.label}</span>
                          {entry.planBadge && (
                            <PlanBadge tier={entry.planBadge} />
                          )}
                        </>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="px-4 py-4 border-t border-border">
        {footer}
      </div>
    </nav>
  );
}
