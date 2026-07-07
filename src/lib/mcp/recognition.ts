function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

export function extractRecognitionText(value: unknown): string | undefined {
  const payload = asRecord(value);
  const nestedResult = asRecord(payload.result);

  return firstNonEmptyString(
    nestedResult.text,
    payload.text,
    payload.latex,
    payload.smiles,
    typeof value === "string" ? value : undefined,
  );
}
