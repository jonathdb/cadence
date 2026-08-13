/**
 * Sentry Error Monitoring - Conditional initialization and error capture.
 *
 * Initializes Sentry only when a valid DSN is present and the environment
 * is production or preview. In development or when DSN is missing, all
 * capture calls are no-ops.
 *
 * Requirements: 3.2, 3.3
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/** Module-level flag tracking whether Sentry was successfully initialized. */
let initialized = false;

/**
 * Determine the current environment based on __DEV__ flag and EAS channel.
 */
function detectEnvironment(): 'development' | 'preview' | 'production' {
  if (__DEV__) {
    return 'development';
  }

  const channel = Constants.expoConfig?.extra?.eas?.channel as string | undefined;
  if (channel === 'preview') {
    return 'preview';
  }

  return 'production';
}

/**
 * Initialize Sentry error monitoring.
 *
 * Reads DSN from EXPO_PUBLIC_SENTRY_DSN. If DSN is missing or empty,
 * initialization is skipped and captureException becomes a no-op.
 * Only sends events in production and preview environments.
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    initialized = false;
    return;
  }

  const environment = detectEnvironment();
  const release = Constants.expoConfig?.version ?? '0.0.0';

  try {
    Sentry.init({
      dsn,
      environment,
      release,
      // Only send events in production or preview — not development
      enabled: environment === 'production' || environment === 'preview',
    });
    initialized = true;
  } catch {
    initialized = false;
  }
}

/**
 * Capture an exception and send it to Sentry.
 * No-ops when Sentry is not initialized (missing DSN or init failure).
 *
 * @param error - The error to capture
 * @param context - Optional key-value context to attach to the event
 */
export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (!initialized) {
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Check whether Sentry was successfully initialized.
 */
export function isSentryInitialized(): boolean {
  return initialized;
}
