import { buildQueue, computeDeckStats, facesFor, forecast, srsFor, todayCounts } from './queue';
import { createCard, createDeck } from './defaults';
import { createSrsState } from '../srs/scheduler';
import { createId } from '../utils/id';
import type { Card, CardState, Deck, ReviewLog, StudyDirection } from '../types';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 2, 10, 12, 0, 0).getTime();

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return { ...createDeck({ name: 'Teste' }), newPerDay: 10, reviewsPerDay: 0, ...overrides };
}

function makeCard(
  deck: Deck,
  state: CardState,
  dueOffsetMs: number,
  overrides: Partial<Card> = {}
): Card {
  const card = createCard({ deckId: deck.id, front: 'a', back: 'b' });
  return {
    ...card,
    ...overrides,
    srs: { ...createSrsState(NOW), state, due: NOW + dueOffsetMs, intervalDays: 5 },
  };
}

function makeLog(deck: Deck, previousState: CardState, reviewedAt: number): ReviewLog {
  return {
    id: createId('r'),
    cardId: createId('c'),
    deckId: deck.id,
    direction: 'forward' as StudyDirection,
    grade: 'known',
    previousState,
    intervalDays: 1,
    elapsedMs: 1000,
    reviewedAt,
  };
}

describe('buildQueue', () => {
  it('deixa de fora os cards que ainda não venceram', () => {
    const deck = makeDeck();
    const cards = [
      makeCard(deck, 'review', -DAY_MS),
      makeCard(deck, 'review', DAY_MS),
    ];
    const queue = buildQueue(deck, cards, [], NOW);

    expect(queue).toHaveLength(1);
    expect(queue[0].card.id).toBe(cards[0].id);
  });

  it('coloca os cards em aprendizado na frente da fila', () => {
    const deck = makeDeck();
    const review = makeCard(deck, 'review', -2 * DAY_MS);
    const learning = makeCard(deck, 'learning', -MINUTE_MS);
    const queue = buildQueue(deck, [review, learning], [], NOW);

    expect(queue[0].card.id).toBe(learning.id);
  });

  it('respeita o limite diário de cards novos', () => {
    const deck = makeDeck({ newPerDay: 2 });
    const cards = [
      makeCard(deck, 'new', 0),
      makeCard(deck, 'new', 0),
      makeCard(deck, 'new', 0),
      makeCard(deck, 'new', 0),
    ];
    expect(buildQueue(deck, cards, [], NOW)).toHaveLength(2);
  });

  it('desconta os cards novos já introduzidos hoje', () => {
    const deck = makeDeck({ newPerDay: 3 });
    const cards = [makeCard(deck, 'new', 0), makeCard(deck, 'new', 0), makeCard(deck, 'new', 0)];
    const logs = [makeLog(deck, 'new', NOW - 60 * MINUTE_MS), makeLog(deck, 'new', NOW - MINUTE_MS)];

    expect(buildQueue(deck, cards, logs, NOW)).toHaveLength(1);
  });

  it('ignora o histórico de dias anteriores na cota de hoje', () => {
    const deck = makeDeck({ newPerDay: 1 });
    const cards = [makeCard(deck, 'new', 0)];
    const logs = [makeLog(deck, 'new', NOW - 2 * DAY_MS)];

    expect(buildQueue(deck, cards, logs, NOW)).toHaveLength(1);
  });

  it('respeita o limite diário de revisões quando definido', () => {
    const deck = makeDeck({ reviewsPerDay: 2, newPerDay: 0 });
    const cards = [
      makeCard(deck, 'review', -DAY_MS),
      makeCard(deck, 'review', -DAY_MS),
      makeCard(deck, 'review', -DAY_MS),
    ];
    expect(buildQueue(deck, cards, [], NOW)).toHaveLength(2);
  });

  it('não inclui cards pausados', () => {
    const deck = makeDeck();
    const cards = [makeCard(deck, 'review', -DAY_MS, { suspended: true })];
    expect(buildQueue(deck, cards, [], NOW)).toHaveLength(0);
  });

  it('intercala os cards novos entre as revisões', () => {
    const deck = makeDeck({ newPerDay: 2 });
    const reviews = [
      makeCard(deck, 'review', -4 * DAY_MS),
      makeCard(deck, 'review', -3 * DAY_MS),
      makeCard(deck, 'review', -2 * DAY_MS),
      makeCard(deck, 'review', -DAY_MS),
    ];
    const fresh = [makeCard(deck, 'new', 0), makeCard(deck, 'new', 0)];
    const queue = buildQueue(deck, [...reviews, ...fresh], [], NOW);
    const newIds = new Set(fresh.map((card) => card.id));
    const positions = queue
      .map((item, index) => (newIds.has(item.card.id) ? index : -1))
      .filter((index) => index >= 0);

    expect(queue).toHaveLength(6);
    // Nenhum card novo empilhado no fim nem no começo do bloco.
    expect(positions[0]).toBeLessThan(queue.length - 1);
    expect(positions[0]).not.toBe(positions[1]);
  });

  it('só devolve os novos quando não há revisões', () => {
    const deck = makeDeck({ newPerDay: 3 });
    const cards = [makeCard(deck, 'new', 0), makeCard(deck, 'new', 0)];
    expect(buildQueue(deck, cards, [], NOW)).toHaveLength(2);
  });
});

