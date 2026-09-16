/**
 * Root index — shows login form directly if not authenticated.
 * This avoids relying on Expo Router redirects which can be flaky on web.
 */
import { Redirect } from 'expo-router';
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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';

export default function Index() {
  const { session, isLoading, signIn, signUp } = useAuth();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </ThemedView>
    );
  }

  // If already signed in, go to the main app
  if (session) {
    return <Redirect href="/(tabs)/chat" />;
  }

  // Show login/signup form directly
  async function handleSubmit() {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    if (isSignUp) {
      const result = await signUp(email.trim(), password);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess('Account created! You can now sign in.');
        setIsSignUp(false);
      }
    } else {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        setError(result.error);
      }
    }
    setIsSubmitting(false);
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <ThemedText type="displayMedium" style={styles.title}>Cadence</ThemedText>
          <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.subtitle}>
            {isSignUp ? 'Create an account' : 'Sign in to continue'}
          </ThemedText>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: theme.errorSoft }]}>
              <ThemedText style={{ color: theme.error, fontSize: 14, textAlign: 'center' }}>{error}</ThemedText>
            </View>
          )}

          {success && (
            <View style={[styles.successBox, { backgroundColor: theme.successSoft }]}>
              <ThemedText style={{ color: theme.success, fontSize: 14, textAlign: 'center' }}>{success}</ThemedText>
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
            editable={!isSubmitting}
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
            editable={!isSubmitting}
          />

          <Pressable
            style={[styles.button, { backgroundColor: theme.accent }, isSubmitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.accentText} />
            ) : (
              <ThemedText style={[styles.buttonText, { color: theme.accentText }]}>
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </ThemedText>
            )}
          </Pressable>

          <Pressable onPress={() => { setIsSignUp(!isSignUp); setError(null); setSuccess(null); }}>
            <ThemedText type="linkPrimary" style={styles.switchText}>
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </ThemedText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  keyboardView: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginBottom: Spacing.three },
  errorBox: { padding: Spacing.twoHalf, borderRadius: Radii.medium },
  successBox: { padding: Spacing.twoHalf, borderRadius: Radii.medium },
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
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchText: { textAlign: 'center', marginTop: Spacing.two },
});
