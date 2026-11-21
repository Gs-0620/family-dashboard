# Supabase 初始化与隔离验证

## 边界与执行顺序

本目录只交付 SQL 和验证材料，没有执行远程 SQL、创建账号、写入业务记录或保存密钥。`init.sql` 是**空项目的一次性初始化脚本**，非幂等升级迁移：已有同名表或函数时应先审查现有结构，不要删除现有数据来绕过错误。整个脚本放在事务中，遇错需回滚；发布表注册会检查是否已经加入。

1. 在自己的 Supabase 项目启用 email/password Auth，审查注册与邮件确认策略。
2. 由项目管理员在 SQL Editor 执行完整 `init.sql`。管理员执行是安装，不是 RLS 验证。
3. 用下方 introspection SQL 检查表、权限、约束、触发器、策略和 publication。
4. 创建两个专用测试账号 A/B；如启用邮件确认，先完成确认。不要用已有业务账号跑删除测试。
5. 在已部署页面的浏览器开发者工具运行下方测试。只使用 publishable key 或旧版 anon key；**禁止 service_role/secret key**。输入的测试密码仅在当前浏览器变量内使用，跑完关闭测试窗口。
6. 再验证实际 UI 登录、登出、增删改、撤销、刷新、双窗口同步及掉线重连。静态测试通过不等于这些在线测试已通过。

## Pages 子路径和 Auth URL

例如 Pages 页面在 `https://OWNER.github.io/REPO/`：Supabase Auth → URL Configuration 的 Site URL 填完整 `https://OWNER.github.io/REPO/`，Redirect URLs 至少添加同一个完整地址（包含 `/REPO/` 和尾斜杠），不要只填域名根目录。若另有自定义域名或本地开发地址，分别明确列出实际地址。实际路由若使用回调子路径，则添加该完整回调 URL。

注册邮件、密码重置的 redirect 参数应与配置一致：`emailRedirectTo` / `redirectTo` 用应用完整部署 URL，不用 `location.origin`，后者会丢失 Pages 子路径。密码登录 `signInWithPassword` 本身不要求重定向。验证邮件点击后需确认 session 正确恢复，并按实际前端的 URL session 检测模式验证；SMTP、邮件额度、确认链接行为与部署路径依项目配置而异，不能仅凭 SQL 保证。

## SQL introspection（管理员结构审查）

```sql
select c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relreplident
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('config','expenses','checkups','weights','todos','meals');
-- 期望每表 RLS/force=true，identity=d。
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in
  ('config','expenses','checkups','weights','todos','meals');
-- 每表 own_rows / authenticated / ALL；USING 和 WITH CHECK 都比较 auth.uid 与 user_id。
select table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name in
  ('config','expenses','checkups','weights','todos','meals')
order by table_name, grantee, privilege_type;
-- anon/PUBLIC 不应有表权限；authenticated 只有 SELECT/INSERT/UPDATE/DELETE。
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema = 'public' and table_name in
  ('config','expenses','checkups','weights','todos','meals')
order by table_name, ordinal_position;
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid in
  ('public.config'::regclass,'public.expenses'::regclass,'public.checkups'::regclass,
   'public.weights'::regclass,'public.todos'::regclass,'public.meals'::regclass);
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in
  ('config','expenses','checkups','weights','todos','meals');
select tgrelid::regclass as table_name, tgname, pg_get_triggerdef(oid)
from pg_trigger where not tgisinternal and tgname = 'stamp_updated_at';
select proname, prosecdef, proconfig from pg_proc
where oid = 'public.family_dashboard_stamp_updated_at()'::regprocedure;
-- prosecdef=false，search_path 为空。
select pubname, schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('config','expenses','checkups','weights','todos','meals');
-- 应含全部六表。
```

管理员/service_role/具 BYPASSRLS 的数据库角色可绕过 RLS；上面这些查询只验证安装结构。实际隔离证据必须来自下面的匿名和两个普通 Auth 会话。

## 浏览器匿名 + 双用户可执行测试

在专用测试页面的 Console 粘贴以下完整代码，按提示输入项目 URL、公钥和 A/B 账号密码。若页面 CSP 禁止 CDN import，可在使用现有 `@supabase/supabase-js` 的项目开发工具中执行同一段逻辑；不要为了测试关闭安全策略。测试使用三个独立非持久 session，不读取 UI 的登录状态。数据为临时合成测试值，不是 SQL 种子。

