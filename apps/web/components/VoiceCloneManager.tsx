"use client";

/**
 * VoiceCloneManager — Page component for managing voice clone profiles (S4).
 *
 * Shows all voice profiles for the current account. Allows creating, training,
 * retraining, selecting defaults, and deleting profiles.
 *
 * Usage:
 *   <VoiceCloneManager />
 */

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  VoiceProfileSelector,
  type VoiceProfileData,
  Box,
  Text,
  Button,
  Input,
  Card,
  CardHeader,
  CardContent,
} from "@alecrae/ui";
import { voiceCloneApi } from "../lib/api";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ManagerState {
  profiles: VoiceProfileData[];
  selectedProfileId: string | null;
  loading: boolean;
  error: string | null;
}

interface TrainingResult {
  profileId: string;
  sampleCount: number;
  confidenceScore: number;
  formalityLevel: string;
  emojiUsage: number;
  signaturePhrasesFound: number;
  characteristicWordsFound: number;
  trainedAt: string;
}

interface CreateFormState {
  visible: boolean;
  name: string;
  isDefault: boolean;
  submitting: boolean;
}

const INITIAL_STATE: ManagerState = {
  profiles: [],
  selectedProfileId: null,
  loading: true,
  error: null,
};

const INITIAL_CREATE_FORM: CreateFormState = {
  visible: false,
  name: "",
  isDefault: false,
  submitting: false,
};

// ─── Component ──────────────────────────────────────────────────────────────

