"use client";

/**
 * 지시사항 등록/수정 모달 (README §4).
 * 폭 820px · radius 6px · shadow 0 24px 60px rgba(42,35,28,.3)
 */
import { useActionState, useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, X } from "lucide-react";

import { deleteTodoAction, saveTodoAction } from "@/app/actions/todos";
import { IDLE_FORM_STATE, type FormState } from "@/lib/domain/form-state";
import { today } from "@/lib/domain/date";
import {
  CATEGORIES,
  SIGNALS,
  SIGNAL_LABELS,
  type Category,
  type Signal,
  type Todo,
} from "@/lib/domain/todo";
import type { FieldErrors } from "@/lib/domain/validation";
import type { TodoOptions } from "@/lib/repository/todo-repository";
import { SIGNAL_BUTTON_OFF, SIGNAL_BUTTON_ON, SIGNAL_DOT } from "@/lib/ui/signal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

/*
 * FIELD는 글자 크기를 정하지 않는다 — 항목마다 크기가 다르고(입력 12px / textarea 12.5px),
 * 두 개의 font-size 유틸리티를 같이 걸면 class 속성 순서가 아니라 생성된 CSS 순서가
 * 이겨서 어느 쪽이 적용될지 예측할 수 없기 때문이다.
 */
const FIELD =
  "w-full rounded-ctl border border-line-field bg-card px-[11px] py-[10px] text-ink outline-none transition-colors focus:border-line-hover";
const INPUT_TEXT = "text-cell"; /* 12px — date · select */
const AREA_TEXT = "text-body leading-[1.7]"; /* 12.5px/1.7 — textarea */
const LABEL = "mb-[6px] block text-label font-medium leading-none text-ink-3";

type FormValues = {
  instructedAt: string;
  dueDate: string;
  meetingBody: string;
  org: string;
  assigneeName: string;
  category: Category;
  detail: string;
  progressNote: string;
  signal: Signal;
  /** 프로토타입과 동일하게 토글은 wait ↔ none만 오간다. sent는 발송 이력으로만 설정된다. */
  remindStatus: Todo["remindStatus"];
  attachment: Todo["attachment"];
};

function toValues(todo: Todo | null, options: TodoOptions): FormValues {
  if (todo) {
    // id/타임스탬프는 폼이 다루지 않으므로 편집 대상 필드만 골라 옮긴다.
    return {
      instructedAt: todo.instructedAt,
      dueDate: todo.dueDate,
      meetingBody: todo.meetingBody,
      org: todo.org,
      assigneeName: todo.assigneeName,
      category: todo.category,
      detail: todo.detail,
      progressNote: todo.progressNote,
      signal: todo.signal,
      remindStatus: todo.remindStatus,
      attachment: todo.attachment,
    };
  }
  const base = today();
  return {
    instructedAt: base,
    dueDate: base,
    // 첫 등록 시 데이터가 없으면 후보도 없다. 빈 값에서 시작해 직접 입력하게 둔다.
    meetingBody: options.meetingBodies[0] ?? "",
    org: options.orgs[0] ?? "",
    assigneeName: options.people[0]?.name ?? "",
    category: CATEGORIES[0],
    detail: "",
    progressNote: "",
    signal: "G",
    remindStatus: "wait",
    attachment: null,
  };
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

function fieldError(state: FormState, key: keyof FieldErrors): string | undefined {
  return state.status === "error" ? state.fieldErrors[key] : undefined;
}

function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-[5px] text-note leading-none text-danger-fg">{message}</p>;
}

