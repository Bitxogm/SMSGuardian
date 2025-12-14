/**
 * PhoneNumberReputationService.ts
 * 
 * Analyzes phone numbers to determine their risk level based on:
 * 1. Region/Country Code (High risk fraud countries)
 * 2. Number Type (Premium vs Standard vs Shortcode)
 * 3. Known Patterns (Robocalls, Wangiri fraud)
 */

export type ReputationRiskLevel = 'SAFE' | 'NEUTRAL' | 'SUSPICIOUS' | 'DANGEROUS';

export interface ReputationResult {
  phoneNumber: string;
  riskLevel: ReputationRiskLevel;
  score: number; // 0 (Safe) to 100 (Dangerous)
  countryCode?: string;
  countryName?: string;
  isPremium: boolean;
  label?: string; // e.g., "Premium Rate Number", "International (High Risk)", "Shortcode"
  details: string;
}

export class PhoneNumberReputationService {

  // Known High-Risk Country Codes (Wangiri / Smishing hotspots)
  private static readonly HIGH_RISK_PREFIXES: { [key: string]: string } = {
    '+234': 'Nigeria',
    '+225': 'Ivory Coast',
    '+221': 'Senegal',
    '+216': 'Tunisia',
    '+387': 'Bosnia',
    '+212': 'Morocco', // Often used for Wangiri scans
    '+7': 'Russia/Kazakhstan',
    '+4470': 'UK Personal Number (Scam prone)', // Specialized virtual numbers
    '+881': 'Satellite',
    '+882': 'Satellite',
  };

  // Spain Premium Rate Prefixes (Cost money to reply/call back)
  // Regex for Spanish premium numbers (803, 806, 807, 905, 907, 118xx)
  private static readonly PREMIUM_PATTERNS_ES = [
    /^(?:\+34)?80[367]\d{6}$/, // 803, 806, 807
    /^(?:\+34)?90[57]\d{6}$/,  // 905, 907
    /^(?:\+34)?118\d{2}$/       // 118xx Directory enquiries
  ];

  static analyzeNumber(phoneNumber: string): ReputationResult {
    let score = 0;
    const cleanNumber = phoneNumber.replace(/\s/g, '').replace(/-/g, '');
    let label = 'Unknown';
    let countryName = 'Unknown';
    let isPremium = false;
    let details = 'No specific flags found.';

    // 1. Check if Shortcode (3-6 digits)
    // Shortcodes are generally NEUTRAL (Transactional), but can be spoofed.
    if (cleanNumber.length >= 3 && cleanNumber.length <= 6 && !cleanNumber.startsWith('+')) {
      return {
        phoneNumber,
        riskLevel: 'NEUTRAL',
        score: 10,
        isPremium: false,
        label: 'Shortcode',
        details: 'Shortcode / Automation Service (Typical for Banks/2FA)'
      };
    }

    // 2. Check High Risk Countries
    for (const [prefix, country] of Object.entries(this.HIGH_RISK_PREFIXES)) {
      if (cleanNumber.startsWith(prefix)) {
        score += 70;
        countryName = country;
        label = 'High Risk Country';
        details = `Origin detected: ${country}. High fraud risk zone.`;
        break; // Stop after first match
      }
    }

    // 3. Check Premium Rate Numbers (focus on Spain context)
    // If it's a +34 number or no country code (assumed local)
    const isSpanishOrLocal = cleanNumber.startsWith('+34') || !cleanNumber.startsWith('+');

    if (isSpanishOrLocal) {
      countryName = 'Spain (Local)';
      for (const pattern of this.PREMIUM_PATTERNS_ES) {
        if (pattern.test(cleanNumber)) {
          score += 90;
          isPremium = true;
          label = 'Premium Rate Number';
          details = 'Costly tariff number detected. Do not reply or call back.';
          break;
        }
      }
    }

    // Determine Risk Level
    let riskLevel: ReputationRiskLevel = 'NEUTRAL';
    if (score === 0) riskLevel = 'SAFE'; // Standard mobile/landline
    if (score > 40) riskLevel = 'SUSPICIOUS';
    if (score > 80) riskLevel = 'DANGEROUS';

    return {
      phoneNumber,
      riskLevel,
      score,
      countryName,
      isPremium,
      label: label === 'Unknown' ? 'Standard Number' : label,
      details
    };
  }
}
