"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ContentBlockPreview } from "@/components/content/ContentBlockPreview";
import { buildAnswerPlainText } from "@/lib/content/answer-text";
import type { ContentBlock } from "@/types/content-block";

type ContentBlockCardProps = {
  blocks: ContentBlock[];
  onEdit: () => void;
};

export function ContentBlockCard({ blocks, onEdit }: ContentBlockCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const plainText = useMemo(() => buildAnswerPlainText(undefined, blocks), [blocks]);
  const download = useMemo(
    () => ({
      href: `data:text/markdown;charset=utf-8,${encodeURIComponent(plainText)}`,
      filename: "askai-answer.md",
    }),
    [plainText],
  );

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

  async function copyAnswer() {
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    setMenuOpen(false);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (blocks.length === 0) {
    return null;
  }

  return (
    <section className="content-block-card answer-document" aria-label="AskAI 答复">
      <header className="content-block-header">
        <div>
          <strong>AskAI 答复</strong>
          <span>完整答复 · 可编辑</span>
        </div>
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
                  onEdit();
                }}
              >
                编辑
              </button>
              <button type="button" onClick={copyAnswer}>
                {copied ? "已复制" : "复制"}
              </button>
              <a href={download.href} download={download.filename} onClick={() => setMenuOpen(false)}>
                下载
              </a>
            </div>
          ) : null}
        </div>
      </header>
      <div className="content-block-body answer-document-body">
        {blocks.map((block) => (
          <div key={block.id} className="answer-document-section">
            <ContentBlockPreview block={block} />
          </div>
        ))}
      </div>
    </section>
  );
}
