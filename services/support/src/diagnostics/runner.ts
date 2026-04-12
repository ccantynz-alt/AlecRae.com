/**
 * @emailed/support - Automated Diagnostics Runner
 *
 * When a user reports an issue, automatically runs:
 * DNS checks, deliverability tests, authentication verification,
 * reputation check, recent error log analysis.
 */

import type {
  DiagnosticCheck,
  DiagnosticCheckType,
  DiagnosticReport,
  DiagnosticRunnerConfig,
  DiagnosticStatus,
  ReputationSummary,
  DeliveryStatsSummary,
  ErrorLogEntry,
  AccountSettings,
  Result,
} from "../types";
import { ok, err } from "../types";

// ─── Platform Service Interfaces ────────────────────────────────────────────

export interface DiagnosticServices {
  dns: {
    checkSpf(domain: string): Promise<{ valid: boolean; record?: string; issues: string[] }>;
    checkDkim(domain: string, selector?: string): Promise<{ valid: boolean; issues: string[] }>;
    checkDmarc(domain: string): Promise<{ valid: boolean; policy?: string; issues: string[] }>;
    checkMx(domain: string): Promise<{ records: string[]; issues: string[] }>;
    checkReverseDns(ip: string): Promise<{ valid: boolean; hostname?: string }>;
  };
  delivery: {
    getRecentErrors(accountId: string, limit: number): Promise<ErrorLogEntry[]>;
    getStats(accountId: string, period: string): Promise<DeliveryStatsSummary>;
    testDeliverability(domain: string): Promise<{ score: number; issues: string[] }>;
  };
  reputation: {
    getScore(domain: string): Promise<ReputationSummary>;
    checkBlacklists(domain: string): Promise<{ listed: boolean; lists: string[] }>;
  };
  account: {
    getSettings(accountId: string): Promise<AccountSettings>;
    getSendingUsage(accountId: string): Promise<{ used: number; limit: number; percentage: number }>;
  };
}

// ─── Individual Diagnostic Checks ───────────────────────────────────────────

