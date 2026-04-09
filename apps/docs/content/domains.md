# Domains

To send from `you@yourdomain.com`, you must verify ownership of `yourdomain.com` and prove that Vienna is allowed to send mail on its behalf.

## Add a domain

```bash
POST /v1/domains
```

```json
{ "domain": "yourdomain.com", "region": "us" }
```

The response includes the DNS records you need to add.

## Required DNS records

| Type | Name | Value |
|---|---|---|
| TXT | `yourdomain.com` | `v=spf1 include:_spf.48co.ai ~all` |
| TXT | `vienna._domainkey.yourdomain.com` | `v=DKIM1; k=rsa; p=...` |
| TXT | `_dmarc.yourdomain.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com` |
| MX | `yourdomain.com` | (only if receiving inbound) |

## Verify

```bash
POST /v1/domains/{domain_id}/verify
```

Vienna checks DNS, validates SPF/DKIM signatures, and marks the domain as `verified` once everything aligns. Most propagations complete within 5 minutes.

## Tracking subdomains

Vienna can rewrite links and pixels for open and click tracking. To avoid the deliverability cost of using `48co.ai` URLs, point a `CNAME` like `track.yourdomain.com → t.48co.ai` and set it as your tracking host.

## Removing a domain

```bash
DELETE /v1/domains/{domain_id}
```

Pending and queued messages from that domain are cancelled immediately.
