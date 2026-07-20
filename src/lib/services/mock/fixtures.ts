/**
 * Stable fixtures for Ask AI PoC evals.
 * IDs must remain fixed across restarts and test runs.
 */

export const SEED_USER_ID = "local-user";

export const SEED_PROJECT = {
  id: "proj_launch_prep_001",
  userId: SEED_USER_ID,
  name: "新品发布筹备",
  instructions:
    "你在协助筹备一款新品发布。优先引用项目 Sources 与会议纪要，写操作项要可验证，不要编造未提供的客户数据。",
} as const;

export const SEED_SOURCES = [
  {
    id: "src_meeting_notes_001",
    projectId: SEED_PROJECT.id,
    title: "Kickoff 会议纪要",
    sourceType: "meeting_notes",
    content:
      "会议确认发布窗口为 Q3 末。需要补齐竞品对比、渠道物料和评审修改稿。负责人：产品经理 A、市场 B。",
  },
  {
    id: "src_meeting_notes_002",
    projectId: SEED_PROJECT.id,
    title: "渠道对齐会议纪要",
    sourceType: "meeting_notes",
    content:
      "线上渠道希望在发布前两周拿到演示脚本；线下门店要求简化卖点为三条。待办：输出演示脚本初稿。",
  },
  {
    id: "src_product_plan_001",
    projectId: SEED_PROJECT.id,
    title: "产品方案 v0.9",
    sourceType: "product_plan",
    content:
      "产品定位：面向中小团队的协作助手。P0 能力：会话持久化、工具调用、审批写入。风险：Provider 稳定性与审批恢复。",
  },
  {
    id: "src_customer_feedback_001",
    projectId: SEED_PROJECT.id,
    title: "客户反馈摘要",
    sourceType: "customer_feedback",
    content:
      "客户希望刷新后能继续同一任务；写入待办必须有明确回执；手写输入要能带进 Ask AI。负面反馈：不要假装已写入系统。",
  },
] as const;

export const SEED_MEETING = {
  id: "meeting_product_review_001",
  projectId: SEED_PROJECT.id,
  title: "下午产品评审会",
  startsAt: "2026-07-20T14:00:00+08:00",
  endsAt: "2026-07-20T15:00:00+08:00",
  participants: ["产品经理 A", "设计 C", "研发 D", "市场 B"],
  agenda: ["方案风险回顾", "评审修改项确认", "行动项拆分"],
  historySummary: "上次评审要求补齐竞品对比和演示脚本，并明确待办责任人。",
} as const;

export const SEED_ACTION_CANDIDATES = [
  {
    id: "action_001",
    title: "提交产品评审修改稿",
    dueAt: "2026-07-22T18:00:00+08:00",
  },
  {
    id: "action_002",
    title: "输出演示脚本初稿",
    dueAt: "2026-07-23T18:00:00+08:00",
  },
  {
    id: "action_003",
    title: "整理三条线下卖点",
    dueAt: "2026-07-24T18:00:00+08:00",
  },
] as const;

export const SEED_WEB_RESULTS = [
  {
    url: "https://example.com/mock/launch-checklist",
    title: "新品发布检查清单（Mock）",
    snippet: "覆盖方案评审、渠道物料、演示脚本与发布窗口对齐。",
  },
  {
    url: "https://example.com/mock/competitor-notes",
    title: "竞品发布观察（Mock）",
    snippet: "竞品强调刷新后任务可恢复，以及写入动作需有回执。",
  },
] as const;
