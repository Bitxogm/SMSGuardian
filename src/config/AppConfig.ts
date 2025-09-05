export const APP_CONFIG = {
  database: {
    name: 'sms_security.db',
    version: 1,
  },
  api: {
    virusTotal: {
      baseUrl: 'https://www.virustotal.com/vtapi/v2',
      rateLimit: 4, // requests per minute
    },
    safeBrowsing: {
      baseUrl: 'https://safebrowsing.googleapis.com/v4',
      rateLimit: 100, // requests per day
    },
  },
  security: {
    maxUrlsPerSMS: 10,
    suspiciousThreshold: 70,
    maliciousThreshold: 90,
  },
  spam: {
    patternThreshold: 3, // Number of patterns to trigger spam detection
    quarantineThreshold: 50,
  },
};

export const SUSPICIOUS_PATTERNS = [
  /urgent|urgente|immediate|inmediato/gi,
  /click|pincha|haz.clic/gi,
  /free|gratis|premio|ganado/gi,
  /verify|verifica|confirma|actualiza/gi,
  /suspend|suspender|block|bloquear/gi,
  /bank|banco|credit|credito|card|tarjeta/gi,
  /password|contraseña|pin|codigo/gi,
  /expire|expira|caducad|vence/gi,
  /90[0-9]{7}|80[0-9]{7}/g, // Premium numbers
];

export const SUSPICIOUS_DOMAINS = [
  '.tk', '.ml', '.ga', '.cf', '.click', '.download'
];

export const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'short.link'
];
