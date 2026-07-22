import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";

export type MockCalendarEvent = {
  eventId: string;
  title: string;
  startAt: string;
  endAt: string;
  notes?: string;
  sourceId?: string;
  calendarName: "Tablet 日历";
  written: true;
  provider: "mock_tablet_calendar";
};

export function insertMockCalendarEvent(input: {
  title: string;
  startAt: string;
  endAt: string;
  notes?: string;
  sourceId?: string;
  idempotencyKey?: string;
}): MockCalendarEvent {
  if (input.idempotencyKey) {
    const existing = getDb()
      .prepare(
        `SELECT id, title, start_at, end_at, notes, source_id
         FROM mock_calendar_events WHERE idempotency_key = ?`,
      )
      .get(input.idempotencyKey) as
      | {
          id: string;
          title: string;
          start_at: string;
          end_at: string;
          notes: string | null;
          source_id: string | null;
        }
      | undefined;
    if (existing) {
      return {
        eventId: existing.id,
        title: existing.title,
        startAt: existing.start_at,
        endAt: existing.end_at,
        notes: existing.notes ?? undefined,
        sourceId: existing.source_id ?? undefined,
        calendarName: "Tablet 日历",
        written: true,
        provider: "mock_tablet_calendar",
      };
    }
  }

  const eventId = `calendar_${randomUUID().slice(0, 8)}`;
  getDb()
    .prepare(
      `INSERT INTO mock_calendar_events (
        id, title, start_at, end_at, notes, source_id, provider, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'mock_tablet_calendar', ?, ?)`,
    )
    .run(
      eventId,
      input.title,
      input.startAt,
      input.endAt,
      input.notes ?? null,
      input.sourceId ?? null,
      input.idempotencyKey ?? null,
      new Date().toISOString(),
    );

  return {
    eventId,
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    notes: input.notes,
    sourceId: input.sourceId,
    calendarName: "Tablet 日历",
    written: true,
    provider: "mock_tablet_calendar",
  };
}
