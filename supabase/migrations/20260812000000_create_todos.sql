-- 지시사항(To-do) 테이블
--
-- README "To-do 필드 (DB 컬럼 후보)"를 그대로 따른다.
-- 최종 목표가 MariaDB이므로 Postgres 전용 기능은 최소한만 쓴다:
--   · gen_random_uuid()  → MariaDB에서는 UUID() 또는 애플리케이션 생성 UUID
--   · jsonb              → MariaDB에서는 JSON
--   · CHECK 제약과 인덱스는 양쪽 모두 동일하게 옮겨간다.

create extension if not exists pgcrypto;

create table if not exists public.todos (
  id            uuid primary key default gen_random_uuid(),
  instructed_at date         not null,
  due_date      date         not null,
  meeting_body  text         not null,
  org           text         not null,
  assignee_name text         not null,
  category      text         not null,
  detail        text         not null,
  progress_note text         not null default '',
  progress_pct  smallint     not null default 0,
  signal        char(1)      not null,
  remind_status text         not null default 'none',
  -- 현재 범위는 메타데이터만: {"name": "...", "size": 12345}
  attachment    jsonb,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),

  constraint todos_category_check
    check (category in ('전략검토', '자료요청', '이행점검', '의사결정', '대외대응')),
  constraint todos_signal_check
    check (signal in ('G', 'Y', 'R')),
  constraint todos_remind_status_check
    check (remind_status in ('sent', 'wait', 'none')),
  constraint todos_progress_pct_check
    check (progress_pct between 0 and 100),
  constraint todos_due_after_instructed_check
    check (due_date >= instructed_at)
);

-- 표 뷰의 정렬·필터 조합을 받아내는 인덱스
create index if not exists todos_due_date_idx      on public.todos (due_date);
create index if not exists todos_instructed_at_idx on public.todos (instructed_at desc);
create index if not exists todos_assignee_idx      on public.todos (assignee_name);
create index if not exists todos_meeting_body_idx  on public.todos (meeting_body);
create index if not exists todos_category_idx      on public.todos (category);
create index if not exists todos_signal_idx        on public.todos (signal);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists todos_set_updated_at on public.todos;
create trigger todos_set_updated_at
  before update on public.todos
  for each row
  execute function public.set_updated_at();

--------------------------------------------------------------------------------
-- Remind 발송 이력
-- README "데이터 요구": 발송 여부/일시/수신자. 실제 발송은 사내 메일서버 연동 후.
--------------------------------------------------------------------------------
create table if not exists public.remind_logs (
  id           uuid primary key default gen_random_uuid(),
  todo_id      uuid        not null references public.todos (id) on delete cascade,
  recipient    text        not null,
  -- 발송 예약만 기록하는 현재 단계에서는 'queued'에 머문다.
  status       text        not null default 'queued',
  scheduled_at timestamptz not null default now(),
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),

  constraint remind_logs_status_check check (status in ('queued', 'sent', 'failed'))
);

create index if not exists remind_logs_todo_id_idx on public.remind_logs (todo_id);

--------------------------------------------------------------------------------
-- RLS
--
-- 현재 범위는 "로그인 없음"이라 익명 키로 전체 접근을 허용한다.
-- 사내 조직도 연동 후에는 아래 정책을 지우고
-- "Assistant만 등록/수정, 나머지는 조회"로 바꿔야 한다 (README Overview).
--------------------------------------------------------------------------------
alter table public.todos      enable row level security;
alter table public.remind_logs enable row level security;

drop policy if exists todos_anon_all on public.todos;
create policy todos_anon_all on public.todos
  for all to anon, authenticated
  using (true) with check (true);

drop policy if exists remind_logs_anon_all on public.remind_logs;
create policy remind_logs_anon_all on public.remind_logs
  for all to anon, authenticated
  using (true) with check (true);
