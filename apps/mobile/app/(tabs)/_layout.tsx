/**
 * Vienna Mobile — Tab Layout
 *
 * Bottom tab navigation with Inbox, Search, and Settings.
 * Compose is a modal (presented from Inbox via FAB), not a tab.
 */

import React from "react";
import { Tabs } from "expo-router";
import { useColorScheme, Text, StyleSheet } from "react-native";

function TabIcon({
  label,
  focused,
}: {
  readonly label: string;
  readonly focused: boolean;
}): React.ReactElement {
  return (
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      {label}
    </Text>
  );
}

export default function TabLayout(): React.ReactElement {
  const colorScheme = useColorScheme();
  const darkMode = colorScheme === "dark";

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: darkMode ? "#0f172a" : "#ffffff",
        },
        headerTintColor: darkMode ? "#ffffff" : "#0f172a",
        tabBarStyle: {
          backgroundColor: darkMode ? "#0f172a" : "#ffffff",
          borderTopColor: darkMode ? "#1e293b" : "#e2e8f0",
          height: 84,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: darkMode ? "#64748b" : "#94a3b8",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ focused }): React.ReactElement => (
            <TabIcon label="IN" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Inbox tab",
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ focused }): React.ReactElement => (
            <TabIcon label="SR" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Search tab",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }): React.ReactElement => (
            <TabIcon label="ST" focused={focused} />
          ),
          tabBarAccessibilityLabel: "Settings tab",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 1,
  },
  tabIconFocused: {
    color: "#3b82f6",
  },
});
