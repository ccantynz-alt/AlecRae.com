"use client";

import { Box, Text, Button, Card, CardContent } from "@alecrae/ui";

export default function ForgotPasswordPage(): React.ReactElement {
  return (
    <Box className="min-h-full flex items-center justify-center px-4 py-12 bg-surface-secondary">
      <Box className="w-full max-w-md">
        <Box className="text-center mb-8">
          <Text variant="heading-lg" className="text-brand-600 font-bold mb-2">
            AlecRae
          </Text>
          <Text variant="display-sm">Account recovery</Text>
          <Text variant="body-md" muted className="mt-2">
            Let&apos;s get you back in
          </Text>
        </Box>

        <Card>
          <CardContent>
            <Box className="space-y-6">
              <Box>
                <Text variant="heading-sm" className="mb-2">
                  Sign in with a passkey
                </Text>
                <Text variant="body-sm" muted className="mb-4">
                  Passkeys are our primary authentication method. If you&apos;ve set one up on any of your devices, you can use it to sign in without a password.
                </Text>
                <Box as="a" href="/login" className="inline-block w-full">
                  <Button variant="primary" size="lg" className="w-full">
                    Return to sign in
                  </Button>
                </Box>
              </Box>

              <Box className="border-t border-border pt-6">
                <Text variant="heading-sm" className="mb-2">
                  Need more help?
                </Text>
                <Text variant="body-sm" muted>
                  Email{" "}
                  <Box
                    as="a"
                    href="mailto:support@alecrae.com"
                    className="inline text-brand-600 hover:text-brand-700 font-medium"
                  >
                    <Text as="span" variant="body-sm" className="text-brand-600">
                      support@alecrae.com
                    </Text>
                  </Box>{" "}
                  from the address tied to your account and our team will verify your identity and help you regain access.
                </Text>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Box className="text-center mt-6">
          <Text variant="body-sm" muted>
            Don&apos;t have an account?{" "}
          </Text>
          <Box as="a" href="/register" className="inline">
            <Text as="span" variant="body-sm" className="text-brand-600 hover:text-brand-700 font-medium">
              Create one
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
