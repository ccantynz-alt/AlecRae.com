/**
 * Analytics resource — delivery stats, bounce analysis, and engagement metrics.
 *
 * Provides typed methods for querying email analytics with date range filtering
 * and flexible aggregation options powered by the ClickHouse analytics engine.
 */

import { type Result } from "@emailed/shared";
import type { BounceCategory, BounceType } from "@emailed/shared";
import type { HttpClient, ApiResponse, ApiError } from "../client/http.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Time granularity for aggregated metrics. */
export type TimeGranularity = "hour" | "day" | "week" | "month";

/** Common date range filter applied to all analytics queries. */
export interface DateRangeFilter {
  /** Start date (ISO 8601, inclusive). */
  readonly startDate: string;
  /** End date (ISO 8601, inclusive). */
  readonly endDate: string;
  /** Time zone for date boundaries (default "UTC"). */
  readonly timezone?: string;
}

/** Filter options shared across analytics queries. */
export interface AnalyticsFilter extends DateRangeFilter {
  /** Filter by domain ID. */
  readonly domainId?: string;
  /** Filter by tag. */
  readonly tag?: string;
  /** Filter by IP address used for sending. */
  readonly sendingIp?: string;
}

/** Aggregation options for time-series data. */
export interface AggregationOptions {
  /** Time granularity for bucketing (default "day"). */
  readonly granularity?: TimeGranularity;
  /** Group results by this dimension in addition to time. */
  readonly groupBy?: "domain" | "tag" | "ip" | "recipient_domain";
}

/** Delivery statistics summary. */
export interface DeliveryStats {
  readonly period: DateRangeFilter;
  readonly totals: DeliveryTotals;
  readonly rates: DeliveryRates;
  readonly timeSeries: readonly DeliveryTimePoint[];
}

/** Aggregate delivery counts. */
export interface DeliveryTotals {
  readonly sent: number;
  readonly delivered: number;
  readonly bounced: number;
  readonly deferred: number;
  readonly dropped: number;
  readonly failed: number;
  readonly complained: number;
}

/** Delivery rates as percentages (0-100). */
export interface DeliveryRates {
  readonly deliveryRate: number;
  readonly bounceRate: number;
  readonly complaintRate: number;
  readonly deferralRate: number;
  readonly dropRate: number;
}

/** A single time-series data point for delivery metrics. */
export interface DeliveryTimePoint {
  readonly timestamp: string;
  readonly sent: number;
  readonly delivered: number;
  readonly bounced: number;
  readonly deferred: number;
  readonly dropped: number;
  readonly failed: number;
  readonly complained: number;
  /** Optional group key when groupBy is used. */
  readonly group?: string;
}

/** Bounce analysis report. */
export interface BounceAnalysis {
  readonly period: DateRangeFilter;
  readonly totalBounces: number;
  readonly hardBounces: number;
  readonly softBounces: number;
  readonly bounceRate: number;
  readonly byCategory: readonly BounceCategoryBreakdown[];
  readonly byRecipientDomain: readonly BounceByDomain[];
  readonly timeSeries: readonly BounceTimePoint[];
  readonly topBouncingAddresses: readonly BouncingAddress[];
}

/** Breakdown of bounces by category. */
export interface BounceCategoryBreakdown {
  readonly category: BounceCategory;
  readonly count: number;
  readonly percentage: number;
  readonly bounceType: BounceType;
}

/** Bounce counts grouped by recipient domain. */
export interface BounceByDomain {
  readonly domain: string;
  readonly totalBounces: number;
  readonly hardBounces: number;
  readonly softBounces: number;
  readonly bounceRate: number;
}

/** Time-series bounce data point. */
export interface BounceTimePoint {
  readonly timestamp: string;
  readonly hardBounces: number;
  readonly softBounces: number;
  readonly group?: string;
}

/** A frequently bouncing address. */
export interface BouncingAddress {
  readonly address: string;
  readonly bounceCount: number;
  readonly lastBounceType: BounceType;
  readonly lastBounceCategory: BounceCategory;
  readonly lastBouncedAt: string;
}

/** Engagement metrics (opens and clicks). */
export interface EngagementMetrics {
  readonly period: DateRangeFilter;
  readonly totals: EngagementTotals;
  readonly rates: EngagementRates;
  readonly timeSeries: readonly EngagementTimePoint[];
  readonly topLinks: readonly LinkEngagement[];
  readonly deviceBreakdown: readonly DeviceBreakdown[];
}

