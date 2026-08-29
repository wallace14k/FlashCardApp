---
name: criar-baralho
description: Gera um arquivo .json de importação do LinguaCards a partir de um tema. Use quando o usuário quiser criar cards para estudar um assunto — "quero um baralho de álgebra", "cria cards de inglês para viagem", "um arquivo de importação sobre anatomia" — ou quando pedir a skill pelo nome. Sempre pergunte o tema antes de gerar, se ele não tiver sido dito.
---

# Criar baralho para o LinguaCards

Gera um arquivo `.json` no formato de importação do app, pronto para o usuário
abrir em *Baralhos → ícone de importar*.

## Primeiro: descubra o que gerar

**Se o usuário não disse o tema, pergunte antes de qualquer outra coisa.** Não
invente um tema nem gere um exemplo genérico — um baralho sobre o assunto
errado é trabalho jogado fora.

Com o tema em mãos, use `AskUserQuestion` para fechar o que ainda estiver em
aberto. Não pergunte o que já dá para deduzir:

- **Quantos cards.** Sugira 20 como padrão. Acima de 60, avise que o plano
  gratuito do app limita a 60 cards por baralho.
- **Idioma dos dois lados**, quando for tema de idioma. O padrão é frente no
  idioma estudado e verso em português. Se o tema não for idioma (álgebra,
  anatomia, direito), os dois lados ficam em português e essa pergunta não faz
  sentido — pule.
- **Nível**, quando couber: iniciante, intermediário ou avançado.

Uma pergunta só, com as opções agrupadas, costuma bastar. Se o usuário já deu
tudo ("50 cards de espanhol intermediário"), não pergunte nada — gere.

## O formato

```json
{
  "linguacards": 1,
  "deck": {
    "name": "Nome curto e específico",
    "description": "Uma frase sobre o que o baralho cobre",
    "emoji": "📚",
    "color": "#5B8DEF"
  },
  "cards": [
    {
      "front": "pergunta, palavra ou expressão",
      "back": "resposta ou tradução",
      "hint": "opcional — pista que não entrega a resposta",
      "example": "opcional — frase ou diálogo de contexto",
      "tags": ["opcional"]
    }
  ]
}
```

Regras que o app aplica na leitura, e que vale respeitar na geração:

- `linguacards`, `deck.name` e ao menos um card são obrigatórios.
- `front` e `back` são cortados em 300 caracteres, `example` em 500, `hint` em
  140, `deck.name` em 60.
- `color` precisa ser hexadecimal de 6 dígitos (`#5B8DEF`), senão vira a cor
  padrão.
- Cards repetidos (mesma frente e mesmo verso, ignorando maiúsculas) são
  descartados na importação — então não repita.

Cores disponíveis: `#5B8DEF` azul, `#2FBF71` verde, `#E8A33D` âmbar, `#E4574C`
vermelho, `#A77BF3` roxo, `#22B8CF` ciano, `#F06595` rosa, `#8CB369` oliva.

## Como escrever bons cards

O app usa repetição espaçada, e isso muda o que faz um card bom:

**Um card, uma ideia.** "Conjugue *ser* no presente" é seis cards, não um. Quem
erra a terceira pessoa acaba revendo as cinco que já sabia.

**A frente tem que ser respondível de cabeça.** "Álgebra" não é frente. "Qual é
a fórmula de $(a+b)^2$?" é.

**Evite pistas acidentais.** Se todos os cards de um baralho de inglês têm o
verso com uma palavra só, o usuário aprende o formato, não o conteúdo.

**Use `example` para contexto, não para repetir a resposta.** Em idiomas, um
diálogo curto de duas falas vale mais que uma frase solta — é o que o usuário
vai gravar em áudio depois.

**Use `hint` para desencalhar, não para entregar.** Boa dica: "pense em empurrar
algo para longe no tempo". Dica ruim: "começa com adi-".

Para temas técnicos, prefira perguntas que exijam recuperar a informação a
perguntas de reconhecimento. "O que caracteriza uma matriz singular?" funciona
melhor que "Verdadeiro ou falso: matriz singular tem determinante zero".

## Como entregar

1. Escreva o arquivo com a ferramenta `Write`, com nome descritivo em minúsculas
   e hífens: `ingles-viagem.json`, `algebra-produtos-notaveis.json`.
2. Envie ao usuário com `SendUserFile`, para ele conseguir baixar.
3. Diga em uma linha quantos cards foram gerados e como importar: no app, aba
   **Baralhos**, ícone de download no topo, escolher o arquivo.

Se o tema for grande demais para um baralho só (por exemplo "matemática"),
diga isso e proponha uma divisão — "álgebra básica", "trigonometria",
"derivadas" — em vez de gerar um baralho raso cobrindo tudo.

## Verifique antes de entregar

- O JSON é válido? (Aspas, vírgulas, sem vírgula sobrando no fim.)
- O número de cards bate com o pedido?
- Tem card repetido?
- Algum `front` está vazio ou é só um título de seção?
