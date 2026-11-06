import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import ScreenContainer from '../../components/ScreenContainer';
import { ErrorView, LoadingView } from '../../components/StateViews';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { t } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { TABLES, type GateEvent } from '../../types/database';

const EVENT_LIMIT = 100;

interface DaySection {
  key: string;
  title: string;
  data: GateEvent[];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function dayTitle(date: Date): string {
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (daysAgo === 0) return t('activity.today');
  if (daysAgo === 1) return t('activity.yesterday');
  const label = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Events arrive newest-first; group consecutive events by local calendar day. */
function groupByDay(events: GateEvent[]): DaySection[] {
  const sections: DaySection[] = [];
  for (const event of events) {
    const date = new Date(event.created_at);
    const key = Number.isNaN(date.getTime()) ? 'unknown' : String(startOfDay(date));
    const last = sections[sections.length - 1];
    if (last && last.key === key) {
      last.data.push(event);
    } else {
      sections.push({
        key,
        title: key === 'unknown' ? '—' : dayTitle(date),
        data: [event],
      });
    }
  }
  return sections;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
}

function actorName(event: GateEvent): string {
  if (event.actor?.full_name) return event.actor.full_name;
  if (event.source === 'pi') return t('activity.actorGate');
  if (event.source === 'system') return t('activity.actorSystem');
  return t('activity.actorRemoved');
}

function describe(event: GateEvent): string {
  const ok = event.result === 'success';
  if (event.source === 'pi') return t(ok ? 'activity.piSuccess' : 'activity.piFailed');
  if (event.source === 'system') return t('activity.systemEvent');
  return t(ok ? 'activity.appRequested' : 'activity.appRequestedFailed');
}

function summarize(events: GateEvent[]): string {
  const today = startOfDay(new Date());
  const todays = events.filter((e) => startOfDay(new Date(e.created_at)) === today);
  if (todays.length === 0) return t('activity.summaryNone');
  // One open produces an app event (the request) and later a Pi event (the
  // gate's answer); count requests as openings, and any failure as failed.
  const openings = todays.filter((e) => e.source === 'app').length;
  const failed = todays.filter((e) => e.result === 'failed').length;
  const parts = [
    openings === 1 ? t('activity.openingsOne') : t('activity.openingsMany', { count: openings }),
  ];
  if (failed > 0) {
    parts.push(failed === 1 ? t('activity.failedOne') : t('activity.failedMany', { count: failed }));
  }
  return parts.join(' · ');
}

export default function ActivityScreen() {
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const hasLoaded = useRef(false);
  const reduceMotion = useReduceMotion();
  const listOpacity = useRef(new Animated.Value(0)).current;

  const fetchEvents = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from(TABLES.gateEvents)
      .select('*, actor:profiles(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(EVENT_LIMIT);

    if (fetchError) {
      setError(true);
      return;
    }
    setError(false);
    hasLoaded.current = true;
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

  // An admin coming back to this tab should see what happened meanwhile.
  useFocusEffect(
    useCallback(() => {
      if (hasLoaded.current) fetchEvents();
    }, [fetchEvents])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  }, [fetchEvents]);

  // The list settles in once on first load (instant with Reduce Motion).
  const showList = !loading && !(error && !hasLoaded.current);
  useEffect(() => {
    if (!showList) return;
    if (reduceMotion) {
      listOpacity.setValue(1);
      return;
    }
    Animated.timing(listOpacity, {
      toValue: 1,
      duration: 260,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [showList, reduceMotion, listOpacity]);

  const sections = useMemo(() => groupByDay(events), [events]);
  const edges = ['top', 'bottom', 'left', 'right'] as const;

  if (loading) {
    return (
      <ScreenContainer edges={edges}>
        <LoadingView label={t('activity.loading')} />
      </ScreenContainer>
    );
  }

  // Only a first load that failed replaces the screen; a failed refresh keeps
  // the list already shown and says so (see the banner below).
  if (error && !hasLoaded.current) {
    return (
      <ScreenContainer edges={edges}>
        <ErrorView message={t('activity.loadError')} onRetry={handleRefresh} />
      </ScreenContainer>
    );
  }

  const renderItem = ({
    item,
    index,
    section,
  }: {
    item: GateEvent;
    index: number;
    section: DaySection;
  }) => {
    const ok = item.result === 'success';
    const name = actorName(item);
    const what = describe(item);
    const time = formatTime(item.created_at);
    const isLast = index === section.data.length - 1;

    return (
      <View
        style={[styles.row, !ok && styles.rowFailed, !isLast && styles.rowDivider]}
        accessible
        accessibilityLabel={`${name}. ${what}. ${t(
          ok ? 'activity.resultSuccess' : 'activity.resultFailed'
        )}. ${time}`}
      >
        <Ionicons
          name={ok ? 'checkmark-circle' : 'close-circle'}
          size={32}
          color={ok ? colors.success : colors.danger}
        />
        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.what}>{what}</Text>
          {!ok && !!item.detail && <Text style={styles.detail}>{item.detail}</Text>}
        </View>
        <Text style={styles.time}>{time}</Text>
      </View>
    );
  };

  return (
    <ScreenContainer edges={edges}>
      <Text style={[typography.meta, styles.summary]} accessibilityRole="header">
        {t('activity.title')} · {summarize(events)}
      </Text>

      {error && (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.bannerText}>{t('activity.refreshError')}</Text>
        </View>
      )}

      <Animated.View style={[styles.flex, { opacity: listOpacity }]}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader} accessibilityRole="header">
              {section.title}
            </Text>
          )}
          stickySectionHeadersEnabled={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={56} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>{t('activity.empty')}</Text>
              <Text style={styles.emptyHint}>{t('activity.emptyHint')}</Text>
            </View>
          }
          ListFooterComponent={
            <>
              {events.length >= EVENT_LIMIT && (
                <Text style={styles.limitNote}>
                  {t('activity.limitNote', { count: EVENT_LIMIT })}
                </Text>
              )}
            </>
          }
          contentContainerStyle={events.length === 0 ? styles.emptyContent : styles.list}
        />
      </Animated.View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  summary: {
    paddingVertical: spacing.sm,
  },
  banner: {
    backgroundColor: colors.warningLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: {
    ...typography.body,
    color: colors.warning,
  },
  list: {
    paddingBottom: spacing.lg,
  },
  sectionHeader: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  // Failures must pop at a glance (the squint test): tinted, not just coloured text.
  rowFailed: {
    backgroundColor: colors.dangerLight,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.h3,
  },
  what: {
    ...typography.body,
    color: colors.textSecondary,
  },
  detail: {
    ...typography.body,
    color: colors.danger,
  },
  time: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    paddingTop: 2,
  },
  limitNote: {
    ...typography.meta,
    textAlign: 'center',
    paddingTop: spacing.lg,
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
});
