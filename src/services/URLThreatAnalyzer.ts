import { API_KEYS } from "../../env";
import { WHITELISTED_DOMAINS } from "../config/AppConfig";
import { extractDomain, hasUnicodeHomoglyph, hasPunycode, hostMatches, isShortenerHost } from "../utils/urlUtils";

// malicious: heuristics or a reputation source flag it.
// clean: at least one reputation source answered and found nothing (or official local list).
// unverified: no source answered properly, VirusTotal does not know the URL, or a shortener hides the destination.
export type URLVerdict = 'malicious' | 'clean' | 'unverified';

export interface URLThreatResult {
  url: string;
  verdict: URLVerdict;
  // Sources that answered with a verdict (threat or clean). Never includes sources that failed.
  respondedSources: string[];
  reason?: string;
  // Local heuristic risk points (shortener included), used by the SMS score when not malicious
  localRiskScore: number;
  isMalicious: boolean;
  // Only meaningful for malicious results; the UI must not show it as a percentage
  confidence: number;
  source: string;
  details: string;
}

type SourceStatus = 'threat' | 'clean' | 'unknown' | 'error';

interface SourceCheck {
  label: string;
  status: SourceStatus;
  confidence: number;
  details: string;
}

interface LocalAnalysis {
  official: boolean;
  officialDetails: string;
  isShortener: boolean;
  riskScore: number;
  heuristicMalicious: boolean;
  details: string;
}

const OFFICIAL_SOURCE = 'lista local de dominios oficiales';
const SHORTENER_POINTS = 50;

export class URLThreatAnalyzer {
  private static readonly API_KEYS = {
    virusTotal: API_KEYS.virusTotal,
    safeBrowsing: API_KEYS.safeBrowsing,
    // Optional: env.ts may not define it; PhishTank is only queried with a key of its own
    phishTank: (API_KEYS as { phishTank?: string }).phishTank ?? '',
  };

  static async analyzeURL(url: string): Promise<URLThreatResult> {
    try {
      console.log(`🔍 Analyzing URL: ${url}`);

      // 1. ANÁLISIS LOCAL (Rápido)
      const local = this.quickLocalAnalysis(url);

      // Dominio oficial (whitelist): limpio sin llamar a la red
      if (local.official) {
        console.log(`✅ Official domain detected (${url}). Skipping online scan.`);
        return {
          url,
          verdict: 'clean',
          respondedSources: [OFFICIAL_SOURCE],
          localRiskScore: 0,
          isMalicious: false,
          confidence: 0,
          source: 'local_whitelist',
          details: local.officialDetails,
        };
      }

      // 2. ANÁLISIS ONLINE (solo con claves)
      const checks: SourceCheck[] = [];
      if (this.hasAPIKeys()) {
        console.log(`🌐 Initiating Deep Online Analysis...`);
        const settled = await Promise.allSettled([
          this.queryVirusTotal(url),
          this.queryGoogleSafeBrowsing(url),
          this.queryPhishTank(url),
        ]);
        settled.forEach(result => {
          if (result.status === 'fulfilled' && result.value) checks.push(result.value);
        });
      } else {
        console.log(`⚠️ No API keys found. Relying on local heuristics only.`);
      }

      const verdict = this.combineResults(url, local, checks);
      console.log(`📊 Final Analysis: ${verdict.verdict.toUpperCase()} (${verdict.reason ?? verdict.respondedSources.join(', ')})`);
      return verdict;

    } catch (error) {
      console.error('URL analysis error:', error);
      return {
        url,
        verdict: 'unverified',
        respondedSources: [],
        reason: 'error en el análisis',
        localRiskScore: 0,
        isMalicious: false,
        confidence: 0,
        source: 'error',
        details: 'Analysis failed'
      };
    }
  }

  private static hasAPIKeys(): boolean {
    return !!(this.API_KEYS.virusTotal || this.API_KEYS.safeBrowsing || this.API_KEYS.phishTank);
  }

