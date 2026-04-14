#!/usr/bin/env bash
# ─── AlecRae.com DNS Setup for Cloudflare ──────────────────────────────────────
#
# This script configures ALL DNS records needed for alecrae.com
# Run ONCE after adding the domain to Cloudflare.
#
# Prerequisites:
#   - alecrae.com added to Cloudflare
#   - CLOUDFLARE_API_TOKEN set (with DNS edit permissions)
#   - CLOUDFLARE_ZONE_ID set (from Cloudflare dashboard → Overview → Zone ID)
#
# Usage:
#   export CLOUDFLARE_API_TOKEN=your_token
#   export CLOUDFLARE_ZONE_ID=your_zone_id
#   bash infrastructure/cloudflare/setup-dns.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

API="https://api.cloudflare.com/client/v4"
ZONE="${CLOUDFLARE_ZONE_ID:?Set CLOUDFLARE_ZONE_ID}"
TOKEN="${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"

# Server IPs — replace with your actual server IPs when provisioned
API_SERVER_IP="${API_SERVER_IP:-YOUR_API_SERVER_IP}"
MTA_SERVER_IP="${MTA_SERVER_IP:-YOUR_MTA_SERVER_IP}"
WEB_PAGES_CNAME="${WEB_PAGES_CNAME:-alecrae-web.pages.dev}"

add_record() {
  local type="$1" name="$2" content="$3" proxied="${4:-true}" priority="${5:-}"

  local data="{\"type\":\"$type\",\"name\":\"$name\",\"content\":\"$content\",\"proxied\":$proxied,\"ttl\":1"
  if [ -n "$priority" ]; then
    data="$data,\"priority\":$priority"
  fi
  data="$data}"

  echo "  Adding $type $name → $content (proxied=$proxied)"
  curl -s -X POST "$API/zones/$ZONE/dns_records" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$data" | jq -r '.success // .errors[0].message'
}

echo "═══════════════════════════════════════════════"
echo "  AlecRae.com — DNS Configuration"
echo "═══════════════════════════════════════════════"
echo ""

# ─── Web App (Cloudflare Pages) ─────────────────────────────────────────────
echo "▸ Web app records..."
add_record "CNAME" "alecrae.com" "$WEB_PAGES_CNAME" "true"
add_record "CNAME" "mail" "$WEB_PAGES_CNAME" "true"
add_record "CNAME" "admin" "$WEB_PAGES_CNAME" "true"
add_record "CNAME" "www" "alecrae.com" "true"

# ─── API Server ─────────────────────────────────────────────────────────────
echo "▸ API records..."
add_record "A" "api" "$API_SERVER_IP" "true"

# ─── MTA / SMTP (MUST NOT be proxied — Cloudflare doesn't proxy SMTP) ──────
echo "▸ MTA/SMTP records (not proxied)..."
add_record "A" "smtp" "$MTA_SERVER_IP" "false"
add_record "A" "mx1" "$MTA_SERVER_IP" "false"
add_record "A" "mx2" "$MTA_SERVER_IP" "false"

# ─── MX Records (email routing) ─────────────────────────────────────────────
echo "▸ MX records..."
add_record "MX" "alecrae.com" "mx1.alecrae.com" "false" "10"
add_record "MX" "alecrae.com" "mx2.alecrae.com" "false" "20"

# ─── SPF Record ─────────────────────────────────────────────────────────────
echo "▸ SPF record..."
add_record "TXT" "alecrae.com" "v=spf1 ip4:$MTA_SERVER_IP include:amazonses.com ~all" "false"

# ─── DMARC Record ───────────────────────────────────────────────────────────
echo "▸ DMARC record..."
add_record "TXT" "_dmarc" "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@alecrae.com; ruf=mailto:dmarc-forensic@alecrae.com; adkim=r; aspf=r; pct=100" "false"

# ─── DKIM (placeholder — real key generated at runtime by the platform) ─────
echo "▸ DKIM placeholder..."
add_record "TXT" "default._domainkey" "v=DKIM1; k=rsa; p=REPLACE_WITH_GENERATED_PUBLIC_KEY" "false"

# ─── Return-Path / Bounce Domain ────────────────────────────────────────────
echo "▸ Bounce/return-path records..."
add_record "CNAME" "bounce" "smtp.alecrae.com" "false"

# ─── CAA Record (authorize SSL certificate issuance) ─────────────────────────
echo "▸ CAA record..."
add_record "CAA" "alecrae.com" "0 issue \"letsencrypt.org\"" "false"
add_record "CAA" "alecrae.com" "0 issue \"digicert.com\"" "false"

# ─── SRV Records (autodiscover for email clients) ────────────────────────────
echo "▸ Autodiscover SRV records..."
# These help Thunderbird/Outlook auto-configure email settings
# _submission._tcp → SMTP submission (port 587)
# _imaps._tcp → IMAP over TLS (port 993)
curl -s -X POST "$API/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"SRV\",\"name\":\"_submission._tcp.alecrae.com\",\"data\":{\"service\":\"_submission\",\"proto\":\"_tcp\",\"name\":\"alecrae.com\",\"priority\":0,\"weight\":1,\"port\":587,\"target\":\"smtp.alecrae.com\"},\"ttl\":1}" | jq -r '.success // .errors[0].message'

curl -s -X POST "$API/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"SRV\",\"name\":\"_imaps._tcp.alecrae.com\",\"data\":{\"service\":\"_imaps\",\"proto\":\"_tcp\",\"name\":\"alecrae.com\",\"priority\":0,\"weight\":1,\"port\":993,\"target\":\"smtp.alecrae.com\"},\"ttl\":1}" | jq -r '.success // .errors[0].message'

echo ""
echo "═══════════════════════════════════════════════"
echo "  DNS setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Replace YOUR_API_SERVER_IP and YOUR_MTA_SERVER_IP"
echo "     with actual server IPs after provisioning"
echo "  2. Deploy the web app to Cloudflare Pages"
echo "  3. Generate DKIM keys via the platform and update"
echo "     the default._domainkey TXT record"
echo "  4. Wait for DNS propagation (usually <5 min on CF)"
echo "  5. Test: dig MX alecrae.com"
echo "  6. Test: dig TXT alecrae.com"
echo "═══════════════════════════════════════════════"
