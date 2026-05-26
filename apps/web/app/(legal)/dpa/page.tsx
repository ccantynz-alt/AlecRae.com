import type { Metadata } from "next";
import { Box, Text, Card, CardContent } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Data Processing Agreement | AlecRae",
  description: "GDPR-compliant Data Processing Agreement for AlecRae business customers.",
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

function DefItem({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <Box className="ml-6 mb-3">
      <Text className="font-semibold text-content">&quot;{term}&quot;</Text>
      <Text className="ml-4">{children}</Text>
    </Box>
  );
}

export default function DpaPage() {
  return (
    <Box className="max-w-4xl mx-auto">
      <Box className="mb-10">
        <Text as="h1" className="text-3xl font-bold text-content mb-2">Data Processing Agreement</Text>
        <Text className="text-content-tertiary">Effective Date: April 1, 2026 | Last Updated: April 1, 2026</Text>
      </Box>

      <Card className="mb-8 border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-4">
          <Text className="text-sm text-blue-700">
            This Data Processing Agreement (&quot;DPA&quot;) forms part of the Terms of Service between AlecRae, Inc. (&quot;Processor&quot; or &quot;AlecRae&quot;) and the Customer (&quot;Controller&quot;) and governs the processing of personal data by AlecRae on behalf of the Customer in connection with the AlecRae email infrastructure platform.
          </Text>
        </CardContent>
      </Card>

      <Section number="1" title="Definitions">
        <DefItem term="Controller">The Customer entity that determines the purposes and means of processing personal data through the Service, as defined in GDPR Article 4(7).</DefItem>
        <DefItem term="Processor">AlecRae, Inc., which processes personal data on behalf of the Controller, as defined in GDPR Article 4(8).</DefItem>
        <DefItem term="Sub-processor">Any third party engaged by the Processor to process personal data on behalf of the Controller.</DefItem>
        <DefItem term="Data Subject">An identified or identifiable natural person whose personal data is processed through the Service.</DefItem>
        <DefItem term="Personal Data">Any information relating to a Data Subject, as defined in GDPR Article 4(1), that is processed through the Service.</DefItem>
        <DefItem term="Processing">Any operation performed on Personal Data, as defined in GDPR Article 4(2), including collection, recording, organization, structuring, storage, adaptation, retrieval, consultation, use, disclosure, combination, restriction, erasure, or destruction.</DefItem>
        <DefItem term="Data Protection Laws">All applicable data protection and privacy legislation, including the EU General Data Protection Regulation (Regulation 2016/679), the UK GDPR, the California Consumer Privacy Act (CCPA/CPRA), Brazil&apos;s LGPD, South Africa&apos;s POPIA, and any other applicable data protection law.</DefItem>
        <DefItem term="Standard Contractual Clauses (SCCs)">The standard contractual clauses for the transfer of personal data to processors established in third countries, as approved by the European Commission (Decision 2021/914).</DefItem>
        <DefItem term="Supervisory Authority">An independent public authority responsible for monitoring the application of Data Protection Laws, as defined in GDPR Article 4(21).</DefItem>
        <DefItem term="Technical and Organizational Measures (TOMs)">The security measures implemented by the Processor to protect Personal Data, as described in Annex II of this DPA.</DefItem>
      </Section>

      <Section number="2" title="Scope, Roles, and Duration">
        <Sub label="2.1">The Controller is the entity that determines the purposes and means of processing personal data through the Service. The Processor processes personal data solely on behalf of and under the instructions of the Controller.</Sub>
        <Sub label="2.2">This DPA supplements and forms an integral part of the Terms of Service between the parties. In the event of any conflict between this DPA and the Terms of Service regarding data protection matters, this DPA shall prevail.</Sub>
        <Sub label="2.3">This DPA applies to all personal data processed by the Processor in connection with the provision of the Service to the Controller.</Sub>
        <Sub label="2.4">The duration of this DPA is co-terminus with the Terms of Service. The Processor&apos;s obligations under this DPA continue until all personal data has been deleted or returned as specified in Section 12.</Sub>
      </Section>

      <Section number="3" title="Details of Processing">
        <Box className="ml-6 my-4">
          <Card>
            <CardContent className="p-0">
              <Box className="grid grid-cols-3 border-b border-border p-3 bg-surface-secondary">
                <Text className="font-semibold text-content col-span-1">Category</Text>
                <Text className="font-semibold text-content col-span-2">Details</Text>
              </Box>
              <Box className="grid grid-cols-3 border-b border-border p-3">
                <Text className="font-semibold col-span-1">Subject Matter</Text>
                <Text className="col-span-2">Provision of AI-native email infrastructure services, including email sending, receiving, storage, delivery optimization, and AI-powered analysis.</Text>
              </Box>
              <Box className="grid grid-cols-3 border-b border-border p-3">
                <Text className="font-semibold col-span-1">Duration</Text>
                <Text className="col-span-2">The term of the service agreement between Controller and Processor, plus any post-termination retention period specified herein.</Text>
              </Box>
              <Box className="grid grid-cols-3 border-b border-border p-3">
                <Text className="font-semibold col-span-1">Nature of Processing</Text>
                <Text className="col-span-2">Automated email processing, storage, transmission, delivery, AI-based spam classification, AI-based threat detection, AI-based content analysis, deliverability optimization, analytics generation, and reputation management.</Text>
              </Box>
              <Box className="grid grid-cols-3 border-b border-border p-3">
                <Text className="font-semibold col-span-1">Purpose</Text>
                <Text className="col-span-2">Email delivery and management services, including security filtering, deliverability optimization, analytics, and AI-powered features as described in the Terms of Service.</Text>
              </Box>
              <Box className="grid grid-cols-3 border-b border-border p-3">
                <Text className="font-semibold col-span-1">Types of Personal Data</Text>
                <Text className="col-span-2">Email content (body, subject, attachments), email metadata (headers, timestamps, Message-IDs), sender and recipient email addresses, IP addresses, domain information, authentication data, usage data, AI-derived analytics (priority scores, sentiment, relationship data).</Text>
              </Box>
              <Box className="grid grid-cols-3 p-3">
                <Text className="font-semibold col-span-1">Data Subjects</Text>
                <Text className="col-span-2">Controller&apos;s employees and authorized users, Controller&apos;s email recipients, Controller&apos;s contacts and correspondents, individuals whose personal data is contained within email content.</Text>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Section>

      <Section number="4" title="Processor Obligations">
        <Text>The Processor shall:</Text>
        <Sub label="4.1">Process personal data only on documented instructions from the Controller, including with regard to transfers to third countries, unless required to do so by applicable law, in which case the Processor shall inform the Controller of that legal requirement before processing (unless the law prohibits such information on important grounds of public interest).</Sub>
        <Sub label="4.2">Ensure that all personnel authorized to process personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.</Sub>
        <Sub label="4.3">Implement and maintain appropriate technical and organizational security measures as described in Section 6 (Security Measures) of this DPA, ensuring a level of security appropriate to the risk.</Sub>
        <Sub label="4.4">Not engage another processor (sub-processor) without prior written notification to the Controller and compliance with the requirements of Section 5 (Sub-Processor Management).</Sub>
        <Sub label="4.5">Taking into account the nature of the processing, assist the Controller by appropriate technical and organizational measures, insofar as this is possible, for the fulfilment of the Controller&apos;s obligation to respond to requests for exercising Data Subjects&apos; rights under Chapter III of the GDPR.</Sub>
        <Sub label="4.6">Assist the Controller in ensuring compliance with the obligations pursuant to Articles 32 to 36 of the GDPR (security of processing, notification of personal data breaches, data protection impact assessments, and prior consultation), taking into account the nature of processing and the information available to the Processor.</Sub>
        <Sub label="4.7">At the choice of the Controller, delete or return all personal data to the Controller after the end of the provision of services, and delete existing copies unless applicable law requires storage of the personal data.</Sub>
        <Sub label="4.8">Make available to the Controller all information necessary to demonstrate compliance with the obligations laid down in this DPA and allow for and contribute to audits, including inspections, conducted by the Controller or another auditor mandated by the Controller, as detailed in Section 10 (Audit Rights).</Sub>
        <Sub label="4.9">Immediately inform the Controller if, in the Processor&apos;s opinion, an instruction from the Controller infringes the GDPR or other applicable Data Protection Laws.</Sub>
      </Section>

      <Section number="5" title="Sub-Processor Management">
        <Sub label="5.1">The current list of sub-processors is available at /legal/subprocessors and is incorporated by reference into this DPA.</Sub>
        <Sub label="5.2">The Processor shall notify the Controller in writing (including by email) at least 30 days prior to engaging any new sub-processor or replacing an existing sub-processor, providing the name, location, and nature of processing to be performed.</Sub>
        <Sub label="5.3">The Controller may object to the engagement of a new sub-processor by notifying the Processor in writing within 14 days of receiving notice. The objection must state reasonable grounds related to data protection.</Sub>
        <Sub label="5.4">If the Controller objects, the parties shall discuss the objection in good faith. If the parties cannot reach a resolution within 30 days, the Controller may terminate the affected services without penalty by providing written notice.</Sub>
        <Sub label="5.5">The Processor shall impose contractual obligations on each sub-processor that are no less protective than those set out in this DPA, including obligations regarding confidentiality, security measures, and data deletion.</Sub>
        <Sub label="5.6">The Processor remains fully liable to the Controller for the performance of each sub-processor&apos;s obligations. Any failure by a sub-processor to fulfil its data protection obligations shall be treated as a failure by the Processor.</Sub>
      </Section>

      <Section number="6" title="Security Measures">
        <Text>The Processor implements and maintains the following technical and organizational measures to protect personal data:</Text>

        <Text className="font-semibold text-content mt-4">Technical Measures:</Text>
        <Sub label="(a) Encryption at Rest.">AES-256-GCM encryption for all stored data, with separate encryption keys per customer where technically feasible. Keys are managed through a dedicated key management service with automatic rotation.</Sub>
        <Sub label="(b) Encryption in Transit.">TLS 1.3 minimum for all external connections. Mutual TLS (mTLS) with X.509 certificate authentication for all inter-service communication.</Sub>
        <Sub label="(c) Access Controls.">Role-based access control (RBAC) with principle of least privilege. Multi-factor authentication required for all employee access to production systems. Hardware security keys (FIDO2) required for infrastructure access.</Sub>
        <Sub label="(d) Network Security.">Network segmentation with security groups and network policies. Web application firewall (WAF). DDoS mitigation. Intrusion detection and prevention systems (IDS/IPS).</Sub>
        <Sub label="(e) Vulnerability Management.">Continuous automated vulnerability scanning. Annual penetration testing by independent third parties. Bug bounty program for responsible disclosure.</Sub>
        <Sub label="(f) Logging and Monitoring.">Comprehensive audit logging of all access to personal data. Real-time security monitoring and alerting. Log retention for 90 days with tamper-proof storage.</Sub>

        <Text className="font-semibold text-content mt-4">Organizational Measures:</Text>
        <Sub label="(g) Personnel.">Background checks for all employees with access to personal data. Mandatory security awareness training upon hire and annually thereafter. Confidentiality agreements for all employees and contractors.</Sub>
        <Sub label="(h) Incident Response.">Documented incident response plan with defined roles, escalation procedures, and communication protocols. Regular incident response drills.</Sub>
        <Sub label="(i) Business Continuity.">Documented disaster recovery procedures. Regular backup testing. Geographic redundancy for critical systems. Recovery Point Objective (RPO): 1 hour. Recovery Time Objective (RTO): 4 hours.</Sub>
        <Sub label="(j) Physical Security.">All data centers provide SOC 2 Type II certified physical security, including access controls, surveillance, environmental controls, and redundant power and cooling.</Sub>
      </Section>

      <Section number="7" title="Data Breach Notification">
        <Sub label="7.1">The Processor shall notify the Controller without undue delay, and in any event no later than 72 hours after becoming aware of a personal data breach affecting the Controller&apos;s data.</Sub>
        <Sub label="7.2">The notification shall include, to the extent known at the time:</Sub>
        <Box className="ml-12 space-y-1">
          <Text>(a) A description of the nature of the breach, including the categories and approximate number of Data Subjects concerned and the categories and approximate number of personal data records concerned.</Text>
          <Text>(b) The name and contact details of the Processor&apos;s Data Protection Officer or other contact point.</Text>
          <Text>(c) A description of the likely consequences of the breach.</Text>
          <Text>(d) A description of the measures taken or proposed to be taken to address the breach, including measures to mitigate its possible adverse effects.</Text>
        </Box>
        <Sub label="7.3">Where it is not possible to provide all information simultaneously, the Processor shall provide information in phases without further undue delay.</Sub>
        <Sub label="7.4">The Processor shall cooperate with the Controller in investigating the breach and shall implement reasonable measures to mitigate the effects of the breach and prevent recurrence.</Sub>
        <Sub label="7.5">The Processor shall not notify any Data Subject or Supervisory Authority directly about a breach involving the Controller&apos;s data without the Controller&apos;s prior written approval, unless required by applicable law.</Sub>
        <Sub label="7.6">The Processor shall document all personal data breaches, including the facts relating to the breach, its effects, and the remedial action taken, and make this documentation available to the Controller upon request.</Sub>
      </Section>

      <Section number="8" title="International Data Transfers">
        <Sub label="8.1">The Processor shall not transfer personal data outside the EEA/UK without ensuring that adequate safeguards are in place as required by applicable Data Protection Laws.</Sub>
        <Sub label="8.2">For transfers to countries without an adequacy decision from the European Commission, the parties agree that the EU Commission Standard Contractual Clauses (Decision 2021/914, Module 2: Controller to Processor) are incorporated by reference into this DPA and apply to such transfers.</Sub>
        <Sub label="8.3">The Processor implements supplementary measures in addition to the SCCs, including: encryption of data in transit and at rest using industry-standard algorithms, strict access controls limiting access to transferred data, and contractual restrictions on sub-processor access.</Sub>
        <Sub label="8.4">The Processor shall conduct and maintain a Transfer Impact Assessment for all international transfers, evaluating the legal framework of the recipient country and the effectiveness of supplementary measures. The assessment shall be made available to the Controller upon request.</Sub>
      </Section>

      <Section number="9" title="Data Subject Rights">
        <Sub label="9.1">The Processor shall promptly assist the Controller in responding to Data Subject requests to exercise their rights under applicable Data Protection Laws, including rights of access, rectification, erasure, restriction, portability, and objection.</Sub>
        <Sub label="9.2">If the Processor receives a Data Subject request directly, it shall promptly redirect the Data Subject to the Controller and notify the Controller of the request within 2 business days.</Sub>
        <Sub label="9.3">The Processor shall implement and maintain technical measures that enable the Controller to efficiently fulfill Data Subject requests, including data export capabilities, data deletion mechanisms, and processing restriction controls.</Sub>
        <Sub label="9.4">The Processor shall provide assistance with Data Subject requests within 5 business days of the Controller&apos;s request for assistance.</Sub>
      </Section>

      <Section number="10" title="Audit Rights">
        <Sub label="10.1">The Controller may audit the Processor&apos;s compliance with this DPA once per calendar year. Additional audits may be conducted where the Controller has reasonable grounds to suspect non-compliance or following a personal data breach.</Sub>
        <Sub label="10.2">The Controller shall provide at least 30 days&apos; written notice of an audit, specifying the scope, duration, and start date. Audits shall be conducted during normal business hours and shall not unreasonably interfere with the Processor&apos;s operations.</Sub>
        <Sub label="10.3">The Controller bears all costs of audits it initiates, including the reasonable costs incurred by the Processor in facilitating the audit.</Sub>
        <Sub label="10.4">As an alternative to on-site audits, the Processor may provide: (a) current SOC 2 Type II audit reports from an independent third-party auditor, (b) responses to standardized security questionnaires (SIG, CAIQ), or (c) certifications and attestations (ISO 27001, SOC 2) demonstrating compliance.</Sub>
        <Sub label="10.5">All audit findings and reports shall be treated as confidential information of the Processor. The Controller shall share audit findings with the Processor and provide reasonable opportunity to address any identified deficiencies.</Sub>
      </Section>

      <Section number="11" title="Data Protection Impact Assessment">
        <Sub label="11.1">The Processor shall provide reasonable assistance to the Controller in conducting Data Protection Impact Assessments (DPIAs) where the Controller&apos;s use of the Service is likely to result in a high risk to the rights and freedoms of natural persons.</Sub>
        <Sub label="11.2">The Processor shall provide information about its processing operations, technical and organizational measures, and any other information reasonably required for the Controller to complete a DPIA.</Sub>
        <Sub label="11.3">Where a DPIA indicates that processing would result in a high risk in the absence of measures to mitigate the risk, the Processor shall assist the Controller with prior consultation with the relevant Supervisory Authority if required under GDPR Article 36.</Sub>
      </Section>

      <Section number="12" title="Term, Termination, and Data Deletion">
        <Sub label="12.1">This DPA is effective from the date the Controller begins using the Service and remains in effect for the duration of the Terms of Service between the parties.</Sub>
        <Sub label="12.2">Upon termination of the Terms of Service, the Processor shall, at the Controller&apos;s choice: (a) return all personal data to the Controller in a structured, commonly used, machine-readable format within 30 days of termination; or (b) delete all personal data within 90 days of termination.</Sub>
        <Sub label="12.3">If the Controller does not make an election within 30 days of termination, the Processor shall delete all personal data within 90 days.</Sub>
        <Sub label="12.4">The Processor shall provide written certification of deletion upon the Controller&apos;s request.</Sub>
        <Sub label="12.5">The Processor may retain personal data to the extent required by applicable law, provided that such retention is limited to the minimum extent and duration required, and the data remains protected in accordance with this DPA.</Sub>
        <Sub label="12.6">The Processor&apos;s obligations under this DPA with respect to any retained personal data survive termination until such data is deleted.</Sub>
      </Section>

      <Section number="13" title="Liability">
        <Sub label="13.1">Each party&apos;s liability under this DPA is subject to the limitations and exclusions of liability set forth in the Terms of Service, except that neither party&apos;s liability for breaches of Data Protection Laws shall be limited in any manner that would not be permitted under applicable law.</Sub>
        <Sub label="13.2">Each party shall indemnify the other for any losses, damages, costs, and expenses (including reasonable attorneys&apos; fees) arising from the indemnifying party&apos;s breach of this DPA, to the extent required by applicable Data Protection Laws.</Sub>
      </Section>

      <Section number="14" title="Governing Law and Jurisdiction">
        <Sub label="14.1">This DPA is governed by the same governing law specified in the Terms of Service.</Sub>
        <Sub label="14.2">To the extent required by applicable Data Protection Laws, disputes arising under this DPA relating to GDPR compliance may be brought before the courts of the EU member state in which the Controller is established or in which the Data Subjects are located.</Sub>
        <Sub label="14.3">The parties submit to the jurisdiction of the courts specified in this section for the purposes of any proceedings arising out of or in connection with this DPA.</Sub>
      </Section>

      <Box className="mt-12 pt-6 border-t border-border">
        <Text className="text-content-tertiary text-sm mb-4">
          This Data Processing Agreement is effective as of the date the Controller begins using the Service. For questions about this DPA or to request a signed copy, contact legal@alecrae.com or dpo@alecrae.com.
        </Text>
      </Box>
    </Box>
  );
}
