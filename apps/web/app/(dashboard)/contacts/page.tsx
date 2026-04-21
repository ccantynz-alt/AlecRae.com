"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, Button, Input, PageLayout } from "@alecrae/ui";
import { AnimatePresence, motion } from "motion/react";
import { PressableScale } from "../../../components/PressableScale";
import {
  fadeInUp,
  SPRING_BOUNCY,
  useAlecRaeReducedMotion,
} from "../../../lib/animations";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Contact {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  company: string | null;
  notes: string | null;
  tags: string[];
  emailCount: number;
  lastContactedAt: string | null;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("alecrae_api_key") ?? "" : "";
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function ContactAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }): React.ReactNode {
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
  const colors = ["bg-brand-100 text-brand-700", "bg-green-100 text-green-700", "bg-purple-100 text-purple-700", "bg-orange-100 text-orange-700", "bg-pink-100 text-pink-700"];
  const colorIdx = name.charCodeAt(0) % colors.length;

  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name} className="w-10 h-10 rounded-full object-cover" />
    );
  }

  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${colors[colorIdx]}`}>
      {initials}
    </div>
  );
}

export default function ContactsPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchContacts = useCallback(async (query?: string) => {
    try {
      setLoading(true);
      setError(null);
      const path = query?.trim()
        ? `/v1/contacts/search?q=${encodeURIComponent(query)}&limit=50`
        : "/v1/contacts?limit=50";
      const res = await apiFetch<{ data: Contact[] }>(path);
      setContacts(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleSearch = (value: string): void => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchContacts(value);
    }, 300);
  };

  const selected = contacts.find((c) => c.id === selectedId);

  const handleSelectContact = (contact: Contact): void => {
    setSelectedId(contact.id);
    setEditNotes(contact.notes ?? "");
  };

  const handleSaveNotes = async (): Promise<void> => {
    if (!selectedId) return;
    setSavingNotes(true);
    try {
      await apiFetch(`/v1/contacts/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: editNotes }),
      });
      setContacts((prev) =>
        prev.map((c) => c.id === selectedId ? { ...c, notes: editNotes } : c),
      );
    } catch {
      // Silently fail — notes are local-first
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <PageLayout title="Contacts" fullWidth>
      <Box className="flex flex-1 h-full">
        <Box className="w-96 border-r border-border overflow-y-auto flex-shrink-0">
          <Box className="p-3 border-b border-border">
            <Input
              variant="search"
              placeholder="Search contacts..."
              inputSize="sm"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
            />
          </Box>
          <Box className="px-4 py-2 border-b border-border bg-surface-secondary">
            <Text variant="body-sm" muted>
              {loading ? "Loading..." : `${contacts.length} contacts`}
            </Text>
          </Box>

          {loading ? (
            <Box className="p-8 text-center">
              <Text variant="body-sm" muted>Loading contacts...</Text>
            </Box>
          ) : error ? (
            <Box className="p-6 text-center">
              <Text variant="body-sm" muted>{error}</Text>
              <PressableScale as="button" tapScale={0.95} className="mt-3">
                <Button variant="secondary" size="sm" onClick={() => fetchContacts()}>Retry</Button>
              </PressableScale>
            </Box>
          ) : contacts.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center p-8"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
            >
              <Text variant="body-md" muted>
                {search ? "No contacts found" : "No contacts yet"}
              </Text>
              <Text variant="body-sm" muted className="mt-1">
                Contacts are automatically created from your email activity
              </Text>
            </motion.div>
          ) : (
            <motion.div
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
            >
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleSelectContact(contact)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-border transition-colors ${
                    selectedId === contact.id
                      ? "bg-brand-50 border-l-2 border-l-brand-500"
                      : "hover:bg-surface-secondary"
                  }`}
                >
                  <ContactAvatar name={contact.name} avatarUrl={contact.avatarUrl} />
                  <Box className="flex-1 min-w-0">
                    <Text variant="body-sm" className="font-medium text-content truncate">
                      {contact.name}
                    </Text>
                    <Text variant="caption" muted className="truncate">
                      {contact.email}
                    </Text>
                  </Box>
                  {contact.emailCount > 0 && (
                    <Text variant="caption" muted className="flex-shrink-0">
                      {contact.emailCount} emails
                    </Text>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </Box>

        <Box className="flex-1 min-w-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.id}
                className="p-8 max-w-2xl"
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING_BOUNCY}
              >
                <Box className="flex items-center gap-4 mb-6">
                  <ContactAvatar name={selected.name} avatarUrl={selected.avatarUrl} />
                  <Box>
                    <Text variant="heading-lg" className="text-content">
                      {selected.name}
                    </Text>
                    <Text variant="body-sm" muted>{selected.email}</Text>
                    {selected.company && (
                      <Text variant="caption" muted className="mt-0.5">{selected.company}</Text>
                    )}
                  </Box>
                </Box>

                <Box className="grid grid-cols-3 gap-4 mb-6">
                  <Box className="p-4 rounded-lg bg-surface-secondary border border-border text-center">
                    <Text variant="heading-md" className="text-brand-600">{selected.emailCount}</Text>
                    <Text variant="caption" muted>Emails</Text>
                  </Box>
                  <Box className="p-4 rounded-lg bg-surface-secondary border border-border text-center">
                    <Text variant="heading-md" className="text-content">
                      {selected.lastContactedAt ? new Date(selected.lastContactedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-"}
                    </Text>
                    <Text variant="caption" muted>Last contact</Text>
                  </Box>
                  <Box className="p-4 rounded-lg bg-surface-secondary border border-border text-center">
                    <Text variant="heading-md" className="text-content">{selected.tags.length}</Text>
                    <Text variant="caption" muted>Tags</Text>
                  </Box>
                </Box>

                {selected.tags.length > 0 && (
                  <Box className="flex flex-wrap gap-1.5 mb-4">
                    {selected.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700">
                        {tag}
                      </span>
                    ))}
                  </Box>
                )}

                <Box className="mb-6">
                  <Text variant="body-sm" className="font-medium text-content mb-2">Notes</Text>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Add notes about this contact..."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-body-md text-content placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  />
                  <Box className="flex justify-end mt-2">
                    <PressableScale as="button" tapScale={0.95}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleSaveNotes()}
                        disabled={savingNotes}
                      >
                        {savingNotes ? "Saving..." : "Save notes"}
                      </Button>
                    </PressableScale>
                  </Box>
                </Box>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                className="flex items-center justify-center h-full"
                variants={fadeInUp}
                initial="initial"
                animate="animate"
              >
                <Text variant="body-md" muted>Select a contact to view details</Text>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>
      </Box>
    </PageLayout>
  );
}
