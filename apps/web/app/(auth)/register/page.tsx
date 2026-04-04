"use client";

import { useState } from "react";
import { Box, Text, Button, Input, Card, CardContent } from "@emailed/ui";
import { authApi } from "../../../lib/api";

export default function RegisterPage() {
  return (
    <Box className="min-h-full flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <Box className="w-full max-w-md">
        <Box className="text-center mb-8">
          <Text variant="heading-lg" className="text-brand-600 font-bold mb-2">
            Emailed
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
            By creating an account, you agree to our{" "}
            <a href="/terms" className="text-brand-600 hover:underline">Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</a>.
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !email || !password) return;

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const name = lastName ? `${firstName} ${lastName}` : firstName;
      await authApi.register({ email, password, name });
      window.location.href = "/inbox";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box as="form" className="space-y-4" onSubmit={handleSubmit}>
      {error && (
        <div className="p-3 rounded bg-red-100 text-red-800 text-sm">
          {error}
        </div>
      )}
      <Box className="grid grid-cols-2 gap-4">
        <Input
          label="First name"
          variant="text"
          placeholder="Jane"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <Input
          label="Last name"
          variant="text"
          placeholder="Doe"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </Box>
      <Input
        label="Email address"
        variant="email"
        placeholder="you@example.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        label="Password"
        variant="password"
        placeholder="Create a strong password"
        autoComplete="new-password"
        hint="Must be at least 8 characters."
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        type="submit"
        disabled={loading || !firstName || !email || !password}
      >
        {loading ? "Creating account..." : "Create Account"}
      </Button>
    </Box>
  );
}

EmailRegistration.displayName = "EmailRegistration";
