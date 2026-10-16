import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert, DeviceEventEmitter, Text, TouchableOpacity } from 'react-native';
import { QuarantineScreen } from '../src/screens/QuarantineScreen';
import { databaseService } from '../src/services/DatabaseService';

// Real SQLite in memory (node:sqlite, Node >= 22.13) behind the react-native-sqlite-storage API
jest.mock('react-native-sqlite-storage', () => {
  const { DatabaseSync } = require('node:sqlite');

  const openDatabase = async () => {
    mockState.db = mockState.db ?? new DatabaseSync(':memory:');
    const db = mockState.db;
    return {
      executeSql: async (sql: string, params: unknown[] = []) => {
        if (mockState.failInboxInsert && /INSERT INTO inbox/i.test(sql)) {
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

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/services/URLThreatAnalyzer', () => ({ URLThreatAnalyzer: {} }));

const mockState: { db: any; failInboxInsert: boolean } = { db: null, failInboxInsert: false };

const SENDER = 'Lowi';
const BODY = 'Lowi: tu código de verificación es 4821';
const ORIGINAL_TIMESTAMP = 1760000000000;

const inboxRows = () =>
  mockState.db.prepare('SELECT phone_number, message_content, timestamp FROM inbox').all();

const quarantineRow = () =>
  mockState.db.prepare('SELECT is_reviewed, user_action FROM quarantined_sms').get();

describe('QuarantineScreen review actions and the Inbox', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  let alertSpy: jest.SpyInstance;

  const pressReviewAction = async (label: string) => {
    await act(async () => {
      renderer = ReactTestRenderer.create(<QuarantineScreen />);
    });
    const root = renderer!.root;
    const findButton = (text: string) =>
      root.findAllByType(TouchableOpacity).find(t => t.findAllByType(Text).some(x => x.props.children === text));

    await act(async () => {
      findButton(SENDER)!.props.onPress();
    });
    await act(async () => {
      await findButton(label)!.props.onPress();
    });
  };

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await databaseService.initialize();
  });

  beforeEach(async () => {
    mockState.failInboxInsert = false;
    mockState.db.exec('DELETE FROM quarantined_sms; DELETE FROM inbox;');
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await databaseService.quarantineSMS({
      phoneNumber: SENDER,
      messageContent: BODY,
      reason: 'Suspicious content',
      threatLevel: 'suspicious',
      timestamp: ORIGINAL_TIMESTAMP,
      urls: [],
    });
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
    alertSpy.mockRestore();
  });

  it('"Es Seguro" restores the SMS to Inbox with its original timestamp', async () => {
    await pressReviewAction('Es Seguro');

    expect(inboxRows()).toEqual([{ phone_number: SENDER, message_content: BODY, timestamp: ORIGINAL_TIMESTAMP }]);
    expect(await databaseService.getQuarantinedSMS()).toEqual([]);
    expect(quarantineRow()).toEqual({ is_reviewed: 1, user_action: 'approved' });
  });

  it('keeps the SMS in quarantine and shows an error when the Inbox insert fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockState.failInboxInsert = true;

    await pressReviewAction('Es Seguro');

    expect(quarantineRow()).toEqual({ is_reviewed: 0, user_action: 'none' });
    expect(inboxRows()).toEqual([]);
    expect(alertSpy).toHaveBeenCalledWith('Error', 'No se pudo procesar la acción');
    expect(alertSpy).not.toHaveBeenCalledWith('SMS aprobado', expect.anything());
  });

  it.each([
    ['Eliminar'],
    ['Bloquear N°'],
  ])('"%s" does not write to Inbox', async label => {
    await pressReviewAction(label);

    expect(inboxRows()).toEqual([]);
  });
});

describe('QuarantineScreen STATS_UPDATED after review actions', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  let emitSpy: jest.SpyInstance;

  const statsUpdatedCount = () => emitSpy.mock.calls.filter(([event]) => event === 'STATS_UPDATED').length;

  const pressReviewAction = async (label: string) => {
    await act(async () => {
      renderer = ReactTestRenderer.create(<QuarantineScreen />);
    });
    const root = renderer!.root;
    const findButton = (text: string) =>
      root.findAllByType(TouchableOpacity).find(t => t.findAllByType(Text).some(x => x.props.children === text));

    await act(async () => {
      findButton(SENDER)!.props.onPress();
    });
    await act(async () => {
      await findButton(label)!.props.onPress();
    });
  };

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    await databaseService.initialize();
  });

  beforeEach(async () => {
    mockState.failInboxInsert = false;
    mockState.db.exec('DELETE FROM quarantined_sms; DELETE FROM inbox;');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    emitSpy = jest.spyOn(DeviceEventEmitter, 'emit');
    await databaseService.quarantineSMS({
      phoneNumber: SENDER,
      messageContent: BODY,
      reason: 'Suspicious content',
      threatLevel: 'suspicious',
      timestamp: ORIGINAL_TIMESTAMP,
      urls: [],
    });
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
    emitSpy.mockRestore();
  });

  it('emits STATS_UPDATED once after a successful approval', async () => {
    await pressReviewAction('Es Seguro');

    expect(statsUpdatedCount()).toBe(1);
  });

  it('does not emit STATS_UPDATED when the Inbox insert fails', async () => {
    mockState.failInboxInsert = true;

    await pressReviewAction('Es Seguro');

    expect(statsUpdatedCount()).toBe(0);
  });

  it.each([
    ['Eliminar'],
    ['Bloquear N°'],
  ])('"%s" does not emit STATS_UPDATED', async label => {
    await pressReviewAction(label);

    expect(statsUpdatedCount()).toBe(0);
  });
});
