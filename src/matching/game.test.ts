import {
  MIN_CARDS_TO_PLAY,
  PAIRS_PER_ROUND,
  buildRounds,
  createGame,
  currentRound,
  isMatched,
  nextRound,
  shuffle,
  summarize,
  tapTile,
  type MatchingState,
  type Tile,
} from './game';
import { createCard } from '../store/defaults';
import type { Card } from '../types';

/** Sorteio fixo: mantém a ordem original e torna os testes determinísticos. */
const noShuffle = () => 0.999999;

function makeCards(count: number): Card[] {
  return Array.from({ length: count }, (_, i) =>
    createCard({ deckId: 'd1', front: `front${i}`, back: `back${i}` })
  );
}

/** Monta uma partida e devolve helpers para tocar nos quadrados por card. */
function startGame(cards: Card[], pairsPerRound = PAIRS_PER_ROUND) {
  const rounds = buildRounds(cards, { pairsPerRound, random: noShuffle });
  let state = createGame(rounds, 0);

  const tileFor = (cardId: string, side: 'front' | 'back'): Tile => {
    const round = currentRound(state)!;
    const list = side === 'front' ? round.frontTiles : round.backTiles;
    return list.find((tile) => tile.cardId === cardId)!;
  };

  const tap = (cardId: string, side: 'front' | 'back', now = 0) => {
    const result = tapTile(state, tileFor(cardId, side), now);
    state = result.state;
    return result;
  };

  const pair = (cardId: string, now = 0) => {
    tap(cardId, 'front', now);
    return tap(cardId, 'back', now);
  };

  return {
    tap,
    pair,
    tileFor,
    get state() {
      return state;
    },
    advance() {
      state = nextRound(state);
    },
  };
}

describe('buildRounds', () => {
  it('agrupa os cards em rodadas do tamanho pedido', () => {
    const rounds = buildRounds(makeCards(12), { pairsPerRound: 5, random: noShuffle });
    expect(rounds.map((r) => r.frontTiles.length)).toEqual([5, 5, 2]);
  });

  it('descarta uma sobra de um par só, que não daria jogo', () => {
    const rounds = buildRounds(makeCards(11), { pairsPerRound: 5, random: noShuffle });
    expect(rounds).toHaveLength(2);
  });

  it('cria um quadrado de cada lado para cada card', () => {
    const [round] = buildRounds(makeCards(4), { pairsPerRound: 4, random: noShuffle });
    expect(round.frontTiles).toHaveLength(4);
    expect(round.backTiles).toHaveLength(4);
    expect(round.frontTiles.every((t) => t.side === 'front')).toBe(true);
    expect(round.backTiles.every((t) => t.side === 'back')).toBe(true);
  });

  it('deixa de fora cards pausados e sem conteúdo', () => {
    const cards = makeCards(4);
    cards[0].suspended = true;
    cards[1].back = '   ';
    const rounds = buildRounds(cards, { pairsPerRound: 5, random: noShuffle });
    expect(rounds[0].frontTiles).toHaveLength(2);
  });

  it('não monta rodada quando não há cards suficientes', () => {
    expect(buildRounds(makeCards(1), { random: noShuffle })).toHaveLength(0);
  });

  it('embaralha as duas colunas de forma independente', () => {
    const cards = makeCards(5);
    let seed = 0;
    // Sorteio variado, só para garantir que as ordens podem divergir.
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const [round] = buildRounds(cards, { pairsPerRound: 5, random });
    const frontOrder = round.frontTiles.map((t) => t.cardId);
    const backOrder = round.backTiles.map((t) => t.cardId);
    expect(frontOrder).not.toEqual(backOrder);
  });
});

