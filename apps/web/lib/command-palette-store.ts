/**
 * AlecRae Command Palette store — shared open/close state.
 *
 * The CommandPalette component (mounted once in the dashboard layout) renders
 * from this store, so any page can open/toggle the palette programmatically —
 * e.g. the inbox keyboard-shortcut registry wires its `openCommandPalette`
 * action here instead of relying solely on the palette's own Cmd+K listener.
 */

import { create } from "zustand";

export interface CommandPaletteState {
  /** Whether the palette is currently visible. */
  open: boolean;
  /** Explicitly open or close the palette. */
  setOpen: (open: boolean) => void;
  /** Toggle the palette. */
  toggle: () => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
