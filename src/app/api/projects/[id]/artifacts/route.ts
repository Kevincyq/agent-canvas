import { NextResponse } from "next/server";

import {
  getProjectById,
  listArtifactsByProject,
} from "@/lib/db/repositories/projects";
import { resolvePortalUserContext } from "@/lib/portal/user-context";
import {
  canAccessConversation,
  canAccessProject,
} from "@/lib/security/resource-access";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const project = getProjectById(id);
    if (!project) {
      return NextResponse.json({ message: `Project not found: ${id}` }, { status: 404 });
    }
    const portal = resolvePortalUserContext({ headers: request.headers });
    if (!canAccessProject(id, portal)) {
      return NextResponse.json({ message: "Project access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "50");
    const artifacts = listArtifactsByProject(
      id,
      Number.isFinite(limit) ? limit : 50,
    )
      .filter((artifact) => canAccessConversation(artifact.conversationId, portal))
      .map((artifact) => ({
        id: artifact.id,
        title: artifact.title,
        artifactType: artifact.artifactType,
        conversationId: artifact.conversationId,
        createdAt: artifact.createdAt,
        updatedAt: artifact.updatedAt,
      }));

    return NextResponse.json({ projectId: id, artifacts });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to list artifacts" },
      { status: 500 },
    );
  }
}
