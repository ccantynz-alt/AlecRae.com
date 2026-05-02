"use client";

/**
 * Local AI Demo — proves WebGPU on-device inference works end-to-end.
 *
 * For sales demos and curious users:
 *   - Probes WebGPU
 *   - Lets the user explicitly load the model (1-4 GB, one-time)
 *   - Shows live download progress
 *   - Runs prompts locally and reports tok/sec + zero-cost
 *   - Compares with cloud AI cost so the savings story is visible
 */

import { useEffect, useRef, useState } from "react";
import { Box, Text, Button, Card, CardContent, CardHeader, PageLayout } from "@alecrae/ui";
import {
  initLocalAI,
  getLocalAIStatus,
  runAI,
  onWebGPUProgress,
  type LocalAIStatus,
  type ModelDownloadProgress,
} from "../../../lib/local-ai";

const SAMPLE_PROMPTS = [
  "Draft a polite reply declining a meeting next Tuesday.",
  "Summarize the following in 3 bullets:\n\nThe quarterly report shows revenue up 14% YoY, driven by enterprise SaaS expansion in EMEA. Margins improved 220 bps to 41.2%. Headwinds: FX exposure in JPY and a legal settlement in Q3.",
  "Translate to Spanish: 'Thanks for the quick turnaround on this — really appreciate it.'",
  "Rewrite this more concisely: 'I just wanted to reach out and let you know that we have been thinking about your proposal and we are very interested in moving forward but would like to discuss a few of the line items in more detail.'",
];

interface RunResult {
  prompt: string;
  output: string;
  source: "webgpu" | "cloud";
  modelId: string;
  latencyMs: number;
  tokensApprox: number;
  cloudCostEstimateUSD: number;
}

function estimateCloudCost(inputTokens: number, outputTokens: number): number {
  // Haiku 4.5 pricing for comparison: $0.25/MTok input, $1.25/MTok output
  return (inputTokens * 0.25 + outputTokens * 1.25) / 1_000_000;
}

function approxTokens(s: string): number {
  return Math.max(1, Math.round(s.length / 4));
}

