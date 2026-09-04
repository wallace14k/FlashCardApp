/**
 * Conferência da resposta digitada.
 *
 * A régua é deliberadamente frouxa. O objetivo do modo digitação é forçar a
 * evocação — puxar a resposta da memória em vez de só reconhecê-la ao virar a
 * carta. Reprovar alguém por um acento ou por trocar duas letras não mede
 * memória, mede digitação, e ainda desestimula a usar o modo.
 *
 * O que a comparação ignora: maiúsculas, acentos, pontuação, espaços
 * repetidos e artigos soltos no começo ("o", "a", "the", "el"). O que ela não
 * ignora: trocar a palavra.
 */

export type Verdict = 'exact' | 'close' | 'wrong';

export interface CheckResult {
  verdict: Verdict;
  /** Distância de edição entre o que foi digitado e a alternativa mais próxima. */
  distance: number;
  /** A alternativa aceita que ficou mais perto do que foi digitado. */
  closest: string;
}

/** Artigos ignorados no começo da resposta. */
const LEADING_ARTICLES = ['o', 'a', 'os', 'as', 'um', 'uma', 'the', 'el', 'la', 'le', 'les', 'to'];

/**
 * Reduz o texto ao que interessa comparar: minúsculas, sem acentos, sem
 * pontuação e sem espaço sobrando.
 */
export function normalize(text: string): string {
  const stripped = text
    .normalize('NFD')
    // Remove os sinais diacríticos separados pela normalização.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = stripped.split(' ');
  if (words.length > 1 && LEADING_ARTICLES.includes(words[0])) {
    return words.slice(1).join(' ');
  }
  return stripped;
}

/**
 * Separa as respostas aceitas de um verso. "adiar / postergar" vale como duas
 * alternativas, e acertar qualquer uma conta como acerto.
 */
export function acceptedAnswers(expected: string): string[] {
  return expected
    .split(/[/;]|,\s(?=\S)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Distância de Levenshtein, com duas linhas em vez da matriz inteira. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

/**
 * Quantos erros de digitação são tolerados numa resposta desse tamanho.
 * Cresce com o comprimento — errar uma letra em "adiar" pesa mais do que numa
 * frase de trinta caracteres — mas nunca a ponto de aceitar outra palavra.
 */
export function tolerance(length: number): number {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  return Math.min(3, Math.floor(length / 8) + 1);
}

export function checkAnswer(typed: string, expected: string): CheckResult {
  const normalizedTyped = normalize(typed);
  const alternatives = acceptedAnswers(expected).map(normalize).filter(Boolean);

  if (alternatives.length === 0) {
    return { verdict: 'wrong', distance: normalizedTyped.length, closest: expected };
  }

  let best = { distance: Number.MAX_SAFE_INTEGER, alternative: alternatives[0] };
  for (const alternative of alternatives) {
    const distance = editDistance(normalizedTyped, alternative);
    if (distance < best.distance) best = { distance, alternative };
  }

  const verdict: Verdict =
    best.distance === 0
      ? 'exact'
      : best.distance <= tolerance(best.alternative.length)
        ? 'close'
        : 'wrong';

  return { verdict, distance: best.distance, closest: best.alternative };
}

/**
 * Resposta sugerida a partir do que foi digitado. É só uma sugestão: quem
 * decide continua sendo o usuário, porque só ele sabe se hesitou.
 */
export function suggestedGrade(verdict: Verdict): 'forgot' | 'partial' | 'known' {
  if (verdict === 'exact') return 'known';
  if (verdict === 'close') return 'partial';
  return 'forgot';
}
