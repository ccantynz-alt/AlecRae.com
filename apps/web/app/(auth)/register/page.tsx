"use client";

import { useState, useEffect } from "react";
import { authApi } from "../../../lib/api";
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  createPasskeyCredential,
} from "../../../lib/webauthn";

export default function RegisterPage(): React.ReactElement {
  return (
    <main
      className="min-h-screen bg-[#f5f4ef] text-neutral-900"
      style={{ fontFamily: "var(--font-inter), sans-serif" }}
    >
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#f5f4ef]/80 border-b border-neutral-300/40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <a
            href="/"
            className="text-2xl"
            style={{ fontFamily: "var(--font-italianno), cursive", fontWeight: 400 }}
          >
            AlecRae
          </a>
          <a
            href="/login"
            className="text-xs tracking-[0.18em] uppercase text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Sign in
          </a>
        </div>
      </nav>

      <section className="pt-32 pb-16 px-6 flex flex-col items-center">
        <h1
          className="text-[5rem] sm:text-[6.5rem] leading-[0.85] text-neutral-900 select-none"
          style={{
            fontFamily: "var(--font-italianno), 'Snell Roundhand', cursive",
            fontWeight: 400,
            letterSpacing: "-0.01em",
          }}
        >
          Create account
        </h1>
        <div className="mt-3 mb-8 w-32 h-px bg-neutral-400/50" aria-hidden="true" />
        <p className="text-sm text-neutral-600 font-light">
          Get started with AI-native email in minutes
        </p>

        <div className="mt-10 w-full max-w-md bg-white/60 backdrop-blur-sm border border-neutral-300/60 rounded-2xl p-8 shadow-sm">
          <PasskeyRegistration />
          <RegistrationDivider />
          <EmailRegistration />
        </div>

        <p className="mt-8 text-sm text-neutral-600">
          Already have an account?{" "}
          <a href="/login" className="text-neutral-900 hover:underline font-medium">
            Sign in
          </a>
        </p>

        <p className="mt-3 text-xs text-neutral-500 max-w-md text-center font-light">
          By creating an account, you agree to our{" "}
          <a href="/terms" className="text-neutral-700 hover:text-neutral-900 underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="text-neutral-700 hover:text-neutral-900 underline">
            Privacy Policy
          </a>
          .
        </p>
      </section>
    </main>
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
      const challengeResponse = await authApi.passkeyRegisterChallenge({
        email: email.trim(),
        name: name.trim(),
      });
      const credential = await createPasskeyCredential(challengeResponse.publicKey);
      await authApi.passkeyRegisterVerify({
        challengeId: challengeResponse.challengeId,
        credential,
        _registration: challengeResponse._registration,
      });
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
      <div className="space-y-3">
        <p className="text-xs tracking-[0.18em] uppercase text-neutral-500">Passkey</p>
        <p className="text-sm text-neutral-600 text-center font-light">
          Passkey registration is not available on this device. Please use email and password below.
        </p>
      </div>
    );
  }

  if (step === "initial") {
    return (
      <div className="space-y-4">
        <p className="text-xs tracking-[0.18em] uppercase text-neutral-500">
          Fastest way to get started
        </p>
        <button
          type="button"
          onClick={() => setStep("details")}
          className="w-full text-xs tracking-[0.18em] uppercase bg-neutral-900 text-[#f5f4ef] px-5 py-3.5 rounded-full hover:bg-neutral-800 transition-colors"
        >
          Register with Passkey
        </button>
        <p className="text-xs text-neutral-500 text-center font-light">
          Create a passkey using your device biometrics. No password needed — ever.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs tracking-[0.18em] uppercase text-neutral-500">
        Create your passkey
      </p>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      <FieldLabel htmlFor="passkey-name">Your name</FieldLabel>
      <input
        id="passkey-name"
        type="text"
        autoComplete="name"
        placeholder="Jane Doe"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full bg-transparent border border-neutral-300/70 rounded-lg px-4 py-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
      />
      <FieldLabel htmlFor="passkey-email">Email address</FieldLabel>
      <input
        id="passkey-email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full bg-transparent border border-neutral-300/70 rounded-lg px-4 py-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
      />
      <button
        type="button"
        onClick={handlePasskeyRegister}
        disabled={loading || !name.trim() || !email.trim()}
        className="w-full text-xs tracking-[0.18em] uppercase bg-neutral-900 text-[#f5f4ef] px-5 py-3.5 rounded-full hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Creating passkey…" : "Create Passkey"}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep("initial");
          setError(null);
        }}
        disabled={loading}
        className="w-full text-xs tracking-[0.18em] uppercase text-neutral-500 hover:text-neutral-900 transition-colors py-2 disabled:opacity-50"
      >
        Back
      </button>
    </div>
  );
}

function RegistrationDivider(): React.ReactElement {
  return (
    <div className="my-7 flex items-center gap-4">
      <div className="flex-1 h-px bg-neutral-300/70" />
      <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-500">
        or register with email
      </span>
      <div className="flex-1 h-px bg-neutral-300/70" />
    </div>
  );
}

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
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="first-name">First name</FieldLabel>
          <input
            id="first-name"
            type="text"
            autoComplete="given-name"
            placeholder="Jane"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full bg-transparent border border-neutral-300/70 rounded-lg px-4 py-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
          />
        </div>
        <div>
          <FieldLabel htmlFor="last-name">Last name</FieldLabel>
          <input
            id="last-name"
            type="text"
            autoComplete="family-name"
            placeholder="Doe"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full bg-transparent border border-neutral-300/70 rounded-lg px-4 py-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
          />
        </div>
      </div>
      <FieldLabel htmlFor="reg-email">Email address</FieldLabel>
      <input
        id="reg-email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full bg-transparent border border-neutral-300/70 rounded-lg px-4 py-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
      />
      <FieldLabel htmlFor="reg-password">Password</FieldLabel>
      <input
        id="reg-password"
        type="password"
        autoComplete="new-password"
        placeholder="Create a strong password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full bg-transparent border border-neutral-300/70 rounded-lg px-4 py-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
      />
      <p className="text-xs text-neutral-500 font-light -mt-2">
        Must be at least 8 characters.
      </p>
      <button
        type="submit"
        disabled={loading || !firstName || !email || !password}
        className="w-full text-xs tracking-[0.18em] uppercase border border-neutral-900 text-neutral-900 px-5 py-3.5 rounded-full hover:bg-neutral-900 hover:text-[#f5f4ef] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-900"
      >
        {loading ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs tracking-[0.18em] uppercase text-neutral-500 mb-1"
    >
      {children}
    </label>
  );
}
