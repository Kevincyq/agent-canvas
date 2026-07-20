"use client";

import type { ConversationTask } from "@/types/task";

export type ProjectNavItem = {
  id: string;
  name: string;
  sourceCount?: number;
};

type ProjectNavProps = {
  projects: ProjectNavItem[];
  recent: ConversationTask[];
  activeConversationId: string | null;
  activeProjectId: string | null;
  busy?: boolean;
  onNewChat: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSelectProject: (projectId: string) => void;
};

function statusLabel(status: ConversationTask["status"]): string {
  switch (status) {
    case "waiting_for_approval":
      return "待确认";
    case "waiting_for_input":
      return "待输入";
    case "running":
      return "运行中";
    case "failed":
      return "失败";
    case "completed":
      return "完成";
    default:
      return "就绪";
  }
}

export function ProjectNav({
  projects,
  recent,
  activeConversationId,
  activeProjectId,
  busy = false,
  onNewChat,
  onSelectConversation,
  onSelectProject,
}: ProjectNavProps) {
  return (
    <aside className="project-nav" aria-label="项目与最近对话">
      <button
        type="button"
        className="project-nav-new"
        disabled={busy}
        onClick={onNewChat}
      >
        New Chat
      </button>

      <section className="project-nav-section">
        <h2>Projects</h2>
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className={
                  activeProjectId === project.id
                    ? "project-nav-item active"
                    : "project-nav-item"
                }
                disabled={busy}
                onClick={() => onSelectProject(project.id)}
              >
                <span>{project.name}</span>
                {typeof project.sourceCount === "number" ? (
                  <small>{project.sourceCount} sources</small>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="project-nav-section">
        <h2>Recent</h2>
        <ul>
          {recent.length === 0 ? (
            <li className="project-nav-empty">暂无对话</li>
          ) : (
            recent.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={
                    activeConversationId === conversation.id
                      ? "project-nav-item active"
                      : "project-nav-item"
                  }
                  disabled={busy}
                  onClick={() => onSelectConversation(conversation.id)}
                >
                  <span>{conversation.title}</span>
                  <small>{statusLabel(conversation.status)}</small>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </aside>
  );
}
