/**
 * 주간 리포트 메일 본문.
 *
 * 화면(app/report)과 같은 buildWeeklyReport 결과를 받아 서식만 입힌다 —
 * 화면에서 본 것과 다른 내용이 발송되면 안 되기 때문이다.
 */
import { formatRange, toDateOnly } from "../domain/date";
import { reportHighlights, type WeeklyReport } from "../domain/report";
import type { Todo } from "../domain/todo";

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type ReportMail = { subject: string; text: string; html: string };

function signature(assistantName: string): string {
  const name = assistantName.trim();
  return name ? `— 전략 Assistant ${name}` : "— 전략 Assistant";
}

const line = (t: Todo) =>
  `${t.dueDate} · ${t.org} ${t.assigneeName} · ${t.meetingBody} — ${t.detail}`;

const doneLine = (t: Todo) =>
  `${t.completedAt ? toDateOnly(t.completedAt) : ""} · ${t.org} ${t.assigneeName} — ${t.detail}`;

/** 본문에 통째로 싣지 않고 잘라 낸다. 넘치면 "외 N건"으로 알린다. */
const MAX_ROWS = 15;

function section(title: string, items: string[]): string[] {
  if (items.length === 0) return [`[${title}] 없음`, ""];
  const shown = items.slice(0, MAX_ROWS);
  const rest = items.length - shown.length;
  return [
    `[${title}] ${items.length}건`,
    ...shown.map((s) => `  - ${s}`),
    ...(rest > 0 ? [`  … 외 ${rest}건`] : []),
    "",
  ];
}

function htmlSection(title: string, items: string[]): string {
  if (items.length === 0) {
    return `<h3 style="margin:22px 0 6px;font-size:14px">${escapeHtml(title)}</h3>
  <p style="margin:0;color:#8b8072">없음</p>`;
  }
  const shown = items.slice(0, MAX_ROWS);
  const rest = items.length - shown.length;
  return `<h3 style="margin:22px 0 6px;font-size:14px">${escapeHtml(title)} <span style="color:#8b8072;font-weight:400">${items.length}건</span></h3>
  <ul style="margin:0;padding-left:18px">
    ${shown.map((s) => `<li style="margin:3px 0">${escapeHtml(s)}</li>`).join("\n    ")}
    ${rest > 0 ? `<li style="margin:3px 0;color:#8b8072">… 외 ${rest}건</li>` : ""}
  </ul>`;
}

export function buildWeeklyReportMail(
  report: WeeklyReport,
  assistantName = "",
): ReportMail {
  const period = formatRange(report.range);
  const highlights = reportHighlights(report);

  const subject = `[주간 리포트] ${period} · 미결 ${report.openTotal}건, 지연 ${report.overdue.length}건`;

  const text = [
    `지시사항 주간 리포트`,
    period,
    "",
    highlights.map((h) => `${h.label} ${h.value}`).join(" / "),
    "",
    ...section("지연", report.overdue.map(line)),
    ...section("마감 임박", report.dueSoon.map(line)),
    ...section("이번 주 완료", report.completedThisWeek.map(doneLine)),
    ...section("이번 주 신규 지시", report.createdThisWeek.map(line)),
    "[담당자별]",
    ...(report.people.length > 0
      ? report.people.map(
          (p) =>
            `  - ${p.org} ${p.assigneeName}: 미결 ${p.open} (지연 ${p.overdue}) · 이번 주 완료 ${p.doneThisWeek}`,
        )
      : ["  없음"]),
    "",
    signature(assistantName),
  ].join("\n");

  const html = `<div style="font:14px/1.7 'Malgun Gothic',sans-serif;color:#2a231c;max-width:720px">
  <h2 style="margin:0 0 4px;font-size:18px">지시사항 주간 리포트</h2>
  <p style="margin:0;color:#8b8072">${escapeHtml(period)}</p>

  <table style="border-collapse:collapse;margin:18px 0">
    <tr>${highlights
      .map(
        (h) =>
          `<td style="padding:8px 18px 8px 0"><div style="color:#8b8072;font-size:12px">${escapeHtml(h.label)}</div><div style="font-size:20px;font-weight:600">${h.value}</div></td>`,
      )
      .join("")}</tr>
  </table>

  ${htmlSection("지연", report.overdue.map(line))}
  ${htmlSection("마감 임박", report.dueSoon.map(line))}
  ${htmlSection("이번 주 완료", report.completedThisWeek.map(doneLine))}
  ${htmlSection("이번 주 신규 지시", report.createdThisWeek.map(line))}

  <h3 style="margin:22px 0 6px;font-size:14px">담당자별</h3>
  ${
    report.people.length > 0
      ? `<table style="border-collapse:collapse;font-size:13px">
    <tr style="color:#8b8072"><th align="left" style="padding:4px 16px 4px 0">담당</th><th align="right" style="padding:4px 16px 4px 0">미결</th><th align="right" style="padding:4px 16px 4px 0">지연</th><th align="right" style="padding:4px 0">이번 주 완료</th></tr>
    ${report.people
      .map(
        (p) =>
          `<tr><td style="padding:4px 16px 4px 0">${escapeHtml(`${p.org} ${p.assigneeName}`)}</td><td align="right" style="padding:4px 16px 4px 0">${p.open}</td><td align="right" style="padding:4px 16px 4px 0">${p.overdue}</td><td align="right" style="padding:4px 0">${p.doneThisWeek}</td></tr>`,
      )
      .join("\n    ")}
  </table>`
      : `<p style="margin:0;color:#8b8072">없음</p>`
  }

  <p style="color:#8b8072;font-size:12px;margin-top:24px">${escapeHtml(signature(assistantName))}</p>
</div>`;

  return { subject, text, html };
}
