import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiRequestError,
  createSubtasks,
  createTask,
  deleteTask,
  fetchTasks,
  llmCategory,
  llmDecompose,
  llmPriority,
  llmWorkloadSummary,
  updateTask,
  type Priority,
  type Task,
  type TaskListParams,
  type TaskStatus,
} from "./api";

const priorityLabel: Record<Priority, string> = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
};

const statusLabel: Record<TaskStatus, string> = {
  PENDING: "Ожидает",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
};

function priorityClass(p: Priority): string {
  if (p === "HIGH") return "bg-rose-500/15 text-rose-200 ring-rose-500/30";
  if (p === "MEDIUM") return "bg-amber-500/15 text-amber-200 ring-amber-500/30";
  return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30";
}

function statusClass(s: TaskStatus): string {
  if (s === "DONE") return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30";
  if (s === "IN_PROGRESS") return "bg-sky-500/15 text-sky-200 ring-sky-500/30";
  return "bg-slate-500/15 text-slate-200 ring-slate-500/30";
}

function formatDue(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function toInputDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputDateTime(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; task: Task };

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState<TaskListParams>({});
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const [llmBusy, setLlmBusy] = useState<string | null>(null);
  const [categoryModal, setCategoryModal] = useState<{
    task: Task;
    suggestion: { category: string; tag: string | null; rationale: string } | null;
  } | null>(null);
  const [decomposeModal, setDecomposeModal] = useState<{
    task: Task;
    items: { title: string; description: string | null; priority: Priority }[];
  } | null>(null);
  const [priorityModal, setPriorityModal] = useState<{
    task: Task;
    suggestion: { priority: Priority; rationale: string } | null;
  } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch || undefined }),
    [filters, debouncedSearch]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTasks(effectiveFilters);
      setTasks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [effectiveFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      await deleteTask(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить");
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="flex flex-col gap-4 border-b border-slate-800 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Тестовое задание</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Интеллектуальный менеджер задач</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            CRUD, фильтры на сервере и LLM-подсказки: категория, декомпозиция, приоритет и сводка нагрузки.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
          >
            Сводка нагрузки (LLM)
          </button>
          <button
            type="button"
            onClick={() => setEditor({ mode: "create" })}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400"
          >
            Новая задача
          </button>
        </div>
      </header>

      {error ? (
        <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <section className="mt-8 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 ring-1 ring-white/5">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs text-slate-400">
            Статус
            <select
              value={filters.status ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: (e.target.value || undefined) as TaskStatus | undefined,
                }))
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Все</option>
              <option value="PENDING">{statusLabel.PENDING}</option>
              <option value="IN_PROGRESS">{statusLabel.IN_PROGRESS}</option>
              <option value="DONE">{statusLabel.DONE}</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            Приоритет
            <select
              value={filters.priority ?? ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  priority: (e.target.value || undefined) as Priority | undefined,
                }))
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">Все</option>
              <option value="LOW">{priorityLabel.LOW}</option>
              <option value="MEDIUM">{priorityLabel.MEDIUM}</option>
              <option value="HIGH">{priorityLabel.HIGH}</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            Срок от
            <input
              type="datetime-local"
              value={filters.dueFrom ? toInputDateTime(filters.dueFrom) : ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dueFrom: e.target.value ? fromInputDateTime(e.target.value) ?? undefined : undefined,
                }))
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            Срок до
            <input
              type="datetime-local"
              value={filters.dueTo ? toInputDateTime(filters.dueTo) : ""}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dueTo: e.target.value ? fromInputDateTime(e.target.value) ?? undefined : undefined,
                }))
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
        </div>
        <label className="grid gap-1 text-xs text-slate-400">
          Поиск по названию и описанию
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Например: отчёт, встреча, релиз…"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
          />
        </label>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
          <span>
            Найдено: <span className="text-slate-200">{tasks.length}</span>
          </span>
          {loading ? <span className="text-indigo-300">Загрузка…</span> : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/30 ring-1 ring-white/5">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Задача</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Приоритет</th>
                <th className="px-4 py-3 font-medium">Срок</th>
                <th className="px-4 py-3 font-medium">Категория</th>
                <th className="px-4 py-3 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {loading ? "Загрузка…" : "Пока нет задач — создайте первую."}
                  </td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="border-t border-slate-800/80 hover:bg-slate-900/50">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-slate-100">{t.title}</div>
                      {t.description ? (
                        <div className="mt-1 line-clamp-2 text-xs text-slate-500">{t.description}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs ring-1 ${statusClass(t.status)}`}>
                        {statusLabel[t.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs ring-1 ${priorityClass(t.priority)}`}>
                        {priorityLabel[t.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-400">{formatDue(t.dueDate)}</td>
                    <td className="px-4 py-3 align-top text-xs text-slate-300">{t.category ?? "—"}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditor({ mode: "edit", task: t })}
                          className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(t)}
                          className="rounded-lg bg-rose-500/10 px-2 py-1 text-xs text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/20"
                        >
                          Удалить
                        </button>
                        <div className="relative w-full sm:w-auto">
                          <select
                            defaultValue=""
                            onChange={async (e) => {
                              const v = e.target.value;
                              e.target.value = "";
                              if (!v) return;
                              setError(null);
                              if (v === "cat") {
                                setLlmBusy(`cat:${t.id}`);
                                try {
                                  const suggestion = await llmCategory(t.id);
                                  setCategoryModal({ task: t, suggestion });
                                } catch (err) {
                                  setError(formatApiErr(err));
                                } finally {
                                  setLlmBusy(null);
                                }
                              }
                              if (v === "dec") {
                                setLlmBusy(`dec:${t.id}`);
                                try {
                                  const items = await llmDecompose(t.id);
                                  setDecomposeModal({ task: t, items });
                                } catch (err) {
                                  setError(formatApiErr(err));
                                } finally {
                                  setLlmBusy(null);
                                }
                              }
                              if (v === "pri") {
                                setLlmBusy(`pri:${t.id}`);
                                try {
                                  const suggestion = await llmPriority(t.id);
                                  setPriorityModal({ task: t, suggestion });
                                } catch (err) {
                                  setError(formatApiErr(err));
                                } finally {
                                  setLlmBusy(null);
                                }
                              }
                            }}
                            className="w-full rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-100 hover:bg-indigo-500/20"
                          >
                            <option value="">LLM…</option>
                            <option value="cat">Категория</option>
                            <option value="dec">Декомпозиция</option>
                            <option value="pri">Приоритет</option>
                          </select>
                          {llmBusy?.startsWith("cat:") && llmBusy.endsWith(t.id) ? (
                            <span className="ml-2 text-[10px] text-indigo-300">…</span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editor ? (
        <TaskEditorModal
          state={editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await load();
          }}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Удалить задачу?"
          body={`«${deleteTarget.title}» будет удалена безвозвратно.`}
          confirmText="Удалить"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      ) : null}

      {categoryModal ? (
        <CategoryModal
          task={categoryModal.task}
          suggestion={categoryModal.suggestion}
          onClose={() => setCategoryModal(null)}
          onApplied={async () => {
            setCategoryModal(null);
            await load();
          }}
        />
      ) : null}

      {decomposeModal ? (
        <DecomposeModal
          task={decomposeModal.task}
          items={decomposeModal.items}
          onClose={() => setDecomposeModal(null)}
          onCreated={async () => {
            setDecomposeModal(null);
            await load();
          }}
        />
      ) : null}

      {priorityModal ? (
        <PriorityModal
          task={priorityModal.task}
          suggestion={priorityModal.suggestion}
          onClose={() => setPriorityModal(null)}
          onApplied={async () => {
            setPriorityModal(null);
            await load();
          }}
        />
      ) : null}

      {summaryOpen ? (
        <SummaryModal
          onClose={() => setSummaryOpen(false)}
          fetchSummary={() => llmWorkloadSummary(effectiveFilters)}
          onError={(msg) => {
            setError(msg);
            setSummaryOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function formatApiErr(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return "Ошибка запроса";
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

function ConfirmModal(props: {
  title: string;
  body: string;
  confirmText: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl ring-1 ring-white/10">
        <h2 className="text-lg font-semibold text-white">{props.title}</h2>
        <p className="mt-2 text-sm text-slate-400">{props.body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void props.onConfirm()}
            className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
          >
            {props.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskEditorModal(props: {
  state: EditorState;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const initial = useMemo(() => {
    if (props.state.mode === "create") {
      return {
        title: "",
        description: "",
        priority: "MEDIUM" as Priority,
        status: "PENDING" as TaskStatus,
        dueDate: "",
        category: "",
      };
    }
    const t = props.state.task;
    return {
      title: t.title,
      description: t.description ?? "",
      priority: t.priority,
      status: t.status,
      dueDate: toInputDateTime(t.dueDate),
      category: t.category ?? "",
    };
  }, [props.state]);

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [priority, setPriority] = useState<Priority>(initial.priority);
  const [status, setStatus] = useState<TaskStatus>(initial.status);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [category, setCategory] = useState(initial.category);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(initial.title);
    setDescription(initial.description);
    setPriority(initial.priority);
    setStatus(initial.status);
    setDueDate(initial.dueDate);
    setCategory(initial.category);
  }, [initial]);

  const submit = async () => {
    if (!title.trim()) {
      setLocalError("Введите название");
      return;
    }
    setSaving(true);
    setLocalError(null);
    try {
      const dueIso = dueDate ? fromInputDateTime(dueDate) : null;
      if (props.state.mode === "create") {
        await createTask({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status,
          dueDate: dueIso,
          category: category.trim() || null,
        });
      } else {
        await updateTask(props.state.task.id, {
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status,
          dueDate: dueIso,
          category: category.trim() || null,
        });
      }
      await props.onSaved();
    } catch (e) {
      setLocalError(formatApiErr(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {props.state.mode === "create" ? "Новая задача" : "Редактирование"}
            </h2>
            <p className="mt-1 text-xs text-slate-500">Поля валидируются на сервере.</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg bg-slate-900 px-2 py-1 text-sm text-slate-300 ring-1 ring-slate-800 hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {localError ? (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {localError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3">
          <label className="grid gap-1 text-xs text-slate-400">
            Название
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            Описание
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-slate-400">
              Приоритет
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="LOW">{priorityLabel.LOW}</option>
                <option value="MEDIUM">{priorityLabel.MEDIUM}</option>
                <option value="HIGH">{priorityLabel.HIGH}</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-slate-400">
              Статус
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="PENDING">{statusLabel.PENDING}</option>
                <option value="IN_PROGRESS">{statusLabel.IN_PROGRESS}</option>
                <option value="DONE">{statusLabel.DONE}</option>
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-xs text-slate-400">
            Срок выполнения
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            Категория (вручную)
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryModal(props: {
  task: Task;
  suggestion: { category: string; tag: string | null; rationale: string } | null;
  onClose: () => void;
  onApplied: () => void | Promise<void>;
}) {
  const [category, setCategory] = useState(props.suggestion?.category ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setCategory(props.suggestion?.category ?? "");
  }, [props.suggestion]);

  const apply = async () => {
    setBusy(true);
    setErr(null);
    try {
      await updateTask(props.task.id, { category: category.trim() || null });
      await props.onApplied();
    } catch (e) {
      setErr(formatApiErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl ring-1 ring-white/10">
        <h2 className="text-lg font-semibold text-white">Категория (LLM)</h2>
        <p className="mt-1 text-xs text-slate-500">Можно принять подсказку или отредактировать перед сохранением.</p>

        {props.suggestion ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
            <div className="text-xs text-slate-500">Обоснование</div>
            <div className="mt-1">{props.suggestion.rationale}</div>
            {props.suggestion.tag ? (
              <div className="mt-2 text-xs text-slate-500">
                Тег: <span className="text-slate-300">{props.suggestion.tag}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-400">Нет данных подсказки.</div>
        )}

        {err ? (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {err}
          </div>
        ) : null}

        <label className="mt-4 grid gap-1 text-xs text-slate-400">
          Категория
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
          >
            Отклонить
          </button>
          <button
            type="button"
            disabled={busy || !category.trim()}
            onClick={() => void apply()}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {busy ? "Сохранение…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DecomposeModal(props: {
  task: Task;
  items: { title: string; description: string | null; priority: Priority }[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState(props.items);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRows(props.items);
  }, [props.items]);

  const updateRow = (idx: number, patch: Partial<(typeof rows)[number]>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const cleaned = rows
        .map((r) => ({
          title: r.title.trim(),
          description: r.description?.trim() || null,
          priority: r.priority,
        }))
        .filter((r) => r.title.length > 0);
      if (cleaned.length === 0) {
        setErr("Добавьте хотя бы одну подзадачу с названием");
        return;
      }
      await createSubtasks(props.task.id, cleaned);
      await props.onCreated();
    } catch (e) {
      setErr(formatApiErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl ring-1 ring-white/10">
        <h2 className="text-lg font-semibold text-white">Декомпозиция (LLM)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Подзадачи для «{props.task.title}». Отредактируйте список и создайте записи в базе.
        </p>

        {err ? (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {err}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          {rows.map((r, idx) => (
            <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <label className="md:col-span-2 grid gap-1 text-xs text-slate-400">
                  Название
                  <input
                    value={r.title}
                    onChange={(e) => updateRow(idx, { title: e.target.value })}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-400">
                  Приоритет
                  <select
                    value={r.priority}
                    onChange={(e) => updateRow(idx, { priority: e.target.value as Priority })}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="LOW">{priorityLabel.LOW}</option>
                    <option value="MEDIUM">{priorityLabel.MEDIUM}</option>
                    <option value="HIGH">{priorityLabel.HIGH}</option>
                  </select>
                </label>
                <label className="md:col-span-3 grid gap-1 text-xs text-slate-400">
                  Описание
                  <input
                    value={r.description ?? ""}
                    onChange={(e) => updateRow(idx, { description: e.target.value || null })}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {busy ? "Создание…" : "Создать подзадачи"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PriorityModal(props: {
  task: Task;
  suggestion: { priority: Priority; rationale: string } | null;
  onClose: () => void;
  onApplied: () => void | Promise<void>;
}) {
  const [priority, setPriority] = useState<Priority>(props.suggestion?.priority ?? props.task.priority);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setPriority(props.suggestion?.priority ?? props.task.priority);
  }, [props.suggestion, props.task.priority]);

  const apply = async () => {
    setBusy(true);
    setErr(null);
    try {
      await updateTask(props.task.id, { priority });
      await props.onApplied();
    } catch (e) {
      setErr(formatApiErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl ring-1 ring-white/10">
        <h2 className="text-lg font-semibold text-white">Приоритет (LLM)</h2>
        {props.suggestion ? (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
            {props.suggestion.rationale}
          </div>
        ) : null}

        {err ? (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {err}
          </div>
        ) : null}

        <label className="mt-4 grid gap-1 text-xs text-slate-400">
          Приоритет
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          >
            <option value="LOW">{priorityLabel.LOW}</option>
            <option value="MEDIUM">{priorityLabel.MEDIUM}</option>
            <option value="HIGH">{priorityLabel.HIGH}</option>
          </select>
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-100 ring-1 ring-slate-700 hover:bg-slate-700"
          >
            Отклонить
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply()}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {busy ? "Применение…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryModal(props: {
  onClose: () => void;
  fetchSummary: () => Promise<string>;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setText(null);
      try {
        const s = await props.fetchSummary();
        if (!cancelled) setText(s);
      } catch (e) {
        if (!cancelled) props.onError(formatApiErr(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Сводка нагрузки</h2>
            <p className="mt-1 text-xs text-slate-500">
              LLM анализирует задачи с учётом тех же фильтров, что и таблица ниже.
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg bg-slate-900 px-2 py-1 text-sm text-slate-300 ring-1 ring-slate-800 hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              Генерация…
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{text ?? "—"}</div>
          )}
        </div>
      </div>
    </div>
  );
}
