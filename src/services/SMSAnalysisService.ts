import { PhoneNumberReputationService, ReputationResult } from './PhoneNumberReputationService';
import { ContactsService } from './ContactsService';
import { databaseService } from './DatabaseService';
import { APP_CONFIG, SUSPICIOUS_PATTERNS, URL_SHORTENERS } from '../config/AppConfig';
import { URLThreatAnalyzer } from './URLThreatAnalyzer';
import { SMSMessage } from '../types/SMS';

export class SMSAnalysisService {
  static async analyzeSMS(phoneNumber: string, messageContent: string): Promise<{
    shouldBlock: boolean;
    shouldQuarantine: boolean;
    reason: string;
    threatLevel: 'safe' | 'suspicious' | 'malicious';
    suspiciousScore: number;
    reputationDetails?: any; // New field for UI
  }> {

    try {
      // 0. NUEVO: Verificar si está en contactos (whitelist automática)
      try {
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
      } catch (e) {
        console.warn('Contacts check failed, proceeding:', e);
      }

      // 0.5. NUEVO: Análisis de Reputación del Número
      // Initialize with default safe values conforming to ReputationResult
      let reputation: ReputationResult = {
        phoneNumber,
        riskLevel: 'NEUTRAL',
        score: 0,
        isPremium: false,
        label: 'Unknown',
        details: 'Analysis not performed or failed'
      };

      try {
        reputation = await PhoneNumberReputationService.analyzeNumberAsync(phoneNumber);
        console.log(`Reputation Analysis: ${phoneNumber} - ${reputation.riskLevel} (${reputation.score})`);
      } catch (e) {
        console.warn('Reputation check failed, proceeding:', e);
      }

      // 1. Check if number is in spam database
      const spamInfo = await databaseService.isSpamNumber(phoneNumber);
      if (spamInfo) {
        return {
          shouldBlock: true,
          shouldQuarantine: true,
          reason: `Spam database: ${spamInfo.spam_type}`,
          threatLevel: 'malicious',
          suspiciousScore: Math.max(spamInfo.confidence_score || 50, reputation.score)
        };
      }

      // 2. Analyze message content
      const contentScore = this.analyzeContent(messageContent);

      // 3. NUEVO: Análisis de Reputación de Números en el Cuerpo (Vishing)
      const bodyPhoneNumbers = this.extractPhoneNumbers(messageContent);
      let bodyPhoneScore = 0;
      const bodyPhoneDetails: ReputationResult[] = [];

      for (const number of bodyPhoneNumbers) {
        // Obviar si es el mismo remitente
        const cleanBodyNum = number.replace(/\s/g, '');
        const cleanSenderNum = phoneNumber.replace(/\s/g, '');
        if (cleanBodyNum === cleanSenderNum) continue;

        const rep = await PhoneNumberReputationService.analyzeNumberAsync(number);
        bodyPhoneDetails.push(rep);
        // Si el número es sospechoso, añadimos su puntuación
        if (rep.riskLevel !== 'SAFE' && rep.riskLevel !== 'NEUTRAL') {
          bodyPhoneScore += rep.score;
        }
      }

      // 4. Check for suspicious URLs
      const urls = this.extractURLs(messageContent);
      const urlScore = await this.analyzeURLs(urls);

      // 5. Calculate total suspicious score
      // Score = Content + URL + Reputation + BodyPhones
      const totalScore = contentScore + urlScore + reputation.score + bodyPhoneScore;
      console.log(`Final Analysis: Content(${contentScore}) + URL(${urlScore}) + Rep(${reputation.score}) + BodyPhones(${bodyPhoneScore}) = ${totalScore}`);

      // 6. Determine action based on score
      if (totalScore >= APP_CONFIG.security.maliciousThreshold) {
        const primaryReason = reputation.score > 70 ? (reputation.label || 'High Risk Number') :
          bodyPhoneScore > 70 ? 'High Risk number in body' : 'High suspicious score';

        return {
          shouldBlock: true,
          shouldQuarantine: true,
          reason: primaryReason,
          threatLevel: 'malicious',
          suspiciousScore: totalScore,
          reputationDetails: {
            sender: reputation,
            bodyNumbers: bodyPhoneDetails
          }
        };
      } else if (totalScore >= APP_CONFIG.security.suspiciousThreshold) {
        const warningReason = reputation.score > 40 ? (reputation.label || 'Suspicious Number') :
          bodyPhoneScore > 40 ? 'Suspicious number in body' : 'Suspicious content';

        return {
          shouldBlock: false,
          shouldQuarantine: true,
          reason: warningReason,
          threatLevel: 'suspicious',
          suspiciousScore: totalScore,
          reputationDetails: {
            sender: reputation,
            bodyNumbers: bodyPhoneDetails
          }
        };
      }

      // DEFAULT SAFE
      return {
        shouldBlock: false,
        shouldQuarantine: false,
        reason: 'Passed security checks',
        threatLevel: 'safe',
        suspiciousScore: totalScore,
        reputationDetails: {
          sender: reputation,
          bodyNumbers: bodyPhoneDetails
        }
      };

    } catch (error) {
      console.error('Error analyzing SMS:', error);
      // FAIL OPEN: If analysis fails, let it through to Inbox (better than losing it)
      // Unless we want "Paranoid Mode", but for now, usability first.
      return {
        shouldBlock: false,
        shouldQuarantine: false,
        reason: 'Analysis error - Safe fallback',
        threatLevel: 'safe',
        suspiciousScore: 0
      };
    }
  }

