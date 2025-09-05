export interface SMSMessage {
  id: string;
  phoneNumber: string;
  messageContent: string;
  timestamp: number;
  isBlocked: boolean;
  blockReason?: string;
  threatLevel?: 'safe' | 'suspicious' | 'malicious';
  containsUrls: boolean;
  analyzedUrls?: string[];
}

export interface SpamNumber {
  id: number;
  phoneNumber: string;
  spamType: 'phishing' | 'malware' | 'commercial' | 'scam' | 'user_blocked';
  source: 'manual' | 'community' | 'api';
  confidenceScore: number;
  dateAdded: string;
  isActive: boolean;
}

export interface URLAnalysis {
  url: string;
  domain: string;
  threatLevel: 'safe' | 'suspicious' | 'malicious';
  isMalicious: boolean;
  confidence: number;
  source: string;
  analysisDate: string;
}

export interface AppSettings {
  protectionLevel: 'basic' | 'balanced' | 'maximum';
  enableUrlAnalysis: boolean;
  autoUpdateDatabase: boolean;
  enableNotifications: boolean;
  quarantineMode: boolean;
}
