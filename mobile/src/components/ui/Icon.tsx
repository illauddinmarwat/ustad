/**
 * Thin wrapper around `@expo/vector-icons` so screens import from a single place.
 * Defaults to Feather (line style) which matches the Airtasker-inspired aesthetic.
 */
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors } from '../../theme/tokens';

type FeatherName = ComponentProps<typeof Feather>['name'];
type IoniconsName = ComponentProps<typeof Ionicons>['name'];
type MCName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type IconSet = 'feather' | 'ion' | 'mc';

export type IconProps = {
  name: FeatherName | IoniconsName | MCName;
  set?: IconSet;
  size?: number;
  color?: string;
};

export function Icon({ name, set = 'feather', size = 18, color = colors.textBody }: IconProps) {
  if (set === 'ion') {
    return <Ionicons name={name as IoniconsName} size={size} color={color} />;
  }
  if (set === 'mc') {
    return <MaterialCommunityIcons name={name as MCName} size={size} color={color} />;
  }
  return <Feather name={name as FeatherName} size={size} color={color} />;
}

export type { FeatherName, IoniconsName, MCName };
