"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { sanitizeSvg } from "@/lib/svg/sanitize";
import type { SvgSpec } from "@/types/svg";

type SvgDiagramCardProps = {
  spec: SvgSpec;
};

export function SvgDiagramCard({ spec }: SvgDiagramCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const sanitized = useMemo(() => {
    try {
      return { svg: sanitizeSvg(spec.svg), error: null };
    } catch (error) {
      return {
        svg: null,
        error: error instanceof Error ? error.message : "SVG 无法渲染。",
      };
    }
  }, [spec.svg]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sanitized.svg) {
      setImageUrl(null);
      return undefined;
    }

    const url = URL.createObjectURL(new Blob([sanitized.svg], { type: "image/svg+xml" }));
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sanitized.svg]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  async function copySvg() {
    if (!sanitized.svg) {
      return;
    }

    await navigator.clipboard.writeText(sanitized.svg);
    setCopied(true);
    setMenuOpen(false);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadSvg() {
    if (!imageUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `${(spec.title || "diagram").replace(/[^\w\u4e00-\u9fff-]+/g, "-")}.svg`;
    link.click();
    setMenuOpen(false);
  }

  return (
    <figure className={expanded ? "svg-diagram-card svg-diagram-expanded" : "svg-diagram-card"}>
      <figcaption className="svg-diagram-header">
        <strong>{spec.title || "规范图形"}</strong>
        <div className="svg-diagram-actions" ref={menuRef}>
          <button type="button" className="svg-diagram-primary" onClick={() => setExpanded((current) => !current)}>
            {expanded ? "收起" : "放大"}
          </button>
          <button
            type="button"
            className="svg-diagram-menu-trigger"
            aria-expanded={menuOpen}
            aria-label="更多操作"
            onClick={() => setMenuOpen((current) => !current)}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="svg-diagram-menu" role="menu">
              <button type="button" disabled={!sanitized.svg} onClick={copySvg}>
                {copied ? "已复制" : "复制 SVG"}
              </button>
              <button type="button" disabled={!imageUrl} onClick={downloadSvg}>
                下载
              </button>
            </div>
          ) : null}
        </div>
      </figcaption>
      {sanitized.error ? (
        <p className="svg-diagram-error" role="alert">{sanitized.error}</p>
      ) : imageUrl ? (
        <button
          type="button"
          className="svg-diagram-stage"
          aria-label={expanded ? "收起图形" : "放大图形"}
          onClick={() => setExpanded((current) => !current)}
        >
          <img src={imageUrl} alt={spec.alt} />
        </button>
      ) : (
        <p className="svg-diagram-loading">正在准备图形…</p>
      )}
    </figure>
  );
}
