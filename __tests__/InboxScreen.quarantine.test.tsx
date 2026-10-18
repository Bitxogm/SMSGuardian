import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { InboxScreen } from '../src/screens/InboxScreen';
import { databaseService } from '../src/services/DatabaseService';
import { REAL_SMS, TINDER_URL } from '../test-support/realSmsSamples';

// Real SQLite in memory (node:sqlite, Node >= 22.13) behind the react-native-sqlite-storage API
jest.mock('react-native-sqlite-storage', () => {
  const { DatabaseSync } = require('node:sqlite');

  const openDatabase = async () => {
    mockState.db = mockState.db ?? new DatabaseSync(':memory:');
    const db = mockState.db;
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

jest.mock('../src/services/URLThreatAnalyzer', () => ({ URLThreatAnalyzer: {} }));

const mockState: { db: any } = { db: null };

const TINDER_SENDER = REAL_SMS.tinder.sender;
const TINDER_BODY = REAL_SMS.tinder.body;

describe('InboxScreen manual quarantine', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await databaseService.initialize();
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
  });

  it('stores the URLs of the Tinder SMS when moved to quarantine', async () => {
    mockState.db.exec('DELETE FROM quarantined_sms; DELETE FROM inbox;');
    await databaseService.logInbox({ phoneNumber: TINDER_SENDER, messageContent: TINDER_BODY, timestamp: Date.now() });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await act(async () => {
      renderer = ReactTestRenderer.create(<InboxScreen />);
    });

    const moveButton = renderer!.root
      .findAllByType(TouchableOpacity)
      .find(t => t.findAllByType(Text).some(x => x.props.children === '⚠️ Mover a Cuarentena'));
    await act(async () => {
      moveButton!.props.onPress();
    });

    const confirmButtons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => {
      await confirmButtons.find(b => b.text === 'Mover')!.onPress!();
    });

    const row = mockState.db
      .prepare('SELECT quarantine_reason, contains_urls, analyzed_urls FROM quarantined_sms')
      .get();
    expect(row.quarantine_reason).toBe('Manual Quarantine');
    expect(row.contains_urls).toBe(1);
    expect(JSON.parse(row.analyzed_urls)).toEqual([TINDER_URL]);
    alertSpy.mockRestore();
  });
});
