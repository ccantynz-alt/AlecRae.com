"use client";

import { useState, useEffect } from "react";
import { Box, Text, Button, Input, Card, CardContent } from "@alecrae/ui";
import { authApi } from "../../../lib/api";
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  getPasskeyAssertion,
} from "../../../lib/webauthn";

export default function LoginPage(): React.ReactElement {
  return (
    <Box className="min-h-full flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <Box className="w-full max-w-md">
        <Box className="text-center mb-8">
          <Text variant="heading-lg" className="text-brand-600 font-bold mb-2">
            AlecRae
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
            Don&apos;t have an account?{" "}
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

function PasskeyLogin(): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean>(true);

  useEffect(() => {
    async function checkSupport(): Promise<void> {
      const webauthnSupported = isWebAuthnSupported();
      if (!webauthnSupported) {
        setSupported(false);
        return;
      }
      const platformAvailable = await isPlatformAuthenticatorAvailable();
      setSupported(platformAvailable);
    }
    void checkSupport();
  }, []);

  const handlePasskeyLogin = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const challengeResponse = await authApi.passkeyLoginChallenge();
      const assertion = await getPasskeyAssertion(challengeResponse.publicKey);
      await authApi.passkeyLoginVerify({
        challengeId: challengeResponse.challengeId,
        credential: assertion,
      });
      window.location.href = "/inbox";
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Passkey authentication was cancelled. Please try again.");
      } else if (err instanceof DOMException && err.name === "AbortError") {
        setError("Passkey authentication timed out. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Passkey login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!supported) {
    return (
      <Box className="space-y-3">
        <Text variant="label">Passkey</Text>
        <Text variant="caption" className="text-center" muted>
          Passkey authentication is not available on this device. Please use email and password.
        </Text>
      </Box>
    );
  }

  return (
    <Box className="space-y-3">
      <Text variant="label">Recommended</Text>
      {error && (
        <Box className="p-3 rounded-lg bg-red-50 border border-red-200">
          <Text variant="body-sm" className="text-red-800">
            {error}
          </Text>
        </Box>
      )}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={handlePasskeyLogin}
        loading={loading}
        disabled={loading}
      >
        {loading ? "Authenticating..." : "Sign in with Passkey"}
      </Button>
      <Text variant="caption" className="text-center">
        Use your fingerprint, face, or security key for instant secure access.
      </Text>
    </Box>
  );
}

PasskeyLogin.displayName = "PasskeyLogin";

function Divider(): React.ReactElement {
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

function EmailLogin(): React.ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      await authApi.login(email, password);
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
        <Box className="p-3 rounded-lg bg-red-50 border border-red-200">
          <Text variant="body-sm" className="text-red-800">
            {error}
          </Text>
        </Box>
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
