"use client";

/**
 * CollaborativeDraftViewDynamic — the ONLY supported entry point for the
 * real-time collaborative draft editor.
 *
 * `CollaborativeDraftView` transitively pulls in yjs / lib0 / y-protocols
 * (~50KB gz) via `lib/collab-client.ts`. Importing it statically would leak
 * the CRDT runtime into the importing page's initial JS bundle the moment any
 * dashboard route references it.
 *
 * To protect the <100KB initial-JS budget (CLAUDE.md "THE QUALITY BAR"), this
 * wrapper loads the component through `next/dynamic` with `ssr: false`, so the
 * CRDT runtime is code-split into a separate chunk that only downloads when the
 * collaborative editor is actually rendered.
 *
 * DO NOT import `CollaborativeDraftView` directly from
 * "./CollaborativeDraftView" in app/route code — always import this wrapper.
 */

import dynamic from "next/dynamic";
import { Box, Text } from "@alecrae/ui";
import type { CollaborativeDraftViewProps } from "./CollaborativeDraftView";

export type { CollaborativeDraftViewProps } from "./CollaborativeDraftView";

const CollaborativeDraftViewDynamic = dynamic(
  () =>
    import("./CollaborativeDraftView").then(
      (mod) => mod.CollaborativeDraftView,
    ),
  {
    ssr: false,
    loading: () => (
      <Box
        className="flex items-center justify-center w-full min-h-[200px] rounded-xl bg-white/[0.03] border border-white/10"
        role="status"
        aria-label="Loading collaborative editor"
      >
        <Text variant="body-sm" className="text-blue-100/50">
          Loading collaborative editor…
        </Text>
      </Box>
    ),
  },
);

export { CollaborativeDraftViewDynamic };
export default CollaborativeDraftViewDynamic;

export type CollaborativeDraftViewDynamicProps = CollaborativeDraftViewProps;
