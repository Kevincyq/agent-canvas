/**
 * Close an in-flight JSON document so it can be parsed mid-stream.
 * Terminates an open string literal and shuts every container still on the
 * stack; a dangling escape character is dropped rather than guessed at.
 */
function closePartialJson(buffer: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of buffer) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === "]") {
      stack.pop();
    }
  }

  let closed = escaped ? buffer.slice(0, -1) : buffer;
  if (inString) {
    closed += '"';
  }

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    closed += stack[index] === "{" ? "}" : "]";
  }

  return closed;
}

/**
 * Best-effort parse of a structured-output document that is still streaming.
 * Returns `null` while the buffer sits on a boundary that cannot be closed into
 * valid JSON (a bare key, a trailing comma); the next chunk resolves it, so
 * callers should simply skip that round instead of treating it as an error.
 */
export function parsePartialJson(buffer: string): unknown | null {
  if (!buffer.trim()) {
    return null;
  }

  try {
    return JSON.parse(closePartialJson(buffer));
  } catch {
    return null;
  }
}
