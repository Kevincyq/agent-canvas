"use client";

type EvidenceItem = {
  id: string;
  label: string;
  source: string;
};

type EvidenceListProps = {
  evidence?: EvidenceItem[];
};

export function EvidenceList({ evidence = [] }: EvidenceListProps) {
  if (evidence.length === 0) {
    return null;
  }

  return (
    <div className="evidence-list" aria-label="来源与证据">
      <span className="evidence-list-label">Evidence</span>
      <ul>
        {evidence.map((item) => (
          <li key={item.id} className="evidence-chip" title={item.source}>
            <strong>{item.label}</strong>
            <span>{item.source}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
