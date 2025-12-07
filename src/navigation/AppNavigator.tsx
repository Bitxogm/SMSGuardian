import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { DashboardScreen } from '../screens/DashboardScreen';
import { WhitelistScreen } from '../screens/WhitelistScreen';
import { BlacklistScreen } from '../screens/BlacklistScreen';
import { QuarantineScreen } from '../screens/QuarantineScreen';
import { TabParamList } from './types';
import { Text, View } from 'react-native';

const Tab = createBottomTabNavigator<TabParamList>();

const SettingsScreenPlaceholder = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text>Configuración (Próximamente)</Text>
  </View>
);

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            let iconName = '❓';
            if (route.name === 'Dashboard') iconName = '🏠';
            else if (route.name === 'Whitelist') iconName = '✅';
            else if (route.name === 'Blacklist') iconName = '⛔';
            else if (route.name === 'Quarantine') iconName = '⚠️';
            else if (route.name === 'Settings') iconName = '⚙️';

            return <Text style={{ fontSize: size, color: focused ? color : 'gray' }}>{iconName}</Text>;
          },
          tabBarActiveTintColor: '#2563EB',
          tabBarInactiveTintColor: 'gray',
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Quarantine" component={QuarantineScreen} />
        <Tab.Screen name="Whitelist" component={WhitelistScreen} />
        <Tab.Screen name="Blacklist" component={BlacklistScreen} />
        <Tab.Screen name="Settings" component={SettingsScreenPlaceholder} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
