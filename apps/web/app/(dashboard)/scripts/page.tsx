"use client";

import { PageLayout } from "@alecrae/ui";
import EmailScriptManager from "../../../components/EmailScriptManager";

export default function ScriptsPage(): React.ReactNode {
  return (
    <PageLayout
      title="Scripts"
      description="Programmable email — type-safe TypeScript snippets that run on every message."
    >
      <EmailScriptManager />
    </PageLayout>
  );
}
