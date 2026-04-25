"use client";

import { useState, useEffect } from "react";
import { authApi } from "../../../lib/api";
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  getPasskeyAssertion,
} from "../../../lib/webauthn";

export default function LoginPage(): React.ReactElement {
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
            href="/register"
            className="text-xs tracking-[0.18em] uppercase text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Create account
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
          Welcome back
        </h1>
        <div className="mt-3 mb-8 w-32 h-px bg-neutral-400/50" aria-hidden="true" />
        <p className="text-sm text-neutral-600 font-light">
          Sign in to your account
        </p>

        <div className="mt-10 w-full max-w-md bg-white/60 backdrop-blur-sm border border-neutral-300/60 rounded-2xl p-8 shadow-sm">
          <PasskeyLogin />
          <Divider />
          <EmailLogin />
        </div>

        <p className="mt-8 text-sm text-neutral-600">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-neutral-900 hover:underline font-medium">
            Create one
          </a>
        </p>
      </section>
    </main>
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
      <div className="space-y-3">
        <p className="text-xs tracking-[0.18em] uppercase text-neutral-500">Passkey</p>
        <p className="text-sm text-neutral-600 text-center font-light">
          Passkey authentication is not available on this device. Please use email and password.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs tracking-[0.18em] uppercase text-neutral-500">Recommended</p>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      <button
        type="button"
        onClick={handlePasskeyLogin}
        disabled={loading}
        className="w-full text-xs tracking-[0.18em] uppercase bg-neutral-900 text-[#f5f4ef] px-5 py-3.5 rounded-full hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Authenticating…" : "Sign in with Passkey"}
      </button>
      <p className="text-xs text-neutral-500 text-center font-light">
        Use your fingerprint, face, or security key for instant secure access.
      </p>
    </div>
  );
}

function Divider(): React.ReactElement {
  return (
    <div className="my-7 flex items-center gap-4">
      <div className="flex-1 h-px bg-neutral-300/70" />
      <span className="text-[10px] tracking-[0.2em] uppercase text-neutral-500">
        or continue with email
      </span>
      <div className="flex-1 h-px bg-neutral-300/70" />
    </div>
  );
}

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
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      <FieldLabel htmlFor="email">Email address</FieldLabel>
      <input
        id="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full bg-transparent border border-neutral-300/70 rounded-lg px-4 py-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
      />
      <FieldLabel htmlFor="password">Password</FieldLabel>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full bg-transparent border border-neutral-300/70 rounded-lg px-4 py-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 transition-colors"
      />
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-sm text-neutral-600 font-light">
          <input
            type="checkbox"
            className="rounded border-neutral-400 text-neutral-900 focus:ring-neutral-900"
          />
          Remember me
        </label>
        <a
          href="/forgot-password"
          className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          Forgot password?
        </a>
      </div>
      <button
        type="submit"
        disabled={loading || !email || !password}
        className="w-full text-xs tracking-[0.18em] uppercase border border-neutral-900 text-neutral-900 px-5 py-3.5 rounded-full hover:bg-neutral-900 hover:text-[#f5f4ef] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-900"
      >
        {loading ? "Signing in…" : "Sign in with Email"}
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
