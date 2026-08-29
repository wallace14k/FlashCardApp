import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import App from '../App';

/**
 * Teste de fumaça: monta o app inteiro e espera a primeira tela aparecer.
 *
 * Existe por causa de um crash real em produção. Com os client IDs do Google
 * vazios, `Google.useAuthRequest` lançava na primeira renderização e derrubava
 * o app na abertura — e nem o `expo export` nem o `tsc` pegaram, porque
 * empacotar e checar tipos não renderiza nada.
 *
 * Qualquer exceção lançada durante a montagem da árvore reprova este teste.
 */
describe('App', () => {
  it('monta sem lançar e chega na tela de login', async () => {
    render(<App />);

    // O app começa carregando (sessão e dados vêm do armazenamento local) e
    // então cai na tela de login, porque não há usuário salvo.
    await waitFor(() => {
      expect(screen.getByText('LinguaCards')).toBeTruthy();
    });

    expect(screen.getByText('Usar sem conta neste aparelho')).toBeTruthy();
  });
});
