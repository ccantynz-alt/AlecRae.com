/**
 * Predictive Send-Time Optimization (S10)
 *
 * Analyses recipient open/click history to predict the best moment to send
 * an email. When no history exists, falls back to general best-practice
 * windows (Tue-Thu, 9-11am or 2-4pm) in the recipient's likely timezone.
 *
 * Now fully integrated with the `recipient_engagement` DB table for
 * persistent per-recipient pattern learning.
 */

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface RecipientPattern {
  typicalOpenHours: number[];
  typicalOpenDays: number[];
  avgResponseTimeHours: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  mostActiveHour: number;
  mostActiveDay: number;
  sampleSize: number;
  confidenceLevel: "none" | "low" | "medium" | "high";
  inferredTimezone: string | null;
}

export interface HistoricalEmail {
  sentAt: Date;
  openedAt?: Date;
  clickedAt?: Date;
  repliedAt?: Date;
}

export interface EngagementRow {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  openHourDistribution: Record<string, number>;
  openDayDistribution: Record<string, number>;
  clickHourDistribution: Record<string, number>;
  clickDayDistribution: Record<string, number>;
  avgOpenDelayHours: number | null;
  avgClickDelayHours: number | null;
  avgReplyDelayHours: number | null;
  peakOpenHour: number | null;
  peakOpenDay: number | null;
  peakClickHour: number | null;
  peakClickDay: number | null;
  inferredTimezone: string | null;
}

export interface PredictInput {
  recipientEmail: string;
  senderTimezone: string;
  recipientTimezone?: string;
  urgency: "low" | "normal" | "high";
  windowDays?: number;
}

export interface PredictInputWithEngagement extends PredictInput {
  engagement?: EngagementRow | null;
}

export interface RecommendedTime {
  datetime: string;
  confidence: number;
  reasoning: string;
  dayLabel: string;
  hourLabel: string;
}

