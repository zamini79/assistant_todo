"use client";

/**
 * 모달을 여는 트리거들. 서버 컴포넌트가 렌더한 목록/카드 안에 끼워 넣을 수 있도록
 * 필요한 최소 단위만 클라이언트 컴포넌트로 잘라냈다.
 */
import { useState, useTransition } from "react";
import clsx from "clsx";

import { deleteTodoAction } from "@/app/actions/todos";
import { IDLE_FORM_STATE } from "@/lib/domain/form-state";
import type { Todo } from "@/lib/domain/todo";
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
export function EditTodoLink({ todo }: { todo: Todo }) {
  const { openEdit } = useTodoDialog();
  return (
    <button
      type="button"
      onClick={() => openEdit(todo)}
      className="cursor-pointer border-b border-line-underline text-label leading-none text-dark"
    >
      수정
    </button>
  );
}

/** 표 행의 [수정] · [삭제] */
export function RowActions({ todo }: { todo: Todo }) {
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
      <div className="flex justify-end gap-[6px] text-label leading-none">
        <button
          type="button"
          onClick={() => openEdit(todo)}
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
