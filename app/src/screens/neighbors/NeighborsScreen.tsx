import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  LayoutAnimation,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PrimaryButton from '../../components/PrimaryButton';
import ScreenContainer from '../../components/ScreenContainer';
import { ErrorView, LoadingView } from '../../components/StateViews';
import { useAuth } from '../../context/AuthContext';
import AssignHouseholdSheet from './AssignHouseholdSheet';
import { useAdminManageUser } from '../../hooks/useAdminManageUser';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { t } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { TABLES, type Household, type Profile, type UserRole } from '../../types/database';

type Filter = 'pending' | 'active' | 'blocked';
const FILTERS: Filter[] = ['pending', 'active', 'blocked'];
const FILTER_LABELS: Record<Filter, string> = {
  pending: 'neighbors.filterPending',
  active: 'neighbors.filterActive',
  blocked: 'neighbors.filterBlocked',
};
const EMPTY_KEYS: Record<Filter, [string, string?]> = {
  pending: ['neighbors.emptyPending', 'neighbors.emptyPendingHint'],
  active: ['neighbors.emptyActive', 'neighbors.emptyActiveHint'],
  blocked: ['neighbors.emptyBlocked'],
};
// Search only earns its space once the list is long enough to need it.
const SEARCH_THRESHOLD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The backend returns opaque codes; map the ones an admin can act on. */
function errorMessage(code: string): string {
  switch (code) {
    case 'last_admin':
      return t('neighbors.errorLastAdmin');
    case 'household_not_found':
      return t('neighbors.errorHouseholdMissing');
    case 'unauthorized':
    case 'not_active':
    case 'not_admin':
      return t('neighbors.errorNoPermission');
    case 'network_error':
      return t('neighbors.errorOffline');
    default:
      return t('neighbors.actionError');
  }
}

