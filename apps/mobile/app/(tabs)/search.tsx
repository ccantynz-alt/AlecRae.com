/**
 * Vienna Mobile — Search Screen
 *
 * Full-text search across all emails. Uses the /v1/messages/search endpoint
 * with debounced input. Displays results as a list of matching threads
 * with highlighted snippets.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  useColorScheme,
  type ListRenderItemInfo,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { messagesApi, type SearchResult } from "../../lib/api";

export default function SearchScreen(): React.ReactElement {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const darkMode = colorScheme === "dark";
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = useCallback((text: string): void => {
    setQuery(text);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout((): void => {
      setDebouncedQuery(text.trim());
    }, 300);
  }, []);

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: (): ReturnType<typeof messagesApi.search> =>
      messagesApi.search({ q: debouncedQuery, limit: 30 }),
    enabled: debouncedQuery.length >= 2,
  });

  const results = data?.data ?? [];

  const handleOpenResult = useCallback(
    (id: string): void => {
      router.push(`/thread/${id}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SearchResult>): React.ReactElement => (
      <Pressable
        style={[
          styles.resultRow,
          darkMode ? styles.resultRowDark : styles.resultRowLight,
        ]}
        onPress={(): void => handleOpenResult(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Search result: ${item.subject} from ${item.from.name ?? item.from.email}`}
      >
        <Text
          style={[styles.resultFrom, darkMode ? styles.textLight : styles.textDark]}
          numberOfLines={1}
        >
          {item.from.name ?? item.from.email}
        </Text>
        <Text
          style={[styles.resultSubject, darkMode ? styles.textLight : styles.textDark]}
          numberOfLines={1}
        >
          {item.subject}
        </Text>
        <Text style={styles.resultSnippet} numberOfLines={2}>
          {item.snippet}
        </Text>
      </Pressable>
    ),
    [darkMode, handleOpenResult],
  );

  const keyExtractor = useCallback(
    (item: SearchResult): string => item.id,
    [],
  );

  return (
    <View style={[styles.container, darkMode ? styles.bgDark : styles.bgLight]}>
      {/* Search Input */}
      <View style={styles.searchBarWrapper}>
        <TextInput
          style={[
            styles.searchInput,
            darkMode ? styles.searchInputDark : styles.searchInputLight,
          ]}
          placeholder="Search emails..."
          placeholderTextColor="#64748b"
          value={query}
          onChangeText={handleQueryChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search emails"
          accessibilityHint="Type to search across all your emails"
        />
      </View>

      {/* Results */}
      {debouncedQuery.length < 2 ? (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            Type at least 2 characters to search
          </Text>
        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Search failed. Please try again.</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={
            results.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No results</Text>
              <Text style={styles.emptySubtitle}>
                No emails match &quot;{debouncedQuery}&quot;
              </Text>
            </View>
          }
          ListHeaderComponent={
            data ? (
              <Text style={styles.resultCount}>
                {data.totalHits} result{data.totalHits === 1 ? "" : "s"} in{" "}
                {data.processingTimeMs}ms
              </Text>
            ) : null
          }
        />
      )}
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
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  searchInputDark: {
    backgroundColor: "#1e293b",
    color: "#e2e8f0",
    borderWidth: 1,
    borderColor: "#334155",
  },
  searchInputLight: {
    backgroundColor: "#f1f5f9",
    color: "#1e293b",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  placeholderText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 32,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  resultCount: {
    color: "#64748b",
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  resultRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 72,
  },
  resultRowDark: {
    borderBottomColor: "#1e293b",
  },
  resultRowLight: {
    borderBottomColor: "#e2e8f0",
  },
  resultFrom: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  resultSubject: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 4,
  },
  resultSnippet: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
  },
  textLight: {
    color: "#e2e8f0",
  },
  textDark: {
    color: "#1e293b",
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
  },
});
