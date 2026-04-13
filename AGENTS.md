# AGENTS.md

## 1. Project Overview

- 本项目是 **macOS 优先** 的 Electron 桌面工具，用于管理本机 Codex 环境。
- 核心能力：
  - 切换 Codex 通道（`fox` / `default`）并刷新运行态。
  - 管理历史会话（刷新、单删、全量清理）。
  - 展示 FoxCode 额度与 FoxCodex 状态。
- 这是本机工具，不是通用 SaaS。涉及 `~/.codex` 的改动默认按高风险处理。

## 2. Directory Structure

- `src/main.ts`
  - 主进程唯一副作用入口。
  - 负责文件系统、进程操作、sqlite 读写、网络请求、IPC 注册。
- `src/preload.ts`
  - 仅做 IPC 桥接与类型对齐，不放业务逻辑。
- `src/renderer/`
  - UI 与状态管理。
  - `App.tsx`：页面编排与查询聚合。
  - `components/ChannelPanel.tsx`：通道与历史会话。
  - `components/QuotaPanel.tsx`：额度与状态可视化。
  - `query/codexQueries.ts`：React Query 策略（轮询/重连/窗口聚焦）。
  - `store/`：Zustand 业务动作。
- `scripts/deploy-desktop-app.sh`
  - macOS 桌面替换流程脚本。

## 3. Code Conventions

- Language: TypeScript strict (`tsconfig.json` 已开启 `strict` 与 `noUncheckedIndexedAccess`)。
- Renderer MUST 通过 `window.codexChannelAPI` 调主进程能力。
- Renderer MUST NOT 直接访问文件系统、sqlite、进程控制。
- Main process MUST 集中处理副作用，并通过 IPC 对外提供稳定契约。
- 修改 IPC 名称或返回结构时，MUST 同步更新：
  - `src/main.ts`
  - `src/preload.ts`
  - `src/renderer/types.ts`
  - `src/renderer/query/*` 与调用方
- 命名统一使用 `FoxCode*`（不要混用 `Foxcode*`）。

## 4. Common Commands

- `pnpm run dev` — 本地开发（main/renderer/electron 联动）。
- `pnpm run lint` — ESLint 检查。
- `pnpm run build` — 全量构建（提交前最低门槛）。
- `pnpm run pack` — 生成解包应用目录。
- `pnpm run deploy:desktop` — macOS 桌面应用替换。
- `pnpm run hooks:install` — 启用仓库级 Git hooks（post-commit 自动桌面替换）。

> 仓库当前未提供自动化测试脚本（无 `pnpm run test`）。涉及行为变更时必须补充手动回归说明。

## 5. Architecture Decisions

### 5.1 历史会话双源策略
- 历史列表来自两类数据并合并去重：
  - `session_index.jsonl`
  - `state_5.sqlite.threads`（仅 `archived = 0`）
- `storage` 枚举包含：`sessions` / `archived_sessions` / `index_only` / `state_sqlite`。
- 改历史逻辑时，MUST 同时验证双源合并与排序行为。

### 5.2 历史清理/删除策略
- `history:clear`：清空历史文件与目录，并归档 sqlite 可见线程。
- `history:delete-one`：删除对应会话文件，并尝试归档对应 sqlite 线程。
- 以上行为会影响用户本机可见历史，属于高风险变更。

### 5.3 FoxCode 状态链路
- 状态数据由主进程抓取：
  - `https://status.rjj.cc/api/status-page/foxcode`
  - `https://status.rjj.cc/api/status-page/heartbeat/foxcode`
- Query 层包含自动刷新策略（窗口聚焦、重连、定时轮询）。
- 渲染层仅做展示模型转换，不重复实现抓取逻辑。

## 6. Important Rules

- MUST 最小改动，禁止无关重构。
- MUST 保持主进程与渲染层边界清晰。
- MUST 在 UI 或交互改动后执行 `pnpm run build`。
- SHOULD 在逻辑改动后执行 `pnpm run lint`。
- MUST 在涉及下列文件时先说明影响面再改：
  - `~/.codex/config.toml` / `~/.codex/auth.json`
  - `~/.codex/history.jsonl` / `session_index.jsonl`
  - `~/.codex/sessions/` / `archived_sessions/`
  - `~/.codex/state_5.sqlite`
- MUST NOT 假设 Windows/Linux 运行链路与 macOS 等价；当前仅保证打包维度可用。
- 若 post-commit 自动部署影响效率，允许单次提交使用 `SKIP_AUTO_DESKTOP_DEPLOY=1` 跳过。

## 7. Do This, NOT That

### ✅ Do
- 使用 preload 暴露 API，保持 renderer “无副作用”。
- 修改历史功能时同时检查：文件索引、sqlite、UI 展示。
- 修改状态面板时覆盖三类场景：成功、加载中、接口失败。
- 提交说明中写清“已执行验证”和“未执行项与原因”。

### ❌ Don't
- 不要在 renderer 里直接调用 Node API 或 shell。
- 不要只改 `main.ts` 而遗漏 preload/types/query 的契约同步。
- 不要把“用户使用说明”写进 AGENTS；AGENTS 只保留 AI 贡献约束。
- 不要默认历史清理包含备份逻辑（当前实现无自动备份）。
