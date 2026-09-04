import { createSrsState } from '../srs/scheduler';
import { dayKey } from '../utils/date';
import type { Card, Deck, ReviewLog, SrsState, StudyDirection } from '../types';

/**
 * Uma entrada da fila: um card em um sentido específico. Com o baralho
 * estudando nos dois sentidos, o mesmo card aparece duas vezes, cada uma com
 * seu próprio agendamento.
 */
export interface QueueItem {
  card: Card;
  direction: StudyDirection;
}

/** Agendamento do card no sentido pedido. */
export function srsFor(card: Card, direction: StudyDirection): SrsState {
  if (direction === 'forward') return card.srs;
  // Um baralho que acabou de ligar o sentido invertido tem cards sem esse
  // agendamento; eles entram como novos, que é o que de fato são nesse sentido.
  return card.reverseSrs ?? createSrsState(card.createdAt);
}

/** O que é mostrado primeiro e o que é a resposta, conforme o sentido. */
export function facesFor(card: Card, direction: StudyDirection) {
  return direction === 'forward'
    ? { prompt: card.front, answer: card.back, promptAudio: card.frontAudio, answerAudio: card.backAudio }
    : { prompt: card.back, answer: card.front, promptAudio: card.backAudio, answerAudio: card.frontAudio };
}

/** Números exibidos no cartão do baralho e no cabeçalho do treino. */
export interface DeckStats {
  total: number;
  /** Cards nunca vistos e ainda dentro da cota de novos do dia. */
  newAvailable: number;
  /** Cards em aprendizado/reaprendizado prontos agora. */
  learningDue: number;
  /** Cards em revisão prontos agora. */
  reviewDue: number;
  /** Total pronto para estudar agora, já respeitando os limites diários. */
  readyNow: number;
  /** Cards que ainda não venceram. */
  scheduled: number;
  suspended: number;
}

function isLearningState(srs: SrsState): boolean {
  return srs.state === 'learning' || srs.state === 'relearning';
}

/** Todas as combinações de card e sentido que o baralho estuda. */
function expand(deck: Deck, cards: Card[]): QueueItem[] {
  const directions = deck.directions?.length ? deck.directions : (['forward'] as StudyDirection[]);
  return cards.flatMap((card) => directions.map((direction) => ({ card, direction })));
}

/** Quantos cards novos e quantas revisões já foram feitos hoje neste baralho. */
export function todayCounts(logs: ReviewLog[], deckId: string, now = Date.now()) {
  const today = dayKey(now);
  let newIntroduced = 0;
  let reviews = 0;
  for (const log of logs) {
    if (log.deckId !== deckId) continue;
    if (dayKey(log.reviewedAt) !== today) continue;
    if (log.previousState === 'new') newIntroduced += 1;
    else reviews += 1;
  }
  return { newIntroduced, reviews };
}

export function computeDeckStats(
  deck: Deck,
  cards: Card[],
  logs: ReviewLog[],
  now = Date.now()
): DeckStats {
  const deckCards = cards.filter((card) => card.deckId === deck.id);
  const active = deckCards.filter((card) => !card.suspended);
  const { newIntroduced, reviews } = todayCounts(logs, deck.id, now);

  // As contagens são por entrada da fila, não por card: nos dois sentidos, um
  // card com frente e verso vencidos é duas coisas a fazer, não uma.
  const items = expand(deck, active);
  const newCards = items.filter((item) => srsFor(item.card, item.direction).state === 'new');
  const learningDue = items.filter((item) => {
    const srs = srsFor(item.card, item.direction);
    return isLearningState(srs) && srs.due <= now;
  });
  const reviewDue = items.filter((item) => {
    const srs = srsFor(item.card, item.direction);
    return srs.state === 'review' && srs.due <= now;
  });

  const newQuota = Math.max(0, deck.newPerDay - newIntroduced);
  const reviewQuota =
    deck.reviewsPerDay > 0 ? Math.max(0, deck.reviewsPerDay - reviews) : Number.MAX_SAFE_INTEGER;

  const newAvailable = Math.min(newCards.length, newQuota);
  // Cards em aprendizado não consomem a cota: eles já foram introduzidos hoje.
  const reviewAllowed = Math.min(reviewDue.length, reviewQuota);

  return {
    total: deckCards.length,
    newAvailable,
    learningDue: learningDue.length,
    reviewDue: reviewAllowed,
    readyNow: newAvailable + learningDue.length + reviewAllowed,
    scheduled: items.filter((item) => {
      const srs = srsFor(item.card, item.direction);
      return srs.due > now && srs.state !== 'new';
    }).length,
    suspended: deckCards.length - active.length,
  };
}

