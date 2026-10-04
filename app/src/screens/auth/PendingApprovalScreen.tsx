import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import PrimaryButton from '../../components/PrimaryButton';
import ScreenContainer from '../../components/ScreenContainer';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../i18n';
import { colors, spacing, typography } from '../../theme/tokens';

export default function PendingApprovalScreen() {
  const { refreshProfile, refreshingProfile, signOut } = useAuth();

  return (
    <ScreenContainer>
      <View style={styles.center}>
        <Text style={typography.h1}>{t('auth.pendingApproval.title')}</Text>
        <Text style={styles.message}>{t('auth.pendingApproval.message')}</Text>
        <Text style={styles.hint}>{t('auth.pendingApproval.hint')}</Text>

        <PrimaryButton
          label={t('auth.pendingApproval.refresh')}
          onPress={refreshProfile}
          loading={refreshingProfile}
          variant="secondary"
          style={styles.button}
          accessibilityHint={t('auth.pendingApproval.refresh')}
        />
        <PrimaryButton
          label={t('auth.pendingApproval.signOut')}
          onPress={signOut}
          variant="secondary"
          style={styles.button}
          accessibilityHint={t('auth.pendingApproval.signOut')}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  button: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
