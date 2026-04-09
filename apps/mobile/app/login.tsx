/**
 * Vienna Mobile — Login Screen
 *
 * Authentication screen with email/password login.
 * Passkey/WebAuthn support will be added when the backend is wired.
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "../lib/store";

export default function LoginScreen(): React.ReactElement {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const darkMode = colorScheme === "dark";

  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const authError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = useCallback((): void => {
    if (!email.trim() || !password.trim()) return;
    void login(email.trim(), password).then((): void => {
      const state = useAuthStore.getState();
      if (state.isAuthenticated) {
        router.replace("/(tabs)/inbox");
      }
    });
  }, [email, password, login, router]);

  const handleEmailChange = useCallback(
    (text: string): void => {
      clearError();
      setEmail(text);
    },
    [clearError],
  );

  const handlePasswordChange = useCallback(
    (text: string): void => {
      clearError();
      setPassword(text);
    },
    [clearError],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, darkMode ? styles.bgDark : styles.bgLight]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <Text style={styles.logo}>Vienna</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        {authError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        ) : null}

        <TextInput
          style={[styles.input, darkMode ? styles.inputDark : styles.inputLight]}
          placeholder="Email"
          placeholderTextColor="#64748b"
          value={email}
          onChangeText={handleEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          accessibilityLabel="Email address"
        />

        <TextInput
          style={[styles.input, darkMode ? styles.inputDark : styles.inputLight]}
          placeholder="Password"
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={handlePasswordChange}
          secureTextEntry
          autoComplete="password"
          accessibilityLabel="Password"
        />

        <Pressable
          style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.loginButtonText}>Sign In</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.backLink}
          onPress={(): void => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backLinkText}>Back</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    backgroundColor: "#ffffff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logo: {
    fontSize: 48,
    fontWeight: "700",
    color: "#3b82f6",
    letterSpacing: -2,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 40,
  },
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 13,
    textAlign: "center",
  },
  input: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
  },
  inputDark: {
    backgroundColor: "#1e293b",
    borderColor: "#334155",
    color: "#e2e8f0",
  },
  inputLight: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    color: "#1e293b",
  },
  loginButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    minHeight: 48,
    justifyContent: "center",
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  backLink: {
    alignItems: "center",
    marginTop: 24,
    minHeight: 44,
    justifyContent: "center",
  },
  backLinkText: {
    color: "#64748b",
    fontSize: 14,
  },
});
