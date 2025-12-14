import { API_KEYS } from "../../env";

export interface URLThreatResult {
  url: string;
  isMalicious: boolean;
  confidence: number;
  source: string;
  details: string;
}

export class URLThreatAnalyzer {
  private static readonly API_KEYS = {
    virusTotal: API_KEYS.virusTotal,
    safeBrowsing: API_KEYS.safeBrowsing,
  };

  static async analyzeURL(url: string): Promise<URLThreatResult> {
    try {
      console.log(`🔍 Analyzing URL: ${url}`);

      // 1. ANÁLISIS LOCAL (Rápido)
      const localResult = this.quickLocalAnalysis(url);

      // OPTIMIZACIÓN HÍBRIDA:
      // Si el análisis local dice que es un DOMINIO OFICIAL SEGURO (whitelist),
      // terminamos aquí y ahorramos la llamada a la API (y tiempo).
      if (localResult.source === 'local_whitelist') {
        console.log(`✅ Official domain detected (${url}). Skipping online scan.`);
        return localResult;
      }

      console.log(`📊 Local analysis: ${localResult.isMalicious ? 'SUSPICIOUS' : 'CLEAN'} (${localResult.confidence}%)`);

      // 2. ANÁLISIS ONLINE (Profundo)
      // Si tenemos claves, pedimos una segunda opinión a los expertos (VirusTotal/Google).
      // Especialmente útil si localmente parece limpio pero podría ser phishing nuevo,
      // o si localmente es sospechoso y queremos confirmar.
      if (this.hasAPIKeys()) {
        console.log(`🌐 Initiating Deep Online Analysis (VirusTotal/GSB)...`);

        const [vtResult, gsbResult, ptResult] = await Promise.allSettled([
          this.queryVirusTotal(url),
          this.queryGoogleSafeBrowsing(url),
          this.queryPhishTank(url)
        ]);

        const combinedResult = this.combineResults(localResult, [vtResult, gsbResult, ptResult]);
        console.log(`📊 Final Analysis: ${combinedResult.isMalicious ? 'MALICIOUS 🚨' : 'SAFE ✅'} (${combinedResult.confidence}%)`);
        return combinedResult;
      } else {
        console.log(`⚠️ No API keys found. Relying on local heuristics only.`);
        return {
          ...localResult,
          details: `${localResult.details} (Online APIs not configured)`
        };
      }

    } catch (error) {
      console.error('URL analysis error:', error);
      return {
        url,
        isMalicious: false,
        confidence: 0,
        source: 'error',
        details: 'Analysis failed'
      };
    }
  }

  private static hasAPIKeys(): boolean {
    return !!(this.API_KEYS.virusTotal || this.API_KEYS.safeBrowsing);
  }

