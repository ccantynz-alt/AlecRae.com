# Intentionally UI-less Routes

Last updated: 2026-07-14 06:30 UTC

Some backend route groups will never have — and should never have — a dashboard
UI. They are operational/infrastructure endpoints consumed by monitoring,
webhooks, service workers, or other machines, not by end users. The
route-coverage tracker (`docs/audits/route-coverage.md`) counts these as
"unwired", which is correct in the literal sense but should not be read as a
product gap. This list records the deliberate exclusions so future audits stop
re-flagging them.

| Route file | Endpoints | Why no app UI |
|---|---|---|
| `health.ts` | 2 | Liveness/readiness probes for load balancers + `GET /v1/health/detailed` for ops. Machine-consumed. |
| `uptime.ts` | 1 | Uptime/monitoring probe. Machine-consumed. |
| `status.ts` | 1 | Feeds the public `status.alecrae.com` page (a separate app), not the dashboard. |
| `realtime.ts` | 1 | WebSocket upgrade endpoint. The UI consumes it via the WS client, not a page; the coverage tracker only sees REST paths. |
| `fbl.ts` | 1 | Feedback-loop (FBL) ingestion webhook for mailbox providers (complaint reports). Inbound machine webhook. |

**Total: 6 endpoints across 5 files** that are correctly excluded from
"reachable product" coverage. Subtract these from the denominator when reasoning
about how much of the *user-facing* backend is wired.

Note: several other endpoints are machine-facing even within otherwise
user-facing route files — e.g. `GET /v1/recall/view/:token` (public
unauthenticated recall viewer), OAuth callbacks, and Stripe/webhook receivers.
Those are counted at the file level but their individual machine-facing
endpoints are expected to remain UI-less.
