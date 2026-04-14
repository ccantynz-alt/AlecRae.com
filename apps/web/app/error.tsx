"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to monitoring (OpenTelemetry) when available
    console.error("[AlecRae] Unhandled error:", error);
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white px-6">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-red-500 rounded-full mix-blend-screen filter blur-3xl opacity-15 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-15 animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-xl">
        <h1 className="text-6xl md:text-8xl font-bold tracking-tighter bg-gradient-to-r from-white via-red-200 to-red-300 bg-clip-text text-transparent mb-4">
          Oops
        </h1>

        <p className="text-xl md:text-2xl font-light text-blue-100 mb-2">
          Something went wrong.
        </p>

        <p className="text-base text-blue-200/60 mb-10 max-w-md">
          We hit an unexpected error. This has been logged and we&apos;re on it.
        </p>

        <div className="flex gap-4">
          <button
            onClick={reset}
            className="px-6 py-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-sm font-medium text-blue-100 hover:bg-white/20 transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="px-6 py-3 rounded-full bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Go home
          </a>
        </div>

        {error.digest && (
          <p className="mt-8 text-xs text-blue-200/30 font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
