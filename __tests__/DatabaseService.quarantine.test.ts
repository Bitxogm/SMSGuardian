// Real SQLite in memory (node:sqlite, Node >= 22.13) behind the react-native-sqlite-storage API
jest.mock('react-native-sqlite-storage', () => {
  const { DatabaseSync } = require('node:sqlite');

  // One database per test file, so a second initialize() sees the previous state
  const openDatabase = async () => {
    mockState.db = mockState.db ?? new DatabaseSync(':memory:');
    const db = mockState.db;
    return {
      executeSql: async (sql: string, params: unknown[] = []) => {
        if (mockState.failPurge && /DELETE FROM quarantined_sms WHERE user_action/i.test(sql)) {
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

const mockState: { db: any; failPurge: boolean } = { db: null, failPurge: false };

import { databaseService } from '../src/services/DatabaseService';

const quarantine = (phoneNumber: string) =>
  databaseService.quarantineSMS({
    phoneNumber,
    messageContent: `test from ${phoneNumber}`,
    reason: 'test',
    threatLevel: 'suspicious',
    timestamp: Date.now(),
    urls: [],
  });

const rowExists = (id: number): boolean =>
  mockState.db.prepare('SELECT COUNT(*) AS c FROM quarantined_sms WHERE id = ?').get(id).c > 0;

describe('DatabaseService quarantine', () => {
  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await databaseService.initialize();
  });

  beforeEach(() => {
    mockState.db.exec('DELETE FROM quarantined_sms');
  });

  it('getQuarantinedSMS hides rows already reviewed (approved / blocked_number)', async () => {
    await quarantine('+34611111111');
    await quarantine('+34622222222');
    await quarantine('+34633333333');

    const [a, b, c] = await databaseService.getQuarantinedSMS();
    await databaseService.markQuarantinedAsReviewed(a.id, 'approved');
    await databaseService.markQuarantinedAsReviewed(b.id, 'blocked_number');

    const listed = await databaseService.getQuarantinedSMS();
    expect(listed.map(m => m.id)).toEqual([c.id]);
    expect(rowExists(a.id)).toBe(true);
  });

  it('deleteQuarantinedSMS removes the row', async () => {
    await quarantine('+34644444444');
    const [msg] = await databaseService.getQuarantinedSMS();

    await databaseService.deleteQuarantinedSMS(msg.id);

    expect(rowExists(msg.id)).toBe(false);
    expect(await databaseService.getQuarantinedSMS()).toEqual([]);
  });

  it('deleteQuarantinedSMS throws when the database is not initialized', async () => {
    let fresh: typeof databaseService;
    jest.isolateModules(() => {
      fresh = require('../src/services/DatabaseService').databaseService;
    });
    await expect(fresh!.deleteQuarantinedSMS(1)).rejects.toThrow('Database not initialized');
  });
});

describe('DatabaseService one-time purge of deleted quarantine rows', () => {
  const FLAG = 'purge_deleted_quarantine_v1';

  const insertWithAction = (phoneNumber: string, userAction: string): number => {
    const result = mockState.db
      .prepare(`INSERT INTO quarantined_sms (phone_number, message_content, is_reviewed, user_action)
        VALUES (?, 'old message', 1, ?)`)
      .run(phoneNumber, userAction);
    return Number(result.lastInsertRowid);
  };

  // Simulates an install upgraded from before B1: tables exist, flag does not
  const resetToLegacyInstall = () => {
    mockState.db.exec('DELETE FROM quarantined_sms');
    mockState.db.prepare('DELETE FROM app_settings WHERE setting_key = ?').run(FLAG);
  };

  const flagValue = () =>
    mockState.db.prepare('SELECT setting_value AS v FROM app_settings WHERE setting_key = ?').get(FLAG)?.v;

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await databaseService.initialize();
  });

  beforeEach(() => {
    mockState.failPurge = false;
    resetToLegacyInstall();
  });

  it('removes rows marked deleted and keeps approved / blocked_number', async () => {
    const deleted = insertWithAction('+34611111111', 'deleted');
    const approved = insertWithAction('+34622222222', 'approved');
    const blocked = insertWithAction('+34633333333', 'blocked_number');

    await databaseService.initialize();

    expect(rowExists(deleted)).toBe(false);
    expect(rowExists(approved)).toBe(true);
    expect(rowExists(blocked)).toBe(true);
    expect(flagValue()).toBe('done');
  });

  it('does not purge again on a second initialize()', async () => {
    await databaseService.initialize();
    expect(flagValue()).toBe('done');
    const deletedAfterPurge = insertWithAction('+34644444444', 'deleted');

    await databaseService.initialize();

    expect(rowExists(deletedAfterPurge)).toBe(true);
  });

  it('keeps initialize() working and leaves the flag unset when the DELETE fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockState.failPurge = true;
    const deleted = insertWithAction('+34655555555', 'deleted');

    await expect(databaseService.initialize()).resolves.toBeUndefined();

    expect(flagValue()).toBeUndefined();
    expect(rowExists(deleted)).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith('Error purging deleted quarantine rows:', 'disk I/O error');
    errorSpy.mockRestore();
  });
});

describe('DatabaseService inbox writes without an open database', () => {
  const sms = { phoneNumber: 'Lowi', messageContent: 'Lowi: tu código de verificación es 4821', timestamp: 1760000000000 };

  const freshService = (): typeof databaseService => {
    let fresh: typeof databaseService;
    jest.isolateModules(() => {
      fresh = require('../src/services/DatabaseService').databaseService;
    });
    return fresh!;
  };

  it('addInboxSMS throws', async () => {
    await expect(freshService().addInboxSMS(sms)).rejects.toThrow('Database not initialized');
  });

  it('logInbox still resolves without throwing (background callers rely on it)', async () => {
    await expect(freshService().logInbox(sms)).resolves.toBeUndefined();
  });
});
