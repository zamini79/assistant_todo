"use client";

/**
 * 지시사항 등록/수정 모달 (README §4).
 * 폭 820px · radius 6px · shadow 0 24px 60px rgba(42,35,28,.3)
 */
import { useActionState, useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Paperclip, X } from "lucide-react";

import { deleteTodoAction, saveTodoAction } from "@/app/actions/todos";
import { IDLE_FORM_STATE, type FormState } from "@/lib/domain/form-state";
import { today } from "@/lib/domain/date";
import {
  CATEGORIES,
  SIGNALS,
  SIGNAL_LABELS,
  type Category,
  isStored,
  type Attachment,
  type Signal,
  type Todo,
} from "@/lib/domain/todo";
import type { FieldErrors } from "@/lib/domain/validation";
import {
  checkFiles,
  formatBytes,
  MAX_FILE_BYTES,
  MAX_FILES_PER_TODO,
} from "@/lib/domain/attachment";
import type { TodoOptions } from "@/lib/repository/todo-repository";
import {
  findMeetingBody,
  recipientLabel,
  type MeetingBody,
  type Recipient,
} from "@/lib/domain/settings";
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
  assigneeEmail: string;
  category: Category;
  detail: string;
  progressNote: string;
  signal: Signal;
  /** 프로토타입과 동일하게 토글은 wait ↔ none만 오간다. sent는 발송 이력으로만 설정된다. */
  remindStatus: Todo["remindStatus"];
  attachments: Attachment[];
};

