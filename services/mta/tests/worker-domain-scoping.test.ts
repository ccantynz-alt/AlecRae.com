/**
 * Tests for the account-scoped sender-domain lookup (worker.ts
 * `senderDomainWhere`).
 *
 * `domains.domain` has NO unique constraint, so two accounts can hold rows
 * for the same domain string. The worker used to look the signing domain up
 * by domain alone — with two same-domain rows it could sign with, and read
 * the suppression list of, the WRONG account's row. The job's `QueuedEmail`
 * carries the sending account's id; the WHERE must be scoped by both.
 *
 * The job handler itself has no test harness (BullMQ + Postgres — same
 * situation as `requireDkim`), so what is pinned here is the predicate the
 * query is built from: rendered to SQL, it must filter on BOTH columns with
 * the job's own values, which is exactly what makes the database return the
 * job's account's row when two accounts share a domain string.
 */

import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { senderDomainWhere } from "../src/worker.js";

const dialect = new PgDialect();

function render(email: { domain: string; accountId: string }): {
  sql: string;
  params: unknown[];
} {
  const query = dialect.sqlToQuery(senderDomainWhere(email));
  return { sql: query.sql, params: query.params };
}

describe("senderDomainWhere — account scoping", () => {
  it("filters on the domain AND the job's account id", () => {
    const { sql, params } = render({
      domain: "shared-domain.com",
      accountId: "acct_job_owner",
    });

    expect(sql).toContain('"domain"');
    expect(sql).toContain('"account_id"');
    expect(sql).toContain(" and ");
    // Both values are bound — with two rows for "shared-domain.com" under
    // different accounts, only the job's account's row can match.
    expect(params).toEqual(["shared-domain.com", "acct_job_owner"]);
  });

  it("binds the account id from the job, not any fixed value", () => {
    const a = render({ domain: "shared-domain.com", accountId: "acct_a" });
    const b = render({ domain: "shared-domain.com", accountId: "acct_b" });

    // Same domain string, different accounts → different bound params, so
    // each job resolves its own account's row.
    expect(a.sql).toBe(b.sql);
    expect(a.params).toEqual(["shared-domain.com", "acct_a"]);
    expect(b.params).toEqual(["shared-domain.com", "acct_b"]);
  });
});
