/**
 * Confidence Scorer — The AI brain that decides how much inspection is needed.
 *
 * Instead of running all checks on every item (slow), we first compute a
 * confidence score using lightweight signals. This score determines which
 * path the item takes:
 *
 * Score >= 95: TRUSTED    → Fast path, deliver immediately, verify async
 * Score 70-94: PROBABLE   → Quick parallel checks (auth + reputation)
 * Score 40-69: UNCERTAIN  → Full parallel inspection suite
 * Score 10-39: SUSPICIOUS → Deep inspection with quarantine
 * Score < 10:  REJECTED   → Block immediately
 *
 * The scorer uses a weighted signal model that adapts over time.
 * Signals that consistently predict outcomes gain weight.
 * Signals that produce false positives/negatives lose weight.
 */

import type {
  ConfidenceScore,
  ConfidenceTier,
  SignalScore,
  SignalType,
  SentinelConfig,
  ValidationItem,
} from '../types.js';

/** Individual signal evaluator */
interface SignalEvaluator {
  type: SignalType;
  weight: number;
  evaluate: (item: ValidationItem) => SignalScore;
}

export class ConfidenceScorer {
  private evaluators: SignalEvaluator[] = [];
  private dynamicWeights = new Map<SignalType, number>();

  constructor(private config: SentinelConfig) {
    this.registerDefaultEvaluators();
  }

