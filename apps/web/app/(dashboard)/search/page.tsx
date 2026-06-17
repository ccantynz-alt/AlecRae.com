"use client";

import { useState } from "react";
import {
  Box,
  Text,
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  PageLayout,
} from "@alecrae/ui";
import { EmailQueryConsole } from "../../../components/EmailQueryConsole";
import { aiSearchApi, type AISearchResult } from "../../../lib/api-features";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SearchPage(): React.ReactNode {
  return (
    <PageLayout
      title="Search"
      description="Search your email in natural language, or query your inbox like a database."
    >
      <Box className="space-y-8">
        <AISearchSection />

        <Box>
          <Text variant="heading-sm" className="mb-1">
            Query console
          </Text>
          <Text variant="body-sm" muted className="mb-4">
            Treat your inbox as a dataset — run natural language or SQL-like
            queries, save them, and export results.
          </Text>
          <EmailQueryConsole />
        </Box>
      </Box>
    </PageLayout>
  );
}

// ─── AI natural language search ──────────────────────────────────────────────

function AISearchSection(): React.ReactNode {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AISearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (): Promise<void> => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await aiSearchApi.search(query.trim());
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <Text variant="heading-sm">AI search</Text>
        <Text variant="body-sm" muted>
          Ask in plain English — e.g. &ldquo;the PDF Sarah sent about the Q3
          budget last month&rdquo;.
        </Text>
      </CardHeader>
      <CardContent>
        {error && (
          <Box className="mb-3 rounded border border-red-200 bg-red-50 p-2" role="alert">
            <Text variant="body-sm" className="text-red-800">
              {error}
            </Text>
          </Box>
        )}
        <Box className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Box className="flex-1">
            <Input
              label="Search query"
              variant="text"
              placeholder="Find emails about..."
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") void handleSearch();
              }}
            />
          </Box>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSearch}
            disabled={searching || !query.trim()}
          >
            {searching ? "Searching..." : "Search"}
          </Button>
        </Box>

        {result && (
          <Box className="mt-5 space-y-3" aria-live="polite">
            <Text variant="caption" muted>
              {result.totalHits} result{result.totalHits !== 1 ? "s" : ""} in{" "}
              {result.processingTimeMs}ms
            </Text>
            {result.message && (
              <Box className="rounded-md border border-border bg-surface-secondary p-3">
                <Text variant="body-sm" muted>
                  {result.message}
                </Text>
              </Box>
            )}
            {result.results.length === 0 && !result.message ? (
              <Box className="py-6 text-center">
                <Text variant="body-sm" muted>
                  No matching emails found.
                </Text>
              </Box>
            ) : (
              result.results.map((hit) => (
                <Box
                  key={hit.id}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <Box className="flex items-center justify-between gap-3">
                    <Text variant="body-sm" className="font-semibold truncate">
                      {hit.subject || "(no subject)"}
                    </Text>
                    <Text variant="caption" muted className="shrink-0">
                      {formatDate(hit.date)}
                    </Text>
                  </Box>
                  <Text variant="caption" muted>
                    {hit.from.name ? `${hit.from.name} <${hit.from.email}>` : hit.from.email}
                  </Text>
                  {hit.snippet && (
                    <Text variant="body-sm" muted className="mt-1 line-clamp-2">
                      {hit.snippet}
                    </Text>
                  )}
                </Box>
              ))
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

AISearchSection.displayName = "AISearchSection";
