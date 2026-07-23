"use client";

import { useMemo, useState } from "react";
import type { ConversationTask } from "@/types/task";

export type ProjectNavItem = {
  id: string;
  name: string;
};

type ProjectNavProps = {
  projects: ProjectNavItem[];
  recent: ConversationTask[];
  activeConversationId: string | null;
  activeProjectId: string | null;
  busy?: boolean;
  onNewChat: (projectId?: string | null) => void;
  onNewProject: () => void;
  onSelectConversation: (conversationId: string) => void;
  onSelectProject: (projectId: string) => void;
  onRequestClose?: () => void;
};

const PREVIEW_LIMIT = 5;

function statusLabel(status: ConversationTask["status"]): string | null {
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
      return null;
  }
}

function TaskButton({
  conversation,
  active,
  busy,
  nested,
  onSelect,
}: {
  conversation: ConversationTask;
  active: boolean;
  busy: boolean;
  nested?: boolean;
  onSelect: () => void;
}) {
  const status = statusLabel(conversation.status);
  return (
    <button
      type="button"
      className={[
        "project-nav-item",
        nested ? "project-nav-item-nested" : "",
        active ? "active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={busy}
      onClick={onSelect}
    >
      <span>{conversation.title}</span>
      {status ? <small>{status}</small> : null}
    </button>
  );
}

function TaskList({
  items,
  expanded,
  onToggleExpand,
  activeConversationId,
  busy,
  nested,
  onSelectConversation,
}: {
  items: ConversationTask[];
  expanded: boolean;
  onToggleExpand: () => void;
  activeConversationId: string | null;
  busy: boolean;
  nested?: boolean;
  onSelectConversation: (id: string) => void;
}) {
  if (items.length === 0) {
    if (nested) {
      return null;
    }
    return (
      <ul>
        <li className="project-nav-empty">暂无任务</li>
      </ul>
    );
  }

  const visible = expanded ? items : items.slice(0, PREVIEW_LIMIT);
  const hiddenCount = items.length - visible.length;

  return (
    <ul className={nested ? "project-nav-chat-list" : undefined}>
      {visible.map((conversation) => (
        <li key={conversation.id}>
          <TaskButton
            conversation={conversation}
            active={activeConversationId === conversation.id}
            busy={busy}
            nested={nested}
            onSelect={() => onSelectConversation(conversation.id)}
          />
        </li>
      ))}
      {hiddenCount > 0 ? (
        <li>
          <button
            type="button"
            className="project-nav-expand"
            disabled={busy}
            onClick={onToggleExpand}
          >
            展开显示 · {hiddenCount}
          </button>
        </li>
      ) : null}
      {expanded && items.length > PREVIEW_LIMIT ? (
        <li>
          <button
            type="button"
            className="project-nav-expand"
            disabled={busy}
            onClick={onToggleExpand}
          >
            收起
          </button>
        </li>
      ) : null}
    </ul>
  );
}

export function ProjectNav({
  projects,
  recent,
  activeConversationId,
  activeProjectId,
  busy = false,
  onNewChat,
  onNewProject,
  onSelectConversation,
  onSelectProject,
  onRequestClose,
}: ProjectNavProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>({});

  const tasksByCollection = useMemo(() => {
    const map = new Map<string, ConversationTask[]>();
    for (const project of projects) {
      map.set(project.id, []);
    }
    const unassigned: ConversationTask[] = [];
    for (const conversation of recent) {
      if (conversation.projectId && map.has(conversation.projectId)) {
        map.get(conversation.projectId)!.push(conversation);
      } else if (conversation.projectId) {
        unassigned.push(conversation);
      } else {
        unassigned.push(conversation);
      }
    }
    return { map, unassigned };
  }, [projects, recent]);

  function toggleCollapsed(projectId: string) {
    setCollapsed((current) => ({
      ...current,
      [projectId]: !current[projectId],
    }));
  }

  function toggleListExpand(key: string) {
    setExpandedLists((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  const closeAfter = (action: () => void) => {
    action();
    onRequestClose?.();
  };

  return (
    <aside className="project-nav" aria-label="AskAI 导航">
      <div className="project-nav-brand">
        <p className="project-nav-brand-mark">
          Ask<span>AI</span>
        </p>
        <p className="project-nav-brand-sub">Agent</p>
      </div>

      <div className="project-nav-actions">
        <button
          type="button"
          className="project-nav-new"
          disabled={busy}
          title="创建不属于任何 Collection 的新任务"
          onClick={() => closeAfter(() => onNewChat(null))}
        >
          <span className="project-nav-new-icon" aria-hidden>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
              <path
                d="M3.5 12.5 11.2 4.8l1.5 1.5-7.7 7.7H3.5v-1.5Zm8.4-9.1.8-.8a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4l-.8.8-2-2Z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          新任务
        </button>
      </div>

      <section className="project-nav-section">
        <div className="project-nav-section-header">
          <h2>Collection</h2>
          <button
            type="button"
            className="project-nav-section-add"
            disabled={busy}
            title="新建 Collection"
            onClick={() => closeAfter(onNewProject)}
          >
            +
          </button>
        </div>
        <div className="project-nav-folders">
          {projects.length === 0 ? (
            <p className="project-nav-empty">暂无 Collection</p>
          ) : (
            projects.map((project) => {
              const tasks = tasksByCollection.map.get(project.id) ?? [];
              const isCollapsed = Boolean(collapsed[project.id]);
              const isActive = activeProjectId === project.id;
              return (
                <div
                  key={project.id}
                  className={
                    isActive ? "project-nav-folder active" : "project-nav-folder"
                  }
                >
                  <div className="project-nav-folder-header">
                    <button
                      type="button"
                      className="project-nav-folder-toggle"
                      disabled={busy}
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleCollapsed(project.id)}
                      title={isCollapsed ? "展开" : "收起"}
                    >
                      {isCollapsed ? "▸" : "▾"}
                    </button>
                    <button
                      type="button"
                      className="project-nav-folder-title"
                      disabled={busy}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <span>{project.name}</span>
                    </button>
                    <button
                      type="button"
                      className="project-nav-folder-new"
                      disabled={busy}
                      title={`在 ${project.name} 下新建任务`}
                      onClick={() => closeAfter(() => onNewChat(project.id))}
                    >
                      +
                    </button>
                  </div>
                  {!isCollapsed ? (
                    <TaskList
                      items={tasks}
                      expanded={Boolean(expandedLists[project.id])}
                      onToggleExpand={() => toggleListExpand(project.id)}
                      activeConversationId={activeConversationId}
                      busy={busy}
                      nested
                      onSelectConversation={(id) =>
                        closeAfter(() => onSelectConversation(id))
                      }
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="project-nav-section">
        <div className="project-nav-section-header">
          <h2>任务</h2>
        </div>
        <TaskList
          items={tasksByCollection.unassigned}
          expanded={Boolean(expandedLists.__unassigned)}
          onToggleExpand={() => toggleListExpand("__unassigned")}
          activeConversationId={activeConversationId}
          busy={busy}
          onSelectConversation={(id) => closeAfter(() => onSelectConversation(id))}
        />
      </section>
    </aside>
  );
}