  private static async queryVirusTotal(url: string): Promise<URLThreatResult | null> {
    if (!this.API_KEYS.virusTotal) {
      console.log('VirusTotal API key not configured');
      return null;
    }

    try {
      console.log(`🦠 Querying VirusTotal...`);
      const response = await fetch(
        `https://www.virustotal.com/vtapi/v2/url/report?apikey=${this.API_KEYS.virusTotal}&resource=${encodeURIComponent(url)}`
      );

      if (!response.ok) {
        console.log(`VirusTotal API error: ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (data.response_code === 1) {
        const maliciousCount = data.positives || 0;
        const totalScans = data.total || 1;
        const maliciousPercent = (maliciousCount / totalScans) * 100;

        const result = {
          url,
          isMalicious: maliciousPercent > 8,
          confidence: Math.min(maliciousPercent * 4, 100),
          source: 'virustotal',
          details: `${maliciousCount}/${totalScans} engines flagged as malicious (${maliciousPercent.toFixed(1)}%)`
        };

        console.log(`🦠 VirusTotal: ${result.isMalicious ? 'THREAT' : 'CLEAN'} - ${result.details}`);
        return result;
      } else {
        console.log(`🦠 VirusTotal: URL not found in database`);
        return {
          url,
          isMalicious: false,
          confidence: 70,
          source: 'virustotal',
          details: 'URL not found in VirusTotal database'
        };
      }
    } catch (error) {
      console.log('VirusTotal API error:', error);
      return null;
    }
  }

  private static async queryGoogleSafeBrowsing(url: string): Promise<URLThreatResult | null> {
    if (!this.API_KEYS.safeBrowsing) {
      console.log('Google Safe Browsing API key not configured');
      return null;
    }

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

      const data = await response.json();
      const isThreat = data.matches && data.matches.length > 0;

      const result = {
        url,
        isMalicious: isThreat,
        confidence: isThreat ? 95 : 85,
        source: 'google_safe_browsing',
        details: isThreat ? `Threat type: ${data.matches[0].threatType}` : 'Clean according to Google Safe Browsing'
      };

      console.log(`🛡️ Safe Browsing: ${result.isMalicious ? 'THREAT' : 'CLEAN'} - ${result.details}`);
      return result;
    } catch (error) {
      console.log('Google Safe Browsing API error:', error);
      return null;
    }
  }

  private static async queryPhishTank(url: string): Promise<URLThreatResult | null> {
    try {
      console.log(`🎣 Querying PhishTank...`);
      const response = await fetch('https://checkurl.phishtank.com/checkurl/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `url=${encodeURIComponent(url)}&format=json`
      });

      const data = await response.json();

      const result = {
        url,
        isMalicious: data.results?.in_database || false,
        confidence: data.results?.in_database ? 90 : 75,
        source: 'phishtank',
        details: data.results?.in_database ? 'Found in PhishTank phishing database' : 'Not found in PhishTank database'
      };

      console.log(`🎣 PhishTank: ${result.isMalicious ? 'PHISHING' : 'CLEAN'} - ${result.details}`);
      return result;
    } catch (error) {
      console.log('PhishTank API error:', error);
      return null;
    }
  }

  private static combineResults(localResult: URLThreatResult, apiResults: any[]): URLThreatResult {
    const validResults = apiResults
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);

    // Si no hay resultados de API (fallaron o sin claves), devuelve local
    if (validResults.length === 0) return localResult;

    // LÓGICA DE CONSENSO:
    const vt = validResults.find(r => r.source === 'virustotal');
    const gsb = validResults.find(r => r.source === 'google_safe_browsing');

    // 1. Si Google o VirusTotal dicen explícitamente que es MALICIOSO -> ES MALICIOSO.
    if ((vt && vt.isMalicious) || (gsb && gsb.isMalicious)) {
      return {
        url: localResult.url,
        isMalicious: true,
        confidence: Math.max(vt?.confidence || 0, gsb?.confidence || 0, 90),
        source: vt?.isMalicious ? 'VirusTotal' : 'Google Safe Browsing',
        details: `Confirmed threat by online scanner: ${vt?.isMalicious ? vt.details : gsb?.details}`
      };
    }

    // 2. Si no es malicioso online, pero localmente era "sospechoso" (ej. IP directa),
    // mantenemos la sospecha pero bajamos un poco la confianza si las APIs dicen clean.
    if (localResult.isMalicious) {
      return {
        ...localResult,
        confidence: 60, // Bajamos confianza si VT dice que está limpio
        details: `${localResult.details} (but passed online scan)`
      };
    }

    // 3. Si todo está limpio -> SEGURO.
    return {
      url: localResult.url,
      isMalicious: false,
      confidence: 90, // Alta confianza porque pasamos Local + Online
      source: 'Hybrid Analysis',
      details: 'Verified safe by Local Heuristics and Online APIs'
    };
  }

  private static quickLocalAnalysis(url: string): URLThreatResult {
    let suspiciousScore = 0;
    const domain = this.extractDomain(url);
    const lowerUrl = url.toLowerCase();
    const reasons: string[] = [];

    // 1. URL Shorteners
    const urlShorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'short.link'];
    const foundShorteners = urlShorteners.filter(shortener => lowerUrl.includes(shortener));
    if (foundShorteners.length > 0) {
      suspiciousScore += 50;
      reasons.push(`URL shortener: ${foundShorteners.join(', ')}`);
    }

    // 2. Suspicious TLDs
    const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.click', '.download'];
    const foundTlds = suspiciousTlds.filter(tld => domain.endsWith(tld));
    if (foundTlds.length > 0) {
      suspiciousScore += 40;
      reasons.push(`Suspicious TLD: ${foundTlds.join(', ')}`);
    }

    // 3. Brand impersonation
    interface BrandRule { pattern: RegExp; name: string; official: string[] }
    const brands: BrandRule[] = [
      { pattern: /s[a4@]nt[a4@]nder/i, name: 'santander', official: ['santander.com', 'bancosantander.es', 'santander.es'] },
      { pattern: /p[a4@]yp[a4@]l/i, name: 'paypal', official: ['paypal.com', 'paypal.me'] },
      { pattern: /g[o0][o0]gle/i, name: 'google', official: ['google.com', 'google.es', 'accounts.google.com', 'drive.google.com', 'photos.google.com'] },
      { pattern: /[a4@]pple/i, name: 'apple', official: ['apple.com', 'icloud.com'] },
      { pattern: /micr[o0]s[o0]ft/i, name: 'microsoft', official: ['microsoft.com', 'live.com', 'office.com'] },
      { pattern: /dgt/i, name: 'dgt', official: ['dgt.es', 'sede.dgt.gob.es'] },
      { pattern: /h[a4@]ciend[a4@]/i, name: 'hacienda', official: ['agenciatributaria.es', 'agenciatributaria.gob.es'] },
      { pattern: /bbv[a4@] /i, name: 'bbva', official: ['bbva.es', 'bbva.com'] }
    ];

    const matchedBrands = brands.filter(item => {
      if (!lowerUrl.match(item.pattern)) return false;
      return true;
    });

    // FIRST: Check if it's an OFFICIAL domain matching the brand
    const officialMatch = matchedBrands.find(brandRule =>
      brandRule.official.some(officialDomain => domain === officialDomain || domain.endsWith('.' + officialDomain))
    );

    if (officialMatch) {
      // It matched a brand pattern BUT it is on the official whitelist.
      // This is explicitly SAFE.
      return {
        url,
        isMalicious: false,
        confidence: 100,
        source: 'local_whitelist',
        details: `Verified official domain for ${officialMatch.name}`
      };
    }

    // If it matched a brand pattern but NOT an official domain, it's highly suspicious (Impersonation)
    if (matchedBrands.length > 0) {
      suspiciousScore += 60;
      reasons.push(`Possible Brand Impersonation: ${matchedBrands.map(b => b.name).join(', ')}`);
    }

    // 4. Suspicious keywords
    const keywords = ['login', 'verify', 'update', 'urgent', 'suspended', 'multa', 'verificar', 'actualizar', 'urgente', 'caduc'];
    const foundKeywords = keywords.filter(keyword => lowerUrl.includes(keyword));
    if (foundKeywords.length > 0) {
      const keywordScore = foundKeywords.length * 12;
      suspiciousScore += keywordScore;
      reasons.push(`Suspicious keywords: ${foundKeywords.join(', ')}`);
    }

    // 5. Domain characteristics
    if (domain.length > 25) {
      suspiciousScore += 20;
      reasons.push('Long domain');
    }

    if (this.isIPAddress(domain)) {
      suspiciousScore += 50;
      reasons.push('IP address used');
    }

    return {
      url,
      isMalicious: suspiciousScore >= 50,
      confidence: Math.min(suspiciousScore, 100),
      source: 'local_analysis',
      details: reasons.length > 0 ?
        `${reasons.join(', ')} (Score: ${suspiciousScore})` :
        `No suspicious patterns found (Score: ${suspiciousScore})`
    };
  }

  private static extractDomain(url: string): string {
    try {
      let cleanUrl = url.toLowerCase();
      cleanUrl = cleanUrl.replace(/^https?:\/\//, '');
      cleanUrl = cleanUrl.replace(/^www\./, '');
      cleanUrl = cleanUrl.split('/')[0];
      cleanUrl = cleanUrl.split('?')[0];
      cleanUrl = cleanUrl.split('#')[0];
      return cleanUrl;
    } catch (error) {
      return url.toLowerCase();
    }
  }

  private static isIPAddress(domain: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Regex.test(domain);
  }
}