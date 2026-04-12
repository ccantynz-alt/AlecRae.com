/**
 * Analytics resource — delivery metrics, engagement tracking, and reporting.
 */
import type { ApiClient } from "../client/api-client.js";
import type {
  ApiResponse,
  AnalyticsQueryParams,
  DeliveryAnalytics,
  EngagementAnalytics,
  TimeSeriesPoint,
} from "../types.js";

/** The API path prefix for analytics endpoints. */
const BASE_PATH = "/v1/analytics";

/** Convert analytics query params to a flat query record. */
function toQuery(
  params: AnalyticsQueryParams,
): Record<string, string | number | boolean | undefined> {
  return {
    start_date: params.startDate,
    end_date: params.endDate,
    granularity: params.granularity,
    domain_id: params.domainId,
    tag: params.tag,
  };
}

/**
 * Resource class for interacting with the Analytics API.
 *
 * Usage:
 * ```ts
 * const alecrae = new AlecRae({ auth: { type: "apiKey", key: "em_live_..." } });
 * const stats = await alecrae.analytics.delivery({
 *   startDate: "2026-03-01",
 *   endDate: "2026-03-31",
 * });
 * ```
 */
export class Analytics {
  constructor(private readonly client: ApiClient) {}

  /**
   * Get aggregate delivery metrics for the given time range.
   *
   * @param params  Time range, optional domain/tag filters
   * @returns Delivery analytics summary
   */
  async delivery(
    params: AnalyticsQueryParams,
  ): Promise<ApiResponse<DeliveryAnalytics>> {
    return this.client.get<DeliveryAnalytics>(
      `${BASE_PATH}/delivery`,
      toQuery(params),
    );
  }

  /**
   * Get engagement metrics (opens, clicks) for the given time range.
   *
   * @param params  Time range, optional domain/tag filters
   * @returns Engagement analytics summary
   */
  async engagement(
    params: AnalyticsQueryParams,
  ): Promise<ApiResponse<EngagementAnalytics>> {
    return this.client.get<EngagementAnalytics>(
      `${BASE_PATH}/engagement`,
      toQuery(params),
    );
  }

  /**
   * Get a delivery time-series broken down by the requested granularity.
   *
   * @param params  Time range, granularity, optional filters
   * @returns Array of time-series data points
   */
  async deliveryTimeSeries(
    params: AnalyticsQueryParams,
  ): Promise<ApiResponse<readonly TimeSeriesPoint[]>> {
    return this.client.get<readonly TimeSeriesPoint[]>(
      `${BASE_PATH}/delivery/timeseries`,
      toQuery(params),
    );
  }

  /**
   * Get an engagement time-series (opens + clicks) broken down by granularity.
   *
   * @param params  Time range, granularity, optional filters
   * @returns Array of time-series data points
   */
  async engagementTimeSeries(
    params: AnalyticsQueryParams,
  ): Promise<ApiResponse<readonly TimeSeriesPoint[]>> {
    return this.client.get<readonly TimeSeriesPoint[]>(
      `${BASE_PATH}/engagement/timeseries`,
      toQuery(params),
    );
  }

  /**
   * Get bounce breakdown by category for the given time range.
   *
   * @param params  Time range, optional filters
   * @returns Record mapping bounce categories to counts
   */
  async bounceBreakdown(
    params: AnalyticsQueryParams,
  ): Promise<ApiResponse<Readonly<Record<string, number>>>> {
    return this.client.get<Readonly<Record<string, number>>>(
      `${BASE_PATH}/bounces/breakdown`,
      toQuery(params),
    );
  }
}
