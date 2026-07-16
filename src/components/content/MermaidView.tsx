"use client";

import { useEffect, useId, useState } from "react";

type MermaidViewProps = {
  source: string;
};

export function MermaidView({ source }: MermaidViewProps) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function render() {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          flowchart: {
            curve: "basis",
            nodeSpacing: 42,
            rankSpacing: 54,
            padding: 18,
          },
          themeVariables: {
            background: "#ffffff",
            primaryColor: "#eef2ff",
            primaryTextColor: "#172033",
            primaryBorderColor: "#6366f1",
            secondaryColor: "#ecfeff",
            secondaryTextColor: "#172033",
            secondaryBorderColor: "#14b8a6",
            tertiaryColor: "#fff7ed",
            tertiaryTextColor: "#172033",
            tertiaryBorderColor: "#f59e0b",
            lineColor: "#7c86a2",
            textColor: "#172033",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: "15px",
            clusterBkg: "#f8fafc",
            clusterBorder: "#cbd5e1",
          },
        });
        const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}-${Date.now()}`;
        const result = await mermaid.render(id, source);
        if (active) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (renderError) {
        if (active) {
          setSvg("");
          setError(renderError instanceof Error ? renderError.message : "Mermaid 无法渲染。");
        }
      }
    }

    void render();
    return () => {
      active = false;
    };
  }, [reactId, source]);

  if (error) {
    return <p className="content-block-error" role="alert">{error}</p>;
  }

  if (!svg) {
    return <p className="content-block-loading">正在渲染 Mermaid…</p>;
  }

  return <div className="mermaid-view" dangerouslySetInnerHTML={{ __html: svg }} />;
}