  private static async queryVirusTotal(url: string): Promise<SourceCheck | null> {
    if (!this.API_KEYS.virusTotal) return null;

    const label = 'VirusTotal';
    try {
      console.log(`🦠 Querying VirusTotal...`);
      const response = await fetch(
        `https://www.virustotal.com/vtapi/v2/url/report?apikey=${this.API_KEYS.virusTotal}&resource=${encodeURIComponent(url)}`
      );

      if (!response.ok) {
        console.log(`VirusTotal API error: ${response.status}`);
        return { label, status: 'error', confidence: 0, details: `HTTP ${response.status}` };
      }

      const data = await response.json();

      if (data.response_code === 1) {
        const maliciousCount = data.positives || 0;
        const totalScans = data.total || 1;
        const maliciousPercent = (maliciousCount / totalScans) * 100;
        const isThreat = maliciousPercent > 8;
        const details = `${maliciousCount}/${totalScans} engines flagged as malicious (${maliciousPercent.toFixed(1)}%)`;

        console.log(`🦠 VirusTotal: ${isThreat ? 'THREAT' : 'CLEAN'} - ${details}`);
        return { label, status: isThreat ? 'threat' : 'clean', confidence: Math.min(maliciousPercent * 4, 100), details };
      }

      // Not in the database is not the same as clean
      console.log(`🦠 VirusTotal: URL not found in database`);
      return { label, status: 'unknown', confidence: 0, details: 'URL not found in VirusTotal database' };
    } catch (error) {
      console.log('VirusTotal API error:', error);
      return { label, status: 'error', confidence: 0, details: 'Request failed' };
    }
  }

