import React, { useEffect, useState } from 'react';
import { StatusBar, Text, View, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { QuarantineScreen } from './src/screens/QuarantineScreen';
import { databaseService } from './src/services/DatabaseService';
import { SMSInterceptorService } from './src/services/SMSInterceptorService';
import { ContactsService } from './src/services/ContactsService';

type ScreenType = 'dashboard' | 'quarantine';

const App: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('dashboard');

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('Initializing SMS Guardian...');
      await databaseService.initialize();
       await ContactsService.initialize();  
      await SMSInterceptorService.initialize();
      console.log('SMS Guardian initialized successfully');
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to initialize SMS Guardian:', error);
      setInitError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  if (initError) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Error de Inicialización</Text>
            <Text style={styles.errorText}>{initError}</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!isInitialized) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Inicializando SMS Guardian...</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case 'quarantine':
        return <QuarantineScreen onNavigateBack={() => setCurrentScreen('dashboard')} />;
      default:
        return <DashboardScreen onNavigateToQuarantine={() => setCurrentScreen('quarantine')} />;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        {renderScreen()}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    fontSize: 18,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#DC2626',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 16,
    color: '#991B1B',
    textAlign: 'center',
  },
});

export default App;