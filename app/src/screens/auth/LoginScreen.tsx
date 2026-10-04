import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import PrimaryButton from '../../components/PrimaryButton';
import ScreenContainer from '../../components/ScreenContainer';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);

    if (signInError) {
      const isInvalidCredentials = /invalid login credentials/i.test(signInError);
      setError(
        isInvalidCredentials
          ? t('auth.login.invalidCredentials')
          : t('auth.login.genericError')
      );
    }
    // On success, do nothing — RootNavigator reacts to the session/profile
    // change automatically via useAuth().
  };

  return (
    <ScreenContainer scroll>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={typography.h1}>{t('auth.login.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.login.subtitle')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.login.emailLabel')}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.login.emailPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={styles.input}
            accessibilityLabel={t('auth.login.emailLabel')}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.login.passwordLabel')}</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.login.passwordPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            textContentType="password"
            style={styles.input}
            accessibilityLabel={t('auth.login.passwordLabel')}
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <PrimaryButton
          label={submitting ? t('auth.login.submitting') : t('auth.login.submit')}
          onPress={handleSubmit}
          loading={submitting}
          disabled={!email || !password}
          style={styles.submitButton}
          accessibilityHint={t('auth.login.submit')}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.login.noAccount')}</Text>
          <Text
            style={styles.link}
            onPress={() => navigation.navigate('Signup')}
            accessibilityRole="button"
            accessibilityLabel={t('auth.login.goToSignup')}
          >
            {t('auth.login.goToSignup')}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing.xl,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    minHeight: 48,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  link: {
    ...typography.bodyBold,
    color: colors.primary,
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
});
