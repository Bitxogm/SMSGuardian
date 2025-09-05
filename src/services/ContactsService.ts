import { PermissionsAndroid, Platform } from 'react-native';
import { databaseService } from './DatabaseService';

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

export class ContactsService {
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    try {
      await this.requestPermissions();
      this.isInitialized = true;
      console.log('Contacts Service initialized');
    } catch (error) {
      console.error('Error initializing Contacts Service:', error);
    }
  }

  private static async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.error('Error requesting contacts permissions:', error);
      return false;
    }
  }

  private static async createWhitelistTable(): Promise<void> {

    // Añadir algunos contactos de ejemplo para testing
    const existingContacts = await this.getWhitelistContacts();
    if (existingContacts.length === 0) {
      await databaseService.addContact('+34600000000', 'Contacto Seguro', 'preloaded');
      await databaseService.addContact('+34700000000', 'Familia', 'preloaded');
      await databaseService.addContact('+34800000000', 'Trabajo', 'preloaded');
    }
  }

  // Función principal para obtener contactos de la whitelist
  static async getWhitelistContacts(): Promise<WhitelistContact[]> {
    try {
      return await databaseService.getAllWhitelistContacts();
    } catch (error) {
      console.error('Error getting whitelist contacts:', error);
      return [];
    }
  }

  // Función para obtener contactos del dispositivo (simulada por ahora)
  static async getDeviceContacts(): Promise<Contact[]> {
    try {
      // En un entorno real, aquí usarías react-native-contacts o similar
      // Por ahora devolvemos contactos simulados para testing
      const hasPermission = await this.checkContactsPermission();
      if (!hasPermission) {
        throw new Error('No contacts permission');
      }

      // Contactos simulados para testing
      const simulatedContacts: Contact[] = [
        { id: '1', name: 'Juan Pérez', phoneNumber: '+34611111111' },
        { id: '2', name: 'María González', phoneNumber: '+34622222222' },
        { id: '3', name: 'Pedro Martínez', phoneNumber: '+34633333333' },
        { id: '4', name: 'Ana López', phoneNumber: '+34644444444' },
        { id: '5', name: 'Carlos Rodríguez', phoneNumber: '+34655555555' },
        { id: '6', name: 'Laura García', phoneNumber: '+34666666666' },
        { id: '7', name: 'Miguel Sánchez', phoneNumber: '+34677777777' },
        { id: '8', name: 'Isabel Díaz', phoneNumber: '+34688888888' },
        { id: '9', name: 'Roberto Fernández', phoneNumber: '+34699999999' },
        { id: '10', name: 'Carmen Jiménez', phoneNumber: '+34611000000' },
      ];

      // Filtrar contactos que ya están en whitelist
      const whitelistContacts = await this.getWhitelistContacts();
      const whitelistNumbers = whitelistContacts.map(c => this.normalizePhoneNumber(c.phone_number));

      return simulatedContacts.filter(contact =>
        !whitelistNumbers.includes(this.normalizePhoneNumber(contact.phoneNumber))
      );

    } catch (error) {
      console.error('Error getting device contacts:', error);
      return [];
    }
  }

  // Verificar permisos de contactos
  static async checkContactsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const result = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS
      );
      return result;
    } catch (error) {
      console.error('Error checking contacts permission:', error);
      return false;
    }
  }

  // Solicitar permisos de contactos
  static async requestContactsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        {
          title: 'Permisos de Contactos',
          message: 'SMS Guardian necesita acceso a tus contactos para la whitelist',
          buttonNeutral: 'Preguntar después',
          buttonNegative: 'Cancelar',
          buttonPositive: 'Aceptar',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.error('Error requesting contacts permission:', error);
      return false;
    }
  }

  // Añadir contacto a whitelist
  static async addToWhitelist(phoneNumber: string, contactName: string = 'Manual'): Promise<void> {
    try {
      const normalizedNumber = this.normalizePhoneNumber(phoneNumber);

      // Verificar si ya existe
      const existing = await databaseService.isInContacts(normalizedNumber);
      if (existing) {
        throw new Error('El contacto ya está en la whitelist');
      }

      await databaseService.addContact(normalizedNumber, contactName, 'manual');
      console.log(`Added to whitelist: ${normalizedNumber} (${contactName})`);
    } catch (error) {
      console.error('Error adding to whitelist:', error);
      throw error;
    }
  }

  // Eliminar contacto de whitelist
  static async removeFromWhitelist(id: number): Promise<void> {
    try {
      await databaseService.removeFromWhitelist(id);
      console.log(`Removed from whitelist: ID ${id}`);
    } catch (error) {
      console.error('Error removing from whitelist:', error);
      throw error;
    }
  }

  // Sincronizar todos los contactos del dispositivo
  static async syncAllContacts(): Promise<{ added: number }> {
    try {
      const deviceContacts = await this.getDeviceContacts();
      let addedCount = 0;

      for (const contact of deviceContacts) {
        try {
          await this.addToWhitelist(contact.phoneNumber, contact.name);
          addedCount++;
        } catch (error) {
          // Continuar con el siguiente contacto si hay error
          console.log(`Skipped ${contact.name}: already in whitelist`);
        }
      }

      console.log(`Sync completed: ${addedCount} contacts added`);
      return { added: addedCount };

    } catch (error) {
      console.error('Error syncing all contacts:', error);
      throw error;
    }
  }

  // Verificar si un número está en la whitelist
  static async isInContacts(phoneNumber: string): Promise<boolean> {
    try {
      const normalized = this.normalizePhoneNumber(phoneNumber);
      return await databaseService.isInContacts(normalized);
    } catch (error) {
      console.error('Error checking contacts:', error);
      return false;
    }
  }

  // Normalizar número de teléfono
  private static normalizePhoneNumber(phoneNumber: string): string {
    let normalized = phoneNumber.replace(/[\s\-\(\)\.]/g, '');

    if (!normalized.startsWith('+')) {
      if (normalized.startsWith('0')) {
        normalized = '+34' + normalized.substring(1);
      } else if (normalized.length === 9) {
        normalized = '+34' + normalized;
      }
    }

    return normalized;
  }

  // Obtener estadísticas de contactos
  static async getContactsStats(): Promise<{
    whitelistCount: number;
    deviceContactsCount: number;
  }> {
    try {
      const whitelistContacts = await this.getWhitelistContacts();
      const deviceContacts = await this.getDeviceContacts();

      return {
        whitelistCount: whitelistContacts.length,
        deviceContactsCount: deviceContacts.length,
      };
    } catch (error) {
      console.error('Error getting contacts stats:', error);
      return { whitelistCount: 0, deviceContactsCount: 0 };
    }
  }

  // Buscar en whitelist
  static async searchWhitelist(query: string): Promise<WhitelistContact[]> {
    try {
      const allContacts = await this.getWhitelistContacts();
      const lowercaseQuery = query.toLowerCase();

      return allContacts.filter(contact =>
        contact.contact_name.toLowerCase().includes(lowercaseQuery) ||
        contact.phone_number.includes(query)
      );
    } catch (error) {
      console.error('Error searching whitelist:', error);
      return [];
    }
  }

  // Limpiar whitelist (mantener solo contactos del sistema)
  static async clearUserAddedContacts(): Promise<number> {
    try {
      const removed = await databaseService.clearUserContacts();
      console.log(`Cleared ${removed} user-added contacts from whitelist`);
      return removed;
    } catch (error) {
      console.error('Error clearing user contacts:', error);
      throw error;
    }
  }

  // Exportar whitelist (para backup)
  static async exportWhitelist(): Promise<WhitelistContact[]> {
    try {
      return await this.getWhitelistContacts();
    } catch (error) {
      console.error('Error exporting whitelist:', error);
      return [];
    }
  }

  // Importar whitelist (desde backup)
  static async importWhitelist(contacts: Array<{ phoneNumber: string, name: string }>): Promise<number> {
    try {
      let importedCount = 0;

      for (const contact of contacts) {
        try {
          await this.addToWhitelist(contact.phoneNumber, contact.name);
          importedCount++;
        } catch (error) {
          console.log(`Skipped importing ${contact.name}: already exists`);
        }
      }

      console.log(`Import completed: ${importedCount} contacts imported`);
      return importedCount;
    } catch (error) {
      console.error('Error importing whitelist:', error);
      throw error;
    }
  }

  static getContactsCount(): number {
    // Esta función ahora es legacy, usar getContactsStats() en su lugar
    return 0;
  }
}