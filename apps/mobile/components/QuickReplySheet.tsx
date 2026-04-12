/**
 * AlecRae Mobile -- QuickReplySheet
 *
 * A bottom sheet that appears when the user swipes right to reply.
 * Presents:
 *   1. AI-generated quick reply suggestions (short / medium / detailed)
 *   2. One-tap send for any suggestion
 *   3. "Edit" button to open full compose
 *   4. Custom reply text input
 *   5. Previous thread context preview
 *
 * Uses Animated + PanResponder for the sheet drag-to-dismiss gesture.
 * All AI calls have fallback behavior -- the sheet still works without AI.
 *
 * Haptic feedback fires on key interactions (open, send, dismiss).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { SPRING_SHEET, SPRING_SNAP } from "../lib/gestures";
import { lightTap, mediumTap, success } from "../lib/haptics";
import { inboxApi, messagesApi, type InboxThread } from "../lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export type ReplyLength = "short" | "medium" | "detailed";

export interface QuickReplySuggestion {
  readonly id: string;
  readonly length: ReplyLength;
  readonly text: string;
  readonly confidence: number;
}

export interface ThreadContextMessage {
  readonly id: string;
  readonly from: string;
  readonly preview: string;
  readonly receivedAt: string;
}

export interface QuickReplySheetProps {
  readonly visible: boolean;
  readonly threadId: string;
  readonly threadSubject: string;
  readonly threadContext: readonly ThreadContextMessage[];
  readonly onSendReply: (threadId: string, text: string) => Promise<void>;
  readonly onOpenCompose: (threadId: string, draftText: string) => void;
  readonly onDismiss: () => void;
  /** When true, prefer instant transitions (accessibility). */
  readonly reducedMotion?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LENGTH_LABELS: Record<ReplyLength, string> = {
  short: "Brief",
  medium: "Standard",
  detailed: "Detailed",
};

const LENGTH_ICONS: Record<ReplyLength, string> = {
  short: "\u{26A1}",
  medium: "\u{1F4AC}",
  detailed: "\u{1F4DD}",
};

// ── Component ────────────────────────────────────────────────────────────────

