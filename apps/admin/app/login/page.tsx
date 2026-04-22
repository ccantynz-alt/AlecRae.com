"use client";

import { useState, useCallback, useEffect } from "react";
import { Box, Text, Button, Input } from "@alecrae/ui";
import { ssoClient } from "../../lib/sso";

function SsoIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <Box as="path" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <Box as="path" d="M9 12l2 2 4-4" />
    </Box>
  );
}

function KeyIcon(): React.ReactElement {
  return (
    <Box
      as="svg"
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <Box as="path" d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </Box>
  );
}

type LoginMode = "sso" | "api-key";

export default function LoginPage(): React.ReactElement {
  const [mode, setMode] = useState<LoginMode>("sso");
  const [accountId, setAccountId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if already authenticated
  useEffect(() => {
    const session = ssoClient.isAuthenticated();
    if (session) {
      window.location.href = "/";
    }
  }, []);

  const handleSsoLogin = useCallback(async () => {
    if (!accountId.trim()) {
      setError("Account ID is required for SSO login");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await ssoClient.initiateLogin(
        accountId.trim(),
        window.location.origin,
      );
      // Redirect to IdP
      window.location.href = response.data.redirectUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "SSO login failed");
      setLoading(false);
    }
  }, [accountId]);

  const handleApiKeyLogin = useCallback(() => {
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }

    setLoading(true);
    setError(null);

    // Store the API key and redirect
    if (typeof window !== "undefined") {
      localStorage.setItem("alecrae_admin_key", apiKey.trim());
    }
    window.location.href = "/";
  }, [apiKey]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (mode === "sso") {
        void handleSsoLogin();
      } else {
        handleApiKeyLogin();
      }
    },
    [mode, handleSsoLogin, handleApiKeyLogin],
  );

  return (
    <Box className="min-h-screen flex items-center justify-center bg-surface p-4">
      <Box className="w-full max-w-md">
        {/* Logo — handwritten AR monogram in gold-on-charcoal, matching the brand mark */}
        <Box className="text-center mb-8">
          <Box className="w-20 h-20 rounded-2xl bg-[#0b0a08] flex items-center justify-center mx-auto mb-4 ring-1 ring-[#cfa630]/30">
            <Text
              as="span"
              className="text-[#cfa630] leading-none"
              style={{
                fontFamily:
                  "var(--font-italianno), 'Snell Roundhand', 'Apple Chancery', cursive",
                fontSize: "3.25rem",
                fontWeight: 400,
                letterSpacing: "-0.04em",
                paddingBottom: "0.35rem",
              }}
            >
              AR
            </Text>
          </Box>
          <Text variant="heading-lg" className="text-content font-bold">
            AlecRae Admin
          </Text>
          <Text variant="body-sm" className="text-content-secondary mt-1">
            Sign in to the administration dashboard
          </Text>
        </Box>

        {/* Login mode tabs */}
        <Box
          className="flex rounded-lg bg-surface-secondary p-1 mb-6"
          role="tablist"
          aria-label="Login method"
        >
          <Box
            as="button"
            role="tab"
            aria-selected={mode === "sso"}
            onClick={() => {
              setMode("sso");
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === "sso"
                ? "bg-surface text-content shadow-sm"
                : "text-content-secondary hover:text-content"
            }`}
          >
            <SsoIcon />
            <Text as="span" variant="body-sm" className="font-medium">
              SSO / SAML
            </Text>
          </Box>
          <Box
            as="button"
            role="tab"
            aria-selected={mode === "api-key"}
            onClick={() => {
              setMode("api-key");
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              mode === "api-key"
                ? "bg-surface text-content shadow-sm"
                : "text-content-secondary hover:text-content"
            }`}
          >
            <KeyIcon />
            <Text as="span" variant="body-sm" className="font-medium">
              API Key
            </Text>
          </Box>
        </Box>

        {/* Error message */}
        {error && (
          <Box
            className="rounded-lg bg-status-error/10 border border-status-error/30 p-3 mb-4"
            role="alert"
          >
            <Text variant="body-sm" className="text-status-error">
              {error}
            </Text>
          </Box>
        )}

        {/* Login form */}
        <Box
          as="form"
          onSubmit={handleSubmit}
          className="rounded-xl bg-surface-secondary border border-border p-6"
        >
          {mode === "sso" ? (
            <Box className="flex flex-col gap-4">
              <Box>
                <Text
                  as="label"
                  variant="body-sm"
                  className="text-content font-medium mb-1.5 block"
                >
                  Account ID
                </Text>
                <Input
                  type="text"
                  value={accountId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setAccountId(e.target.value)
                  }
                  placeholder="Enter your organization account ID"
                  aria-label="Account ID for SSO login"
                  className="w-full"
                  autoFocus
                />
                <Text
                  variant="caption"
                  className="text-content-tertiary mt-1.5"
                >
                  Your organization account ID is provided by your admin. SSO must be configured for your account.
                </Text>
              </Box>

              <Button
                type="submit"
                variant="primary"
                disabled={loading || !accountId.trim()}
                className="w-full"
              >
                {loading ? "Redirecting to identity provider..." : "Sign in with SSO"}
              </Button>
            </Box>
          ) : (
            <Box className="flex flex-col gap-4">
              <Box>
                <Text
                  as="label"
                  variant="body-sm"
                  className="text-content font-medium mb-1.5 block"
                >
                  API Key
                </Text>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setApiKey(e.target.value)
                  }
                  placeholder="em_xxxxxxxxxxxxxxxxxxxx"
                  aria-label="API key for admin login"
                  className="w-full font-mono"
                  autoFocus
                />
                <Text
                  variant="caption"
                  className="text-content-tertiary mt-1.5"
                >
                  Use an API key with admin scope. Generate one from your account settings.
                </Text>
              </Box>

              <Button
                type="submit"
                variant="primary"
                disabled={loading || !apiKey.trim()}
                className="w-full"
              >
                {loading ? "Authenticating..." : "Sign in with API Key"}
              </Button>
            </Box>
          )}
        </Box>

        {/* Help text */}
        <Box className="text-center mt-6">
          <Text variant="caption" className="text-content-tertiary">
            Need help? Contact your organization administrator or visit{" "}
            <Box
              as="a"
              href="https://docs.alecrae.com/admin/sso"
              className="text-brand-400 hover:text-brand-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              the SSO setup guide
            </Box>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
