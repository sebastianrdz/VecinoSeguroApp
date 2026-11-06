import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PrimaryButton from '../../components/PrimaryButton';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { TABLES } from '../../types/database';

const MAX_NAME_LENGTH = 80;
const MAX_PHONE_LENGTH = 20;

interface EditProfileSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** A phone is optional; when present it needs a plausible number of digits. */
function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
}

export default function EditProfileSheet({ visible, onClose }: EditProfileSheetProps) {
  const { profile, session, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Every opening starts from the saved values.
  useEffect(() => {
    if (visible) {
      setName(profile?.full_name ?? '');
      setPhone(profile?.phone ?? '');
      setNameError(null);
      setPhoneError(null);
      setFormError(null);
      setSaving(false);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const dirty =
    trimmedName !== (profile?.full_name ?? '').trim() ||
    trimmedPhone !== (profile?.phone ?? '').trim();

  const requestClose = () => {
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert(t('profile.discardTitle'), t('profile.discardMessage'), [
      { text: t('profile.keepEditing'), style: 'cancel' },
      { text: t('profile.discard'), style: 'destructive', onPress: onClose },
    ]);
  };

  const handleSave = async () => {
    if (!profile?.id || saving) return;

    const nameProblem = trimmedName ? null : t('profile.nameRequired');
    const phoneProblem =
      trimmedPhone && !isValidPhone(trimmedPhone) ? t('profile.phoneInvalid') : null;
    setNameError(nameProblem);
    setPhoneError(phoneProblem);
    setFormError(null);
    if (nameProblem || phoneProblem) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    setSaving(true);
    // RLS lets a user update only their own row; role/status/household are
    // protected server-side, so only these two fields can change here.
    const { data, error } = await supabase
      .from(TABLES.profiles)
      .update({ full_name: trimmedName, phone: trimmedPhone || null })
      .eq('id', profile.id)
      .select('id')
      .maybeSingle();
    setSaving(false);

    if (error || !data) {
      const offline = !!error && /network|fetch/i.test(error.message);
      setFormError(t(offline ? 'profile.saveOffline' : 'profile.saveError'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await refreshProfile();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={requestClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlay} onPress={requestClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: spacing.md + insets.bottom }]}
            onPress={() => {}}
          >
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header">
                {t('profile.editTitle')}
              </Text>
              <Pressable
                onPress={requestClose}
                hitSlop={8}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>{t('profile.nameLabel')}</Text>
                <TextInput
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder={t('profile.namePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  maxLength={MAX_NAME_LENGTH}
                  autoCapitalize="words"
                  textContentType="name"
                  returnKeyType="next"
                  editable={!saving}
                  style={[styles.input, !!nameError && styles.inputError]}
                  accessibilityLabel={t('profile.nameLabel')}
                />
                {!!nameError && (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {nameError}
                  </Text>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t('profile.phoneLabel')}</Text>
                <TextInput
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(value);
                    if (phoneError) setPhoneError(null);
                  }}
                  placeholder={t('profile.phonePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  maxLength={MAX_PHONE_LENGTH}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  editable={!saving}
                  style={[styles.input, !!phoneError && styles.inputError]}
                  accessibilityLabel={t('profile.phoneLabel')}
                />
                {!!phoneError && (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {phoneError}
                  </Text>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t('profile.emailLabel')}</Text>
                <View style={styles.readonly} accessible accessibilityState={{ disabled: true }}>
                  <Text style={styles.readonlyText} numberOfLines={1} ellipsizeMode="middle">
                    {session?.user.email ?? ''}
                  </Text>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                </View>
                <Text style={styles.note}>{t('profile.emailNote')}</Text>
              </View>

              {!!formError && (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {formError}
                </Text>
              )}

              <PrimaryButton
                label={t('profile.saveChanges')}
                onPress={handleSave}
                loading={saving}
                disabled={!dirty}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.h2,
    flex: 1,
  },
  closeButton: {
    width: 48,
    height: 48,
    marginRight: -spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.bodyBold,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
    minHeight: 52,
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  readonly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.background,
  },
  readonlyText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  note: {
    ...typography.meta,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
