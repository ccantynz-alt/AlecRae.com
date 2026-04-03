"use client";

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
} from "@emailed/ui";

export default function SettingsPage() {
  return (
    <PageLayout
      title="Settings"
      description="Manage your account, preferences, and security settings."
    >
      <Box className="max-w-3xl space-y-6">
        <ProfileSection />
        <SecuritySection />
        <NotificationSection />
        <DangerZone />
      </Box>
    </PageLayout>
  );
}

function ProfileSection() {
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
                U
              </Text>
            </Box>
            <Box>
              <Button variant="secondary" size="sm">
                Change Avatar
              </Button>
            </Box>
          </Box>
          <Box className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Full Name" variant="text" defaultValue="User" />
            <Input label="Email" variant="email" defaultValue="user@emailed.dev" />
          </Box>
          <Input label="Display Name" variant="text" defaultValue="user" hint="This is how others will see you." />
        </Box>
      </CardContent>
      <CardFooter>
        <Box className="flex justify-end">
          <Button variant="primary" size="sm">
            Save Changes
          </Button>
        </Box>
      </CardFooter>
    </Card>
  );
}

ProfileSection.displayName = "ProfileSection";

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
            <Button variant="ghost" size="sm">
              Enabled
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
            <Button variant="ghost" size="sm">
              Enabled
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
            <Button variant="ghost" size="sm">
              Enabled
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
              Permanently delete your account and all associated data. This action cannot be undone.
            </Text>
          </Box>
          <Button variant="destructive" size="sm">
            Delete Account
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

DangerZone.displayName = "DangerZone";
