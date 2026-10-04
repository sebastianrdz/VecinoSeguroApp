import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainTabParamList = {
  Cameras: undefined;
  Gate: undefined;
  Activity: undefined;
  Neighbors: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  PendingApproval: undefined;
  Blocked: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  CameraFullscreen: { cameraId: string; cameraName: string; streamKey: string };
  PrivacyNotice: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
