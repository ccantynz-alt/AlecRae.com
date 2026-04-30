"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  PageLayout,
} from "@alecrae/ui";
import { motion } from "motion/react";
import { authApi, accountApi, type PasskeyInfo, type NotificationPrefs } from "../../../lib/api";
import { PressableScale } from "../../../components/PressableScale";
import { AnimatedPresence } from "../../../components/AnimatedPresence";
import { SignatureManager } from "../../../components/SignatureManager";
import {
  staggerSlow,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
} from "../../../lib/animations";

interface UserData {
  name: string;
  email: string;
}

interface AccountData {
  planTier: string;
  emailsSentThisPeriod: number;
}

export default function SettingsPage(): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [user, setUser] = useState<UserData | null>(null);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const itemVariants = withReducedMotion(fadeInUp, reduced);

  useEffect(() => {
    Promise.all([
      authApi.me().catch(() => null),
      accountApi.get().catch(() => null),
    ]).then(([userRes, accountRes]) => {
      if (userRes) setUser({ name: userRes.data.name, email: userRes.data.email });
      if (accountRes) setAccount({ planTier: accountRes.data.planTier, emailsSentThisPeriod: accountRes.data.emailsSentThisPeriod });
      setLoading(false);
    });
  }, []);

  return (
    <PageLayout
      title="Settings"
      description="Manage your account, preferences, and security settings."
    >
      <motion.div
        className="max-w-3xl space-y-6"
        variants={staggerSlow}
        initial="initial"
        animate="animate"
      >
        <motion.div variants={itemVariants}>
          <ProfileSection user={user} loading={loading} onUpdate={setUser} />
        </motion.div>
        <motion.div variants={itemVariants}>
          <AccountOverview account={account} loading={loading} />
        </motion.div>
        <motion.div variants={itemVariants}>
          <SecuritySection />
        </motion.div>
        <motion.div variants={itemVariants}>
          <NotificationSection />
        </motion.div>
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <Text variant="heading-md">Email Signatures</Text>
              <Text variant="body-sm" muted>
                Create and manage email signatures. Your default signature is auto-appended to new emails.
              </Text>
            </CardHeader>
            <CardContent>
              <SignatureManager />
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants}>
          <DangerZone />
        </motion.div>
      </motion.div>
    </PageLayout>
  );
}

