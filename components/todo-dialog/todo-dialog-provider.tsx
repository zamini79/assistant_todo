"use client";

/**
 * 등록/수정 모달의 열림 상태를 앱 셸 전체에 제공한다.
 *
 * 모달은 사이드바 · 브리핑 카드 · 표 행 등 여러 곳에서 열리므로
 * 각 트리거가 모달 마크업을 중복해서 들고 있지 않도록 컨텍스트로 올린다.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { Todo } from "@/lib/domain/todo";
import type { TodoOptions } from "@/lib/repository/todo-repository";

import { TodoFormDialog } from "./todo-form-dialog";

type DialogState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; todo: Todo };

type DialogApi = {
  openCreate: () => void;
  openEdit: (todo: Todo) => void;
  close: () => void;
};

const TodoDialogContext = createContext<DialogApi | null>(null);

export function TodoDialogProvider({
  options,
  children,
}: {
  options: TodoOptions;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DialogState>({ mode: "closed" });

  const close = useCallback(() => setState({ mode: "closed" }), []);

  const api = useMemo<DialogApi>(
    () => ({
      openCreate: () => setState({ mode: "create" }),
      openEdit: (todo: Todo) => setState({ mode: "edit", todo }),
      close,
    }),
    [close],
  );

  return (
    <TodoDialogContext.Provider value={api}>
      {children}
      {state.mode !== "closed" ? (
        <TodoFormDialog
          // key를 바꿔 모달을 다시 마운트한다 — 이전 편집 값이 남지 않게 하기 위함.
          key={state.mode === "edit" ? state.todo.id : "create"}
          todo={state.mode === "edit" ? state.todo : null}
          options={options}
          onClose={close}
        />
      ) : null}
    </TodoDialogContext.Provider>
  );
}

export function useTodoDialog(): DialogApi {
  const ctx = useContext(TodoDialogContext);
  if (!ctx) {
    throw new Error("useTodoDialog는 TodoDialogProvider 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}