  private static analyzeContent(content: string): number {
    let score = 0;
    const lowerContent = content.toLowerCase();

    // Check suspicious patterns (Defined in AppConfig)
    SUSPICIOUS_PATTERNS.forEach(pattern => {
      const matches = lowerContent.match(pattern);
      if (matches) {
        score += matches.length * 20;
      }
    });

    // 1. Urgency and Threat words
    const urgencyWords = [
      'urgent', 'urgente', 'immediate', 'inmediato', 'hoy', 'today',
      'ahora', 'ya', 'bloqueada', 'restringida', 'caduca', 'expira',
      'vence', 'accion requerida', 'pago requerido', '48 horas'
    ];
    urgencyWords.forEach(word => {
      if (lowerContent.includes(word)) score += 20;
    });

    // 2. Financial & Bank terms
    const financialTerms = [
      'bank', 'banco', 'card', 'tarjeta', 'multa', 'fine', 'cuenta',
      'transferencia', 'transaccion', 'compra', 'importe', 'eur', 'bizum',
      'bbva', 'santander', 'caixabank', 'sabadell', 'bankinter', 'abanca', 'unicaja'
    ];
    financialTerms.forEach(term => {
      if (lowerContent.includes(term)) score += 25;
    });

    // 3. Logistics & Shipping
    const logisticsTerms = ['paquete', 'entrega', 'suspendida', 'envio', 'aduanas', 'seur', 'correos', 'fedex', 'dhl'];
    let logisticsMatches = 0;
    logisticsTerms.forEach(term => {
      if (lowerContent.includes(term)) logisticsMatches++;
    });
    if (logisticsMatches > 0) score += 25 + (logisticsMatches * 10);

    // 4. Government Agencies
    const govTerms = ['aeat', 'hacienda', 'dgt', 'multa', 'estacionamiento', 'devolucion', 'reembolso', 'seguridad social'];
    let govMatches = 0;
    govTerms.forEach(term => {
      if (lowerContent.includes(term)) govMatches++;
    });
    if (govMatches > 0) score += 30 + (govMatches * 15);

    // 5. Family Scams (Social Engineering)
    if ((lowerContent.includes('mama') || lowerContent.includes('papa')) &&
      (lowerContent.includes('movil') || lowerContent.includes('roto') || lowerContent.includes('dinero'))) {
      score += 60;
    }

    // 6. VISHING DETECTION
    const bodyPhoneNumbers = this.extractPhoneNumbers(content);
    if (bodyPhoneNumbers.length > 0) {
      console.log(`Vishing potential: ${bodyPhoneNumbers.length} phone numbers in body`);
      // High score boost if phone + financial/gov/logistics terms
      if (score > 40) {
        score += 50;
      } else {
        score += 30;
      }
    }

    return Math.min(score, 100);
  }

  public static extractURLs(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/gi;
    return text.match(urlRegex) || [];
  }

  public static extractPhoneNumbers(text: string): string[] {
    // Basic phone number regex (looking for 9 or more digits, with optional spaces/dashes)
    // Matches common formats like 912345678, 612 203 803, etc.
    const phoneRegex = /(?:\+34|0034|34)?[ -]?(?:6|7|8|9)(?:[ -]?\d){8}/g;
    const matches = text.match(phoneRegex) || [];
    return matches.map(m => m.trim());
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
      const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^/\s?]+)/);
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