/**
 * Shared URL utility functions.
 * Single source of truth for domain extraction across SMSAnalysisService and URLThreatAnalyzer.
 */

import { URL_SHORTENERS } from '../config/AppConfig';

/**
 * Extracts the bare domain from a URL string.
 * Strips protocol, www, path, query params, and fragment.
 */
export function extractDomain(url: string): string {
  try {
    let cleanUrl = url.toLowerCase();
    cleanUrl = cleanUrl.replace(/^https?:\/\//, '');
    cleanUrl = cleanUrl.replace(/^www\./, '');
    cleanUrl = cleanUrl.split('/')[0];
    cleanUrl = cleanUrl.split('?')[0];
    cleanUrl = cleanUrl.split('#')[0];
    return cleanUrl;
  } catch {
    // Robust fallback using regex
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^/\s?#]+)/);
    return match ? match[1].toLowerCase() : url.toLowerCase();
  }
}

/**
 * True if host is one of the domains or a subdomain of one.
 * Exact comparison: "t.co" does not match "about.com", "google.com" does not match "google.com.evil.xyz".
 */
export function hostMatches(host: string, domains: readonly string[]): boolean {
  return domains.some(d => host === d || host.endsWith('.' + d));
}

export function isShortenerHost(host: string): boolean {
  return hostMatches(host, URL_SHORTENERS);
}

/**
 * Returns true if the domain contains non-ASCII characters (Unicode homoglyph attack).
 * Example: раypal.com (with Cyrillic 'а') → true
 */
export function hasUnicodeHomoglyph(domain: string): boolean {
  return /[^\x00-\x7F]/.test(domain);
}

/**
 * Returns true if the domain contains a Punycode ACE prefix (IDN homograph attack).
 * Example: xn--aypal-4we.com → true
 */
export function hasPunycode(domain: string): boolean {
  return domain.includes('xn--');
}