/** Aggregate engagement counts. */
export interface EngagementTotals {
  readonly delivered: number;
  readonly uniqueOpens: number;
  readonly totalOpens: number;
  readonly uniqueClicks: number;
  readonly totalClicks: number;
  readonly unsubscribes: number;
}

/** Engagement rates as percentages. */
export interface EngagementRates {
  readonly openRate: number;
  readonly clickRate: number;
  readonly clickToOpenRate: number;
  readonly unsubscribeRate: number;
}

/** Time-series engagement data point. */
export interface EngagementTimePoint {
  readonly timestamp: string;
  readonly uniqueOpens: number;
  readonly totalOpens: number;
  readonly uniqueClicks: number;
  readonly totalClicks: number;
  readonly group?: string;
}

/** Engagement data for a specific link. */
export interface LinkEngagement {
  readonly url: string;
  readonly uniqueClicks: number;
  readonly totalClicks: number;
  readonly clickRate: number;
}

/** Device/client breakdown for engagement. */
export interface DeviceBreakdown {
  readonly deviceType: "desktop" | "mobile" | "tablet" | "other";
  readonly count: number;
  readonly percentage: number;
}

// ---------------------------------------------------------------------------
// Analytics Resource
// ---------------------------------------------------------------------------

export class AnalyticsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Get delivery statistics for a date range.
   *
   * Returns aggregate counts, rates, and time-series data for all
   * delivery-related events (sent, delivered, bounced, deferred, etc.).
   *
   * @param filter - Date range and optional dimension filters
   * @param aggregation - Time granularity and grouping options
   * @returns Delivery statistics with totals, rates, and time series
   */
  async getDeliveryStats(
    filter: AnalyticsFilter,
    aggregation?: AggregationOptions,
  ): Promise<Result<ApiResponse<DeliveryStats>, ApiError | Error>> {
    const params = this.buildQueryParams(filter, aggregation);
    return this.client.get<DeliveryStats>("/analytics/delivery", params);
  }

  /**
   * Get detailed bounce analysis for a date range.
   *
   * Breaks down bounces by type (hard/soft), category, recipient domain,
   * and identifies frequently bouncing addresses that should be suppressed.
   *
   * @param filter - Date range and optional dimension filters
   * @param aggregation - Time granularity and grouping options
   * @returns Bounce analysis with category breakdowns and trends
   */
  async getBounceAnalysis(
    filter: AnalyticsFilter,
    aggregation?: AggregationOptions,
  ): Promise<Result<ApiResponse<BounceAnalysis>, ApiError | Error>> {
    const params = this.buildQueryParams(filter, aggregation);
    return this.client.get<BounceAnalysis>("/analytics/bounces", params);
  }

  /**
   * Get engagement metrics (opens, clicks, unsubscribes) for a date range.
   *
   * Includes unique and total counts, click-to-open rates, top performing
   * links, and device/client breakdown.
   *
   * @param filter - Date range and optional dimension filters
   * @param aggregation - Time granularity and grouping options
   * @returns Engagement metrics with link and device breakdowns
   */
  async getEngagementMetrics(
    filter: AnalyticsFilter,
    aggregation?: AggregationOptions,
  ): Promise<Result<ApiResponse<EngagementMetrics>, ApiError | Error>> {
    const params = this.buildQueryParams(filter, aggregation);
    return this.client.get<EngagementMetrics>("/analytics/engagement", params);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildQueryParams(
    filter: AnalyticsFilter,
    aggregation?: AggregationOptions,
  ): Record<string, string | number | boolean | undefined> {
    const params: Record<string, string | number | boolean | undefined> = {
      start_date: filter.startDate,
      end_date: filter.endDate,
    };

    if (filter.timezone !== undefined) params["timezone"] = filter.timezone;
    if (filter.domainId !== undefined) params["domain_id"] = filter.domainId;
    if (filter.tag !== undefined) params["tag"] = filter.tag;
    if (filter.sendingIp !== undefined) params["sending_ip"] = filter.sendingIp;

    if (aggregation) {
      if (aggregation.granularity !== undefined) params["granularity"] = aggregation.granularity;
      if (aggregation.groupBy !== undefined) params["group_by"] = aggregation.groupBy;
    }

    return params;
  }
}
