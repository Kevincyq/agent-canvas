import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";
import { getProjectById, listProjectSources } from "@/lib/db/repositories/projects";
import { SEED_PROJECT } from "@/lib/services/mock/fixtures";

export const runtime = "nodejs";

export async function GET() {
  try {
    getDb(); // ensure migrations + seed
    const project = getProjectById(SEED_PROJECT.id);
    if (!project) {
      return NextResponse.json({ message: "Seed project missing" }, { status: 500 });
    }
    const sources = listProjectSources(project.id).map((source) => ({
      id: source.id,
      title: source.title,
      sourceType: source.sourceType,
    }));
    return NextResponse.json({
      projects: [
        {
          id: project.id,
          name: project.name,
          instructions: project.instructions,
          sources,
        },
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to list projects" },
      { status: 500 },
    );
  }
}
