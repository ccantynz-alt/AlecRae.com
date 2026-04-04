/**
 * Billing resource — usage stats and plan information.
 */
import type { ApiClient } from "../client/api-client.js";
import type {
  ApiResponse,
  BillingUsage,
  BillingPlan,
} from "../types.js";

/** The API path prefix for billing endpoints. */
const BASE_PATH = "/v1/billing";

/**
 * Resource class for interacting with the Billing API.
 *
 * Usage:
 * ```ts
 * const emailed = new Emailed({ apiKey: "em_live_..." });
 * const usage = await emailed.billing.getUsage();
 * const plan = await emailed.billing.getPlan();
 * ```
 */
export class Billing {
  constructor(private readonly client: ApiClient) {}

  /**
   * Get the current billing usage for the account.
   *
   * Returns the number of emails sent in the current billing period
   * along with percentage of plan limit consumed.
   *
   * @returns Current usage statistics
   */
  async getUsage(): Promise<ApiResponse<BillingUsage>> {
    return this.client.get<BillingUsage>(`${BASE_PATH}/usage`);
  }

  /**
   * Get the current plan details including limits and usage.
   *
   * @returns Plan details with limits and current usage
   */
  async getPlan(): Promise<ApiResponse<BillingPlan>> {
    return this.client.get<BillingPlan>(`${BASE_PATH}/plan`);
  }
}
