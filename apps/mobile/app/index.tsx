/**
 * AlecRae Mobile — Entry Screen
 *
 * Routes the user to the appropriate destination:
 *   - If authenticated: redirect to inbox tabs
 *   - If not authenticated: show the Coming Soon / login screen
 *
 * During beta phase, shows the Coming Soon landing.
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useAuthStore } from "../lib/store";

export default function EntryScreen(): React.ReactElement {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect((): void => {
    if (!isLoading && isAuthenticated) {
      router.replace("/(tabs)/inbox");
    }
  }, [isLoading, isAuthenticated, router]);

  return <ComingSoonContent />;
}

function ComingSoonContent(): React.ReactElement {
  const pulseScale = useSharedValue(1);

  useEffect((): void => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000 }),
        withTiming(1, { duration: 1000 }),
      ),
      -1,
      false,
    );
  }, [pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: 2 - pulseScale.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo */}
        <Text style={styles.logo}>AlecRae</Text>

        {/* Tagline */}
        <Text style={styles.tagline}>Email, finally.</Text>

        {/* Coming Soon Badge */}
        <View style={styles.badge}>
          <View style={styles.badgeDot}>
            <Animated.View style={[styles.badgeDotPulse, pulseStyle]} />
            <View style={styles.badgeDotCore} />
          </View>
          <Text style={styles.badgeText}>COMING SOON</Text>
        </View>

        {/* Description */}
        <Text style={styles.description}>
          The fastest, smartest, most beautiful email client ever made.
        </Text>
        <Text style={styles.description}>
          One subscription. All your accounts. AI in every layer.
        </Text>

        {/* Features */}
        <View style={styles.features}>
          <FeatureCard title="AI-Native" subtitle="Grammar, dictation, compose built-in" />
          <FeatureCard title="Universal" subtitle="Gmail, Outlook, all your accounts" />
          <FeatureCard title="Private" subtitle="E2E encryption, no ads, no tracking" />
          <FeatureCard title="Instant" subtitle="Sub-100ms inbox, local-first" />
        </View>

        {/* Footer */}
        <Text style={styles.footer}>2026 AlecRae. The reinvention of email.</Text>
      </View>
    </View>
  );
}

interface FeatureCardProps {
  readonly title: string;
  readonly subtitle: string;
}

function FeatureCard({ title, subtitle }: FeatureCardProps): React.ReactElement {
  return (
    <Pressable
      style={styles.feature}
      accessibilityRole="text"
      accessibilityLabel={`${title}: ${subtitle}`}
    >
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  logo: {
    fontSize: 72,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -3,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 22,
    fontWeight: "300",
    color: "#dbeafe",
    marginBottom: 32,
    letterSpacing: -0.5,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    marginBottom: 40,
  },
  badgeDot: {
    width: 12,
    height: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDotPulse: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22d3ee",
  },
  badgeDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#06b6d4",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#dbeafe",
    letterSpacing: 1.5,
  },
  description: {
    fontSize: 16,
    color: "#bfdbfe",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 4,
  },
  features: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 48,
    maxWidth: 360,
  },
  feature: {
    width: "45%",
    minHeight: 44,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 4,
  },
  featureSubtitle: {
    fontSize: 11,
    color: "#93c5fd",
    textAlign: "center",
    lineHeight: 14,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    fontSize: 11,
    color: "rgba(191, 219, 254, 0.4)",
    fontWeight: "300",
  },
});
