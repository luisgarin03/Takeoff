import {
  PROJECT_ASSISTANT_ENDPOINT,
  PROJECT_ASSISTANT_MAX_ITERATIONS,
  PROJECT_ASSISTANT_MAX_TEXT,
} from "./projectAssistant.js";

const outputText = (output) => (Array.isArray(output) ? output : []).flatMap((item) =>
  item?.type === "message" && Array.isArray(item.content)
    ? item.content.filter((part) => part?.type === "output_text" && typeof part.text === "string").map((part) => part.text)
    : []).join("\n").trim();

const functionCalls = (output) => (Array.isArray(output) ? output : []).filter((item) => item?.type === "function_call").map((item) => ({
  call_id: item.call_id || item.id,
  name: item.name,
  arguments: item.arguments,
}));

const safeResult = (value) => {
  let result;
  try { result = JSON.stringify(value ?? null); } catch { result = JSON.stringify({ error: "Tool result could not be serialized." }); }
  return result.slice(0, 28_000);
};

async function requestTurn({ token, input, signal, onDelta, fetchFn = fetch }) {
  const response = await fetchFn(PROJECT_ASSISTANT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ input }),
    signal,
  });
  const contentType = response.headers.get("content-type") || "";
  let data = null;
  if (response.ok && contentType.includes("application/x-ndjson") && response.body) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "";
    const consume = (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === "text_delta") onDelta?.(event.delta || "");
      else if (event.type === "response") data = event;
      else if (event.type === "error") {
        const error = new Error(event.error || "The AI service could not complete this request.");
        error.code = event.code || "OPENAI_ERROR"; error.requestId = event.request_id || ""; throw error;
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) { const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); consume(line); }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
  } else {
    try { data = await response.json(); } catch { /* structured fallback below */ }
  }
  if (!response.ok) {
    const error = new Error(data?.error || `ChatGPT Project Assistant failed (HTTP ${response.status}).`);
    error.code = data?.code || `HTTP_${response.status}`;
    error.requestId = data?.request_id || response.headers.get("x-request-id") || "";
    throw error;
  }
  return data;
}

export async function projectAssistantStatus({ token = "", signal = undefined, fetchFn = fetch } = {}) {
  const response = await fetchFn(PROJECT_ASSISTANT_ENDPOINT, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal,
  });
  const data = await response.json().catch(() => ({}));
  return { configured: response.ok && data.configured === true, model: data.model || "", error: response.ok ? "" : data.error || "Assistant status unavailable." };
}

/**
 * Browser-owned tool loop. The server owns the OpenAI key and model request;
 * the browser owns project data and executes every tool locally. Mutating
 * tools only stage approval proposals through execute().
 */
export async function runProjectAssistant({ token, prompt, history = [], execute, onEvent, signal = undefined, fetchFn = fetch }) {
  const emit = (event) => { try { onEvent?.(event); } catch { /* UI listeners cannot break the loop */ } };
  const clippedHistory = history.slice(-20).map((message) => ({ role: message.role, content: String(message.text || "").slice(0, PROJECT_ASSISTANT_MAX_TEXT) }));
  const input = [...clippedHistory, { role: "user", content: String(prompt || "").slice(0, PROJECT_ASSISTANT_MAX_TEXT) }];
  let turns = input;
  for (let iteration = 0; iteration < PROJECT_ASSISTANT_MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) return { status: "aborted", iterations: iteration };
    emit({ type: "status", text: iteration ? "Reviewing project tool results…" : "Analyzing approved project context…" });
    let streamed = "";
    const response = await requestTurn({ token, input: turns, signal, fetchFn, onDelta: (delta) => { streamed += delta; emit({ type: "text", text: delta }); } });
    if (!response) throw new Error("The assistant stream ended before a response was completed.");
    const calls = functionCalls(response.output);
    const answer = outputText(response.output);
    if (answer && !streamed) emit({ type: "text", text: answer });
    if (!calls.length) {
      const finalText = streamed || answer;
      emit({ type: "done", text: finalText, usage: response.usage, requestId: response.request_id });
      return { status: "done", text: finalText, usage: response.usage, requestId: response.request_id, iterations: iteration + 1 };
    }
    const outputs = [];
    for (const call of calls) {
      if (signal?.aborted) return { status: "aborted", iterations: iteration };
      let args = {};
      try { args = JSON.parse(call.arguments || "{}"); }
      catch { args = null; }
      emit({ type: "tool_start", name: call.name, args });
      let result;
      if (!args) result = { error: "The tool arguments were not valid JSON." };
      else {
        try { result = await execute(call.name, args); }
        catch (error) { result = { error: error?.message || String(error) }; }
      }
      emit({ type: "tool_end", name: call.name, result });
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: safeResult(result) });
    }
    turns = [...turns, ...(response.output || []), ...outputs];
  }
  throw new Error(`The assistant exceeded ${PROJECT_ASSISTANT_MAX_ITERATIONS} tool rounds. Narrow the question or context and try again.`);
}
