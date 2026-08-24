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
    const saved = id
      ? await repository.update(id, parsed.value)
      : await repository.create(parsed.value);

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
