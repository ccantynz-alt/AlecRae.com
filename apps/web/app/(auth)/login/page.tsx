"use client";

import { useState, useEffect } from "react";
import { Box, Text, Button, Input, Card, CardContent } from "@alecrae/ui";
import { authApi } from "../../../lib/api";
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  getPasskeyAssertion,
} from "../../../lib/webauthn";

const CALLBACK_ERRORS: Record<string, string> = {
  google_signin_failed: "Google sign-in didn't complete. Please try again.",
  google_state_invalid: "Your Google sign-in session expired. Please try again.",
  google_unavailable: "Google sign-in isn't available right now. Use a passkey or email instead.",
};

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

        <CallbackErrorBanner />

        <Card>
          <CardContent>
            <Box className="space-y-6">
              <PasskeyLogin />
              <GoogleSignIn />
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
        const msg = err instanceof Error ? err.message : "";
        if (msg.toLowerCase().includes("load failed") || msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network")) {
          setError("Can't reach the server right now. We're launching soon — try again shortly.");
        } else {
          setError(msg || "Passkey sign-in failed. Please try again.");
        }
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

function CallbackErrorBanner(): React.ReactElement | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code && CALLBACK_ERRORS[code]) {
      setMessage(CALLBACK_ERRORS[code]);
    }
  }, []);

  if (!message) return null;

  return (
    <Box className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
      <Text variant="body-sm" className="text-red-800">
        {message}
      </Text>
    </Box>
  );
}

CallbackErrorBanner.displayName = "CallbackErrorBanner";

function GoogleSignIn(): React.ReactElement {
  const [loading, setLoading] = useState(false);

  const handleClick = (): void => {
    setLoading(true);
    window.location.href = authApi.googleSignInUrl();
  };

  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      onClick={handleClick}
      loading={loading}
      disabled={loading}
    >
      <Box as="span" className="inline-flex items-center gap-2">
        <GoogleMark />
        {loading ? "Redirecting…" : "Sign in with Google"}
      </Box>
    </Button>
  );
}

GoogleSignIn.displayName = "GoogleSignIn";

function GoogleMark(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

GoogleMark.displayName = "GoogleMark";

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
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("load failed") || msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network")) {
        setError("Can't reach the server right now. We're launching soon — try again shortly.");
      } else {
        setError(msg || "Sign in failed. Please check your details and try again.");
      }
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
