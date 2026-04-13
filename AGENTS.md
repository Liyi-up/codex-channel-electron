# AGENTS.md

## 1. 工程定位

这是一个基于 Electron 的桌面工具，用来辅助管理本机 Codex 运行环境，当前核心能力包括：

- 切换 Codex 通道：`fox` / `default`
- 切换后尝试刷新 Codex CLI 与 `Codex.app` 运行态
- 清理 Codex 历史会话，并在清理前执行本地备份
- 读取并展示 FoxCode 仪表板额度信息

这个项目不是通用 SaaS，也不是浏览器页面应用；它本质上是一个强依赖本机环境的桌面工具，很多能力直接操作 `~/.codex` 与 macOS 本机应用。

## 2. 技术栈

- Electron
- React
- Vite
- TypeScript
- React Query
- Zustand
- Tailwind CSS
- shadcn/ui（基础组件模式）
- Lucide（图标库）
- classnames + tailwind-merge（类名合并工具）
- @douyinfe/semi-illustrations（空状态插画）
- electron-builder

## 3. 平台假设

默认运行环境是 macOS。

原因：

- 项目直接依赖 `osascript`、`open -a Codex`、`pkill` 等 macOS 行为
- `deploy:desktop` 只支持 macOS
- `Codex.app` 刷新逻辑基于 `/Applications/Codex.app`

如果任务涉及跨平台能力，先确认是否只是“打包支持”，还是要真正补齐运行时行为。当前代码对 Windows/Linux 只有打包配置，不等于运行链路完整支持。

## 4. 关键外部依赖

项目依赖本机 `~/.codex` 下的配置与状态文件。至少要理解这些文件的作用：

- `~/.codex/config.toml`：当前生效配置
- `~/.codex/auth.json`：当前生效认证
- `~/.codex/config-default.toml` / `auth-default.json`
- `~/.codex/config-fox.toml` / `auth-fox.json`
- `~/.codex/history.jsonl`
- `~/.codex/session_index.jsonl`
- `~/.codex/sessions/`
- `~/.codex/archived_sessions/`
- `~/.codex/state_5.sqlite`
- `~/.codex/logs_2.sqlite`

注意：

- 历史展示的旧实现主要依赖 `session_index.jsonl` 与 `sessions/archived_sessions`
- 实际线程元数据也可能存在 `state_5.sqlite`
- 切换 provider 或 auth 后，会话可见性和可续聊性可能发生变化

## 5. 代码结构

高频入口如下：

- `src/main.ts`：Electron 主进程，负责本地文件、进程、FoxCode 页面抓取、IPC 暴露
- `src/preload.ts`：安全桥接层，向渲染层暴露 API
- `src/renderer/App.tsx`：页面骨架与主数据流
- `src/renderer/components/ChannelPanel.tsx`：通道切换、历史会话、运行日志
- `src/renderer/components/QuotaPanel.tsx`：FoxCode 额度展示
- `src/renderer/query/codexQueries.ts`：React Query 查询封装
- `src/renderer/store/useCodexStore.ts`：Zustand 状态入口
- `src/renderer/store/codexStore.actions.ts`：用户动作与副作用
- `src/renderer/tailwind.css`：组件级样式补充
- `scripts/deploy-desktop-app.sh`：macOS 下打包并替换桌面应用

## 6. 常用命令

开发：

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run pack
npm run dist:mac
```

桌面部署：

```bash
npm run deploy:desktop
npm run deploy:desktop:open
npm run deploy:desktop -- --name "My Codex"
npm run build:deploy:desktop
npm run build:deploy:desktop:open
```

说明：

- `pack` 生成解包后的 `.app` 目录，适合本地快速验证
- `deploy:desktop` 会重新打包并覆盖桌面上的目标 `.app`
- `build:deploy:desktop` 先 `pack` 后替换桌面 `.app`，避免重复打包步骤
- `--name` 只影响桌面部署名称，不修改项目 `productName`

## 7. 修改时的优先原则

- 优先保持现有目录边界，不做无关重构
- 主进程逻辑与渲染层逻辑不要混写
- 文件系统、副作用、进程操作优先放在主进程
- 渲染层尽量只消费 preload 暴露出的 API
- 改 UI 时，注意左侧控制栏和右侧额度面板的高度分配与滚动行为
- 改历史逻辑时，先区分“数据缺失”还是“显示裁剪”

## 8. 高风险区域

以下改动要格外谨慎：

- 覆盖 `~/.codex/config.toml` / `auth.json`
- 删除历史文件或目录
- 杀进程、重启 `Codex.app`
- 修改 `deploy:desktop` 脚本
- 修改打包配置中的 `productName`、`icon`、`appId`

原因：

- 这些改动会直接影响用户本机环境，不只是仓库内代码行为
- 一旦误删历史或覆盖错误配置，回退成本较高

## 9. 图标与打包约定

当前项目已接入自定义图标：

- `build-assets/codex.icns`

打包配置在 `package.json -> build` 中声明，macOS 使用 `.icns`。如果发现桌面应用退回到默认 Electron 图标，优先检查：

- `build.icon`
- `build.mac.icon`
- 打包日志里是否出现 `default Electron icon is used`

## 10. 历史会话相关约定

如果任务涉及“历史会话显示不对 / 数量不对 / 无法续聊”，优先按这个顺序排查：

1. UI 是否把内容裁剪了
2. `session_index.jsonl` 是否有记录
3. `sessions/` 或 `archived_sessions/` 是否存在对应会话文件
4. `state_5.sqlite` 的 `threads` 表里是否还有线程记录
5. 当前 provider / auth 是否与会话创建时一致

不要一上来就假设是列表渲染 bug。

## 11. 给 AI 的工作建议

- 先看 `README.md` 与本文件，再改代码
- 若涉及历史、线程、provider 问题，优先读本机 `~/.codex` 实际状态
- 若涉及桌面替换流程，优先复用 `scripts/deploy-desktop-app.sh`
- 改完 UI 后，至少执行一次 `npm run build`
- 若改动影响桌面验证链路，优先再执行一次 `npm run deploy:desktop`

## 12. 当前缺口

以下是当前工程已知但未完全治理的点，改动时可以顺手关注：

- 历史来源仍偏旧文件索引，和 SQLite 状态未完全统一
- 平台支持以 macOS 为主，Windows/Linux 仅有基础打包配置
- 图标、应用名称、桌面部署策略虽然已可配置，但还不是完整的产品化发布链路

如果任务需要新增工程规范，优先更新本文件，而不是把说明散落到多个代码注释里。

## 13. UI 实施约定

- 图标操作位（如删除/刷新/折叠）需保持统一的容器尺寸、图标尺寸与间距，仅颜色可区分语义级别。
- 高风险操作优先“就近收敛”到业务上下文（如历史相关操作放到历史标题区），避免大面积独立危险区打断信息流。
- 空状态应优先采用“插画/图标 + 说明文案 + 居中布局”，并随主题切换深浅版本。
- 小屏优先保证“首屏关键操作可达”，必要时使用卡片内滚动，不允许出现难以理解的底部裁切露边。
- 所有 UI 变更完成后至少执行一次 `npm run build`；涉及桌面验证链路时补充 `npm run build:deploy:desktop`。
