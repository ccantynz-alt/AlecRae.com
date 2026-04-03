"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { Box } from "../primitives/box";
import { Text } from "../primitives/text";
import { Button } from "../primitives/button";
import { Card } from "../primitives/card";

export interface DnsRecord {
  type: "TXT" | "CNAME" | "MX" | "DKIM" | "SPF" | "DMARC";
  name: string;
  value: string;
  verified: boolean;
}

export type DomainVerificationState = "pending" | "verified" | "failed" | "expired";

export interface DomainCardProps extends HTMLAttributes<HTMLDivElement> {
  domain: string;
  verificationState: DomainVerificationState;
  dnsRecords: DnsRecord[];
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  addedAt: string;
  onVerify?: () => void;
  onRemove?: () => void;
  onViewRecords?: () => void;
  className?: string;
}

const stateStyles: Record<DomainVerificationState, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Pending" },
  verified: { bg: "bg-green-50", text: "text-green-700", label: "Verified" },
  failed: { bg: "bg-red-50", text: "text-red-700", label: "Failed" },
  expired: { bg: "bg-gray-50", text: "text-gray-700", label: "Expired" },
};

export const DomainCard = forwardRef<HTMLDivElement, DomainCardProps>(function DomainCard(
  {
    domain,
    verificationState,
    dnsRecords,
    spfVerified,
    dkimVerified,
    dmarcVerified,
    addedAt,
    onVerify,
    onRemove,
    onViewRecords,
    className = "",
    ...props
  },
  ref
) {
  const state = stateStyles[verificationState];

  return (
    <Card ref={ref} className={className} hoverable {...props}>
      <Box className="flex items-start justify-between mb-4">
        <Box>
          <Text variant="heading-md">{domain}</Text>
          <Text variant="caption">Added {addedAt}</Text>
        </Box>
        <Text
          as="span"
          variant="caption"
          className={`px-2 py-1 rounded-full font-medium ${state.bg} ${state.text}`}
        >
          {state.label}
        </Text>
      </Box>

      <Box className="flex gap-4 mb-4">
        <AuthBadge label="SPF" verified={spfVerified} />
        <AuthBadge label="DKIM" verified={dkimVerified} />
        <AuthBadge label="DMARC" verified={dmarcVerified} />
      </Box>

      <Box className="mb-4">
        <Text variant="label" className="mb-2">
          DNS Records ({dnsRecords.filter((r) => r.verified).length}/{dnsRecords.length} verified)
        </Text>
        <Box className="space-y-1">
          {dnsRecords.slice(0, 3).map((record, i) => (
            <Box key={i} className="flex items-center gap-2">
              <Text
                as="span"
                variant="caption"
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  record.verified ? "bg-status-success" : "bg-status-warning"
                }`}
              />
              <Text variant="body-sm" className="font-mono truncate">
                {record.type}: {record.name}
              </Text>
            </Box>
          ))}
          {dnsRecords.length > 3 && (
            <Text variant="caption" muted>
              +{dnsRecords.length - 3} more records
            </Text>
          )}
        </Box>
      </Box>

      <Box className="flex items-center gap-2 pt-4 border-t border-border">
        {verificationState !== "verified" && (
          <Button variant="primary" size="sm" onClick={onVerify}>
            Verify Now
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onViewRecords}>
          View Records
        </Button>
        <Box className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </Box>
    </Card>
  );
});

DomainCard.displayName = "DomainCard";

function AuthBadge({ label, verified }: { label: string; verified: boolean }) {
  return (
    <Box className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
      verified ? "bg-green-50" : "bg-surface-tertiary"
    }`}>
      <Text
        as="span"
        variant="caption"
        className={`w-1.5 h-1.5 rounded-full ${verified ? "bg-status-success" : "bg-content-tertiary"}`}
      />
      <Text variant="caption" className={`font-medium ${verified ? "text-green-700" : "text-content-secondary"}`}>
        {label}
      </Text>
    </Box>
  );
}

AuthBadge.displayName = "AuthBadge";
