import { API_KEYS } from '../../env';

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export class GeminiService {
  private static readonly API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  static async analyzeSMS(phoneNumber: string, messageBody: string): Promise<string> {
    return this.sendMessage(this.buildAnalysisPrompt(phoneNumber, messageBody));
  }

  static buildAnalysisPrompt(phoneNumber: string, messageBody: string): string {
    return `
      Actúa como un experto en ciberseguridad analizando un SMS recibido en un móvil.

      Remitente: ${phoneNumber}
      Mensaje: "${messageBody}"

      Responde en español (castellano), en un máximo de 120 palabras, con este formato exacto:

      **VEREDICTO** — razón en 5 palabras
      - Punto clave
      - Punto clave
      - Punto clave (opcional)
      Recomendación: acción concreta para el usuario.

      Reglas:
      - VEREDICTO es exactamente uno de: LEGÍTIMO, SOSPECHOSO o PELIGROSO.
      - Usa 2 o 3 bullets centrados en señales de phishing, smishing o ingeniería social (urgencia, suplantación, enlaces, petición de datos o pagos).
      - Si hay enlaces, evalúa su riesgo sin visitarlos.
      - Si el mensaje contiene un número de teléfono, dedica un bullet a ese número: "Número [número] detectado en el mensaje: verifica su reputación antes de llamar."
      - Sin introducciones ni despedidas.
    `;
  }

  static async sendMessage(text: string, history: ChatMessage[] = []): Promise<string> {
    if (!API_KEYS.geminiApiKey) {
      throw new Error('Gemini API Key is missing');
    }

    const payload = {
      contents: [
        ...history,
        {
          role: 'user',
          parts: [{ text: text }]
        }
      ]
    };

    try {
      const response = await fetch(`${this.API_URL}?key=${API_KEYS.geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          // Fallback if not JSON
        }
        throw new Error(`Gemini API Error (${response.status}): ${errorMessage}`);
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseText) {
        throw new Error('No response from Gemini');
      }

      return responseText;
    } catch (error) {
      console.error('Gemini Service Error:', error);
      throw error;
    }
  }
}
