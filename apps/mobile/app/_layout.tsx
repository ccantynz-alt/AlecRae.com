/**
 * AlecRae Mobile — Root Layout
 *
 * Handles:
 *   - Theme (light/dark/system)
 *   - Auth state (redirect to login if not authenticated)
 *   - Push notifications setup
 *   - Deep linking (mailto:, alecrae://)
 *   - Splash screen hold until auth is resolved
 */

import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../lib/store";

// Prevent splash screen auto-hide until auth check completes
SplashScreen.preventAutoHideAsync();

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async (): Promise<Notifications.NotificationBehavior> => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout(): React.ReactElement {
  const colorScheme = useColorScheme();
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect((): void => {
    void checkAuth();
  }, [checkAuth]);

  useEffect((): void => {
    if (!isLoading) {
      void SplashScreen.hideAsync();
    }
  }, [isLoading]);

  const darkMode = colorScheme === "dark";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={darkMode ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: darkMode ? "#0f172a" : "#ffffff",
              },
              headerTintColor: darkMode ? "#ffffff" : "#0f172a",
              contentStyle: {
                backgroundColor: darkMode ? "#0f172a" : "#ffffff",
              },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="compose"
              options={{ title: "New Email", presentation: "modal" }}
            />
            <Stack.Screen name="thread/[id]" options={{ title: "Thread" }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
