# Codex Channel

> 面向 macOS 的 Electron 桌面工具：切换 Codex 通道、管理本地历史、查看 FoxCode 额度与 FoxCodex 状态。

## 目录
- [核心特性](#核心特性)
- [快速开始](#快速开始)
- [安装与运行](#安装与运行)
- [使用示例](#使用示例)
- [架构概览](#架构概览)
- [常用命令](#常用命令)
- [注意事项](#注意事项)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

## 核心特性
- 一键切换 Codex 通道（`fox` / `default`），并尝试刷新 Codex CLI 与 `Codex.app` 运行态。
- 历史会话管理：刷新列表、单条删除、全量清理。
- 历史数据双来源读取：`session_index.jsonl` + `state_5.sqlite`。
- FoxCode 面板：展示按量额度、账号信息状态与更新时间。
- FoxCodex 状态面板：展示 24h 可用率、心跳点序列、最近检测时间与相对时间。
- 深色/浅色主题切换。

## 快速开始

### 前置要求
- macOS（项目运行链路依赖 `osascript`、`open -a`、`pkill` 等 macOS 行为）。
- Node.js 20+
- pnpm
- 本机可用 `sqlite3`（用于读取和归档 `~/.codex/state_5.sqlite`）。

### 准备 Codex 配置模板
应用依赖 `~/.codex` 下的配置模板，至少需要以下文件：

- 当前生效文件（切换时会被覆盖）
  - `~/.codex/config.toml`
  - `~/.codex/auth.json`
- 通道模板文件（必须成对）
  - `~/.codex/config-default.toml` + `~/.codex/auth-default.json`
  - `~/.codex/config-fox.toml` + `~/.codex/auth-fox.json`

## 安装与运行

```bash
pnpm install
pnpm run dev
```

如需生产构建后启动：

```bash
pnpm start
```

## 使用示例

### 1. 切换通道
1. 在左侧「通道控制」选择 `fox` 或 `default`。
2. 点击「切换到目标通道」。
3. 等待状态提示完成。

### 2. 清理历史会话
1. 在「历史会话」区域点击清理按钮。
2. 完成两次确认。
3. 系统会清空历史索引与会话目录，并将 `state_5.sqlite` 中可见线程标记为归档。

### 3. 查看额度与状态
1. 首次使用若未登录 FoxCode，点击登录按钮完成认证。
2. 点击额度刷新按钮获取最新额度。
3. 在状态区查看心跳点，悬停可查看单点状态与时间。

## 架构概览

- `src/main.ts`：主进程，负责文件系统、进程控制、FoxCode/状态接口抓取、历史与 sqlite 处理、IPC。
- `src/preload.ts`：桥接层，向渲染进程暴露安全 API。
- `src/renderer/App.tsx`：页面编排、查询状态聚合与反馈控制。
- `src/renderer/components/ChannelPanel.tsx`：通道切换与历史会话 UI。
- `src/renderer/components/QuotaPanel.tsx`：FoxCode 额度 + FoxCodex 状态 UI。
- `src/renderer/query/codexQueries.ts`：React Query 查询定义（含轮询与重连策略）。
- `scripts/deploy-desktop-app.sh`：桌面应用替换脚本（macOS）。

## 常用命令

### 开发
```bash
pnpm run dev
pnpm run lint
pnpm run format:check
```

### 构建与打包
```bash
pnpm run build
pnpm run pack
pnpm run dist:mac
pnpm run dist:win
pnpm run dist:linux
```

### 桌面部署（macOS）
```bash
pnpm run deploy:desktop
pnpm run deploy:desktop:open
pnpm run deploy:desktop -- --name "My Codex"
pnpm run build:deploy:desktop
pnpm run build:deploy:desktop:open
```

### 提交后自动桌面替换（可选）
```bash
pnpm run hooks:install
```

启用后，每次执行 `git commit` 都会自动触发 `pnpm run build:deploy:desktop`。

如果某次提交想临时跳过自动替换：

```bash
SKIP_AUTO_DESKTOP_DEPLOY=1 git commit -m "your message"
```

## 注意事项
- 通道切换会覆盖 `~/.codex/config.toml` 与 `~/.codex/auth.json`。
- 历史全量清理会清空：
  - `~/.codex/history.jsonl`
  - `~/.codex/session_index.jsonl`
  - `~/.codex/sessions/`
  - `~/.codex/archived_sessions/`
- 历史清理和单条删除会同步归档 `~/.codex/state_5.sqlite` 的 `threads` 记录。
- 本工具当前只内置 `default` 与 `fox` 两个通道模板。
- `/Applications/Codex.app` 不存在时，不会执行 App 重启链路。
- Windows/Linux 当前主要提供打包能力，不代表运行链路已完整适配。

## 贡献指南
- 提交前至少执行：
  - `pnpm run lint`
  - `pnpm run build`
- 如需提交后自动打包并替换桌面 app，执行一次 `pnpm run hooks:install`。
- 涉及 UI 调整时，补充手动验证：
  - 通道切换
  - 历史刷新/删除
  - 额度刷新
  - 状态刷新与心跳 hover
- 需要 AI 协作约束时，请同时查看仓库根目录 `AGENTS.md`。

## 许可证
当前仓库在 `package.json` 中标记为 `private: true`，未声明开源许可证。
