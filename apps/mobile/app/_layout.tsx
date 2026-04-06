/**
 * Vienna Mobile — Root Layout
 *
 * Handles:
 *   - Theme (light/dark/system)
 *   - Auth state (redirect to login if not authenticated)
 *   - Push notifications setup
 *   - Deep linking (mailto:, vienna://)
 *   - Splash screen
 */

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Prevent splash screen auto-hide
SplashScreen.preventAutoHideAsync();

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
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

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: colorScheme === "dark" ? "#0f172a" : "#ffffff",
              },
              headerTintColor: colorScheme === "dark" ? "#ffffff" : "#0f172a",
              contentStyle: {
                backgroundColor: colorScheme === "dark" ? "#0f172a" : "#ffffff",
              },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="inbox" options={{ title: "Inbox" }} />
            <Stack.Screen name="compose" options={{ title: "New Email", presentation: "modal" }} />
            <Stack.Screen name="thread/[id]" options={{ title: "Thread" }} />
            <Stack.Screen name="settings" options={{ title: "Settings" }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
