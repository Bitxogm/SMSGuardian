import { Alert } from 'react-native';
import { databaseService } from '../services/DatabaseService';

export const GEMINI_CONSENT_KEY = 'gemini_consent_v1';

const askConsent = (): Promise<boolean> =>
  new Promise(resolve => {
    Alert.alert(
      'Analizar con Gemini',
      'Se enviará el texto del SMS y el remitente a Google Gemini para analizarlo. ¿Permitir?',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Permitir', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });

// Asked once: the answer "Permitir" is persisted in app_settings; "Cancelar" stores nothing
export async function ensureGeminiConsent(): Promise<boolean> {
  let stored = '';
  try {
    stored = await databaseService.getSetting(GEMINI_CONSENT_KEY);
  } catch {
    // Database not ready: ask again rather than assume consent
  }
  if (stored === 'granted') return true;

  const allowed = await askConsent();
  if (allowed) await databaseService.setSetting(GEMINI_CONSENT_KEY, 'granted');
  return allowed;
}
