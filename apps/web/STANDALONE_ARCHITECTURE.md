# AlecRae.com — Standalone Architecture

## Stack Decision

**Framework: Astro** (not Next.js)

Astro ships zero JavaScript by default, uses islands architecture for interactive components, and achieves 100 Lighthouse scores out of the box. For a personal/marketing site, this is the correct choice — Next.js adds overhead we don't need.

- Static pages: About, Products, Blog index — generated at build time
- SSR routes: Blog posts (for dynamic OG images), Contact form, Analytics ingestion
- Islands: Newsletter signup, Contact form, Product status widgets

## Runtime and Build

- **Runtime:** Bun v1.x
- **Build:** `bun run build` via Turbo pipeline
- **Package manager:** Bun
- **TypeScript:** Strict mode

## Database

PostgreSQL 16 via Drizzle ORM. Stores:
- Blog post metadata (slug, title, publish date, tags, engagement scores)
- Contact form submissions
- Analytics events (privacy-first, first-party only)
- Flywheel telemetry

## Deployment

Hosted on **Crontech bare metal**, NOT Vercel.

```
Push to main on Gluecron
  -> Gluecron fires POST to Crontech /api/v1/deploy
  -> GateTest gate check must pass (lint + typecheck + build)
  -> Crontech pulls new Docker image
  -> Zero-downtime rolling update via Caddy
  -> Flywheel telemetry event emitted
```

Docker image: `ghcr.io/ccantynz-alt/alecrae.com:latest`
Caddy serves: `alecrae.com` and `www.alecrae.com` with automatic HTTPS

## Performance Strategy

| Target | Value |
|--------|-------|
| LCP | < 1000ms |
| TTFB | < 50ms |
| CLS | 0 |
| Lighthouse | 100 |

How:
- All images: WebP + AVIF, lazy loaded, explicit dimensions
- Fonts: Self-hosted, `font-display: swap`, preloaded
- CSS: Tailwind purged at build time, inlined critical CSS
- No client JS on static pages
- Caddy: brotli compression, HTTP/3, aggressive cache headers for assets

## Analytics

**Plausible Analytics** (self-hosted on Crontech).

- No cookies, no cross-site tracking
- GDPR compliant by design
- Events feed into the AI flywheel via server-side ingestion

## AI Features on Site

1. **Blog Q&A widget** — readers can ask questions about a blog post; Claude answers using the post as context
2. **Product recommender** — "Which product is right for me?" quiz powered by Claude Haiku
3. **Contact enrichment** — contact form submissions get AI-classified by inquiry type before hitting the inbox

All AI features use streaming responses and are implemented as Astro SSR endpoints calling the Claude API directly.

## CI/CD

- **Lint:** `bun run lint` (ESLint + Prettier check)
- **Typecheck:** `bun run typecheck`
- **Build:** `bun run build` (Astro build)
- **Gate:** GateTest must pass before Crontech deploys
- **Pipeline:** Woodpecker CI on Crontech (migrating from GitHub Actions)
