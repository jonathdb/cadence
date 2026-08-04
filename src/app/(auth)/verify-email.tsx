/**
 * Verify Email screen - shown after registration while email verification is pending.
 *
 * Requirements: 27.2
 * - Message telling user to check their email
 * - Instructions on what to do
 * - Button to go back to login
 * - Resend verification email button
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/utils/supabase';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function handleResend() {
    setIsResending(true);
    setResendMessage(null);

    // Supabase resend requires the email — we use the current session user if available,
    // otherwise prompt the user to sign up again. In practice, this screen is only shown
    // right after sign-up so the session should be present or we can attempt a generic resend.
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;

    if (email) {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (error) {
        setResendMessage('Unable to resend. Please try again later.');
      } else {
        setResendMessage('Verification email sent! Check your inbox.');
      }
    } else {
      setResendMessage('Unable to resend. Please sign up again.');
    }

    setIsResending(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText type="title" style={styles.title}>
            Check Your Email
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            We've sent a verification link to your email address. Please click the link in the email
            to verify your account before signing in.
          </ThemedText>

          <ThemedText type="small" themeColor="textSecondary" style={styles.instructions}>
            Didn't receive it? Check your spam folder or resend the verification email below.
          </ThemedText>

          {resendMessage && (
            <View
              style={[
                styles.messageContainer,
                resendMessage.includes('sent') ? styles.successContainer : styles.errorContainer,
              ]}
              accessibilityRole="alert"
            >
              <ThemedText
                style={
                  resendMessage.includes('sent') ? styles.successText : styles.errorText
                }
              >
                {resendMessage}
              </ThemedText>
            </View>
          )}

          <Pressable
            style={[styles.resendButton, isResending && styles.buttonDisabled]}
            onPress={handleResend}
            disabled={isResending}
            accessibilityRole="button"
            accessibilityLabel="Resend verification email"
            accessibilityState={{ disabled: isResending }}
          >
            {isResending ? (
              <ActivityIndicator color="#3c87f7" />
            ) : (
              <ThemedText style={styles.resendButtonText}>Resend Verification Email</ThemedText>
            )}
          </Pressable>

          <Pressable
            style={styles.button}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <ThemedText style={styles.buttonText}>Back to Sign In</ThemedText>
          </Pressable>
        </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
    fontSize: 28,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 22,
  },
  instructions: {
    textAlign: 'center',
    lineHeight: 22,
  },
  messageContainer: {
    padding: Spacing.two,
    borderRadius: 8,
    width: '100%',
  },
  successContainer: {
    backgroundColor: '#dcfce7',
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
  },
  successText: {
    color: '#16a34a',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  resendButton: {
    borderWidth: 1,
    borderColor: '#3c87f7',
    borderRadius: 8,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    width: '100%',
  },
  resendButtonText: {
    color: '#3c87f7',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#3c87f7',
    borderRadius: 8,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
