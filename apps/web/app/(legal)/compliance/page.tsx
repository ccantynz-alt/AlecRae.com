import type { Metadata } from "next";
import { Box, Text } from "@alecrae/ui";

export const metadata: Metadata = {
  title: "Corporate Compliance | AlecRae",
  description:
    "AlecRae's modern slavery, anti-bribery, sanctions / export-control and anti-money-laundering compliance statements.",
};

export default function CompliancePage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text as="h1" className="text-3xl font-bold text-content mb-2">
          Corporate Compliance
        </Text>
        <Text className="text-content-tertiary">
          Effective Date: April 16, 2026 &middot; Last Updated: April 16, 2026
        </Text>
      </Box>

      <Text className="text-content-secondary leading-relaxed">
        AlecRae is committed to operating ethically and lawfully in every
        jurisdiction we serve. This page brings together our public
        compliance statements on modern slavery, anti-bribery, sanctions /
        export control and anti-money-laundering. It is updated at least
        annually and at any time a material change occurs.
      </Text>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          1. Modern Slavery &amp; Human Trafficking Statement
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          This statement is made pursuant to section 54(1) of the UK
          Modern Slavery Act 2015 and the California Transparency in Supply
          Chains Act of 2010, and is provided on a voluntary basis even
          though AlecRae does not yet meet the statutory turnover threshold.
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; AlecRae has a zero-tolerance policy to modern slavery, human trafficking, forced labour and child labour.</Text>
          <Text>&bull; Our supply chain is short and professional: cloud-infrastructure vendors, financial institutions, software libraries and professional-service firms.</Text>
          <Text>&bull; Every direct vendor engagement includes contractual representations that the vendor complies with applicable labour laws and does not use forced, bonded or child labour.</Text>
          <Text>&bull; We require vendors to have an equivalent whistleblowing channel for their own staff.</Text>
          <Text>&bull; All employees and contractors complete annual training on identifying and reporting modern-slavery concerns.</Text>
          <Text>&bull; Concerns may be reported anonymously via ethics@alecrae.com.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          2. Anti-Bribery and Anti-Corruption
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          AlecRae complies with the US Foreign Corrupt Practices Act
          (FCPA), the UK Bribery Act 2010 and any equivalent anti-corruption
          law in each jurisdiction where we do business. We:
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; Prohibit offering, giving, accepting or receiving bribes or &quot;facilitation payments&quot; of any kind.</Text>
          <Text>&bull; Forbid political contributions on behalf of AlecRae.</Text>
          <Text>&bull; Cap gifts and hospitality to reasonable business-courtesy levels and require manager approval above a de-minimis threshold.</Text>
          <Text>&bull; Require vendors, agents and partners to adhere to equivalent anti-corruption standards.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          3. Export Control, Sanctions and Restricted Parties
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          AlecRae is subject to US export-control laws, including the
          Export Administration Regulations (EAR) and the regulations
          administered by the Office of Foreign Assets Control (OFAC), as
          well as equivalent UK, EU and UN sanctions regimes.
        </Text>
        <Box className="ml-6 space-y-1 text-content-secondary">
          <Text>&bull; The AlecRae Service is not available in, or for users who are ordinarily resident in, jurisdictions subject to comprehensive US sanctions (currently: Cuba, Iran, North Korea, Syria, and the Crimea, Donetsk and Luhansk regions of Ukraine).</Text>
          <Text>&bull; We will not knowingly contract with individuals or entities on the OFAC Specially Designated Nationals (SDN) list, the UK HMT Consolidated List, or the EU Consolidated Financial Sanctions list.</Text>
          <Text>&bull; Encryption technology in our products is classified as eligible for the Mass Market exception (ENC) under 15 CFR &sect; 742.15(b); a BIS notification has been filed.</Text>
          <Text>&bull; Users are responsible for complying with applicable export-control laws of their own country, including re-export restrictions.</Text>
        </Box>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          4. Anti-Money-Laundering (AML) &amp; KYC
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          Although AlecRae is not itself a regulated financial institution,
          we operate consistently with good AML practice: we collect
          minimum necessary KYC data through Stripe, monitor for unusual
          payment patterns, and cooperate with law-enforcement requests
          supported by valid legal process.
        </Text>
      </Box>

      <Box className="space-y-4">
        <Text as="h2" className="text-xl font-bold text-content">
          5. Whistleblower Protection
        </Text>
        <Text className="text-content-secondary leading-relaxed">
          Any employee, contractor, vendor or user may raise a compliance
          concern confidentially by emailing ethics@alecrae.com or via an
          independent third-party hotline listed in our employee handbook.
          Retaliation against a good-faith reporter is a dismissable
          offence.
        </Text>
      </Box>
    </Box>
  );
}
