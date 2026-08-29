/**
 * Preparação do ambiente para os testes que renderizam componentes.
 *
 * O preset do Expo já simula a maior parte dos módulos nativos; aqui ficam os
 * que ele não cobre. A ideia é simular o mínimo: quanto mais coisa for
 * substituída por dublê, menos o teste se parece com o app real.
 */

// Substituto oficial do AsyncStorage, mantido pelo próprio pacote.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// `expo-audio` remenda protótipos do módulo nativo assim que é importado, o
// que não existe fora do aparelho. O dublê cobre só a superfície que o app usa.
jest.mock('expo-audio', () => {
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    replace: jest.fn(),
    release: jest.fn(),
    duration: 0,
    playing: false,
  };
  const recorder = {
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    isRecording: false,
    uri: null,
  };
  return {
    useAudioPlayer: () => player,
    useAudioPlayerStatus: () => ({
      isLoaded: true,
      playing: false,
      currentTime: 0,
      duration: 0,
      didJustFinish: false,
    }),
    useAudioRecorder: () => recorder,
    useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0, canRecord: true }),
    createAudioPlayer: () => player,
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
    AudioModule: { requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }) },
  };
});

// `expo-notifications` toca em APIs de push logo no import.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

// Sem medir a área segura de verdade, o SafeAreaProvider nunca renderiza os
// filhos. Este dublê é o que a própria biblioteca publica para testes.
jest.mock('react-native-safe-area-context', () => {
  // O dublê da biblioteca vem em `export default`, então precisa ser
  // desembrulhado para virar os exports nomeados que o app importa.
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

// O preset não popula `Constants.expoConfig`, e sem isso o expo-linking não
// resolve o scheme e o fluxo do Google lança. Carregar o app.json de verdade
// também faz o teste exercitar a configuração real do projeto.
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  const { expo } = require('./app.json');
  return {
    ...actual,
    __esModule: true,
    default: { ...(actual.default ?? {}), expoConfig: expo },
  };
});

// `createURL` depende do ambiente nativo para montar o deep link de retorno.
// Só ele é substituído: o resto de `expo-auth-session` continua rodando de
// verdade, inclusive a validação de client ID que já derrubou o app uma vez.
jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  createURL: (path = '') => `linguacards://${path}`,
}));
