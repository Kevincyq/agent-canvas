import { getConversationById } from "@/lib/db/repositories/conversations";
import { getArtifactById, getProjectById } from "@/lib/db/repositories/projects";
import { SEED_COLLECTION_IDS } from "@/lib/services/mock/fixtures";

export type ResourcePrincipal = {
  userId: string;
  tenantId: string;
};

const SEED_PROJECT_IDS = new Set<string>(SEED_COLLECTION_IDS);

export function canAccessConversation(
  conversationId: string,
  principal: ResourcePrincipal,
): boolean {
  const conversation = getConversationById(conversationId);
  return Boolean(
    conversation &&
      conversation.userId === principal.userId &&
      conversation.tenantId === principal.tenantId,
  );
}

export function canAccessProject(
  projectId: string,
  principal: ResourcePrincipal,
): boolean {
  if (SEED_PROJECT_IDS.has(projectId)) {
    return true;
  }
  const project = getProjectById(projectId);
  return Boolean(
    project &&
      project.userId === principal.userId &&
      project.tenantId === principal.tenantId,
  );
}

export function canAccessArtifact(
  artifactId: string,
  principal: ResourcePrincipal,
): boolean {
  const artifact = getArtifactById(artifactId);
  return Boolean(
    artifact &&
      canAccessConversation(artifact.conversationId, principal) &&
      (!artifact.projectId || canAccessProject(artifact.projectId, principal)),
  );
}
