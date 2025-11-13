import { HttpClient } from './http-client';

export async function createConversation(client: HttpClient, message: string, projectId: string) {
    return client.post<{ conversationId: string; title: string }>(`/chat/conversations`, { message, isPrivate: true }, {
        headers: { 'x-project-id': projectId },
    } as any);
}

export async function streamConversation(client: HttpClient, id: string, projectId: string) {
    const frames: any[] = [];
    await client.stream(`/chat/${id}/stream`, (e) => frames.push(e), { headers: { 'x-project-id': projectId } });
    return frames;
}
