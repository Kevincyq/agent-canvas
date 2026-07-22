/**
 * Stable fixtures for Ask AI PoC.
 * Five personal-knowledge collections + fixed meeting/todo/web mocks.
 */

export const SEED_USER_ID = "local-user";
export const SEED_VERSION = "2026-07-20-collections-v1";

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

export const SEED_SOURCES = [
  // Business
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
  title: "下午产品评审会",
  startsAt: "2026-07-20T14:00:00+08:00",
  endsAt: "2026-07-20T15:00:00+08:00",
  participants: ["产品经理 A", "设计 C", "研发 D", "市场 B"],
  agenda: ["方案风险回顾", "评审修改项确认", "行动项拆分"],
  historySummary: "上次评审要求补齐竞品对比和演示脚本，并明确待办责任人。",
} as const;

export const SEED_MEETING_COMPLETION = {
  transcript: [
    "产品经理 A：今天确认 AskAI 平板 Demo 的范围，Dralk、通用问答和 Web Search 必须走真实链路。",
    "研发 D：Meeting、知识库写入和 Tablet 日历可以使用稳定 Mock，重点展示 AskAI 的编排能力。",
    "设计 C：平板竖屏采用全宽对话，项目列表使用左侧抽屉。",
    "市场 B：下周演示前需要准备一份完整 Demo 脚本和验收清单。",
  ].join("\n"),
  summary:
    "会议确认 AskAI 是演示主体：Dralk、AI 问答、Web Search 真实闭环；Meeting、知识入库、日历写入使用 Mock。平板采用竖屏抽屉布局，并在演示前完成 Demo 脚本。",
  actionItems: [
    {
      id: "meeting_action_demo_script",
      title: "准备 AskAI 完整 Demo 脚本",
      owner: "产品经理 A",
      dueAt: "2026-07-27T10:00:00+08:00",
    },
    {
      id: "meeting_action_acceptance",
      title: "完成真实 Web Search 验收清单",
      owner: "研发 D",
      dueAt: "2026-07-27T15:00:00+08:00",
    },
  ],
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
  {
    url: "https://example.com/mock/study-spaced-repetition",
    title: "间隔重复学习法（Mock）",
    snippet: "用短卡片复习工具调用与贝叶斯基础概念。",
  },
] as const;

/** @deprecated Use SEED_PROJECT.id (Business). Kept for older spike docs. */
export const LEGACY_LAUNCH_PROJECT_ID = "proj_launch_prep_001";