describe('tapTile', () => {
  it('seleciona no primeiro toque', () => {
    const cards = makeCards(4);
    const game = startGame(cards, 4);
    const result = game.tap(cards[0].id, 'front');
    expect(result.outcome.kind).toBe('selected');
    expect(game.state.selected?.cardId).toBe(cards[0].id);
    expect(game.state.hits).toBe(0);
    expect(game.state.mistakes).toBe(0);
  });

  it('combina o par e conta acerto', () => {
    const cards = makeCards(4);
    const game = startGame(cards, 4);
    const result = game.pair(cards[0].id);
    expect(result.outcome.kind).toBe('match');
    expect(game.state.hits).toBe(1);
    expect(game.state.mistakes).toBe(0);
    expect(isMatched(game.state, cards[0].id)).toBe(true);
  });

  it('conta erro quando os lados não são do mesmo card', () => {
    const cards = makeCards(4);
    const game = startGame(cards, 4);
    game.tap(cards[0].id, 'front');
    const result = game.tap(cards[1].id, 'back');
    expect(result.outcome.kind).toBe('miss');
    expect(game.state.mistakes).toBe(1);
    expect(game.state.selected).toBeNull();
  });

  it('desmarca ao tocar duas vezes no mesmo quadrado', () => {
    const cards = makeCards(4);
    const game = startGame(cards, 4);
    game.tap(cards[0].id, 'front');
    const result = game.tap(cards[0].id, 'front');
    expect(result.outcome.kind).toBe('deselected');
    expect(game.state.selected).toBeNull();
    expect(game.state.mistakes).toBe(0);
  });

  it('trocar de escolha no mesmo lado não conta erro', () => {
    const cards = makeCards(4);
    const game = startGame(cards, 4);
    game.tap(cards[0].id, 'front');
    const result = game.tap(cards[1].id, 'front');
    expect(result.outcome.kind).toBe('selected');
    expect(game.state.mistakes).toBe(0);
    expect(game.state.selected?.cardId).toBe(cards[1].id);
  });

  it('ignora toque em card já combinado', () => {
    const cards = makeCards(4);
    const game = startGame(cards, 4);
    game.pair(cards[0].id);
    const result = game.tap(cards[0].id, 'front');
    expect(result.outcome.kind).toBe('ignored');
  });

  it('avisa quando a rodada termina', () => {
    const cards = makeCards(4);
    const game = startGame(cards, 2);
    game.pair(cards[0].id);
    const result = game.pair(cards[1].id);
    expect(result.roundComplete).toBe(true);
    expect(result.gameComplete).toBe(false);
  });

  it('encerra a partida na última rodada', () => {
    const cards = makeCards(2);
    const game = startGame(cards, 2);
    game.pair(cards[0].id);
    const result = game.pair(cards[1].id, 5000);
    expect(result.gameComplete).toBe(true);
    expect(game.state.finishedAt).toBe(5000);
  });

  it('não aceita mais jogadas depois de terminar', () => {
    const cards = makeCards(2);
    const game = startGame(cards, 2);
    game.pair(cards[0].id);
    game.pair(cards[1].id, 5000);
    const state = game.state;
    expect(tapTile(state, state.rounds[0].frontTiles[0]).outcome.kind).toBe('ignored');
  });
});

describe('nextRound', () => {
  it('zera os pares combinados ao avançar', () => {
    const cards = makeCards(4);
    const game = startGame(cards, 2);
    game.pair(cards[0].id);
    game.pair(cards[1].id);
    game.advance();
    expect(game.state.roundIndex).toBe(1);
    expect(game.state.matched).toEqual([]);
    // Os acertos são da partida inteira, não da rodada.
    expect(game.state.hits).toBe(2);
  });

  it('não passa da última rodada', () => {
    const state = createGame(buildRounds(makeCards(2), { pairsPerRound: 2, random: noShuffle }), 0);
    expect(nextRound(state).roundIndex).toBe(0);
  });
});

describe('summarize', () => {
  it('calcula precisão sobre o total de tentativas', () => {
    const cards = makeCards(4);
    const game = startGame(cards, 4);
    game.tap(cards[0].id, 'front');
    game.tap(cards[1].id, 'back'); // erro
    game.pair(cards[0].id);
    const summary = summarize(game.state, 1000);
    expect(summary.hits).toBe(1);
    expect(summary.mistakes).toBe(1);
    expect(summary.accuracy).toBe(0.5);
    expect(summary.durationMs).toBe(1000);
  });

  it('não divide por zero sem tentativas', () => {
    const state: MatchingState = createGame([], 0);
    expect(summarize(state, 0).accuracy).toBe(0);
  });
});

describe('shuffle', () => {
  it('preserva todos os itens', () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffle(items, () => 0.5).sort()).toEqual(items);
  });

  it('não altera o array recebido', () => {
    const items = [1, 2, 3];
    shuffle(items, () => 0.5);
    expect(items).toEqual([1, 2, 3]);
  });
});

describe('constantes', () => {
  it('exige pelo menos dois pares para jogar', () => {
    expect(MIN_CARDS_TO_PLAY).toBeGreaterThanOrEqual(2);
  });
});
