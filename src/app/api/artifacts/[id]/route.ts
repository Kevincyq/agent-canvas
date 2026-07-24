import { NextResponse } from "next/server";

import { getArtifactById } from "@/lib/db/repositories/projects";
import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { canAccessArtifact } from "@/lib/security/resource-access";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const artifact = getArtifactById(id);
    if (!artifact) {
      return NextResponse.json({ message: `Artifact not found: ${id}` }, { status: 404 });
    }
    const portal = resolvePortalUserContext({ headers: request.headers });
    if (!canAccessArtifact(id, portal)) {
      return NextResponse.json({ message: "Artifact access denied" }, { status: 403 });
    }
    return NextResponse.json({ artifact });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load artifact" },
      { status: 500 },
    );
  }
}
