"use client";

import { useEffect, useRef, useState } from "react";

import { PlotCard } from "@/components/chart/PlotCard";
import { ChatMessageContent } from "@/components/chat/ChatMessageContent";
import { ContentBlockPreview } from "@/components/content/ContentBlockPreview";
import { SvgDiagramCard } from "@/components/svg/SvgDiagramCard";
import type { ContentBlock } from "@/types/content-block";
import type { PlotSpec } from "@/types/plot";
import type { SvgSpec } from "@/types/svg";

type ContentBlockCardProps = {
  content?: string;
  blocks?: ContentBlock[];
  charts?: PlotSpec[];
  svgs?: SvgSpec[];
  onEdit?: () => void;
};

export function ContentBlockCard({
  content,
  blocks = [],
  charts = [],
  svgs = [],
  onEdit,
}: ContentBlockCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const intro = content?.trim() ?? "";
  const canEdit = Boolean(onEdit && blocks.length > 0);
  const hasBody =
    intro.length > 0 || blocks.length > 0 || charts.length > 0 || svgs.length > 0;

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function close(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  if (!hasBody) {
    return null;
  }

  return (
    <section className="content-block-card answer-document" aria-label="AskAI 答复">
      <header className="content-block-header">
        <div>
          <strong>AskAI 答复</strong>
        </div>
        {canEdit ? (
          <div ref={menuRef} className="content-block-menu-wrap">
            <button
              type="button"
              className="content-block-menu-trigger"
              aria-label="答复操作"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div className="content-block-menu" role="menu">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit?.();
                  }}
                >
                  编辑
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      <div className="content-block-body answer-document-body">
        {intro ? (
          <div className="answer-document-intro">
            <ChatMessageContent content={intro} variant="assistant" />
          </div>
        ) : null}
        {blocks.map((block) => (
          <div key={block.id} className="answer-document-section">
            <ContentBlockPreview block={block} />
          </div>
        ))}
        {charts.map((spec, index) => (
          <div key={`chart-${index}`} className="answer-document-media">
            <PlotCard spec={spec} />
          </div>
        ))}
        {svgs.map((spec, index) => (
          <div key={`svg-${index}`} className="answer-document-media">
            <SvgDiagramCard spec={spec} />
          </div>
        ))}
      </div>
    </section>
  );
}
