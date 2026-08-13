/**
 * Layout for the /t/ deep link route group.
 * Handles cadence.app/t/{slug} universal links.
 */
import { Stack } from 'expo-router';

export default function TemplateLinkLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
