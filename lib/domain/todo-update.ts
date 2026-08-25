/**
 * 지시사항 진행 이력.
 *
 * 지시사항은 한 번에 끝나지 않으므로, 중간 경과를 시간순으로 쌓는다.
 * 가장 최근 이력이 곧 그 지시사항의 현재 상태다 — 이력을 추가하면
 * 부모 To-do의 progressNote / signal이 함께 갱신된다.
 * (표 뷰의 정렬·필터·집계가 현재 상태 컬럼을 직접 읽기 때문에
 *  매번 이력을 접어서 계산하지 않고 비정규화해 둔다.)
 */
import type { Signal } from "./todo";

export type TodoUpdate = {
  id: string;
  todoId: string;
  /** 진행 내용 */
  note: string;
  /** 이 시점의 신호등 */
  signal: Signal;
  /** 작성자 — 로그인 연동 전까지는 null */
  author: string | null;
  createdAt: string;
};

export type TodoUpdateInput = {
  note: string;
  signal: Signal;
  author?: string | null;
};

/**
 * 완료 처리하며 남기는 이력의 내용.
 *
 * 코멘트와 첨부는 둘 다 선택이라, 첨부만 올리고 코멘트를 비우는 경우가 있다.
 * 그때 빈 문자열을 그대로 쓰면 이 이력이 현재 상태가 되면서(toCurrentState)
 * 지시사항의 진행상황 칸이 지워진다 — 목록에서 무슨 일이 있었는지 사라진다.
 * 그래서 최소한의 사실을 적어 둔다.
 */
export const COMPLETION_NOTE_FALLBACK = "완료 처리";

export function completionNote(comment: string): string {
  return comment.trim() || COMPLETION_NOTE_FALLBACK;
}

/** 최신순 정렬 (댓글 타임라인은 최근 것이 위로 온다) */
export function sortByNewest(updates: TodoUpdate[]): TodoUpdate[] {
  return updates
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

/**
 * 이력을 부모 To-do의 현재 상태로 접는다.
 * 이력이 없으면 null — 호출자가 기존 값을 유지하면 된다.
 */
export function toCurrentState(
  updates: TodoUpdate[],
): { progressNote: string; signal: Signal } | null {
  const [latest] = sortByNewest(updates);
  if (!latest) return null;
  return {
    progressNote: latest.note,
    signal: latest.signal,
  };
}

/** 신호등이 바뀐 지점만 추린다 — "언제 Red로 떨어졌나" 추적용 */
export function signalChanges(updates: TodoUpdate[]): TodoUpdate[] {
  const oldestFirst = sortByNewest(updates).reverse();
  return oldestFirst.filter((u, i) => i === 0 || u.signal !== oldestFirst[i - 1].signal);
}
