/**
 * 리포지토리 계약 테스트.
 *
 * 어댑터가 무엇이든 여기 적힌 대로 동작해야 한다. 인메모리·Supabase·MariaDB가
 * 같은 파일을 돌린다 — 사내 MariaDB에 붙일 때 이 스위트가 통과하면 화면을
 * 열어 보지 않고도 어댑터가 맞게 붙었다고 말할 수 있다.
 *
 * 시드에 기대지 않는다. 각 테스트가 필요한 데이터를 직접 만든다 —
 * 빈 DB에 그대로 돌릴 수 있어야 하기 때문이다.
 *
 * 쓰는 법:
 *   runRepositoryContract({ name: "MariaDB", makeRepository: async () => {...} })
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SORT } from "@/lib/domain/query";
import type { TodoInput } from "@/lib/domain/todo";
import {
  DuplicateMeetingBodyError,
  TodoNotFoundError,
  type TodoRepository,
} from "@/lib/repository/todo-repository";

export const CONTRACT_INPUT: TodoInput = {
  instructedAt: "2026-08-12",
  dueDate: "2026-08-20",
  meetingBody: "주간 경영회의",
  org: "영업본부",
  assigneeName: "홍길동",
  assigneeTitle: "본부장",
  assigneeEmail: null,
  category: "전략검토",
  detail: "신규 과제",
  progressNote: "미착수",
  signal: "G",
  remindStatus: "wait",
  attachments: [],
};

export type ContractOptions = {
  /** 실패 메시지에 나올 이름 */
  name: string;
  /** 테스트마다 비어 있는 리포지토리를 돌려준다 */
  makeRepository: () => Promise<TodoRepository> | TodoRepository;
  /** 커넥션 풀 정리 등 */
  teardown?: () => Promise<void> | void;
};

