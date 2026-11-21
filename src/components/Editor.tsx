import { useState } from 'react';
import type { Row, Table } from '../hooks/useData';
export type Field = { name: string; label: string; type?: string; options?: [string, string][]; required?: boolean; min?: string; max?: string; step?: string };
export const fields: Record<Table, Field[]> = {
  config: [{ name: 'city', label: '城市', required: true }, { name: 'lat', label: '纬度', type: 'number', min: '-90', max: '90', step: 'any', required: true }, { name: 'lon', label: '经度', type: 'number', min: '-180', max: '180', step: 'any', required: true }, { name: 'nickname', label: '昵称' }, { name: 'lmp', label: '末次月经第一天（与预产期只填一个）', type: 'date' }, { name: 'due_date', label: '预产期', type: 'date' }, { name: 'avoid_tags', label: '忌口标签（逗号分隔）' }],
  expenses: [{ name: 'date', label: '日期', type: 'date', required: true }, { name: 'amount', label: '金额（元）', type: 'number', min: '0.01', step: '0.01', required: true }, { name: 'category', label: '分类', required: true }, { name: 'payment_method', label: '支付方式', required: true }, { name: 'note', label: '备注' }],
  checkups: [{ name: 'date', label: '日期', type: 'date', required: true }, { name: 'item', label: '项目', required: true }, { name: 'hospital_note', label: '医院代号 / 备注' }, { name: 'next_date', label: '下次产检日期', type: 'date' }],
  weights: [{ name: 'date', label: '日期', type: 'date', required: true }, { name: 'weight', label: '体重（kg）', type: 'number', min: '1', max: '500', step: '.01', required: true }],
  todos: [{ name: 'title', label: '待办内容', required: true }],
  meals: [{ name: 'name', label: '菜谱名称', required: true }, { name: 'meal_type', label: '餐别', options: [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐']] }, { name: 'tags', label: '标签（逗号分隔）' }, { name: 'conflict_tags', label: '忌口冲突食材标签（逗号分隔）' }, { name: 'duration_min', label: '耗时（分钟）', type: 'number', min: '1', max: '1440', step: '1', required: true }],
};
export function Editor({ table, original, busy, onSave, onClose }: { table: Table; original?: Row; busy: boolean; onSave: (row: Partial<Row>) => Promise<void>; onClose: () => void }) {
  const [error, setError] = useState('');
  return <section className="card editor" aria-label="记录编辑"><h3>{original ? '编辑记录' : '新增记录'}</h3><form onSubmit={async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const row: Partial<Row> = {};
    for (const f of fields[table]) {
      const value = String(form.get(f.name) || '').trim();
      row[f.name] = ['tags', 'avoid_tags', 'conflict_tags'].includes(f.name) ? [...new Set(value.split(/[,，]/).map(x => x.trim()).filter(Boolean))] : f.type === 'number' ? Number(value) : f.type === 'date' ? value || null : value;
    }
    if (table === 'config' && Boolean(row.lmp) === Boolean(row.due_date)) { setError('末次月经和预产期必须只填一个'); return; }
    if (table === 'todos' && !original) row.done = false;
    try { await onSave(row); } catch (err) { setError((err as Error).message || '保存失败'); }
  }}>
    {fields[table].map(f => { const value = original?.[f.name]; const initial = Array.isArray(value) ? value.join('，') : value ?? ''; return <label key={f.name}>{f.label}{f.options ? <select name={f.name} defaultValue={initial || f.options[0][0]}>{f.options.map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select> : <input name={f.name} type={f.type || 'text'} required={f.required} min={f.min} max={f.max} step={f.step} defaultValue={initial} />}</label>; })}
    {error && <p role="alert">{error}</p>}<div className="actions"><button className="primary" disabled={busy}>保存</button><button type="button" disabled={busy} onClick={onClose}>取消</button></div>
  </form></section>;
}
