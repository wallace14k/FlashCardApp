import { acceptedAnswers, checkAnswer, editDistance, normalize, suggestedGrade, tolerance } from './check';

describe('normalize', () => {
  it('ignora maiúsculas e acentos', () => {
    expect(normalize('Não Lembro')).toBe(normalize('nao lembro'));
    expect(normalize('CAFÉ')).toBe('cafe');
  });

  it('ignora pontuação e espaço sobrando', () => {
    expect(normalize('  o  gato,  preto! ')).toBe('gato preto');
  });

  it('descarta artigo solto no começo', () => {
    expect(normalize('the house')).toBe('house');
    expect(normalize('a casa')).toBe('casa');
    expect(normalize('to put off')).toBe('put off');
  });

  it('não descarta o artigo quando ele é a resposta inteira', () => {
    expect(normalize('the')).toBe('the');
  });
});

describe('acceptedAnswers', () => {
  it('separa alternativas por barra e ponto e vírgula', () => {
    expect(acceptedAnswers('adiar / postergar')).toEqual(['adiar', 'postergar']);
    expect(acceptedAnswers('adiar; postergar')).toEqual(['adiar', 'postergar']);
  });

  it('separa por vírgula seguida de espaço', () => {
    expect(acceptedAnswers('adiar, postergar')).toEqual(['adiar', 'postergar']);
  });

  it('mantém como uma só quando não há separador', () => {
    expect(acceptedAnswers('estou ansioso por isso')).toEqual(['estou ansioso por isso']);
  });
});

describe('editDistance', () => {
  it('é zero para textos iguais', () => {
    expect(editDistance('casa', 'casa')).toBe(0);
  });

  it('conta substituição, inserção e remoção', () => {
    expect(editDistance('casa', 'cara')).toBe(1);
    expect(editDistance('casa', 'casas')).toBe(1);
    expect(editDistance('casa', 'cas')).toBe(1);
  });

  it('lida com texto vazio', () => {
    expect(editDistance('', 'casa')).toBe(4);
    expect(editDistance('casa', '')).toBe(4);
  });
});

describe('tolerance', () => {
  it('não tolera erro em resposta muito curta', () => {
    expect(tolerance(3)).toBe(0);
  });

  it('cresce com o tamanho, mas com teto', () => {
    expect(tolerance(6)).toBe(1);
    expect(tolerance(20)).toBeGreaterThanOrEqual(2);
    expect(tolerance(200)).toBe(3);
  });
});

describe('checkAnswer', () => {
  it('aceita a resposta exata', () => {
    expect(checkAnswer('adiar', 'adiar').verdict).toBe('exact');
  });

  it('aceita diferença só de acento ou maiúscula', () => {
    expect(checkAnswer('nao lembro', 'Não lembro').verdict).toBe('exact');
  });

  it('aceita erro de digitação como quase', () => {
    expect(checkAnswer('postergarr', 'postergar').verdict).toBe('close');
  });

  it('recusa palavra diferente', () => {
    expect(checkAnswer('lembrar', 'adiar').verdict).toBe('wrong');
  });

  it('não perdoa erro em resposta curta', () => {
    expect(checkAnswer('cada', 'casa').verdict).toBe('wrong');
  });

  it('aceita qualquer uma das alternativas', () => {
    expect(checkAnswer('postergar', 'adiar / postergar').verdict).toBe('exact');
    expect(checkAnswer('adiar', 'adiar / postergar').verdict).toBe('exact');
  });

  it('informa a alternativa mais próxima', () => {
    const result = checkAnswer('posterga', 'adiar / postergar');
    expect(result.closest).toBe('postergar');
    expect(result.distance).toBe(1);
  });

  it('trata resposta vazia como errada', () => {
    expect(checkAnswer('', 'adiar').verdict).toBe('wrong');
  });

  it('não quebra quando o verso é só pontuação', () => {
    expect(checkAnswer('algo', '???').verdict).toBe('wrong');
  });

  it('tolera frase longa com um deslize', () => {
    expect(checkAnswer('estou ansiozo por isso', 'estou ansioso por isso').verdict).toBe('close');
  });
});

describe('suggestedGrade', () => {
  it('mapeia o veredito para a resposta correspondente', () => {
    expect(suggestedGrade('exact')).toBe('known');
    expect(suggestedGrade('close')).toBe('partial');
    expect(suggestedGrade('wrong')).toBe('forgot');
  });
});
