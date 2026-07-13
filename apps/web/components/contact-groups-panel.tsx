"use client";

/**
 * Contact Groups / Distribution Lists panel for the Contacts page.
 *
 * Self-contained: lists groups, creates/renames/deletes them, and manages
 * members (add from the current contact list, remove individually). Wired to
 * lib/api-contact-groups.ts (all 7 /v1/contact-groups endpoints).
 *
 * Contact groups are a free-tier feature — no PlanGate.
 */

import { useCallback, useEffect, useState } from "react";
import { Box, Text, Button, Input } from "@alecrae/ui";
import {
  contactGroupsApi,
  type ContactGroup,
  type ContactGroupDetail,
} from "../lib/api-contact-groups";

/** Minimal contact shape needed by the group member picker. */
export interface GroupPickerContact {
  id: string;
  name: string;
  email: string;
}

interface ContactGroupsPanelProps {
  /** All loaded contacts, used as the source for the "add member" picker. */
  contacts: GroupPickerContact[];
}

const GROUP_COLORS: readonly string[] = [
  "bg-brand-100 text-brand-700",
  "bg-green-100 text-green-700",
  "bg-purple-100 text-purple-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
];

function groupSwatch(group: ContactGroup): string {
  if (group.color) return "";
  const idx = group.name.charCodeAt(0) % GROUP_COLORS.length;
  return GROUP_COLORS[idx] ?? GROUP_COLORS[0] ?? "";
}