describe('computeDeckStats', () => {
  it('separa novos, aprendendo, revisar e agendados', () => {
    const deck = makeDeck({ newPerDay: 5 });
    const cards = [
      makeCard(deck, 'new', 0),
      makeCard(deck, 'learning', -MINUTE_MS),
      makeCard(deck, 'review', -DAY_MS),
      makeCard(deck, 'review', DAY_MS),
      makeCard(deck, 'review', -DAY_MS, { suspended: true }),
    ];
    const stats = computeDeckStats(deck, cards, [], NOW);

    expect(stats.total).toBe(5);
    expect(stats.newAvailable).toBe(1);
    expect(stats.learningDue).toBe(1);
    expect(stats.reviewDue).toBe(1);
    expect(stats.scheduled).toBe(1);
    expect(stats.suspended).toBe(1);
    expect(stats.readyNow).toBe(3);
  });

  it('zera os novos disponíveis quando a cota do dia acabou', () => {
    const deck = makeDeck({ newPerDay: 1 });
    const cards = [makeCard(deck, 'new', 0), makeCard(deck, 'new', 0)];
    const logs = [makeLog(deck, 'new', NOW - MINUTE_MS)];

    expect(computeDeckStats(deck, cards, logs, NOW).newAvailable).toBe(0);
  });
});

describe('todayCounts', () => {
  it('separa cards novos de revisões feitas hoje', () => {
    const deck = makeDeck();
    const logs = [
      makeLog(deck, 'new', NOW - MINUTE_MS),
      makeLog(deck, 'review', NOW - MINUTE_MS),
      makeLog(deck, 'review', NOW - 2 * DAY_MS),
    ];
    expect(todayCounts(logs, deck.id, NOW)).toEqual({ newIntroduced: 1, reviews: 1 });
  });
});

describe('forecast', () => {
  it('agrupa os vencimentos por dia e joga os atrasados em hoje', () => {
    const deck = makeDeck();
    const cards = [
      makeCard(deck, 'review', -5 * DAY_MS),
      makeCard(deck, 'review', DAY_MS),
      makeCard(deck, 'review', DAY_MS + 60 * MINUTE_MS),
      makeCard(deck, 'new', 0),
    ];
    const buckets = forecast(cards, 7, NOW);

    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toBe(1);
    expect(buckets[1]).toBe(2);
    expect(buckets.reduce((sum, value) => sum + value, 0)).toBe(3);
  });
});

