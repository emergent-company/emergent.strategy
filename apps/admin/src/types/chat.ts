export type Role = "user" | "assistant" | "system";

export interface Citation {
    documentId: string;
    chunkId: string;
    chunkIndex: number;
    text: string;
    sourceUrl?: string | null;
    filename?: string | null;
    similarity?: number;
}

export interface Message {
    id: string;
    role: Role;
    content: string;
    createdAt: string; // ISO
    citations?: Citation[];
}

export interface Conversation {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: Message[];
    ownerUserId?: string; // who started the chat (owner)
    isPrivate?: boolean; // true => only owner can see; false/default => visible to all users
}

export interface ChatRequest {
    message: string;
    conversationId?: string;
    history?: Array<Pick<Message, "role" | "content">>;
    topK?: number; // default 5
    documentIds?: string[]; // optional filters
    stream?: boolean; // default true
    isPrivate?: boolean; // when creating a new conversation from the first send
}

export interface ChatChunk {
    type: "token" | "done" | "error" | "meta" | "mcp_tool";
    token?: string;
    messageId?: string;
    citations?: Citation[];
    conversationId?: string;
    error?: string;
    // MCP Tool event fields
    tool?: string;
    status?: "started" | "completed" | "error";
    result?: any;
    args?: any;
}
