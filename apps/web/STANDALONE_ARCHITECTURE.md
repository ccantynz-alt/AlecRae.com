# AlecRae — Standalone Architecture

AlecRae is an AI-native email client. Standalone product. 35K+ lines of TypeScript.

## Apps

| App | Path | Tech |
|-----|------|------|
| Web inbox | apps/web | Next.js 15, App Router, RSC |
| API server | apps/api | Hono + Bun |
| Admin dashboard | apps/admin | Next.js 15 |
| Desktop | apps/desktop | Electron |
| Mobile | apps/mobile | React Native + Expo |
| Docs | apps/docs | Next.js 15 |
| Status page | apps/status | Next.js 15 |
| Changelog | apps/changelog | Next.js 15 |

## Infrastructure (migrating to Crontech)

Current: Cloudflare Pages + Workers, Fly.io (MTA + WebSocket), Modal (GPU), Neon (Postgres), Upstash (Redis)

Target: **All on Crontech bare metal.** No external vendor dependency except payment processor.

- Web/API: Crontech deploy service
- MTA (SMTP): Crontech email service
- Storage: Crontech object storage (R2 replacement)
- DNS: Crontech DNS
- WebSocket (CRDT collab): Crontech long-lived process hosting
- GPU (voice profile training): Modal stays until Crontech GPU tier is live

## Compute Tiers

```
CLIENT GPU (WebGPU)     EDGE (Workers/Crontech)     CLOUD (Modal/Crontech GPU)
$0/token                 sub-50ms                     Full Opus power
grammar, triage          compose, translate            voice profile training
41 tok/sec in browser    lightweight inference         batch AI jobs
```

## CI/CD

1. Push to Gluecron repo
2. GateTest gates the PR (lint + typecheck + build + tests)
3. On merge: Gluecron fires deploy webhook to Crontech
4. Crontech rolling update, zero downtime
5. Flywheel telemetry emitted on deploy complete

## Performance Targets

- Inbox load: < 100ms (IndexedDB local cache)
- API p99: < 200ms
- AI compose first token: < 500ms (Haiku edge)
- Search results: < 50ms (Meilisearch local index)
