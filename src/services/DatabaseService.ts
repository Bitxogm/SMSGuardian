import SQLite, { SQLiteDatabase } from 'react-native-sqlite-storage';
import { APP_CONFIG } from '../config/AppConfig';
import { SMSMessage, SpamNumber } from '../types/SMS';

SQLite.DEBUG(true);
SQLite.enablePromise(true);

class DatabaseService {
  private database: SQLiteDatabase | null = null;

  // =============================================================================
  // INICIALIZACIÓN Y CONFIGURACIÓN
  // =============================================================================

  async initialize(): Promise<void> {
    try {
      this.database = await SQLite.openDatabase({
        name: APP_CONFIG.database.name,
        location: 'default',
      });

      await this.createTables();
      await this.loadInitialData();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');

    const createSpamNumbers = `
      CREATE TABLE IF NOT EXISTS spam_numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT UNIQUE NOT NULL,
        spam_type TEXT NOT NULL DEFAULT 'scam',
        source TEXT DEFAULT 'manual',
        confidence_score INTEGER DEFAULT 50,
        date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1
      );
    `;

    const createBlockedSMS = `
      CREATE TABLE IF NOT EXISTS blocked_sms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT NOT NULL,
        message_content TEXT,
        block_reason TEXT,
        threat_level TEXT,
        timestamp BIGINT,
        contains_urls BOOLEAN DEFAULT 0,
        analyzed_urls TEXT
      );
    `;

    const createURLAnalysis = `
      CREATE TABLE IF NOT EXISTS url_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        domain TEXT,
        threat_level TEXT DEFAULT 'unknown',
        is_malicious BOOLEAN DEFAULT 0,
        confidence INTEGER DEFAULT 0,
        source TEXT,
        analysis_date DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createAppSettings = `
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT,
        date_modified DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createQuarantinedSMS = `
      CREATE TABLE IF NOT EXISTS quarantined_sms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT NOT NULL,
        message_content TEXT,
        quarantine_reason TEXT,
        threat_level TEXT,
        timestamp BIGINT,
        contains_urls BOOLEAN DEFAULT 0,
        analyzed_urls TEXT,
        is_reviewed BOOLEAN DEFAULT 0,
        user_action TEXT DEFAULT 'none',
        date_quarantined DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createContacts = `
      CREATE TABLE IF NOT EXISTS user_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT UNIQUE NOT NULL,
        contact_name TEXT,
        source TEXT DEFAULT 'manual',
        is_whitelisted BOOLEAN DEFAULT 1,
        date_added DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createInbox = `
      CREATE TABLE IF NOT EXISTS inbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT NOT NULL,
        message_content TEXT,
        timestamp BIGINT,
        is_read BOOLEAN DEFAULT 0,
        date_received DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Ejecutar creación de tablas
    await this.database.executeSql(createSpamNumbers);
    await this.database.executeSql(createBlockedSMS);
    await this.database.executeSql(createURLAnalysis);
    await this.database.executeSql(createAppSettings);
    await this.database.executeSql(createQuarantinedSMS);
    await this.database.executeSql(createContacts);
    await this.database.executeSql(createInbox);

    // Crear índices
    await this.database.executeSql('CREATE INDEX IF NOT EXISTS idx_spam_phone ON spam_numbers(phone_number);');
    await this.database.executeSql('CREATE INDEX IF NOT EXISTS idx_url_domain ON url_analysis(domain);');
    await this.database.executeSql('CREATE INDEX IF NOT EXISTS idx_contacts_phone ON user_contacts(phone_number);');
  }

  private async loadInitialData(): Promise<void> {
    // Números spam españoles (ejemplos)
    const spanishSpamNumbers = [
      { phone: '+34666000001', type: 'phishing' },
      { phone: '+34900000002', type: 'commercial' },
      { phone: '+34911000003', type: 'scam' },
    ];

    // Añadir contactos de ejemplo para testing (solo si no existen)
    const existingContacts = await this.getWhitelistContactsCount();
    if (existingContacts === 0) {
      await this.addContact('+34600000000', 'Contacto Seguro', 'preloaded');
      await this.addContact('+34700000000', 'Familia', 'preloaded');
      await this.addContact('+34800000000', 'Trabajo', 'preloaded');
    }

    // Cargar números spam
    for (const spam of spanishSpamNumbers) {
      await this.addSpamNumber(spam.phone, spam.type as any, 'preloaded');
    }

    // Configuraciones por defecto
    await this.setSetting('protection_level', 'balanced');
    await this.setSetting('enable_url_analysis', 'true');
    await this.setSetting('auto_update_db', 'true');
  }

  // =============================================================================
  // CONFIGURACIONES Y AJUSTES
  // =============================================================================

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      const query = `
        INSERT OR REPLACE INTO app_settings (setting_key, setting_value) 
        VALUES (?, ?)
      `;
      await this.database.executeSql(query, [key, value]);
    } catch (error) {
      console.error('Error setting configuration:', error);
    }
  }

  async getSetting(key: string, defaultValue: string = ''): Promise<string> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      const query = 'SELECT setting_value FROM app_settings WHERE setting_key = ?';
      const [results] = await this.database.executeSql(query, [key]);
      return results.rows.length > 0 ? results.rows.item(0).setting_value : defaultValue;
    } catch (error) {
      console.error('Error getting configuration:', error);
      return defaultValue;
    }
  }

  // =============================================================================
  // GESTIÓN DE NÚMEROS SPAM
  // =============================================================================

  async addSpamNumber(phoneNumber: string, spamType: SpamNumber['spamType'], source: string = 'manual'): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      const query = `
        INSERT OR REPLACE INTO spam_numbers 
        (phone_number, spam_type, source, confidence_score) 
        VALUES (?, ?, ?, ?)
      `;
      const confidence = source === 'community' ? 80 : 60;
      await this.database.executeSql(query, [phoneNumber, spamType, source, confidence]);
      console.log(`Added spam number: ${phoneNumber} (${spamType})`);
    } catch (error) {
      console.error('Error adding spam number:', error);
      throw error;
    }
  }

  async addSpamNumberFromQuarantine(phoneNumber: string, spamType: SpamNumber['spamType'] = 'scam'): Promise<void> {
    await this.addSpamNumber(phoneNumber, spamType, 'quarantine');
  }

  async isSpamNumber(phoneNumber: string): Promise<any> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      const query = 'SELECT * FROM spam_numbers WHERE phone_number = ? AND is_active = 1';
      const [results] = await this.database.executeSql(query, [phoneNumber]);

      if (results.rows.length > 0) {
        const item = results.rows.item(0);
        console.log('Found spam number:', item);
        return {
          id: item.id,
          phone_number: item.phone_number,
          spam_type: item.spam_type,
          source: item.source,
          confidence_score: item.confidence_score,
          is_active: item.is_active
        };
      }
      return null;
    } catch (error) {
      console.error('Error checking spam number:', error);
      return null;
    }
  }

  async getAllSpamNumbers(): Promise<any[]> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      const query = `
        SELECT * FROM spam_numbers 
        WHERE is_active = 1 
        ORDER BY date_added DESC
      `;
      const [results] = await this.database.executeSql(query);

      const spamNumbers: any[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        const item = results.rows.item(i);
        spamNumbers.push({
          id: item.id,
          phone_number: item.phone_number,
          spam_type: item.spam_type,
          source: item.source,
          confidence_score: item.confidence_score,
          date_added: item.date_added,
          is_active: item.is_active
        });
      }
      return spamNumbers;
    } catch (error) {
      console.error('Error getting all spam numbers:', error);
      return [];
    }
  }

  async getSpamNumbersCount(): Promise<number> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      const query = 'SELECT COUNT(*) as count FROM spam_numbers WHERE is_active = 1';
      const [results] = await this.database.executeSql(query);
      return results.rows.item(0).count;
    } catch (error) {
      console.error('Error getting spam numbers count:', error);
      return 0;
    }
  }

  async removeSpamNumber(id: number): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      // En lugar de eliminar físicamente, marcamos como inactivo
      const query = 'UPDATE spam_numbers SET is_active = 0 WHERE id = ?';
      await this.database.executeSql(query, [id]);
      console.log(`Deactivated spam number with ID: ${id}`);
    } catch (error) {
      console.error('Error removing spam number:', error);
      throw error;
    }
  }

  // =============================================================================
  // GESTIÓN DE CONTACTOS Y WHITELIST
  // =============================================================================

  async addContact(phoneNumber: string, contactName: string, source: string = 'manual'): Promise<void> {
    if (!this.database) return;

    try {
      const query = 'INSERT OR REPLACE INTO user_contacts (phone_number, contact_name, source) VALUES (?, ?, ?)';
      await this.database.executeSql(query, [phoneNumber, contactName, source]);
      console.log(`Added contact to whitelist: ${phoneNumber} (${contactName}) - ${source}`);
    } catch (error) {
      console.error('Error adding contact:', error);
      throw error;
    }
  }

  async getAllWhitelistContacts(): Promise<any[]> {
    if (!this.database) return [];

    try {
      const query = `
        SELECT * FROM user_contacts 
        WHERE is_whitelisted = 1 
        ORDER BY date_added DESC
      `;
      const [results] = await this.database.executeSql(query);

      const contacts: any[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        const item = results.rows.item(i);
        contacts.push({
          id: item.id,
          phone_number: item.phone_number,
          contact_name: item.contact_name,
          source: item.source || 'manual',
          date_added: item.date_added,
          is_whitelisted: item.is_whitelisted
        });
      }
      return contacts;
    } catch (error) {
      console.error('Error getting whitelist contacts:', error);
      return [];
    }
  }

  async getWhitelistContactsCount(): Promise<number> {
    if (!this.database) return 0;

    try {
      const query = 'SELECT COUNT(*) as count FROM user_contacts WHERE is_whitelisted = 1';
      const [results] = await this.database.executeSql(query);
      return results.rows.item(0).count;
    } catch (error) {
      console.error('Error getting whitelist contacts count:', error);
      return 0;
    }
  }

  async removeFromWhitelist(id: number): Promise<void> {
    if (!this.database) return;

    try {
      const query = 'DELETE FROM user_contacts WHERE id = ?';
      await this.database.executeSql(query, [id]);
      console.log(`Removed contact from whitelist: ID ${id}`);
    } catch (error) {
      console.error('Error removing from whitelist:', error);
      throw error;
    }
  }

  async isInContacts(phoneNumber: string): Promise<boolean> {
    if (!this.database) return false;

    try {
      const query = 'SELECT COUNT(*) as count FROM user_contacts WHERE phone_number = ? AND is_whitelisted = 1';
      const [results] = await this.database.executeSql(query, [phoneNumber]);
      return results.rows.item(0).count > 0;
    } catch (error) {
      console.error('Error checking if contact exists:', error);
      return false;
    }
  }

  async searchWhitelistContacts(query: string): Promise<any[]> {
    if (!this.database) return [];

    try {
      const searchQuery = `
        SELECT * FROM user_contacts 
        WHERE is_whitelisted = 1 
        AND (contact_name LIKE ? OR phone_number LIKE ?) 
        ORDER BY contact_name ASC
      `;
      const searchPattern = `%${query}%`;
      const [results] = await this.database.executeSql(searchQuery, [searchPattern, searchPattern]);

      const contacts: any[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        const item = results.rows.item(i);
        contacts.push({
          id: item.id,
          phone_number: item.phone_number,
          contact_name: item.contact_name,
          source: item.source || 'manual',
          date_added: item.date_added,
          is_whitelisted: item.is_whitelisted
        });
      }
      return contacts;
    } catch (error) {
      console.error('Error searching whitelist contacts:', error);
      return [];
    }
  }

  async clearUserContacts(): Promise<number> {
    if (!this.database) return 0;

    try {
      // Contar cuántos vamos a eliminar
      const countQuery = 'SELECT COUNT(*) as count FROM user_contacts WHERE source != ?';
      const [countResults] = await this.database.executeSql(countQuery, ['preloaded']);
      const toRemove = countResults.rows.item(0).count;

      // Eliminar contactos que no sean del sistema
      const deleteQuery = 'DELETE FROM user_contacts WHERE source != ?';
      await this.database.executeSql(deleteQuery, ['preloaded']);

      console.log(`Cleared ${toRemove} user contacts from whitelist`);
      return toRemove;
    } catch (error) {
      console.error('Error clearing user contacts:', error);
      throw error;
    }
  }

  async updateContact(id: number, contactName: string): Promise<void> {
    if (!this.database) return;

    try {
      const query = 'UPDATE user_contacts SET contact_name = ? WHERE id = ?';
      await this.database.executeSql(query, [contactName, id]);
      console.log(`Updated contact: ID ${id} -> ${contactName}`);
    } catch (error) {
      console.error('Error updating contact:', error);
      throw error;
    }
  }

  async getContactsStatsBySource(): Promise<{ [key: string]: number }> {
    if (!this.database) return {};

    try {
      const query = `
        SELECT source, COUNT(*) as count 
        FROM user_contacts 
        WHERE is_whitelisted = 1 
        GROUP BY source
      `;
      const [results] = await this.database.executeSql(query);

      const stats: { [key: string]: number } = {};
      for (let i = 0; i < results.rows.length; i++) {
        const item = results.rows.item(i);
        stats[item.source || 'unknown'] = item.count;
      }
      return stats;
    } catch (error) {
      console.error('Error getting contacts stats by source:', error);
      return {};
    }
  }

  async importContacts(contacts: Array<{ phoneNumber: string, name: string, source?: string }>): Promise<number> {
    if (!this.database) return 0;

    try {
      let importedCount = 0;

      // Usar transacción para mejor rendimiento
      await this.database.transaction(async (tx) => {
        for (const contact of contacts) {
          try {
            const query = 'INSERT OR IGNORE INTO user_contacts (phone_number, contact_name, source) VALUES (?, ?, ?)';
            const result = await tx.executeSql(query, [
              contact.phoneNumber,
              contact.name,
              contact.source || 'sync'
            ]);

            if (result[1].rowsAffected > 0) {
              importedCount++;
            }
          } catch (error) {
            console.log(`Skipped importing ${contact.name}: ${error}`);
          }
        }
      });

      console.log(`Import completed: ${importedCount} contacts imported`);
      return importedCount;
    } catch (error) {
      console.error('Error importing contacts:', error);
      throw error;
    }
  }

  // =============================================================================
  // GESTIÓN DE SMS BLOQUEADOS
  // =============================================================================

  async logBlockedSMS(sms: Omit<SMSMessage, 'id'>): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      const query = `
        INSERT INTO blocked_sms 
        (phone_number, message_content, block_reason, threat_level, timestamp, contains_urls, analyzed_urls) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      await this.database.executeSql(query, [
        sms.phoneNumber,
        sms.messageContent,
        sms.blockReason || 'unknown',
        sms.threatLevel || 'suspicious',
        sms.timestamp,
        sms.containsUrls ? 1 : 0,
        JSON.stringify(sms.analyzedUrls || [])
      ]);
      console.log('Blocked SMS logged:', sms.phoneNumber);
    } catch (error) {
      console.error('Error logging blocked SMS:', error);
    }
  }

