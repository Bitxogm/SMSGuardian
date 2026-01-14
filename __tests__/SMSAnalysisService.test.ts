
import { SMSAnalysisService } from '../src/services/SMSAnalysisService';

// Mock dependencies if necessary, but we want to test analyzeContent (which is private, but we can test it through analyzeSMS)
// However, analyzeSMS is async and calls multiple services.
// Let's test the public static methods that we can or just analyzeSMS if we mock the db and contacts.

jest.mock('../src/services/DatabaseService', () => ({
  databaseService: {
    isSpamNumber: jest.fn().mockResolvedValue(null),
    logBlockedSMS: jest.fn().mockResolvedValue(null),
  }
}));

jest.mock('../src/services/ContactsService', () => ({
  ContactsService: {
    isInContacts: jest.fn().mockResolvedValue(false),
  }
}));

jest.mock('../src/services/PhoneNumberReputationService', () => ({
  PhoneNumberReputationService: {
    analyzeNumber: jest.fn().mockImplementation((num: string) => ({
      phoneNumber: num,
      riskLevel: 'NEUTRAL',
      score: 0,
    })),
    analyzeNumberAsync: jest.fn().mockImplementation(async (num: string) => {
      // Simular reporte web para números específicos usados en el timo
      if (num.includes('931845156') || num.includes('612203803')) {
        return {
          phoneNumber: num,
          riskLevel: 'DANGEROUS',
          score: 85,
          label: 'Web-Reported Spam',
          details: 'Reported malicious'
        };
      }
      return {
        phoneNumber: num,
        riskLevel: 'NEUTRAL',
        score: 0,
      };
    }),
  }
}));

jest.mock('../src/services/URLThreatAnalyzer', () => ({
  URLThreatAnalyzer: {
    analyzeURL: jest.fn().mockResolvedValue({ isMalicious: false, confidence: 0 }),
  }
}));

describe('SMSAnalysisService Smishing Detection', () => {
  it('should flag the reported BBVA smishing message', async () => {
    const message = "BBVA: Para la transferencia puntual de 15.000 EUR y cuenta destino ES*7159 utiliza el codigo 102508. NUNCA lo compartas. Si no lo reconoces llame al 931845156";
    const result = await SMSAnalysisService.analyzeSMS('+34600000000', message);

    expect(result.shouldQuarantine || result.shouldBlock).toBe(true);
    expect(result.threatLevel).not.toBe('safe');
    expect(result.suspiciousScore).toBeGreaterThan(70);
  });

  it('should flag the reported ABANCA smishing message', async () => {
    const message = "ABANCA para la compra de 49990 euros utiliza el codigo 677120, si no reconoce esta operacion llame al 612203803";
    const result = await SMSAnalysisService.analyzeSMS('+34600000000', message);

    expect(result.shouldQuarantine || result.shouldBlock).toBe(true);
    expect(result.threatLevel).not.toBe('safe');
    expect(result.suspiciousScore).toBeGreaterThan(70);
  });

  it('should flag a generic bank alert with urgency', async () => {
    const message = "Su cuenta Santander ha sido bloqueada por seguridad. Acceda para verificar su identidad: http://bit.ly/fake-bank";
    const result = await SMSAnalysisService.analyzeSMS('+34600000000', message);

    expect(result.shouldQuarantine || result.shouldBlock).toBe(true);
    expect(result.suspiciousScore).toBeGreaterThan(70);
  });

  it('should flag a DGT smishing message', async () => {
    const message = "DGT: Notificacion de Multa por Estacionamiento Ilegal - Pago requerido: http://dgt.fake.xyz";
    const result = await SMSAnalysisService.analyzeSMS('+34600000000', message);
    expect(result.shouldQuarantine || result.shouldBlock).toBe(true);
    expect(result.suspiciousScore).toBeGreaterThan(80);
  });

  it('should flag an AEAT smishing message', async () => {
    const message = "AEAT: Tienes una devolucion pendiente de 450,12 EUR. Acceda para gestionar: http://aeat-refund.top";
    const result = await SMSAnalysisService.analyzeSMS('+34600000000', message);
    expect(result.shouldQuarantine || result.shouldBlock).toBe(true);
    expect(result.suspiciousScore).toBeGreaterThan(80);
  });

  it('should flag a SEUR smishing message', async () => {
    const message = "SEUR: Su entrega se ha suspendido debido a la falta del numero de casa. Verifique aqui: http://bit.ly/seur-check";
    const result = await SMSAnalysisService.analyzeSMS('+34600000000', message);
    expect(result.shouldQuarantine || result.shouldBlock).toBe(true);
    expect(result.suspiciousScore).toBeGreaterThan(80);
  });

  it('should flag a family scam message', async () => {
    const message = "Hola mama, se me ha roto el movil. Este es mi numero nuevo. ¿Me puedes enviar dinero para pagar una cosa?";
    const result = await SMSAnalysisService.analyzeSMS('+34600000000', message);
    expect(result.shouldQuarantine || result.shouldBlock).toBe(true);
    expect(result.suspiciousScore).toBeGreaterThan(60);
  });

  it('should mark a normal message as safe', async () => {
    const message = "Hola, ¿cómo estás? ¿Nos vemos luego para tomar algo?";
    const result = await SMSAnalysisService.analyzeSMS('+34600000000', message);

    expect(result.shouldBlock).toBe(false);
    expect(result.shouldQuarantine).toBe(false);
    expect(result.threatLevel).toBe('safe');
  });

  it('should flag a message with a web-reported spam number in the body', async () => {
    const message = "Si no lo reconoce llame al 931845156";
    const result = await SMSAnalysisService.analyzeSMS('+34600000000', message);

    expect(result.shouldQuarantine || result.shouldBlock).toBe(true);
    expect(result.reason).toContain('number in body');
  });

  it('should detect vishing phone numbers in the body', () => {
    const message = "Llame al 912345678 para confirmar";
    const phoneNumbers = (SMSAnalysisService as any).extractPhoneNumbers(message);
    expect(phoneNumbers).toContain('912345678');
  });
});
