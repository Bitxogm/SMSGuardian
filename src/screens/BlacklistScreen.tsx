import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { databaseService } from '../services/DatabaseService';

export const BlacklistScreen: React.FC = () => {
  const [spamNumbers, setSpamNumbers] = useState<any[]>([]);
  const [showAddSpamModal, setShowAddSpamModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');

  useEffect(() => {
    loadSpamNumbers();
  }, []);

  const loadSpamNumbers = async () => {
    try {
      const numbers = await databaseService.getAllSpamNumbers();
      setSpamNumbers(numbers);
    } catch (error) {
      console.error('Error loading spam numbers:', error);
    }
  };

  const handleAddSpamNumber = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Por favor introduce un número de teléfono');
      return;
    }

    try {
      await databaseService.addSpamNumber(phoneNumber.trim(), 'scam', 'manual');
      Alert.alert('Añadido', 'Número añadido a la lista de spam correctamente');
      setPhoneNumber('');
      setShowAddSpamModal(false);
      loadSpamNumbers();
    } catch (error) {
      Alert.alert('Error', 'No se pudo añadir el número. Verifica el formato.');
    }
  };

  const handleDeleteSpamNumber = async (id: number, numberToDelete: string) => {
    Alert.alert(
      'Eliminar Número',
      `¿Estás seguro de que quieres eliminar ${numberToDelete} de la lista de spam?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await databaseService.removeSpamNumber(id);
              Alert.alert('Eliminado', 'Número eliminado de la lista de spam');
              loadSpamNumbers();
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar el número');
            }
          }
        }
      ]
    );
  };

  const cancelAddSpamNumber = () => {
    setPhoneNumber('');
    setShowAddSpamModal(false);
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'manual': return 'Manual';
      case 'quarantine': return 'Cuarentena';
      case 'preloaded': return 'Sistema';
      default: return source;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES');
    } catch {
      return 'Fecha desconocida';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lista Negra</Text>
      </View>

      <TouchableOpacity
        style={styles.addNewButton}
        onPress={() => setShowAddSpamModal(true)}
      >
        <Text style={styles.addNewButtonText}>+ Añadir Número</Text>
      </TouchableOpacity>

      <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
        {spamNumbers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No hay números bloqueados</Text>
            <Text style={styles.emptySubtext}>
              Los números que añadas manualmente o bloquees desde cuarentena aparecerán aquí
            </Text>
          </View>
        ) : (
          spamNumbers.map((number, index) => (
            <View key={index} style={styles.spamNumberItem}>
              <View style={styles.spamNumberInfo}>
                <Text style={styles.spamNumberPhone}>{number.phone_number}</Text>
                <Text style={styles.spamNumberDetails}>
                  {getSourceLabel(number.source)} • {formatDate(number.date_added)} • {number.spam_type}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteSpamNumber(number.id, number.phone_number)}
              >
                <Text style={styles.deleteButtonText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal para añadir número spam */}
      <Modal
        visible={showAddSpamModal}
        animationType="slide"
        transparent={true}
        onRequestClose={cancelAddSpamNumber}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Añadir Número Spam</Text>
            <Text style={styles.modalSubtitle}>
              Introduce el número de teléfono que quieres bloquear
            </Text>

            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+34600123456"
              keyboardType="phone-pad"
              autoFocus={true}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={cancelAddSpamNumber}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleAddSpamNumber}
              >
                <Text style={styles.confirmButtonText}>Añadir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  addNewButton: {
    marginHorizontal: 16,
    backgroundColor: '#DC2626',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  addNewButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  spamNumberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
  },
  spamNumberInfo: {
    flex: 1,
  },
  spamNumberPhone: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  spamNumberDetails: {
    fontSize: 12,
    color: '#6B7280',
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    width: '85%',
    padding: 24,
    borderRadius: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#E5E7EB',
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#DC2626',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
