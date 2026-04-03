import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@emailed/ui";

export const metadata: Metadata = {
  title: "Privacy Policy | Emailed",
  description: "Privacy Policy for the Emailed AI-native email infrastructure platform.",
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

export default function PrivacyPage() {
  return (
    <Box className="max-w-4xl mx-auto">
      <Box className="mb-10">
        <Text as="h1" className="text-3xl font-bold text-content mb-2">Privacy Policy</Text>
        <Text className="text-content-tertiary">Effective Date: April 1, 2026 | Last Updated: April 1, 2026</Text>
      </Box>

      <Section number="1" title="Introduction">
        <Text>Emailed, Inc. (&quot;Emailed,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), located at 548 Market Street, Suite 45000, San Francisco, CA 94104, is the data controller for personal data processed through the Emailed platform.</Text>
        <Text>This Privacy Policy explains how we collect, use, share, and protect your personal information when you use our website, platform, API, mobile applications, and all associated services (collectively, the &quot;Service&quot;). It applies to all users worldwide, with additional provisions for users in the European Economic Area (EEA), United Kingdom (UK), California, and other jurisdictions with specific privacy requirements.</Text>
        <Text>By using the Service, you acknowledge that you have read and understood this Privacy Policy. If you are using the Service on behalf of an organization, you confirm that you are authorized to agree to this policy on the organization&apos;s behalf.</Text>
      </Section>

      <Section number="2" title="Information We Collect">
        <Sub label="(a) Account Information.">Name, email address, organization name, job title, billing address, and phone number provided during registration. Passwords are never stored in plaintext — only cryptographic hashes using industry-standard algorithms (scrypt/Argon2).</Sub>
        <Sub label="(b) Email Content and Metadata.">When you use the Service to send, receive, or store email, we process: sender and recipient addresses, subject lines, email body content (text and HTML), attachments, email headers (including Received, Message-ID, Date, MIME-Version, Content-Type), timestamps, IP addresses of sending and receiving servers, delivery status information, and bounce/complaint notifications.</Sub>
        <Sub label="(c) Domain and DNS Data.">Domain names, DNS records (SPF, DKIM, DMARC, MX, CNAME, TXT), domain verification status, DKIM keys, and authentication configuration.</Sub>
        <Sub label="(d) Usage Data.">Login timestamps, features accessed, pages viewed, API calls made (endpoints, parameters, response codes), search queries, UI interactions, session duration, and feature adoption metrics.</Sub>
        <Sub label="(e) Device and Technical Data.">Browser type and version, operating system, screen resolution, language preference, time zone, IP address, and approximate geolocation (city/country level) derived from IP address.</Sub>
        <Sub label="(f) AI-Derived Data.">Our AI systems generate derived data from your email content, including: priority scores for incoming emails, sentiment analysis results, relationship strength scores between you and your contacts, communication pattern data (frequency, response times, reciprocity), writing style models that capture your tone and vocabulary patterns, threat assessment scores, and spam confidence scores. This data is generated automatically and stored separately from your raw email content.</Sub>
        <Sub label="(g) Payment Information.">Payment processing is handled by Stripe, Inc. We do not store full credit card numbers, CVVs, or bank account details. We retain only the last four digits of your card number, card brand, expiration date, and billing address for record-keeping.</Sub>
      </Section>

      <Section number="3" title="How We Use Your Information">
        <Text>We use the information we collect for the following purposes:</Text>
        <Sub label="(a) Service Delivery.">Processing, delivering, and storing your emails; managing your domains and authentication; providing API access; maintaining your account.</Sub>
        <Sub label="(b) AI-Powered Email Security.">Automatically classifying inbound email as legitimate, spam, or phishing using AI models. Detecting malware, threats, and suspicious content. These functions are essential to the Service and protect all users.</Sub>
        <Sub label="(c) AI Priority and Organization.">Ranking incoming emails by importance, threading conversations, and surfacing time-sensitive messages.</Sub>
        <Sub label="(d) AI Relationship Intelligence.">Building communication graphs that map your relationships, track interaction frequency, and identify important contacts. Detecting follow-up opportunities and communication patterns.</Sub>
        <Sub label="(e) AI Sentiment Analysis.">Analyzing the emotional tone of emails to detect urgency, frustration, or positivity in communications.</Sub>
        <Sub label="(f) AI Writing Assistance.">Learning your writing style to provide personalized draft suggestions, tone adjustments, and subject line recommendations.</Sub>
        <Sub label="(g) AI Threat Detection.">Scanning URLs, attachments, and content patterns for known and emerging threats in real time.</Sub>
        <Sub label="(h) Deliverability Optimization.">Managing IP reputation, processing ISP feedback loops, monitoring blocklists, optimizing send timing, and managing warm-up schedules.</Sub>
        <Sub label="(i) Analytics and Reporting.">Generating delivery reports, engagement analytics, bounce breakdowns, and reputation dashboards.</Sub>
        <Sub label="(j) Platform Improvement.">Analyzing aggregate, anonymized usage patterns to improve features, fix bugs, and optimize performance.</Sub>
        <Sub label="(k) Customer Support.">Responding to your inquiries, diagnosing technical issues, and providing account assistance.</Sub>
        <Sub label="(l) Security and Fraud Prevention.">Detecting unauthorized access, preventing abuse, enforcing our Acceptable Use Policy, and protecting platform infrastructure.</Sub>
        <Sub label="(m) Legal Compliance.">Complying with applicable laws, regulations, legal processes, and governmental requests.</Sub>
      </Section>

      <Section number="4" title="AI-Specific Processing Disclosures">
        <Card className="mb-4 border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4">
            <Text className="font-semibold text-blue-600 mb-2">How Our AI Processes Your Email</Text>
            <Text className="text-sm">This section provides detailed disclosure about automated processing of your data by our AI systems, as required by GDPR Article 13(2)(f) and Article 22.</Text>
          </CardContent>
        </Card>

        <Sub label="(a) Essential Automated Processing.">Spam classification, phishing detection, malware scanning, and threat assessment are performed automatically on all email processed through the Service. These functions cannot be disabled as they are necessary to maintain platform security, protect all users, and ensure deliverability. The legal basis for this processing is our legitimate interest in maintaining a secure email platform (GDPR Article 6(1)(f)) and performance of our contract with you (GDPR Article 6(1)(b)).</Sub>

        <Sub label="(b) Optional Automated Processing.">The following AI features process your email content but can be disabled in your account settings: sentiment analysis, relationship intelligence and communication graph building, writing style learning and composition assistance, and smart priority ranking. Disabling these features does not affect core email delivery functionality. The legal basis for this processing is your consent (GDPR Article 6(1)(a)), which you may withdraw at any time.</Sub>

        <Sub label="(c) AI Model Training.">Anonymized, aggregated patterns derived from email processing across the platform may be used to improve the accuracy and performance of our AI models. We do NOT use individual emails as training examples. We do NOT retain raw email content for model training purposes. Individual writing style models are private to your account and are not shared with or used to train models for other users. You may opt out of contributing anonymized patterns to model improvement in your account settings (Settings &gt; Privacy &gt; AI Training). Opting out does not degrade service quality.</Sub>

        <Sub label="(d) AI-Derived Data.">Priority scores, sentiment results, relationship graphs, and writing style models are stored as structured data separate from your raw email content. This derived data is automatically deleted within 30 days of account closure. During your subscription, you can view AI-derived insights in your dashboard but cannot export the underlying AI models, as they are generated by our proprietary systems.</Sub>

        <Sub label="(e) No Human Review.">Your email content is processed exclusively by automated systems. No Emailed employee, contractor, or agent reads your emails. The only exceptions are: (i) when you voluntarily share email content with our support team for troubleshooting, (ii) when we are compelled by valid legal process (subpoena, court order, national security letter), or (iii) when investigating confirmed abuse reports, in which case review is limited to the specific content at issue.</Sub>

        <Sub label="(f) Automated Decision-Making.">Our AI systems make automated decisions that affect your experience, including: which emails appear in your inbox vs. spam folder, the priority order of your inbox, and whether outbound emails are flagged for compliance review. Under GDPR Article 22, you have the right to object to decisions based solely on automated processing that significantly affect you. To exercise this right, contact dpo@emailed.dev. We will review any contested automated decision with human oversight within 5 business days.</Sub>

        <Sub label="(g) Profiling.">Our AI creates profiles of your communication patterns, relationships, and writing style. These profiles are used solely to personalize your experience within the Service. We do not use these profiles for advertising, do not share them with third parties, and do not use them for automated decision-making that produces legal effects or similarly significant effects on you.</Sub>
      </Section>

      <Section number="5" title="How We Share Your Information">
        <Card className="mb-4 border-green-500/30 bg-green-500/5">
          <CardContent className="p-4">
            <Text className="font-semibold text-green-600">We do NOT sell your personal data. We have never sold personal data and have no plans to do so.</Text>
          </CardContent>
        </Card>
        <Text>We share personal data only in the following circumstances:</Text>
        <Sub label="(a) Infrastructure Providers.">Amazon Web Services (US/EU) and Hetzner (Germany) provide hosting, compute, and storage infrastructure. They process data on our behalf under strict data processing agreements.</Sub>
        <Sub label="(b) AI Processing.">Anthropic (US) provides AI model inference capabilities. Email content processed by Anthropic is subject to their data processing agreement, which prohibits use of our data for model training.</Sub>
        <Sub label="(c) Payment Processing.">Stripe, Inc. (US) processes payments. They receive billing information necessary to process your transactions, subject to their privacy policy and PCI DSS compliance.</Sub>
        <Sub label="(d) CDN and Security.">Cloudflare, Inc. (global) provides content delivery and DDoS protection. They process network request data (IP addresses, request headers) in transit.</Sub>
        <Sub label="(e) Law Enforcement.">We may disclose personal data when we believe in good faith that disclosure is required by applicable law, regulation, legal process, or governmental request (including subpoenas, court orders, and national security letters). We will notify you of such requests unless prohibited by law or court order, and will challenge overbroad requests where feasible.</Sub>
        <Sub label="(f) Corporate Transactions.">In the event of a merger, acquisition, bankruptcy, or sale of assets, your personal data may be transferred to the acquiring entity. We will provide at least 30 days&apos; advance notice via email before any such transfer and will ensure the acquiring entity is bound by privacy protections at least as protective as this Privacy Policy.</Sub>
        <Sub label="(g) Anonymized and Aggregate Data.">We may share anonymized, aggregated data that cannot reasonably be used to identify any individual with analytics partners and for industry research. This data includes aggregate sending volumes, platform-wide spam rates, and anonymized threat intelligence.</Sub>
      </Section>

      <Section number="6" title="Data Retention">
        <Text>We retain your data for the following periods:</Text>
        <Box className="ml-6 my-4">
          <Card>
            <CardContent className="p-0">
              <Box className="grid grid-cols-2 border-b border-border p-3 bg-surface-secondary">
                <Text className="font-semibold text-content">Data Type</Text>
                <Text className="font-semibold text-content">Retention Period</Text>
              </Box>
              <Box className="grid grid-cols-2 border-b border-border p-3">
                <Text>Email Content</Text>
                <Text>User-configurable (default 7 years, minimum 30 days)</Text>
              </Box>
              <Box className="grid grid-cols-2 border-b border-border p-3">
                <Text>Account Data</Text>
                <Text>Duration of account + 90 days</Text>
              </Box>
              <Box className="grid grid-cols-2 border-b border-border p-3">
                <Text>AI-Derived Insights</Text>
                <Text>Deleted within 30 days of account closure</Text>
              </Box>
              <Box className="grid grid-cols-2 border-b border-border p-3">
                <Text>Server and Access Logs</Text>
                <Text>90 days</Text>
              </Box>
              <Box className="grid grid-cols-2 border-b border-border p-3">
                <Text>Backups</Text>
                <Text>30 days (rolling)</Text>
              </Box>
              <Box className="grid grid-cols-2 border-b border-border p-3">
                <Text>Payment Records</Text>
                <Text>7 years (legal/tax requirement)</Text>
              </Box>
              <Box className="grid grid-cols-2 p-3">
                <Text>Abuse/Compliance Records</Text>
                <Text>3 years</Text>
              </Box>
            </CardContent>
          </Card>
        </Box>
        <Text>Upon account deletion, we initiate automated deletion of your data according to the schedule above. Some data may persist in encrypted backups for up to 30 days after deletion from live systems.</Text>
      </Section>

      <Section number="7" title="Your Rights Under GDPR (EEA/UK Users)">
        <Text>If you are located in the European Economic Area or United Kingdom, you have the following rights under the General Data Protection Regulation:</Text>
        <Sub label="(a) Right of Access (Article 15).">You may request a copy of the personal data we hold about you, including information about how it is processed and who it is shared with.</Sub>
        <Sub label="(b) Right to Rectification (Article 16).">You may request correction of inaccurate personal data or completion of incomplete data.</Sub>
        <Sub label="(c) Right to Erasure (Article 17).">You may request deletion of your personal data when it is no longer necessary for the purposes for which it was collected, when you withdraw consent, or when the data was unlawfully processed.</Sub>
        <Sub label="(d) Right to Restriction (Article 18).">You may request that we restrict processing of your personal data while we verify its accuracy, while you contest our legitimate interests, or while we assess an erasure request.</Sub>
        <Sub label="(e) Right to Data Portability (Article 20).">You may request your personal data in a structured, commonly used, machine-readable format (MBOX, EML, JSON) and transmit it to another controller.</Sub>
        <Sub label="(f) Right to Object (Article 21).">You may object to processing based on legitimate interests. We will cease processing unless we demonstrate compelling legitimate grounds that override your interests.</Sub>
        <Sub label="(g) Rights Related to Automated Decision-Making (Article 22).">You have the right not to be subject to decisions based solely on automated processing that significantly affect you, and to obtain human intervention, express your point of view, and contest the decision.</Sub>
        <Sub label="(h) Right to Withdraw Consent.">Where processing is based on consent, you may withdraw consent at any time without affecting the lawfulness of processing performed before withdrawal.</Sub>
        <Sub label="(i) Right to Lodge a Complaint.">You have the right to lodge a complaint with your local data protection supervisory authority.</Sub>
        <Text className="mt-3">To exercise any of these rights, contact our Data Protection Officer at dpo@emailed.dev. We will respond within 30 days. We may require identity verification before processing your request. Requests are fulfilled free of charge unless they are manifestly unfounded or excessive.</Text>
      </Section>

      <Section number="8" title="Your Rights Under CCPA (California Users)">
        <Text>If you are a California resident, the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA) provide you with the following rights:</Text>
        <Sub label="(a) Right to Know.">You may request that we disclose the categories and specific pieces of personal information we have collected about you, the categories of sources, the business or commercial purpose for collecting, and the categories of third parties with whom we share it.</Sub>
        <Sub label="(b) Right to Delete.">You may request deletion of your personal information, subject to certain exceptions (legal obligations, security, completing transactions).</Sub>
        <Sub label="(c) Right to Opt-Out of Sale.">We do not sell personal information. We have not sold personal information in the preceding 12 months.</Sub>
        <Sub label="(d) Right to Non-Discrimination.">We will not discriminate against you for exercising your CCPA rights. You will not receive different pricing, quality, or service levels.</Sub>
        <Sub label="(e) Authorized Agents.">You may designate an authorized agent to submit requests on your behalf with proper written authorization.</Sub>
        <Text className="mt-3">To exercise your CCPA rights, email privacy@emailed.dev or use the privacy controls in your account settings. We will respond within 45 days.</Text>
      </Section>

      <Section number="9" title="International Data Transfers">
        <Text>Your personal data may be processed in the United States and the European Union. For transfers of personal data from the EEA/UK to countries without an adequacy decision (including the United States), we rely on:</Text>
        <Sub label="(a) Standard Contractual Clauses (SCCs).">EU Commission-approved Standard Contractual Clauses (Decision 2021/914) are incorporated into our data processing agreements with all sub-processors located outside the EEA.</Sub>
        <Sub label="(b) Supplementary Measures.">In addition to SCCs, we implement supplementary technical measures including end-to-end encryption, pseudonymization, and access controls that prevent unauthorized access to personal data.</Sub>
        <Sub label="(c) Transfer Impact Assessments.">We conduct annual transfer impact assessments for all international data transfers, evaluating the legal framework of the recipient country and the effectiveness of our supplementary measures.</Sub>
      </Section>

      <Section number="10" title="Security Measures">
        <Text>We implement comprehensive technical and organizational security measures to protect your personal data:</Text>
        <Sub label="(a) Encryption at Rest.">All data is encrypted at rest using AES-256-GCM. Database fields containing sensitive data use additional application-level encryption.</Sub>
        <Sub label="(b) Encryption in Transit.">All connections use TLS 1.3 minimum. Inter-service communication uses mutual TLS (mTLS) with certificate-based authentication.</Sub>
        <Sub label="(c) Access Controls.">Principle of least privilege, role-based access control, multi-factor authentication for all employee access, and hardware security keys for infrastructure access.</Sub>
        <Sub label="(d) Network Security.">Network segmentation, web application firewall, DDoS mitigation, intrusion detection and prevention systems.</Sub>
        <Sub label="(e) Monitoring.">24/7 security monitoring, automated anomaly detection, comprehensive audit logging of all data access.</Sub>
        <Sub label="(f) Testing.">Regular penetration testing by independent third parties, continuous vulnerability scanning, bug bounty program.</Sub>
        <Sub label="(g) Incident Response.">Documented incident response procedures with defined roles, communication plans, and post-incident review processes.</Sub>
        <Sub label="(h) Compliance.">SOC 2 Type II certification (planned), annual security audits, regular employee security awareness training.</Sub>
      </Section>

      <Section number="11" title="Children&apos;s Privacy">
        <Text>The Service is not directed at children under the age of 13 (or 16 in the EEA). We do not knowingly collect personal information from children under these ages. If we discover that we have inadvertently collected personal information from a child under the applicable age, we will promptly delete it.</Text>
        <Text>If you believe a child under the applicable age has provided personal information to us, please contact us immediately at privacy@emailed.dev.</Text>
      </Section>

      <Section number="12" title="Cookies and Tracking">
        <Text>We use cookies and similar technologies for essential functions (authentication, session management, CSRF protection), functional preferences (theme, language), and anonymized analytics. We do not use third-party advertising cookies or tracking pixels.</Text>
        <Text>For detailed information about the cookies we use, their purposes, and how to control them, please see our Cookie Policy at /legal/cookies.</Text>
      </Section>

      <Section number="13" title="Changes to This Policy">
        <Text>We may update this Privacy Policy from time to time. For material changes, we will provide at least 30 days&apos; advance notice via email to the address associated with your account and through a prominent notice on the Service.</Text>
        <Text>Material changes include: new categories of personal data collected, new purposes for processing, new third-party data sharing, changes to your rights, and changes to our AI processing practices. Your continued use of the Service after the notice period constitutes acceptance of the updated policy.</Text>
      </Section>

      <Section number="14" title="Contact Information">
        <Text>For privacy-related inquiries:</Text>
        <Box className="ml-6 mt-2 space-y-1">
          <Text className="font-semibold">Data Protection Officer</Text>
          <Text>Email: dpo@emailed.dev</Text>
        </Box>
        <Box className="ml-6 mt-3 space-y-1">
          <Text className="font-semibold">Privacy Team</Text>
          <Text>Email: privacy@emailed.dev</Text>
        </Box>
        <Box className="ml-6 mt-3 space-y-1">
          <Text className="font-semibold">Mailing Address</Text>
          <Text>Emailed, Inc.</Text>
          <Text>Attn: Privacy / Data Protection Officer</Text>
          <Text>548 Market Street, Suite 45000</Text>
          <Text>San Francisco, CA 94104</Text>
          <Text>United States</Text>
        </Box>
        <Box className="ml-6 mt-3 space-y-1">
          <Text className="font-semibold">EU Representative</Text>
          <Text>To be appointed. Contact dpo@emailed.dev in the interim.</Text>
        </Box>
      </Section>
    </Box>
  );
}
