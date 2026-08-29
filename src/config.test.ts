// `expo-constants` é ESM e traz módulos nativos junto; aqui só interessa o que
// ele carrega de `expo.extra`. O objeto vazio reproduz o estado do
// repositório: nenhum client ID preenchido.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

import { GOOGLE_FALLBACK_CLIENT_ID, googleClientIds, isGoogleConfigured } from './config';

/**
 * Estes testes existem por causa de um crash real: com os client IDs vazios em
 * `app.json`, `Google.useAuthRequest` lançava e derrubava o app na abertura,
 * porque o `AuthProvider` fica na raiz da árvore. A biblioteca só aceita
 * `undefined` no client ID da plataforma se o `clientId` genérico estiver
 * preenchido — então é esse campo que precisa estar sempre presente.
 */
describe('googleClientIds', () => {
  it('nunca devolve clientId indefinido, mesmo sem nenhuma configuração', () => {
    const ids = googleClientIds();
    expect(ids.clientId).toBeDefined();
    expect(typeof ids.clientId).toBe('string');
    expect(ids.clientId.length).toBeGreaterThan(0);
  });

  it('usa o valor de reserva quando nada foi configurado', () => {
    // Sem `expo.extra` preenchido, que é o estado do repositório.
    expect(isGoogleConfigured).toBe(false);
    expect(googleClientIds().clientId).toBe(GOOGLE_FALLBACK_CLIENT_ID);
  });

  it('não inventa client IDs por plataforma', () => {
    // Passar string vazia faria a biblioteca montar um pedido inválido;
    // `undefined` deixa o `clientId` genérico assumir.
    const ids = googleClientIds();
    expect(ids.iosClientId).toBeUndefined();
    expect(ids.androidClientId).toBeUndefined();
    expect(ids.webClientId).toBeUndefined();
  });
});

describe('contrato do expo-auth-session', () => {
  /**
   * Reproduz a verificação de `Google.useAuthRequest`
   * (providers/Google.js): ele resolve o client ID da plataforma atual e cai
   * no `clientId` genérico, e lança se o resultado for `undefined`.
   */
  function resolveComoABibliotecaFaz(propertyName: 'iosClientId' | 'androidClientId' | 'webClientId') {
    const ids = googleClientIds();
    return ids[propertyName] ?? ids.clientId;
  }

  it.each(['iosClientId', 'androidClientId', 'webClientId'] as const)(
    'resolve um client ID em %s, então useAuthRequest não lança',
    (propertyName) => {
      expect(resolveComoABibliotecaFaz(propertyName)).not.toBeUndefined();
    }
  );
});
