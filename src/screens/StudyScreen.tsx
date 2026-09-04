import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AudioButton } from '../components/AudioButton';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { GradeButtons } from '../components/GradeButtons';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/Screen';
import { previewIntervals } from '../srs/scheduler';
import { useApp } from '../store/AppContext';
import { facesFor, srsFor } from '../store/queue';
import { checkAnswer, suggestedGrade, type CheckResult } from '../typing/check';
import { colors, radius, spacing, typography } from '../theme';
import { MINUTE_MS } from '../utils/date';
import type { RootStackParamList } from '../navigation/types';
import type { Grade, StudyDirection } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Study'>;
type Route = RouteProp<RootStackParamList, 'Study'>;

/**
 * Um card respondido volta ainda no mesmo treino se o agendador o marcou
 * para daqui a pouco — é o que faz "Não lembro" ter efeito imediato.
 */
const REQUEUE_WINDOW_MS = 20 * MINUTE_MS;

/**
 * Chave de uma entrada da fila. Com os dois sentidos ligados, o mesmo card
 * aparece duas vezes, então o id sozinho não identifica a entrada.
 */
type QueueKey = `${string}:${StudyDirection}`;

const keyOf = (cardId: string, direction: StudyDirection): QueueKey => `${cardId}:${direction}`;

function parseKey(key: QueueKey): { cardId: string; direction: StudyDirection } {
  const separator = key.lastIndexOf(':');
  return {
    cardId: key.slice(0, separator),
    direction: key.slice(separator + 1) as StudyDirection,
  };
}

interface Tally {
  total: number;
  known: number;
  partial: number;
  forgot: number;
  newCards: number;
}

const EMPTY_TALLY: Tally = { total: 0, known: 0, partial: 0, forgot: 0, newCards: 0 };

