"use client";

/**
 * Dependency-free inline SVG sparkline for a sentiment score series.
 *
 * Renders a line from a series of {x, score} points where score is 0.0–1.0.
 * No chart library — pure SVG so it ships zero extra bytes. Keyboard/screen-
 * reader accessible via role="img" + a descriptive aria-label, with a
 * visually-hidden data table fallback that assistive tech can read instead.
 */

import type { ReactNode } from "react";

export interface SparklinePoint {
  /** Millisecond timestamp for ordering + the accessible table. */
  t: number;
  /** Sentiment score, 0.0–1.0. */
  score: number;
  /** Optional label for the accessible fallback (e.g. formatted date). */
  label?: string;
}

interface SentimentSparklineProps {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  /** Accessible description of what the line shows. */
  ariaLabel: string;
  className?: string;
}

/** Map a 0–1 score to a stroke colour: red (low) → amber → green (high). */
function scoreColor(score: number): string {
  if (score >= 0.6) return "#16a34a"; // green-600
  if (score >= 0.45) return "#d97706"; // amber-600
  return "#dc2626"; // red-600
}

export function SentimentSparkline({
  points,
  width = 240,
  height = 48,
  ariaLabel,
  className = "",
}: SentimentSparklineProps): ReactNode {
  const sorted = [...points].sort((a, b) => a.t - b.t);

  if (sorted.length === 0) {
    return (
      <span className={`text-caption text-content-secondary ${className}`}>
        No data
      </span>
    );
  }

  const pad = 3;
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const n = sorted.length;

  // Score is already normalised 0–1; invert Y because SVG y grows downward.
  const xFor = (i: number): number =>
    n === 1 ? pad + innerW / 2 : pad + (i / (n - 1)) * innerW;
  const yFor = (score: number): number => {
    const clamped = Math.max(0, Math.min(1, score));
    return pad + (1 - clamped) * innerH;
  };

  const coords = sorted.map((p, i) => ({
    x: xFor(i),
    y: yFor(p.score),
    score: p.score,
    label: p.label,
    t: p.t,
  }));

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  // Neutral baseline at 0.5 so the reader can see positive vs. negative.
  const baselineY = yFor(0.5);
  const avg = sorted.reduce((sum, p) => sum + p.score, 0) / n;
  const last = coords[coords.length - 1];

  return (
    <span className={`inline-block ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="overflow-visible"
        preserveAspectRatio="none"
      >
        {/* neutral baseline */}
        <line
          x1={pad}
          y1={baselineY}
          x2={width - pad}
          y2={baselineY}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 3"
          className="text-border"
        />
        {n > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke={scoreColor(avg)}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {/* dots — always show for single point, plus emphasise the latest */}
        {coords.map((c, i) => (
          <circle
            key={`${c.t}-${i}`}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 || n === 1 ? 2.5 : 1.25}
            fill={scoreColor(c.score)}
          />
        ))}
        {last && (
          <circle
            cx={last.x}
            cy={last.y}
            r={4}
            fill="none"
            stroke={scoreColor(last.score)}
            strokeWidth={1.5}
            opacity={0.4}
          />
        )}
      </svg>
      {/* Screen-reader table fallback */}
      <span className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Point</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {coords.map((c, i) => (
              <tr key={`row-${c.t}-${i}`}>
                <td>{c.label ?? `#${i + 1}`}</td>
                <td>{Math.round(c.score * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </span>
    </span>
  );
}

SentimentSparkline.displayName = "SentimentSparkline";