/**
 * Monta a fila de um treino.
 *
 * Ordem: primeiro o que está em aprendizado (o usuário acabou de errar e
 * precisa revisitar), depois as revisões vencidas, com os cards novos
 * intercalados em vez de empilhados no fim — assim o treino não vira um
 * bloco de conteúdo inédito seguido de outro de revisão.
 */
export function buildQueue(
  deck: Deck,
  cards: Card[],
  logs: ReviewLog[],
  now = Date.now()
): QueueItem[] {
  const active = cards.filter((card) => card.deckId === deck.id && !card.suspended);
  const items = expand(deck, active);
  const { newIntroduced, reviews } = todayCounts(logs, deck.id, now);

  const newQuota = Math.max(0, deck.newPerDay - newIntroduced);
  const reviewQuota =
    deck.reviewsPerDay > 0 ? Math.max(0, deck.reviewsPerDay - reviews) : Number.MAX_SAFE_INTEGER;

  const byDue = (a: QueueItem, b: QueueItem) =>
    srsFor(a.card, a.direction).due - srsFor(b.card, b.direction).due;

  const learning = items
    .filter((item) => {
      const srs = srsFor(item.card, item.direction);
      return isLearningState(srs) && srs.due <= now;
    })
    .sort(byDue);

  const review = items
    .filter((item) => {
      const srs = srsFor(item.card, item.direction);
      return srs.state === 'review' && srs.due <= now;
    })
    .sort(byDue)
    .slice(0, reviewQuota);

  const fresh = items
    .filter((item) => srsFor(item.card, item.direction).state === 'new')
    .sort((a, b) => a.card.createdAt - b.card.createdAt)
    .slice(0, newQuota);

  return [...learning, ...interleave(review, fresh)];
}

/**
 * Distribui os cards novos uniformemente entre as revisões.
 * Sem revisões, devolve apenas os novos.
 */
function interleave(review: QueueItem[], fresh: QueueItem[]): QueueItem[] {
  if (fresh.length === 0) return review;
  if (review.length === 0) return fresh;

  const result: QueueItem[] = [];
  const gap = review.length / fresh.length;
  let nextNewAt = gap;
  let freshIndex = 0;

  review.forEach((card, index) => {
    result.push(card);
    while (freshIndex < fresh.length && index + 1 >= nextNewAt) {
      result.push(fresh[freshIndex]);
      freshIndex += 1;
      nextNewAt += gap;
    }
  });

  // Sobras (arredondamento) vão para o fim.
  return [...result, ...fresh.slice(freshIndex)];
}

/**
 * Previsão de quantos cards vencem em cada um dos próximos `days` dias.
 * Alimenta o gráfico da tela de estatísticas.
 */
export function forecast(cards: Card[], days = 7, now = Date.now()): number[] {
  const DAY = 24 * 60 * 60 * 1000;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const base = start.getTime();

  const buckets = new Array<number>(days).fill(0);
  for (const card of cards) {
    if (card.suspended) continue;
    // Conta os dois agendamentos: no sentido invertido o card volta em outro
    // dia, e omitir isso subestimaria a carga futura.
    for (const srs of [card.srs, card.reverseSrs]) {
      if (!srs || srs.state === 'new') continue;
      const index = Math.floor((srs.due - base) / DAY);
      if (index < 0) buckets[0] += 1;
      else if (index < days) buckets[index] += 1;
    }
  }
  return buckets;
}
