#!/usr/bin/env bun
/**
 * Generate the env vars for admin login.
 *
 * Usage:
 *   bun run scripts/generate-admin-hash.ts
 *
 * Prompts for email + password (password input is hidden) and prints the
 * three env vars to paste into Vercel / your local .env. The password
 * itself is never written to disk and never leaves your machine.
 */

import { hashPassword } from "../apps/admin/lib/auth-password";
import { randomBytes } from "node:crypto";
import * as readline from "node:readline";

function ask(question: string, hidden: boolean): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    if (!hidden) {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    // Hidden input: write the prompt, intercept stdout, capture line.
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode?.(true);
    let buffer = "";
    const onData = (ch: Buffer): void => {
      const s = ch.toString("utf8");
      for (const c of s) {
        if (c === "") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (c === "\r" || c === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          rl.close();
          process.stdout.write("\n");
          resolve(buffer);
          return;
        }
        if (c === "") {
          if (buffer.length > 0) buffer = buffer.slice(0, -1);
          continue;
        }
        buffer += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const email = (await ask("Admin email: ", false)).trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Email must contain @");
    process.exit(1);
  }
  const password = await ask("Password (hidden): ", true);
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }
  const confirm = await ask("Confirm password (hidden): ", true);
  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  const hash = hashPassword(password);
  const sessionSecret = randomBytes(32).toString("hex");

  console.log("\n# Paste these into Vercel → Settings → Environment Variables");
  console.log("# (or your local apps/admin/.env.local for development)");
  console.log("# Keep them out of the repo. ADMIN_PASSWORD_HASH is safe to share, the password is not.\n");
  console.log(`ADMIN_EMAIL=${email}`);
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`ADMIN_SESSION_SECRET=${sessionSecret}`);
  console.log("");
}

void main();
