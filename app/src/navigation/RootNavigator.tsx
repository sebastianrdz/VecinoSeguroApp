import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { LoadingView } from '../components/StateViews';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import PendingApprovalScreen from '../screens/auth/PendingApprovalScreen';
import BlockedScreen from '../screens/auth/BlockedScreen';
import CameraFullscreenScreen from '../screens/cameras/CameraFullscreenScreen';
import PrivacyNoticeScreen from '../screens/profile/PrivacyNoticeScreen';
import { t } from '../i18n';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { session, profile, initializing } = useAuth();
  const { isActive, isPending, isBlocked } = useRole();

  if (initializing) {
    return <LoadingView />;
  }

  // Decide which top-level flow to mount. Order matters: no session first,
  // then profile-derived status. A signed-in user with no profile row yet
  // (race with the DB trigger) is treated as pending, not an error.
  const showAuth = !session;
  const showBlocked = !!session && isBlocked;
  const showPending = !!session && !isBlocked && (!profile || isPending || !isActive);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {showAuth ? (
          <Stack.Screen name="Auth" component={AuthStack} />
        ) : showBlocked ? (
          <Stack.Screen name="Blocked" component={BlockedScreen} />
        ) : showPending ? (
          <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
        <Stack.Screen
          name="CameraFullscreen"
          component={CameraFullscreenScreen}
          options={{
            headerShown: true,
            presentation: 'fullScreenModal',
            title: '',
            headerTransparent: true,
            headerTintColor: '#FFFFFF',
          }}
        />
        <Stack.Screen
          name="PrivacyNotice"
          component={PrivacyNoticeScreen}
          options={{
            headerShown: true,
            presentation: 'modal',
            title: t('privacy.title'),
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
