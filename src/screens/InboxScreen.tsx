import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, DeviceEventEmitter } from 'react-native';
import { databaseService } from '../services/DatabaseService';
import { useEffect, useState } from 'react';

interface InboxMessage {
  id: number;
  phone_number: string;
  message_content: string;
  timestamp: number;
  is_read: boolean;
  date_received: string;
}

export const InboxScreen: React.FC = () => {
  const [messages, setMessages] = useState<InboxMessage[]>([]);

  useEffect(() => {
    loadMessages();
    const listener = DeviceEventEmitter.addListener('STATS_UPDATED', loadMessages);
    return () => listener.remove();
  }, []);

  const loadMessages = async () => {
    try {
      const msgs = await databaseService.getInboxMessages();
      console.log('Inbox loaded:', msgs.length, 'messages');
      setMessages(msgs);
    } catch (error) {
      console.error('Error loading inbox:', error);
    }
  };

  const handleMoveToQuarantine = async (msg: InboxMessage) => {
    Alert.alert(
      'Mover a Cuarentena',
      '¿Estás seguro? El mensaje se moverá a cuarentena para su análisis.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Mover',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Add to Quarantine
              await databaseService.quarantineSMS({
                phoneNumber: msg.phone_number,
                messageContent: msg.message_content,
                reason: 'Manual Quarantine',
                threatLevel: 'suspicious', // User manual action implies suspicion
                timestamp: msg.timestamp,
                urls: [] // Analysis will extract these later
              });

              // 2. Remove from Inbox
              await databaseService.deleteInboxMessage(msg.id);

              // 3. Refresh UI
              loadMessages();
              DeviceEventEmitter.emit('STATS_UPDATED');
              Alert.alert('Éxito', 'Mensaje movido a cuarentena.');
            } catch (error) {
              Alert.alert('Error', 'No se pudo mover el mensaje.');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: InboxMessage }) => (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.sender}>{item.phone_number}</Text>
        <Text style={styles.date}>{new Date(item.timestamp).toLocaleString()}</Text>
      </View>
      <Text style={styles.content} numberOfLines={3}>
        {item.message_content}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.quarantineButton}
          onPress={() => handleMoveToQuarantine(item)}
        >
          <Text style={styles.buttonText}>⚠️ Mover a Cuarentena</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.screenHeader}>
        <Text style={styles.title}>Bandeja de Entrada</Text>
        <Text style={styles.subtitle}>Mensajes permitidos</Text>
      </View>

      {messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No hay mensajes en la bandeja.</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshing={false}
          onRefresh={loadMessages}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  screenHeader: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sender: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  date: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  content: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  quarantineButton: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  buttonText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
});