export function ContactGroupsPanel({
  contacts,
}: ContactGroupsPanelProps): React.ReactNode {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Selected group detail
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactGroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Rename
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  // Membership actions
  const [addContactId, setAddContactId] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadGroups = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const res = await contactGroupsApi.list({ limit: 100 });
      setGroups(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const loadDetail = useCallback(async (id: string): Promise<void> => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      setActionError(null);
      const res = await contactGroupsApi.get(id);
      setDetail(res.data);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : "Failed to load group",
      );
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleSelect = useCallback(
    (id: string): void => {
      setSelectedId(id);
      setRenaming(false);
      setAddContactId("");
      void loadDetail(id);
    },
    [loadDetail],
  );

  const handleCreate = useCallback(async (): Promise<void> => {
    const name = newName.trim();
    if (!name) return;
    try {
      setCreating(true);
      setError(null);
      const res = await contactGroupsApi.create({ name });
      setGroups((prev) => [res.data, ...prev]);
      setNewName("");
      handleSelect(res.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  }, [newName, handleSelect]);

  const handleRename = useCallback(async (): Promise<void> => {
    if (!detail) return;
    const name = renameValue.trim();
    if (!name || name === detail.name) {
      setRenaming(false);
      return;
    }
    try {
      setSavingRename(true);
      setActionError(null);
      const res = await contactGroupsApi.update(detail.id, { name });
      setGroups((prev) =>
        prev.map((g) => (g.id === detail.id ? { ...g, name: res.data.name } : g)),
      );
      setDetail((prev) => (prev ? { ...prev, name: res.data.name } : prev));
      setRenaming(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to rename group",
      );
    } finally {
      setSavingRename(false);
    }
  }, [detail, renameValue]);

  const handleDeleteGroup = useCallback(async (): Promise<void> => {
    if (!detail) return;
    try {
      setDeletingGroup(true);
      setActionError(null);
      await contactGroupsApi.remove(detail.id);
      setGroups((prev) => prev.filter((g) => g.id !== detail.id));
      setSelectedId(null);
      setDetail(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete group",
      );
    } finally {
      setDeletingGroup(false);
    }
  }, [detail]);

  const handleAddMember = useCallback(async (): Promise<void> => {
    if (!detail || !addContactId) return;
    try {
      setAddingMember(true);
      setActionError(null);
      await contactGroupsApi.addMembers(detail.id, [addContactId]);
      await loadDetail(detail.id);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === detail.id ? { ...g, memberCount: g.memberCount + 1 } : g,
        ),
      );
      setAddContactId("");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to add member",
      );
    } finally {
      setAddingMember(false);
    }
  }, [detail, addContactId, loadDetail]);

  const handleRemoveMember = useCallback(
    async (contactId: string): Promise<void> => {
      if (!detail) return;
      try {
        setBusyMemberId(contactId);
        setActionError(null);
        await contactGroupsApi.removeMember(detail.id, contactId);
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                members: prev.members.filter((m) => m.contactId !== contactId),
                memberCount: Math.max(0, prev.memberCount - 1),
              }
            : prev,
        );
        setGroups((prev) =>
          prev.map((g) =>
            g.id === detail.id
              ? { ...g, memberCount: Math.max(0, g.memberCount - 1) }
              : g,
          ),
        );
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to remove member",
        );
      } finally {
        setBusyMemberId(null);
      }
    },
    [detail],
  );

  // Contacts not already in the selected group, for the picker.
  const memberIds = new Set(detail?.members.map((m) => m.contactId) ?? []);
  const addableContacts = contacts.filter((c) => !memberIds.has(c.id));

  return (
    <Box className="flex flex-col gap-4">
      {/* Create group */}
      <Box className="flex items-end gap-2">
        <Box className="flex-1">
          <label htmlFor="new-group-name" className="sr-only">
            New group name
          </label>
          <Input
            id="new-group-name"
            inputSize="sm"
            placeholder="New group name..."
            value={newName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setNewName(e.target.value)
            }
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
        </Box>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleCreate()}
          disabled={creating || !newName.trim()}
        >
          {creating ? "Creating..." : "Create group"}
        </Button>
      </Box>

      {error && (
        <Text variant="body-sm" className="text-red-600">
          {error}
        </Text>
      )}

      {/* Group list */}
      {loading ? (
        <Text variant="body-sm" muted>
          Loading groups...
        </Text>
      ) : groups.length === 0 ? (
        <Box className="p-6 text-center rounded-lg border border-border bg-surface-secondary">
          <Text variant="body-sm" muted>
            No groups yet
          </Text>
          <Text variant="caption" muted className="mt-1">
            Create a distribution list to organize contacts and email them
            together
          </Text>
        </Box>
      ) : (
        <Box className="flex flex-col gap-1.5">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => handleSelect(group.id)}
              aria-pressed={selectedId === group.id}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                selectedId === group.id
                  ? "border-brand-500 bg-brand-50"
                  : "border-border hover:bg-surface-secondary"
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${groupSwatch(group)}`}
                style={group.color ? { backgroundColor: group.color } : undefined}
              >
                {group.name.charAt(0).toUpperCase() || "?"}
              </span>
              <Box className="flex-1 min-w-0">
                <Text
                  variant="body-sm"
                  className="font-medium text-content truncate"
                >
                  {group.name}
                </Text>
                {group.description && (
                  <Text variant="caption" muted className="truncate">
                    {group.description}
                  </Text>
                )}
              </Box>
              <Text variant="caption" muted className="flex-shrink-0">
                {group.memberCount}{" "}
                {group.memberCount === 1 ? "member" : "members"}
              </Text>
            </button>
          ))}
        </Box>
      )}

      {/* Selected group detail */}
      {selectedId && (
        <Box className="rounded-lg border border-border bg-surface p-4">
          {detailLoading ? (
            <Text variant="body-sm" muted>
              Loading group...
            </Text>
          ) : detailError ? (
            <Box className="text-center">
              <Text variant="body-sm" className="text-red-600">
                {detailError}
              </Text>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => void loadDetail(selectedId)}
              >
                Retry
              </Button>
            </Box>
          ) : detail ? (
            <Box className="flex flex-col gap-4">
              {/* Header: name + rename/delete */}
              <Box className="flex items-start justify-between gap-3">
                {renaming ? (
                  <Box className="flex-1 flex items-end gap-2">
                    <Box className="flex-1">
                      <label htmlFor="rename-group" className="sr-only">
                        Group name
                      </label>
                      <Input
                        id="rename-group"
                        inputSize="sm"
                        value={renameValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setRenameValue(e.target.value)
                        }
                        onKeyDown={(
                          e: React.KeyboardEvent<HTMLInputElement>,
                        ) => {
                          if (e.key === "Enter") void handleRename();
                          if (e.key === "Escape") setRenaming(false);
                        }}
                      />
                    </Box>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleRename()}
                      disabled={savingRename}
                    >
                      {savingRename ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRenaming(false)}
                    >
                      Cancel
                    </Button>
                  </Box>
                ) : (
                  <>
                    <Box className="min-w-0">
                      <Text
                        variant="heading-sm"
                        className="text-content truncate"
                      >
                        {detail.name}
                      </Text>
                      <Text variant="caption" muted>
                        {detail.memberCount}{" "}
                        {detail.memberCount === 1 ? "member" : "members"}
                      </Text>
                    </Box>
                    <Box className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setRenameValue(detail.name);
                          setRenaming(true);
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteGroup()}
                        disabled={deletingGroup}
                      >
                        {deletingGroup ? "Deleting..." : "Delete"}
                      </Button>
                    </Box>
                  </>
                )}
              </Box>

              {actionError && (
                <Text variant="body-sm" className="text-red-600">
                  {actionError}
                </Text>
              )}

              {/* Add member */}
              <Box className="flex items-end gap-2">
                <Box className="flex-1">
                  <label htmlFor="add-member" className="sr-only">
                    Add contact to group
                  </label>
                  <Box
                    as="select"
                    id="add-member"
                    value={addContactId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setAddContactId(e.target.value)
                    }
                    disabled={addableContacts.length === 0}
                    className="h-9 w-full px-3 rounded-lg border border-border bg-surface text-content text-sm disabled:opacity-50"
                  >
                    <option value="">
                      {addableContacts.length === 0
                        ? "All contacts already added"
                        : "Select a contact to add..."}
                    </option>
                    {addableContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.email})
                      </option>
                    ))}
                  </Box>
                </Box>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleAddMember()}
                  disabled={addingMember || !addContactId}
                >
                  {addingMember ? "Adding..." : "Add"}
                </Button>
              </Box>

              {/* Members list */}
              {detail.members.length === 0 ? (
                <Text variant="body-sm" muted>
                  No members yet. Add contacts above.
                </Text>
              ) : (
                <Box className="flex flex-col gap-1">
                  {detail.members.map((m) => (
                    <Box
                      key={m.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border"
                    >
                      <Box className="flex-1 min-w-0">
                        <Text
                          variant="body-sm"
                          className="font-medium text-content truncate"
                        >
                          {m.name ?? "(unknown contact)"}
                        </Text>
                        {m.email && (
                          <Text variant="caption" muted className="truncate">
                            {m.email}
                          </Text>
                        )}
                      </Box>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRemoveMember(m.contactId)}
                        disabled={busyMemberId === m.contactId}
                        aria-label={`Remove ${m.name ?? "contact"} from ${detail.name}`}
                      >
                        {busyMemberId === m.contactId ? "Removing..." : "Remove"}
                      </Button>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ) : null}
        </Box>
      )}
    </Box>
  );
}
