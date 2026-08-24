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
import type { MeetingBody, Recipient } from "@/lib/domain/settings";

import { TodoFormDialog } from "./todo-form-dialog";

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; todo: Todo; recipientIds?: string[] };

type DialogApi = {
  openCreate: () => void;
  openEdit: (todo: Todo, recipientIds?: string[]) => void;
  close: () => void;
};

const TodoDialogContext = createContext<DialogApi | null>(null);

export function TodoDialogProvider({
  options,
  recipients,
  meetingBodies,
  storageConfigured,
  children,
}: {
  options: TodoOptions;
  recipients: Recipient[];
  /** 설정에서 관리하는 회의체 마스터 — 등록 폼의 선택지 */
  meetingBodies: MeetingBody[];
  /** 파일 저장소 미설정이면 첨부 칸을 막는다 */
  storageConfigured: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DialogState>({ mode: "closed" });

  const close = useCallback(() => setState({ mode: "closed" }), []);

  const api = useMemo<DialogApi>(
    () => ({
      openCreate: () => setState({ mode: "create" }),
      openEdit: (todo: Todo, recipientIds?: string[]) =>
        setState({ mode: "edit", todo, recipientIds }),
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
          recipients={recipients}
          meetingBodies={meetingBodies}
          storageConfigured={storageConfigured}
          // 편집 중인 건의 기존 수신자. 서버에서 미리 받아두면 모달이 느려지므로
          // 행에서 전달된 값을 쓴다 (없으면 빈 목록에서 시작).
          selectedRecipientIds={
            state.mode === "edit" ? (state.recipientIds ?? []) : []
          }
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
