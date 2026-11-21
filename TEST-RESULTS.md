# 测试结果与待验收项

## 已观察到通过

- `npm test`：17 项通过、0 失败，包括 SQL 静态结构规则、日期/LMP/EDD/孕期阶段、金额分币计算、菜谱过滤/换餐、项目与用户隔离缓存、缓存损坏容错及 privileged-key 检测。
- `npm run build`：TypeScript 与 Vite 6.4.6 通过。生产环境设置 GitHub Pages 和仓库名后构建通过，index.html 使用 /family-dashboard/assets/。
- `npm run check:dist`：通过。产物没有业务 JSON、旧 PAT 写入工具或实际 service_role/secret key。包含正常可公开的 Supabase publishable key。
- `npm audit --registry=https://registry.npmjs.org/`：0 漏洞。公司 registry audit 曾返回 502，改用公共审计端点获取有效结果，未隐藏该错误。
- 源码结构：六表订阅、卸载 removeChannel、auth 订阅清理、删除二次确认、updated_at 乐观锁、写请求失败回滚、手动刷新、项目+用户缓存、退出清理、可选备用线路。

## 未验证，不声称已上线

- Supabase SQL 尚未在真实项目执行。17 项测试包含 SQL 字符串规则检查，不是 PostgreSQL 执行测试。
- 未提供/使用账号密码、管理员密钥或数据库密码；没有注册账号、读取或写入真实业务数据。
- RLS 匿名拒绝、跨用户隔离、实际 CRUD 和 WebSocket 双设备同步待按 verify-rls.md 实测。
- 乐观更新失败回滚、断网重连、天气缓存、登录重定向及备用线路仍须浏览器端端到端验证；基础单元测试未覆盖这些真实链路。
- 手机/桌面真实渲染未验证。CSS 静态检查覆盖 480/768px 单列/双列、44px 触控、focus、8px 圆角、无裁剪及无渐变，不等于真实设备验收。
- 工作区无 gh 和用户 GitHub 登录，未创建远端仓库、推送或配置 Pages。Actions 云端运行和实际公网 URL 未确认。
- 当前没有备用域名，因此备用线路仅实现配置入口，不宣称实际可用。
- 可选 JSON 批量导入未实现；最近一次误删支持当前页面内撤销，不是永久回收站。

## 下一步

用户执行 init.sql 一次并配置 Auth URLs；在本机按 README 设置 Secrets/发布，返回实际 Pages 地址。随后验证登录、同账号双设备新增/编辑/删除、删除确认/回滚、天气与缓存、RLS 两用户隔离。
