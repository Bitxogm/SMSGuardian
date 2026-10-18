// Three-state URL verdict (malicious | clean | unverified). Offline: fetch is routed per host
// and any unexpected request fails the test.
import type { URLThreatAnalyzer as Analyzer } from '../src/services/URLThreatAnalyzer';
import { REAL_SMS } from '../test-support/realSmsSamples';

type Keys = { virusTotal?: string; safeBrowsing?: string; phishTank?: string };
type Reply = { ok?: boolean; status?: number; body?: unknown } | Error;

const VT = 'www.virustotal.com';
const GSB = 'safebrowsing.googleapis.com';
const PT = 'checkurl.phishtank.com';

const hostOf = (url: string) => url.replace(/^https?:\/\//, '').split('/')[0];

let routes: Record<string, Reply> = {};
let fetchSpy: jest.Mock;

const loadAnalyzer = (keys: Keys): typeof Analyzer => {
  let analyzer: typeof Analyzer;
  jest.isolateModules(() => {
    jest.doMock('../env', () => ({ API_KEYS: { virusTotal: '', safeBrowsing: '', geminiApiKey: '', ...keys } }), { virtual: true });
    analyzer = require('../src/services/URLThreatAnalyzer').URLThreatAnalyzer;
  });
  return analyzer!;
};

const hostsCalled = () => fetchSpy.mock.calls.map(([url]) => hostOf(url));

const BOTH_KEYS: Keys = { virusTotal: 'vt-test', safeBrowsing: 'gsb-test' };
const VT_CLEAN: Reply = { body: { response_code: 1, positives: 0, total: 70 } };
const GSB_CLEAN: Reply = { body: {} };

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  routes = {};
  fetchSpy = jest.fn(async (url: string) => {
    const reply = routes[hostOf(url)];
    if (!reply) throw new Error(`Unexpected request to ${url}`);
    if (reply instanceof Error) throw reply;
    return { ok: reply.ok ?? true, status: reply.status ?? 200, json: async () => reply.body ?? {} };
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

// The analyzer swallows request errors as "error" status, so check the hosts explicitly
afterEach(() => {
  hostsCalled().forEach(host => expect(Object.keys(routes)).toContain(host));
  jest.restoreAllMocks();
});

describe('URLThreatAnalyzer verdict with reputation sources', () => {
  it('VirusTotal "not found" + Safe Browsing clean is unverified, not clean', async () => {
    routes = { [VT]: { body: { response_code: 0 } }, [GSB]: GSB_CLEAN };

    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL('https://new-domain.example/x');

    expect(result.verdict).toBe('unverified');
    expect(result.reason).toBe('VirusTotal no conoce esta URL');
    expect(result.respondedSources).toEqual(['Google Safe Browsing']);
  });

  it('Safe Browsing error response is not clean', async () => {
    routes = {
      [VT]: { ok: false, status: 403 },
      [GSB]: { ok: false, status: 400, body: { error: { code: 400, message: 'API key not valid' } } },
    };

    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL('https://new-domain.example/x');

    expect(result.verdict).toBe('unverified');
    expect(result.respondedSources).toEqual([]);
    expect(result.reason).toBe('ninguna fuente de reputación respondió');
  });

  it('a network exception is unverified', async () => {
    routes = { [VT]: new Error('Network request failed'), [GSB]: new Error('Network request failed') };

    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL('https://new-domain.example/x');

    expect(result.verdict).toBe('unverified');
    expect(result.respondedSources).toEqual([]);
  });

  it('clean only when sources answered, listing which ones', async () => {
    routes = { [VT]: VT_CLEAN, [GSB]: GSB_CLEAN };

    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL('https://new-domain.example/x');

    expect(result.verdict).toBe('clean');
    expect(result.isMalicious).toBe(false);
    expect(result.respondedSources).toEqual(['VirusTotal', 'Google Safe Browsing']);
  });

  it('a source flagging the URL makes it malicious', async () => {
    routes = { [VT]: { body: { response_code: 1, positives: 20, total: 70 } }, [GSB]: GSB_CLEAN };

    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL('https://new-domain.example/x');

    expect(result.verdict).toBe('malicious');
    expect(result.isMalicious).toBe(true);
  });

  it('a known shortener is unverified because it hides the destination, even if sources say clean', async () => {
    routes = { [VT]: VT_CLEAN, [GSB]: GSB_CLEAN };

    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL('https://bit.ly/abc123');

    expect(result.verdict).toBe('unverified');
    expect(result.reason).toBe('oculta el destino');
    expect(result.localRiskScore).toBe(50);
  });

  it('about.com is not taken for the t.co shortener', async () => {
    routes = { [VT]: VT_CLEAN, [GSB]: GSB_CLEAN };

    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL('https://about.com/page');

    expect(result.verdict).toBe('clean');
    expect(result.localRiskScore).toBe(0);
  });

  it('the DGT fixture link (ourl.jp) is unverified', async () => {
    routes = { [VT]: VT_CLEAN, [GSB]: GSB_CLEAN };
    const dgtUrl = REAL_SMS.dgt.body.split(' ').pop()!;

    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL(dgtUrl);

    expect(dgtUrl).toBe('ourl.jp/XXXXX');
    expect(result.verdict).toBe('unverified');
    expect(result.reason).toBe('oculta el destino');
  });
});

describe('URLThreatAnalyzer PhishTank', () => {
  it('is not called without its own key', async () => {
    routes = { [VT]: VT_CLEAN, [GSB]: GSB_CLEAN };

    await loadAnalyzer(BOTH_KEYS).analyzeURL('https://new-domain.example/x');

    expect(hostsCalled()).not.toContain(PT);
  });

  it('is called with app_key when configured', async () => {
    routes = { [PT]: { body: { results: { in_database: false } } } };

    const result = await loadAnalyzer({ phishTank: 'pt-test' }).analyzeURL('https://new-domain.example/x');

    expect(hostsCalled()).toEqual([PT]);
    expect(fetchSpy.mock.calls[0][1].body).toContain('app_key=pt-test');
    expect(result.verdict).toBe('clean');
    expect(result.respondedSources).toEqual(['PhishTank']);
  });
});

describe('URLThreatAnalyzer without reputation keys', () => {
  it('is unverified and makes no request', async () => {
    const result = await loadAnalyzer({}).analyzeURL('https://new-domain.example/x');

    expect(result.verdict).toBe('unverified');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('detects BBVA impersonation (the rule no longer needs a trailing space)', async () => {
    const result = await loadAnalyzer({}).analyzeURL('https://bbva-seguro.xyz/login');

    expect(result.verdict).toBe('malicious');
    expect(result.details).toContain('bbva');
  });
});

describe('URLThreatAnalyzer official domains', () => {
  it('an official domain or subdomain is clean from the local list, with no request', async () => {
    const analyzer = loadAnalyzer(BOTH_KEYS);

    const root = await analyzer.analyzeURL('https://google.com/search');
    const sub = await analyzer.analyzeURL('https://mail.google.com/x');

    [root, sub].forEach(result => {
      expect(result.verdict).toBe('clean');
      expect(result.respondedSources).toEqual(['lista local de dominios oficiales']);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('google.com.evil.xyz is not official', async () => {
    const result = await loadAnalyzer({}).analyzeURL('https://google.com.evil.xyz/login');

    expect(result.source).not.toBe('local_whitelist');
    expect(result.verdict).not.toBe('clean');
  });

  it('a Punycode host is never official, even under an official domain', async () => {
    const result = await loadAnalyzer({}).analyzeURL('https://xn--80ak6aa92e.google.com/x');

    expect(result.source).not.toBe('local_whitelist');
    expect(result.verdict).toBe('malicious');
  });
});

describe('URLThreatAnalyzer host normalisation', () => {
  it.each([
    ['https://bit.ly:443/x'],
    ['https://bit.ly./x'],
    ['https://BIT.LY/x'],
  ])('%s is a shortener', async url => {
    const result = await loadAnalyzer({}).analyzeURL(url);

    expect(result.verdict).toBe('unverified');
    expect(result.reason).toBe('oculta el destino');
  });

  it('a port does not hide a suspicious TLD', async () => {
    const result = await loadAnalyzer({}).analyzeURL('https://evil.tk:8080/x');

    expect(result.localRiskScore).toBe(40);
    expect(result.details).toContain('Suspicious TLD: .tk');
  });

  it('userinfo does not make a host official: google.com@evil.xyz is evil.xyz', async () => {
    const result = await loadAnalyzer({}).analyzeURL('https://google.com@evil.xyz/x');

    expect(result.source).not.toBe('local_whitelist');
    expect(result.verdict).not.toBe('clean');
  });

  it.each([
    ['https://google.com:443/x'],
    ['https://google.com./x'],
  ])('%s is still official, with no request', async url => {
    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL(url);

    expect(result.verdict).toBe('clean');
    expect(result.source).toBe('local_whitelist');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('URLThreatAnalyzer Google user-content hosts', () => {
  it.each([
    ['https://sites.google.com/view/x'],
    ['https://docs.google.com/forms/x'],
    ['https://drive.google.com/file/x'],
  ])('%s is not official and goes to the reputation sources', async url => {
    routes = { [VT]: VT_CLEAN, [GSB]: GSB_CLEAN };

    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL(url);

    expect(result.source).not.toBe('local_whitelist');
    expect(hostsCalled()).toEqual([VT, GSB]);
    expect(result.verdict).toBe('clean');
    expect(result.respondedSources).toEqual(['VirusTotal', 'Google Safe Browsing']);
    expect(result.localRiskScore).toBe(0);
  });

  it('mail.google.com is still official', async () => {
    const result = await loadAnalyzer(BOTH_KEYS).analyzeURL('https://mail.google.com/x');

    expect(result.source).toBe('local_whitelist');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
