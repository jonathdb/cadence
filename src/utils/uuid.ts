/**
 * Cross-platform UUID generation.
 *
 * The global `crypto.randomUUID()` is a web/Node API and is NOT available in
 * the React Native (Hermes) runtime — calling it on a device throws
 * "Property 'crypto' doesn't exist". `expo-crypto`'s `randomUUID()` is backed
 * by native secure-random implementations and works on Android, iOS, and web,
 * so it's the one safe UUIDv4 source across every platform this app runs on.
 *
 * Use this helper everywhere instead of `crypto.randomUUID()`.
 */
import * as Crypto from 'expo-crypto';

/** Returns a newly generated RFC 4122 v4 UUID string. */
export function randomUUID(): string {
  return Crypto.randomUUID();
}
