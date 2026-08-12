/**
 * 폼 검증. README 필수 항목:
 * 지시일, 완료목표일, 회의체, 조직, 이름, 구분, 세부내용.
 *
 * 도메인 계층에 두어 서버 액션과 (필요 시) 클라이언트가 같은 규칙을 공유하게 한다.
 */
import { z } from "zod";

import { CATEGORIES, REMIND_STATUSES, SIGNALS, type TodoInput } from "./todo";

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}을(를) 입력하세요.`);

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label}을(를) 입력하세요.`).max(max, `${label}이(가) 너무 깁니다.`);

export const todoInputSchema = z
  .object({
    instructedAt: dateField("지시일"),
    dueDate: dateField("완료목표일"),
    meetingBody: requiredText("회의체", 80),
    org: requiredText("조직", 60),
    assigneeName: requiredText("이름", 60),
    category: z.enum(CATEGORIES, { message: "지시사항 구분을 선택하세요." }),
    detail: requiredText("지시사항 세부 내용", 2000),
    progressNote: z.string().trim().max(1000, "진행상황이 너무 깁니다.").default(""),
    progressPct: z.coerce
      .number()
      .int("진행률은 정수여야 합니다.")
      .min(0, "진행률은 0 이상이어야 합니다.")
      .max(100, "진행률은 100 이하여야 합니다.")
      .default(0),
    signal: z.enum(SIGNALS, { message: "진행상황 신호등을 선택하세요." }),
    remindStatus: z.enum(REMIND_STATUSES),
    attachment: z
      .object({
        name: z.string().trim().min(1).max(255),
        size: z.number().int().nonnegative(),
      })
      .nullable()
      .default(null),
  })
  .refine((v) => v.dueDate >= v.instructedAt, {
    message: "완료목표일은 지시일보다 빠를 수 없습니다.",
    path: ["dueDate"],
  });

export type TodoInputSchema = z.infer<typeof todoInputSchema>;

export type FieldErrors = Partial<Record<keyof TodoInput | "form", string>>;

export type ValidationResult =
  | { ok: true; value: TodoInput }
  | { ok: false; errors: FieldErrors };

export function validateTodoInput(raw: unknown): ValidationResult {
  const result = todoInputSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data as TodoInput };

  // 필드당 첫 번째 메시지만 노출한다 — 폼 아래 한 줄로 보여주기 위함.
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = (issue.path[0] as keyof TodoInput | undefined) ?? "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}
