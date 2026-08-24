/**
 * 주간 리포트 — 주 경계 계산과 집계 규칙.
 */
import { describe, expect, it } from "vitest";

import {
  addDays,
  formatRange,
  isDateString,
  isWithin,
  toKoreanDate,
  weekRange,
  weekStart,
} from "@/lib/domain/date";
import { buildWeeklyReport, reportHighlights } from "@/lib/domain/report";
import { buildWeeklyReportMail } from "@/lib/mail/report-template";
import type { Todo, TodoInput } from "@/lib/domain/todo";

const BASE: TodoInput = {
  instructedAt: "2026-08-24",
  dueDate: "2026-08-28",
  meetingBody: "주간 경영회의",
  org: "영업본부",
  assigneeName: "박현수 본부장",
  assigneeEmail: null,
  category: "전략검토",
  detail: "과제",
  progressNote: "",
  signal: "G",
  remindStatus: "wait",
  attachments: [],
};

let seq = 0;
const todo = (over: Partial<Todo> = {}): Todo => ({
  ...BASE,
  id: `t${(seq += 1)}`,
  completedAt: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...over,
});

describe("weekStart / weekRange", () => {
  it("월요일이 주의 시작", () => {
    // 2026-08-24는 월요일
    expect(weekStart("2026-08-24")).toBe("2026-08-24");
    expect(weekStart("2026-08-28")).toBe("2026-08-24"); // 금
    expect(weekStart("2026-08-30")).toBe("2026-08-24"); // 일
  });

  it("일요일은 그 주에 남고 다음 주로 넘어가지 않는다", () => {
    // 일요일을 다음 주로 밀면 일요일 보고가 빈 주를 가리킨다.
    expect(weekRange("2026-08-30")).toEqual({ start: "2026-08-24", end: "2026-08-30" });
  });

  it("월요일 직전(일요일)은 이전 주", () => {
    expect(weekStart("2026-08-23")).toBe("2026-08-17");
  });

  it("월 경계를 넘어도 이어진다", () => {
    expect(weekRange("2026-09-01")).toEqual({ start: "2026-08-31", end: "2026-09-06" });
  });

  it("이전/다음 주 이동", () => {
    const r = weekRange("2026-08-26");
    expect(addDays(r.start, -7)).toBe("2026-08-17");
    expect(addDays(r.start, 7)).toBe("2026-08-31");
  });
});

describe("isWithin", () => {
  const range = { start: "2026-08-24", end: "2026-08-30" };
  it("경계를 포함한다", () => {
    expect(isWithin("2026-08-24", range)).toBe(true);
    expect(isWithin("2026-08-30", range)).toBe(true);
  });
  it("바깥은 제외", () => {
    expect(isWithin("2026-08-23", range)).toBe(false);
    expect(isWithin("2026-08-31", range)).toBe(false);
  });
});

describe("날짜 표기", () => {
  it("한국식 날짜", () => {
    expect(toKoreanDate("2026-08-04")).toBe("8월 4일");
  });
  it("기간 문구", () => {
    expect(formatRange({ start: "2026-08-24", end: "2026-08-30" })).toBe(
      "2026년 8월 24일 ~ 8월 30일",
    );
  });
});

describe("buildWeeklyReport", () => {
  const range = weekRange("2026-08-26");
  const today = "2026-08-26";

  it("지연은 완료목표일이 오늘보다 이전인 미결", () => {
    const report = buildWeeklyReport(
      [todo({ dueDate: "2026-08-20" }), todo({ dueDate: "2026-08-28" })],
      range,
      today,
    );
    expect(report.overdue).toHaveLength(1);
    expect(report.overdue[0].dueDate).toBe("2026-08-20");
  });

  it("완료된 건은 지연·마감임박에 들어오지 않는다", () => {
    // 끝난 일을 지연으로 보고하면 사장님께 잘못된 그림이 간다.
    const report = buildWeeklyReport(
      [todo({ dueDate: "2026-08-20", completedAt: "2026-08-25T01:00:00.000Z" })],
      range,
      today,
    );
    expect(report.overdue).toHaveLength(0);
    expect(report.dueSoon).toHaveLength(0);
    expect(report.openTotal).toBe(0);
  });

  it("이번 주 완료는 완료일 기준으로 고른다", () => {
    const report = buildWeeklyReport(
      [
        todo({ completedAt: "2026-08-25T01:00:00.000Z" }), // 이번 주
        todo({ completedAt: "2026-08-20T01:00:00.000Z" }), // 지난 주
      ],
      range,
      today,
    );
    expect(report.completedThisWeek).toHaveLength(1);
  });

  it("완료 시각은 서울 기준 날짜로 접어 비교한다", () => {
    // 2026-08-30T15:30Z = 서울 8/31 00:30 → 다음 주다.
    const report = buildWeeklyReport(
      [todo({ completedAt: "2026-08-30T15:30:00.000Z" })],
      range,
      today,
    );
    expect(report.completedThisWeek).toHaveLength(0);
  });

  it("이번 주 신규는 지시일 기준", () => {
    const report = buildWeeklyReport(
      [todo({ instructedAt: "2026-08-25" }), todo({ instructedAt: "2026-08-10" })],
      range,
      today,
    );
    expect(report.createdThisWeek).toHaveLength(1);
  });

  it("담당자별은 지연 많은 순", () => {
    const report = buildWeeklyReport(
      [
        todo({ assigneeName: "김", dueDate: "2026-08-28" }),
        todo({ assigneeName: "이", dueDate: "2026-08-01" }),
        todo({ assigneeName: "이", dueDate: "2026-08-02" }),
      ],
      range,
      today,
    );
    expect(report.people[0].assigneeName).toBe("이");
    expect(report.people[0].overdue).toBe(2);
  });

  it("미결이 없어도 이번 주에 끝냈으면 담당자별에 남는다", () => {
    // 성과가 사라지면 "한 주 동안 아무것도 안 했다"로 읽힌다.
    const report = buildWeeklyReport(
      [todo({ assigneeName: "박", completedAt: "2026-08-25T01:00:00.000Z" })],
      range,
      today,
    );
    expect(report.people).toHaveLength(1);
    expect(report.people[0]).toMatchObject({ open: 0, doneThisWeek: 1 });
  });

  it("상단 수치는 화면·메일이 같은 순서로 쓴다", () => {
    const report = buildWeeklyReport([todo()], range, today);
    expect(reportHighlights(report).map((h) => h.label)).toEqual([
      "미결",
      "지연",
      "마감임박 (7일)",
      "이번 주 신규",
      "이번 주 완료",
    ]);
  });

  it("데이터가 없으면 전부 0", () => {
    const report = buildWeeklyReport([], range, today);
    expect(reportHighlights(report).every((h) => h.value === 0)).toBe(true);
    expect(report.people).toEqual([]);
  });
});

