# 家里的事 · Supabase 家庭生活看板

Vite + React + TypeScript + 原生 CSS。GitHub Pages 仅托管前端，业务数据只存 Supabase Postgres；邮箱密码登录、RLS 自有行隔离、Realtime WebSocket 六表变更。无 AI API、GitHub JSON 数据、PAT 写入或管理员密钥。

## 先做这三件事

1. Supabase SQL Editor 执行 `supabase/init.sql` **一次**。仅适用于尚无同名六表的项目；已有表不要删表或直接重跑，先沟通迁移。脚本一个事务，建立 config/expenses/checkups/weights/todos/meals、索引、更新时间触发器、自有行 CRUD RLS 和 publication。SQL 不含真实孕期/城市数据。执行和验证详情：`supabase/verify-rls.md`。
2. Supabase Authentication → URL Configuration：Site URL 和 Redirect URLs 添加实际 Pages 完整子路径（形如 `https://你的用户名.github.io/仓库名/`），以及开发地址 `http://localhost:5173/`。邮箱密码注册若启用 Confirm email，需点击确认邮件后登录。SMTP/邮件限流由 Supabase 设置控制；不能把 SQL Editor 管理员查得到数据当作 RLS 生效。
3. GitHub 仓库 Settings → Secrets and variables → Actions，增加 `VITE_SUPABASE_URL`（项目根地址，**不要带 /rest/v1/**）、`VITE_SUPABASE_ANON_KEY`（anon 或 sb_publishable_ key）。可选 `VITE_SUPABASE_URL_FALLBACK`，只填已配置且与同一项目对应的自定义域名。不要填写 service_role、sb_secret_ 或数据库密码。

publishable/anon key 被编译到前端是正常的，它不是写权限管理员密钥。访问控制由 RLS 决定。数据库政策不应为了修复前端报错而关闭。

## 开发与构建

需要 Node.js 22+、git；首次部署需要 gh。复制 `.env.example` 为 `.env.local`，填你自己的 URL 和 public key；.env* 被 git 忽略，仅允许模板。不要把真实配置写到 SQL、README 或源码。安装启动在你自己的电脑执行：

```bash
npm ci --include=dev --registry=https://registry.npmjs.org/
npm test
npm run dev -- --host 127.0.0.1
```

打开终端显示的本地地址。生产构建：

```bash
npm run build
npm run check:dist
```

本地 base 是 `/`；Actions 设置 `GITHUB_PAGES=true` 和 `GITHUB_REPOSITORY`，自动用仓库名子路径（用户根站仓库除外）。不使用 Router，因此无需 SPA 路由回退。`public/.nojekyll` 进入 dist。

## 首次发布（当前未自动发布）

在下载解压后的新 Supabase 工程执行，**不要使用旧 JSON 版目录或压缩包**。登录 GitHub CLI，并核对目标账号：

```bash
gh auth login
gh auth status
gh api user --jq .login
gh repo view GS-0620/family-dashboard
```

若账号正确、认证成功且明确 Not Found 才创建；若已有仓库先沟通复用，禁止覆盖历史。

```bash
git init -b main
git config user.name "GS-0620"
git config user.email "GS-0620@users.noreply.github.com"
git add .
git commit -m "Initial Supabase family dashboard"
gh repo create GS-0620/family-dashboard --public --source=. --remote=origin
git push -u origin main
gh api --method POST repos/GS-0620/family-dashboard/pages -f build_type=workflow
```

然后网页添加上面的 Actions Secrets（不要把 public key 配成 secret/admin key）。已有 Pages 可在 Settings → Pages 选择 GitHub Actions，无需重复 POST。执行：

```bash
gh workflow run deploy.yml --ref main
gh run list --workflow deploy.yml
gh run watch
gh api repos/GS-0620/family-dashboard/pages --jq .html_url
```

最后命令返回的 URL 才是实际部署地址；当前文档不声称已上线。Actions 运行测试、构建、安全检查，只上传 dist，权限 contents:read/pages:write/id-token:write。

## 手机上手、消费录入与删除

1. 手机和电脑打开实际 Pages 地址，注册并登录同一个账号。不同账号 RLS 隔离，不共享家庭数据。
2. 首次点击「城市 / 孕期 / 忌口设置」，填写城市、经纬度、昵称、LMP 或 EDD 二选一、忌口。配置只存你的数据库。
3. 「消费记录」→「记一笔」，输入日期、金额（元，最多两位小数）、分类、支付方式和备注，保存。
4. 记录下方「编辑」修改，「删除」会弹二次确认。编辑/删除立即更新本地显示；失败回滚并提示。若网络超时，先手动刷新核实是否已经提交，不重复新增。
5. 两台设备 Realtime 正常时自动同步；上方显示连接状态和最近成功读取/提交时间。断网显示最后缓存并提示陈旧，离线不提交写入；不是离线队列。

当前版本未加入可选的 JSON 批量导入，常规消费增删改已提供。

## 孕期、待办与菜谱

孕期管理支持新增/编辑/删除产检、体重和待办；待办可直接勾选完成。产检「下次日期」提供页面提醒，不发送外部通知。按北京时间算孕周、14周孕中期、28周孕晚期；以医生评估为准。超过预产期显示超期状态，不提供医学判断。

菜谱可增删改；标签和冲突标签用逗号分隔，餐别选早/午/晚，填耗时。忌口与 tags/conflict_tags **精确匹配**，例如「大豆」「辣」须使用相同标签；不推测过敏原。推荐随机选取，至少两道候选时「换一个」尽量不同。没有菜谱时显示空状态，不伪造数据库数据。

天气从 config 读取城市经纬度，用 Open-Meteo 免费 API。失败显示错误和上次天气缓存，首次没有缓存给重试提示。

## 撤销误删与备份

删除后，当前页面上方「撤销最近删除」可重新插入该行（保留 id、业务字段和创建时间）。只保存当前页面的最近一条删除，关闭页面/退出后失效；不是完整审计或回收站。另一设备已恢复同一 id 时会提示冲突，先刷新。

长期恢复：定期在 Supabase Dashboard 导出相关表 CSV，并妥善保存于私密位置；不要上传 public 仓库。已关闭页面且没有备份的硬删除不保证可恢复。Supabase 数据库备份/PITR 取决于计划，恢复整个库影响其他变更，需谨慎评估；不能用 git revert 恢复数据库行。

## 网络、隐私与安全

Supabase 请求设置 15 秒超时；读取的网络/502/503/504 失败最多重试一次，写请求不自动重试。手动刷新兜底，不用轮询作主方案。Realtime INSERT/UPDATE/DELETE 触发重新读取，DELETE 不按 user_id 过滤，客户端读取仍受 RLS 保护。卸载移除订阅，重连成功再读取。

国内 *.supabase.co 不稳定时，可配置 Supabase 正式自定义域名（可能需付费与 DNS 配置）；配置环境变量、重新构建后点「切换备用线路」。只支持用户明确配置的同一项目端点，不向任意地址泄露会话。切换失败保留原线路；当前没有备用地址，不会假装切换。后续可评估自部署/换区域，需迁移数据库和认证，不能只改 URL。

未登录不读取业务数据；缓存以项目和 user_id 分隔。退出删除当前账号业务及天气缓存。浏览器会持久保存登录会话，共享电脑请退出；RLS 不能保护已登录设备上的本地缓存。使用昵称、不录入身份证、医院全称等敏感字段。public 代码仓库不代表数据库公开。

## 验证

`npm test` 覆盖日期/金额/过滤/用户缓存隔离/安全扫描/SQL 静态规则。`npm run check:dist` 检测实际 privileged key、旧 PAT 写入和业务数据文件泄露。实际 RLS、双设备 WebSocket、乐观更新回滚及移动端渲染须连接真实项目测试，步骤和未验证项在 `TEST-RESULTS.md`。SQL 静态测试不替代 PostgreSQL 执行验证。
