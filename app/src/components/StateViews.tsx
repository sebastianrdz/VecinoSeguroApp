import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import PrimaryButton from './PrimaryButton';
import { t } from '../i18n';
import { colors, spacing, typography } from '../theme/tokens';

/** Centered spinner for initial data loads. */
export function LoadingView({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingLabel}>{label ?? t('common.loading')}</Text>
    </View>
  );
}

/** Error state with retry, used for failed data loads across all screens. */
export function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>{t('common.error')}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry && (
        <PrimaryButton
          label={t('common.retry')}
          onPress={onRetry}
          variant="secondary"
          style={styles.retryButton}
        />
      )}
    </View>
  );
}

/** Offline banner shown when the device has no network connectivity. */
export function OfflineBanner() {
  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineText}>{t('common.offline')}</Text>
    </View>
  );
}

/** Generic empty-list placeholder. */
export function EmptyView({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  loadingLabel: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.danger,
  },
  errorMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.sm,
    minWidth: 160,
  },
  emptyMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  offlineBanner: {
    backgroundColor: colors.warningLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  offlineText: {
    ...typography.caption,
    color: colors.warning,
    textAlign: 'center',
    fontWeight: '600',
  },
});
