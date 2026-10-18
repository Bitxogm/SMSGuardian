// Real SMS received on the user's phones, anonymised: tokens replaced with X and
// senders replaced with placeholders. Kept outside __tests__ so Jest does not run it.

export interface RealSmsSample {
  id: string;
  sender: string;
  body: string;
}

// Placeholder numbers. Never use +34600000000, +34700000000 or +34800000000:
// DatabaseService preloads them into the production whitelist (bug W1).
export const CONTACT_SENDER = '+34633333333';
export const UNKNOWN_SENDER = '+34611111111';

export const TINDER_URL = 'https://go.tinder.com/XXXXXXXXXXX';

export const REAL_SMS = {
  tinder: {
    id: 'tinder',
    sender: 'Tinder',
    body: `Tinder: Your profile is currently hidden. Tap to view: ${TINDER_URL}\n\nReply STOP to unsubscribe.`,
  },
  dgt: {
    id: 'dgt',
    sender: UNKNOWN_SENDER,
    body: 'DGT: Ultimo aviso Si no pagas ahora, la multa se duplicará. Consulta tu expediente: ourl.jp/XXXXX',
  },
  kraken: {
    id: 'kraken',
    sender: 'Kraken',
    body: 'Su codigo de verificacion para Kraken es: 000000. No comparta este codigo con nadie. Nuestros empleados nunca se lo pediran.',
  },
} satisfies Record<string, RealSmsSample>;
