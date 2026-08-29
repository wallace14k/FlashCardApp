import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/Screen';
import {
  buildRounds,
  createGame,
  currentRound,
  isMatched,
  nextRound,
  summarize,
  tapTile,
  type MatchingState,
  type Tile,
} from '../matching/game';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing, typography } from '../theme';
import { formatDuration } from '../utils/date';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Matching'>;
type Route = RouteProp<RootStackParamList, 'Matching'>;

/**
 * Modo Combinar: duas colunas, frentes de um lado e versos do outro, e o
 * usuário liga os pares. É o treino leve do app — bom para aquecer antes da
 * revisão ou para fixar vocabulário novo sem a pressão de responder de cabeça.
 */
export function MatchingScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { decks, cards, settings, registerPractice } = useApp();

  const deck = decks.find((item) => item.id === params.deckId);

  const deckCards = useMemo(
    () => cards.filter((card) => card.deckId === params.deckId),
    [cards, params.deckId]
  );

  // A partida é montada uma vez; refazer embaralharia tudo a cada toque.
  const [game, setGame] = useState<MatchingState>(() => createGame(buildRounds(deckCards)));
  const [missedIds, setMissedIds] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const recorded = useRef(false);

  const round = currentRound(game);
  const summary = summarize(game);

  const buzz = useCallback(
    (style: Haptics.NotificationFeedbackType) => {
      if (!settings.hapticsEnabled) return;
      void Haptics.notificationAsync(style);
    },
    [settings.hapticsEnabled]
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: deck ? `Combinar · ${deck.name}` : 'Combinar' });
  }, [navigation, deck]);

  const handleTap = useCallback(
    (tile: Tile) => {
      const result = tapTile(game, tile);
      setGame(result.state);

      if (result.outcome.kind === 'match') {
        buzz(Haptics.NotificationFeedbackType.Success);
      }

      if (result.outcome.kind === 'miss') {
        buzz(Haptics.NotificationFeedbackType.Error);
        // Marca os dois quadrados em vermelho por um instante, para o erro
        // ficar visível sem precisar de texto.
        const ids = [result.outcome.selected.id, result.outcome.attempted.id];
        setMissedIds(ids);
        setTimeout(() => setMissedIds([]), 420);
      }

      if (result.gameComplete && !recorded.current) {
        recorded.current = true;
        setFinished(true);
        void registerPractice(summarize(result.state).hits);
      }
    },
    [buzz, game, registerPractice]
  );

  const advance = useCallback(() => setGame((current) => nextRound(current)), []);

  const restart = useCallback(() => {
    recorded.current = false;
    setFinished(false);
    setMissedIds([]);
    setGame(createGame(buildRounds(deckCards)));
  }, [deckCards]);

  if (!round) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="grid-outline"
          title="Poucos cards para combinar"
          description="O modo Combinar precisa de pelo menos dois cards com frente e verso preenchidos neste baralho."
          actionLabel="Voltar"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  if (finished) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.summary}>
          <View style={styles.summaryIcon}>
            <Ionicons name="sparkles" size={32} color={colors.known} />
          </View>
          <Text style={styles.summaryTitle}>Todos os pares combinados</Text>
          <Text style={styles.summarySubtitle}>
            {summary.pairs} pares em {formatDuration(summary.durationMs)}
          </Text>

          <View style={styles.summaryStats}>
            <SummaryStat value={String(summary.hits)} label="acertos" color={colors.known} />
            <SummaryStat value={String(summary.mistakes)} label="erros" color={colors.forgot} />
            <SummaryStat
              value={`${Math.round(summary.accuracy * 100)}%`}
              label="precisão"
              color={colors.primary}
            />
          </View>

          <Text style={styles.summaryNote}>
            O modo Combinar treina reconhecimento, então não altera quando os cards voltam. Para
            isso, use o treino normal.
          </Text>

          <View style={styles.summaryActions}>
            <Button label="Jogar de novo" icon="refresh" onPress={restart} size="lg" fullWidth />
            <Button
              label="Voltar ao baralho"
              onPress={() => navigation.goBack()}
              variant="secondary"
              size="lg"
              fullWidth
            />
          </View>
        </View>
      </Screen>
    );
  }

  const roundDone = game.matched.length === round.frontTiles.length;

  return (
    <Screen edges={['bottom']}>
      <View style={styles.header}>
        <ProgressBar
          progress={game.matched.length / round.frontTiles.length}
          color={colors.known}
        />
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>
            Rodada {round.index + 1} de {game.rounds.length}
          </Text>
          <Text style={styles.headerText}>
            {game.matched.length}/{round.frontTiles.length} pares
            {game.mistakes > 0 ? ` · ${game.mistakes} erros` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.board}>
        <Column
          tiles={round.frontTiles}
          game={game}
          missedIds={missedIds}
          onTap={handleTap}
          accent={colors.primary}
        />
        <Column
          tiles={round.backTiles}
          game={game}
          missedIds={missedIds}
          onTap={handleTap}
          accent={colors.known}
        />
      </View>

      {roundDone ? (
        <View style={styles.footer}>
          <Button label="Próxima rodada" icon="arrow-forward" onPress={advance} size="lg" fullWidth />
        </View>
      ) : null}
    </Screen>
  );
}

