import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ListViewToken } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenContainer from '../../components/ScreenContainer';
import { LoadingView, ErrorView } from '../../components/StateViews';
import { useVideoToken } from '../../hooks/useVideoToken';
import { supabase } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import CameraTile from './CameraTile';
import { TABLES, type Camera } from '../../types/database';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

type CamerasNavProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Cameras'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; cameras: Camera[] };

// Even the low-bandwidth `_sub` grid stream (CONTRACT.md) costs real device
// decode + network resources per concurrently-mounted WebView. With
// communities running a handful of gate cameras but potentially many rows of
// tiles, cap how many live players can exist at once regardless of how many
// tiles are simultaneously "visible" — the rest fall back to the static
// placeholder so scrolling stays smooth and shared bandwidth isn't blown.
const MAX_CONCURRENT_STREAMS = 6;

export default function CamerasScreen() {
  const navigation = useNavigation<CamerasNavProp>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [visibleIds, setVisibleIds] = useState<string[]>([]);

  const [refreshing, setRefreshing] = useState(false);

  const loadCameras = useCallback(async (silent = false) => {
    // A pull-to-refresh keeps the grid on screen instead of flashing the spinner.
    if (!silent) setState({ kind: 'loading' });
    const { data, error } = await supabase
      .from(TABLES.cameras)
      .select('*')
      .eq('enabled', true)
      .order('sort_order', { ascending: true });

    if (error) {
      // A failed refresh keeps the cameras already shown.
      if (!silent) setState({ kind: 'error' });
      return;
    }
    setState({ kind: 'loaded', cameras: (data ?? []) as Camera[] });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCameras(true);
    setRefreshing(false);
  }, [loadCameras]);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  const handlePress = useCallback(
    (camera: Camera) => {
      navigation.navigate('CameraFullscreen', {
        cameraId: camera.id,
        cameraName: camera.name,
        streamKey: camera.stream_key,
      });
    },
    [navigation]
  );

  // Tracks which camera ids the FlatList currently considers visible.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
      setVisibleIds(viewableItems.map((viewToken) => (viewToken.item as Camera).id));
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // Of the currently-visible tiles, only the first MAX_CONCURRENT_STREAMS
  // (by list order) get a live WebView — everything else renders the
  // lightweight static placeholder.
  const liveIds = useMemo(() => {
    if (state.kind !== 'loaded') return new Set<string>();
    const visibleSet = new Set(visibleIds);
    const visibleInOrder = state.cameras.filter((camera) => visibleSet.has(camera.id));
    return new Set(visibleInOrder.slice(0, MAX_CONCURRENT_STREAMS).map((camera) => camera.id));
  }, [state, visibleIds]);

  // SECURITY: grid tiles authenticate with the short-lived `purpose:"video"`
  // token from `issue-video-token` (see useVideoToken), NEVER the raw ~1h
  // Supabase user session JWT — see CONTRACT.md "issue-video-token" /
  // "Video". Only mint/refresh while at least one tile is actually live, per
  // the contract's "while a stream is mounted" refresh condition.
  const { state: videoTokenState, retry: retryVideoToken } = useVideoToken(liveIds.size > 0);
  const videoToken = videoTokenState.kind === 'ready' ? videoTokenState.token : null;
  const tokenFailed = videoTokenState.kind === 'denied' || videoTokenState.kind === 'error';

  // Top inset: this tab has no header, so the content must clear the status bar.
  const edges = ['top', 'bottom', 'left', 'right'] as const;

  if (state.kind === 'loading') {
    return (
      <ScreenContainer edges={edges}>
        <LoadingView label={t('cameras.loading')} />
      </ScreenContainer>
    );
  }

  if (state.kind === 'error') {
    return (
      <ScreenContainer edges={edges}>
        <ErrorView message={t('cameras.loadError')} onRetry={() => loadCameras()} />
      </ScreenContainer>
    );
  }

  if (state.cameras.length === 0) {
    return (
      <ScreenContainer edges={edges}>
        <View style={styles.empty}>
          <Ionicons name="videocam-off-outline" size={56} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>{t('cameras.empty')}</Text>
          <Text style={styles.emptyHint}>{t('cameras.emptyHint')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  // A handful of cameras reads best one per row, big enough to see at a
  // glance; a larger community gets the denser two-column grid.
  const numColumns = state.cameras.length <= 4 ? 1 : 2;
  const count =
    state.cameras.length === 1
      ? t('cameras.countOne')
      : t('cameras.countMany', { count: state.cameras.length });

  return (
    <ScreenContainer edges={edges}>
      <Text style={[typography.meta, styles.summary]} accessibilityRole="header">
        {t('cameras.title')} · {count}
      </Text>

      {videoTokenState.kind === 'denied' && (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.bannerTitle}>{t('cameras.noVideoAccess')}</Text>
          <Text style={styles.bannerMessage}>{t('cameras.noVideoAccessMessage')}</Text>
        </View>
      )}
      {videoTokenState.kind === 'error' && (
        <View style={styles.banner} accessibilityLiveRegion="polite">
          <Text style={styles.bannerTitle}>{t('cameras.videoErrorTitle')}</Text>
          <Text style={styles.bannerMessage}>{t('cameras.videoErrorMessage')}</Text>
          <Pressable
            onPress={retryVideoToken}
            style={styles.bannerAction}
            accessibilityRole="button"
          >
            <Text style={styles.bannerActionText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        key={`columns-${numColumns}`}
        data={state.cameras}
        keyExtractor={(camera) => camera.id}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <CameraTile
            camera={item}
            videoToken={videoToken}
            tokenFailed={tokenFailed}
            isLive={liveIds.has(item.id)}
            wide={numColumns === 1}
            onPress={() => handlePress(item)}
          />
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  row: {
    gap: spacing.md,
  },
  summary: {
    paddingVertical: spacing.sm,
  },
  banner: {
    backgroundColor: colors.warningLight,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  bannerTitle: {
    ...typography.bodyBold,
    color: colors.warning,
  },
  bannerMessage: {
    ...typography.body,
    color: colors.warning,
  },
  bannerAction: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  bannerActionText: {
    ...typography.bodyBold,
    color: colors.warning,
    textDecorationLine: 'underline',
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
