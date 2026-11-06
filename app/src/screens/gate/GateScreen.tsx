import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import GateButton, { type GateTone } from '../../components/GateButton';
import ScreenContainer from '../../components/ScreenContainer';
import { useAuth } from '../../context/AuthContext';
import { useOpenGate, type OpenGateUiState } from '../../hooks/useOpenGate';
import { t } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { spacing, typography } from '../../theme/tokens';
import { TABLES, type GateEvent } from '../../types/database';

// The server rate-limits to ~8 s; the success state clears on the same beat.
const ACCEPTED_VISIBLE_MS = 8000;

type LastOpenedState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'none' }
  | { kind: 'found'; event: GateEvent };

interface Face {
  tone: GateTone;
  icon: React.ComponentProps<typeof GateButton>['icon'];
  label: string;
  sublabel?: string;
  busy?: boolean;
  onPress?: () => void;
}

function formatLastOpened(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (daysAgo === 0) return t('gate.todayAt', { time });
  if (daysAgo === 1) return t('gate.yesterdayAt', { time });
  return `${date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}, ${time}`;
}

export default function GateScreen() {
  const { profile, signOut } = useAuth();
  const { state, openGate, reset } = useOpenGate();
  const [lastOpened, setLastOpened] = useState<LastOpenedState>({ kind: 'loading' });
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const loadLastOpened = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from(TABLES.gateEvents)
      .select('*')
      .eq('actor_id', profile.id)
      .eq('action', 'open')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      setLastOpened({ kind: 'error' });
      return;
    }
    const rows = (data ?? []) as GateEvent[];
    setLastOpened(rows.length > 0 ? { kind: 'found', event: rows[0] } : { kind: 'none' });
  }, [profile?.id]);

  useEffect(() => {
    loadLastOpened();
  }, [loadLastOpened]);

  useEffect(() => {
    if (state.kind === 'accepted') {
      loadLastOpened();
    }
  }, [state.kind, loadLastOpened]);

  // Tactile confirmation of the outcome (the tap itself is felt in GateButton).
  useEffect(() => {
    let type: Haptics.NotificationFeedbackType | null = null;
    if (state.kind === 'accepted') type = Haptics.NotificationFeedbackType.Success;
    else if (state.kind === 'rate_limited' || state.kind === 'not_active' || state.kind === 'unauthorized')
      type = Haptics.NotificationFeedbackType.Warning;
    else if (state.kind === 'offline' || state.kind === 'error')
      type = Haptics.NotificationFeedbackType.Error;
    if (type) Haptics.notificationAsync(type).catch(() => {});
  }, [state.kind]);

  // A finished success must not linger and mislead the next glance.
  useEffect(() => {
    if (state.kind !== 'accepted') return;
    const id = setTimeout(reset, ACCEPTED_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [state, reset]);

  // Live countdown while rate-limited, then the button comes back by itself.
  useEffect(() => {
    if (state.kind !== 'rate_limited') {
      setSecondsLeft(null);
      return;
    }
    let left = Math.max(1, Math.ceil(state.retryAfterSeconds));
    setSecondsLeft(left);
    const id = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(id);
        reset();
      } else {
        setSecondsLeft(left);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state, reset]);

  const face = faceFor(state, secondsLeft, { openGate, signOut });

  return (
    <ScreenContainer edges={['top', 'bottom', 'left', 'right']} contentStyle={styles.content}>
      <View style={styles.lastOpened} accessible accessibilityRole="text">
        <Text style={typography.meta}>
          {t('gate.lastOpened')}
          {': '}
          {lastOpened.kind === 'loading' && t('common.loading')}
          {lastOpened.kind === 'error' && t('common.unknownError')}
          {lastOpened.kind === 'none' && t('gate.never')}
          {lastOpened.kind === 'found' && formatLastOpened(lastOpened.event.created_at)}
        </Text>
      </View>

      <GateButton {...face} />
    </ScreenContainer>
  );
}

function faceFor(
  state: OpenGateUiState,
  secondsLeft: number | null,
  actions: { openGate: () => void; signOut: () => Promise<void> }
): Face {
  switch (state.kind) {
    case 'loading':
      return {
        tone: 'busy',
        icon: 'lock-closed',
        label: t('gate.opening'),
        sublabel: t('gate.openingHint'),
        busy: true,
      };
    case 'accepted':
      return {
        tone: 'success',
        icon: 'lock-open',
        label: t('gate.acceptedTitle'),
        sublabel: t('gate.acceptedMessage'),
      };
    case 'rate_limited':
      return {
        tone: 'warning',
        icon: 'hourglass-outline',
        label: t('gate.rateLimitedTitle', { seconds: secondsLeft ?? state.retryAfterSeconds }),
        sublabel: t('gate.rateLimitedMessage'),
      };
    case 'not_active':
      return {
        tone: 'muted',
        icon: 'ban-outline',
        label: t('gate.notActiveTitle'),
        sublabel: t('gate.notActiveMessage'),
      };
    case 'unauthorized':
      return {
        tone: 'warning',
        icon: 'log-in-outline',
        label: t('gate.unauthorizedTitle'),
        sublabel: t('gate.unauthorizedMessage'),
        onPress: () => {
          actions.signOut();
        },
      };
    case 'offline':
      return {
        tone: 'warning',
        icon: 'cloud-offline-outline',
        label: t('gate.offlineTitle'),
        sublabel: t('gate.offlineMessage'),
        onPress: actions.openGate,
      };
    case 'error':
      return {
        tone: 'danger',
        icon: 'alert-circle',
        label: t('gate.genericErrorTitle'),
        sublabel: t('gate.genericErrorMessage'),
        onPress: actions.openGate,
      };
    default:
      return {
        tone: 'idle',
        icon: 'lock-closed',
        label: t('gate.openButton'),
        onPress: actions.openGate,
      };
  }
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.md,
  },
  lastOpened: {
    paddingVertical: spacing.sm,
  },
});
