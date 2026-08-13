-- 진척률 제거
--
-- 운영상 의미가 없다는 판단으로 걷어낸다. 신호등(G/Y/R)이 상태를 나타내는
-- 유일한 지표가 된다.
--
-- 참고: 이 컬럼이 "완료" 판정 기준이었다(진척 100% = 완료).
-- 제거하면 완료 상태를 표시할 수단이 사라지므로 집계상 모든 지시사항이 미결이다.
-- 완료 개념이 필요해지면 별도의 상태 컬럼을 추가할 것.
--
-- ⚠️ 되돌릴 수 없다. 기존 진척률 값은 사라진다.

alter table public.todos        drop column if exists progress_pct;
alter table public.todo_updates drop column if exists progress_pct;

-- 컬럼과 함께 CHECK 제약도 자동으로 사라지지만, 이름으로 남아있을 경우를 대비한다.
alter table public.todos        drop constraint if exists todos_progress_pct_check;
alter table public.todo_updates drop constraint if exists todo_updates_progress_pct_check;
