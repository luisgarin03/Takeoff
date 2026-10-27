// Secure streaming OpenAI Responses API gateway for ChatGPT Project Assistant.
// Project tools execute in the browser; this function owns the API credential,
// model instructions, strict schemas, authentication, and operational limits.

import OpenAI from "openai";
import { assistantSystemPrompt, responseToolDefinitions } from "../../src/lib/projectAssistant.js";

const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";
const MAX_BODY_BYTES = 1_000_000;
const MAX_INPUT_ITEMS = 180;
const MAX_REQUESTS_PER_MINUTE = 24;
const REQUEST_TIMEOUT_MS = 55_000;
const buckets = new Map();

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
});
const ndjson = (controller, encoder, value) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));

function domains(value) {
  return [...new Set(String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

async function verifyGoogleUser(authHeader, signal) {
  const token = /^Bearer\s+(.+)$/i.exec(authHeader || "")?.[1];
  if (!token) return { ok: false, status: 401, error: "Sign in with Google to use ChatGPT Project Assistant." };
  try {
    const response = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!response.ok) return { ok: false, status: 401, error: "Your Google session expired. Sign in again." };
    const profile = await response.json();
    const email = String(profile.email || "").toLowerCase();
    if (!email || profile.email_verified === false) return { ok: false, status: 401, error: "A verified Google account is required." };
    const allowed = domains(process.env.ALLOWED_HD);
    const hd = String(profile.hd || email.split("@")[1] || "").toLowerCase();
    if (allowed.length && !allowed.includes(hd)) return { ok: false, status: 403, error: "This deployment is limited to an approved organization." };
    return { ok: true, email };
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, status: 504, error: "Authentication timed out." };
    return { ok: false, status: 502, error: "Could not verify your Google sign-in." };
  }
}

function rateLimit(key) {
  const now = Date.now(), windowStart = now - 60_000;
  const prior = (buckets.get(key) || []).filter((stamp) => stamp > windowStart);
  if (prior.length >= MAX_REQUESTS_PER_MINUTE) return false;
  prior.push(now); buckets.set(key, prior);
  if (buckets.size > 2_000) for (const [id, stamps] of buckets) if (!stamps.some((stamp) => stamp > windowStart)) buckets.delete(id);
  return true;
}

function safeLog(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").slice(0, 160);
}

export default async function projectAssistant(request, context = {}) {
  if (request.method === "GET") return json(200, { configured: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL), model: process.env.OPENAI_MODEL || "" });
  if (request.method !== "POST") return json(405, { error: "POST only", code: "METHOD_NOT_ALLOWED" });
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return json(501, { error: "ChatGPT Project Assistant is not configured on this deployment.", code: "NOT_CONFIGURED" });

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return json(413, { error: "Assistant request is too large. Narrow the selected context.", code: "REQUEST_TOO_LARGE" });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(413, { error: "Assistant request is too large. Narrow the selected context.", code: "REQUEST_TOO_LARGE" });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  request.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const auth = await verifyGoogleUser(request.headers.get("authorization"), controller.signal);
  if (!auth.ok) { clearTimeout(timer); return json(auth.status, { error: auth.error, code: "AUTH_REQUIRED" }); }
  const ip = request.headers.get("x-nf-client-connection-ip") || request.headers.get("x-forwarded-for") || context.ip || "unknown";
  if (!rateLimit(`${auth.email}:${ip}`)) { clearTimeout(timer); return json(429, { error: "Too many assistant requests. Wait a minute and try again.", code: "RATE_LIMITED" }, { "Retry-After": "60" }); }

  let body;
  try { body = JSON.parse(raw); } catch { clearTimeout(timer); return json(400, { error: "Invalid JSON request.", code: "BAD_JSON" }); }
  if (!body || typeof body !== "object" || !Array.isArray(body.input) || body.input.length < 1 || body.input.length > MAX_INPUT_ITEMS) {
    clearTimeout(timer); return json(400, { error: "Assistant input must be a bounded list of conversation items.", code: "BAD_INPUT" });
  }

  const encoder = new TextEncoder();
  const responseBody = new ReadableStream({
    async start(streamController) {
      try {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
        const stream = await client.responses.create({
          model: process.env.OPENAI_MODEL,
          instructions: assistantSystemPrompt(),
          input: body.input,
          tools: responseToolDefinitions(),
          tool_choice: "auto",
          parallel_tool_calls: false,
          max_output_tokens: 4_000,
          store: false,
          stream: true,
        }, { signal: controller.signal });
        for await (const event of stream) {
          if (event.type === "response.output_text.delta" && event.delta) ndjson(streamController, encoder, { type: "text_delta", delta: event.delta });
        }
        const response = await stream.finalResponse();
        const requestId = response._request_id || "";
        ndjson(streamController, encoder, { type: "response", id: response.id, model: response.model, output: response.output, usage: response.usage || null, request_id: requestId });
      } catch (error) {
        const requestId = error?.request_id || error?.headers?.get?.("x-request-id") || "";
        const status = error?.name === "AbortError" ? 504 : Number(error?.status) || 502;
        const code = status === 429 ? "OPENAI_RATE_LIMITED" : status === 504 ? "OPENAI_TIMEOUT" : "OPENAI_ERROR";
        console.error(`project-assistant: ${code}${requestId ? ` request=${safeLog(requestId)}` : ""}`);
        const message = status === 429 ? "The AI service is rate limited. Try again shortly."
          : status === 504 ? "The AI request timed out. Narrow the project context and try again."
            : "The AI service could not complete this request.";
        ndjson(streamController, encoder, { type: "error", error: message, code, request_id: requestId, status });
      } finally {
        clearTimeout(timer); streamController.close();
      }
    },
    cancel() { controller.abort(); clearTimeout(timer); },
  });
  return new Response(responseBody, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
