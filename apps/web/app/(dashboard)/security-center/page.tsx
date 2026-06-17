"use client";

import { useState, useEffect, useCallback } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, PageLayout } from "@alecrae/ui";
import { securityCenterApi, type SecurityEventData } from "../../../lib/api-features";

const THREAT_COLORS: Record<SecurityEventData["threatType"], string> = {
  phishing: "bg-red-100 text-red-700",
  spoofing: "bg-orange-100 text-orange-700",
  suspicious: "bg-amber-100 text-amber-700",
  spam: "bg-yellow-100 text-yellow-700",
  malware: "bg-red-200 text-red-800",
};

const ACTION_COLORS: Record<SecurityEventData["action"], string> = {
  blocked: "bg-red-100 text-red-700",
  flagged: "bg-amber-100 text-amber-700",
  quarantined: "bg-orange-100 text-orange-700",
  allowed: "bg-green-100 text-green-700",
};

function ToggleSetting({ label, description, value, onChange }: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.ReactNode {
  return (
    <Box className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <Box>
        <Text variant="body-sm" className="font-medium">{label}</Text>
        <Text variant="caption" className="text-content-subtle">{description}</Text>
      </Box>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
          value ? "bg-brand-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </Box>
  );
}

interface SecuritySettings { blockPhishing: boolean; quarantineSuspicious: boolean; warnExternalImages: boolean; enforceSpfDkim: boolean; }

export default function SecurityPage(): React.ReactNode {
  const [score, setScore] = useState<{ score: number; grade: string; phishingBlocked: number; suspiciousFlagged: number; threatsDetected: number } | null>(null);
  const [events, setEvents] = useState<SecurityEventData[]>([]);
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyResult, setVerifyResult] = useState<{ trusted: boolean; spfPass: boolean; dkimPass: boolean; dmarcPass: boolean; domainAge?: number } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [scoreRes, eventsRes, settingsRes] = await Promise.allSettled([
      securityCenterApi.score(),
      securityCenterApi.events(),
      securityCenterApi.settings(),
    ]);
    if (scoreRes.status === "fulfilled") setScore(scoreRes.value.data);
    if (eventsRes.status === "fulfilled") setEvents(eventsRes.value.data);
    if (settingsRes.status === "fulfilled") setSettings(settingsRes.value.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleVerify = async (): Promise<void> => {
    if (!verifyEmail) return;
    setVerifying(true);
    try {
      const res = await securityCenterApi.verifySender(verifyEmail);
      setVerifyResult(res.data);
    } catch {
      setVerifyResult(null);
    } finally {
      setVerifying(false);
    }
  };

  const updateSetting = async (key: keyof SecuritySettings, value: boolean): Promise<void> => {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    await securityCenterApi.updateSettings({ [key]: value }).catch(() => setSettings(settings));
  };

  const gradeColor = (grade: string): string => {
    if (grade.startsWith("A")) return "text-green-600";
    if (grade.startsWith("B")) return "text-brand-600";
    if (grade.startsWith("C")) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <PageLayout title="Security Center" description="Monitor threats, verify senders, and keep your inbox protected.">
      <Box className="space-y-6">
        {loading ? (
          <Box className="space-y-4">
            {[1, 2, 3].map((i) => <Box key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />)}
          </Box>
        ) : (
          <>
            {/* Security score + stats */}
            <Box className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Box className="p-4 rounded-xl border border-border bg-surface-raised text-center col-span-1">
                <Text variant="body-sm" className={`text-4xl font-bold ${gradeColor(score?.grade ?? "B")}`}>
                  {score?.grade ?? "—"}
                </Text>
                <Text variant="caption" className="text-content-subtle mt-1">Security Grade</Text>
                <Text variant="caption" className="text-content-tertiary">{score?.score ?? 0}/100</Text>
              </Box>
              {[
                { label: "Phishing Blocked", value: score?.phishingBlocked ?? 0, color: "text-red-600" },
                { label: "Suspicious Flagged", value: score?.suspiciousFlagged ?? 0, color: "text-amber-600" },
                { label: "Threats Detected", value: score?.threatsDetected ?? 0, color: "text-orange-600" },
              ].map(({ label, value, color }) => (
                <Box key={label} className="p-4 rounded-xl border border-border bg-surface-raised text-center">
                  <Text variant="body-sm" className={`text-2xl font-bold ${color}`}>{value}</Text>
                  <Text variant="caption" className="text-content-subtle mt-1">{label}</Text>
                  <Text variant="caption" className="text-content-tertiary">Last 30 days</Text>
                </Box>
              ))}
            </Box>

            {/* Sender verification */}
            <Card>
              <CardHeader>
                <Text variant="body-sm" className="text-sm font-semibold">Sender Verification</Text>
              </CardHeader>
              <CardContent>
                <Box className="flex gap-2 mb-4">
                  <input
                    type="email"
                    placeholder="Enter email address to verify..."
                    value={verifyEmail}
                    onChange={(e) => setVerifyEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleVerify(); }}
                    className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-surface text-content placeholder:text-content-tertiary focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleVerify()}
                    disabled={verifying || !verifyEmail}
                  >
                    {verifying ? "Checking…" : "Verify"}
                  </Button>
                </Box>
                {verifyResult && (
                  <Box className="p-3 rounded-lg bg-surface-secondary border border-border">
                    <Box className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{verifyResult.trusted ? "✅" : "⚠️"}</span>
                      <Text variant="body-sm" className="font-medium">
                        {verifyResult.trusted ? "Trusted sender" : "Use caution with this sender"}
                      </Text>
                    </Box>
                    <Box className="flex flex-wrap gap-2">
                      {[
                        { label: "SPF", pass: verifyResult.spfPass },
                        { label: "DKIM", pass: verifyResult.dkimPass },
                        { label: "DMARC", pass: verifyResult.dmarcPass },
                      ].map(({ label, pass }) => (
                        <span
                          key={label}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${pass ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                        >
                          {label}: {pass ? "Pass" : "Fail"}
                        </span>
                      ))}
                      {verifyResult.domainAge !== undefined && (
                        <span className="text-xs text-content-subtle px-2 py-0.5">
                          Domain age: {verifyResult.domainAge} days
                        </span>
                      )}
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Recent security events */}
            <Card>
              <CardHeader>
                <Text variant="body-sm" className="text-sm font-semibold">Recent Security Events</Text>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <Box className="py-8 text-center">
                    <Text variant="body-sm" className="text-3xl mb-2">🛡️</Text>
                    <Text variant="body-sm" className="text-content-subtle">No security events detected</Text>
                  </Box>
                ) : (
                  <Box className="space-y-2">
                    {events.slice(0, 20).map((evt) => (
                      <Box
                        key={evt.id}
                        className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                      >
                        <Box className="flex-1 min-w-0">
                          <Text variant="body-sm" className="font-medium truncate">{evt.subject}</Text>
                          <Text variant="caption" className="text-content-subtle truncate">{evt.sender}</Text>
                        </Box>
                        <Box className="flex flex-shrink-0 gap-1.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${THREAT_COLORS[evt.threatType]}`}>
                            {evt.threatType}
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${ACTION_COLORS[evt.action]}`}>
                            {evt.action}
                          </span>
                        </Box>
                        <Text variant="caption" className="text-content-tertiary flex-shrink-0">
                          {new Date(evt.timestamp).toLocaleDateString()}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* Trust settings */}
            {settings && (
              <Card>
                <CardHeader>
                  <Text variant="body-sm" className="text-sm font-semibold">Trust Settings</Text>
                </CardHeader>
                <CardContent>
                  <ToggleSetting
                    label="Block known phishing senders"
                    description="Automatically block emails from known phishing domains"
                    value={settings.blockPhishing}
                    onChange={(v) => void updateSetting("blockPhishing", v)}
                  />
                  <ToggleSetting
                    label="Quarantine suspicious emails"
                    description="Move suspicious emails to a quarantine folder instead of inbox"
                    value={settings.quarantineSuspicious}
                    onChange={(v) => void updateSetting("quarantineSuspicious", v)}
                  />
                  <ToggleSetting
                    label="Warn on external images"
                    description="Show a warning before loading images from external sources"
                    value={settings.warnExternalImages}
                    onChange={(v) => void updateSetting("warnExternalImages", v)}
                  />
                  <ToggleSetting
                    label="Enforce SPF/DKIM/DMARC"
                    description="Flag emails that fail authentication checks"
                    value={settings.enforceSpfDkim}
                    onChange={(v) => void updateSetting("enforceSpfDkim", v)}
                  />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Box>
    </PageLayout>
  );
}
