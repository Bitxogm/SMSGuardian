import { Alert, AlertButton } from 'react-native';
import { ensureGeminiConsent } from '../src/utils/geminiConsent';
import { databaseService } from '../src/services/DatabaseService';

jest.mock('../src/services/DatabaseService', () => ({
  databaseService: { getSetting: jest.fn(), setSetting: jest.fn() },
}));

const mockedDb = databaseService as jest.Mocked<typeof databaseService>;

describe('ensureGeminiConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDb.getSetting.mockResolvedValue('');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('"Permitir" still returns true when the setting cannot be saved, without throwing or logging data', async () => {
    mockedDb.setSetting.mockRejectedValue(new Error('Database not initialized'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
      buttons!.find(b => b.text === 'Permitir')!.onPress!();
    });

    await expect(ensureGeminiConsent()).resolves.toBe(true);

    expect(mockedDb.setSetting).toHaveBeenCalledWith('gemini_consent_v1', 'granted');
    expect(errorSpy).toHaveBeenCalledWith('Could not save Gemini consent');
  });
});
