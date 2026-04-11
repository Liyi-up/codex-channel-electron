# codex channel

Electron 桌面工具（Electron + React + Vite + React Query + Zustand + Tailwind CSS），提供以下能力：

- 一键切换 Codex 通道（`fox` / `default`）
- 切换后尝试刷新 Codex 运行态（CLI / App）
- 一键清理 Codex 历史对话（先备份再清空）
- 从 `https://foxcode.rjj.cc/dashboard` 读取并展示额度（按量额度 / 月卡额度）

## 用户安装与启动

当前仓库**没有提供 DMG/PKG 安装包**，请按“源码运行”方式使用。

### 1) 环境要求

- macOS（项目内含 `osascript`、`open -a Codex` 等 macOS 命令）
- Node.js 20+（Vite 8 需要）
- npm

### 2) 准备 Codex 配置文件

应用依赖 `~/.codex` 目录中的配置文件。请确保以下文件存在：

1. 当前生效文件（会被本应用切换覆盖）：
   - `~/.codex/config.toml`
   - `~/.codex/auth.json`

2. 通道模板文件（命名规则必须成对）：
   - `~/.codex/config-<channel>.toml`
   - `~/.codex/auth-<channel>.json`

其中 `<channel>` 必须一致，表示同一个通道名。

例如：

- `config-default.toml` + `auth-default.json`
- `config-fox.toml` + `auth-fox.json`

应用切换通道时，会把对应通道模板复制到 `config.toml` 和 `auth.json`。

### 3) 安装依赖

```bash
npm install
```

### 4) 启动应用

```bash
npm start
```

`npm start` 会先执行构建，再启动 Electron 桌面应用。

## 使用说明

1. 启动后点击通道按钮（`default` 或 `fox`）进行切换。
2. 切换后应用会尝试刷新 Codex 运行态（CLI/App）。
3. 如需清理历史，点击“清理历史”按钮，应用会先备份再清空。
4. 如需查看 FoxCode 额度，先登录再点击“获取额度”。

## 注意事项

- 切换通道会直接覆盖 `~/.codex/config.toml` 与 `~/.codex/auth.json`。
- 清理历史会清空：
  - `~/.codex/history.jsonl`
  - `~/.codex/session_index.jsonl`
  - `~/.codex/sessions/`
  - `~/.codex/archived_sessions/`
- 清理前会自动备份到：`~/.codex/.history-backups/<时间戳>/`。
- 本工具当前固定支持 `default` 与 `fox` 两个通道模板命名。
- 若缺少上述必要文件，切换时会报错“缺少必要文件”。
- 仅当本机存在 `/Applications/Codex.app` 时，才会尝试自动重启 Codex App。

## FoxCode 额度说明

- 启动时会自动检测 FoxCode 登录 Cookie。
- 如果存在有效 Cookie，会自动加载额度。
- 如果无有效 Cookie，会询问是否立即打开登录页；拒绝则跳过。
- 登录成功后可手动点“获取额度”，或等待自动检测触发刷新。

## 开发

```bash
npm run dev
```

`npm run dev` 会并行启动：

- `tsc --watch`（主进程与 preload）
- `vite`（渲染层开发服务器）
- `electron + nodemon`（自动连接 Vite；`main/preload` 变更后自动重启）

热更新行为说明：

- 修改 `src/renderer/**`：Vite HMR（热模块替换）即时生效，无需重启窗口。
- 修改 `src/main.ts` / `src/preload.ts`：`tsc` 产物更新后，`nodemon` 自动重启 Electron 进程。

如需生产构建后启动：

```bash
npm start
```

## 目录

- `src/main.ts`：Electron 主进程
- `src/preload.ts`：安全桥接 API
- `src/renderer/main.tsx`：React 渲染入口
- `src/renderer/App.tsx`：页面骨架编排
- `src/renderer/query/`：基于 React Query 的异步请求管理
- `src/renderer/store/useCodexStore.ts`：基于 Zustand 的 UI 状态与动作
- `src/renderer/components/`：渲染层组件
- `vite.config.ts`：Vite 构建配置
