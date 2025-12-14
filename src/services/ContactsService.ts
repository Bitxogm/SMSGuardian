// ContactsService.ts
import { NativeModules, Platform } from 'react-native';
import { databaseService } from './DatabaseService';

const { SMSModule } = NativeModules;

export interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
}

export interface WhitelistContact {
  id: number;
  phone_number: string;
  contact_name: string;
  date_added: string;
  source: string;
}

export class ContactsService {
  static async initialize(): Promise<void> {
    console.log('ContactsService initialized');
  }

  static async checkContactsPermission(): Promise<boolean> {
    // Permission checking is handled in PermissionsService, but we can double check here or delegate
    // For now we assume the caller uses PermissionsService
    return true;
  }

  static async requestContactsPermission(): Promise<boolean> {
    return true;
  }

  static async getDeviceContacts(): Promise<Contact[]> {
    if (Platform.OS === 'android') {
      try {
        const contacts = await SMSModule.getDeviceContacts();
        return contacts;
      } catch (error) {
        console.error('Error fetching native contacts:', error);
        return [];
      }
    }
    return [];
  }

  static async getWhitelistContacts(): Promise<WhitelistContact[]> {
    try {
      return await databaseService.getAllWhitelistContacts();
    } catch (error) {
      console.error('Error getting whitelist:', error);
      return [];
    }
  }

  static async addToWhitelist(phoneNumber: string, name: string): Promise<void> {
    try {
      const normalized = phoneNumber.replace(/[\s\-().]/g, '');
      await databaseService.addContact(normalized, name, 'contacts');
    } catch (e) {
      console.error(e);
    }
  }

  static async removeFromWhitelist(id: number): Promise<void> {
    try {
      await databaseService.removeFromWhitelist(id);
    } catch (e) {
      console.error(e);
    }
  }

  static async syncAllContacts(): Promise<{ added: number }> {
    try {
      const contacts = await this.getDeviceContacts();
      let addedCount = 0;

      console.log(`Syncing ${contacts.length} contacts...`);

      for (const contact of contacts) {
        if (contact.phoneNumber) {
          // Clean phone number
          const cleanPhone = contact.phoneNumber.replace(/[\s\-().]/g, '');

          // Check if already exists to avoid duplicates (though DB might handle it)
          const isWhitelisted = await databaseService.isInContacts(cleanPhone);

          if (!isWhitelisted) {
            await databaseService.addContact(cleanPhone, contact.name, 'sync');
            addedCount++;
          }
        }
      }

      return { added: addedCount };
    } catch (error) {
      console.error('Error syncing contacts:', error);
      return { added: 0 };
    }
  }

  static async isInContacts(phoneNumber: string): Promise<boolean> {
    try {
      const normalized = phoneNumber.replace(/[\s\-().]/g, '');
      return await databaseService.isInContacts(normalized);
    } catch (e) {
      return false;
    }
  }

  static async getContactsStats(): Promise<{
    whitelistCount: number;
    deviceContactsCount: number;
  }> {
    return { whitelistCount: 0, deviceContactsCount: 0 };
  }
}