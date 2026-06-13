"use client";

/**
 * AlecRae — Workspace Setup
 *
 * The business / "Google-Workspace-equivalent" surface, wired to existing
 * backends that the role-scoped session token now reaches:
 *  - Mailboxes: provision native addresses (info@yourdomain) on a verified
 *    domain (/v1/mailboxes), list + remove them.
 *  - Team: create your organization, invite users, manage roles + pending
 *    invitations (/v1/organizations).
 *
 * Owner/admin only. Adding + verifying a sending domain happens on the
 * Domains page; this page links there when no verified domain exists.
 * (Bulk Google-Workspace directory import is a separate follow-up — its admin
 * OAuth flow needs backend wiring before it can be surfaced here.)
 */

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Box, Text, Button, Card, CardContent, Input } from "@alecrae/ui";
import {
  authApi,
  domainsApi,
  mailboxesApi,
  organizationsApi,
  type Domain,
  type Mailbox,
  type Organization,
  type OrgMember,
  type OrgInvitation,
  type OrgRole,
} from "../../../lib/api";

type Tab = "mailboxes" | "team";

export default function WorkspacePage(): ReactNode {
  const [role, setRole] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("mailboxes");

  useEffect(() => {
    authApi
      .me()
      .then((res) => setRole(res.data.role))
      .catch(() => setRole(null))
      .finally(() => setRoleChecked(true));
  }, []);

  if (!roleChecked) return <CenteredNote title="Loading workspace…" />;

  const isAdmin = role === "owner" || role === "admin";
  if (!isAdmin) {
    return (
      <CenteredNote
        title="Admin access required"
        body="Only the account owner or an admin can set up the workspace. Contact your owner if you need access."
      />
    );
  }

  return (
    <Box className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto">
      <Box className="mb-6">
        <Text variant="display-sm" className="mb-1">
          Workspace
        </Text>
        <Text variant="body-md" muted>
          Provision mailboxes on your domain and manage your team.
        </Text>
      </Box>

      <Box role="tablist" aria-label="Workspace sections" className="flex gap-1 mb-6 border-b border-border">
        {(
          [
            { id: "mailboxes", label: "Mailboxes" },
            { id: "team", label: "Team" },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <Box
            key={t.id}
            as="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-body-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-brand-600 text-content"
                : "border-transparent text-content-tertiary hover:text-content"
            }`}
          >
            {t.label}
          </Box>
        ))}
      </Box>

      {tab === "mailboxes" ? <MailboxesSection /> : <TeamSection />}
    </Box>
  );
}

WorkspacePage.displayName = "WorkspacePage";

// ─── Shared bits ──────────────────────────────────────────────────────────────

function CenteredNote({ title, body }: { title: string; body?: string }): ReactNode {
  return (
    <Box className="flex-1 flex items-center justify-center p-8">
      <Box className="text-center max-w-md">
        <Text variant="heading-md" className="mb-2">
          {title}
        </Text>
        {body && (
          <Text variant="body-md" muted>
            {body}
          </Text>
        )}
      </Box>
    </Box>
  );
}

function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }): ReactNode {
  const cls =
    tone === "error"
      ? "text-status-error"
      : tone === "success"
        ? "text-status-success"
        : "text-content-secondary";
  return (
    <Box role={tone === "error" ? "alert" : undefined} className="py-1">
      <Text variant="body-sm" className={cls}>
        {children}
      </Text>
    </Box>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

// ─── Mailboxes ──────────────────────────────────────────────────────────────

function MailboxesSection(): ReactNode {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [localPart, setLocalPart] = useState("");
  const [domain, setDomain] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([domainsApi.list(), mailboxesApi.list()])
      .then(([d, m]) => {
        setDomains(d.data);
        setMailboxes(m.data);
      })
      .catch((e: unknown) => setError(errMsg(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const verifiedDomains = (domains ?? []).filter((d) => d.verificationStatus === "verified");

  // Default the domain picker to the first verified domain once loaded.
  useEffect(() => {
    if (!domain && verifiedDomains[0]) setDomain(verifiedDomains[0].domain);
  }, [domain, verifiedDomains]);

  const create = async (): Promise<void> => {
    if (!localPart.trim() || !domain) return;
    setBusy(true);
    setFormError(null);
    try {
      await mailboxesApi.create({
        address: `${localPart.trim().toLowerCase()}@${domain}`,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      setLocalPart("");
      setDisplayName("");
      load();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    setBusy(true);
    try {
      await mailboxesApi.remove(id);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent>
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" size="sm" onClick={load}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (domains && verifiedDomains.length === 0) {
    return (
      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-2">
            Add a domain first
          </Text>
          <Text variant="body-md" muted className="mb-4">
            To create mailboxes like <Text as="span" variant="body-md" className="font-medium">info@yourdomain.com</Text>,
            add and verify your sending domain. Once its DNS records are verified you can provision mailboxes here.
          </Text>
          <Button variant="primary" size="md" onClick={() => router.push("/domains" as Route)}>
            Go to Domains
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box className="space-y-6">
      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-3">
            New mailbox
          </Text>
          <Box className="flex flex-wrap items-end gap-3">
            <Box className="flex-1 min-w-[12rem]">
              <Text variant="caption" muted className="mb-1 block">
                Address
              </Text>
              <Box className="flex items-center gap-2">
                <Input
                  value={localPart}
                  onChange={(e) => setLocalPart((e.target as HTMLInputElement).value)}
                  placeholder="info"
                  aria-label="Mailbox local part"
                />
                <Text as="span" variant="body-md" muted>
                  @
                </Text>
                <Box
                  as="select"
                  value={domain}
                  onChange={(e) => setDomain((e.target as HTMLSelectElement).value)}
                  aria-label="Domain"
                  className="h-10 px-3 rounded-lg border border-border bg-surface text-content text-body-md"
                >
                  {verifiedDomains.map((d) => (
                    <Box as="option" key={d.id} value={d.domain}>
                      {d.domain}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
            <Box className="flex-1 min-w-[10rem]">
              <Text variant="caption" muted className="mb-1 block">
                Display name (optional)
              </Text>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                placeholder="Support Team"
                aria-label="Display name"
              />
            </Box>
            <Button
              variant="primary"
              size="md"
              onClick={() => void create()}
              disabled={busy || !localPart.trim() || !domain}
            >
              Create
            </Button>
          </Box>
          {formError && <Notice tone="error">{formError}</Notice>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-3">
            Mailboxes
          </Text>
          {mailboxes === null && <Notice tone="info">Loading…</Notice>}
          {mailboxes && mailboxes.length === 0 && (
            <Notice tone="info">No mailboxes yet. Create your first above.</Notice>
          )}
          <Box className="divide-y divide-border">
            {mailboxes?.map((m) => (
              <Box key={m.id} className="flex items-center justify-between py-2 gap-3">
                <Box className="min-w-0">
                  <Text variant="body-sm" className="font-medium truncate">
                    {m.address}
                  </Text>
                  {m.displayName && (
                    <Text variant="caption" muted className="truncate block">
                      {m.displayName}
                    </Text>
                  )}
                </Box>
                <Button variant="ghost" size="sm" onClick={() => void remove(m.id)} disabled={busy}>
                  Remove
                </Button>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// ─── Team ──────────────────────────────────────────────────────────────────

function TeamSection(): ReactNode {
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgChecked, setOrgChecked] = useState(false);
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [invites, setInvites] = useState<OrgInvitation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create-org form
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<string | null>(null);

  const loadOrg = useCallback(() => {
    setError(null);
    organizationsApi
      .get()
      .then((res) => setOrg(res.data[0] ?? null))
      .catch((e: unknown) => setError(errMsg(e)))
      .finally(() => setOrgChecked(true));
  }, []);

  const loadTeam = useCallback(() => {
    Promise.all([organizationsApi.members(), organizationsApi.invitations("pending")])
      .then(([m, i]) => {
        setMembers(m.data);
        setInvites(i.data);
      })
      .catch((e: unknown) => setError(errMsg(e)));
  }, []);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  useEffect(() => {
    if (org) loadTeam();
  }, [org, loadTeam]);

  const createOrg = async (): Promise<void> => {
    if (!orgName.trim() || !orgSlug.trim()) return;
    setBusy(true);
    setCreateError(null);
    try {
      const res = await organizationsApi.create({
        name: orgName.trim(),
        slug: orgSlug.trim().toLowerCase(),
      });
      setOrg(res.data);
    } catch (e) {
      setCreateError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const invite = async (): Promise<void> => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    setInviteError(null);
    setInviteOk(null);
    try {
      await organizationsApi.invite({ email: inviteEmail.trim().toLowerCase(), role: inviteRole });
      setInviteEmail("");
      setInviteOk("Invitation sent.");
      loadTeam();
    } catch (e) {
      setInviteError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string): Promise<void> => {
    setBusy(true);
    try {
      await organizationsApi.revokeInvitation(id);
      loadTeam();
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent>
          <Notice tone="error">{error}</Notice>
          <Button variant="secondary" size="sm" onClick={loadOrg}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!orgChecked) return <Notice tone="info">Loading…</Notice>;

  // No org yet → create one.
  if (!org) {
    return (
      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-2">
            Create your organization
          </Text>
          <Text variant="body-md" muted className="mb-4">
            An organization lets you invite teammates, assign roles, and manage shared settings.
          </Text>
          <Box className="flex flex-wrap items-end gap-3">
            <Box className="flex-1 min-w-[12rem]">
              <Text variant="caption" muted className="mb-1 block">
                Name
              </Text>
              <Input
                value={orgName}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  setOrgName(v);
                  if (!orgSlug) setOrgSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                }}
                placeholder="Acme Inc"
                aria-label="Organization name"
              />
            </Box>
            <Box className="flex-1 min-w-[12rem]">
              <Text variant="caption" muted className="mb-1 block">
                Slug
              </Text>
              <Input
                value={orgSlug}
                onChange={(e) =>
                  setOrgSlug((e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="acme"
                aria-label="Organization slug"
              />
            </Box>
            <Button variant="primary" size="md" onClick={() => void createOrg()} disabled={busy}>
              Create
            </Button>
          </Box>
          {createError && <Notice tone="error">{createError}</Notice>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Box className="space-y-6">
      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-1">
            {org.name}
          </Text>
          <Text variant="caption" muted>
            {org.slug}
          </Text>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-3">
            Invite a teammate
          </Text>
          <Box className="flex flex-wrap items-end gap-3">
            <Box className="flex-1 min-w-[14rem]">
              <Text variant="caption" muted className="mb-1 block">
                Email
              </Text>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail((e.target as HTMLInputElement).value)}
                placeholder="teammate@company.com"
                aria-label="Invite email"
              />
            </Box>
            <Box>
              <Text variant="caption" muted className="mb-1 block">
                Role
              </Text>
              <Box
                as="select"
                value={inviteRole}
                onChange={(e) => setInviteRole((e.target as HTMLSelectElement).value as OrgRole)}
                aria-label="Invite role"
                className="h-10 px-3 rounded-lg border border-border bg-surface text-content text-body-md"
              >
                <Box as="option" value="member">
                  Member
                </Box>
                <Box as="option" value="admin">
                  Admin
                </Box>
                <Box as="option" value="viewer">
                  Viewer
                </Box>
              </Box>
            </Box>
            <Button variant="primary" size="md" onClick={() => void invite()} disabled={busy || !inviteEmail.trim()}>
              Send invite
            </Button>
          </Box>
          {inviteError && <Notice tone="error">{inviteError}</Notice>}
          {inviteOk && <Notice tone="success">{inviteOk}</Notice>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Text variant="heading-sm" className="mb-3">
            Members
          </Text>
          <Box className="divide-y divide-border">
            {members?.map((m) => (
              <Box key={m.id} className="flex items-center justify-between py-2 gap-3">
                <Box className="min-w-0">
                  <Text variant="body-sm" className="font-medium truncate">
                    {m.name || m.email}
                  </Text>
                  <Text variant="caption" muted className="truncate block">
                    {m.email}
                  </Text>
                </Box>
                <Text as="span" variant="caption" className="capitalize text-content-secondary">
                  {m.role}
                </Text>
              </Box>
            ))}
            {members && members.length === 0 && <Notice tone="info">No members yet.</Notice>}
          </Box>
        </CardContent>
      </Card>

      {invites && invites.length > 0 && (
        <Card>
          <CardContent>
            <Text variant="heading-sm" className="mb-3">
              Pending invitations
            </Text>
            <Box className="divide-y divide-border">
              {invites.map((inv) => (
                <Box key={inv.id} className="flex items-center justify-between py-2 gap-3">
                  <Box className="min-w-0">
                    <Text variant="body-sm" className="truncate font-medium">
                      {inv.email}
                    </Text>
                    <Text variant="caption" muted className="capitalize block">
                      {inv.role}
                    </Text>
                  </Box>
                  <Button variant="ghost" size="sm" onClick={() => void revoke(inv.id)} disabled={busy}>
                    Revoke
                  </Button>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
