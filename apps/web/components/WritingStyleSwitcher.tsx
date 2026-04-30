"use client";

/**
 * WritingStyleSwitcher — AI writing style compose-sidebar panel.
 *
 * A floating panel that lets users switch between 6 writing tone presets
 * and see a live before/after preview of their draft text rewritten in
 * the selected style. Includes a custom style input, confidence indicator,
 * and animated transitions between styles.
 *
 * Usage:
 *   <WritingStyleSwitcher
 *     onApply={(style, rewrittenText) => { ... }}
 *     originalText="Hey, I wanted to follow up..."
 *   />
 *
 * Self-contained with mock data. No real API calls.
 * Uses AlecRae dark theme tokens (bg-surface, text-content, border-border).
 */

import type { ReactNode } from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, Text, Card, CardContent, CardHeader, Button, Input } from "@alecrae/ui";
import {
  staggerSlow,
  fadeInUp,
  useAlecRaeReducedMotion,
  withReducedMotion,
  SPRING_BOUNCY,
} from "../lib/animations";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WritingStyleSwitcherProps {
  onApply: (style: string, rewrittenText: string) => void;
  originalText?: string;
  className?: string;
}

interface StylePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  rewrittenText: string;
  confidence: number;
}

type ProcessingState = "idle" | "processing" | "done";

// ─── Default Original Text ──────────────────────────────────────────────────

const DEFAULT_ORIGINAL_TEXT =
  "Hey, I wanted to follow up on the project we discussed. Let me know when you're free to chat about next steps.";

// ─── Style Presets (Mock Data) ──────────────────────────────────────────────

