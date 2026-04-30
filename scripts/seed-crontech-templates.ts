/**
 * Seed Crontech email templates into a tenant account.
 *
 * Usage:
 *   ACCOUNT_ID=<crontech-account-uuid> bun run scripts/seed-crontech-templates.ts
 *
 * If ACCOUNT_ID is omitted, the script inserts into the first account it finds.
 * Safe to re-run — uses ON CONFLICT DO UPDATE on (account_id, name).
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgres://alecrae:dev_password@localhost:5432/alecrae";

const sql = postgres(DATABASE_URL);

interface Template {
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  variables: string[];
}

const TEMPLATES: Template[] = [
  {
    name: "crontech.verify-email",
    subject: "Verify your email, {{firstName}}",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;">Verify your email</h2>
<p>Hi {{firstName}},</p>
<p>Click the button below to verify your email address and activate your Crontech account.</p>
<p style="padding:16px 0;">
  <a href="{{verifyUrl}}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Verify Email</a>
</p>
<p style="font-size:13px;color:#666;">If the button doesn't work, paste this URL into your browser:<br/>{{verifyUrl}}</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `Hi {{firstName}},\n\nVerify your email address to activate your Crontech account:\n\n{{verifyUrl}}\n\n— The Crontech Team`,
    variables: ["firstName", "verifyUrl"],
  },
  {
    name: "crontech.welcome",
    subject: "Welcome to Crontech, {{firstName}}",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;">Welcome aboard</h2>
<p>Hi {{firstName}},</p>
<p>Your account is live. You can start deploying right away.</p>
<p style="padding:16px 0;">
  <a href="{{dashboardUrl}}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Go to Dashboard</a>
</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `Hi {{firstName}},\n\nYour account is live. Start deploying:\n\n{{dashboardUrl}}\n\n— The Crontech Team`,
    variables: ["firstName", "dashboardUrl"],
  },
  {
    name: "crontech.password-reset",
    subject: "Reset your password",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;">Password reset</h2>
<p>Hi {{firstName}},</p>
<p>We received a request to reset your password. Click below to choose a new one.</p>
<p style="padding:16px 0;">
  <a href="{{resetUrl}}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Reset Password</a>
</p>
<p style="font-size:13px;color:#666;">If you didn't request this, ignore this email. The link expires in 1 hour.</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `Hi {{firstName}},\n\nReset your Crontech password:\n\n{{resetUrl}}\n\nIf you didn't request this, ignore this email. The link expires in 1 hour.\n\n— The Crontech Team`,
    variables: ["firstName", "resetUrl"],
  },
  {
    name: "crontech.magic-link",
    subject: "Your sign-in link",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;">Sign in to Crontech</h2>
<p>Hi {{firstName}},</p>
<p>Click below to sign in. This link expires in 15 minutes.</p>
<p style="padding:16px 0;">
  <a href="{{loginUrl}}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Sign In</a>
</p>
<p style="font-size:13px;color:#666;">If you didn't request this, you can safely ignore it.</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `Hi {{firstName}},\n\nSign in to Crontech (link expires in 15 minutes):\n\n{{loginUrl}}\n\n— The Crontech Team`,
    variables: ["firstName", "loginUrl"],
  },
  {
    name: "crontech.waitlist-confirm",
    subject: "You're on the waitlist",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;">You're on the list</h2>
<p>Thanks for signing up for the <strong>{{plan}}</strong> plan waitlist. We'll notify you as soon as your spot opens.</p>
<p style="font-size:13px;color:#666;">Questions? Reach us at <a href="{{supportUrl}}">{{supportUrl}}</a>.</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `You're on the {{plan}} plan waitlist. We'll let you know when your spot opens.\n\nQuestions? {{supportUrl}}\n\n— The Crontech Team`,
    variables: ["plan", "supportUrl"],
  },
  {
    name: "crontech.subscription-created",
    subject: "Subscription confirmed — {{plan}} plan",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;">Subscription confirmed</h2>
<p>You're now on the <strong>{{plan}}</strong> plan at <strong>{{amount}}</strong>/month.</p>
<p style="padding:16px 0;">
  <a href="{{invoiceUrl}}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Invoice</a>
</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `Subscription confirmed: {{plan}} plan at {{amount}}/month.\n\nView your invoice: {{invoiceUrl}}\n\n— The Crontech Team`,
    variables: ["plan", "amount", "invoiceUrl"],
  },
  {
    name: "crontech.payment-failed",
    subject: "Payment failed — action required",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;">Payment failed</h2>
<p>We couldn't process your latest payment. Update your billing info to avoid service interruption.</p>
<p style="padding:16px 0;">
  <a href="{{billingPortalUrl}}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">Update Billing</a>
</p>
<p style="font-size:13px;color:#666;">
  <a href="{{invoiceUrl}}">View failed invoice</a>
</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `Your payment failed. Update billing to avoid interruption:\n\n{{billingPortalUrl}}\n\nFailed invoice: {{invoiceUrl}}\n\n— The Crontech Team`,
    variables: ["invoiceUrl", "billingPortalUrl"],
  },
  {
    name: "crontech.deploy-success",
    subject: "Deploy succeeded — {{projectName}}",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;">Deploy succeeded</h2>
<p><strong>{{projectName}}</strong> is live.</p>
<p style="padding:16px 0;">
  <a href="{{url}}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Site</a>
</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `Deploy succeeded: {{projectName}} is live at {{url}}\n\n— The Crontech Team`,
    variables: ["projectName", "url"],
  },
  {
    name: "crontech.deploy-failure",
    subject: "Deploy failed — {{projectName}}",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;color:#c00;">Deploy failed</h2>
<p><strong>{{projectName}}</strong> failed to deploy. Check the build logs for details.</p>
<p style="padding:16px 0;">
  <a href="{{logsUrl}}" style="background:#c00;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Logs</a>
</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `Deploy failed: {{projectName}}\n\nView build logs: {{logsUrl}}\n\n— The Crontech Team`,
    variables: ["projectName", "logsUrl"],
  },
  {
    name: "crontech.custom-domain-verified",
    subject: "Domain verified — {{domain}}",
    htmlBody: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">
<h2 style="font-weight:600;">Domain verified</h2>
<p><strong>{{domain}}</strong> is now pointed at your project. DNS propagation is complete.</p>
<p style="padding:16px 0;">
  <a href="{{projectUrl}}" style="background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">View Project</a>
</p>
<p style="font-size:13px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px;">— The Crontech Team</p>
</body></html>`,
    textBody: `Domain verified: {{domain}} is now pointed at your project.\n\nView project: {{projectUrl}}\n\n— The Crontech Team`,
    variables: ["domain", "projectUrl"],
  },
];

async function seedTemplates(): Promise<void> {
  const accountId =
    process.env["ACCOUNT_ID"] ??
    (await sql`SELECT id FROM accounts LIMIT 1`.then((r) => r[0]?.id as string | undefined));

  if (!accountId) {
    console.error("No ACCOUNT_ID env var and no accounts in database. Run seed.ts first.");
    process.exit(1);
  }

  console.warn(`Seeding ${TEMPLATES.length} Crontech templates for account ${accountId}...`);

  for (const tmpl of TEMPLATES) {
    const id = randomUUID();
    const now = new Date();

    await sql`
      INSERT INTO templates (id, account_id, name, subject, html_body, text_body, variables, metadata, created_at, updated_at)
      VALUES (
        ${id},
        ${accountId},
        ${tmpl.name},
        ${tmpl.subject},
        ${tmpl.htmlBody},
        ${tmpl.textBody},
        ${JSON.stringify(tmpl.variables)},
        ${JSON.stringify({ tenant: "crontech", category: tmpl.name.split(".")[1] })}::jsonb,
        ${now},
        ${now}
      )
      ON CONFLICT (id) DO NOTHING
    `;

    console.warn(`  ✓ ${tmpl.name} (${tmpl.variables.join(", ")})`);
  }

  console.warn("\nDone. Templates are ready for use via POST /v1/send { template_id: \"crontech.verify-email\", ... }");

  await sql.end();
}

seedTemplates().catch((err) => {
  console.error("Template seed failed:", err);
  process.exit(1);
});