export function runRepositoryContract({
  name,
  makeRepository,
  teardown,
}: ContractOptions) {
  describe(`${name} — 리포지토리 계약`, () => {
    let repo: TodoRepository;

    beforeEach(async () => {
      repo = await makeRepository();
    });

    afterAll(async () => {
      await teardown?.();
    });

    const make = (patch: Partial<TodoInput> = {}) =>
      repo.create({ ...CONTRACT_INPUT, ...patch });

    // ── 기본 CRUD ────────────────────────────────────────

    describe("create · findById", () => {
      it("id와 타임스탬프를 채워 저장한다", async () => {
        const created = await make();
        expect(created.id).toBeTruthy();
        expect(created.createdAt).toBeTruthy();
        expect(created.updatedAt).toBeTruthy();
        expect(await repo.findById(created.id)).toMatchObject({ detail: "신규 과제" });
      });

      it("연속 생성해도 id가 겹치지 않는다", async () => {
        const a = await make();
        const b = await make();
        expect(a.id).not.toBe(b.id);
      });

      it("없는 id는 null", async () => {
        expect(await repo.findById("00000000-0000-4000-8000-000000000000")).toBeNull();
      });

      it("날짜는 시각 없이 YYYY-MM-DD로 돌아온다", async () => {
        // DB가 Date로 돌려주므로 타임존 때문에 하루 밀리기 쉬운 자리다.
        const created = await make({ instructedAt: "2026-01-01", dueDate: "2026-12-31" });
        expect(created.instructedAt).toBe("2026-01-01");
        expect(created.dueDate).toBe("2026-12-31");
      });

      it("첨부 배열이 값 그대로 돌아온다", async () => {
        const attachments = [
          { id: "a1", name: "보고서.pdf", size: 1234, contentType: "application/pdf", storageKey: "todos/x.pdf" },
        ];
        const created = await make({ attachments });
        expect(created.attachments).toEqual(attachments);
        expect((await repo.findById(created.id))?.attachments).toEqual(attachments);
      });
    });

    describe("update", () => {
      it("필드를 갱신하고 id는 유지한다", async () => {
        const created = await make();
        const updated = await repo.update(created.id, {
          ...CONTRACT_INPUT,
          detail: "수정된 내용",
        });
        expect(updated.id).toBe(created.id);
        expect(updated.detail).toBe("수정된 내용");
      });

      it("없는 id면 TodoNotFoundError", async () => {
        await expect(
          repo.update("00000000-0000-4000-8000-000000000000", CONTRACT_INPUT),
        ).rejects.toThrow(TodoNotFoundError);
      });
    });

    describe("remove", () => {
      it("삭제 후 목록에서 사라진다", async () => {
        const created = await make();
        await repo.remove(created.id);
        expect(await repo.findById(created.id)).toBeNull();
      });

      it("없는 id면 TodoNotFoundError", async () => {
        await expect(
          repo.remove("00000000-0000-4000-8000-000000000000"),
        ).rejects.toThrow(TodoNotFoundError);
      });

      it("딸린 첨부의 스토리지 키를 돌려준다", async () => {
        // 호출자가 이 키로 실물을 지운다. 빠뜨리면 아무도 손댈 수 없는 파일이 남는다.
        const created = await make({
          attachments: [
            { id: "a1", name: "본문.pdf", size: 1, contentType: null, storageKey: "todos/본문키" },
          ],
        });
        const update = await repo.addUpdate(created.id, { note: "진행", signal: "G" });
        await repo.addUpdateFiles(update.id, [
          { name: "이력.pdf", size: 2, contentType: null, storageKey: "updates/이력키" },
        ]);

        const keys = await repo.remove(created.id);
        expect(keys).toContain("todos/본문키");
        expect(keys).toContain("updates/이력키");
      });
    });

    // ── 목록·페이지네이션 ────────────────────────────────

    describe("list", () => {
      it("페이지 크기를 지키고 total은 필터 결과 전체를 센다", async () => {
        for (let i = 0; i < 5; i += 1) await make({ detail: `건 ${i}` });

        const page = await repo.list({
          filter: {},
          sort: DEFAULT_SORT,
          page: 1,
          pageSize: 2,
        });
        expect(page.rows).toHaveLength(2);
        expect(page.total).toBe(5);
        expect(page.page).toBe(1);
        expect(page.pageSize).toBe(2);
      });

      it("페이지를 이어 읽어도 겹치거나 빠지지 않는다", async () => {
        // 정렬 동률에서 순서가 흔들리면 여기서 드러난다 — 전부 같은 due_date로 만든다.
        for (let i = 0; i < 7; i += 1) await make({ detail: `건 ${i}` });

        const seen: string[] = [];
        for (const page of [1, 2, 3, 4]) {
          const got = await repo.list({
            filter: {},
            sort: DEFAULT_SORT,
            page,
            pageSize: 2,
          });
          seen.push(...got.rows.map((r) => r.id));
        }
        expect(seen).toHaveLength(7);
        expect(new Set(seen).size).toBe(7);
      });

      it("필터가 걸린다", async () => {
        await make({ assigneeName: "홍길동", category: "전략검토" });
        await make({ assigneeName: "김철수", category: "이행점검" });

        const page = await repo.list({
          filter: { assigneeName: "김철수" },
          sort: DEFAULT_SORT,
          page: 1,
          pageSize: 10,
        });
        expect(page.total).toBe(1);
        expect(page.rows[0].assigneeName).toBe("김철수");
      });

      it("미결/완료 필터가 완료일로 갈린다", async () => {
        const open = await make({ detail: "미결 건" });
        const done = await make({ detail: "완료 건" });
        await repo.setCompleted(done.id, true);

        expect((await repo.listAll({ status: "open" })).map((t) => t.id)).toEqual([open.id]);
        expect((await repo.listAll({ status: "done" })).map((t) => t.id)).toEqual([done.id]);
        expect(await repo.listAll({})).toHaveLength(2);
      });
    });

    // ── 완료 처리 ────────────────────────────────────────

    describe("setCompleted", () => {
      it("완료하면 완료일이 생기고, 취소하면 사라진다", async () => {
        const created = await make();
        expect(created.completedAt).toBeNull();

        const done = await repo.setCompleted(created.id, true);
        expect(done.completedAt).toBeTruthy();

        const undone = await repo.setCompleted(created.id, false);
        expect(undone.completedAt).toBeNull();
      });

      it("두 번 완료해도 완료일이 밀리지 않는다", async () => {
        // 실수로 다시 누르면 "언제 끝났는가"가 오늘로 덮여 버린다.
        const created = await make();
        const first = await repo.setCompleted(created.id, true);
        const second = await repo.setCompleted(created.id, true);
        expect(second.completedAt).toBe(first.completedAt);
      });

      it("없는 id면 TodoNotFoundError", async () => {
        await expect(
          repo.setCompleted("00000000-0000-4000-8000-000000000000", true),
        ).rejects.toThrow(TodoNotFoundError);
      });
    });

    // ── 진행 이력 ────────────────────────────────────────

    describe("진행 이력", () => {
      it("추가하면 지시사항의 현재 상태가 그 값이 된다", async () => {
        const created = await make({ progressNote: "미착수", signal: "G" });
        await repo.addUpdate(created.id, { note: "협의 완료", signal: "Y" });

        const after = await repo.findById(created.id);
        expect(after?.progressNote).toBe("협의 완료");
        expect(after?.signal).toBe("Y");
      });

      it("최신순으로 돌아온다", async () => {
        const created = await make();
        await repo.addUpdate(created.id, { note: "첫 번째", signal: "G" });
        await repo.addUpdate(created.id, { note: "두 번째", signal: "R" });

        const updates = await repo.listUpdates(created.id);
        expect(updates).toHaveLength(2);
        expect(updates[0].note).toBe("두 번째");
      });

      it("지우면 남은 최신 이력이 현재 상태가 된다", async () => {
        const created = await make();
        await repo.addUpdate(created.id, { note: "첫 번째", signal: "G" });
        const second = await repo.addUpdate(created.id, { note: "두 번째", signal: "R" });

        await repo.removeUpdate(second.id);
        const after = await repo.findById(created.id);
        expect(after?.progressNote).toBe("첫 번째");
        expect(after?.signal).toBe("G");
      });

      it("없는 지시사항에는 달 수 없다", async () => {
        await expect(
          repo.addUpdate("00000000-0000-4000-8000-000000000000", {
            note: "n",
            signal: "G",
          }),
        ).rejects.toThrow(TodoNotFoundError);
      });

      it("여러 건의 이력 수를 한 번에 센다", async () => {
        const a = await make();
        const b = await make();
        await repo.addUpdate(a.id, { note: "1", signal: "G" });
        await repo.addUpdate(a.id, { note: "2", signal: "G" });

        const counts = await repo.countUpdates([a.id, b.id]);
        expect(counts[a.id]).toBe(2);
        // 이력이 없어도 키는 있어야 한다 — 화면이 undefined를 만나지 않게.
        expect(counts[b.id]).toBe(0);
      });
    });

    // ── 이력 첨부 ────────────────────────────────────────

    describe("이력 첨부", () => {
      it("붙이고 이력별로 읽는다", async () => {
        const created = await make();
        const update = await repo.addUpdate(created.id, { note: "n", signal: "G" });

        const files = await repo.addUpdateFiles(update.id, [
          { name: "가.pdf", size: 10, contentType: "application/pdf", storageKey: "updates/가" },
          { name: "나.png", size: 20, contentType: "image/png", storageKey: "updates/나" },
        ]);
        expect(files).toHaveLength(2);

        const byUpdate = await repo.listUpdateFilesFor([update.id]);
        expect(byUpdate[update.id]).toHaveLength(2);
        expect(byUpdate[update.id].map((f) => f.name).sort()).toEqual(["가.pdf", "나.png"]);
      });

      it("한 건을 지우면 스토리지 키를 돌려준다", async () => {
        const created = await make();
        const update = await repo.addUpdate(created.id, { note: "n", signal: "G" });
        const [file] = await repo.addUpdateFiles(update.id, [
          { name: "가.pdf", size: 10, contentType: null, storageKey: "updates/가" },
        ]);

        expect(await repo.removeUpdateFile(file.id)).toBe("updates/가");
        expect(await repo.findUpdateFile(file.id)).toBeNull();
      });

      it("이력을 지우면 딸린 첨부 키가 함께 돌아온다", async () => {
        const created = await make();
        const update = await repo.addUpdate(created.id, { note: "n", signal: "G" });
        await repo.addUpdateFiles(update.id, [
          { name: "가.pdf", size: 10, contentType: null, storageKey: "updates/가" },
        ]);

        expect(await repo.removeUpdate(update.id)).toEqual(["updates/가"]);
      });

      it("빈 목록을 넣으면 아무 일도 없다", async () => {
        const created = await make();
        const update = await repo.addUpdate(created.id, { note: "n", signal: "G" });
        expect(await repo.addUpdateFiles(update.id, [])).toEqual([]);
      });
    });

    // ── Remind 발송 이력 ─────────────────────────────────

    describe("Remind 발송 이력", () => {
      it("성공을 남기면 상태가 sent가 된다", async () => {
        const created = await make({ remindStatus: "wait" });
        await repo.recordRemind({
          todoId: created.id,
          recipient: "a@example.com",
          recipientName: "홍길동",
          recipientTitle: "본부장",
          status: "sent",
        });

        const logs = await repo.listRemindLogs(created.id);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({
          recipient: "a@example.com",
          recipientName: "홍길동",
          recipientTitle: "본부장",
          status: "sent",
        });
        expect(logs[0].sentAt).toBeTruthy();
        expect((await repo.findById(created.id))?.remindStatus).toBe("sent");
      });

      it("실패는 wait로 되돌려 재시도할 수 있게 한다", async () => {
        const created = await make({ remindStatus: "none" });
        await repo.recordRemind({
          todoId: created.id,
          recipient: "a@example.com",
          status: "failed",
          error: "이유",
        });

        expect((await repo.findById(created.id))?.remindStatus).toBe("wait");
        const logs = await repo.listRemindLogs(created.id);
        expect(logs[0].status).toBe("failed");
        expect(logs[0].sentAt).toBeNull();
      });
    });

    // ── 설정 ─────────────────────────────────────────────

    describe("설정", () => {
      it("저장한 값을 그대로 읽는다", async () => {
        await repo.saveSettings({
          assistantName: "홍길동",
          assistantEmail: "assistant@example.com",
        });
        expect(await repo.getSettings()).toEqual({
          assistantName: "홍길동",
          assistantEmail: "assistant@example.com",
        });
      });

      it("두 번 저장해도 행이 늘지 않고 덮어쓴다", async () => {
        await repo.saveSettings({ assistantName: "첫번째", assistantEmail: null });
        await repo.saveSettings({ assistantName: "두번째", assistantEmail: null });
        expect((await repo.getSettings()).assistantName).toBe("두번째");
      });
    });

    // ── 회의체 ───────────────────────────────────────────

    describe("회의체", () => {
      it("만들고 이름순으로 읽는다", async () => {
        await repo.createMeetingBody({ name: "나회의" });
        await repo.createMeetingBody({ name: "가회의" });
        const list = await repo.listMeetingBodies();
        expect(list.map((b) => b.name)).toEqual(["가회의", "나회의"]);
      });

      it("같은 이름은 거절한다", async () => {
        await repo.createMeetingBody({ name: "주간 경영회의" });
        await expect(
          repo.createMeetingBody({ name: "주간 경영회의" }),
        ).rejects.toThrow(DuplicateMeetingBodyError);
      });

      it("이름을 바꾸면 지시사항의 표기도 함께 바뀐다", async () => {
        // 지시사항은 회의체를 텍스트로 들고 있다. 마스터만 고치면 목록이 둘로 갈린다.
        const body = await repo.createMeetingBody({ name: "옛이름" });
        const todo = await make({ meetingBody: "옛이름" });

        await repo.updateMeetingBody(body.id, { name: "새이름" });
        expect((await repo.findById(todo.id))?.meetingBody).toBe("새이름");
      });

      it("지워도 지시사항의 표기는 남는다", async () => {
        const body = await repo.createMeetingBody({ name: "없앨회의" });
        const todo = await make({ meetingBody: "없앨회의" });

        await repo.removeMeetingBody(body.id);
        // 과거 기록은 보존한다.
        expect((await repo.findById(todo.id))?.meetingBody).toBe("없앨회의");
      });

      it("사용 건수를 센다", async () => {
        const body = await repo.createMeetingBody({ name: "쓰는회의" });
        const unused = await repo.createMeetingBody({ name: "안쓰는회의" });
        await make({ meetingBody: "쓰는회의" });
        await make({ meetingBody: "쓰는회의" });

        const usage = await repo.countMeetingBodyUsage();
        expect(usage[body.id]).toBe(2);
        expect(usage[unused.id]).toBe(0);
      });

      it("ensure는 있으면 재사용하고 없으면 만든다", async () => {
        const first = await repo.ensureMeetingBody("직접 입력한 회의");
        const second = await repo.ensureMeetingBody("직접 입력한 회의");
        expect(second.id).toBe(first.id);
        expect(await repo.listMeetingBodies()).toHaveLength(1);
      });

      it("없는 id는 TodoNotFoundError", async () => {
        await expect(
          repo.removeMeetingBody("00000000-0000-4000-8000-000000000000"),
        ).rejects.toThrow(TodoNotFoundError);
      });
    });

    // ── 사원 명부 ────────────────────────────────────────

    describe("사원 명부", () => {
      const roster = [
        { name: "홍길동", email: "hong@example.com", department: "가상1팀", title: "매니저" },
        { name: "김철수", email: "kim@example.com", department: "가상2팀", title: "실장" },
      ];

      it("전량 교체하고 이름순으로 읽는다", async () => {
        expect(await repo.replaceEmployees(roster)).toBe(2);
        const list = await repo.listEmployees();
        expect(list.map((e) => e.name)).toEqual(["김철수", "홍길동"]);
        expect(list[1]).toMatchObject({ department: "가상1팀", title: "매니저" });
      });

      it("다시 올리면 이전 명부가 남지 않는다", async () => {
        await repo.replaceEmployees(roster);
        await repo.replaceEmployees([
          { name: "이영희", email: "lee@example.com", department: "가상3팀", title: "팀장" },
        ]);
        const list = await repo.listEmployees();
        expect(list).toHaveLength(1);
        expect(list[0].name).toBe("이영희");
      });

      it("중복 이메일이 섞이면 아무것도 바뀌지 않는다", async () => {
        // 한 트랜잭션이어야 한다. 아니면 명부가 반쯤 지워진 채 남는다.
        await repo.replaceEmployees(roster);
        await expect(
          repo.replaceEmployees([
            { name: "가", email: "dup@example.com", department: "", title: "" },
            { name: "나", email: "dup@example.com", department: "", title: "" },
          ]),
        ).rejects.toThrow();
        expect(await repo.listEmployees()).toHaveLength(2);
      });

      it("비운다", async () => {
        await repo.replaceEmployees(roster);
        await repo.clearEmployees();
        expect(await repo.listEmployees()).toEqual([]);
      });
    });

    // ── 지시사항별 추가 수신자 ───────────────────────────

    describe("추가 수신자", () => {
      it("설정하고 읽는다", async () => {
        const todo = await make();
        await repo.setTodoRecipients(todo.id, [
          { email: "a@example.com", name: "가" },
          { email: "b@example.com", name: "나" },
        ]);
        const list = await repo.listTodoRecipients(todo.id);
        expect(list.map((r) => r.email).sort()).toEqual(["a@example.com", "b@example.com"]);
      });

      it("다시 설정하면 이전 지정이 사라진다", async () => {
        const todo = await make();
        await repo.setTodoRecipients(todo.id, [{ email: "a@example.com", name: "가" }]);
        await repo.setTodoRecipients(todo.id, [{ email: "b@example.com", name: "나" }]);
        const list = await repo.listTodoRecipients(todo.id);
        expect(list).toHaveLength(1);
        expect(list[0].email).toBe("b@example.com");
      });

      it("같은 주소가 두 번 오면 한 번만 넣는다", async () => {
        // 복합 PK에 걸려 저장 자체가 실패하는 것을 막는다.
        const todo = await make();
        await repo.setTodoRecipients(todo.id, [
          { email: "a@example.com", name: "가" },
          { email: "A@Example.com", name: "가(중복)" },
        ]);
        expect(await repo.listTodoRecipients(todo.id)).toHaveLength(1);
      });

      it("빈 목록이면 모두 지운다", async () => {
        const todo = await make();
        await repo.setTodoRecipients(todo.id, [{ email: "a@example.com", name: "가" }]);
        await repo.setTodoRecipients(todo.id, []);
        expect(await repo.listTodoRecipients(todo.id)).toEqual([]);
      });

      it("여러 건을 한 번에 읽어도 키가 빠지지 않는다", async () => {
        const a = await make();
        const b = await make();
        await repo.setTodoRecipients(a.id, [{ email: "a@example.com", name: "가" }]);

        const map = await repo.listTodoRecipientsFor([a.id, b.id]);
        expect(map[a.id]).toHaveLength(1);
        expect(map[b.id]).toEqual([]);
      });
    });

    // ── 선택지 유도 ──────────────────────────────────────

    describe("options", () => {
      it("등록된 데이터에서 선택지를 유도한다", async () => {
        await make({ meetingBody: "주간 경영회의", org: "영업본부", assigneeName: "홍길동" });
        await make({ meetingBody: "주간 경영회의", org: "기획본부", assigneeName: "김철수" });

        const options = await repo.options();
        expect(options.meetingBodies).toContain("주간 경영회의");
        expect(options.orgs).toEqual(expect.arrayContaining(["영업본부", "기획본부"]));
        // 이름은 중복 없이 한 번씩만
        expect(new Set(options.people.map((p) => p.name)).size).toBe(options.people.length);
      });
    });

    // ── 집계 ─────────────────────────────────────────────

    describe("aggregate", () => {
      it("완료된 건은 미결 집계에서 빠진다", async () => {
        await make({ assigneeName: "홍길동" });
        const done = await make({ assigneeName: "홍길동" });
        await repo.setCompleted(done.id, true);

        const agg = await repo.aggregate({ status: "open" });
        const person = agg.people.find((p) => p.assigneeName === "홍길동");
        expect(person?.open).toBe(1);
        expect(agg.total).toBe(1);
      });
    });
  });
}
