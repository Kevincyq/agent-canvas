import type { CanvasOperation, Point } from "@/types/agent";

export type CanvasElement =
  | {
      id: string;
      type: "stroke";
      points: Point[];
      color: string;
      width: number;
      highlighted?: boolean;
    }
  | {
      id: string;
      type: "text";
      text: string;
      x: number;
      y: number;
      highlighted?: boolean;
    };

export type CanvasSummary = {
  isOpen: boolean;
  strokeCount: number;
  textCount: number;
  selectedElementId: string | null;
};

export function createCanvasSummary(
  isOpen: boolean,
  elements: CanvasElement[],
  selectedElementId: string | null,
): CanvasSummary {
  return {
    isOpen,
    selectedElementId,
    strokeCount: elements.filter((element) => element.type === "stroke").length,
    textCount: elements.filter((element) => element.type === "text").length,
  };
}

export function applyCanvasOperations(
  elements: CanvasElement[],
  operations: CanvasOperation[],
): CanvasElement[] {
  return operations.reduce<CanvasElement[]>((current, operation) => {
    if (operation.type === "clear") {
      return [];
    }

    if (operation.type === "highlight") {
      return current.map((element) => ({
        ...element,
        highlighted: element.id === operation.targetId,
      }));
    }

    if (operation.type === "add_text") {
      return [
        ...current,
        {
          id: operation.id ?? crypto.randomUUID(),
          type: "text",
          text: operation.text,
          x: operation.x,
          y: operation.y,
        },
      ];
    }

    return [
      ...current,
      {
        id: operation.id ?? crypto.randomUUID(),
        type: "stroke",
        points: operation.points,
        color: operation.color ?? "#111827",
        width: operation.width ?? 3,
      },
    ];
  }, elements);
}
