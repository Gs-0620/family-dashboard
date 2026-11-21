import { createClient } from '@supabase/supabase-js';

function root(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Supabase 地址必须使用 HTTPS');
  return url.origin;
}
function publicKey(key: string) {
  if (key.startsWith('sb_secret_')) throw new Error('禁止使用 secret key');
  if (key.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw new Error('只允许 anon/publishable key');
    } catch { throw new Error('Supabase key 无效或权限过高'); }
  } else if (!key.startsWith('sb_publishable_')) throw new Error('请设置 anon 或 publishable key');
}
export const project = import.meta.env.VITE_SUPABASE_URL || '';
export const fallback = import.meta.env.VITE_SUPABASE_URL_FALLBACK || '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export let configurationError = '';
try { root(project); publicKey(key); if (fallback) root(fallback); } catch (e) { configurationError = e instanceof Error ? e.message : '请设置 Supabase 环境变量'; }
export async function timedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) controller.abort();
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
}
export function makeClient(useFallback = false) {
  if (configurationError) throw new Error(configurationError);
  return createClient(root(useFallback ? fallback : project), key, {
    global: { fetch: timedFetch },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: `family-auth:${root(project)}` },
    realtime: { timeout: 15000 },
  });
}
export type Client = ReturnType<typeof makeClient>;
