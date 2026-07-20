"use client";

type ArtifactRef = {
  id: string;
  title: string;
  artifactType: string;
};

type EvidenceItem = {
  id: string;
  label: string;
  source: string;
};

type ToolReceiptCardProps = {
  evidence?: EvidenceItem[];
  artifacts?: ArtifactRef[];
  onOpenArtifact?: (artifactId: string) => void;
};

export function ToolReceiptCard({
  evidence = [],
  artifacts = [],
  onOpenArtifact,
}: ToolReceiptCardProps) {
  const receipts = evidence.filter((item) => item.source.startsWith("tool_receipt:"));

  if (receipts.length === 0 && artifacts.length === 0) {
    return null;
  }

  return (
    <div className="receipt-card" aria-label="工具回执与 Artifact">
      {receipts.length > 0 ? (
        <div className="receipt-section">
          <span className="receipt-label">Tool Receipt</span>
          <ul>
            {receipts.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong>
                <span>{item.source.replace("tool_receipt:", "")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {artifacts.length > 0 ? (
        <div className="receipt-section">
          <span className="receipt-label">Artifacts</span>
          <ul>
            {artifacts.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="artifact-link"
                  onClick={() => onOpenArtifact?.(item.id)}
                >
                  {item.title}
                </button>
                <span>{item.artifactType}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
