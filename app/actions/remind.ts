"use server";

/**
 * Remind 메일 발송.
 *
 * 발송 대상 = 지시사항 담당자 + 그 지시사항에 지정한 추가 수신자.
 * 전략 Assistant는 참조(CC)로 함께 받는다.
 *
 * 수신자마다 개별 메시지를 보낸다. 한 통에 여러 수신자를 넣으면 사내 게이트웨이가
 * 외부 발신자의 대량메일로 보고 일부만 도달하는 일이 생긴다 — 다른 사내 프로젝트에서
 * 실제로 겪은 문제다. 개별 발송은 수신자 목록도 서로에게 감춰준다.
 *
 * 한 건이 실패해도 나머지는 계속 보낸다. 실패한 건은 `wait`로 남아 재시도할 수 있다.
 */
import { revalidatePath } from "next/cache";

import { today as getToday } from "@/lib/domain/date";
import type { FormState } from "@/lib/domain/form-state";
import { buildRemindMail } from "@/lib/mail/remind-template";
import { getMailer } from "@/lib/mail";
import { getTodoRepository } from "@/lib/repository";
import { resolveRecipients } from "@/lib/domain/settings";

export async function sendRemindsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ids = String(formData.get("todoIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return { status: "error", message: "발송할 항목을 선택해 주세요.", fieldErrors: {} };
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
  const settings = await repository.getSettings();
  const cc = settings.assistantEmail ?? undefined;
  let sent = 0;
  const failures: string[] = [];

  try {
    for (const id of ids) {
      const todo = await repository.findById(id);
      if (!todo) {
        failures.push("이미 삭제된 지시사항");
        continue;
      }
      const extras = await repository.listTodoRecipients(todo.id);
      const targets = resolveRecipients(todo.assigneeEmail, extras);
      if (targets.length === 0) {
        failures.push(`${todo.assigneeName}: 수신 주소 없음`);
        continue;
      }

      const mail = buildRemindMail(todo, today, settings.assistantName);
      for (const to of targets) {
        try {
          await mailer.send({ to, cc, ...mail });
          await repository.recordRemind({ todoId: todo.id, recipient: to, status: "sent" });
          sent += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          failures.push(`${to}: ${reason}`);
          // 발송은 실패해도 시도 사실은 남긴다. 이 기록마저 실패하면 넘어간다.
          await repository
            .recordRemind({ todoId: todo.id, recipient: to, status: "failed", error: reason })
            .catch(() => undefined);
        }
      }
    }
  } finally {
    await mailer.close();
  }

  revalidatePath("/", "layout");

  if (sent === 0) {
    return {
      status: "error",
      message: `발송하지 못했습니다 — ${failures.slice(0, 3).join(" / ")}`,
      fieldErrors: {},
    };
  }
  return {
    status: "success",
    message:
      failures.length === 0
        ? `${sent}건 발송했습니다.`
        : `${sent}건 발송, ${failures.length}건 실패 — ${failures[0]}`,
    at: Date.now(),
  };
}
