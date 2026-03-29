/**
 * Shared URL utility functions.
 * Single source of truth for domain extraction across SMSAnalysisService and URLThreatAnalyzer.
 */

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
