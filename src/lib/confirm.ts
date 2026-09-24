/**
 * Cross-platform confirmation dialog.
 *
 * `Alert.alert` from react-native is a no-op on React Native Web — tapping a
 * button that relies on it does nothing on web. This helper bridges that gap:
 * it uses the native `Alert.alert` two/three-button dialog on iOS/Android and
 * falls back to the browser's `window.confirm` on web, resolving to a boolean
 * so callers can `await` the user's decision uniformly on every platform.
 *
 * Usage:
 *   if (await confirm({ title: 'Remove day?', message: '...', confirmLabel: 'Remove', destructive: true })) {
 *     // proceed
 *   }
 */
import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
  /** Dialog title. */
  title: string;
  /** Optional body text shown under the title. */
  message?: string;
  /** Label for the confirm button (default "OK"). */
  confirmLabel?: string;
  /** Label for the cancel button (default "Cancel"). */
  cancelLabel?: string;
  /** Style the confirm action as destructive on native (default false). */
  destructive?: boolean;
}

/**
 * Show a confirm dialog and resolve to `true` if the user confirms, `false`
 * if they cancel/dismiss. Works on iOS, Android, and web.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    destructive = false,
  } = options;

  if (Platform.OS === 'web') {
    // window.confirm is synchronous and returns a boolean. Compose title +
    // message the way the native dialog stacks them.
    const text = message ? `${title}\n\n${message}` : title;
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(text)
        : // No window (SSR/edge) — fail closed so a destructive action never
          // runs without an actual user confirmation.
          false;
    return Promise.resolve(ok);
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
