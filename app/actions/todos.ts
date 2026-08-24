"use server";

/**
 * 지시사항 CRUD 서버 액션.
 *
 * 여기서도 Supabase를 직접 부르지 않는다 — 리포지토리 포트만 사용한다.
 */
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/domain/form-state";
import type { FieldErrors } from "@/lib/domain/validation";
import { validateTodoInput, validateTodoUpdateInput } from "@/lib/domain/validation";
import { getTodoRepository, TodoNotFoundError } from "@/lib/repository";
import { getFileStorage } from "@/lib/storage";
import {
  buildStorageKey,
  buildTodoAttachmentKey,
  checkFiles,
  MAX_FILES_PER_TODO,
  type UpdateFileInput,
} from "@/lib/domain/attachment";
import { storageKeysOf, type Attachment } from "@/lib/domain/todo";

// FormState 타입과 IDLE_FORM_STATE 상수는 lib/domain/form-state.ts에 있다.
// "use server" 파일은 async 함수 외에는 export 할 수 없기 때문이다.

/**
 * 폼이 "기존 첨부 유지"로 되돌려 준 목록.
 *
 * storageKey까지 그대로 받아 넘긴다 — 여기서 잃어버리면 저장할 때마다
 * 실물은 스토리지에 남고 지시사항은 파일을 잊어버린다.
 *
 * 값은 클라이언트가 보낸 것이므로 형태를 믿지 않고 하나씩 확인한다.
 */
function parseKeptAttachments(formData: FormData): Attachment[] {
  const raw = String(formData.get("keptAttachments") ?? "").trim();
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item): Attachment[] => {
      if (typeof item !== "object" || item === null) return [];
      const o = item as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim() : "";
      const name = typeof o.name === "string" ? o.name.trim() : "";
      if (!id || !name) return [];
      const size = Number(o.size);
      return [
        {
          id,
          name,
          size: Number.isFinite(size) && size > 0 ? Math.trunc(size) : 0,
          contentType: typeof o.contentType === "string" ? o.contentType : null,
          storageKey: typeof o.storageKey === "string" && o.storageKey ? o.storageKey : null,
        },
      ];
    });
  } catch {
    // 형태가 깨졌으면 첨부 없음으로 본다. 잘못된 키로 남의 파일을 가리키게 두지 않는다.
    return [];
  }
}

