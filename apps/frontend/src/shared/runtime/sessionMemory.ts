/**
 * Memória da aba para leituras que outra tela já fez (D-167). Vive só em
 * memória, enquanto a página não é recarregada, e pertence a uma sessão: o
 * `ProductRuntimeProvider` a esvazia quando a pessoa ou o negócio da sessão
 * mudam, ou quando a sessão acaba. Quem lê daqui mostra o valor na hora e
 * revalida em segundo plano; nada aqui substitui a leitura do servidor.
 *
 * As chaves usam prefixo por área (`agenda:`) e as mais antigas saem quando
 * o limite é atingido: a memória nunca cresce com a navegação.
 */

const MAX_ENTRIES = 48;

let owner: string | null = null;
const entries = new Map<string, unknown>();

/** Troca o dono da memória; outro dono (ou nenhum) começa vazio. */
export function claimSessionMemory(identity: string | null): void {
  if (identity === owner) return;
  owner = identity;
  entries.clear();
}

/** Grava o valor como o mais recente da chave. */
export function remember(key: string, value: unknown): void {
  entries.delete(key);
  entries.set(key, value);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function recall<T>(key: string): T | undefined {
  return entries.get(key) as T | undefined;
}

/** As entradas com o prefixo, da mais recente para a mais antiga. */
export function recallAll<T>(prefix: string): Array<[string, T]> {
  const found: Array<[string, T]> = [];
  for (const [key, value] of entries) {
    if (key.startsWith(prefix)) found.push([key, value as T]);
  }
  return found.reverse();
}

/** Esquece as entradas com o prefixo, ou tudo sem prefixo. */
export function forget(prefix = ""): void {
  for (const key of Array.from(entries.keys())) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}
