/**
 * Register screen - email/password registration form.
 *
 * Requirements: 27.1, 27.2, 27.3
 * - Email/password sign up
 * - On success, navigate to verify-email screen
 * - Generic error messages (no email enumeration)
 * - Loading states
 * - Link to login screen
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
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await signUp(email.trim(), password);

    setIsLoading(false);

    if (result.error) {
      // Generic error message — never reveals whether an email exists (Req 27.3)
      setError(result.error);
    } else {
      // Navigate to verify-email screen after successful registration (Req 27.2)
      router.replace('/(auth)/verify-email');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            <ThemedText type="title" style={styles.title}>
              Create Account
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              Sign up to start training with Cadence
            </ThemedText>

            {error && (
              <View style={styles.errorContainer} accessibilityRole="alert">
                <ThemedText style={styles.errorText}>{error}</ThemedText>
              </View>
            )}

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#888"
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
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#888"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!isLoading}
              accessibilityLabel="Password"
            />

            <Pressable
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel="Sign up"
              accessibilityState={{ disabled: isLoading }}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText}>Sign Up</ThemedText>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              disabled={isLoading}
              accessibilityRole="link"
            >
              <ThemedText type="linkPrimary" style={styles.switchText}>
                Already have an account? Sign in
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
    fontSize: 36,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    padding: Spacing.two,
    borderRadius: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: Spacing.three,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#3c87f7',
    borderRadius: 8,
    padding: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
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
