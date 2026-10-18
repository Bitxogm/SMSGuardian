import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Alert, AlertButton, Text, TouchableOpacity } from 'react-native';
import { QuarantineScreen } from '../src/screens/QuarantineScreen';
import { QuarantineService } from '../src/services/QuarantineService';
import { URLThreatAnalyzer, URLThreatResult } from '../src/services/URLThreatAnalyzer';
import { databaseService } from '../src/services/DatabaseService';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../src/services/QuarantineService', () => ({
  QuarantineService: { getQuarantinedSMS: jest.fn() },
}));

jest.mock('../src/services/DatabaseService', () => ({
  databaseService: { getSetting: jest.fn(), setSetting: jest.fn() },
}));

jest.mock('../src/services/URLThreatAnalyzer', () => ({
  URLThreatAnalyzer: { analyzeURL: jest.fn(), configuredSources: jest.fn() },
}));

const URL = 'https://bit.ly/abc123';
const SENDER = '+34611111111';
const BODY = `Tu paquete está retenido: ${URL}`;

const record = {
  id: 1,
  phone_number: SENDER,
  message_content: BODY,
  quarantine_reason: 'Suspicious content',
  threat_level: 'suspicious',
  timestamp: Date.now(),
  contains_urls: true,
  analyzed_urls: [URL],
  is_reviewed: false,
  user_action: 'none',
};

const result = (overrides: Partial<URLThreatResult>): URLThreatResult => ({
  url: URL,
  verdict: 'unverified',
  respondedSources: [],
  localRiskScore: 0,
  isMalicious: false,
  confidence: 0,
  source: 'unverified',
  details: 'URL shortener: bit.ly (Score: 50)',
  ...overrides,
});

const UNVERIFIED = result({ reason: 'oculta el destino', localRiskScore: 50 });
const CLEAN = result({
  verdict: 'clean',
  respondedSources: ['VirusTotal', 'Google Safe Browsing'],
  source: 'VirusTotal, Google Safe Browsing',
  details: '0/70 engines flagged as malicious (0.0%)',
});
const OFFICIAL = result({ verdict: 'clean', respondedSources: ['lista local de dominios oficiales'], source: 'local_whitelist' });

const mockedQuarantine = QuarantineService as jest.Mocked<typeof QuarantineService>;
const mockedAnalyzer = URLThreatAnalyzer as jest.Mocked<typeof URLThreatAnalyzer>;
const mockedDb = databaseService as jest.Mocked<typeof databaseService>;

let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
let alertSpy: jest.SpyInstance;

const flush = () => act(async () => {});

const findButton = (label: string) =>
  renderer!.root
    .findAllByType(TouchableOpacity)
    .find(t => t.findAllByType(Text).some(x => x.props.children === label));

const press = async (label: string) => {
  const button = findButton(label);
  if (!button) throw new Error(`Button "${label}" not found`);
  await act(async () => {
    await button.props.onPress();
  });
};

const alertCall = (title: string) => {
  const call = alertSpy.mock.calls.find(([t]) => t === title);
  if (!call) throw new Error(`Alert "${title}" was not shown`);
  return { message: call[1] as string, buttons: (call[2] ?? []) as AlertButton[] };
};

const pressAlertButton = async (title: string, label: string) => {
  const button = alertCall(title).buttons.find(b => b.text === label);
  if (!button?.onPress) throw new Error(`Alert "${title}" has no button "${label}"`);
  await act(async () => {
    button.onPress!();
  });
  await flush();
};

const openPreviewAndScan = async (scanResult: URLThreatResult) => {
  mockedAnalyzer.analyzeURL.mockResolvedValue(scanResult);
  await act(async () => {
    renderer = ReactTestRenderer.create(<QuarantineScreen />);
  });
  await press(SENDER);
  await press('🔍 Escanear');
};

const renderedText = (): string[] =>
  renderer!.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedQuarantine.getQuarantinedSMS.mockResolvedValue([record] as any);
  mockedDb.getSetting.mockResolvedValue('');
  mockedDb.setSetting.mockResolvedValue();
  mockedAnalyzer.configuredSources.mockReturnValue(['VirusTotal', 'Google Safe Browsing']);
});

afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
  renderer = null;
});

