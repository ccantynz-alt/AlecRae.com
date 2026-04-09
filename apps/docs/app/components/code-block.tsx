"use client";

import { useState, useCallback } from "react";

interface CodeBlockProps {
  readonly code: string;
  readonly language: string;
  readonly title?: string;
}

export function CodeBlock({ code, language, title }: CodeBlockProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((): void => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout((): void => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="rounded-xl bg-slate-900/80 border border-white/10 overflow-hidden my-4">
      {title ? (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-white/10">
          <span className="text-xs font-medium text-blue-200/60 uppercase tracking-wider">{title}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-200/40 font-mono">{language}</span>
            <button
              onClick={handleCopy}
              className="text-xs text-blue-200/50 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-200/40 font-mono">{language}</span>
            <button
              onClick={handleCopy}
              className="text-xs text-blue-200/50 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
              type="button"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      <pre className="px-4 py-3 overflow-x-auto text-sm leading-relaxed">
        <code className="text-cyan-200 font-mono">{code}</code>
      </pre>
    </div>
  );
}
