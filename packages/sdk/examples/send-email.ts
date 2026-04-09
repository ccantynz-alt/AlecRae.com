/**
 * Example: Send an email using the Emailed SDK.
 *
 * Run:
 *   EMAILED_API_KEY=em_live_... npx tsx examples/send-email.ts
 */
import { Emailed } from "@emailed/sdk";

const client = new Emailed({ apiKey: process.env.EMAILED_API_KEY! });

async function main() {
  // --- Simple text email ---------------------------------------------------

  const simple = await client.messages.send({
    from: { address: "hello@example.com", name: "Your App" },
    to: [{ address: "user@example.com" }],
    subject: "Hello from Emailed!",
    textBody: "Welcome! This is a plain-text email sent via the Emailed SDK.",
  });

  console.log("Sent plain-text email:", simple.data.id);

  // --- HTML email with tracking --------------------------------------------

  const html = await client.messages.send({
    from: { address: "hello@example.com", name: "Your App" },
    to: [{ address: "user@example.com" }],
    subject: "Welcome to Emailed!",
    htmlBody: `
      <h1>Welcome!</h1>
      <p>This is your first email sent through the Emailed platform.</p>
      <p><a href="https://48co.ai/docs">Read the docs</a></p>
    `,
    textBody: "Welcome! This is your first email sent through the Emailed platform.",
    tags: ["welcome", "onboarding"],
    metadata: { userId: "usr_123" },
  });

  console.log("Sent HTML email:", html.data.id);

  // --- Retrieve message status ---------------------------------------------

  const status = await client.messages.get(html.data.id);
  console.log("Message status:", status.data.status);

  // --- List recent messages ------------------------------------------------

  const recent = await client.messages.list({ pageSize: 5 });
  console.log(`Found ${recent.data.total} messages`);
  for (const msg of recent.data.data) {
    console.log(` - ${msg.id}: ${msg.subject} [${msg.status}]`);
  }

  // --- Search messages -----------------------------------------------------

  const results = await client.messages.search("welcome");
  console.log(`Search found ${results.data.total} results`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
