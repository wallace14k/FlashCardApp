import type { Card } from '../types';

/**
 * Modo Combinar.
 *
 * Uma rodada mostra duas colunas: de um lado as frentes (por exemplo, inglês),
 * do outro os versos embaralhados (português). O usuário toca em um de cada
 * lado para formar o par.
 *
 * É treino de reconhecimento, não de evocação — bem mais fácil que responder
 * um card de cabeça. Por isso ele **não mexe no agendamento**: deixar o modo
 * Combinar empurrar intervalos para frente faria o app achar que você sabe
 * mais do que sabe. Ele conta como atividade do dia (alimenta a ofensiva), e
 * só.
 */

/** Quantos pares uma rodada mostra, quando há cards suficientes. */
export const PAIRS_PER_ROUND = 5;
/** Mínimo de cards para o modo fazer sentido. */
export const MIN_CARDS_TO_PLAY = 4;

export type Side = 'front' | 'back';

export interface Tile {
  /** Identificador do quadrado, único dentro da rodada. */
  id: string;
  /** Card de origem — é o que define o par. */
  cardId: string;
  side: Side;
  text: string;
}

export interface Round {
  index: number;
  frontTiles: Tile[];
  backTiles: Tile[];
}

export interface MatchingState {
  rounds: Round[];
  roundIndex: number;
  /** Quadrado selecionado aguardando o par, se houver. */
  selected: Tile | null;
  /** Ids dos cards já combinados na rodada atual. */
  matched: string[];
  /** Erros cometidos na partida inteira. */
  mistakes: number;
  /** Pares acertados na partida inteira. */
  hits: number;
  startedAt: number;
  finishedAt: number | null;
}

/** Resultado de tocar em um quadrado. */
export type TapOutcome =
  | { kind: 'selected' }
  | { kind: 'deselected' }
  | { kind: 'match'; cardId: string }
  | { kind: 'miss'; selected: Tile; attempted: Tile }
  | { kind: 'ignored' };

export interface TapResult {
  state: MatchingState;
  outcome: TapOutcome;
  /** A rodada terminou com esta jogada. */
  roundComplete: boolean;
  /** A partida inteira terminou. */
  gameComplete: boolean;
}

/** Embaralhamento de Fisher-Yates, com sorteio injetável para os testes. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Divide os cards em rodadas de até `PAIRS_PER_ROUND` pares. Cada coluna é
 * embaralhada por conta própria, senão os pares ficariam lado a lado.
 */
export function buildRounds(
  cards: Card[],
  options: { pairsPerRound?: number; random?: () => number } = {}
): Round[] {
  const pairsPerRound = options.pairsPerRound ?? PAIRS_PER_ROUND;
  const random = options.random ?? Math.random;

  const playable = cards.filter((card) => !card.suspended && card.front.trim() && card.back.trim());
  const ordered = shuffle(playable, random);

  const rounds: Round[] = [];
  for (let start = 0; start < ordered.length; start += pairsPerRound) {
    const slice = ordered.slice(start, start + pairsPerRound);
    // Uma rodada com um par só não é um jogo — melhor deixar de fora.
    if (slice.length < 2) break;

    rounds.push({
      index: rounds.length,
      frontTiles: shuffle(
        slice.map((card) => ({
          id: `${card.id}:front`,
          cardId: card.id,
          side: 'front' as const,
          text: card.front,
        })),
        random
      ),
      backTiles: shuffle(
        slice.map((card) => ({
          id: `${card.id}:back`,
          cardId: card.id,
          side: 'back' as const,
          text: card.back,
        })),
        random
      ),
    });
  }
  return rounds;
}

export function createGame(rounds: Round[], now = Date.now()): MatchingState {
  return {
    rounds,
    roundIndex: 0,
    selected: null,
    matched: [],
    mistakes: 0,
    hits: 0,
    startedAt: now,
    finishedAt: null,
  };
}

export function currentRound(state: MatchingState): Round | null {
  return state.rounds[state.roundIndex] ?? null;
}

/** `true` se o card já foi combinado na rodada atual. */
export function isMatched(state: MatchingState, cardId: string): boolean {
  return state.matched.includes(cardId);
}

/**
 * Processa o toque em um quadrado. Função pura: devolve o novo estado.
 *
 * As regras: tocar em um quadrado já combinado não faz nada; tocar duas vezes
 * no mesmo quadrado desmarca; tocar em outro do mesmo lado troca a seleção
 * (em vez de contar erro, que seria punir uma correção de ideia); e só o
 * cruzamento de lados diferentes vale como tentativa.
 */
export function tapTile(state: MatchingState, tile: Tile, now = Date.now()): TapResult {
  const round = currentRound(state);
  const inert: TapResult = {
    state,
    outcome: { kind: 'ignored' },
    roundComplete: false,
    gameComplete: false,
  };

  if (!round || state.finishedAt !== null) return inert;
  if (isMatched(state, tile.cardId)) return inert;

  const selected = state.selected;

  if (!selected) {
    return {
      state: { ...state, selected: tile },
      outcome: { kind: 'selected' },
      roundComplete: false,
      gameComplete: false,
    };
  }

  if (selected.id === tile.id) {
    return {
      state: { ...state, selected: null },
      outcome: { kind: 'deselected' },
      roundComplete: false,
      gameComplete: false,
    };
  }

  // Mesmo lado: é troca de escolha, não tentativa de par.
  if (selected.side === tile.side) {
    return {
      state: { ...state, selected: tile },
      outcome: { kind: 'selected' },
      roundComplete: false,
      gameComplete: false,
    };
  }

  if (selected.cardId !== tile.cardId) {
    return {
      state: { ...state, selected: null, mistakes: state.mistakes + 1 },
      outcome: { kind: 'miss', selected, attempted: tile },
      roundComplete: false,
      gameComplete: false,
    };
  }

  // Acertou o par.
  const matched = [...state.matched, tile.cardId];
  const roundComplete = matched.length === round.frontTiles.length;
  const isLastRound = state.roundIndex === state.rounds.length - 1;
  const gameComplete = roundComplete && isLastRound;

  return {
    state: {
      ...state,
      selected: null,
      matched,
      hits: state.hits + 1,
      finishedAt: gameComplete ? now : null,
    },
    outcome: { kind: 'match', cardId: tile.cardId },
    roundComplete,
    gameComplete,
  };
}

/** Passa para a próxima rodada, zerando os pares combinados. */
export function nextRound(state: MatchingState): MatchingState {
  if (state.roundIndex >= state.rounds.length - 1) return state;
  return { ...state, roundIndex: state.roundIndex + 1, matched: [], selected: null };
}

export interface MatchingSummary {
  pairs: number;
  hits: number;
  mistakes: number;
  /** Entre 0 e 1: acertos sobre o total de tentativas. */
  accuracy: number;
  durationMs: number;
}

export function summarize(state: MatchingState, now = Date.now()): MatchingSummary {
  const attempts = state.hits + state.mistakes;
  return {
    pairs: state.rounds.reduce((total, round) => total + round.frontTiles.length, 0),
    hits: state.hits,
    mistakes: state.mistakes,
    accuracy: attempts > 0 ? state.hits / attempts : 0,
    durationMs: (state.finishedAt ?? now) - state.startedAt,
  };
}
