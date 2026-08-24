/**
 * 인메모리 어댑터.
 *
 * Supabase 크리덴셜 없이도 앱 전체가 동작하도록 하는 기본 구현이자,
 * 도메인 로직 테스트의 기준 구현이다. 프로세스 재시작 시 시드 상태로 돌아간다.
 */
import { aggregate as aggregateTodos } from "../domain/aggregate";
import {
  applyFilter,
  applySort,
  paginate,
  type Paged,
  type TodoFilter,
  type TodoQuery,
} from "../domain/query";
import { storageKeysOf, type Todo, type TodoInput } from "../domain/todo";
import type { UpdateFile, UpdateFileInput } from "../domain/attachment";
import {
  sortByNewest,
  toCurrentState,
  type TodoUpdate,
  type TodoUpdateInput,
} from "../domain/todo-update";
import {
  EMPTY_SETTINGS,
  isSameMeetingBody,
  normalizeMeetingBodyName,
  type AppSettings,
  type MeetingBody,
  type MeetingBodyInput,
  type Recipient,
  type RecipientInput,
} from "../domain/settings";
import {
  DuplicateMeetingBodyError,
  DuplicateRecipientError,
  TodoNotFoundError,
  type RemindLog,
  type TodoOptions,
  type TodoRepository,
} from "./todo-repository";

