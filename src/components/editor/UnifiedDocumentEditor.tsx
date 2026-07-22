"use client";

import { useEffect, useMemo, useState } from "react";

import { ContentBlockPreview } from "@/components/content/ContentBlockPreview";
import {
  getContentBlockTypeLabel,
  type ContentBlock,
  type GraphBlock,
  type TableBlock,
} from "@/types/content-block";

type UnifiedDocumentEditorProps = {
  blocks: ContentBlock[];
  onClose: () => void;
  onSave: (blocks: ContentBlock[]) => void;
  onSaveAsNew: (title: string, blocks: ContentBlock[]) => void;
};

export function UnifiedDocumentEditor({ blocks, onClose, onSave, onSaveAsNew }: UnifiedDocumentEditorProps) {
  const [draftBlocks, setDraftBlocks] = useState<ContentBlock[]>(() => structuredClone(blocks));
  const [selectedId, setSelectedId] = useState(blocks[0]?.id || "");
  const [documentTitle, setDocumentTitle] = useState(() => {
    const firstTitle = blocks.find((block) => block.title)?.title;
    return firstTitle ? `${firstTitle} · 编辑版` : "AskAI 答复 · 编辑版";
  });
  const selectedBlock = useMemo(
    () => draftBlocks.find((block) => block.id === selectedId) || draftBlocks[0],
    [draftBlocks, selectedId],
  );
  const canSaveAsNew = documentTitle.trim().length > 0 && draftBlocks.length > 0;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function updateBlock(nextBlock: ContentBlock) {
    setDraftBlocks((current) => current.map((block) => block.id === nextBlock.id ? nextBlock : block));
  }

  return (
    <div className="document-editor-backdrop" role="presentation">
      <section className="document-editor" role="dialog" aria-modal="true" aria-label="统一文档编辑器">
        <header className="document-editor-header">
          <div className="document-editor-heading">
            <strong>编辑 AI 答复</strong>
            <label htmlFor="document-title">文档名称</label>
            <input
              id="document-title"
              value={documentTitle}
              onChange={(event) => setDocumentTitle(event.target.value)}
              placeholder="输入新文档名称"
            />
          </div>
          <div className="document-editor-actions">
            <button type="button" onClick={onClose}>取消</button>
            <button type="button" onClick={() => onSave(draftBlocks)}>保存到原答复</button>
            <button
              type="button"
              className="primary"
              disabled={!canSaveAsNew}
              onClick={() => onSaveAsNew(documentTitle.trim(), draftBlocks)}
            >另存为新文档</button>
          </div>
        </header>

        <div className="document-editor-layout">
          <nav className="document-editor-blocks" aria-label="答复章节">
            {draftBlocks.map((block, index) => (
              <button
                type="button"
                key={block.id}
                className={block.id === selectedBlock?.id ? "active" : ""}
                onClick={() => setSelectedId(block.id)}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{block.title || getContentBlockTypeLabel(block)}</strong>
                  <small>{getContentBlockTypeLabel(block)}</small>
                </div>
              </button>
            ))}
          </nav>

          <main className="document-editor-main">
            {selectedBlock ? (
              <>
                <BlockEditor block={selectedBlock} onChange={updateBlock} />
                <section className="document-editor-preview">
                  <h3>预览</h3>
                  <ContentBlockPreview block={selectedBlock} />
                </section>
              </>
            ) : <p>没有可编辑内容。</p>}
          </main>
        </div>
      </section>
    </div>
  );
}

function BlockEditor({ block, onChange }: { block: ContentBlock; onChange: (block: ContentBlock) => void }) {
  let editor;

  if (block.type === "table") {
    editor = <TableEditor block={block} onChange={onChange} />;
  } else if (block.type === "graph") {
    editor = <GraphEditor block={block} onChange={onChange} />;
  } else {
    const label = block.type === "markdown"
      ? "Markdown 内容"
      : block.type === "mermaid"
        ? `${getContentBlockTypeLabel(block)} Mermaid 源码`
        : block.type === "latex"
          ? "LaTeX 源码"
          : block.sourceFormat === "svg" ? "SVG 源码" : "图片地址";

    editor = (
      <section className="document-editor-source">
        <label htmlFor={`block-${block.id}`}>{label}</label>
        <textarea
          id={`block-${block.id}`}
          value={block.source}
          spellCheck={block.type === "markdown"}
          onChange={(event) => onChange({ ...block, source: event.target.value })}
        />
      </section>
    );
  }

  return (
    <div className="document-block-editor">
      <div className="document-block-meta">
        <label htmlFor={`block-title-${block.id}`}>内容块标题</label>
        <input
          id={`block-title-${block.id}`}
          value={block.title || ""}
          placeholder={getContentBlockTypeLabel(block)}
          onChange={(event) => onChange({ ...block, title: event.target.value })}
        />
      </div>
      {editor}
    </div>
  );
}

