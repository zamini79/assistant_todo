/**
 * 폼 검증. README 필수 항목:
 * 지시일, 완료목표일, 회의체, 조직, 이름, 구분, 세부내용.
 *
 * 도메인 계층에 두어 서버 액션과 (필요 시) 클라이언트가 같은 규칙을 공유하게 한다.
 */
import { z } from "zod";

import { CATEGORIES, REMIND_STATUSES, SIGNALS, type Signal, type TodoInput } from "./todo";
import type { AppSettings, RecipientInput } from "./settings";

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
    // 선택 입력. 빈 문자열은 null로 정규화해 DB의 nullable과 맞춘다.
    assigneeEmail: z
      .string()
      .trim()
      .max(200, "이메일이 너무 깁니다.")
      .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
        message: "이메일 형식이 올바르지 않습니다.",
      })
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    category: z.enum(CATEGORIES, { message: "지시사항 구분을 선택하세요." }),
    detail: requiredText("지시사항 세부 내용", 2000),
    progressNote: z.string().trim().max(1000, "진행상황이 너무 깁니다.").default(""),
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

const emailField = (label: string, required: boolean) => {
  const base = z.string().trim().max(200, `${label}이(가) 너무 깁니다.`);
  return required
    ? base.regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, `${label} 형식이 올바르지 않습니다.`)
    : base
        .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
          message: `${label} 형식이 올바르지 않습니다.`,
        })
        .transform((v) => (v === "" ? null : v));
};

/** 앱 설정 — 전략 Assistant */
export const appSettingsSchema = z.object({
  assistantName: z.string().trim().max(60, "이름이 너무 깁니다.").default(""),
  assistantEmail: emailField("이메일", false).nullable().default(null),
});

export type SettingsFieldErrors = Partial<
  Record<"assistantName" | "assistantEmail" | "form", string>
>;

export function validateAppSettings(
  raw: unknown,
): { ok: true; value: AppSettings } | { ok: false; errors: SettingsFieldErrors } {
  const result = appSettingsSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data as AppSettings };
  const errors: SettingsFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = (issue.path[0] as keyof SettingsFieldErrors | undefined) ?? "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** 메일 수신자 */
export const recipientSchema = z.object({
  name: requiredText("이름", 60),
  email: emailField("이메일", true),
  org: z.string().trim().max(60, "조직이 너무 깁니다.").default(""),
});

export type RecipientFieldErrors = Partial<
  Record<"name" | "email" | "org" | "form", string>
>;

export function validateRecipient(
  raw: unknown,
): { ok: true; value: RecipientInput } | { ok: false; errors: RecipientFieldErrors } {
  const result = recipientSchema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data as RecipientInput };
  const errors: RecipientFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = (issue.path[0] as keyof RecipientFieldErrors | undefined) ?? "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** 진행 이력 한 건 */
export const todoUpdateInputSchema = z.object({
  note: requiredText("진행 내용", 2000),
  signal: z.enum(SIGNALS, { message: "진행상황 신호등을 선택하세요." }),
});

export type TodoUpdateFieldErrors = Partial<
  Record<"note" | "signal" | "form", string>
>;

export type TodoUpdateValidationResult =
  | { ok: true; value: { note: string; signal: Signal } }
  | { ok: false; errors: TodoUpdateFieldErrors };

export function validateTodoUpdateInput(raw: unknown): TodoUpdateValidationResult {
  const result = todoUpdateInputSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, value: result.data as { note: string; signal: Signal } };
  }

  const errors: TodoUpdateFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = (issue.path[0] as keyof TodoUpdateFieldErrors | undefined) ?? "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

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
