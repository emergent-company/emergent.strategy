import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { AppConfigService } from '../../common/config/config.service';
import { ChatConversation } from '../../entities/chat-conversation.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import crypto from 'node:crypto';

export interface ChatCitation {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  text: string;
  sourceUrl: string | null;
  filename: string | null;
  similarity?: number;
}

export interface ChatMessageRow {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: any | null;
  created_at: string;
}
export interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  owner_user_id: string | null;
  is_private: boolean;
}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private offlineConvs = new Map<
    string,
    {
      id: string;
      title: string;
      createdAt: string;
      updatedAt: string;
      ownerUserId: string | null;
      isPrivate: boolean;
      messages: {
        id: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
        citations?: any;
        createdAt: string;
      }[];
    }
  >();
  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversationRepository: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingsService,
    private readonly config: AppConfigService
  ) {}

  mapUserId(sub: string | undefined): string | null {
    // Return the sub as-is. The owner_user_id column accepts any string identifier,
    // not just UUIDs. This allows frontend ownership checks to work correctly by
    // comparing user.sub directly with conversation.ownerUserId.
    return sub || null;
  }

  async listConversations(
    userId: string | null,
    orgId: string | null,
    projectId: string | null
  ) {
    if (!this.db.isOnline()) {
      const all = Array.from(this.offlineConvs.values()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      );
      return {
        shared: all
          .filter((c) => !c.isPrivate)
          .map((c) => ({
            id: c.id,
            title: c.title,
            created_at: c.createdAt,
            updated_at: c.updatedAt,
            owner_user_id: c.ownerUserId,
            is_private: c.isPrivate,
          })),
        private: [],
      };
    }
    this.logger.log(
      `[listConversations] userId=${userId} orgId=${orgId} projectId=${projectId}`
    );
    // Use tenant context for RLS enforcement
    const queryFn = async () => {
      // Build dynamic filtering: org is optional, project is optional (but controller may enforce project). When a header is omitted
      // we do NOT filter by that dimension to match documents behavior (org optional; project required at controller level).
      const sharedParams: any[] = [];
      let sharedSQL = `SELECT id, title, created_at, updated_at, owner_user_id, is_private FROM kb.chat_conversations WHERE is_private = false`;
      if (projectId) {
        sharedParams.push(projectId);
        sharedSQL += ` AND project_id IS NOT DISTINCT FROM $${sharedParams.length}`;
      }
      sharedSQL += ' ORDER BY updated_at DESC';
      const shared = await this.db.query<ConversationRow>(
        sharedSQL,
        sharedParams
      );

      let priv: any = { rows: [] as ConversationRow[], rowCount: 0 };
      if (userId) {
        const privParams: any[] = [userId];
        let privSQL = `SELECT id, title, created_at, updated_at, owner_user_id, is_private FROM kb.chat_conversations WHERE is_private = true AND owner_user_id = $1`;
        if (projectId) {
          privParams.push(projectId);
          privSQL += ` AND project_id IS NOT DISTINCT FROM $${privParams.length}`;
        }
        privSQL += ' ORDER BY updated_at DESC';
        priv = await this.db.query<ConversationRow>(privSQL, privParams);
      }

      return { shared, priv };
    };

    // Execute within tenant context for RLS
    const result = projectId
      ? await this.db.runWithTenantContext(projectId, queryFn)
      : await queryFn();

    const { shared, priv } = result;
    const privCount = (priv as any).rowCount ?? priv.rows.length;
    this.logger.log(
      `[listConversations] results shared=${shared.rowCount} private=${privCount}`
    );
    if (priv.rows.length === 0 && userId) {
      // Diagnostic query to see if row exists with different org/project (should not happen, but helps debug)
      const diag = await this.conversationRepository.find({
        where: { ownerUserId: userId },
        select: [
          'id',
          'title',
          'createdAt',
          'updatedAt',
          'ownerUserId',
          'isPrivate',
          'projectId',
        ],
      });
      this.logger.log(
        `[listConversations] diag for owner yields ${diag.length} rows: ${diag
          .map((r) => r.id + ':' + (r.projectId || 'null'))
          .join(',')}`
      );
      // Additional focused diagnostics to isolate filter predicate behavior
      const cOwner = await this.conversationRepository.count({
        where: { ownerUserId: userId },
      });
      const cPrivate = await this.conversationRepository.count({
        where: { isPrivate: true },
      });
      const cBoth = await this.conversationRepository.count({
        where: { isPrivate: true, ownerUserId: userId },
      });
      this.logger.log(
        `[listConversations] counts owner=${cOwner} privateAll=${cPrivate} both=${cBoth}`
      );
      // Peek at recent rows regardless of owner
      const recent = await this.conversationRepository.find({
        select: ['id', 'ownerUserId', 'isPrivate', 'createdAt'],
        order: { createdAt: 'DESC' },
        take: 5,
      });
      this.logger.log(
        `[listConversations] recent head: ${recent
          .map(
            (r) =>
              r.id.substring(0, 8) +
              ' owner=' +
              (r.ownerUserId || 'null') +
              ' priv=' +
              r.isPrivate
          )
          .join(' | ')}`
      );
    }
    return { shared: shared.rows, private: priv.rows };
  }

  async getConversation(
    id: string,
    userId: string | null,
    orgId: string | null,
    projectId: string | null
  ) {
    if (!this.db.isOnline()) {
      const c = this.offlineConvs.get(id);
      if (!c) return null;
      return {
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        ownerUserId: c.ownerUserId,
        isPrivate: c.isPrivate,
        messages: c.messages,
      };
    }
    if (!UUID_RE.test(id)) return null; // reject invalid format
    this.logger.log(
      `[getConversation] id=${id} userId=${userId} orgId=${orgId} projectId=${projectId}`
    );
    const convQ = await this.db.query<ConversationRow>(
      `SELECT id, title, created_at, updated_at, owner_user_id, is_private
             FROM kb.chat_conversations WHERE id = $1`,
      [id]
    );
    this.logger.log(`[getConversation] rowCount=${convQ.rowCount}`);
    if (convQ.rowCount === 0) {
      // Extra diagnostics: check if any conversation rows exist at all (detect wholesale truncation) and recent creation patterns
      try {
        const total = await this.conversationRepository.count();
        const recent = await this.conversationRepository.find({
          select: ['id', 'ownerUserId', 'isPrivate', 'createdAt'],
          order: { createdAt: 'DESC' },
          take: 3,
        });
        this.logger.warn(
          `[getConversation] not-found id=${id} totalConvs=${total} recent=${recent
            .map((r) => r.id.substring(0, 8) + ':' + (r.ownerUserId || 'null'))
            .join(',')}`
        );
      } catch (e) {
        this.logger.warn(
          `[getConversation] diag failure for id=${id}: ${(e as Error).message}`
        );
      }
      return null;
    }
    const conv = convQ.rows[0];
    if (conv.is_private && conv.owner_user_id !== userId) {
      this.logger.warn(
        `[getConversation] forbidden id=${id} owner=${conv.owner_user_id} user=${userId}`
      );
      return 'forbidden';
    }
    const msgsQ = await this.db.query<ChatMessageRow>(
      `SELECT id, role, content, citations, created_at FROM kb.chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    this.logger.log(`[getConversation] messages=${msgsQ.rowCount}`);
    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      ownerUserId: conv.owner_user_id,
      isPrivate: conv.is_private,
      messages: msgsQ.rows.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations || undefined,
        createdAt: m.created_at,
      })),
    };
  }

  async renameConversation(
    id: string,
    title: string,
    userId: string | null,
    orgId: string | null,
    projectId: string | null
  ): Promise<'not-found' | 'forbidden' | 'ok'> {
    if (!this.db.isOnline()) {
      const c = this.offlineConvs.get(id);
      if (!c) return 'not-found';
      c.title = title;
      c.updatedAt = new Date().toISOString();
      return 'ok';
    }

    const conversation = await this.conversationRepository.findOne({
      where: { id },
      select: ['id', 'ownerUserId', 'isPrivate'],
    });

    if (!conversation) return 'not-found';
    if (
      conversation.isPrivate &&
      conversation.ownerUserId &&
      conversation.ownerUserId !== userId
    ) {
      return 'forbidden';
    }

    await this.conversationRepository.update(id, { title });
    return 'ok';
  }

  async deleteConversation(
    id: string,
    userId: string | null,
    orgId: string | null,
    projectId: string | null
  ): Promise<'not-found' | 'forbidden' | 'ok'> {
    if (!this.db.isOnline()) {
      const existed = this.offlineConvs.delete(id);
      return existed ? 'ok' : 'not-found';
    }

    const conversation = await this.conversationRepository.findOne({
      where: { id },
      select: ['id', 'ownerUserId', 'isPrivate'],
    });

    if (!conversation) return 'not-found';
    if (
      conversation.isPrivate &&
      conversation.ownerUserId &&
      conversation.ownerUserId !== userId
    ) {
      return 'forbidden';
    }

    await this.conversationRepository.delete(id);
    return 'ok';
  }

  async createConversationIfNeeded(
    existingId: string | undefined,
    message: string,
    userId: string | null,
    orgId: string | null,
    projectId: string | null,
    isPrivate: boolean
  ): Promise<string> {
    if (!this.db.isOnline()) {
      const id = crypto.randomUUID();
      const owner = userId || crypto.randomUUID();
      const d = new Date();
      const snippet = message.split(/\s+/).slice(0, 8).join(' ');
      const title = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(d.getDate()).padStart(2, '0')} — ${
        snippet || 'New Conversation'
      }`;
      // For offline parity with the online path (which inserts the initial user message inside the transaction),
      // we immediately persist the first user message locally.
      const createdAt = d.toISOString();
      this.offlineConvs.set(id, {
        id,
        title,
        createdAt,
        updatedAt: createdAt,
        ownerUserId: owner,
        isPrivate,
        messages: [
          {
            id: crypto.randomUUID(),
            role: 'user',
            content: message,
            createdAt,
          },
        ],
      });
      return id;
    }
    let convId = existingId && UUID_RE.test(existingId) ? existingId : '';
    if (convId) {
      const check = await this.db.query<{
        id: string;
        is_private: boolean;
        owner_user_id: string | null;
      }>(
        `SELECT id, is_private, owner_user_id FROM kb.chat_conversations WHERE id = $1`,
        [convId]
      );
      if (check.rowCount === 0) convId = '';
      else {
        const c = check.rows[0];
        if (c.is_private && c.owner_user_id && c.owner_user_id !== userId)
          throw new Error('forbidden');
      }
    }
    if (!convId) {
      const d = new Date();
      const snippet = message.split(/\s+/).slice(0, 8).join(' ');
      const title = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(d.getDate()).padStart(2, '0')} — ${
        snippet || 'New Conversation'
      }`;
      const owner = userId || crypto.randomUUID();
      // User profile already exists from auth flow (ensureUserProfile)
      // Use an explicit transaction to insert conversation and initial message atomically
      const client = await this.db.getClient();
      try {
        await client.query('BEGIN');
        const ins = await client.query<{ id: string }>(
          `INSERT INTO kb.chat_conversations (title, owner_user_id, is_private, project_id) VALUES ($1, $2, $3, $4) RETURNING id`,
          [title, owner, isPrivate, projectId]
        );
        convId = ins.rows[0].id;
        await client.query(
          `INSERT INTO kb.chat_messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
          [convId, message]
        );
        await client.query(
          `UPDATE kb.chat_conversations SET updated_at = now() WHERE id = $1`,
          [convId]
        );
        await client.query('COMMIT');
        this.logger.log(
          `[createConversationIfNeeded] inserted id=${convId} owner=${owner} private=${isPrivate} projectId=${projectId}`
        );
      } catch (txErr: any) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw txErr;
      } finally {
        client.release();
      }
    }
    return convId;
  }

  async persistUserMessage(conversationId: string, content: string) {
    if (!this.db.isOnline()) {
      const c = this.offlineConvs.get(conversationId);
      if (c) {
        c.messages.push({
          id: crypto.randomUUID(),
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        });
        c.updatedAt = new Date().toISOString();
      }
      return;
    }

    const message = this.messageRepository.create({
      conversationId,
      role: 'user',
      content,
    });
    await this.messageRepository.save(message);

    // Update conversation timestamp
    await this.conversationRepository.update(conversationId, {
      updatedAt: new Date(),
    });
  }

  async retrieveCitations(
    message: string,
    topK: number,
    orgId: string | null,
    projectId: string | null,
    filterIds: string[] | null
  ): Promise<ChatCitation[]> {
    if (!this.config.embeddingsEnabled) return [];
    let qvec: number[] = [];
    try {
      qvec = await this.embeddings.embedQuery(message);
    } catch (e) {
      this.logger.warn(
        `Embedding failed, returning zero citations: ${(e as Error).message}`
      );
      return [];
    }
    const vecLiteral = '[' + qvec.join(',') + ']';
    const { rows } = await this.db.query<{
      chunk_id: string;
      document_id: string;
      chunk_index: number;
      text: string;
      distance: number | null;
      filename: string | null;
      source_url: string | null;
    }>(
      `WITH params AS (
                SELECT $1::vector AS qvec, websearch_to_tsquery('simple', $6) AS qts, $5::int AS topk
             ), vec AS (
                 SELECT c.id,
                        1.0 / (ROW_NUMBER() OVER (ORDER BY c.embedding <=> (SELECT qvec FROM params)) + 60) AS rrf,
                        (c.embedding <=> (SELECT qvec FROM params)) AS distance
                 FROM kb.chunks c
                 JOIN kb.documents d ON d.id = c.document_id
                 JOIN kb.projects p ON p.id = d.project_id
                 WHERE ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
                   AND (p.organization_id IS NOT DISTINCT FROM $3)
                   AND (d.project_id IS NOT DISTINCT FROM $4)
                 ORDER BY c.embedding <=> (SELECT qvec FROM params)
                 LIMIT (SELECT topk FROM params)
             ), lex AS (
                 SELECT c.id,
                        1.0 / (ROW_NUMBER() OVER (ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC) + 60) AS rrf,
                        NULL::float AS distance
                 FROM kb.chunks c
                 JOIN kb.documents d ON d.id = c.document_id
                 JOIN kb.projects p ON p.id = d.project_id
                 WHERE c.tsv @@ (SELECT qts FROM params)
                   AND ($2::uuid[] IS NULL OR c.document_id = ANY($2::uuid[]))
                   AND (p.organization_id IS NOT DISTINCT FROM $3)
                   AND (d.project_id IS NOT DISTINCT FROM $4)
                 ORDER BY ts_rank(c.tsv, (SELECT qts FROM params)) DESC
                 LIMIT (SELECT topk FROM params)
             ), fused AS (
                 SELECT id, SUM(rrf) AS score, MIN(distance) AS distance
                 FROM (
                     SELECT * FROM vec
                     UNION ALL
                     SELECT * FROM lex
                 ) u
                 GROUP BY id
             )
             SELECT c.id AS chunk_id, c.document_id, c.chunk_index, c.text, d.filename, d.source_url, f.distance
             FROM fused f
             JOIN kb.chunks c ON c.id = f.id
             JOIN kb.documents d ON d.id = c.document_id
             ORDER BY f.score DESC
             LIMIT (SELECT topk FROM params)`,
      [vecLiteral, filterIds, orgId, projectId, topK, message]
    );
    return rows.map((r: any) => ({
      documentId: r.document_id,
      chunkId: r.chunk_id,
      chunkIndex: r.chunk_index,
      text: r.text,
      sourceUrl: r.source_url,
      filename: r.filename,
      similarity: r.distance ?? undefined,
    }));
  }

  async persistAssistantMessage(
    conversationId: string,
    content: string,
    citations: ChatCitation[]
  ) {
    if (!this.db.isOnline()) {
      const c = this.offlineConvs.get(conversationId);
      if (c) {
        c.messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          citations,
          createdAt: new Date().toISOString(),
        });
        c.updatedAt = new Date().toISOString();
      }
      return;
    }

    const message = this.messageRepository.create({
      conversationId,
      role: 'assistant',
      content,
      citations: citations as any,
    });
    await this.messageRepository.save(message);

    // Update conversation timestamp
    await this.conversationRepository.update(conversationId, {
      updatedAt: new Date(),
    });
  }

  async hasConversation(id: string): Promise<boolean> {
    if (!this.db.isOnline()) {
      return this.offlineConvs.has(id);
    }
    if (!UUID_RE.test(id)) return false;

    const count = await this.conversationRepository.count({ where: { id } });
    return count > 0;
  }
}
