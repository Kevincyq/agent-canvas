"use client";

import { useId, useMemo } from "react";

import type { GraphBlock } from "@/types/content-block";

type GraphViewProps = {
  block: GraphBlock;
};

export function GraphView({ block }: GraphViewProps) {
  const markerId = `arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shadowId = `shadow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const gradientId = `gradient-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const nodes = useMemo(() => {
    const centerX = 360;
    const centerY = 210;
    const radius = Math.min(150, Math.max(80, block.nodes.length * 18));

    return block.nodes.map((node, index) => ({
      ...node,
      x: node.x ?? centerX + Math.cos((index / Math.max(1, block.nodes.length)) * Math.PI * 2) * radius,
      y: node.y ?? centerY + Math.sin((index / Math.max(1, block.nodes.length)) * Math.PI * 2) * radius,
    }));
  }, [block.nodes]);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  function edgeEndpoints(source: { x: number; y: number }, target: { x: number; y: number }) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / distance;
    const uy = dy / distance;
    const nodeRadius = 82;

    return {
      x1: source.x + ux * nodeRadius,
      y1: source.y + uy * 30,
      x2: target.x - ux * nodeRadius,
      y2: target.y - uy * 30,
    };
  }

  return (
    <svg className="graph-view" viewBox="0 0 720 420" role="img" aria-label={block.title || "关系图"}>
      <defs>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#77819a" />
        </marker>
        <filter id={shadowId} x="-30%" y="-40%" width="160%" height="180%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#1e293b" floodOpacity="0.13" />
        </filter>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eef2ff" />
          <stop offset="100%" stopColor="#ecfeff" />
        </linearGradient>
        <pattern id={`${gradientId}-grid`} width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.2" fill="#dbe3f0" />
        </pattern>
      </defs>
      <rect width="720" height="420" rx="22" fill="#fbfdff" />
      <rect width="720" height="420" rx="22" fill={`url(#${gradientId}-grid)`} opacity="0.7" />
      {block.edges.map((edge, index) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) return null;
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const points = edgeEndpoints(source, target);
        return (
          <g key={edge.id || `${edge.source}-${edge.target}-${index}`}>
            <line
              x1={points.x1}
              y1={points.y1}
              x2={points.x2}
              y2={points.y2}
              stroke="#77819a"
              strokeWidth="2.4"
              strokeLinecap="round"
              markerEnd={`url(#${markerId})`}
            />
            {edge.label ? (
              <g>
                <rect x={midX - Math.max(28, edge.label.length * 7)} y={midY - 24} width={Math.max(56, edge.label.length * 14)} height="24" rx="12" fill="#ffffff" stroke="#d7deea" />
                <text x={midX} y={midY - 8} textAnchor="middle" className="graph-edge-label">{edge.label}</text>
              </g>
            ) : null}
          </g>
        );
      })}
      {nodes.map((node) => (
        <g key={node.id} filter={`url(#${shadowId})`}>
          <rect x={node.x - 82} y={node.y - 30} width="164" height="60" rx="18" fill={`url(#${gradientId})`} stroke="#6366f1" strokeWidth="2" />
          <circle cx={node.x - 60} cy={node.y} r="5" fill="#14b8a6" />
          <text x={node.x + 4} y={node.y + 5} textAnchor="middle" className="graph-node-label">{node.label}</text>
        </g>
      ))}
    </svg>
  );
}
