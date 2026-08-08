/**
 * Vapron REST relay provider (issue #171).
 *
 * AlecRae does not deliver to the internet itself — it relays outbound mail
 * through Vapron's send API (POST /v1/messages). These tests pin:
 *   - config parsing (url + token required; other providers unaffected);
 *   - the HTTP-status → delivery-outcome mapping, whose semantics INVERT
 *     SMTP's (4xx permanent, 5xx transient) — the load-bearing behaviour;
 *   - the request: bearer token present, body mapped from the raw MIME with
 *     the header From (not the VERP return-path) as the Vapron `from`;
 *   - attachments encoded as contentBase64;
 *   - that the token is never logged.
 *
 * The HTTP transport is injected, so no network is touched.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  RelayClient,
  relayConfigFromEnv,
  buildVapronMessage,
  type RelayFetch,
  type RelayFetchResponse,
} from "../src/relay/relay.js";
import { relayFailureOutcome } from "../src/delivery/routing.js";

const TOKEN = "btf_sk_supersecret_token_value";
const URL_BASE = "http://100.89.227.39:8787";

interface RecordedCall {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
}

/** A transport that records its calls and returns a canned response. */
function stubFetch(
  status: number,
  bodyText = "",
): { fetch: RelayFetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetch: RelayFetch = async (url, init) => {
    calls.push({ url, init });
    const resp: RelayFetchResponse = { status, text: async () => bodyText };
    return resp;
  };
  return { fetch, calls };
}

/** A transport that always throws — network/DNS/connection failure. */
const throwingFetch: RelayFetch = async () => {
  throw new Error("ECONNREFUSED 100.89.227.39:8787");
};

function vapronClient(fetch: RelayFetch): RelayClient {
  return new RelayClient(
    { provider: "vapron", vapron: { url: URL_BASE, token: TOKEN } },
    { fetch },
  );
}

const SIMPLE_MESSAGE = [
  "From: Info <info@davenroe.com>",
  "To: Alice <alice@example.com>",
  "Subject: Hello there",
  "Message-ID: <m1@davenroe.com>",
  "DKIM-Signature: v=1; a=rsa-sha256; d=davenroe.com; s=sel; b=abc",
  "X-Campaign: launch",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hello body text",
].join("\r\n");

const RETURN_PATH = "bounces+abc123@bounce.davenroe.com";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env["RELAY_PROVIDER"];
  delete process.env["VAPRON_EMAIL_SEND_URL"];
  delete process.env["VAPRON_EMAIL_SEND_TOKEN"];
});

// ─── Config parsing ─────────────────────────────────────────────────────────

describe("Vapron relay — config", () => {
  it("parses url + token from the environment when RELAY_PROVIDER=vapron", () => {
    process.env["RELAY_PROVIDER"] = "vapron";
    process.env["VAPRON_EMAIL_SEND_URL"] = URL_BASE;
    process.env["VAPRON_EMAIL_SEND_TOKEN"] = TOKEN;

    const config = relayConfigFromEnv();
    expect(config.provider).toBe("vapron");
    expect(config.vapron).toEqual({ url: URL_BASE, token: TOKEN });
    // A well-formed config constructs without throwing.
    expect(() => new RelayClient(config)).not.toThrow();
  });

  it("rejects a vapron config missing the URL with a clear error", () => {
    expect(
      () => new RelayClient({ provider: "vapron", vapron: { url: "", token: TOKEN } }),
    ).toThrow(/VAPRON_EMAIL_SEND_URL is required/);
  });

  it("rejects a vapron config missing the token with a clear error", () => {
    expect(
      () => new RelayClient({ provider: "vapron", vapron: { url: URL_BASE, token: "" } }),
    ).toThrow(/VAPRON_EMAIL_SEND_TOKEN is required/);
  });

  it("leaves other providers unaffected — smtp still constructs", () => {
    process.env["RELAY_PROVIDER"] = "smtp";
    const config = relayConfigFromEnv();
    expect(config.provider).toBe("smtp");
    expect(config.vapron).toBeUndefined();
    expect(() => new RelayClient(config)).not.toThrow();
  });
});

