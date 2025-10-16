# Meeting Transcript ➜ Spec Objects — LangChain pipeline (design)

This document outlines a code-first pipeline in TypeScript using LangChain.js to process meeting transcripts into structured Spec Objects.

## Contract
- Input: JSON { transcriptUrl?: string, transcriptText?: string, metadata?: object }
- Output: JSON matching top-level shape: { meeting, decisions[], requirements[], action_items[], questions[], risks[] }
- Errors: 400 invalid input, 422 schema validation failed, 500 processing error

## Steps
1) Fetch
- If transcriptUrl provided: download; else use transcriptText
- Compute SHA-256, persist original to object store
2) Normalize
- If audio/video: call ASR (Whisper/GCP/Assembly)
- Normalize to utterances [{speaker, start, end, text}]
3) Chunking
- Headings/semantic splitter; assign deterministic chunk_id
4) Embeddings
- Batch embed with rate limits; pgvector/Qdrant upsert; FTS update
5) Extraction (LLM)
- Use LangChain.js with Gemini (gemini-1.5-pro); temperature 0.1
- Structured output: Zod schemas and AJV validators
6) Validation
- Validate against JSON Schemas under docs/spec/schemas/*.schema.json
- On errors, return 422 and push to DLQ
7) Persist
- Upsert Meeting, Decisions, Requirements, ActionItems, Questions, Risks
- Write Evidence links and Relationships
8) Complete
- Emit ingestion_complete event; warm MCP caches

## Pseudocode (TypeScript)
```ts
import Fastify from 'fastify'
import { createHash } from 'node:crypto'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'
import Ajv from 'ajv'

const app = Fastify()
const ajv = new Ajv({ allErrors: true })

const ExtractionOutput = z.object({
    meeting: z.any().nullable(),
    decisions: z.array(z.any()).default([]),
    requirements: z.array(z.any()).default([]),
    action_items: z.array(z.any()).default([]),
    questions: z.array(z.any()).default([]),
    risks: z.array(z.any()).default([]),
})

app.post('/ingest/meeting', async (req, reply) => {
    const body = req.body as any
    const text = body.transcriptText ?? ''
    const hash = createHash('sha256').update(text).digest('hex')
    const chunks = text.split('\n\n').filter(Boolean).map((t, i) => ({ chunk_id: `m_${hash.slice(0,8)}_${i+1}`, text: t }))

    const llm = new ChatGoogleGenerativeAI({ model: 'gemini-1.5-pro', temperature: 0.1 })
    const system = 'You are an info extraction service. Output only JSON with expected keys.'
    const user = JSON.stringify({ chunks })
    const res = await llm.invoke([{ role: 'system', content: system }, { role: 'user', content: user }])
    const content = (res as any).content?.[0]?.text ?? '{}'
    const data = ExtractionOutput.parse(JSON.parse(content))

    // Optionally validate deeper with JSON Schemas under docs/spec/schemas
    // const validate = ajv.compile(decisionSchema)
    // if (!validate(obj)) throw new Error(JSON.stringify(validate.errors))

    await persist(data, chunks, body.metadata)
    return data
})

async function persist(data: any, chunks: any[], meta?: any) {
    // TODO: DAO upserts for documents, chunks, objects, evidence, relationships
}
```

## Notes
- Add retries with jitter on external calls (ASR/LLM/storage)
- Keep chunk IDs stable for dedup/idempotency
- Consider a background worker for long jobs; respond 202 with ingestion_id
