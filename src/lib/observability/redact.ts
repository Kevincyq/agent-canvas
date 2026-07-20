const SENSITIVE_KEY =
  /^(api[_-]?key|authorization|auth|token|access[_-]?token|refresh[_-]?token|password|secret|credential|private[_-]?key)$/i;

const SENSITIVE_VALUE =
  /\b(sk-[a-zA-Z0-9]{8,}|Bearer\s+[A-Za-z0-9\-._~+/]+=*)\b/g;

export function redactString(value: string): string {
  return value.replace(SENSITIVE_VALUE, "[REDACTED]");
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return "[TRUNCATED]";
  }
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        output[key] = "[REDACTED]";
        continue;
      }
      output[key] = redactValue(nested, depth + 1);
    }
    return output;
  }
  return value;
}
