import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AlecRae · Admin",
  description: "AlecRae admin console — platform stats, users, domains, deliverability.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
