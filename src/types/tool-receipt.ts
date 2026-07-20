import { randomUUID } from "node:crypto";

import { z } from "zod";

export const ToolReceiptErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
});

export const ToolReceiptSchema = z.object({
  ok: z.boolean(),
  tool: z.string().min(1),
  executionId: z.string().min(1),
  data: z.unknown().optional(),
  error: ToolReceiptErrorSchema.optional(),
  verifiedAt: z.string().min(1),
});

export type ToolReceiptError = z.infer<typeof ToolReceiptErrorSchema>;
export type ToolReceipt<T = unknown> = Omit<z.infer<typeof ToolReceiptSchema>, "data"> & {
  data?: T;
};

export function createToolReceipt<T>(
  input: Omit<ToolReceipt<T>, "verifiedAt" | "executionId"> & {
    executionId?: string;
    verifiedAt?: string;
  },
): ToolReceipt<T> {
  return {
    ok: input.ok,
    tool: input.tool,
    executionId: input.executionId ?? randomUUID(),
    data: input.data,
    error: input.error,
    verifiedAt: input.verifiedAt ?? new Date().toISOString(),
  };
}

export function createFailedToolReceipt(
  tool: string,
  code: string,
  message: string,
  retryable = false,
): ToolReceipt<never> {
  return createToolReceipt({
    ok: false,
    tool,
    error: { code, message, retryable },
  });
}