export function VoiceCloneManager(): React.ReactElement {
  const [state, setState] = useState<ManagerState>(INITIAL_STATE);
  const [createForm, setCreateForm] = useState<CreateFormState>(INITIAL_CREATE_FORM);
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);

  // ── Fetch profiles ──────────────────────────────────────────────────────

  const fetchProfiles = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await voiceCloneApi.listProfiles();
      const profiles = res.data;
      const defaultProfile = profiles.find(
        (p: VoiceProfileData) => p.isDefault,
      );
      setState({
        profiles,
        selectedProfileId: defaultProfile?.id ?? profiles[0]?.id ?? null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load profiles",
      }));
    }
  }, []);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  // ── Create profile ────────────────────────────────────────────────────

  const handleShowCreate = useCallback((): void => {
    setCreateForm({ ...INITIAL_CREATE_FORM, visible: true });
  }, []);

  const handleCreateSubmit = useCallback(async (): Promise<void> => {
    if (!createForm.name.trim()) return;
    setCreateForm((prev) => ({ ...prev, submitting: true }));
    try {
      await voiceCloneApi.createProfile({
        name: createForm.name.trim(),
        isDefault: createForm.isDefault,
      });
      setCreateForm(INITIAL_CREATE_FORM);
      await fetchProfiles();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "Failed to create profile",
      }));
      setCreateForm((prev) => ({ ...prev, submitting: false }));
    }
  }, [createForm.name, createForm.isDefault, fetchProfiles]);

  // ── Train / Retrain ───────────────────────────────────────────────────

  const handleTrain = useCallback(
    async (profileId: string): Promise<void> => {
      // Optimistically mark as training
      setState((prev) => ({
        ...prev,
        profiles: prev.profiles.map((p) =>
          p.id === profileId ? { ...p, isTraining: true } : p,
        ),
      }));
      setTrainingResult(null);

      try {
        const res = await voiceCloneApi.trainProfile(profileId, {
          sampleSize: 100,
        });
        setTrainingResult(res.data);
        await fetchProfiles();
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Training failed",
          profiles: prev.profiles.map((p) =>
            p.id === profileId ? { ...p, isTraining: false } : p,
          ),
        }));
      }
    },
    [fetchProfiles],
  );

  // ── Delete profile ────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (profileId: string): Promise<void> => {
      try {
        await voiceCloneApi.deleteProfile(profileId);
        if (state.selectedProfileId === profileId) {
          setState((prev) => ({ ...prev, selectedProfileId: null }));
        }
        await fetchProfiles();
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Failed to delete profile",
        }));
      }
    },
    [state.selectedProfileId, fetchProfiles],
  );

  // ── Select profile ────────────────────────────────────────────────────

  const handleSelect = useCallback((profileId: string): void => {
    setState((prev) => ({ ...prev, selectedProfileId: profileId }));
  }, []);

  // ── Selected profile detail ───────────────────────────────────────────

  const selectedProfile = state.profiles.find(
    (p) => p.id === state.selectedProfileId,
  );

  return (
    <Box className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <Box className="space-y-1">
        <Text variant="heading-md" as="h2">
          Voice Clone
        </Text>
        <Text variant="body-sm" className="text-content-secondary">
          Train AI to write emails in your voice. Each profile learns from your
          sent emails to capture your unique writing style, tone, and vocabulary.
        </Text>
      </Box>

      {/* Error banner */}
      {state.error && (
        <Box className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800">
          <Text variant="body-sm" className="text-red-700 dark:text-red-300">
            {state.error}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setState((prev) => ({ ...prev, error: null }))}
            className="mt-1 text-red-600"
          >
            Dismiss
          </Button>
        </Box>
      )}

      {/* Profile selector */}
      <VoiceProfileSelector
        profiles={state.profiles}
        selectedProfileId={state.selectedProfileId}
        onSelect={handleSelect}
        onTrainNew={handleShowCreate}
        onRetrain={handleTrain}
        loading={state.loading}
      />

      {/* Create form */}
      {createForm.visible && (
        <Card>
          <CardHeader>
            <Text variant="body-md" className="font-semibold">
              Create New Voice Profile
            </Text>
          </CardHeader>
          <CardContent>
            <Box className="space-y-4">
              <Box className="space-y-1">
                <Text variant="body-sm" as="label" className="font-medium">
                  Profile Name
                </Text>
                <Input
                  value={createForm.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder='e.g. "Professional", "Casual", "Marketing"'
                  aria-label="Profile name"
                />
              </Box>
              <Box className="flex items-center gap-2">
                <Box
                  as="input"
                  type="checkbox"
                  checked={createForm.isDefault}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      isDefault: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-border"
                  aria-label="Set as default profile"
                  id="voice-clone-default-checkbox"
                />
                <Text
                  variant="body-sm"
                  as="label"
                  htmlFor="voice-clone-default-checkbox"
                >
                  Set as default profile for composing
                </Text>
              </Box>
              <Box className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreateSubmit}
                  loading={createForm.submitting}
                  disabled={!createForm.name.trim()}
                >
                  Create Profile
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreateForm(INITIAL_CREATE_FORM)}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Training result */}
      {trainingResult && (
        <Card>
          <CardHeader>
            <Text variant="body-md" className="font-semibold text-emerald-700 dark:text-emerald-400">
              Training Complete
            </Text>
          </CardHeader>
          <CardContent>
            <Box className="grid grid-cols-2 gap-3">
              <Box className="space-y-0.5">
                <Text variant="caption" className="text-content-tertiary">
                  Samples Analyzed
                </Text>
                <Text variant="body-sm" className="font-semibold">
                  {trainingResult.sampleCount}
                </Text>
              </Box>
              <Box className="space-y-0.5">
                <Text variant="caption" className="text-content-tertiary">
                  Confidence
                </Text>
                <Text variant="body-sm" className="font-semibold">
                  {Math.round(trainingResult.confidenceScore * 100)}%
                </Text>
              </Box>
              <Box className="space-y-0.5">
                <Text variant="caption" className="text-content-tertiary">
                  Formality
                </Text>
                <Text variant="body-sm" className="font-semibold capitalize">
                  {trainingResult.formalityLevel.replace("_", " ")}
                </Text>
              </Box>
              <Box className="space-y-0.5">
                <Text variant="caption" className="text-content-tertiary">
                  Signature Phrases
                </Text>
                <Text variant="body-sm" className="font-semibold">
                  {trainingResult.signaturePhrasesFound}
                </Text>
              </Box>
              <Box className="space-y-0.5">
                <Text variant="caption" className="text-content-tertiary">
                  Characteristic Words
                </Text>
                <Text variant="body-sm" className="font-semibold">
                  {trainingResult.characteristicWordsFound}
                </Text>
              </Box>
              <Box className="space-y-0.5">
                <Text variant="caption" className="text-content-tertiary">
                  Avg Emoji/Email
                </Text>
                <Text variant="body-sm" className="font-semibold">
                  {trainingResult.emojiUsage}
                </Text>
              </Box>
            </Box>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTrainingResult(null)}
              className="mt-3"
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Selected profile detail */}
      {selectedProfile && !selectedProfile.isTraining && selectedProfile.confidenceScore === 0 && (
        <Card>
          <CardContent>
            <Box className="text-center py-4 space-y-3">
              <Text variant="body-sm" className="text-content-secondary">
                This profile has not been trained yet. Train it on your sent
                emails to start using AI voice cloning.
              </Text>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleTrain(selectedProfile.id)}
              >
                Train Now
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Delete zone */}
      {selectedProfile && (
        <Box className="pt-4 border-t border-border">
          <Box className="flex items-center justify-between">
            <Box>
              <Text variant="body-sm" className="font-medium text-red-600 dark:text-red-400">
                Delete Profile
              </Text>
              <Text variant="caption" className="text-content-tertiary">
                Permanently remove "{selectedProfile.name}" and all its training data.
              </Text>
            </Box>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(selectedProfile.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950"
              aria-label={`Delete profile ${selectedProfile.name}`}
            >
              Delete
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