function toValues(
  todo: Todo | null,
  options: TodoOptions,
  meetingBodies: MeetingBody[],
): FormValues {
  if (todo) {
    // id/타임스탬프는 폼이 다루지 않으므로 편집 대상 필드만 골라 옮긴다.
    return {
      instructedAt: todo.instructedAt,
      dueDate: todo.dueDate,
      meetingBody: todo.meetingBody,
      org: todo.org,
      assigneeName: todo.assigneeName,
      assigneeEmail: todo.assigneeEmail ?? "",
      category: todo.category,
      detail: todo.detail,
      progressNote: todo.progressNote,
      signal: todo.signal,
      remindStatus: todo.remindStatus,
      attachments: todo.attachments,
    };
  }
  const base = today();
  return {
    instructedAt: base,
    dueDate: base,
    // 회의체는 설정의 마스터에서 고른다. 아직 하나도 없으면 빈 값에서 시작해
    // '직접 입력'으로 첫 회의체를 만들게 둔다 (그래야 최초 등록이 막히지 않는다).
    meetingBody: meetingBodies[0]?.name ?? "",
    /*
     * 조직·이름은 빈 칸에서 시작한다.
     *
     * 기존 값 중 첫 번째를 미리 넣어 두면 직접 적으려 할 때마다 먼저 지워야 하고,
     * 무엇보다 못 보고 저장하면 엉뚱한 담당자로 등록된다.
     * 인사정보 연동 전까지는 매번 직접 적는 값이므로 비워 두는 편이 안전하다.
     */
    org: "",
    assigneeName: "",
    assigneeEmail: "",
    category: CATEGORIES[0],
    detail: "",
    progressNote: "",
    signal: "G",
    remindStatus: "wait",
    attachments: [],
  };
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
  recipients,
  meetingBodies,
  storageConfigured,
  selectedRecipientIds,
  onClose,
}: {
  todo: Todo | null;
  options: TodoOptions;
  /** 설정에서 관리하는 수신자 마스터 */
  recipients: Recipient[];
  /** 설정에서 관리하는 회의체 마스터 */
  meetingBodies: MeetingBody[];
  /** 파일 저장소 미설정이면 첨부 칸을 막는다 */
  storageConfigured: boolean;
  /** 편집 중인 지시사항에 이미 지정된 추가 수신자 */
  selectedRecipientIds: string[];
  onClose: () => void;
}) {
  const isEdit = todo !== null;
  const titleId = useId();
  const toast = useToast();

  const [values, setValues] = useState<FormValues>(() =>
    toValues(todo, options, meetingBodies),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pickedRecipients, setPickedRecipients] = useState<string[]>(selectedRecipientIds);
  /** 이번에 새로 고른 첨부들. 저장 시 서버가 올린다. */
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);

  /*
   * 회의체를 '직접 입력'으로 열지 여부.
   *
   * - 마스터가 비어 있으면(첫 등록) 고를 게 없으니 직접 입력에서 시작한다.
   * - 수정 중인 건의 회의체가 마스터에 없으면(설정에서 지운 회의체) 그 값을 지우지 않고
   *   직접 입력에 담아 보여준다. 저장 시 마스터로 되돌아온다.
   */
  const [customMeeting, setCustomMeeting] = useState(
    () => !findMeetingBody(meetingBodies, values.meetingBody),
  );

  const [saveState, saveAction, saving] = useActionState(saveTodoAction, IDLE_FORM_STATE);
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteTodoAction,
    IDLE_FORM_STATE,
  );

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // 선택한 조직에 속한 인물만 이름 후보로 보여준다.
  // 인사정보 연동 전이라 후보는 기존 등록 데이터에서 유도된다.
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

  /*
   * 고른 파일은 state에 있으므로 제출 직전에 FormData에 넣는다.
   * file input에 name을 달지 않는 이유는 개별 항목을 뺄 수 없기 때문이다.
   */
  const submit = (formData: FormData) => {
    for (const file of pickedFiles) formData.append("attachmentFiles", file);
    saveAction(formData);
  };

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
          action={submit}
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
                전략 Assistant 직접 입력 · 조직/이름은 추후 인사정보 연동
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
              <MeetingBodyField
                meetingBodies={meetingBodies}
                value={values.meetingBody}
                custom={customMeeting}
                onChange={(v) => set("meetingBody", v)}
                onCustomChange={setCustomMeeting}
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
                직접 입력 · 추후 인사정보 연동
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
              <p className="mt-[5px] text-note leading-none text-ink-5">
                직접 입력 · 추후 인사정보 연동
              </p>
              <ErrorText message={fieldError(saveState, "assigneeName")} />
            </div>

            <div className="col-span-2">
              <label className={LABEL} htmlFor="assigneeEmail">
                이메일 <span className="font-normal text-ink-5">(Remind 발송용 · 선택)</span>
              </label>
              <input
                id="assigneeEmail"
                name="assigneeEmail"
                type="email"
                value={values.assigneeEmail}
                onChange={(e) => set("assigneeEmail", e.target.value)}
                placeholder="예) hong@company.com"
                autoComplete="off"
                className={clsx(FIELD, INPUT_TEXT)}
              />
              <p className="mt-[5px] text-note leading-none text-ink-5">
                비워두면 Remind 큐에서 발송 대상에서 제외됩니다.
              </p>
              <ErrorText message={fieldError(saveState, "assigneeEmail")} />
            </div>

            <div className="col-span-2">
              <span className={LABEL}>
                추가 메일 수신자{" "}
                <span className="font-normal text-ink-5">
                  (담당자는 자동 포함 · 설정에서 목록 관리)
                </span>
              </span>
              <input
                type="hidden"
                name="recipientIds"
                value={pickedRecipients.join(",")}
              />
              {recipients.length === 0 ? (
                <p className="rounded-ctl border border-dashed border-line-field px-[12px] py-[10px] text-note leading-[1.6] text-ink-4">
                  등록된 수신자가 없습니다 · 설정 → 메일 수신자에서 추가하세요.
                </p>
              ) : (
                <div className="flex flex-wrap gap-[6px]">
                  {recipients.map((r) => {
                    const on = pickedRecipients.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={on}
                        title={r.email}
                        onClick={() =>
                          setPickedRecipients((prev) =>
                            prev.includes(r.id)
                              ? prev.filter((id) => id !== r.id)
                              : [...prev, r.id],
                          )
                        }
                        className={clsx(
                          "cursor-pointer rounded-chip border px-[11px] py-[7px] text-note leading-none font-medium transition-colors",
                          on
                            ? "border-dark bg-dark text-on-dark"
                            : "border-line-field bg-card text-ink-2 hover:border-line-hover",
                        )}
                      >
                        {recipientLabel(r)}
                      </button>
                    );
                  })}
                </div>
              )}
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
                  켜두면 Remind 큐에 올라가고, 큐 또는 표에서 발송합니다
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
                todoId={todo?.id ?? null}
                kept={values.attachments}
                onKeptChange={(next) => set("attachments", next)}
                picked={pickedFiles}
                onPickedChange={setPickedFiles}
                storageConfigured={storageConfigured}
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

/** '직접 입력' 항목을 나타내는 select 값 — 실제 회의체 이름과 겹치지 않는 문자열 */
const CUSTOM_MEETING = "__custom__";

