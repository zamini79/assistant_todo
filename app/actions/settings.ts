"use server";

/** 설정 · 메일 수신자 마스터 관리 */
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/domain/form-state";
import { validateAppSettings, validateRecipient } from "@/lib/domain/validation";
import { DuplicateRecipientError, getTodoRepository } from "@/lib/repository";

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof DuplicateRecipientError) {
    return { status: "error", message: error.message, fieldErrors: {} };
  }
  console.error(fallback, error);
  return { status: "error", message: fallback, fieldErrors: {} };
}

export async function saveSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = validateAppSettings({
    assistantName: String(formData.get("assistantName") ?? ""),
    assistantEmail: String(formData.get("assistantEmail") ?? ""),
  });
  if (!parsed.ok) {
    return {
      status: "error",
      message: parsed.errors.assistantEmail ?? parsed.errors.assistantName ?? "입력값을 확인해 주세요.",
      fieldErrors: {},
    };
  }

  try {
    await getTodoRepository().saveSettings(parsed.value);
    revalidatePath("/", "layout");
    return { status: "success", message: "설정을 저장했습니다.", at: Date.now() };
  } catch (error) {
    return fail(error, "설정을 저장하지 못했습니다.");
  }
}

/** id가 있으면 수정, 없으면 신규 */
export async function saveRecipientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const parsed = validateRecipient({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    org: String(formData.get("org") ?? ""),
  });
  if (!parsed.ok) {
    return {
      status: "error",
      message: parsed.errors.name ?? parsed.errors.email ?? "입력값을 확인해 주세요.",
      fieldErrors: {},
    };
  }

  try {
    const repository = getTodoRepository();
    if (id) await repository.updateRecipient(id, parsed.value);
    else await repository.createRecipient(parsed.value);

    revalidatePath("/", "layout");
    return {
      status: "success",
      message: id ? "수신자를 수정했습니다." : "수신자를 추가했습니다.",
      at: Date.now(),
    };
  } catch (error) {
    return fail(error, "수신자를 저장하지 못했습니다.");
  }
}

export async function deleteRecipientAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { status: "error", message: "삭제할 수신자가 없습니다.", fieldErrors: {} };

  try {
    await getTodoRepository().removeRecipient(id);
    revalidatePath("/", "layout");
    return { status: "success", message: "수신자를 삭제했습니다.", at: Date.now() };
  } catch (error) {
    return fail(error, "수신자를 삭제하지 못했습니다.");
  }
}