  private static async queryGoogleSafeBrowsing(url: string): Promise<SourceCheck | null> {
    if (!this.API_KEYS.safeBrowsing) return null;

    const label = 'Google Safe Browsing';
    try {
      console.log(`🛡️ Querying Google Safe Browsing...`);
      const response = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${this.API_KEYS.safeBrowsing}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client: { clientId: "sms-guardian", clientVersion: "1.0.0" },
            threatInfo: {
              threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
              platformTypes: ["ANY_PLATFORM"],
              threatEntryTypes: ["URL"],
              threatEntries: [{ url }]
            }
          })
        }
      );

      // An error response (bad key, quota) has no "matches" either: it must not read as clean
      if (!response.ok) {
        console.log(`Google Safe Browsing API error: ${response.status}`);
        return { label, status: 'error', confidence: 0, details: `HTTP ${response.status}` };
      }

      const data = await response.json();
      const isThreat = !!(data.matches && data.matches.length > 0);
      const details = isThreat ? `Threat type: ${data.matches[0].threatType}` : 'Clean according to Google Safe Browsing';

      console.log(`🛡️ Safe Browsing: ${isThreat ? 'THREAT' : 'CLEAN'} - ${details}`);
      return { label, status: isThreat ? 'threat' : 'clean', confidence: isThreat ? 95 : 0, details };
    } catch (error) {
      console.log('Google Safe Browsing API error:', error);
      return { label, status: 'error', confidence: 0, details: 'Request failed' };
    }
  }

  private static async queryPhishTank(url: string): Promise<SourceCheck | null> {
    if (!this.API_KEYS.phishTank) return null;

    const label = 'PhishTank';
    try {
      console.log(`🎣 Querying PhishTank...`);
      const response = await fetch('https://checkurl.phishtank.com/checkurl/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `url=${encodeURIComponent(url)}&format=json&app_key=${encodeURIComponent(this.API_KEYS.phishTank)}`
      });

      if (!response.ok) {
        console.log(`PhishTank API error: ${response.status}`);
        return { label, status: 'error', confidence: 0, details: `HTTP ${response.status}` };
      }

      const data = await response.json();
      if (!data.results) {
        return { label, status: 'error', confidence: 0, details: 'Unexpected response' };
      }

      const isThreat = !!data.results.in_database;
      const details = isThreat ? 'Found in PhishTank phishing database' : 'Not found in PhishTank database';
      console.log(`🎣 PhishTank: ${isThreat ? 'PHISHING' : 'CLEAN'} - ${details}`);
      return { label, status: isThreat ? 'threat' : 'clean', confidence: isThreat ? 90 : 0, details };
    } catch (error) {
      console.log('PhishTank API error:', error);
      return { label, status: 'error', confidence: 0, details: 'Request failed' };
    }
  }

  private static combineResults(url: string, local: LocalAnalysis, checks: SourceCheck[]): URLThreatResult {
    const respondedSources = checks
      .filter(c => c.status === 'threat' || c.status === 'clean')
      .map(c => c.label);
    const base = { url, respondedSources, localRiskScore: local.riskScore };
    const threats = checks.filter(c => c.status === 'threat');

    // 1. Alguna fuente lo marca como amenaza -> MALICIOSO
    if (threats.length > 0) {
      return {
        ...base,
        verdict: 'malicious',
        isMalicious: true,
        confidence: Math.max(...threats.map(t => t.confidence), 90),
        source: threats[0].label,
        details: `Confirmed threat by online scanner: ${threats[0].details}`
      };
    }

    // 2. La heurística local (sin contar el acortador) lo marca como amenaza -> MALICIOSO
    if (local.heuristicMalicious) {
      const passedOnline = checks.some(c => c.status === 'clean');
      return {
        ...base,
        verdict: 'malicious',
        isMalicious: true,
        // Bajamos confianza si alguna API lo da por limpio
        confidence: passedOnline ? 60 : Math.min(local.riskScore, 100),
        source: 'local_analysis',
        details: passedOnline ? `${local.details} (but passed online scan)` : local.details
      };
    }

    const unverified = (reason: string): URLThreatResult => ({
      ...base,
      verdict: 'unverified',
      reason,
      isMalicious: false,
      confidence: 0,
      source: 'unverified',
      details: local.details
    });

    // 3. Un acortador oculta el destino: las fuentes solo evalúan la URL corta
    if (local.isShortener) return unverified('oculta el destino');

    // 4. VirusTotal no conoce la URL: no es lo mismo que limpia, aunque otra fuente no encuentre nada
    if (checks.some(c => c.status === 'unknown')) return unverified('VirusTotal no conoce esta URL');

    // 5. Al menos una fuente respondió y no encontró nada -> LIMPIA
    if (respondedSources.length > 0) {
      return {
        ...base,
        verdict: 'clean',
        isMalicious: false,
        confidence: 0,
        source: respondedSources.join(', '),
        details: `No threats found by ${respondedSources.join(', ')}`
      };
    }

    // 6. Ninguna fuente respondió (sin red, sin claves, errores)
    return unverified('ninguna fuente de reputación respondió');
  }

  private static quickLocalAnalysis(url: string): LocalAnalysis {
    let suspiciousScore = 0;
    const domain = extractDomain(url);
    const lowerUrl = url.toLowerCase();
    const reasons: string[] = [];

    // 0. Homoglyph / Punycode se comprueba ANTES de la whitelist: un dominio así nunca es oficial
    const isHomoglyph = hasUnicodeHomoglyph(domain) || hasPunycode(domain);

    // 1. WHITELIST (host exacto o subdominio)
    if (!isHomoglyph && hostMatches(domain, WHITELISTED_DOMAINS)) {
      return this.officialResult(`Domain explicitly whitelisted: ${domain}`);
    }

    // 2. URL Shorteners (dominio exacto)
    const isShortener = isShortenerHost(domain);
    if (isShortener) {
      suspiciousScore += SHORTENER_POINTS;
      reasons.push(`URL shortener: ${domain}`);
    }

    // 3. Suspicious TLDs
    const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.click', '.download'];
    const foundTlds = suspiciousTlds.filter(tld => domain.endsWith(tld));
    if (foundTlds.length > 0) {
      suspiciousScore += 40;
      reasons.push(`Suspicious TLD: ${foundTlds.join(', ')}`);
    }

    // 4. Unicode homoglyph / Punycode detection
    if (isHomoglyph) {
      suspiciousScore += 70;
      reasons.push('Posible ataque homoglyph/Punycode en dominio');
    }

    // 5. Brand impersonation
    interface BrandRule { pattern: RegExp; name: string; official: string[] }
    const brands: BrandRule[] = [
      { pattern: /s[a4@]nt[a4@]nder/i, name: 'santander', official: ['santander.com', 'bancosantander.es', 'santander.es'] },
      { pattern: /p[a4@]yp[a4@]l/i, name: 'paypal', official: ['paypal.com', 'paypal.me'] },
      { pattern: /g[o0][o0]gle/i, name: 'google', official: ['google.com', 'google.es', 'accounts.google.com', 'drive.google.com', 'photos.google.com'] },
      { pattern: /[a4@]pple/i, name: 'apple', official: ['apple.com', 'icloud.com'] },
      { pattern: /micr[o0]s[o0]ft/i, name: 'microsoft', official: ['microsoft.com', 'live.com', 'office.com'] },
      { pattern: /dgt/i, name: 'dgt', official: ['dgt.es', 'sede.dgt.gob.es'] },
      { pattern: /h[a4@]ciend[a4@]/i, name: 'hacienda', official: ['agenciatributaria.es', 'agenciatributaria.gob.es'] },
      { pattern: /bbv[a4@]/i, name: 'bbva', official: ['bbva.es', 'bbva.com'] }
    ];

    const matchedBrands = brands.filter(item => lowerUrl.match(item.pattern));

    // FIRST: Check if it's an OFFICIAL domain matching the brand
    const officialMatch = isHomoglyph
      ? undefined
      : matchedBrands.find(brandRule => hostMatches(domain, brandRule.official));

    if (officialMatch) {
      return this.officialResult(`Verified official domain for ${officialMatch.name}`);
    }

    // If it matched a brand pattern but NOT an official domain, it's highly suspicious (Impersonation)
    if (matchedBrands.length > 0) {
      suspiciousScore += 60;
      reasons.push(`Possible Brand Impersonation: ${matchedBrands.map(b => b.name).join(', ')}`);
    }

    // 6. Suspicious keywords
    const keywords = ['login', 'verify', 'update', 'urgent', 'suspended', 'multa', 'verificar', 'actualizar', 'urgente', 'caduc'];
    const foundKeywords = keywords.filter(keyword => lowerUrl.includes(keyword));
    if (foundKeywords.length > 0) {
      const keywordScore = foundKeywords.length * 12;
      suspiciousScore += keywordScore;
      reasons.push(`Suspicious keywords: ${foundKeywords.join(', ')}`);
    }

    // 7. Domain characteristics
    if (domain.length > 25) {
      suspiciousScore += 20;
      reasons.push('Long domain');
    }

    if (this.isIPAddress(domain)) {
      suspiciousScore += 50;
      reasons.push('IP address used');
    }

    return {
      official: false,
      officialDetails: '',
      isShortener,
      riskScore: suspiciousScore,
      // The shortener alone means "unverified", not "malicious"
      heuristicMalicious: suspiciousScore - (isShortener ? SHORTENER_POINTS : 0) >= 50,
      details: reasons.length > 0 ?
        `${reasons.join(', ')} (Score: ${suspiciousScore})` :
        `No suspicious patterns found (Score: ${suspiciousScore})`
    };
  }

  private static officialResult(details: string): LocalAnalysis {
    return {
      official: true,
      officialDetails: details,
      isShortener: false,
      riskScore: 0,
      heuristicMalicious: false,
      details,
    };
  }

  private static isIPAddress(domain: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Regex.test(domain);
  }
}