/**
 * 회의체 — 설정에 등록된 목록에서 고르고, 맨 끝에서 '직접 입력'으로 빠질 수 있다.
 *
 * 직접 입력한 값은 지시사항이 저장될 때 서버가 마스터에 자동 편입한다
 * (app/actions/todos.ts의 ensureMeetingBody). 폼에서 미리 만들지 않는 이유는,
 * 저장을 취소하면 쓰지도 않은 회의체만 남기 때문이다.
 *
 * 값은 select/입력칸이 아니라 hidden input이 들고 제출한다 — select의 값이
 * '직접 입력'일 때는 회의체 이름이 아니라 센티널이라서 그대로 보내면 안 된다.
 */
function MeetingBodyField({
  meetingBodies,
  value,
  custom,
  onChange,
  onCustomChange,
}: {
  meetingBodies: MeetingBody[];
  value: string;
  custom: boolean;
  onChange: (value: string) => void;
  onCustomChange: (custom: boolean) => void;
}) {
  const empty = meetingBodies.length === 0;

  return (
    <>
      <input type="hidden" name="meetingBody" value={value} />

      {/* 마스터가 비어 있으면 고를 게 없으므로 선택 상자를 감춘다 */}
      {!empty ? (
        <div className="relative">
          <select
            id="meetingBody"
            value={custom ? CUSTOM_MEETING : value}
            onChange={(e) => {
              const next = e.target.value;
              if (next === CUSTOM_MEETING) {
                onCustomChange(true);
                onChange(""); // 빈 칸에서 새로 적게 한다
              } else {
                onCustomChange(false);
                onChange(next);
              }
            }}
            className={clsx(FIELD, INPUT_TEXT, "cursor-pointer appearance-none pr-[28px]")}
          >
            {/* 마스터에서 지워진 회의체를 수정 중이면 그 값도 남겨 보여준다 */}
            {!custom && !findMeetingBody(meetingBodies, value) && value ? (
              <option value={value}>{value}</option>
            ) : null}
            {meetingBodies.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
            <option value={CUSTOM_MEETING}>직접 입력…</option>
          </select>
          <ChevronDown
            size={14}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-[10px] -translate-y-1/2 text-ink-5"
          />
        </div>
      ) : null}

      {custom || empty ? (
        <>
          <input
            id={empty ? "meetingBody" : "meetingBodyCustom"}
            type="text"
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="예) 주간 경영회의"
            autoComplete="off"
            aria-label="회의체 직접 입력"
            className={clsx(FIELD, INPUT_TEXT, !empty && "mt-[6px]")}
          />
          <p className="mt-[5px] text-note leading-none text-ink-5">
            {empty
              ? "등록된 회의체가 없습니다 · 저장하면 설정에 자동으로 추가됩니다"
              : "저장하면 설정의 회의체 목록에 자동으로 추가됩니다"}
          </p>
        </>
      ) : null}
    </>
  );
}

/**
 * 조직·이름 — 직접 입력.
 *
 * 인사정보 연동 전까지는 매번 손으로 적는 값이다. 드롭다운으로 두면
 * 등록된 데이터가 없을 때 고를 게 없어 첫 지시사항 자체를 등록할 수 없고,
 * 핸드오프 문서도 "조직/이름은 수동 입력"이라고 못 박았다.
 *
 * 기존 값은 datalist로 제안만 한다 — 오타·표기 흔들림을 줄이되 고르도록 강제하지 않는다.
 * 화살표 아이콘은 두지 않는다. 닫힌 선택지처럼 보여서 타이핑해도 되는지 헷갈리게 한다.
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
    <>
      <input
        id={id}
        name={name}
        list={suggestions.length > 0 ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        required
        className={clsx(FIELD, INPUT_TEXT)}
      />
      {suggestions.length > 0 ? (
        <datalist id={listId}>
          {suggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

/**
 * 첨부 파일 — 실물을 저장한다. 지시사항당 여러 개.
 *
 * 폼이 서버에 넘기는 것은 두 가지다.
 *  - keptAttachments: 유지할 기존 첨부의 메타데이터(JSON). storageKey까지 보내야
 *    저장할 때마다 실물은 남고 지시사항만 파일을 잊어버리는 일이 없다.
 *  - attachmentFiles: 이번에 새로 고른 파일들.
 * 목록에서 뺀 기존 첨부는 keptAttachments에 없으므로 서버가 실물을 지운다.
 *
 * 고른 파일은 state로 들고 제출 시 FormData에 직접 넣는다 —
 * input[type=file]의 값은 개별 항목을 뺄 수 없어 "이것만 취소"를 만들 수 없다.
 */
function AttachmentField({
  todoId,
  kept,
  onKeptChange,
  picked,
  onPickedChange,
  storageConfigured,
}: {
  /** 수정 중인 지시사항 id — 내려받기 링크에 쓴다. 신규면 null. */
  todoId: string | null;
  /** 유지 중인 기존 첨부 */
  kept: Attachment[];
  onKeptChange: (next: Attachment[]) => void;
  /** 이번에 새로 고른 파일 */
  picked: File[];
  onPickedChange: (next: File[]) => void;
  storageConfigured: boolean;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = kept.length + picked.length;

  const accept = (files: File[]) => {
    if (files.length === 0) return;
    const next = [...picked, ...files];
    const check = checkFiles(
      next.map((f) => ({ name: f.name, size: f.size })),
      kept.length,
    );
    if (!check.ok) {
      setError(check.message);
      return;
    }
    if (kept.length + next.length > MAX_FILES_PER_TODO) {
      setError(`첨부는 ${MAX_FILES_PER_TODO}개까지입니다.`);
      return;
    }
    setError(null);
    onPickedChange(next);
  };

  return (
    <>
      {/* 유지할 기존 첨부를 통째로 되돌려 준다 */}
      <input
        type="hidden"
        name="keptAttachments"
        value={kept.length > 0 ? JSON.stringify(kept) : ""}
      />

      <input
        id={inputId}
        type="file"
        multiple
        className="sr-only"
        disabled={!storageConfigured || total >= MAX_FILES_PER_TODO}
        onChange={(e) => {
          accept([...(e.target.files ?? [])]);
          // 같은 파일을 다시 고를 수 있게 비운다 (전송은 state가 담당한다).
          e.target.value = "";
        }}
      />
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          if (!storageConfigured) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!storageConfigured) return;
          e.preventDefault();
          setDragging(false);
          accept([...e.dataTransfer.files]);
        }}
        className={clsx(
          "block rounded-ctl border border-dashed p-[15px] text-center text-aux leading-[1.7] transition-colors",
          storageConfigured && total < MAX_FILES_PER_TODO
            ? "cursor-pointer"
            : "cursor-not-allowed opacity-60",
          dragging ? "border-line-hover bg-surface-alt" : "border-line-field",
        )}
      >
        <span className="text-ink-4">
          {!storageConfigured
            ? "파일 저장소가 설정되지 않았습니다"
            : total >= MAX_FILES_PER_TODO
              ? `첨부가 ${MAX_FILES_PER_TODO}개를 채웠습니다`
              : "파일을 끌어다 놓거나 클릭하여 첨부"}
        </span>
        <br />
        <span className="text-note text-ink-5">
          {total > 0
            ? `${total}개 첨부됨`
            : `한 파일 ${formatBytes(MAX_FILE_BYTES)}까지 · 최대 ${MAX_FILES_PER_TODO}개`}
        </span>
      </label>

      {total > 0 ? (
        <ul className="mt-[7px] flex flex-col gap-[4px]">
          {kept.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-[7px] rounded-ctl bg-surface-alt px-[9px] py-[7px] text-note leading-none"
            >
              <Paperclip size={11} aria-hidden className="shrink-0 text-ink-5" />
              {/* 저장된 파일만 내려받을 수 있다. 옛 데이터는 이름만 있다. */}
              {isStored(a) && todoId ? (
                <a
                  href={`/api/todos/${todoId}/attachments/${a.id}`}
                  className="min-w-0 flex-1 truncate text-ink-2 hover:text-dark hover:underline"
                >
                  {a.name}
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate text-ink-2">{a.name}</span>
              )}
              <span className="shrink-0 font-mono text-ink-5">{formatBytes(a.size)}</span>
              <button
                type="button"
                onClick={() => onKeptChange(kept.filter((k) => k.id !== a.id))}
                aria-label={`${a.name} 첨부 제거`}
                className="shrink-0 cursor-pointer text-ink-5 hover:text-danger-fg"
              >
                <X size={11} />
              </button>
            </li>
          ))}

          {picked.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-[7px] rounded-ctl bg-surface-alt px-[9px] py-[7px] text-note leading-none"
            >
              <Paperclip size={11} aria-hidden className="shrink-0 text-ink-5" />
              <span className="min-w-0 flex-1 truncate text-ink-2">{f.name}</span>
              <span className="shrink-0 text-ink-5">저장 시 업로드</span>
              <span className="shrink-0 font-mono text-ink-5">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => onPickedChange(picked.filter((_, idx) => idx !== i))}
                aria-label={`${f.name} 선택 취소`}
                className="shrink-0 cursor-pointer text-ink-5 hover:text-danger-fg"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-[6px] text-note leading-[1.6] text-danger-fg">
          {error}
        </p>
      ) : null}
    </>
  );
}
