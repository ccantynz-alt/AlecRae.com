"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AlecRae] Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-white mb-2">
          Something went wrong
        </h2>

        <p className="text-sm text-blue-200/60 mb-6">
          An error occurred while loading this page. Your data is safe.
        </p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-lg bg-white/10 border border-white/20 text-sm font-medium text-blue-100 hover:bg-white/20 transition-colors"
          >
            Try again
          </button>
          <a
            href="/inbox"
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Back to Inbox
          </a>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs text-blue-200/30 font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
