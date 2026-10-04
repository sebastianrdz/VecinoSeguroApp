import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';
import type { UserStatus } from '../types/database';

const STATUS_STYLES: Record<UserStatus, { bg: string; fg: string }> = {
  pending: { bg: colors.warningLight, fg: colors.warning },
  active: { bg: colors.successLight, fg: colors.success },
  blocked: { bg: colors.dangerLight, fg: colors.danger },
};

export default function StatusPill({
  status,
  label,
}: {
  status: UserStatus;
  label: string;
}) {
  const palette = STATUS_STYLES[status];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingVertical: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
