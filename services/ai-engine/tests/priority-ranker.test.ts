import { describe, it, expect, beforeEach } from 'bun:test';
import { PriorityRanker } from '../src/priority/ranker.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: (overrides['id'] as string) ?? 'msg-1',
    receivedAt: (overrides['receivedAt'] as Date) ?? new Date(),
    headers: {
      subject: (overrides['subject'] as string) ?? 'Hello',
      from: (overrides['from'] as Record<string, string>) ?? {
        address: 'colleague@company.com',
        domain: 'company.com',
        name: 'Colleague',
      },
      to: (overrides['to'] as unknown[]) ?? [
        { address: 'user@alecrae.com', domain: 'alecrae.com', name: 'User' },
      ],
      cc: overrides['cc'] ?? undefined,
      bcc: overrides['bcc'] ?? undefined,
    },
    content: {
      textBody: (overrides['textBody'] as string) ?? 'Hello, how are you?',
      htmlBody: '',
      attachments: [],
    },
  } as never;
}

const USER_ID = 'user@alecrae.com';

// ---------------------------------------------------------------------------
// VIP Detection
// ---------------------------------------------------------------------------

describe('PriorityRanker - VIP detection', () => {
  let ranker: PriorityRanker;

  beforeEach(() => {
    ranker = new PriorityRanker();
  });

  it('should mark a sender as VIP and detect them', () => {
    ranker.addVipSender(USER_ID, 'boss@company.com');
    expect(ranker.isVipSender(USER_ID, 'boss@company.com')).toBe(true);
  });

  it('should remove VIP status', () => {
    ranker.addVipSender(USER_ID, 'boss@company.com');
    ranker.removeVipSender(USER_ID, 'boss@company.com');
    expect(ranker.isVipSender(USER_ID, 'boss@company.com')).toBe(false);
  });

  it('should boost score for user-defined VIP senders', () => {
    ranker.addVipSender(USER_ID, 'boss@company.com');
    const vipEmail = makeEmail({
      from: { address: 'boss@company.com', domain: 'company.com', name: 'Boss' },
      subject: 'Quick question',
    });
    const normalEmail = makeEmail({
      from: { address: 'random@other.com', domain: 'other.com', name: 'Random' },
      subject: 'Quick question',
    });
    const vipResult = ranker.rank(vipEmail, USER_ID);
    const normalResult = ranker.rank(normalEmail, USER_ID);
    expect(vipResult.ok && normalResult.ok).toBe(true);
    if (vipResult.ok && normalResult.ok) {
      expect(vipResult.value.score).toBeGreaterThan(normalResult.value.score);
    }
  });

  it('should boost score for C-suite senders via default VIP rules', () => {
    const ceoEmail = makeEmail({
      from: { address: 'ceo@company.com', domain: 'company.com', name: 'CEO' },
    });
    const result = ranker.rank(ceoEmail, USER_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.signals.find((s) => s.type === 'sender_importance')!.value).toBeGreaterThan(0.5);
    }
  });
});

// ---------------------------------------------------------------------------
// Urgency scoring
// ---------------------------------------------------------------------------