function TableEditor({ block, onChange }: { block: TableBlock; onChange: (block: ContentBlock) => void }) {
  function updateCell(rowIndex: number, columnIndex: number, value: string) {
    const rows = block.rows.map((row, index) => index === rowIndex
      ? block.columns.map((_, cellIndex) => cellIndex === columnIndex ? value : (row[cellIndex] || ""))
      : row);
    onChange({ ...block, rows });
  }

  function addColumn() {
    onChange({
      ...block,
      columns: [...block.columns, `列 ${block.columns.length + 1}`],
      rows: block.rows.map((row) => [...row, ""]),
    });
  }

  function removeColumn(columnIndex: number) {
    if (block.columns.length <= 1) return;
    onChange({
      ...block,
      columns: block.columns.filter((_, index) => index !== columnIndex),
      rows: block.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
    });
  }

  return (
    <section className="document-table-editor">
      <div className="document-table-grid" style={{ gridTemplateColumns: `repeat(${block.columns.length}, minmax(160px, 1fr)) 44px` }}>
        {block.columns.map((column, columnIndex) => (
          <div className="document-table-heading" key={`head-${columnIndex}`}>
            <input
              value={column}
              aria-label={`第 ${columnIndex + 1} 列标题`}
              onChange={(event) => onChange({ ...block, columns: block.columns.map((item, index) => index === columnIndex ? event.target.value : item) })}
            />
            <button type="button" disabled={block.columns.length <= 1} onClick={() => removeColumn(columnIndex)} aria-label={`删除第 ${columnIndex + 1} 列`}>×</button>
          </div>
        ))}
        <span aria-hidden="true" />
        {block.rows.flatMap((row, rowIndex) => [
          ...block.columns.map((_, columnIndex) => (
            <input
              key={`${rowIndex}-${columnIndex}`}
              value={row[columnIndex] || ""}
              aria-label={`第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列`}
              onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
            />
          )),
          <button
            type="button"
            className="document-table-delete-row"
            key={`delete-${rowIndex}`}
            onClick={() => onChange({ ...block, rows: block.rows.filter((_, index) => index !== rowIndex) })}
            aria-label={`删除第 ${rowIndex + 1} 行`}
          >×</button>,
        ])}
      </div>
      <div className="document-table-actions">
        <button type="button" onClick={() => onChange({ ...block, rows: [...block.rows, block.columns.map(() => "")] })}>＋ 添加一行</button>
        <button type="button" onClick={addColumn}>＋ 添加一列</button>
      </div>
    </section>
  );
}

function GraphEditor({ block, onChange }: { block: GraphBlock; onChange: (block: ContentBlock) => void }) {
  function updateNode(index: number, field: "id" | "label" | "x" | "y", value: string) {
    const previousId = block.nodes[index]?.id;
    const nodes = block.nodes.map((node, nodeIndex) => {
      if (nodeIndex !== index) return node;
      if (field === "x" || field === "y") {
        return { ...node, [field]: value === "" ? undefined : Number(value) };
      }
      return { ...node, [field]: value };
    });
    const nextId = nodes[index]?.id;
    const edges = field === "id" && previousId && nextId
      ? block.edges.map((edge) => ({
          ...edge,
          source: edge.source === previousId ? nextId : edge.source,
          target: edge.target === previousId ? nextId : edge.target,
        }))
      : block.edges;
    onChange({ ...block, nodes, edges });
  }

  function addNode() {
    let sequence = block.nodes.length + 1;
    let id = `node-${sequence}`;
    while (block.nodes.some((node) => node.id === id)) {
      sequence += 1;
      id = `node-${sequence}`;
    }
    onChange({ ...block, nodes: [...block.nodes, { id, label: `节点 ${sequence}` }] });
  }

  function removeNode(index: number) {
    const removedId = block.nodes[index]?.id;
    onChange({
      ...block,
      nodes: block.nodes.filter((_, nodeIndex) => nodeIndex !== index),
      edges: block.edges.filter((edge) => edge.source !== removedId && edge.target !== removedId),
    });
  }

  function updateEdge(index: number, field: "source" | "target" | "label", value: string) {
    onChange({
      ...block,
      edges: block.edges.map((edge, edgeIndex) => edgeIndex === index ? { ...edge, [field]: value } : edge),
    });
  }

  function addEdge() {
    if (block.nodes.length < 2) return;
    onChange({
      ...block,
      edges: [...block.edges, { source: block.nodes[0].id, target: block.nodes[1].id, label: "" }],
    });
  }

  return (
    <section className="document-graph-editor">
      <div className="document-graph-section">
        <div className="document-graph-section-header"><strong>节点</strong><button type="button" onClick={addNode}>＋ 添加节点</button></div>
        <div className="document-graph-list">
          {block.nodes.map((node, index) => (
            <div className="document-graph-node-row" key={`${node.id}-${index}`}>
              <input aria-label="节点 ID" value={node.id} onChange={(event) => updateNode(index, "id", event.target.value)} />
              <input aria-label="节点名称" value={node.label} onChange={(event) => updateNode(index, "label", event.target.value)} />
              <input aria-label="节点 X 坐标" type="number" placeholder="X 自动" value={node.x ?? ""} onChange={(event) => updateNode(index, "x", event.target.value)} />
              <input aria-label="节点 Y 坐标" type="number" placeholder="Y 自动" value={node.y ?? ""} onChange={(event) => updateNode(index, "y", event.target.value)} />
              <button type="button" onClick={() => removeNode(index)} aria-label={`删除节点 ${node.label}`}>×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="document-graph-section">
        <div className="document-graph-section-header">
          <strong>连线</strong>
          <button type="button" disabled={block.nodes.length < 2} onClick={addEdge}>＋ 添加连线</button>
        </div>
        <div className="document-graph-list">
          {block.edges.map((edge, index) => (
            <div className="document-graph-edge-row" key={edge.id || `${edge.source}-${edge.target}-${index}`}>
              <select aria-label="起点" value={edge.source} onChange={(event) => updateEdge(index, "source", event.target.value)}>
                {block.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
              </select>
              <span aria-hidden="true">→</span>
              <select aria-label="终点" value={edge.target} onChange={(event) => updateEdge(index, "target", event.target.value)}>
                {block.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
              </select>
              <input aria-label="连线说明" placeholder="关系说明" value={edge.label || ""} onChange={(event) => updateEdge(index, "label", event.target.value)} />
              <button type="button" onClick={() => onChange({ ...block, edges: block.edges.filter((_, edgeIndex) => edgeIndex !== index) })} aria-label="删除连线">×</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
