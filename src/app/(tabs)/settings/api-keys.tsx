/**
 * API Key entry and management screen.
 * Allows users to save OpenAI and Anthropic API keys.
 * Never displays saved keys — shows masked indicator when a key is stored.
 * Uses the `store-api-key` Edge Function.
 *
 * Requirements: 3.1, 3.2, 3.4
 */
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';

type Provider = 'openai' | 'anthropic';

interface KeyStatus {
  openai: boolean;
  anthropic: boolean;
}

export default function ApiKeysScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const dockClearance = useTabBarClearance();
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ openai: false, anthropic: false });
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  const loadKeyStatus = useCallback(async () => {
    if (!session?.user.id) return;

    try {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('provider')
        .eq('user_id', session.user.id);

      if (error) {
        console.warn('Failed to load key status:', error.message);
        return;
      }

      const providers = (data ?? []).map((row) => row.provider);
      setKeyStatus({
        openai: providers.includes('openai'),
        anthropic: providers.includes('anthropic'),
      });
    } finally {
      setIsLoadingStatus(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    loadKeyStatus();
  }, [loadKeyStatus]);

  async function handleSaveKey(provider: Provider) {
    const key = provider === 'openai' ? openaiKey : anthropicKey;
    if (!key.trim()) {
      Alert.alert('Error', 'Please enter an API key');
      return;
    }

    setIsSaving(true);
    setSaveStatus(null);

    try {
      // Get current session to ensure we have a valid token
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        setSaveStatus('Error: Not authenticated. Please sign in again.');
        setIsSaving(false);
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/store-api-key`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ provider, key: key.trim() }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        setSaveStatus(`Error: ${errData?.error?.message || response.statusText}`);
      } else {
        const label = provider === 'openai' ? 'OpenAI' : 'Anthropic';
        setSaveStatus(`${label} key saved successfully`);
        if (provider === 'openai') {
          setOpenaiKey('');
          setKeyStatus((prev) => ({ ...prev, openai: true }));
        } else {
          setAnthropicKey('');
          setKeyStatus((prev) => ({ ...prev, anthropic: true }));
        }
      }
    } catch {
      setSaveStatus('Failed to save key. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: dockClearance }]}>
        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Enter your AI API key to enable the training agent. Keys are encrypted and stored
            server-side. They are never displayed after saving.
          </ThemedText>
        </View>

        {saveStatus && (
          <View style={[styles.statusContainer, { backgroundColor: saveStatus.startsWith('Error') ? theme.errorSoft : theme.successSoft }]}>
            <ThemedText style={{ fontSize: 14, textAlign: 'center', color: saveStatus.startsWith('Error') ? theme.error : theme.success }}>{saveStatus}</ThemedText>
          </View>
        )}

        {/* OpenAI Key */}
        <View style={styles.section}>
          <ThemedText style={styles.label}>OpenAI API Key</ThemedText>
          {isLoadingStatus ? (
            <ActivityIndicator size="small" />
          ) : keyStatus.openai ? (
            <View style={styles.keyConfigured}>
              <ThemedText style={styles.maskedKey}>••••••••</ThemedText>
              <ThemedText type="small" style={styles.configuredBadge}>Key configured ✓</ThemedText>
            </View>
          ) : null}
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
            placeholder={keyStatus.openai ? 'Enter new key to replace...' : 'sk-...'}
            placeholderTextColor={theme.textTertiary}
            value={openaiKey}
            onChangeText={setOpenaiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={!isSaving}
            accessibilityLabel="OpenAI API key input"
          />
          <Pressable
            style={[styles.button, { backgroundColor: theme.accent }, isSaving && styles.buttonDisabled]}
            onPress={() => handleSaveKey('openai')}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save OpenAI API key"
          >
            {isSaving ? (
              <ActivityIndicator color={theme.accentText} size="small" />
            ) : (
              <ThemedText style={[styles.buttonText, { color: theme.accentText }]}>
                {keyStatus.openai ? 'Replace OpenAI Key' : 'Save OpenAI Key'}
              </ThemedText>
            )}
          </Pressable>
        </View>

        {/* Anthropic Key */}
        <View style={styles.section}>
          <ThemedText style={styles.label}>Anthropic API Key</ThemedText>
          {isLoadingStatus ? (
            <ActivityIndicator size="small" />
          ) : keyStatus.anthropic ? (
            <View style={styles.keyConfigured}>
              <ThemedText style={styles.maskedKey}>••••••••</ThemedText>
              <ThemedText type="small" style={styles.configuredBadge}>Key configured ✓</ThemedText>
            </View>
          ) : null}
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
            placeholder={keyStatus.anthropic ? 'Enter new key to replace...' : 'sk-ant-...'}
            placeholderTextColor={theme.textTertiary}
            value={anthropicKey}
            onChangeText={setAnthropicKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={!isSaving}
            accessibilityLabel="Anthropic API key input"
          />
          <Pressable
            style={[styles.button, { backgroundColor: theme.accent }, isSaving && styles.buttonDisabled]}
            onPress={() => handleSaveKey('anthropic')}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save Anthropic API key"
          >
            {isSaving ? (
              <ActivityIndicator color={theme.accentText} size="small" />
            ) : (
              <ThemedText style={[styles.buttonText, { color: theme.accentText }]}>
                {keyStatus.anthropic ? 'Replace Anthropic Key' : 'Save Anthropic Key'}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  label: {
    fontWeight: '600',
    fontSize: 14,
  },
  keyConfigured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  maskedKey: {
    fontSize: 16,
    letterSpacing: 2,
  },
  configuredBadge: {
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    padding: Spacing.three,
    fontSize: 16,
    minHeight: 48,
  },
  button: {
    borderRadius: Radii.medium,
    padding: Spacing.two + 4,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusContainer: {
    padding: Spacing.two,
    borderRadius: Radii.medium,
  },
});
