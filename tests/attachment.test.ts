/**
 * 이력 첨부 — 파일명 정리, 크기·개수 제한, 리포지토리 계약.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  buildStorageKey,
  buildTodoAttachmentKey,
  checkFiles,
  extensionOf,
  formatBytes,
  MAX_FILES_PER_UPDATE,
  MAX_FILE_BYTES,
  toSafeFileName,
} from "@/lib/domain/attachment";
import { createMemoryTodoRepository } from "@/lib/repository/memory-todo-repository";
import { TodoNotFoundError, type TodoRepository } from "@/lib/repository/todo-repository";
import { isStored, type TodoInput } from "@/lib/domain/todo";

const INPUT: TodoInput = {
  instructedAt: "2026-08-24",
  dueDate: "2026-08-28",
  meetingBody: "주간 경영회의",
  org: "영업본부",
  assigneeName: "박현수 본부장",
  assigneeEmail: null,
  category: "전략검토",
  detail: "과제",
  progressNote: "",
  signal: "G",
  remindStatus: "wait",
  attachment: null,
};

const file = (name: string, size = 1024) => ({
  name,
  size,
  contentType: "application/pdf",
  storageKey: `updates/x/1-${name}`,
});

describe("formatBytes", () => {
  it("KB·MB로 읽기 쉽게", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(500)).toBe("1 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("toSafeFileName", () => {
  it("한글은 살린다", () => {
    // 사내 문서 이름이 대부분 한글이라 죽이면 무슨 파일인지 알 수 없다.
    expect(toSafeFileName("2026년 전략 보고서.pdf")).toBe("2026년 전략 보고서.pdf");
  });

  it("경로를 빠져나가려는 시도를 막는다", () => {
    expect(toSafeFileName("../../etc/passwd")).toBe("passwd");
    expect(toSafeFileName("..\\..\\win.ini")).toBe("win.ini");
    expect(toSafeFileName("....//evil.sh")).not.toContain("..");
  });

  it("경로 구분자를 없애고 마지막 이름만 남긴다", () => {
    expect(toSafeFileName("a/b/c/보고서.xlsx")).toBe("보고서.xlsx");
  });

  it("예약 문자는 밑줄로 바꾼다", () => {
    expect(toSafeFileName('보고?서*.pdf')).toBe("보고_서_.pdf");
  });

  it("앞의 점을 떼어 숨김 파일이 되지 않게 한다", () => {
    expect(toSafeFileName(".env")).toBe("env");
  });

  it("비면 기본 이름을 준다", () => {
    expect(toSafeFileName("")).toBe("file");
    expect(toSafeFileName("...")).toBe("file");
  });

  it("아주 긴 이름은 잘라낸다", () => {
    expect(toSafeFileName("가".repeat(300)).length).toBe(120);
  });
});

describe("checkFiles", () => {
  it("첨부가 없으면 통과", () => {
    expect(checkFiles([])).toEqual({ ok: true });
  });

  it("개수 제한", () => {
    const many = Array.from({ length: MAX_FILES_PER_UPDATE + 1 }, (_, i) => ({
      name: `f${i}`,
      size: 10,
    }));
    const result = checkFiles(many);
    expect(result.ok).toBe(false);
  });

  it("이미 붙어 있는 개수까지 합쳐 센다", () => {
    expect(checkFiles([{ name: "a", size: 10 }], MAX_FILES_PER_UPDATE).ok).toBe(false);
  });

  it("한 파일 크기 제한", () => {
    const result = checkFiles([{ name: "big.zip", size: MAX_FILE_BYTES + 1 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("big.zip");
  });

  it("빈 파일은 막는다", () => {
    // 파일을 고르지 않은 input이 보내는 0바이트 항목을 그대로 저장하면 안 된다.
    expect(checkFiles([{ name: "empty.txt", size: 0 }]).ok).toBe(false);
  });

  it("합계 제한", () => {
    const files = Array.from({ length: 3 }, (_, i) => ({
      name: `f${i}`,
      size: 9 * 1024 * 1024,
    }));
    expect(checkFiles(files).ok).toBe(false);
  });

  it("한도 안이면 통과", () => {
    expect(checkFiles([{ name: "ok.pdf", size: 1024 }]).ok).toBe(true);
  });
});

describe("extensionOf", () => {
  it("소문자 확장자를 뽑는다", () => {
    expect(extensionOf("보고서.PDF")).toBe(".pdf");
    expect(extensionOf("자료.xlsx")).toBe(".xlsx");
  });
  it("없으면 빈 문자열", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("이름.너무긴확장자아님")).toBe("");
  });
});

describe("buildStorageKey", () => {
  it("경로에 ASCII만 남는다", () => {
    /*
     * Supabase Storage는 키에 ASCII만 허용한다.
     * 한글 이름을 경로에 넣으면 InvalidKey로 반려된다 — 실제로 겪은 실패다.
     */
    const key = buildStorageKey("u1", "전략 검토 결과.txt", "abc-123");
    expect(key).toBe("updates/u1/abc-123.txt");
    expect(/^[\x20-\x7e]+$/.test(key)).toBe(true);
  });

  it("확장자가 없어도 유효한 키를 만든다", () => {
    expect(buildStorageKey("u1", "보고서", "abc")).toBe("updates/u1/abc");
  });

  it("이력 id로 묶는다 — 지울 때 무엇을 함께 지울지 경로로 알 수 있다", () => {
    expect(buildStorageKey("u9", "a.pdf", "k")).toMatch(/^updates\/u9\//);
  });

  it("고유값이 다르면 키가 겹치지 않는다", () => {
    expect(buildStorageKey("u1", "a.pdf", "k1")).not.toBe(
      buildStorageKey("u1", "a.pdf", "k2"),
    );
  });
});

