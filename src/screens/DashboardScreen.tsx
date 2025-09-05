import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { databaseService } from '../services/DatabaseService';
import { PermissionsService } from '../services/PermissionsService';
import { ContactsService } from '../services/ContactsService';

interface Stats {
  blockedSMS: number;
  spamNumbers: number;
  protectionLevel: string;
}

interface Props {
  onNavigateToQuarantine?: () => void;
}

interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
}

interface WhitelistContact {
  id: number;
  phone_number: string;
  contact_name: string;
  date_added: string;
  source: string;
}

export const DashboardScreen: React.FC<Props> = ({ onNavigateToQuarantine }) => {
  const [stats, setStats] = useState<Stats>({
    blockedSMS: 0,
    spamNumbers: 0,
    protectionLevel: 'balanced'
  });

  // Modal states
  const [showAddSpamModal, setShowAddSpamModal] = useState(false);
  const [showManageSpamModal, setShowManageSpamModal] = useState(false);
  const [showWhitelistModal, setShowWhitelistModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [spamNumbers, setSpamNumbers] = useState<any[]>([]);
  
  // Whitelist states
  const [whitelistContacts, setWhitelistContacts] = useState<WhitelistContact[]>([]);
  const [deviceContacts, setDeviceContacts] = useState<Contact[]>([]);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [manualContactName, setManualContactName] = useState('');
  const [manualContactPhone, setManualContactPhone] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const blockedCount = await databaseService.getBlockedSMSCount();
      const protectionLevel = await databaseService.getSetting('protection_level', 'balanced');
      const spamCount = await databaseService.getSpamNumbersCount();

      setStats({
        blockedSMS: blockedCount,
        spamNumbers: spamCount,
        protectionLevel
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadSpamNumbers = async () => {
    try {
      const numbers = await databaseService.getAllSpamNumbers();
      setSpamNumbers(numbers);
    } catch (error) {
      console.error('Error loading spam numbers:', error);
    }
  };

  const loadWhitelistContacts = async () => {
    try {
      const contacts = await ContactsService.getWhitelistContacts();
      setWhitelistContacts(contacts);
    } catch (error) {
      console.error('Error loading whitelist contacts:', error);
    }
  };

  const loadDeviceContacts = async () => {
    try {
      const hasPermission = await PermissionsService.checkContactsPermission();
      if (!hasPermission) {
        const granted = await PermissionsService.requestContactsPermission();
        if (!granted) {
          Alert.alert('Permisos', 'Se necesitan permisos de contactos para acceder a tu agenda');
          return;
        }
      }
      
      const contacts = await ContactsService.getDeviceContacts();
      setDeviceContacts(contacts);
    } catch (error) {
      console.error('Error loading device contacts:', error);
      Alert.alert('Error', 'No se pudieron cargar los contactos de tu dispositivo');
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

  const addSpamNumberManually = () => {
    setShowAddSpamModal(true);
  };

  const openManageSpamModal = async () => {
    await loadSpamNumbers();
    setShowManageSpamModal(true);
  };

  const openWhitelistModal = async () => {
    await loadWhitelistContacts();
    setShowWhitelistModal(true);
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
      loadStats();
      loadSpamNumbers();
    } catch (error) {
      Alert.alert('Error', 'No se pudo añadir el número. Verifica el formato.');
    }
  };

  const handleDeleteSpamNumber = async (id: number, phoneNumber: string) => {
    Alert.alert(
      'Eliminar Número',
      `¿Estás seguro de que quieres eliminar ${phoneNumber} de la lista de spam?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await databaseService.removeSpamNumber(id);
              Alert.alert('Eliminado', 'Número eliminado de la lista de spam');
              loadStats();
              loadSpamNumbers();
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar el número');
            }
          }
        }
      ]
    );
  };

  const handleAddContactToWhitelist = async (contact: Contact) => {
    try {
      await ContactsService.addToWhitelist(contact.phoneNumber, contact.name);
      Alert.alert('Añadido', `${contact.name} ha sido añadido a la whitelist`);
      loadWhitelistContacts();
    } catch (error) {
      Alert.alert('Error', 'No se pudo añadir el contacto a la whitelist');
    }
  };

  const handleAddManualContact = async () => {
    if (!manualContactPhone.trim() || !manualContactName.trim()) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    try {
      await ContactsService.addToWhitelist(manualContactPhone.trim(), manualContactName.trim());
      Alert.alert('Añadido', 'Contacto añadido a la whitelist correctamente');
      setManualContactName('');
      setManualContactPhone('');
      setShowManualAddModal(false);
      loadWhitelistContacts();
    } catch (error) {
      Alert.alert('Error', 'No se pudo añadir el contacto. Verifica el formato del teléfono.');
    }
  };

  const handleRemoveFromWhitelist = async (id: number, contactName: string) => {
    Alert.alert(
      'Eliminar de Whitelist',
      `¿Estás seguro de que quieres eliminar ${contactName} de la lista blanca?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await ContactsService.removeFromWhitelist(id);
              Alert.alert('Eliminado', 'Contacto eliminado de la whitelist');
              loadWhitelistContacts();
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar el contacto');
            }
          }
        }
      ]
    );
  };

  const syncAllContacts = async () => {
    Alert.alert(
      'Sincronizar Contactos',
      '¿Quieres añadir TODOS tus contactos a la whitelist?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, sincronizar',
          onPress: async () => {
            try {
              const result = await ContactsService.syncAllContacts();
              Alert.alert('Sincronización Completa', `${result.added} contactos añadidos a la whitelist`);
              loadWhitelistContacts();
            } catch (error) {
              Alert.alert('Error', 'No se pudieron sincronizar todos los contactos');
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

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES');
    } catch {
      return 'Fecha desconocida';
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'manual': return 'Manual';
      case 'quarantine': return 'Cuarentena';
      case 'preloaded': return 'Sistema';
      case 'contacts': return 'Agenda';
      case 'sync': return 'Sincronizado';
      default: return source;
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

  const filteredDeviceContacts = deviceContacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phoneNumber.includes(searchQuery)
  );

  const renderDeviceContact = ({ item }: { item: Contact }) => (
    <View style={styles.contactItem}>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.name}</Text>
        <Text style={styles.contactPhone}>{item.phoneNumber}</Text>
      </View>
      <TouchableOpacity
        style={styles.addContactButton}
        onPress={() => handleAddContactToWhitelist(item)}
      >
        <Text style={styles.addContactButtonText}>Añadir</Text>
      </TouchableOpacity>
    </View>
  );

  const renderWhitelistContact = ({ item }: { item: WhitelistContact }) => (
    <View style={styles.whitelistContactItem}>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.contact_name}</Text>
        <Text style={styles.contactPhone}>{item.phone_number}</Text>
        <Text style={styles.contactDetails}>
          {getSourceLabel(item.source)} • {formatDate(item.date_added)}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.removeContactButton}
        onPress={() => handleRemoveFromWhitelist(item.id, item.contact_name)}
      >
        <Text style={styles.removeContactButtonText}>🗑️</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>SMS Guardian</Text>
        <Text style={styles.subtitle}>Protección anti-spam activa</Text>
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
          onPress={openManageSpamModal}
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
          onPress={openWhitelistModal}
        >
          <Text style={styles.buttonText}>Gestionar Whitelist</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#F59E0B' }]}
          onPress={onNavigateToQuarantine}
        >
          <Text style={styles.buttonText}>Ver SMS en Cuarentena</Text>
        </TouchableOpacity>
      </View>

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
              style={styles.phoneInput}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+34600123456"
              keyboardType="phone-pad"
              autoFocus={true}
            />

            <View style={styles.modalButtons}>
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

      {/* Modal para gestionar números spam */}
      <Modal
        visible={showManageSpamModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowManageSpamModal(false)}
      >
        <View style={styles.manageModalContainer}>
          <View style={styles.manageModalHeader}>
            <Text style={styles.manageModalTitle}>Números Spam Bloqueados</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowManageSpamModal(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.spamNumbersList} showsVerticalScrollIndicator={false}>
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

          <View style={styles.manageModalFooter}>
            <TouchableOpacity
              style={styles.addNewButton}
              onPress={() => {
                setShowManageSpamModal(false);
                setTimeout(() => addSpamNumberManually(), 300);
              }}
            >
              <Text style={styles.addNewButtonText}>+ Añadir Número</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal principal de Whitelist */}
      <Modal
        visible={showWhitelistModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWhitelistModal(false)}
      >
        <View style={styles.manageModalContainer}>
          <View style={styles.manageModalHeader}>
            <Text style={styles.manageModalTitle}>Gestionar Whitelist</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowWhitelistModal(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.whitelistActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.whitelistActionButton]}
              onPress={() => {
                loadDeviceContacts();
                setShowAddContactModal(true);
              }}
            >
              <Text style={styles.buttonText}>📱 Añadir desde Agenda</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.whitelistActionButton]}
              onPress={() => setShowManualAddModal(true)}
            >
              <Text style={styles.buttonText}>✏️ Añadir Manualmente</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.whitelistActionButton]}
              onPress={syncAllContacts}
            >
              <Text style={styles.buttonText}>🔄 Sincronizar Todos</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.whitelistHeader}>
            <Text style={styles.whitelistSectionTitle}>
              Contactos en Whitelist ({whitelistContacts.length})
            </Text>
          </View>

          <FlatList
            data={whitelistContacts}
            renderItem={renderWhitelistContact}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            style={styles.whitelistContactsList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No hay contactos en la whitelist</Text>
                <Text style={styles.emptySubtext}>
                  Los contactos añadidos nunca serán bloqueados
                </Text>
              </View>
            }
          />
        </View>
      </Modal>

      {/* Modal para añadir contacto desde agenda */}
      <Modal
        visible={showAddContactModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddContactModal(false)}
      >
        <View style={styles.manageModalContainer}>
          <View style={styles.manageModalHeader}>
            <Text style={styles.manageModalTitle}>Seleccionar Contacto</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowAddContactModal(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar contactos..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <FlatList
            data={filteredDeviceContacts}
            renderItem={renderDeviceContact}
            keyExtractor={(item) => item.id}
            style={styles.contactsList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No se encontraron contactos</Text>
                <Text style={styles.emptySubtext}>
                  Verifica los permisos de contactos
                </Text>
              </View>
            }
          />
        </View>
      </Modal>

      {/* Modal para añadir contacto manualmente */}
      <Modal
        visible={showManualAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowManualAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Añadir Contacto</Text>
            <Text style={styles.modalSubtitle}>
              Introduce los datos del contacto a añadir a la whitelist
            </Text>

            <TextInput
              style={styles.phoneInput}
              value={manualContactName}
              onChangeText={setManualContactName}
              placeholder="Nombre del contacto"
              autoFocus={true}
            />

            <TextInput
              style={styles.phoneInput}
              value={manualContactPhone}
              onChangeText={setManualContactPhone}
              placeholder="+34600123456"
              keyboardType="phone-pad"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setManualContactName('');
                  setManualContactPhone('');
                  setShowManualAddModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleAddManualContact}
              >
                <Text style={styles.confirmButtonText}>Añadir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  phoneInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#F9FAFB',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  confirmButton: {
    backgroundColor: '#DC2626',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  manageModalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  manageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  manageModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#6B7280',
  },
  spamNumbersList: {
    flex: 1,
    padding: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  spamNumberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  spamNumberInfo: {
    flex: 1,
  },
  spamNumberPhone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  spamNumberDetails: {
    fontSize: 12,
    color: '#6B7280',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  deleteButtonText: {
    fontSize: 18,
  },
  manageModalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  addNewButton: {
    backgroundColor: '#DC2626',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  addNewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Whitelist specific styles
  whitelistActions: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  whitelistActionButton: {
    backgroundColor: '#8B5CF6',
    marginBottom: 8,
  },
  whitelistHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  whitelistSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  whitelistContactsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  whitelistContactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  contactPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  contactDetails: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  removeContactButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  removeContactButtonText: {
    fontSize: 18,
  },
  // Search and contact selection styles
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
  },
  contactsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addContactButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addContactButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});