# FoxCode 状态模块说明

更新日期：2026-04-13

## 1. 模块定位
FoxCode 状态模块用于展示 `status.rjj.cc/status/foxcode` 中 Codex 线路状态，包含：
- 可用率
- 线路名称
- 最近心跳点序列
- 最近检测时间与相对时间

## 2. 跨层数据链路
- `src/main.ts`
  - 拉取状态页配置：`/api/status-page/foxcode`
  - 拉取心跳数据：`/api/status-page/heartbeat/foxcode`
  - 解析监控目标与心跳点，输出 `heartbeatPoints`
- `src/preload.ts`
  - 暴露 `fetchFoxcodeStatus()` IPC API
- `src/renderer/query/codexQueries.ts`
  - `useFoxcodeStatusQuery()` 负责状态轮询
- `src/renderer/App.tsx`
  - 转换为渲染层 `FoxcodexStatusView`
- `src/renderer/components/QuotaPanel.tsx`
  - 渲染状态条与 hover 提示

## 3. 关键数据结构
- `FoxcodeStatusResult.data`
  - `monitorName`
  - `uptime24h`
  - `latestStatus`
  - `latestCheckedAt`
  - `heartbeatPoints: [{ status, time }]`
  - `heartbeatWindowLabel`

## 4. 交互与布局策略
- 状态条使用等分 `grid`，保证横向拉满。
- hover 采用三段定位策略：左侧贴左、右侧贴右、中间按百分比定位。
- tooltip 展示状态与时间，避免越界。

## 5. 易错点与回归点
- 易错点：后端字段从 `heartbeatSeries` 切到 `heartbeatPoints` 后，渲染层遗留旧字段会报错。
- 易错点：tooltip 仅按中心定位会在边缘越界。
- 回归点：
  - 左/中/右三段 hover 都要测。
  - 状态条在宽屏下应铺满。
  - 无数据时要有占位与错误文案。

## 6. 变更建议
- 若后续改接口，优先改 `main.ts` 解析，保持渲染层类型稳定。
- 若改交互样式，先对照 `.agent-docs/ui-implementation-guidelines.md`。
