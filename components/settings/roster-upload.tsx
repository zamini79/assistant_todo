"use client";

/**
 * 사원 명부 업로드 (인사정보 연동 전 임시).
 *
 * 파일을 올리면 명부를 통째로 갈아끼운다. 부분 갱신이 아니라 전량 교체라
 * 올리기 전에 그 사실을 분명히 알리고 확인을 받는다.
 */
import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { Upload } from "lucide-react";

import { clearRosterAction, uploadRosterAction } from "@/app/actions/employees";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import { Card } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function RosterUpload({ count }: { count: number }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const upload = () => {
    if (!file) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("roster", file);
      const result = await uploadRosterAction(IDLE_FORM_STATE, data);
      if (result.status === "success") {
        toast(result.message);
        setError(null);
        reset();
      } else if (result.status === "error") {
        setError(result.message);
      }
    });
  };

  const clear = () => {
    startTransition(async () => {
      const result = await clearRosterAction();
      if (result.status !== "idle") {
        toast(result.message, result.status === "error" ? "danger" : "default");
      }
      setConfirmClear(false);
    });
  };

  return (
    <>
      <Card className="p-[20px]">
        <div className="flex items-center justify-between">
          <span className="text-label text-ink-3">
            {count > 0 ? `${count.toLocaleString("ko-KR")}명 등록됨` : "등록된 명부 없음"}
          </span>
          {count > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="cursor-pointer text-label text-ink-4 transition-colors hover:text-danger-fg"
            >
              명부 비우기
            </button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          id="roster-file"
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <label
          htmlFor="roster-file"
          className={clsx(
            "mt-[12px] flex cursor-pointer items-center justify-center gap-[6px] rounded-ctl border border-dashed border-line-field px-[14px] py-[14px]",
            "text-aux leading-none text-ink-4 transition-colors hover:border-line-hover hover:text-ink-3",
          )}
        >
          <Upload size={13} />
          {file ? file.name : "엑셀 파일 선택 (.xlsx)"}
        </label>

        <p className="mt-[10px] text-note leading-[1.7] text-ink-4">
          열 이름으로 읽습니다 — <strong className="font-medium">이름 · email · 부서 · 직책</strong>.
          올리면 기존 명부를 <strong className="font-medium">전부 교체</strong>합니다
          (퇴사자가 빠진 파일을 올리면 그대로 반영됩니다).
          <br />
          사내 인사정보 연동 시 이 명부는 비우고 연동 데이터로 대체합니다.
        </p>

        {error ? (
          <p role="alert" className="mt-[9px] text-note leading-[1.6] text-danger-fg">
            {error}
          </p>
        ) : null}

        <div className="mt-[14px] flex items-center gap-[8px]">
          <button
            type="button"
            onClick={upload}
            disabled={pending || !file}
            className={clsx(
              "rounded-ctl bg-dark px-[20px] py-[10px] text-cell leading-none font-semibold text-on-dark transition-colors",
              "enabled:cursor-pointer enabled:hover:bg-dark-hover disabled:opacity-50",
            )}
          >
            {pending ? "올리는 중…" : "명부 올리기"}
          </button>
          {file ? (
            <button
              type="button"
              onClick={reset}
              className="cursor-pointer rounded-ctl border border-line-field px-[16px] py-[10px] text-cell leading-none text-ink-3 hover:border-line-hover"
            >
              선택 취소
            </button>
          ) : null}
        </div>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        pending={pending}
        title="사원 명부를 비울까요?"
        description={`${count.toLocaleString("ko-KR")}명이 지워집니다.\n이미 등록된 지시사항의 담당자 정보는 값으로 복사돼 있어 그대로 남습니다.`}
        confirmLabel="비우기"
        onCancel={() => setConfirmClear(false)}
        onConfirm={clear}
      />
    </>
  );
}
