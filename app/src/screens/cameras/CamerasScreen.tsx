import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';

import ScreenContainer from '../../components/ScreenContainer';
import { LoadingView, ErrorView, EmptyView } from '../../components/StateViews';
import { useVideoToken } from '../../hooks/useVideoToken';
import { supabase, buildStreamUrl } from '../../lib/supabase';
import { t } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/tokens';
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

  const loadCameras = useCallback(async () => {
    setState({ kind: 'loading' });
    const { data, error } = await supabase
      .from(TABLES.cameras)
      .select('*')
      .eq('enabled', true)
      .order('sort_order', { ascending: true });

    if (error) {
      setState({ kind: 'error' });
      return;
    }
    setState({ kind: 'loaded', cameras: (data ?? []) as Camera[] });
  }, []);

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
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
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
  const { state: videoTokenState } = useVideoToken(liveIds.size > 0);
  const videoToken = videoTokenState.kind === 'ready' ? videoTokenState.token : null;

  if (state.kind === 'loading') {
    return (
      <ScreenContainer>
        <LoadingView />
      </ScreenContainer>
    );
  }

  if (state.kind === 'error') {
    return (
      <ScreenContainer>
        <ErrorView message={t('cameras.loadError')} onRetry={loadCameras} />
      </ScreenContainer>
    );
  }

  if (state.cameras.length === 0) {
    return (
      <ScreenContainer>
        <EmptyView message={t('cameras.empty')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <FlatList
        data={state.cameras}
        keyExtractor={(camera) => camera.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <CameraTile
            camera={item}
            videoToken={videoToken}
            isLive={liveIds.has(item.id)}
            onPress={() => handlePress(item)}
          />
        )}
      />
    </ScreenContainer>
  );
}

function CameraTile({
  camera,
  videoToken,
  isLive,
  onPress,
}: {
  camera: Camera;
  /** Short-lived `purpose:"video"` token (never the raw user JWT) — `null` while unavailable/denied/loading. */
  videoToken: string | null;
  isLive: boolean;
  onPress: () => void;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // A tile that scrolls off-screen and back on should get a clean attempt
  // (no stale error, fresh loading spinner) rather than reusing whatever
  // state it left behind.
  useEffect(() => {
    if (!isLive) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [isLive]);

  // If minting the video token fails (denied/error), `videoToken` is null
  // here, so the tile simply falls back to the static placeholder below —
  // never a raw error state for a grid tile.
  const showWebview = isLive && !!videoToken && !hasError;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      accessibilityRole="button"
      accessibilityLabel={camera.name}
    >
      <View style={styles.thumbnail}>
        {showWebview && (
          <WebView
            source={{ uri: buildStreamUrl(camera.stream_key, videoToken!, { sub: true }) }}
            style={styles.webview}
            pointerEvents="none"
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            onError={() => setHasError(true)}
            onHttpError={() => setHasError(true)}
          />
        )}
        {showWebview && isLoading && (
          <View style={styles.tileLoadingOverlay} pointerEvents="none">
            <ActivityIndicator size="small" color={colors.textInverse} />
          </View>
        )}
        <View style={styles.liveBadge} pointerEvents="none">
          <Text style={styles.liveBadgeText}>{t('cameras.liveLabel')}</Text>
        </View>
      </View>
      <Text style={styles.tileName} numberOfLines={1}>
        {camera.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing.md,
  },
  row: {
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    marginBottom: spacing.md,
  },
  tilePressed: {
    opacity: 0.85,
  },
  thumbnail: {
    aspectRatio: 4 / 3,
    borderRadius: radii.md,
    backgroundColor: colors.primaryDark,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: spacing.sm,
    overflow: 'hidden',
  },
  webview: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.primaryDark,
  },
  tileLoadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    backgroundColor: colors.danger,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  liveBadgeText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '700',
  },
  tileName: {
    ...typography.bodyBold,
    marginTop: spacing.xs,
  },
});
