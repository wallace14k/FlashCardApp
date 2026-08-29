import type { Card, Deck } from '../types';

/**
 * Formato de arquivo de importação do LinguaCards.
 *
 * É JSON puro, legível e fácil de gerar — inclusive por um assistente, que é
 * o caso de uso principal: você descreve um tema e recebe o arquivo pronto
 * para importar. O formato é deliberadamente pequeno; tudo que diz respeito ao
 * agendamento (intervalos, facilidade, histórico) é criado pelo app na
 * importação, nunca vem do arquivo.
 */

/** Versão atual do formato. Arquivos de versões futuras são recusados. */
export const IMPORT_FORMAT_VERSION = 1;

export interface ImportCard {
  /** Frente do card: a palavra, frase ou pergunta. */
  front: string;
  /** Verso: a tradução ou resposta. */
  back: string;
  /** Dica opcional, exibida antes da resposta. */
  hint?: string;
  /** Exemplo ou diálogo, exibido junto da resposta. */
  example?: string;
  tags?: string[];
}

export interface ImportDeck {
  name: string;
  description?: string;
  emoji?: string;
  color?: string;
}

export interface ImportFile {
  /** Marca d'água do formato; também serve para reconhecer o arquivo. */
  linguacards: number;
  deck: ImportDeck;
  cards: ImportCard[];
}

/** Limites de sanidade, para um arquivo malformado não travar o app. */
export const IMPORT_LIMITS = {
  maxCards: 500,
  maxTextLength: 300,
  maxExampleLength: 500,
  maxHintLength: 140,
  maxDeckNameLength: 60,
} as const;

/** Card já validado, pronto para virar um `Card` do app. */
export type ValidatedCard = Required<Pick<ImportCard, 'front' | 'back'>> &
  Pick<ImportCard, 'hint' | 'example'> & { tags: string[] };

export interface ImportPreview {
  deck: ImportDeck;
  cards: ValidatedCard[];
}

/** Problema que impede a importação. */
export interface ImportError {
  message: string;
  /** Índice do card, quando o problema é de um card específico. */
  cardIndex?: number;
}

/** Ajuste silencioso feito na leitura — o arquivo é aceito mesmo assim. */
export interface ImportWarning {
  message: string;
  cardIndex?: number;
}

export type ParseResult =
  | { ok: true; preview: ImportPreview; warnings: ImportWarning[] }
  | { ok: false; errors: ImportError[] };

/** Molde usado pela documentação e pela skill que gera os arquivos. */
export function exampleImportFile(): ImportFile {
  return {
    linguacards: IMPORT_FORMAT_VERSION,
    deck: {
      name: 'Inglês — verbos frasais',
      description: 'Os verbos frasais mais comuns em conversa do dia a dia.',
      emoji: '🇺🇸',
      color: '#5B8DEF',
    },
    cards: [
      {
        front: 'to put off',
        back: 'adiar',
        hint: 'Pense em empurrar algo para longe no tempo',
        example: '— We should put off the meeting until Monday.\n— Agreed, nobody is ready.',
        tags: ['verbo frasal'],
      },
    ],
  };
}

/** Converte um card validado no formato de entrada de `createCard`. */
export function toCardInput(
  card: ValidatedCard,
  deckId: string
): Pick<Card, 'front' | 'back'> & Partial<Card> & { deckId: string } {
  return {
    deckId,
    front: card.front,
    back: card.back,
    hint: card.hint,
    example: card.example,
    tags: card.tags,
  };
}

/** Converte o cabeçalho do arquivo no formato de entrada de `createDeck`. */
export function toDeckInput(deck: ImportDeck): Partial<Deck> & { name: string } {
  return {
    name: deck.name,
    description: deck.description,
    emoji: deck.emoji,
    color: deck.color,
  };
}
