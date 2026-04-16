/**
 * Lightweight data-fetching hook for the admin dashboard.
 *
 * Provides loading / error / data state without requiring TanStack Query.
 * Re-fetches when the `key` array changes (shallow comparison).
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const execute = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "An error occurred");
          setLoading(false);
        }
      });
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    execute();
    return () => {
      mountedRef.current = false;
    };

  }, [execute, ...deps]);

  return { data, error, loading, refetch: execute };
}
