import { API_KEYS } from '../../env';

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export class GeminiService {
  private static readonly API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  static async analyzeSMS(phoneNumber: string, messageBody: string): Promise<string> {
    const prompt = `
      Actúa como un experto en ciberseguridad analizando un mensaje SMS.
      
      Remitente: ${phoneNumber}
      Mensaje: "${messageBody}"
      
      Tarea:
      1. Analiza el mensaje en busca de señales de phishing, estafas (smishing) o ingeniería social.
      2. Identifica patrones sospechosos (urgencia, suplantación, etc.).
      3. Proporciona una evaluación de seguridad concisa (Seguro, Sospechoso o Peligroso) y explica por qué.
      4. Si hay enlaces, evalúa su riesgo potencial (pero no hagas clic en ellos).
      
      IMPORTANTE: Responde siempre en español (Castellano). Mantén la respuesta corta y útil para un usuario de móvil.
    `;

    return this.sendMessage(prompt);
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
