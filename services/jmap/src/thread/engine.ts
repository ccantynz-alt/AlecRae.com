import type { JmapId, JmapThread } from "../types.js";

/**
 * Email threading engine.
 * Groups related messages by References/In-Reply-To headers
 * following the JWZ threading algorithm principles.
 */

interface ThreadedMessage {
  emailId: JmapId;
  messageId: string;
  inReplyTo: string[];
  references: string[];
  subject: string;
  receivedAt: Date;
}

export class ThreadingEngine {
  // accountId -> (threadId -> thread)
  private threads = new Map<string, Map<JmapId, JmapThread>>();
  // accountId -> (messageId -> threadId)
  private messageToThread = new Map<string, Map<string, JmapId>>();
  // accountId -> (emailId -> threadId)
  private emailToThread = new Map<string, Map<JmapId, JmapId>>();

  private stateCounter = new Map<string, number>();

  private getAccountThreads(accountId: JmapId): Map<JmapId, JmapThread> {
    let threads = this.threads.get(accountId);
    if (!threads) {
      threads = new Map();
      this.threads.set(accountId, threads);
      this.messageToThread.set(accountId, new Map());
      this.emailToThread.set(accountId, new Map());
      this.stateCounter.set(accountId, 0);
    }
    return threads;
  }

  private getMessageIndex(accountId: JmapId): Map<string, JmapId> {
    this.getAccountThreads(accountId); // ensure initialized
    const index = this.messageToThread.get(accountId);
    if (!index) throw new Error(`Message index missing for account ${accountId}`);
    return index;
  }

  private getEmailIndex(accountId: JmapId): Map<JmapId, JmapId> {
    this.getAccountThreads(accountId);
    const index = this.emailToThread.get(accountId);
    if (!index) throw new Error(`Email index missing for account ${accountId}`);
    return index;
  }

