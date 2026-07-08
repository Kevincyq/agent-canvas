export function normalizeFunctionExpression(raw: string): string {
  let expression = raw.trim();

  expression = expression.replace(/\^{([^}]+)}/g, "^($1)");
  expression = expression.replace(/(\d)\s*([a-zA-Z(])/g, "$1*$2");
  expression = expression.replace(/\)\s*([a-zA-Z(])/g, ")*$1");

  return expression;
}

export function inferFunctionPlotDomains(expressions: { domain?: [number, number] }[]): {
  xDomain: [number, number];
} {
  const domains = expressions
    .map((expression) => expression.domain)
    .filter((domain): domain is [number, number] => domain !== undefined);

  if (domains.length === 0) {
    return { xDomain: [-5, 5] };
  }

  const xMin = Math.min(...domains.map(([min]) => min));
  const xMax = Math.max(...domains.map(([, max]) => max));

  return { xDomain: [xMin, xMax] };
}
