"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ContentBlockPreview } from "@/components/content/ContentBlockPreview";
import {
  getBlockDownloadExtension,
  getBlockSource,
  getContentBlockTypeLabel,
  type ContentBlock,
} from "@/types/content-block";

type ContentBlockCardProps = {
  block: ContentBlock;
  onEdit: () => void;
};

export function ContentBlockCard({ block, onEdit }: ContentBlockCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const download = useMemo(() => {
    const source = getBlockSource(block);
    const mimeType = block.type === "media" && block.sourceFormat === "svg" ? "image/svg+xml" : "text/plain";
    return {
      href: `data:${mimeType};charset=utf-8,${encodeURIComponent(source)}`,
      filename: `${(block.title || block.type).replace(/[^\w\u4e00-\u9fff-]+/g, "-")}.${getBlockDownloadExtension(block)}`,
    };
  }, [block]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function close(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  async function copyBlock() {
    await navigator.clipboard.writeText(getBlockSource(block));
    setCopied(true);
    setMenuOpen(false);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="content-block-card">
      <header className="content-block-header">
        <div>
          <strong>{block.title || getContentBlockTypeLabel(block)}</strong>
          <span>{getContentBlockTypeLabel(block)} · 可编辑</span>
        </div>
        <div ref={menuRef} className="content-block-menu-wrap">
          <button
            type="button"
            className="content-block-menu-trigger"
            aria-label="更多内容操作"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >⋯</button>
          {menuOpen ? (
            <div className="content-block-menu" role="menu">
              <button type="button" onClick={() => { setMenuOpen(false); onEdit(); }}>编辑</button>
              <button type="button" onClick={copyBlock}>{copied ? "已复制" : "复制"}</button>
              <a href={download.href} download={download.filename} onClick={() => setMenuOpen(false)}>下载</a>
            </div>
          ) : null}
        </div>
      </header>
      <div className="content-block-body"><ContentBlockPreview block={block} /></div>
    </section>
  );
}
