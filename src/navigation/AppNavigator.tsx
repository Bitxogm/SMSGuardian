import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { DashboardScreen } from '../screens/DashboardScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { WhitelistScreen } from '../screens/WhitelistScreen';
import { BlacklistScreen } from '../screens/BlacklistScreen';
import { QuarantineScreen } from '../screens/QuarantineScreen';
import { AnalysisChatScreen } from '../screens/AnalysisChatScreen';
import { TabParamList, RootStackParamList } from './types';
import { Text, View, StyleSheet } from 'react-native';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const SettingsScreenPlaceholder = () => (
  <View style={styles.placeholderContainer}>
    <Text>Configuración (Próximamente)</Text>
  </View>
);

const TabBarIcon = ({ routeName, color, size }: { routeName: string, color: string, size: number }) => {
  let iconName = '❓';
  if (routeName === 'Dashboard') iconName = '🏠';
  else if (routeName === 'Inbox') iconName = '📩';
  else if (routeName === 'Whitelist') iconName = '✅';
  else if (routeName === 'Blacklist') iconName = '⛔';
  else if (routeName === 'Quarantine') iconName = '⚠️';
  else if (routeName === 'Settings') iconName = '⚙️';

  return <Text style={{ fontSize: size, color }}>{iconName}</Text>;
};

const screenOptions = ({ route }: { route: any }) => ({
  headerShown: false,
  tabBarIcon: ({ color, size }: { color: string, size: number }) => (
    <TabBarIcon routeName={route.name} color={color} size={size} />
  ),
  tabBarActiveTintColor: '#2563EB',
  tabBarInactiveTintColor: 'gray',
});

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={screenOptions}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Quarantine" component={QuarantineScreen} />
      <Tab.Screen name="Whitelist" component={WhitelistScreen} />
      <Tab.Screen name="Blacklist" component={BlacklistScreen} />
      <Tab.Screen name="Settings" component={SettingsScreenPlaceholder} />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="AnalysisChat"
          component={AnalysisChatScreen}
          options={{
            headerShown: true,
            title: '💬 Análisis IA (Gemini)',
            presentation: 'modal'
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AppNavigator;
