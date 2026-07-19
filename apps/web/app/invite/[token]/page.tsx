"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Box, Text, Button, Input, Card, CardContent } from "@alecrae/ui";
import { organizationsApi } from "../../../lib/api";
import { setSession } from "../../../lib/auth-token";

interface InvitePreview {
  email: string;
  role: string;
  workspaceName: string;
  expired: boolean;
  requiresPassword: boolean;
}

export default function InviteAcceptPage(): React.ReactElement {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    organizationsApi
      .lookupInvite(token)
      .then((res) => {
        if (!cancelled) setPreview(res.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "This invitation link isn't valid.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Box className="min-h-full flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <Box className="w-full max-w-md">
        <Box className="text-center mb-8">
          <Text variant="heading-lg" className="text-brand-600 font-bold mb-2">
            AlecRae
          </Text>
          <Text variant="display-sm">You&apos;ve been invited</Text>
        </Box>

        <Card>
          <CardContent>
            {loading && (
              <Text variant="body-sm" muted>
                Checking your invitation…
              </Text>
            )}

            {!loading && loadError && (
              <Box className="space-y-4">
                <Box className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <Text variant="body-sm" className="text-red-800">
                    {loadError}
                  </Text>
                </Box>
                <Text variant="body-sm" muted>
                  Ask whoever invited you to send a fresh invitation from their workspace&apos;s Team page.
                </Text>
              </Box>
            )}

            {!loading && !loadError && preview && preview.expired && (
              <Box className="space-y-4">
                <Box className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <Text variant="body-sm" className="text-red-800">
                    This invitation for {preview.email} has expired.
                  </Text>
                </Box>
                <Text variant="body-sm" muted>
                  Ask whoever invited you to send a fresh one — invitations are valid for 7 days.
                </Text>
              </Box>
            )}

            {!loading && !loadError && preview && !preview.expired && (
              <AcceptForm token={token} preview={preview} />
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

function AcceptForm({ token, preview }: { token: string; preview: InvitePreview }): React.ReactElement {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordsValid =
    !preview.requiresPassword ||
    (password.length >= 8 && password === confirmPassword);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!passwordsValid || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await organizationsApi.acceptInvite(
        token,
        preview.requiresPassword ? password : undefined,
      );
      setSession(res.data.token, res.data.refreshToken);
      window.location.href = "/inbox";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't accept this invitation. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Box as="form" className="space-y-5" onSubmit={handleSubmit}>
      <Box className="space-y-1">
        <Text variant="body-md">
          <Text as="span" className="font-semibold">
            {preview.workspaceName}
          </Text>{" "}
          invited <Text as="span" className="font-semibold">{preview.email}</Text> to join as{" "}
          <Text as="span" className="font-semibold">{preview.role}</Text>.
        </Text>
      </Box>

      {error && (
        <Box className="p-3 rounded-lg bg-red-50 border border-red-200">
          <Text variant="body-sm" className="text-red-800">
            {error}
          </Text>
        </Box>
      )}

      {preview.requiresPassword ? (
        <Box className="space-y-4">
          <Text variant="body-sm" muted>
            Set a password to create your account and accept this invitation.
          </Text>
          <Input
            label="Password"
            variant="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
          />
          <Input
            label="Confirm password"
            variant="password"
            placeholder="Re-enter your password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
          />
          {password.length > 0 && password.length < 8 && (
            <Text variant="caption" className="text-red-700">
              Password must be at least 8 characters.
            </Text>
          )}
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <Text variant="caption" className="text-red-700">
              Passwords don&apos;t match.
            </Text>
          )}
        </Box>
      ) : (
        <Text variant="body-sm" muted>
          You already have an AlecRae account with this email — accepting adds {preview.workspaceName} to
          your workspaces and takes you straight there. Your existing password still works for future
          sign-ins.
        </Text>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={submitting || !passwordsValid}
        loading={submitting}
      >
        {submitting ? "Joining…" : `Join ${preview.workspaceName}`}
      </Button>
    </Box>
  );
}
