# graph-memory-pro-dsh

Graph Memory Pro 的 DeepSeek Harness Web 插件包。Host 读取 Community 插件的 SQLite，Client 通过 Typert Remote 获取有界只读数据。全局概览、轮次记忆和 SPO 关系由左侧 Graph Memory 入口打开；当前会话的活动与主 Agent usage 由会话头部入口打开，两者不混用会话作用域。缓存字段缺失时显示“不可用”，不会推算命中。运行活动与 usage 分表持久化，默认分别保留 30/90 天，并在维护 tick 中独立清理。

## 当前能力

- 左侧 `Graph Memory` 入口展示全局概览、轮次记忆和 SPO 关系；当前会话头部的 `Graph Memory Pro` 入口额外展示该会话活动及 Usage/缓存。无会话时左侧入口不查询活动或 Usage。
- 概览、轮次记忆、SPO 关系列表、当前会话活动与 Usage/缓存；支持摘要/关系关键词搜索。
- 来源问答按选择的轮次查询；旧 `GraphSnapshot` Remote 仅用于兼容，不再渲染混合节点卡片。
- Remote 对请求与响应执行严格 JSON 校验。浏览器不获得数据库路径、连接、SQL、Cypher 或凭据。
- 活动和 usage 不插入 DSH 对话消息或模型上下文；Host 遥测失败不应中断主对话。

当前版本不包含全量 2D/3D 图谱、分屏、拖拽写入和节点编辑，也不在聊天流插入活动消息。

- 轮次摘要、SPO 和来源问答由记忆表提供；活动与 usage 分表持久化。活动默认保留 30 天，usage 默认保留 90 天（可通过 Host 的 `telemetryRetention` 调整，维护 tick 分批清理）。
- Usage 只计入可验证的 DSH 主 Agent 完整轮次；辅助抽取、embedding 不混计。缺失缓存桶或不完整 attempt 时 UI 显示“不可用”，不显示 0%。
- 本地尚未在用户的 DSH 实例中安装/验证，使用前请先备份现有 SQLite（含 WAL/SHM）并在测试 profile 验证迁移。

## 本地安装

先安装并激活与本次构建对应的 Community 插件 tarball（勿混用旧版本）：

```bash
dsh plugin --profile web add /absolute/path/to/graph-memory-1.6.0-beta.19.tgz
```

再安装同次构建的 Pro bundle：

```bash
dsh plugin --profile web add /absolute/path/to/graph-memory-pro-dsh-0.1.0-beta.4.tgz
dsh web
```

两个插件默认共用 `~/.dsh/graph-memory/graph-memory.db`。