export function TodoFormDialog({
  todo,
  options,
  onClose,
}: {
  todo: Todo | null;
  options: TodoOptions;
  onClose: () => void;
}) {
  const isEdit = todo !== null;
  const titleId = useId();
  const toast = useToast();

  const [values, setValues] = useState<FormValues>(() => toValues(todo, options));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [saveState, saveAction, saving] = useActionState(saveTodoAction, IDLE_FORM_STATE);
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteTodoAction,
    IDLE_FORM_STATE,
  );

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // 선택한 조직에 속한 인물만 이름 후보로 보여준다.
  // 인사시스템 연동 전이라 후보는 기존 등록 데이터에서 유도된다.
  const nameOptions = useMemo(() => {
    // 같은 조직 사람을 먼저 제안하되, 없으면 전체를 보여준다.
    // 자유 입력이므로 후보에 없는 이름을 적어도 막지 않는다.
    const inOrg = options.people.filter((p) => p.org === values.org);
    return inOrg.length ? inOrg : options.people;
  }, [options.people, values.org]);

  // 저장/삭제 성공 → 토스트 후 닫기
  useEffect(() => {
    if (saveState.status === "success") {
      toast(saveState.message);
      onClose();
    }
  }, [saveState, toast, onClose]);

  useEffect(() => {
    if (deleteState.status === "success") {
      toast(deleteState.message, "danger");
      onClose();
    }
  }, [deleteState, toast, onClose]);

  // Escape 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmOpen) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose, confirmOpen]);

  const formError =
    saveState.status === "error"
      ? saveState.message
      : deleteState.status === "error"
        ? deleteState.message
        : undefined;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[rgba(42,35,28,.45)] px-5 py-[48px]"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <form
          action={saveAction}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-[820px] overflow-hidden rounded-modal bg-card shadow-modal"
        >
          <input type="hidden" name="id" value={todo?.id ?? ""} />

          {/* 헤더 */}
          <div className="flex items-center justify-between border-b border-line-card px-[26px] py-[20px]">
            <div>
              <h2 id={titleId} className="text-modal font-semibold text-ink">
                {isEdit ? "지시사항 수정" : "지시사항 등록"}
              </h2>
              <p className="mt-[3px] text-label leading-[1.6] text-ink-4">
                전략 Assistant 직접 입력 · 조직/이름은 추후 인사시스템 연동
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="cursor-pointer p-[6px] text-ink-4 transition-colors hover:text-ink-2"
            >
              <X size={18} />
            </button>
          </div>

          {/* 본문 */}
          <div className="grid grid-cols-2 gap-[14px] px-[26px] pt-[22px] pb-[24px]">
            <div>
              <label className={LABEL} htmlFor="instructedAt">
                지시일
              </label>
              <input
                id="instructedAt"
                name="instructedAt"
                type="date"
                required
                value={values.instructedAt}
                onChange={(e) => set("instructedAt", e.target.value)}
                className={clsx(FIELD, INPUT_TEXT, "font-mono")}
              />
              <ErrorText message={fieldError(saveState, "instructedAt")} />
            </div>

            <div>
              <label className={LABEL} htmlFor="dueDate">
                완료목표일
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                required
                value={values.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                className={clsx(FIELD, INPUT_TEXT, "font-mono")}
              />
              <ErrorText message={fieldError(saveState, "dueDate")} />
            </div>

            <div className="col-span-2">
              <label className={LABEL} htmlFor="meetingBody">
                회의체
              </label>
              <ComboField
                id="meetingBody"
                name="meetingBody"
                value={values.meetingBody}
                onChange={(v) => set("meetingBody", v)}
                suggestions={options.meetingBodies}
                placeholder="예) 주간 경영회의"
              />
              <ErrorText message={fieldError(saveState, "meetingBody")} />
            </div>

            <div>
              <label className={LABEL} htmlFor="org">
                조직
              </label>
              <ComboField
                id="org"
                name="org"
                value={values.org}
                onChange={(v) => set("org", v)}
                suggestions={options.orgs}
                placeholder="예) 영업본부"
              />
              <p className="mt-[5px] text-note leading-none text-ink-5">
                직접 입력 · 추후 인사시스템 연동
              </p>
              <ErrorText message={fieldError(saveState, "org")} />
            </div>

            <div>
              <label className={LABEL} htmlFor="assigneeName">
                이름
              </label>
              <ComboField
                id="assigneeName"
                name="assigneeName"
                value={values.assigneeName}
                onChange={(v) => set("assigneeName", v)}
                suggestions={nameOptions.map((p) => p.name)}
                placeholder="예) 박현수 본부장"
              />
              <ErrorText message={fieldError(saveState, "assigneeName")} />
            </div>

            <div className="col-span-2">
              <span className={LABEL}>지시사항 구분</span>
              <input type="hidden" name="category" value={values.category} />
              <div className="flex flex-wrap gap-[6px]">
                {CATEGORIES.map((c) => {
                  const on = values.category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set("category", c)}
                      aria-pressed={on}
                      className={clsx(
                        "cursor-pointer rounded-ctl border px-[12px] py-[8px] text-aux leading-none font-medium transition-colors",
                        on
                          ? "border-dark bg-dark text-on-dark"
                          : "border-line-field bg-card text-ink-2 hover:border-line-hover",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <ErrorText message={fieldError(saveState, "category")} />
            </div>

            <div className="col-span-2">
              <label className={LABEL} htmlFor="detail">
                지시사항 세부 내용
              </label>
              <textarea
                id="detail"
                name="detail"
                required
                value={values.detail}
                onChange={(e) => set("detail", e.target.value)}
                placeholder="지시 내용을 입력하세요"
                className={clsx(FIELD, AREA_TEXT, "min-h-[70px]")}
              />
              <ErrorText message={fieldError(saveState, "detail")} />
            </div>

            <div className="col-span-2">
              <label className={LABEL} htmlFor="progressNote">
                진행상황
              </label>
              <textarea
                id="progressNote"
                name="progressNote"
                value={values.progressNote}
                onChange={(e) => set("progressNote", e.target.value)}
                placeholder="진행상황을 입력하세요"
                className={clsx(FIELD, AREA_TEXT, "min-h-[44px] text-ink-2")}
              />
            </div>

            <div className="col-span-2">
              <span className={LABEL}>진행상황 신호등</span>
              <input type="hidden" name="signal" value={values.signal} />
              <div className="flex gap-[6px]">
                {SIGNALS.map((s) => {
                  const on = values.signal === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("signal", s)}
                      aria-pressed={on}
                      className={clsx(
                        "flex flex-1 cursor-pointer items-center justify-center gap-[6px] rounded-ctl border p-[10px] text-aux leading-none font-medium transition-colors",
                        on ? SIGNAL_BUTTON_ON[s] : SIGNAL_BUTTON_OFF,
                      )}
                    >
                      <span
                        aria-hidden
                        className={clsx("h-[8px] w-[8px] rounded-full", SIGNAL_DOT[s])}
                      />
                      {SIGNAL_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="col-span-2 flex items-center justify-between rounded-ctl bg-surface-alt px-[14px] py-[13px]">
              <div>
                <p className="text-aux leading-none font-medium text-ink-2">
                  Remind 메일 발송
                </p>
                <p className="mt-[4px] text-note leading-[1.6] text-ink-4">
                  사내 메일서버 연동 후 활성화 · 현재는 발송 예약만 기록
                </p>
              </div>
              <input type="hidden" name="remindStatus" value={values.remindStatus} />
              <button
                type="button"
                role="switch"
                aria-checked={values.remindStatus !== "none"}
                aria-label="Remind 메일 발송 예약"
                onClick={() =>
                  set("remindStatus", values.remindStatus === "none" ? "wait" : "none")
                }
                className={clsx(
                  "relative h-[22px] w-[40px] shrink-0 cursor-pointer rounded-chip transition-colors",
                  values.remindStatus === "none" ? "bg-line-field" : "bg-dark",
                )}
              >
                <span
                  className="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-card transition-[left]"
                  style={{ left: values.remindStatus === "none" ? 2 : 20 }}
                />
              </button>
            </div>

            <div className="col-span-2">
              <span className={LABEL}>첨부 파일</span>
              <AttachmentField
                attachment={values.attachment}
                onChange={(a) => set("attachment", a)}
              />
            </div>

            {formError ? (
              <p
                role="alert"
                className="col-span-2 rounded-ctl border border-danger-line bg-signal-r-bg px-[12px] py-[10px] text-label leading-[1.6] text-danger-fg"
              >
                {formError}
              </p>
            ) : null}
          </div>

          {/* 푸터 */}
          <div className="flex items-center gap-[8px] border-t border-line-card bg-surface-alt px-[26px] py-[16px]">
            <button
              type="submit"
              disabled={saving || deleting}
              className="cursor-pointer rounded-ctl bg-dark px-[26px] py-[12px] text-section leading-none font-semibold text-on-dark transition-colors hover:bg-dark-hover disabled:opacity-60"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="cursor-pointer rounded-ctl border border-line-field px-[18px] py-[12px] text-section leading-none text-ink-3 transition-colors hover:border-line-hover disabled:opacity-60"
            >
              취소
            </button>
            <div className="flex-1" />
            {isEdit ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={saving || deleting}
                className="cursor-pointer rounded-ctl border border-danger-line px-[18px] py-[12px] text-section leading-none text-danger-fg transition-colors hover:bg-signal-r-bg disabled:opacity-60"
              >
                삭제
              </button>
            ) : null}
          </div>
        </form>
      </div>

      {/* 삭제 확인 — 확인 시에만 별도 폼으로 삭제 액션을 제출한다 */}
      <ConfirmDialog
        open={confirmOpen}
        pending={deleting}
        title="이 지시사항을 삭제할까요?"
        description={todo ? `“${todo.detail}”` : undefined}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          const data = new FormData();
          data.set("id", todo?.id ?? "");
          deleteAction(data);
          setConfirmOpen(false);
        }}
      />
    </>
  );
}

/**
 * 자유 입력 + 기존 값 자동완성.
 *
 * 드롭다운(select)으로 두면 등록된 데이터가 하나도 없을 때 선택지가 비어
 * 첫 지시사항을 아예 등록할 수 없다. 핸드오프 문서도 "조직/이름은 수동 입력"이라
 * 명시하므로 자유 입력이 맞고, datalist로 기존 값을 제안해 오타·표기 흔들림을 줄인다.
 */
function ComboField({
  id,
  name,
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const listId = `${id}-suggestions`;
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        list={suggestions.length > 0 ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        required
        className={clsx(FIELD, INPUT_TEXT, suggestions.length > 0 && "pr-[28px]")}
      />
      {suggestions.length > 0 ? (
        <>
          <datalist id={listId}>
            {suggestions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
          <ChevronDown
            size={14}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-[10px] -translate-y-1/2 text-ink-5"
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * 첨부 파일 — 현재 범위는 메타데이터(파일명·크기)만 저장한다.
 * 실제 업로드는 스토리지 계층 연동 후.
 */
function AttachmentField({
  attachment,
  onChange,
}: {
  attachment: Todo["attachment"];
  onChange: (value: Todo["attachment"]) => void;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  const accept = (file: File | undefined) => {
    if (file) onChange({ name: file.name, size: file.size });
  };

  return (
    <>
      <input type="hidden" name="attachmentName" value={attachment?.name ?? ""} />
      <input type="hidden" name="attachmentSize" value={attachment?.size ?? 0} />
      <input
        id={inputId}
        type="file"
        className="sr-only"
        onChange={(e) => accept(e.target.files?.[0])}
      />
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={clsx(
          "block cursor-pointer rounded-ctl border border-dashed p-[15px] text-center text-aux leading-[1.7] transition-colors",
          dragging ? "border-line-hover bg-surface-alt" : "border-line-field",
        )}
      >
        <span className="text-ink-4">파일을 끌어다 놓거나 클릭하여 첨부</span>
        <br />
        <span className="text-note text-ink-5">
          {attachment
            ? `${attachment.name}${formatSize(attachment.size) ? ` · ${formatSize(attachment.size)}` : ""}`
            : "첨부 없음"}
        </span>
        <br />
        <span className="text-note text-ink-5">
          현재는 파일명·크기만 저장 · 실제 업로드는 스토리지 연동 후
        </span>
      </label>
      {attachment ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-[6px] cursor-pointer text-note text-ink-3 underline decoration-line-field underline-offset-2"
        >
          첨부 제거
        </button>
      ) : null}
    </>
  );
}
