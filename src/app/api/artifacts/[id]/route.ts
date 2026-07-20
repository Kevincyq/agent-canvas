import { NextResponse } from "next/server";

import { getArtifactById } from "@/lib/db/repositories/projects";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const artifact = getArtifactById(id);
    if (!artifact) {
      return NextResponse.json({ message: `Artifact not found: ${id}` }, { status: 404 });
    }
    return NextResponse.json({ artifact });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load artifact" },
      { status: 500 },
    );
  }
}
