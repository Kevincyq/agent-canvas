/**
 * Stable fixtures for Ask AI PoC.
 * Five personal-knowledge collections + fixed meeting/todo/web mocks.
 */

export const SEED_USER_ID = "local-user";
export const SEED_VERSION = "2026-07-23-product-sync-v1";

export const SEED_PROJECTS = [
  {
    id: "proj_business_001",
    userId: SEED_USER_ID,
    name: "Business",
    category: "Business",
    instructions:
      "你在协助商务与产品工作。优先引用 Business 知识库中的会议纪要、方案与客户反馈；行动项必须可验证。",
  },
  {
    id: "proj_life_001",
    userId: SEED_USER_ID,
    name: "Life",
    category: "Life",
    instructions:
      "你在协助生活安排与健康习惯。优先引用 Life 知识库中的日程、习惯与家庭备忘，回答要简洁可执行。",
  },
  {
    id: "proj_technology_001",
    userId: SEED_USER_ID,
    name: "Technology",
    category: "Technology",
    instructions:
      "你在协助技术研究与工程决策。优先引用 Technology 知识库中的架构笔记、工具评测与排障记录。",
  },
  {
    id: "proj_study_001",
    userId: SEED_USER_ID,
    name: "Study",
    category: "Study",
    instructions:
      "你在协助学习与复习。优先引用 Study 知识库中的课程笔记、错题与阅读摘要，讲解要结构化。",
  },
  {
    id: "proj_art_001",
    userId: SEED_USER_ID,
    name: "Art",
    category: "Art",
    instructions:
      "你在协助创作与审美相关任务。优先引用 Art 知识库中的灵感板、作品备注与技法卡片。",
  },
] as const;

/** Default Project for AgentContext when none is selected. */
export const SEED_PROJECT = SEED_PROJECTS[0];

/**
 * Seed collections are preset PKB Collections shown in the nav
 * (Business / Technology / Study / Life / Art) plus used as retrieval scopes.
 */
export const SEED_COLLECTION_IDS: readonly string[] = SEED_PROJECTS.map(
  (project) => project.id,
);

const PRODUCT_SYNC_MINUTES = `# 产品沟通会 · 会议纪要

- 会议名称：产品沟通会
- 时间：2026年7月22日 14:00–15:30（UTC+8）
- 形式：线上同步
- 参会：产品经理 A、设计 C、研发 D、市场 B、解决方案 E
- 记录人：产品经理 A

## 讨论议题

1. AskAI 平板 Demo 范围与验收标准（Dralk、通用问答、Web Search 必须真实闭环）
2. Collection / 任务导航信息架构是否满足演示叙事
3. 知识库检索体验：用户能否从对话框查到会议纪要与待办
4. 下周客户演示脚本与物料分工
5. 风险：FluxInk MCP 可用性、联网搜索凭证、预发环境稳定性

## 会议结论

- AskAI 是演示主体；Meeting / 日历写入可继续用稳定 Mock，但知识库内必须有可检索的真实感纪要。
- 平板竖屏：侧栏 Collection + 任务；主区对话；Composer 保留 Dralk 入口。
- 打开画布时不要再套一层「AskAI 答复」空壳，画布本身即结果。
- 7 月 29 日前完成客户演示彩排；演示脚本需覆盖「查会议纪要 / 查待办 / 打开 Dralk / 联网天气」四条路径。

## 待办事项

1. 【产品经理 A】输出《AskAI 客户演示脚本 v1》，截止日期 2026-07-25
2. 【研发 D】验收 Web Search 真实链路与失败态文案，截止日期 2026-07-26
3. 【设计 C】核对 Collection / 任务侧栏与首屏启动标题，截止日期 2026-07-24
4. 【市场 B】整理三条 Demo 卖点与竞品对比一页纸，截止日期 2026-07-27
5. 【解决方案 E】准备客户现场问题清单（含「产品沟通会待办有哪些」），截止日期 2026-07-28

## 下次同步

- 时间：2026年7月29日 11:00
- 议题：彩排问题复盘与演示顺序最终确认
`;

const PRODUCT_SYNC_TRANSCRIPT = [
  "产品经理 A：今天是 2026 年 7 月 22 日产品沟通会，先对齐 AskAI 平板 Demo 范围。",
  "研发 D：Dralk、通用问答、Web Search 必须真实；Meeting 和日历可以 Mock，但知识库要能搜到今天的纪要和待办。",
  "设计 C：首屏不要「AskAI 答复」空壳，启动标题即可；打开画布也不要再出答复卡。",
  "市场 B：演示脚本要能回答「产品沟通会讨论了什么、待办有哪些」。",
  "解决方案 E：我会按待办准备客户现场问题清单，方便从对话框直接追问。",
  "产品经理 A：结论与待办会后写入 Business 知识库，便于 AskAI 检索。",
].join("\n");