function ProfileSection({
  user,
  loading,
  onUpdate,
}: {
  user: UserData | null;
  loading: boolean;
  onUpdate: (u: UserData) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await accountApi.updateProfile({ name, email });
      onUpdate({ name: res.data.name, email: res.data.email });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const initials = (name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Profile</Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          <Box className="flex items-center gap-4 mb-4">
            <Box className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center">
              <Text variant="heading-lg" className="text-brand-700">
                {loading ? "..." : initials}
              </Text>
            </Box>
          </Box>
          <Box className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              variant="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              disabled={loading}
            />
            <Input
              label="Email"
              variant="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              disabled={loading}
            />
          </Box>
        </Box>
      </CardContent>
      <CardFooter>
        <Box className="flex items-center justify-end gap-3">
          <AnimatedPresence show={status === "saved"} presenceKey="saved-indicator">
            <Text variant="body-sm" className="text-status-success">
              Saved
            </Text>
          </AnimatedPresence>
          <AnimatedPresence show={status === "error"} presenceKey="error-indicator">
            <Text variant="body-sm" className="text-status-error">
              {errorMsg}
            </Text>
          </AnimatedPresence>
          <PressableScale as="button" tapScale={0.95}>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </PressableScale>
        </Box>
      </CardFooter>
    </Card>
  );
}

ProfileSection.displayName = "ProfileSection";

function AccountOverview({ account, loading }: { account: AccountData | null; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Account</Text>
      </CardHeader>
      <CardContent>
        <Box className="grid grid-cols-2 gap-4">
          <Box>
            <Text variant="body-sm" muted>Plan</Text>
            <Text variant="body-md" className="font-medium capitalize">
              {loading ? "..." : (account?.planTier ?? "free")}
            </Text>
          </Box>
          <Box>
            <Text variant="body-sm" muted>Emails sent this period</Text>
            <Text variant="body-md" className="font-medium">
              {loading ? "..." : (account?.emailsSentThisPeriod ?? 0).toLocaleString()}
            </Text>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

AccountOverview.displayName = "AccountOverview";

function SecuritySection() {
  const [passkeysData, setPasskeysData] = useState<PasskeyInfo[]>([]);
  const [loadingPasskeys, setLoadingPasskeys] = useState(true);
  const [showPasskeys, setShowPasskeys] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    try {
      const res = await accountApi.listPasskeys();
      setPasskeysData(res.data);
    } catch {
      setPasskeysData([]);
    } finally {
      setLoadingPasskeys(false);
    }
  }, []);

  const handleDeletePasskey = async (id: string) => {
    setDeletingId(id);
    try {
      await accountApi.deletePasskey(id);
      setPasskeysData((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // silently fail — user can retry
    } finally {
      setDeletingId(null);
    }
  };

  const handleManagePasskeys = () => {
    if (!showPasskeys) {
      loadPasskeys();
    }
    setShowPasskeys(!showPasskeys);
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Security</Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          <Box>
            <Box className="flex items-center justify-between">
              <Box>
                <Text variant="body-md" className="font-medium">Passkeys</Text>
                <Text variant="body-sm" muted>
                  Use biometric or hardware key authentication for secure, passwordless login.
                </Text>
              </Box>
              <Button variant="secondary" size="sm" onClick={handleManagePasskeys}>
                {showPasskeys ? "Hide" : "Manage Passkeys"}
              </Button>
            </Box>
            {showPasskeys && (
              <Box className="mt-4 space-y-2">
                {loadingPasskeys ? (
                  <Text variant="body-sm" muted>Loading passkeys...</Text>
                ) : passkeysData.length === 0 ? (
                  <Text variant="body-sm" muted>No passkeys registered yet.</Text>
                ) : (
                  passkeysData.map((pk) => (
                    <Box key={pk.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-tertiary">
                      <Box>
                        <Text variant="body-sm" className="font-medium">{pk.deviceName}</Text>
                        <Text variant="caption" muted>
                          Added {pk.createdAt ? new Date(pk.createdAt).toLocaleDateString() : "—"}
                          {pk.lastUsedAt ? ` · Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}` : ""}
                        </Text>
                      </Box>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeletePasskey(pk.id)}
                        disabled={deletingId === pk.id}
                      >
                        {deletingId === pk.id ? "Removing..." : "Remove"}
                      </Button>
                    </Box>
                  ))
                )}
              </Box>
            )}
          </Box>
          <Box as="hr" className="border-border" />
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">Two-Factor Authentication</Text>
              <Text variant="body-sm" muted>
                Add an extra layer of security with TOTP-based 2FA.
              </Text>
            </Box>
            <Button variant="secondary" size="sm">
              Enable 2FA
            </Button>
          </Box>
          <Box as="hr" className="border-border" />
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">Active Sessions</Text>
              <Text variant="body-sm" muted>
                Review and manage devices where you are currently signed in.
              </Text>
            </Box>
            <Button variant="secondary" size="sm">
              View Sessions
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

SecuritySection.displayName = "SecuritySection";

function NotificationSection() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    emailNotifications: true,
    aiDigest: true,
    deliverabilityAlerts: true,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    accountApi.getNotificationPrefs().then((res) => {
      setPrefs(res.data);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const toggle = async (key: keyof NotificationPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    try {
      await accountApi.updateNotificationPrefs({ [key]: updated[key] });
    } catch {
      setPrefs(prefs);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Notifications</Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">Email Notifications</Text>
              <Text variant="body-sm" muted>
                Receive notifications about important account events.
              </Text>
            </Box>
            <Button
              variant={prefs.emailNotifications ? "secondary" : "ghost"}
              size="sm"
              onClick={() => toggle("emailNotifications")}
              disabled={!loaded}
            >
              {prefs.emailNotifications ? "Enabled" : "Disabled"}
            </Button>
          </Box>
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">AI Digest</Text>
              <Text variant="body-sm" muted>
                Get a daily AI-generated summary of your inbox activity.
              </Text>
            </Box>
            <Button
              variant={prefs.aiDigest ? "secondary" : "ghost"}
              size="sm"
              onClick={() => toggle("aiDigest")}
              disabled={!loaded}
            >
              {prefs.aiDigest ? "Enabled" : "Disabled"}
            </Button>
          </Box>
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">Deliverability Alerts</Text>
              <Text variant="body-sm" muted>
                Be notified when domain reputation or deliverability drops.
              </Text>
            </Box>
            <Button
              variant={prefs.deliverabilityAlerts ? "secondary" : "ghost"}
              size="sm"
              onClick={() => toggle("deliverabilityAlerts")}
              disabled={!loaded}
            >
              {prefs.deliverabilityAlerts ? "Enabled" : "Disabled"}
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

NotificationSection.displayName = "NotificationSection";

function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    try {
      await accountApi.deleteAccount();
      authApi.logout();
      window.location.href = "/";
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <Card className="border-status-error/30">
      <CardHeader>
        <Text variant="heading-sm" className="text-status-error">
          Danger Zone
        </Text>
      </CardHeader>
      <CardContent>
        <Box className="flex items-center justify-between">
          <Box>
            <Text variant="body-md" className="font-medium">
              Delete Account
            </Text>
            <Text variant="body-sm" muted>
              Account deletion requires identity verification. Email{" "}
              <Box
                as="a"
                href="mailto:support@alecrae.com?subject=Account%20Deletion%20Request"
                className="inline text-brand-600 hover:text-brand-700 font-medium"
              >
                <Text as="span" variant="body-sm" className="text-brand-600">
                  support@alecrae.com
                </Text>
              </Box>{" "}
              from your account address and we&apos;ll process the deletion with a 30-day recovery window.
            </Text>
          </Box>
          <Box className="flex items-center gap-2">
            <AnimatedPresence show={confirming} presenceKey="cancel-delete">
              <PressableScale as="button" tapScale={0.95}>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
                  Cancel
                </Button>
              </PressableScale>
            </AnimatedPresence>
            <PressableScale as="button" tapScale={0.95}>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting..." : confirming ? "Confirm Delete" : "Delete Account"}
              </Button>
            </PressableScale>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

DangerZone.displayName = "DangerZone";
