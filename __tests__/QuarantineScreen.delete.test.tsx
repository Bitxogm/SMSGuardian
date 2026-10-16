import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { QuarantineScreen } from '../src/screens/QuarantineScreen';
import { QuarantineService } from '../src/services/QuarantineService';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/services/QuarantineService', () => ({
  QuarantineService: {
    getQuarantinedSMS: jest.fn(),
    deleteQuarantinedSMS: jest.fn(),
    markAsReviewed: jest.fn(),
  },
}));

jest.mock('../src/services/DatabaseService', () => ({ databaseService: {} }));
jest.mock('../src/services/URLThreatAnalyzer', () => ({ URLThreatAnalyzer: {} }));

const sms = {
  id: 7,
  phone_number: '+34600000000',
  message_content: 'Mensaje de prueba en cuarentena',
  quarantine_reason: 'Suspicious content',
  threat_level: 'suspicious',
  timestamp: Date.now(),
  contains_urls: false,
  analyzed_urls: [],
  is_reviewed: false,
  user_action: 'none',
};

const mocked = QuarantineService as jest.Mocked<typeof QuarantineService>;

const pressButtonWithText = (root: ReactTestRenderer.ReactTestInstance, label: string) => {
  const button = root
    .findAllByType(TouchableOpacity)
    .find(t => t.findAllByType(Text).some(x => x.props.children === label));
  if (!button) throw new Error(`Button "${label}" not found`);
  return act(async () => {
    await button.props.onPress();
  });
};

let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

const openDeletePreview = async () => {
  await act(async () => {
    renderer = ReactTestRenderer.create(<QuarantineScreen />);
  });
  const root = renderer!.root;
  const item = root
    .findAllByType(TouchableOpacity)
    .find(t => t.findAllByType(Text).some(x => x.props.children === sms.phone_number));
  await act(async () => {
    item!.props.onPress();
  });
  return root;
};

describe('QuarantineScreen delete action', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mocked.getQuarantinedSMS.mockResolvedValue([sms] as any);
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
  });

  it('deletes through deleteQuarantinedSMS and reports it was removed from SMSGuardian', async () => {
    mocked.deleteQuarantinedSMS.mockResolvedValue();
    const root = await openDeletePreview();

    await pressButtonWithText(root, 'Eliminar');

    expect(mocked.deleteQuarantinedSMS).toHaveBeenCalledWith(sms.id);
    expect(mocked.markAsReviewed).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('SMS eliminado', expect.stringContaining('SMSGuardian'));
  });

  it('shows an error and never the success alert when the DELETE fails', async () => {
    mocked.deleteQuarantinedSMS.mockRejectedValue(new Error('disk I/O error'));
    const root = await openDeletePreview();

    await pressButtonWithText(root, 'Eliminar');

    expect(alertSpy).toHaveBeenCalledWith('Error', 'No se pudo procesar la acción');
    expect(alertSpy).not.toHaveBeenCalledWith('SMS eliminado', expect.anything());
  });
});
