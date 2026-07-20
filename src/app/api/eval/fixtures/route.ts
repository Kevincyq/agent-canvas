import { NextResponse } from "next/server";

import { listEvalFixtures, getEvalFixture } from "@/lib/eval/p0-fixtures";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (id) {
      const fixture = getEvalFixture(id);
      if (!fixture) {
        return NextResponse.json({ message: `Eval fixture not found: ${id}` }, { status: 404 });
      }
      return NextResponse.json({ fixture });
    }
    return NextResponse.json({ fixtures: listEvalFixtures() });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to list eval fixtures" },
      { status: 500 },
    );
  }
}
