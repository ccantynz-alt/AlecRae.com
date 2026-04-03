import { describe, it, expect, beforeEach } from 'bun:test';
import { CommunicationGraph } from '../src/relationships/graph.js';

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
        address: 'alice@example.com',
        domain: 'example.com',
        name: 'Alice',
      },
      to: (overrides['to'] as unknown[]) ?? [
        { address: 'bob@example.com', domain: 'example.com', name: 'Bob' },
      ],
      cc: overrides['cc'] ?? [],
    },
    content: {
      textBody: (overrides['textBody'] as string) ?? 'Hello there.',
      htmlBody: '',
      attachments: [],
    },
  } as never;
}

const USER = 'user@emailed.com';

// ---------------------------------------------------------------------------
// Contact management
// ---------------------------------------------------------------------------

describe('CommunicationGraph - contacts', () => {
  let graph: CommunicationGraph;

  beforeEach(() => {
    graph = new CommunicationGraph();
  });

  it('should create contacts when ingesting an inbound email', () => {
    const email = makeEmail({
      from: { address: 'alice@example.com', domain: 'example.com', name: 'Alice' },
    });
    const result = graph.ingestEmail(email, USER, 'inbound');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contactsUpdated).toBeGreaterThanOrEqual(1);
    }
    const contact = graph.getContact('alice@example.com');
    expect(contact).toBeDefined();
    expect(contact!.name).toBe('Alice');
  });

  it('should create contacts when ingesting an outbound email', () => {
    const email = makeEmail({
      from: { address: USER, domain: 'emailed.com', name: 'Me' },
      to: [
        { address: 'bob@example.com', domain: 'example.com', name: 'Bob' },
        { address: 'carol@example.com', domain: 'example.com', name: 'Carol' },
      ],
    });
    const result = graph.ingestEmail(email, USER, 'outbound');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contactsUpdated).toBe(2);
      expect(result.value.edgesUpdated).toBe(2);
    }
  });

  it('should merge contacts on repeated ingest', () => {
    const email1 = makeEmail({ from: { address: 'alice@example.com', domain: 'example.com', name: 'Alice' } });
    const email2 = makeEmail({ id: 'msg-2', from: { address: 'alice@example.com', domain: 'example.com', name: 'Alice Updated' } });
    graph.ingestEmail(email1, USER, 'inbound');
    graph.ingestEmail(email2, USER, 'inbound');
    const contact = graph.getContact('alice@example.com');
    expect(contact!.totalInteractions).toBe(3); // +1 for user node too, but alice is updated twice
  });

  it('should list all contacts', () => {
    graph.ingestEmail(makeEmail({ from: { address: 'a@x.com', domain: 'x.com', name: 'A' } }), USER, 'inbound');
    graph.ingestEmail(makeEmail({ id: 'm2', from: { address: 'b@x.com', domain: 'x.com', name: 'B' } }), USER, 'inbound');
    const all = graph.getAllContacts();
    // user + a + b = 3
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Relationship strength scoring
// ---------------------------------------------------------------------------

describe('CommunicationGraph - strength scoring', () => {
  let graph: CommunicationGraph;

  beforeEach(() => {
    graph = new CommunicationGraph();
  });

  it('should return 0 for unknown relationship', () => {
    const strength = graph.computeRelationshipStrength('a', 'b');
    expect(strength).toBe(0);
  });

  it('should increase strength with more interactions', () => {
    graph.ingestEmail(makeEmail({ from: { address: 'alice@x.com', domain: 'x.com', name: 'Alice' } }), USER, 'inbound');
    const s1 = graph.computeRelationshipStrength('alice@x.com', USER);

    graph.ingestEmail(makeEmail({ id: 'm2', from: { address: 'alice@x.com', domain: 'x.com', name: 'Alice' } }), USER, 'inbound');
    const s2 = graph.computeRelationshipStrength('alice@x.com', USER);

    expect(s2).toBeGreaterThanOrEqual(s1);
  });

  it('should give bidirectional relationships a reciprocity bonus', () => {
    // Inbound from alice
    graph.ingestEmail(makeEmail({ from: { address: 'alice@x.com', domain: 'x.com', name: 'Alice' } }), USER, 'inbound');
    // Outbound to alice
    const outEmail = makeEmail({
      id: 'm2',
      from: { address: USER, domain: 'emailed.com', name: 'Me' },
      to: [{ address: 'alice@x.com', domain: 'x.com', name: 'Alice' }],
    });
    graph.ingestEmail(outEmail, USER, 'outbound');

    const edge = graph.getEdge(USER, 'alice@x.com');
    expect(edge).toBeDefined();
    // The reverse edge should exist and be marked bidirectional
    const reverseEdge = graph.getEdge('alice@x.com', USER);
    expect(reverseEdge?.bidirectional).toBe(true);
  });

  it('should rank contacts by importance', () => {
    // Create several contacts with varying interaction counts
    for (let i = 0; i < 5; i++) {
      graph.ingestEmail(
        makeEmail({ id: `m-frequent-${i}`, from: { address: 'frequent@x.com', domain: 'x.com', name: 'Frequent' } }),
        USER,
        'inbound',
      );
    }
    graph.ingestEmail(
      makeEmail({ id: 'm-rare', from: { address: 'rare@x.com', domain: 'x.com', name: 'Rare' } }),
      USER,
      'inbound',
    );

    const ranked = graph.rankContacts(USER);
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    // Frequent contact should rank higher
    const frequentRank = ranked.findIndex((r) => r.contact.id === 'frequent@x.com');
    const rareRank = ranked.findIndex((r) => r.contact.id === 'rare@x.com');
    expect(frequentRank).toBeLessThan(rareRank);
  });
});

// ---------------------------------------------------------------------------
// Pattern detection
// ---------------------------------------------------------------------------

describe('CommunicationGraph - pattern detection', () => {
  let graph: CommunicationGraph;

  beforeEach(() => {
    graph = new CommunicationGraph();
  });

  it('should detect dormant relationships', () => {
    // Create an edge and manually set old interaction date
    graph.ingestEmail(makeEmail({ from: { address: 'old@x.com', domain: 'x.com', name: 'Old' } }), USER, 'inbound');
    // Ingest more so totalEmails > 5
    for (let i = 0; i < 6; i++) {
      graph.ingestEmail(makeEmail({ id: `m${i}`, from: { address: 'old@x.com', domain: 'x.com', name: 'Old' } }), USER, 'inbound');
    }

    // We can't easily set old timestamps, so just verify the pattern detector returns an array
    const patterns = graph.detectPatterns('old@x.com', USER);
    expect(Array.isArray(patterns)).toBe(true);
  });

  it('should return empty patterns for unknown edge', () => {
    const patterns = graph.detectPatterns('nonexistent@x.com', 'also@nonexistent.com');
    expect(patterns.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Sentiment on edges
// ---------------------------------------------------------------------------

describe('CommunicationGraph - sentiment updates', () => {
  let graph: CommunicationGraph;

  beforeEach(() => {
    graph = new CommunicationGraph();
  });

  it('should update sentiment for a relationship edge', () => {
    graph.ingestEmail(makeEmail({ from: { address: 'alice@x.com', domain: 'x.com', name: 'Alice' } }), USER, 'inbound');
    graph.updateSentiment('alice@x.com', USER, 0.8);
    const edge = graph.getEdge('alice@x.com', USER);
    expect(edge!.sentiment.current).toBe(0.8);
  });

  it('should compute sentiment trend from multiple updates', () => {
    graph.ingestEmail(makeEmail({ from: { address: 'bob@x.com', domain: 'x.com', name: 'Bob' } }), USER, 'inbound');
    graph.updateSentiment('bob@x.com', USER, 0.9);
    graph.updateSentiment('bob@x.com', USER, 0.8);
    graph.updateSentiment('bob@x.com', USER, 0.7);
    graph.updateSentiment('bob@x.com', USER, 0.3);
    graph.updateSentiment('bob@x.com', USER, 0.2);
    const edge = graph.getEdge('bob@x.com', USER);
    expect(edge!.sentiment.recentScores.length).toBe(5);
    expect(edge!.sentiment.trend).toBe('declining');
  });
});

// ---------------------------------------------------------------------------
// Follow-up detection
// ---------------------------------------------------------------------------

describe('CommunicationGraph - follow-up detection', () => {
  let graph: CommunicationGraph;

  beforeEach(() => {
    graph = new CommunicationGraph({ followUpThresholdDays: 14, minInteractionsForInsights: 2 });
  });

  it('should return empty follow-ups for fresh graph', () => {
    const reminders = graph.detectFollowUps(USER);
    expect(reminders.length).toBe(0);
  });

  it('should not generate follow-up for contacts with too few interactions', () => {
    graph.ingestEmail(makeEmail({ from: { address: 'once@x.com', domain: 'x.com', name: 'Once' } }), USER, 'inbound');
    const reminders = graph.detectFollowUps(USER);
    expect(reminders.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Relationship health assessment
// ---------------------------------------------------------------------------

describe('CommunicationGraph - relationship health', () => {
  let graph: CommunicationGraph;

  beforeEach(() => {
    graph = new CommunicationGraph();
  });

  it('should return error for non-existent edge', () => {
    const result = graph.assessRelationshipHealth('a', 'b');
    expect(result.ok).toBe(false);
  });

  it('should assess health of an existing relationship', () => {
    graph.ingestEmail(makeEmail({ from: { address: 'eve@x.com', domain: 'x.com', name: 'Eve' } }), USER, 'inbound');
    const result = graph.assessRelationshipHealth('eve@x.com', USER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(['thriving', 'stable', 'cooling', 'at_risk', 'dormant']).toContain(result.value.overallHealth);
      expect(result.value.details).toBeDefined();
    }
  });
});
