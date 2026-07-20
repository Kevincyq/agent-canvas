"use client";

import type { ApprovalCard } from "@/types/agent-runtime";

type ApprovalCardListProps = {
  approvals: ApprovalCard[];
  busy?: boolean;
  onDecide: (input: {
    callId: string;
    decision: "approve" | "reject";
  }) => Promise<void>;
};

export function ApprovalCardList({ approvals, busy = false, onDecide }: ApprovalCardListProps) {
  if (approvals.length === 0) {
    return null;
  }

  return (
    <div className="approval-list" aria-label="待审批工具调用">
      {approvals.map((approval) => {
        let prettyArgs = approval.argumentsJson;
        try {
          prettyArgs = JSON.stringify(JSON.parse(approval.argumentsJson), null, 2);
        } catch {
          // keep raw
        }

        return (
          <article key={approval.id} className="approval-card">
            <header className="approval-card-header">
              <strong>{approval.toolName}</strong>
              <span className="approval-risk">{approval.riskLevel}</span>
            </header>
            <p className="approval-meta">callId: {approval.callId}</p>
            <pre className="approval-args">{prettyArgs}</pre>
            <div className="approval-actions">
              <button
                type="button"
                className="approval-approve"
                disabled={busy}
                onClick={() => {
                  void onDecide({ callId: approval.callId, decision: "approve" });
                }}
              >
                批准
              </button>
              <button
                type="button"
                className="approval-reject"
                disabled={busy}
                onClick={() => {
                  void onDecide({ callId: approval.callId, decision: "reject" });
                }}
              >
                拒绝
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
