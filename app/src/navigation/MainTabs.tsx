import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useRole } from '../hooks/useRole';
import { t } from '../i18n';
import CamerasScreen from '../screens/cameras/CamerasScreen';
import GateScreen from '../screens/gate/GateScreen';
import ActivityScreen from '../screens/activity/ActivityScreen';
import NeighborsScreen from '../screens/neighbors/NeighborsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import { colors } from '../theme/tokens';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, string> = {
  Cameras: '📷',
  Gate: '🚪',
  Activity: '📋',
  Neighbors: '👥',
  Profile: '👤',
};

function TabIcon({ route, color }: { route: keyof MainTabParamList; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{ICONS[route]}</Text>;
}

/**
 * Admin-only tabs (Actividad, Vecinos) are omitted entirely for non-admin
 * roles — a UI convenience only. Real enforcement is server-side RLS +
 * Edge Function checks (see CONTRACT.md), never this hook alone.
 */
export default function MainTabs() {
  const { isAdmin } = useRole();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIcon: ({ color }) => (
          <TabIcon route={route.name as keyof MainTabParamList} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Cameras" component={CamerasScreen} options={{ title: t('nav.cameras') }} />
      <Tab.Screen name="Gate" component={GateScreen} options={{ title: t('nav.gate') }} />
      {isAdmin && (
        <Tab.Screen
          name="Activity"
          component={ActivityScreen}
          options={{ title: t('nav.activity') }}
        />
      )}
      {isAdmin && (
        <Tab.Screen
          name="Neighbors"
          component={NeighborsScreen}
          options={{ title: t('nav.neighbors') }}
        />
      )}
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: t('nav.profile') }} />
    </Tab.Navigator>
  );
}
