# 木与光 MCP 接口

基于官方 `@modelcontextprotocol/sdk` 1.30.0，使用 **stdio JSON-RPC**。它不是把普通 HTTP 接口命名为 MCP。支持工具发现、资源读取、提示词调用和结构化工具结果；协议参考 [官方 TypeScript SDK 文档](https://ts.sdk.modelcontextprotocol.io/server)。

## 连接

安装项目依赖后，将 `mcp/client-config.example.json` 中的 `ABSOLUTE_PROJECT_PATH` 替换为项目绝对路径，放进所用 MCP 客户端的服务配置。客户端应直接启动 Node，避免 npm 的日志混入 stdio 协议。

```json
{
  "mcpServers": {
    "home-designer": {
      "command": "node",
      "args": ["--experimental-strip-types", "C:/path/to/home-viewer/mcp/server.mjs"]
    }
  }
}
```

服务器不依赖启动工作目录。需要 Node 22.22.3+ 或项目声明支持的更新版本。`npm run mcp` 可手动启动检查；没有客户端发送请求时它会等待 stdin。

默认把设计写入项目 `.home-designs/`，该目录已加入 `.gitignore`。可用 `HOME_DESIGN_DIR` 指定另一个本地目录。更新采用临时文件加原子重命名、跨进程锁和 `expectedUpdatedAt` 校验。进程异常退出留下 `.lock` 时，应先确认没有进程写入，再手动移除对应锁文件。

## 工具

| 工具 | 用途 | 是否写入 |
| --- | --- | --- |
| `get_project` | 模型版本、房间边界、保护墙、门窗及面积 | 否 |
| `search_catalog` | 按文本、类型查找真实家具模型与尺寸 | 否 |
| `list_designs` | 列出 MCP 文件方案 | 否 |
| `get_design` | 读取任务书、布局及版本时间 | 否 |
| `create_design` | 从 family / work / elder 创建独立方案，可覆盖任务书及预算 | 是 |
| `update_brief` | 更新任务书与估算参数；不重新布置家具 | 是 |
| `add_furniture` | 根据目录 ID、房间、位置与角度新增家具 | 是 |
| `update_furniture` | 原子更新一件家具的位置、角度和房间 | 是 |
| `remove_furniture` | 标记删除家具，保留记录 | 是 |
| `restore_furniture` | 恢复已删除家具，重新检查冲突 | 是 |
| `set_room_finish` | 设置四种基础墙面或地面饰面；排除公共光厅 | 是 |
| `analyze_design` | 几何检查、费用、预算差额和深化事项 | 否 |
| `compare_designs` | 比较 2–6 套方案，保留各自的估价参数 | 否 |
| `export_design` | 输出设计文档、网页兼容布局和报告 | 否 |

参数 schema 可通过标准 `tools/list` 获取。所有更新都要求 `id` 和最新 `expectedUpdatedAt`。错误返回 `isError: true`；校验失败不修改磁盘。生成、增删、恢复、移动与饰面操作都会重新计算检查结果；越界、重叠、穿墙和无效高度阻止保存，预算及门口问题返回提醒。

模型约定：坐标和目录尺寸是米；`dimensions = [宽, 深, 高]`；工具参数 `rotationDegrees` 为度，布局里的 `rotation` 为弧度。工具只编辑目录家具和饰面，不允许修改模板墙体，不直接访问 Supabase，也不控制已打开浏览器。

## 资源和提示词

资源：`home://project`（真实户型）、`home://design-method`（工作方法与约束）、`home://scenarios`（三种需求默认值）。

提示词：

- `home_design_brief`，参数 `requirements`：整理需求、优先级和假设，读取项目及目录后创建方案。
- `home_design_review`，参数 `designId`：对照需求复核布局、预算、缺口与未验证项。
- `home_design_compare`，无参数：分别模拟亲子、办公、长辈同住，检查、比较并导出。

提示词源文件：[`mcp/prompts.mjs`](mcp/prompts.mjs)。例如，连接 MCP 后可直接对助手说：

> 我们夫妻和一个学龄儿童同住，总预算 24 万，需要三间卧室和亲子阅读角。请读取现有户型和目录，使用 family 场景生成独立方案，逐项检查预算与门口占用，再导出任务书和布局。

> 请检查方案 ID 为「…」的设计。先读取版本，指出房间用途和生活需求不一致的地方，修正可实施的家具布置；不要把未建模的水电、防滑或照护通路标成已完成。

> 请在同一清水房分别模拟亲子成长、双人办公和长辈同住，比较各自预算。长辈方案如超支，优先减少客厅非必需家具，保留床和基本生活配置。

## 与网页连接

`npm run serve:local` 启动 127.0.0.1:8790 的网页和同源只读桥：

- `GET /api/designs`：MCP 文件目录。
- `GET /api/designs/{id}`：指定设计文档。

浏览器「家装设计 → 读取 MCP 方案 → 创建独立方案并查看 3D」创建可编辑副本。请求限制为本机同源 GET；没有远程 HTTP MCP 服务或无认证写入接口。此处的只读 HTTP 桥与 MCP stdio 传输是两回事。

静态部署无需 Node 服务，自动读取 `public/designs/index.json` 的示例。`npm run simulate:designs` **通过真正的 MCP Client** 生成三套设计并输出布局、报告和协议执行记录，再执行 `npm run build` 才会更新静态构建内的示例。

浏览器和 MCP 文件不自动双向同步。网页布局导出用于保存浏览器编辑；MCP 的 `export_design` 返回对应 MCP 文件。不要把两个副本的结果混为同一最新版本。

## 验证

```powershell
npm run test:design
npm run test:autosave
npm run build
# 另开终端运行 npm run serve:local
npm run test:design:ui
```

领域测试覆盖旋转/高度、边界、门口、碰撞、预算和拒绝无效输入；协议测试用官方 SDK 客户端验证发现、提示词、持久化、并发冲突、修改和导出。网页测试使用隔离浏览器与 Supabase mock，不向真实云数据库写入测试记录。
