"use client";

import { useState, useEffect } from "react";
import { Box, Text, Button, Input, Card, CardContent } from "@emailed/ui";
import { authApi } from "../../../lib/api";
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  createPasskeyCredential,
} from "../../../lib/webauthn";

export default function RegisterPage(): React.ReactElement {
  return (
    <Box className="min-h-full flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <Box className="w-full max-w-md">
        <Box className="text-center mb-8">
          <Text variant="heading-lg" className="text-brand-600 font-bold mb-2">
            Vienna
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
            <Box as="a" href="/terms" className="text-brand-600 hover:underline inline">
              <Text as="span" variant="caption">Terms of Service</Text>
            </Box>
            {" "}and{" "}
            <Box as="a" href="/privacy" className="text-brand-600 hover:underline inline">
              <Text as="span" variant="caption">Privacy Policy</Text>
            </Box>
            .
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function PasskeyRegistration(): React.ReactElement {
  const [step, setStep] = useState<"initial" | "details">("initial");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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

  const handlePasskeyRegister = async (): Promise<void> => {
    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email address.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Request a registration challenge from the server
      const challengeResponse = await authApi.passkeyRegisterChallenge({
        email: email.trim(),
        name: name.trim(),
      });

      // Step 2: Run the WebAuthn creation ceremony in the browser
      const credential = await createPasskeyCredential(challengeResponse.publicKey);

      // Step 3: Send the attestation to the server for verification
      await authApi.passkeyRegisterVerify({
        challengeId: challengeResponse.challengeId,
        credential,
        _registration: challengeResponse._registration,
      });

      // Step 4: Redirect to inbox on success
      window.location.href = "/inbox";
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Passkey creation was cancelled. Please try again.");
      } else if (err instanceof DOMException && err.name === "AbortError") {
        setError("Passkey creation timed out. Please try again.");
      } else if (err instanceof DOMException && err.name === "InvalidStateError") {
        setError("A passkey already exists for this device. Try signing in instead.");
      } else {
        setError(err instanceof Error ? err.message : "Passkey registration failed");
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
          Passkey registration is not available on this device. Please use email and password below.
        </Text>
      </Box>
    );
  }

  if (step === "initial") {
    return (
      <Box className="space-y-3">
        <Text variant="label">Fastest way to get started</Text>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={() => setStep("details")}
        >
          Register with Passkey
        </Button>
        <Text variant="caption" className="text-center">
          Create a passkey using your device biometrics. No password needed -- ever.
        </Text>
      </Box>
    );
  }

  return (
    <Box className="space-y-3">
      <Text variant="label">Create your passkey</Text>
      {error && (
        <Box className="p-3 rounded-lg bg-red-50 border border-red-200">
          <Text variant="body-sm" className="text-red-800">
            {error}
          </Text>
        </Box>
      )}
      <Input
        label="Your name"
        variant="text"
        placeholder="Jane Doe"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        label="Email address"
        variant="email"
        placeholder="you@example.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={handlePasskeyRegister}
        loading={loading}
        disabled={loading || !name.trim() || !email.trim()}
      >
        {loading ? "Creating passkey..." : "Create Passkey"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() => {
          setStep("initial");
          setError(null);
        }}
        disabled={loading}
      >
        Back
      </Button>
    </Box>
  );
}

PasskeyRegistration.displayName = "PasskeyRegistration";

function RegistrationDivider(): React.ReactElement {
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

function EmailRegistration(): React.ReactElement {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
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
        <Box className="p-3 rounded-lg bg-red-50 border border-red-200">
          <Text variant="body-sm" className="text-red-800">
            {error}
          </Text>
        </Box>
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
