import { config, isLlmConfigured } from "../config.js";
import { ApiError } from "../errors/ApiError.js";
import type { Priority, Task } from "@prisma/client";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callChat(messages: ChatMessage[], jsonObject: boolean): Promise<string> {
  if (!isLlmConfigured()) {
    throw new ApiError(
      "LLM_NOT_CONFIGURED",
      "LLM is not configured. Set OPENAI_API_KEY in server/.env",
      503
    );
  }

  const body: Record<string, unknown> = {
    model: config.llmModel,
    messages,
    temperature: 0.3,
  };
  if (jsonObject) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new ApiError("LLM_ERROR", `LLM request failed: ${raw.slice(0, 500)}`, 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError("LLM_ERROR", "Invalid JSON from LLM gateway", 502);
  }

  const content = (parsed as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
    ?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ApiError("LLM_ERROR", "Empty LLM response", 502);
  }
  return content.trim();
}

function safeJsonParse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("LLM_ERROR", "LLM returned invalid JSON", 502);
  }
}

function taskContext(t: Task): string {
  return JSON.stringify(
    {
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    },
    null,
    2
  );
}

export const llmService = {
  async suggestCategory(task: Task): Promise<{ category: string; tag: string | null; rationale: string }> {
    const system = `You are a task triage assistant. Given a task title and description, propose ONE short category label (1-3 words) and an optional single tag (slug style, lowercase, no spaces).
Always respond with valid JSON only: {"category":"...","tag":string|null,"rationale":"one sentence"}`;

    const user = `Task:\n${taskContext(task)}`;

    const text = await callChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      true
    );

    const data = safeJsonParse<{ category?: unknown; tag?: unknown; rationale?: unknown }>(text);
    const category = typeof data.category === "string" ? data.category.trim() : "";
    if (!category) {
      throw new ApiError("LLM_ERROR", "LLM did not return a category", 502);
    }
    const tag =
      data.tag === null || data.tag === undefined
        ? null
        : typeof data.tag === "string"
          ? data.tag.trim() || null
          : null;
    const rationale = typeof data.rationale === "string" ? data.rationale : "";
    return { category, tag, rationale };
  },

  async suggestSubtasks(task: Task): Promise<{ title: string; description: string | null; priority: Priority }[]> {
    const system = `You break down work into concrete subtasks. Respond with JSON only:
{"subtasks":[{"title":"...","description":string|null,"priority":"LOW"|"MEDIUM"|"HIGH"}]}
Rules: 3-7 subtasks, actionable titles, realistic priorities, descriptions optional.`;

    const user = `Parent task:\n${taskContext(task)}`;

    const text = await callChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      true
    );

    const data = safeJsonParse<{ subtasks?: unknown }>(text);
    if (!Array.isArray(data.subtasks)) {
      throw new ApiError("LLM_ERROR", "LLM subtasks payload invalid", 502);
    }

    const out: { title: string; description: string | null; priority: Priority }[] = [];
    for (const item of data.subtasks) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) continue;
      const description =
        o.description === null || o.description === undefined
          ? null
          : typeof o.description === "string"
            ? o.description.trim() || null
            : null;
      const pr = o.priority === "LOW" || o.priority === "MEDIUM" || o.priority === "HIGH" ? o.priority : "MEDIUM";
      out.push({ title, description, priority: pr });
    }

    if (out.length === 0) {
      throw new ApiError("LLM_ERROR", "No subtasks produced", 502);
    }
    return out;
  },

  async suggestPriority(task: Task): Promise<{ priority: Priority; rationale: string }> {
    const system = `You prioritize tasks. Consider urgency implied by wording and due dates.
Respond with JSON only: {"priority":"LOW"|"MEDIUM"|"HIGH","rationale":"one or two sentences"}`;

    const user = `Task:\n${taskContext(task)}`;

    const text = await callChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      true
    );

    const data = safeJsonParse<{ priority?: unknown; rationale?: unknown }>(text);
    const priority =
      data.priority === "LOW" || data.priority === "MEDIUM" || data.priority === "HIGH"
        ? data.priority
        : "MEDIUM";
    const rationale = typeof data.rationale === "string" ? data.rationale : "";
    return { priority, rationale };
  },

  async workloadSummary(tasks: Task[]): Promise<string> {
    const system = `You summarize workload for the user in clear Russian, using short paragraphs and bullet points where helpful.
Include: overdue tasks, tasks due soon (next 7 days), status distribution, and practical next-step advice.
If there are no tasks, say so briefly. Do not invent tasks not in the data.`;

    const payload = tasks.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    }));

    const user = `Tasks (${tasks.length}):\n${JSON.stringify(payload, null, 2)}`;

    return callChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      false
    );
  },
};
