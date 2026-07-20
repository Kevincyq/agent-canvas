import {
  createConversation,
  ensureConversation,
  getConversationById,
  listConversations,
  updateConversation,
} from "@/lib/db/repositories/conversations";
import {
  appendConversationMessage,
  listConversationChatMessages,
} from "@/lib/db/repositories/messages";
import type { CreateConversationRequest, PatchConversationRequest } from "@/types/task";

export const conversationTaskStore = {
  create: createConversation,
  ensure: ensureConversation,
  getById: getConversationById,
  list: listConversations,
  update: updateConversation,
  appendMessage: appendConversationMessage,
  listMessages: listConversationChatMessages,
};

export type { CreateConversationRequest, PatchConversationRequest };