export default function NeighborsScreen() {
  const { profile: me } = useAuth();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const hasLoaded = useRef(false);

  const [filter, setFilter] = useState<Filter>('pending');
  const filterTouched = useRef(false);
  const [search, setSearch] = useState('');

  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [sheetTarget, setSheetTarget] = useState<Profile | null>(null);
  const [assignTarget, setAssignTarget] = useState<Profile | null>(null);

  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('neighbor');
  const [inviteError, setInviteError] = useState<string | null>(null);

  const { callAdminManageUser, loading: mutating } = useAdminManageUser();

  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from(TABLES.profiles)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    hasLoaded.current = true;
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

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { pending: 0, active: 0, blocked: 0 };
    for (const p of profiles) result[p.status] += 1;
    return result;
  }, [profiles]);

  // Land on the admin's main job: pending requests first, else the active list.
  useEffect(() => {
    if (!hasLoaded.current || filterTouched.current) return;
    filterTouched.current = true;
    setFilter(counts.pending > 0 ? 'pending' : 'active');
  }, [counts.pending, profiles]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProfiles(), fetchHouseholds()]);
    setRefreshing(false);
  }, [fetchProfiles, fetchHouseholds]);

  const haptic = (kind: 'success' | 'warning' | 'error') => {
    const type = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    }[kind];
    Haptics.notificationAsync(type).catch(() => {});
  };

  const runAction = useCallback(
    async (
      userId: string,
      body: Parameters<typeof callAdminManageUser>[0],
      feedback: 'success' | 'warning' = 'success'
    ): Promise<boolean> => {
      setRowErrors((prev) => ({ ...prev, [userId]: '' }));
      setBusyUserId(userId);
      const result = await callAdminManageUser(body);
      setBusyUserId(null);
      if (!result.ok) {
        setRowErrors((prev) => ({ ...prev, [userId]: errorMessage(result.error) }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return false;
      }
      Haptics.notificationAsync(
        feedback === 'warning'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      ).catch(() => {});
      // The row moves to its new list; let it glide instead of jumping.
      if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await fetchProfiles();
      return true;
    },
    [callAdminManageUser, fetchProfiles, reduceMotion]
  );

  const displayName = (p: Profile) => p.full_name?.trim() || t('neighbors.noName');

  const confirm = (
    title: string,
    message: string,
    confirmLabel: string,
    destructive: boolean,
    onConfirm: () => void
  ) => {
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
    ]);
  };

  const handleApprove = (p: Profile) => runAction(p.id, { action: 'approve', user_id: p.id });
  const handleUnblock = (p: Profile) => runAction(p.id, { action: 'unblock', user_id: p.id });

  const handleBlock = (p: Profile) =>
    confirm(
      t('neighbors.confirmBlockTitle'),
      t('neighbors.confirmBlockMessage', { name: displayName(p) }),
      t('neighbors.block'),
      true,
      () => runAction(p.id, { action: 'block', user_id: p.id }, 'warning')
    );

  const handleRemove = (p: Profile) =>
    confirm(
      t('neighbors.confirmRemoveTitle'),
      t('neighbors.confirmRemoveMessage', { name: displayName(p) }),
      t('neighbors.remove'),
      true,
      () => runAction(p.id, { action: 'remove', user_id: p.id }, 'warning')
    );

  const handleToggleRole = (p: Profile) => {
    const makeAdmin = p.role !== 'admin';
    confirm(
      t(makeAdmin ? 'neighbors.confirmMakeAdminTitle' : 'neighbors.confirmMakeNeighborTitle'),
      t(makeAdmin ? 'neighbors.confirmMakeAdminMessage' : 'neighbors.confirmMakeNeighborMessage', {
        name: displayName(p),
      }),
      t(makeAdmin ? 'neighbors.makeAdmin' : 'neighbors.makeNeighbor'),
      false,
      () =>
        runAction(p.id, {
          action: 'set_role',
          user_id: p.id,
          role: makeAdmin ? 'admin' : 'neighbor',
        })
    );
  };

  const openAssignModal = (p: Profile) => setAssignTarget(p);

  /** Resolves to an error message for the sheet to show, or `null` on success. */
  const assignHousehold = async (householdId: string | null): Promise<string | null> => {
    if (!assignTarget) return null;
    const result = await callAdminManageUser({
      action: 'set_household',
      user_id: assignTarget.id,
      household_id: householdId,
    });
    if (!result.ok) {
      haptic('error');
      return errorMessage(result.error);
    }
    haptic('success');
    setAssignTarget(null);
    await fetchProfiles();
    return null;
  };

  const createAndAssignHousehold = async (label: string): Promise<string | null> => {
    const { data, error: insertError } = await supabase
      .from(TABLES.households)
      .insert({ unit_label: label })
      .select('id')
      .single();
    if (insertError || !data) {
      haptic('error');
      return t('neighbors.actionError');
    }
    await fetchHouseholds();
    return assignHousehold(data.id as string);
  };

  const openInviteModal = () => {
    setInviteEmail('');
    setInviteRole('neighbor');
    setInviteError(null);
    setInviteVisible(true);
  };

  const handleSendInvite = async () => {
    const email = inviteEmail.trim();
    if (!EMAIL_RE.test(email)) {
      setInviteError(t('neighbors.inviteInvalidEmail'));
      return;
    }
    setInviteError(null);
    const result = await callAdminManageUser({ action: 'invite', email, role: inviteRole });
    if (result.ok) {
      haptic('success');
      setInviteVisible(false);
      Alert.alert(t('neighbors.inviteSuccess'));
      await fetchProfiles();
    } else {
      haptic('error');
      setInviteError(
        result.error === 'network_error' ? t('neighbors.errorOffline') : t('neighbors.inviteError')
      );
    }
  };

  const visible = useMemo(() => {
    const query = normalize(search.trim());
    return profiles.filter(
      (p) => p.status === filter && (!query || normalize(p.full_name ?? '').includes(query))
    );
  }, [profiles, filter, search]);

  const householdLabel = (p: Profile) =>
    households.find((h) => h.id === p.household_id)?.unit_label ?? t('neighbors.noHousehold');

  const renderItem = ({ item }: { item: Profile }) => {
    const isMe = item.id === me?.id;
    const isBusy = busyUserId === item.id;
    const rowError = rowErrors[item.id];
    const name = displayName(item);

    return (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <View style={styles.rowInfo}>
            <Text style={styles.name} numberOfLines={2}>
              {name}
              {isMe ? ` · ${t('neighbors.you')}` : ''}
            </Text>
            <Text style={styles.sub}>
              {t(`roles.${item.role}`)} · {householdLabel(item)}
            </Text>
          </View>
          <Pressable
            onPress={() => setSheetTarget(item)}
            hitSlop={8}
            style={styles.moreButton}
            accessibilityRole="button"
            accessibilityLabel={t('neighbors.moreActions', { name })}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {item.status === 'pending' && (
          <PrimaryButton
            label={t('neighbors.approve')}
            onPress={() => handleApprove(item)}
            loading={isBusy && mutating}
            style={styles.rowAction}
          />
        )}
        {item.status === 'blocked' && (
          <PrimaryButton
            label={t('neighbors.unblock')}
            onPress={() => handleUnblock(item)}
            loading={isBusy && mutating}
            variant="secondary"
            style={styles.rowAction}
          />
        )}

        {!!rowError && (
          <Text style={styles.rowError} accessibilityLiveRegion="polite">
            {rowError}
          </Text>
        )}
      </View>
    );
  };

  const edges = ['top', 'bottom', 'left', 'right'] as const;

  if (loading) {
    return (
      <ScreenContainer edges={edges}>
        <LoadingView label={t('neighbors.loading')} />
      </ScreenContainer>
    );
  }

  // Only a first load that failed replaces the screen; a failed refresh keeps
  // the list already shown and says so.
  if (loadError && !hasLoaded.current) {
    return (
      <ScreenContainer edges={edges}>
        <ErrorView message={t('neighbors.loadError')} onRetry={handleRefresh} />
      </ScreenContainer>
    );
  }

  const [emptyTitleKey, emptyHintKey] = EMPTY_KEYS[filter];
  const query = search.trim();

  // Actions in the sheet depend on the neighbor's status and on who is asking:
  // an admin cannot block, remove or demote themselves.
  const sheetActions = (p: Profile) => {
    const isMe = p.id === me?.id;
    const actions: {
      key: string;
      icon: React.ComponentProps<typeof Ionicons>['name'];
      label: string;
      destructive?: boolean;
      run: () => void;
    }[] = [
      {
        key: 'household',
        icon: 'home-outline',
        label: t('neighbors.assignHousehold'),
        run: () => openAssignModal(p),
      },
    ];
    if (p.status === 'active' && !isMe) {
      actions.push({
        key: 'role',
        icon: p.role === 'admin' ? 'person-outline' : 'shield-checkmark-outline',
        label: p.role === 'admin' ? t('neighbors.makeNeighbor') : t('neighbors.makeAdmin'),
        run: () => handleToggleRole(p),
      });
      actions.push({
        key: 'block',
        icon: 'ban-outline',
        label: t('neighbors.block'),
        destructive: true,
        run: () => handleBlock(p),
      });
    }
    if (!isMe) {
      actions.push({
        key: 'remove',
        icon: 'trash-outline',
        label: t('neighbors.remove'),
        destructive: true,
        run: () => handleRemove(p),
      });
    }
    return actions;
  };

  return (
    <ScreenContainer edges={edges} contentStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[typography.meta, styles.headerTitle]} accessibilityRole="header">
          {t('neighbors.title')} · {profiles.length}
        </Text>
        <PrimaryButton
          label={t('neighbors.inviteButton')}
          onPress={openInviteModal}
          variant="secondary"
          style={styles.inviteButton}
        />
      </View>

      <View style={styles.chips} accessibilityRole="tablist">
        {FILTERS.map((key) => {
          const selected = filter === key;
          const attention = key === 'pending' && counts.pending > 0 && !selected;
          return (
            <Pressable
              key={key}
              onPress={() => {
                filterTouched.current = true;
                setFilter(key);
              }}
              style={[styles.chip, selected && styles.chipSelected, attention && styles.chipAttention]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.chipText,
                  selected && styles.chipTextSelected,
                  attention && styles.chipTextAttention,
                ]}
                maxFontSizeMultiplier={1.3}
                numberOfLines={2}
              >
                {t(FILTER_LABELS[key])} {counts[key]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {profiles.length > SEARCH_THRESHOLD && (
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('neighbors.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={styles.search}
          accessibilityLabel={t('neighbors.searchPlaceholder')}
        />
      )}

      {loadError && (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.bannerText}>{t('neighbors.refreshError')}</Text>
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {query ? t('neighbors.emptySearch', { query }) : t(emptyTitleKey)}
            </Text>
            {!query && !!emptyHintKey && <Text style={styles.emptyHint}>{t(emptyHintKey)}</Text>}
          </View>
        }
        contentContainerStyle={visible.length === 0 ? styles.emptyContent : styles.list}
      />

      <Modal
        visible={!!sheetTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetTarget(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setSheetTarget(null)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: spacing.md + insets.bottom }]}
            onPress={() => {}}
          >
            {sheetTarget && (
              <>
                <Text style={styles.sheetTitle} numberOfLines={2}>
                  {displayName(sheetTarget)}
                </Text>
                {sheetActions(sheetTarget).map((action) => (
                  <Pressable
                    key={action.key}
                    onPress={() => {
                      setSheetTarget(null);
                      action.run();
                    }}
                    style={styles.sheetAction}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={action.icon}
                      size={24}
                      color={action.destructive ? colors.danger : colors.textPrimary}
                    />
                    <Text
                      style={[styles.sheetActionText, action.destructive && styles.sheetDestructive]}
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
                <PrimaryButton
                  label={t('common.cancel')}
                  onPress={() => setSheetTarget(null)}
                  variant="secondary"
                  style={styles.modalButton}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <AssignHouseholdSheet
        target={assignTarget}
        households={households}
        onAssign={assignHousehold}
        onCreate={createAndAssignHousehold}
        onClose={() => setAssignTarget(null)}
      />

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
                onChangeText={(value) => {
                  setInviteEmail(value);
                  if (inviteError) setInviteError(null);
                }}
                placeholder={t('neighbors.inviteEmailPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={styles.input}
                accessibilityLabel={t('neighbors.inviteEmailLabel')}
              />
              {!!inviteError && (
                <Text style={styles.rowError} accessibilityLiveRegion="polite">
                  {inviteError}
                </Text>
              )}
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
  content: {
    flexGrow: 1,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTitle: {
    flexShrink: 1,
  },
  inviteButton: {
    minHeight: 48,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chip: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  // Pending requests are the admin's work queue: tint the chip when there are some.
  chipAttention: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
  },
  chipText: {
    ...typography.bodyBold,
    textAlign: 'center',
  },
  chipTextSelected: {
    color: colors.textInverse,
  },
  chipTextAttention: {
    color: colors.warning,
  },
  search: {
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
  banner: {
    backgroundColor: colors.warningLight,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  bannerText: {
    ...typography.body,
    color: colors.warning,
  },
  list: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.h3,
  },
  sub: {
    ...typography.body,
    color: colors.textSecondary,
  },
  moreButton: {
    width: 48,
    height: 48,
    marginTop: -spacing.xs,
    marginRight: -spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAction: {
    minHeight: 52,
  },
  rowError: {
    ...typography.body,
    color: colors.danger,
  },
  separator: {
    height: spacing.sm,
  },
  emptyContent: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptyHint: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sheetTitle: {
    ...typography.h2,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
  },
  sheetActionText: {
    ...typography.h3,
    fontWeight: '500',
  },
  sheetDestructive: {
    color: colors.danger,
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
