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
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/utils/supabase';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function handleResend() {
    setIsResending(true);
    setResendMessage(null);

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
          <ThemedText type="headlineLarge" style={styles.title}>
            Check Your Email
          </ThemedText>

          <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.subtitle}>
            We've sent a verification link to your email address. Please click the link in the email
            to verify your account before signing in.
          </ThemedText>

          <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.instructions}>
            Didn't receive it? Check your spam folder or resend the verification email below.
          </ThemedText>

          {resendMessage && (
            <View
              style={[
                styles.messageContainer,
                {
                  backgroundColor: resendMessage.includes('sent')
                    ? theme.successSoft
                    : theme.errorSoft,
                },
              ]}
              accessibilityRole="alert"
            >
              <ThemedText
                style={{
                  color: resendMessage.includes('sent') ? theme.success : theme.error,
                  fontSize: 14,
                  textAlign: 'center',
                }}
              >
                {resendMessage}
              </ThemedText>
            </View>
          )}

          <Pressable
            style={[styles.resendButton, { borderColor: theme.accent }, isResending && styles.buttonDisabled]}
            onPress={handleResend}
            disabled={isResending}
            accessibilityRole="button"
            accessibilityLabel="Resend verification email"
            accessibilityState={{ disabled: isResending }}
          >
            {isResending ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <ThemedText style={[styles.resendButtonText, { color: theme.accent }]}>Resend Verification Email</ThemedText>
            )}
          </Pressable>

          <Pressable
            style={[styles.button, { backgroundColor: theme.accent }]}
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
    padding: Spacing.twoHalf,
    borderRadius: Radii.medium,
    width: '100%',
  },
  resendButton: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    width: '100%',
    minHeight: 48,
    justifyContent: 'center',
  },
  resendButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    width: '100%',
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
});
