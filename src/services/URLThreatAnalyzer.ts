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
      
      const localResult = this.quickLocalAnalysis(url);
      console.log(`📊 Local analysis: ${localResult.isMalicious ? 'MALICIOUS' : 'CLEAN'} (${localResult.confidence}%)`);

      // NUEVA LÓGICA: Si es sospechosa O si tenemos APIs, siempre consultar APIs
      const shouldUseAPIs = localResult.isMalicious || this.hasAPIKeys();
      
      if (shouldUseAPIs) {
        console.log(`🌐 Consulting external APIs for verification...`);
        
        const [vtResult, gsbResult, ptResult] = await Promise.allSettled([
          this.queryVirusTotal(url),
          this.queryGoogleSafeBrowsing(url), 
          this.queryPhishTank(url)
        ]);

        const combinedResult = this.combineResults(localResult, [vtResult, gsbResult, ptResult]);
        console.log(`📊 Final result: ${combinedResult.isMalicious ? 'MALICIOUS' : 'CLEAN'} (${combinedResult.confidence}%)`);
        return combinedResult;
      } else {
        console.log(`📊 Using local analysis only - URL appears clean`);
        return {
          ...localResult,
          source: `${localResult.source}_only`,
          details: `${localResult.details} (APIs available but not needed)`
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

    if (validResults.length === 0) {
      console.log(`📊 No API results available, using local analysis only`);
      return {
        ...localResult,
        details: `${localResult.details} (API queries failed)`
      };
    }

    // Si CUALQUIER fuente dice que es maliciosa, es maliciosa
    const isMalicious = validResults.some(result => result.isMalicious) || localResult.isMalicious;
    
    // Usar la confianza más alta
    const maxConfidence = Math.max(
      localResult.confidence,
      ...validResults.map(r => r.confidence)
    );

    const sources = [localResult.source, ...validResults.map(r => r.source)];
    const apiSummary = validResults.map(r => 
      `${r.source}: ${r.isMalicious ? 'THREAT' : 'CLEAN'} (${r.confidence}%)`
    ).join(', ');

    return {
      url: localResult.url,
      isMalicious,
      confidence: maxConfidence,
      source: `combined(${sources.join(',')})`,
      details: `Local: ${localResult.isMalicious ? 'THREAT' : 'CLEAN'} (${localResult.confidence}%) | APIs: ${apiSummary}`
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
    const brands = [
      { pattern: /s[a4@]nt[a4@]nder/i, name: 'santander' },
      { pattern: /p[a4@]yp[a4@]l/i, name: 'paypal' },
      { pattern: /g[o0][o0]gle/i, name: 'google' },
      { pattern: /[a4@]pple/i, name: 'apple' },
      { pattern: /micr[o0]s[o0]ft/i, name: 'microsoft' },
      { pattern: /dgt/i, name: 'dgt' },
      { pattern: /h[a4@]ciend[a4@]/i, name: 'hacienda' },
      { pattern: /bbv[a4@]/i, name: 'bbva' }
    ];
    
    const matchedBrands = brands.filter(item => lowerUrl.match(item.pattern));
    if (matchedBrands.length > 0) {
      suspiciousScore += 60;
      reasons.push(`Brand impersonation: ${matchedBrands.map(b => b.name).join(', ')}`);
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