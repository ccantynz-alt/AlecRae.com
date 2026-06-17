"use client";

import { useEffect, useState } from "react";
import { Box, Text, Button } from "@alecrae/ui";
import { authApi, connectApi } from "../../../../lib/api";

/**
 * Google sign-in landing page.
 *
 * The API's /v1/auth/callback/google handler redirects here with the session
 * token in the URL fragment (#token=...&expiresIn=...). The fragment never
 * reaches a server, so the token stays out of access logs and Referer headers.
 * We read it client-side, persist the session, and route to the inbox.
 */
export default function GoogleCallbackPage(): React.ReactElement {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragment = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const params = new URLSearchParams(fragment);
    const token = params.get("token");
    const refreshToken = params.get("refreshToken");

    if (!token) {
      setError("We couldn't complete your Google sign-in. Please try again.");
      return;
    }

    authApi.completeGoogleSignIn(token, refreshToken);
    // Strip the token from the address bar before navigating away.
    window.history.replaceState(null, "", window.location.pathname);

    // First-run routing: a fresh sign-in with no connected email accounts
    // lands on the onboarding wizard instead of an empty inbox. If the
    // check itself fails, fail open to the inbox.
    void connectApi
      .listAccounts()
      .then(({ data }) => {
        window.location.href = data.length === 0 ? "/onboarding" : "/inbox";
      })
      .catch(() => {
        window.location.href = "/inbox";
      });
  }, []);

  return (
    <Box className="min-h-full flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <Box className="w-full max-w-md text-center">
        <Text variant="heading-lg" className="text-brand-600 font-bold mb-2">
          AlecRae
        </Text>
        {error ? (
          <Box className="space-y-4">
            <Text variant="body-md" className="text-red-800">
              {error}
            </Text>
            <Box as="a" href="/login" className="inline-block">
              <Button variant="primary" size="lg">
                Back to sign in
              </Button>
            </Box>
          </Box>
        ) : (
          <Text variant="body-md" muted>
            Signing you in…
          </Text>
        )}
      </Box>
    </Box>
  );
}

GoogleCallbackPage.displayName = "GoogleCallbackPage";