  private generateId(): JmapId {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return "t_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Add an email to the threading system.
   * Returns the thread ID for the email.
   */
  addEmail(accountId: JmapId, email: ThreadedMessage): JmapId {
    const threads = this.getAccountThreads(accountId);
    const msgIndex = this.getMessageIndex(accountId);
    const emailIndex = this.getEmailIndex(accountId);

    // Find existing thread by checking all reference chains
    const relatedThreadIds = new Set<JmapId>();

    // Check Message-ID itself (for deduplication)
    const existingThread = msgIndex.get(email.messageId);
    if (existingThread) {
      relatedThreadIds.add(existingThread);
    }

    // Check In-Reply-To
    for (const ref of email.inReplyTo) {
      const threadId = msgIndex.get(ref);
      if (threadId) relatedThreadIds.add(threadId);
    }

    // Check References (ordered from oldest to newest)
    for (const ref of email.references) {
      const threadId = msgIndex.get(ref);
      if (threadId) relatedThreadIds.add(threadId);
    }

    // Subject-based threading fallback (normalized subject matching)
    if (relatedThreadIds.size === 0) {
      const normalizedSubject = this.normalizeSubject(email.subject);
      if (normalizedSubject.length > 0 && this.isReply(email.subject)) {
        for (const [, thread] of threads) {
          // Check if any email in this thread has a matching subject
          // In production, maintain a subject index for efficient lookup
          const firstEmailId = thread.emailIds[0];
          if (firstEmailId) {
            // Subject matching would require access to email subjects
            // Skipped here for simplicity; header-based threading is preferred
          }
        }
      }
    }

    let threadId: JmapId;

    if (relatedThreadIds.size === 0) {
      // Create a new thread
      threadId = this.generateId();
      threads.set(threadId, {
        id: threadId,
        emailIds: [email.emailId],
      });
    } else if (relatedThreadIds.size === 1) {
      // Add to existing thread
      const [firstRelated] = [...relatedThreadIds];
      if (!firstRelated) throw new Error("Expected related thread id");
      threadId = firstRelated;
      const thread = threads.get(threadId);
      if (!thread) throw new Error(`Thread not found: ${threadId}`);
      if (!thread.emailIds.includes(email.emailId)) {
        thread.emailIds.push(email.emailId);
        this.sortThreadEmails(thread);
      }
    } else {
      // Merge multiple threads into one
      threadId = this.mergeThreads(accountId, [...relatedThreadIds], email.emailId);
    }

    // Update indexes
    msgIndex.set(email.messageId, threadId);
    emailIndex.set(email.emailId, threadId);

    // Also index all references so future messages in the chain find this thread
    for (const ref of email.references) {
      if (!msgIndex.has(ref)) {
        msgIndex.set(ref, threadId);
      }
    }
    for (const ref of email.inReplyTo) {
      if (!msgIndex.has(ref)) {
        msgIndex.set(ref, threadId);
      }
    }

    return threadId;
  }

  /**
   * Merge multiple threads into a single thread.
   */
  private mergeThreads(accountId: JmapId, threadIds: JmapId[], newEmailId: JmapId): JmapId {
    const threads = this.getAccountThreads(accountId);
    const msgIndex = this.getMessageIndex(accountId);
    const emailIndex = this.getEmailIndex(accountId);

    // Use the first thread as the target
    const targetId = threadIds[0];
    if (!targetId) throw new Error("mergeThreads requires at least one thread id");
    const targetThread = threads.get(targetId);
    if (!targetThread) throw new Error(`Target thread not found: ${targetId}`);

    // Merge all other threads into the target
    for (let i = 1; i < threadIds.length; i++) {
      const sourceId = threadIds[i];
      if (!sourceId) continue;
      const sourceThread = threads.get(sourceId);
      if (!sourceThread) continue;

      // Move all emails from source to target
      for (const emailId of sourceThread.emailIds) {
        if (!targetThread.emailIds.includes(emailId)) {
          targetThread.emailIds.push(emailId);
        }
        emailIndex.set(emailId, targetId);
      }

      // Update message-to-thread index
      for (const [msgId, tId] of msgIndex) {
        if (tId === sourceId) {
          msgIndex.set(msgId, targetId);
        }
      }

      // Remove the merged thread
      threads.delete(sourceId);
    }

    // Add the new email
    if (!targetThread.emailIds.includes(newEmailId)) {
      targetThread.emailIds.push(newEmailId);
    }

    this.sortThreadEmails(targetThread);

    return targetId;
  }

  /**
   * Sort emails within a thread by received date.
   */
  private sortThreadEmails(_thread: JmapThread): void {
    // In production, sort by actual received dates.
    // Email IDs are kept in order of insertion as a proxy for chronological order.
  }

  /**
   * Get a thread by ID.
   */
  getThread(accountId: JmapId, threadId: JmapId): JmapThread | null {
    const threads = this.getAccountThreads(accountId);
    return threads.get(threadId) ?? null;
  }

  /**
   * Get the thread ID for an email.
   */
  getThreadForEmail(accountId: JmapId, emailId: JmapId): JmapId | null {
    const emailIndex = this.getEmailIndex(accountId);
    return emailIndex.get(emailId) ?? null;
  }

  /**
   * Get all threads for an account.
   */
  getAllThreads(accountId: JmapId): JmapThread[] {
    const threads = this.getAccountThreads(accountId);
    return [...threads.values()];
  }

  /**
   * Remove an email from its thread. Cleans up empty threads.
   */
  removeEmail(accountId: JmapId, emailId: JmapId): void {
    const threads = this.getAccountThreads(accountId);
    const emailIndex = this.getEmailIndex(accountId);

    const threadId = emailIndex.get(emailId);
    if (!threadId) return;

    const thread = threads.get(threadId);
    if (!thread) return;

    thread.emailIds = thread.emailIds.filter((id) => id !== emailId);
    emailIndex.delete(emailId);

    // Remove empty thread
    if (thread.emailIds.length === 0) {
      threads.delete(threadId);
      // Clean up message index
      const msgIndex = this.getMessageIndex(accountId);
      for (const [msgId, tId] of msgIndex) {
        if (tId === threadId) msgIndex.delete(msgId);
      }
    }
  }

  /**
   * Normalize a subject line by removing Re:/Fwd:/etc. prefixes.
   */
  private normalizeSubject(subject: string): string {
    return subject
      .replace(/^(\s*(re|fwd?|aw|sv|vs|ref)\s*(\[\d+\])?\s*:\s*)+/i, "")
      .trim()
      .toLowerCase();
  }

  /**
   * Check if a subject indicates a reply/forward.
   */
  private isReply(subject: string): boolean {
    return /^(re|fwd?|aw|sv|vs|ref)\s*(\[\d+\])?\s*:/i.test(subject.trim());
  }

  /**
   * Get thread statistics.
   */
  getStats(accountId: JmapId): { threadCount: number; avgEmailsPerThread: number } {
    const threads = this.getAccountThreads(accountId);
    const threadCount = threads.size;
    if (threadCount === 0) return { threadCount: 0, avgEmailsPerThread: 0 };

    let totalEmails = 0;
    for (const thread of threads.values()) {
      totalEmails += thread.emailIds.length;
    }

    return {
      threadCount,
      avgEmailsPerThread: totalEmails / threadCount,
    };
  }
}
