# codex channel

Electron 桌面工具（TypeScript + Tailwind CSS），提供以下能力：

- 一键切换 Codex 通道（`fox` / `default`）
- 切换后尝试刷新 Codex 运行态（CLI / App）
- 一键清理 Codex 历史对话（先备份再清空）
- 从 `https://foxcode.rjj.cc/dashboard` 读取并展示额度（按量额度 / 月卡额度）

## 使用前提

应用依赖 `~/.codex` 目录中的配置文件。请确保以下文件存在：

1. 当前生效文件（会被本应用切换覆盖）
- `~/.codex/config.toml`
- `~/.codex/auth.json`

2. 通道模板文件（命名规则必须成对）
- `~/.codex/config-<channel>.toml`
- `~/.codex/auth-<channel>.json`

其中 `<channel>` 必须一致，表示同一个通道名。

例如：
- `config-default.toml` + `auth-default.json`
- `config-fox.toml` + `auth-fox.json`

应用切换通道时，会把对应通道模板复制到 `config.toml` 和 `auth.json`。

## FoxCode 额度说明

- 启动时会自动检测 FoxCode 登录 Cookie。
- 如果存在有效 Cookie，会自动加载额度。
- 如果无有效 Cookie，会询问是否立即打开登录页；拒绝则跳过。
- 登录成功后可手动点“获取额度”，或等待自动检测触发刷新。

## 开发

```bash
npm install
npm run build
npm start
```

## 目录

- `src/main.ts`：Electron 主进程
- `src/preload.ts`：安全桥接 API
- `src/renderer/`：渲染层 UI 与交互
