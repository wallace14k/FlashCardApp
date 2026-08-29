import { deckColors, deckEmojis } from '../theme';
import {
  IMPORT_FORMAT_VERSION,
  IMPORT_LIMITS,
  type ImportError,
  type ImportWarning,
  type ParseResult,
  type ValidatedCard,
} from './format';

/**
 * Leitura e validação de um arquivo de importação.
 *
 * A postura é: recusar o que está estruturalmente errado, e consertar
 * silenciosamente (avisando) o que é só desleixo — espaços sobrando, campos
 * vazios, texto comprido demais. Um arquivo gerado por um assistente quase
 * sempre cai no segundo caso, e não faz sentido rejeitar 60 cards bons porque
 * um deles veio com uma dica de 200 caracteres.
 */

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function truncate(
  value: string,
  max: number,
  label: string,
  index: number,
  warnings: ImportWarning[]
): string {
  if (value.length <= max) return value;
  warnings.push({ message: `${label} passava de ${max} caracteres e foi cortado.`, cardIndex: index });
  return value.slice(0, max).trimEnd();
}

export function parseImportFile(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      errors: [{ message: 'O arquivo não é um JSON válido. Verifique se foi salvo corretamente.' }],
    };
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, errors: [{ message: 'O arquivo precisa conter um objeto JSON.' }] };
  }

  const file = data as Record<string, unknown>;
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];

  const version = file.linguacards;
  if (typeof version !== 'number') {
    return {
      ok: false,
      errors: [
        {
          message:
            'Este não parece ser um arquivo do LinguaCards: falta o campo "linguacards" com a versão do formato.',
        },
      ],
    };
  }
  if (version > IMPORT_FORMAT_VERSION) {
    return {
      ok: false,
      errors: [
        {
          message: `O arquivo usa a versão ${version} do formato, e este app entende até a ${IMPORT_FORMAT_VERSION}. Atualize o app.`,
        },
      ],
    };
  }

  // Cabeçalho do baralho.
  const rawDeck = (file.deck ?? {}) as Record<string, unknown>;
  const deckName = asString(rawDeck.name);
  if (!deckName) {
    errors.push({ message: 'O baralho precisa de um nome ("deck.name").' });
  }

  const emoji = asString(rawDeck.emoji);
  const color = asString(rawDeck.color);
  // Uma cor fora do formato hexadecimal quebraria a estilização; melhor cair
  // no padrão do que pintar a interface com lixo.
  const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : deckColors[0];
  if (color && validColor !== color) {
    warnings.push({ message: `A cor "${color}" não é um hexadecimal válido; usamos a cor padrão.` });
  }

  // Cards.
  const rawCards = file.cards;
  if (!Array.isArray(rawCards)) {
    errors.push({ message: 'O arquivo precisa de uma lista "cards".' });
    return { ok: false, errors };
  }
  if (rawCards.length === 0) {
    errors.push({ message: 'A lista de cards está vazia.' });
    return { ok: false, errors };
  }
  if (rawCards.length > IMPORT_LIMITS.maxCards) {
    errors.push({
      message: `O arquivo tem ${rawCards.length} cards, acima do limite de ${IMPORT_LIMITS.maxCards} por importação.`,
    });
    return { ok: false, errors };
  }

  const cards: ValidatedCard[] = [];
  const seen = new Set<string>();

  rawCards.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      warnings.push({ message: 'Item ignorado: não é um card.', cardIndex: index });
      return;
    }
    const card = entry as Record<string, unknown>;
    const front = asString(card.front);
    const back = asString(card.back);

    if (!front || !back) {
      warnings.push({
        message: 'Card ignorado: precisa ter frente e verso preenchidos.',
        cardIndex: index,
      });
      return;
    }

    // Duplicatas dentro do próprio arquivo viram um card só — importar o
    // mesmo conteúdo duas vezes só atrapalha o agendamento depois.
    const key = `${front.toLowerCase()}|${back.toLowerCase()}`;
    if (seen.has(key)) {
      warnings.push({ message: `Card repetido ignorado: "${front}".`, cardIndex: index });
      return;
    }
    seen.add(key);

    const tags = Array.isArray(card.tags)
      ? card.tags.map(asString).filter((tag) => tag.length > 0)
      : [];

    cards.push({
      front: truncate(front, IMPORT_LIMITS.maxTextLength, 'A frente', index, warnings),
      back: truncate(back, IMPORT_LIMITS.maxTextLength, 'O verso', index, warnings),
      hint: asString(card.hint)
        ? truncate(asString(card.hint), IMPORT_LIMITS.maxHintLength, 'A dica', index, warnings)
        : undefined,
      example: asString(card.example)
        ? truncate(
            asString(card.example),
            IMPORT_LIMITS.maxExampleLength,
            'O exemplo',
            index,
            warnings
          )
        : undefined,
      tags,
    });
  });

  if (cards.length === 0) {
    errors.push({ message: 'Nenhum card do arquivo pôde ser aproveitado.' });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    warnings,
    preview: {
      deck: {
        name: truncate(deckName, IMPORT_LIMITS.maxDeckNameLength, 'O nome do baralho', -1, warnings),
        description: asString(rawDeck.description) || undefined,
        emoji: emoji || deckEmojis[0],
        color: validColor,
      },
      cards,
    },
  };
}