  /**
   * Score a validation item. This must be FAST — target is <1ms.
   * Uses only lightweight signals (no network calls, no disk I/O).
   */
  score(item: ValidationItem): ConfidenceScore {
    const startTime = performance.now();

    const signals: SignalScore[] = [];
    let weightedSum = 0;
    let totalWeight = 0;

    for (const evaluator of this.evaluators) {
      const effectiveWeight =
        this.dynamicWeights.get(evaluator.type) ?? evaluator.weight;

      const signal = evaluator.evaluate(item);
      signal.weight = effectiveWeight;
      signals.push(signal);

      weightedSum += signal.score * effectiveWeight;
      totalWeight += effectiveWeight;
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 50;
    const tier = this.determineTier(score);
    const computeTimeUs = (performance.now() - startTime) * 1000;

    return {
      score: Math.round(score * 100) / 100,
      tier,
      signals,
      computeTimeUs: Math.round(computeTimeUs),
      cached: false,
    };
  }

  /**
   * Update signal weights based on feedback.
   * Signals that correctly predicted the outcome get a weight boost.
   * Signals that were wrong get a weight penalty.
   */
  updateWeights(
    signalType: SignalType,
    wasCorrect: boolean,
    learningRate = 0.01
  ): void {
    const currentWeight = this.dynamicWeights.get(signalType) ?? 1.0;
    const adjustment = wasCorrect ? learningRate : -learningRate;
    const newWeight = Math.max(0.1, Math.min(3.0, currentWeight + adjustment));
    this.dynamicWeights.set(signalType, newWeight);
  }

  private determineTier(score: number): ConfidenceTier {
    const t = this.config.thresholds;
    if (score >= t.trusted) return 'TRUSTED' as ConfidenceTier;
    if (score >= t.probable) return 'PROBABLE' as ConfidenceTier;
    if (score >= t.uncertain) return 'UNCERTAIN' as ConfidenceTier;
    if (score >= t.suspicious) return 'SUSPICIOUS' as ConfidenceTier;
    return 'REJECTED' as ConfidenceTier;
  }

  private registerDefaultEvaluators(): void {
    // ─── Sender Reputation (from cached reputation scores) ───
    this.evaluators.push({
      type: 'sender_reputation',
      weight: 2.0,
      evaluate: (item) => {
        const payload = item.payload as Record<string, unknown>;
        const reputationScore = (payload['senderReputation'] as number) ?? 50;
        return {
          signal: 'sender_reputation',
          score: reputationScore,
          weight: 2.0,
          reason:
            reputationScore > 80
              ? 'Known good sender'
              : reputationScore > 50
                ? 'Neutral sender reputation'
                : 'Poor sender reputation',
        };
      },
    });

    // ─── Authentication Status ───
    this.evaluators.push({
      type: 'authentication',
      weight: 2.5,
      evaluate: (item) => {
        const payload = item.payload as Record<string, unknown>;
        const headers = (payload['headers'] as Record<string, string>) ?? {};

        let score = 50; // baseline
        const reasons: string[] = [];

        if (headers['dkim-signature']) {
          score += 25;
          reasons.push('DKIM present');
        }
        if (headers['received-spf']?.includes('pass')) {
          score += 15;
          reasons.push('SPF pass');
        }
        if (headers['authentication-results']?.includes('dmarc=pass')) {
          score += 15;
          reasons.push('DMARC pass');
        }

        // No auth at all is very suspicious
        if (
          !headers['dkim-signature'] &&
          !headers['received-spf']
        ) {
          score = 5;
          reasons.push('No authentication');
        }

        return {
          signal: 'authentication',
          score: Math.min(100, score),
          weight: 2.5,
          reason: reasons.join(', ') || 'Unknown authentication status',
        };
      },
    });

    // ─── IP Reputation ───
    this.evaluators.push({
      type: 'ip_reputation',
      weight: 1.5,
      evaluate: (item) => {
        const ip = item.metadata.sourceIp;

        // Quick checks that don't require network
        let score = 60;
        const reasons: string[] = [];

        // Private/reserved IPs get neutral score
        if (this.isPrivateIP(ip)) {
          score = 70;
          reasons.push('Private IP range');
        }

        // Check if we have cached reputation for this IP
        // (In production, this pulls from a pre-warmed Redis cache)
        const ipReputation = (
          item.payload as Record<string, unknown>
        )['ipReputation'] as number | undefined;
        if (ipReputation !== undefined) {
          score = ipReputation;
          reasons.push(`Cached IP reputation: ${ipReputation}`);
        }

        return {
          signal: 'ip_reputation',
          score,
          weight: 1.5,
          reason: reasons.join(', ') || 'No IP reputation data',
        };
      },
    });

    // ─── Header Analysis (quick structural checks) ───
    this.evaluators.push({
      type: 'header_analysis',
      weight: 1.0,
      evaluate: (item) => {
        const payload = item.payload as Record<string, unknown>;
        const headers = (payload['headers'] as Record<string, string>) ?? {};

        let score = 100;
        const reasons: string[] = [];

        // Missing essential headers
        if (!headers['message-id']) {
          score -= 40;
          reasons.push('Missing Message-ID');
        }
        if (!headers['date']) {
          score -= 20;
          reasons.push('Missing Date header');
        }

        // Mismatched From/Envelope-From
        const from = (payload['from'] as string) ?? '';
        const envelopeFrom = (payload['envelopeFrom'] as string) ?? '';
        if (from && envelopeFrom && this.domainOf(from) !== this.domainOf(envelopeFrom)) {
          score -= 30;
          reasons.push('From/Envelope-From domain mismatch');
        }

        return {
          signal: 'header_analysis',
          score: Math.max(0, Math.min(100, score)),
          weight: 1.0,
          reason: reasons.join(', ') || 'Headers look normal',
        };
      },
    });

    // ─── Rate Pattern Analysis ───
    this.evaluators.push({
      type: 'rate_pattern',
      weight: 1.2,
      evaluate: (item) => {
        const prevCount = item.metadata.previousItemCount;

        let score = 95;
        let reason = 'Normal sending rate';

        // High volume from this sender in short period = suspicious
        if (prevCount > 1000) {
          score = 5;
          reason = `Very high volume: ${prevCount} recent items`;
        } else if (prevCount > 100) {
          score = 40;
          reason = `Elevated volume: ${prevCount} recent items`;
        } else if (prevCount === 0) {
          score = 60;
          reason = 'First-time sender for this session';
        }

        return {
          signal: 'rate_pattern',
          score,
          weight: 1.2,
          reason,
        };
      },
    });

    // ─── Content Fingerprint (lightweight content signals) ───
    this.evaluators.push({
      type: 'content_fingerprint',
      weight: 1.0,
      evaluate: (item) => {
        const payload = item.payload as Record<string, unknown>;
        const subject = ((payload['subject'] as string) ?? '').toLowerCase();
        const body = ((payload['body'] as string) ?? '').toLowerCase();

        let score = 95;
        const reasons: string[] = [];

        // Urgency signals (common in phishing)
        const urgencyPatterns = [
          'urgent', 'immediately', 'suspended', 'verify your',
          'click here now', 'act now', 'limited time', 'expire',
        ];
        const urgencyHits = urgencyPatterns.filter(
          (p) => subject.includes(p) || body.includes(p)
        );
        if (urgencyHits.length > 2) {
          score -= 40;
          reasons.push(`Multiple urgency signals: ${urgencyHits.join(', ')}`);
        } else if (urgencyHits.length > 0) {
          score -= 15;
          reasons.push(`Urgency language detected`);
        }

        // Excessive links
        const linkCount = (body.match(/https?:\/\//g) ?? []).length;
        if (linkCount > 10) {
          score -= 20;
          reasons.push(`High link count: ${linkCount}`);
        }

        // Empty subject and body together is a strong spam signal
        if (!subject && !body) {
          score -= 90;
          reasons.push('Empty subject and body');
        } else if (!subject) {
          score -= 15;
          reasons.push('Empty subject');
        }

        return {
          signal: 'content_fingerprint',
          score: Math.max(0, Math.min(100, score)),
          weight: 1.0,
          reason: reasons.join(', ') || 'Content appears normal',
        };
      },
    });

    // ─── Behavioral Pattern (sender history) ───
    this.evaluators.push({
      type: 'behavioral_pattern',
      weight: 1.3,
      evaluate: (item) => {
        const payload = item.payload as Record<string, unknown>;
        const historicalScore = (payload['historicalBehavior'] as number) ?? 65;

        return {
          signal: 'behavioral_pattern',
          score: historicalScore,
          weight: 1.3,
          reason:
            historicalScore > 80
              ? 'Consistent good behavior'
              : historicalScore > 50
                ? 'Normal behavior patterns'
                : 'Concerning behavioral patterns',
        };
      },
    });

    // ─── Recipient Relationship ───
    this.evaluators.push({
      type: 'recipient_relationship',
      weight: 1.5,
      evaluate: (item) => {
        const payload = item.payload as Record<string, unknown>;
        const hasRelationship = (payload['recipientKnowsSender'] as boolean) ?? false;

        return {
          signal: 'recipient_relationship',
          score: hasRelationship ? 98 : 45,
          weight: 1.5,
          reason: hasRelationship
            ? 'Recipient has prior relationship with sender'
            : 'No established relationship',
        };
      },
    });
  }

  private isPrivateIP(ip: string): boolean {
    if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1] ?? '0', 10);
      return second >= 16 && second <= 31;
    }
    return ip === '127.0.0.1' || ip === '::1';
  }

  private domainOf(email: string): string {
    const at = email.lastIndexOf('@');
    return at === -1 ? '' : email.substring(at + 1).toLowerCase();
  }
}
