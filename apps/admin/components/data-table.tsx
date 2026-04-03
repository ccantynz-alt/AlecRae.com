"use client";

import { useState, useMemo, useCallback } from "react";
import { Box, Text, Button } from "@emailed/ui";

type SortDirection = "asc" | "desc";

interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: T) => React.ReactNode;
  readonly sortable?: boolean;
  readonly sortValue?: (row: T) => string | number;
  readonly width?: string;
}

interface DataTableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly data: readonly T[];
  readonly pageSize?: number;
  readonly filterPlaceholder?: string;
  readonly filterFn?: (row: T, query: string) => boolean;
  readonly emptyMessage?: string;
  readonly rowKey: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  pageSize = 10,
  filterPlaceholder = "Search...",
  filterFn,
  emptyMessage = "No data available",
  rowKey,
}: DataTableProps<T>) {
  const [filterQuery, setFilterQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(0);

  const filteredData = useMemo(() => {
    if (!filterQuery || !filterFn) return data;
    return data.filter((row) => filterFn(row, filterQuery));
  }, [data, filterQuery, filterFn]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return filteredData;

    const sortValue = column.sortValue;
    return [...filteredData].sort((a, b) => {
      const aVal = sortValue(a);
      const bVal = sortValue(b);
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortKey, sortDirection, columns]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = sortedData.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setCurrentPage(0);
  }, [sortKey]);

  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterQuery(e.target.value);
    setCurrentPage(0);
  }, []);

  return (
    <Box className="rounded-xl bg-surface-secondary border border-border overflow-hidden">
      {filterFn && (
        <Box className="p-4 border-b border-border">
          <Box
            as="input"
            type="text"
            placeholder={filterPlaceholder}
            value={filterQuery}
            onChange={handleFilterChange}
            className="w-full max-w-sm px-3 py-2 bg-surface border border-border rounded-lg text-body-sm text-content placeholder:text-content-tertiary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus"
            aria-label={filterPlaceholder}
          />
        </Box>
      )}

      <Box className="overflow-x-auto">
        <Box as="table" className="w-full" role="table">
          <Box as="thead">
            <Box as="tr" className="border-b border-border">
              {columns.map((column) => (
                <Box
                  key={column.key}
                  as="th"
                  className={`text-left px-4 py-3 ${column.width ?? ""}`}
                  scope="col"
                >
                  {column.sortable ? (
                    <Box
                      as="button"
                      onClick={() => handleSort(column.key)}
                      className="flex items-center gap-1 text-caption font-semibold text-content-secondary uppercase tracking-wider hover:text-content transition-colors"
                      aria-sort={sortKey === column.key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    >
                      {column.header}
                      <SortIndicator active={sortKey === column.key} direction={sortDirection} />
                    </Box>
                  ) : (
                    <Text as="span" variant="caption" className="font-semibold text-content-secondary uppercase tracking-wider">
                      {column.header}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
          <Box as="tbody">
            {paginatedData.length === 0 ? (
              <Box as="tr">
                <Box as="td" colSpan={columns.length} className="px-4 py-12 text-center">
                  <Text variant="body-sm" className="text-content-tertiary">{emptyMessage}</Text>
                </Box>
              </Box>
            ) : (
              paginatedData.map((row) => (
                <Box key={rowKey(row)} as="tr" className="border-b border-border/50 hover:bg-surface-tertiary/30 transition-colors">
                  {columns.map((column) => (
                    <Box key={column.key} as="td" className="px-4 py-3">
                      {column.render(row)}
                    </Box>
                  ))}
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>

      {totalPages > 1 && (
        <Box className="flex items-center justify-between px-4 py-3 border-t border-border">
          <Text variant="caption" className="text-content-secondary">
            Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, sortedData.length)} of {sortedData.length}
          </Text>
          <Box className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              Previous
            </Button>
            <Text variant="caption" className="text-content-secondary px-2">
              {currentPage + 1} / {totalPages}
            </Text>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              Next
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function SortIndicator({ active, direction }: { readonly active: boolean; readonly direction: SortDirection }) {
  return (
    <Box as="svg" className={`w-3 h-3 ${active ? "text-content" : "text-content-tertiary"}`} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <Box as="path" d="M6 2l3 4H3z" opacity={active && direction === "asc" ? 1 : 0.3} />
      <Box as="path" d="M6 10l3-4H3z" opacity={active && direction === "desc" ? 1 : 0.3} />
    </Box>
  );
}

SortIndicator.displayName = "SortIndicator";
DataTable.displayName = "DataTable";
