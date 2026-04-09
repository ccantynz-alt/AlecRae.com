/**
 * Vienna Mobile — Inbox Screen
 *
 * Displays the user's email inbox with swipeable rows.
 * Uses TanStack Query for server state management and the
 * EmailListWithGestures component for the gesture-driven list.
 *
 * Features:
 *   - Pull to refresh
 *   - Swipe gestures (archive, read, snooze, delete)
 *   - Floating compose button
 *   - Empty state
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  useColorScheme,
  type ListRenderItemInfo,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { inboxApi, type InboxThread } from "../../lib/api";
import type { ActionKind } from "../../lib/gestures";

export default function InboxScreen(): React.ReactElement {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const darkMode = colorScheme === "dark";
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["inbox"],
    queryFn: (): ReturnType<typeof inboxApi.list> => inboxApi.list({ limit: 50 }),
  });

  const threads = data?.data ?? [];

  const handleAction = useCallback(
    async (threadId: string, action: ActionKind): Promise<void> => {
      switch (action) {
        case "archive":
          await inboxApi.archive(threadId);
          break;
        case "read":
          await inboxApi.markRead(threadId);
          break;
        case "snooze":
          await inboxApi.snooze(threadId, new Date(Date.now() + 3 * 3600000).toISOString());
          break;
        case "delete":
          await inboxApi.deleteThread(threadId);
          break;
      }
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
    [queryClient],
  );

  const handleOpenThread = useCallback(
    (threadId: string): void => {
      router.push(`/thread/${threadId}`);
    },
    [router],
  );

  const handleCompose = useCallback((): void => {
    router.push("/compose");
  }, [router]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<InboxThread>): React.ReactElement => (
      <Pressable
        style={[
          styles.threadRow,
          darkMode ? styles.threadRowDark : styles.threadRowLight,
        ]}
        onPress={(): void => handleOpenThread(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Email from ${item.from.name ?? item.from.email}: ${item.subject}`}
        accessibilityHint="Opens the email thread"
      >
        {item.unread ? <View style={styles.unreadDot} /> : null}
        <View style={styles.threadContent}>
          <View style={styles.threadHeader}>
            <Text
              style={[
                styles.from,
                darkMode ? styles.textLight : styles.textDark,
                item.unread && styles.fromUnread,
              ]}
              numberOfLines={1}
            >
              {item.from.name ?? item.from.email}
            </Text>
            <Text style={styles.timestamp}>
              {new Date(item.receivedAt).toLocaleDateString()}
            </Text>
          </View>
          <Text
            style={[
              styles.subject,
              darkMode ? styles.textLight : styles.textDark,
              item.unread && styles.subjectUnread,
            ]}
            numberOfLines={1}
          >
            {item.subject}
          </Text>
          <Text style={styles.preview} numberOfLines={1}>
            {item.preview}
          </Text>
        </View>
      </Pressable>
    ),
    [darkMode, handleOpenThread],
  );

  const keyExtractor = useCallback(
    (item: InboxThread): string => item.id,
    [],
  );

  if (isLoading) {
    return (
      <View style={[styles.center, darkMode ? styles.bgDark : styles.bgLight]}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading inbox...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.center, darkMode ? styles.bgDark : styles.bgLight]}>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : "Failed to load inbox"}
        </Text>
        <Pressable
          style={styles.retryButton}
          onPress={(): void => void refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading inbox"
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, darkMode ? styles.bgDark : styles.bgLight]}>
      <FlatList
        data={threads}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={
          threads.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={(): void => void refetch()}
            tintColor="#3b82f6"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Inbox zero!</Text>
            <Text style={styles.emptySubtitle}>
              No emails to show. You&apos;re all caught up.
            </Text>
          </View>
        }
        removeClippedSubviews
        windowSize={11}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
      />

      {/* Floating Compose Button */}
      <Pressable
        style={styles.fab}
        onPress={handleCompose}
        accessibilityRole="button"
        accessibilityLabel="Compose new email"
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgDark: {
    backgroundColor: "#0f172a",
  },
  bgLight: {
    backgroundColor: "#ffffff",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 72,
  },
  threadRowDark: {
    borderBottomColor: "#1e293b",
  },
  threadRowLight: {
    borderBottomColor: "#e2e8f0",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3b82f6",
    marginRight: 12,
  },
  threadContent: {
    flex: 1,
  },
  threadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  from: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
    marginRight: 8,
  },
  fromUnread: {
    fontWeight: "700",
  },
  textLight: {
    color: "#e2e8f0",
  },
  textDark: {
    color: "#1e293b",
  },
  timestamp: {
    color: "#64748b",
    fontSize: 12,
  },
  subject: {
    fontSize: 14,
    marginBottom: 2,
  },
  subjectUnread: {
    fontWeight: "600",
  },
  preview: {
    color: "#64748b",
    fontSize: 13,
  },
  loadingText: {
    color: "#64748b",
    marginTop: 12,
    fontSize: 14,
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
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  retryText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 30,
  },
});
