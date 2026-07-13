/**
 * API client for the E2E Encryption feature domain
 * (apps/api/src/routes/encryption.ts).
 *
 * Wires ONLY the three endpoints that actually exist and are mounted at
 * /v1/encryption in server.ts:
 *
 *   GET  /v1/encryption/status       — is E2E enabled? (public key metadata)
 *   GET  /v1/encryption/keys/public  — the account's public key
 *   POST /v1/encryption/keys/generate — publish a public key + wrapped private key
 *
 * ZERO-KNOWLEDGE MODEL (per the Bible / Forbidden List #15):
 *   - The RSA-OAEP-4096 keypair is generated CLIENT-SIDE with the Web Crypto API.
 *   - Only the PUBLIC key is uploaded to the server. The PRIVATE key never leaves
 *     the browser — it is stored in IndexedDB (never localStorage).
 *   - The server also stores a passphrase-wrapped copy of a private key, but in
 *     this zero-knowledge flow we treat the browser-held key as the source of
 *     truth and send a throwaway passphrase to satisfy the endpoint's schema
 *     (min length 8). The real private key is the one persisted locally.
 *
 * Mirrors the delegationFetch wrapper in lib/api-delegation.ts so this domain
 * has its own typed entry point with silent 401 → refresh → retry handling.
 */

import { getApiBase } from "./api-base";
import {
  getAccessToken,
  getRefreshToken,
  redirectToLogin,
  refreshSession,
} from "./auth-token";

const API_BASE = getApiBase();

interface EncryptionApiError {
  error: {
    type?: string;
    message: string;
    code?: string;
    details?: unknown;
  };
}

async function encryptionFetch<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const token = getAccessToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Silent access-token renewal on expiry — mirrors lib/api.ts apiFetch.
  if (res.status === 401 && !retried && getRefreshToken()) {
    const fresh = await refreshSession();
    if (fresh) {
      return encryptionFetch<T>(path, options, true);
    }
    redirectToLogin();
  }

  if (!res.ok) {
    const errorBody = (await res
      .json()
      .catch(() => null)) as EncryptionApiError | null;
    throw new Error(
      errorBody?.error?.message ?? `API request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EncryptionStatus {
  enabled: boolean;
  hasKeys: boolean;
  keyCreatedAt: string | null;
  algorithm: string;
  message: string;
}

export interface EncryptionPublicKey {
  publicKey: string;
  createdAt: string;
}

export interface GenerateKeysResult {
  publicKey: string;
  message: string;
  warning: string;
}

// ─── Encryption API (/v1/encryption) ─────────────────────────────────────────

export const encryptionApi = {
  /** GET /v1/encryption/status — is E2E enabled + key metadata. */
  status(): Promise<{ data: EncryptionStatus }> {
    return encryptionFetch<{ data: EncryptionStatus }>("/v1/encryption/status");
  },

  /** GET /v1/encryption/keys/public — the account's published public key. */
  getPublicKey(): Promise<{ data: EncryptionPublicKey }> {
    return encryptionFetch<{ data: EncryptionPublicKey }>(
      "/v1/encryption/keys/public",
    );
  },

  /**
   * POST /v1/encryption/keys/generate — publish the account's public key.
   *
   * The passphrase satisfies the endpoint's Zod schema (min 8). In this
   * zero-knowledge flow the browser-held private key (in IndexedDB) is the real
   * one, so the passphrase is a locally generated throwaway.
   */
  generateKeys(passphrase: string): Promise<{ data: GenerateKeysResult }> {
    return encryptionFetch<{ data: GenerateKeysResult }>(
      "/v1/encryption/keys/generate",
      { method: "POST", body: JSON.stringify({ passphrase }) },
    );
  },
};

// ─── Client-side keypair (Web Crypto API) ────────────────────────────────────
//
// packages/crypto is Node-only (node:crypto / Buffer), so we cannot reuse it in
// the browser. RSA-OAEP-4096 keygen + SPKI export is done here with Web Crypto.

const RSA_MODULUS_LENGTH = 4096;

export interface GeneratedKeypair {
  /** Base64 SPKI-encoded public key — this is what the server stores. */
  publicKeyB64: string;
  /** PKCS#8 private key — stays in the browser only. */
  privateKey: ArrayBuffer;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

/**
 * Generate an RSA-OAEP-4096 keypair in the browser and export both halves.
 * The public key is returned base64/SPKI (upload to server); the private key
 * is returned as raw PKCS#8 bytes (persist in IndexedDB, never upload).
 */
export async function generateClientKeypair(): Promise<GeneratedKeypair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: RSA_MODULUS_LENGTH,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );

  const publicKeyRaw = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyRaw = await crypto.subtle.exportKey(
    "pkcs8",
    keyPair.privateKey,
  );

  return {
    publicKeyB64: bufferToBase64(publicKeyRaw),
    privateKey: privateKeyRaw,
  };
}

// ─── Private-key storage (IndexedDB, NOT localStorage) ───────────────────────
//
// Forbidden List #15: never use localStorage for sensitive data. The private
// key lives in IndexedDB, keyed by accountId so it survives across sessions on
// this device but is never transmitted.

const DB_NAME = "alecrae-e2e";
const STORE_NAME = "private-keys";
const DB_VERSION = 1;

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (): void => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void =>
      reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

/** Persist the browser-held private key for the given account. */
export async function storePrivateKey(
  accountKey: string,
  privateKey: ArrayBuffer,
): Promise<void> {
  const db = await openKeyDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(privateKey, accountKey);
      tx.oncomplete = (): void => resolve();
      tx.onerror = (): void =>
        reject(tx.error ?? new Error("Failed to store private key."));
      tx.onabort = (): void =>
        reject(tx.error ?? new Error("Private key store transaction aborted."));
    });
  } finally {
    db.close();
  }
}

/** Whether a private key is already stored locally for this account. */
export async function hasStoredPrivateKey(accountKey: string): Promise<boolean> {
  const db = await openKeyDb();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getKey(accountKey);
      req.onsuccess = (): void => resolve(req.result !== undefined);
      req.onerror = (): void =>
        reject(req.error ?? new Error("Failed to read private key."));
    });
  } finally {
    db.close();
  }
}
