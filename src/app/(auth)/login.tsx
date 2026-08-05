/**
 * Login screen - email/password authentication.
 *
 * Requirements: 27.1, 27.3
 * - Email/password sign in
 * - Generic error messages (no email enumeration)
 * - Loading states
 * - Link to register screen
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await signIn(email.trim(), password);

    setIsLoading(false);

    if (result.error) {
      // Generic error message — never reveals whether an email exists (Req 27.3)
      setError(result.error);
    }
    // On success, the auth state change triggers navigation in _layout.tsx
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            <ThemedText type="displayMedium" style={styles.title}>
              Cadence
            </ThemedText>
            <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.subtitle}>
              Sign in to continue
            </ThemedText>

            {error && (
              <View style={[styles.errorContainer, { backgroundColor: theme.errorSoft }]} accessibilityRole="alert">
                <ThemedText style={{ color: theme.error, fontSize: 14, textAlign: 'center' }}>{error}</ThemedText>
              </View>
            )}

            <TextInput
              style={[styles.input, {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                color: theme.text,
              }]}
              placeholder="Email"
              placeholderTextColor={theme.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              editable={!isLoading}
              accessibilityLabel="Email address"
            />

            <TextInput
              style={[styles.input, {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
                color: theme.text,
              }]}
              placeholder="Password"
              placeholderTextColor={theme.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              editable={!isLoading}
              accessibilityLabel="Password"
            />

            <Pressable
              style={[styles.button, { backgroundColor: theme.accent }, isLoading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: isLoading }}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText}>Sign In</ThemedText>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.push('/(auth)/register')}
              disabled={isLoading}
              accessibilityRole="link"
            >
              <ThemedText type="linkPrimary" style={styles.switchText}>
                Don't have an account? Sign up
              </ThemedText>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  errorContainer: {
    padding: Spacing.twoHalf,
    borderRadius: Radii.medium,
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
    padding: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