describe('estudo nos dois sentidos', () => {
  it('gera uma entrada por sentido para cada card', () => {
    const deck = makeDeck({ directions: ['forward', 'reverse'], newPerDay: 10 });
    const cards = [makeCard(deck, 'new', 0), makeCard(deck, 'new', 0)];
    const queue = buildQueue(deck, cards, [], NOW);

    expect(queue).toHaveLength(4);
    expect(queue.filter((item) => item.direction === 'forward')).toHaveLength(2);
    expect(queue.filter((item) => item.direction === 'reverse')).toHaveLength(2);
  });

  it('só gera o sentido invertido quando o baralho pede', () => {
    const deck = makeDeck({ directions: ['reverse'], newPerDay: 10 });
    const queue = buildQueue(deck, [makeCard(deck, 'new', 0)], [], NOW);

    expect(queue).toHaveLength(1);
    expect(queue[0].direction).toBe('reverse');
  });

  it('trata o sentido invertido como novo enquanto ele não tem agendamento', () => {
    const deck = makeDeck({ directions: ['forward', 'reverse'] });
    // Card já maduro no sentido normal, mas nunca estudado no invertido.
    const card = makeCard(deck, 'review', DAY_MS);
    expect(srsFor(card, 'forward').state).toBe('review');
    expect(srsFor(card, 'reverse').state).toBe('new');
  });

  it('mantém agendamentos separados por sentido', () => {
    const deck = makeDeck({ directions: ['forward', 'reverse'] });
    const card = {
      ...makeCard(deck, 'review', DAY_MS),
      reverseSrs: { ...createSrsState(NOW), state: 'review' as const, due: NOW - DAY_MS },
    };
    const queue = buildQueue(deck, [card], [], NOW);

    // Só o invertido está vencido; o normal vence só amanhã.
    expect(queue).toHaveLength(1);
    expect(queue[0].direction).toBe('reverse');
  });

  it('conta as duas entradas nas estatísticas do baralho', () => {
    const deck = makeDeck({ directions: ['forward', 'reverse'], newPerDay: 10 });
    const stats = computeDeckStats(deck, [makeCard(deck, 'new', 0)], [], NOW);

    // Um card, mas duas coisas a fazer.
    expect(stats.total).toBe(1);
    expect(stats.newAvailable).toBe(2);
    expect(stats.readyNow).toBe(2);
  });

  it('a cota diária de novos vale para entradas, não para cards', () => {
    const deck = makeDeck({ directions: ['forward', 'reverse'], newPerDay: 3 });
    const cards = [makeCard(deck, 'new', 0), makeCard(deck, 'new', 0)];
    expect(buildQueue(deck, cards, [], NOW)).toHaveLength(3);
  });

  it('conta os dois agendamentos na previsão de revisões', () => {
    const deck = makeDeck({ directions: ['forward', 'reverse'] });
    const card = {
      ...makeCard(deck, 'review', DAY_MS),
      reverseSrs: { ...createSrsState(NOW), state: 'review' as const, due: NOW + DAY_MS },
    };
    const buckets = forecast([card], 7, NOW);

    expect(buckets[1]).toBe(2);
  });

  it('baralho sem o campo de sentidos é tratado como só frente → verso', () => {
    const deck = { ...makeDeck(), directions: undefined as unknown as Deck['directions'] };
    const queue = buildQueue(deck, [makeCard(deck, 'new', 0)], [], NOW);

    expect(queue).toHaveLength(1);
    expect(queue[0].direction).toBe('forward');
  });
});

describe('facesFor', () => {
  it('mostra a frente e responde o verso no sentido normal', () => {
    const deck = makeDeck();
    const card = { ...makeCard(deck, 'new', 0), front: 'hello', back: 'olá' };
    const faces = facesFor(card, 'forward');

    expect(faces.prompt).toBe('hello');
    expect(faces.answer).toBe('olá');
  });

  it('inverte as faces no sentido invertido', () => {
    const deck = makeDeck();
    const card = { ...makeCard(deck, 'new', 0), front: 'hello', back: 'olá' };
    const faces = facesFor(card, 'reverse');

    expect(faces.prompt).toBe('olá');
    expect(faces.answer).toBe('hello');
  });

  it('acompanha o áudio junto da face correspondente', () => {
    const deck = makeDeck();
    const audio = { uri: 'file://a.m4a', durationMs: 100, source: 'recording' as const };
    const card = { ...makeCard(deck, 'new', 0), frontAudio: audio, backAudio: null };

    expect(facesFor(card, 'forward').promptAudio).toBe(audio);
    expect(facesFor(card, 'reverse').answerAudio).toBe(audio);
  });
});
