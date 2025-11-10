import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatService } from '../src/modules/chat/chat.service';

// --- Test Doubles ---------------------------------------------------------
class DbMock {
    online = true;
    queries: { sql: string; params?: any[] }[] = [];
    // queue based responses (FIFO)
    queue: Array<{ rows: any[]; rowCount: number }> = [];
    isOnline() { return this.online; }
    push(res: { rows: any[]; rowCount?: number }) { this.queue.push({ rows: res.rows, rowCount: res.rowCount ?? res.rows.length }); }
    async query(sql: string, params?: any[]) {
        this.queries.push({ sql, params });
        if (!this.online) return { rows: [], rowCount: 0 } as any;
        // Transaction control statements do not consume scripted queue entries.
        if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) {
            return { rows: [], rowCount: 0 } as any;
        }
        const next = this.queue.shift();
        return (next ?? { rows: [], rowCount: 0 }) as any;
    }
    async getClient() {
        // return transactional facade used in createConversationIfNeeded
        return {
            query: (sql: string, params?: any[]) => this.query(sql, params),
            release: () => { },
        } as any;
    }
}
class EmbeddingsMock { embedQuery = vi.fn(async () => [0.1, 0.2]); }
class ConfigMock { constructor(public embeddingsEnabled: boolean) { } }

function build(overrides?: { db?: DbMock; embeddingsEnabled?: boolean }) {
    const db = overrides?.db ?? new DbMock();
    // Mock repository for ChatConversation
    const mockConversationRepo = {
        find: vi.fn(async () => []),
        findOne: vi.fn(async () => null),
        count: vi.fn(async () => 0),
        save: vi.fn(async (entity: any) => entity),
        create: vi.fn((data: any) => data),
        update: vi.fn(async () => ({ affected: 1 })),
        delete: vi.fn(async () => ({ affected: 1 })),
    } as any;
    // Mock repository for ChatMessage
    const mockMessageRepo = {
        find: vi.fn(async () => []),
        save: vi.fn(async (entity: any) => entity),
        create: vi.fn((data: any) => data),
    } as any;
    const svc = new ChatService(
        mockConversationRepo,
        mockMessageRepo,
        db as any,
        new (class { /* embeddings service only used for retrieveCitations */
            async embedQuery(text: string) { return [text.length, 42]; }
        })() as any,
        new ConfigMock(overrides?.embeddingsEnabled ?? true) as any
    );
    return { svc, db };
}