describe("첨부 리포지토리 계약 (인메모리)", () => {
  let repository: TodoRepository;
  let todoId: string;
  let updateId: string;

  beforeEach(async () => {
    repository = createMemoryTodoRepository();
    const todo = await repository.create(INPUT);
    todoId = todo.id;
    const update = await repository.addUpdate(todoId, { note: "1차 진행", signal: "G" });
    updateId = update.id;
  });

  it("이력에 첨부를 붙이고 다시 읽는다", async () => {
    await repository.addUpdateFiles(updateId, [file("a.pdf"), file("b.xlsx")]);
    const map = await repository.listUpdateFilesFor([updateId]);
    expect(map[updateId].map((f) => f.name)).toEqual(["a.pdf", "b.xlsx"]);
  });

  it("첨부 없는 이력도 빈 배열로 답한다", async () => {
    const map = await repository.listUpdateFilesFor([updateId]);
    expect(map[updateId]).toEqual([]);
  });

  it("없는 이력에 붙이면 TodoNotFoundError", async () => {
    await expect(repository.addUpdateFiles("없음", [file("a.pdf")])).rejects.toBeInstanceOf(
      TodoNotFoundError,
    );
  });

  it("id로 한 건을 집어 온다 (다운로드 라우트용)", async () => {
    const [created] = await repository.addUpdateFiles(updateId, [file("a.pdf")]);
    const found = await repository.findUpdateFile(created.id);
    expect(found?.storageKey).toBe(created.storageKey);
    expect(await repository.findUpdateFile("없음")).toBeNull();
  });

  it("첨부 한 건 삭제는 스토리지 키를 돌려준다", async () => {
    const [created] = await repository.addUpdateFiles(updateId, [file("a.pdf")]);
    const key = await repository.removeUpdateFile(created.id);
    expect(key).toBe(created.storageKey);
    expect((await repository.listUpdateFilesFor([updateId]))[updateId]).toEqual([]);
  });

  it("이력을 지우면 딸린 첨부의 스토리지 키를 돌려준다", async () => {
    // 스토리지 객체는 cascade가 지워 주지 않으므로 호출자가 지울 수 있어야 한다.
    await repository.addUpdateFiles(updateId, [file("a.pdf"), file("b.pdf")]);
    const keys = await repository.removeUpdate(updateId);
    expect(keys).toHaveLength(2);
  });

  it("지시사항을 지우면 모든 이력의 첨부 키를 돌려준다", async () => {
    const second = await repository.addUpdate(todoId, { note: "2차", signal: "Y" });
    await repository.addUpdateFiles(updateId, [file("a.pdf")]);
    await repository.addUpdateFiles(second.id, [file("b.pdf"), file("c.pdf")]);

    const keys = await repository.remove(todoId);
    expect(keys).toHaveLength(3);
  });

  it("첨부가 없으면 빈 배열 — 스토리지를 헛되게 부르지 않는다", async () => {
    expect(await repository.removeUpdate(updateId)).toEqual([]);
    expect(await repository.remove(todoId)).toEqual([]);
  });
});

describe("지시사항 본문 첨부", () => {
  it("buildTodoAttachmentKey는 ASCII 경로만 만든다", () => {
    const key = buildTodoAttachmentKey("전략 보고서.pdf", "u-1");
    expect(key).toBe("todos/u-1.pdf");
    expect(/^[\x20-\x7e]+$/.test(key)).toBe(true);
  });

  it("확장자가 없어도 유효하다", () => {
    expect(buildTodoAttachmentKey("보고서", "u-1")).toBe("todos/u-1");
  });

  it("isStored는 실물이 있는 첨부만 참", () => {
    expect(isStored(null)).toBe(false);
    // 실물 저장 이전에 등록된 옛 데이터 — 링크를 걸면 404가 난다.
    expect(isStored({ name: "a.pdf", size: 1 })).toBe(false);
    expect(isStored({ name: "a.pdf", size: 1, storageKey: null })).toBe(false);
    expect(isStored({ name: "a.pdf", size: 1, storageKey: "todos/x.pdf" })).toBe(true);
  });
});

describe("지시사항 삭제 시 본문 첨부도 정리 대상", () => {
  it("본문 첨부 키를 함께 돌려준다", async () => {
    const repository = createMemoryTodoRepository();
    const todo = await repository.create({
      ...INPUT,
      attachment: { name: "a.pdf", size: 10, storageKey: "todos/abc.pdf" },
    });

    const keys = await repository.remove(todo.id);
    expect(keys).toContain("todos/abc.pdf");
  });

  it("이력 첨부와 본문 첨부를 모두 돌려준다", async () => {
    const repository = createMemoryTodoRepository();
    const todo = await repository.create({
      ...INPUT,
      attachment: { name: "a.pdf", size: 10, storageKey: "todos/abc.pdf" },
    });
    const update = await repository.addUpdate(todo.id, { note: "진행", signal: "G" });
    await repository.addUpdateFiles(update.id, [file("b.pdf")]);

    const keys = await repository.remove(todo.id);
    expect(keys).toHaveLength(2);
  });

  it("파일명만 있는 옛 첨부는 지울 키가 없다", async () => {
    const repository = createMemoryTodoRepository();
    const todo = await repository.create({
      ...INPUT,
      attachment: { name: "a.pdf", size: 10 },
    });
    expect(await repository.remove(todo.id)).toEqual([]);
  });
});