function toRawInput(formData: FormData) {
  return {
    instructedAt: String(formData.get("instructedAt") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    meetingBody: String(formData.get("meetingBody") ?? ""),
    org: String(formData.get("org") ?? ""),
    assigneeName: String(formData.get("assigneeName") ?? ""),
    assigneeEmail: String(formData.get("assigneeEmail") ?? ""),
    category: String(formData.get("category") ?? ""),
    detail: String(formData.get("detail") ?? ""),
    progressNote: String(formData.get("progressNote") ?? ""),
    signal: String(formData.get("signal") ?? ""),
    remindStatus: String(formData.get("remindStatus") ?? "none"),
    attachments: parseKeptAttachments(formData),
  };
}

/** 브리핑·표 두 뷰 모두 같은 데이터를 읽으므로 레이아웃 단위로 무효화한다. */
function revalidateAll() {
  revalidatePath("/", "layout");
}

/**
 * FormData에서 실제 파일만 골라낸다.
 *
 * 파일을 고르지 않은 input도 크기 0의 빈 File을 보내므로 그대로 두면
 * "빈 파일은 올릴 수 없습니다"로 막혀 첨부 없는 기록조차 저장되지 않는다.
 */
function isUploadable(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && value.size > 0 && value.name !== "";
}

/**
 * 스토리지 정리.
 *
 * 실패해도 호출자의 작업을 되돌리지 않는다 — 사용자가 지우려던 것은 이미 지워졌고,
 * 남은 파일은 눈에 보이지 않는 쓰레기일 뿐이다. 대신 로그를 남겨 추적한다.
 */
async function cleanUpStorage(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const storage = getFileStorage();
  if (!storage) return;
  try {
    await storage.remove(keys);
  } catch (error) {
    console.error("스토리지 정리 실패", keys, error);
  }
}

function toErrorState(error: unknown, fallback: string): FormState {
  if (error instanceof TodoNotFoundError) {
    return {
      status: "error",
      message: "이미 삭제된 지시사항입니다. 목록을 새로고침해 주세요.",
      fieldErrors: {},
    };
  }
  console.error(fallback, error);
  return { status: "error", message: fallback, fieldErrors: {} };
}

/** 신규 등록 / 수정 공용. `id`가 비어 있으면 신규. */
export async function saveTodoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const parsed = validateTodoInput(toRawInput(formData));

  if (!parsed.ok) {
    return {
      status: "error",
      message: "입력값을 확인해 주세요.",
      fieldErrors: parsed.errors,
    };
  }

  /*
   * 첨부 해결 — 유지분 + 새로 올린 것.
   *
   * 폼이 되돌려 준 유지 목록은 이미 parsed.value.attachments에 들어 있다.
   * 여기에 새 파일을 올려 덧붙이고, 목록에서 빠진 옛 파일은 저장 뒤에 지운다.
   */
  const picked = formData.getAll("attachmentFiles").filter(isUploadable);
  const kept = parsed.value.attachments;

  const check = checkFiles(
    picked.map((f) => ({ name: f.name, size: f.size })),
    kept.length,
  );
  if (!check.ok) {
    return { status: "error", message: check.message, fieldErrors: {} };
  }
  if (kept.length + picked.length > MAX_FILES_PER_TODO) {
    return {
      status: "error",
      message: `첨부는 ${MAX_FILES_PER_TODO}개까지입니다.`,
      fieldErrors: {},
    };
  }

  const storage = picked.length > 0 ? getFileStorage() : null;
  if (picked.length > 0 && !storage) {
    return {
      status: "error",
      message: "파일 저장소가 설정되지 않아 첨부할 수 없습니다.",
      fieldErrors: {},
    };
  }

  const repository = getTodoRepository();
  // 저장 전 목록. 여기서 빠진 것이 버려지는 파일이다.
  const previous = id ? (await repository.findById(id))?.attachments ?? [] : [];
  const uploadedKeys: string[] = [];

  if (storage && picked.length > 0) {
    try {
      for (const file of picked) {
        const key = buildTodoAttachmentKey(file.name, crypto.randomUUID());
        await storage.put({
          key,
          body: await file.arrayBuffer(),
          contentType: file.type || null,
        });
        uploadedKeys.push(key);
        parsed.value.attachments = [
          ...parsed.value.attachments,
          {
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            contentType: file.type || null,
            storageKey: key,
          },
        ];
      }
    } catch (error) {
      // 일부만 올라간 채 남으면 아무도 손댈 수 없는 쓰레기가 된다.
      await cleanUpStorage(uploadedKeys);
      console.error("첨부 업로드 실패", error);
      return {
        status: "error",
        message: "첨부 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        fieldErrors: {},
      };
    }
  }

  try {
    const saved = id
      ? await repository.update(id, parsed.value)
      : await repository.create(parsed.value);

    /*
     * 버려진 옛 파일 정리. 저장이 끝난 뒤에 지운다 —
     * 먼저 지웠다가 저장이 실패하면 지시사항은 옛 첨부를 가리키는데 파일이 없다.
     */
    const surviving = new Set(storageKeysOf(saved.attachments));
    const abandoned = storageKeysOf(previous).filter((k) => !surviving.has(k));
    await cleanUpStorage(abandoned);

    // 추가 수신자는 별도 테이블이라 본문 저장과 나눠서 처리한다.
    const recipientIds = String(formData.get("recipientIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await repository.setTodoRecipients(saved.id, recipientIds);

    /*
     * '직접 입력'한 회의체를 마스터에 자동 편입한다.
     *
     * 폼이 아니라 여기서 하는 이유: 클라이언트가 무엇을 보냈든 실제로 저장된 값을 기준으로
     * 맞춰야 마스터와 지시사항이 어긋나지 않는다. 이미 있는 이름이면 ensure가 그냥 찾아 준다.
     *
     * 실패해도 저장 자체는 되돌리지 않는다 — 지시사항은 이미 저장됐고,
     * 마스터 편입은 다음 저장이나 설정 화면에서 만회할 수 있는 부수 작업이다.
     */
    try {
      await repository.ensureMeetingBody(saved.meetingBody);
    } catch (error) {
      console.error("회의체 마스터 편입 실패", error);
    }

    revalidateAll();
    return {
      status: "success",
      message: id ? "지시사항을 수정했습니다." : "지시사항을 등록했습니다.",
      at: Date.now(),
    };
  } catch (error) {
    // 올려둔 파일이 있으면 되돌린다 — DB에 기록 없는 파일은 아무도 손댈 수 없다.
    await cleanUpStorage(uploadedKeys);
    return toErrorState(error, "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

/** 진행 이력 추가 — 저장되면 지시사항의 현재 상태도 이 값으로 갱신된다. */
export async function addTodoUpdateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const todoId = String(formData.get("todoId") ?? "").trim();
  if (!todoId) {
    return { status: "error", message: "대상 지시사항이 없습니다.", fieldErrors: {} };
  }

  const parsed = validateTodoUpdateInput({
    note: String(formData.get("note") ?? ""),
    signal: String(formData.get("signal") ?? ""),
  });

  if (!parsed.ok) {
    return {
      status: "error",
      message: parsed.errors.note ?? parsed.errors.signal ?? "입력값을 확인해 주세요.",
      fieldErrors: parsed.errors as FieldErrors,
    };
  }

  // 첨부는 이력이 만들어진 뒤에 올린다 — 경로에 이력 id가 들어가기 때문.
  const files = formData.getAll("files").filter(isUploadable);
  const check = checkFiles(files.map((f) => ({ name: f.name, size: f.size })));
  if (!check.ok) {
    return { status: "error", message: check.message, fieldErrors: {} };
  }

  const storage = files.length > 0 ? getFileStorage() : null;
  if (files.length > 0 && !storage) {
    return {
      status: "error",
      message: "파일 저장소가 설정되지 않아 첨부할 수 없습니다.",
      fieldErrors: {},
    };
  }

  try {
    const repository = getTodoRepository();
    const created = await repository.addUpdate(todoId, parsed.value);

    if (storage && files.length > 0) {
      const uploaded: UpdateFileInput[] = [];
      try {
        for (const file of files) {
          // 인덱스로는 같은 이력에 두 번 올릴 때 키가 겹쳐 앞 파일을 덮어쓴다.
          const key = buildStorageKey(created.id, file.name, crypto.randomUUID());
          await storage.put({
            key,
            body: await file.arrayBuffer(),
            contentType: file.type || null,
          });
          uploaded.push({
            name: file.name,
            size: file.size,
            contentType: file.type || null,
            storageKey: key,
          });
        }
        await repository.addUpdateFiles(created.id, uploaded);
      } catch (error) {
        /*
         * 업로드가 도중에 실패하면 올라간 파일만 남고 DB에는 기록이 없어
         * 아무도 손댈 수 없는 쓰레기가 된다. 올린 것을 되돌리고,
         * 이력은 이미 저장됐으니 남긴 채 첨부 실패만 알린다.
         */
        await cleanUpStorage(uploaded.map((f) => f.storageKey));
        console.error("첨부 업로드 실패", error);
        revalidateAll();
        return {
          status: "error",
          message: "이력은 저장했지만 첨부 업로드에 실패했습니다. 첨부만 다시 시도해 주세요.",
          fieldErrors: {},
        };
      }
    }

    revalidateAll();
    return {
      status: "success",
      message:
        files.length > 0
          ? `진행 이력을 추가했습니다. (첨부 ${files.length}개)`
          : "진행 이력을 추가했습니다.",
      at: Date.now(),
    };
  } catch (error) {
    return toErrorState(error, "진행 이력 저장에 실패했습니다.");
  }
}

/** 첨부 한 건만 삭제 */
export async function deleteUpdateFileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fileId = String(formData.get("fileId") ?? "").trim();
  if (!fileId) {
    return { status: "error", message: "삭제할 첨부가 없습니다.", fieldErrors: {} };
  }

  try {
    const key = await getTodoRepository().removeUpdateFile(fileId);
    await cleanUpStorage([key]);
    revalidateAll();
    return { status: "success", message: "첨부를 삭제했습니다.", at: Date.now() };
  } catch (error) {
    return toErrorState(error, "첨부 삭제에 실패했습니다.");
  }
}

export async function deleteTodoUpdateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const updateId = String(formData.get("updateId") ?? "").trim();
  if (!updateId) {
    return { status: "error", message: "삭제할 이력이 없습니다.", fieldErrors: {} };
  }

  try {
    const orphanedKeys = await getTodoRepository().removeUpdate(updateId);
    await cleanUpStorage(orphanedKeys);
    revalidateAll();
    return { status: "success", message: "진행 이력을 삭제했습니다.", at: Date.now() };
  } catch (error) {
    return toErrorState(error, "진행 이력 삭제에 실패했습니다.");
  }
}

export async function deleteTodoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { status: "error", message: "삭제할 지시사항이 없습니다.", fieldErrors: {} };
  }

  try {
    const orphanedKeys = await getTodoRepository().remove(id);
    await cleanUpStorage(orphanedKeys);
    revalidateAll();
    return { status: "success", message: "지시사항을 삭제했습니다.", at: Date.now() };
  } catch (error) {
    return toErrorState(error, "삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

/**
 * 완료 처리 / 완료 취소.
 *
 * 저장 폼과 분리한다 — 완료는 등록 값이 아니라 상태 전이라서,
 * 폼 저장에 묶으면 수정할 때마다 완료가 풀릴 위험이 있다.
 */
export async function setTodoCompletedAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { status: "error", message: "대상 지시사항이 없습니다.", fieldErrors: {} };
  }
  const done = String(formData.get("done") ?? "") === "true";

  try {
    await getTodoRepository().setCompleted(id, done);
    revalidateAll();
    return {
      status: "success",
      message: done ? "완료 처리했습니다." : "완료를 취소했습니다.",
      at: Date.now(),
    };
  } catch (error) {
    return toErrorState(
      error,
      done ? "완료 처리에 실패했습니다." : "완료 취소에 실패했습니다.",
    );
  }
}
