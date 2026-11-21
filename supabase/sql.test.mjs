import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./init.sql', import.meta.url), 'utf8');
const tables = ['config', 'expenses', 'checkups', 'weights', 'todos', 'meals'];
const blocks = Object.fromEntries(tables.map(name => {
  const block = sql.match(new RegExp(`create table public\\.${name} \\(([\\s\\S]*?)\\n\\);`));
  assert.ok(block, `Missing ${name}`);
  return [name, block[1]];
}));

test('exactly six owner-scoped tables with UUID defaults, FK cascade and timestamps', () => {
  assert.equal((sql.match(/create table public\./g) ?? []).length, 6);
  for (const [name, block] of Object.entries(blocks)) {
    assert.match(block, /id uuid primary key default gen_random_uuid\(\)/, name);
    assert.match(block, /user_id uuid not null default auth\.uid\(\)(?: unique)? references auth\.users\(id\) on delete cascade/, name);
    assert.match(block, /updated_at timestamptz not null default now\(\)/, name);
    if (name !== 'config') assert.match(block, /created_at timestamptz not null default now\(\)/, name);
  }
  assert.match(blocks.config, /user_id uuid[^\n]* unique /);
});

test('positive values, meal domain and owner-led list indexes', () => {
  assert.match(blocks.expenses, /amount numeric\(12,2\) not null check \(amount > 0 and amount <> 'NaN'::numeric\)/);
  assert.match(blocks.weights, /check \(weight > 0 and weight <> 'NaN'::numeric\)/);
  assert.match(blocks.meals, /meal_type in \('breakfast', 'lunch', 'dinner'\)/);
  assert.match(blocks.meals, /tags text\[\] not null default '\{\}'/);
  assert.match(blocks.meals, /conflict_tags text\[\] not null default '\{\}'/);
  assert.match(blocks.meals, /duration_min integer not null check \(duration_min > 0\)/);
  for (const name of tables.filter(name => name !== 'config')) {
    assert.match(sql, new RegExp(`create index .* on public\\.${name} \\(user_id,`));
  }
});

test('all-table loop installs forced RLS, own-row checks and explicit CRUD only', () => {
  const list = "array['config', 'expenses', 'checkups', 'weights', 'todos', 'meals']";
  assert.equal(sql.split(list).length - 1, 2);
  assert.match(sql, /alter table public\.%I enable row level security/);
  assert.match(sql, /alter table public\.%I force row level security/);
  assert.match(sql, /revoke all on table public\.%I from public, anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete on table public\.%I to authenticated/);
  assert.match(sql, /for all to authenticated using \(\(select auth\.uid\(\)\) = user_id\) with check \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(sql, /grant[^;]*to anon/i);
});

test('invoker trigger, default DELETE identity and guarded publication registration', () => {
  assert.match(sql, /security invoker\nset search_path = ''/);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /new\.updated_at = now\(\)/);
  assert.match(sql, /before update on public\.%I for each row execute function public\.family_dashboard_stamp_updated_at\(\)/);
  assert.match(sql, /replica identity default/);
  assert.doesNotMatch(sql, /replica identity full/i);
  assert.match(sql, /if not exists \(select 1 from pg_publication where pubname = 'supabase_realtime'\)/);
  assert.match(sql, /from pg_publication_tables[\s\S]*tablename = table_name/);
  assert.match(sql, /alter publication supabase_realtime add table public\.%I/);
  assert.match(sql, /begin;[\s\S]*commit;/);
  assert.doesNotMatch(sql, /insert into|service_role|secret_key/i);
});
