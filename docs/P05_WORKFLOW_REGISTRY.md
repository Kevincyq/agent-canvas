# P0.5 Workflow Registry 与同任务续跑

## 结论

P0.5 把原先 Dralk、Meeting 各自维护的工作流逻辑收敛为统一后端协议：

`WorkflowRequest → WorkflowInstance → WorkflowResult → AskAI Session continuation`

AskAI 仍是唯一 Agent。Dralk、Meeting、Writing Assist、Translation 都是 Workflow，不被包装成子 Agent。PKB 是检索与上下文服务，继续归属 Tool Registry / Service Adapter，不进入 Workflow Registry。

## 当前能力边界

| Workflow | Execution Mode | 真实接口 | 当前行为 |
| --- | --- | --- | --- |
| Dralk | `native` | 是 | 保留 Canvas/HWR 真实闭环，并写入统一实例元数据 |
| Meeting | `fixture` | 否 | 状态、Result、Evidence、回传链路真实；转写和纪要内容来自 Fixture Adapter |
| Writing Assist | `external_pending` | 否 | 校验并持久化请求，停在 `waiting_external`，等待未来 Adapter 回传 |
| Translation | `external_pending` | 否 | 校验并持久化请求，停在 `waiting_external`，等待未来 Adapter 回传 |

`search_personal_knowledge` 当前仍是 Fixture Service Adapter。它不是 Workflow，未来接 PKB 真接口时替换 Service Adapter 即可。

## 标准对象

### WorkflowRequest

- `workflowId` / `workflowType` / `version`
- `executionMode`：`native | fixture | external_pending`
- `input`：经过工作流专属 Zod Schema 校验
- `contextRefs`：Project、Source、Artifact、Selection、Attachment 的引用
- `returnTo`：固定返回原 `conversationId/taskId/stepId`
- `resumePolicy`：`agent_on_result | ui_submit | manual`

### WorkflowInstance

SQLite `workflow_states` 现在同时保存：

- 业务状态 `status` 与跨工作流标准状态 `runtime_status`
- `input_json`、`result_json`、`error_json`
- Adapter 模式、协议版本、恢复策略
- `correlation_id`、`parent_workflow_id`
- `completed_at`

页面重启后可恢复“正在等用户、正在等外部服务、已完成”等状态。P0.5 的 Result→Agent continuation 仍由同一个 HTTP 请求同步触发；服务进程恰好在两者之间崩溃时，自动补偿队列属于 P1。

### WorkflowResult

- `status`：`completed | failed | cancelled`
- `output`
- `evidence`
- `artifacts`
- `actions`
- `error`
- `provenance`：明确 Adapter 与 execution mode

结果写入采用条件更新，只有第一次回传会被接受；重复回调不会再次启动 AskAI。这里的 exactly-once 指重复回调防重，不声称 LLM 调用本身具备分布式事务语义。

## 同一 Chat / Task 的真实闭环

1. Agent Tool 或 API 通过 Registry 启动 Workflow。
2. Registry 写入 WorkflowInstance，并记录 `returnTo`。
3. UI、Fixture 或未来真实服务提交 WorkflowResult。
4. Runtime 校验权限、Result Schema 与幂等性。
5. Result 持久化后，以可信运行时事件送入原 Conversation 的 `SqliteSession`。
6. AskAI 结合原用户目标继续推理，可继续检索、保存 Artifact 或调用其他 Tool。
7. 产品聊天只追加新的 Assistant 结果，不伪造一条 User 消息。

Meeting 原先“完成后由 Workflow 直接写一条 Assistant 文案”的捷径已移除。

## API

- `GET /api/workflows/registry`
- `POST /api/workflows/start/:workflowType`
- `POST /api/workflows/result/:workflowId`
- 兼容：`POST /api/workflows/dralk/start`
- 兼容：`POST /api/workflows/dralk/event`
- 兼容：`POST /api/workflows/meeting/start`
- 兼容：`POST /api/workflows/meeting/finish`

通用 Result API 默认 `continueAgent=true`。对于 `agent_on_result` 工作流，第一次有效回传会自动续跑；重复回传返回 `accepted=false`、`agentRun=null`。

## 接入真实接口时的替换点

Meeting、Writing Assist、Translation 的真实接口接入不应改变 Agent、Tool Receipt、WorkflowResult 或 UI 恢复协议，只需要：

1. 新增真实 Provider Adapter。
2. 在 Registry Definition 中把 `adapterId`、`executionMode`、`available`、`realIntegration` 切换为真实值。
3. 将 Adapter 回调转换为现有 WorkflowResult。
4. 增加超时、重试、供应商错误映射和 Scenario Eval。

不得让 Adapter 直接写聊天答案，也不得绕开 Tool Policy、租户权限和结果幂等控制。

## 验收

```bash
npm run typecheck
npm run build
npm run eval:p05:workflow
npm run eval:p0:live
```

P0.5 专项测试覆盖 Registry 边界、Schema 校验、实例持久化、Result provenance、同 Session 自动续跑、重复回调防重、Meeting Fixture 回传、Dralk native 迁移，以及不伪造用户消息。

## 明确留给 P1

- Durable continuation outbox / lease / retry，补偿 Result 已落库但 Agent 未完成的进程崩溃窗口。
- 完整 Task Plan / Step 状态机，而不只依赖当前 `currentStep`。
- Context Engine 的分层装配、Token Budget 与 Memory consolidation。
