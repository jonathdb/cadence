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
 * - A model whose provider the user lacks a key for AND that isn't curated is
 *   shown disabled with a warning ("Add an {provider} key in Settings").
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/Icon';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/AuthProvider';
import {
  fetchModelCatalog,
  type AiProvider,
  type CatalogModel,
  type ModelCatalog,
} from '@/services/model-catalog';
import { useAiTierStore } from '@/store/ai-tier';

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const PROVIDER_ORDER: AiProvider[] = ['openai', 'anthropic'];

interface SelectableModel extends CatalogModel {
  /** User can select and send with this model. */
  selectable: boolean;
  /** Why it's not selectable (shown as a warning), if applicable. */
  warning?: string;
}

export function ModelPicker() {
  const theme = useTheme();
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

  // Compute selectability + warnings per provider using the same rules the
  // server enforces, so the UI never offers something that would be rejected.
  const grouped = useMemo(() => {
    if (!catalog) return [] as { provider: AiProvider; models: SelectableModel[] }[];

    return PROVIDER_ORDER.map((provider) => {
      const pc = catalog[provider];
      const models: SelectableModel[] = pc.models.map((m) => {
        if (pc.hasUserKey) {
          // BYOK for this provider → any live model is fine.
          return { ...m, selectable: true };
        }
        if (m.curated && pc.hasBackendKey) {
          // Non-BYOK but curated model runs on the Cadence backend key.
          return { ...m, selectable: true };
        }
        // Needs the user's own key.
        return {
          ...m,
          selectable: false,
          warning: `Add an ${PROVIDER_LABELS[provider]} API key in Settings to use this model.`,
        };
      });
      return { provider, models };
    }).filter((g) => g.models.length > 0);
  }, [catalog]);

  const currentLabel = useMemo(() => {
    if (!preferredModel) return 'Default model';
    // Prefer the catalog label if we have it.
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
    [user, setPreferredModel],
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
            ) : grouped.length === 0 ? (
              <ThemedText type="bodyMedium" themeColor="textSecondary" style={styles.empty}>
                No models available. Check your connection or add an API key in Settings.
              </ThemedText>
            ) : (
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {grouped.map((group) => (
                  <View key={group.provider} style={styles.group}>
                    <ThemedText type="labelCaps" themeColor="textTertiary" style={styles.groupHeader}>
                      {PROVIDER_LABELS[group.provider]}
                    </ThemedText>
                    {group.models.map((model) => {
                      const isActive = model.id === preferredModel && group.provider === preferredProvider;
                      return (
                        <Pressable
                          key={model.id}
                          style={[
                            styles.row,
                            { borderColor: theme.border },
                            isActive && { backgroundColor: theme.backgroundElement },
                            !model.selectable && styles.rowDisabled,
                          ]}
                          onPress={() => handleSelect(group.provider, model)}
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
                            {model.warning && (
                              <View style={styles.warnRow}>
                                <Icon name="lock" size={12} color={theme.textTertiary} />
                                <ThemedText type="small" themeColor="textTertiary" style={styles.warnText}>
                                  {model.warning}
                                </ThemedText>
                              </View>
                            )}
                          </View>
                          {isActive && <Icon name="check-circle" size={18} color={theme.accent} />}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
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
    maxHeight: '75%',
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
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: Spacing.two,
  },
  group: {
    marginBottom: Spacing.three,
  },
  groupHeader: {
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
})
