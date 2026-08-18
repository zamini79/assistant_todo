"use client";

/**
 * 전략 Assistant 설정.
 *
 * 담당자가 주기적으로 바뀌므로 코드가 아니라 여기서 관리한다.
 * 등록한 주소는 Remind 발송 시 참조(CC)로 함께 받는다.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";

import { saveSettingsAction } from "@/app/actions/settings";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import type { AppSettings } from "@/lib/domain/settings";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const FIELD =
  "w-full rounded-ctl border border-line-field bg-card px-[11px] py-[10px] text-cell text-ink outline-none transition-colors focus:border-line-hover";
const LABEL = "mb-[6px] block text-label font-medium leading-none text-ink-3";

export function AssistantForm({ settings }: { settings: AppSettings }) {
  const toast = useToast();
  const [name, setName] = useState(settings.assistantName);
  const [email, setEmail] = useState(settings.assistantEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const result = await saveSettingsAction(IDLE_FORM_STATE, formData);
      if (result.status === "success") {
        toast(result.message);
        setError(null);
      } else if (result.status === "error") {
        setError(result.message);
      }
    });
  };

  return (
    <Card className="p-[20px]">
      <form action={submit}>
        <div className="grid grid-cols-2 gap-[14px]">
          <div>
            <label className={LABEL} htmlFor="assistantName">
              이름
            </label>
            <input
              id="assistantName"
              name="assistantName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예) 홍길동"
              autoComplete="off"
              className={FIELD}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="assistantEmail">
              이메일
            </label>
            <input
              id="assistantEmail"
              name="assistantEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="예) hong@company.com"
              autoComplete="off"
              className={FIELD}
            />
          </div>
        </div>

        <p className="mt-[10px] text-note leading-[1.6] text-ink-4">
          등록한 주소는 Remind 발송 시 <strong className="font-medium">참조(CC)</strong>로 함께
          받습니다 · 추후 사내 시스템과 연동해 이름만 입력하면 자동으로 채워질 예정입니다.
        </p>

        {error ? (
          <p role="alert" className="mt-[9px] text-note leading-[1.6] text-danger-fg">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={clsx(
            "mt-[14px] rounded-ctl bg-dark px-[20px] py-[10px] text-cell leading-none font-semibold text-on-dark transition-colors",
            "enabled:cursor-pointer enabled:hover:bg-dark-hover disabled:opacity-60",
          )}
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </form>
    </Card>
  );
}
