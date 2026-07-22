"use client";

import { useEffect, useMemo, useState } from "react";

import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { GraphView } from "@/components/content/GraphView";
import { MermaidView } from "@/components/content/MermaidView";
import { sanitizeSvg } from "@/lib/svg/sanitize";
import type { ContentBlock } from "@/types/content-block";

type ContentBlockPreviewProps = {
  block: ContentBlock;
};

export function ContentBlockPreview({ block }: ContentBlockPreviewProps) {
  const sanitizedSvg = useMemo(() => {
    if (block.type !== "media" || block.sourceFormat !== "svg") return null;
    try {
      return sanitizeSvg(block.source);
    } catch {
      return null;
    }
  }, [block]);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sanitizedSvg) {
      setSvgUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(new Blob([sanitizedSvg], { type: "image/svg+xml" }));
    setSvgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sanitizedSvg]);

  switch (block.type) {
    case "markdown":
      return <ChatMessageContent content={block.source} variant="assistant" />;
    case "table":
      return (
        <div className="typed-table-wrap">
          <table className="typed-table">
            <thead><tr>{block.columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{block.columns.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] || ""}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "mermaid":
      return <MermaidView source={block.source} />;
    case "latex":
      return <ChatMessageContent content={`$$\n${block.source}\n$$`} variant="assistant" />;
    case "graph":
      return <GraphView block={block} />;
    case "media":
      if (block.sourceFormat === "svg") {
        if (!svgUrl) {
          return (
            <p className="content-block-error">
              插图无法渲染：模型返回的 SVG 无效、被截断，或不满足安全过滤（例如含 style / 外链 /
              非法标签）。当前产品没有真实配图生成能力，请以正文内容为准。
            </p>
          );
        }
        return <img className="typed-media-preview" src={svgUrl} alt={block.alt} />;
      }
      return <img className="typed-media-preview" src={block.source} alt={block.alt} />;
  }
}
