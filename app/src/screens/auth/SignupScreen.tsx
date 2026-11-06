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

const MIN_PASSWORD_LENGTH = 8;

interface FieldErrors {
  fullName?: string;
  email?: string;
  password?: string;
}

export default function SignupScreen() {
  const { signUp } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const validate = (): boolean => {
    const errors: FieldErrors = {};
    if (!fullName.trim()) {
      errors.fullName = t('common.requiredField');
    }
    if (!email.trim()) {
      errors.email = t('common.requiredField');
    }
    if (!password) {
      errors.password = t('common.requiredField');
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = t('auth.signup.weakPassword');
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    setFormError(null);
    setCheckEmail(false);
    if (!validate()) {
      return;
    }

    setSubmitting(true);
    const { error: signUpError, needsEmailConfirmation } = await signUp({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      phone: phone.trim() || undefined,
    });
    setSubmitting(false);

    if (signUpError) {
      const isEmailInUse = /already registered|already exists/i.test(signUpError);
      setFormError(
        isEmailInUse ? t('auth.signup.emailInUse') : t('auth.signup.genericError')
      );
    } else if (needsEmailConfirmation) {
      setCheckEmail(true);
    }
    // Otherwise do nothing extra — RootNavigator will show PendingApproval
    // automatically once the session exists (status defaults to 'pending').
  };

  return (
    <ScreenContainer scroll>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={typography.h1}>{t('auth.signup.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.signup.subtitle')}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.signup.fullNameLabel')}</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('auth.signup.fullNamePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            textContentType="name"
            style={styles.input}
            accessibilityLabel={t('auth.signup.fullNameLabel')}
          />
          {fieldErrors.fullName && (
            <Text style={styles.fieldError}>{fieldErrors.fullName}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.signup.phoneLabel')}</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder={t('auth.signup.phonePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            style={styles.input}
            accessibilityLabel={t('auth.signup.phoneLabel')}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.signup.emailLabel')}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.signup.emailPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={styles.input}
            accessibilityLabel={t('auth.signup.emailLabel')}
          />
          {fieldErrors.email && (
            <Text style={styles.fieldError}>{fieldErrors.email}</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.signup.passwordLabel')}</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.signup.passwordPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            textContentType="newPassword"
            style={styles.input}
            accessibilityLabel={t('auth.signup.passwordLabel')}
          />
          <Text style={styles.hint}>{t('auth.signup.passwordHint')}</Text>
          {fieldErrors.password && (
            <Text style={styles.fieldError}>{fieldErrors.password}</Text>
          )}
        </View>

        {formError && <Text style={styles.errorText}>{formError}</Text>}
        {checkEmail && <Text style={styles.infoText}>{t('auth.signup.checkEmail')}</Text>}

        <PrimaryButton
          label={submitting ? t('auth.signup.submitting') : t('auth.signup.submit')}
          onPress={handleSubmit}
          loading={submitting}
          style={styles.submitButton}
          accessibilityHint={t('auth.signup.submit')}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.signup.haveAccount')}</Text>
          <Text
            style={styles.link}
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel={t('auth.signup.goToLogin')}
          >
            {t('auth.signup.goToLogin')}
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
  hint: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  fieldError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  infoText: {
    ...typography.caption,
    color: colors.success,
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
