/**
 * Hook for fetching and updating user settings from Supabase.
 * Provides access to rest_timer_auto_start and other user_settings columns.
 *
 * Requirements: 15.2, 15.3
 */
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';

export interface UserSettings {
  rest_timer_auto_start: boolean;
  weight_unit: 'kg' | 'lbs';
  notification_permission_status: string | null;
}

const DEFAULT_SETTINGS: UserSettings = {
  rest_timer_auto_start: true,
  weight_unit: 'kg',
  notification_permission_status: null,
};

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('rest_timer_auto_start, weight_unit, notification_permission_status')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // No settings row yet — use defaults
        console.warn('Could not fetch user settings:', error.message);
        setSettings(DEFAULT_SETTINGS);
      } else if (data) {
        setSettings({
          rest_timer_auto_start: data.rest_timer_auto_start ?? true,
          weight_unit: (data.weight_unit as 'kg' | 'lbs') ?? 'kg',
          notification_permission_status: data.notification_permission_status ?? null,
        });
      }
    } catch (err) {
      console.error('Error fetching user settings:', err);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = useCallback(
    async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      if (!user) return;

      // Optimistic update
      setSettings((prev) => ({ ...prev, [key]: value }));

      try {
        const { error } = await supabase
          .from('user_settings')
          .update({ [key]: value, updated_at: new Date().toISOString() } as never)
          .eq('user_id', user.id);

        if (error) {
          // Revert on failure
          console.error('Failed to update user setting:', error.message);
          setSettings((prev) => ({ ...prev, [key]: prev[key] }));
          // Refetch to ensure consistency
          await fetchSettings();
        }
      } catch (err) {
        console.error('Error updating user setting:', err);
        await fetchSettings();
      }
    },
    [user, fetchSettings]
  );

  return {
    settings,
    isLoading,
    updateSetting,
    refetch: fetchSettings,
  };
}
