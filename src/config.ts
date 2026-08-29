import Constants from 'expo-constants';

type Extra = {
  googleExpoClientId?: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
  googleWebClientId?: string;
  admobInterstitialIosId?: string;
  admobInterstitialAndroidId?: string;
};

const extra = ((Constants.expoConfig?.extra ?? {}) as Extra) || {};

/**
 * Credenciais externas.
 *
 * Os valores reais entram em `app.json` -> `expo.extra` (ou via variáveis de
 * ambiente no build do EAS). Quando não estão preenchidos, o app segue
 * funcionando: o login com Google entra em modo de demonstração e os anúncios
 * usam o placeholder interno.
 */
export const config = {
  google: {
    expoClientId: extra.googleExpoClientId ?? '',
    iosClientId: extra.googleIosClientId ?? '',
    androidClientId: extra.googleAndroidClientId ?? '',
    webClientId: extra.googleWebClientId ?? '',
  },
  admob: {
    interstitialIos: extra.admobInterstitialIosId ?? '',
    interstitialAndroid: extra.admobInterstitialAndroidId ?? '',
  },
};

/** `true` quando existe pelo menos um client ID do Google configurado. */
export const isGoogleConfigured = Boolean(
  config.google.iosClientId ||
    config.google.androidClientId ||
    config.google.webClientId ||
    config.google.expoClientId
);

/**
 * Valor de reserva usado quando nenhum client ID do Google foi preenchido.
 *
 * `Google.useAuthRequest` lança se o client ID da plataforma e o `clientId`
 * genérico forem ambos `undefined`. Como o `AuthProvider` fica na raiz da
 * árvore, essa exceção derrubaria o app inteiro já na primeira renderização —
 * mesmo para quem nunca vai tocar no botão do Google. O pedido montado com
 * este valor nunca chega a ser disparado: `signInWithGoogle` interrompe antes,
 * com uma mensagem explicando que a build não está configurada.
 */
export const GOOGLE_FALLBACK_CLIENT_ID = 'google-nao-configurado';

/**
 * Client IDs no formato que `Google.useAuthRequest` espera.
 *
 * `clientId` nunca é `undefined` — é isso que mantém o app de pé enquanto o
 * login com Google não está configurado.
 */
export function googleClientIds(): {
  iosClientId?: string;
  androidClientId?: string;
  webClientId?: string;
  clientId: string;
} {
  return {
    iosClientId: config.google.iosClientId || undefined,
    androidClientId: config.google.androidClientId || undefined,
    webClientId: config.google.webClientId || undefined,
    clientId:
      config.google.expoClientId || config.google.webClientId || GOOGLE_FALLBACK_CLIENT_ID,
  };
}
