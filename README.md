# codex channel

Electron 桌面工具（Electron + React + Vite + React Query + Zustand + Tailwind CSS + shadcn/ui + Lucide），提供以下能力：

- 一键切换 Codex 通道（`fox` / `default`）
- 切换后尝试刷新 Codex 运行态（CLI / App）
- 一键清理 Codex 历史对话（先备份再清空）
- 从 `https://foxcode.rjj.cc/dashboard` 读取并展示额度（按量额度 / 月卡额度）
- 深色 / 浅色主题切换
- 日志空状态插画展示（按主题自动切换深浅插画）

## 用户安装与启动

支持两种方式：

- 源码运行（开发调试）
- 打包成平台应用（安装包/可执行目录）

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

## 从 Clone 到平台 App（打包）

### 1) 克隆仓库

```bash
git clone <你的仓库地址>
cd codex-channel-electron
```

### 2) 安装依赖

```bash
npm install
```

### 3) 先确保运行配置已准备（必需）

请先按上方“准备 Codex 配置文件”章节放置 `~/.codex` 下的配置模板。

### 4) 生成当前平台的应用产物

```bash
# 生成当前平台的解包目录（用于快速验证）
npm run pack

# macOS 产物（dmg + zip）
npm run dist:mac

# Windows 产物（nsis + zip）
npm run dist:win

# Linux 产物（AppImage + tar.gz）
npm run dist:linux
```

### 5) 查看产物目录

所有打包输出都在：

```bash
release/
```

### 6) 一键替换桌面应用（仅 macOS）

如果你日常是在桌面上的 `codex channel.app` 里验证改动，可以直接运行：

```bash
# 打包并替换 ~/Desktop/codex channel.app
npm run deploy:desktop

# 打包、替换并自动启动桌面应用
npm run deploy:desktop:open

# 自定义桌面应用名称
npm run deploy:desktop -- --name "My Codex"

# 自定义名称并自动启动
npm run deploy:desktop:open -- --name "My Codex"

# 先打包再替换（避免重复打包流程）
npm run build:deploy:desktop

# 先打包、替换并自动启动
npm run build:deploy:desktop:open
```

这个命令会自动完成：

- 构建并生成 macOS 解包应用
- 尝试退出当前正在运行的默认应用或同名桌面应用
- 用新产物覆盖桌面上的目标 `.app`
- 可选重新启动桌面应用

说明：

- `codex channel` 只是默认的桌面应用名称，不是强制值。
- `--name` 只影响桌面上部署出来的 `.app` 名称，不会修改项目默认的 `productName`。

## 使用说明

1. 在“通道控制”里通过下拉框（`default` / `fox`）切换通道。
2. 切换后应用会尝试刷新 Codex 运行态（CLI/App）。
3. 在“历史会话”标题右侧可执行：清空历史 / 刷新历史 / 展开收起。
4. 清空历史会触发二次确认弹窗（风险提示 + 最终确认）。
5. 如需查看 FoxCode 额度，先登录再点击“获取额度”。

## 注意事项

- 切换通道会直接覆盖 `~/.codex/config.toml` 与 `~/.codex/auth.json`。
- 清理历史会清空（通过“历史会话”标题右侧删除图标触发）：
  - `~/.codex/history.jsonl`
  - `~/.codex/session_index.jsonl`
  - `~/.codex/sessions/`
  - `~/.codex/archived_sessions/`
- 清理前会自动备份到：`~/.codex/.history-backups/<时间戳>/`。
- 本工具当前固定支持 `default` 与 `fox` 两个通道模板命名。
- 若缺少上述必要文件，切换时会报错“缺少必要文件”。
- 仅当本机存在 `/Applications/Codex.app` 时，才会尝试自动重启 Codex App。
- 跨平台打包建议在对应平台本机执行（例如 mac 产物在 macOS 上打包）。

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
