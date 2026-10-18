// URL contribution to the SMS score with the real URLThreatAnalyzer. Offline: fetch is routed per host.
import type { SMSAnalysisService as Engine } from '../src/services/SMSAnalysisService';

jest.mock('../src/services/DatabaseService', () => ({
  databaseService: { isSpamNumber: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../src/services/ContactsService', () => ({
  ContactsService: { isInContacts: jest.fn().mockResolvedValue(false) },
}));

const hostOf = (url: string) => url.replace(/^https?:\/\//, '').split('/')[0];

let routes: Record<string, unknown> = {};
let fetchSpy: jest.Mock;

const loadEngine = (keys: { virusTotal?: string; safeBrowsing?: string } = {}) => {
  let engine: typeof Engine;
  jest.isolateModules(() => {
    jest.doMock('../env', () => ({ API_KEYS: { virusTotal: '', safeBrowsing: '', geminiApiKey: '', ...keys } }), { virtual: true });
    engine = require('../src/services/SMSAnalysisService').SMSAnalysisService;
  });
  // analyzeURLs is private: this suite pins its scoring contract
  return (urls: string[]): Promise<number> => (engine! as any).analyzeURLs(urls);
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  routes = {};
  fetchSpy = jest.fn(async (url: string) => {
    const body = routes[hostOf(url)];
    if (body === undefined) throw new Error(`Unexpected request to ${url}`);
    return { ok: true, status: 200, json: async () => body };
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SMSAnalysisService URL score', () => {
  it('an official domain adds 0 points (it used to add up to 15 as "clean")', async () => {
    expect(await loadEngine()(['https://google.com/x'])).toBe(0);
  });

  it('an unverified URL with no local risk adds 0 points', async () => {
    expect(await loadEngine()(['https://new-domain.example/x'])).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a URL that sources answered as clean adds 0 points even with local risk signals', async () => {
    routes = {
      'www.virustotal.com': { response_code: 1, positives: 0, total: 70 },
      'safebrowsing.googleapis.com': {},
    };

    expect(await loadEngine({ virusTotal: 'vt-test', safeBrowsing: 'gsb-test' })(['https://promo.click/x'])).toBe(0);
  });

  it('a shortener keeps its 80 URL points (30 shortener + 50 local risk), as before the three-state verdict', async () => {
    expect(await loadEngine()(['https://bit.ly/abc123'])).toBe(80);
  });
});
