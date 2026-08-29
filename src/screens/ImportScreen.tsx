import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { IMPORT_FORMAT_VERSION, type ImportPreview, type ImportWarning } from '../importing/format';
import { parseImportFile } from '../importing/parse';
import { useApp } from '../store/AppContext';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Import'>;

/**
 * Importação de baralho a partir de um arquivo `.json`.
 *
 * O fluxo é escolher o arquivo, conferir a prévia e confirmar. A prévia existe
 * porque importar 60 cards errados é bem mais chato de desfazer do que de
 * evitar.
 */
export function ImportScreen() {
  const navigation = useNavigation<Nav>();
  const { importDeck, canAddDeck, premium } = useApp();

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readFile = useCallback(async () => {
    setBusy(true);
    setErrors([]);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // Alguns gerenciadores de arquivos rotulam .json de formas diferentes,
        // então aceitamos qualquer tipo e validamos o conteúdo.
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const raw = await new File(asset.uri).text();
      const parsed = parseImportFile(raw);

      if (!parsed.ok) {
        setPreview(null);
        setFileName(asset.name);
        setErrors(parsed.errors.map((error) => error.message));
        return;
      }

      setPreview(parsed.preview);
      setWarnings(parsed.warnings);
      setFileName(asset.name);
    } catch {
      setErrors(['Não foi possível ler o arquivo escolhido.']);
    } finally {
      setBusy(false);
    }
  }, []);

  const confirm = useCallback(async () => {
    if (!preview) return;

    const check = canAddDeck();
    if (!check.allowed) {
      Alert.alert('Limite do plano gratuito', check.reason, [
        { text: 'Agora não', style: 'cancel' },
        {
          text: 'Ver planos',
          onPress: () => navigation.navigate('Paywall', { source: 'limite-baralhos' }),
        },
      ]);
      return;
    }

    setBusy(true);
    try {
      const outcome = await importDeck(preview);
      navigation.replace('DeckDetail', { deckId: outcome.deck.id });
    } finally {
      setBusy(false);
    }
  }, [canAddDeck, importDeck, navigation, preview]);

  const copyFormat = useCallback(async () => {
    await Clipboard.setStringAsync(FORMAT_SNIPPET);
    Alert.alert(
      'Formato copiado',
      'Cole em um assistente e peça os cards do tema que você quiser.'
    );
  }, []);

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Ionicons name="download-outline" size={26} color={colors.primary} />
          </View>
          <Text style={styles.introTitle}>Importar baralho</Text>
          <Text style={styles.introText}>
            Escolha um arquivo <Text style={styles.mono}>.json</Text> no formato do LinguaCards.
            Cada arquivo vira um baralho novo, com todos os cards já dentro.
          </Text>
        </View>

        <Button
          label={preview || errors.length ? 'Escolher outro arquivo' : 'Escolher arquivo'}
          icon="folder-open-outline"
          onPress={() => void readFile()}
          loading={busy && !preview}
          size="lg"
          fullWidth
        />

        {errors.length > 0 ? (
          <View style={styles.errorBox}>
            <View style={styles.errorHeader}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.forgot} />
              <Text style={styles.errorTitle}>
                {fileName ? `Não deu para usar "${fileName}"` : 'Arquivo inválido'}
              </Text>
            </View>
            {errors.map((message) => (
              <Text key={message} style={styles.errorText}>
                {message}
              </Text>
            ))}
          </View>
        ) : null}

        {preview ? (
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewEmoji}>{preview.deck.emoji}</Text>
              <View style={styles.previewTitles}>
                <Text style={styles.previewName}>{preview.deck.name}</Text>
                <Text style={styles.previewCount}>
                  {preview.cards.length} {preview.cards.length === 1 ? 'card' : 'cards'}
                </Text>
              </View>
            </View>

            {preview.deck.description ? (
              <Text style={styles.previewDescription}>{preview.deck.description}</Text>
            ) : null}

            <View style={styles.samples}>
              {preview.cards.slice(0, 3).map((card, index) => (
                <View key={`${card.front}-${index}`} style={styles.sample}>
                  <Text style={styles.sampleFront} numberOfLines={1}>
                    {card.front}
                  </Text>
                  <Text style={styles.sampleBack} numberOfLines={1}>
                    {card.back}
                  </Text>
                </View>
              ))}
              {preview.cards.length > 3 ? (
                <Text style={styles.sampleMore}>
                  e mais {preview.cards.length - 3}…
                </Text>
              ) : null}
            </View>

            {warnings.length > 0 ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>
                  {warnings.length} {warnings.length === 1 ? 'ajuste feito' : 'ajustes feitos'} na leitura
                </Text>
                {warnings.slice(0, 4).map((warning, index) => (
                  <Text key={index} style={styles.warningText}>
                    {warning.cardIndex != null && warning.cardIndex >= 0
                      ? `Card ${warning.cardIndex + 1}: `
                      : ''}
                    {warning.message}
                  </Text>
                ))}
                {warnings.length > 4 ? (
                  <Text style={styles.warningText}>e mais {warnings.length - 4}…</Text>
                ) : null}
              </View>
            ) : null}

            <Button
              label={`Importar ${preview.cards.length} cards`}
              icon="checkmark"
              onPress={() => void confirm()}
              loading={busy}
              size="lg"
              fullWidth
            />
          </View>
        ) : null}

        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>Como gerar um arquivo</Text>
          <Text style={styles.helpText}>
            Copie o formato abaixo, cole em um assistente e peça os cards do tema que quiser —
            "álgebra", "inglês para viagem", "anatomia". Salve a resposta como{' '}
            <Text style={styles.mono}>.json</Text> e importe aqui.
          </Text>
          <View style={styles.snippet}>
            <Text style={styles.snippetText}>{FORMAT_SNIPPET}</Text>
          </View>
          {!premium ? (
            <Text style={styles.helpNote}>
              No plano gratuito valem os mesmos limites de baralhos e cards.
            </Text>
          ) : null}
          <Button
            label="Copiar formato"
            icon="copy-outline"
            onPress={() => void copyFormat()}
            variant="secondary"
            fullWidth
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Molde mostrado na tela e copiado para a área de transferência. */
const FORMAT_SNIPPET = `{
  "linguacards": ${IMPORT_FORMAT_VERSION},
  "deck": {
    "name": "Nome do baralho",
    "description": "Do que trata",
    "emoji": "📚",
    "color": "#5B8DEF"
  },
  "cards": [
    {
      "front": "pergunta ou termo",
      "back": "resposta ou tradução",
      "hint": "dica opcional",
      "example": "exemplo ou diálogo opcional",
      "tags": ["opcional"]
    }
  ]
}`;

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  intro: { alignItems: 'center', gap: spacing.sm },
  introIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: { ...typography.h2 },
  introText: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  mono: { fontFamily: 'monospace', color: colors.text },

  errorBox: { backgroundColor: colors.forgotSoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  errorHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorTitle: { ...typography.caption, color: colors.forgot, fontWeight: '700', flex: 1 },
  errorText: { ...typography.caption, color: colors.text, lineHeight: 19 },

  previewCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewEmoji: { fontSize: 30 },
  previewTitles: { flex: 1, gap: 2 },
  previewName: { ...typography.h3, fontSize: 17 },
  previewCount: { ...typography.tiny, color: colors.textFaint },
  previewDescription: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },
  samples: { gap: spacing.sm },
  sample: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 2,
  },
  sampleFront: { ...typography.caption, color: colors.text, fontWeight: '600' },
  sampleBack: { ...typography.tiny, color: colors.textMuted },
  sampleMore: { ...typography.tiny, color: colors.textFaint, textAlign: 'center' },

  warningBox: { backgroundColor: colors.partialSoft, borderRadius: radius.sm, padding: spacing.md, gap: spacing.xs },
  warningTitle: { ...typography.tiny, color: colors.partial, fontWeight: '700' },
  warningText: { ...typography.tiny, color: colors.textMuted, lineHeight: 16 },

  helpCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  helpTitle: { ...typography.h3, fontSize: 15 },
  helpText: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },
  helpNote: { ...typography.tiny, color: colors.textFaint },
  snippet: { backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.md },
  snippetText: { fontFamily: 'monospace', fontSize: 11, color: colors.textMuted, lineHeight: 16 },
});
