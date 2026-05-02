"use client";

/**
 * Connected Accounts — multi-mailbox management.
 *
 * Workspace is Gmail-only. Microsoft 365 is Outlook-only. AlecRae unifies
 * Gmail + Outlook + iCloud + arbitrary IMAP under one AI brain. This page is
 * the management surface: see all mailboxes, sync state, last-sync time;
 * connect a new one, disconnect, force-resync.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Text,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  PageLayout,
} from "@alecrae/ui";
import {
  connectApi,
  type ConnectedAccount,
  type ConnectedProvider,
} from "../../../lib/api";

function providerLabel(provider: ConnectedProvider): string {
  switch (provider) {
    case "gmail":
      return "Gmail";
    case "outlook":
      return "Outlook";
    case "imap":
      return "IMAP / SMTP";
  }
}

function providerBadgeClass(provider: ConnectedProvider): string {
  switch (provider) {
    case "gmail":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "outlook":
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case "imap":
      return "bg-content-tertiary/10 text-content-tertiary border-border";
  }
}

function statusBadgeClass(status: "active" | "error"): string {
  return status === "active"
    ? "bg-status-success/10 text-status-success border-status-success/20"
    : "bg-status-error/10 text-status-error border-status-error/20";
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

interface ImapForm {
  email: string;
  imapHost: string;
  imapPort: string;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
}

const INITIAL_IMAP: ImapForm = {
  email: "",
  imapHost: "",
  imapPort: "993",
  imapUsername: "",
  imapPassword: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUsername: "",
  smtpPassword: "",
};

export default function AccountsPage(): React.ReactNode {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showImap, setShowImap] = useState(false);
  const [imapForm, setImapForm] = useState<ImapForm>(INITIAL_IMAP);
  const [savingImap, setSavingImap] = useState(false);

  const flash = (msg: string): void => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await connectApi.list();
      setAccounts(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSync = async (id: string): Promise<void> => {
    setBusyId(id);
    try {
      const res = await connectApi.sync(id);
      flash(
        `Synced — ${res.data.messagesAdded} added, ${res.data.messagesUpdated} updated, ${res.data.messagesDeleted} deleted (${res.data.syncDurationMs}ms)`,
      );
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (id: string): Promise<void> => {
    if (
      !window.confirm(
        "Disconnect this account? Cached messages stay in your inbox; live sync stops.",
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      await connectApi.disconnect(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      flash("Account disconnected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleConnectImap = async (): Promise<void> => {
    if (!imapForm.email || !imapForm.imapHost || !imapForm.smtpHost) {
      setError("Email, IMAP host, and SMTP host are required.");
      return;
    }
    setSavingImap(true);
    setError(null);
    try {
      await connectApi.connectImap({
        email: imapForm.email,
        imapHost: imapForm.imapHost,
        imapPort: parseInt(imapForm.imapPort, 10) || 993,
        imapUsername: imapForm.imapUsername || imapForm.email,
        imapPassword: imapForm.imapPassword,
        smtpHost: imapForm.smtpHost,
        smtpPort: parseInt(imapForm.smtpPort, 10) || 587,
        smtpUsername: imapForm.smtpUsername || imapForm.email,
        smtpPassword: imapForm.smtpPassword,
      });
      setImapForm(INITIAL_IMAP);
      setShowImap(false);
      flash("IMAP account connected.");
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "IMAP connect failed");
    } finally {
      setSavingImap(false);
    }
  };

  const startGmail = (): void => {
    window.location.href = connectApi.gmailAuthUrl();
  };
  const startOutlook = (): void => {
    window.location.href = connectApi.outlookAuthUrl();
  };

  const counts = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.provider] = (acc[a.provider] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PageLayout
      title="Connected Accounts"
      description="One inbox, many mailboxes. AlecRae unifies Gmail, Outlook, iCloud, and arbitrary IMAP under one AI brain."
    >
      <Box className="space-y-6 max-w-5xl">
        {error && (
          <Box className="rounded-md border border-status-error/30 bg-status-error/5 p-3">
            <Text variant="body-sm" className="text-status-error">
              {error}
            </Text>
          </Box>
        )}
        {statusMsg && (
          <Box className="rounded-md border border-accent/30 bg-accent/5 p-3">
            <Text variant="body-sm" className="text-accent">
              {statusMsg}
            </Text>
          </Box>
        )}

        <Box className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent>
              <Text variant="caption" muted className="block">Total</Text>
              <Text variant="heading-md" className="font-semibold">
                {accounts.length}
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Text variant="caption" muted className="block">Gmail</Text>
              <Text variant="heading-md" className="font-semibold">
                {counts["gmail"] ?? 0}
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Text variant="caption" muted className="block">Outlook</Text>
              <Text variant="heading-md" className="font-semibold">
                {counts["outlook"] ?? 0}
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Text variant="caption" muted className="block">IMAP</Text>
              <Text variant="heading-md" className="font-semibold">
                {counts["imap"] ?? 0}
              </Text>
            </CardContent>
          </Card>
        </Box>

        <Card>
          <CardHeader>
            <Text variant="heading-sm">Add an account</Text>
          </CardHeader>
          <CardContent>
            <Box className="flex flex-wrap gap-2">
              <Button variant="primary" size="md" onClick={startGmail}>
                Connect Gmail
              </Button>
              <Button variant="primary" size="md" onClick={startOutlook}>
                Connect Outlook
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowImap((prev) => !prev)}
              >
                {showImap ? "Hide IMAP form" : "Connect IMAP / SMTP"}
              </Button>
            </Box>

            {showImap && (
              <Box className="mt-4 space-y-3 border border-border rounded-md p-4">
                <Box className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    label="Email address"
                    variant="email"
                    value={imapForm.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setImapForm({ ...imapForm, email: e.target.value })
                    }
                  />
                  <Input
                    label="IMAP host"
                    variant="text"
                    placeholder="imap.example.com"
                    value={imapForm.imapHost}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setImapForm({ ...imapForm, imapHost: e.target.value })
                    }
                  />
                  <Input
                    label="IMAP port"
                    variant="text"
                    value={imapForm.imapPort}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setImapForm({ ...imapForm, imapPort: e.target.value })
                    }
                  />
                  <Input
                    label="IMAP username (defaults to email)"
                    variant="text"
                    value={imapForm.imapUsername}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setImapForm({ ...imapForm, imapUsername: e.target.value })
                    }
                  />
                  <Input
                    label="IMAP password"
                    variant="password"
                    value={imapForm.imapPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setImapForm({ ...imapForm, imapPassword: e.target.value })
                    }
                  />
                  <Input
                    label="SMTP host"
                    variant="text"
                    placeholder="smtp.example.com"
                    value={imapForm.smtpHost}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setImapForm({ ...imapForm, smtpHost: e.target.value })
                    }
                  />
                  <Input
                    label="SMTP port"
                    variant="text"
                    value={imapForm.smtpPort}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setImapForm({ ...imapForm, smtpPort: e.target.value })
                    }
                  />
                  <Input
                    label="SMTP password"
                    variant="password"
                    value={imapForm.smtpPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setImapForm({ ...imapForm, smtpPassword: e.target.value })
                    }
                  />
                </Box>
                <Box className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleConnectImap()}
                    disabled={savingImap}
                  >
                    {savingImap ? "Connecting..." : "Connect IMAP account"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setImapForm(INITIAL_IMAP);
                      setShowImap(false);
                    }}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Text variant="heading-sm">Connected mailboxes</Text>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Text variant="body-sm" muted>Loading...</Text>
            ) : accounts.length === 0 ? (
              <Text variant="body-sm" muted>
                No accounts yet. Connect Gmail, Outlook, or any IMAP server above.
              </Text>
            ) : (
              <Box className="space-y-3">
                {accounts.map((a) => (
                  <Box
                    key={a.id}
                    className="border border-border rounded-md p-4 space-y-2"
                  >
                    <Box className="flex items-start justify-between flex-wrap gap-2">
                      <Box className="flex-1 min-w-0">
                        <Box className="flex items-center gap-2 flex-wrap">
                          <Text
                            as="span"
                            variant="caption"
                            className={`px-2 py-0.5 rounded-full border ${providerBadgeClass(a.provider)}`}
                          >
                            {providerLabel(a.provider)}
                          </Text>
                          <Text
                            as="span"
                            variant="caption"
                            className={`px-2 py-0.5 rounded-full border ${statusBadgeClass(a.status)}`}
                          >
                            {a.status}
                          </Text>
                        </Box>
                        <Text variant="body-md" className="font-semibold mt-1 truncate">
                          {a.email}
                        </Text>
                        {a.displayName && a.displayName !== a.email && (
                          <Text variant="caption" muted className="truncate">
                            {a.displayName}
                          </Text>
                        )}
                      </Box>
                      <Box className="text-xs text-right">
                        <Text variant="caption" muted className="block">
                          Last sync
                        </Text>
                        <Text variant="body-sm" className="font-medium">
                          {formatTimestamp(a.lastSyncAt)}
                        </Text>
                      </Box>
                    </Box>

                    <Box className="flex gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleSync(a.id)}
                        disabled={busyId === a.id}
                      >
                        {busyId === a.id ? "Syncing..." : "Sync now"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDisconnect(a.id)}
                        disabled={busyId === a.id}
                      >
                        Disconnect
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </PageLayout>
  );
}
