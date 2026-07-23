"use client";

import { useState } from "react";

type EvidenceItem = {
  id: string;
  label: string;
  source: string;
};

type EvidenceListProps = {
  evidence?: EvidenceItem[];
};

export function EvidenceList({ evidence = [] }: EvidenceListProps) {
  // Citations / sources only — tool receipts are not shown in the answer chrome.
  const items = evidence.filter((item) => !item.source.startsWith("tool_receipt:"));
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="evidence-list" aria-label="来源与证据">
      <button
        type="button"
        className="evidence-list-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="evidence-list-label">来源</span>
        <span className={`evidence-list-chevron${open ? " is-open" : ""}`} aria-hidden>
          {">"}
        </span>
      </button>
      {open ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${item.id}:${item.source}:${index}`} className="evidence-chip">
              {/^https?:\/\//i.test(item.source) ? (
                <a href={item.source} target="_blank" rel="noreferrer" title={item.source}>
                  {item.label}
                </a>
              ) : (
                <span title={item.source}>{item.label}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
