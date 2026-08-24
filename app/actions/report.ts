"use server";

/**
 * 주간 리포트 메일 발송.
 *
 * Remind와 같은 경로(SMTP)를 쓰되, 대상이 다르다 — 담당자 재촉이 아니라
 * 사장님·경영진 보고라서 수신자를 화면에서 직접 고른다.
 * 수신자마다 개별 발송하는 것도 Remind와 같다 (사내 게이트웨이의 대량메일 판정 회피).
 */
import { revalidatePath } from "next/cache";

import { today as getToday, weekRange } from "@/lib/domain/date";
import type { FormState } from "@/lib/domain/form-state";
import { buildWeeklyReport } from "@/lib/domain/report";
import { buildWeeklyReportMail } from "@/lib/mail/report-template";
import { getMailer } from "@/lib/mail";
import { getTodoRepository } from "@/lib/repository";

export async function sendWeeklyReportAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const recipientIds = String(formData.get("recipientIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (recipientIds.length === 0) {
    return { status: "error", message: "받는 사람을 선택해 주세요.", fieldErrors: {} };
  }

  const mailer = getMailer();
  if (!mailer) {
    return {
      status: "error",
      message: "메일 발송이 설정되지 않았습니다. SMTP 환경변수를 확인해 주세요.",
      fieldErrors: {},
    };
  }

  const repository = getTodoRepository();
  const today = getToday();

  /*
   * 기준일은 화면이 보고 있던 주를 그대로 받는다.
   * 서버가 오늘로 다시 계산하면 지난 주를 열어 두고 보낸 메일에 이번 주가 실린다.
   */
  const baseDate = String(formData.get("baseDate") ?? "").trim() || today;
  const range = weekRange(baseDate);

  const [todos, settings, master] = await Promise.all([
    repository.listAll(),
    repository.getSettings(),
    repository.listRecipients(),
  ]);

  const targets = master.filter((r) => recipientIds.includes(r.id));
  if (targets.length === 0) {
    return { status: "error", message: "선택한 수신자를 찾을 수 없습니다.", fieldErrors: {} };
  }

  const report = buildWeeklyReport(todos, range, today);
  const mail = buildWeeklyReportMail(report, settings.assistantName);
  const cc = settings.assistantEmail ?? undefined;

  let sent = 0;
  const failures: string[] = [];

  try {
    for (const r of targets) {
      try {
        await mailer.send({ to: r.email, cc, ...mail });
        sent += 1;
      } catch (error) {
        failures.push(`${r.email}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await mailer.close();
  }

  revalidatePath("/", "layout");

  if (sent === 0) {
    return {
      status: "error",
      message: `발송하지 못했습니다 — ${failures.slice(0, 2).join(" / ")}`,
      fieldErrors: {},
    };
  }
  return {
    status: "success",
    message:
      failures.length === 0
        ? `주간 리포트를 ${sent}명에게 발송했습니다.`
        : `${sent}명 발송, ${failures.length}명 실패 — ${failures[0]}`,
    at: Date.now(),
  };
}
