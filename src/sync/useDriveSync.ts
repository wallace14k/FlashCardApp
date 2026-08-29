import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { useApp } from '../store/AppContext';
import { createBackup, mergeBackup, type MergeReport } from './backup';
import { DriveAuthError, DriveError, downloadBackup, uploadBackup } from './drive';

/**
 * Fluxo de sincronização com o Drive, do ponto de vista da tela.
 *
 * A sincronização é sempre nos dois sentidos: baixa o backup, funde com o que
 * está no aparelho (quem editou por último vence, por registro) e devolve o
 * resultado. Assim nada some por ter sido criado no outro aparelho.
 */

export type SyncStatus = 'ocioso' | 'sincronizando' | 'ok' | 'erro';

export interface SyncState {
  status: SyncStatus;
  message: string | null;
  lastSyncAt: number | null;
  report: MergeReport | null;
}

const IDLE: SyncState = { status: 'ocioso', message: null, lastSyncAt: null, report: null };

export function useDriveSync() {
  const { googleAccessToken, user } = useAuth();
  const { snapshot, applyBackup } = useApp();
  const [state, setState] = useState<SyncState>(IDLE);

  /** A sincronização exige uma sessão do Google viva. */
  const available = user?.provider === 'google' && googleAccessToken != null;

  const sync = useCallback(async () => {
    if (!googleAccessToken) {
      setState({
        status: 'erro',
        message: 'Entre com o Google para sincronizar. O acesso ao Drive vale por uma sessão.',
        lastSyncAt: state.lastSyncAt,
        report: null,
      });
      return;
    }

    setState((current) => ({ ...current, status: 'sincronizando', message: null }));

    try {
      const local = snapshot();
      const remote = await downloadBackup(googleAccessToken);

      // Sem backup lá ainda: o primeiro envio é só uma cópia do que existe aqui.
      const merged = remote ? mergeBackup(local, remote) : null;
      const contents = merged?.contents ?? local;

      if (merged) await applyBackup(merged.contents);
      await uploadBackup(googleAccessToken, createBackup(contents, Platform.OS));

      const now = Date.now();
      setState({
        status: 'ok',
        message: merged
          ? `${merged.added.cards} cards novos e ${merged.updated.cards} atualizados vieram do Drive.`
          : 'Primeiro backup enviado para o Drive.',
        lastSyncAt: now,
        report: merged,
      });
    } catch (error) {
      const message =
        error instanceof DriveAuthError || error instanceof DriveError
          ? error.message
          : 'Não foi possível sincronizar agora.';
      setState((current) => ({ ...current, status: 'erro', message, report: null }));
    }
  }, [applyBackup, googleAccessToken, snapshot, state.lastSyncAt]);

  return { ...state, available, sync };
}
