-- 지시사항 완료 처리
--
-- 지금까지 완료 개념이 없어서 끝난 지시사항도 계속 목록·집계·Remind 큐에 남았다.
-- 신호등(G/Y/R)은 "지금 잘 굴러가는가"라 축이 다르고 Remind 상태는 메일 발송 여부일 뿐이라,
-- 둘 다 완료 기준이 될 수 없어 별도 컬럼을 둔다.
--
-- 불리언이 아니라 시각으로 두는 이유: "언제 끝났는지"가 보고에 필요하고,
-- 기간별 완료 건수를 뽑을 때 컬럼을 새로 만들지 않아도 된다.

alter table public.todos
  add column if not exists completed_at timestamptz;

comment on column public.todos.completed_at is
  '완료 시각. null이면 미결. 완료 판정은 이 컬럼 하나로만 한다.';

-- 목록의 기본 조건이 '미결'이라 completed_at is null 조회가 가장 잦다.
-- 부분 인덱스로 미결 행만 담아 두면 인덱스가 작게 유지된다.
create index if not exists todos_open_idx
  on public.todos (due_date)
  where completed_at is null;