  async getBlockedSMSCount(): Promise<number> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      const query = 'SELECT COUNT(*) as count FROM blocked_sms';
      const [results] = await this.database.executeSql(query);
      return results.rows.item(0).count;
    } catch (error) {
      console.error('Error getting blocked SMS count:', error);
      return 0;
    }
  }

  async getBlockedMessages(): Promise<any[]> {
    if (!this.database) throw new Error('Database not initialized');

    try {
      const query = 'SELECT * FROM blocked_sms ORDER BY timestamp DESC LIMIT 50';
      const [results] = await this.database.executeSql(query);

      const messages: any[] = [];
      for (let i = 0; i < results.rows.length; i++) {
        messages.push(results.rows.item(i));
      }
      return messages;
    } catch (error) {
      console.error('Error getting blocked messages:', error);
      return [];
    }
  }

  // =============================================================================
  // GESTIÓN DE CUARENTENA
  // =============================================================================

  async quarantineSMS(smsData: any): Promise<void> {
    if (!this.database) throw new Error('Database not initialized');

    const query = `INSERT INTO quarantined_sms 
      (phone_number, message_content, quarantine_reason, threat_level, timestamp, contains_urls, analyzed_urls) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`;

    await this.database.executeSql(query, [
      smsData.phoneNumber,
      smsData.messageContent,
      smsData.reason,
      smsData.threatLevel,
      smsData.timestamp,
      smsData.urls && smsData.urls.length > 0 ? 1 : 0,
      JSON.stringify(smsData.urls || [])
    ]);
  }

  async getQuarantinedSMS(): Promise<any[]> {
    if (!this.database) return [];

    const query = 'SELECT * FROM quarantined_sms ORDER BY date_quarantined DESC LIMIT 50';
    const [results] = await this.database.executeSql(query);

    const messages: any[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const item = results.rows.item(i);
      messages.push({
        ...item,
        analyzed_urls: JSON.parse(item.analyzed_urls || '[]')
      });
    }
    return messages;
  }

  async getQuarantinedCount(): Promise<number> {
    if (!this.database) return 0;

    const query = 'SELECT COUNT(*) as count FROM quarantined_sms WHERE is_reviewed = 0';
    const [results] = await this.database.executeSql(query);
    return results.rows.item(0).count;
  }

  async markQuarantinedAsReviewed(id: number, userAction: string): Promise<void> {
    if (!this.database) return;

    const query = 'UPDATE quarantined_sms SET is_reviewed = 1, user_action = ? WHERE id = ?';
    await this.database.executeSql(query, [userAction, id]);
  }
  async isNumberBlacklisted(phoneNumber: string): Promise<boolean> {
    if (!this.database) return false;
    try {
      const query = 'SELECT COUNT(*) as count FROM spam_numbers WHERE phone_number = ? AND is_active = 1';
      const [results] = await this.database.executeSql(query, [phoneNumber]);
      return results.rows.item(0).count > 0;
    } catch (error) {
      console.error('Error checking blacklist:', error);
      return false;
    }
  }

  async logInbox(sms: { phoneNumber: string, messageContent: string, timestamp: number }): Promise<void> {
    if (!this.database) return;
    try {
      // DUPLICATE CHECK: Verify if this message already exists (same content, phone, and similar timestamp)
      const checkQuery = `
        SELECT id FROM inbox 
        WHERE phone_number = ? 
        AND message_content = ? 
        AND ABS(timestamp - ?) < 2000 
      `;
      // Check within 2 seconds window to handle minor timestamp differences or exact matches
      const [results] = await this.database.executeSql(checkQuery, [sms.phoneNumber, sms.messageContent, sms.timestamp]);

      if (results.rows.length > 0) {
        console.log('Skipping duplicate SMS log');
        return;
      }

      const query = `
        INSERT INTO inbox (phone_number, message_content, timestamp)
        VALUES (?, ?, ?)
      `;
      await this.database.executeSql(query, [sms.phoneNumber, sms.messageContent, sms.timestamp]);
      console.log('Logged SMS to Inbox');
    } catch (error) {
      console.error('Error logging to inbox:', error);
    }
  }
  async getSpamCount(): Promise<number> {
    if (!this.database) return 0;
    try {
      const [results] = await this.database.executeSql('SELECT COUNT(*) as count FROM spam_numbers');
      return results.rows.item(0).count;
    } catch (error) {
      console.error('Error getting spam count:', error);
      return 0;
    }
  }

  async getDebugStats(): Promise<{
    isConnected: boolean;
    spamRules: number;
    inboxCount: number;
    blockedCount: number;
  }> {
    if (!this.database) {
      return { isConnected: false, spamRules: 0, inboxCount: 0, blockedCount: 0 };
    }
    try {
      const spamCount = await this.getSpamCount();
      const [inboxRes] = await this.database.executeSql('SELECT COUNT(*) as count FROM inbox');
      const [blockedRes] = await this.database.executeSql('SELECT COUNT(*) as count FROM blocked_sms');

      return {
        isConnected: true,
        spamRules: spamCount,
        inboxCount: inboxRes.rows.item(0).count,
        blockedCount: blockedRes.rows.item(0).count
      };
    } catch (error) {
      console.error('Error getting debug stats:', error);
      return { isConnected: false, spamRules: 0, inboxCount: 0, blockedCount: 0 };
    }
  }

  async getInboxMessages(): Promise<any[]> {
    if (!this.database) return [];
    try {
      const query = 'SELECT * FROM inbox ORDER BY timestamp DESC';
      const [results] = await this.database.executeSql(query);
      const messages = [];
      for (let i = 0; i < results.rows.length; i++) {
        messages.push(results.rows.item(i));
      }
      return messages;
    } catch (error) {
      console.error('Error getting inbox:', error);
      return [];
    }
  }

  async deleteInboxMessage(id: number): Promise<void> {
    if (!this.database) return;
    try {
      await this.database.executeSql('DELETE FROM inbox WHERE id = ?', [id]);
    } catch (error) {
      console.error('Error deleting inbox message:', error);
      throw error;
    }
  }
  async addTestQuarantineMessages(): Promise<void> {
    if (!this.database) return;

    const testMessages = [
      {
        phoneNumber: '+1555000999',
        messageContent: 'URGENTE: Su cuenta ha sido suspendida. Verifique aqui: http://testsafebrowsing.appspot.com/s/malware.html',
        reason: 'Suspicious URL',
        threatLevel: 'suspicious',
        timestamp: Date.now() - 3600000,
        urls: ['http://testsafebrowsing.appspot.com/s/malware.html']
      },
      {
        phoneNumber: '+34600123456',
        messageContent: 'Hola, mira estas fotos del viaje: http://google.com/photos',
        reason: 'Suspicious Pattern',
        threatLevel: 'suspicious',
        timestamp: Date.now() - 7200000,
        urls: ['http://google.com/photos']
      },
      {
        phoneNumber: '+44700000000',
        messageContent: 'Ganaste un iPhone! Reclama en http://bit.ly/fake-prize-claim',
        reason: 'URL Shortener',
        threatLevel: 'malicious',
        timestamp: Date.now() - 10000,
        urls: ['http://bit.ly/fake-prize-claim']
      }
    ];

    for (const msg of testMessages) {
      await this.quarantineSMS(msg);
    }
    console.log('Added test quarantine messages');
  }
}

export const databaseService = new DatabaseService();