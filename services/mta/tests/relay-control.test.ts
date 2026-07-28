/**
 * Regression test: the SMTP server was an open relay (Known Issue #105).
 *
 * `handleRcptTo` accepted ANY recipient address and answered 250 OK, with no
 * check that the domain was one we host — so the server relayed for anyone who
 * connected. It ran that way for 9 days and was actively abused (90 spam
 * messages accepted). The remediation stopped the service and added TLS and
 * per-IP throttling; neither of those is a relay control, so the hole itself
 * stayed open and was simply switched off.
 *
 * The property that matters most here is the DEFAULT: an unconfigured server
 * must refuse everything. A relay control that opens up when it has no data —
 * or when its data source is unreachable — is not a control.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'node:net';
import { SmtpServer } from '../src/smtp/server.js';

let server: SmtpServer | null = null;

afterEach(async () => {
  if (server) {
    await server.stop().catch(() => undefined);
    server = null;
  }
});

/**
 * Drive a real SMTP conversation up to RCPT TO and return the reply.
 * Exercising the socket path (rather than calling a private method) is the
 * point: this is the code an anonymous remote actually reaches.
 */
async function rcptReply(
  localDomains: readonly string[] | undefined,
  recipient: string,
): Promise<string> {
  server = new SmtpServer({
    host: '127.0.0.1',
    port: 0, // ephemeral
    hostname: 'mta.test',
    requireAuth: false,
    enableStarttls: false,
    ...(localDomains === undefined ? {} : { localDomains }),
  });

  const addr = await server.start();

  return await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: addr.port });
    const replies: string[] = [];
    let stage = 0;

    socket.setEncoding('utf8');
    socket.on('error', reject);
    socket.on('data', (chunk: string) => {
      replies.push(chunk);
      // 0: banner -> EHLO, 1: EHLO -> MAIL, 2: MAIL -> RCPT, 3: RCPT reply
      if (stage === 0) socket.write('EHLO test.example\r\n');
      else if (stage === 1) socket.write('MAIL FROM:<spammer@elsewhere.test>\r\n');
      else if (stage === 2) socket.write(`RCPT TO:<${recipient}>\r\n`);
      else if (stage === 3) {
        socket.end();
        resolve(chunk);
        return;
      }
      stage++;
    });

    setTimeout(() => {
      socket.destroy();
      reject(new Error(`timed out; got: ${replies.join('|')}`));
    }, 5000);
  });
}

describe('SMTP relay control', () => {
  it('refuses every recipient when no local domains are configured', async () => {
    // The critical default. An unconfigured deployment must not relay.
    const reply = await rcptReply(undefined, 'victim@somewhere-else.test');
    expect(reply).toContain('550');
    expect(reply.toLowerCase()).toContain('relay');
  });

  it('refuses every recipient when the configured domain list is empty', async () => {
    // Same failure mode as above, reached a different way: the DB lookup
    // returned nothing (or was unreachable and fell back to an empty list).
    const reply = await rcptReply([], 'victim@somewhere-else.test');
    expect(reply).toContain('550');
  });

  it('refuses a recipient on a domain we do not host — the open-relay case', async () => {
    const reply = await rcptReply(['alecrae.com'], 'victim@gmail.com');
    expect(reply).toContain('550');
    expect(reply.toLowerCase()).toContain('relay');
  });

  it('accepts a recipient on a hosted domain', async () => {
    const reply = await rcptReply(['alecrae.com'], 'craig@alecrae.com');
    expect(reply).toContain('250');
  });

  it('matches the hosted domain case-insensitively', async () => {
    const reply = await rcptReply(['AlecRae.com'], 'craig@ALECRAE.COM');
    expect(reply).toContain('250');
  });

  it('does NOT implicitly accept subdomains of a hosted domain', async () => {
    // Hosting example.com must not silently make us the relay for
    // anything.example.com — a subdomain an attacker may control.
    const reply = await rcptReply(['alecrae.com'], 'victim@evil.alecrae.com');
    expect(reply).toContain('550');
  });

  it('accepts a bounce subdomain only when it is explicitly hosted', async () => {
    // VERP return paths land on bounce.<domain>, so that host must be listed
    // explicitly rather than relying on subdomain matching.
    const accepted = await rcptReply(
      ['alecrae.com', 'bounce.alecrae.com'],
      'bounces+abc123@bounce.alecrae.com',
    );
    expect(accepted).toContain('250');
  });

  it('refuses a malformed recipient with no domain', async () => {
    const reply = await rcptReply(['alecrae.com'], 'nodomain');
    // Either a syntax rejection or the relay refusal — never 250.
    expect(reply).not.toContain('250');
  });
});
