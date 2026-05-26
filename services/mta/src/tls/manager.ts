/**
 * TLS Certificate Manager
 * Handles certificate loading, STARTTLS context creation, and certificate lifecycle.
 */

import * as tls from "node:tls";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import type * as netTypes from "node:net";
import type { TlsCertificate, TlsManagerConfig, Result } from "../types.js";
import { ok, err } from "../types.js";

export class TlsManager {
  private readonly config: TlsManagerConfig;
  private readonly certificates = new Map<string, TlsCertificate>();
  private secureContextCache = new Map<string, tls.SecureContext>();
  private renewalTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(config: TlsManagerConfig) {
    this.config = config;
  }

  /**
   * Load a TLS certificate from disk for a given domain.
   */
  loadCertificate(domain: string, keyPath: string, certPath: string, caPath?: string): Result<TlsCertificate> {
    try {
      const keyData = fs.readFileSync(keyPath, "utf-8");
      const certData = fs.readFileSync(certPath, "utf-8");
      const caData = caPath ? fs.readFileSync(caPath, "utf-8") : undefined;

      const certInfo = this.parseCertificateInfo(certData);
      if (!certInfo.ok) {
        return err(certInfo.error);
      }

      const certificate: TlsCertificate = {
        domain,
        keyPath,
        certPath,
        ...(caPath !== undefined ? { caPath } : {}),
        expiresAt: certInfo.value.expiresAt,
        issuedAt: certInfo.value.issuedAt,
        issuer: certInfo.value.issuer,
        fingerprint: certInfo.value.fingerprint,
      };

      this.certificates.set(domain, certificate);

      // Build and cache the secure context
      const ctx = tls.createSecureContext({
        key: keyData,
        cert: certData,
        ca: caData,
        minVersion: this.config.defaultMinVersion,
      });
      this.secureContextCache.set(domain, ctx);

      // Schedule renewal check
      this.scheduleRenewalCheck(domain, certificate);

      return ok(certificate);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get a TLS secure context for a given domain.
   * Falls back to default context if domain-specific one is not available.
   */
  getSecureContext(domain: string): tls.SecureContext | null {
    return this.secureContextCache.get(domain) ?? this.secureContextCache.get("default") ?? null;
  }

  /**
   * Create TLS options suitable for use with a net.Server upgrade (STARTTLS).
   */
  createTlsOptions(domain?: string): tls.TlsOptions | null {
    const cert = domain
      ? this.certificates.get(domain) ?? this.certificates.get("default")
      : this.certificates.get("default");

    if (!cert) return null;

    try {
      const options: tls.TlsOptions = {
        key: fs.readFileSync(cert.keyPath),
        cert: fs.readFileSync(cert.certPath),
        minVersion: this.config.defaultMinVersion,
        honorCipherOrder: true,
        ciphers: [
          "TLS_AES_256_GCM_SHA384",
          "TLS_CHACHA20_POLY1305_SHA256",
          "TLS_AES_128_GCM_SHA256",
          "ECDHE-ECDSA-AES256-GCM-SHA384",
          "ECDHE-RSA-AES256-GCM-SHA384",
          "ECDHE-ECDSA-CHACHA20-POLY1305",
          "ECDHE-RSA-CHACHA20-POLY1305",
        ].join(":"),
      };

      if (cert.caPath) {
        options.ca = fs.readFileSync(cert.caPath);
      }

      return options;
    } catch {
      return null;
    }
  }

  /**
   * Create a TLS server socket by upgrading an existing plain socket.
   */
  upgradeToTls(
    socket: netTypes.Socket,
    domain?: string,
  ): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const options = this.createTlsOptions(domain);
      if (!options) {
        reject(new Error(`No TLS certificate available for domain: ${domain ?? "default"}`));
        return;
      }

      const tlsSocket = new tls.TLSSocket(socket, {
        ...options,
        isServer: true,
      });

      tlsSocket.on("secure", () => {
        resolve(tlsSocket);
      });

      tlsSocket.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Create a TLS client connection to a remote server (for outbound delivery).
   */
  createClientConnection(
    host: string,
    port: number,
    options?: { rejectUnauthorized?: boolean; servername?: string },
  ): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        {
          host,
          port,
          servername: options?.servername ?? host,
          rejectUnauthorized: options?.rejectUnauthorized ?? true,
          minVersion: this.config.defaultMinVersion,
        },
        () => {
          if (socket.authorized || options?.rejectUnauthorized === false) {
            resolve(socket);
          } else {
            reject(new Error(`TLS authorization failed: ${socket.authorizationError}`));
          }
        },
      );

      socket.on("error", reject);
    });
  }

  /**
   * Upgrade an existing client socket to TLS (STARTTLS for outbound).
   */
  upgradeClientToTls(
    socket: netTypes.Socket,
    host: string,
    options?: { rejectUnauthorized?: boolean },
  ): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const tlsSocket = tls.connect(
        {
          socket,
          servername: host,
          rejectUnauthorized: options?.rejectUnauthorized ?? true,
          minVersion: this.config.defaultMinVersion,
        },
        () => {
          if (tlsSocket.authorized || options?.rejectUnauthorized === false) {
            resolve(tlsSocket);
          } else {
            reject(new Error(`TLS authorization failed: ${tlsSocket.authorizationError}`));
          }
        },
      );

      tlsSocket.on("error", reject);
    });
  }

  /**
   * Check if a certificate is expiring soon.
   */
  isCertificateExpiringSoon(domain: string): boolean {
    const cert = this.certificates.get(domain);
    if (!cert) return false;

    const daysUntilExpiry = (cert.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry <= this.config.autoRenewDays;
  }

  /**
   * Get certificate info for a domain.
   */
  getCertificate(domain: string): TlsCertificate | null {
    return this.certificates.get(domain) ?? null;
  }

  /**
   * List all loaded certificates.
   */
  listCertificates(): TlsCertificate[] {
    return Array.from(this.certificates.values());
  }

  /**
   * Generate a self-signed certificate for development/testing.
   */
  static generateSelfSigned(_domain: string): { key: string; cert: string } {
    // Use Node's crypto to generate a self-signed cert
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // For a real self-signed cert we'd need an ASN.1 library.
    // In production, use a proper CA. This returns the key pair for use
    // with external cert generation tools.
    return { key: privateKey, cert: publicKey };
  }

  /**
   * Cleanup all timers and cached contexts.
   */
  destroy(): void {
    for (const timer of this.renewalTimers.values()) {
      clearTimeout(timer);
    }
    this.renewalTimers.clear();
    this.secureContextCache.clear();
    this.certificates.clear();
  }

  private parseCertificateInfo(certPem: string): Result<{
    expiresAt: Date;
    issuedAt: Date;
    issuer: string;
    fingerprint: string;
  }> {
    try {
      // Compute fingerprint from the PEM data
      const derMatch = certPem.match(
        /-----BEGIN CERTIFICATE-----\s*([\s\S]*?)\s*-----END CERTIFICATE-----/,
      );

      if (!derMatch?.[1]) {
        return err(new Error("Invalid PEM certificate format"));
      }

      const derBuffer = Buffer.from(derMatch[1].replace(/\s/g, ""), "base64");
      const fingerprint = crypto.createHash("sha256").update(derBuffer).digest("hex");

      // Use a X509Certificate if available (Node 15+)
      const x509 = new crypto.X509Certificate(certPem);
      return ok({
        expiresAt: new Date(x509.validTo),
        issuedAt: new Date(x509.validFrom),
        issuer: x509.issuer,
        fingerprint,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private scheduleRenewalCheck(domain: string, cert: TlsCertificate): void {
    // Clear existing timer
    const existing = this.renewalTimers.get(domain);
    if (existing) clearTimeout(existing);

    const msUntilRenewalCheck = Math.max(
      0,
      cert.expiresAt.getTime() - Date.now() - this.config.autoRenewDays * 24 * 60 * 60 * 1000,
    );

    // Cap at 24 hours to avoid overflow
    const checkInterval = Math.min(msUntilRenewalCheck, 24 * 60 * 60 * 1000);

    const timer = setTimeout(() => {
      if (this.isCertificateExpiringSoon(domain)) {
        console.warn(`[TLS] Certificate for ${domain} expires at ${cert.expiresAt.toISOString()} — renewal needed`);
        // In production, trigger ACME renewal here
      }
    }, checkInterval);

    // Don't hold the process open for renewal checks
    timer.unref();
    this.renewalTimers.set(domain, timer);
  }
}
