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

// FormState 타입과 IDLE_FORM_STATE 상수는 lib/domain/form-state.ts에 있다.
// "use server" 파일은 async 함수 외에는 export 할 수 없기 때문이다.

function parseAttachment(formData: FormData) {
  const name = String(formData.get("attachmentName") ?? "").trim();
  if (!name) return null;
  const size = Number(formData.get("attachmentSize") ?? 0);
  return { name, size: Number.isFinite(size) && size > 0 ? Math.trunc(size) : 0 };
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
    attachment: parseAttachment(formData),
  };
}

/** 브리핑·표 두 뷰 모두 같은 데이터를 읽으므로 레이아웃 단위로 무효화한다. */
function revalidateAll() {
  revalidatePath("/", "layout");
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

  try {
    const repository = getTodoRepository();
    if (id) await repository.update(id, parsed.value);
    else await repository.create(parsed.value);

    revalidateAll();
    return {
      status: "success",
      message: id ? "지시사항을 수정했습니다." : "지시사항을 등록했습니다.",
      at: Date.now(),
    };
  } catch (error) {
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

  try {
    await getTodoRepository().addUpdate(todoId, parsed.value);
    revalidateAll();
    return { status: "success", message: "진행 이력을 추가했습니다.", at: Date.now() };
  } catch (error) {
    return toErrorState(error, "진행 이력 저장에 실패했습니다.");
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
    await getTodoRepository().removeUpdate(updateId);
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
    await getTodoRepository().remove(id);
    revalidateAll();
    return { status: "success", message: "지시사항을 삭제했습니다.", at: Date.now() };
  } catch (error) {
    return toErrorState(error, "삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