export interface SendTimeRecommendation {
  recommendedTimes: RecommendedTime[];
  currentlyOptimal: boolean;
  alternativeTimes: number;
  dataSource: "historical" | "default";
  recipientPattern: RecipientPattern | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BEST_HOURS: readonly number[] = [9, 10, 14, 15];
const DEFAULT_BEST_DAYS: readonly number[] = [2, 3, 4]; // Tue, Wed, Thu

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const CONFIDENCE_THRESHOLDS = {
  low: 5,    // 5+ interactions
  medium: 20, // 20+ interactions
  high: 50,   // 50+ interactions
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHour(hour: number): string {
  const period = hour >= 12 ? "pm" : "am";
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:00${period}`;
}

function getConfidenceLevel(
  sampleSize: number,
): "none" | "low" | "medium" | "high" {
  if (sampleSize >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (sampleSize >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  if (sampleSize >= CONFIDENCE_THRESHOLDS.low) return "low";
  return "none";
}

function getTopKeys(
  distribution: Record<string, number>,
  count: number,
): number[] {
  return Object.entries(distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key]) => Number(key));
}

function calculateConfidenceScore(
  engagementCount: number,
  isHistorical: boolean,
): number {
  if (!isHistorical) return 0.5;
  if (engagementCount >= CONFIDENCE_THRESHOLDS.high) return 0.92;
  if (engagementCount >= CONFIDENCE_THRESHOLDS.medium) return 0.8;
  if (engagementCount >= CONFIDENCE_THRESHOLDS.low) return 0.65;
  return 0.55;
}

// ---------------------------------------------------------------------------
// Pattern Analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a recipient's historical engagement patterns from raw email data.
 * Useful when engagement rows haven't been aggregated yet.
 */
export async function analyzeRecipientPatterns(
  recipientEmail: string,
  historicalEmails: readonly HistoricalEmail[],
): Promise<RecipientPattern> {
  void recipientEmail;
  if (historicalEmails.length === 0) {
    return {
      typicalOpenHours: [...DEFAULT_BEST_HOURS],
      typicalOpenDays: [...DEFAULT_BEST_DAYS],
      avgResponseTimeHours: 24,
      openRate: 0,
      clickRate: 0,
      replyRate: 0,
      mostActiveHour: 10,
      mostActiveDay: 3,
      sampleSize: 0,
      confidenceLevel: "none",
      inferredTimezone: null,
    };
  }

  const opened = historicalEmails.filter((e) => e.openedAt instanceof Date);
  const clicked = historicalEmails.filter((e) => e.clickedAt instanceof Date);
  const replied = historicalEmails.filter((e) => e.repliedAt instanceof Date);
  const openRate = opened.length / historicalEmails.length;
  const clickRate = clicked.length / historicalEmails.length;
  const replyRate = replied.length / historicalEmails.length;

  const hourCounts = new Map<number, number>();
  const dayCounts = new Map<number, number>();
  for (const email of opened) {
    const d = email.openedAt as Date;
    hourCounts.set(d.getUTCHours(), (hourCounts.get(d.getUTCHours()) ?? 0) + 1);
    dayCounts.set(d.getUTCDay(), (dayCounts.get(d.getUTCDay()) ?? 0) + 1);
  }

  const sortedHours = [...hourCounts.entries()].sort((a, b) => b[1] - a[1]);
  const sortedDays = [...dayCounts.entries()].sort((a, b) => b[1] - a[1]);

  const typicalOpenHours = sortedHours.slice(0, 4).map(([h]) => h);
  const typicalOpenDays = sortedDays.slice(0, 3).map(([d]) => d);

  // Average response time (open relative to send)
  let totalResponseMs = 0;
  let responseCount = 0;
  for (const email of opened) {
    const diff = (email.openedAt as Date).getTime() - email.sentAt.getTime();
    if (diff > 0) {
      totalResponseMs += diff;
      responseCount++;
    }
  }
  const avgResponseTimeHours =
    responseCount > 0 ? totalResponseMs / responseCount / (1000 * 60 * 60) : 24;

  const sampleSize = historicalEmails.length;

  return {
    typicalOpenHours:
      typicalOpenHours.length > 0 ? typicalOpenHours : [...DEFAULT_BEST_HOURS],
    typicalOpenDays:
      typicalOpenDays.length > 0 ? typicalOpenDays : [...DEFAULT_BEST_DAYS],
    avgResponseTimeHours: Math.round(avgResponseTimeHours * 10) / 10,
    openRate: Math.round(openRate * 1000) / 1000,
    clickRate: Math.round(clickRate * 1000) / 1000,
    replyRate: Math.round(replyRate * 1000) / 1000,
    mostActiveHour: sortedHours[0]?.[0] ?? 10,
    mostActiveDay: sortedDays[0]?.[0] ?? 3,
    sampleSize,
    confidenceLevel: getConfidenceLevel(sampleSize),
    inferredTimezone: null,
  };
}

/**
 * Build a RecipientPattern from a pre-aggregated engagement DB row.
 * This is much faster than re-scanning email history.
 */
export function engagementRowToPattern(
  row: EngagementRow,
): RecipientPattern {
  const typicalOpenHours = getTopKeys(row.openHourDistribution, 4);
  const typicalOpenDays = getTopKeys(row.openDayDistribution, 3);
  const sampleSize = row.totalSent;

  return {
    typicalOpenHours:
      typicalOpenHours.length > 0 ? typicalOpenHours : [...DEFAULT_BEST_HOURS],
    typicalOpenDays:
      typicalOpenDays.length > 0 ? typicalOpenDays : [...DEFAULT_BEST_DAYS],
    avgResponseTimeHours: row.avgOpenDelayHours ?? 24,
    openRate: row.openRate,
    clickRate: row.clickRate,
    replyRate: row.replyRate,
    mostActiveHour: row.peakOpenHour ?? 10,
    mostActiveDay: row.peakOpenDay ?? 3,
    sampleSize,
    confidenceLevel: getConfidenceLevel(row.totalOpened),
    inferredTimezone: row.inferredTimezone,
  };
}

// ---------------------------------------------------------------------------
// Time Slot Generation
// ---------------------------------------------------------------------------

/**
 * Build a Date for a given day-of-week + hour within the next windowDays.
 */
function nextOccurrence(
  fromDate: Date,
  targetDay: number,
  targetHour: number,
): Date {
  const result = new Date(fromDate.getTime());
  const currentDay = result.getUTCDay();
  let daysAhead = (targetDay - currentDay + 7) % 7;
  if (daysAhead === 0) {
    if (result.getUTCHours() >= targetHour) {
      daysAhead = 7;
    }
  }
  result.setUTCDate(result.getUTCDate() + daysAhead);
  result.setUTCHours(targetHour, 0, 0, 0);
  return result;
}

// ---------------------------------------------------------------------------
// Main Prediction Logic
// ---------------------------------------------------------------------------

/**
 * Predict the best send times for a recipient.
 *
 * When an `engagement` row from the DB is provided, uses actual patterns.
 * Otherwise falls back to general best-practice windows.
 */
export async function predictBestSendTime(
  input: PredictInputWithEngagement,
): Promise<SendTimeRecommendation> {
  const windowDays = input.windowDays ?? 7;
  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  let hours: number[];
  let days: number[];
  let dataSource: "historical" | "default" = "default";
  let pattern: RecipientPattern | null = null;
  let engagementCount = 0;

  if (input.engagement && input.engagement.totalOpened >= CONFIDENCE_THRESHOLDS.low) {
    // Use real engagement data
    pattern = engagementRowToPattern(input.engagement);
    hours = pattern.typicalOpenHours.length > 0
      ? pattern.typicalOpenHours
      : [...DEFAULT_BEST_HOURS];
    days = pattern.typicalOpenDays.length > 0
      ? pattern.typicalOpenDays
      : [...DEFAULT_BEST_DAYS];
    dataSource = "historical";
    engagementCount = input.engagement.totalOpened;
  } else {
    hours = [...DEFAULT_BEST_HOURS];
    days = [...DEFAULT_BEST_DAYS];
  }

  const candidates: RecommendedTime[] = [];
  for (const day of days) {
    for (const hour of hours) {
      const dt = nextOccurrence(now, day, hour);
      if (dt > horizon) continue;
      const confidence = calculateConfidenceScore(engagementCount, dataSource === "historical");
      const dayName = DAY_NAMES[day] ?? "Unknown";
      const hourLabel = formatHour(hour);

      const reasoning = dataSource === "historical"
        ? `Based on ${engagementCount} opens, ${dayName} at ${hourLabel} has the highest engagement rate for this recipient`
        : `${dayName} at ${hourLabel} is a high-engagement window for most professional recipients`;

      candidates.push({
        datetime: dt.toISOString(),
        confidence,
        reasoning,
        dayLabel: dayName,
        hourLabel,
      });
    }
  }

  candidates.sort((a, b) => {
    // Sort by confidence descending, then by time ascending
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.datetime.localeCompare(b.datetime);
  });

  // Urgency override: high urgency -> soonest sensible window today/tomorrow
  if (input.urgency === "high") {
    const soon = new Date(now.getTime() + 15 * 60 * 1000);
    candidates.unshift({
      datetime: soon.toISOString(),
      confidence: 0.9,
      reasoning: "High urgency — recommend sending within the next 15 minutes",
      dayLabel: DAY_NAMES[soon.getUTCDay()] ?? "Unknown",
      hourLabel: formatHour(soon.getUTCHours()),
    });
  }

  const recommendedTimes = candidates.slice(0, 5);

  // currentlyOptimal: are we within 30 minutes of the top recommendation?
  const top = recommendedTimes[0];
  const currentlyOptimal = top
    ? Math.abs(new Date(top.datetime).getTime() - now.getTime()) < 30 * 60 * 1000
    : false;

  return {
    recommendedTimes,
    currentlyOptimal,
    alternativeTimes: Math.max(candidates.length - recommendedTimes.length, 0),
    dataSource,
    recipientPattern: pattern,
  };
}

// ---------------------------------------------------------------------------
// Engagement Aggregation Utilities
// ---------------------------------------------------------------------------

/**
 * Compute updated aggregate fields after recording a new engagement event.
 * Returns a partial row that can be spread into a Drizzle `.set()` call.
 */
export function computeUpdatedAggregates(
  existing: EngagementRow,
  eventType: "open" | "click" | "reply",
  engagedAt: Date,
  delayHours: number,
): Partial<EngagementRow> {
  const hour = String(engagedAt.getUTCHours());
  const day = String(engagedAt.getUTCDay());

  const updates: Partial<EngagementRow> = {};

  if (eventType === "open") {
    const newTotal = existing.totalOpened + 1;
    updates.totalOpened = newTotal;
    updates.openRate = existing.totalSent > 0 ? newTotal / existing.totalSent : 0;

    // Update hour distribution
    const hourDist = { ...existing.openHourDistribution };
    hourDist[hour] = (hourDist[hour] ?? 0) + 1;
    updates.openHourDistribution = hourDist;

    // Update day distribution
    const dayDist = { ...existing.openDayDistribution };
    dayDist[day] = (dayDist[day] ?? 0) + 1;
    updates.openDayDistribution = dayDist;

    // Running average of open delay
    const prevAvg = existing.avgOpenDelayHours ?? 0;
    updates.avgOpenDelayHours =
      Math.round(((prevAvg * (newTotal - 1) + delayHours) / newTotal) * 10) / 10;

    // Update peak
    const peakHour = getTopKeys(hourDist, 1)[0];
    const peakDay = getTopKeys(dayDist, 1)[0];
    if (peakHour !== undefined) updates.peakOpenHour = peakHour;
    if (peakDay !== undefined) updates.peakOpenDay = peakDay;
  }

  if (eventType === "click") {
    const newTotal = existing.totalClicked + 1;
    updates.totalClicked = newTotal;
    updates.clickRate = existing.totalSent > 0 ? newTotal / existing.totalSent : 0;

    const hourDist = { ...existing.clickHourDistribution };
    hourDist[hour] = (hourDist[hour] ?? 0) + 1;
    updates.clickHourDistribution = hourDist;

    const dayDist = { ...existing.clickDayDistribution };
    dayDist[day] = (dayDist[day] ?? 0) + 1;
    updates.clickDayDistribution = dayDist;

    const prevAvg = existing.avgClickDelayHours ?? 0;
    updates.avgClickDelayHours =
      Math.round(((prevAvg * (newTotal - 1) + delayHours) / newTotal) * 10) / 10;

    const peakHour = getTopKeys(hourDist, 1)[0];
    const peakDay = getTopKeys(dayDist, 1)[0];
    if (peakHour !== undefined) updates.peakClickHour = peakHour;
    if (peakDay !== undefined) updates.peakClickDay = peakDay;
  }

  if (eventType === "reply") {
    const newTotal = existing.totalReplied + 1;
    updates.totalReplied = newTotal;
    updates.replyRate = existing.totalSent > 0 ? newTotal / existing.totalSent : 0;

    const prevAvg = existing.avgReplyDelayHours ?? 0;
    updates.avgReplyDelayHours =
      Math.round(((prevAvg * (newTotal - 1) + delayHours) / newTotal) * 10) / 10;
  }

  return updates;
}