describe('QuarantineScreen scan verdicts', () => {
  it('unverified shows the exact warning, its reason and the Gemini button', async () => {
    await openPreviewAndScan(UNVERIFIED);

    const { message, buttons } = alertCall('❔ Sin verificar');
    expect(message).toBe('⚠️ No se pudo verificar este enlace. No lo abras si no esperabas el mensaje.\nMotivo: oculta el destino.');
    expect(buttons.map(b => b.text)).toEqual(['OK', 'Analizar con Gemini']);
    expect(renderedText()).toContain('❔ SIN VERIFICAR');
  });

  it('clean lists the sources that answered', async () => {
    await openPreviewAndScan(CLEAN);

    expect(alertCall('✅ Sin amenazas conocidas').message)
      .toBe('Sin amenazas conocidas en VirusTotal, Google Safe Browsing. Esto no garantiza que sea seguro.');
    expect(renderedText()).toContain('✅ SIN AMENAZAS CONOCIDAS');
  });

  it('an official domain says it was recognised from the local list', async () => {
    await openPreviewAndScan(OFFICIAL);

    expect(alertCall('✅ Sin amenazas conocidas').message).toBe('Dominio oficial reconocido (lista local).');
  });

  it.each([
    ['unverified', UNVERIFIED],
    ['clean', CLEAN],
  ])('shows no percentage and no "(según heurística local)" for %s', async (_name, scanResult) => {
    await openPreviewAndScan(scanResult);

    const shown = [...renderedText(), ...alertSpy.mock.calls.map(([title, message]) => `${title} ${message ?? ''}`)];
    shown.forEach(text => {
      expect(text).not.toContain('%');
      expect(text).not.toContain('según heurística local');
    });
  });

  it('the analysis prompt lists only the configured sources', async () => {
    mockedAnalyzer.configuredSources.mockReturnValue(['VirusTotal']);
    await act(async () => {
      renderer = ReactTestRenderer.create(<QuarantineScreen />);
    });
    await press(SENDER);

    // The URL row renders "🔗 " and the URL as separate children of one Text
    const urlRow = renderer!.root
      .findAllByType(TouchableOpacity)
      .find(t => t.findAllByType(Text).some(x => [x.props.children].flat().includes(URL)));
    await act(async () => {
      urlRow!.props.onPress();
    });

    const { message } = alertCall('Análisis de Seguridad');
    expect(message).toContain('Se consultarán VirusTotal.');
    expect(message).not.toContain('PhishTank');
    expect(message).not.toContain('Google Safe Browsing');
  });
});

describe('QuarantineScreen Gemini consent', () => {
  it('asks the first time; "Permitir" stores the setting and opens the chat', async () => {
    await openPreviewAndScan(UNVERIFIED);

    await pressAlertButton('❔ Sin verificar', 'Analizar con Gemini');
    const consent = alertCall('Analizar con Gemini');
    expect(consent.message).toBe('Se enviará el texto del SMS y el remitente a Google Gemini para analizarlo. ¿Permitir?');
    expect(mockNavigate).not.toHaveBeenCalled();

    await pressAlertButton('Analizar con Gemini', 'Permitir');

    expect(mockedDb.setSetting).toHaveBeenCalledWith('gemini_consent_v1', 'granted');
    expect(mockNavigate).toHaveBeenCalledWith('AnalysisChat', { phoneNumber: SENDER, messageBody: BODY });
  });

  it('does not ask again once granted', async () => {
    mockedDb.getSetting.mockResolvedValue('granted');
    await openPreviewAndScan(UNVERIFIED);

    await pressAlertButton('❔ Sin verificar', 'Analizar con Gemini');

    expect(alertSpy.mock.calls.some(([title]) => title === 'Analizar con Gemini')).toBe(false);
    expect(mockNavigate).toHaveBeenCalledWith('AnalysisChat', { phoneNumber: SENDER, messageBody: BODY });
  });

  it('"Cancelar" neither opens the chat nor stores anything', async () => {
    await openPreviewAndScan(UNVERIFIED);

    await pressAlertButton('❔ Sin verificar', 'Analizar con Gemini');
    await pressAlertButton('Analizar con Gemini', 'Cancelar');

    expect(mockedDb.setSetting).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('the existing "🧠 Analizar con Gemini AI" button also asks for consent', async () => {
    await act(async () => {
      renderer = ReactTestRenderer.create(<QuarantineScreen />);
    });
    await press(SENDER);

    await press('🧠 Analizar con Gemini AI');

    expect(alertCall('Analizar con Gemini').message)
      .toBe('Se enviará el texto del SMS y el remitente a Google Gemini para analizarlo. ¿Permitir?');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
