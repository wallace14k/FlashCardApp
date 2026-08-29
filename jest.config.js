/**
 * Dois conjuntos de testes, com ambientes diferentes:
 *
 * - `logica` roda a lógica pura (agendador, ofensiva, fila, configuração) em
 *   Node puro, sem React Native. É rápido e é onde está a maior parte da
 *   cobertura.
 * - `render` usa o preset do Expo para montar componentes de verdade. Existe
 *   porque empacotar o bundle não prova que o app sobe: um erro lançado em
 *   renderização passa pelo `expo export` e só aparece no aparelho.
 */
module.exports = {
  projects: [
    {
      displayName: 'logica',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
    },
    {
      displayName: 'render',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/*.test.tsx'],
      setupFiles: ['<rootDir>/jest.setup.render.js'],
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/.*|native-base|react-native-svg)',
      ],
    },
  ],
};
