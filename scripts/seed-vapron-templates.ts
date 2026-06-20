/**
 * Seed the 10 Vapron platform email templates into AlecRae.
 *
 * Usage:
 *   ACCOUNT_ID=<vapron-account-id> bun run scripts/seed-vapron-templates.ts
 *
 * The ACCOUNT_ID is printed by scripts/seed.ts when the Vapron account is created.
 * Templates are upserted (safe to re-run).
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgres://alecrae:dev_password@localhost:5432/alecrae";

const ACCOUNT_ID = process.env["ACCOUNT_ID"];
if (!ACCOUNT_ID) {
  console.error("Error: ACCOUNT_ID env var is required.");
  console.error("  ACCOUNT_ID=<id> bun run scripts/seed-vapron-templates.ts");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

interface Template {
  name: string;
  subject: string;
  variables: string[];
  html: string;
  text: string;
}

const VAPRON_TEMPLATES: Template[] = [
  {
    name: "vapron.verify-email",
    subject: "Verify your email address",
    variables: ["firstName", "verifyUrl"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>Verify your email, {{firstName}}</h2>
<p>Click the button below to verify your email address and activate your Vapron account.</p>
<p><a href="{{verifyUrl}}" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Verify Email</a></p>
<p style="color:#666;font-size:13px">This link expires in 24 hours. If you didn't create a Vapron account, you can safely ignore this email.</p>
</body></html>`,
    text: `Verify your email, {{firstName}}\n\nClick the link below to verify your email address:\n\n{{verifyUrl}}\n\nThis link expires in 24 hours.`,
  },
  {
    name: "vapron.welcome",
    subject: "Welcome to Vapron",
    variables: ["firstName"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>Welcome to Vapron, {{firstName}} 👋</h2>
<p>Your account is ready. You can now deploy apps, manage domains, and send emails — all from one place.</p>
<p><a href="https://vapron.ai/dashboard" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Go to Dashboard</a></p>
<p style="color:#666;font-size:13px">Questions? Reply to this email and we'll get back to you.</p>
</body></html>`,
    text: `Welcome to Vapron, {{firstName}}!\n\nYour account is ready. Go to your dashboard:\nhttps://vapron.ai/dashboard\n\nQuestions? Just reply to this email.`,
  },
  {
    name: "vapron.password-reset",
    subject: "Reset your password",
    variables: ["firstName", "resetUrl"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>Password reset, {{firstName}}</h2>
<p>We received a request to reset your Vapron password. Click the button below to choose a new one.</p>
<p><a href="{{resetUrl}}" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a></p>
<p style="color:#666;font-size:13px">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
</body></html>`,
    text: `Password reset, {{firstName}}\n\nReset your Vapron password:\n\n{{resetUrl}}\n\nThis link expires in 1 hour.`,
  },
  {
    name: "vapron.magic-link",
    subject: "Your sign-in link",
    variables: ["firstName", "magicUrl"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>Sign in to Vapron</h2>
<p>Hi {{firstName}}, here's your magic sign-in link. It works once and expires in 15 minutes.</p>
<p><a href="{{magicUrl}}" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Sign In</a></p>
<p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore it — your account is secure.</p>
</body></html>`,
    text: `Sign in to Vapron, {{firstName}}\n\nYour magic link (expires in 15 minutes):\n\n{{magicUrl}}\n\nIf you didn't request this, ignore this email.`,
  },
  {
    name: "vapron.waitlist-confirm",
    subject: "You're on the Vapron waitlist",
    variables: ["firstName", "position"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>You're in, {{firstName}}</h2>
<p>You've been added to the Vapron waitlist. Your position: <strong>#{{position}}</strong>.</p>
<p>We'll email you the moment your spot opens up. In the meantime, sharing your referral link bumps you up the queue.</p>
<p style="color:#666;font-size:13px">Thanks for your patience — we're building something worth waiting for.</p>
</body></html>`,
    text: `You're on the Vapron waitlist, {{firstName}}!\n\nYour position: #{{position}}\n\nWe'll email you as soon as your spot opens up.`,
  },
  {
    name: "vapron.subscription-created",
    subject: "Subscription confirmed",
    variables: ["firstName", "planName", "amount"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>Subscription confirmed, {{firstName}}</h2>
<p>You're now on the <strong>{{planName}}</strong> plan. Your first charge of <strong>{{amount}}</strong> has been processed.</p>
<p>Your full feature set is unlocked. Head to your dashboard to explore everything.</p>
<p><a href="https://vapron.ai/dashboard" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Go to Dashboard</a></p>
<p style="color:#666;font-size:13px">You can manage your subscription at any time from Account → Billing.</p>
</body></html>`,
    text: `Subscription confirmed, {{firstName}}\n\nPlan: {{planName}}\nCharge: {{amount}}\n\nManage your subscription at: https://vapron.ai/dashboard/billing`,
  },
  {
    name: "vapron.payment-failed",
    subject: "Action required: payment failed",
    variables: ["firstName", "amount", "updateUrl"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>Payment failed, {{firstName}}</h2>
<p>We were unable to charge <strong>{{amount}}</strong> for your Vapron subscription. Please update your payment method to keep your account active.</p>
<p><a href="{{updateUrl}}" style="display:inline-block;background:#c0392b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Update Payment Method</a></p>
<p style="color:#666;font-size:13px">We'll retry the charge in 3 days. If payment continues to fail, your account will be downgraded to the free plan.</p>
</body></html>`,
    text: `Payment failed, {{firstName}}\n\nWe couldn't charge {{amount}} for your Vapron subscription.\n\nUpdate your payment method:\n{{updateUrl}}\n\nWe'll retry in 3 days.`,
  },
  {
    name: "vapron.deploy-success",
    subject: "Deploy succeeded: {{projectName}}",
    variables: ["projectName", "deployUrl", "sha"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>✅ Deploy succeeded</h2>
<p><strong>{{projectName}}</strong> deployed successfully.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:8px;color:#666;width:120px">Commit</td><td style="padding:8px;font-family:monospace">{{sha}}</td></tr>
  <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">URL</td><td style="padding:8px"><a href="{{deployUrl}}">{{deployUrl}}</a></td></tr>
</table>
</body></html>`,
    text: `Deploy succeeded: {{projectName}}\n\nCommit: {{sha}}\nURL:    {{deployUrl}}`,
  },
  {
    name: "vapron.deploy-failure",
    subject: "Deploy failed: {{projectName}}",
    variables: ["projectName", "errorMessage", "logsUrl"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>❌ Deploy failed</h2>
<p><strong>{{projectName}}</strong> failed to deploy.</p>
<pre style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-size:13px;white-space:pre-wrap;word-break:break-all">{{errorMessage}}</pre>
<p><a href="{{logsUrl}}" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Logs</a></p>
</body></html>`,
    text: `Deploy failed: {{projectName}}\n\nError: {{errorMessage}}\n\nView logs: {{logsUrl}}`,
  },
  {
    name: "vapron.custom-domain-verified",
    subject: "Domain verified: {{domain}}",
    variables: ["domain", "dashboardUrl"],
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111">
<h2>✅ Domain verified</h2>
<p><strong>{{domain}}</strong> has been verified and is now active on your Vapron project.</p>
<p>Your custom domain is live. You can manage it from your dashboard.</p>
<p><a href="{{dashboardUrl}}" style="display:inline-block;background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Dashboard</a></p>
</body></html>`,
    text: `Domain verified: {{domain}}\n\nYour custom domain is now active on Vapron.\n\nManage it at: {{dashboardUrl}}`,
  },
];

async function seedTemplates() {
  console.warn(`Seeding ${VAPRON_TEMPLATES.length} Vapron email templates...`);

  for (const tpl of VAPRON_TEMPLATES) {
    const id = randomUUID();
    await sql`
      INSERT INTO templates (id, account_id, name, subject, html_body, text_body, variables, metadata, created_at, updated_at)
      VALUES (
        ${id},
        ${ACCOUNT_ID},
        ${tpl.name},
        ${tpl.subject},
        ${tpl.html},
        ${tpl.text},
        ${JSON.stringify(tpl.variables)},
        ${{}}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`
      UPDATE templates
      SET subject   = ${tpl.subject},
          html_body = ${tpl.html},
          text_body = ${tpl.text},
          variables = ${JSON.stringify(tpl.variables)}::jsonb,
          updated_at = NOW()
      WHERE account_id = ${ACCOUNT_ID} AND name = ${tpl.name}
    `;

    console.warn(`  ✓ ${tpl.name}`);
  }

  console.warn("\nAll 10 templates seeded.");
  console.warn("Verify with:");
  console.warn(`  curl -s https://api.alecrae.com/v1/templates -H "Authorization: Bearer <api-key>" | jq '.[].name'`);

  await sql.end();
}

seedTemplates().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
