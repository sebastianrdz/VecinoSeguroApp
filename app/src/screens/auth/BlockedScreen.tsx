import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import PrimaryButton from '../../components/PrimaryButton';
import ScreenContainer from '../../components/ScreenContainer';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../i18n';
import { colors, spacing, typography } from '../../theme/tokens';

export default function BlockedScreen() {
  const { signOut } = useAuth();

  return (
    <ScreenContainer>
      <View style={styles.center}>
        <Text style={[typography.h1, styles.title]}>{t('auth.blocked.title')}</Text>
        <Text style={styles.message}>{t('auth.blocked.message')}</Text>

        <PrimaryButton
          label={t('auth.blocked.signOut')}
          onPress={signOut}
          variant="danger"
          style={styles.button}
          accessibilityHint={t('auth.blocked.signOut')}
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
  title: {
    color: colors.danger,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  button: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
