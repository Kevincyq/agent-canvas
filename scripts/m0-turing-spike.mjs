#!/usr/bin/env node
/**
 * M0 Turing Provider Spike
 *
 * Exit criteria from ASKAI_AGENT_UPGRADE_PLAN.md:
 * A minimal Agent must call echo_tool, consume the tool result, and produce a final output.
 *
 * Also probes: multi-tool sequence, structured output, streaming, tool error propagation,
 * and raw OpenAI-compatible chat.completions tools (to separate proxy vs SDK issues).
 *
 * Usage:
 *   pnpm run spike:m0
 *   # or: node --env-file=.env.local scripts/m0-turing-spike.mjs
 */

import { Agent, run, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled, tool } from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`\n[${mark}] ${name}`);
  if (detail) {
    console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Load .env.local via --env-file or pnpm run spike:m0`);
  }
  return value;
}

function getConfig() {
  const apiKey = process.env.TURING_API_KEY || process.env.OPENAI_API_KEY;
  const baseURL = (
    process.env.TURING_API_BASE ||
    process.env.OPENAI_BASE_URL ||
    "https://live-turing.cn.llm.tcljd.com/api/v1"
  ).replace(/\/$/, "");
  const model = process.env.TURING_MODEL || process.env.OPENAI_MODEL || "turing/gpt-5.5";
  const apiMode = process.env.OPENAI_API === "responses" ? "responses" : "chat_completions";

  if (!apiKey) {
    throw new Error("Missing TURING_API_KEY or OPENAI_API_KEY");
  }

  return { apiKey, baseURL, model, apiMode };
}

function createEchoTool() {
  return tool({
    name: "echo_tool",
    description: "Echo back the provided message. Use this when asked to call echo_tool.",
    parameters: z.object({
      message: z.string().describe("The message to echo"),
    }),
    execute: async ({ message }) => {
      return `ECHO:${message}`;
    },
  });
}

function createAddTool() {
  return tool({
    name: "add_tool",
    description: "Add two integers and return the sum.",
    parameters: z.object({
      a: z.number().int(),
      b: z.number().int(),
    }),
    execute: async ({ a, b }) => {
      return String(a + b);
    },
  });
}

function createFailTool() {
  return tool({
    name: "fail_tool",
    description: "Always fails. Use only when asked to call fail_tool.",
    parameters: z.object({
      reason: z.string(),
    }),
    execute: async () => {
      throw new Error("intentional_fail_tool_error");
    },
  });
}

function summarizeRun(result) {
  const history = Array.isArray(result.history) ? result.history : [];
  const newItems = Array.isArray(result.newItems) ? result.newItems : [];
  const toolCalls = newItems.filter((item) => item?.type === "tool_call_item" || item?.rawItem?.type === "function_call");
  const toolOutputs = newItems.filter(
    (item) => item?.type === "tool_call_output_item" || item?.rawItem?.type === "function_call_result",
  );

  return {
    finalOutput: result.finalOutput ?? null,
    historyCount: history.length,
    newItemTypes: newItems.map((item) => item?.type ?? item?.rawItem?.type ?? typeof item),
    toolCallCount: toolCalls.length,
    toolOutputCount: toolOutputs.length,
    interruptions: result.interruptions?.length ?? 0,
  };
}

async function testSdkEchoLoop(client, config) {
  setDefaultOpenAIClient(client);
  setOpenAIAPI(config.apiMode);
  setTracingDisabled(true);

  const agent = new Agent({
    name: "M0 Echo Spike Agent",
    model: config.model,
    instructions:
      "You are a tool-calling test agent. When asked to echo something, you MUST call echo_tool. After receiving the tool result, reply with exactly: TOOL_OK <echoed value>",
    tools: [createEchoTool()],
  });

  const result = await run(agent, 'Call echo_tool with message "hello-m0" and then confirm success.');
  const summary = summarizeRun(result);
  const finalText = String(result.finalOutput ?? "");
  const ok =
    summary.toolCallCount >= 1 &&
    summary.toolOutputCount >= 1 &&
    /TOOL_OK/i.test(finalText) &&
    /ECHO:hello-m0|hello-m0/i.test(finalText);

  record("SDK Agent: echo_tool call + result loop + final output", ok, {
    apiMode: config.apiMode,
    model: config.model,
    finalText,
    summary,
  });

  return ok;
}

async function testSdkMultiTool(client, config) {
  setDefaultOpenAIClient(client);
  setOpenAIAPI(config.apiMode);
  setTracingDisabled(true);

  const agent = new Agent({
    name: "M0 Multi Tool Spike Agent",
    model: config.model,
    instructions:
      "You must call tools. First call echo_tool with message \"step1\". Then call add_tool with a=2 and b=3. Finally reply with exactly: MULTI_OK <echo> <sum>",
    tools: [createEchoTool(), createAddTool()],
  });

  const result = await run(
    agent,
    "Use echo_tool then add_tool as instructed. Do not skip tools.",
  );
  const summary = summarizeRun(result);
  const finalText = String(result.finalOutput ?? "");
  const ok =
    summary.toolCallCount >= 2 &&
    summary.toolOutputCount >= 2 &&
    /MULTI_OK/i.test(finalText) &&
    /5/.test(finalText);

  record("SDK Agent: multi-tool sequential calls", ok, {
    finalText,
    summary,
  });

  return ok;
}

async function testSdkStructuredOutput(client, config) {
  setDefaultOpenAIClient(client);
  setOpenAIAPI(config.apiMode);
  setTracingDisabled(true);

  const OutputSchema = z.object({
    status: z.enum(["ok", "error"]),
    note: z.string(),
  });

  const agent = new Agent({
    name: "M0 Structured Output Spike Agent",
    model: config.model,
    instructions: "Always return structured output matching the schema. Set status to ok and note to ready.",
    outputType: OutputSchema,
  });

  const result = await run(agent, "Return the structured status.");
  const output = result.finalOutput;
  const ok =
    output &&
    typeof output === "object" &&
    output.status === "ok" &&
    typeof output.note === "string";

  record("SDK Agent: structured outputType (Zod)", ok, {
    finalOutput: output,
  });

  return ok;
}

async function testSdkToolErrorPropagation(client, config) {
  setDefaultOpenAIClient(client);
  setOpenAIAPI(config.apiMode);
  setTracingDisabled(true);

  const agent = new Agent({
    name: "M0 Fail Tool Spike Agent",
    model: config.model,
    instructions:
      "You must call fail_tool once. After the tool error, reply starting with ERROR_HANDLED and briefly mention the failure.",
    tools: [createFailTool()],
  });

  try {
    const result = await run(agent, "Please call fail_tool with reason=demo.");
    const summary = summarizeRun(result);
    const finalText = String(result.finalOutput ?? "");
    const ok = summary.toolCallCount >= 1 && /ERROR_HANDLED/i.test(finalText);
    record("SDK Agent: tool error returns to model", ok, {
      finalText,
      summary,
    });
    return ok;
  } catch (error) {
    record("SDK Agent: tool error returns to model", false, {
      thrown: error instanceof Error ? error.message : String(error),
      note: "Tool error aborted the run instead of returning to the model",
    });
    return false;
  }
}

async function testSdkStreaming(client, config) {
  setDefaultOpenAIClient(client);
  setOpenAIAPI(config.apiMode);
  setTracingDisabled(true);

  const agent = new Agent({
    name: "M0 Stream Spike Agent",
    model: config.model,
    instructions: "Reply with a short sentence. No tools.",
  });

  try {
    const stream = await run(agent, "Say hello in one short sentence.", { stream: true });
    let eventCount = 0;
    const eventTypes = new Set();

    for await (const event of stream) {
      eventCount += 1;
      if (event?.type) {
        eventTypes.add(event.type);
      }
    }

    const finalOutput = await stream.finalOutput;
    const ok = eventCount > 0 && Boolean(finalOutput);
    record("SDK Agent: streaming events", ok, {
      eventCount,
      eventTypes: [...eventTypes],
      finalOutput,
    });
    return ok;
  } catch (error) {
    record("SDK Agent: streaming events", false, {
      thrown: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function testRawChatCompletionsTools(client, config) {
  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: "system",
          content: "Call echo_tool with message hello-raw when asked.",
        },
        {
          role: "user",
          content: "Please call echo_tool now.",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "echo_tool",
            description: "Echo a message",
            parameters: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
              required: ["message"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: "auto",
    });

    const message = response.choices?.[0]?.message;
    const toolCalls = message?.tool_calls ?? [];
    const first = toolCalls[0];
    const callId = first?.id;
    const ok = toolCalls.length >= 1 && Boolean(callId) && first?.function?.name === "echo_tool";

    record("Raw chat.completions: function calling + call id", ok, {
      toolCalls,
      content: message?.content ?? null,
      finishReason: response.choices?.[0]?.finish_reason ?? null,
    });

    if (!ok) {
      return false;
    }

    const followUp = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: "system",
          content: "After tool results, reply TOOL_OK.",
        },
        {
          role: "user",
          content: "Please call echo_tool now.",
        },
        message,
        {
          role: "tool",
          tool_call_id: callId,
          content: "ECHO:hello-raw",
        },
      ],
    });

    const followText = followUp.choices?.[0]?.message?.content ?? "";
    const loopOk = /TOOL_OK/i.test(followText);
    record("Raw chat.completions: tool result loop", loopOk, {
      followText,
      callId,
    });
    return loopOk;
  } catch (error) {
    record("Raw chat.completions: function calling + call id", false, {
      thrown: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function main() {
  console.log("=== M0 Turing Provider Spike ===");
  const config = getConfig();
  console.log(
    JSON.stringify(
      {
        baseURL: config.baseURL,
        model: config.model,
        apiMode: config.apiMode,
        hasKey: Boolean(config.apiKey),
      },
      null,
      2,
    ),
  );

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  // Order: raw proxy check first, then SDK-level Agent loop (exit criterion).
  await testRawChatCompletionsTools(client, config);
  const echoOk = await testSdkEchoLoop(client, config);
  await testSdkMultiTool(client, config);
  await testSdkStructuredOutput(client, config);
  await testSdkToolErrorPropagation(client, config);
  await testSdkStreaming(client, config);

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  const exitCriterion = echoOk;

  console.log("\n=== Summary ===");
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log(`Exit criterion (echo_tool loop): ${exitCriterion ? "PASS" : "FAIL"}`);
  console.log(
    exitCriterion
      ? "Recommendation: proceed with Turing for Agent Runtime (M1+)."
      : "Recommendation: STOP and switch Agent Runtime to native OpenAI Responses API.",
  );

  process.exit(exitCriterion ? 0 : 1);
}

main().catch((error) => {
  console.error("\n[FATAL]", error);
  process.exit(2);
});
