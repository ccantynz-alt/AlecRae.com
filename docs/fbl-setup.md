# ISP Feedback Loop (FBL) Registration Guide

This document explains how to register for Feedback Loops with major ISPs so that alecrae receives complaint notifications when recipients mark emails as spam.

## Why FBL Matters

When a recipient clicks "Report Spam," the ISP can send an ARF (Abuse Reporting Format, RFC 5965) report back to us. Without FBL registration, we have no visibility into complaints, which damages sender reputation over time.

**Target:** Keep complaint rate below 0.1% (1 per 1,000 delivered emails).

---

## Gmail (Google Postmaster Tools)

1. Go to [Google Postmaster Tools](https://postmaster.google.com)
2. Sign in with a Google account that manages your sending domain
3. Click **Add Domain** and enter your sending domain (e.g., `example.com`)
4. Verify domain ownership by adding the TXT record Google provides to your DNS
5. Once verified, Gmail surfaces complaint data (spam rate, IP reputation, domain reputation) in the Postmaster dashboard
6. Gmail does not send traditional ARF reports. Instead, monitor the Postmaster Tools dashboard and API for spam rate signals
7. Ensure you include a `List-Unsubscribe` header (RFC 8058) on all bulk/marketing emails -- Gmail requires this for bulk senders (5,000+ messages/day)

**Note:** Gmail's FBL data is aggregated, not per-complaint. The Postmaster Tools API can be polled for daily statistics.

---

## Yahoo / AOL (Yahoo CFL Program)

1. Go to [Yahoo Sender Hub](https://senders.yahooinc.com/contact)
2. Submit a Complaint Feedback Loop (CFL) enrollment request
3. Provide your `abuse@{yourdomain}` email address where ARF reports should be delivered
4. Yahoo will verify domain ownership (typically via DNS TXT record or email to postmaster@)
5. Once approved, Yahoo sends individual ARF reports for each complaint to your registered abuse address

**ARF delivery:** Reports are sent as standard RFC 5965 multipart/report messages to your abuse@ mailbox. Configure your inbound processor to parse and forward these to `POST /v1/fbl/report`.

---

## Microsoft (SNDS + JMRP)

1. Go to [Smart Network Data Services (SNDS)](https://sendersupport.olc.protection.outlook.com/snds/)
2. Sign in with a Microsoft account
3. Register your sending IP ranges
4. Request access to the **Junk Mail Reporting Program (JMRP)** from the SNDS dashboard
5. Provide your notification email address for complaint reports
6. Microsoft sends ARF reports via JMRP when Outlook.com/Hotmail users report spam

**IP ranges:** You must register each IP or CIDR block you send from. Update this whenever you add new sending IPs.

---

## Comcast

1. Contact Comcast's postmaster team via their [feedback loop portal](https://postmaster.comcast.net)
2. Register your sending domain and IP ranges
3. Provide an abuse@ contact address
4. Comcast sends standard ARF reports for complaints from their subscribers

---

## General Setup (All ISPs)

### 1. Create an abuse@ mailbox

Set up `abuse@{yourdomain}` for every sending domain. This is required by RFC 2142 and most ISP FBL programs.

### 2. Configure ARF parsing

All incoming ARF reports to your abuse@ address should be forwarded to the alecrae FBL endpoint:

```
POST /v1/fbl/report
Content-Type: multipart/report; report-type=feedback-report
```

Alternatively, forward as JSON:

```json
{
  "originalMailFrom": "sender@example.com",
  "originalRcptTo": "recipient@gmail.com",
  "feedbackType": "abuse",
  "sourceIp": "203.0.113.1"
}
```

### 3. Monitor complaint rates

Use the complaint rate monitoring endpoint or check the reputation service health:

- Healthy: < 0.1% complaint rate (7-day window)
- Warning: 0.1% - 0.5% -- sending volume auto-throttled by 50%
- Critical: > 0.5% -- review required, sending may be suspended

### 4. DNS records

Add an `abuse@` mailbox entry and ensure your domain has:
- Valid SPF record
- DKIM signing enabled
- DMARC policy published (at minimum `p=none` with `rua=` aggregate reporting)

---

## Architecture

```
ISP (Gmail/Yahoo/Microsoft)
    |
    | ARF Report (RFC 5965)
    v
abuse@{domain} mailbox
    |
    | Forwarded via inbound processor
    v
POST /v1/fbl/report
    |
    +-- Parse ARF multipart
    +-- Add to suppression list (reason: complaint)
    +-- Log event (type: email.complained)
    +-- Check complaint rate
    +-- Auto-throttle if rate > 0.1%
```
