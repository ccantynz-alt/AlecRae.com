"use client";

import { useEffect, useState } from "react";
import { Box, Text, Button } from "@alecrae/ui";
import { authApi } from "../../../../lib/api";

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

    if (!token) {
      setError("We couldn't complete your Google sign-in. Please try again.");
      return;
    }

    authApi.completeGoogleSignIn(token);
    // Strip the token from the address bar before navigating away.
    window.history.replaceState(null, "", window.location.pathname);
    window.location.href = "/inbox";
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
