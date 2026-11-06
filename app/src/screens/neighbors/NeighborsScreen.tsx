import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import PrimaryButton from '../../components/PrimaryButton';
import ScreenContainer from '../../components/ScreenContainer';
import { EmptyView, ErrorView, LoadingView } from '../../components/StateViews';
import StatusPill from '../../components/StatusPill';
import { useAdminManageUser } from '../../hooks/useAdminManageUser';
import { t } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { TABLES, type Household, type Profile, type UserRole } from '../../types/database';

export default function NeighborsScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [households, setHouseholds] = useState<Household[]>([]);
  const [assignTarget, setAssignTarget] = useState<Profile | null>(null);
  const [newHouseholdLabel, setNewHouseholdLabel] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);

  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('neighbor');

  const { callAdminManageUser, loading: mutating } = useAdminManageUser();

  const fetchProfiles = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from(TABLES.profiles)
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(t('neighbors.loadError'));
      return;
    }
    setError(null);
    setProfiles((data as Profile[]) ?? []);
  }, []);

  const fetchHouseholds = useCallback(async () => {
    const { data } = await supabase
      .from(TABLES.households)
      .select('*')
      .order('unit_label', { ascending: true });
    setHouseholds((data as Household[]) ?? []);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([fetchProfiles(), fetchHouseholds()]).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [fetchProfiles, fetchHouseholds]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProfiles(), fetchHouseholds()]);
    setRefreshing(false);
  }, [fetchProfiles]);

  const runAction = useCallback(
    async (userId: string, body: Parameters<typeof callAdminManageUser>[0]) => {
      setRowErrors((prev) => ({ ...prev, [userId]: '' }));
      setBusyUserId(userId);
      const result = await callAdminManageUser(body);
      setBusyUserId(null);
      if (!result.ok) {
        setRowErrors((prev) => ({ ...prev, [userId]: t('neighbors.actionError') }));
        return;
      }
      await fetchProfiles();
    },
    [callAdminManageUser, fetchProfiles]
  );

  const openAssignModal = (profile: Profile) => {
    setAssignTarget(profile);
    setNewHouseholdLabel('');
    setAssignError(null);
  };

  const assignHousehold = async (householdId: string | null) => {
    if (!assignTarget) return;
    const result = await callAdminManageUser({
      action: 'set_household',
      user_id: assignTarget.id,
      household_id: householdId,
    });
    if (!result.ok) {
      setAssignError(t('neighbors.actionError'));
      return;
    }
    setAssignTarget(null);
    await fetchProfiles();
  };

  const handleCreateAndAssign = async () => {
    const label = newHouseholdLabel.trim();
    if (!label) return;
    const { data, error: insertError } = await supabase
      .from(TABLES.households)
      .insert({ unit_label: label })
      .select('id')
      .single();
    if (insertError || !data) {
      setAssignError(t('neighbors.actionError'));
      return;
    }
    await fetchHouseholds();
    await assignHousehold(data.id as string);
  };

  const handleApprove = (profile: Profile) => runAction(profile.id, { action: 'approve', user_id: profile.id });
  const handleBlock = (profile: Profile) => runAction(profile.id, { action: 'block', user_id: profile.id });
  const handleUnblock = (profile: Profile) => runAction(profile.id, { action: 'unblock', user_id: profile.id });
  const handleToggleRole = (profile: Profile) => {
    const nextRole: UserRole = profile.role === 'admin' ? 'neighbor' : 'admin';
    return runAction(profile.id, { action: 'set_role', user_id: profile.id, role: nextRole });
  };

  const handleRemove = (profile: Profile) => {
    Alert.alert(
      t('neighbors.confirmRemoveTitle'),
      t('neighbors.confirmRemoveMessage', { name: profile.full_name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('neighbors.remove'),
          style: 'destructive',
          onPress: () => runAction(profile.id, { action: 'remove', user_id: profile.id }),
        },
      ]
    );
  };

  const openInviteModal = () => {
    setInviteEmail('');
    setInviteRole('neighbor');
    setInviteVisible(true);
  };

  const handleSendInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    const result = await callAdminManageUser({ action: 'invite', email, role: inviteRole });
    if (result.ok) {
      setInviteVisible(false);
      Alert.alert(t('neighbors.inviteSuccess'));
      await fetchProfiles();
    } else {
      Alert.alert(t('neighbors.inviteError'));
    }
  };

  const renderItem = ({ item }: { item: Profile }) => {
    const isBusy = busyUserId === item.id;
    const rowError = rowErrors[item.id];

    return (
      <View style={styles.row}>
        <View style={styles.rowHeader}>
          <Text style={styles.name}>{item.full_name ?? ''}</Text>
          <StatusPill status={item.status} label={t(`status.${item.status}`)} />
        </View>
        <Text style={styles.role}>{t(`roles.${item.role}`)}</Text>
        <Text style={styles.role}>
          {t('neighbors.householdLabel')}:{' '}
          {households.find((h) => h.id === item.household_id)?.unit_label ??
            t('profile.householdUnset')}
        </Text>

        <View style={styles.actions}>
          {item.status === 'pending' && (
            <PrimaryButton
              label={t('neighbors.approve')}
              onPress={() => handleApprove(item)}
              loading={isBusy && mutating}
              variant="secondary"
              style={styles.actionButton}
            />
          )}
          {item.status === 'active' && (
            <>
              <PrimaryButton
                label={t('neighbors.block')}
                onPress={() => handleBlock(item)}
                loading={isBusy && mutating}
                variant="secondary"
                style={styles.actionButton}
              />
              <PrimaryButton
                label={item.role === 'neighbor' ? t('neighbors.makeAdmin') : t('neighbors.makeNeighbor')}
                onPress={() => handleToggleRole(item)}
                loading={isBusy && mutating}
                variant="secondary"
                style={styles.actionButton}
              />
            </>
          )}
          {item.status === 'blocked' && (
            <PrimaryButton
              label={t('neighbors.unblock')}
              onPress={() => handleUnblock(item)}
              loading={isBusy && mutating}
              variant="secondary"
              style={styles.actionButton}
            />
          )}
          {item.status !== 'blocked' && (
            <PrimaryButton
              label={t('neighbors.assignHousehold')}
              onPress={() => openAssignModal(item)}
              variant="secondary"
              style={styles.actionButton}
            />
          )}
          <PrimaryButton
            label={t('neighbors.remove')}
            onPress={() => handleRemove(item)}
            loading={isBusy && mutating}
            variant="danger"
            style={styles.actionButton}
          />
        </View>

        {!!rowError && <Text style={styles.rowError}>{rowError}</Text>}
      </View>
    );
  };

  if (loading) {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        <ErrorView message={error} onRetry={handleRefresh} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <PrimaryButton
        label={t('neighbors.inviteButton')}
        onPress={openInviteModal}
        style={styles.inviteButton}
      />

      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<EmptyView message={t('neighbors.empty')} />}
        contentContainerStyle={profiles.length === 0 ? styles.emptyContent : undefined}
      />

      <Modal
        visible={!!assignTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setAssignTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={typography.h2}>{t('neighbors.assignHousehold')}</Text>
            <Text style={typography.caption}>{assignTarget?.full_name}</Text>

            {households.map((h) => (
              <PrimaryButton
                key={h.id}
                label={h.unit_label}
                onPress={() => assignHousehold(h.id)}
                variant={h.id === assignTarget?.household_id ? 'primary' : 'secondary'}
                loading={mutating}
              />
            ))}
            {!!assignTarget?.household_id && (
              <PrimaryButton
                label={t('neighbors.unassignHousehold')}
                onPress={() => assignHousehold(null)}
                variant="secondary"
                loading={mutating}
              />
            )}

            <View style={styles.field}>
              <Text style={styles.label}>{t('neighbors.newHouseholdLabel')}</Text>
              <TextInput
                value={newHouseholdLabel}
                onChangeText={setNewHouseholdLabel}
                placeholder={t('neighbors.newHouseholdPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                accessibilityLabel={t('neighbors.newHouseholdLabel')}
              />
            </View>
            <PrimaryButton
              label={t('neighbors.createAndAssign')}
              onPress={handleCreateAndAssign}
              disabled={!newHouseholdLabel.trim()}
              loading={mutating}
            />

            {!!assignError && <Text style={styles.rowError}>{assignError}</Text>}
            <PrimaryButton
              label={t('common.cancel')}
              onPress={() => setAssignTarget(null)}
              variant="secondary"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={inviteVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setInviteVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={typography.h2}>{t('neighbors.inviteTitle')}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>{t('neighbors.inviteEmailLabel')}</Text>
              <TextInput
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder={t('neighbors.inviteEmailPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={styles.input}
                accessibilityLabel={t('neighbors.inviteEmailLabel')}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('neighbors.inviteRoleLabel')}</Text>
              <View style={styles.roleToggle}>
                <PrimaryButton
                  label={t('roles.neighbor')}
                  onPress={() => setInviteRole('neighbor')}
                  variant={inviteRole === 'neighbor' ? 'primary' : 'secondary'}
                  style={styles.roleButton}
                />
                <PrimaryButton
                  label={t('roles.admin')}
                  onPress={() => setInviteRole('admin')}
                  variant={inviteRole === 'admin' ? 'primary' : 'secondary'}
                  style={styles.roleButton}
                />
              </View>
            </View>

            <PrimaryButton
              label={t('neighbors.inviteSend')}
              onPress={handleSendInvite}
              loading={mutating}
              disabled={!inviteEmail.trim()}
              style={styles.modalButton}
            />
            <PrimaryButton
              label={t('common.cancel')}
              onPress={() => setInviteVisible(false)}
              variant="secondary"
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  inviteButton: {
    marginBottom: spacing.md,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    ...typography.bodyBold,
    flexShrink: 1,
  },
  role: {
    ...typography.caption,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowError: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  separator: {
    height: spacing.sm,
  },
  emptyContent: {
    flexGrow: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
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
    minHeight: 48,
  },
  roleToggle: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  roleButton: {
    flex: 1,
  },
  modalButton: {
    marginTop: spacing.xs,
  },
});
