import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';

import PrimaryButton from '../../components/PrimaryButton';
import { useVideoToken } from '../../hooks/useVideoToken';
import { t } from '../../i18n';
import { buildStreamUrl } from '../../lib/supabase';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CameraFullscreen'>;

// The video player is intentionally always-black regardless of light/dark
// theme (video-player convention) — do not swap this for `colors.background`.
const VIDEO_BACKGROUND = '#000000';

export default function CameraFullscreenScreen({ route, navigation }: Props) {
  const { cameraName, streamKey } = route.params;
  // SECURITY: video streams authenticate with the short-lived
  // `purpose:"video"` token from `issue-video-token` (see useVideoToken),
  // NEVER the raw ~1h Supabase user session JWT — see CONTRACT.md
  // "issue-video-token" / "Video". The hook auto-refreshes every ~45s
  // while this screen is mounted (`enabled: true`) and stops on unmount.
  const { state: videoToken, retry: retryVideoToken } = useVideoToken(true);
  const [webviewKey, setWebviewKey] = useState(0);
  const [hasStreamError, setHasStreamError] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: cameraName });
  }, [navigation, cameraName]);

  const handleRetryStream = () => {
    setHasStreamError(false);
    setWebviewKey((key) => key + 1);
  };

  const handleRetryVideoToken = () => {
    setHasStreamError(false);
    retryVideoToken();
  };

  if (videoToken.kind === 'loading') {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.textInverse} />
          <Text style={styles.loadingLabel}>{t('cameras.streamLoading')}</Text>
        </View>
      </View>
    );
  }

  if (videoToken.kind === 'denied') {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{t('cameras.noVideoAccess')}</Text>
          <Text style={styles.errorMessage}>{t('cameras.noVideoAccessMessage')}</Text>
        </View>
      </View>
    );
  }

  if (videoToken.kind === 'error' || hasStreamError) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorMessage}>{t('cameras.streamLoadError')}</Text>
          <PrimaryButton
            label={t('common.retry')}
            onPress={videoToken.kind === 'error' ? handleRetryVideoToken : handleRetryStream}
            variant="secondary"
            style={styles.retryButton}
          />
        </View>
      </View>
    );
  }

  const uri = buildStreamUrl(streamKey, videoToken.token);

  return (
    <View style={styles.container}>
      <WebView
        key={webviewKey}
        source={{ uri }}
        style={styles.webview}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.textInverse} />
            <Text style={styles.loadingLabel}>{t('cameras.streamLoading')}</Text>
          </View>
        )}
        onError={() => setHasStreamError(true)}
        onHttpError={() => setHasStreamError(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: VIDEO_BACKGROUND,
  },
  webview: {
    flex: 1,
    backgroundColor: VIDEO_BACKGROUND,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: VIDEO_BACKGROUND,
  },
  loadingLabel: {
    ...typography.caption,
    color: colors.textInverse,
    marginTop: spacing.sm,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.textInverse,
    textAlign: 'center',
  },
  errorMessage: {
    ...typography.body,
    color: colors.textInverse,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.sm,
    minWidth: 160,
  },
});