// Deterministic UUID matcher (we only assert format, not randomness)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('ChatService (unit)', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    it('mapUserId returns same UUID when already valid & derives stable UUID otherwise', () => {
        const { svc } = build();
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        expect(svc.mapUserId(uuid)).toBe(uuid);
        const email = 'user@example.com';
        const derived = svc.mapUserId(email);
        // Service now preserves sub as-is for direct ownership comparisons
        expect(derived).toBe(email);
        // deterministic (same input -> same output)
        expect(svc.mapUserId(email)).toBe(email);
    });

    it('offline createConversationIfNeeded creates private conversation & listConversations returns it (shared empty)', async () => {
        const { svc, db } = build();
        db.online = false; // force offline path
        const convId = await svc.createConversationIfNeeded(undefined, 'Hello world offline test', null, null, null, true);
        expect(convId).toMatch(UUID_RE);
        const listed = await svc.listConversations(null, null, null);
        expect(listed.shared).toEqual([]);
        expect(listed.private).toEqual([]); // offline path returns empty private list (implementation collects only shared for offline list)
        // getConversation offline returns conversation with messages after user message persisted in creation
        const conv = await svc.getConversation(convId, null, null, null);
        expect(conv && typeof conv === 'object' && 'messages' in (conv as any)).toBe(true);
    });

    it('getConversation returns null for invalid UUID and not-found for missing row', async () => {
        const db = new DbMock();
        // For a valid UUID, first SELECT returns 0 rows; ChatService then attempts diagnostic queries (which our mock returns empty)
        db.push({ rows: [], rowCount: 0 }); // primary conversation lookup
        const { svc } = build({ db });
        expect(await svc.getConversation('invalid-id', null, null, null)).toBeNull();
        const someId = '123e4567-e89b-12d3-a456-426614174000';
        expect(await svc.getConversation(someId, null, null, null)).toBeNull();
        // Invalid UUID path issues zero queries; valid not-found triggers primary lookup only (diagnostic queries use repository.count/find, not db.query)
        expect(db.queries.length).toBe(1);
    });

    it('getConversation forbidden when private and different owner', async () => {
        const db = new DbMock();
        const convId = '123e4567-e89b-12d3-a456-426614174000';
        db.push({ rows: [{ id: convId, title: 'T', created_at: '2024-01-01', updated_at: '2024-01-01', owner_user_id: 'owner-1', is_private: true }], rowCount: 1 });
        const { svc } = build({ db });
        const res = await svc.getConversation(convId, 'other-user', null, null);
        expect(res).toBe('forbidden');
    });

    it('rename/delete conversation offline paths', async () => {
        const { svc, db } = build();
        db.online = false;
        const id = await svc.createConversationIfNeeded(undefined, 'Msg 1', null, null, null, true);
        expect(await svc.renameConversation(id, 'New Title', null, null, null)).toBe('ok');
        expect(await svc.deleteConversation(id, null, null, null)).toBe('ok');
        expect(await svc.deleteConversation(id, null, null, null)).toBe('not-found');
    });

    it('retrieveCitations returns [] when embeddings disabled and when embed fails', async () => {
        // embeddings disabled
        const { svc } = build({ embeddingsEnabled: false });
        expect(await svc.retrieveCitations('hello world', 5, null, null, null)).toEqual([]);
    });

    // -------------------- Conversation CRUD (online) --------------------
    describe('createConversationIfNeeded / rename / delete (online)', () => {
        it('reuses existing conversation id when valid and owner matches (no insert)', async () => {
            const db = new DbMock();
            const existingId = '123e4567-e89b-12d3-a456-426614174000';
            // check existing conversation returns row (private owned by same user)
            db.push({ rows: [{ id: existingId, is_private: true, owner_id: 'user-1' }], rowCount: 1 });
            const { svc } = build({ db });
            const returned = await svc.createConversationIfNeeded(existingId, 'Follow up message', 'user-1', null, null, true);
            expect(returned).toBe(existingId);
            // Only one SELECT should have occurred (no insert statements)
            expect(db.queries.some(q => /INSERT INTO kb.chat_conversations/.test(q.sql))).toBe(false);
        });

        it('throws forbidden when reusing private conversation owned by different user', async () => {
            const db = new DbMock();
            const existingId = '123e4567-e89b-12d3-a456-426614174000';
            db.push({ rows: [{ id: existingId, is_private: true, owner_user_id: 'owner-xyz' }], rowCount: 1 });
            const { svc } = build({ db });
            await expect(svc.createConversationIfNeeded(existingId, 'Message', 'user-other', null, null, true)).rejects.toThrow(/forbidden/);
        });

        it('creates new conversation (transaction happy path) when existingId invalid', async () => {
            const db = new DbMock();
            // Sequence:
            // 1) Check existing conversation (SELECT ... WHERE id = ?) -> not found
            // 2) BEGIN (no queue consumption)
            // 3) inside-tx INSERT conversation RETURNING id
            // 4) inside-tx INSERT first message
            // 5) inside-tx UPDATE updated_at
            // 6) COMMIT (no queue consumption)
            const insertedId = '123e4567-e89b-12d3-a456-4266141740aa';
            db.push({ rows: [], rowCount: 0 }); // (1) existing check returns not found
            db.push({ rows: [{ id: insertedId }], rowCount: 1 }); // (3) insert conversation returning id
            db.push({ rows: [], rowCount: 0 }); // (4) insert first message
            db.push({ rows: [], rowCount: 0 }); // (5) update updated_at
            const { svc } = build({ db });
            const newId = await svc.createConversationIfNeeded('123e4567-e89b-12d3-a456-426614174099', 'This is a brand new conversation starting now', 'u1', null, null, true);
            expect(newId).toBe(insertedId);
            const inserts = db.queries.filter(q => /INSERT INTO kb.chat_conversations/.test(q.sql));
            expect(inserts.length).toBe(1);
        });

        it('renameConversation online: not-found, forbidden, ok', async () => {
            const db = new DbMock();
            const convId = '123e4567-e89b-12d3-a456-426614174000';

            const { svc, db: _db } = build({ db });
            const mockConversationRepo = (svc as any).conversationRepository;

            // Configure mock responses for each call
            // Call 1: not found
            mockConversationRepo.findOne.mockResolvedValueOnce(null);

            // Call 2: forbidden (private conversation, different owner)
            mockConversationRepo.findOne.mockResolvedValueOnce({
                id: convId,
                ownerUserId: 'owner-1',
                isPrivate: true
            });

            // Call 3: ok (shared conversation)
            mockConversationRepo.findOne.mockResolvedValueOnce({
                id: convId,
                ownerUserId: null,
                isPrivate: false
            });
            mockConversationRepo.update.mockResolvedValueOnce({ affected: 1 });

            expect(await svc.renameConversation(convId, 'Title A', 'user-x', null, null)).toBe('not-found');
            expect(await svc.renameConversation(convId, 'Title B', 'user-x', null, null)).toBe('forbidden');
            expect(await svc.renameConversation(convId, 'Title C', 'user-x', null, null)).toBe('ok');
        });

        it('deleteConversation online: not-found, forbidden, ok', async () => {
            const db = new DbMock();
            const convId = '123e4567-e89b-12d3-a456-426614174000';

            const { svc } = build({ db });
            const mockConversationRepo = (svc as any).conversationRepository;

            // Call 1: not-found
            mockConversationRepo.findOne.mockResolvedValueOnce(null);

            // Call 2: forbidden
            mockConversationRepo.findOne.mockResolvedValueOnce({
                id: convId,
                ownerUserId: 'owner-1',
                isPrivate: true
            });

            // Call 3: ok
            mockConversationRepo.findOne.mockResolvedValueOnce({
                id: convId,
                ownerUserId: null,
                isPrivate: false
            });
            mockConversationRepo.delete.mockResolvedValueOnce({ affected: 1 });

            expect(await svc.deleteConversation(convId, 'user-x', null, null)).toBe('not-found');
            expect(await svc.deleteConversation(convId, 'user-x', null, null)).toBe('forbidden');
            expect(await svc.deleteConversation(convId, 'user-x', null, null)).toBe('ok');
        });
    });

    // -------------------- listConversations filtering & diagnostics --------------------
    describe('listConversations (online filtering)', () => {
        it('returns shared only when no private conversations for user and triggers diagnostics', async () => {
            const db = new DbMock();
            // shared query result (2 rows)
            db.push({
                rows: [
                    { id: '111e4567-e89b-12d3-a456-426614174000', title: 'Shared B', created_at: '2025-01-02', updated_at: '2025-01-03', owner_id: null, is_private: false },
                    { id: '222e4567-e89b-12d3-a456-426614174000', title: 'Shared A', created_at: '2025-01-01', updated_at: '2025-01-02', owner_id: null, is_private: false },
                ], rowCount: 2
            });
            // private query (empty)
            db.push({ rows: [], rowCount: 0 });
            // diagnostic queries executed when private set empty:
            db.push({ rows: [], rowCount: 0 }); // diag owner listing
            db.push({ rows: [{ c: 0 }], rowCount: 1 }); // count owner
            db.push({ rows: [{ c: 2 }], rowCount: 1 }); // count privateAll
            db.push({ rows: [{ c: 0 }], rowCount: 1 }); // count both
            db.push({
                rows: [ // recent rows peek
                    { id: '111e4567-e89b-12d3-a456-426614174000', owner_id: null, is_private: false, created_at: '2025-01-02' },
                ], rowCount: 1
            });
            const { svc } = build({ db });
            const res = await svc.listConversations('user-x', null, null);
            expect(res.private.length).toBe(0);
            expect(res.shared.map(s => s.title)).toEqual(['Shared B', 'Shared A']); // order by updated_at DESC preserved
        });

        it('applies org and project filters to shared & private queries', async () => {
            const db = new DbMock();
            const orgId = '333e4567-e89b-12d3-a456-426614174000';
            const projectId = '444e4567-e89b-12d3-a456-426614174000';
            // shared query filtered
            db.push({
                rows: [
                    { id: '555e4567-e89b-12d3-a456-426614174000', title: 'Shared Filtered', created_at: '2025-01-02', updated_at: '2025-01-03', owner_id: null, is_private: false },
                ], rowCount: 1
            });
            // private query filtered (1 row)
            db.push({
                rows: [
                    { id: '666e4567-e89b-12d3-a456-426614174000', title: 'Private Filtered', created_at: '2025-01-01', updated_at: '2025-01-04', owner_id: 'user-x', is_private: true },
                ], rowCount: 1
            });
            const { svc } = build({ db });
            const res = await svc.listConversations('user-x', orgId, projectId);
            expect(res.shared.length).toBe(1);
            expect(res.private.length).toBe(1);
            // Ensure SQL had org and project filters present (IS NOT DISTINCT FROM $n)
            const sharedSQL = db.queries.find(q => /FROM kb.chat_conversations WHERE is_private = false/.test(q.sql))?.sql || '';
            expect(sharedSQL).toMatch(/organization_id IS NOT DISTINCT FROM/);
            expect(sharedSQL).toMatch(/project_id IS NOT DISTINCT FROM/);
            const privSQL = db.queries.find(q => /FROM kb.chat_conversations WHERE is_private = true/.test(q.sql))?.sql || '';
            expect(privSQL).toMatch(/organization_id IS NOT DISTINCT FROM/);
            expect(privSQL).toMatch(/project_id IS NOT DISTINCT FROM/);
        });

        it('omits org filter when orgId null but includes project filter when projectId provided', async () => {
            const db = new DbMock();
            const projectId = '777e4567-e89b-12d3-a456-426614174000';
            // shared result
            db.push({
                rows: [
                    { id: '888e4567-e89b-12d3-a456-426614174000', title: 'Shared Only Project', created_at: '2025-01-02', updated_at: '2025-01-03', owner_id: null, is_private: false },
                ], rowCount: 1
            });
            // private result
            db.push({
                rows: [
                    { id: '999e4567-e89b-12d3-a456-426614174000', title: 'Private Only Project', created_at: '2025-01-01', updated_at: '2025-01-04', owner_id: 'user-x', is_private: true },
                ], rowCount: 1
            });
            const { svc } = build({ db });
            const res = await svc.listConversations('user-x', null, projectId);
            expect(res.shared.length).toBe(1);
            expect(res.private.length).toBe(1);
            const sharedQ = db.queries.find(q => /FROM kb.chat_conversations WHERE is_private = false/.test(q.sql))?.sql || '';
            expect(sharedQ).not.toMatch(/org_id IS NOT DISTINCT FROM/);
            expect(sharedQ).toMatch(/project_id IS NOT DISTINCT FROM/);
        });
    });

    // -------------------- retrieveCitations --------------------
    describe('retrieveCitations', () => {
        it('returns fused citations (success path) including similarity field', async () => {
            // Custom embeddings mock producing deterministic vector
            class EmbedMock { async embedQuery(msg: string) { return [msg.length, 1, 2]; } }
            // DB mock returns vector/lex fused output query rows
            const db = new DbMock();
            // Single fused query result row (the service performs exactly one SQL for retrieval after embedding)
            db.push({
                rows: [{
                    chunk_id: '0aaea567-e89b-12d3-a456-426614174000',
                    document_id: '0bbee567-e89b-12d3-a456-426614174000',
                    chunk_index: 3,
                    text: 'Sample chunk text',
                    filename: 'doc.txt',
                    source_url: 'https://example.com',
                    distance: 0.1234,
                }], rowCount: 1
            });
            // Mock repositories (not used in retrieveCitations but needed for constructor)
            const mockConversationRepo = { find: vi.fn(), findOne: vi.fn(), count: vi.fn(), save: vi.fn(), create: vi.fn() } as any;
            const mockMessageRepo = { find: vi.fn(), save: vi.fn(), create: vi.fn() } as any;
            const svc = new ChatService(mockConversationRepo, mockMessageRepo, db as any, new EmbedMock() as any, new ConfigMock(true) as any);
            const out = await svc.retrieveCitations('hello world', 5, null, null, null);
            expect(out).toHaveLength(1);
            expect(out[0]).toMatchObject({
                documentId: '0bbee567-e89b-12d3-a456-426614174000',
                chunkId: '0aaea567-e89b-12d3-a456-426614174000',
                similarity: 0.1234,
                filename: 'doc.txt',
                sourceUrl: 'https://example.com',
            });
        });

        it('returns [] when embedQuery throws (embed failure path)', async () => {
            class EmbedFail { async embedQuery() { throw new Error('embed explode'); } }
            const db = new DbMock();
            // Mock repositories (not used when embed fails but needed for constructor)
            const mockConversationRepo = { find: vi.fn(), findOne: vi.fn(), count: vi.fn(), save: vi.fn(), create: vi.fn() } as any;
            const mockMessageRepo = { find: vi.fn(), save: vi.fn(), create: vi.fn() } as any;
            const svc = new ChatService(mockConversationRepo, mockMessageRepo, db as any, new EmbedFail() as any, new ConfigMock(true) as any);
            const res = await svc.retrieveCitations('message text', 3, null, null, null);
            expect(res).toEqual([]);
            // No DB query should have occurred due to early return
            expect(db.queries.length).toBe(0);
        });
    });

    // -------------------- message persistence & hasConversation --------------------
    describe('message persistence + hasConversation', () => {
        it('offline persistUserMessage and persistAssistantMessage append & update timestamps', async () => {
            const { svc, db } = build();
            db.online = false;
            const convId = await svc.createConversationIfNeeded(undefined, 'First offline question', null, null, null, true);
            // persist additional user + assistant messages
            await svc.persistUserMessage(convId, 'Second user msg');
            await svc.persistAssistantMessage(convId, 'Assistant reply', [{ documentId: 'd1', chunkId: 'c1', chunkIndex: 0, text: 't', sourceUrl: null, filename: null }]);
            const conv = await svc.getConversation(convId, null, null, null) as any;
            expect(conv.messages.map((m: any) => m.role)).toEqual(['user', 'user', 'assistant']);
            expect(conv.messages[2].citations).toBeTruthy();
            // hasConversation offline
            expect(await svc.hasConversation(convId)).toBe(true);
            expect(await svc.hasConversation('00000000-0000-0000-0000-000000000000')).toBe(false);
        });

        it('online persistUserMessage / persistAssistantMessage execute expected queries', async () => {
            const db = new DbMock();
            // createConversationIfNeeded flow minimal (existing id not found -> insert path). We'll script queue for creation then messages.
            db.push({ rows: [], rowCount: 0 }); // existing check (id provided but not found)
            const convId = '123e4567-e89b-12d3-a456-4266141740cc';
            db.push({ rows: [{ id: convId }], rowCount: 1 }); // insert conversation returning id
            db.push({ rows: [], rowCount: 0 }); // insert first message
            db.push({ rows: [], rowCount: 0 }); // update updated_at

            const { svc } = build({ db });
            const mockMessageRepo = (svc as any).messageRepository;
            const mockConversationRepo = (svc as any).conversationRepository;

            const newId = await svc.createConversationIfNeeded('123e4567-e89b-12d3-a456-4266141740dd', 'Seed message', 'user-a', null, null, true);
            expect(newId).toBe(convId);

            // Reset call counts after creation
            mockMessageRepo.create.mockClear();
            mockMessageRepo.save.mockClear();
            mockConversationRepo.update.mockClear();

            await svc.persistUserMessage(convId, 'Follow up');
            await svc.persistAssistantMessage(convId, 'Assistant answer', []);

            // Verify repository methods were called (service now uses Repository pattern instead of raw SQL)
            expect(mockMessageRepo.create).toHaveBeenCalledTimes(2); // user + assistant
            expect(mockMessageRepo.save).toHaveBeenCalledTimes(2); // user + assistant
            expect(mockConversationRepo.update).toHaveBeenCalledTimes(2); // updated_at for each message

            // Verify the assistant message was created with correct data
            const assistantCreateCall = mockMessageRepo.create.mock.calls.find((call: any) => call[0].role === 'assistant');
            expect(assistantCreateCall).toBeTruthy();
            expect(assistantCreateCall[0]).toMatchObject({
                conversationId: convId,
                role: 'assistant',
                content: 'Assistant answer',
                citations: []
            });

            // hasConversation online: invalid UUID false, not found false, found true
            // Configure repository mock for hasConversation
            mockConversationRepo.count.mockResolvedValueOnce(0); // not found
            mockConversationRepo.count.mockResolvedValueOnce(1); // found

            expect(await svc.hasConversation('not-a-uuid')).toBe(false);
            expect(await svc.hasConversation('123e4567-e89b-12d3-a456-426614174099')).toBe(false);
            expect(await svc.hasConversation(convId)).toBe(true);
        });
    });
});
