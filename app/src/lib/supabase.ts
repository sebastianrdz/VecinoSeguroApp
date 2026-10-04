import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';

// expo-secure-store enforces a 2048-byte value limit per key. Supabase
// sessions (access + refresh token + user) can exceed that, so large values
// are chunked across multiple SecureStore keys.
const CHUNK_LIMIT = 2000;

async function getChunkedItem(key: string): Promise<string | null> {
  const chunkCountRaw = await SecureStore.getItemAsync(`${key}_chunks`);
  if (!chunkCountRaw) {
    // Not chunked — try the plain key (covers values under the limit).
    return SecureStore.getItemAsync(key);
  }
  const chunkCount = parseInt(chunkCountRaw, 10);
  const chunks: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
    if (chunk == null) return null;
    chunks.push(chunk);
  }
  return chunks.join('');
}

async function setChunkedItem(key: string, value: string): Promise<void> {
  if (value.length <= CHUNK_LIMIT) {
    await SecureStore.setItemAsync(key, value);
    await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => undefined);
    return;
  }
  const chunkCount = Math.ceil(value.length / CHUNK_LIMIT);
  const writes: Promise<void>[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = value.slice(i * CHUNK_LIMIT, (i + 1) * CHUNK_LIMIT);
    writes.push(SecureStore.setItemAsync(`${key}_${i}`, chunk));
  }
  await Promise.all(writes);
  await SecureStore.setItemAsync(`${key}_chunks`, String(chunkCount));
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

async function removeChunkedItem(key: string): Promise<void> {
  const chunkCountRaw = await SecureStore.getItemAsync(`${key}_chunks`);
  if (chunkCountRaw) {
    const chunkCount = parseInt(chunkCountRaw, 10);
    await Promise.all(
      Array.from({ length: chunkCount }, (_, i) =>
        SecureStore.deleteItemAsync(`${key}_${i}`)
      )
    );
    await SecureStore.deleteItemAsync(`${key}_chunks`);
  }
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
}

/** Persists the Supabase auth session in the device secure enclave/keystore. */
const SecureStoreAdapter: SupportedStorage = {
  getItem: getChunkedItem,
  setItem: setChunkedItem,
  removeItem: removeChunkedItem,
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at startup rather than with a confusing network error later.
  // eslint-disable-next-line no-console
  console.warn(
    '[VecinoSeguro] Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copia app/.env.example a app/.env y define los valores del proyecto.'
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Video base URL for the go2rtc/Caddy stream, per CONTRACT.md "Video". */
export const VIDEO_BASE_URL = process.env.EXPO_PUBLIC_VIDEO_BASE_URL ?? '';

/**
 * Builds the authed stream URL for a camera's `stream_key`, per CONTRACT.md:
 * `GET {VIDEO_BASE_URL}/stream.html?src={stream_key}`.
 *
 * SECURITY: `videoToken` MUST be the short-lived (`purpose:"video"`, TTL 60s)
 * token minted by the `issue-video-token` Edge Function — see
 * `useVideoToken()` — NEVER the raw ~1h Supabase user session JWT. Caddy
 * only accepts `purpose == "video"` tokens, so passing the user JWT here
 * will simply be rejected, and would defeat the whole point of this being a
 * revocable, short-lived credential (see CONTRACT.md "issue-video-token").
 *
 * Per CONTRACT.md's sub-stream convention, pass `{ sub: true }` to request
 * the low-bandwidth `{stream_key}_sub` variant (used by the Cámaras grid);
 * omit it (or pass `false`) for the full-quality `{stream_key}` variant
 * (used by the fullscreen player).
 */
export function buildStreamUrl(
  streamKey: string,
  videoToken: string,
  options?: { sub?: boolean }
): string {
  const base = VIDEO_BASE_URL.replace(/\/+$/, '');
  const src = options?.sub ? `${streamKey}_sub` : streamKey;
  const params = new URLSearchParams({
    src,
    access_token: videoToken,
  });
  return `${base}/stream.html?${params.toString()}`;
}
