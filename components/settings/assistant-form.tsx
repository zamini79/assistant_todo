"use client";

/**
 * 전략 Assistant 설정.
 *
 * 담당자가 주기적으로 바뀌므로 코드가 아니라 여기서 관리한다.
 * 사원 명부에서 골라 이름·이메일을 함께 채운다 — 직접 타이핑하면 오타로
 * Remind 참조(CC)가 조용히 엉뚱한 주소로 나간다.
 *
 * 한 명만 지정할 수 있다. 이미 지정돼 있으면 검색칸을 감추고,
 * 지워야 다시 고를 수 있게 한다 (요청 사항).
 */
import { useState, useTransition } from "react";
import clsx from "clsx";
import { X } from "lucide-react";

import { saveSettingsAction } from "@/app/actions/settings";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import type { AppSettings } from "@/lib/domain/settings";
import { EmployeeSearch } from "@/components/employee/employee-search";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export function AssistantForm({ settings }: { settings: AppSettings }) {
  const toast = useToast();
  const [name, setName] = useState(settings.assistantName);
  const [email, setEmail] = useState(settings.assistantEmail ?? "");
  const [department, setDepartment] = useState("");
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
        {/* 저장에 실리는 값 — 명부에서 고르면 둘 다 함께 채워진다 */}
        <input type="hidden" name="assistantName" value={name} />
        <input type="hidden" name="assistantEmail" value={email} />

        {name ? (
          <div className="flex items-center gap-[10px] rounded-ctl border border-line-field bg-surface-alt px-[12px] py-[10px]">
            <span className="text-cell font-medium text-ink">{name}</span>
            {department ? (
              <span className="min-w-0 flex-1 truncate text-note text-ink-4">
                {department}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            <span className="shrink-0 truncate font-mono text-note text-ink-5">
              {email || "이메일 없음"}
            </span>
            <button
              type="button"
              onClick={() => {
                setName("");
                setEmail("");
                setDepartment("");
              }}
              aria-label="담당 Assistant 지우기"
              className="shrink-0 cursor-pointer text-ink-5 hover:text-danger-fg"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <EmployeeSearch
            placeholder="이름 또는 부서로 검색"
            onSelect={(e) => {
              setName(e.name);
              setEmail(e.email);
              setDepartment([e.department, e.title].filter(Boolean).join(" · "));
            }}
          />
        )}

        <p className="mt-[10px] text-note leading-[1.6] text-ink-4">
          한 명만 지정할 수 있습니다 · 바꾸려면 <strong className="font-medium">×</strong>로
          지운 뒤 다시 고르세요. 등록한 주소는 Remind·주간 리포트 발송 시{" "}
          <strong className="font-medium">참조(CC)</strong>로 함께 받습니다.
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
