// =============================================================================
// Vieanna — Email Feature Extractor for On-Device AI
// =============================================================================
// Extracts numerical feature vectors from emails for ONNX model input.
// Converts raw email data into fixed-length float arrays optimized for
// on-device ML inference. All processing happens locally — zero network.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmailInput {
  id: string;
  from: { name: string; address: string };
  to: Array<{ name: string; address: string }>;
  cc: Array<{ name: string; address: string }>;
  subject: string;
  textBody: string;
  htmlBody: string;
  receivedAt: number;
  headers: Record<string, string>;
  attachmentCount: number;
  totalAttachmentSize: number;
}

export interface ContactContext {
  isKnownContact: boolean;
  interactionCount: number;
  domainType: 'personal' | 'corporate' | 'freemail' | 'unknown';
  senderReputationCached: number; // 0-1
  lastInteractionDaysAgo: number;
}

export interface FeatureVector {
  emailId: string;
  features: Float32Array;
  featureNames: string[];
  extractedAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'gmx.com', 'live.com', 'msn.com', 'fastmail.com', 'tutanota.com',
]);

const URGENCY_KEYWORDS = new Set([
  'urgent', 'asap', 'immediately', 'critical', 'deadline', 'emergency',
  'time-sensitive', 'overdue', 'expires', 'expiring', 'last chance',
  'final notice', 'action required', 'respond by', 'due today', 'eod',
  'end of day', 'by tomorrow', 'right away', 'rush',
]);

const MONEY_PATTERNS = [
  /\$[\d,]+\.?\d*/g,
  /USD\s*[\d,]+/gi,
  /€[\d,]+/g,
  /£[\d,]+/g,
  /\b\d+\s*dollars?\b/gi,
  /invoice\s*#?\s*\d+/gi,
  /payment\s+of\s+[\$€£]?[\d,]+/gi,
];

const MEETING_KEYWORDS = new Set([
  'meeting', 'calendar', 'schedule', 'call', 'zoom', 'teams',
  'conference', 'standup', 'sync', 'catch up', 'catch-up',
  'invite', 'invitation', 'rsvp', 'attend', 'availability',
  'available', 'book', 'appointment', 'slot', 'reschedule',
]);

const PERSONAL_KEYWORDS = new Set([
  'birthday', 'congrats', 'congratulations', 'thank you', 'thanks',
  'appreciate', 'welcome', 'sorry', 'apology', 'apologize',
  'miss you', 'love', 'family', 'vacation', 'holiday', 'weekend',
  'dinner', 'lunch', 'coffee', 'drinks', 'party', 'celebration',
]);

// Feature vector length — must match ONNX model input shape
export const FEATURE_VECTOR_LENGTH = 64;

// ─── Feature Extractor ──────────────────────────────────────────────────────

