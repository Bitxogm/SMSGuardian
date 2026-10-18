import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { QuarantineScreen } from '../src/screens/QuarantineScreen';
import { QuarantineService } from '../src/services/QuarantineService';
import { URLThreatAnalyzer } from '../src/services/URLThreatAnalyzer';
import { REAL_SMS, TINDER_URL } from '../test-support/realSmsSamples';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/services/QuarantineService', () => ({
  QuarantineService: { getQuarantinedSMS: jest.fn() },
}));

jest.mock('../src/services/DatabaseService', () => ({ databaseService: {} }));
jest.mock('../src/services/URLThreatAnalyzer', () => ({
  URLThreatAnalyzer: { analyzeURL: jest.fn() },
}));

const legacyRecord = (message_content: string) => ({
  id: 1,
  phone_number: 'Tinder',
  message_content,
  quarantine_reason: 'Manual Quarantine',
  threat_level: 'suspicious',
  timestamp: Date.now(),
  contains_urls: false,
  analyzed_urls: [] as string[],
  is_reviewed: false,
  user_action: 'none',
});

const mockedQuarantine = QuarantineService as jest.Mocked<typeof QuarantineService>;
const mockedAnalyzer = URLThreatAnalyzer as jest.Mocked<typeof URLThreatAnalyzer>;

const findButton = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  root
    .findAllByType(TouchableOpacity)
    .find(t => t.findAllByType(Text).some(x => x.props.children === label));

// The URL row renders as <Text>🔗 {url}</Text>, i.e. children ['🔗 ', url]
const modalShowsURL = (root: ReactTestRenderer.ReactTestInstance, url: string) =>
  root.findAllByType(Text).some(t => Array.isArray(t.props.children) && t.props.children.includes(url));

describe('QuarantineScreen URL fallback for records saved without analyzed_urls', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  let alertSpy: jest.SpyInstance;

  const openPreview = async (record: ReturnType<typeof legacyRecord>) => {
    mockedQuarantine.getQuarantinedSMS.mockResolvedValue([record] as any);
    await act(async () => {
      renderer = ReactTestRenderer.create(<QuarantineScreen />);
    });
    const root = renderer!.root;
    const item = root
      .findAllByType(TouchableOpacity)
      .find(t => t.findAllByType(Text).some(x => x.props.children === record.phone_number));
    await act(async () => {
      item!.props.onPress();
    });
    return root;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedAnalyzer.analyzeURL.mockResolvedValue({
      url: TINDER_URL, isMalicious: false, confidence: 0, source: 'local_analysis', details: '',
    });
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
  });

  it('shows the Tinder URL in the modal and scans it only when "Escanear" is pressed', async () => {
    const root = await openPreview(legacyRecord(REAL_SMS.tinder.body));

    expect(modalShowsURL(root, TINDER_URL)).toBe(true);
    expect(mockedAnalyzer.analyzeURL).not.toHaveBeenCalled();

    await act(async () => {
      await findButton(root, '🔍 Escanear')!.props.onPress();
    });

    expect(mockedAnalyzer.analyzeURL).toHaveBeenCalledWith(TINDER_URL);
    expect(alertSpy).not.toHaveBeenCalledWith('Nada que escanear', expect.anything());
  });

  it('still reports "no contiene URLs" for an SMS without links', async () => {
    const root = await openPreview(legacyRecord('Hola, te llamo luego'));

    await act(async () => {
      await findButton(root, '🔍 Escanear')!.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith('Nada que escanear', 'Este mensaje no contiene URLs detectadas.');
    expect(mockedAnalyzer.analyzeURL).not.toHaveBeenCalled();
  });
});
