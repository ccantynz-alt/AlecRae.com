"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_BOUNCY, useAlecRaeReducedMotion } from "../lib/animations";

export interface EmailSignature {
  id: string;
  name: string;
  html: string;
  isDefault: boolean;
}

const STORAGE_KEY = "alecrae_signatures";

function loadSignatures(): EmailSignature[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as EmailSignature[]) : [];
  } catch {
    return [];
  }
}

function saveSignatures(sigs: EmailSignature[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sigs));
}

function generateId(): string {
  return `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface SignatureManagerProps {
  onSelect?: (signature: EmailSignature) => void;
  mode?: "manage" | "picker";
}

export function SignatureManager({ onSelect, mode = "manage" }: SignatureManagerProps): React.ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHtml, setEditHtml] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setSignatures(loadSignatures());
  }, []);

  const persist = useCallback((sigs: EmailSignature[]) => {
    setSignatures(sigs);
    saveSignatures(sigs);
  }, []);

  const handleCreate = (): void => {
    const sig: EmailSignature = {
      id: generateId(),
      name: editName || "Untitled Signature",
      html: editHtml,
      isDefault: signatures.length === 0,
    };
    persist([...signatures, sig]);
    setCreating(false);
    setEditName("");
    setEditHtml("");
  };

  const handleUpdate = (): void => {
    if (!editingId) return;
    persist(
      signatures.map((s) =>
        s.id === editingId ? { ...s, name: editName, html: editHtml } : s,
      ),
    );
    setEditingId(null);
    setEditName("");
    setEditHtml("");
  };

  const handleDelete = (id: string): void => {
    const updated = signatures.filter((s) => s.id !== id);
    if (updated.length > 0 && !updated.some((s) => s.isDefault)) {
      updated[0]!.isDefault = true;
    }
    persist(updated);
  };

  const handleSetDefault = (id: string): void => {
    persist(
      signatures.map((s) => ({ ...s, isDefault: s.id === id })),
    );
  };

  const startEdit = (sig: EmailSignature): void => {
    setEditingId(sig.id);
    setEditName(sig.name);
    setEditHtml(sig.html);
    setCreating(false);
  };

  if (mode === "picker") {
    return (
      <div className="space-y-1">
        {signatures.length === 0 ? (
          <p className="text-xs text-content-tertiary py-2">No signatures. Create one in Settings.</p>
        ) : (
          signatures.map((sig) => (
            <button
              key={sig.id}
              type="button"
              onClick={() => onSelect?.(sig)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-secondary transition-colors"
            >
              <span className="text-sm font-medium text-content">{sig.name}</span>
              {sig.isDefault && (
                <span className="ml-2 text-xs text-brand-600 font-medium">Default</span>
              )}
            </button>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content">Email Signatures</h3>
        {!creating && !editingId && (
          <button
            type="button"
            onClick={() => { setCreating(true); setEditName(""); setEditHtml(""); }}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            + New signature
          </button>
        )}
      </div>

      <AnimatePresence>
        {(creating || editingId) && (
          <motion.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SPRING_BOUNCY}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-lg border border-border bg-surface-secondary space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Signature name (e.g., Work, Personal)"
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-surface text-content focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
              <textarea
                value={editHtml}
                onChange={(e) => setEditHtml(e.target.value)}
                placeholder="Signature content (HTML supported)&#10;&#10;Example:&#10;Best regards,&#10;John Doe&#10;CEO, Acme Inc.&#10;john@acme.com | (555) 123-4567"
                rows={6}
                className="w-full resize-none px-3 py-2 text-sm rounded-md border border-border bg-surface text-content font-mono focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
              {editHtml && (
                <div className="p-3 rounded-md border border-border bg-surface">
                  <p className="text-xs text-content-tertiary mb-1">Preview:</p>
                  <div
                    className="text-sm text-content prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: editHtml.replace(/\n/g, "<br>") }}
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setCreating(false); setEditingId(null); }}
                  className="px-3 py-1.5 text-xs text-content-secondary hover:text-content transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={editingId ? handleUpdate : handleCreate}
                  disabled={!editHtml.trim()}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {signatures.length === 0 && !creating ? (
        <p className="text-sm text-content-tertiary py-4 text-center">
          No signatures yet. Create your first signature to auto-append to emails.
        </p>
      ) : (
        <div className="space-y-2">
          {signatures.map((sig) => (
            <motion.div
              key={sig.id}
              layout
              className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface hover:bg-surface-secondary transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-content">{sig.name}</span>
                  {sig.isDefault && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-brand-50 text-brand-700 rounded">
                      Default
                    </span>
                  )}
                </div>
                <div
                  className="text-xs text-content-secondary mt-1 line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: sig.html.replace(/\n/g, " ") }}
                />
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!sig.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(sig.id)}
                    className="px-2 py-1 text-xs text-content-tertiary hover:text-brand-600 transition-colors"
                    title="Set as default"
                  >
                    Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(sig)}
                  className="px-2 py-1 text-xs text-content-tertiary hover:text-content transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(sig.id)}
                  className="px-2 py-1 text-xs text-content-tertiary hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

export function useDefaultSignature(): EmailSignature | null {
  const [sig, setSig] = useState<EmailSignature | null>(null);

  useEffect(() => {
    const signatures = loadSignatures();
    const defaultSig = signatures.find((s) => s.isDefault) ?? signatures[0] ?? null;
    setSig(defaultSig);
  }, []);

  return sig;
}
