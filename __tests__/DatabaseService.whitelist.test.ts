// Real SQLite in memory (node:sqlite, Node >= 22.13) behind the react-native-sqlite-storage API.
// Setting mockState.db = null makes the next initialize() open a brand-new database.
jest.mock('react-native-sqlite-storage', () => {
  const { DatabaseSync } = require('node:sqlite');

  const openDatabase = async () => {
    mockState.db = mockState.db ?? new DatabaseSync(':memory:');
    const db = mockState.db;
    return {
      executeSql: async (sql: string, params: unknown[] = []) => {
        if (mockState.failContactsPurge && /DELETE FROM user_contacts/i.test(sql)) {
          throw new Error('disk I/O error');
        }
        const stmt = db.prepare(sql);
        if (/^\s*(SELECT|PRAGMA)/i.test(sql)) {
          const rows = stmt.all(...params);
          return [{ rows: { length: rows.length, item: (i: number) => rows[i] }, rowsAffected: 0 }];
        }
        const result = stmt.run(...params);
        return [{
          rows: { length: 0, item: () => undefined },
          rowsAffected: Number(result.changes),
          insertId: Number(result.lastInsertRowid),
        }];
      },
    };
  };

  return {
    __esModule: true,
    default: { DEBUG: () => {}, enablePromise: () => {}, openDatabase },
  };
});

const mockState: { db: any; failContactsPurge: boolean } = { db: null, failContactsPurge: false };

import { databaseService } from '../src/services/DatabaseService';

const FLAG = 'purge_preloaded_contacts_v1';
const PRELOADED = [
  { phone: '+34600000000', name: 'Contacto Seguro' },
  { phone: '+34700000000', name: 'Familia' },
  { phone: '+34800000000', name: 'Trabajo' },
];

const insertContact = (phone: string, name: string, source: string) =>
  mockState.db
    .prepare('INSERT INTO user_contacts (phone_number, contact_name, source) VALUES (?, ?, ?)')
    .run(phone, name, source);

const contacts = (): { phone_number: string; contact_name: string; source: string }[] =>
  mockState.db
    .prepare('SELECT phone_number, contact_name, source FROM user_contacts ORDER BY phone_number')
    .all();

const flagValue = () =>
  mockState.db.prepare('SELECT setting_value AS v FROM app_settings WHERE setting_key = ?').get(FLAG)?.v;

// An install upgraded from a build that still preloaded contacts: tables exist, flag does not
const setUpLegacyInstall = async () => {
  mockState.db = null;
  await databaseService.initialize();
  mockState.db.exec('DELETE FROM user_contacts');
  mockState.db.prepare('DELETE FROM app_settings WHERE setting_key = ?').run(FLAG);
};

describe('DatabaseService whitelist without preloaded test contacts', () => {
  beforeEach(() => {
    mockState.failContactsPurge = false;
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a fresh install starts with an empty whitelist', async () => {
    mockState.db = null;

    await databaseService.initialize();

    expect(contacts()).toEqual([]);
    expect(await databaseService.isInContacts('+34600000000')).toBe(false);
  });

  it('removes the three preloaded rows and keeps every other contact', async () => {
    await setUpLegacyInstall();
    PRELOADED.forEach(c => insertContact(c.phone, c.name, 'preloaded'));
    insertContact('+34633333333', 'Gonzalo', 'sync');
    insertContact('+34611111111', 'Taller', 'contacts');

    await databaseService.initialize();

    expect(contacts()).toEqual([
      { phone_number: '+34611111111', contact_name: 'Taller', source: 'contacts' },
      { phone_number: '+34633333333', contact_name: 'Gonzalo', source: 'sync' },
    ]);
    expect(flagValue()).toBe('done');
  });

  // phone_number is UNIQUE, so these rows replace the originals for the same numbers
  it('keeps rows that only partially match: same number with another name or another source', async () => {
    await setUpLegacyInstall();
    insertContact('+34600000000', 'Mi madre', 'preloaded');
    insertContact('+34700000000', 'Familia', 'contacts');
    insertContact('+34800000000', 'Trabajo', 'preloaded');

    await databaseService.initialize();

    expect(contacts()).toEqual([
      { phone_number: '+34600000000', contact_name: 'Mi madre', source: 'preloaded' },
      { phone_number: '+34700000000', contact_name: 'Familia', source: 'contacts' },
    ]);
  });

  it('does not run again once the flag is set', async () => {
    await setUpLegacyInstall();
    await databaseService.initialize();
    expect(flagValue()).toBe('done');
    insertContact('+34600000000', 'Contacto Seguro', 'preloaded');

    await databaseService.initialize();

    expect(contacts()).toEqual([
      { phone_number: '+34600000000', contact_name: 'Contacto Seguro', source: 'preloaded' },
    ]);
  });

  it('keeps initialize() working, leaves the flag unset and logs no phone numbers when the DELETE fails', async () => {
    await setUpLegacyInstall();
    PRELOADED.forEach(c => insertContact(c.phone, c.name, 'preloaded'));
    const logged: string[] = [];
    const capture = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
    jest.spyOn(console, 'log').mockImplementation(capture);
    jest.spyOn(console, 'error').mockImplementation(capture);
    mockState.failContactsPurge = true;

    await expect(databaseService.initialize()).resolves.toBeUndefined();

    expect(flagValue()).toBeUndefined();
    expect(contacts()).toHaveLength(3);
    expect(logged).toContain('Error purging preloaded test contacts: disk I/O error');
    // Only the migration's numbers: the spam preload (out of scope, W1b) logs its own
    PRELOADED.forEach(c => expect(logged.join('\n')).not.toContain(c.phone.slice(3)));
  });
});
