// Real SQLite in memory (node:sqlite, Node >= 22.13) behind the react-native-sqlite-storage API.
// Setting mockState.db = null makes the next initialize() open a brand-new database.
jest.mock('react-native-sqlite-storage', () => {
  const { DatabaseSync } = require('node:sqlite');

  const openDatabase = async () => {
    mockState.db = mockState.db ?? new DatabaseSync(':memory:');
    const db = mockState.db;
    return {
      executeSql: async (sql: string, params: unknown[] = []) => {
        if (mockState.failSpamPurge && /DELETE FROM spam_numbers/i.test(sql)) {
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

const mockState: { db: any; failSpamPurge: boolean } = { db: null, failSpamPurge: false };

import { databaseService } from '../src/services/DatabaseService';

const FLAG = 'purge_preloaded_spam_v1';
const PRELOADED = [
  { phone: '+34666000001', type: 'phishing' },
  { phone: '+34900000002', type: 'commercial' },
  { phone: '+34911000003', type: 'scam' },
];

const insertSpam = (phone: string, type: string, source: string, isActive = 1): number =>
  Number(
    mockState.db
      .prepare('INSERT INTO spam_numbers (phone_number, spam_type, source, is_active) VALUES (?, ?, ?, ?)')
      .run(phone, type, source, isActive).lastInsertRowid
  );

const spamRows = (): { phone_number: string; spam_type: string; source: string; is_active: number }[] =>
  mockState.db
    .prepare('SELECT phone_number, spam_type, source, is_active FROM spam_numbers ORDER BY phone_number')
    .all();

const flagValue = () =>
  mockState.db.prepare('SELECT setting_value AS v FROM app_settings WHERE setting_key = ?').get(FLAG)?.v;

// An install upgraded from a build that still preloaded spam: tables exist, flag does not
const setUpLegacyInstall = async () => {
  mockState.db = null;
  await databaseService.initialize();
  mockState.db.exec('DELETE FROM spam_numbers');
  mockState.db.prepare('DELETE FROM app_settings WHERE setting_key = ?').run(FLAG);
};

describe('DatabaseService blacklist without preloaded spam numbers', () => {
  beforeEach(() => {
    mockState.failSpamPurge = false;
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a fresh install starts with an empty blacklist', async () => {
    mockState.db = null;

    await databaseService.initialize();

    expect(spamRows()).toEqual([]);
    expect(await databaseService.isSpamNumber('+34666000001')).toBeNull();
  });

  it('removes the three preloaded rows, active or not, and keeps the user ones', async () => {
    await setUpLegacyInstall();
    insertSpam(PRELOADED[0].phone, PRELOADED[0].type, 'preloaded');
    insertSpam(PRELOADED[1].phone, PRELOADED[1].type, 'preloaded', 0);
    insertSpam(PRELOADED[2].phone, PRELOADED[2].type, 'preloaded');
    insertSpam('+34611111111', 'scam', 'manual');
    insertSpam('+34633333333', 'phishing', 'quarantine');

    await databaseService.initialize();

    expect(spamRows()).toEqual([
      { phone_number: '+34611111111', spam_type: 'scam', source: 'manual', is_active: 1 },
      { phone_number: '+34633333333', spam_type: 'phishing', source: 'quarantine', is_active: 1 },
    ]);
    expect(flagValue()).toBe('done');
  });

  // phone_number is UNIQUE, so these rows replace the originals for the same numbers
  it('keeps rows that only partially match: same number with another type or another source', async () => {
    await setUpLegacyInstall();
    insertSpam('+34666000001', 'scam', 'preloaded');
    insertSpam('+34900000002', 'commercial', 'manual');
    insertSpam('+34911000003', 'scam', 'preloaded');

    await databaseService.initialize();

    expect(spamRows()).toEqual([
      { phone_number: '+34666000001', spam_type: 'scam', source: 'preloaded', is_active: 1 },
      { phone_number: '+34900000002', spam_type: 'commercial', source: 'manual', is_active: 1 },
    ]);
  });

  it('does not run again once the flag is set', async () => {
    await setUpLegacyInstall();
    await databaseService.initialize();
    expect(flagValue()).toBe('done');
    insertSpam(PRELOADED[0].phone, PRELOADED[0].type, 'preloaded');

    await databaseService.initialize();

    expect(spamRows()).toEqual([
      { phone_number: '+34666000001', spam_type: 'phishing', source: 'preloaded', is_active: 1 },
    ]);
  });

  it('keeps initialize() working, leaves the flag unset and logs no phone numbers when the DELETE fails', async () => {
    await setUpLegacyInstall();
    PRELOADED.forEach(s => insertSpam(s.phone, s.type, 'preloaded'));
    const logged: string[] = [];
    const capture = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
    jest.spyOn(console, 'log').mockImplementation(capture);
    jest.spyOn(console, 'error').mockImplementation(capture);
    mockState.failSpamPurge = true;

    await expect(databaseService.initialize()).resolves.toBeUndefined();

    expect(flagValue()).toBeUndefined();
    expect(spamRows()).toHaveLength(3);
    expect(logged).toContain('Error purging preloaded spam numbers: disk I/O error');
    PRELOADED.forEach(s => expect(logged.join('\n')).not.toContain(s.phone.slice(3)));
  });

  // Before W1b the per-initialize INSERT OR REPLACE turned this row back into an active 'preloaded' one
  it('a former sample number the user added and then removed stays removed after initialize()', async () => {
    mockState.db = null;
    await databaseService.initialize();
    await databaseService.addSpamNumber('+34666000001', 'scam', 'manual');
    const { id } = mockState.db.prepare('SELECT id FROM spam_numbers WHERE phone_number = ?').get('+34666000001');
    await databaseService.removeSpamNumber(id);

    await databaseService.initialize();

    expect(spamRows()).toEqual([
      { phone_number: '+34666000001', spam_type: 'scam', source: 'manual', is_active: 0 },
    ]);
    expect(await databaseService.isSpamNumber('+34666000001')).toBeNull();
  });
});
