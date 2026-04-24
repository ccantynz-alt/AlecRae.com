"use client";

import { useState, useEffect } from "react";
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
import { authApi, accountApi } from "../../../lib/api";
import { PressableScale } from "../../../components/PressableScale";
import { AnimatedPresence } from "../../../components/AnimatedPresence";
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
          <ProfileSection user={user} loading={loading} />
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
          <DangerZone />
        </motion.div>
      </motion.div>
    </PageLayout>
  );
}

function ProfileSection({ user, loading }: { user: UserData | null; loading: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await accountApi.update({ name });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save changes");
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
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
            <Input
              label="Email"
              variant="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </Box>
        </Box>
      </CardContent>
      <CardFooter>
        <Box className="flex items-center justify-end gap-3">
          {error && (
            <Text variant="body-sm" className="text-status-error">
              {error}
            </Text>
          )}
          <AnimatedPresence show={saved} presenceKey="saved-indicator">
            <Text variant="body-sm" className="text-status-success">
              Saved
            </Text>
          </AnimatedPresence>
          {saveError && (
            <Text variant="body-sm" className="text-status-error">
              {saveError}
            </Text>
          )}
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
  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Security</Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">
                Passkeys
              </Text>
              <Text variant="body-sm" muted>
                Use biometric or hardware key authentication for secure, passwordless login.
              </Text>
            </Box>
            <Button variant="secondary" size="sm">
              Manage Passkeys
            </Button>
          </Box>
          <Box as="hr" className="border-border" />
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">
                Two-Factor Authentication
              </Text>
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
              <Text variant="body-md" className="font-medium">
                Active Sessions
              </Text>
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
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [aiDigest, setAiDigest] = useState(true);
  const [deliverabilityAlerts, setDeliverabilityAlerts] = useState(true);

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">Notifications</Text>
      </CardHeader>
      <CardContent>
        <Box className="space-y-4">
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">
                Email Notifications
              </Text>
              <Text variant="body-sm" muted>
                Receive notifications about important account events.
              </Text>
            </Box>
            <Button
              variant={emailNotifs ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setEmailNotifs(!emailNotifs)}
            >
              {emailNotifs ? "Enabled" : "Disabled"}
            </Button>
          </Box>
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">
                AI Digest
              </Text>
              <Text variant="body-sm" muted>
                Get a daily AI-generated summary of your inbox activity.
              </Text>
            </Box>
            <Button
              variant={aiDigest ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setAiDigest(!aiDigest)}
            >
              {aiDigest ? "Enabled" : "Disabled"}
            </Button>
          </Box>
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-md" className="font-medium">
                Deliverability Alerts
              </Text>
              <Text variant="body-sm" muted>
                Be notified when domain reputation or deliverability drops.
              </Text>
            </Box>
            <Button
              variant={deliverabilityAlerts ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDeliverabilityAlerts(!deliverabilityAlerts)}
            >
              {deliverabilityAlerts ? "Enabled" : "Disabled"}
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

NotificationSection.displayName = "NotificationSection";

function DangerZone() {
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
            {error && (
              <Text variant="body-sm" className="text-status-error mt-2">
                {error}
              </Text>
            )}
            {result && (
              <Text variant="body-sm" className="text-status-success mt-2">
                {result}
              </Text>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

DangerZone.displayName = "DangerZone";
