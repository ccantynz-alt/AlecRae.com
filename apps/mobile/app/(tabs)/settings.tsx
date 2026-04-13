/**
 * AlecRae Mobile — Settings Screen
 *
 * User preferences and account management. Sections:
 *   - Account info
 *   - Appearance (theme, density, accent color)
 *   - Notifications toggle
 *   - About / version
 *   - Sign out
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  useColorScheme,
} from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../lib/store";
import { useAppPreferences } from "../../lib/store";

const APP_VERSION: string = Constants.expoConfig?.version ?? "0.1.0";

export default function SettingsScreen(): React.ReactElement {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const darkMode = colorScheme === "dark";

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const theme = useAppPreferences((s) => s.theme);
  const setTheme = useAppPreferences((s) => s.setTheme);
  const density = useAppPreferences((s) => s.density);
  const setDensity = useAppPreferences((s) => s.setDensity);
  const notificationsEnabled = useAppPreferences((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useAppPreferences(
    (s) => s.setNotificationsEnabled,
  );

  const handleLogout = useCallback((): void => {
    void logout().then((): void => {
      router.replace("/");
    });
  }, [logout, router]);

  const themeOptions: Array<{ label: string; value: "light" | "dark" | "system" }> = [
    { label: "Light", value: "light" },
    { label: "Dark", value: "dark" },
    { label: "System", value: "system" },
  ];

  const densityOptions: Array<{
    label: string;
    value: "compact" | "comfortable" | "spacious";
  }> = [
    { label: "Compact", value: "compact" },
    { label: "Comfortable", value: "comfortable" },
    { label: "Spacious", value: "spacious" },
  ];

  return (
    <ScrollView
      style={[styles.container, darkMode ? styles.bgDark : styles.bgLight]}
      contentContainerStyle={styles.content}
    >
      {/* Account Section */}
      <Text style={[styles.sectionTitle, darkMode ? styles.textMutedDark : styles.textMuted]}>
        ACCOUNT
      </Text>
      <View style={[styles.card, darkMode ? styles.cardDark : styles.cardLight]}>
        {user ? (
          <View>
            <Text style={[styles.userName, darkMode ? styles.textLight : styles.textDark]}>
              {user.name}
            </Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        ) : (
          <Text style={styles.userEmail}>Not signed in</Text>
        )}
      </View>

      {/* Appearance Section */}
      <Text style={[styles.sectionTitle, darkMode ? styles.textMutedDark : styles.textMuted]}>
        APPEARANCE
      </Text>
      <View style={[styles.card, darkMode ? styles.cardDark : styles.cardLight]}>
        <Text style={[styles.settingLabel, darkMode ? styles.textLight : styles.textDark]}>
          Theme
        </Text>
        <View style={styles.optionRow}>
          {themeOptions.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.optionChip,
                theme === option.value && styles.optionChipActive,
              ]}
              onPress={(): void => setTheme(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: theme === option.value }}
              accessibilityLabel={`${option.label} theme`}
            >
              <Text
                style={[
                  styles.optionChipText,
                  theme === option.value && styles.optionChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.settingDivider} />

        <Text style={[styles.settingLabel, darkMode ? styles.textLight : styles.textDark]}>
          Density
        </Text>
        <View style={styles.optionRow}>
          {densityOptions.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.optionChip,
                density === option.value && styles.optionChipActive,
              ]}
              onPress={(): void => setDensity(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: density === option.value }}
              accessibilityLabel={`${option.label} density`}
            >
              <Text
                style={[
                  styles.optionChipText,
                  density === option.value && styles.optionChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Notifications Section */}
      <Text style={[styles.sectionTitle, darkMode ? styles.textMutedDark : styles.textMuted]}>
        NOTIFICATIONS
      </Text>
      <View style={[styles.card, darkMode ? styles.cardDark : styles.cardLight]}>
        <View style={styles.switchRow}>
          <Text style={[styles.settingLabel, darkMode ? styles.textLight : styles.textDark]}>
            Push Notifications
          </Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: "#334155", true: "#3b82f6" }}
            thumbColor="#ffffff"
            accessibilityLabel="Toggle push notifications"
          />
        </View>
      </View>

      {/* About Section */}
      <Text style={[styles.sectionTitle, darkMode ? styles.textMutedDark : styles.textMuted]}>
        ABOUT
      </Text>
      <View style={[styles.card, darkMode ? styles.cardDark : styles.cardLight]}>
        <View style={styles.aboutRow}>
          <Text style={[styles.aboutLabel, darkMode ? styles.textLight : styles.textDark]}>
            Version
          </Text>
          <Text style={styles.aboutValue}>{APP_VERSION}</Text>
        </View>
        <View style={styles.settingDivider} />
        <View style={styles.aboutRow}>
          <Text style={[styles.aboutLabel, darkMode ? styles.textLight : styles.textDark]}>
            Build
          </Text>
          <Text style={styles.aboutValue}>Beta</Text>
        </View>
      </View>

      {/* Sign Out */}
      {user ? (
        <Pressable
          style={styles.signOutButton}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="Sign out of AlecRae"
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      ) : null}

      <Text style={styles.footerText}>
        AlecRae {APP_VERSION} — The reinvention of email
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgDark: {
    backgroundColor: "#0f172a",
  },
  bgLight: {
    backgroundColor: "#f8fafc",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 64,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 24,
    paddingHorizontal: 4,
  },
  textMutedDark: {
    color: "#64748b",
  },
  textMuted: {
    color: "#94a3b8",
  },
  textLight: {
    color: "#e2e8f0",
  },
  textDark: {
    color: "#1e293b",
  },
  card: {
    borderRadius: 16,
    padding: 16,
  },
  cardDark: {
    backgroundColor: "#1e293b",
  },
  cardLight: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  userName: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#64748b",
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 10,
  },
  settingDivider: {
    height: 1,
    backgroundColor: "rgba(148, 163, 184, 0.2)",
    marginVertical: 16,
  },
  optionRow: {
    flexDirection: "row",
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(148, 163, 184, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
    minHeight: 44,
    justifyContent: "center",
  },
  optionChipActive: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "#3b82f6",
  },
  optionChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },
  optionChipTextActive: {
    color: "#3b82f6",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 36,
  },
  aboutLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  aboutValue: {
    fontSize: 14,
    color: "#64748b",
  },
  signOutButton: {
    marginTop: 32,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
  },
  signOutText: {
    color: "#ef4444",
    fontWeight: "600",
    fontSize: 15,
  },
  footerText: {
    textAlign: "center",
    color: "rgba(148, 163, 184, 0.4)",
    fontSize: 11,
    marginTop: 32,
  },
});
