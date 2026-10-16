// Real SQLite in memory (node:sqlite, Node >= 22.13) behind the react-native-sqlite-storage API
jest.mock('react-native-sqlite-storage', () => {
  const { DatabaseSync } = require('node:sqlite');

  const openDatabase = async () => {
    const db = new DatabaseSync(':memory:');
    mockState.db = db;
    return {
      executeSql: async (sql: string, params: unknown[] = []) => {
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

const mockState: { db: any } = { db: null };

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
