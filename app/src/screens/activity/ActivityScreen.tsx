import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import ScreenContainer from '../../components/ScreenContainer';
import { EmptyView, ErrorView, LoadingView } from '../../components/StateViews';
import { t } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { TABLES, type GateEvent } from '../../types/database';

const SOURCE_LABELS: Record<GateEvent['source'], string> = {
  app: 'activity.sourceApp',
  pi: 'activity.sourcePi',
  system: 'activity.sourceSystem',
};

export default function ActivityScreen() {
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from(TABLES.gateEvents)
      .select('*, actor:profiles(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (fetchError) {
      setError(t('activity.loadError'));
      return;
    }
    setError(null);
    setEvents((data as GateEvent[]) ?? []);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchEvents().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [fetchEvents]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  }, [fetchEvents]);

  const renderItem = ({ item }: { item: GateEvent }) => {
    const actorName = item.actor?.full_name ?? t('activity.unknownActor');
    const sourceLabel = t(SOURCE_LABELS[item.source]);
    const isSuccess = item.result === 'success';
    const resultLabel = t(isSuccess ? 'activity.resultSuccess' : 'activity.resultFailed');
    const timestamp = new Date(item.created_at).toLocaleString();

    return (
      <View style={styles.row}>
        <View style={styles.rowHeader}>
          <Text style={styles.action}>{t('activity.actionOpen')}</Text>
          <Text
            style={[
              styles.result,
              { color: isSuccess ? colors.success : colors.danger },
            ]}
          >
            {resultLabel}
          </Text>
        </View>
        <Text style={styles.actor}>{actorName}</Text>
        <View style={styles.rowFooter}>
          <Text style={styles.meta}>{sourceLabel}</Text>
          <Text style={styles.meta}>{timestamp}</Text>
        </View>
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
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<EmptyView message={t('activity.empty')} />}
        contentContainerStyle={events.length === 0 ? styles.emptyContent : undefined}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  action: {
    ...typography.bodyBold,
  },
  result: {
    ...typography.bodyBold,
  },
  actor: {
    ...typography.body,
    color: colors.textSecondary,
  },
  rowFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  meta: {
    ...typography.caption,
  },
  separator: {
    height: spacing.sm,
  },
  emptyContent: {
    flexGrow: 1,
  },
});
