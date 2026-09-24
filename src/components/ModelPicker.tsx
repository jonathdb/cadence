/**
 * ModelPicker — in-chat AI model selector.
 *
 * A compact pill in the chat dock that opens a modal listing chat-capable models
 * grouped by provider (OpenAI / Anthropic), fetched live from `list-models` so
 * IDs are never hardcoded. The chosen model implies the provider (replacing the
 * old settings provider toggle) and is persisted per-user.
 *
 * Access rules (mirrors agent-chat server validation):
 * - BYOK users may pick any live model for a provider they have a key for.
 * - Free/Pro users may pick curated models (run on the Cadence backend key).
 * - A provider with no user key and no curated/backend-runnable models is
 *   collapsed to a single "unavailable" row that deep-links to Settings
 *   instead of listing individual models (Requirements 6.2–6.4).
 *
 * The model list is rendered via `FlatList` inside a `flex: 1` region of the
 * sheet so the full list scrolls reliably, regardless of how many providers/
 * models are shown (Requirement 6.1).
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/Icon';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';
import {
    buildProviderEntry,
    fetchModelCatalog,
    type AiProvider,
    type ModelCatalog,
    type ProviderEntry,
    type SelectableModel,
} from '@/services/model-catalog';
import { useAiTierStore } from '@/store/ai-tier';

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const PROVIDER_ORDER: AiProvider[] = ['openai', 'anthropic'];

/** Flattened row types for the FlatList — either a section header, a
 * selectable model, or a collapsed "unavailable" provider row. */
type PickerRow =
  | { kind: 'header'; key: string; provider: AiProvider }
  | { kind: 'model'; key: string; provider: AiProvider; model: SelectableModel }
  | { kind: 'unavailable'; key: string; provider: AiProvider; message: string };

export function ModelPicker() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const preferredModel = useAiTierStore((s) => s.preferredModel);
  const preferredProvider = useAiTierStore((s) => s.preferredProvider);
  const setPreferredModel = useAiTierStore((s) => s.setPreferredModel);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchModelCatalog();
    setCatalog(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Compute each provider's entry (models capped at 5, curated-first-then-
  // recency, or a single collapsed row) using the pure helpers so the UI
  // never has to re-derive selectability/gating itself.
  const providerEntries = useMemo(() => {
    if (!catalog) return [] as ProviderEntry[];
    return PROVIDER_ORDER.map((provider) =>
      buildProviderEntry(provider, catalog[provider], PROVIDER_LABELS[provider])
    );
  }, [catalog]);

  const rows = useMemo(() => {
    const result: PickerRow[] = [];
    for (const entry of providerEntries) {
      result.push({ kind: 'header', key: `header-${entry.provider}`, provider: entry.provider });
      if (entry.kind === 'unavailable') {
        result.push({
          kind: 'unavailable',
          key: `unavailable-${entry.provider}`,
          provider: entry.provider,
          message: entry.message,
        });
      } else {
        for (const model of entry.models) {
          result.push({ kind: 'model', key: model.id, provider: entry.provider, model });
        }
      }
    }
    return result;
  }, [providerEntries]);

  const currentLabel = useMemo(() => {
    if (!preferredModel) return 'Default model';
    const found = catalog
      ? [...catalog.openai.models, ...catalog.anthropic.models].find((m) => m.id === preferredModel)
      : undefined;
    return found?.label ?? preferredModel;
  }, [preferredModel, catalog]);

  const handleSelect = useCallback(
    async (provider: AiProvider, model: SelectableModel) => {
      if (!model.selectable || !user) return;
      await setPreferredModel(user.id, provider, model.id);
      setOpen(false);
    },
    [user, setPreferredModel]
  );

  const handleUnavailableTap = useCallback(() => {
    setOpen(false);
    router.push('/(tabs)/settings/api-keys');
  }, [router]);

  const renderRow = useCallback(
    ({ item }: { item: PickerRow }) => {
      if (item.kind === 'header') {
        return (
          <ThemedText type="labelCaps" themeColor="textTertiary" style={styles.groupHeader}>
            {PROVIDER_LABELS[item.provider]}
          </ThemedText>
        );
      }

      if (item.kind === 'unavailable') {
        return (
          <Pressable
            style={[styles.row, styles.rowDisabled, { borderColor: theme.border }]}
            onPress={handleUnavailableTap}
            accessibilityRole="button"
            accessibilityLabel={`${PROVIDER_LABELS[item.provider]} unavailable. Tap to add an API key in Settings.`}
          >
            <View style={styles.rowMain}>
              <ThemedText type="bodyMedium" themeColor="textTertiary">
                {PROVIDER_LABELS[item.provider]} — unavailable
              </ThemedText>
              <View style={styles.warnRow}>
                <Icon name="lock" size={12} color={theme.textTertiary} />
                <ThemedText type="small" themeColor="textTertiary" style={styles.warnText}>
                  {item.message}
                </ThemedText>
              </View>
            </View>
            <Icon name="chevron-right" size={16} color={theme.textTertiary} />
          </Pressable>
        );
      }

      const { model, provider } = item;
      const isActive = model.id === preferredModel && provider === preferredProvider;
      return (
        <Pressable
          style={[
            styles.row,
            { borderColor: theme.border },
            isActive && { backgroundColor: theme.backgroundElement },
            !model.selectable && styles.rowDisabled,
          ]}
          onPress={() => handleSelect(provider, model)}
          disabled={!model.selectable}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive, disabled: !model.selectable }}
          accessibilityLabel={`${model.label}${model.selectable ? '' : ', unavailable'}`}
        >
          <View style={styles.rowMain}>
            <ThemedText
              type="bodyMedium"
              themeColor={model.selectable ? 'text' : 'textTertiary'}
              numberOfLines={1}
            >
              {model.label}
            </ThemedText>
          </View>
          {isActive && <Icon name="check-circle" size={18} color={theme.accent} />}
        </Pressable>
      );
    },
    [theme, preferredModel, preferredProvider, handleSelect, handleUnavailableTap]
  );

  return (
    <>
      <Pressable
        style={[styles.pill, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`AI model: ${currentLabel}. Tap to change.`}
      >
        <Icon name="bot" size={14} color={theme.textSecondary} />
        <ThemedText type="labelMedium" themeColor="textSecondary" numberOfLines={1} style={styles.pillLabel}>
          {currentLabel}
        </ThemedText>
        <Icon name="chevron-up-down" size={14} color={theme.textTertiary} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.backgroundElevated, borderColor: theme.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <ThemedText type="titleMedium">Choose a model</ThemedText>
              <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Refresh model list">
                <Icon name="refresh" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : rows.length === 0 ? (
              <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.empty}>
                No models available. Check your connection or add an API key in Settings.
              </ThemedText>
            ) : (
              // Bounded flex:1 region inside the fixed-height sheet so the
              // full list scrolls reliably regardless of content length
              // (Requirement 6.1).
              <View style={styles.listContainer}>
                <FlatList
                  data={rows}
                  keyExtractor={(item) => item.key}
                  renderItem={renderRow}
                  contentContainerStyle={styles.listContent}
                />
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radii.full,
    borderWidth: 1,
    maxWidth: '80%',
  },
  pillLabel: {
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    height: '75%',
    flexDirection: 'column',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  loading: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
  // The scrollable region: flex:1 inside the fixed-height sheet is what
  // guarantees the FlatList can actually measure and scroll its content.
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.two,
  },
  groupHeader: {
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.medium,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  warnText: {
    flexShrink: 1,
  },
});
