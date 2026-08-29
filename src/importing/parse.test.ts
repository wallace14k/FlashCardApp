import { IMPORT_FORMAT_VERSION, IMPORT_LIMITS, exampleImportFile } from './format';
import { parseImportFile } from './parse';

function fileWith(cards: unknown[], deck: Record<string, unknown> = { name: 'Teste' }) {
  return JSON.stringify({ linguacards: IMPORT_FORMAT_VERSION, deck, cards });
}

describe('arquivos aceitos', () => {
  it('lê o arquivo de exemplo do próprio formato', () => {
    const result = parseImportFile(JSON.stringify(exampleImportFile()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.cards).toHaveLength(1);
    expect(result.preview.cards[0].front).toBe('to put off');
    expect(result.preview.deck.name).toBe('Inglês — verbos frasais');
  });

  it('preenche ícone e cor quando o arquivo não traz', () => {
    const result = parseImportFile(fileWith([{ front: 'a', back: 'b' }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.deck.emoji).toBeTruthy();
    expect(result.preview.deck.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('remove espaços sobrando da frente e do verso', () => {
    const result = parseImportFile(fileWith([{ front: '  hello  ', back: '\tolá\n' }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.cards[0]).toMatchObject({ front: 'hello', back: 'olá' });
  });

  it('aceita versões anteriores do formato', () => {
    const raw = JSON.stringify({ linguacards: 1, deck: { name: 'x' }, cards: [{ front: 'a', back: 'b' }] });
    expect(parseImportFile(raw).ok).toBe(true);
  });
});

describe('arquivos recusados', () => {
  it('recusa JSON inválido', () => {
    const result = parseImportFile('{ isso não é json }');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/JSON/);
  });

  it('recusa arquivo de outro programa', () => {
    const result = parseImportFile(JSON.stringify({ deck: { name: 'x' }, cards: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/linguacards/);
  });

  it('recusa formato de versão futura em vez de adivinhar', () => {
    const raw = JSON.stringify({ linguacards: 99, deck: { name: 'x' }, cards: [{ front: 'a', back: 'b' }] });
    const result = parseImportFile(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/versão 99/);
  });

  it('recusa baralho sem nome', () => {
    const result = parseImportFile(fileWith([{ front: 'a', back: 'b' }], {}));
    expect(result.ok).toBe(false);
  });

  it('recusa lista de cards vazia', () => {
    expect(parseImportFile(fileWith([])).ok).toBe(false);
  });

  it('recusa quando nenhum card é aproveitável', () => {
    const result = parseImportFile(fileWith([{ front: '', back: '' }, { nada: 1 }]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/Nenhum card/);
  });

  it('recusa arquivos acima do limite de cards', () => {
    const muitos = Array.from({ length: IMPORT_LIMITS.maxCards + 1 }, (_, i) => ({
      front: `f${i}`,
      back: `b${i}`,
    }));
    const result = parseImportFile(fileWith(muitos));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/limite/);
  });
});

describe('conserto silencioso', () => {
  it('ignora cards incompletos mas aproveita o resto', () => {
    const result = parseImportFile(
      fileWith([{ front: 'a', back: 'b' }, { front: 'sem verso' }, { front: 'c', back: 'd' }])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.cards).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].cardIndex).toBe(1);
  });

  it('descarta cards repetidos dentro do arquivo', () => {
    const result = parseImportFile(
      fileWith([
        { front: 'Hello', back: 'Olá' },
        { front: 'hello', back: 'olá' },
      ])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.cards).toHaveLength(1);
    expect(result.warnings[0].message).toMatch(/repetido/);
  });

  it('corta textos longos demais em vez de recusar o arquivo', () => {
    const longo = 'x'.repeat(IMPORT_LIMITS.maxTextLength + 50);
    const result = parseImportFile(fileWith([{ front: longo, back: 'b' }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.cards[0].front).toHaveLength(IMPORT_LIMITS.maxTextLength);
    expect(result.warnings[0].message).toMatch(/cortado/);
  });

  it('troca cor inválida pela padrão e avisa', () => {
    const result = parseImportFile(fileWith([{ front: 'a', back: 'b' }], { name: 'x', color: 'azul' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.deck.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(result.warnings.some((w) => w.message.includes('azul'))).toBe(true);
  });

  it('ignora tags vazias', () => {
    const result = parseImportFile(fileWith([{ front: 'a', back: 'b', tags: ['ok', '', '  '] }]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.cards[0].tags).toEqual(['ok']);
  });
});