export function QuickReplySheet({
  visible,
  threadId,
  threadSubject,
  threadContext,
  onSendReply,
  onOpenCompose,
  onDismiss,
  reducedMotion = false,
}: QuickReplySheetProps): React.ReactElement | null {
  const { height: screenHeight } = useWindowDimensions();
  const sheetY = useSharedValue(screenHeight);
  const textInputRef = useRef<TextInput>(null);

  const [suggestions, setSuggestions] = useState<readonly QuickReplySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isSendingCustom, setIsSendingCustom] = useState(false);

  // ── Open/close animation ──────────────────────────────────
  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        sheetY.value = 0;
      } else {
        sheetY.value = withSpring(0, SPRING_SHEET);
      }
      void lightTap();
      // Reset state
      setCustomText("");
      setSendingId(null);
      setIsSendingCustom(false);
      setSuggestionsError(null);
      // Fetch AI suggestions
      void fetchSuggestions();
    } else {
      if (reducedMotion) {
        sheetY.value = screenHeight;
      } else {
        sheetY.value = withTiming(screenHeight, { duration: 220 });
      }
      Keyboard.dismiss();
    }
  }, [visible, screenHeight, sheetY, reducedMotion]);

  // ── Fetch AI suggestions ──────────────────────────────────
  const fetchSuggestions = useCallback(async (): Promise<void> => {
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      // Call the AI compose endpoint for quick reply suggestions
      const response = await fetch(
        `${getApiBase()}/v1/ai/quick-replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
            threadSubject,
            context: threadContext.map((m) => ({
              from: m.from,
              preview: m.preview,
            })),
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to generate suggestions");
      }

      const data = (await response.json()) as {
        suggestions: readonly QuickReplySuggestion[];
      };
      setSuggestions(data.suggestions);
    } catch {
      // Fallback: generate simple placeholder suggestions
      setSuggestions([
        {
          id: "fallback-short",
          length: "short",
          text: "Thanks, got it!",
          confidence: 0.5,
        },
        {
          id: "fallback-medium",
          length: "medium",
          text: "Thank you for your email. I'll review and get back to you shortly.",
          confidence: 0.5,
        },
        {
          id: "fallback-detailed",
          length: "detailed",
          text: "Thank you for reaching out. I've reviewed the details in your message and will follow up with a comprehensive response soon. Please let me know if there's anything urgent in the meantime.",
          confidence: 0.5,
        },
      ]);
      setSuggestionsError(null); // Fallback worked, no visible error
    } finally {
      setSuggestionsLoading(false);
    }
  }, [threadId, threadSubject, threadContext]);

  // ── Send handlers ─────────────────────────────────────────
  const handleSendSuggestion = useCallback(
    async (suggestion: QuickReplySuggestion): Promise<void> => {
      setSendingId(suggestion.id);
      void success();
      try {
        await onSendReply(threadId, suggestion.text);
        onDismiss();
      } catch {
        setSendingId(null);
      }
    },
    [onSendReply, threadId, onDismiss],
  );

  const handleSendCustom = useCallback(async (): Promise<void> => {
    const text = customText.trim();
    if (text.length === 0) return;
    setIsSendingCustom(true);
    void success();
    try {
      await onSendReply(threadId, text);
      onDismiss();
    } catch {
      setIsSendingCustom(false);
    }
  }, [customText, onSendReply, threadId, onDismiss]);

  const handleEditSuggestion = useCallback(
    (suggestion: QuickReplySuggestion): void => {
      onOpenCompose(threadId, suggestion.text);
    },
    [onOpenCompose, threadId],
  );

  const handleEditCustom = useCallback((): void => {
    onOpenCompose(threadId, customText);
  }, [onOpenCompose, threadId, customText]);

  // ── Dismiss via drag ──────────────────────────────────────
  const handleDismiss = useCallback((): void => {
    void mediumTap();
    onDismiss();
  }, [onDismiss]);

  const dragGesture = Gesture.Pan()
    .onUpdate((evt) => {
      if (evt.translationY > 0) {
        sheetY.value = evt.translationY;
      }
    })
    .onEnd((evt) => {
      if (evt.translationY > 120 || evt.velocityY > 500) {
        if (reducedMotion) {
          sheetY.value = screenHeight;
        } else {
          sheetY.value = withTiming(screenHeight, { duration: 220 });
        }
        runOnJS(handleDismiss)();
      } else {
        if (reducedMotion) {
          sheetY.value = 0;
        } else {
          sheetY.value = withSpring(0, SPRING_SNAP);
        }
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  if (!visible) return null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      accessible
      accessibilityRole="none"
      accessibilityLabel={`Quick reply to: ${threadSubject}`}
    >
      <Pressable
        style={styles.backdrop}
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel="Close quick reply"
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
        pointerEvents="box-none"
      >
        <GestureDetector gesture={dragGesture}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            {/* Handle bar */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.title}>Quick Reply</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  Re: {threadSubject}
                </Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={handleDismiss}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.scrollContent}
              contentContainerStyle={styles.scrollContentContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Thread context preview */}
              {threadContext.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Thread Context</Text>
                  {threadContext.slice(-3).map((msg) => (
                    <View key={msg.id} style={styles.contextRow}>
                      <Text style={styles.contextFrom}>{msg.from}:</Text>
                      <Text style={styles.contextPreview} numberOfLines={2}>
                        {msg.preview}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* AI Suggestions */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>AI Suggestions</Text>

                {suggestionsLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#3b82f6" />
                    <Text style={styles.loadingText}>Generating replies...</Text>
                  </View>
                ) : suggestionsError ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{suggestionsError}</Text>
                    <Pressable
                      onPress={() => void fetchSuggestions()}
                      accessibilityRole="button"
                      accessibilityLabel="Retry generating suggestions"
                    >
                      <Text style={styles.retryText}>Try again</Text>
                    </Pressable>
                  </View>
                ) : (
                  suggestions.map((suggestion) => (
                    <View
                      key={suggestion.id}
                      style={[
                        styles.suggestionCard,
                        sendingId === suggestion.id && styles.suggestionCardActive,
                      ]}
                    >
                      <View style={styles.suggestionHeader}>
                        <Text style={styles.suggestionIcon}>
                          {LENGTH_ICONS[suggestion.length]}
                        </Text>
                        <Text style={styles.suggestionLength}>
                          {LENGTH_LABELS[suggestion.length]}
                        </Text>
                        {suggestion.confidence >= 0.8 ? (
                          <Text style={styles.highConfidence}>High confidence</Text>
                        ) : null}
                      </View>
                      <Text style={styles.suggestionText}>
                        {suggestion.text}
                      </Text>
                      <View style={styles.suggestionActions}>
                        <Pressable
                          style={[
                            styles.sendButton,
                            sendingId === suggestion.id && styles.sendButtonDisabled,
                          ]}
                          onPress={() => void handleSendSuggestion(suggestion)}
                          disabled={sendingId !== null}
                          accessibilityRole="button"
                          accessibilityLabel={`Send ${LENGTH_LABELS[suggestion.length]} reply`}
                        >
                          <Text style={styles.sendButtonText}>
                            {sendingId === suggestion.id ? "Sending..." : "Send"}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.editButton}
                          onPress={() => handleEditSuggestion(suggestion)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${LENGTH_LABELS[suggestion.length]} reply in composer`}
                        >
                          <Text style={styles.editButtonText}>Edit</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Custom reply input */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Custom Reply</Text>
                <TextInput
                  ref={textInputRef}
                  style={styles.textInput}
                  placeholder="Type a reply..."
                  placeholderTextColor="#64748b"
                  value={customText}
                  onChangeText={setCustomText}
                  multiline
                  textAlignVertical="top"
                  editable={!isSendingCustom}
                  accessibilityLabel="Custom reply text"
                  accessibilityHint="Type your reply here"
                />
                <View style={styles.customActions}>
                  <Pressable
                    style={styles.openComposerButton}
                    onPress={handleEditCustom}
                    accessibilityRole="button"
                    accessibilityLabel="Open full compose editor"
                  >
                    <Text style={styles.openComposerText}>Open Composer</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.sendCustomButton,
                      (isSendingCustom || customText.trim().length === 0) &&
                        styles.sendCustomButtonDisabled,
                    ]}
                    onPress={() => void handleSendCustom()}
                    disabled={isSendingCustom || customText.trim().length === 0}
                    accessibilityRole="button"
                    accessibilityLabel="Send custom reply"
                  >
                    <Text style={styles.sendCustomButtonText}>
                      {isSendingCustom ? "Sending..." : "Send Reply"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── API base helper ──────────────────────────────────────────────────────────

function getApiBase(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try {
    const Constants = require("expo-constants") as {
      default: { expoConfig?: { extra?: Record<string, unknown> } };
    };
    const extra = Constants.default.expoConfig?.extra;
    if (extra && typeof extra["apiUrl"] === "string") {
      return extra["apiUrl"];
    }
  } catch {
    // Constants not available
  }
  return "http://localhost:3001";
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,6,23,0.6)",
  },
  keyboardAvoid: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0f172a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: "#1e293b",
    maxHeight: "85%",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#334155",
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1e293b",
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 2,
  },
  subtitle: {
    color: "#64748b",
    fontSize: 13,
  },
  closeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "500",
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: 24,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  contextRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  contextFrom: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 0,
  },
  contextPreview: {
    color: "#64748b",
    fontSize: 12,
    flex: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
  loadingText: {
    color: "#64748b",
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    marginBottom: 4,
  },
  retryText: {
    color: "#3b82f6",
    fontSize: 12,
    fontWeight: "600",
  },
  suggestionCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  suggestionCardActive: {
    borderColor: "#3b82f6",
    backgroundColor: "rgba(59,130,246,0.1)",
  },
  suggestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  suggestionIcon: {
    fontSize: 12,
  },
  suggestionLength: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  highConfidence: {
    color: "#10b981",
    fontSize: 10,
    fontWeight: "600",
  },
  suggestionText: {
    color: "#e2e8f0",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  suggestionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sendButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  editButtonText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "500",
  },
  textInput: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 14,
    color: "#e2e8f0",
    fontSize: 14,
    minHeight: 80,
    lineHeight: 20,
  },
  customActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  openComposerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  openComposerText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "500",
  },
  sendCustomButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  sendCustomButtonDisabled: {
    opacity: 0.4,
  },
  sendCustomButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
