# codex channel

Electron 桌面工具（TypeScript + Tailwind CSS），提供以下能力：

- 一键切换 Codex 通道（`fox` / `default`）
- 切换后尝试刷新 Codex 运行态（CLI / App）
- 一键清理 Codex 历史对话（先备份再清空）
- 内嵌 FoxCode 页面：
  - `https://foxcode.rjj.cc/dashboard`
  - `https://status.rjj.cc/status/foxcode`

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
