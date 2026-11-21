import { useState } from 'react';
import type { Client } from './lib/supabase';
import { useData } from './hooks/useData';
import type { Row, Table } from './hooks/useData';
import { Editor } from './components/Editor';
import { expenseStats, todayCN } from './lib/domain.mjs';
import { Pregnancy, Meals, Weather } from './modules/Views';
export const money = (cents: number) => (cents / 100).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' });
export function Dashboard({ client, userId, onLogout }: { client: Client; userId: string; onLogout: () => Promise<void> }) {
  const store = useData(client, userId);
  const [tab, setTab] = useState(0);
  const [editor, setEditor] = useState<{ table: Table; row?: Row } | null>(null);
  const [undo, setUndo] = useState<{ table: Table; row: Row } | null>(null);
  const [error, setError] = useState('');
  const edit = (table: Table, row?: Row) => setEditor({ table, row });
  const remove = async (table: Table, row: Row) => {
    if (!confirm('确定删除这条记录？删除后可使用“撤销最近删除”恢复。')) return;
    try { await store.mutate(table, 'delete', row, row); setUndo({ table, row }); } catch (e) { setError((e as Error).message); }
  };
  const toggle = async (row: Row) => { try { await store.mutate('todos', 'update', { id: row.id, done: !row.done }, row); } catch (e) { setError((e as Error).message); } };
  return <><header><div><p className="eyebrow">FAMILY / 日常，好好过</p><h1>家里的事</h1></div><div className="actions"><button onClick={() => void store.refresh()}>手动刷新</button><button onClick={() => void onLogout()}>退出登录</button></div></header>
    <div className="sync" role="status"><span>{store.connection}</span><span>最后更新时间：{store.lastUpdate ? new Date(store.lastUpdate).toLocaleString('zh-CN') : '等待读取'}</span></div>
    {store.stale && <p className="notice">数据可能不是最新。{store.message || '正在连接，或正在显示本机最后缓存。'}</p>}
    {error && <p className="notice" role="alert">{error}<button onClick={() => setError('')}>关闭提示</button></p>}
    {undo && <div className="notice">最近删除可恢复（当前页面关闭后失效）。<button disabled={store.busy} onClick={async () => { try { const { updated_at, ...row } = undo.row; await store.mutate(undo.table, 'insert', row); setUndo(null); } catch (e) { setError((e as Error).message); } }}>撤销最近删除</button></div>}
    <nav aria-label="生活模块">{['消费记录', '天气', '孕期管理', '今天吃什么'].map((name, i) => <button key={name} className={tab === i ? 'active' : ''} aria-current={tab === i ? 'page' : undefined} onClick={() => { setTab(i); setEditor(null); }}>{name}</button>)}</nav>
    <div className="actions"><button onClick={() => edit('config', store.data.config[0])}>城市 / 孕期 / 忌口设置</button></div>
    {editor && <Editor key={`${editor.table}:${editor.row?.id || 'new'}`} table={editor.table} original={editor.row} busy={store.busy} onClose={() => setEditor(null)} onSave={async row => { await store.mutate(editor.table, editor.row ? 'update' : 'insert', editor.row ? { ...row, id: editor.row.id } : row, editor.row); setEditor(null); }} />}
    {!store.data.config.length && <p className="notice">首次使用请填写上方设置：城市、经纬度、末次月经或预产期，以及忌口。真实配置只保存到你的数据库。</p>}
    <main>{tab === 0 && <Expenses rows={store.data.expenses} busy={store.busy} edit={edit} remove={remove} />}
      {tab === 1 && <Weather config={store.data.config[0]} userId={userId} />}
      {tab === 2 && <Pregnancy data={store.data} busy={store.busy} edit={edit} remove={remove} toggle={toggle} />}
      {tab === 3 && <Meals rows={store.data.meals} avoid={store.data.config[0]?.avoid_tags || []} busy={store.busy} edit={edit} remove={remove} />}</main>
    <footer>数据由 Supabase 登录和 RLS 保护。本机可能缓存业务数据，退出登录会清理当前账号缓存。孕期记录仅作参考，不录入真实姓名、身份证或医院全称。</footer>
  </>;
}
export type Controls = { busy: boolean; edit: (table: Table, row?: Row) => void; remove: (table: Table, row: Row) => Promise<void> };
export function RowActions({ table, row, busy, edit, remove }: Controls & { table: Table; row: Row }) {
  return <div className="actions"><button disabled={busy} onClick={() => edit(table, row)}>编辑</button><button disabled={busy} onClick={() => void remove(table, row)}>删除</button></div>;
}
function Expenses({ rows, ...controls }: Controls & { rows: Row[] }) {
  const [month, setMonth] = useState(todayCN().slice(0, 7)); const [category, setCategory] = useState('');
  const filtered = rows.filter(r => r.date.startsWith(month) && (!category || category === r.category));
  const stats = expenseStats(filtered); const total = expenseStats(rows, todayCN().slice(0, 7));
  const maximum = Math.max(1, ...Object.values(stats.byCategory) as number[]);
  return <><div className="heading"><h2>消费记录</h2><button disabled={controls.busy} onClick={() => controls.edit('expenses')}>记一笔</button></div>
    <div className="grid"><section className="card"><p>本月总支出</p><div className="metric">{money(total.totalCents)}</div></section><section className="card"><p>当前筛选支出</p><div className="metric">{money(stats.totalCents)}</div><p>{filtered.length} 条记录</p></section></div>
    <div className="filters"><label>月份<input type="month" value={month} onChange={e => setMonth(e.target.value || todayCN().slice(0, 7))} /></label><label>分类<select value={category} onChange={e => setCategory(e.target.value)}><option value="">全部</option>{[...new Set(rows.map(r => r.category))].map(c => <option key={c}>{c}</option>)}</select></label></div>
    <div className="grid"><section className="card"><h3>分类统计</h3>{Object.entries(stats.byCategory).map(([name, cents]) => <div key={name}><div className="spread"><span>{name}</span><strong>{money(cents as number)}</strong></div><div className="track"><div style={{ width: `${Number(cents) / maximum * 100}%` }} /></div></div>)}{!filtered.length && <p>暂无消费记录。</p>}</section><section className="card"><h3>最近记录</h3>{[...filtered].sort((a, b) => b.date.localeCompare(a.date)).map(row => <article className="record" key={row.id}><div className="spread"><strong>{row.category}</strong><strong>{money(Math.round(Number(row.amount) * 100))}</strong></div><p>{row.date} · {row.payment_method}</p><p>{row.note}</p><RowActions {...controls} table="expenses" row={row} /></article>)}</section></div></>;
}
