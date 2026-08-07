/**
 * Structural guard: the daily DNS liveness job must stay wired into server.ts.
 *
 * services/dns exports `registerDnsLivenessJob` (BullMQ repeatable, 03:00 UTC
 * daily — pauses domains whose SPF/DKIM/DMARC records went missing) and for a
 * long time NOTHING called it, while routes/messages.ts's stale-DNS gate
 * blocked sends on exactly the domain state only this checker writes — a
 * control that existed, was assumed running by a comment, and ran nowhere
 * (the issue #143/#150 class). server.ts cannot be imported at test time (it
 * boots a server and opens connections), so this reads the source, the same
 * approach as route-auth-coverage.test.ts.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const serverSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "server.ts"),
  "utf8",
);

describe("server.ts DNS liveness job wiring", () => {
  it("imports both the register and close halves from @alecrae/dns", () => {
    expect(serverSrc).toMatch(
      /import\s*\{[^}]*registerDnsLivenessJob[^}]*\}\s*from\s*"@alecrae\/dns"/s,
    );
    expect(serverSrc).toMatch(
      /import\s*\{[^}]*closeDnsLivenessQueue[^}]*\}\s*from\s*"@alecrae\/dns"/s,
    );
  });

  it("registers the job at startup, gated on Redis being configured, with a crash guard", () => {
    // The registration awaits a Redis write for the repeatable-job config, so
    // it must (a) only run when Redis is configured — mirroring the DLQ sweep
    // — and (b) carry a .catch so a failure can never take down the API boot.
    const registration = serverSrc.match(
      /if\s*\(isRedisConfigured\(\)\)\s*\{\s*registerDnsLivenessJob\(\)\s*\.catch\(/s,
    );
    expect(
      registration,
      "server.ts must call registerDnsLivenessJob() inside an isRedisConfigured() guard with a .catch",
    ).not.toBeNull();
  });

  it("closes the liveness queue during graceful shutdown", () => {
    const shutdownBody = serverSrc.slice(serverSrc.indexOf("async function shutdown"));
    expect(shutdownBody).toContain("await closeDnsLivenessQueue()");
  });
});