export class EmailFeatureExtractor {
  /**
   * Extract a fixed-length feature vector from an email.
   * Returns FEATURE_VECTOR_LENGTH floats normalized to [0, 1].
   */
  extract(email: EmailInput, contact?: ContactContext): FeatureVector {
    const features = new Float32Array(FEATURE_VECTOR_LENGTH);
    const names: string[] = [];
    let idx = 0;

    const set = (name: string, value: number): void => {
      if (idx < FEATURE_VECTOR_LENGTH) {
        features[idx] = Math.max(0, Math.min(1, value));
        names.push(name);
        idx++;
      }
    };

    // ── Text Features (0-15) ──────────────────────────────────────────
    const words = email.textBody.split(/\s+/).filter((w) => w.length > 0);
    const sentences = email.textBody.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const subjectWords = email.subject.split(/\s+/).filter((w) => w.length > 0);

    set('word_count', Math.min(words.length / 2000, 1));
    set('sentence_count', Math.min(sentences.length / 200, 1));
    set('avg_word_length', words.length > 0
      ? Math.min(words.reduce((s, w) => s + w.length, 0) / words.length / 15, 1)
      : 0);
    set('avg_sentence_length', sentences.length > 0
      ? Math.min(words.length / sentences.length / 50, 1)
      : 0);
    set('subject_word_count', Math.min(subjectWords.length / 20, 1));
    set('subject_length', Math.min(email.subject.length / 200, 1));
    set('body_length', Math.min(email.textBody.length / 10000, 1));

    // Punctuation ratios
    const questionMarks = (email.textBody.match(/\?/g) ?? []).length;
    const exclamationMarks = (email.textBody.match(/!/g) ?? []).length;
    const capsRatio = words.length > 0
      ? words.filter((w) => w === w.toUpperCase() && w.length > 1).length / words.length
      : 0;

    set('question_mark_count', Math.min(questionMarks / 10, 1));
    set('exclamation_mark_count', Math.min(exclamationMarks / 10, 1));
    set('caps_ratio', capsRatio);

    // Links and media
    const linkCount = (email.textBody.match(/https?:\/\/\S+/g) ?? []).length;
    const imageCount = (email.htmlBody.match(/<img/gi) ?? []).length;

    set('link_count', Math.min(linkCount / 20, 1));
    set('image_count', Math.min(imageCount / 10, 1));
    set('attachment_count', Math.min(email.attachmentCount / 10, 1));
    set('total_attachment_size', Math.min(email.totalAttachmentSize / (25 * 1024 * 1024), 1));

    // HTML complexity
    const htmlTagCount = (email.htmlBody.match(/<[^>]+>/g) ?? []).length;
    set('html_tag_count', Math.min(htmlTagCount / 500, 1));
    set('html_to_text_ratio', email.textBody.length > 0
      ? Math.min(email.htmlBody.length / email.textBody.length / 10, 1)
      : 0);

    // ── Sender Features (16-23) ───────────────────────────────────────
    const senderDomain = email.from.address.split('@')[1]?.toLowerCase() ?? '';
    const isFreemail = FREEMAIL_DOMAINS.has(senderDomain);

    set('is_known_contact', contact?.isKnownContact ? 1 : 0);
    set('interaction_count', contact ? Math.min(contact.interactionCount / 100, 1) : 0);
    set('is_freemail', isFreemail ? 1 : 0);
    set('is_corporate', contact?.domainType === 'corporate' ? 1 : 0);
    set('sender_reputation', contact?.senderReputationCached ?? 0.5);
    set('days_since_last_interaction', contact
      ? Math.min(contact.lastInteractionDaysAgo / 365, 1)
      : 1);
    set('sender_name_present', email.from.name.length > 0 ? 1 : 0);
    set('sender_domain_length', Math.min(senderDomain.length / 30, 1));

    // ── Temporal Features (24-29) ─────────────────────────────────────
    const date = new Date(email.receivedAt);
    const hourOfDay = date.getHours();
    const dayOfWeek = date.getDay();

    set('hour_sin', (Math.sin(2 * Math.PI * hourOfDay / 24) + 1) / 2);
    set('hour_cos', (Math.cos(2 * Math.PI * hourOfDay / 24) + 1) / 2);
    set('day_sin', (Math.sin(2 * Math.PI * dayOfWeek / 7) + 1) / 2);
    set('day_cos', (Math.cos(2 * Math.PI * dayOfWeek / 7) + 1) / 2);
    set('is_business_hours', (hourOfDay >= 9 && hourOfDay <= 17 && dayOfWeek >= 1 && dayOfWeek <= 5) ? 1 : 0);
    set('is_weekend', (dayOfWeek === 0 || dayOfWeek === 6) ? 1 : 0);

    // ── Content Signal Features (30-45) ───────────────────────────────
    const lowerBody = email.textBody.toLowerCase();
    const lowerSubject = email.subject.toLowerCase();
    const combined = `${lowerSubject} ${lowerBody}`;

    // Urgency
    let urgencyScore = 0;
    for (const keyword of URGENCY_KEYWORDS) {
      if (combined.includes(keyword)) urgencyScore++;
    }
    set('urgency_score', Math.min(urgencyScore / 5, 1));

    // Money/financial
    let moneyHits = 0;
    for (const pattern of MONEY_PATTERNS) {
      moneyHits += (combined.match(pattern) ?? []).length;
    }
    set('has_money_amount', Math.min(moneyHits / 5, 1));

    // Meeting/calendar
    let meetingScore = 0;
    for (const keyword of MEETING_KEYWORDS) {
      if (combined.includes(keyword)) meetingScore++;
    }
    set('meeting_score', Math.min(meetingScore / 5, 1));

    // Questions (direct asks)
    const hasDirectQuestion = /\b(can you|could you|would you|will you|please|do you|are you)\b/i.test(combined);
    set('has_direct_question', hasDirectQuestion ? 1 : 0);
    set('has_question', questionMarks > 0 ? 1 : 0);

    // Personal
    let personalScore = 0;
    for (const keyword of PERSONAL_KEYWORDS) {
      if (combined.includes(keyword)) personalScore++;
    }
    set('personal_score', Math.min(personalScore / 5, 1));

    // Deadline detection
    const hasDeadline = /\b(by\s+\w+day|due\s+(on|by|date)|deadline|before\s+\w+\s+\d|expires?\s+(on|in|at))\b/i.test(combined);
    set('has_deadline', hasDeadline ? 1 : 0);

    // Unsubscribe signals (newsletter/marketing indicator)
    const hasUnsubscribe = combined.includes('unsubscribe') || combined.includes('opt out') || combined.includes('opt-out');
    set('has_unsubscribe', hasUnsubscribe ? 1 : 0);

    // Promotional signals
    const promoKeywords = ['sale', 'discount', 'offer', 'deal', 'free', 'limited time', 'buy now', 'shop now', 'promo', 'coupon'];
    let promoScore = 0;
    for (const kw of promoKeywords) {
      if (combined.includes(kw)) promoScore++;
    }
    set('promo_score', Math.min(promoScore / 5, 1));

    // Transactional signals
    const txKeywords = ['order', 'confirmation', 'shipped', 'delivered', 'tracking', 'receipt', 'invoice', 'payment received'];
    let txScore = 0;
    for (const kw of txKeywords) {
      if (combined.includes(kw)) txScore++;
    }
    set('transaction_score', Math.min(txScore / 5, 1));

    // Social notification signals
    const socialKeywords = ['liked', 'commented', 'shared', 'mentioned', 'tagged', 'followed', 'connected', 'endorsed'];
    let socialScore = 0;
    for (const kw of socialKeywords) {
      if (combined.includes(kw)) socialScore++;
    }
    set('social_score', Math.min(socialScore / 5, 1));

    // Spam signals
    const spamKeywords = ['nigerian', 'lottery', 'winner', 'claim', 'wire transfer', 'bank account', 'million dollars', 'act now'];
    let spamScore = 0;
    for (const kw of spamKeywords) {
      if (combined.includes(kw)) spamScore++;
    }
    set('spam_signal_score', Math.min(spamScore / 3, 1));

    // ── Header Features (46-55) ───────────────────────────────────────
    const headers = email.headers;

    set('recipient_count', Math.min(email.to.length / 20, 1));
    set('cc_count', Math.min(email.cc.length / 20, 1));
    set('has_reply_to', headers['reply-to'] ? 1 : 0);
    set('has_in_reply_to', headers['in-reply-to'] ? 1 : 0);
    set('has_references', headers['references'] ? 1 : 0);
    set('has_list_unsubscribe', headers['list-unsubscribe'] ? 1 : 0);
    set('has_list_id', headers['list-id'] ? 1 : 0);
    set('has_dkim_signature', headers['dkim-signature'] ? 1 : 0);
    set('has_precedence_bulk', (headers['precedence'] ?? '').toLowerCase() === 'bulk' ? 1 : 0);

    // Thread depth estimate from References header
    const references = headers['references'] ?? '';
    const threadDepth = references.split(/\s+/).filter((r) => r.includes('@')).length;
    set('thread_depth', Math.min(threadDepth / 20, 1));

    // ── Padding (56-63) ───────────────────────────────────────────────
    // Reserved for future features — fill with zeros
    while (idx < FEATURE_VECTOR_LENGTH) {
      set(`reserved_${idx}`, 0);
    }

    return {
      emailId: email.id,
      features,
      featureNames: names,
      extractedAt: Date.now(),
    };
  }

  /**
   * Extract features from multiple emails in batch (for bulk classification).
   */
  extractBatch(emails: EmailInput[], contacts?: Map<string, ContactContext>): FeatureVector[] {
    return emails.map((email) => {
      const contact = contacts?.get(email.from.address.toLowerCase());
      return this.extract(email, contact);
    });
  }

  /**
   * Get the domain type for a sender address.
   */
  getDomainType(address: string): 'personal' | 'corporate' | 'freemail' | 'unknown' {
    const domain = address.split('@')[1]?.toLowerCase();
    if (!domain) return 'unknown';
    if (FREEMAIL_DOMAINS.has(domain)) return 'freemail';
    // Heuristic: short domains with known TLDs are likely corporate
    if (domain.split('.').length <= 3 && !domain.includes('-')) return 'corporate';
    return 'unknown';
  }
}
