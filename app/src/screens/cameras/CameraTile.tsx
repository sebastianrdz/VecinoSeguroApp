import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';

import { useReduceMotion } from '../../hooks/useReduceMotion';
import { t } from '../../i18n';
import { buildStreamUrl } from '../../lib/supabase';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { Camera } from '../../types/database';

type TileStatus = 'paused' | 'connecting' | 'live' | 'unavailable';

interface CameraTileProps {
  camera: Camera;
  /** Short-lived `purpose:"video"` token (never the raw user JWT); `null` while unavailable/denied/loading. */
  videoToken: string | null;
  /** True when minting the video token failed (denied or error), so the tile can say so. */
  tokenFailed: boolean;
  isLive: boolean;
  /** One-column layout uses wider 16:9 tiles; the two-column grid keeps 4:3. */
  wide: boolean;
  onPress: () => void;
}

const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export default function CameraTile({
  camera,
  videoToken,
  tokenFailed,
  isLive,
  wide,
  onPress,
}: CameraTileProps) {
  // True once the first frame of this attempt has loaded. Token refreshes
  // (every ~45 s) reload the page, but the tile stays "live" through them.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const reduceMotion = useReduceMotion();
  const press = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;

  // A tile that scrolls off-screen and back on should get a clean attempt
  // (no stale error, fresh loading state) rather than reusing what it left.
  useEffect(() => {
    if (!isLive) {
      setHasLoaded(false);
      setHasError(false);
      videoOpacity.setValue(0);
    }
  }, [isLive, videoOpacity]);

  const showWebview = isLive && !!videoToken && !hasError;

  let status: TileStatus;
  if (!isLive) status = 'paused';
  else if (hasError || tokenFailed) status = 'unavailable';
  else if (!showWebview || !hasLoaded) status = 'connecting';
  else status = 'live';

  const handleLoadEnd = () => {
    setHasLoaded(true);
    // The one authored moment of this screen: video arrives from the
    // placeholder as a soft fade (instant when Reduce Motion is on).
    if (reduceMotion) {
      videoOpacity.setValue(1);
      return;
    }
    Animated.timing(videoOpacity, {
      toValue: 1,
      duration: 420,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  const animatePress = (to: number) => {
    if (reduceMotion) return;
    Animated.timing(press, {
      toValue: to,
      duration: 110,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  const statusText =
    status === 'live'
      ? t('cameras.liveLabel').toLowerCase()
      : status === 'unavailable'
        ? t('cameras.noSignal')
        : status === 'connecting'
          ? t('cameras.connecting')
          : '';

  return (
    <Animated.View style={[styles.tile, { transform: [{ scale: press }] }]}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        onPressIn={() => animatePress(0.98)}
        onPressOut={() => animatePress(1)}
        accessibilityRole="button"
        accessibilityLabel={statusText ? `${camera.name}, ${statusText}` : camera.name}
        accessibilityHint={t('cameras.openFullscreen')}
      >
        <View style={[styles.thumbnail, { aspectRatio: wide ? 16 / 9 : 4 / 3 }]}>
          {showWebview && (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoOpacity }]}>
              <WebView
                source={{ uri: buildStreamUrl(camera.stream_key, videoToken!, { sub: true }) }}
                style={styles.webview}
                pointerEvents="none"
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                domStorageEnabled
                onLoadEnd={handleLoadEnd}
                onError={() => setHasError(true)}
                onHttpError={() => setHasError(true)}
              />
            </Animated.View>
          )}

          {status !== 'live' && (
            <View style={styles.placeholder} pointerEvents="none">
              {status === 'connecting' ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Ionicons
                  name={status === 'unavailable' ? 'cloud-offline-outline' : 'videocam-outline'}
                  size={wide ? 44 : 32}
                  color={colors.textInverse}
                />
              )}
              {status !== 'paused' && (
                <Text style={styles.placeholderText}>
                  {status === 'unavailable' ? t('cameras.noSignal') : t('cameras.connecting')}
                </Text>
              )}
            </View>
          )}

          {status === 'live' && (
            <View style={styles.liveBadge} pointerEvents="none">
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>{t('cameras.liveLabel')}</Text>
            </View>
          )}

          <View style={styles.nameBar} pointerEvents="none">
            <Text style={styles.name} numberOfLines={1}>
              {camera.name}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    marginBottom: spacing.md,
  },
  thumbnail: {
    borderRadius: radii.md,
    backgroundColor: colors.primaryDark,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: colors.primaryDark,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  placeholderText: {
    ...typography.meta,
    color: colors.textInverse,
  },
  liveBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.danger,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textInverse,
  },
  liveBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textInverse,
  },
  nameBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  name: {
    ...typography.h3,
    color: colors.textInverse,
  },
});