export function createMemoryTodoRepository(
  seed: Todo[] = [],
  seedUpdates: TodoUpdate[] = [],
): TodoRepository {
  // 방어적 복사 — 호출자가 넘긴 배열(SEED_TODOS)이 변형되지 않게 한다.
  let store: Todo[] = seed.map((t) => ({ ...t }));
  let updates: TodoUpdate[] = seedUpdates.map((u) => ({ ...u }));
  let remindLogs: RemindLog[] = [];
  let settings: AppSettings = { ...EMPTY_SETTINGS };
  let recipients: Recipient[] = [];
  let meetingBodies: MeetingBody[] = [];
  let updateFiles: UpdateFile[] = [];
  /** todoId → recipientId[] */
  let todoRecipients = new Map<string, string[]>();
  let sequence = 0;

  const nextId = () => `todo-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`;

  /** 남아있는 최신 이력을 부모 To-do의 현재 상태로 반영한다. */
  const syncCurrentState = (todoId: string) => {
    const current = toCurrentState(updates.filter((u) => u.todoId === todoId));
    if (!current) return;
    store = store.map((t) =>
      t.id === todoId ? { ...t, ...current, updatedAt: new Date().toISOString() } : t,
    );
  };

  return {
    async list(query: TodoQuery): Promise<Paged<Todo>> {
      const filtered = applyFilter(store, query.filter);
      const sorted = applySort(filtered, query.sort);
      return {
        rows: paginate(sorted, query.page, query.pageSize).map((t) => ({ ...t })),
        total: filtered.length,
        page: query.page,
        pageSize: query.pageSize,
      };
    },

    async listAll(filter: TodoFilter = {}): Promise<Todo[]> {
      return applyFilter(store, filter).map((t) => ({ ...t }));
    },

    async findById(id: string): Promise<Todo | null> {
      const found = store.find((t) => t.id === id);
      return found ? { ...found } : null;
    },

    async create(input: TodoInput): Promise<Todo> {
      const now = new Date().toISOString();
      const todo: Todo = {
        ...input,
        id: nextId(),
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store = [...store, todo];
      return { ...todo };
    },

    async update(id: string, input: TodoInput): Promise<Todo> {
      const index = store.findIndex((t) => t.id === id);
      if (index === -1) throw new TodoNotFoundError(id);

      const updated: Todo = {
        ...store[index],
        ...input,
        id,
        // completedAt은 input에 없다 — 폼 저장이 완료 상태를 건드리지 않게 한다.
        completedAt: store[index].completedAt,
        updatedAt: new Date().toISOString(),
      };
      store = store.map((t, i) => (i === index ? updated : t));
      return { ...updated };
    },

    async setCompleted(id: string, done: boolean): Promise<Todo> {
      const index = store.findIndex((t) => t.id === id);
      if (index === -1) throw new TodoNotFoundError(id);

      const current = store[index];
      // 이미 같은 상태면 완료 시각을 다시 찍지 않는다 (두 번 눌러도 날짜가 안 밀린다).
      if (done === (current.completedAt !== null)) return { ...current };

      const now = new Date().toISOString();
      const updated: Todo = {
        ...current,
        completedAt: done ? now : null,
        updatedAt: now,
      };
      store = store.map((t, i) => (i === index ? updated : t));
      return { ...updated };
    },

    async remove(id: string): Promise<string[]> {
      const target = store.find((t) => t.id === id);
      const next = store.filter((t) => t.id !== id);
      if (next.length === store.length) throw new TodoNotFoundError(id);
      store = next;

      // 지시사항 본문 첨부도 함께 정리 대상이다.
      const ownKeys = storageKeysOf(target?.attachments ?? []);

      // DB의 ON DELETE CASCADE와 같은 동작을 맞춘다.
      const removedUpdateIds = new Set(
        updates.filter((u) => u.todoId === id).map((u) => u.id),
      );
      updates = updates.filter((u) => u.todoId !== id);

      const orphaned = updateFiles.filter((f) => removedUpdateIds.has(f.updateId));
      updateFiles = updateFiles.filter((f) => !removedUpdateIds.has(f.updateId));
      // 스토리지 객체는 cascade가 지워 주지 않는다 — 호출자가 지울 키를 넘긴다.
      return [...orphaned.map((f) => f.storageKey), ...ownKeys];
    },

    async listUpdates(todoId: string): Promise<TodoUpdate[]> {
      return sortByNewest(updates.filter((u) => u.todoId === todoId)).map((u) => ({ ...u }));
    },

    async countUpdates(todoIds: string[]): Promise<Record<string, number>> {
      const wanted = new Set(todoIds);
      const counts: Record<string, number> = {};
      for (const id of todoIds) counts[id] = 0;
      for (const u of updates) {
        if (wanted.has(u.todoId)) counts[u.todoId] += 1;
      }
      return counts;
    },

    async addUpdate(todoId: string, input: TodoUpdateInput): Promise<TodoUpdate> {
      if (!store.some((t) => t.id === todoId)) throw new TodoNotFoundError(todoId);

      const update: TodoUpdate = {
        id: `upd-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`,
        todoId,
        note: input.note,
        signal: input.signal,
        author: input.author ?? null,
        createdAt: new Date().toISOString(),
      };
      updates = [...updates, update];
      syncCurrentState(todoId);
      return { ...update };
    },

    async recordRemind(entry) {
      const now = new Date().toISOString();
      remindLogs = [
        ...remindLogs,
        {
          id: `rl-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`,
          todoId: entry.todoId,
          recipient: entry.recipient,
          status: entry.status,
          sentAt: entry.status === "sent" ? now : null,
          createdAt: now,
        },
      ];
      store = store.map((t) =>
        t.id === entry.todoId
          ? { ...t, remindStatus: entry.status === "sent" ? "sent" : "wait" }
          : t,
      );
    },

    async listRemindLogs(todoId: string): Promise<RemindLog[]> {
      return remindLogs
        .filter((l) => l.todoId === todoId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((l) => ({ ...l }));
    },

    async removeUpdate(updateId: string): Promise<string[]> {
      const target = updates.find((u) => u.id === updateId);
      if (!target) throw new TodoNotFoundError(updateId);
      updates = updates.filter((u) => u.id !== updateId);

      const orphaned = updateFiles.filter((f) => f.updateId === updateId);
      updateFiles = updateFiles.filter((f) => f.updateId !== updateId);

      syncCurrentState(target.todoId);
      return orphaned.map((f) => f.storageKey);
    },

    // ── 이력 첨부 파일 ────────────────────────────────────

    async addUpdateFiles(updateId: string, files: UpdateFileInput[]) {
      if (!updates.some((u) => u.id === updateId)) throw new TodoNotFoundError(updateId);

      const created = files.map((f) => ({
        ...f,
        id: `f-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`,
        updateId,
        createdAt: new Date().toISOString(),
      }));
      updateFiles = [...updateFiles, ...created];
      return created.map((f) => ({ ...f }));
    },

    async listUpdateFilesFor(updateIds: string[]) {
      const out: Record<string, UpdateFile[]> = {};
      for (const id of updateIds) {
        out[id] = updateFiles
          .filter((f) => f.updateId === id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((f) => ({ ...f }));
      }
      return out;
    },

    async findUpdateFile(fileId: string) {
      const found = updateFiles.find((f) => f.id === fileId);
      return found ? { ...found } : null;
    },

    async removeUpdateFile(fileId: string) {
      const found = updateFiles.find((f) => f.id === fileId);
      if (!found) throw new TodoNotFoundError(fileId);
      updateFiles = updateFiles.filter((f) => f.id !== fileId);
      return found.storageKey;
    },

    async aggregate(filter: TodoFilter = {}) {
      return aggregateTodos(applyFilter(store, filter));
    },

    async options(): Promise<TodoOptions> {
      return deriveOptions(store);
    },

    // ── 설정 ──────────────────────────────────────────────

    async getSettings() {
      return { ...settings };
    },

    async saveSettings(next) {
      settings = { ...next };
    },

    // ── 회의체 마스터 ─────────────────────────────────────

    async listMeetingBodies() {
      return meetingBodies
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "ko"))
        .map((m) => ({ ...m }));
    },

    async createMeetingBody(input: MeetingBodyInput) {
      const name = normalizeMeetingBodyName(input.name);
      if (meetingBodies.some((m) => isSameMeetingBody(m.name, name))) {
        throw new DuplicateMeetingBodyError(name);
      }
      const created: MeetingBody = {
        id: `mtg-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`,
        name,
        createdAt: new Date().toISOString(),
      };
      meetingBodies = [...meetingBodies, created];
      return { ...created };
    },

    async updateMeetingBody(id: string, input: MeetingBodyInput) {
      const index = meetingBodies.findIndex((m) => m.id === id);
      if (index === -1) throw new TodoNotFoundError(id);

      const name = normalizeMeetingBodyName(input.name);
      if (meetingBodies.some((m) => m.id !== id && isSameMeetingBody(m.name, name))) {
        throw new DuplicateMeetingBodyError(name);
      }

      // 이름을 바꾸면 이미 등록된 지시사항의 표기도 따라간다.
      const previous = meetingBodies[index].name;
      const updated: MeetingBody = { ...meetingBodies[index], name };
      meetingBodies = meetingBodies.map((m, i) => (i === index ? updated : m));

      if (!isSameMeetingBody(previous, name)) {
        const now = new Date().toISOString();
        store = store.map((t) =>
          isSameMeetingBody(t.meetingBody, previous)
            ? { ...t, meetingBody: name, updatedAt: now }
            : t,
        );
      }
      return { ...updated };
    },

    async removeMeetingBody(id: string) {
      const next = meetingBodies.filter((m) => m.id !== id);
      if (next.length === meetingBodies.length) throw new TodoNotFoundError(id);
      // 지시사항의 meeting_body는 텍스트라 그대로 남는다 — 과거 기록은 보존한다.
      meetingBodies = next;
    },

    async countMeetingBodyUsage() {
      const counts: Record<string, number> = {};
      for (const m of meetingBodies) {
        counts[m.id] = store.filter((t) => isSameMeetingBody(t.meetingBody, m.name)).length;
      }
      return counts;
    },

    async ensureMeetingBody(name: string) {
      const normalized = normalizeMeetingBodyName(name);
      const found = meetingBodies.find((m) => isSameMeetingBody(m.name, normalized));
      if (found) return { ...found };

      const created: MeetingBody = {
        id: `mtg-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`,
        name: normalized,
        createdAt: new Date().toISOString(),
      };
      meetingBodies = [...meetingBodies, created];
      return { ...created };
    },

    // ── 수신자 마스터 ─────────────────────────────────────

    async listRecipients() {
      return recipients
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "ko"))
        .map((r) => ({ ...r }));
    },

    async createRecipient(input: RecipientInput) {
      const key = input.email.toLowerCase();
      if (recipients.some((r) => r.email.toLowerCase() === key)) {
        throw new DuplicateRecipientError(input.email);
      }
      const created: Recipient = {
        ...input,
        id: `rcp-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`,
        createdAt: new Date().toISOString(),
      };
      recipients = [...recipients, created];
      return { ...created };
    },

    async updateRecipient(id: string, input: RecipientInput) {
      const index = recipients.findIndex((r) => r.id === id);
      if (index === -1) throw new TodoNotFoundError(id);

      const key = input.email.toLowerCase();
      if (recipients.some((r) => r.id !== id && r.email.toLowerCase() === key)) {
        throw new DuplicateRecipientError(input.email);
      }
      const updated: Recipient = { ...recipients[index], ...input };
      recipients = recipients.map((r, i) => (i === index ? updated : r));
      return { ...updated };
    },

    async removeRecipient(id: string) {
      const next = recipients.filter((r) => r.id !== id);
      if (next.length === recipients.length) throw new TodoNotFoundError(id);
      recipients = next;
      // DB의 ON DELETE CASCADE와 동작을 맞춘다.
      todoRecipients = new Map(
        [...todoRecipients].map(([todoId, ids]) => [todoId, ids.filter((i) => i !== id)]),
      );
    },

    async countRecipientUsage() {
      const counts: Record<string, number> = {};
      for (const r of recipients) counts[r.id] = 0;
      for (const ids of todoRecipients.values()) {
        for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },

    // ── 지시사항별 추가 수신자 ────────────────────────────

    async listTodoRecipients(todoId: string) {
      const ids = new Set(todoRecipients.get(todoId) ?? []);
      return recipients
        .filter((r) => ids.has(r.id))
        .sort((a, b) => a.name.localeCompare(b.name, "ko"))
        .map((r) => ({ ...r }));
    },

    async listTodoRecipientsFor(todoIds: string[]) {
      const out: Record<string, Recipient[]> = {};
      for (const todoId of todoIds) {
        const ids = new Set(todoRecipients.get(todoId) ?? []);
        out[todoId] = recipients
          .filter((r) => ids.has(r.id))
          .sort((a, b) => a.name.localeCompare(b.name, "ko"))
          .map((r) => ({ ...r }));
      }
      return out;
    },

    async setTodoRecipients(todoId: string, recipientIds: string[]) {
      const valid = recipientIds.filter((id) => recipients.some((r) => r.id === id));
      todoRecipients.set(todoId, [...new Set(valid)]);
    },
  };
}

/**
 * 조직·이름·회의체 선택지를 현재 데이터에서 유도한다.
 * 인사정보 연동 전까지는 이미 등록된 값이 곧 마스터 역할을 한다.
 */
export function deriveOptions(todos: Todo[]): TodoOptions {
  const meetingBodies = new Set<string>();
  const orgs = new Set<string>();
  const people = new Map<string, string>();

  for (const t of todos) {
    meetingBodies.add(t.meetingBody);
    orgs.add(t.org);
    people.set(t.assigneeName, t.org);
  }

  const ko = (a: string, b: string) => a.localeCompare(b, "ko");

  return {
    meetingBodies: [...meetingBodies].sort(ko),
    orgs: [...orgs].sort(ko),
    people: [...people.entries()]
      .map(([name, org]) => ({ name, org }))
      .sort((a, b) => ko(a.name, b.name)),
  };
}
