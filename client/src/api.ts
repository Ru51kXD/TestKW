const base = () => (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";

export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate: string | null;
  category: string | null;
  parentId: string | null;
  createdAt: string;
};

type ApiErr = { error?: { code?: string; message?: string } };

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const msg = (body as ApiErr)?.error?.message ?? res.statusText;
    const code = (body as ApiErr)?.error?.code;
    throw new ApiRequestError(msg, res.status, code);
  }
  return body as T;
}

export type TaskListParams = {
  status?: TaskStatus;
  priority?: Priority;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
};

export function buildQuery(params: TaskListParams): string {
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.priority) sp.set("priority", params.priority);
  if (params.search?.trim()) sp.set("search", params.search.trim());
  if (params.dueFrom) sp.set("dueFrom", params.dueFrom);
  if (params.dueTo) sp.set("dueTo", params.dueTo);
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export async function fetchTasks(params: TaskListParams): Promise<Task[]> {
  const r = await api<{ data: Task[] }>(`/tasks${buildQuery(params)}`);
  return r.data;
}

export async function createTask(body: {
  title: string;
  description?: string | null;
  priority: Priority;
  status: TaskStatus;
  dueDate?: string | null;
  category?: string | null;
}): Promise<Task> {
  const r = await api<{ data: Task }>("/tasks", { method: "POST", body: JSON.stringify(body) });
  return r.data;
}

export async function updateTask(
  id: string,
  body: Partial<{
    title: string;
    description: string | null;
    priority: Priority;
    status: TaskStatus;
    dueDate: string | null;
    category: string | null;
  }>
): Promise<Task> {
  const r = await api<{ data: Task }>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return r.data;
}

export async function deleteTask(id: string): Promise<void> {
  await api<unknown>(`/tasks/${id}`, { method: "DELETE" });
}

export async function createSubtasks(
  parentId: string,
  items: { title: string; description?: string | null; priority: Priority }[]
): Promise<Task[]> {
  const r = await api<{ data: Task[] }>(`/tasks/${parentId}/subtasks`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  return r.data;
}

export async function llmCategory(taskId: string): Promise<{
  category: string;
  tag: string | null;
  rationale: string;
}> {
  const r = await api<{ data: { suggestion: { category: string; tag: string | null; rationale: string } } }>(
    `/tasks/${taskId}/llm/category`,
    { method: "POST", body: "{}" }
  );
  return r.data.suggestion;
}

export async function llmDecompose(taskId: string): Promise<
  { title: string; description: string | null; priority: Priority }[]
> {
  const r = await api<{ data: { subtasks: { title: string; description: string | null; priority: Priority }[] } }>(
    `/tasks/${taskId}/llm/decompose`,
    { method: "POST", body: "{}" }
  );
  return r.data.subtasks;
}

export async function llmPriority(taskId: string): Promise<{ priority: Priority; rationale: string }> {
  const r = await api<{ data: { suggestion: { priority: Priority; rationale: string } } }>(
    `/tasks/${taskId}/llm/priority`,
    { method: "POST", body: "{}" }
  );
  return r.data.suggestion;
}

export async function llmWorkloadSummary(params?: TaskListParams): Promise<string> {
  const body =
    params === undefined
      ? "{}"
      : JSON.stringify({
          ...(params.status ? { status: params.status } : {}),
          ...(params.priority ? { priority: params.priority } : {}),
          ...(params.dueFrom ? { dueFrom: params.dueFrom } : {}),
          ...(params.dueTo ? { dueTo: params.dueTo } : {}),
          ...(params.search ? { search: params.search } : {}),
        });
  const r = await api<{ data: { summary: string } }>("/llm/workload-summary", { method: "POST", body });
  return r.data.summary;
}