```js
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
const url = prompt('Supabase project URL');
const key = prompt('publishable key / anon key (NEVER service_role)');
const options = { auth: { persistSession: false, autoRefreshToken: false,
  detectSessionInUrl: false } };
const anon = createClient(url, key, options);
const a = createClient(url, key, options);
const b = createClient(url, key, options);
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const good = (r, msg) => { assert(!r.error, `${msg}: ${r.error?.message}`); return r.data; };
async function login(client, label) {
  const r = await client.auth.signInWithPassword({
    email: prompt(`${label} test email`), password: prompt(`${label} test password`)
  });
  return good(r, `${label} login`).user.id;
}
const aid = await login(a, 'A');
const bid = await login(b, 'B');
assert(aid !== bid, 'A/B must be different users');
const fixtures = {
  config: { nickname: 'RLS_TEST', city: '' },
  expenses: { date: '2000-01-01', amount: 1, category: 'RLS_TEST', payment_method: 'TEST' },
  checkups: { date: '2000-01-01', item: 'RLS_TEST' },
  weights: { date: '2000-01-01', weight: 1 },
  todos: { title: 'RLS_TEST', done: false },
  meals: { name: 'RLS_TEST', meal_type: 'breakfast', duration_min: 1 }
};
const updates = {
  config: { nickname: 'RLS_TEST_UPDATED' }, expenses: { note: 'UPDATED' },
  checkups: { hospital_note: 'UPDATED' }, weights: { weight: 2 },
  todos: { done: true }, meals: { duration_min: 2 }
};
const cleanup = [];
try {
  // Refuse to overwrite existing config, including any accidental business account.
  for (const client of [a, b]) {
    const rows = good(await client.from('config').select('id'), 'config preflight');
    assert(rows.length === 0, 'Use fresh test users with no config row');
  }
  for (const [table, fixture] of Object.entries(fixtures)) {
    const id = crypto.randomUUID();
    // Anonymous role has no table privileges for any of the four verbs.
    const anonymousResults = [
      await anon.from(table).select('*'),
      await anon.from(table).insert({ ...fixture, id, user_id: aid }),
      await anon.from(table).update(updates[table]).eq('id', id),
      await anon.from(table).delete().eq('id', id)
    ];
    for (const r of anonymousResults) assert(r.error, `${table}: anon verb unexpectedly allowed`);
    cleanup.push([a, table, id]);
    let row = good(await a.from(table).insert({ ...fixture, id }).select().single(), `${table}: A insert`);
    assert(row.user_id === aid, `${table}: default owner`);
    good(await a.from(table).select().eq('id', id).single(), `${table}: A read`);
    const before = row.updated_at;
    await new Promise(resolve => setTimeout(resolve, 25));
    row = good(await a.from(table).update(updates[table]).eq('id', id).select().single(), `${table}: A update`);
    assert(Date.parse(row.updated_at) > Date.parse(before), `${table}: timestamp trigger`);
    assert(good(await b.from(table).select().eq('id', id), `${table}: B read`).length === 0,
      `${table}: B saw A row`);
    // Invisible UPDATE/DELETE commonly succeed with zero rows; require zero rows, not an error.
    assert(good(await b.from(table).update(updates[table]).eq('id', id).select(), `${table}: B update`).length === 0,
      `${table}: B updated A row`);
    assert(good(await b.from(table).delete().eq('id', id).select(), `${table}: B delete`).length === 0,
      `${table}: B deleted A row`);
    const forgedId = crypto.randomUUID();
    cleanup.push([a, table, forgedId]);
    assert((await b.from(table).insert({ ...fixture, id: forgedId, user_id: aid })).error,
      `${table}: B forged owner insert`);
    assert((await a.from(table).update({ user_id: bid }).eq('id', id)).error,
      `${table}: A transferred ownership`);
    const intact = good(await a.from(table).select().eq('id', id).single(), `${table}: A still owns row`);
    assert(intact.user_id === aid, `${table}: owner changed`);
    // B also has ordinary CRUD access to B's own row.
    const ownId = crypto.randomUUID();
    cleanup.push([b, table, ownId]);
    const own = good(await b.from(table).insert({ ...fixture, id: ownId }).select().single(), `${table}: B insert`);
    assert(own.user_id === bid, `${table}: B default owner`);
    good(await b.from(table).update(updates[table]).eq('id', ownId).select().single(), `${table}: B own update`);
    assert(good(await a.from(table).select().eq('id', ownId), `${table}: A cross read`).length === 0,
      `${table}: A saw B row`);
    assert(good(await b.from(table).delete().eq('id', ownId).select(), `${table}: B own delete`).length === 1,
      `${table}: B delete count`);
    assert(good(await a.from(table).delete().eq('id', id).select(), `${table}: A delete`).length === 1,
      `${table}: A delete count`);
    assert(good(await a.from(table).select().eq('id', id), `${table}: after delete`).length === 0,
      `${table}: hard delete did not remove row`);
    // Undo restores the original id/owner/data; do not upsert over a concurrent replacement.
    good(await a.from(table).insert(intact).select().single(), `${table}: undo reinsert`);
    console.log(`PASS ${table}: anon denied / own CRUD / cross-user denied / undo / timestamps`);
  }
} finally {
  const failures = [];
  for (const [client, table, id] of cleanup) {
    const r = await client.from(table).delete().eq('id', id);
    if (r.error) failures.push({ table, id, error: r.error.message });
  }
  await Promise.all([a.auth.signOut(), b.auth.signOut()]);
  assert(failures.length === 0, `Test cleanup failed: ${JSON.stringify(failures)}`);
}
```

