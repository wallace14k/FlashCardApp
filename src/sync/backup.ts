import type { Card, Deck, ReviewLog, Settings, StreakState } from '../types';

/**
 * Formato do backup e a regra de fusão entre dois aparelhos.
 *
 * O backup carrega tudo que o app guarda, menos os arquivos de áudio: eles
 * podem ter dezenas de megabytes e o espaço reservado ao app no Drive é
 * pequeno. As referências de áudio viajam junto; na restauração, as que
 * apontam para arquivos inexistentes são descartadas.
 */

export const BACKUP_VERSION = 1;

export interface Backup {
  version: number;
  /** Quando o backup foi gerado (epoch ms). */
  createdAt: number;
  /** Identificador do aparelho que gerou, só para exibição. */
  device: string;
  decks: Deck[];
  cards: Card[];
  logs: ReviewLog[];
  streak: StreakState;
  settings: Settings;
}

export interface BackupContents {
  decks: Deck[];
  cards: Card[];
  logs: ReviewLog[];
  streak: StreakState;
  settings: Settings;
}

export function createBackup(contents: BackupContents, device: string, now = Date.now()): Backup {
  return { version: BACKUP_VERSION, createdAt: now, device, ...contents };
}

export class BackupFormatError extends Error {}

/** Lê e valida o JSON de um backup vindo do Drive. */
export function parseBackup(raw: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new BackupFormatError('O backup no Drive está corrompido e não pôde ser lido.');
  }

  const backup = data as Partial<Backup>;
  if (typeof backup?.version !== 'number') {
    throw new BackupFormatError('O arquivo encontrado no Drive não é um backup do LinguaCards.');
  }
  if (backup.version > BACKUP_VERSION) {
    throw new BackupFormatError(
      `O backup foi criado por uma versão mais nova do app (formato ${backup.version}). Atualize o LinguaCards.`
    );
  }
  if (!Array.isArray(backup.decks) || !Array.isArray(backup.cards)) {
    throw new BackupFormatError('O backup está incompleto: faltam baralhos ou cards.');
  }

  return {
    version: backup.version,
    createdAt: backup.createdAt ?? 0,
    device: backup.device ?? 'desconhecido',
    decks: backup.decks,
    cards: backup.cards,
    logs: Array.isArray(backup.logs) ? backup.logs : [],
    streak: backup.streak as StreakState,
    settings: backup.settings as Settings,
  };
}

/** Une duas listas por `id`, mantendo o registro alterado mais recentemente. */
function mergeById<T extends { id: string; updatedAt: number }>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export interface MergeReport {
  contents: BackupContents;
  /** Registros que existiam só no backup e entraram agora. */
  added: { decks: number; cards: number };
  /** Registros presentes nos dois lados em que o backup era mais recente. */
  updated: { decks: number; cards: number };
}

/**
 * Funde o backup com o estado local.
 *
 * A regra é "quem foi editado por último vence", por registro — não pelo
 * arquivo inteiro. Isso importa: sobrescrever tudo faria você perder os cards
 * criados no celular desde o último envio. Nada é apagado, porque não há como
 * distinguir "apagado em um aparelho" de "criado no outro" sem guardar
 * lápides, o que fica para uma versão futura.
 */
export function mergeBackup(local: BackupContents, remote: Backup): MergeReport {
  const localDeckIds = new Set(local.decks.map((deck) => deck.id));
  const localCardIds = new Set(local.cards.map((card) => card.id));

  const decks = mergeById(local.decks, remote.decks);
  const cards = mergeById(local.cards, remote.cards);

  // Cards órfãos (o baralho não veio junto) seriam invisíveis no app.
  const deckIds = new Set(decks.map((deck) => deck.id));
  const usableCards = cards.filter((card) => deckIds.has(card.deckId));

  const logIds = new Set(local.logs.map((log) => log.id));
  const logs = [...local.logs, ...remote.logs.filter((log) => !logIds.has(log.id))].sort(
    (a, b) => a.reviewedAt - b.reviewedAt
  );

  return {
    contents: {
      decks,
      cards: usableCards,
      logs,
      // A ofensiva é do usuário, não do aparelho: fica a maior de cada campo.
      streak: mergeStreak(local.streak, remote.streak),
      // Preferências são do aparelho; as locais mandam.
      settings: local.settings,
    },
    added: {
      decks: decks.filter((deck) => !localDeckIds.has(deck.id)).length,
      cards: usableCards.filter((card) => !localCardIds.has(card.id)).length,
    },
    updated: {
      decks: remote.decks.filter((deck) => {
        const current = local.decks.find((item) => item.id === deck.id);
        return current != null && deck.updatedAt > current.updatedAt;
      }).length,
      cards: remote.cards.filter((card) => {
        const current = local.cards.find((item) => item.id === card.id);
        return current != null && card.updatedAt > current.updatedAt;
      }).length,
    },
  };
}

/**
 * Funde as ofensivas somando a atividade de cada dia — estudar em dois
 * aparelhos no mesmo dia deve contar como um dia só de esforço somado.
 */
function mergeStreak(local: StreakState, remote: StreakState | undefined): StreakState {
  if (!remote) return local;

  const history: Record<string, number> = { ...local.history };
  for (const [day, count] of Object.entries(remote.history ?? {})) {
    history[day] = Math.max(history[day] ?? 0, count);
  }

  const lastGoalDay = [local.lastGoalDay, remote.lastGoalDay]
    .filter((day): day is string => Boolean(day))
    .sort()
    .pop() ?? null;

  return {
    ...local,
    current: Math.max(local.current, remote.current ?? 0),
    longest: Math.max(local.longest, remote.longest ?? 0),
    freezes: Math.max(local.freezes, remote.freezes ?? 0),
    lastGoalDay,
    lastStudyDay:
      [local.lastStudyDay, remote.lastStudyDay]
        .filter((day): day is string => Boolean(day))
        .sort()
        .pop() ?? null,
    history,
  };
}
