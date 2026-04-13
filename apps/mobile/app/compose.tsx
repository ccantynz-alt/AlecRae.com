/**
 * AlecRae Mobile — Compose Screen (Modal)
 *
 * Email compose form with:
 *   - To / CC / BCC fields
 *   - Subject field
 *   - Body editor (plain text initially, rich text later)
 *   - Send button with loading state
 *   - Discard confirmation
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { messagesApi } from "../lib/api";
import { useAuthStore } from "../lib/store";

export default function ComposeScreen(): React.ReactElement {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const darkMode = colorScheme === "dark";
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCc, setShowCc] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const toAddresses = to
        .split(",")
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0)
        .map((addr) => ({ email: addr }));

      if (toAddresses.length === 0) {
        throw new Error("At least one recipient is required");
      }

      const ccAddresses = cc
        .split(",")
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0)
        .map((addr) => ({ email: addr }));

      await messagesApi.send({
        from: { email: user?.email ?? "me@alecrae.com" },
        to: toAddresses,
        cc: ccAddresses.length > 0 ? ccAddresses : undefined,
        subject,
        text: body,
      });
    },
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      router.back();
    },
    onError: (err: Error): void => {
      Alert.alert("Send failed", err.message);
    },
  });

  const handleSend = useCallback((): void => {
    if (!to.trim()) {
      Alert.alert("Missing recipient", "Please enter at least one recipient.");
      return;
    }
    sendMutation.mutate();
  }, [to, sendMutation]);

  const handleDiscard = useCallback((): void => {
    if (to || subject || body) {
      Alert.alert(
        "Discard draft?",
        "Your email will not be saved.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: (): void => router.back(),
          },
        ],
      );
    } else {
      router.back();
    }
  }, [to, subject, body, router]);

  const inputStyle = darkMode ? styles.inputDark : styles.inputLight;
  const textColor = darkMode ? styles.textLight : styles.textDark;

  return (
    <KeyboardAvoidingView
      style={[styles.container, darkMode ? styles.bgDark : styles.bgLight]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      {/* Header */}
      <View style={[styles.header, darkMode ? styles.headerDark : styles.headerLight]}>
        <Pressable
          onPress={handleDiscard}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Discard email"
        >
          <Text style={styles.discardText}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, textColor]}>New Email</Text>
        <Pressable
          onPress={handleSend}
          style={[
            styles.sendButton,
            sendMutation.isPending && styles.sendButtonDisabled,
          ]}
          disabled={sendMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Send email"
        >
          {sendMutation.isPending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>

      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        {/* To */}
        <View style={[styles.fieldRow, darkMode ? styles.fieldBorderDark : styles.fieldBorderLight]}>
          <Text style={styles.fieldLabel}>To:</Text>
          <TextInput
            style={[styles.fieldInput, inputStyle]}
            value={to}
            onChangeText={setTo}
            placeholder="recipient@example.com"
            placeholderTextColor="#64748b"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="To field"
          />
          {!showCc ? (
            <Pressable
              onPress={(): void => setShowCc(true)}
              style={styles.ccToggle}
              accessibilityRole="button"
              accessibilityLabel="Show CC field"
            >
              <Text style={styles.ccToggleText}>Cc</Text>
            </Pressable>
          ) : null}
        </View>

        {/* CC */}
        {showCc ? (
          <View style={[styles.fieldRow, darkMode ? styles.fieldBorderDark : styles.fieldBorderLight]}>
            <Text style={styles.fieldLabel}>Cc:</Text>
            <TextInput
              style={[styles.fieldInput, inputStyle]}
              value={cc}
              onChangeText={setCc}
              placeholder="cc@example.com"
              placeholderTextColor="#64748b"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="CC field"
            />
          </View>
        ) : null}

        {/* Subject */}
        <View style={[styles.fieldRow, darkMode ? styles.fieldBorderDark : styles.fieldBorderLight]}>
          <Text style={styles.fieldLabel}>Subject:</Text>
          <TextInput
            style={[styles.fieldInput, inputStyle]}
            value={subject}
            onChangeText={setSubject}
            placeholder="Email subject"
            placeholderTextColor="#64748b"
            accessibilityLabel="Subject field"
          />
        </View>

        {/* Body */}
        <TextInput
          style={[styles.bodyInput, inputStyle]}
          value={body}
          onChangeText={setBody}
          placeholder="Write your email..."
          placeholderTextColor="#64748b"
          multiline
          textAlignVertical="top"
          scrollEnabled={false}
          accessibilityLabel="Email body"
        />
      </ScrollView>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerDark: {
    borderBottomColor: "#1e293b",
  },
  headerLight: {
    borderBottomColor: "#e2e8f0",
  },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  discardText: {
    color: "#64748b",
    fontSize: 15,
    fontWeight: "500",
  },
  sendButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 64,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  form: {
    flex: 1,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  fieldBorderDark: {
    borderBottomColor: "#1e293b",
  },
  fieldBorderLight: {
    borderBottomColor: "#e2e8f0",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    width: 60,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  inputDark: {
    color: "#e2e8f0",
  },
  inputLight: {
    color: "#1e293b",
  },
  ccToggle: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  ccToggleText: {
    color: "#3b82f6",
    fontSize: 13,
    fontWeight: "600",
  },
  bodyInput: {
    flex: 1,
    minHeight: 200,
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 15,
    lineHeight: 22,
  },
  textLight: {
    color: "#e2e8f0",
  },
  textDark: {
    color: "#1e293b",
  },
});
