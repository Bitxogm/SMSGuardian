import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { AnalysisChatScreen } from '../src/screens/AnalysisChatScreen';
import { GeminiService } from '../src/services/GeminiService';

jest.mock('../env', () => ({ API_KEYS: { geminiApiKey: 'test-key' } }), { virtual: true });

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { phoneNumber: mockSender, messageBody: mockBody } }),
}));

const mockSender = 'Tinder';
const mockBody =
  'Tinder: Your profile is currently hidden. Tap to view: https://go.tinder.com/0XdNvUrqXWb\nReply STOP to unsubscribe.';

// Prompt literal as committed in 9fe04f8, with {{PHONE}} / {{BODY}} placeholders
const PROMPT_9FE04F8 = "\n      Actúa como un experto en ciberseguridad analizando un SMS recibido en un móvil.\n\n      Remitente: {{PHONE}}\n      Mensaje: \"{{BODY}}\"\n\n      Responde en español (castellano), en un máximo de 120 palabras, con este formato exacto:\n\n      **VEREDICTO** — razón en 5 palabras\n      - Punto clave\n      - Punto clave\n      - Punto clave (opcional)\n      Recomendación: acción concreta para el usuario.\n\n      Reglas:\n      - VEREDICTO es exactamente uno de: LEGÍTIMO, SOSPECHOSO o PELIGROSO.\n      - Usa 2 o 3 bullets centrados en señales de phishing, smishing o ingeniería social (urgencia, suplantación, enlaces, petición de datos o pagos).\n      - Si hay enlaces, evalúa su riesgo sin visitarlos.\n      - Si el mensaje contiene un número de teléfono, dedica un bullet a ese número: \"Número [número] detectado en el mensaje: verifica su reputación antes de llamar.\"\n      - Sin introducciones ni despedidas.\n    ";

type Turn = { role: 'user' | 'model'; parts: { text: string }[] };

const geminiReply = (text: string) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

describe('GeminiService.buildAnalysisPrompt', () => {
  it('returns exactly the prompt text of commit 9fe04f8', () => {
    const expected = PROMPT_9FE04F8.replace('{{PHONE}}', mockSender).replace('{{BODY}}', mockBody);
    expect(GeminiService.buildAnalysisPrompt(mockSender, mockBody)).toBe(expected);
  });
});

describe('AnalysisChatScreen conversation history', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  let fetchMock: jest.Mock;

  const askFollowUp = async (question: string): Promise<Turn[]> => {
    await act(async () => {
      renderer = ReactTestRenderer.create(<AnalysisChatScreen />);
    });
    const root = renderer!.root;
    await act(async () => {
      root.findByType(TextInput).props.onChangeText(question);
    });
    const send = root
      .findAllByType(TouchableOpacity)
      .find(t => t.findAllByType(Text).some(x => x.props.children === 'Enviar'));
    await act(async () => {
      await send!.props.onPress();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    return JSON.parse(fetchMock.mock.calls[1][1].body).contents;
  };

  beforeEach(() => {
    fetchMock = jest.fn()
      .mockResolvedValueOnce(geminiReply('**SOSPECHOSO** — enlace de seguimiento'))
      .mockResolvedValueOnce(geminiReply('Sí, contiene un enlace.'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await act(async () => {
      renderer?.unmount();
    });
    renderer = null;
  });

  it('sends the SMS body and sender again with the follow-up question', async () => {
    const contents = await askFollowUp('¿Tiene enlaces?');
    const payloadText = contents.flatMap(turn => turn.parts.map(p => p.text)).join('\n');

    expect(payloadText).toContain(mockBody);
    expect(payloadText).toContain(`Remitente: ${mockSender}`);
    expect(contents[0].role).toBe('user');
  });

  it('does not send the follow-up question as two consecutive user turns', async () => {
    const contents = await askFollowUp('¿Tiene enlaces?');

    expect(contents.map(turn => turn.role)).toEqual(['user', 'model', 'user']);
    expect(contents.filter(turn => turn.parts[0].text === '¿Tiene enlaces?')).toHaveLength(1);
  });
});
