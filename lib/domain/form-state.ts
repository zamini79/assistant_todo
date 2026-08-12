/**
 * 서버 액션의 반환 타입.
 *
 * `"use server"` 파일은 async 함수만 export 할 수 있어서(값을 내보내면 런타임에
 * "A 'use server' file can only export async functions"로 죽는다)
 * 상수 `IDLE_FORM_STATE`는 이 일반 모듈에 둔다.
 */
import type { FieldErrors } from "./validation";

export type FormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors: FieldErrors }
  /** `at`은 같은 메시지가 연속으로 성공했을 때도 클라이언트가 변화를 감지하게 해준다. */
  | { status: "success"; message: string; at: number };

export const IDLE_FORM_STATE: FormState = { status: "idle" };
