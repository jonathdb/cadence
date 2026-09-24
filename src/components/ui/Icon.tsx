/**
 * Icon — cross-platform icon primitive for the Kinetic Obsidian system.
 *
 * Uses Ionicons (bundled with @expo/vector-icons) so glyphs render identically
 * on iOS, Android, and web. A small semantic name map keeps call sites readable
 * and decoupled from the underlying glyph set.
 */
import Ionicons from '@expo/vector-icons/Ionicons';

export type IconName =
  | 'chat'
  | 'program'
  | 'session'
  | 'progress'
  | 'settings'
  | 'bell'
  | 'person'
  | 'arrow-forward'
  | 'arrow-up'
  | 'play'
  | 'timer'
  | 'tune'
  | 'lock'
  | 'schedule'
  | 'bolt'
  | 'dumbbell'
  | 'run'
  | 'heart'
  | 'battery'
  | 'bot'
  | 'mic'
  | 'add'
  | 'shield'
  | 'refresh'
  | 'swap'
  | 'check'
  | 'check-circle'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up-down'
  | 'sparkles'
  | 'insights'
  | 'calendar'
  | 'moon'
  | 'sign-out'
  | 'music'
  | 'trend-up'
  | 'trend-flat'
  | 'grid'
  | 'library'
  | 'edit'
  | 'trash'
  | 'send';

const GLYPHS: Record<IconName, React.ComponentProps<typeof Ionicons>['name']> = {
  chat: 'chatbubble-ellipses',
  program: 'calendar',
  session: 'barbell',
  progress: 'stats-chart',
  settings: 'options',
  bell: 'notifications-outline',
  person: 'person',
  'arrow-forward': 'arrow-forward',
  'arrow-up': 'arrow-up',
  play: 'play',
  timer: 'timer-outline',
  tune: 'options-outline',
  lock: 'lock-closed',
  schedule: 'time-outline',
  bolt: 'flash',
  dumbbell: 'barbell',
  run: 'walk',
  heart: 'heart',
  battery: 'battery-charging',
  bot: 'hardware-chip',
  mic: 'mic',
  add: 'add-circle-outline',
  shield: 'shield-checkmark',
  refresh: 'refresh',
  swap: 'swap-horizontal',
  check: 'checkmark',
  'check-circle': 'checkmark-circle',
  'chevron-right': 'chevron-forward',
  'chevron-down': 'chevron-down',
  'chevron-up-down': 'swap-vertical',
  sparkles: 'sparkles',
  insights: 'trending-up',
  calendar: 'calendar-outline',
  moon: 'moon',
  'sign-out': 'log-out-outline',
  music: 'musical-notes',
  'trend-up': 'trending-up',
  'trend-flat': 'remove',
  grid: 'grid-outline',
  library: 'library-outline',
  edit: 'create-outline',
  trash: 'trash-outline',
  send: 'arrow-up',
};

export type IconProps = {
  name: IconName;
  size?: number;
  color: string;
  style?: React.ComponentProps<typeof Ionicons>['style'];
};

export function Icon({ name, size = 24, color, style }: IconProps) {
  return <Ionicons name={GLYPHS[name]} size={size} color={color} style={style} />;
}
