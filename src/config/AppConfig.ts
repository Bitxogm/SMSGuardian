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
  // NEW: UI Configuration
  ui: {
    showBlockedLinks: true, // Set to true to reveal blocked URLs in Quarantine
  }
};

export const WHITELISTED_DOMAINS = [
  'google.com',
  'youtube.com',
  'amazon.com',
  'facebook.com',
  'twitter.com',
  'linkedin.com',
  'instagram.com',
  'wikipedia.org',
  'github.com',
  'stackoverflow.com',
  'microsoft.com',
  'apple.com',
  'netflix.com',
  'spotify.com',
  'whatsapp.com',
  'telegram.org',
  'paypal.com', // Be careful with this one, but official domain is safe
  // Add user's trusted domains here
];

export const SUSPICIOUS_PATTERNS = [
  /urgent|urgente|immediate|inmediato|ahora|ya|hoy|today/gi,
  /click|pincha|haz.clic|acceda|ingrese/gi,
  /free|gratis|premio|ganado/gi,
  /verify|verifica|confirma|actualiza/gi,
  /suspend|suspender|block|bloquear|restringida|bloqueada|vence/gi,
  /bank|banco|credit|credito|card|tarjeta|cuenta|transferencia|importe|compra|bizum/gi,
  /password|contraseña|pin|codigo|utiliza.el.codigo/gi,
  /expire|expira|caducad|caduca/gi,
  /90[0-9]{7}|80[0-9]{7}/g, // Premium numbers
  /nuca.lo.compartas|no.reconoce.esta.operacion|llame.al/gi,
  /bbva|santander|caixabank|sabadell|bankinter|abanca|unicaja/gi,
  // NEW: Logistics & Government
  /paquete|entrega|suspendida|casa|direccion|incompleta|envio|aduanas|seur|correos|fedex|dhl/gi,
  /aeat|hacienda|dgt|multa|estacionamiento|ilegal|devolucion|reembolso|pago.requerido/gi,
  // NEW: Family Scams
  /mama|papa|movil|roto|numero.nuevo|dinero|pago.urgente/gi,
];

export const SUSPICIOUS_DOMAINS = [
  '.tk', '.ml', '.ga', '.cf', '.click', '.download', '.top', '.xyz', '.site', '.online', '.link'
];

export const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'short.link', 'bit.do', 't.ly', 'is.gd', 'buff.ly'
];
