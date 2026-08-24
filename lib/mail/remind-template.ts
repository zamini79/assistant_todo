/**
 * Remind 메일 본문.
 *
 * 순수 함수라 발송 없이 테스트할 수 있다.
 * 사내 메일 전환 시 서식만 바꾸면 되고 발송 경로는 그대로다.
 */
import { dueLabel, isOverdue } from "../domain/date";
import { assigneeSalutation, type Todo } from "../domain/todo";

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type RemindMail = { subject: string; text: string; html: string };

/** 서명 — 담당 Assistant 이름이 있으면 함께 적는다 */
function signature(assistantName: string): string {
  const name = assistantName.trim();
  return name ? `— 전략 Assistant ${name}` : "— 전략 Assistant";
}

export function buildRemindMail(
  todo: Todo,
  today: string,
  assistantName = "",
): RemindMail {
  const overdue = isOverdue(todo.dueDate, today);
  const dLabel = dueLabel(todo.dueDate, today);
  const status = overdue ? `지연 (${dLabel})` : dLabel;

  const subject = `[지시사항 ${overdue ? "지연" : "리마인드"}] ${todo.category} · ${todo.detail.slice(0, 40)}`;

  const rows: [string, string][] = [
    ["지시일", todo.instructedAt],
    ["완료목표일", `${todo.dueDate} (${status})`],
    ["회의체", todo.meetingBody],
    ["담당", `${todo.org} ${todo.assigneeName}${todo.assigneeTitle ? ` ${todo.assigneeTitle}` : ""}`],
    ["구분", todo.category],
    ["진행상황", todo.progressNote || "미기재"],
  ];

  const text = [
    `${assigneeSalutation(todo)},`,
    "",
    "아래 지시사항의 진행 상황을 확인 요청드립니다.",
    "",
    ...rows.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "[지시 내용]",
    todo.detail,
    "",
    signature(assistantName),
  ].join("\n");

  const html = `<div style="font:14px/1.7 'Malgun Gothic',sans-serif;color:#2a231c">
  <p>${escapeHtml(assigneeSalutation(todo))},</p>
  <p>아래 지시사항의 진행 상황을 확인 요청드립니다.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><th align="left" style="padding:6px 16px 6px 0;color:#8b8072;font-weight:500;white-space:nowrap">${escapeHtml(k)}</th><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`,
      )
      .join("\n    ")}
  </table>
  <div style="border-left:3px solid #3b3128;padding:4px 0 4px 12px;margin:16px 0">${escapeHtml(todo.detail)}</div>
  <p style="color:#8b8072;font-size:12px">${escapeHtml(signature(assistantName))}</p>
</div>`;

  return { subject, text, html };
}
