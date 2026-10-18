/**
 * Shared URL utility functions.
 * Single source of truth for domain extraction across SMSAnalysisService and URLThreatAnalyzer.
 */

import { URL_SHORTENERS } from '../config/AppConfig';

/**
 * Extracts the normalised host from a URL string, so domain lists can be matched safely.
 * Lowercases; strips scheme, path/query/fragment, userinfo (up to the last '@'), port,
 * trailing dots and a leading "www.".
 * Example: "https://user@BIT.LY.:443/x?y" → "bit.ly"; "https://google.com@evil.xyz/x" → "evil.xyz"
 */
export function extractDomain(url: string): string {
  let host = url.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split(/[/?#]/)[0];
  host = host.slice(host.lastIndexOf('@') + 1);
  host = host.replace(/:\d+$/, '');
  host = host.replace(/\.+$/, '');
  host = host.replace(/^www\./, '');
  return host;
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
