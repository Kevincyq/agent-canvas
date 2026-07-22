import type { ServiceAdapters } from "@/lib/services/adapters";
import { createMockServiceAdapters } from "@/lib/services/mock";
import { searchWeb } from "@/lib/services/web-search";

/**
 * Product adapter composition:
 * - Web Search is real and fails closed when unconfigured.
 * - Meeting/PKB/calendar-like supporting systems remain deterministic mocks.
 */
export function createServiceAdapters(): ServiceAdapters {
  return {
    ...createMockServiceAdapters(),
    searchWeb,
  };
}