export const SEED_SOURCES = [
  // Business
  {
    id: "src_biz_product_sync_20260722_minutes",
    projectId: "proj_business_001",
    title: "2026-07-22 产品沟通会会议纪要",
    sourceType: "meeting_minutes",
    content: PRODUCT_SYNC_MINUTES,
  },
  {
    id: "src_biz_product_sync_20260722_transcript",
    projectId: "proj_business_001",
    title: "2026-07-22 产品沟通会转写摘要",
    sourceType: "meeting_transcript",
    content: PRODUCT_SYNC_TRANSCRIPT,
  },
  {
    id: "src_biz_kickoff_001",
    projectId: "proj_business_001",
    title: "Kickoff 会议纪要",
    sourceType: "meeting_notes",
    content:
      "会议确认发布窗口为 Q3 末。需要补齐竞品对比、渠道物料和评审修改稿。负责人：产品经理 A、市场 B。",
  },
  {
    id: "src_biz_channel_001",
    projectId: "proj_business_001",
    title: "渠道对齐会议纪要",
    sourceType: "meeting_notes",
    content:
      "线上渠道希望在发布前两周拿到演示脚本；线下门店要求简化卖点为三条。待办：输出演示脚本初稿。",
  },
  {
    id: "src_biz_plan_001",
    projectId: "proj_business_001",
    title: "产品方案 v0.9",
    sourceType: "product_plan",
    content:
      "产品定位：面向中小团队的协作助手。P0 能力：会话持久化、工具调用、审批写入。风险：Provider 稳定性与审批恢复。",
  },
  {
    id: "src_biz_feedback_001",
    projectId: "proj_business_001",
    title: "客户反馈摘要",
    sourceType: "customer_feedback",
    content:
      "客户希望刷新后能继续同一任务；写入待办必须有明确回执；手写输入要能带进 Ask AI。负面反馈：不要假装已写入系统。",
  },
  // Life
  {
    id: "src_life_routine_001",
    projectId: "proj_life_001",
    title: "一周作息备忘",
    sourceType: "note",
    content:
      "工作日 7:00 起床、22:30 入睡。周三晚力量训练，周六长走。周末预留 2 小时家庭时间。",
  },
  {
    id: "src_life_health_001",
    projectId: "proj_life_001",
    title: "体检与用药提醒",
    sourceType: "note",
    content:
      "年度体检约在 8 月。维生素 D 每日一次；过敏季备好抗组胺药。牙医复诊待预约。",
  },
  {
    id: "src_life_travel_001",
    projectId: "proj_life_001",
    title: "周末短途清单",
    sourceType: "checklist",
    content:
      "出门前：充电宝、耳机、雨伞、身份证。目的地偏好安静咖啡馆与公园步道。",
  },
  // Technology
  {
    id: "src_tech_arch_001",
    projectId: "proj_technology_001",
    title: "AskAI Runtime 架构笔记",
    sourceType: "engineering_note",
    content:
      "单 Agent + Shared Runner + SQLite Session。审批用 RunState 序列化恢复。Dralk 是输入 Workflow，不是独立 Agent。",
  },
  {
    id: "src_tech_tooling_001",
    projectId: "proj_technology_001",
    title: "工具链备忘",
    sourceType: "engineering_note",
    content:
      "pnpm + Next.js；本地 spike 用 node --env-file；预发用 docker volume 挂 /app/data。",
  },
  {
    id: "src_tech_incident_001",
    projectId: "proj_technology_001",
    title: "排障：审批卡住",
    sourceType: "incident",
    content:
      "若 canvas.isOpen 被当成 Dralk attach，会误进 running。应仅在有 dralkContext/附件时推进工作流。",
  },
  // Study
  {
    id: "src_study_llm_001",
    projectId: "proj_study_001",
    title: "LLM 工具调用复习卡",
    sourceType: "flashcard",
    content:
      "Function calling 需要稳定 call_id；tool result 必须回到同一 loop；structured output 用 Zod 约束。",
  },
  {
    id: "src_study_math_001",
    projectId: "proj_study_001",
    title: "概率基础错题",
    sourceType: "wrong_answer",
    content:
      "条件概率 P(A|B)=P(A∩B)/P(B)。贝叶斯：后验 ∝ 似然 × 先验。易错：忽略归一化。",
  },
  {
    id: "src_study_reading_001",
    projectId: "proj_study_001",
    title: "阅读摘要：Agent 设计",
    sourceType: "reading_notes",
    content:
      "好的 Agent 设计把工具边界、状态恢复与证据回执写清楚；不要用多 Agent 掩盖单一任务边界不清。",
  },
  // Art
  {
    id: "src_art_mood_001",
    projectId: "proj_art_001",
    title: "灵感板：冷雾青绿",
    sourceType: "moodboard",
    content:
      "关键词：雾面纸感、墨色文字、深青绿强调、少阴影、无紫色渐变。适合 AskAI 产品壳。",
  },
  {
    id: "src_art_typography_001",
    projectId: "proj_art_001",
    title: "字体搭配卡",
    sourceType: "design_note",
    content:
      "品牌用 Fraunces；正文用 Source Sans 3。中文回退 PingFang / Noto Sans SC。避免 Inter 默认脸。",
  },
  {
    id: "src_art_layout_001",
    projectId: "proj_art_001",
    title: "对话布局原则",
    sourceType: "design_note",
    content:
      "侧栏放项目与最近；主区品牌 + 状态；Composer 上方放 Dralk 入口。卡片克制，交互容器才用卡片。",
  },
] as const;

