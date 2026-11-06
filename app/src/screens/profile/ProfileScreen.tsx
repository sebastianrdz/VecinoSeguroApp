import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';

import ScreenContainer from '../../components/ScreenContainer';
import EditProfileSheet from './EditProfileSheet';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { TABLES } from '../../types/database';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

type ProfileNavProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Profile'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type HouseholdState =
  | { kind: 'unset' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'found'; label: string };

/** "Ana Pérez" -> "AP"; falls back to the email's first letter, then "?". */
function initialsOf(fullName: string | undefined, email: string | undefined): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase();
  }
  return (email ?? '?').charAt(0).toUpperCase();
}

export default function ProfileScreen() {
  const { profile, session, signOut } = useAuth();
  const navigation = useNavigation<ProfileNavProp>();

  const [household, setHousehold] = useState<HouseholdState>({ kind: 'unset' });
  const [reloadKey, setReloadKey] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (!profile?.household_id) {
      setHousehold({ kind: 'unset' });
      return;
    }

    setHousehold({ kind: 'loading' });
    supabase
      .from(TABLES.households)
      .select('unit_label')
      .eq('id', profile.household_id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return;
        setHousehold(
          error || !data?.unit_label ? { kind: 'error' } : { kind: 'found', label: data.unit_label }
        );
      });

    return () => {
      mounted = false;
    };
  }, [profile?.household_id, reloadKey]);

  const doSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } catch {
      setSigningOut(false);
      Alert.alert(t('profile.signOutError'));
    }
  }, [signOut]);

  const handleSignOut = () => {
    Alert.alert(t('profile.signOutConfirmTitle'), t('profile.signOutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: doSignOut },
    ]);
  };

  const email = session?.user.email ?? '';
  const fullName = profile?.full_name?.trim() ?? '';
  const isAdmin = profile?.role === 'admin';
  const version = Constants.expoConfig?.version;

  return (
    <ScreenContainer scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.identity}>
        <View style={styles.avatar} accessible={false} importantForAccessibility="no-hide-descendants">
          <Text style={styles.avatarText}>{initialsOf(fullName, email)}</Text>
        </View>
        {!!fullName && (
          <Text style={styles.name} numberOfLines={2} accessibilityRole="header">
            {fullName}
          </Text>
        )}
        {!!email && (
          <Text style={styles.email} numberOfLines={1} ellipsizeMode="middle">
            {email}
          </Text>
        )}
        {isAdmin && (
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{t('roles.admin')}</Text>
          </View>
        )}
        <Pressable
          onPress={() => setEditing(true)}
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={22} color={colors.primary} />
          <Text style={styles.editButtonText}>{t('profile.edit')}</Text>
        </Pressable>
      </View>

      <View style={styles.group}>
        <View
          style={[styles.row, styles.rowDivider]}
          accessible
          accessibilityLabel={`${t('profile.phone')}: ${profile?.phone || t('profile.phoneUnset')}`}
        >
          <Ionicons name="call-outline" size={24} color={colors.textSecondary} />
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>{t('profile.phone')}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {profile?.phone || t('profile.phoneUnset')}
            </Text>
          </View>
        </View>

        <View
          style={[styles.row, styles.rowDivider]}
          accessible
          accessibilityLabel={`${t('profile.household')}: ${
            household.kind === 'found'
              ? household.label
              : household.kind === 'error'
                ? t('profile.householdError')
                : household.kind === 'loading'
                  ? t('common.loading')
                  : t('profile.householdUnset')
          }`}
        >
          <Ionicons name="home-outline" size={24} color={colors.textSecondary} />
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>{t('profile.household')}</Text>
            <Text style={styles.rowValue} numberOfLines={2}>
              {household.kind === 'found' && household.label}
              {household.kind === 'loading' && t('common.loading')}
              {household.kind === 'error' && t('profile.householdError')}
              {household.kind === 'unset' && t('profile.householdUnset')}
            </Text>
            {household.kind === 'unset' && (
              <Text style={styles.rowHint}>{t('profile.householdUnsetHint')}</Text>
            )}
          </View>
          {household.kind === 'error' && (
            <Pressable
              onPress={() => setReloadKey((k) => k + 1)}
              hitSlop={8}
              style={styles.retry}
              accessibilityRole="button"
              accessibilityLabel={t('common.retry')}
            >
              <Ionicons name="refresh" size={24} color={colors.primary} />
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => navigation.navigate('PrivacyNotice')}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
        >
          <Ionicons name="document-text-outline" size={24} color={colors.textSecondary} />
          <Text style={[styles.rowValue, styles.rowGrow]}>{t('profile.privacyNotice')}</Text>
          <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Pressable
        onPress={handleSignOut}
        disabled={signingOut}
        style={({ pressed }) => [styles.group, styles.row, styles.signOut, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityState={{ disabled: signingOut, busy: signingOut }}
      >
        <Ionicons name="log-out-outline" size={24} color={colors.danger} />
        <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
      </Pressable>

      <EditProfileSheet visible={editing} onClose={() => setEditing(false)} />

      {!!version && <Text style={styles.version}>{t('profile.appVersion', { version })}</Text>}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.textInverse,
  },
  name: {
    ...typography.h2,
    textAlign: 'center',
  },
  email: {
    ...typography.meta,
    maxWidth: '100%',
  },
  rolePill: {
    backgroundColor: colors.primaryLight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  rolePillText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  editButtonPressed: {
    backgroundColor: colors.primaryLight,
  },
  editButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.background,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowGrow: {
    flex: 1,
  },
  rowLabel: {
    ...typography.meta,
  },
  rowValue: {
    ...typography.h3,
    fontWeight: '500',
  },
  rowHint: {
    ...typography.body,
    color: colors.textSecondary,
  },
  retry: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: {
    marginTop: spacing.lg,
  },
  signOutText: {
    ...typography.h3,
    fontWeight: '500',
    color: colors.danger,
  },
  version: {
    ...typography.meta,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingBottom: spacing.md,
  },
});
