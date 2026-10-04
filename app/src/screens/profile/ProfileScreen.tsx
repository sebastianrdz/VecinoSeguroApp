import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import PrimaryButton from '../../components/PrimaryButton';
import ScreenContainer from '../../components/ScreenContainer';
import StatusPill from '../../components/StatusPill';
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

export default function ProfileScreen() {
  const { profile, session, signOut } = useAuth();
  const navigation = useNavigation<ProfileNavProp>();

  const [householdLabel, setHouseholdLabel] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!profile?.household_id) {
      setHouseholdLabel(null);
      return;
    }

    supabase
      .from(TABLES.households)
      .select('unit_label')
      .eq('id', profile.household_id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return;
        setHouseholdLabel(error ? null : (data?.unit_label ?? null));
      });

    return () => {
      mounted = false;
    };
  }, [profile?.household_id]);

  const handleSignOut = () => {
    Alert.alert(
      t('profile.signOutConfirmTitle'),
      t('profile.signOutConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.signOut'), style: 'destructive', onPress: () => signOut() },
      ]
    );
  };

  return (
    <ScreenContainer scroll>
      <Text style={typography.h1}>{t('profile.title')}</Text>

      <View style={styles.card}>
        <Text style={styles.name}>{profile?.full_name ?? ''}</Text>
        <Text style={styles.email}>{session?.user.email ?? ''}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.roleLabel')}</Text>
          <Text style={styles.infoValue}>{profile ? t(`roles.${profile.role}`) : ''}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.statusLabel')}</Text>
          {profile && <StatusPill status={profile.status} label={t(`status.${profile.status}`)} />}
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.household')}</Text>
          <Text style={styles.infoValue}>
            {householdLabel ?? t('profile.householdUnset')}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('profile.settingsTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('profile.languageLabel')}</Text>
          <Text style={styles.infoValue}>{t('profile.languageValue')}</Text>
        </View>

        <PrimaryButton
          label={t('profile.privacyNotice')}
          onPress={() => navigation.navigate('PrivacyNotice')}
          variant="secondary"
          style={styles.rowButton}
        />
      </View>

      <PrimaryButton
        label={t('profile.signOut')}
        onPress={handleSignOut}
        variant="danger"
        style={styles.signOutButton}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  name: {
    ...typography.h3,
  },
  email: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.bodyBold,
  },
  sectionTitle: {
    ...typography.h3,
    marginTop: spacing.lg,
  },
  rowButton: {
    marginTop: spacing.sm,
  },
  signOutButton: {
    marginTop: spacing.xl,
  },
});
