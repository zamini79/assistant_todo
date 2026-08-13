"use client";

/**
 * 진행 이력 추가 폼 / 삭제 버튼.
 *
 * 저장하면 이 값이 지시사항의 현재 상태(진행상황·진척률·신호등)가 된다.
 * 펼침 상태는 URL(`?open=`)에 있으므로 서버 갱신 후에도 패널이 닫히지 않는다.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";

import { addTodoUpdateAction, deleteTodoUpdateAction } from "@/app/actions/todos";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import { SIGNALS, SIGNAL_LABELS, type Signal } from "@/lib/domain/todo";
import { SIGNAL_BUTTON_OFF, SIGNAL_BUTTON_ON, SIGNAL_DOT } from "@/lib/ui/signal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function AddUpdateForm({
  todoId,
  currentSignal,
  currentPct,
}: {
  todoId: string;
  currentSignal: Signal;
  currentPct: number;
}) {
  const toast = useToast();

  // 직전 상태를 기본값으로 둔다 — 대개 내용만 바뀌고 신호등은 유지되기 때문.
  const [signal, setSignal] = useState<Signal>(currentSignal);
  const [pct, setPct] = useState(currentPct);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * useActionState + effect 대신 액션을 직접 await 한다.
   * 성공 시 입력만 비우면 되는데, 효과 안에서 setState를 호출하면
   * 불필요한 연쇄 렌더가 생긴다. 신호등·진행률은 일부러 남겨둔다 —
   * 다음 기록도 대개 같은 값에서 출발하기 때문.
   */
  const submit = (formData: FormData) => {
    startTransition(async () => {
      const result = await addTodoUpdateAction(IDLE_FORM_STATE, formData);
      if (result.status === "success") {
        toast(result.message);
        setNote("");
        setError(null);
      } else if (result.status === "error") {
        setError(result.message);
      }
    });
  };

  return (
    <form
      action={submit}
      className="rounded-card border border-line-card bg-card p-[16px]"
    >
      <input type="hidden" name="todoId" value={todoId} />
      <input type="hidden" name="signal" value={signal} />

      <p className="mb-[10px] text-label leading-none font-medium text-ink-3">
        진행 상황 기록
      </p>

      <textarea
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="무엇이 진행됐는지 적어주세요"
        className="w-full rounded-ctl border border-line-field bg-card px-[11px] py-[10px] text-body leading-[1.6] text-ink outline-none transition-colors focus:border-line-hover"
        style={{ minHeight: 68 }}
      />

      <div className="mt-[10px] flex gap-[4px]">
        {SIGNALS.map((s) => {
          const on = signal === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSignal(s)}
              aria-pressed={on}
              className={clsx(
                "flex flex-1 cursor-pointer items-center justify-center gap-[5px] rounded-ctl border px-[6px] py-[8px] text-note leading-none font-medium transition-colors",
                on ? SIGNAL_BUTTON_ON[s] : SIGNAL_BUTTON_OFF,
              )}
            >
              <span aria-hidden className={clsx("h-[7px] w-[7px] rounded-full", SIGNAL_DOT[s])} />
              {SIGNAL_LABELS[s]}
            </button>
          );
        })}
      </div>

      <div className="mt-[10px] flex items-center gap-[8px]">
        <label className="text-label leading-none text-ink-3" htmlFor={`pct-${todoId}`}>
          진행률
        </label>
        <input
          id={`pct-${todoId}`}
          name="progressPct"
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="flex-1 accent-[var(--color-dark)]"
        />
        <span className="w-[38px] text-right font-mono text-label leading-none text-ink-2">
          {pct}%
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-[9px] text-note leading-[1.6] text-danger-fg">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || note.trim() === ""}
        className="mt-[12px] w-full cursor-pointer rounded-ctl bg-dark py-[10px] text-cell leading-none font-semibold text-on-dark transition-colors hover:bg-dark-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "기록 중…" : "이력 추가"}
      </button>

      <p className="mt-[8px] text-note leading-[1.6] text-ink-4">
        기록하면 이 값이 지시사항의 현재 상태가 됩니다.
      </p>
    </form>
  );
}

export function DeleteUpdateButton({
  updateId,
  note,
}: {
  updateId: string;
  note: string;
}) {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirmDelete = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("updateId", updateId);
      const result = await deleteTodoUpdateAction(IDLE_FORM_STATE, data);
      if (result.status !== "idle") toast(result.message, "danger");
      setConfirmOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="cursor-pointer text-note leading-none text-ink-5 transition-colors hover:text-danger-fg"
      >
        삭제
      </button>
      <ConfirmDialog
        open={confirmOpen}
        pending={pending}
        title="이 이력을 삭제할까요?"
        description={`“${note}” — 삭제하면 남은 최신 이력이 현재 상태가 됩니다.`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
