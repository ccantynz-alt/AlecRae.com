import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@emailed/ui";

export const metadata: Metadata = {
  title: "Terms of Service | Emailed",
  description: "Terms of Service for the Emailed AI-native email infrastructure platform.",
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

export default function TermsPage() {
  return (
    <Box className="max-w-4xl mx-auto">
      <Box className="mb-10">
        <Text as="h1" className="text-3xl font-bold text-content mb-2">Terms of Service</Text>
        <Text className="text-content-tertiary">Effective Date: April 1, 2026 | Last Updated: April 1, 2026</Text>
      </Box>

      <Card className="mb-8 border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <Text className="font-semibold text-amber-600">
            IMPORTANT: These Terms contain a binding arbitration clause and class action waiver in Section 15 that affect your legal rights. Please read them carefully.
          </Text>
        </CardContent>
      </Card>

      <Section number="1" title="Acceptance of Terms">
        <Text>By accessing or using the Emailed platform, API, website, or any associated services (collectively, the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you are using the Service on behalf of an organization, you represent and warrant that you have authority to bind that organization to these Terms, and &quot;you&quot; refers to both you individually and the organization.</Text>
        <Text>You must be at least 13 years of age (or 16 in the European Economic Area) to use the Service. If you are under 18, you represent that your parent or legal guardian has reviewed and agreed to these Terms on your behalf.</Text>
        <Text>If you do not agree to these Terms, you must not access or use the Service.</Text>
      </Section>

      <Section number="2" title="Definitions">
        <Sub label="&quot;Service&quot;">The Emailed email infrastructure platform, including all web applications, APIs, SMTP/JMAP servers, AI features, admin dashboards, SDKs, and documentation.</Sub>
        <Sub label="&quot;User&quot; or &quot;Customer&quot;">Any individual or entity that registers for, accesses, or uses the Service.</Sub>
        <Sub label="&quot;Content&quot;">All data transmitted through, stored in, or processed by the Service, including email messages, attachments, metadata, headers, domain configurations, and contact lists.</Sub>
        <Sub label="&quot;AI Features&quot;">Machine learning and artificial intelligence capabilities including spam classification, priority ranking, sentiment analysis, relationship intelligence, writing style learning, composition assistance, threat detection, and reputation scoring.</Sub>
        <Sub label="&quot;API&quot;">The Application Programming Interface provided by Emailed for programmatic access to the Service.</Sub>
        <Sub label="&quot;Account&quot;">A registered user account on the Service, identified by a unique email address and secured by authentication credentials.</Sub>
      </Section>

      <Section number="3" title="Account Registration and Security">
        <Text>You must provide accurate, current, and complete information during registration and maintain the accuracy of such information. Each account is for a single individual or entity; credential sharing is prohibited.</Text>
        <Text>You are solely responsible for maintaining the confidentiality of your account credentials, including passwords, API keys, and passkeys. You must immediately notify Emailed at security@emailed.dev of any unauthorized access to or use of your account.</Text>
        <Text>Emailed reserves the right to suspend or terminate accounts that provide false information, are used for fraudulent purposes, or violate these Terms.</Text>
      </Section>

      <Section number="4" title="Description of Services">
        <Text>Emailed provides an AI-native email infrastructure platform that includes:</Text>
        <Sub label="(a)">Email sending and receiving via SMTP, JMAP, and REST API with enterprise-grade deliverability.</Sub>
        <Sub label="(b)">AI-powered spam and phishing detection that automatically classifies inbound and outbound email.</Sub>
        <Sub label="(c)">AI composition assistance that learns your writing style and can draft, suggest, and refine email content.</Sub>
        <Sub label="(d)">Deliverability optimization including automated IP warm-up, reputation monitoring, and ISP feedback loop processing.</Sub>
        <Sub label="(e)">Domain management with automated SPF, DKIM, DMARC, BIMI, and MTA-STS configuration.</Sub>
        <Sub label="(f)">Analytics and reporting on delivery rates, engagement metrics, bounce rates, and sender reputation.</Sub>
        <Sub label="(g)">API access for programmatic email sending, domain management, contact management, and analytics retrieval.</Sub>
        <Sub label="(h)">AI-powered reputation management with real-time blocklist monitoring and automated remediation.</Sub>
        <Sub label="(i)">Smart inbox prioritization, relationship intelligence, and sentiment analysis.</Sub>
      </Section>

      <Section number="5" title="AI Services and Data Processing">
        <Card className="mb-4 border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-4">
            <Text className="font-semibold text-blue-600 mb-2">AI Processing Disclosure</Text>
            <Text className="text-sm">This section describes how our AI systems process your email content. Please read it carefully.</Text>
          </CardContent>
        </Card>
        <Sub label="(a) Automated Processing.">All email content processed through the Service is automatically analyzed by AI systems for spam classification, phishing and threat detection, and priority ranking. These are essential service functions and cannot be disabled, as they are necessary to maintain platform security and deliverability for all users.</Sub>
        <Sub label="(b) Optional AI Features.">Sentiment analysis, relationship intelligence graphing, writing style learning, and AI composition assistance are optional features that can be disabled in your account settings. Disabling these features does not affect core email functionality.</Sub>
        <Sub label="(c) No Human Review.">Email content is processed exclusively by automated AI systems. No Emailed employee or contractor reviews your email content. Human review occurs only when (i) you contact support and voluntarily share content, or (ii) we are compelled by valid legal process.</Sub>
        <Sub label="(d) AI Training.">Anonymized, aggregated patterns derived from email processing may be used to improve our AI models. Individual emails are never stored for training purposes. You may opt out of contributing to model improvement in your account settings without any degradation of service quality.</Sub>
        <Sub label="(e) AI-Generated Content.">Any content generated by AI features (draft emails, subject line suggestions, reply recommendations) is provided as a suggestion only. You are solely responsible for reviewing, editing, and approving any AI-generated content before sending. Emailed disclaims all liability for the accuracy, appropriateness, or consequences of AI-generated content that you choose to send.</Sub>
        <Sub label="(f) AI Accuracy.">AI classifications and recommendations are probabilistic and not guaranteed to be accurate. Legitimate emails may occasionally be classified as spam, and spam may occasionally reach your inbox. Emailed continuously works to improve accuracy but does not warrant any specific accuracy rate.</Sub>
      </Section>

      <Section number="6" title="User Content and License Grant">
        <Sub label="(a) Ownership.">You retain all right, title, and interest in your Content. Emailed does not claim ownership of any Content you transmit through or store on the Service.</Sub>
        <Sub label="(b) License to Emailed.">You grant Emailed a worldwide, non-exclusive, royalty-free, sublicensable license to use, process, store, transmit, and display your Content solely for the purposes of (i) providing and maintaining the Service, (ii) improving the Service including AI model training (subject to your opt-out right), and (iii) complying with applicable law. This license terminates when you delete your Content or close your account, except as required for backup retention and legal compliance.</Sub>
        <Sub label="(c) Your Responsibilities.">You represent and warrant that you have all necessary rights to transmit your Content through the Service, that your Content does not violate any applicable law or third-party rights, and that you comply with our Acceptable Use Policy.</Sub>
      </Section>

      <Section number="7" title="API Terms">
        <Sub label="(a) Rate Limits.">API usage is subject to rate limits based on your subscription plan. Current rate limits are published in our API documentation and may be updated with 30 days&apos; notice.</Sub>
        <Sub label="(b) API Keys.">API keys are confidential credentials. You must not share, publish, or embed API keys in client-side code or public repositories. You are responsible for all activity under your API keys.</Sub>
        <Sub label="(c) Fair Use.">API usage must be reasonable and consistent with the intended purpose of the Service. Emailed reserves the right to throttle or suspend API access that places disproportionate load on infrastructure.</Sub>
        <Sub label="(d) Versioning.">Emailed may introduce new API versions and deprecate older versions with a minimum of 90 days&apos; notice. Deprecated API versions will continue to function during the notice period.</Sub>
        <Sub label="(e) No Circumvention.">You must not circumvent rate limits, authentication requirements, or access controls through any means, including the use of multiple accounts, IP rotation, or request obfuscation.</Sub>
      </Section>

      <Section number="8" title="Sending Limits and Anti-Spam Obligations">
        <Text>You must comply with all applicable anti-spam laws, including CAN-SPAM (United States), GDPR (European Union), CASL (Canada), and all other applicable regulations in jurisdictions where your recipients are located.</Text>
        <Sub label="(a)">You must not send unsolicited bulk or commercial email to recipients who have not provided consent.</Sub>
        <Sub label="(b)">You must not use purchased, rented, scraped, or harvested email lists.</Sub>
        <Sub label="(c)">All marketing emails must include a functional unsubscribe mechanism and a valid physical postal address.</Sub>
        <Sub label="(d)">You must honor unsubscribe requests within the timeframe required by applicable law (10 business days for CAN-SPAM, immediately for GDPR).</Sub>
        <Sub label="(e)">Emailed may impose sending limits, throttle delivery, or suspend your account if your sending patterns indicate spam or abuse, or if your bounce or complaint rates exceed platform thresholds.</Sub>
      </Section>

      <Section number="9" title="Domain Verification">
        <Text>You must verify ownership of all domains used for sending through the Service by completing our domain verification process (DNS record, file upload, or meta tag verification).</Text>
        <Text>You must maintain valid SPF, DKIM, and DMARC records for all verified domains. Emailed may automatically configure these records on your behalf if you delegate DNS management to us.</Text>
        <Text>Emailed reserves the right to suspend sending from domains that fail verification, have expired verification, or lack proper authentication records.</Text>
      </Section>

      <Section number="10" title="Payment Terms">
        <Sub label="(a) Billing.">Paid plans are billed in advance on a monthly or annual basis, as selected during subscription. Your subscription automatically renews at the end of each billing period unless cancelled.</Sub>
        <Sub label="(b) Price Changes.">Emailed may change subscription prices with 30 days&apos; advance notice. Price changes take effect at the start of your next billing period. If you do not agree to a price change, you may cancel before the new price takes effect.</Sub>
        <Sub label="(c) Refunds.">Annual subscriptions cancelled mid-term are eligible for a pro-rata refund of unused months. Monthly subscriptions are non-refundable. No refunds are issued for accounts terminated due to Terms violations.</Sub>
        <Sub label="(d) Taxes.">Prices are exclusive of applicable taxes. You are responsible for all taxes, levies, and duties imposed by taxing authorities, excluding taxes based on Emailed&apos;s net income.</Sub>
        <Sub label="(e) Overages.">Usage exceeding your plan limits may result in overage charges as specified in your plan details, or in throttling of service until the next billing cycle.</Sub>
      </Section>

      <Section number="11" title="Intellectual Property">
        <Sub label="(a) Platform IP.">Emailed and its licensors retain all right, title, and interest in the Service, including all software, AI models, algorithms, designs, documentation, trade names, trademarks, and patents. Nothing in these Terms grants you any right in the foregoing except the limited right to use the Service as permitted herein.</Sub>
        <Sub label="(b) Your Content.">As stated in Section 6, you retain ownership of your Content.</Sub>
        <Sub label="(c) AI-Generated Output.">You own the output generated by AI features for your use (e.g., drafted emails). However, Emailed retains all rights to the underlying AI models, algorithms, and training methodologies used to generate such output. Similar or identical output may be generated for other users.</Sub>
        <Sub label="(d) Feedback.">Any feedback, suggestions, or ideas you provide about the Service may be used by Emailed without obligation or compensation to you.</Sub>
        <Sub label="(e) No Reverse Engineering.">You must not reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, algorithms, or architecture of the Service or its AI models.</Sub>
      </Section>

      <Section number="12" title="Limitation of Liability">
        <Card className="mb-4 border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <Text className="font-semibold text-red-600 uppercase text-sm">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, EMAILED&apos;S TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE AMOUNTS PAID BY YOU TO EMAILED IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </Text>
          </CardContent>
        </Card>
        <Sub label="(a)">IN NO EVENT SHALL EMAILED BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, BUSINESS OPPORTUNITIES, GOODWILL, OR REVENUE, REGARDLESS OF THE THEORY OF LIABILITY.</Sub>
        <Sub label="(b)">EMAILED SHALL NOT BE LIABLE FOR DAMAGES ARISING FROM (i) AI CLASSIFICATION ERRORS, INCLUDING LEGITIMATE EMAILS CLASSIFIED AS SPAM OR SPAM REACHING YOUR INBOX; (ii) DELIVERABILITY OUTCOMES, INCLUDING EMAILS BEING REJECTED, DELAYED, OR FILTERED BY RECIPIENT MAIL SERVERS; (iii) CONTENT OF EMAILS SENT THROUGH THE SERVICE; (iv) ACTIONS TAKEN BY THIRD-PARTY EMAIL PROVIDERS; OR (v) UNAUTHORIZED ACCESS TO YOUR ACCOUNT WHERE SUCH ACCESS RESULTED FROM YOUR FAILURE TO SECURE YOUR CREDENTIALS.</Sub>
        <Sub label="(c)">THE LIMITATIONS IN THIS SECTION APPLY EVEN IF EMAILED HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES AND EVEN IF A REMEDY FAILS OF ITS ESSENTIAL PURPOSE.</Sub>
        <Sub label="(d)">SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IN SUCH JURISDICTIONS, LIABILITY IS LIMITED TO THE MAXIMUM EXTENT PERMITTED BY LAW.</Sub>
      </Section>

      <Section number="13" title="Indemnification">
        <Text>You agree to indemnify, defend, and hold harmless Emailed, its officers, directors, employees, agents, and affiliates from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees) arising from or related to:</Text>
        <Sub label="(a)">Your Content or any emails sent through your account.</Sub>
        <Sub label="(b)">Spam complaints, abuse reports, or deliverability issues caused by your sending practices.</Sub>
        <Sub label="(c)">Your violation of these Terms, the Acceptable Use Policy, or any applicable law.</Sub>
        <Sub label="(d)">Your violation of any third-party right, including intellectual property, privacy, or publicity rights.</Sub>
        <Sub label="(e)">Any third-party claim arising from your use of the Service or the emails you send through it.</Sub>
      </Section>

      <Section number="14" title="Warranty Disclaimer">
        <Card className="mb-4 border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <Text className="font-semibold text-red-600 uppercase text-sm">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
            </Text>
          </CardContent>
        </Card>
        <Sub label="(a)">Emailed does not warrant that the Service will be uninterrupted, error-free, secure, or free from viruses or other harmful components.</Sub>
        <Sub label="(b)">Emailed does not warrant the accuracy, reliability, or completeness of any AI classifications, recommendations, or generated content.</Sub>
        <Sub label="(c)">Emailed does not warrant any specific level of email deliverability, inbox placement, or sender reputation score.</Sub>
        <Sub label="(d)">Emailed does not warrant that the Service will meet your specific requirements or expectations.</Sub>
      </Section>

      <Section number="15" title="Dispute Resolution and Arbitration">
        <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <Text className="font-semibold text-amber-600 mb-2">PLEASE READ THIS SECTION CAREFULLY — IT AFFECTS YOUR LEGAL RIGHTS</Text>
            <Text className="text-sm text-amber-700">This section contains a binding arbitration clause and class action waiver.</Text>
          </CardContent>
        </Card>
        <Sub label="(a) Informal Resolution.">Before filing any formal dispute, you must contact Emailed at legal@emailed.dev and attempt to resolve the dispute informally for at least 30 days. Most disputes can be resolved without formal proceedings.</Sub>
        <Sub label="(b) Binding Arbitration.">Any dispute, controversy, or claim arising out of or relating to these Terms or the Service that cannot be resolved informally shall be resolved by binding arbitration administered by the American Arbitration Association (&quot;AAA&quot;) under its Commercial Arbitration Rules. The arbitration shall be conducted in San Francisco, California, by a single arbitrator selected in accordance with AAA rules.</Sub>
        <Sub label="(c) Class Action Waiver.">YOU AND EMAILED AGREE THAT EACH PARTY MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION. The arbitrator may not consolidate more than one person&apos;s claims and may not preside over any form of representative or class proceeding.</Sub>
        <Sub label="(d) Exceptions.">Notwithstanding the above, either party may (i) bring an individual action in small claims court for disputes within that court&apos;s jurisdiction, or (ii) seek injunctive or other equitable relief in any court of competent jurisdiction to prevent the actual or threatened infringement of intellectual property rights.</Sub>
        <Sub label="(e) Costs.">Each party shall bear its own costs and attorneys&apos; fees in arbitration. If the arbitrator finds that the substance of your claim or the relief sought is frivolous or brought for an improper purpose, the arbitrator may award costs and fees to Emailed.</Sub>
        <Sub label="(f) Opt-Out.">You may opt out of this arbitration agreement by sending written notice to legal@emailed.dev within 30 days of first accepting these Terms. Your notice must include your name, account email, and a clear statement that you wish to opt out of arbitration.</Sub>
      </Section>

      <Section number="16" title="Governing Law">
        <Text>These Terms are governed by the laws of the State of California, without regard to its conflict of laws principles. For any disputes not subject to arbitration, the exclusive jurisdiction and venue shall be the state and federal courts located in San Francisco County, California, and each party consents to personal jurisdiction in such courts.</Text>
      </Section>

      <Section number="17" title="Termination">
        <Sub label="(a) By You.">You may terminate your account at any time through your account settings or by contacting support@emailed.dev. Upon termination, you will have a 30-day window to export your data.</Sub>
        <Sub label="(b) By Emailed for Cause.">Emailed may suspend or terminate your account immediately upon notice if you breach these Terms, violate the Acceptable Use Policy, fail to pay fees when due, or engage in activity that threatens the security or reputation of the platform.</Sub>
        <Sub label="(c) By Emailed Without Cause.">Emailed may terminate your account without cause by providing 90 days&apos; advance written notice. In such case, you will receive a pro-rata refund of any prepaid fees for the unused portion of your subscription.</Sub>
        <Sub label="(d) Effect of Termination.">Upon termination, your right to use the Service immediately ceases (subject to any data export window). Emailed will delete your Content within 90 days of termination, except as required for backup retention, legal compliance, or dispute resolution. Sections 6(b), 11, 12, 13, 14, 15, 16, and 25 survive termination.</Sub>
      </Section>

      <Section number="18" title="Data Portability">
        <Text>You have the right to export your email data at any time during the term of your subscription and during the 30-day post-termination export window. Data export is available in standard formats including MBOX and EML via the API or bulk download.</Text>
        <Text>AI-derived data (priority scores, sentiment analysis, relationship graphs, writing style models) is not exportable, as it constitutes Emailed&apos;s proprietary processing output and is generated by our proprietary AI models.</Text>
      </Section>

      <Section number="19" title="Modifications to Terms">
        <Text>Emailed may modify these Terms at any time. For material changes, we will provide at least 30 days&apos; advance notice via email to the address associated with your account and through a prominent notice on the Service. Material changes that expand our rights to use your Content or narrow your rights will require your affirmative consent.</Text>
        <Text>Your continued use of the Service after the notice period constitutes acceptance of the modified Terms. If you do not agree to the modifications, you must stop using the Service and may terminate your account.</Text>
      </Section>

      <Section number="20" title="Force Majeure">
        <Text>Neither party shall be liable for any failure or delay in performance due to circumstances beyond its reasonable control, including acts of God, natural disasters, war, terrorism, riots, pandemics, government actions, power failures, internet or telecommunications failures, or cyberattacks. The affected party must provide prompt notice and use reasonable efforts to mitigate the impact.</Text>
      </Section>

      <Section number="21" title="Export Compliance">
        <Text>The Service is subject to United States export controls and economic sanctions regulations. You must not use the Service in violation of any U.S. export law or regulation, including the Export Administration Regulations (EAR) and sanctions administered by the Office of Foreign Assets Control (OFAC).</Text>
        <Text>You represent that you are not located in, organized under the laws of, or a resident of any country or territory subject to comprehensive U.S. sanctions (currently Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk, and Luhansk regions), and that you are not on any U.S. government restricted party list.</Text>
      </Section>

      <Section number="22" title="Government Users">
        <Text>If you are a U.S. government entity or using the Service on behalf of a U.S. government entity, the Service is provided as &quot;commercial computer software&quot; and &quot;commercial computer software documentation&quot; as defined in FAR 12.212 and DFARS 227.7202. Use, reproduction, and disclosure are governed by these Terms and applicable FAR/DFARS clauses.</Text>
      </Section>

      <Section number="23" title="Third-Party Services">
        <Text>The Service may integrate with or link to third-party services (payment processors, DNS providers, analytics tools). Emailed is not responsible for the availability, accuracy, or content of third-party services, and your use of them is subject to their respective terms and privacy policies. Emailed makes no warranties regarding third-party services.</Text>
      </Section>

      <Section number="24" title="Severability">
        <Text>If any provision of these Terms is found to be unenforceable or invalid by a court of competent jurisdiction or arbitrator, that provision shall be enforced to the maximum extent permissible, and the remaining provisions shall remain in full force and effect. If the class action waiver in Section 15(c) is found unenforceable, the entirety of Section 15 shall be void.</Text>
      </Section>

      <Section number="25" title="Entire Agreement">
        <Text>These Terms, together with the Privacy Policy, Acceptable Use Policy, Data Processing Agreement, and Service Level Agreement, constitute the entire agreement between you and Emailed regarding the Service. These Terms supersede all prior agreements, understandings, and communications, whether written or oral, regarding the subject matter herein.</Text>
        <Text>No waiver of any provision of these Terms shall be deemed a further or continuing waiver of such provision or any other provision. A failure to exercise or delay in exercising any right under these Terms shall not constitute a waiver of that right.</Text>
      </Section>

      <Section number="26" title="Contact Information">
        <Text>If you have questions about these Terms, please contact us:</Text>
        <Box className="ml-6 mt-2 space-y-1">
          <Text>Emailed, Inc.</Text>
          <Text>548 Market Street, Suite 45000</Text>
          <Text>San Francisco, CA 94104</Text>
          <Text>Legal inquiries: legal@emailed.dev</Text>
          <Text>General support: support@emailed.dev</Text>
          <Text>Security issues: security@emailed.dev</Text>
        </Box>
      </Section>
    </Box>
  );
}