export function StudyScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { decks, cards, getQueue, answer, finishSession, settings } = useApp();

  const deck = decks.find((item) => item.id === params.deckId);

  const [queue, setQueue] = useState<QueueKey[]>(() =>
    getQueue(params.deckId).map((item) => keyOf(item.card.id, item.direction))
  );
  const [revealed, setRevealed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [typed, setTyped] = useState('');
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [answering, setAnswering] = useState(false);

  const startedAt = useRef(Date.now());
  const cardShownAt = useRef(Date.now());
  const initialCount = useRef(queue.length);
  const finished = useRef(false);

  const currentKey = queue[0];
  const current = useMemo(() => {
    if (!currentKey) return null;
    const { cardId, direction } = parseKey(currentKey);
    const card = cards.find((item) => item.id === cardId);
    return card ? { card, direction } : null;
  }, [cards, currentKey]);

  const faces = current ? facesFor(current.card, current.direction) : null;
  const srs = current ? srsFor(current.card, current.direction) : null;

  const intervals = useMemo(() => (srs ? previewIntervals(srs) : null), [srs]);

  const buzz = useCallback(
    (style: Haptics.ImpactFeedbackStyle) => {
      if (!settings.hapticsEnabled) return;
      void Haptics.impactAsync(style);
    },
    [settings.hapticsEnabled]
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: deck?.name ?? 'Treino' });
  }, [navigation, deck]);

  useEffect(() => {
    cardShownAt.current = Date.now();
    setRevealed(false);
    setShowHint(false);
    setTyped('');
    setCheck(null);
  }, [currentKey]);

  const complete = useCallback(
    async (result: Tally) => {
      if (finished.current) return;
      finished.current = true;

      const summary = await finishSession({
        deckId: params.deckId,
        deckName: deck?.name ?? 'Baralho',
        startedAt: startedAt.current,
        finishedAt: Date.now(),
        ...result,
      });
      navigation.replace('SessionSummary', { result: summary });
    },
    [deck?.name, finishSession, navigation, params.deckId]
  );

  const reveal = useCallback(() => {
    if (settings.typingEnabled && faces) {
      setCheck(checkAnswer(typed, faces.answer));
    }
    buzz(Haptics.ImpactFeedbackStyle.Light);
    setRevealed(true);
  }, [buzz, faces, settings.typingEnabled, typed]);

  const handleGrade = useCallback(
    async (grade: Grade) => {
      if (!current || answering) return;
      setAnswering(true);

      buzz(
        grade === 'forgot' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light
      );

      try {
        const elapsed = Date.now() - cardShownAt.current;
        const wasNew = srs?.state === 'new';
        const outcome = await answer(current.card.id, current.direction, grade, elapsed);
        if (!outcome) return;

        const nextTally: Tally = {
          total: tally.total + 1,
          known: tally.known + (grade === 'known' ? 1 : 0),
          partial: tally.partial + (grade === 'partial' ? 1 : 0),
          forgot: tally.forgot + (grade === 'forgot' ? 1 : 0),
          newCards: tally.newCards + (wasNew ? 1 : 0),
        };
        setTally(nextTally);

        const updatedSrs = srsFor(outcome.card, current.direction);
        const comesBackSoon = updatedSrs.due - Date.now() <= REQUEUE_WINDOW_MS;
        const rest = queue.slice(1);
        const nextQueue = comesBackSoon ? requeue(rest, currentKey) : rest;
        setQueue(nextQueue);

        if (nextQueue.length === 0) await complete(nextTally);
      } finally {
        setAnswering(false);
      }
    },
    [answer, answering, buzz, complete, current, currentKey, queue, srs, tally]
  );

  const confirmExit = useCallback(() => {
    if (tally.total === 0) {
      navigation.goBack();
      return;
    }
    Alert.alert('Encerrar treino?', 'As respostas já dadas ficam salvas.', [
      { text: 'Continuar treinando', style: 'cancel' },
      { text: 'Encerrar', onPress: () => void complete(tally) },
    ]);
  }, [complete, navigation, tally]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable onPress={confirmExit} hitSlop={10} accessibilityLabel="Encerrar treino">
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, confirmExit]);

  if (!current || !faces || !srs) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="checkmark-done-outline"
          title="Nada para revisar agora"
          description="Todos os cards deste baralho estão em dia. Volte quando os próximos vencerem."
          actionLabel="Voltar"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const done = initialCount.current - queue.length;
  const progress = initialCount.current > 0 ? done / initialCount.current : 0;
  const suggestion = check ? suggestedGrade(check.verdict) : null;

  return (
    <Screen edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={styles.progressArea}>
          <ProgressBar progress={progress} />
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {queue.length} {queue.length === 1 ? 'card restante' : 'cards restantes'}
            </Text>
            <View style={styles.tallyRow}>
              <TallyDot color={colors.forgot} value={tally.forgot} />
              <TallyDot color={colors.partial} value={tally.partial} />
              <TallyDot color={colors.known} value={tally.known} />
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.cardArea} keyboardShouldPersistTaps="handled">
          <View style={styles.faceCard}>
            <View style={styles.badges}>
              {srs.state === 'new' ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>NOVO</Text>
                </View>
              ) : null}
              {current.direction === 'reverse' ? (
                <View style={[styles.badge, styles.badgeReverse]}>
                  <Ionicons name="swap-horizontal" size={11} color={colors.partial} />
                  <Text style={[styles.badgeText, styles.badgeTextReverse]}>INVERTIDO</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.front}>{faces.prompt}</Text>

            {faces.promptAudio ? (
              <AudioButton
                audio={faces.promptAudio}
                label="Áudio"
                autoPlay={settings.autoPlayFrontAudio}
              />
            ) : null}

            {!revealed && current.card.hint ? (
              showHint ? (
                <View style={styles.hintBox}>
                  <Ionicons name="bulb-outline" size={15} color={colors.partial} />
                  <Text style={styles.hintText}>{current.card.hint}</Text>
                </View>
              ) : (
                <Pressable onPress={() => setShowHint(true)} style={styles.hintToggle}>
                  <Ionicons name="bulb-outline" size={15} color={colors.textMuted} />
                  <Text style={styles.hintToggleText}>Ver dica</Text>
                </Pressable>
              )
            ) : null}
          </View>

          {settings.typingEnabled && !revealed ? (
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Escreva a resposta"
              placeholderTextColor={colors.textFaint}
              style={styles.typingInput}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={reveal}
              returnKeyType="done"
              multiline
            />
          ) : null}

          {revealed ? (
            <View style={styles.answerCard}>
              {check ? <TypingVerdict check={check} typed={typed} /> : null}

              <Text style={styles.answerLabel}>Resposta</Text>
              <Text style={styles.back}>{faces.answer}</Text>

              {faces.answerAudio ? (
                <AudioButton
                  audio={faces.answerAudio}
                  label="Diálogo"
                  autoPlay={settings.autoPlayBackAudio}
                />
              ) : null}

              {current.card.example ? (
                <View style={styles.exampleBox}>
                  <Text style={styles.exampleText}>{current.card.example}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {revealed && intervals ? (
            <GradeButtons
              intervals={intervals}
              onGrade={(grade) => void handleGrade(grade)}
              showIntervals={settings.showNextInterval}
              disabled={answering}
              suggested={suggestion}
            />
          ) : (
            <Button
              label={settings.typingEnabled ? 'Conferir' : 'Mostrar resposta'}
              onPress={reveal}
              size="lg"
              fullWidth
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Mostra como a resposta digitada se compara com a esperada. */
function TypingVerdict({ check, typed }: { check: CheckResult; typed: string }) {
  const palette = {
    exact: { color: colors.known, background: colors.knownSoft, icon: 'checkmark-circle' as const, label: 'Certo' },
    close: { color: colors.partial, background: colors.partialSoft, icon: 'alert-circle' as const, label: 'Quase' },
    wrong: { color: colors.forgot, background: colors.forgotSoft, icon: 'close-circle' as const, label: 'Diferente' },
  }[check.verdict];

  return (
    <View style={[styles.verdict, { backgroundColor: palette.background }]}>
      <Ionicons name={palette.icon} size={18} color={palette.color} />
      <View style={styles.verdictBody}>
        <Text style={[styles.verdictLabel, { color: palette.color }]}>{palette.label}</Text>
        <Text style={styles.verdictTyped} numberOfLines={2}>
          {typed.trim() ? `Você escreveu: ${typed.trim()}` : 'Você não escreveu nada'}
        </Text>
      </View>
    </View>
  );
}

function TallyDot({ color, value }: { color: string; value: number }) {
  return (
    <View style={styles.tallyItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.tallyValue}>{value}</Text>
    </View>
  );
}

/**
 * Reinsere uma entrada na fila algumas posições à frente, para ela voltar
 * dentro do treino sem aparecer logo depois de si mesma.
 */
function requeue(rest: QueueKey[], key: QueueKey): QueueKey[] {
  const position = Math.min(rest.length, 3);
  return [...rest.slice(0, position), key, ...rest.slice(position)];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progressArea: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { ...typography.tiny, color: colors.textFaint },
  tallyRow: { flexDirection: 'row', gap: spacing.md },
  tallyItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tallyValue: { ...typography.tiny, color: colors.textMuted },

  cardArea: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  faceCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  badges: { flexDirection: 'row', gap: spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeReverse: { backgroundColor: colors.partialSoft },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  badgeTextReverse: { color: colors.partial },
  front: { fontSize: 24, fontWeight: '600', color: colors.text, lineHeight: 32 },
  hintToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start' },
  hintToggleText: { ...typography.caption, color: colors.textMuted },
  hintBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.partialSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hintText: { ...typography.caption, color: colors.text, flex: 1, lineHeight: 19 },

  typingInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 17,
    minHeight: 56,
  },

  answerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    gap: spacing.md,
  },
  verdict: { flexDirection: 'row', gap: spacing.md, borderRadius: radius.md, padding: spacing.md },
  verdictBody: { flex: 1, gap: 2 },
  verdictLabel: { ...typography.caption, fontWeight: '700' },
  verdictTyped: { ...typography.tiny, color: colors.textMuted, lineHeight: 16 },
  answerLabel: { ...typography.tiny, color: colors.textFaint, letterSpacing: 0.8 },
  back: { fontSize: 21, fontWeight: '600', color: colors.text, lineHeight: 29 },
  exampleBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  exampleText: { ...typography.body, color: colors.textMuted, lineHeight: 22 },

  footer: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
});
