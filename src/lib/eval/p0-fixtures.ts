/**
 * P0 Agent Eval fixtures — stable prompts and expected observable outcomes.
 * Fixtures intentionally avoid live LLM calls so staging can smoke-check contracts.
 */

export type EvalExpectation = {
  mustKeepSameConversation?: boolean;
  mustOpenCanvas?: boolean;
  mustCallTools?: string[];
  mustPauseForApproval?: boolean;
  mustShowEvidence?: boolean;
  mustPersistArtifact?: boolean;
  mustRestoreAfterRefresh?: boolean;
};

export type EvalFixture = {
  id: string;
  caseId: string;
  title: string;
  prompt: string;
  origin?: "agent_intent" | "user_button";
  expectations: EvalExpectation;
};

export const P0_EVAL_FIXTURES: EvalFixture[] = [
  {
    id: "eval_case_1_dralk_intent",
    caseId: "case_1",
    title: "对话调起 Dralk",
    prompt: "我想边画边说整理新品发布方案",
    origin: "agent_intent",
    expectations: {
      mustKeepSameConversation: true,
      mustOpenCanvas: true,
      mustRestoreAfterRefresh: true,
    },
  },
  {
    id: "eval_case_2_dralk_button",
    caseId: "case_2",
    title: "按钮调起 Dralk",
    prompt: "",
    origin: "user_button",
    expectations: {
      mustKeepSameConversation: true,
      mustOpenCanvas: true,
    },
  },
  {
    id: "eval_case_3_multi_tool",
    caseId: "case_3",
    title: "多工具检索",
    prompt:
      "请检索新品发布筹备项目中关于客户反馈的知识，再读取下午产品评审会上下文，然后把一份简短中文摘要保存为项目 Artifact。",
    expectations: {
      mustCallTools: [
        "search_personal_knowledge",
        "get_meeting_context",
        "save_artifact_to_project",
      ],
      mustShowEvidence: true,
      mustPersistArtifact: true,
    },
  },
  {
    id: "eval_case_4_meeting",
    caseId: "case_4",
    title: "Mock Meeting Context",
    prompt: "请读取 2026年7月22日产品沟通会上下文，并生成一份 Meeting Brief。",
    expectations: {
      mustCallTools: ["get_meeting_context"],
      mustShowEvidence: true,
    },
  },
  {
    id: "eval_case_5_todo_approval",
    caseId: "case_5",
    title: "Mock ToDo Approval",
    prompt: "请创建一条待办：准备下午新品发布评审会的行动项清单。",
    expectations: {
      mustCallTools: ["create_todo"],
      mustPauseForApproval: true,
      mustShowEvidence: true,
    },
  },
  {
    id: "eval_case_6_reject_approval",
    caseId: "case_6",
    title: "拒绝审批",
    prompt: "请创建一条待办：同步市场物料清单。",
    expectations: {
      mustCallTools: ["create_todo"],
      mustPauseForApproval: true,
    },
  },
  {
    id: "eval_case_7_refresh_restore",
    caseId: "case_7",
    title: "刷新恢复",
    prompt: "在 waiting_for_approval 时刷新页面后继续审批。",
    expectations: {
      mustRestoreAfterRefresh: true,
      mustPauseForApproval: true,
    },
  },
];

export function listEvalFixtures() {
  return P0_EVAL_FIXTURES;
}

export function getEvalFixture(id: string) {
  return P0_EVAL_FIXTURES.find((item) => item.id === id) ?? null;
}
