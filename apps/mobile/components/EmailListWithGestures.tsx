/**
 * AlecRae Mobile — EmailListWithGestures
 *
 * FlatList host for SwipeableEmailRow. Implements optimistic UI:
 * the row is removed instantly when an action commits, and reinserted
 * (at its previous index) if the async handler rejects. Failure cases
 * trigger an error haptic so the user knows something went wrong.
 */

import React, { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from "react-native";

import {
  SwipeableEmailRow,
  type EmailRowData,
} from "./SwipeableEmailRow";
import type { ActionKind, SwipeActionConfig } from "../lib/gestures";
import { error as errorHaptic } from "../lib/haptics";

export interface EmailListWithGesturesProps {
  initialEmails: EmailRowData[];
  /**
   * Async action handler. Reject (or throw) to trigger rollback.
   * Resolve to confirm the optimistic update.
   */
  onAction: (id: string, action: ActionKind) => Promise<void>;
  onOpen?: (id: string) => void;
  swipeConfig?: SwipeActionConfig;
}

interface PendingRemoval {
  email: EmailRowData;
  index: number;
}

export function EmailListWithGestures({
  initialEmails,
  onAction,
  onOpen,
  swipeConfig,
}: EmailListWithGesturesProps): React.ReactElement {
  const [emails, setEmails] = useState<EmailRowData[]>(initialEmails);

  const handleAction = useCallback(
    (id: string, action: ActionKind): void => {
      // Optimistic removal — capture for rollback.
      // Use a mutable ref-like object so TypeScript tracks mutation correctly.
      const pendingRef: { value: PendingRemoval | null } = { value: null };
      setEmails((current) => {
        const index = current.findIndex((e) => e.id === id);
        if (index === -1) return current;
        const email = current[index];
        if (!email) return current;
        pendingRef.value = { email, index };
        const next = current.slice();
        next.splice(index, 1);
        return next;
      });

      void (async (): Promise<void> => {
        try {
          await onAction(id, action);
        } catch {
          // Rollback: reinsert at the original index.
          const snapshot = pendingRef.value;
          if (snapshot) {
            errorHaptic();
            setEmails((current) => {
              const next = current.slice();
              const insertAt = Math.min(snapshot.index, next.length);
              next.splice(insertAt, 0, snapshot.email);
              return next;
            });
          }
        }
      })();
    },
    [onAction],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<EmailRowData>): React.ReactElement => (
      <SwipeableEmailRow
        email={item}
        onAction={handleAction}
        onPress={onOpen}
        config={swipeConfig}
      />
    ),
    [handleAction, onOpen, swipeConfig],
  );

  const keyExtractor = useCallback((item: EmailRowData): string => item.id, []);

  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: 32 }),
    [],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={emails}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={contentContainerStyle}
        removeClippedSubviews
        windowSize={11}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
});
