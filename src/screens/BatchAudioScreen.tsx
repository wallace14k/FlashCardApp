import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AudioAttachmentField } from '../components/AudioAttachmentField';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/Screen';
import { useAudioAttachment } from '../audio/useAudioAttachment';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Card } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'BatchAudio'>;
type Route = RouteProp<RootStackParamList, 'BatchAudio'>;

/**
 * Gravação de áudio em sequência.
 *
 * Anexar áudio card a card exige abrir a edição, gravar, salvar e voltar —
 * quatro toques de navegação por card. Num baralho importado de quarenta
 * cards isso é proibitivo, e o resultado prático é que ninguém grava nada.
 * Aqui a navegação sai da frente: grava, avança, grava.
 */
export function BatchAudioScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { decks, cards, editCard, canAttachBothAudios } = useApp();

  const deck = decks.find((item) => item.id === params.deckId);

  // A lista é fixada na abertura: se ela reagisse a cada gravação, o card
  // recém-gravado sairia da fila e embaralharia a posição do usuário.
  const [queue] = useState<Card[]>(() =>
    cards.filter((card) => card.deckId === params.deckId && !card.frontAudio)
  );
  const [index, setIndex] = useState(0);
  const [recorded, setRecorded] = useState(0);

  const current = queue[index];
  const remaining = queue.length - index;

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Gravar em sequência' });
  }, [navigation]);

  const advance = useCallback(() => setIndex((value) => value + 1), []);

  const handleSaved = useCallback(() => {
    setRecorded((value) => value + 1);
    advance();
  }, [advance]);

  if (queue.length === 0) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="checkmark-done-outline"
          title="Todos os cards já têm áudio"
          description={`Nenhum card de "${deck?.name ?? 'baralho'}" está sem gravação na frente.`}
          actionLabel="Voltar"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.done}>
          <View style={styles.doneIcon}>
            <Ionicons name="mic" size={32} color={colors.known} />
          </View>
          <Text style={styles.doneTitle}>Sessão de gravação encerrada</Text>
          <Text style={styles.doneText}>
            {recorded === 0
              ? 'Nenhum card foi gravado desta vez.'
              : `${recorded} ${recorded === 1 ? 'card gravado' : 'cards gravados'} de ${queue.length}.`}
          </Text>
          <Button
            label="Voltar ao baralho"
            onPress={() => navigation.goBack()}
            size="lg"
            fullWidth
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <View style={styles.header}>
        <ProgressBar progress={index / queue.length} color={colors.known} />
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>
            {index + 1} de {queue.length}
          </Text>
          <Text style={styles.headerText}>
            {recorded > 0 ? `${recorded} gravados · ` : ''}
            {remaining} restantes
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* A `key` remonta o estado de gravação a cada card; sem ela, o áudio
            de um card apareceria no seguinte. */}
        <CardRecorder
          key={current.id}
          card={current}
          allowBackAudio={canAttachBothAudios}
          onSave={async (patch) => {
            await editCard(current.id, patch);
            handleSaved();
          }}
          onSkip={advance}
          onFinish={() => setIndex(queue.length)}
        />
      </ScrollView>
    </Screen>
  );
}

function CardRecorder({
  card,
  allowBackAudio,
  onSave,
  onSkip,
  onFinish,
}: {
  card: Card;
  allowBackAudio: boolean;
  onSave: (patch: Partial<Card>) => Promise<void>;
  onSkip: () => void;
  onFinish: () => void;
}) {
  const frontAudio = useAudioAttachment(card.frontAudio);
  const backAudio = useAudioAttachment(card.backAudio);
  const [saving, setSaving] = useState(false);

  const hasSomething = frontAudio.audio != null || backAudio.audio != null;

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({
        frontAudio: frontAudio.commit(),
        backAudio: allowBackAudio ? backAudio.commit() : card.backAudio,
      });
    } finally {
      setSaving(false);
    }
  }, [allowBackAudio, backAudio, card.backAudio, frontAudio, onSave]);

  const example = useMemo(() => card.example?.trim(), [card.example]);

  return (
    <View style={styles.cardBlock}>
      <View style={styles.preview}>
        <Text style={styles.previewFront}>{card.front}</Text>
        <Text style={styles.previewBack}>{card.back}</Text>
        {example ? <Text style={styles.previewExample}>{example}</Text> : null}
      </View>

      <AudioAttachmentField
        title="Áudio da frente"
        description="Grave a pronúncia deste termo."
        attachment={frontAudio}
      />

      {allowBackAudio ? (
        <AudioAttachmentField
          title="Áudio do verso"
          description="Opcional: o diálogo completo."
          attachment={backAudio}
        />
      ) : null}

      <Button
        label="Salvar e ir para o próximo"
        icon="arrow-forward"
        onPress={() => void save()}
        loading={saving}
        disabled={!hasSomething}
        size="lg"
        fullWidth
      />

      <View style={styles.secondaryActions}>
        <Pressable onPress={onSkip} style={styles.skip} accessibilityRole="button">
          <Text style={styles.skipText}>Pular este card</Text>
        </Pressable>
        <Pressable onPress={onFinish} style={styles.skip} accessibilityRole="button">
          <Text style={styles.skipText}>Encerrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  headerText: { ...typography.tiny, color: colors.textFaint },

  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  cardBlock: { gap: spacing.lg },
  preview: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  previewFront: { fontSize: 21, fontWeight: '600', color: colors.text, lineHeight: 28 },
  previewBack: { ...typography.body, color: colors.textMuted },
  previewExample: {
    ...typography.caption,
    color: colors.textFaint,
    marginTop: spacing.sm,
    lineHeight: 19,
  },

  secondaryActions: { flexDirection: 'row', justifyContent: 'space-between' },
  skip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  skipText: { ...typography.caption, color: colors.textMuted, textDecorationLine: 'underline' },

  done: { flex: 1, padding: spacing.xl, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  doneIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.knownSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: { ...typography.h2, textAlign: 'center' },
  doneText: { ...typography.bodyMuted, textAlign: 'center', marginBottom: spacing.md },
});
