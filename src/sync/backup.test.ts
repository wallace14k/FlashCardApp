import { BACKUP_VERSION, BackupFormatError, createBackup, mergeBackup, parseBackup, type BackupContents } from './backup';
import { createCard, createDeck, DEFAULT_SETTINGS } from '../store/defaults';
import { createStreakState } from '../streak';
import type { Card, Deck } from '../types';

function contents(overrides: Partial<BackupContents> = {}): BackupContents {
  return {
    decks: [],
    cards: [],
    logs: [],
    streak: createStreakState(),
    settings: DEFAULT_SETTINGS,
    ...overrides,
  };
}

function deckAt(id: string, updatedAt: number): Deck {
  return { ...createDeck({ name: id }), id, updatedAt };
}

function cardAt(id: string, deckId: string, updatedAt: number, front = id): Card {
  return { ...createCard({ deckId, front, back: 'b' }), id, updatedAt };
}

describe('parseBackup', () => {
  it('lê um backup gerado pelo próprio app', () => {
    const backup = createBackup(contents(), 'Android', 1234);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(parsed.createdAt).toBe(1234);
    expect(parsed.device).toBe('Android');
  });

  it('recusa JSON corrompido', () => {
    expect(() => parseBackup('{{{')).toThrow(BackupFormatError);
  });

  it('recusa arquivo que não é backup', () => {
    expect(() => parseBackup(JSON.stringify({ qualquer: 'coisa' }))).toThrow(/não é um backup/);
  });

  it('recusa backup de versão futura em vez de tentar adivinhar', () => {
    const raw = JSON.stringify({ version: 99, decks: [], cards: [] });
    expect(() => parseBackup(raw)).toThrow(/mais nova/);
  });

  it('recusa backup sem baralhos ou cards', () => {
    expect(() => parseBackup(JSON.stringify({ version: 1 }))).toThrow(/incompleto/);
  });
});

describe('mergeBackup', () => {
  it('traz registros que só existem no backup', () => {
    const local = contents();
    const remote = createBackup(
      contents({ decks: [deckAt('d1', 10)], cards: [cardAt('c1', 'd1', 10)] }),
      'outro'
    );
    const report = mergeBackup(local, remote);

    expect(report.contents.decks).toHaveLength(1);
    expect(report.contents.cards).toHaveLength(1);
    expect(report.added).toEqual({ decks: 1, cards: 1 });
  });

  it('não perde o que só existe no aparelho', () => {
    const local = contents({ decks: [deckAt('local', 10)], cards: [cardAt('cl', 'local', 10)] });
    const remote = createBackup(
      contents({ decks: [deckAt('remoto', 10)], cards: [cardAt('cr', 'remoto', 10)] }),
      'outro'
    );
    const report = mergeBackup(local, remote);

    expect(report.contents.decks.map((d) => d.id).sort()).toEqual(['local', 'remoto']);
    expect(report.contents.cards).toHaveLength(2);
  });

  it('em conflito, mantém a versão editada mais recentemente', () => {
    const local = contents({ decks: [deckAt('d1', 100)], cards: [cardAt('c1', 'd1', 100, 'local')] });
    const remote = createBackup(
      contents({ decks: [deckAt('d1', 200)], cards: [cardAt('c1', 'd1', 200, 'remoto')] }),
      'outro'
    );
    const report = mergeBackup(local, remote);

    expect(report.contents.cards[0].front).toBe('remoto');
    expect(report.updated).toEqual({ decks: 1, cards: 1 });
  });

  it('mantém a versão local quando ela é a mais recente', () => {
    const local = contents({ decks: [deckAt('d1', 500)], cards: [cardAt('c1', 'd1', 500, 'local')] });
    const remote = createBackup(
      contents({ decks: [deckAt('d1', 100)], cards: [cardAt('c1', 'd1', 100, 'remoto')] }),
      'outro'
    );
    const report = mergeBackup(local, remote);

    expect(report.contents.cards[0].front).toBe('local');
    expect(report.updated).toEqual({ decks: 0, cards: 0 });
  });

  it('descarta cards cujo baralho não veio junto', () => {
    const remote = createBackup(contents({ decks: [], cards: [cardAt('orfao', 'sumiu', 10)] }), 'outro');
    expect(mergeBackup(contents(), remote).contents.cards).toHaveLength(0);
  });

  it('une os históricos de revisão sem duplicar', () => {
    const log = {
      id: 'r1',
      cardId: 'c1',
      deckId: 'd1',
      grade: 'known' as const,
      previousState: 'review' as const,
      intervalDays: 1,
      elapsedMs: 10,
      reviewedAt: 5,
    };
    const local = contents({ logs: [log] });
    const remote = createBackup(contents({ logs: [log, { ...log, id: 'r2', reviewedAt: 9 }] }), 'outro');
    const merged = mergeBackup(local, remote).contents.logs;

    expect(merged.map((l) => l.id)).toEqual(['r1', 'r2']);
  });

  it('soma a ofensiva pelo maior valor de cada lado', () => {
    const local = contents({
      streak: { ...createStreakState(), current: 3, longest: 5, history: { '2026-08-01': 10 } },
    });
    const remote = createBackup(
      contents({
        streak: { ...createStreakState(), current: 7, longest: 4, history: { '2026-08-02': 20 } },
      }),
      'outro'
    );
    const streak = mergeBackup(local, remote).contents.streak;

    expect(streak.current).toBe(7);
    expect(streak.longest).toBe(5);
    expect(streak.history).toEqual({ '2026-08-01': 10, '2026-08-02': 20 });
  });

  it('preserva as preferências do aparelho', () => {
    const local = contents({ settings: { ...DEFAULT_SETTINGS, hapticsEnabled: false } });
    const remote = createBackup(
      contents({ settings: { ...DEFAULT_SETTINGS, hapticsEnabled: true } }),
      'outro'
    );
    expect(mergeBackup(local, remote).contents.settings.hapticsEnabled).toBe(false);
  });
});