const STYLE_PRESETS: StylePreset[] = [
  {
    id: "professional",
    name: "Professional",
    icon: "💼",
    description: "Clear, direct, business-appropriate",
    rewrittenText:
      "I hope this message finds you well. I am writing to follow up on the project we discussed in our recent meeting. Please let me know your availability so we can schedule a time to review the next steps and align on deliverables.",
    confidence: 92,
  },
  {
    id: "casual",
    name: "Casual",
    icon: "☕",
    description: "Relaxed, conversational, friendly",
    rewrittenText:
      "Hey! Just circling back on that project we talked about. When are you free to hop on a quick call and figure out what comes next? No rush, just whenever works for you.",
    confidence: 87,
  },
  {
    id: "diplomatic",
    name: "Diplomatic",
    icon: "🤝",
    description: "Careful, considerate, balanced",
    rewrittenText:
      "Thank you for your time during our recent discussion. I wanted to gently follow up to ensure we are aligned on the project direction. At your convenience, I would appreciate the opportunity to discuss how we might best proceed together.",
    confidence: 84,
  },
  {
    id: "urgent",
    name: "Urgent",
    icon: "⚡",
    description: "Action-oriented, time-sensitive",
    rewrittenText:
      "Following up on our project discussion — we need to finalize next steps by end of week. Can you confirm your availability today or tomorrow for a 15-minute sync? Time-sensitive.",
    confidence: 89,
  },
  {
    id: "friendly",
    name: "Friendly",
    icon: "☀️",
    description: "Warm, personable, enthusiastic",
    rewrittenText:
      "Hope you are having a great day! I have been thinking about our project conversation and I am really excited about where things are heading. Would love to catch up and brainstorm next steps whenever you have a moment!",
    confidence: 91,
  },
  {
    id: "concise",
    name: "Concise",
    icon: "🎯",
    description: "Minimal words, maximum impact",
    rewrittenText:
      "Following up on our project. When can we discuss next steps?",
    confidence: 95,
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return "text-emerald-400";
  if (confidence >= 80) return "text-amber-400";
  return "text-orange-400";
}

function getConfidenceBarColor(confidence: number): string {
  if (confidence >= 90) return "bg-emerald-500";
  if (confidence >= 80) return "bg-amber-500";
  return "bg-orange-500";
}

function getSelectionBorderColor(id: string): string {
  switch (id) {
    case "professional":
      return "border-blue-500";
    case "casual":
      return "border-amber-500";
    case "diplomatic":
      return "border-violet-500";
    case "urgent":
      return "border-red-500";
    case "friendly":
      return "border-yellow-500";
    case "concise":
      return "border-emerald-500";
    default:
      return "border-blue-500";
  }
}

// ─── Custom Style Rewrite (Mock) ────────────────────────────────────────────

function generateCustomRewrite(description: string, original: string): string {
  if (description.toLowerCase().includes("poetic")) {
    return `Like whispers across the digital divide, I reach out once more regarding our shared endeavor. When the stars align with your schedule, let us chart the course ahead.`;
  }
  if (description.toLowerCase().includes("formal")) {
    return `Dear Colleague, I write to respectfully follow up on the matter we discussed. Kindly advise on your availability so that we may arrange a meeting to determine the appropriate course of action.`;
  }
  return `${original} (Rewritten in "${description}" style — AI would adapt this further based on your description.)`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function WritingStyleSwitcher({
  onApply,
  originalText,
  className,
}: WritingStyleSwitcherProps): ReactNode {
  const reduced = useAlecRaeReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [previewText, setPreviewText] = useState<string>("");
  const [confidence, setConfidence] = useState<number>(0);
  const [customStyle, setCustomStyle] = useState<string>("");
  const [isCustomActive, setIsCustomActive] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourceText = originalText ?? DEFAULT_ORIGINAL_TEXT;

  // ─── Cleanup timers on unmount ──────────────────────────────────────────

  useEffect(() => {
    return (): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ─── Select a preset style ─────────────────────────────────────────────

  const handleSelectPreset = useCallback(
    (preset: StylePreset): void => {
      if (timerRef.current) clearTimeout(timerRef.current);

      setSelectedId(preset.id);
      setIsCustomActive(false);
      setProcessingState("processing");
      setPreviewText("");
      setConfidence(0);

      timerRef.current = setTimeout(() => {
        setPreviewText(preset.rewrittenText);
        setConfidence(preset.confidence);
        setProcessingState("done");
      }, 800);
    },
    [],
  );

  // ─── Apply custom style ────────────────────────────────────────────────

  const handleApplyCustom = useCallback((): void => {
    if (!customStyle.trim()) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    setSelectedId(null);
    setIsCustomActive(true);
    setProcessingState("processing");
    setPreviewText("");
    setConfidence(0);

    timerRef.current = setTimeout(() => {
      const rewritten = generateCustomRewrite(customStyle, sourceText);
      setPreviewText(rewritten);
      setConfidence(78);
      setProcessingState("done");
    }, 1200);
  }, [customStyle, sourceText]);

  // ─── Apply the selected style ──────────────────────────────────────────

  const handleApply = useCallback((): void => {
    if (!previewText) return;
    const styleName = isCustomActive
      ? customStyle
      : STYLE_PRESETS.find((p) => p.id === selectedId)?.name ?? "Unknown";
    onApply(styleName, previewText);
  }, [previewText, isCustomActive, customStyle, selectedId, onApply]);

  // ─── Animation variants ────────────────────────────────────────────────

  const containerVariants = withReducedMotion(staggerSlow, reduced);
  const itemVariants = withReducedMotion(fadeInUp, reduced);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className={`w-[380px] ${className ?? ""}`}
    >
      <Card className="bg-surface border-border overflow-hidden">
        {/* Header */}
        <CardHeader className="border-b border-border px-5 py-4">
          <motion.div variants={itemVariants}>
            <Box className="flex items-center justify-between">
              <Box className="flex items-center gap-2">
                <Text className="text-lg font-semibold text-content">
                  Writing Style
                </Text>
                <Box className="rounded-full bg-blue-500/20 px-2 py-0.5">
                  <Text className="text-xs font-medium text-blue-400">AI</Text>
                </Box>
              </Box>
              <Text className="text-xs text-content-tertiary">
                Powered by Claude
              </Text>
            </Box>
          </motion.div>
        </CardHeader>

        <CardContent className="px-5 py-4">
          {/* Style Presets Grid (2x3) */}
          <motion.div variants={itemVariants}>
            <Text className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-3">
              Style Presets
            </Text>
          </motion.div>

          <Box className="grid grid-cols-2 gap-2 mb-5">
            {STYLE_PRESETS.map((preset) => {
              const isSelected = selectedId === preset.id && !isCustomActive;
              const borderClass = isSelected
                ? getSelectionBorderColor(preset.id)
                : "border-border";

              return (
                <motion.div
                  key={preset.id}
                  variants={itemVariants}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_BOUNCY}
                >
                  <Card
                    className={`cursor-pointer border-2 transition-colors ${borderClass} ${
                      isSelected
                        ? "bg-surface-secondary"
                        : "bg-surface hover:bg-surface-secondary"
                    }`}
                    onClick={() => handleSelectPreset(preset)}
                  >
                    <CardContent className="p-3">
                      <Box className="flex items-center gap-2 mb-1">
                        <Text className="text-lg leading-none">
                          {preset.icon}
                        </Text>
                        <Text
                          className={`text-sm font-semibold ${
                            isSelected ? "text-content" : "text-content"
                          }`}
                        >
                          {preset.name}
                        </Text>
                      </Box>
                      <Text className="text-xs text-content-tertiary leading-snug">
                        {preset.description}
                      </Text>
                      {isSelected && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={SPRING_BOUNCY}
                        >
                          <Box className="mt-2 flex items-center gap-1">
                            <Box className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <Text className="text-[10px] text-emerald-400 font-medium">
                              Selected
                            </Text>
                          </Box>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </Box>

          {/* Before / After Preview */}
          <motion.div variants={itemVariants}>
            <Text className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-3">
              Before / After Preview
            </Text>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Box className="grid grid-cols-2 gap-3 mb-5">
              {/* Before (Original) */}
              <Box className="rounded-lg bg-surface-secondary border border-border p-3">
                <Box className="flex items-center gap-1.5 mb-2">
                  <Box className="h-2 w-2 rounded-full bg-slate-500" />
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
                    Original
                  </Text>
                </Box>
                <Text className="text-xs text-content leading-relaxed">
                  {sourceText}
                </Text>
              </Box>

              {/* After (Rewritten) */}
              <Box className="rounded-lg bg-surface-secondary border border-border p-3">
                <Box className="flex items-center gap-1.5 mb-2">
                  <Box className="h-2 w-2 rounded-full bg-blue-500" />
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary">
                    Rewritten
                  </Text>
                </Box>

                <AnimatePresence mode="wait">
                  {processingState === "processing" && (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Box className="space-y-2 py-1">
                        <Box className="h-2 w-full rounded bg-surface animate-pulse" />
                        <Box className="h-2 w-4/5 rounded bg-surface animate-pulse" />
                        <Box className="h-2 w-3/5 rounded bg-surface animate-pulse" />
                        <Box className="flex items-center gap-1.5 mt-3">
                          <Box className="h-3 w-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                          <Text className="text-[10px] text-blue-400">
                            Rewriting...
                          </Text>
                        </Box>
                      </Box>
                    </motion.div>
                  )}

                  {processingState === "done" && previewText && (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={SPRING_BOUNCY}
                    >
                      <Text className="text-xs text-content leading-relaxed">
                        {previewText}
                      </Text>
                    </motion.div>
                  )}

                  {processingState === "idle" && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Text className="text-xs text-content-tertiary italic">
                        Select a style to see the preview
                      </Text>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Box>
            </Box>
          </motion.div>

          {/* Confidence Indicator */}
          <AnimatePresence>
            {processingState === "done" && confidence > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={SPRING_BOUNCY}
                className="mb-5"
              >
                <Box className="rounded-lg bg-surface-secondary border border-border p-3">
                  <Box className="flex items-center justify-between mb-2">
                    <Text className="text-xs font-medium text-content">
                      Style Match Confidence
                    </Text>
                    <Text
                      className={`text-sm font-bold ${getConfidenceColor(confidence)}`}
                    >
                      {confidence}%
                    </Text>
                  </Box>
                  <Box className="h-2 w-full rounded-full bg-surface overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${getConfidenceBarColor(confidence)}`}
                      initial={{ width: "0%" }}
                      animate={{ width: `${confidence}%` }}
                      transition={SPRING_BOUNCY}
                    />
                  </Box>
                  <Text className="text-[10px] text-content-tertiary mt-1.5">
                    {confidence >= 90
                      ? "Excellent match to selected style"
                      : confidence >= 80
                        ? "Good match with minor adjustments possible"
                        : "Approximate match — consider refining"}
                  </Text>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Custom Style Input */}
          <motion.div variants={itemVariants}>
            <Text className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-2">
              Custom Style
            </Text>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Box className="flex gap-2 mb-5">
              <Box className="flex-1">
                <Input
                  value={customStyle}
                  onChange={(e) => setCustomStyle(e.target.value)}
                  placeholder="Describe your tone (e.g., poetic, sarcastic)"
                  className="bg-surface-secondary border-border text-content text-sm placeholder:text-content-tertiary"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleApplyCustom();
                  }}
                />
              </Box>
              <Button
                onClick={handleApplyCustom}
                disabled={!customStyle.trim()}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 disabled:opacity-40"
              >
                <Text className="text-sm font-medium text-white">Try</Text>
              </Button>
            </Box>
          </motion.div>

          {/* Custom style active indicator */}
          <AnimatePresence>
            {isCustomActive && processingState === "done" && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={SPRING_BOUNCY}
                className="mb-5"
              >
                <Box className="rounded-lg bg-violet-500/10 border border-violet-500/30 p-3">
                  <Box className="flex items-center gap-2">
                    <Box className="h-2 w-2 rounded-full bg-violet-400" />
                    <Text className="text-xs font-medium text-violet-300">
                      Custom style active: &quot;{customStyle}&quot;
                    </Text>
                  </Box>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Style Tips */}
          <motion.div variants={itemVariants}>
            <Box className="rounded-lg bg-surface-secondary border border-border p-3 mb-5">
              <Text className="text-xs font-semibold text-content mb-2">
                Style Tips
              </Text>
              <Box className="space-y-1.5">
                <Box className="flex items-start gap-2">
                  <Text className="text-content-tertiary text-xs leading-none mt-0.5">
                    •
                  </Text>
                  <Text className="text-xs text-content-tertiary leading-snug">
                    Professional works best for first-time contacts
                  </Text>
                </Box>
                <Box className="flex items-start gap-2">
                  <Text className="text-content-tertiary text-xs leading-none mt-0.5">
                    •
                  </Text>
                  <Text className="text-xs text-content-tertiary leading-snug">
                    Concise style reduces email length by up to 60%
                  </Text>
                </Box>
                <Box className="flex items-start gap-2">
                  <Text className="text-content-tertiary text-xs leading-none mt-0.5">
                    •
                  </Text>
                  <Text className="text-xs text-content-tertiary leading-snug">
                    Use Urgent sparingly to maintain its impact
                  </Text>
                </Box>
              </Box>
            </Box>
          </motion.div>

          {/* Recently Used Styles */}
          <motion.div variants={itemVariants}>
            <Text className="text-xs font-semibold uppercase tracking-wider text-content-tertiary mb-2">
              Recently Used
            </Text>
            <Box className="flex gap-2 mb-5">
              {["Professional", "Concise", "Friendly"].map((style) => (
                <Box
                  key={style}
                  className="rounded-full bg-surface-secondary border border-border px-3 py-1 cursor-pointer hover:border-blue-500/50 transition-colors"
                  onClick={() => {
                    const preset = STYLE_PRESETS.find(
                      (p) => p.name === style,
                    );
                    if (preset) handleSelectPreset(preset);
                  }}
                >
                  <Text className="text-[11px] text-content-tertiary">
                    {style}
                  </Text>
                </Box>
              ))}
            </Box>
          </motion.div>

          {/* Word Count Comparison */}
          <AnimatePresence>
            {processingState === "done" && previewText && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={SPRING_BOUNCY}
                className="mb-5"
              >
                <Box className="rounded-lg bg-surface-secondary border border-border p-3">
                  <Text className="text-xs font-semibold text-content mb-2">
                    Comparison
                  </Text>
                  <Box className="grid grid-cols-3 gap-2">
                    <Box className="text-center">
                      <Text className="text-lg font-bold text-content">
                        {sourceText.split(" ").length}
                      </Text>
                      <Text className="text-[10px] text-content-tertiary">
                        Original words
                      </Text>
                    </Box>
                    <Box className="text-center">
                      <Text className="text-lg font-bold text-blue-400">
                        {previewText.split(" ").length}
                      </Text>
                      <Text className="text-[10px] text-content-tertiary">
                        Rewritten words
                      </Text>
                    </Box>
                    <Box className="text-center">
                      <Text
                        className={`text-lg font-bold ${
                          previewText.split(" ").length <=
                          sourceText.split(" ").length
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }`}
                      >
                        {previewText.split(" ").length <=
                        sourceText.split(" ").length
                          ? "-"
                          : "+"}
                        {Math.abs(
                          previewText.split(" ").length -
                            sourceText.split(" ").length,
                        )}
                      </Text>
                      <Text className="text-[10px] text-content-tertiary">
                        Difference
                      </Text>
                    </Box>
                  </Box>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Apply Button */}
          <motion.div variants={itemVariants}>
            <Button
              onClick={handleApply}
              disabled={processingState !== "done" || !previewText}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-surface-secondary disabled:opacity-40 py-2.5 rounded-lg transition-colors"
            >
              <Box className="flex items-center justify-center gap-2">
                <Text className="text-sm font-semibold text-white">
                  Apply Style
                </Text>
                {processingState === "done" && previewText && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={SPRING_BOUNCY}
                  >
                    <Box className="rounded-full bg-white/20 px-1.5 py-0.5">
                      <Text className="text-[10px] text-white/80">
                        {isCustomActive
                          ? customStyle
                          : STYLE_PRESETS.find((p) => p.id === selectedId)
                              ?.name ?? ""}
                      </Text>
                    </Box>
                  </motion.div>
                )}
              </Box>
            </Button>
          </motion.div>

          {/* Keyboard Hint */}
          <motion.div variants={itemVariants}>
            <Box className="mt-3 flex items-center justify-center gap-3">
              <Box className="flex items-center gap-1">
                <Box className="rounded bg-surface-secondary border border-border px-1.5 py-0.5">
                  <Text className="text-[10px] text-content-tertiary font-mono">
                    1-6
                  </Text>
                </Box>
                <Text className="text-[10px] text-content-tertiary">
                  Select style
                </Text>
              </Box>
              <Box className="flex items-center gap-1">
                <Box className="rounded bg-surface-secondary border border-border px-1.5 py-0.5">
                  <Text className="text-[10px] text-content-tertiary font-mono">
                    Enter
                  </Text>
                </Box>
                <Text className="text-[10px] text-content-tertiary">
                  Apply
                </Text>
              </Box>
            </Box>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default WritingStyleSwitcher;
