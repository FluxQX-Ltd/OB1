import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Maps Slack channel IDs → brand + project.
// Replace placeholder IDs (format: C + 10 alphanumeric chars) with real Slack channel IDs.
const CHANNEL_ROUTING: Record<string, { brand: string; project: string }> = {
  CXXXXXXXXXX: { brand: "producerstack", project: "seo" },
  CYYYYYYYYY: { brand: "producerstack", project: "paid-ads" },
  CZZZZZZZZZ: { brand: "fluxhq", project: "ops" },
};

const ingestSchema = z.object({
  content: z.string().min(1, "content is required"),
  brand: z.string().optional(),
  project: z.string().optional(),
  channel_id: z.string().optional(),
});

async function getEmbedding(text: string): Promise<number[]> {
  const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
  }
  const d = await r.json();
  return d.data[0].embedding;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-brain-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const app = new Hono();

app.options("*", (c) => c.text("ok", 200, corsHeaders));

app.use("*", async (c, next) => {
  const provided =
    c.req.header("x-brain-key") || new URL(c.req.url).searchParams.get("key");
  if (!provided || provided !== MCP_ACCESS_KEY) {
    return c.json({ error: "Invalid or missing access key" }, 401, corsHeaders);
  }
  await next();
});

app.get("/health", (c) =>
  c.json({ ok: true, service: "ingest-thought", version: "1.0.0" }, 200, corsHeaders)
);

app.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      400,
      corsHeaders
    );
  }

  const { content, channel_id } = parsed.data;

  // Explicit params take priority over channel routing
  let brand = parsed.data.brand ?? null;
  let project = parsed.data.project ?? null;
  if (channel_id && CHANNEL_ROUTING[channel_id]) {
    if (!brand) brand = CHANNEL_ROUTING[channel_id].brand;
    if (!project) project = CHANNEL_ROUTING[channel_id].project;
  }

  let embedding: number[];
  try {
    embedding = await getEmbedding(content);
  } catch (err: unknown) {
    return c.json({ error: `Embedding failed: ${(err as Error).message}` }, 502, corsHeaders);
  }

  const { data: upsertResult, error: upsertError } = await supabase.rpc("upsert_thought", {
    p_content: content,
    p_payload: {
      metadata: { source: "ingest", source_type: "ingest", type: "observation", topics: [] },
    },
  });
  if (upsertError) {
    return c.json({ error: `Upsert failed: ${upsertError.message}` }, 500, corsHeaders);
  }

  const thoughtId: string = upsertResult?.id;
  if (!thoughtId) {
    return c.json({ error: "Upsert returned no ID" }, 500, corsHeaders);
  }

  const { error: embError } = await supabase
    .from("thoughts")
    .update({ embedding })
    .eq("id", thoughtId);
  if (embError) {
    return c.json({ error: `Embedding update failed: ${embError.message}` }, 500, corsHeaders);
  }

  if (brand !== null || project !== null) {
    const brandUpdate: Record<string, string | null> = {};
    if (brand !== null) brandUpdate.brand = brand;
    if (project !== null) brandUpdate.project = project;

    const { error: brandError } = await supabase
      .from("thoughts")
      .update(brandUpdate)
      .eq("id", thoughtId);
    if (brandError) {
      return c.json(
        { error: `Brand/project update failed: ${brandError.message}` },
        500,
        corsHeaders
      );
    }
  }

  return c.json(
    { ok: true, id: thoughtId, brand, project, channel_id: channel_id ?? null },
    200,
    corsHeaders
  );
});

Deno.serve(app.fetch);