export default function LocalAIDemoPage(): React.ReactNode {
  const [status, setStatus] = useState<LocalAIStatus | null>(null);
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null);
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0] ?? "");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const initRanRef = useRef(false);

  useEffect(() => {
    if (initRanRef.current) return;
    initRanRef.current = true;
    void (async () => {
      await initLocalAI({ probeOnly: true });
      setStatus(await getLocalAIStatus());
    })();
    const unsubscribe = onWebGPUProgress((p) => setProgress(p));
    return unsubscribe;
  }, []);

  const enableModel = async (): Promise<void> => {
    setLoadingModel(true);
    setError(null);
    try {
      await initLocalAI({
        onProgress: () => {
          void getLocalAIStatus().then(setStatus);
        },
      });
      setStatus(await getLocalAIStatus());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingModel(false);
    }
  };

  const runPrompt = async (): Promise<void> => {
    if (!prompt.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const res = await runAI({
        task: "other",
        prompt,
        maxTokens: 400,
        temperature: 0.4,
      });
      const inTok = approxTokens(prompt);
      const outTok = approxTokens(res.text);
      const cloudCost = estimateCloudCost(inTok, outTok);
      setResults((prev) => [
        {
          prompt,
          output: res.text,
          source: res.source,
          modelId: res.modelId,
          latencyMs: res.latencyMs,
          tokensApprox: outTok,
          cloudCostEstimateUSD: cloudCost,
        },
        ...prev,
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const totalSavedUSD = results
    .filter((r) => r.source === "webgpu")
    .reduce((sum, r) => sum + r.cloudCostEstimateUSD, 0);

  const supported = status?.capabilities?.supported === true;
  const ready = status?.modelReady === true;

  return (
    <PageLayout
      title="Local AI"
      description="On-device inference via WebGPU. Zero token cost. Prompts never leave this device."
    >
      <Box className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader>
            <Text variant="heading-sm">Engine status</Text>
          </CardHeader>
          <CardContent>
            <Box className="grid grid-cols-2 gap-3 text-sm">
              <Box>
                <Text variant="caption" muted>WebGPU</Text>
                <Text variant="body-sm" className="font-medium">
                  {supported ? "Supported" : status ? "Not available" : "Probing..."}
                </Text>
              </Box>
              <Box>
                <Text variant="caption" muted>Adapter</Text>
                <Text variant="body-sm" className="font-medium">
                  {status?.capabilities?.adapter ?? "—"}
                </Text>
              </Box>
              <Box>
                <Text variant="caption" muted>Estimated VRAM</Text>
                <Text variant="body-sm" className="font-medium">
                  {status?.capabilities?.vramMB ? `${status.capabilities.vramMB} MB` : "—"}
                </Text>
              </Box>
              <Box>
                <Text variant="caption" muted>Selected model</Text>
                <Text variant="body-sm" className="font-medium">
                  {status?.selectedModelLabel ?? "—"}
                </Text>
              </Box>
            </Box>

            {progress && progress.phase !== "ready" && (
              <Box className="mt-4">
                <Text variant="caption" muted>
                  {progress.text} ({progress.percent}%)
                </Text>
                <Box className="mt-1 h-2 w-full bg-surface-secondary rounded-full overflow-hidden">
                  <Box
                    className="h-full bg-accent transition-all duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </Box>
              </Box>
            )}

            <Box className="mt-4 flex gap-2">
              {!supported && status && (
                <Text variant="body-sm" muted>
                  Your browser or device doesn&apos;t expose WebGPU. AI requests will use the cloud fallback.
                </Text>
              )}
              {supported && !ready && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void enableModel()}
                  disabled={loadingModel}
                >
                  {loadingModel ? "Loading model..." : "Enable on-device AI"}
                </Button>
              )}
              {ready && (
                <Text variant="body-sm" className="text-status-success">
                  Ready. Prompts will run on your GPU.
                </Text>
              )}
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Text variant="heading-sm">Try a prompt</Text>
          </CardHeader>
          <CardContent>
            <Box className="space-y-3">
              <Box className="flex flex-wrap gap-2">
                {SAMPLE_PROMPTS.map((sample, i) => (
                  <Button
                    key={i}
                    variant="secondary"
                    size="sm"
                    onClick={() => setPrompt(sample)}
                  >
                    Sample {i + 1}
                  </Button>
                ))}
              </Box>
              <Box
                as="textarea"
                value={prompt}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                placeholder="Type a prompt..."
                className="w-full min-h-[120px] p-3 bg-surface-secondary rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              />
              <Button
                variant="primary"
                size="md"
                onClick={() => void runPrompt()}
                disabled={running || !prompt.trim()}
              >
                {running ? "Running..." : "Run"}
              </Button>
              {error && (
                <Text variant="body-sm" className="text-status-error">
                  {error}
                </Text>
              )}
            </Box>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <Box className="flex items-center justify-between">
                <Text variant="heading-sm">Results</Text>
                <Text variant="caption" className="text-status-success">
                  Saved ${totalSavedUSD.toFixed(6)} in cloud token cost
                </Text>
              </Box>
            </CardHeader>
            <CardContent>
              <Box className="space-y-4">
                {results.map((r, i) => (
                  <Box key={i} className="border border-border rounded-md p-3">
                    <Box className="flex items-center justify-between mb-2">
                      <Text variant="caption" muted>
                        {r.source === "webgpu" ? "On device" : "Cloud"} · {r.modelId} · {r.latencyMs}ms · ~{r.tokensApprox} tok
                      </Text>
                      <Text
                        variant="caption"
                        className={r.source === "webgpu" ? "text-status-success" : "text-content-tertiary"}
                      >
                        {r.source === "webgpu"
                          ? `Saved ~$${r.cloudCostEstimateUSD.toFixed(6)}`
                          : `Cost ~$${r.cloudCostEstimateUSD.toFixed(6)}`}
                      </Text>
                    </Box>
                    <Text variant="caption" muted className="block mb-1">Prompt</Text>
                    <Text variant="body-sm" className="mb-2 whitespace-pre-wrap">{r.prompt}</Text>
                    <Text variant="caption" muted className="block mb-1">Output</Text>
                    <Text variant="body-sm" className="whitespace-pre-wrap">{r.output}</Text>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>
    </PageLayout>
  );
}
