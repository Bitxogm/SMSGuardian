// Real engine (SMSAnalysisService + URLThreatAnalyzer + PhoneNumberReputationService)
// on anonymised real SMS. Offline and deterministic: no API keys, fetch is a spy and
// every case asserts it was never called.
import { SMSAnalysisService } from '../src/services/SMSAnalysisService';
import { ContactsService } from '../src/services/ContactsService';
import { REAL_SMS, CONTACT_SENDER, UNKNOWN_SENDER, RealSmsSample } from '../test-support/realSmsSamples';

jest.mock('../env', () => ({ API_KEYS: { virusTotal: '', safeBrowsing: '', geminiApiKey: '' } }), { virtual: true });

jest.mock('../src/services/DatabaseService', () => ({
  databaseService: { isSpamNumber: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../src/services/ContactsService', () => ({
  ContactsService: { isInContacts: jest.fn() },
}));

type Destination = 'inbox' | 'quarantine' | 'blocked';

// Mirrors SMSAnalysisService.logAnalysis and BackgroundSmsHandler routing
const destinationOf = (result: Awaited<ReturnType<typeof SMSAnalysisService.analyzeSMS>>): Destination => {
  if (result.shouldBlock) return 'blocked';
  if (result.shouldQuarantine) return 'quarantine';
  return 'inbox';
};

const mockedContacts = ContactsService as jest.Mocked<typeof ContactsService>;
let fetchSpy: jest.Mock;

const analyze = async (sample: RealSmsSample, { sender = sample.sender, isContact = false } = {}) => {
  mockedContacts.isInContacts.mockResolvedValue(isContact);
  const result = await SMSAnalysisService.analyzeSMS(sender, sample.body);
  return { result, destination: destinationOf(result) };
};

describe('SMSAnalysisService on real SMS samples', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    fetchSpy = jest.fn(() => Promise.reject(new Error('Network access is not allowed in this suite')));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tinder from its sender name goes to the inbox', async () => {
    const { result, destination } = await analyze(REAL_SMS.tinder);

    expect(destination).toBe('inbox');
    expect(result.threatLevel).toBe('safe');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('dgt from an unknown mobile is blocked', async () => {
    const { result, destination } = await analyze(REAL_SMS.dgt, { sender: UNKNOWN_SENDER });

    expect(destination).toBe('blocked');
    expect(result.threatLevel).toBe('malicious');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Desired behaviour, not implemented yet: today a contact sender returns "Contact whitelist"
  // with score 0 before any content or URL analysis (SMSAnalysisService.ts:20-31).
  // Remove .failing once the whitelist only offsets sender reputation and caps contacts at quarantine.
  it.failing('dgt from a contact goes to quarantine, not to the inbox', async () => {
    const { destination } = await analyze(REAL_SMS.dgt, { sender: CONTACT_SENDER, isContact: true });

    expect(destination).toBe('quarantine');
  });

  // Desired behaviour, not implemented yet: today it scores exactly 70 -> quarantine
  // ("verifica" +20 and "codigo" x2 +40 in AppConfig SUSPICIOUS_PATTERNS, +10 for a short sender).
  // Remove .failing once OTP messages without URLs from short/alphanumeric senders stay below quarantine.
  it.failing('kraken verification code goes to the inbox', async () => {
    const { destination } = await analyze(REAL_SMS.kraken);

    expect(destination).toBe('inbox');
  });

  it('never calls the network for any sample, contact or not', async () => {
    await analyze(REAL_SMS.tinder);
    await analyze(REAL_SMS.dgt, { sender: UNKNOWN_SENDER });
    await analyze(REAL_SMS.dgt, { sender: CONTACT_SENDER, isContact: true });
    await analyze(REAL_SMS.kraken);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
