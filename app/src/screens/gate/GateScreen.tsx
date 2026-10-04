import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import PrimaryButton from '../../components/PrimaryButton';
import ScreenContainer from '../../components/ScreenContainer';
import { OfflineBanner } from '../../components/StateViews';
import { useAuth } from '../../context/AuthContext';
import { useOpenGate, type OpenGateUiState } from '../../hooks/useOpenGate';
import { t } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { TABLES, type GateEvent } from '../../types/database';

type LastOpenedState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'none' }
  | { kind: 'found'; event: GateEvent };

export default function GateScreen() {
  const { profile } = useAuth();
  const { state, openGate } = useOpenGate();
  const [lastOpened, setLastOpened] = useState<LastOpenedState>({ kind: 'loading' });

  const loadLastOpened = useCallback(async () => {
    if (!profile?.id) return;
    setLastOpened({ kind: 'loading' });
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

  const isLoading = state.kind === 'loading';

  return (
    <ScreenContainer scroll>
      <Text style={typography.h1}>{t('gate.title')}</Text>

      <PrimaryButton
        label={isLoading ? t('gate.opening') : t('gate.openButton')}
        onPress={openGate}
        loading={isLoading}
        disabled={isLoading}
        style={styles.openButton}
      />

      <GateFeedback state={state} />

      <View style={styles.lastOpenedSection}>
        <Text style={typography.h3}>{t('gate.lastOpened')}</Text>
        <Text style={styles.lastOpenedValue}>
          {lastOpened.kind === 'loading' && t('common.loading')}
          {lastOpened.kind === 'error' && t('common.unknownError')}
          {lastOpened.kind === 'none' && t('gate.never')}
          {lastOpened.kind === 'found' &&
            new Date(lastOpened.event.created_at).toLocaleString()}
        </Text>
      </View>
    </ScreenContainer>
  );
}

function GateFeedback({ state }: { state: OpenGateUiState }) {
  switch (state.kind) {
    case 'accepted':
      return (
        <FeedbackBox
          tone="success"
          title={t('gate.acceptedTitle')}
          message={t('gate.acceptedMessage')}
        />
      );
    case 'rate_limited':
      return (
        <FeedbackBox
          tone="warning"
          title={t('gate.rateLimitedTitle')}
          message={t('gate.rateLimitedMessage', { seconds: state.retryAfterSeconds })}
        />
      );
    case 'not_active':
      return (
        <FeedbackBox
          tone="warning"
          title={t('gate.notActiveTitle')}
          message={t('gate.notActiveMessage')}
        />
      );
    case 'unauthorized':
      return (
        <FeedbackBox
          tone="warning"
          title={t('gate.unauthorizedTitle')}
          message={t('gate.unauthorizedMessage')}
        />
      );
    case 'offline':
      return (
        <View style={styles.offlineWrapper}>
          <OfflineBanner />
          <Text style={styles.offlineExtraMessage}>{t('gate.offlineMessage')}</Text>
        </View>
      );
    case 'error':
      return (
        <FeedbackBox
          tone="danger"
          title={t('gate.genericErrorTitle')}
          message={t('gate.genericErrorMessage')}
        />
      );
    default:
      return null;
  }
}

const TONE_STYLES = {
  success: { background: colors.successLight, text: colors.success },
  warning: { background: colors.warningLight, text: colors.warning },
  danger: { background: colors.dangerLight, text: colors.danger },
} as const;

function FeedbackBox({
  tone,
  title,
  message,
}: {
  tone: keyof typeof TONE_STYLES;
  title: string;
  message: string;
}) {
  const toneStyle = TONE_STYLES[tone];
  return (
    <View style={[styles.feedbackBox, { backgroundColor: toneStyle.background }]}>
      <Text style={[styles.feedbackTitle, { color: toneStyle.text }]}>{title}</Text>
      <Text style={[styles.feedbackMessage, { color: toneStyle.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  openButton: {
    marginTop: spacing.lg,
  },
  feedbackBox: {
    marginTop: spacing.md,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  feedbackTitle: {
    ...typography.bodyBold,
  },
  feedbackMessage: {
    ...typography.body,
    marginTop: spacing.xs,
  },
  offlineWrapper: {
    marginTop: spacing.md,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  offlineExtraMessage: {
    ...typography.caption,
    color: colors.warning,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.warningLight,
  },
  lastOpenedSection: {
    marginTop: spacing.xl,
  },
  lastOpenedValue: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
