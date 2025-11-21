import { Injectable } from '@nestjs/common';
import { GraphSearchRequestDto } from './dto/graph-search-request.dto';
import {
  GraphSearchResponseDto,
  GraphSearchItemDto,
  GraphSearchMetaDto,
  GraphSearchEmbeddingModelMetaDto,
  GraphSearchRerankMetaDto,
  GraphSearchExpansionMetaDto,
} from './dto/graph-search-response.dto';
import { GraphChannel, GraphRole } from './dto/graph-search.enums';
import { GraphSearchRepository, CandidateRow } from './graph-search.repository';
import { EmbeddingService } from './embedding.service';
import { encodeGraphCursor, decodeGraphCursor } from './cursor.util';
import {
  calculateStatistics,
  normalizeScore,
  fuseScores,
  type ScoreStatistics,
} from '../../common/database/sql-patterns/hybrid-search.util';

// Placeholder service implementation that will later call actual pipeline components.
@Injectable()
export class GraphSearchService {
  constructor(
    private readonly repo: GraphSearchRepository,
    private readonly embedding: EmbeddingService
  ) {}

  // Lightweight in-memory counters & last event snapshot for instrumentation (reset per process, test-friendly)
  private readonly telemetry = {
    pageEvents: 0,
    last: null as null | any,
  };

  /** Expose shallow copy of telemetry stats (intended for tests / debug only). */
  getTelemetry() {
    return { pageEvents: this.telemetry.pageEvents, last: this.telemetry.last };
  }

