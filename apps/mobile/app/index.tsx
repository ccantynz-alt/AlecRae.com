/**
 * Vienna Mobile — Coming Soon Landing
 *
 * Initial entry screen for the mobile app during beta.
 * Will be replaced with proper auth/inbox flow once backend is live.
 */

import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { useEffect } from "react";

export default function ComingSoonScreen() {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000 }),
        withTiming(1, { duration: 1000 }),
      ),
      -1,
      false,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: 2 - pulseScale.value,
  }));

  return (
    <LinearGradient
      colors={["#020617", "#1e3a8a", "#0c4a6e"]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.content}>
        {/* Logo */}
        <Text style={styles.logo}>Vienna</Text>

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
          <Feature title="AI-Native" subtitle="Grammar, dictation, compose built-in" />
          <Feature title="Universal" subtitle="Gmail, Outlook, all your accounts" />
          <Feature title="Private" subtitle="E2E encryption, no ads, no tracking" />
          <Feature title="Instant" subtitle="Sub-100ms inbox, local-first" />
        </View>

        {/* Footer */}
        <Text style={styles.footer}>© 2026 Vienna · The reinvention of email</Text>
      </View>
    </LinearGradient>
  );
}

function Feature({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.feature}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