function Column({
  tiles,
  game,
  missedIds,
  onTap,
  accent,
}: {
  tiles: Tile[];
  game: MatchingState;
  missedIds: string[];
  onTap: (tile: Tile) => void;
  accent: string;
}) {
  return (
    <View style={styles.column}>
      {tiles.map((tile) => (
        <TileButton
          key={tile.id}
          tile={tile}
          matched={isMatched(game, tile.cardId)}
          selected={game.selected?.id === tile.id}
          missed={missedIds.includes(tile.id)}
          onPress={() => onTap(tile)}
          accent={accent}
        />
      ))}
    </View>
  );
}

function TileButton({
  tile,
  matched,
  selected,
  missed,
  onPress,
  accent,
}: {
  tile: Tile;
  matched: boolean;
  selected: boolean;
  missed: boolean;
  onPress: () => void;
  accent: string;
}) {
  const fade = useRef(new Animated.Value(1)).current;

  // Um par acertado some suavemente em vez de desaparecer de repente, para o
  // usuário registrar qual foi.
  React.useEffect(() => {
    Animated.timing(fade, {
      toValue: matched ? 0.25 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [matched, fade]);

  return (
    <Animated.View style={[styles.tileWrapper, { opacity: fade }]}>
      <Pressable
        onPress={onPress}
        disabled={matched}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: matched }}
        accessibilityLabel={tile.text}
        style={({ pressed }) => [
          styles.tile,
          selected && { borderColor: accent, backgroundColor: `${accent}22` },
          missed && styles.tileMissed,
          matched && styles.tileMatched,
          pressed && !matched && styles.tilePressed,
        ]}
      >
        <Text
          style={[styles.tileText, matched && styles.tileTextMatched]}
          numberOfLines={3}
        >
          {tile.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function SummaryStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryStatValue, { color }]}>{value}</Text>
      <Text style={styles.summaryStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  headerText: { ...typography.tiny, color: colors.textFaint },

  board: { flex: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.lg },
  column: { flex: 1, gap: spacing.sm },
  tileWrapper: { flex: 1 },
  tile: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  tilePressed: { opacity: 0.7 },
  tileMissed: { borderColor: colors.forgot, backgroundColor: colors.forgotSoft },
  tileMatched: { borderColor: colors.known, backgroundColor: colors.knownSoft },
  tileText: { ...typography.caption, color: colors.text, textAlign: 'center' },
  tileTextMatched: { color: colors.known },

  footer: { padding: spacing.lg, paddingTop: 0 },

  summary: { flex: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.lg },
  summaryIcon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.knownSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: { ...typography.h1, fontSize: 24, textAlign: 'center' },
  summarySubtitle: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  summaryStats: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  summaryStat: { flex: 1, alignItems: 'center', gap: 2 },
  summaryStatValue: { fontSize: 20, fontWeight: '700' },
  summaryStatLabel: { ...typography.tiny, color: colors.textFaint },
  summaryNote: {
    ...typography.tiny,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 16,
  },
  summaryActions: { gap: spacing.sm },
});
