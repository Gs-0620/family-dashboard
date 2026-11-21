# 家庭生活看板 · Supabase 版

## 边界
仅 GitHub Pages 静态前端 + Supabase Auth/Postgres/Realtime + Open-Meteo。无 AI API、GitHub JSON、PAT、本地写入工具或 service_role。真实业务初始值只在登录后的配置表单填写，不在源码/SQL。
参数由用户确认，手机电脑同账号，自有行 RLS，不包含家庭成员共享权限模型。

## 设计记录
Mode: C
Scene: dashboard
Theme: D-minimal
Purpose: 手机与电脑实时录入家庭日常。
Tone: 极简、清晰、安静；参考 Apple 健康的信息层级。
Differentiation: 实时连接状态清晰；在线修改与离线缓存明确区分。
Scene Rules Applied: 状态/告警优先于指标/明细，16px 卡片与间距，月份分类筛选，手动刷新与自动事件更新，移动单列。
Theme Tokens Applied: 白色 #FFFFFF 页面与卡片；#18181B 主按钮/柱图；#09090B 标题、#3F3F46 正文、#71717A 辅助字、#E4E4E7 边框映射 CSS :root；8px 圆角；无阴影、无装饰图标。
Chart Tokens Applied: 分类条使用 primary，轨道 #F4F4F5，分类用文本区别。
Loaded Files: website-design-integration.md; website-design/website-design.md; scenes/dashboard.md; themes/D-minimal.md。
Self-Checks Required: P0，无裁剪/无 emoji/5级字号/44px触控/可见focus，D-minimal tokens，dashboard状态/指标/错误与筛选，480/768px响应式。

## 验证
SQL Editor 以管理员执行不是 RLS 验证；必须使用匿名与两个真实用户测试。
Realtime DELETE 不依赖 user_id 过滤，收到事件重新读取该表，RLS 保证数据隔离。
网络写入不自动重试；通过预生成 UUID 可检查超时后是否已提交。更新使用 updated_at 乐观锁。