// ─── Status → outcome mapping ───────────────────────────────────────────────

describe("Vapron relay — status mapping", () => {
  it("treats 202 as success and extracts the message id", async () => {
    const { fetch } = stubFetch(202, JSON.stringify({ id: "vap_msg_123" }));
    const client = vapronClient(fetch);
    const result = await client.send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("vap_msg_123");
    // The worker records the path as `relay:${provider}` — pin the provider.
    expect(client.provider).toBe("vapron");
  });

  it("treats 202 with an empty/non-JSON body as success (no message id)", async () => {
    const { fetch } = stubFetch(202, "");
    const result = await vapronClient(fetch).send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE);
    expect(result.success).toBe(true);
    expect(result.messageId).toBeUndefined();
  });

  it("maps 403 to a permanent FROM-not-verified failure (bounce, not retry)", async () => {
    const { fetch } = stubFetch(403, "domain not verified");
    const result = await vapronClient(fetch).send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(result.error?.toLowerCase()).toContain("not verified");
    // Permanent → bounce in BOTH modes; there is no retry that succeeds.
    expect(relayFailureOutcome({ mode: "all", error: result.error, permanent: result.permanent })).toBe("bounced");
    expect(relayFailureOutcome({ mode: "overflow", error: result.error, permanent: result.permanent })).toBe("bounced");
  });

  it("maps 401 to a permanent, distinct config error", async () => {
    const { fetch } = stubFetch(401, "unauthorized");
    const result = await vapronClient(fetch).send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(result.error).toMatch(/401/);
    expect(result.error?.toLowerCase()).toContain("token");
    expect(relayFailureOutcome({ mode: "all", error: result.error, permanent: result.permanent })).toBe("bounced");
  });

  it("maps 422 to a permanent, distinct validation error", async () => {
    const { fetch } = stubFetch(422, JSON.stringify({ error: "subject required" }));
    const result = await vapronClient(fetch).send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(result.error).toMatch(/422/);
    expect(result.error?.toLowerCase()).toContain("validation");
  });

  it("maps a 5xx to a TRANSIENT failure — deferred, not bounced", async () => {
    // The inversion that the SMTP 5xx heuristic gets wrong: a Vapron 500 is a
    // gateway blip, and the "500" in the error must NOT be read as permanent.
    const { fetch } = stubFetch(500, "internal error");
    const result = await vapronClient(fetch).send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(false);
    expect(relayFailureOutcome({ mode: "all", error: result.error, permanent: result.permanent })).toBe("deferred");
  });

  it("maps a network/connection error to a TRANSIENT failure", async () => {
    const result = await vapronClient(throwingFetch).send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(false);
    expect(result.error).toContain("Vapron request failed");
    expect(relayFailureOutcome({ mode: "all", error: result.error, permanent: result.permanent })).toBe("deferred");
  });
});

// ─── Request shape ──────────────────────────────────────────────────────────

