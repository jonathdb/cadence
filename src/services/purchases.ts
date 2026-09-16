/**
 * RevenueCat Purchases Service
 *
 * Manages in-app subscription purchases via RevenueCat SDK.
 * Handles initialization, Pro subscription purchase, and subscription management.
 *
 * Validates: Requirements 6.1, 6.2, 6.3
 */
import { Platform } from 'react-native';

// RevenueCat SDK is conditionally imported to avoid issues on web
let Purchases: typeof import('react-native-purchases').default | null = null;

async function getPurchases() {
  if (!Purchases) {
    try {
      const mod = await import('react-native-purchases');
      Purchases = mod.default;
    } catch {
      // Native module unavailable (e.g. web, or not linked) — degrade gracefully
      return null;
    }
  }
  return Purchases;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

const PRO_ENTITLEMENT_ID = 'pro';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize RevenueCat SDK with the platform-appropriate API key.
 * Should be called after user authentication.
 *
 * @param userId - The authenticated user's Supabase user ID
 */
export async function initPurchases(userId: string): Promise<void> {
  if (Platform.OS === 'web') return; // RevenueCat not available on web

  const RC = await getPurchases();
  if (!RC) return; // Native module unavailable

  const apiKey = Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;

  if (!apiKey) {
    console.warn('[Purchases] RevenueCat API key not configured for this platform');
    return;
  }

  RC.configure({
    apiKey,
    appUserID: userId,
  });
}

/**
 * Check if the user currently has an active Pro entitlement via RevenueCat.
 *
 * @returns true if the user has an active Pro subscription
 */
export async function hasProEntitlement(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const RC = await getPurchases();
    if (!RC) return false;
    const customerInfo = await RC.getCustomerInfo();
    return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Present the Pro subscription offering and execute the purchase flow.
 *
 * @returns true if purchase was successful, false if cancelled
 * @throws Error if purchase fails for reasons other than cancellation
 */
export async function purchasePro(): Promise<boolean> {
  if (Platform.OS === 'web') {
    throw new Error('In-app purchases are not available on web');
  }

  const RC = await getPurchases();
  if (!RC) throw new Error('In-app purchases are not available on this device');
  const offerings = await RC.getOfferings();

  if (!offerings.current || offerings.current.availablePackages.length === 0) {
    throw new Error('No Pro subscription package available');
  }

  // Use the first available package (should be the monthly Pro plan)
  const proPackage = offerings.current.availablePackages[0];

  try {
    const { customerInfo } = await RC.purchasePackage(proPackage);
    return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
  } catch (err: unknown) {
    // Check if user cancelled
    const error = err as { userCancelled?: boolean; code?: number };
    if (error.userCancelled || error.code === 1) {
      return false; // User cancelled — not an error
    }
    throw err;
  }
}

/**
 * Restore previous purchases (e.g., after reinstall or device change).
 *
 * @returns true if Pro entitlement was restored
 */
export async function restorePurchases(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const RC = await getPurchases();
  if (!RC) return false;
  const customerInfo = await RC.restorePurchases();
  return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
}

/**
 * Open the platform's subscription management interface.
 * On iOS this opens the App Store subscription settings.
 * On Android this opens the Play Store subscription page.
 */
export async function openManageSubscriptions(): Promise<void> {
  if (Platform.OS === 'web') return;

  const RC = await getPurchases();
  if (!RC) return;
  await RC.showManageSubscriptions();
}
