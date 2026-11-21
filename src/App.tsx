import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurationError, fallback, makeClient, project } from './lib/supabase';
import type { Client } from './lib/supabase';
import { clearCache } from './lib/domain.mjs';
import { Dashboard } from './Dashboard';

export default function App() {
  const [client, setClient] = useState<Client | null>(() => configurationError ? null : makeClient());
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(false);
  useEffect(() => {
    if (!client) { setLoading(false); return; }
    let alive = true;
    client.auth.getSession().then(({ data, error }) => { if (alive) { setSession(data.session); setLoading(false); if (error) setError('网络较慢，请稍后重试'); } });
    const { data } = client.auth.onAuthStateChange((event, next) => { if (alive) { setSession(next); setLoading(false); } });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, [client]);
  const switchRoute = async () => {
    if (!fallback || route || !client) return;
    const old = client; const next = makeClient(true);
    if (session) { const result = await next.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }); if (result.error) { setError('备用线路连接失败，保留原线路'); return; } }
    await old.removeAllChannels(); old.auth.stopAutoRefresh(); setClient(next); setRoute(true); setError('');
  };
  if (!client) return <div className="shell"><h1>家庭生活看板</h1><p role="alert">尚未配置连接：{configurationError}</p><p>请按 README 配置环境变量并重新构建。不要填写管理员密钥。</p></div>;
  if (loading) return <div className="shell"><p>正在检查登录状态…</p></div>;
  return <div className="shell">{route && <p className="notice">已切换线路</p>}{error && <p role="alert" className="notice">{error}</p>}
    {session ? <Dashboard key={`${session.user.id}:${route}`} client={client} userId={session.user.id} onLogout={async () => {
      clearCache(project, session.user.id);
      try { for (const key of Object.keys(localStorage)) if (key.startsWith(`family-weather:${project}:${session.user.id}:`)) localStorage.removeItem(key); } catch { }
      await client.removeAllChannels();
      const result = await client.auth.signOut({ scope: 'local' }); if (result.error) setError('退出失败，请重试'); else setSession(null);
    }} /> : <Login client={client} />}
    {fallback && !route && <button onClick={() => void switchRoute()}>网络较慢？切换备用线路</button>}
  </div>;
}
function Login({ client }: { client: Client }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [register, setRegister] = useState(false);
  return <section className="login card"><p className="eyebrow">FAMILY / 日常，好好过</p><h1>家里的事</h1><p>登录后查看和记录，手机与电脑使用同一账号即可同步。</p><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setMessage(''); const form = new FormData(e.currentTarget);
    const credentials = { email: String(form.get('email')).trim(), password: String(form.get('password')) };
    try {
      const result = register ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, location.origin).href } }) : await client.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (register && !result.data.session) setMessage('注册成功，请在邮箱完成确认后登录。');
    } catch (err) { setMessage(`登录/注册失败：${(err as Error).message}。网络较慢时请稍后重试。`); }
    finally { setBusy(false); }
  }}><label>邮箱<input name="email" type="email" autoComplete="email" required /></label><label>密码<input name="password" type="password" minLength={8} autoComplete={register ? 'new-password' : 'current-password'} required /></label><button className="primary" disabled={busy}>{busy ? '处理中…' : register ? '注册' : '登录'}</button></form>
    <button disabled={busy} onClick={() => setRegister(!register)}>{register ? '已有账号，去登录' : '首次使用，注册账号'}</button><p role="status">{message}</p><p className="small">此页面未登录不读取业务数据；权限由 Supabase RLS 控制。请勿与不信任的人共享账号。</p></section>;
}
