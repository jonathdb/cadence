/**
 * AI Plan Card Component
 *
 * Displays the user's current AI tier, daily usage, provider preference,
 * and upgrade/manage options in the Settings screen.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/providers/AuthProvider';
import { openManageSubscriptions, purchasePro } from '@/services/purchases';
import { type AiTier, useAiTierStore } from '@/store/ai-tier';

// ─── Tier Display Config ─────────────────────────────────────────────────────

const TIER_LABELS: Record<AiTier, string> = {
  free: 'Free',
  pro: 'Pro',
  byok: 'BYOK',
};

const TIER_DESCRIPTIONS: Record<AiTier, string> = {
  free: 'Basic AI with 20 messages/day',
  pro: 'Premium AI with 200 messages/day',
  byok: 'Your own API key — unlimited',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function AIPlanCard() {
  const { user } = useAuth();
  const {
    currentTier,
    dailyUsed,
    dailyLimit,
    isLoading,
    fetchTierInfo,
  } = useAiTierStore();

  const handleUpgrade = useCallback(async () => {
    try {
      const success = await purchasePro();
      if (success && user) {
        // Refresh tier info after successful purchase
        await fetchTierInfo(user.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Purchase failed';
      Alert.alert('Purchase Error', message);
    }
  }, [user, fetchTierInfo]);

  const handleManageSubscription = useCallback(() => {
    openManageSubscriptions();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.card}>
        <Text style={styles.loadingText}>Loading AI plan...</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {/* Tier Header */}
      <View style={styles.header}>
        <Text style={styles.tierLabel}>{TIER_LABELS[currentTier]}</Text>
        <Text style={styles.tierDescription}>{TIER_DESCRIPTIONS[currentTier]}</Text>
      </View>

      {/* Usage Display */}
      <View style={styles.usageRow}>
        <Text style={styles.usageLabel}>Today's usage</Text>
        <Text style={styles.usageValue}>
          {dailyLimit !== null
            ? `${dailyUsed} / ${dailyLimit} messages`
            : 'Unlimited'}
        </Text>
      </View>

      {/* Progress Bar (for Free/Pro only) */}
      {dailyLimit !== null && (
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(100, (dailyUsed / dailyLimit) * 100)}%`,
                backgroundColor: dailyUsed >= dailyLimit ? '#EF4444' : '#14B8A6',
              },
            ]}
          />
        </View>
      )}

      {/* Model + provider are now chosen in the chat model picker. */}
      <View style={styles.preferenceRow}>
        <Text style={styles.preferenceHint}>
          Choose your AI model directly in the chat screen.
        </Text>
      </View>

      {/* Action Button */}
      {currentTier === 'free' && (
        <Pressable
          style={styles.upgradeButton}
          onPress={handleUpgrade}
          accessibilityRole="button"
          accessibilityLabel="Upgrade to Pro"
        >
          <Text style={styles.upgradeButtonText}>Upgrade to Pro — $9.99/month</Text>
        </Pressable>
      )}

      {currentTier === 'pro' && (
        <Pressable
          style={styles.manageButton}
          onPress={handleManageSubscription}
          accessibilityRole="button"
          accessibilityLabel="Manage subscription"
        >
          <Text style={styles.manageButtonText}>Manage Subscription</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    marginBottom: 12,
  },
  tierLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 2,
  },
  tierDescription: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  usageLabel: {
    fontSize: 14,
    color: '#D1D5DB',
  },
  usageValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  preferenceRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  preferenceHint: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  upgradeButton: {
    backgroundColor: '#14B8A6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  upgradeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  manageButton: {
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  manageButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
