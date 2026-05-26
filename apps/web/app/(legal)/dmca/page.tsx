import { Box, Text, Card, CardContent } from "@alecrae/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DMCA / Copyright Policy - AlecRae",
  description:
    "AlecRae DMCA and Copyright Policy covering takedown procedures, counter-notifications, and designated agent information.",
};

export default function DMCAPage() {
  return (
    <Box className="space-y-10">
      <Box>
        <Text variant="heading-lg" className="font-bold mb-2">
          DMCA / Copyright Policy
        </Text>
        <Text variant="body-sm" muted>
          Effective Date: April 1, 2026 &middot; Last Updated: April 1, 2026
        </Text>
      </Box>

      <Text variant="body-md" className="text-content-secondary leading-relaxed">
        AlecRae, Inc. (&quot;AlecRae,&quot; &quot;we,&quot; &quot;us,&quot;
        &quot;our&quot;) respects the intellectual property rights of others and
        expects our users to do the same. In accordance with the Digital Millennium
        Copyright Act of 1998 (&quot;DMCA&quot;), codified at 17 U.S.C. &sect; 512,
        we will respond expeditiously to claims of copyright infringement committed
        using the AlecRae platform that are reported to our designated copyright agent.
      </Text>

      {/* Section 1 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          1. DMCA Safe Harbor Notice
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          AlecRae is a provider of email infrastructure services and acts as an
          intermediary for the transmission and storage of electronic communications.
          Pursuant to 17 U.S.C. &sect; 512, AlecRae qualifies for safe harbor
          protection as a service provider. We do not actively monitor the content of
          emails transmitted through our platform but will act promptly upon receiving
          proper notification of alleged copyright infringement in accordance with the
          procedures set forth below.
        </Text>
      </Box>

      {/* Section 2 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          2. Designated Agent
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          AlecRae&apos;s designated agent for receiving notifications of claimed
          copyright infringement is:
        </Text>
        <Card className="bg-surface-subtle">
          <CardContent>
            <Box className="space-y-2">
              <Text variant="body-md" className="font-semibold text-content">
                DMCA Agent
              </Text>
              <Text variant="body-md" className="text-content-secondary">
                AlecRae, Inc.
              </Text>
              <Text variant="body-md" className="text-content-secondary">
                Attn: Copyright Agent / Legal Department
              </Text>
              <Text variant="body-md" className="text-content-secondary">
                Email: dmca@alecrae.com
              </Text>
              <Text variant="body-md" className="text-content-secondary">
                Mailing Address: 548 Market Street, Suite 45000, San Francisco, CA 94104
              </Text>
            </Box>
          </CardContent>
        </Card>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Our designated agent is registered with the U.S. Copyright Office in
          accordance with 17 U.S.C. &sect; 512(c)(2).
        </Text>
      </Box>

      {/* Section 3 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          3. Takedown Notification Procedure
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          If you believe that content transmitted or stored through the AlecRae
          platform infringes your copyright, you may submit a written notification to
          our designated agent. Pursuant to 17 U.S.C. &sect; 512(c)(3), your
          notification must include the following elements:
        </Text>
        <Box className="space-y-3 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">a.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              A physical or electronic signature of the copyright owner or a person
              authorized to act on behalf of the copyright owner.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">b.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Identification of the copyrighted work claimed to have been infringed,
              or, if multiple copyrighted works are covered by a single notification,
              a representative list of such works.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">c.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Identification of the material that is claimed to be infringing or to
              be the subject of infringing activity, and information reasonably
              sufficient to permit AlecRae to locate the material (e.g., message IDs,
              account identifiers, timestamps, or URLs).
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">d.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Information reasonably sufficient to permit AlecRae to contact the
              complaining party, such as an address, telephone number, and email address.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">e.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              A statement that the complaining party has a good faith belief that use
              of the material in the manner complained of is not authorized by the
              copyright owner, its agent, or the law.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">f.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              A statement that the information in the notification is accurate, and
              under penalty of perjury, that the complaining party is authorized to
              act on behalf of the owner of an exclusive right that is allegedly
              infringed.
            </Text>
          </Box>
        </Box>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Upon receipt of a valid takedown notification, AlecRae will act expeditiously
          to remove or disable access to the allegedly infringing material and will
          notify the affected user of the takedown.
        </Text>
      </Box>

      {/* Section 4 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          4. Counter-Notification Procedure
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          If you believe that material you posted was removed or access to it was
          disabled as a result of a mistake or misidentification, you may file a
          counter-notification with our designated agent. Pursuant to 17 U.S.C.
          &sect; 512(g)(3), your counter-notification must include:
        </Text>
        <Box className="space-y-3 pl-6">
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">a.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Your physical or electronic signature.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">b.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Identification of the material that has been removed or to which access
              has been disabled, and the location at which the material appeared before
              it was removed or disabled.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">c.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              A statement under penalty of perjury that you have a good faith belief
              that the material was removed or disabled as a result of mistake or
              misidentification.
            </Text>
          </Box>
          <Box className="flex gap-3">
            <Text variant="body-md" className="text-brand-600 font-bold">d.</Text>
            <Text variant="body-md" className="text-content-secondary leading-relaxed">
              Your name, address, and telephone number, and a statement that you
              consent to the jurisdiction of the federal district court for the
              judicial district in which your address is located (or, if outside the
              United States, any judicial district in which AlecRae may be found), and
              that you will accept service of process from the person who provided the
              original notification or an agent of such person.
            </Text>
          </Box>
        </Box>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          Upon receipt of a valid counter-notification, AlecRae will forward a copy
          to the original complaining party. If the original complaining party does
          not file a court action seeking to restrain the allegedly infringing activity
          within 10 to 14 business days, AlecRae will restore the removed material.
        </Text>
      </Box>

      {/* Section 5 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          5. Repeat Infringer Policy
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          In accordance with the DMCA and other applicable law, AlecRae has adopted a
          policy of terminating, in appropriate circumstances and at our sole
          discretion, the accounts of users who are deemed to be repeat infringers.
          AlecRae may also, at its sole discretion, limit access to the Service and/or
          terminate the accounts of any users who infringe any intellectual property
          rights of others, whether or not there is any repeat infringement.
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          An account holder will generally be considered a repeat infringer if they
          receive three or more valid DMCA takedown notifications within any 12-month
          period. However, AlecRae reserves the right to terminate accounts after fewer
          notifications where circumstances warrant.
        </Text>
      </Box>

      {/* Section 6 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          6. Good Faith Requirement
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          All DMCA notifications and counter-notifications must be submitted in good
          faith. The DMCA requires that the complaining party have a good faith belief
          that the use of the copyrighted material is not authorized. Before submitting
          a takedown notification, copyright owners and their agents should carefully
          consider whether the use may constitute fair use under 17 U.S.C. &sect; 107.
          Failure to consider fair use prior to submitting a takedown notification may
          constitute a misrepresentation under the DMCA.
        </Text>
      </Box>

      {/* Section 7 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          7. Misrepresentation Warning
        </Text>
        <Card className="border-status-error/30 bg-status-error/5">
          <CardContent>
            <Text variant="body-md" className="text-content leading-relaxed">
              <Text as="span" className="font-bold">Warning:</Text> Under Section
              512(f) of the DMCA, any person who knowingly materially misrepresents
              that material or activity is infringing, or that material or activity
              was removed or disabled by mistake or misidentification, may be subject
              to liability for damages, including costs and attorneys&apos; fees
              incurred by the alleged infringer, the copyright owner or its licensee,
              or the service provider. Submitting a DMCA notification or
              counter-notification constitutes a legal declaration under penalty of
              perjury. Please ensure that all information provided is truthful and
              accurate.
            </Text>
          </CardContent>
        </Card>
      </Box>

      {/* Section 8 */}
      <Box className="space-y-4">
        <Text variant="heading-md" className="font-semibold">
          8. Modifications to This Policy
        </Text>
        <Text variant="body-md" className="text-content-secondary leading-relaxed">
          AlecRae reserves the right to modify this DMCA / Copyright Policy at any
          time. Changes will be posted on this page with an updated &quot;Last
          Updated&quot; date. Your continued use of the Service after any
          modifications constitutes acceptance of the revised policy.
        </Text>
      </Box>

      <Box className="border-t border-border pt-6">
        <Text variant="body-sm" muted>
          To report copyright infringement, contact our DMCA agent at dmca@alecrae.com.
          For general legal inquiries, contact legal@alecrae.com.
        </Text>
      </Box>
    </Box>
  );
}
