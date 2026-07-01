import { describe, it, expect } from "bun:test";
import { parseSndsResponse, alertLevelForSndsColor } from "../src/snds/index.js";

describe("parseSndsResponse", () => {
  it("parses IP, color, and percentage from a delimited line", () => {
    const body = "149.28.119.158\t2026-07-01\tGREEN\t0.02%\n";
    const results = parseSndsResponse(body);
    expect(results).toHaveLength(1);
    expect(results[0]?.ip).toBe("149.28.119.158");
    expect(results[0]?.color).toBe("GREEN");
    expect(results[0]?.complaintRatePercent).toBe(0.02);
  });

  it("skips lines with no IP or no color", () => {
    const body = ["header,row,no,ip", "149.28.119.158 has no color word here", "not an ip RED"].join(
      "\n",
    );
    expect(parseSndsResponse(body)).toEqual([]);
  });

  it("handles multiple IPs across lines", () => {
    const body = "1.2.3.4 status=RED\n5.6.7.8 status=YELLOW\n9.10.11.12 status=GREEN\n";
    const results = parseSndsResponse(body);
    expect(results.map((r) => r.color)).toEqual(["RED", "YELLOW", "GREEN"]);
  });

  it("is case-insensitive on the color word", () => {
    const body = "1.2.3.4 status=red\n";
    expect(parseSndsResponse(body)[0]?.color).toBe("RED");
  });
});

describe("alertLevelForSndsColor", () => {
  it("maps GREEN -> info, YELLOW -> warning, RED -> page", () => {
    expect(alertLevelForSndsColor("GREEN")).toBe("info");
    expect(alertLevelForSndsColor("YELLOW")).toBe("warning");
    expect(alertLevelForSndsColor("RED")).toBe("page");
  });

  it("treats UNKNOWN as a warning, not silent", () => {
    expect(alertLevelForSndsColor("UNKNOWN")).toBe("warning");
  });
});
