import { API_KEYS } from '../../env';

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export class GeminiService {
  private static readonly API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

  static async analyzeSMS(phoneNumber: string, messageBody: string): Promise<string> {
    const prompt = `
      Act as a cybersecurity expert analyzing an SMS message.
      
      Sender: ${phoneNumber}
      Message: "${messageBody}"
      
      Task:
      1. Analyze the message for signs of phishing, scams (smishing), or social engineering.
      2. Identify any suspicious patterns (urgency, spoofing, etc.).
      3. Provide a concise safety assessment (Safe, Suspicious, or Dangerous) and the reason why.
      4. If there are links, assess their potential risk (but do not click them).
      
      Keep the response short and helpful for a mobile user.
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
        const errorData = await response.json();
        throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
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