  async search(
    req: GraphSearchRequestDto,
    opts: { debug: boolean; scopes: string[] }
  ): Promise<GraphSearchResponseDto> {
    const started = Date.now();
    const LIMIT_CAP = 50; // Hard server-side safety cap to guard latency & cost
    const phase = <T>(
      label: string,
      fn: () => Promise<T>
    ): Promise<{ value: T; ms: number }> => {
      const t0 = performance.now();
      return fn().then((value) => ({
        value,
        ms: Math.max(0, performance.now() - t0),
      }));
    };
    if (!req.query || !req.query.trim()) {
      const requestedLimitEmpty = req.pagination?.limit ?? req.limit ?? 40;
      const effectiveLimitEmpty = Math.min(requestedLimitEmpty, LIMIT_CAP);
      return {
        query: req.query,
        intent: req.intentOverride ?? null,
        items: [],
        meta: {
          channels:
            req.channels && req.channels.length
              ? req.channels
              : [GraphChannel.LEXICAL, GraphChannel.VECTOR],
          fusion: 'weighted_sum:v1',
          normalization_version: 'zscore_v1',
          lexical_considered: 0,
          vector_considered: 0,
          skipped_unembedded: 0,
          neighbor_expanded: 0,
          token_estimate: 0,
          token_budget: req.maxTokenBudget ?? 3500,
          truncation_notice: false,
          warnings: ['empty_query'],
          embedding_model: {
            model: 'placeholder-embed',
            version: 1,
            coverage_pct: 0,
          },
          rerank: { applied: false },
          expansion: { neighbors: 0, hub_sampled: false },
          request: {
            limit: effectiveLimitEmpty,
            requested_limit: requestedLimitEmpty,
            channels: req.channels,
            rerank: req.rerank,
          },
          elapsed_ms: Date.now() - started,
          total_estimate: 0,
          nextCursor: null,
          prevCursor: null,
          hasNext: false,
          hasPrev: false,
        },
      };
    }
    // Choose pagination.limit if provided; fallback to top-level limit; default 40
    const requestedLimit = req.pagination?.limit ?? req.limit ?? 40;
    const limit = Math.min(requestedLimit, LIMIT_CAP); // enforced cap
    const pageCursor = req.pagination?.cursor ?? null;
    const direction =
      req.pagination?.direction === 'backward' ? 'backward' : 'forward';
    const lexicalLimit = Math.min(25, limit * 2); // pool size
    const vectorLimit = Math.min(25, limit * 2);

    const embPhase = await phase('embedding', () =>
      this.embedding.embedQuery(req.query)
    );
    const lexicalPhase = await phase('lexical', () =>
      this.repo.lexicalCandidates(req.query, lexicalLimit)
    );
    const vectorPhase = await phase('vector', () =>
      this.repo.vectorCandidates(embPhase.value, vectorLimit)
    );
    const emb = embPhase.value;
    const lexical = lexicalPhase.value;
    const vector = vectorPhase.value;

    const warnings: string[] = [];
    if (!lexical.length) warnings.push('lexical_empty');
    if (!vector.length) warnings.push('vector_empty');

    // Build candidate map: id -> { lexicalScore?, vectorScore? }
    const candidateMap = new Map<
      string,
      { lexicalScore?: number; vectorScore?: number }
    >();

    for (const r of lexical) {
      candidateMap.set(r.id, {
        lexicalScore: r.lexical_score ?? 0,
      });
    }

    for (const r of vector) {
      const existing = candidateMap.get(r.id);
      if (existing) {
        existing.vectorScore = r.vector_score ?? 0;
      } else {
        candidateMap.set(r.id, {
          vectorScore: r.vector_score ?? 0,
        });
      }
    }

    // Calculate statistics for normalization using shared utility
    const lexicalScores = lexical.map((r) => r.lexical_score ?? 0);
    const vectorScores = vector.map((r) => r.vector_score ?? 0);

    const lexicalStats = calculateStatistics(lexicalScores);
    const vectorStats = calculateStatistics(vectorScores);

    // Weighted sum: if one channel missing, weight other as 1.0
    const weightLex =
      lexical.length && vector.length ? 0.55 : lexical.length ? 1 : 0;
    const weightVec =
      lexical.length && vector.length ? 0.45 : vector.length ? 1 : 0;

    const fuseStart = performance.now();

    // Fuse scores using centralized utility logic
    const fusedPool: GraphSearchItemDto[] = Array.from(candidateMap.entries())
      .map(([id, scores]) => {
        // Normalize scores using z-score (without sigmoid, matching original behavior)
        const normalizedLex =
          scores.lexicalScore !== undefined
            ? normalizeScore(scores.lexicalScore, lexicalStats, {
                normalization: 'zscore',
                applySigmoid: false,
              })
            : 0;

        const normalizedVec =
          scores.vectorScore !== undefined
            ? normalizeScore(scores.vectorScore, vectorStats, {
                normalization: 'zscore',
                applySigmoid: false,
              })
            : 0;

        // Fuse normalized scores
        const fusedScore = fuseScores(
          normalizedLex,
          normalizedVec,
          weightLex,
          weightVec
        );

        return {
          object_id: id,
          canonical_id: id,
          score: fusedScore,
          rank: 0, // filled after sort
          role: GraphRole.PRIMARY,
          fields: { title: id },
          truncated_fields: [],
          reasons: [
            ...(scores.lexicalScore !== undefined
              ? [{ channel: GraphChannel.LEXICAL, score: scores.lexicalScore }]
              : []),
            ...(scores.vectorScore !== undefined
              ? [{ channel: GraphChannel.VECTOR, score: scores.vectorScore }]
              : []),
          ],
          explanation: 'fused_weighted_sum',
        };
      })
      .sort((a, b) => {
        // Deterministic ordering: score desc, tie-break by id asc
        if (b.score === a.score) return a.object_id.localeCompare(b.object_id);
        return b.score - a.score;
      });

    // Hydrate objects with actual data from database
    const objectIds = fusedPool.map((item) => item.object_id);
    const objectDataMap = await this.repo.hydrateObjects(objectIds);

    // Update fusedPool with hydrated data
    for (const item of fusedPool) {
      const objectData = objectDataMap.get(item.object_id);
      if (objectData) {
        item.canonical_id = objectData.canonical_id;
        // Build fields object from properties + core fields
        item.fields = {
          type: objectData.type,
          key: objectData.key,
          ...objectData.properties, // Spread all properties (name, description, title, etc.)
        };
      }
      // If not found in database, keep the placeholder data (shouldn't happen)
    }

    // Cursor helpers (extracted to utility for reuse across endpoints in future)
    const encodeCursor = encodeGraphCursor;
    const decodeCursor = decodeGraphCursor;

    let startIndex = 0;
    let endIndexExclusive = 0;
    if (pageCursor) {
      const decoded = decodeCursor(pageCursor);
      if (decoded) {
        if (direction === 'forward') {
          if (decoded.p !== undefined) {
            // Index-based contiguous pagination: start after decoded.p
            startIndex = Math.min(decoded.p + 1, fusedPool.length);
            endIndexExclusive = startIndex + limit;
          } else {
            // Legacy score/id boundary fallback
            startIndex = fusedPool.findIndex((it) => {
              if (it.score < decoded.s) return true;
              if (it.score === decoded.s && it.object_id > decoded.id)
                return true;
              return false;
            });
            if (startIndex === -1) startIndex = fusedPool.length; // past end
            endIndexExclusive = startIndex + limit;
          }
        } else {
          // backward
          const cursorPos = fusedPool.findIndex(
            (it) => it.object_id === decoded.id
          );
          if (cursorPos === -1) {
            // Fallback to forward semantics if id not located
            startIndex = fusedPool.findIndex((it) => {
              if (it.score < decoded.s) return true;
              if (it.score === decoded.s && it.object_id > decoded.id)
                return true;
              return false;
            });
            if (startIndex === -1) startIndex = fusedPool.length;
            endIndexExclusive = startIndex + limit;
          } else {
            endIndexExclusive = cursorPos;
            startIndex = Math.max(0, endIndexExclusive - limit);
          }
        }
      } else {
        endIndexExclusive = limit; // invalid cursor; behave like first page
      }
    } else {
      startIndex = 0;
      endIndexExclusive = limit;
    }

    const pageSlice = fusedPool.slice(startIndex, endIndexExclusive);
    const items: GraphSearchItemDto[] = pageSlice.map((item, localIdx) => ({
      ...item,
      rank: startIndex + localIdx + 1,
      cursor: encodeCursor(item.score, item.object_id, startIndex + localIdx),
    }));

    let nextCursor: string | null = null;
    let prevCursor: string | null = null;
    let hasPrev = false;
    let hasNext = false;
    if (direction === 'forward') {
      hasPrev = !!pageCursor && startIndex > 0;
      prevCursor = hasPrev
        ? encodeCursor(
            fusedPool[Math.max(0, startIndex - 1)].score,
            fusedPool[Math.max(0, startIndex - 1)].object_id,
            Math.max(0, startIndex - 1)
          )
        : null;
      hasNext = endIndexExclusive < fusedPool.length;
      if (hasNext && pageSlice.length) {
        const lastInPage = pageSlice[pageSlice.length - 1];
        const lastIndex = startIndex + pageSlice.length - 1;
        nextCursor = encodeCursor(
          lastInPage.score,
          lastInPage.object_id,
          lastIndex
        );
      } else {
        nextCursor = null;
      }
    } else {
      // backward
      // For backward pages, nextCursor should let client continue backward (earlier slice), prevCursor should allow flipping direction forward relative to the first item in current slice.
      // Define nextCursor (continue backward) as cursor of item just before startIndex if exists.
      const beforeStart = startIndex > 0 ? fusedPool[startIndex - 1] : null;
      nextCursor = beforeStart
        ? encodeCursor(beforeStart.score, beforeStart.object_id, startIndex - 1)
        : null;
      // Define prevCursor (forward direction) as cursor of last item in current slice (to allow returning forward toward original cursor).
      const lastItem = pageSlice[pageSlice.length - 1];
      prevCursor = lastItem
        ? encodeCursor(
            lastItem.score,
            lastItem.object_id,
            startIndex + pageSlice.length - 1
          )
        : pageCursor; // fallback retains provided cursor
      // From caller perspective: hasPrev means there exists a page in the FORWARD direction before current slice's first item.
      hasPrev = !!prevCursor && !!pageCursor; // only meaningful if we navigated backward at least once
      // hasNext means we can continue moving backward to earlier items
      hasNext = !!nextCursor;
    }
    const fuseMs = performance.now() - fuseStart;

    if (!items.length) warnings.push('candidate_pool_empty');

    // Approximate positional range of this page within the full fused result pool (1-based indices).
    // We expose these as advisory numbers for UX (e.g., "Items 41–80 of ~500"). They are exact relative
    // to the fusedPool snapshot used for this request (no cross-request stability guarantee).
    const approx_position_start = items.length ? startIndex + 1 : 0;
    const approx_position_end = items.length ? startIndex + items.length : 0;

    const meta: GraphSearchMetaDto = {
      channels:
        req.channels && req.channels.length
          ? req.channels
          : [GraphChannel.LEXICAL, GraphChannel.VECTOR],
      fusion: 'weighted_sum:v1',
      normalization_version: 'zscore_v1',
      lexical_considered: lexical.length,
      vector_considered: vector.length,
      skipped_unembedded: 0,
      neighbor_expanded: 0,
      token_estimate: 0,
      token_budget: req.maxTokenBudget ?? 3500,
      truncation_notice: false,
      warnings,
      embedding_model: {
        model: 'placeholder-embed',
        version: 1,
        coverage_pct: 100,
      },
      rerank: { applied: false },
      expansion: { neighbors: 0, hub_sampled: false },
      request: {
        limit,
        requested_limit: requestedLimit,
        channels: req.channels,
        rerank: req.rerank,
        direction: direction as any,
      },
      elapsed_ms: Date.now() - started,
      total_estimate: fusedPool.length,
      nextCursor,
      prevCursor,
      hasNext,
      hasPrev,
      // New advisory range fields (AT-GSP-19)
      approx_position_start: approx_position_start as any,
      approx_position_end: approx_position_end as any,
    };

    if (opts.debug) {
      (meta as any).timing = {
        embedding_ms: embPhase.ms,
        lexical_ms: lexicalPhase.ms,
        vector_ms: vectorPhase.ms,
        fusion_ms: fuseMs,
        total_ms: meta.elapsed_ms,
      };
      (meta as any).channel_stats = {
        lexical: {
          mean: lexicalStats.mean,
          std: lexicalStats.std,
          count: lexical.length,
        },
        vector: {
          mean: vectorStats.mean,
          std: vectorStats.std,
          count: vector.length,
        },
      };
    }

    // Telemetry emission (AT-GSP-12): capture pagination event with essential fields.
    // For now we keep this minimal & synchronous; future integration may stream to a central metrics bus.
    try {
      const evt = {
        type: 'graph.search.page',
        query_hash: this.hashQuery(req.query),
        direction,
        requested_limit: requestedLimit,
        effective_limit: limit,
        total_estimate: meta.total_estimate,
        page_item_count: items.length,
        hasNext: meta.hasNext,
        hasPrev: meta.hasPrev,
        elapsed_ms: meta.elapsed_ms,
        ts: Date.now(),
      };
      this.telemetry.pageEvents++;
      this.telemetry.last = evt;
      // eslint-disable-next-line no-console
      if (process.env.GRAPH_SEARCH_TELEMETRY_LOG?.toLowerCase() === 'true')
        console.log('[telemetry]', evt);
    } catch {
      /* swallow – telemetry must not impact request */
    }

    return {
      query: req.query,
      intent: req.intentOverride ?? null,
      items,
      meta,
    };
  }

  // Simple deterministic hash (FNV-1a 32-bit) to avoid logging raw queries in telemetry while enabling grouping.
  private hashQuery(q: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < q.length; i++) {
      h ^= q.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // Convert to unsigned and hex
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
}
