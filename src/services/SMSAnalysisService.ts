import { SUSPICIOUS_PATTERNS, URL_SHORTENERS, APP_CONFIG } from '../config/AppConfig';
import { SMSMessage } from '../types/SMS';
import { databaseService } from './DatabaseService';
import { ContactsService } from './ContactsService';
import { URLThreatAnalyzer } from './URLThreatAnalyzer';

export class SMSAnalysisService {
  static async analyzeSMS(phoneNumber: string, messageContent: string): Promise<{
    shouldBlock: boolean;
    shouldQuarantine: boolean;
    reason: string;
    threatLevel: 'safe' | 'suspicious' | 'malicious';
    suspiciousScore: number;
  }> {

    try {
      // 0. NUEVO: Verificar si está en contactos (whitelist automática)
      const isContact = await ContactsService.isInContacts(phoneNumber);
      if (isContact) {
        return {
          shouldBlock: false,
          shouldQuarantine: false,
          reason: 'Contact whitelist',
          threatLevel: 'safe',
          suspiciousScore: 0
        };
      }
      // 1. Check if number is in spam database
      const spamInfo = await databaseService.isSpamNumber(phoneNumber);
      if (spamInfo) {
        return {
          shouldBlock: true,
          shouldQuarantine: true,
          reason: `Spam database: ${spamInfo.spam_type}`,
          threatLevel: 'malicious',
          suspiciousScore: spamInfo.confidence_score || 50
        };
      }

      // 2. Analyze message content for suspicious patterns
      const contentScore = this.analyzeContent(messageContent);

      // 3. Check for suspicious URLs
      const urls = this.extractURLs(messageContent);
      const urlScore = await this.analyzeURLs(urls);

      // 4. Calculate total suspicious score
      const totalScore = contentScore + urlScore;

      // 5. Determine action based on score
      if (totalScore >= APP_CONFIG.security.maliciousThreshold) {
        return {
          shouldBlock: true,
          shouldQuarantine: true,
          reason: 'High suspicious score',
          threatLevel: 'malicious',
          suspiciousScore: totalScore
        };
      } else if (totalScore >= APP_CONFIG.security.suspiciousThreshold) {
        return {
          shouldBlock: false, // Quarantine instead
          shouldQuarantine: true,
          reason: 'Suspicious content detected',
          threatLevel: 'suspicious',
          suspiciousScore: totalScore
        };
      }

      return {
        shouldBlock: false,
        shouldQuarantine: true,
        reason: 'Passed security checks',
        threatLevel: 'safe',
        suspiciousScore: totalScore
      };

    } catch (error) {
      console.error('Error analyzing SMS:', error);
      return {
        shouldBlock: false,
        shouldQuarantine: true,
        reason: 'Analysis error - allowing',
        threatLevel: 'safe',
        suspiciousScore: 0
      };
    }
  }

  private static analyzeContent(content: string): number {
    let score = 0;
    const lowerContent = content.toLowerCase();

    // Check suspicious patterns
    SUSPICIOUS_PATTERNS.forEach(pattern => {
      const matches = lowerContent.match(pattern);
      if (matches) {
        score += matches.length * 15;
      }
    });

    // Check for urgency words
    const urgencyWords = ['urgent', 'urgente', 'immediate', 'inmediato', 'hoy', 'today'];
    urgencyWords.forEach(word => {
      if (lowerContent.includes(word)) {
        score += 20;
      }
    });

    // Check for financial terms
    const financialTerms = ['bank', 'banco', 'card', 'tarjeta', 'multa', 'fine'];
    financialTerms.forEach(term => {
      if (lowerContent.includes(term)) {
        score += 25;
      }
    });

    return Math.min(score, 100);
  }

  public static extractURLs(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/gi;
    return text.match(urlRegex) || [];
  }

  private static async analyzeURLs(urls: string[]): Promise<number> {
    let score = 0;

    for (const url of urls) {
      // Check for URL shorteners
      const domain = this.extractDomain(url);
      if (URL_SHORTENERS.includes(domain)) {
        score += 30; // High suspicion for shorteners
        console.log(`Suspicious: URL shortener detected (${domain})`);
      }

      try {
        const analysis = await URLThreatAnalyzer.analyzeURL(url);
        console.log(`URL Analysis: ${url} - ${analysis.isMalicious ? 'MALICIOUS' : 'SAFE'} (${analysis.confidence}%)`);

        if (analysis.isMalicious) {
          score += analysis.confidence;
        } else {
          score += Math.min(analysis.confidence / 4, 15);
        }
      } catch (error) {
        console.error('Error analyzing URL:', error);
        score += 10;
      }
    }

    return Math.min(score, 80);
  }

  private static extractDomain(url: string): string {
    try {
      // Simple regex-based domain extraction for React Native
      let cleanUrl = url.toLowerCase();

      // Remove protocol
      cleanUrl = cleanUrl.replace(/^https?:\/\//, '');
      // Remove www
      cleanUrl = cleanUrl.replace(/^www\./, '');
      // Remove path and query params
      cleanUrl = cleanUrl.split('/')[0];
      cleanUrl = cleanUrl.split('?')[0];

      return cleanUrl;
    } catch (error) {
      // Fallback extraction
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s?]+)/);
      return match ? match[1].toLowerCase() : url.toLowerCase();
    }
  }

  static async logAnalysis(analysis: any, smsData: any): Promise<void> {
    if (analysis.shouldQuarantine) {
      // Usar cuarentena en lugar de blocked_sms
      const { QuarantineService } = require('./QuarantineService');
      await QuarantineService.quarantineSMS({
        phoneNumber: smsData.phoneNumber,
        messageContent: smsData.messageContent,
        timestamp: smsData.timestamp || Date.now(),
        reason: analysis.reason,
        threatLevel: analysis.threatLevel,
        urls: this.extractURLs(smsData.messageContent)
      });
    } else if (analysis.shouldBlock) {
      // Solo bloquear si es realmente malicioso
      const smsMessage: Omit<SMSMessage, 'id'> = {
        phoneNumber: smsData.phoneNumber,
        messageContent: smsData.messageContent,
        timestamp: Date.now(),
        isBlocked: analysis.shouldBlock,
        blockReason: analysis.reason,
        threatLevel: analysis.threatLevel,
        containsUrls: this.extractURLs(smsData.messageContent).length > 0,
        analyzedUrls: this.extractURLs(smsData.messageContent)
      };
      await databaseService.logBlockedSMS(smsMessage);
    }
  }

}