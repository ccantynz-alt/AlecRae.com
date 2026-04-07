"use client";

import { useState, useCallback } from "react";
import { Box, Text, Button, Input, Card, CardContent } from "@emailed/ui";

export default function LoginPage() {
  return (
    <Box className="min-h-full flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <Box className="w-full max-w-md">
        <Box className="text-center mb-8">
          <Text variant="heading-lg" className="text-brand-600 font-bold mb-2">
            Vieanna
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePasskeyLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        setError("Passkeys are not supported in this browser.");
        return;
      }

      // Request authentication options from server
      const optionsResponse = await fetch("/api/auth/passkey/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!optionsResponse.ok) {
        setError("Failed to start passkey authentication.");
        return;
      }

      const options = await optionsResponse.json();

      // Convert base64 challenge to ArrayBuffer
      options.challenge = Uint8Array.from(atob(options.challenge), (c) => c.charCodeAt(0));
      if (options.allowCredentials) {
        for (const cred of options.allowCredentials) {
          cred.id = Uint8Array.from(atob(cred.id), (c) => c.charCodeAt(0));
        }
      }

      // Prompt user for passkey
      const credential = await navigator.credentials.get({
        publicKey: options,
      }) as PublicKeyCredential;

      if (!credential) {
        setError("Authentication was cancelled.");
        return;
      }

      const authResponse = credential.response as AuthenticatorAssertionResponse;

      // Send credential to server for verification
      const verifyResponse = await fetch("/api/auth/passkey/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: credential.id,
          rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
          response: {
            authenticatorData: btoa(String.fromCharCode(...new Uint8Array(authResponse.authenticatorData))),
            clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(authResponse.clientDataJSON))),
            signature: btoa(String.fromCharCode(...new Uint8Array(authResponse.signature))),
          },
          type: credential.type,
        }),
      });

      if (verifyResponse.ok) {
        window.location.href = "/inbox";
      } else {
        const data = await verifyResponse.json();
        setError(data.error ?? "Passkey verification failed.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Authentication was cancelled.");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <Box className="space-y-3">
      <Text variant="label">Recommended</Text>
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={handlePasskeyLogin}
        disabled={isLoading}
      >
        {isLoading ? "Authenticating..." : "Sign in with Passkey"}
      </Button>
      {error && (
        <Text variant="caption" className="text-center text-red-600">
          {error}
        </Text>
      )}
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
  return (
    <Box as="form" className="space-y-4">
      <Input
        label="Email address"
        variant="email"
        placeholder="you@example.com"
        autoComplete="email"
      />
      <Input
        label="Password"
        variant="password"
        placeholder="Enter your password"
        autoComplete="current-password"
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
      <Button variant="secondary" size="lg" className="w-full" type="submit">
        Sign in with Email
      </Button>
    </Box>
  );
}

EmailLogin.displayName = "EmailLogin";
