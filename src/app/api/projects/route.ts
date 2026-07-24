import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db/client";
import {
  createProject,
  listProjectSources,
  listProjects,
} from "@/lib/db/repositories/projects";
import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { SEED_COLLECTION_IDS } from "@/lib/services/mock/fixtures";

export const runtime = "nodejs";

/** Wireframe nav order for preset collections, then user-created. */
const SEED_NAV_ORDER = [
  "proj_business_001",
  "proj_technology_001",
  "proj_study_001",
  "proj_life_001",
  "proj_art_001",
] as const;

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(120),
  instructions: z.string().max(2000).optional(),
  userId: z.string().min(1).max(100).optional(),
});

function sortCollectionsForNav<T extends { id: string }>(projects: T[]): T[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const ordered: T[] = [];

  for (const id of SEED_NAV_ORDER) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }

  for (const project of projects) {
    if (byId.has(project.id)) {
      ordered.push(project);
      byId.delete(project.id);
    }
  }

  return ordered;
}

export async function GET(request: Request) {
  try {
    getDb();
    const portal = resolvePortalUserContext({ headers: request.headers });
    const projects = sortCollectionsForNav(
      listProjects().filter(
        (project) =>
          SEED_COLLECTION_IDS.includes(project.id) ||
          (project.userId === portal.userId && project.tenantId === portal.tenantId),
      ),
    ).map((project) => {
      const sources = listProjectSources(project.id).map((source) => ({
        id: source.id,
        title: source.title,
        sourceType: source.sourceType,
      }));
      return {
        id: project.id,
        name: project.name,
        instructions: project.instructions,
        sources,
        isSeed: SEED_COLLECTION_IDS.includes(project.id),
      };
    });
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to list projects" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    getDb();
    const body = (await request.json()) as unknown;
    const payload = CreateProjectSchema.parse(body);
    const portal = resolvePortalUserContext({
      headers: request.headers,
      bodyUserId: payload.userId,
    });
    const project = createProject({
      name: payload.name,
      instructions: payload.instructions,
      userId: portal.userId,
      tenantId: portal.tenantId,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create project" },
      { status: 400 },
    );
  }
}
