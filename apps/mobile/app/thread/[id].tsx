/**
 * Vienna Mobile — Thread Detail Screen
 *
 * Displays all messages in an email thread. Each message is rendered
 * as an expandable card showing sender, timestamp, and body content.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  useColorScheme,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { inboxApi, type ThreadMessage } from "../../lib/api";

export default function ThreadScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const darkMode = colorScheme === "dark";

  const {
    data: thread,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["thread", id],
    queryFn: (): ReturnType<typeof inboxApi.getThread> =>
      inboxApi.getThread(id ?? ""),
    enabled: !!id,
  });

  const handleReply = useCallback((): void => {
    router.push("/compose");
  }, [router]);

  if (isLoading) {
    return (
      <View style={[styles.center, darkMode ? styles.bgDark : styles.bgLight]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (isError || !thread) {
    return (
      <View style={[styles.center, darkMode ? styles.bgDark : styles.bgLight]}>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : "Failed to load thread"}
        </Text>
        <Pressable
          style={styles.retryButton}
          onPress={(): void => void refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading thread"
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, darkMode ? styles.bgDark : styles.bgLight]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Thread subject */}
        <Text style={[styles.subject, darkMode ? styles.textLight : styles.textDark]}>
          {thread.subject}
        </Text>

        {/* Messages */}
        {thread.messages.map((message) => (
          <MessageCard
            key={message.id}
            message={message}
            darkMode={darkMode}
          />
        ))}
      </ScrollView>

      {/* Reply bar */}
      <View style={[styles.replyBar, darkMode ? styles.replyBarDark : styles.replyBarLight]}>
        <Pressable
          style={styles.replyButton}
          onPress={handleReply}
          accessibilityRole="button"
          accessibilityLabel="Reply to this email"
        >
          <Text style={styles.replyButtonText}>Reply</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface MessageCardProps {
  readonly message: ThreadMessage;
  readonly darkMode: boolean;
}

function MessageCard({ message, darkMode }: MessageCardProps): React.ReactElement {
  const formattedDate = new Date(message.receivedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={[styles.messageCard, darkMode ? styles.cardDark : styles.cardLight]}>
      <View style={styles.messageHeader}>
        <View style={styles.senderInfo}>
          <Text style={[styles.senderName, darkMode ? styles.textLight : styles.textDark]}>
            {message.from.name ?? message.from.email}
          </Text>
          <Text style={styles.senderEmail}>
            {message.from.name ? `<${message.from.email}>` : ""}
          </Text>
        </View>
        <Text style={styles.messageDate}>{formattedDate}</Text>
      </View>

      {/* Recipients */}
      <Text style={styles.recipientLine} numberOfLines={1}>
        To:{" "}
        {message.to
          .map((addr) => addr.name ?? addr.email)
          .join(", ")}
      </Text>

      {/* Body */}
      <Text style={[styles.messageBody, darkMode ? styles.textLight : styles.textDark]}>
        {message.textBody ?? "(No text content)"}
      </Text>

      {/* Attachments */}
      {message.attachments.length > 0 ? (
        <View style={styles.attachments}>
          <Text style={styles.attachmentLabel}>
            {message.attachments.length} attachment
            {message.attachments.length > 1 ? "s" : ""}
          </Text>
          {message.attachments.map((att, index) => (
            <View key={`${att.filename}-${index}`} style={styles.attachmentRow}>
              <Text style={styles.attachmentName} numberOfLines={1}>
                {att.filename}
              </Text>
              <Text style={styles.attachmentSize}>
                {formatBytes(att.size)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgDark: {
    backgroundColor: "#0f172a",
  },
  bgLight: {
    backgroundColor: "#f8fafc",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  subject: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 20,
    lineHeight: 28,
  },
  messageCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardDark: {
    backgroundColor: "#1e293b",
  },
  cardLight: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  senderInfo: {
    flex: 1,
    marginRight: 8,
  },
  senderName: {
    fontSize: 15,
    fontWeight: "700",
  },
  senderEmail: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  messageDate: {
    fontSize: 12,
    color: "#64748b",
  },
  recipientLine: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 12,
  },
  messageBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  textLight: {
    color: "#e2e8f0",
  },
  textDark: {
    color: "#1e293b",
  },
  attachments: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148, 163, 184, 0.2)",
  },
  attachmentLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 8,
  },
  attachmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    minHeight: 36,
  },
  attachmentName: {
    fontSize: 13,
    color: "#3b82f6",
    fontWeight: "500",
    flex: 1,
    marginRight: 8,
  },
  attachmentSize: {
    fontSize: 12,
    color: "#64748b",
  },
  replyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  replyBarDark: {
    backgroundColor: "#0f172a",
    borderTopColor: "#1e293b",
  },
  replyBarLight: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e2e8f0",
  },
  replyButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  replyButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  retryText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
});