export const SEED_MEETING = {
  id: "meeting_product_review_001",
  projectId: "proj_business_001",
  title: "产品沟通会（2026-07-22）",
  startsAt: "2026-07-22T14:00:00+08:00",
  endsAt: "2026-07-22T15:30:00+08:00",
  participants: ["产品经理 A", "设计 C", "研发 D", "市场 B", "解决方案 E"],
  agenda: [
    "AskAI 平板 Demo 范围与验收标准",
    "Collection / 任务导航信息架构",
    "知识库会议纪要与待办检索体验",
    "客户演示脚本与物料分工",
    "风险：MCP / 联网搜索 / 预发稳定性",
  ],
  historySummary:
    "2026年7月22日产品沟通会：确认 AskAI 为演示主体；知识库需可检索纪要与待办；7月29日彩排前完成演示脚本与验收。",
} as const;

export const SEED_MEETING_COMPLETION = {
  transcript: PRODUCT_SYNC_TRANSCRIPT,
  summary:
    "2026-07-22 产品沟通会确认：AskAI Demo 以真实 Dralk / 问答 / Web Search 为主；知识库写入可检索的会议纪要与待办；打开画布不再套空答复卡；7月29日前完成彩排。",
  actionItems: [
    {
      id: "meeting_action_demo_script",
      title: "输出《AskAI 客户演示脚本 v1》",
      owner: "产品经理 A",
      dueAt: "2026-07-25T18:00:00+08:00",
    },
    {
      id: "meeting_action_web_search_qa",
      title: "验收 Web Search 真实链路与失败态文案",
      owner: "研发 D",
      dueAt: "2026-07-26T18:00:00+08:00",
    },
    {
      id: "meeting_action_nav_ui",
      title: "核对 Collection / 任务侧栏与首屏启动标题",
      owner: "设计 C",
      dueAt: "2026-07-24T18:00:00+08:00",
    },
    {
      id: "meeting_action_market_onepager",
      title: "整理三条 Demo 卖点与竞品对比一页纸",
      owner: "市场 B",
      dueAt: "2026-07-27T18:00:00+08:00",
    },
    {
      id: "meeting_action_customer_faq",
      title: "准备客户现场问题清单",
      owner: "解决方案 E",
      dueAt: "2026-07-28T18:00:00+08:00",
    },
  ],
} as const;

export const SEED_ACTION_CANDIDATES = [
  {
    id: "action_001",
    title: "输出《AskAI 客户演示脚本 v1》",
    dueAt: "2026-07-25T18:00:00+08:00",
  },
  {
    id: "action_002",
    title: "验收 Web Search 真实链路与失败态文案",
    dueAt: "2026-07-26T18:00:00+08:00",
  },
  {
    id: "action_003",
    title: "整理三条 Demo 卖点与竞品对比一页纸",
    dueAt: "2026-07-27T18:00:00+08:00",
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
  {
    url: "https://example.com/mock/study-spaced-repetition",
    title: "间隔重复学习法（Mock）",
    snippet: "用短卡片复习工具调用与贝叶斯基础概念。",
  },
] as const;

/** @deprecated Use SEED_PROJECT.id (Business). Kept for older spike docs. */
export const LEGACY_LAUNCH_PROJECT_ID = "proj_launch_prep_001";