async function runDnsCheck(
  domain: string,
  services: DiagnosticServices,
): Promise<DiagnosticCheck> {
  const startTime = Date.now();
  const issues: string[] = [];
  let status: DiagnosticStatus = "pass";

  try {
    const [spf, dkim, dmarc, mx] = await Promise.all([
      services.dns.checkSpf(domain),
      services.dns.checkDkim(domain),
      services.dns.checkDmarc(domain),
      services.dns.checkMx(domain),
    ]);

    const details: Record<string, unknown> = {
      spf: { valid: spf.valid, record: spf.record },
      dkim: { valid: dkim.valid },
      dmarc: { valid: dmarc.valid, policy: dmarc.policy },
      mx: { records: mx.records },
    };

    // Aggregate issues
    issues.push(...spf.issues, ...dkim.issues, ...dmarc.issues, ...mx.issues);

    // Determine overall DNS status
    if (!spf.valid || !dkim.valid) {
      status = "fail";
    } else if (!dmarc.valid || mx.records.length === 0) {
      status = "warn";
    }

    const message = status === "pass"
      ? "All DNS records are properly configured."
      : status === "warn"
        ? `DNS mostly configured, but ${issues.length} issue(s) found.`
        : `DNS configuration has critical issues: ${issues.slice(0, 3).join("; ")}`;

    return {
      type: "dns",
      name: "DNS Configuration",
      status,
      message,
      details: { ...details, issues },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      type: "dns",
      name: "DNS Configuration",
      status: "error",
      message: `DNS check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

async function runDeliverabilityCheck(
  domain: string,
  accountId: string,
  services: DiagnosticServices,
): Promise<DiagnosticCheck> {
  const startTime = Date.now();

  try {
    const [deliverability, stats] = await Promise.all([
      services.delivery.testDeliverability(domain),
      services.delivery.getStats(accountId, "24h"),
    ]);

    const details: Record<string, unknown> = {
      deliverabilityScore: deliverability.score,
      deliveryRate: stats.deliveryRate,
      totalSent: stats.totalSent,
      delivered: stats.delivered,
      bounced: stats.bounced,
      deferred: stats.deferred,
      avgDeliveryTimeMs: stats.avgDeliveryTimeMs,
      issues: deliverability.issues,
    };

    let status: DiagnosticStatus;
    let message: string;

    if (deliverability.score >= 90 && stats.deliveryRate >= 0.95) {
      status = "pass";
      message = `Deliverability is excellent. Score: ${deliverability.score}/100, delivery rate: ${(stats.deliveryRate * 100).toFixed(1)}%.`;
    } else if (deliverability.score >= 70 && stats.deliveryRate >= 0.85) {
      status = "warn";
      message = `Deliverability needs attention. Score: ${deliverability.score}/100, delivery rate: ${(stats.deliveryRate * 100).toFixed(1)}%.`;
    } else {
      status = "fail";
      message = `Deliverability is poor. Score: ${deliverability.score}/100, delivery rate: ${(stats.deliveryRate * 100).toFixed(1)}%.`;
    }

    return {
      type: "deliverability",
      name: "Deliverability",
      status,
      message,
      details,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      type: "deliverability",
      name: "Deliverability",
      status: "error",
      message: `Deliverability check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

async function runAuthenticationCheck(
  domain: string,
  services: DiagnosticServices,
): Promise<DiagnosticCheck> {
  const startTime = Date.now();

  try {
    const [spf, dkim, dmarc] = await Promise.all([
      services.dns.checkSpf(domain),
      services.dns.checkDkim(domain),
      services.dns.checkDmarc(domain),
    ]);

    const allValid = spf.valid && dkim.valid && dmarc.valid;
    const allIssues = [...spf.issues, ...dkim.issues, ...dmarc.issues];

    let status: DiagnosticStatus;
    let message: string;

    if (allValid && allIssues.length === 0) {
      status = "pass";
      message = "Email authentication is fully configured. SPF, DKIM, and DMARC all pass.";
    } else if (spf.valid && dkim.valid) {
      status = "warn";
      message = `SPF and DKIM pass, but ${allIssues.length} issue(s): ${allIssues.slice(0, 2).join("; ")}`;
    } else {
      status = "fail";
      const failing: string[] = [];
      if (!spf.valid) failing.push("SPF");
      if (!dkim.valid) failing.push("DKIM");
      if (!dmarc.valid) failing.push("DMARC");
      message = `Authentication failing for: ${failing.join(", ")}. ${allIssues[0] ?? ""}`;
    }

    return {
      type: "authentication",
      name: "Email Authentication",
      status,
      message,
      details: {
        spf: { valid: spf.valid, record: spf.record, issues: spf.issues },
        dkim: { valid: dkim.valid, issues: dkim.issues },
        dmarc: { valid: dmarc.valid, policy: dmarc.policy, issues: dmarc.issues },
      },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      type: "authentication",
      name: "Email Authentication",
      status: "error",
      message: `Authentication check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

async function runReputationCheck(
  domain: string,
  services: DiagnosticServices,
): Promise<DiagnosticCheck> {
  const startTime = Date.now();

  try {
    const [reputation, blacklists] = await Promise.all([
      services.reputation.getScore(domain),
      services.reputation.checkBlacklists(domain),
    ]);

    const details: Record<string, unknown> = {
      overallScore: reputation.overallScore,
      spamRate: reputation.spamRate,
      bounceRate: reputation.bounceRate,
      complaintRate: reputation.complaintRate,
      trend: reputation.trend,
      blacklisted: blacklists.listed,
      blacklists: blacklists.lists,
    };

    let status: DiagnosticStatus;
    let message: string;

    if (blacklists.listed) {
      status = "fail";
      message = `Domain is listed on ${blacklists.lists.length} blacklist(s): ${blacklists.lists.slice(0, 3).join(", ")}. Reputation score: ${reputation.overallScore}/100.`;
    } else if (reputation.overallScore >= 80 && reputation.complaintRate < 0.001) {
      status = "pass";
      message = `Reputation is healthy. Score: ${reputation.overallScore}/100, trend: ${reputation.trend}.`;
    } else if (reputation.overallScore >= 50) {
      status = "warn";
      const issues: string[] = [];
      if (reputation.spamRate > 0.02) issues.push(`high spam rate (${(reputation.spamRate * 100).toFixed(2)}%)`);
      if (reputation.bounceRate > 0.02) issues.push(`high bounce rate (${(reputation.bounceRate * 100).toFixed(2)}%)`);
      if (reputation.complaintRate > 0.001) issues.push(`high complaint rate (${(reputation.complaintRate * 100).toFixed(3)}%)`);
      message = `Reputation needs improvement. Score: ${reputation.overallScore}/100. Issues: ${issues.join(", ")}.`;
    } else {
      status = "fail";
      message = `Reputation is critically low. Score: ${reputation.overallScore}/100, trend: ${reputation.trend}.`;
    }

    return {
      type: "reputation",
      name: "Sender Reputation",
      status,
      message,
      details,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      type: "reputation",
      name: "Sender Reputation",
      status: "error",
      message: `Reputation check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

async function runErrorLogAnalysis(
  accountId: string,
  services: DiagnosticServices,
): Promise<DiagnosticCheck> {
  const startTime = Date.now();

  try {
    const errors = await services.delivery.getRecentErrors(accountId, 100);

    if (errors.length === 0) {
      return {
        type: "error_logs",
        name: "Error Log Analysis",
        status: "pass",
        message: "No errors in the last 24 hours.",
        details: { errorCount: 0 },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
    }

    // Analyze error patterns
    const errorsByType = new Map<string, number>();
    const errorsByService = new Map<string, number>();
    const errorsByCode = new Map<string, number>();
    const recentErrors: string[] = [];

    for (const entry of errors) {
      errorsByService.set(entry.service, (errorsByService.get(entry.service) ?? 0) + 1);

      if (entry.errorCode) {
        errorsByCode.set(entry.errorCode, (errorsByCode.get(entry.errorCode) ?? 0) + 1);
      }

      const type = categorizeError(entry.message);
      errorsByType.set(type, (errorsByType.get(type) ?? 0) + 1);

      if (recentErrors.length < 5) {
        recentErrors.push(`[${entry.level}] ${entry.message}`);
      }
    }

    // Identify the most common error pattern
    let topErrorType = "";
    let topErrorCount = 0;
    for (const [type, count] of errorsByType) {
      if (count > topErrorCount) {
        topErrorType = type;
        topErrorCount = count;
      }
    }

    const details: Record<string, unknown> = {
      totalErrors: errors.length,
      errorsByType: Object.fromEntries(errorsByType),
      errorsByService: Object.fromEntries(errorsByService),
      errorsByCode: Object.fromEntries(errorsByCode),
      recentErrors,
      topErrorType,
      topErrorCount,
    };

    let status: DiagnosticStatus;
    let message: string;

    if (errors.length <= 5) {
      status = "pass";
      message = `${errors.length} minor error(s) in the last 24 hours. No patterns of concern.`;
    } else if (errors.length <= 50) {
      status = "warn";
      message = `${errors.length} errors found. Most common pattern: ${topErrorType} (${topErrorCount} occurrences).`;
    } else {
      status = "fail";
      message = `${errors.length} errors in the last 24 hours. Primary issue: ${topErrorType} (${topErrorCount} occurrences).`;
    }

    return {
      type: "error_logs",
      name: "Error Log Analysis",
      status,
      message,
      details,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      type: "error_logs",
      name: "Error Log Analysis",
      status: "error",
      message: `Error log analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

async function runSendingLimitsCheck(
  accountId: string,
  services: DiagnosticServices,
): Promise<DiagnosticCheck> {
  const startTime = Date.now();

  try {
    const [settings, usage] = await Promise.all([
      services.account.getSettings(accountId),
      services.account.getSendingUsage(accountId),
    ]);

    const details: Record<string, unknown> = {
      plan: settings.plan,
      limits: settings.sendingLimits,
      usage: usage,
    };

    let status: DiagnosticStatus;
    let message: string;

    if (usage.percentage >= 100) {
      status = "fail";
      message = `Sending limit exceeded. Used ${usage.used.toLocaleString()} of ${usage.limit.toLocaleString()} (${usage.percentage}%). Emails are being throttled.`;
    } else if (usage.percentage >= 80) {
      status = "warn";
      message = `Approaching sending limit. Used ${usage.used.toLocaleString()} of ${usage.limit.toLocaleString()} (${usage.percentage}%). Consider upgrading plan.`;
    } else {
      status = "pass";
      message = `Sending within limits. Used ${usage.used.toLocaleString()} of ${usage.limit.toLocaleString()} (${usage.percentage}%).`;
    }

    return {
      type: "sending_limits",
      name: "Sending Limits",
      status,
      message,
      details,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      type: "sending_limits",
      name: "Sending Limits",
      status: "error",
      message: `Sending limits check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

async function runBlacklistCheck(
  domain: string,
  services: DiagnosticServices,
): Promise<DiagnosticCheck> {
  const startTime = Date.now();

  try {
    const result = await services.reputation.checkBlacklists(domain);

    let status: DiagnosticStatus;
    let message: string;

    if (!result.listed) {
      status = "pass";
      message = "Domain is not listed on any monitored blacklists.";
    } else {
      status = "fail";
      message = `Domain is listed on ${result.lists.length} blacklist(s): ${result.lists.join(", ")}.`;
    }

    return {
      type: "blacklist",
      name: "Blacklist Check",
      status,
      message,
      details: {
        listed: result.listed,
        blacklists: result.lists,
      },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      type: "blacklist",
      name: "Blacklist Check",
      status: "error",
      message: `Blacklist check failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

// ─── Error Categorization ───────────────────────────────────────────────────

function categorizeError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("bounce") || lower.includes("undeliverable") || lower.includes("user unknown")) {
    return "bounce";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "timeout";
  }
  if (lower.includes("connection refused") || lower.includes("connection reset")) {
    return "connection_failure";
  }
  if (lower.includes("rate limit") || lower.includes("too many") || lower.includes("throttl")) {
    return "rate_limiting";
  }
  if (lower.includes("spf") || lower.includes("dkim") || lower.includes("auth")) {
    return "authentication";
  }
  if (lower.includes("dns") || lower.includes("mx") || lower.includes("nxdomain")) {
    return "dns";
  }
  if (lower.includes("spam") || lower.includes("blocked") || lower.includes("rejected")) {
    return "spam_rejection";
  }
  if (lower.includes("tls") || lower.includes("ssl") || lower.includes("certificate")) {
    return "tls";
  }

  return "unknown";
}

// ─── Diagnostics Runner ─────────────────────────────────────────────────────

export class DiagnosticsRunner {
  private readonly services: DiagnosticServices;
  private readonly config: DiagnosticRunnerConfig;

  constructor(services: DiagnosticServices, config?: Partial<DiagnosticRunnerConfig>) {
    this.services = services;
    this.config = {
      timeoutMs: 30_000,
      parallelChecks: true,
      checksToRun: [
        "dns",
        "deliverability",
        "authentication",
        "reputation",
        "error_logs",
        "sending_limits",
        "blacklist",
      ],
      ...config,
    };
  }

  /**
   * Run a full diagnostic suite for an account and domain.
   * Returns a comprehensive report with status, findings, and recommendations.
   */
  async runFull(
    accountId: string,
    domain: string,
  ): Promise<Result<DiagnosticReport>> {
    const startTime = Date.now();

    try {
      const checkMap: Record<DiagnosticCheckType, () => Promise<DiagnosticCheck>> = {
        dns: () => runDnsCheck(domain, this.services),
        deliverability: () => runDeliverabilityCheck(domain, accountId, this.services),
        authentication: () => runAuthenticationCheck(domain, this.services),
        reputation: () => runReputationCheck(domain, this.services),
        error_logs: () => runErrorLogAnalysis(accountId, this.services),
        sending_limits: () => runSendingLimitsCheck(accountId, this.services),
        blacklist: () => runBlacklistCheck(domain, this.services),
      };

      const checksToRun = this.config.checksToRun
        .map((type) => checkMap[type])
        .filter((fn): fn is () => Promise<DiagnosticCheck> => fn !== undefined);

      let checks: DiagnosticCheck[];

      if (this.config.parallelChecks) {
        // Run all checks concurrently with a timeout
        const results = await Promise.allSettled(
          checksToRun.map((fn) => withTimeout(fn(), this.config.timeoutMs)),
        );

        checks = results.map((result, i) => {
          if (result.status === "fulfilled") {
            return result.value;
          }
          const checkType = this.config.checksToRun[i] ?? "unknown" as DiagnosticCheckType;
          return {
            type: checkType,
            name: checkType,
            status: "error" as DiagnosticStatus,
            message: `Check failed: ${result.reason}`,
            details: { error: String(result.reason) },
            duration: Date.now() - startTime,
            timestamp: new Date(),
          };
        });
      } else {
        // Run checks sequentially
        checks = [];
        for (const fn of checksToRun) {
          try {
            const check = await withTimeout(fn(), this.config.timeoutMs);
            checks.push(check);
          } catch (error) {
            checks.push({
              type: "dns", // Will be overridden
              name: "Unknown Check",
              status: "error",
              message: `Check failed: ${error}`,
              details: { error: String(error) },
              duration: Date.now() - startTime,
              timestamp: new Date(),
            });
          }
        }
      }

      // Determine overall status (worst status wins)
      const overallStatus = determineOverallStatus(checks);
      const summary = buildSummary(checks);
      const recommendations = generateRecommendations(checks);

      const report: DiagnosticReport = {
        id: `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        accountId,
        domain,
        checks,
        overallStatus,
        summary,
        recommendations,
        createdAt: new Date(),
        durationMs: Date.now() - startTime,
      };

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Run a subset of checks for a quick diagnosis.
   */
  async runQuick(
    accountId: string,
    domain: string,
  ): Promise<Result<DiagnosticReport>> {
    const quickRunner = new DiagnosticsRunner(this.services, {
      ...this.config,
      checksToRun: ["dns", "authentication", "error_logs"],
      timeoutMs: 10_000,
    });
    return quickRunner.runFull(accountId, domain);
  }

  /**
   * Run a single specific check.
   */
  async runSingle(
    checkType: DiagnosticCheckType,
    accountId: string,
    domain: string,
  ): Promise<Result<DiagnosticCheck>> {
    const runner = new DiagnosticsRunner(this.services, {
      ...this.config,
      checksToRun: [checkType],
    });
    const result = await runner.runFull(accountId, domain);
    if (!result.ok) return err(result.error);

    const check = result.value.checks[0];
    if (!check) return err(new Error(`Check type ${checkType} did not produce a result`));

    return ok(check);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Diagnostic check timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

const STATUS_SEVERITY: Record<DiagnosticStatus, number> = {
  pass: 0,
  skipped: 1,
  warn: 2,
  fail: 3,
  error: 4,
};

function determineOverallStatus(checks: DiagnosticCheck[]): DiagnosticStatus {
  let worst: DiagnosticStatus = "pass";
  for (const check of checks) {
    if (STATUS_SEVERITY[check.status] > STATUS_SEVERITY[worst]) {
      worst = check.status;
    }
  }
  return worst;
}

function buildSummary(checks: DiagnosticCheck[]): string {
  const passed = checks.filter((c) => c.status === "pass").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const errored = checks.filter((c) => c.status === "error").length;

  const parts: string[] = [];
  parts.push(`${checks.length} checks completed.`);

  if (passed > 0) parts.push(`${passed} passed`);
  if (warned > 0) parts.push(`${warned} warning(s)`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (errored > 0) parts.push(`${errored} error(s)`);

  if (failed === 0 && errored === 0 && warned === 0) {
    parts.push("All systems healthy.");
  }

  const failedChecks = checks.filter((c) => c.status === "fail");
  if (failedChecks.length > 0) {
    parts.push(
      `Critical issues in: ${failedChecks.map((c) => c.name).join(", ")}.`,
    );
  }

  return parts.join(" ");
}

function generateRecommendations(checks: DiagnosticCheck[]): string[] {
  const recommendations: string[] = [];

  for (const check of checks) {
    if (check.status === "pass") continue;

    switch (check.type) {
      case "dns": {
        const issues = (check.details.issues as string[]) ?? [];
        if (issues.some((i) => i.toLowerCase().includes("spf"))) {
          recommendations.push(
            "Add or fix your SPF record. Include 'include:spf.emailed.dev' in your SPF TXT record.",
          );
        }
        if (issues.some((i) => i.toLowerCase().includes("dkim"))) {
          recommendations.push(
            "Configure DKIM by publishing the CNAME record for your selector at selector._domainkey.yourdomain.com.",
          );
        }
        if (issues.some((i) => i.toLowerCase().includes("dmarc"))) {
          recommendations.push(
            "Add a DMARC record. Start with: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com",
          );
        }
        break;
      }

      case "deliverability":
        if (check.status === "fail") {
          recommendations.push(
            "Your deliverability score is critically low. Review authentication, content quality, and list hygiene.",
          );
        } else if (check.status === "warn") {
          recommendations.push(
            "Improve deliverability by reducing bounce rate, warming up sending gradually, and improving engagement.",
          );
        }
        break;

      case "authentication":
        recommendations.push(
          "Ensure SPF, DKIM, and DMARC are all properly configured. Run the DNS check for specific instructions.",
        );
        break;

      case "reputation":
        if (check.details.blacklisted) {
          recommendations.push(
            `Your domain is blacklisted. Identify the cause (spam complaints, bounces), fix it, then request delisting from: ${((check.details.blacklists as string[]) ?? []).join(", ")}.`,
          );
        }
        if ((check.details.complaintRate as number) > 0.001) {
          recommendations.push(
            "Your complaint rate is above 0.1%. Review your sending practices: ensure proper opt-in, honor unsubscribes, and improve content relevance.",
          );
        }
        if ((check.details.bounceRate as number) > 0.02) {
          recommendations.push(
            "Your bounce rate is above 2%. Clean your recipient list - remove invalid addresses and implement address validation.",
          );
        }
        break;

      case "error_logs": {
        const topType = check.details.topErrorType as string;
        if (topType === "bounce") {
          recommendations.push("High volume of bounces. Verify recipient addresses and clean your mailing list.");
        } else if (topType === "rate_limiting") {
          recommendations.push("You're being rate-limited by recipient servers. Reduce sending speed or spread sends across time.");
        } else if (topType === "connection_failure") {
          recommendations.push("Connection failures detected. This may indicate IP reputation issues or recipient server problems.");
        } else if (topType === "authentication") {
          recommendations.push("Authentication errors in logs. Verify your SPF and DKIM configuration.");
        }
        break;
      }

      case "sending_limits":
        if (check.status === "fail") {
          recommendations.push(
            "You've exceeded your sending limit. Upgrade your plan or wait for the limit to reset.",
          );
        } else if (check.status === "warn") {
          recommendations.push(
            "You're approaching your sending limit. Consider upgrading to avoid throttling.",
          );
        }
        break;

      case "blacklist":
        if (check.status === "fail") {
          recommendations.push(
            "Immediate action required: your domain is blacklisted. Stop sending until the underlying issue is resolved, then request delisting.",
          );
        }
        break;
    }
  }

  return recommendations;
}
