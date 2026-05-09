/**
 * /your-ai — the visible flywheel (F1).
 *
 * Marketing-grade page that shows each user how their AI is sharpening
 * over time. Server component for the shell + a client island that
 * fetches /v1/flywheel/me and renders live numbers.
 *
 * Pre-launch / pre-data state is the default — we ship a beautiful
 * "your wheel hasn't started spinning yet" empty state so screenshots
 * still sell the product.
 */

import type { Metadata } from "next";
import { YourAiClient } from "./your-ai-client";

export const metadata: Metadata = {
  title: "Your AI",
  description:
    "Watch the AI learn your voice, sharpen your inbox, and give you back hours every week.",
};

export default function YourAiPage(): React.JSX.Element {
  return <YourAiClient />;
}