预期输出六条 PASS 且无异常。失败时保留具体错误、表名和浏览器网络响应，不要将“未查到数据”单独当隔离证明。脚本在 finally 中只删除本次生成 UUID 的测试行，不删除已有行。若连接中断导致清理失败，按错误记录的 ID 用对应测试用户重新清理。配置检查失败应换新测试账号。账号删除和 FK cascade 验证需要管理员另行授权，本脚本不会删除 Auth 用户。

## Realtime、删除与撤销

- 本方案硬删除。撤销缓存删除前的完整行，再 `insert` 原记录（含 id），不可盲目 `upsert` 覆盖其他窗口刚写入的同 ID 行；恢复冲突应提示用户刷新。更新触发器会覆盖后续 update 的 updated_at。
- INSERT/UPDATE 可以订阅带 `user_id=eq.<当前用户id>` 的事件；DELETE 不支持依赖 user_id 筛选。`REPLICA IDENTITY DEFAULT` 下删除仅保证 old.id，不期待 old.user_id 或其他业务字段。
- 为接收 DELETE，应有一个表级、无 user_id filter 的 DELETE 订阅。收到后仅按 `old.id` 删除本地缓存中已经属于当前会话的行；不要据 DELETE 推断其他用户身份或数据。登录切换/登出时取消旧频道并清空缓存。
- Supabase 的 Postgres Changes DELETE 不能像 INSERT/UPDATE 一样依靠行过滤/RLS 判断已不存在行的归属。因此发布普通公共表的 DELETE 可能暴露其他行的 UUID/删除时间这一低信息元数据；绝不能将 DELETE 推送视为行级隐私边界。如果连 UUID/事件存在性也必须隔离，应改成服务端受鉴权私有 Broadcast 或软删方案（需要另行设计授权），当前 SQL 不承诺这一点。
- 双窗口实测：A 两个窗口登录同一账号，创建/更新/删除一条测试 todo；应分别同步，删除依据 id。B 窗口不能通过 select 读到 A 的记录，INSERT/UPDATE 不应携带 A 行内容；即使收到删除 UUID，也不应影响 B 缓存。重连后必须重新读取当前用户的数据，不能仅靠错过的消息补齐。
- publication 注册不等于 Realtime 在线可用：检查项目 Realtime 开关、表订阅、WebSocket 权限和 SUBSCRIBED 状态。事件格式、DELETE 投递行为与运行中的 Supabase Realtime 版本需要上述在线测试确认。

## 静态检查的限度

`node --test supabase/sql.test.mjs` 只检查交付文本的重要不变量，没有 PostgreSQL/Supabase 执行环境就不能证明 SQL 可执行、权限运行正确或 Realtime 在线有效。当前交付没有远程验证结果；完成部署者需要记录 SQL 安装结果、六条浏览器 PASS 和 UI 双窗口验证结果。
