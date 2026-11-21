import { useEffect, useState } from 'react';
import { RowActions } from '../Dashboard';
import type { Controls } from '../Dashboard';
import type { Data, Row } from '../hooks/useData';
import { chooseMeal, filterMeals, pregnancyInfo, todayCN } from '../lib/domain.mjs';
import { project } from '../lib/supabase';

export function Pregnancy({ data, toggle, ...controls }: Controls & { data: Data; toggle: (row: Row) => Promise<void> }) {
  const [today, setToday] = useState(todayCN());
  useEffect(() => { const timer = setInterval(() => setToday(todayCN()), 60000); return () => clearInterval(timer); }, []);
  const config = data.config[0]; const info = config ? pregnancyInfo({ lmp: config.lmp || '', edd: config.due_date || '' }, today) : null;
  const next = data.checkups.flatMap(r => [r.date, r.next_date]).filter(d => d && d >= today).sort()[0];
  const weights = [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  return <><h2>{config?.nickname || '准妈妈'}的孕期</h2><p className="notice">仅显示昵称。请勿填写身份证、真实姓名或医院全称。孕周与预产期仅供记录，以医生评估为准。</p>
    {info && <div className="grid"><section className="card"><p>{info.status === 'before' ? '基准日期尚未到达' : `孕${['早', '中', '晚'][info.trimester - 1]}期`}</p><div className="metric">{info.weeks}周 + {info.dayOfWeek}天</div></section><section className="card"><p>{info.status === 'overdue' ? '已超过预计预产期' : '距离预产期'}</p><div className="metric">{info.remainingDays}天</div><p>预计预产期：{info.edd}</p><p>下次产检：{next || '未安排'}</p></section></div>}
    <div className="grid"><section className="card"><div className="heading"><h3>产检记录</h3><button disabled={controls.busy} onClick={() => controls.edit('checkups')}>添加</button></div>{data.checkups.map(r => <article className="record" key={r.id}><strong>{r.date} · {r.item}</strong><p>{r.hospital_note}</p>{r.next_date && <p>下次日期：{r.next_date}{r.next_date < today ? '（已过，请核对）' : ''}</p>}<RowActions {...controls} table="checkups" row={r} /></article>)}{!data.checkups.length && <p>暂无产检记录。</p>}</section>
      <section className="card"><div className="heading"><h3>体重趋势</h3><button disabled={controls.busy} onClick={() => controls.edit('weights')}>添加</button></div>{weights.map((r, i) => <article className="record" key={r.id}><strong>{r.date} · {r.weight} kg</strong>{i > 0 && <p>较上次 {(Number(r.weight) - Number(weights[i - 1].weight)).toFixed(2)} kg</p>}<RowActions {...controls} table="weights" row={r} /></article>)}{!weights.length && <p>暂无体重记录。</p>}</section></div>
    <section className="card"><div className="heading"><h3>待办清单</h3><button disabled={controls.busy} onClick={() => controls.edit('todos')}>添加</button></div>{data.todos.map(r => <article className="record" key={r.id}><label className="todo"><input type="checkbox" checked={r.done} disabled={controls.busy} onChange={() => void toggle(r)} />{r.title}</label><RowActions {...controls} table="todos" row={r} /></article>)}{!data.todos.length && <p>暂无待办。</p>}</section></>;
}
export function Meals({ rows, avoid, ...controls }: Controls & { rows: Row[]; avoid: string[] }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const types = [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐']];
  useEffect(() => { setChoices(Object.fromEntries(['breakfast', 'lunch', 'dinner'].map(type => [type, chooseMeal(rows.filter(r => r.meal_type === type), '', avoid)?.id || '']))); }, [rows, avoid]);
  return <><div className="heading"><h2>今天吃什么</h2><button disabled={controls.busy} onClick={() => controls.edit('meals')}>添加菜谱</button></div><p>忌口：{avoid.join('、') || '无'}。标签精确过滤，请自行核查过敏原。</p><div className="meal-grid">{types.map(([type, label]) => {
    const eligible: Row[] = filterMeals(rows.filter(r => r.meal_type === type), avoid);
    const chosen = eligible.find(r => r.id === choices[type]) || eligible[0];
    return <section className="card" key={type}><p>{label}</p><h3>{chosen?.name || '没有可选菜谱'}</h3>{chosen && <><p>{chosen.duration_min} 分钟 · {chosen.tags.join('、')}</p><p>冲突标签：{chosen.conflict_tags.join('、') || '无'}</p></>}<button disabled={eligible.length < 2} onClick={() => setChoices(s => ({ ...s, [type]: chooseMeal(eligible, chosen?.id)?.id || '' }))}>换一个</button></section>;
  })}</div><section className="card"><h3>菜谱库</h3>{rows.map(r => <article className="record" key={r.id}><strong>{r.name}</strong><p>{types.find(t => t[0] === r.meal_type)?.[1]} · {r.duration_min}分钟 · {r.tags.join('、')}</p><RowActions {...controls} table="meals" row={r} /></article>)}{!rows.length && <p>请添加自己的菜谱，业务数据不放在公开仓库。</p>}</section><p className="notice">推荐不替代营养建议。孕期食物彻底做熟，不食用未经巴氏杀菌奶制品，个体饮食要求遵医嘱。</p></>;
}
function weatherText(code: number) { return code === 0 ? '晴' : code <= 3 ? '多云 / 阴' : code < 50 ? '雾' : code < 70 ? '雨' : code < 80 ? '雪' : code < 90 ? '阵雨 / 阵雪' : '雷雨'; }
export function Weather({ config, userId }: { config?: Row; userId: string }) {
  const [weather, setWeather] = useState<any>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const lat = config?.lat; const lon = config?.lon;
  const key = `family-weather:${project}:${userId}:${lat}:${lon}`;
  const refresh = async () => {
    if (lat == null || lon == null) return;
    setBusy(true); let cache;
    try { cache = JSON.parse(localStorage.getItem(key) || 'null'); } catch { cache = null; }
    try {
      const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon), current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m', daily: 'weather_code,temperature_2m_max,temperature_2m_min', forecast_days: '5', timezone: 'Asia/Shanghai' });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = await response.json();
      if (!Number.isFinite(next.current?.temperature_2m) || !Array.isArray(next.daily?.time) || !['weather_code', 'temperature_2m_max', 'temperature_2m_min'].every(f => Array.isArray(next.daily[f]))) throw new Error('天气响应不完整');
      next.savedAt = new Date().toISOString(); setWeather(next); setError('');
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { }
    } catch (e) { setWeather(cache?.current && cache?.daily ? cache : null); setError(`天气失败：${(e as Error).message}。${cache ? '显示上次缓存，可能不是最新。' : '没有缓存，请稍后重试。'}`); }
    finally { setBusy(false); }
  };
  useEffect(() => { setWeather(null); void refresh(); }, [lat, lon]);
  return <><div className="heading"><h2>{config?.city || ''}天气</h2><button disabled={busy || lat == null} onClick={() => void refresh()}>{busy ? '查询中…' : '刷新天气'}</button></div>{!config && <p>请先设置城市与经纬度。</p>}{error && <p className="notice" role="alert">{error}</p>}{weather && <><section className="card"><p>{weatherText(weather.current.weather_code)}</p><div className="metric">{weather.current.temperature_2m}°C</div><p>湿度 {weather.current.relative_humidity_2m}% · 风速 {weather.current.wind_speed_10m} km/h</p><p>获取时间：{weather.savedAt}</p></section><div className="forecast">{weather.daily.time.map((d: string, i: number) => <section className="card" key={d}><strong>{d}</strong><p>{weatherText(weather.daily.weather_code[i])}</p><p>{weather.daily.temperature_2m_min[i]}～{weather.daily.temperature_2m_max[i]}°C</p></section>)}</div></>}<p className="small">天气来源 Open-Meteo，无 API Key。</p></>;
}
