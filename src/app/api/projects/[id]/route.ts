import { NextResponse } from "next/server";

import { getProjectById, listProjectSources } from "@/lib/db/repositories/projects";
import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { canAccessProject } from "@/lib/security/resource-access";

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

    const sources = listProjectSources(project.id).map((source) => ({
      id: source.id,
      title: source.title,
      sourceType: source.sourceType,
      contentPreview: source.content.slice(0, 240),
    }));

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        instructions: project.instructions,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      sources,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load project" },
      { status: 500 },
    );
  }
}
