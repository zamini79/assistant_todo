/**
 * 진행 이력 타임라인 — 표에서 지시사항을 펼쳤을 때 나오는 패널.
 *
 * 최신 이력이 위로 온다. 각 항목은 그 시점의 신호등을 함께 보여줘서
 * "언제 Yellow에서 Red로 떨어졌는지"를 이력만 보고 추적할 수 있다.
 */
import { toDateTime } from "@/lib/domain/date";
import type { Todo } from "@/lib/domain/todo";
import type { TodoUpdate } from "@/lib/domain/todo-update";
import { SIGNAL_DOT } from "@/lib/ui/signal";
import { SignalDot } from "@/components/ui/primitives";

import { AddUpdateForm, DeleteUpdateButton } from "./update-form";

export function UpdateTimeline({
  todo,
  updates,
}: {
  todo: Todo;
  updates: TodoUpdate[];
}) {
  return (
    <section
      aria-label={`${todo.detail} 진행 이력`}
      className="border-b border-line-row bg-surface-alt px-[44px] py-[20px]"
    >
      {/* 표의 신호 컬럼(36px)과 눈높이를 맞춰 들여쓴다 */}
      <div className="ml-[36px] grid grid-cols-[minmax(0,1fr)_320px] items-start gap-[26px]">
        <div>
          <div className="mb-[14px] flex items-baseline gap-[9px]">
            <h3 className="text-section leading-none font-semibold text-ink">진행 이력</h3>
            <span className="text-label text-ink-4">
              {updates.length > 0
                ? `${updates.length}건 · 최신순`
                : "아직 기록된 이력이 없습니다"}
            </span>
          </div>

          {updates.length > 0 ? (
            <ol className="relative flex max-w-[760px] flex-col gap-[2px]">
              {/* 세로 연결선 — 점(9px)의 중심을 지나도록 배치 */}
              <span
                aria-hidden
                className="absolute top-[10px] bottom-[10px] left-[4px] w-px bg-line-field"
              />
              {updates.map((u, i) => (
                <li key={u.id} className="relative flex gap-[14px] py-[9px] pl-0">
                  <span className="relative z-10 mt-[4px] shrink-0">
                    <SignalDot signal={u.signal} size={9} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[10px]">
                      <span className="font-mono text-note leading-none text-ink-3">
                        {toDateTime(u.createdAt)}
                      </span>
                      {i === 0 ? (
                        <span className="rounded-ctl bg-dark px-[6px] py-[3px] text-note leading-none font-medium text-on-dark">
                          현재
                        </span>
                      ) : null}
                      <span className="text-note text-ink-5">{u.author ?? "전략 Assistant"}</span>
                      {/*
                        flex-1로 밀어내면 넓은 화면에서 삭제가 항목과 한참 떨어져
                        어느 이력의 것인지 알기 어려워진다. 메타데이터 옆에 붙여 둔다.
                      */}
                      <span aria-hidden className="text-ink-5">
                        ·
                      </span>
                      <DeleteUpdateButton updateId={u.id} note={u.note} />
                    </div>
                    <p className="mt-[5px] text-body leading-[1.6] whitespace-pre-wrap text-ink">
                      {u.note}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="max-w-[760px] rounded-card border border-dashed border-line-field px-[16px] py-[18px] text-label text-ink-4">
              오른쪽에서 첫 진행 상황을 기록하면 여기에 시간순으로 쌓입니다.
            </p>
          )}
        </div>

        <AddUpdateForm todoId={todo.id} currentSignal={todo.signal} />
      </div>
    </section>
  );
}

/** 표 행에 붙는 이력 건수 표시 */
export function UpdateCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-[7px] inline-block rounded-ctl bg-surface px-[6px] py-[2px] align-middle font-mono text-note leading-none text-ink-3">
      이력 {count}
    </span>
  );
}

export { SIGNAL_DOT };
