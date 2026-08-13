/**
 * Chat Usage Indicator Component
 *
 * Displays remaining daily AI messages in the chat screen header area.
 * Hidden for BYOK users (unlimited). Shows a subtle pill with remaining count
 * for Free and Pro users. Turns red when approaching/at limit.
 *
 * Validates: Requirements 9.1, 9.2, 9.5
 */
import { StyleSheet, Text, View } from 'react-native';

import { useAiTierStore } from '@/store/ai-tier';

export function ChatUsageIndicator() {
  const { currentTier, dailyUsed, dailyLimit, isRateLimited } = useAiTierStore();

  // Don't show for BYOK users (unlimited)
  if (currentTier === 'byok' || dailyLimit === null) {
    return null;
  }

  const remaining = Math.max(0, dailyLimit - dailyUsed);
  const isLow = remaining <= 5;

  return (
    <View
      style={[styles.container, isRateLimited && styles.containerLimited]}
      accessibilityRole="text"
      accessibilityLabel={
        isRateLimited
          ? 'Daily message limit reached'
          : `${remaining} messages remaining today`
      }
    >
      <Text style={[styles.text, isLow && styles.textLow, isRateLimited && styles.textLimited]}>
        {isRateLimited
          ? 'Limit reached'
          : `${remaining} remaining`}
      </Text>
    </View>
  );
}

// ─── Rate Limit Reached Message ──────────────────────────────────────────────

/**
 * Full-width message shown when the user hits their daily limit.
 * Displays upgrade and BYOK options.
 *
 * Validates: Requirements 9.3, 9.4
 */
export function RateLimitReachedMessage() {
  const { isRateLimited, currentTier } = useAiTierStore();

  if (!isRateLimited) return null;

  return (
    <View style={styles.limitMessage}>
      <Text style={styles.limitTitle}>Daily limit reached</Text>
      <Text style={styles.limitBody}>
        {currentTier === 'free'
          ? 'Upgrade to Pro for 200 messages/day, or add your own API key for unlimited access.'
          : 'Add your own API key in Settings for unlimited access.'}
      </Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  containerLimited: {
    backgroundColor: '#7F1D1D',
  },
  text: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  textLow: {
    color: '#F59E0B',
  },
  textLimited: {
    color: '#FCA5A5',
  },
  limitMessage: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  limitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 4,
  },
  limitBody: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
  },
});
