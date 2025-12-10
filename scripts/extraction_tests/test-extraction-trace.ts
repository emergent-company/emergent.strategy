import { ChatVertexAI } from "@langchain/google-vertexai";
import { z } from "zod";
import { CallbackHandler } from "@langfuse/langchain";
import { Langfuse } from "langfuse";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASEURL,
});

const traceId = `trace-${Date.now()}`;
console.log(`\n🔍 TRACE ID: ${traceId}\n`);

const handler = new CallbackHandler({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_BASEURL,
  traceId,
  traceName: "extraction-test",
  tags: ["test", "extraction"],
});

const EntitySchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
  })),
});

async function run() {
  const model = new ChatVertexAI({
    model: "gemini-2.5-flash-lite",
    temperature: 0.3,
    location: process.env.VERTEX_AI_LOCATION || "europe-central2",
    project: process.env.VERTEX_AI_PROJECT_ID || "spec-server-dev",
  });

  const structured = model.withStructuredOutput(EntitySchema, {
    method: "functionCalling",
    name: "extract_entities",
  });

  const text = `The Product Bible Template Pack is a framework for product management. 
  It includes templates for User Stories, Product Requirements Documents, and Sprint Planning.
  The framework was designed by the Product Excellence Team at Emergent.`;

  console.log("⏳ Calling LLM...");
  const start = Date.now();
  
  const result = await structured.invoke(
    `Extract entities from this text:\n\n${text}`,
    { callbacks: [handler] }
  );
  
  console.log(`✅ Done in ${Date.now() - start}ms`);
  console.log(`📊 Entities: ${result.entities.length}`);
  result.entities.forEach((e, i) => console.log(`  ${i+1}. ${e.name} (${e.type})`));
  
  await handler.flushAsync();
  await langfuse.flushAsync();
  
  console.log(`\n🔗 Langfuse URL: ${process.env.LANGFUSE_BASEURL}/trace/${traceId}`);
}

run().catch(console.error);
