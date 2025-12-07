import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { ContactsService } from '../services/ContactsService';
import { PermissionsService } from '../services/PermissionsService';

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

export const WhitelistScreen: React.FC = () => {
  const [whitelistContacts, setWhitelistContacts] = useState<WhitelistContact[]>([]);
  const [deviceContacts, setDeviceContacts] = useState<Contact[]>([]);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [manualContactName, setManualContactName] = useState('');
  const [manualContactPhone, setManualContactPhone] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadWhitelistContacts();
  }, []);

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

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES');
    } catch {
      return 'Fecha desconocida';
    }
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Gestionar Whitelist</Text>
      </View>

      <View style={styles.buttonContainer}>
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

      <View style={styles.listHeader}>
        <Text style={styles.listSectionTitle}>
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

      {/* Modal para añadir contacto desde agenda */}
      <Modal
        visible={showAddContactModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddContactModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleccionar Contacto</Text>
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
              style={styles.input}
              value={manualContactName}
              onChangeText={setManualContactName}
              placeholder="Nombre del contacto"
              autoFocus={true}
            />

            <TextInput
              style={styles.input}
              value={manualContactPhone}
              onChangeText={setManualContactPhone}
              placeholder="+34600123456"
              keyboardType="phone-pad"
            />

            <View style={styles.modalFooter}>
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
  buttonContainer: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  whitelistActionButton: {
    backgroundColor: '#3B82F6',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  listHeader: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  whitelistContactsList: {
    paddingHorizontal: 16,
  },
  contactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
  },
  whitelistContactItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  contactPhone: {
    fontSize: 14,
    color: '#4B5563',
  },
  contactDetails: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  addContactButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addContactButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  removeContactButton: {
    padding: 8,
  },
  removeContactButtonText: {
    fontSize: 18,
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#6B7280',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    backgroundColor: '#F3F4F6',
    padding: 10,
    borderRadius: 8,
  },
  contactsList: {
    paddingHorizontal: 16,
    paddingTop: 16,
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
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
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
    backgroundColor: '#3B82F6',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
