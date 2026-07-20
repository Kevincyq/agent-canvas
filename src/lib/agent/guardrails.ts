import type { InputGuardrail, OutputGuardrail } from "@openai/agents";

import type { AgentContext } from "@/lib/agent/context";
import {
  AskAiStructuredOutputSchema,
  type AskAiStructuredOutput,
} from "@/lib/agent/result";

const MAX_INPUT_CHARS = 40_000;

function inputText(input: string | unknown[]): string {
  if (typeof input === "string") {
    return input;
  }
  return JSON.stringify(input);
}

export const emptyInputGuardrail: InputGuardrail = {
  name: "reject_empty_input",
  runInParallel: false,
  execute: async ({ input }) => {
    const text = inputText(input).trim();
    return {
      tripwireTriggered: text.length === 0,
      outputInfo: { reason: text.length === 0 ? "empty_input" : "ok" },
    };
  },
};

export const oversizedInputGuardrail: InputGuardrail = {
  name: "reject_oversized_input",
  runInParallel: true,
  execute: async ({ input }) => {
    const text = inputText(input);
    const oversized = text.length > MAX_INPUT_CHARS;
    return {
      tripwireTriggered: oversized,
      outputInfo: {
        reason: oversized ? "oversized_input" : "ok",
        length: text.length,
        max: MAX_INPUT_CHARS,
      },
    };
  },
};

/**
 * Models must not claim write success without a Tool Receipt (M3+).
 */
export const unverifiedWriteClaimGuardrail: OutputGuardrail<
  typeof AskAiStructuredOutputSchema,
  AgentContext
> = {
  name: "reject_unverified_write_claims",
  execute: async ({ agentOutput }) => {
    const output = agentOutput as AskAiStructuredOutput;
    const text = `${output.message}\n${JSON.stringify(output.blocks)}`;
    const claimsWrite =
      /已写入待办|已创建待办|已保存到项目|todo (created|written)|successfully wrote|saved to project/i.test(
        text,
      );
    const hasReceiptEvidence = output.evidence.some((item) =>
      /tool_receipt|create_todo|save_artifact|todo|artifact/i.test(
        `${item.id} ${item.source} ${item.label}`,
      ),
    );

    const tripwireTriggered = claimsWrite && !hasReceiptEvidence;
    return {
      tripwireTriggered,
      outputInfo: {
        reason: tripwireTriggered ? "unverified_write_claim" : "ok",
        claimsWrite,
        hasReceiptEvidence,
      },
    };
  },
};

export const askAiInputGuardrails: InputGuardrail[] = [
  emptyInputGuardrail,
  oversizedInputGuardrail,
];

export const askAiOutputGuardrails: OutputGuardrail<
  typeof AskAiStructuredOutputSchema,
  AgentContext
>[] = [unverifiedWriteClaimGuardrail];
