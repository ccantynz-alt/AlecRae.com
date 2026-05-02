"use client";

/**
 * Voice Profile — manage AI voice clones for replies that sound like you.
 *
 * S4 feature: per-account style fingerprints (rhythm, vocabulary, formality,
 * emoji habits). The fingerprint is extracted from sent emails and used to
 * compose replies that sound like the user, not like a generic AI assistant.
 */

import { PageLayout } from "@alecrae/ui";
import { VoiceCloneManager } from "../../../components/VoiceCloneManager";

export default function VoiceProfilePage(): React.ReactNode {
  return (
    <PageLayout
      title="Voice Profile"
      description="Train AlecRae to draft replies that sound like you. Multi-profile support — separate style for work, personal, sales."
    >
      <VoiceCloneManager />
    </PageLayout>
  );
}
