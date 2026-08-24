"use server";

/**
 * 사원 명부 업로드 (인사정보 연동 전 임시).
 *
 * 엑셀을 서버에서 읽어 통째로 갈아끼운다. 부분 갱신이 아니라 전량 교체다 —
 * 퇴사자가 빠진 파일을 올렸는데 옛 사람이 남아 있으면 안 된다.
 */
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/domain/form-state";
import { parseRoster } from "@/lib/domain/employee";
import { getTodoRepository } from "@/lib/repository";
import { readFirstSheet, XlsxError } from "@/lib/xlsx/read-xlsx";

/** 명부 파일 상한. 1천여 명이면 100KB 남짓이라 넉넉하다. */
const MAX_ROSTER_BYTES = 10 * 1024 * 1024;

export async function uploadRosterAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const file = formData.get("roster");
  if (!file || typeof file === "string" || file.size === 0) {
    return { status: "error", message: "엑셀 파일을 선택해 주세요.", fieldErrors: {} };
  }
  if (file.size > MAX_ROSTER_BYTES) {
    return { status: "error", message: "명부 파일이 너무 큽니다.", fieldErrors: {} };
  }

  let parsed;
  try {
    const table = readFirstSheet(Buffer.from(await file.arrayBuffer()));
    parsed = parseRoster(table);
  } catch (error) {
    if (error instanceof XlsxError) {
      return { status: "error", message: error.message, fieldErrors: {} };
    }
    console.error("명부 파일 읽기 실패", error);
    return { status: "error", message: "명부 파일을 읽지 못했습니다.", fieldErrors: {} };
  }

  if (parsed.rows.length === 0) {
    /*
     * 한 줄도 못 읽었으면 기존 명부를 지우지 않는다.
     * 잘못된 파일을 올린 실수로 쓰던 명부가 통째로 날아가면 복구할 방법이 없다.
     */
    const reason = parsed.skipped[0]?.reason ?? "읽을 수 있는 줄이 없습니다.";
    return {
      status: "error",
      message: `명부를 읽지 못했습니다 — ${reason}`,
      fieldErrors: {},
    };
  }

  try {
    const count = await getTodoRepository().replaceEmployees(parsed.rows);
    revalidatePath("/", "layout");

    const skipped = parsed.skipped.length;
    return {
      status: "success",
      message:
        skipped === 0
          ? `사원 명부 ${count}명을 등록했습니다.`
          : `사원 명부 ${count}명을 등록했습니다. (${skipped}줄 건너뜀 — ${parsed.skipped[0].reason})`,
      at: Date.now(),
    };
  } catch (error) {
    console.error("명부 저장 실패", error);
    return { status: "error", message: "명부를 저장하지 못했습니다.", fieldErrors: {} };
  }
}

/** 인사정보 연동 시 임시 명부를 비운다 */
export async function clearRosterAction(): Promise<FormState> {
  try {
    await getTodoRepository().clearEmployees();
    revalidatePath("/", "layout");
    return { status: "success", message: "사원 명부를 비웠습니다.", at: Date.now() };
  } catch (error) {
    console.error("명부 삭제 실패", error);
    return { status: "error", message: "명부를 비우지 못했습니다.", fieldErrors: {} };
  }
}
