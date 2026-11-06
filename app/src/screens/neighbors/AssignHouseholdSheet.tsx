import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { t } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { Household, Profile } from '../../types/database';

// Search only earns its space once the list is long enough to need it.
const SEARCH_THRESHOLD = 8;
const MAX_LABEL_LENGTH = 40;

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface AssignHouseholdSheetProps {
  /** The neighbor being assigned; the sheet is visible while this is set. */
  target: Profile | null;
  households: Household[];
  /** Assign (or clear with `null`). Resolves to an error message, or `null` on success. */
  onAssign: (householdId: string | null) => Promise<string | null>;
  /** Create a household, then assign it. Resolves to an error message, or `null` on success. */
  onCreate: (label: string) => Promise<string | null>;
  onClose: () => void;
}

export default function AssignHouseholdSheet({
  target,
  households,
  onAssign,
  onCreate,
  onClose,
}: AssignHouseholdSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [newLabel, setNewLabel] = useState('');
  // Which control is waiting on the server: a household id, 'none', or 'create'.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Every opening starts clean.
  useEffect(() => {
    if (target) {
      setQuery('');
      setNewLabel('');
      setBusyKey(null);
      setError(null);
    }
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Casa 2" before "Casa 10": plain alphabetical order buries the number.
  const sorted = useMemo(
    () => [...households].sort((a, b) => a.unit_label.localeCompare(b.unit_label, 'es', { numeric: true })),
    [households]
  );
  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return q ? sorted.filter((h) => normalize(h.unit_label).includes(q)) : sorted;
  }, [sorted, query]);

  const current = households.find((h) => h.id === target?.household_id) ?? null;
  const busy = busyKey !== null;
  const name = target?.full_name?.trim() || t('neighbors.noName');

  const run = async (key: string, action: () => Promise<string | null>) => {
    if (busy) return;
    setBusyKey(key);
    setError(null);
    const failure = await action();
    setBusyKey(null);
    if (failure) setError(failure);
  };

  const handleSelect = (household: Household) => {
    if (household.id === target?.household_id) {
      onClose();
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    run(household.id, () => onAssign(household.id));
  };

  const handleCreate = () => {
    const label = newLabel.trim();
    if (!label) return;
    const duplicate = households.some(
      (h) => normalize(h.unit_label.trim()) === normalize(label)
    );
    if (duplicate) {
      setError(t('neighbors.householdExists'));
      return;
    }
    run('create', () => onCreate(label));
  };

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: spacing.md + insets.bottom }]}
            onPress={() => {}}
          >
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
                  {t('neighbors.assignTitle', { name })}
                </Text>
                <Text style={styles.current}>
                  {t('neighbors.assignCurrent', {
                    label: current?.unit_label ?? t('neighbors.noHousehold'),
                  })}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </Pressable>
            </View>

            {households.length > SEARCH_THRESHOLD && (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('neighbors.assignSearchPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                autoCorrect={false}
                clearButtonMode="while-editing"
                style={styles.input}
                accessibilityLabel={t('neighbors.assignSearchPlaceholder')}
              />
            )}

            <FlatList
              data={shown}
              keyExtractor={(h) => h.id}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item }) => {
                const selected = item.id === target?.household_id;
                return (
                  <Pressable
                    onPress={() => handleSelect(item)}
                    disabled={busy && busyKey !== item.id}
                    style={[styles.option, selected && styles.optionSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, busy: busyKey === item.id }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {item.unit_label}
                    </Text>
                    {busyKey === item.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      selected && (
                        <Ionicons name="checkmark-circle" size={26} color={colors.primary} />
                      )
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {households.length === 0
                    ? t('neighbors.assignEmpty')
                    : t('neighbors.assignNoResults')}
                </Text>
              }
              ListFooterComponent={
                <>
                  {current && (
                    <Pressable
                      onPress={() => run('none', () => onAssign(null))}
                      disabled={busy}
                      style={styles.option}
                      accessibilityRole="button"
                    >
                      <Text style={styles.removeText}>{t('neighbors.unassignHousehold')}</Text>
                      {busyKey === 'none' && <ActivityIndicator color={colors.danger} />}
                    </Pressable>
                  )}
                </>
              }
            />

            <View style={styles.create}>
              <Text style={styles.createLabel}>{t('neighbors.newHouseholdLabel')}</Text>
              <TextInput
                value={newLabel}
                onChangeText={(value) => {
                  setNewLabel(value);
                  if (error) setError(null);
                }}
                placeholder={t('neighbors.newHouseholdPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                maxLength={MAX_LABEL_LENGTH}
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                style={styles.input}
                accessibilityLabel={t('neighbors.newHouseholdLabel')}
              />
              <PrimaryButton
                label={t('neighbors.createAndAssign')}
                onPress={handleCreate}
                disabled={!newLabel.trim() || (busy && busyKey !== 'create')}
                loading={busyKey === 'create'}
              />
              {!!error && (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              )}
            </View>
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
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.h2,
  },
  current: {
    ...typography.meta,
  },
  closeButton: {
    width: 48,
    height: 48,
    marginTop: -spacing.xs,
    marginRight: -spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  optionSelected: {
    backgroundColor: colors.primaryLight,
  },
  optionText: {
    ...typography.h3,
    fontWeight: '500',
    flexShrink: 1,
  },
  optionTextSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
  removeText: {
    ...typography.h3,
    fontWeight: '500',
    color: colors.danger,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  create: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  createLabel: {
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
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
