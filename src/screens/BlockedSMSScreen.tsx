import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { databaseService } from '../services/DatabaseService';

interface BlockedSMS {
  id: number;
  phone_number: string;
  message_content: string;
  block_reason: string;
  threat_level: string;
  timestamp: number;
}

export const BlockedSMSScreen: React.FC = () => {
  const [blockedMessages, setBlockedMessages] = useState<BlockedSMS[]>([]);

  useEffect(() => {
    loadBlockedMessages();
  }, []);

  const loadBlockedMessages = async () => {
    try {
      const messages = await getBlockedMessages();
      setBlockedMessages(messages);
    } catch (error) {
      console.error('Error loading blocked messages:', error);
    }
  };

  const getBlockedMessages = async (): Promise<BlockedSMS[]> => {
  try {
    return await databaseService.getBlockedMessages();
  } catch (error) {
    console.error('Error loading blocked messages:', error);
    return [];
  }
};

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('es-ES');
  };

  const renderBlockedMessage = ({ item }: { item: BlockedSMS }) => (
    <View style={styles.messageCard}>
      <View style={styles.messageHeader}>
        <Text style={styles.phoneNumber}>{item.phone_number}</Text>
        <Text style={styles.timestamp}>{formatDate(item.timestamp)}</Text>
      </View>
      
      <Text style={styles.messageContent} numberOfLines={3}>
        {item.message_content}
      </Text>
      
      <View style={styles.threatInfo}>
        <Text style={[styles.threatLevel, { 
          backgroundColor: item.threat_level === 'malicious' ? '#FEE2E2' : '#FEF3E2',
          color: item.threat_level === 'malicious' ? '#DC2626' : '#D97706'
        }]}>
          {item.threat_level}
        </Text>
        <Text style={styles.blockReason}>{item.block_reason}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SMS Bloqueados</Text>
        <TouchableOpacity onPress={loadBlockedMessages}>
          <Text style={styles.refreshButton}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={blockedMessages}
        renderItem={renderBlockedMessage}
        keyExtractor={(item) => item.id.toString()}
        style={styles.list}
        refreshing={false}
        onRefresh={loadBlockedMessages}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  refreshButton: {
    fontSize: 16,
    color: '#2563EB',
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    margin: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  phoneNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  timestamp: {
    fontSize: 12,
    color: '#6B7280',
  },
  messageContent: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 12,
    lineHeight: 20,
  },
  threatInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  threatLevel: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  blockReason: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
    textAlign: 'right',
  },
});