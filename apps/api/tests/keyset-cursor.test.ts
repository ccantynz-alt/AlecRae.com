/**
 * Keyset pagination cursors (issues #74g, #75b).
 *
 * Several list endpoints ordered by one column and paginated by another —
 * ordering by `mentionCount` or `strength` while filtering `WHERE id < cursor`.
 * Those columns have no relationship, so the filter excluded an essentially
 * random subset of the ordering: pages skipped rows and repeated others. The
 * response still looked well-formed, so nothing surfaced as an error; the list
 * simply lied about its contents as the user scrolled.
 *
 * The tiebreaker is the part worth pinning. `mentionCount` and `strength` are
 * heavily tied — thousands of rows can share a value — so a cursor carrying
 * only the sort value would drop or duplicate every row at the boundary.
 */

import { describe, it, expect } from "vitest";
import {
  encodeKeysetCursor,
  decodeKeysetCursor,
} from "../src/lib/keyset-cursor.js";

describe("round trip", () => {
  it("preserves a numeric sort value and its tiebreaker", () => {
    const cursor = encodeKeysetCursor(42, "ent_abc");
    expect(decodeKeysetCursor(cursor)).toEqual({ value: "42", id: "ent_abc" });
  });

  it("preserves a date sort value as ISO", () => {
    const at = new Date("2026-03-02T09:00:00.000Z");
    const decoded = decodeKeysetCursor(encodeKeysetCursor(at, "ent_x"));
    expect(decoded?.value).toBe("2026-03-02T09:00:00.000Z");
    expect(new Date(decoded?.value ?? "").getTime()).toBe(at.getTime());
  });

  it("preserves a fractional strength without rounding", () => {
    // Relationship strength is a real; truncating it would merge adjacent
    // rows onto one boundary and reintroduce the skip/repeat behaviour.
    const decoded = decodeKeysetCursor(encodeKeysetCursor(0.7250001, "rel_1"));
    expect(Number(decoded?.value)).toBeCloseTo(0.7250001, 7);
  });

  it("survives an id containing the separator", () => {
    // Split on the FIRST space only — an id with a space in it must not
    // silently truncate, which would point the cursor at the wrong row.
    const decoded = decodeKeysetCursor(encodeKeysetCursor(5, "id with spaces"));
    expect(decoded).toEqual({ value: "5", id: "id with spaces" });
  });
});

describe("malformed input restarts pagination rather than failing", () => {
  it("returns null for an absent cursor", () => {
    expect(decodeKeysetCursor(undefined)).toBeNull();
    expect(decodeKeysetCursor("")).toBeNull();
  });

  it("returns null for a bare id — the old cursor format", () => {
    // Old links and bookmarks carry a raw id. Treating one as a valid cursor
    // would resume from a nonsensical position; treating it as absent just
    // restarts, which is the safe reading.
    expect(decodeKeysetCursor("ent_abc")).toBeNull();
  });

  it("returns null rather than throwing on undecodable input", () => {
    // These arrive from clients, so a mangled one must not 500.
    expect(() => decodeKeysetCursor("!!!not-base64!!!")).not.toThrow();
    expect(decodeKeysetCursor("%%%%")).toBeNull();
  });
});

describe("cursors are visibly distinct from ids", () => {
  it("does not encode to something that looks like a bare id", () => {
    // The bug being fixed was precisely that a cursor and an id were
    // interchangeable. Keeping them distinguishable means a regression that
    // paginates on the wrong column fails loudly instead of silently.
    const cursor = encodeKeysetCursor(42, "ent_abc");
    expect(cursor).not.toBe("ent_abc");
    expect(cursor).not.toContain("ent_abc");
  });
});
