import type { Metadata } from "next";
import { ThemeProvider, Box } from "@emailed/ui";

export const metadata: Metadata = {
  title: "Sign In - Vienna Admin",
  description: "Sign in to the Vienna administration dashboard via SSO or API key.",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box className="h-full">
      <ThemeProvider mode="dark">
        {children}
      </ThemeProvider>
    </Box>
  );
}
