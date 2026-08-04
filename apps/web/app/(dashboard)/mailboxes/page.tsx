"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  PageLayout,
} from "@alecrae/ui";
import {
  mailboxesApi,
  domainsApi,
  type Mailbox,
  type Domain,
} from "../../../lib/api";

/**
 * Mailboxes — native business-email addresses on domains we host.
 *
 * `POST/GET/PATCH/DELETE /v1/mailboxes` were real and mounted long before this
 * page existed; there was simply no UI anywhere, so provisioning
 * info@customer.com required a hand-written curl. This page is that missing
 * surface and nothing more — it invents no state of its own.
 *
 * The load-bearing constraint is that the API only accepts a mailbox on a
 * domain that is **verified AND active** for the caller's account (409
 * otherwise). So the domain picker offers exactly those domains, and when none
 * exist the page says so and points at /domains rather than presenting a form
 * whose every submission would fail.
 */

/** A domain is eligible only if the API would accept a mailbox on it. */
function isEligible(d: Domain): boolean {
  return d.status === "verified" && d.isActive !== false;
}

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState<Mailbox | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Both are needed before the form can be rendered honestly: the domain
      // list is what determines whether creating a mailbox is possible at all.
      const [mbRes, domRes] = await Promise.all([
        mailboxesApi.list(),
        domainsApi.list(),
      ]);
      setMailboxes(mbRes.data);
      setDomains(domRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mailboxes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const eligibleDomains = domains.filter(isEligible);

  const handleToggleActive = async (mb: Mailbox) => {
    setBusyId(mb.id);
    setError(null);
    try {
      const updated = await mailboxesApi.update(mb.id, { isActive: !mb.isActive });
      setMailboxes((prev) => prev.map((m) => (m.id === mb.id ? updated : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update mailbox");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (mb: Mailbox) => {
    setBusyId(mb.id);
    setError(null);
    try {
      await mailboxesApi.remove(mb.id);
      setMailboxes((prev) => prev.filter((m) => m.id !== mb.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove mailbox");
    } finally {
      setBusyId(null);
    }
  };

  const actions =
    eligibleDomains.length > 0 ? (
      <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
        New Mailbox
      </Button>
    ) : undefined;

  return (
    <PageLayout
      title="Mailboxes"
      description="Business-email addresses on your own domains. Mail sent to these arrives in your AlecRae inbox."
      {...(actions ? { actions } : {})}
    >
      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-800 text-sm">
          {error}
        </div>
      )}

      {showAddForm && eligibleDomains.length > 0 && (
        <AddMailboxForm
          domains={eligibleDomains}
          onClose={() => setShowAddForm(false)}
          onAdded={(mb) => {
            setMailboxes((prev) => [mb, ...prev]);
            setShowAddForm(false);
          }}
        />
      )}

      {editing && (
        <EditMailboxForm
          mailbox={editing}
          onClose={() => setEditing(null)}
          onSaved={(mb) => {
            setMailboxes((prev) => prev.map((m) => (m.id === mb.id ? mb : m)));
            setEditing(null);
          }}
        />
      )}

      {loading ? (
        <Text variant="body-md" muted>
          Loading mailboxes...
        </Text>
      ) : eligibleDomains.length === 0 ? (
        <NoVerifiedDomains hasAnyDomain={domains.length > 0} />
      ) : mailboxes.length === 0 ? (
        <EmptyState onAdd={() => setShowAddForm(true)} />
      ) : (
        <Box className="flex flex-col gap-3">
          {mailboxes.map((mb) => (
            <MailboxRow
              key={mb.id}
              mailbox={mb}
              busy={busyId === mb.id}
              onEdit={() => setEditing(mb)}
              onToggleActive={() => handleToggleActive(mb)}
              onRemove={() => handleRemove(mb)}
            />
          ))}
        </Box>
      )}
    </PageLayout>
  );
}

// ─── No verified domain ───────────────────────────────────────────────────────

/**
 * Shown instead of the create form when no domain can carry a mailbox. This is
 * a real precondition enforced by the API, not a UI preference — offering the
 * form here would produce a 409 on every submit.
 */
function NoVerifiedDomains({ hasAnyDomain }: { hasAnyDomain: boolean }) {
  return (
    <Card>
      <CardContent>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-brand-600 text-xl">@</span>
          </div>
          <Text variant="heading-sm" className="mb-2">
            {hasAnyDomain
              ? "No verified domains yet"
              : "Add a domain first"}
          </Text>
          <Text variant="body-md" muted className="mb-6 max-w-md mx-auto">
            {hasAnyDomain
              ? "A mailbox can only live on a domain that has passed DNS verification. Finish verifying a domain, then come back here."
              : "Mailboxes live on your own domains. Add a domain and complete its DNS setup, then you can create addresses on it."}
          </Text>
          <Button variant="primary" size="md" onClick={() => { window.location.href = "/domains"; }}>
            Go to Domains
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

NoVerifiedDomains.displayName = "NoVerifiedDomains";

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card>
      <CardContent>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-brand-600 text-xl">@</span>
          </div>
          <Text variant="heading-sm" className="mb-2">
            No mailboxes yet
          </Text>
          <Text variant="body-md" muted className="mb-6 max-w-sm mx-auto">
            Create an address like info@ or support@ on one of your verified
            domains.
          </Text>
          <Button variant="primary" size="md" onClick={onAdd}>
            Create Your First Mailbox
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

EmptyState.displayName = "EmptyState";

// ─── Mailbox row ──────────────────────────────────────────────────────────────

function MailboxRow({
  mailbox,
  busy,
  onEdit,
  onToggleActive,
  onRemove,
}: {
  mailbox: Mailbox;
  busy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onRemove: () => void;
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Text variant="body-md" className="font-medium truncate">
                {mailbox.address}
              </Text>
              {!mailbox.isActive && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-600 border border-neutral-200">
                  Paused
                </span>
              )}
            </div>
            {mailbox.displayName && (
              <Text variant="body-sm" muted>
                {mailbox.displayName}
              </Text>
            )}
            {mailbox.forwardTo && mailbox.forwardTo.length > 0 && (
              <Text variant="body-sm" muted>
                Forwards to {mailbox.forwardTo.join(", ")}
              </Text>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={onEdit} disabled={busy}>
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onToggleActive}
              disabled={busy}
            >
              {mailbox.isActive ? "Pause" : "Resume"}
            </Button>
            {confirmingRemove ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onRemove}
                  disabled={busy}
                >
                  Confirm delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingRemove(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingRemove(true)}
                disabled={busy}
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        {confirmingRemove && (
          <Text variant="body-sm" muted className="mt-3">
            Deleting stops delivery to this address permanently. To stop
            delivery temporarily and keep the address, use Pause instead.
          </Text>
        )}
      </CardContent>
    </Card>
  );
}

MailboxRow.displayName = "MailboxRow";

// ─── Add form ─────────────────────────────────────────────────────────────────

function AddMailboxForm({
  domains,
  onClose,
  onAdded,
}: {
  domains: Domain[];
  onClose: () => void;
  onAdded: (mailbox: Mailbox) => void;
}) {
  const [localPart, setLocalPart] = useState("");
  const [domainName, setDomainName] = useState(domains[0]?.domain ?? "");
  const [displayName, setDisplayName] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = localPart.trim() ? `${localPart.trim()}@${domainName}` : "";

  const handleSubmit = async () => {
    if (!address) {
      setError("Enter the part of the address before the @");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Split on comma; the API validates each as an email and rejects the
      // whole request if any is malformed, so no partial state is possible.
      const forwards = forwardTo
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const created = await mailboxesApi.create({
        address,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(forwards.length > 0 ? { forwardTo: forwards } : {}),
      });
      onAdded(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mailbox");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent>
        <Text variant="heading-sm" className="mb-4">
          New mailbox
        </Text>

        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div className="flex-1 min-w-[10rem]">
            <Text variant="body-sm" muted className="mb-1">
              Address
            </Text>
            <Input
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              placeholder="info"
              disabled={saving}
            />
          </div>
          <Text variant="body-md" className="pb-2">
            @
          </Text>
          <div className="flex-1 min-w-[12rem]">
            <Text variant="body-sm" muted className="mb-1">
              Domain
            </Text>
            <select
              value={domainName}
              onChange={(e) => setDomainName(e.target.value)}
              disabled={saving}
              className="w-full h-10 px-3 rounded-lg border border-neutral-300 bg-white text-sm"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.domain}>
                  {d.domain}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <Text variant="body-sm" muted className="mb-1">
            Display name (optional)
          </Text>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="BookARide Support"
            disabled={saving}
          />
          <Text variant="body-sm" muted className="mt-1">
            Shown as the sender name on mail sent from this address.
          </Text>
        </div>

        <div className="mb-4">
          <Text variant="body-sm" muted className="mb-1">
            Forward to (optional)
          </Text>
          <Input
            value={forwardTo}
            onChange={(e) => setForwardTo(e.target.value)}
            placeholder="craig@example.com, team@example.com"
            disabled={saving}
          />
          <Text variant="body-sm" muted className="mt-1">
            Comma-separated. Mail still arrives in your AlecRae inbox as well.
          </Text>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-100 text-red-800 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={saving || !localPart.trim()}
          >
            {saving ? "Creating..." : "Create mailbox"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {address && (
            <Text variant="body-sm" muted>
              Creates {address}
            </Text>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

AddMailboxForm.displayName = "AddMailboxForm";

// ─── Edit form ────────────────────────────────────────────────────────────────

/**
 * The address is shown but not editable — inbound routing resolves recipients
 * by exact address, so renaming in place would strand mail already delivered
 * to the old one. Changing an address is a delete plus a create, which is what
 * the API enforces too.
 */
function EditMailboxForm({
  mailbox,
  onClose,
  onSaved,
}: {
  mailbox: Mailbox;
  onClose: () => void;
  onSaved: (mailbox: Mailbox) => void;
}) {
  const [displayName, setDisplayName] = useState(mailbox.displayName ?? "");
  const [forwardTo, setForwardTo] = useState(
    (mailbox.forwardTo ?? []).join(", "),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const forwards = forwardTo
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const updated = await mailboxesApi.update(mailbox.id, {
        displayName: displayName.trim() || null,
        forwardTo: forwards.length > 0 ? forwards : null,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mailbox");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardContent>
        <Text variant="heading-sm" className="mb-1">
          Edit mailbox
        </Text>
        <Text variant="body-sm" muted className="mb-4">
          {mailbox.address} — the address itself can&apos;t be changed. To use a
          different one, create a new mailbox and delete this one.
        </Text>

        <div className="mb-4">
          <Text variant="body-sm" muted className="mb-1">
            Display name
          </Text>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="BookARide Support"
            disabled={saving}
          />
        </div>

        <div className="mb-4">
          <Text variant="body-sm" muted className="mb-1">
            Forward to
          </Text>
          <Input
            value={forwardTo}
            onChange={(e) => setForwardTo(e.target.value)}
            placeholder="craig@example.com"
            disabled={saving}
          />
          <Text variant="body-sm" muted className="mt-1">
            Comma-separated. Leave empty to stop forwarding.
          </Text>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-100 text-red-800 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

EditMailboxForm.displayName = "EditMailboxForm";