describe("Vapron relay — request", () => {
  it("POSTs to /v1/messages with the bearer token and JSON content type", async () => {
    const { fetch, calls } = stubFetch(202, "{}");
    await vapronClient(fetch).send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE, {
      tenantId: "acct_9",
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) return;

    expect(call.url).toBe(`${URL_BASE}/v1/messages`);
    expect(call.init.method).toBe("POST");
    expect(call.init.headers["Authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(call.init.headers["Content-Type"]).toBe("application/json");
  });

  it("maps the body from the raw MIME — header From, not the VERP return-path", async () => {
    const { fetch, calls } = stubFetch(202, "{}");
    await vapronClient(fetch).send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE, {
      tenantId: "acct_9",
    });

    const body = JSON.parse(calls[0]?.init.body ?? "{}") as Record<string, unknown>;
    // The return-path lives on bounce.davenroe.com; the Vapron `from` must be
    // the real verified sender from the From header, or Vapron 403s.
    expect(body["from"]).toBe("info@davenroe.com");
    expect(body["from"]).not.toContain("bounce.");
    expect(body["to"]).toEqual(["alice@example.com"]);
    expect(body["subject"]).toBe("Hello there");
    expect(body["text"]).toContain("Hello body text");
    expect(body["tenantId"]).toBe("acct_9");
    // Custom header forwarded (parser normalises names to lower-case, which is
    // fine — header names are case-insensitive); DKIM + structural headers are
    // dropped so Vapron re-composes and re-signs cleanly.
    expect(body["headers"]).toMatchObject({ "x-campaign": "launch" });
    const headers = body["headers"] as Record<string, string>;
    expect(headers["dkim-signature"]).toBeUndefined();
    expect(headers["from"]).toBeUndefined();
    expect(headers["content-type"]).toBeUndefined();
  });

  it("encodes an attachment as contentBase64", async () => {
    const withAttachment = [
      "From: info@davenroe.com",
      "To: alice@example.com",
      "Subject: With attachment",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="BOUND"',
      "",
      "--BOUND",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "see attached",
      "--BOUND",
      'Content-Type: text/plain; name="a.txt"',
      'Content-Disposition: attachment; filename="a.txt"',
      "Content-Transfer-Encoding: base64",
      "",
      "aGVsbG8=", // "hello"
      "--BOUND--",
      "",
    ].join("\r\n");

    const { fetch, calls } = stubFetch(202, "{}");
    await vapronClient(fetch).send(RETURN_PATH, ["alice@example.com"], withAttachment);

    const body = JSON.parse(calls[0]?.init.body ?? "{}") as Record<string, unknown>;
    const attachments = body["attachments"] as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.["filename"]).toBe("a.txt");
    expect(attachments[0]?.["contentBase64"]).toBe("aGVsbG8=");
    expect(attachments[0]?.["contentType"]).toContain("text/plain");
  });

  it("never logs the token (401 path)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { fetch } = stubFetch(401, "unauthorized");
    const result = await vapronClient(fetch).send(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE);

    // It is loud (logs), but never with the secret value.
    expect(errSpy).toHaveBeenCalled();
    for (const call of errSpy.mock.calls) {
      expect(call.join(" ")).not.toContain(TOKEN);
    }
    // The returned error is safe to persist to delivery_results too.
    expect(result.error).not.toContain(TOKEN);
  });
});

// ─── buildVapronMessage (pure mapping) ──────────────────────────────────────

describe("buildVapronMessage", () => {
  it("splits envelope recipients back into To / Cc / Bcc", () => {
    const raw = [
      "From: info@davenroe.com",
      "To: alice@example.com",
      "Cc: bob@example.com",
      "Subject: Split",
      "Content-Type: text/plain",
      "",
      "hi",
    ].join("\r\n");

    // carol is a Bcc — present in the envelope but in no header.
    const body = buildVapronMessage(
      RETURN_PATH,
      ["alice@example.com", "bob@example.com", "carol@example.com"],
      raw,
    );
    expect(body).not.toBeNull();
    expect(body?.to).toEqual(["alice@example.com"]);
    expect(body?.cc).toEqual(["bob@example.com"]);
    expect(body?.bcc).toEqual(["carol@example.com"]);
  });

  it("puts everyone in `to` when no header To is among the envelope recipients", () => {
    const raw = [
      "From: info@davenroe.com",
      "To: someone-not-in-this-batch@example.com",
      "Subject: All bcc",
      "Content-Type: text/plain",
      "",
      "hi",
    ].join("\r\n");

    const body = buildVapronMessage(RETURN_PATH, ["carol@example.com"], raw);
    expect(body?.to).toEqual(["carol@example.com"]);
    expect(body?.cc).toBeUndefined();
    expect(body?.bcc).toBeUndefined();
  });

  it("returns null when the message has no From address", () => {
    const raw = ["To: alice@example.com", "Subject: No from", "", "body"].join("\r\n");
    expect(buildVapronMessage(RETURN_PATH, ["alice@example.com"], raw)).toBeNull();
  });

  it("omits tenantId when none is supplied", () => {
    const body = buildVapronMessage(RETURN_PATH, ["alice@example.com"], SIMPLE_MESSAGE);
    expect(body?.tenantId).toBeUndefined();
  });
});
