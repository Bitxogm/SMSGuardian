import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, DeviceEventEmitter, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { databaseService } from '../services/DatabaseService';
import { PermissionsService } from '../services/PermissionsService';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { TabParamList } from '../navigation/types';

interface Stats {
  blockedSMS: number;
  spamNumbers: number;
  protectionLevel: string;
  lastUpdate: string;
  dbStatus: {
    isConnected: boolean;
    spamRules: number;
    inboxCount: number;
    blockedCount: number;
  };
}

type DashboardNavigationProp = BottomTabNavigationProp<TabParamList, 'Dashboard'>;

export const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<DashboardNavigationProp>();
  const [stats, setStats] = useState<Stats>({
    blockedSMS: 0,
    spamNumbers: 0,
    protectionLevel: 'balanced',
    lastUpdate: new Date().toLocaleTimeString(), // Initialized
    dbStatus: { isConnected: false, spamRules: 0, inboxCount: 0, blockedCount: 0 } // Initialized
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchStats();

        // Setup listeners
        const focusListener = navigation.addListener('focus', fetchStats);
        const statsListener = DeviceEventEmitter.addListener('STATS_UPDATED', fetchStats);
        const blockListener = DeviceEventEmitter.addListener('SMS_BLOCKED', fetchStats);

        return () => {
          focusListener();
          statsListener.remove();
          blockListener.remove();
        };
      } catch (error) {
        console.error('Initial Load Failed:', error);
      }
    };
    loadData();
  }, [navigation]);

  const fetchStats = async () => {
    try {
      const blockedCount = await databaseService.getBlockedSMSCount();
      const protectionLevel = await databaseService.getSetting('protection_level', 'balanced');
      const spamCount = await databaseService.getSpamNumbersCount();
      const debugStats = await databaseService.getDebugStats(); // Added

      setStats({
        blockedSMS: blockedCount,
        spamNumbers: spamCount,
        protectionLevel,
        lastUpdate: new Date().toLocaleTimeString(), // Added
        dbStatus: debugStats // Added
      });
    } catch (error) {
      console.error('Error fetching stats:', error); // Modified error message
    }
  };

  const checkPermissions = async () => {
    const hasPermissions = await PermissionsService.checkSMSPermissions();

    if (hasPermissions) {
      Alert.alert('Permisos SMS', 'Permisos concedidos correctamente');
    } else {
      Alert.alert(
        'Permisos SMS',
        'Algunos permisos están denegados. La app puede no funcionar correctamente.',
        [
          { text: 'Entendido' },
          {
            text: 'Configurar',
            onPress: async () => {
              await PermissionsService.requestSMSPermissions();
            }
          }
        ]
      );
    }
  };

  const requestDefaultSMSApp = () => {
    Alert.alert(
      'Configurar como App SMS',
      'Para un bloqueo más efectivo, configura SMS Guardian como aplicación de mensajes por defecto en la configuración de Android.',
      [
        { text: 'Cancelar' },
        {
          text: 'Configurar',
          onPress: () => {
            Alert.alert(
              'Configuración',
              'Ve a Configuración > Apps > Apps por defecto > App de SMS y selecciona SMS Guardian'
            );
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>SMS Guardian</Text>
        <Text style={styles.subtitle}>Protección anti-spam activa</Text>
      </View>

      {/* DEBUG CARD */}
      <View style={[styles.statCard, { backgroundColor: stats.dbStatus?.isConnected ? '#ECFDF5' : '#FEF2F2', borderColor: stats.dbStatus?.isConnected ? '#10B981' : '#EF4444', borderWidth: 1, marginBottom: 16, marginHorizontal: 16 }]}>
        <Text style={[styles.statLabel, { color: stats.dbStatus?.isConnected ? '#047857' : '#B91C1C', fontSize: 16, fontWeight: 'bold' }]}>
          {stats.dbStatus?.isConnected ? '🟢 Base de Datos: CONECTADA' : '🔴 Base de Datos: ERROR'}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ color: '#333' }}>Spam: {stats.dbStatus?.spamRules || 0}</Text>
          <Text style={{ color: '#333' }}>Inbox: {stats.dbStatus?.inboxCount || 0}</Text>
          <Text style={{ color: '#333' }}>Bloq: {stats.dbStatus?.blockedCount || 0}</Text>
        </View>
        <Text style={{ fontSize: 10, color: '#999', marginTop: 5 }}>Updated: {stats.lastUpdate}</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: '#FEF2F2' }]}>
          <Text style={[styles.statNumber, { color: '#DC2626' }]}>
            {stats.blockedSMS}
          </Text>
          <Text style={[styles.statLabel, { color: '#DC2626' }]}>
            SMS Bloqueados
          </Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
          <Text style={[styles.statNumber, { color: '#2563EB' }]}>
            {stats.spamNumbers.toLocaleString()}
          </Text>
          <Text style={[styles.statLabel, { color: '#2563EB' }]}>
            Números Spam
          </Text>
        </View>
      </View>

      <View style={styles.protectionStatus}>
        <Text style={styles.protectionTitle}>Estado: Protegido</Text>
        <Text style={styles.protectionLevel}>Nivel: {stats.protectionLevel}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#DC2626' }]}
          onPress={() => navigation.navigate('Blacklist')}
        >
          <Text style={styles.buttonText}>Gestionar Números Spam</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#10B981' }]}
          onPress={checkPermissions}
        >
          <Text style={styles.buttonText}>Verificar Permisos</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#2563EB' }]}
          onPress={requestDefaultSMSApp}
        >
          <Text style={styles.buttonText}>Configurar App SMS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#8B5CF6' }]}
          onPress={() => navigation.navigate('Whitelist')}
        >
          <Text style={styles.buttonText}>Gestionar Whitelist</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#F59E0B' }]}
          onPress={() => navigation.navigate('Quarantine')}
        >
          <Text style={styles.buttonText}>Ver SMS en Cuarentena</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  protectionStatus: {
    backgroundColor: '#ECFDF5',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  protectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
  },
  protectionLevel: {
    fontSize: 14,
    color: '#047857',
    marginTop: 4,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  actionButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
