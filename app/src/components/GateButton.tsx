import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useReduceMotion } from '../hooks/useReduceMotion';
import { colors, radii, spacing, typography } from '../theme/tokens';

export type GateTone = 'idle' | 'busy' | 'success' | 'warning' | 'danger' | 'muted';

interface GateButtonProps {
  tone: GateTone;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  busy?: boolean;
}

const TONES: Record<GateTone, { background: string; foreground: string; border?: string }> = {
  idle: { background: colors.primary, foreground: colors.textInverse },
  busy: { background: colors.primaryDark, foreground: colors.textInverse },
  success: { background: colors.accent, foreground: colors.textInverse },
  warning: { background: colors.warningLight, foreground: colors.warning, border: colors.warning },
  danger: { background: colors.danger, foreground: colors.textInverse },
  muted: { background: colors.surface, foreground: colors.textPrimary, border: colors.border },
};

// Confident arrival, exponential ease-out (no bounce).
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * The one big thing on the Portón screen. The block itself carries the answer
 * to "did it open?": its colour, icon and words change with the gate state, so
 * the result appears exactly where the thumb just was.
 */
export default function GateButton({ tone, icon, label, sublabel, onPress, busy }: GateButtonProps) {
  const palette = TONES[tone];
  const faceKey = `${tone}|${label}`;
  const pressable = !!onPress && !busy;

  const reduceMotion = useReduceMotion();
  const press = useRef(new Animated.Value(1)).current;
  const face = useRef(new Animated.Value(1)).current;
  const iconScale = useRef(new Animated.Value(1)).current;
  const isFirstFace = useRef(true);

  // One authored moment: when the face changes, it rises into place; a
  // successful open also lets the icon settle in. Reduce Motion keeps the
  // fade (it carries the state change) and drops the movement.
  useEffect(() => {
    if (isFirstFace.current) {
      isFirstFace.current = false;
      return;
    }
    face.setValue(0);
    Animated.timing(face, {
      toValue: 1,
      duration: reduceMotion ? 120 : 260,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
    if (tone === 'success' && !reduceMotion) {
      iconScale.setValue(0.6);
      Animated.timing(iconScale, {
        toValue: 1,
        duration: 420,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();
    }
    // Tell VoiceOver/TalkBack what the gate is doing now.
    AccessibilityInfo.announceForAccessibility(sublabel ? `${label}. ${sublabel}` : label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceKey]);

  const animatePress = (to: number) => {
    if (reduceMotion) return;
    Animated.timing(press, {
      toValue: to,
      duration: 110,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  };

  const handlePressIn = () => {
    if (!pressable) return;
    animatePress(0.98);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const faceStyle = {
    opacity: face,
    transform: [
      {
        translateY: face.interpolate({
          inputRange: [0, 1],
          outputRange: [reduceMotion ? 0 : 10, 0],
        }),
      },
    ],
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: press }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={() => animatePress(1)}
        disabled={!pressable}
        accessibilityRole="button"
        accessibilityLabel={sublabel ? `${label}. ${sublabel}` : label}
        accessibilityState={{ disabled: !pressable, busy: !!busy }}
        accessibilityLiveRegion="polite"
        style={[
          styles.block,
          {
            backgroundColor: palette.background,
            borderColor: palette.border ?? palette.background,
          },
        ]}
      >
        <Animated.View style={[styles.face, faceStyle]}>
          {busy ? (
            <ActivityIndicator size="large" color={palette.foreground} />
          ) : (
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Ionicons name={icon} size={72} color={palette.foreground} />
            </Animated.View>
          )}
          <Text
            style={[styles.label, { color: palette.foreground }]}
            maxFontSizeMultiplier={1.4}
            adjustsFontSizeToFit
            numberOfLines={2}
          >
            {label}
          </Text>
          {!!sublabel && (
            <Text
              style={[styles.sublabel, { color: palette.foreground }]}
              maxFontSizeMultiplier={1.4}
            >
              {sublabel}
            </Text>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    minHeight: 240,
  },
  block: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    // Soft lift so the block reads as the pressable surface.
    ...Platform.select({
      ios: {
        shadowColor: colors.textPrimary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  face: {
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    ...typography.heroLabel,
    textAlign: 'center',
  },
  sublabel: {
    ...typography.heroSub,
    textAlign: 'center',
  },
});
