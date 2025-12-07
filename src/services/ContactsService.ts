// ContactsService.ts - Safe Stub Version
import { databaseService } from './DatabaseService';

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
    console.log('ContactsService initialized (Stub)');
  }

  static async checkContactsPermission(): Promise<boolean> {
    return false;
  }

  static async requestContactsPermission(): Promise<boolean> {
    return false;
  }

  static async getDeviceContacts(): Promise<Contact[]> {
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
      const normalized = phoneNumber.replace(/[\s\-\(\)\.]/g, '');
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
    return { added: 0 };
  }

  static async isInContacts(phoneNumber: string): Promise<boolean> {
    try {
      const normalized = phoneNumber.replace(/[\s\-\(\)\.]/g, '');
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