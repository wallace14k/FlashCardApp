import { Backup, BackupFormatError, parseBackup } from './backup';

/**
 * Sincronização com o Google Drive.
 *
 * O backup vai para a `appDataFolder` — uma pasta oculta, privada do app, que
 * não aparece no Drive do usuário e não ocupa espaço visível. É o lugar certo
 * para dados de aplicativo: o usuário não apaga por engano, e o app não
 * enxerga nenhum outro arquivo dele.
 *
 * O escopo `drive.appdata` é justamente esse acesso restrito — não dá ao app
 * permissão de ler os arquivos pessoais de ninguém.
 */

/** Único escopo do Drive que o app pede. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const FILE_NAME = 'linguacards-backup.json';
const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

export class DriveError extends Error {}

/** Erro de token expirado/revogado, que a interface trata pedindo novo login. */
export class DriveAuthError extends DriveError {}

async function driveFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new DriveError('Não foi possível falar com o Google Drive. Verifique sua conexão.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new DriveAuthError('O acesso ao Drive expirou. Entre com o Google novamente.');
  }
  if (!response.ok) {
    throw new DriveError(`O Google Drive respondeu com erro ${response.status}.`);
  }
  return response;
}

export interface DriveFile {
  id: string;
  name: string;
  /** Data da última modificação, no formato RFC 3339. */
  modifiedTime: string;
}

/** Procura o backup na pasta privada do app. `null` se ainda não existe. */
export async function findBackupFile(token: string): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${FILE_NAME}'`,
    fields: 'files(id,name,modifiedTime)',
    pageSize: '1',
  });
  const response = await driveFetch(`${FILES_ENDPOINT}?${params}`, token);
  const data = (await response.json()) as { files?: DriveFile[] };
  return data.files?.[0] ?? null;
}

/**
 * Envia o backup, criando o arquivo na primeira vez e substituindo depois.
 * Devolve o arquivo resultante.
 */
export async function uploadBackup(token: string, backup: Backup): Promise<DriveFile> {
  const body = JSON.stringify(backup);
  const existing = await findBackupFile(token);

  if (existing) {
    const response = await driveFetch(
      `${UPLOAD_ENDPOINT}/${existing.id}?uploadType=media&fields=id,name,modifiedTime`,
      token,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }
    );
    return (await response.json()) as DriveFile;
  }

  // Criação exige enviar metadados e conteúdo juntos, em multipart.
  const boundary = `linguacards-${Date.now()}`;
  const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n` +
    `--${boundary}--`;

  const response = await driveFetch(
    `${UPLOAD_ENDPOINT}?uploadType=multipart&fields=id,name,modifiedTime`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    }
  );
  return (await response.json()) as DriveFile;
}

/** Baixa e valida o backup guardado no Drive. `null` se não houver nenhum. */
export async function downloadBackup(token: string): Promise<Backup | null> {
  const file = await findBackupFile(token);
  if (!file) return null;

  const response = await driveFetch(`${FILES_ENDPOINT}/${file.id}?alt=media`, token);
  const raw = await response.text();
  try {
    return parseBackup(raw);
  } catch (error) {
    if (error instanceof BackupFormatError) throw new DriveError(error.message);
    throw error;
  }
}