describe("isDateString — 실제로 존재하는 날짜만", () => {
  it("정상 날짜는 통과", () => {
    expect(isDateString("2026-08-24")).toBe(true);
    expect(isDateString("2024-02-29")).toBe(true); // 윤년
  });

  it("굴러가는 값은 막는다", () => {
    // Date가 2027년으로 굴려 버려 리포트·필터가 엉뚱한 기간을 가리킨다.
    expect(isDateString("2026-13-99")).toBe(false);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2025-02-29")).toBe(false); // 평년
  });

  it("형태가 다르면 거부", () => {
    expect(isDateString("2026-8-4")).toBe(false);
    expect(isDateString("")).toBe(false);
    expect(isDateString(null)).toBe(false);
  });
});

describe("주간 리포트 메일 본문", () => {
  const range = weekRange("2026-08-26");
  const today = "2026-08-26";

  const report = buildWeeklyReport(
    [
      todo({ detail: "지연된 과제", dueDate: "2026-08-20" }),
      todo({ detail: "임박한 과제", dueDate: "2026-08-28" }),
      todo({ detail: "끝난 과제", completedAt: "2026-08-25T01:00:00.000Z" }),
    ],
    range,
    today,
  );

  it("제목에 기간과 핵심 수치가 들어간다", () => {
    const mail = buildWeeklyReportMail(report, "여민수");
    expect(mail.subject).toBe(
      "[주간 리포트] 2026년 8월 24일 ~ 8월 30일 · 미결 2건, 지연 1건",
    );
  });

  it("본문에 각 섹션과 항목이 실린다", () => {
    const mail = buildWeeklyReportMail(report, "여민수");
    for (const part of ["[지연] 1건", "지연된 과제", "[마감 임박] 1건", "[이번 주 완료] 1건", "끝난 과제"]) {
      expect(mail.text).toContain(part);
    }
    expect(mail.text).toContain("— 전략 Assistant 여민수");
  });

  it("담당 Assistant 이름이 없으면 서명만 남는다", () => {
    // 서명이 마지막 줄이라 뒤에 줄바꿈이 없다.
    expect(buildWeeklyReportMail(report).text.endsWith("— 전략 Assistant")).toBe(true);
  });

  it("HTML을 이스케이프해 본문이 깨지지 않는다", () => {
    const risky = buildWeeklyReport(
      [todo({ detail: '<script>alert("x")</script>', dueDate: "2026-08-20" })],
      range,
      today,
    );
    const mail = buildWeeklyReportMail(risky);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("항목이 많으면 잘라 내고 남은 건수를 알린다", () => {
    const many = buildWeeklyReport(
      Array.from({ length: 20 }, (_, i) =>
        todo({ detail: `과제 ${i}`, dueDate: "2026-08-20" }),
      ),
      range,
      today,
    );
    const mail = buildWeeklyReportMail(many);
    expect(mail.text).toContain("[지연] 20건");
    expect(mail.text).toContain("외 5건");
  });

  it("데이터가 없어도 본문이 만들어진다", () => {
    const empty = buildWeeklyReportMail(buildWeeklyReport([], range, today));
    expect(empty.text).toContain("[지연] 없음");
    expect(empty.html).toContain("지시사항 주간 리포트");
  });
});
