const ALLOWED_ELEMENTS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "title", "desc", "defs", "lineargradient", "radialgradient", "stop",
  "marker", "clippath", "mask", "pattern", "use",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "xmlns", "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy",
  "r", "rx", "ry", "d", "points", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
  "opacity", "transform", "font-size", "font-family", "font-weight", "text-anchor",
  "dominant-baseline", "dx", "dy", "offset", "stop-color", "stop-opacity", "marker-start",
  "marker-mid", "marker-end", "clip-path", "mask", "preserveaspectratio", "role", "aria-label",
  "id", "href", "xlink:href",
]);

function isSafeReference(value: string): boolean {
  const normalized = value.trim();
  return normalized.startsWith("#") || /^url\(\s*#[^)]+\s*\)$/i.test(normalized);
}

function isReferenceAttribute(name: string): boolean {
  return name === "href" || name === "xlink:href" || name === "clip-path" || name === "mask" || name.startsWith("marker-");
}

export function sanitizeSvg(source: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(source, "image/svg+xml");

  if (document.querySelector("parsererror") || document.documentElement.localName.toLowerCase() !== "svg") {
    throw new Error("SVG 格式无效，无法渲染。");
  }

  const elements = [document.documentElement, ...Array.from(document.documentElement.querySelectorAll("*"))];

  for (const element of elements) {
    if (!ALLOWED_ELEMENTS.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();

      if (name.startsWith("on") || name === "style" || !ALLOWED_ATTRIBUTES.has(name)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (isReferenceAttribute(name) && !isSafeReference(attribute.value)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (/javascript:|data:|https?:|\/\//i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  const root = document.documentElement;
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.setAttribute("role", "img");

  if (!root.hasAttribute("viewBox")) {
    const width = Number.parseFloat(root.getAttribute("width") ?? "");
    const height = Number.parseFloat(root.getAttribute("height") ?? "");
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
  }

  root.removeAttribute("width");
  root.removeAttribute("height");

  return new XMLSerializer().serializeToString(root);
}
