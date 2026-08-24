"use client";

/**
 * 모달을 여는 트리거들. 서버 컴포넌트가 렌더한 목록/카드 안에 끼워 넣을 수 있도록
 * 필요한 최소 단위만 클라이언트 컴포넌트로 잘라냈다.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Check, RotateCcw } from "lucide-react";

import { deleteTodoAction, setTodoCompletedAction } from "@/app/actions/todos";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import { isDone, type Todo } from "@/lib/domain/todo";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

import { useTodoDialog } from "./todo-dialog-provider";

/** [+ 지시사항 등록] — 다크 버튼 */
export function CreateTodoButton({ className }: { className?: string }) {
  const { openCreate } = useTodoDialog();
  return (
    <button
      type="button"
      onClick={openCreate}
      className={clsx(
        "cursor-pointer rounded-ctl bg-dark px-[15px] py-[9px] text-cell leading-none font-semibold text-on-dark transition-colors hover:bg-dark-hover",
        className,
      )}
    >
      + 지시사항 등록
    </button>
  );
}

/** 사이드바 메뉴의 "지시사항 등록" 항목 */
export function SidebarCreateItem() {
  const { openCreate } = useTodoDialog();
  return (
    <button
      type="button"
      onClick={openCreate}
      className="cursor-pointer rounded-ctl px-[11px] py-[9px] text-left text-body leading-none text-on-dark-2 transition-colors hover:bg-dark-hover"
    >
      지시사항 등록
    </button>
  );
}

/** 브리핑 카드의 "수정" 링크 */
export function EditTodoLink({
  todo,
  recipientIds = [],
}: {
  todo: Todo;
  recipientIds?: string[];
}) {
  const { openEdit } = useTodoDialog();
  return (
    <button
      type="button"
      onClick={() => openEdit(todo, recipientIds)}
      className="cursor-pointer border-b border-line-underline text-label leading-none text-dark"
    >
      수정
    </button>
  );
}

/** 표 행의 [수정] · [삭제] */
export function RowActions({
  todo,
  recipientIds,
}: {
  todo: Todo;
  /** 이 지시사항에 이미 지정된 추가 수신자 — 수정 시 유실되지 않게 넘긴다 */
  recipientIds: string[];
}) {
  const { openEdit } = useTodoDialog();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // useActionState + effect 대신 액션을 직접 await 한다.
  // 삭제 결과로 할 일은 "토스트 띄우고 확인창 닫기"뿐이라 렌더 사이클을 거칠 이유가 없고,
  // 효과 안에서 setState를 호출하면 불필요한 연쇄 렌더가 생긴다.
  const confirmDelete = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("id", todo.id);
      const result = await deleteTodoAction(IDLE_FORM_STATE, data);
      if (result.status !== "idle") toast(result.message, "danger");
      setConfirmOpen(false);
    });
  };

  return (
    <>
      <div className="flex items-center justify-end gap-[6px] text-label leading-none">
        <CompleteToggle todo={todo} />
        <span className="text-line-divider" aria-hidden>
          |
        </span>
        <button
          type="button"
          onClick={() => openEdit(todo, recipientIds)}
          className="cursor-pointer text-dark hover:underline"
        >
          수정
        </button>
        <span className="text-line-divider" aria-hidden>
          |
        </span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="cursor-pointer text-ink-4 hover:text-danger-fg"
        >
          삭제
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        pending={pending}
        title="이 지시사항을 삭제할까요?"
        description={`“${todo.detail}”`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </>
  );
}

/**
 * 완료 처리 / 완료 취소 토글.
 *
 * 완료는 되돌릴 수 있으므로 삭제와 달리 확인창을 두지 않는다 —
 * 잘못 눌러도 같은 자리에서 바로 되돌린다.
 */
export function CompleteToggle({ todo }: { todo: Todo }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const done = isDone(todo);

  const toggle = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("id", todo.id);
      data.set("done", String(!done));
      const result = await setTodoCompletedAction(IDLE_FORM_STATE, data);
      if (result.status !== "idle") {
        toast(result.message, result.status === "error" ? "danger" : "default");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={done}
      title={done ? "완료를 취소합니다" : "완료 처리합니다"}
      className={clsx(
        "flex items-center gap-[3px] leading-none transition-colors",
        "enabled:cursor-pointer disabled:opacity-50",
        done ? "text-ink-4 enabled:hover:text-ink-2" : "text-signal-g-fg enabled:hover:underline",
      )}
    >
      {done ? <RotateCcw size={11} aria-hidden /> : <Check size={12} aria-hidden />}
      {done ? "취소" : "완료"}
    </button>
  );
}
