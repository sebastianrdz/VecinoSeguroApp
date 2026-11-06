import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'VecinoSeguro',
  slug: 'vecino-seguro',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'vecinoseguro',
  userInterfaceStyle: 'automatic',
  primaryColor: '#0F5132',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'mx.santacatarina.vecinoseguro',
    infoPlist: {
      NSCameraUsageDescription:
        'VecinoSeguro no usa la cámara del dispositivo; este permiso no se solicita.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'mx.santacatarina.vecinoseguro',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0F5132',
    },
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: ['expo-secure-store', 'expo-localization', 'expo-status-bar'],
  extra: {
    eas: {
      // Replace with the real EAS project id after running `eas init`.
      projectId: 'REPLACE_WITH_EAS_PROJECT_ID',
    },
  },
};

export default config;
