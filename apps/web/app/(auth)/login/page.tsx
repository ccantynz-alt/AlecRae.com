"use client";

import { useState } from "react";
import { Box, Text, Button, Input, Card, CardContent } from "@emailed/ui";
import { authApi } from "../../../lib/api";

export default function LoginPage() {
  return (
    <Box className="min-h-full flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <Box className="w-full max-w-md">
        <Box className="text-center mb-8">
          <Text variant="heading-lg" className="text-brand-600 font-bold mb-2">
            Emailed
          </Text>
          <Text variant="display-sm">Welcome back</Text>
          <Text variant="body-md" muted className="mt-2">
            Sign in to your account
          </Text>
        </Box>

        <Card>
          <CardContent>
            <Box className="space-y-6">
              <PasskeyLogin />
              <Divider />
              <EmailLogin />
            </Box>
          </CardContent>
        </Card>

        <Box className="text-center mt-6">
          <Text variant="body-sm" muted>
            Don't have an account?{" "}
          </Text>
          <Box as="a" href="/register" className="inline">
            <Text as="span" variant="body-sm" className="text-brand-600 hover:text-brand-700 font-medium">
              Create one
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function PasskeyLogin() {
  return (
    <Box className="space-y-3">
      <Text variant="label">Recommended</Text>
      <Button variant="primary" size="lg" className="w-full">
        Sign in with Passkey
      </Button>
      <Text variant="caption" className="text-center">
        Use your fingerprint, face, or security key for instant secure access.
      </Text>
    </Box>
  );
}

PasskeyLogin.displayName = "PasskeyLogin";

function Divider() {
  return (
    <Box className="flex items-center gap-4">
      <Box className="flex-1 h-px bg-border" />
      <Text variant="caption" muted>
        or continue with email
      </Text>
      <Box className="flex-1 h-px bg-border" />
    </Box>
  );
}

Divider.displayName = "Divider";

function EmailLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      await authApi.login(email, password);
      // Redirect to dashboard
      window.location.href = "/inbox";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
        placeholder="Enter your password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Box className="flex items-center justify-between">
        <Box className="flex items-center gap-2">
          <Box as="input" type="checkbox" id="remember" className="rounded border-border text-brand-600 focus:ring-brand-500" />
          <Text as="label" variant="body-sm" htmlFor="remember">
            Remember me
          </Text>
        </Box>
        <Box as="a" href="/forgot-password">
          <Text as="span" variant="body-sm" className="text-brand-600 hover:text-brand-700">
            Forgot password?
          </Text>
        </Box>
      </Box>
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        type="submit"
        disabled={loading || !email || !password}
      >
        {loading ? "Signing in..." : "Sign in with Email"}
      </Button>
    </Box>
  );
}

EmailLogin.displayName = "EmailLogin";
