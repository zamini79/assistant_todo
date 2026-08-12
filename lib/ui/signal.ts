/**
 * 신호등·Remind 상태의 시각 표현 매핑.
 *
 * Tailwind는 동적으로 조합한 클래스명을 스캔하지 못하므로
 * 모든 클래스를 이 파일에 리터럴로 적어두고 Record로 조회한다.
 */
import type { RemindStatus, Signal } from "../domain/todo";

export const SIGNAL_DOT: Record<Signal, string> = {
  G: "bg-signal-g",
  Y: "bg-signal-y",
  R: "bg-signal-r",
};

/** 진척 막대 채움색 = 신호등 색 (README 표 뷰 규격) */
export const SIGNAL_FILL = SIGNAL_DOT;

/** 필터 칩 · 모달 신호등 버튼의 선택 상태 배경/텍스트 쌍 */
export const SIGNAL_CHIP_ON: Record<Signal, string> = {
  G: "bg-signal-g-bg text-signal-g-fg",
  Y: "bg-signal-y-bg text-signal-y-fg",
  R: "bg-signal-r-bg text-signal-r-fg",
};

export const SIGNAL_CHIP_OFF = "bg-chip-bg text-chip-fg";

/** 모달 3분할 버튼 — 선택 시 파스텔 배경 + 신호등색 테두리 */
export const SIGNAL_BUTTON_ON: Record<Signal, string> = {
  G: "bg-signal-g-bg text-signal-g-fg border-signal-g",
  Y: "bg-signal-y-bg text-signal-y-fg border-signal-y",
  R: "bg-signal-r-bg text-signal-r-fg border-signal-r",
};

export const SIGNAL_BUTTON_OFF = "bg-card text-ink-2 border-line-field";

export const REMIND_BADGE: Record<RemindStatus, string> = {
  sent: "bg-signal-g-bg text-signal-g-fg",
  wait: "bg-signal-y-bg text-signal-y-fg",
  none: "bg-remind-none-bg text-remind-none-fg",
};

/** 사이드바 Remind 큐의 마감일 — Red 건만 강조 */
export function queueDueClass(signal: Signal): string {
  return signal === "R" ? "text-on-dark-danger" : "text-on-dark-3";
}