describe('PriorityRanker - urgency scoring', () => {
  let ranker: PriorityRanker;

  beforeEach(() => {
    ranker = new PriorityRanker();
  });

  it('should give higher score to urgent emails', () => {
    const urgentEmail = makeEmail({
      subject: 'URGENT: Action required immediately - P0 outage',
      textBody: 'Critical incident, respond ASAP.',
    });
    const casualEmail = makeEmail({
      subject: 'FYI: Newsletter digest',
      textBody: 'Here is your weekly newsletter digest. Unsubscribe below.',
    });
    const urgentResult = ranker.rank(urgentEmail, USER_ID);
    const casualResult = ranker.rank(casualEmail, USER_ID);
    expect(urgentResult.ok && casualResult.ok).toBe(true);
    if (urgentResult.ok && casualResult.ok) {
      expect(urgentResult.value.score).toBeGreaterThan(casualResult.value.score);
    }
  });

  it('should lower score for newsletter-like emails', () => {
    const email = makeEmail({
      subject: 'Weekly newsletter',
      textBody: 'Automated notification. Unsubscribe here.',
    });
    const result = ranker.rank(email, USER_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const urgencySignal = result.value.signals.find((s) => s.type === 'content_urgency');
      expect(urgencySignal!.value).toBeLessThan(0.3);
    }
  });

  it('should detect action-required emails', () => {
    const email = makeEmail({
      subject: 'Please review and approve',
      textBody: 'Action required: please confirm the changes.',
    });
    const result = ranker.rank(email, USER_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.actionRequired).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Behavior learning
// ---------------------------------------------------------------------------

describe('PriorityRanker - behavior learning', () => {
  let ranker: PriorityRanker;

  beforeEach(() => {
    ranker = new PriorityRanker();
  });

  it('should create a default profile when recording behavior for new user', () => {
    ranker.recordBehavior(USER_ID, 'msg-1', 'reply', 'boss@company.com', 5000);
    const profile = ranker.getBehaviorProfile(USER_ID);
    expect(profile).toBeDefined();
    expect(profile!.userId).toBe(USER_ID);
  });

  it('should increase sender weight after repeated replies', () => {
    ranker.recordBehavior(USER_ID, 'msg-1', 'reply', 'important@co.com', 3000);
    ranker.recordBehavior(USER_ID, 'msg-2', 'reply', 'important@co.com', 2000);
    ranker.recordBehavior(USER_ID, 'msg-3', 'reply', 'important@co.com', 1000);
    const profile = ranker.getBehaviorProfile(USER_ID)!;
    const sender = profile.importantSenders.find((s) => s.address === 'important@co.com');
    expect(sender).toBeDefined();
    expect(sender!.weight).toBeGreaterThan(0.3);
  });

  it('should decrease sender weight after archive/delete', () => {
    ranker.recordBehavior(USER_ID, 'msg-1', 'reply', 'meh@co.com', 3000);
    const beforeProfile = ranker.getBehaviorProfile(USER_ID)!;
    const beforeWeight = beforeProfile.importantSenders.find((s) => s.address === 'meh@co.com')!.weight;

    ranker.recordBehavior(USER_ID, 'msg-2', 'archive', 'meh@co.com');
    ranker.recordBehavior(USER_ID, 'msg-3', 'delete', 'meh@co.com');
    const afterProfile = ranker.getBehaviorProfile(USER_ID)!;
    const afterWeight = afterProfile.importantSenders.find((s) => s.address === 'meh@co.com')!.weight;

    expect(afterWeight).toBeLessThan(beforeWeight);
  });
});

// ---------------------------------------------------------------------------
// Batch ranking & tiers
// ---------------------------------------------------------------------------

describe('PriorityRanker - batch ranking and tiers', () => {
  let ranker: PriorityRanker;

  beforeEach(() => {
    ranker = new PriorityRanker();
  });

  it('should rank a batch of emails sorted by score descending', () => {
    const emails = [
      makeEmail({ id: 'low', subject: 'Newsletter digest', textBody: 'automated notification unsubscribe' }),
      makeEmail({ id: 'high', subject: 'URGENT P0 outage action required', textBody: 'Critical blocker, respond immediately ASAP.' }),
      makeEmail({ id: 'mid', subject: 'Re: Project update', textBody: 'Here is the update.' }),
    ];
    const result = ranker.rankBatch(emails, USER_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
      expect(result.value[0]!.score).toBeGreaterThanOrEqual(result.value[1]!.score);
      expect(result.value[1]!.score).toBeGreaterThanOrEqual(result.value[2]!.score);
    }
  });

  it('should assign a valid tier to every ranked email', () => {
    const email = makeEmail();
    const result = ranker.rank(email, USER_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(['critical', 'high', 'medium', 'low', 'background']).toContain(result.value.tier);
    }
  });

  it('should suggest archive for low-priority emails', () => {
    const email = makeEmail({
      subject: 'Weekly newsletter',
      textBody: 'Automated promotion sale offer unsubscribe digest no-reply notification.',
      to: [
        ...Array.from({ length: 15 }, (_, i) => ({
          address: `user${i}@example.com`, domain: 'example.com', name: `User ${i}`,
        })),
      ],
    });
    const result = ranker.rank(email, USER_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const archiveAction = result.value.suggestedActions.find((a) => a.type === 'archive');
      expect(archiveAction).toBeDefined();
    }
  });
});
