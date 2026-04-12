import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | AlecRae",
  description: "Acceptable Use Policy for the AlecRae AI-native email infrastructure platform.",
};

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <Box className="mb-10">
      <Text as="h2" className="text-xl font-bold text-content mb-4">
        {number}. {title}
      </Text>
      <Box className="space-y-3 text-content-secondary leading-relaxed">{children}</Box>
    </Box>
  );
}

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box className="ml-6 mb-2">
      <Text as="span" className="font-semibold text-content">{label} </Text>
      <Text as="span">{children}</Text>
    </Box>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <Box className="ml-6 mb-1 flex gap-2">
      <Text as="span" className="text-content-tertiary select-none" aria-hidden="true">&#x2022;</Text>
      <Text as="span">{children}</Text>
    </Box>
  );
}

export default function AcceptableUsePage() {
  return (
    <Box className="max-w-4xl mx-auto">
      <Box className="mb-10">
        <Text as="h1" className="text-3xl font-bold text-content mb-2">Acceptable Use Policy</Text>
        <Text className="text-content-tertiary">Effective Date: April 1, 2026 | Last Updated: April 1, 2026</Text>
      </Box>

      <Card className="mb-8 border-red-500/30 bg-red-500/5">
        <CardContent className="p-4">
          <Text className="font-semibold text-red-600">
            Violations of this policy may result in immediate account suspension or termination without refund. AlecRae actively monitors all sending activity using AI-based automated enforcement systems.
          </Text>
        </CardContent>
      </Card>

      <Section number="1" title="Purpose">
        <Text>This Acceptable Use Policy (&quot;AUP&quot;) governs acceptable use of the AlecRae platform and all associated services. This AUP supplements our Terms of Service and applies to all users, including those using the API or SDK. AlecRae&apos;s mission is to maintain the highest deliverability and reputation standards for all customers. Violations by any single user can damage the platform&apos;s shared infrastructure and reputation, impacting all users.</Text>
        <Text>AlecRae reserves the right to determine, in its sole discretion, whether any use violates this AUP and to take action accordingly, including suspension or termination of the offending account.</Text>
      </Section>

      <Section number="2" title="Prohibited Content">
        <Text>You must not use the Service to send, store, or distribute any of the following:</Text>
        <Sub label="(a) Spam.">Unsolicited bulk email or unsolicited commercial email sent to recipients who have not provided affirmative consent.</Sub>
        <Sub label="(b) Phishing and Spoofing.">Emails designed to fraudulently obtain personal information, credentials, or financial data through deception. Emails that impersonate another person, organization, or service.</Sub>
        <Sub label="(c) Malware.">Emails containing viruses, trojans, ransomware, spyware, worms, or any other malicious software, or links to sites distributing such software.</Sub>
        <Sub label="(d) Illegal Content.">Content that violates any applicable law, including but not limited to content promoting illegal activities, drug trafficking, weapons trafficking, or human trafficking.</Sub>
        <Sub label="(e) Harassment.">Threats, intimidation, stalking, hate speech, or content intended to harass, abuse, or harm any individual or group.</Sub>
        <Sub label="(f) Fraud.">Advance-fee scams, lottery/prize scams, investment fraud, identity theft schemes, or any content designed to deceive recipients for financial gain.</Sub>
        <Sub label="(g) Impersonation.">Falsely representing yourself as another individual, company, or organization, including AlecRae or its employees.</Sub>
        <Sub label="(h) Child Safety Violations.">Any content that exploits, endangers, or sexualizes minors, or that distributes adult content to individuals under 18.</Sub>
        <Sub label="(i) Pyramid and MLM Schemes.">Content promoting pyramid schemes, multi-level marketing schemes with primary emphasis on recruitment, or Ponzi schemes.</Sub>
        <Sub label="(j) Counterfeit Goods.">Marketing or selling counterfeit, pirated, or stolen goods or services.</Sub>
      </Section>

      <Section number="3" title="Prohibited Sending Practices">
        <Text>The following sending practices are strictly prohibited:</Text>
        <Sub label="(a)">Using purchased, rented, borrowed, scraped, harvested, or appended email lists. All recipients must have provided consent directly to you.</Sub>
        <Sub label="(b)">Dictionary attacks — sending to programmatically generated email addresses to discover valid addresses.</Sub>
        <Sub label="(c)">Snowshoe spamming — distributing sending volume across many IPs, domains, or accounts to evade detection and reputation systems.</Sub>
        <Sub label="(d)">Using deceptive, misleading, or false information in email headers, From addresses, Reply-To addresses, or subject lines.</Sub>
        <Sub label="(e)">Sending commercial or marketing email without a clearly visible, functional, and easy-to-use unsubscribe mechanism.</Sub>
        <Sub label="(f)">Appending email addresses to mailing lists without the explicit, verifiable consent of each individual address owner.</Sub>
        <Sub label="(g)">Using open relays, open proxies, or compromised third-party systems to send email through the Service.</Sub>
        <Sub label="(h)">Sending to role-based addresses (e.g., info@, admin@, webmaster@) for marketing purposes without explicit consent from a named individual.</Sub>
        <Sub label="(i)">Creating multiple accounts or using multiple domains to circumvent sending quotas, rate limits, or enforcement actions.</Sub>
        <Sub label="(j)">Deliberately sending to known invalid addresses to test or probe the platform&apos;s bounce handling.</Sub>
      </Section>

      <Section number="4" title="Anti-Spam Compliance">
        <Text>You must comply with all applicable anti-spam legislation in every jurisdiction where your recipients are located. At a minimum:</Text>

        <Text className="font-semibold text-content mt-4">CAN-SPAM Act (United States):</Text>
        <Bullet>Include a valid physical postal address in every commercial email.</Bullet>
        <Bullet>Clearly identify the message as an advertisement or solicitation where required.</Bullet>
        <Bullet>Use honest, non-deceptive subject lines that reflect the content of the message.</Bullet>
        <Bullet>Include a clear and conspicuous opt-out mechanism that processes requests within 10 business days.</Bullet>
        <Bullet>Monitor and be responsible for sending performed by any third party on your behalf.</Bullet>

        <Text className="font-semibold text-content mt-4">GDPR (European Union / EEA / UK):</Text>
        <Bullet>Obtain explicit, freely given, specific, informed, and unambiguous consent before sending marketing email to individuals in the EEA/UK.</Bullet>
        <Bullet>Maintain auditable records of consent, including when, how, and what the individual consented to.</Bullet>
        <Bullet>Provide a mechanism for easy withdrawal of consent that is as simple as the mechanism used to provide consent.</Bullet>
        <Bullet>Honor data subject rights including access, rectification, erasure, and portability.</Bullet>

        <Text className="font-semibold text-content mt-4">CASL (Canada):</Text>
        <Bullet>Obtain express consent (with proper disclosure of sender identity and purpose) before sending commercial electronic messages to Canadian recipients.</Bullet>
        <Bullet>Include prescribed identification information and a functional unsubscribe mechanism.</Bullet>
        <Bullet>Understand and comply with implied consent limitations and expiration periods (6 months for inquiries, 24 months for existing business relationships).</Bullet>

        <Text className="font-semibold text-content mt-4">Recommended Best Practice:</Text>
        <Bullet>Use confirmed opt-in (double opt-in) for all mailing lists. While not legally required in all jurisdictions, confirmed opt-in provides the strongest evidence of consent and significantly reduces spam complaints and deliverability issues.</Bullet>
      </Section>

      <Section number="5" title="Authentication Requirements">
        <Text>All sending domains must maintain proper email authentication. Failure to maintain authentication may result in immediate suspension of sending privileges.</Text>
        <Sub label="(a) SPF.">You MUST publish a valid SPF record for every domain used to send email through the Service that authorizes AlecRae&apos;s sending infrastructure.</Sub>
        <Sub label="(b) DKIM.">All outbound email MUST be signed with a valid DKIM signature using keys provisioned by the Service.</Sub>
        <Sub label="(c) DMARC.">You MUST publish a DMARC policy for every sending domain (minimum p=none for initial setup, with a path toward p=quarantine or p=reject).</Sub>
        <Sub label="(d) Domain Verification.">You MUST use only verified sending domains. Sending from unverified domains is prohibited.</Sub>
        <Sub label="(e) Reverse DNS.">Sending IPs must have valid reverse DNS (PTR) records. AlecRae manages this for shared IPs; dedicated IP customers must verify reverse DNS configuration.</Sub>
        <Sub label="(f) Automated Configuration.">AlecRae provides automated authentication configuration. If you opt out of automated configuration, you assume full responsibility for maintaining valid records.</Sub>
      </Section>

      <Section number="6" title="List Hygiene Requirements">
        <Text>Maintaining clean mailing lists is essential for platform deliverability. You must:</Text>
        <Sub label="(a)">Remove hard-bounced email addresses immediately after the first hard bounce. Continued sending to hard-bounced addresses is grounds for suspension.</Sub>
        <Sub label="(b)">Remove soft-bounced email addresses after three (3) consecutive soft bounce failures within a 30-day period.</Sub>
        <Sub label="(c)">Process and honor unsubscribe requests within 24 hours for automated systems, or within 10 business days for manual processing. AlecRae provides automated unsubscribe handling — use it.</Sub>
        <Sub label="(d)">Maintain a global suppression list that includes all unsubscribed, bounced, and complained addresses. Never re-add suppressed addresses without fresh, verifiable consent.</Sub>
        <Sub label="(e)">Conduct regular list cleaning at minimum quarterly intervals, removing inactive subscribers and invalid addresses.</Sub>
        <Sub label="(f)">Implement engagement-based sunsetting: remove recipients who have not opened or clicked any email in 12 months, or conduct a re-permission campaign before continuing to send.</Sub>
        <Sub label="(g)">Never re-activate suppressed email addresses without obtaining new, verifiable, explicit consent from the address owner.</Sub>
      </Section>

      <Section number="7" title="Rate Limiting and Throttling">
        <Sub label="(a)">You must respect all platform-imposed sending limits as defined by your subscription plan and any additional limits applied by the platform.</Sub>
        <Sub label="(b)">You must not circumvent rate limits or throttling through any means, including distributing sends across multiple accounts, using multiple API keys, or manipulating request timing.</Sub>
        <Sub label="(c)">Domain-based and IP-based sending limits may be applied independently of account-level limits to protect shared infrastructure reputation.</Sub>
        <Sub label="(d)">Burst sending (sending a high volume in a very short period) may be automatically throttled to protect deliverability.</Sub>
        <Sub label="(e)">New accounts and newly verified domains are subject to warm-up sending limits that gradually increase over time. Do not attempt to bypass warm-up limits.</Sub>
      </Section>

      <Section number="8" title="Network Security">
        <Text>You must not use the Service to conduct or facilitate any of the following:</Text>
        <Sub label="(a)">Port scanning, network enumeration, or network reconnaissance of AlecRae infrastructure or any third-party systems.</Sub>
        <Sub label="(b)">Vulnerability testing, penetration testing, or security testing of the Service without prior written authorization from AlecRae. Report vulnerabilities responsibly to security@alecrae.dev.</Sub>
        <Sub label="(c)">Distributed denial of service (DDoS) attacks, traffic flooding, or any activity intended to disrupt the availability of the Service or any third-party service.</Sub>
        <Sub label="(d)">IP address spoofing, ARP spoofing, or DNS spoofing.</Sub>
        <Sub label="(e)">Unauthorized interception, monitoring, or collection of network traffic.</Sub>
        <Sub label="(f)">Exploitation of any vulnerability in the Service. If you discover a vulnerability, you must report it immediately to security@alecrae.dev and must not exploit or disclose it.</Sub>
      </Section>

      <Section number="9" title="AI System Integrity">
        <Card className="mb-4 border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4">
            <Text className="font-semibold text-blue-600">
              Attacks on our AI systems threaten the security of all users. Violations of this section may result in immediate termination and referral to law enforcement.
            </Text>
          </CardContent>
        </Card>
        <Sub label="(a)">You must not conduct adversarial attacks against spam classifiers, phishing detectors, or any other AI-based security system, including crafting content specifically designed to evade detection.</Sub>
        <Sub label="(b)">You must not attempt to poison, corrupt, or manipulate AI training data by sending content designed to influence model behavior.</Sub>
        <Sub label="(c)">You must not reverse engineer, extract, distill, or otherwise attempt to derive the architecture, weights, training data, or decision boundaries of any AI model used by the Service.</Sub>
        <Sub label="(d)">You must not use AI composition features to generate phishing emails, social engineering content, fraudulent communications, or any deceptive content.</Sub>
        <Sub label="(e)">You must not conduct automated probing, enumeration, or testing to determine AI classification thresholds, confidence scores, or decision boundaries.</Sub>
        <Sub label="(f)">You must not exploit AI features to bypass content policies, rate limits, or any other platform restrictions.</Sub>
      </Section>

      <Section number="10" title="Monitoring and Enforcement">
        <Text>AlecRae actively monitors all email traffic for compliance with this AUP. By using the Service, you acknowledge and consent to this monitoring.</Text>
        <Sub label="(a) Automated Monitoring.">AI-based systems continuously analyze outbound email for content policy violations, sending pattern anomalies, bounce rate spikes, complaint rate increases, and authentication failures.</Sub>
        <Sub label="(b) Graduated Enforcement.">For most violations, AlecRae follows a graduated enforcement process:</Sub>
        <Box className="ml-12 space-y-1">
          <Text><Text as="span" className="font-semibold">Step 1:</Text> Written warning with 48-hour remediation window.</Text>
          <Text><Text as="span" className="font-semibold">Step 2:</Text> Sending volume throttled to 50% of plan limits.</Text>
          <Text><Text as="span" className="font-semibold">Step 3:</Text> Sending suspended pending review and remediation plan.</Text>
          <Text><Text as="span" className="font-semibold">Step 4:</Text> Account terminated.</Text>
        </Box>
        <Sub label="(c) Immediate Termination.">AlecRae reserves the right to bypass the graduated process and immediately terminate accounts engaged in phishing, malware distribution, fraud, child exploitation, or any activity posing an immediate threat to platform infrastructure or users.</Sub>
        <Sub label="(d) Discretion.">AlecRae reserves the right to skip steps in the graduated process based on the severity, intent, and impact of the violation.</Sub>
      </Section>

      <Section number="11" title="Bounce and Complaint Thresholds">
        <Text>You must maintain sending metrics within the following thresholds:</Text>
        <Box className="ml-6 my-4">
          <Card>
            <CardContent className="p-4">
              <Box className="grid grid-cols-2 gap-4">
                <Box>
                  <Text className="font-semibold text-content">Hard Bounce Rate</Text>
                  <Text className="text-red-600 font-bold text-lg">Below 2%</Text>
                </Box>
                <Box>
                  <Text className="font-semibold text-content">Complaint Rate</Text>
                  <Text className="text-red-600 font-bold text-lg">Below 0.1%</Text>
                </Box>
                <Box>
                  <Text className="font-semibold text-content">Spam Trap Hits</Text>
                  <Text className="text-red-600 font-bold text-lg">Zero Tolerance</Text>
                </Box>
                <Box>
                  <Text className="font-semibold text-content">Unsubscribe Rate</Text>
                  <Text className="text-amber-600 font-bold text-lg">Monitor if above 1%</Text>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
        <Sub label="(a)">Exceeding any threshold triggers automatic throttling of your sending volume.</Sub>
        <Sub label="(b)">Persistent violations (three or more incidents within a 30-day period) result in account suspension pending review.</Sub>
        <Sub label="(c)">Spam trap hits indicate fundamental list quality issues. Any spam trap hit will be investigated and may result in immediate suspension.</Sub>
        <Sub label="(d)">You are responsible for monitoring your own metrics via the analytics dashboard and taking corrective action before thresholds are reached.</Sub>
      </Section>

      <Section number="12" title="Reporting Abuse">
        <Text>To report violations of this AUP or any abuse originating from the AlecRae platform:</Text>
        <Box className="ml-6 mt-2 space-y-1">
          <Text>Email: abuse@alecrae.dev</Text>
          <Text>Include: full email headers, message content, timestamps, and any other relevant evidence.</Text>
        </Box>
        <Text className="mt-3">AlecRae will investigate all reports within 24 hours of receipt. Reporter identity is kept confidential. AlecRae participates in feedback loops (FBLs) with all major ISPs and processes complaints automatically.</Text>
      </Section>

      <Section number="13" title="Consequences of Violation">
        <Sub label="(a)">Immediate suspension or termination of sending privileges and/or account access.</Sub>
        <Sub label="(b)">No refund of prepaid fees for accounts terminated due to AUP violations.</Sub>
        <Sub label="(c)">Data retained for 30 days post-termination for legal and compliance purposes, then permanently deleted.</Sub>
        <Sub label="(d)">AlecRae reserves the right to report violations to law enforcement, regulatory authorities, and industry anti-abuse organizations including MAAWG (Messaging, Malware, and Mobile Anti-Abuse Working Group), Spamhaus, and relevant ISP abuse teams.</Sub>
        <Sub label="(e)">Domains and IPs associated with terminated accounts may be permanently blocklisted from the platform.</Sub>
        <Sub label="(f)">AlecRae may seek damages and injunctive relief for violations that cause harm to the platform, its infrastructure, or its users.</Sub>
      </Section>

      <Section number="14" title="ISP-Specific Requirements">
        <Text>In addition to general anti-spam compliance, you must comply with the sender requirements published by major mailbox providers:</Text>
        <Sub label="(a) Google.">Comply with Google&apos;s Email Sender Guidelines, including bulk sender requirements for senders of 5,000+ messages per day to Gmail (one-click unsubscribe, DMARC authentication, low spam rate).</Sub>
        <Sub label="(b) Yahoo/AOL.">Comply with Yahoo Sender Best Practices and AOL Postmaster guidelines, including authentication and complaint rate requirements.</Sub>
        <Sub label="(c) Microsoft.">Comply with Microsoft&apos;s Outlook.com Postmaster guidelines and participate in SNDS (Smart Network Data Services) and JMRP (Junk Mail Reporting Program) where applicable.</Sub>
        <Sub label="(d) List-Unsubscribe.">All marketing and bulk email MUST include both List-Unsubscribe and List-Unsubscribe-Post headers per RFC 8058, supporting one-click unsubscribe.</Sub>
      </Section>

      <Section number="15" title="Cooperation and Accountability">
        <Sub label="(a)">You must cooperate fully with any AlecRae investigation into potential AUP violations, including providing information about your sending practices, list sources, and consent records within 48 hours of request.</Sub>
        <Sub label="(b)">You must respond to abuse complaints forwarded by AlecRae within 48 hours and take corrective action as directed.</Sub>
        <Sub label="(c)">You must implement corrective measures recommended or required by AlecRae within the specified timeframe.</Sub>
        <Sub label="(d)">Failure to cooperate with investigations or implement corrective measures constitutes an independent ground for immediate account termination.</Sub>
        <Sub label="(e)">You acknowledge that your sending practices affect the deliverability and reputation of all AlecRae users on shared infrastructure, and you accept responsibility for maintaining sending practices that protect the platform community.</Sub>
      </Section>

      <Box className="mt-12 pt-6 border-t border-border">
        <Text className="text-content-tertiary text-sm">
          Questions about this Acceptable Use Policy should be directed to abuse@alecrae.dev or legal@alecrae.dev. This policy is reviewed and updated regularly to address evolving threats and regulatory requirements.
        </Text>
      </Box>
    </Box>
  );
}
