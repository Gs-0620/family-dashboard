import { useCallback, useEffect, useRef, useState } from 'react';
import type { Client } from '../lib/supabase';
import { project } from '../lib/supabase';
import { clearCache, readCache, saveCache } from '../lib/domain.mjs';

export const tables = ['config', 'expenses', 'checkups', 'weights', 'todos', 'meals'] as const;
export type Table = typeof tables[number];
export type Row = { id: string; user_id: string; updated_at: string; [key: string]: any };
export type Data = Record<Table, Row[]>;
const empty = (): Data => ({ config: [], expenses: [], checkups: [], weights: [], todos: [], meals: [] });
export function useData(client: Client, userId: string) {
  const [data, setData] = useState<Data>(empty);
  const state = useRef(data);
  const [stale, setStale] = useState(true);
  const [message, setMessage] = useState('');
  const [connection, setConnection] = useState('连接中');
  const [lastUpdate, setLastUpdate] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const queued = useRef(false);
  const writing = useRef(false);
  const revision = useRef(0);
  const commit = useCallback((next: Data, cache = true) => {
    if (!mounted.current) return;
    state.current = next; setData(next);
    if (cache) saveCache(project, userId, next);
  }, [userId]);
  const query = useCallback(async (table: Table) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await client.from(table).select('*').eq('user_id', userId).order('updated_at', { ascending: false });
      if (!result.error) return result.data as Row[];
      if (attempt === 1 || ![0, 502, 503, 504].includes(result.status)) throw result.error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('读取失败');
  }, [client, userId]);
  const refresh = useCallback(async () => {
    if (pending.current || writing.current) { queued.current = true; return; }
    pending.current = true;
    queued.current = false;
    const current = revision.current;
    try {
      const rows = await Promise.all(tables.map(query));
      if (!mounted.current || revision.current !== current) return;
      commit(Object.fromEntries(tables.map((t, i) => [t, rows[i]])) as Data);
      setStale(false); setMessage(''); setLastUpdate(new Date().toISOString());
    } catch (e) { if (mounted.current) { setStale(true); setMessage(`网络较慢，请稍后重试。${(e as Error).message || '检查初始化 SQL 与权限'}`); } }
    finally { pending.current = false; if (queued.current && mounted.current) setTimeout(() => void refresh(), 200); }
  }, [query, commit]);
  useEffect(() => {
    mounted.current = true;
    const cached = readCache(project, userId);
    if (cached && tables.every(t => Array.isArray(cached[t]) && cached[t].every((r: Row) => r.user_id === userId))) commit(cached, false);
    void refresh();
    let refreshTimer: ReturnType<typeof setTimeout>;
    const channel = client.channel(`family:${userId}:${crypto.randomUUID()}`);
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => void refresh(), 150);
      });
    }
    channel.subscribe(status => {
      if (!mounted.current) return;
      setConnection(status === 'SUBSCRIBED' ? '实时已连接' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? '实时连接异常，可手动刷新' : '连接中');
      if (status === 'SUBSCRIBED') void refresh(); else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStale(true);
    });
    const online = () => void refresh();
    const offline = () => { setStale(true); setConnection('离线'); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', online); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', visible);
    return () => { mounted.current = false; clearCache(project, userId); clearTimeout(refreshTimer); void client.removeChannel(channel); window.removeEventListener('online', online); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
  }, [client, userId, commit, refresh]);
  const mutate = useCallback(async (table: Table, mode: 'insert' | 'update' | 'delete', payload: Partial<Row>, original?: Row) => {
    if (writing.current || !navigator.onLine) throw new Error('离线或正在提交，请稍后重试');
    if (mode !== 'insert' && !original) throw new Error('缺少原记录');
    writing.current = true; setBusy(true); revision.current++;
    const before = state.current;
    const row = { ...payload, id: payload.id || crypto.randomUUID(), user_id: userId };
    commit({ ...before, [table]: mode === 'delete' ? before[table].filter(r => r.id !== row.id) : mode === 'update' ? before[table].map(r => r.id === row.id ? { ...r, ...row } : r) : [row as Row, ...before[table]] }, false);
    try {
      let request;
      if (mode === 'insert') request = client.from(table).insert(row).select();
      else if (mode === 'update') request = client.from(table).update(payload).eq('id', row.id).eq('user_id', userId).eq('updated_at', original!.updated_at).select();
      else request = client.from(table).delete().eq('id', row.id).eq('user_id', userId).eq('updated_at', original!.updated_at).select();
      const result = await request;
      if (result.error) throw result.error;
      if (result.data?.length !== 1) throw new Error('记录已被其他设备修改，请刷新后再操作');
      const latest = state.current;
      commit({ ...latest, [table]: mode === 'delete' ? latest[table].filter(r => r.id !== row.id) : [result.data[0] as Row, ...latest[table].filter(r => r.id !== row.id)] });
      setStale(false); setMessage(''); setLastUpdate(new Date().toISOString());
      return result.data[0] as Row;
    } catch (e) {
      commit(before, false); setStale(true);
      setMessage(`提交失败，已回滚本地显示。网络较慢，请稍后重试；若超时，请先刷新确认是否已提交。${(e as Error).message}`);
      throw e;
    } finally { writing.current = false; setBusy(false); revision.current++; void refresh(); }
  }, [client, userId, commit, refresh]);
  return { data, stale, message, connection, lastUpdate, busy, refresh, mutate };
}
