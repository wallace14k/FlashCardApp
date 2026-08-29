# LinguaCards

App móvel (iOS e Android) de flashcards com repetição espaçada, feito em React Native com Expo.
A proposta é ser um Anki mais direto: três respostas em vez de quatro, áudio anexado ao card para
estudo de idiomas, e uma mecânica de ofensiva que dá motivo para voltar todo dia.

## O que já está pronto

- **Login com Google e conta Apple**, além de um modo local sem conta.
- **Baralhos criados pelo usuário**, com nome, ícone, cor e limite de cards novos por dia.
- **Cards criados dentro do baralho**, com frente, verso, dica e exemplo/diálogo.
- **Áudio anexado ao card** — gravado pelo microfone ou importado do aparelho, na frente
  (pronúncia) e no verso (diálogo).
- **Três respostas por card**: *Não lembro*, *Mais ou menos* e *Lembro*. Cada uma define quando o
  card volta, e o intervalo previsto aparece no próprio botão.
- **Ofensiva** com meta diária, protetores de sequência e lembrete diário local.
- **Estatísticas**: atividade dos últimos 7 dias, previsão de revisões e composição da coleção.
- **Monetização ao fim de cada treino**: anúncio intersticial na tela de resumo, anúncio
  recompensado que dá um protetor de ofensiva, e assinatura premium que remove os anúncios.
- **Tudo salvo localmente** — AsyncStorage para os dados e o diretório de documentos do app para os
  arquivos de áudio. Nada sai do aparelho nesta versão.

## Rodando o projeto

```bash
npm install
npm test           # testes da lógica de agendamento, ofensiva e fila
npm run typecheck
```

### Expo Go

```bash
npm start          # abre o Metro; leia o QR code com o Expo Go
```

Só funciona se a versão do Expo Go instalada no aparelho corresponder ao SDK do projeto
(atualmente **SDK 57**). O app do Expo Go nas lojas costuma ficar um SDK atrás por algumas
semanas depois de um lançamento, e nesse período ele recusa o projeto com
*"Project is incompatible with this version of Expo Go"*. Quando isso acontecer, use o
build do EAS abaixo — não adianta esperar a loja.

### EAS Build (recomendado)

Compila na nuvem, não exige Android Studio nem Xcode e funciona a partir de qualquer sistema,
Windows incluído. Precisa de uma conta Expo (gratuita).

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

O primeiro build vincula o projeto à sua conta e grava o `projectId` em `app.json`. Ao terminar,
o EAS devolve um link com o APK — abra no celular Android e instale.

Três perfis estão configurados em `eas.json`:

| Perfil | Para quê |
| --- | --- |
| `preview` | APK autônomo para instalar e testar. É o que você quer para experimentar o app. |
| `development` | Build com `expo-dev-client`: substitui o Expo Go, conecta no Metro e recarrega o código na hora. Melhor para desenvolver. |
| `production` | App bundle assinado, para publicar na Play Store. |

Para o `development`, instale o build uma vez e depois rode `npm start` normalmente — ele conecta
igual ao Expo Go, mas com os módulos nativos deste projeto.

### iOS

Instalar em um iPhone físico exige o **Apple Developer Program** (US$ 99/ano), porque a Apple
exige um perfil de provisionamento. Não é limitação do Expo. Com a conta:

```bash
eas build --platform ios --profile preview
```

Sem conta paga, as alternativas para iOS são o Expo Go (quando o SDK bater) ou o simulador do
Xcode, que precisa de um Mac (`eas build --platform ios --profile development` gera um build de
simulador).

### Build nativo local

```bash
npx expo run:android   # exige Android Studio e ANDROID_HOME configurado
npx expo run:ios       # exige macOS com Xcode
```

Gera as pastas `android/` e `ios/` (ambas no `.gitignore`). Só vale a pena se você for mexer em
código nativo — para testar, o EAS é mais simples.

## Como o agendamento funciona

O algoritmo está inteiro em `src/srs/scheduler.ts`, isolado da interface e coberto por testes.
É uma variante do SM-2 com passos de aprendizado no estilo Anki, adaptada para três respostas:

| Resposta | Card novo / em aprendizado | Card em revisão |
| --- | --- | --- |
| **Não lembro** | volta ao primeiro passo (1 min) | vira reaprendizado em 10 min, facilidade −0,20, metade do intervalo fica guardada |
| **Mais ou menos** | repete o passo atual com 50% mais folga | intervalo × 1,2, facilidade −0,15 |
| **Lembro** | avança um passo; ao terminar, forma em 1 dia | intervalo × facilidade |

Três diferenças em relação ao Anki, que são o "melhorado" da proposta:

1. **Errar não zera o progresso.** Um lapso guarda metade do intervalo em `pendingIntervalDays` e
   devolve esse valor quando o card se recupera, em vez de mandá-lo de volta para o começo.
2. **"Mais ou menos" não reinicia o card em revisão** — ele avança devagar, então quem hesita
   continua progredindo.
3. **Intervalos longos recebem uma variação de ±5%**, para que cards criados no mesmo dia não
   vençam todos juntos meses depois.

Durante o treino, um card marcado para voltar em menos de 20 minutos reentra na própria sessão,
algumas posições à frente — é isso que faz "Não lembro" ter efeito imediato.

## Estrutura

```
src/
  audio/           gravação, importação, arquivos e sessão de áudio
  auth/            Google (expo-auth-session) e Apple (expo-apple-authentication)
  components/      UI compartilhada (botões de resposta, player, anúncio, gráficos)
  monetization/    catálogo de produtos, compras e regras de exibição de anúncio
  navigation/      pilha e abas
  notifications/   lembrete diário local
  screens/         telas
  srs/             agendador de repetição espaçada  ← núcleo do app
  storage/         persistência local (AsyncStorage)
  store/           estado global, fila de treino e estatísticas
  streak/          mecânica de ofensiva
```

## O que falta ligar antes de publicar

Estes pontos ficaram isolados de propósito, cada um em um arquivo só, com o app funcionando sem
eles:

- **Login com Google** — preencha os client IDs em `app.json` → `expo.extra`
  (`googleIosClientId`, `googleAndroidClientId`, `googleWebClientId`). Sem eles, o botão avisa que
  a build não está configurada; os outros modos de entrada continuam funcionando.
- **Anúncios** — `src/monetization/ads.ts` concentra as regras (a partir de qual treino aparece e
  de quantos em quantos). A integração com o AdMob (`react-native-google-mobile-ads`, que exige
  development build) entra em `src/components/InterstitialAd.tsx`, que hoje mostra um placeholder
  com o mesmo fluxo e a mesma contagem regressiva.
- **Assinatura** — `src/monetization/purchases.ts` registra a compra apenas no aparelho. Troque as
  funções `purchase` e `restore` pela biblioteca de IAP; os IDs dos produtos em `products.ts`
  precisam ser cadastrados na App Store Connect e no Google Play Console.
- **Sincronização entre aparelhos** — `src/storage/index.ts` é a única porta de entrada dos dados,
  então dá para trocar por SQLite ou por uma API remota sem mexer nas telas.

## Testes

`npm test` cobre as três partes que definem o comportamento do produto e não dependem do React
Native: o agendador (`src/srs`), a ofensiva (`src/streak`) e a montagem da fila de treino
(`src/store/queue.ts`) — 37 testes no total.
