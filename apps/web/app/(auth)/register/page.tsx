import { Box, Text, Button, Input, Card, CardContent } from "@emailed/ui";

export default function RegisterPage() {
  return (
    <Box className="min-h-full flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <Box className="w-full max-w-md">
        <Box className="text-center mb-8">
          <Text variant="heading-lg" className="text-brand-600 font-bold mb-2">
            Vieanna
          </Text>
          <Text variant="display-sm">Create your account</Text>
          <Text variant="body-md" muted className="mt-2">
            Get started with AI-native email in minutes
          </Text>
        </Box>

        <Card>
          <CardContent>
            <Box className="space-y-6">
              <PasskeyRegistration />
              <RegistrationDivider />
              <EmailRegistration />
            </Box>
          </CardContent>
        </Card>

        <Box className="text-center mt-6">
          <Text variant="body-sm" muted>
            Already have an account?{" "}
          </Text>
          <Box as="a" href="/login" className="inline">
            <Text as="span" variant="body-sm" className="text-brand-600 hover:text-brand-700 font-medium">
              Sign in
            </Text>
          </Box>
        </Box>

        <Box className="text-center mt-4">
          <Text variant="caption" muted>
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function PasskeyRegistration() {
  return (
    <Box className="space-y-3">
      <Text variant="label">Fastest way to get started</Text>
      <Button variant="primary" size="lg" className="w-full">
        Register with Passkey
      </Button>
      <Text variant="caption" className="text-center">
        Create a passkey using your device biometrics. No password needed -- ever.
      </Text>
    </Box>
  );
}

PasskeyRegistration.displayName = "PasskeyRegistration";

function RegistrationDivider() {
  return (
    <Box className="flex items-center gap-4">
      <Box className="flex-1 h-px bg-border" />
      <Text variant="caption" muted>
        or register with email
      </Text>
      <Box className="flex-1 h-px bg-border" />
    </Box>
  );
}

RegistrationDivider.displayName = "RegistrationDivider";

function EmailRegistration() {
  return (
    <Box as="form" className="space-y-4">
      <Box className="grid grid-cols-2 gap-4">
        <Input
          label="First name"
          variant="text"
          placeholder="Jane"
          autoComplete="given-name"
        />
        <Input
          label="Last name"
          variant="text"
          placeholder="Doe"
          autoComplete="family-name"
        />
      </Box>
      <Input
        label="Email address"
        variant="email"
        placeholder="you@example.com"
        autoComplete="email"
      />
      <Input
        label="Password"
        variant="password"
        placeholder="Create a strong password"
        autoComplete="new-password"
        hint="Must be at least 12 characters with a mix of letters, numbers, and symbols."
      />
      <Button variant="secondary" size="lg" className="w-full" type="submit">
        Create Account
      </Button>
    </Box>
  );
}

EmailRegistration.displayName = "EmailRegistration";
