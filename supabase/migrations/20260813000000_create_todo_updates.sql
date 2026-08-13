-- 지시사항 진행 이력
--
-- 지시사항은 한 번에 끝나지 않으므로 중간 경과를 시간순으로 쌓는다.
-- 가장 최근 이력이 곧 그 지시사항의 현재 상태이며, todos의
-- progress_note / progress_pct / signal은 그 값을 비정규화해 들고 있다.
-- (표 뷰의 정렬·필터·집계가 해당 컬럼을 직접 읽기 때문)
--
-- MariaDB 이관 시: gen_random_uuid() → UUID(), timestamptz → DATETIME.

create table if not exists public.todo_updates (
  id           uuid primary key default gen_random_uuid(),
  todo_id      uuid        not null references public.todos (id) on delete cascade,
  note         text        not null,
  progress_pct smallint    not null default 0,
  signal       char(1)     not null,
  -- 로그인 연동 전까지는 null. 이후 작성자를 기록한다.
  author       text,
  created_at   timestamptz not null default now(),

  constraint todo_updates_signal_check       check (signal in ('G', 'Y', 'R')),
  constraint todo_updates_progress_pct_check check (progress_pct between 0 and 100),
  constraint todo_updates_note_check         check (length(btrim(note)) > 0)
);

-- 한 지시사항의 이력을 최신순으로 뽑는 것이 유일한 접근 패턴이다.
create index if not exists todo_updates_todo_id_created_at_idx
  on public.todo_updates (todo_id, created_at desc);

--------------------------------------------------------------------------------
-- 기존 진행상황을 첫 이력으로 이관
--
-- 이력이 하나도 없는 지시사항만 대상으로 하므로 여러 번 실행해도 안전하다.
-- 신규 설치(마이그레이션 → seed 순서)에서는 대상이 없어 그냥 넘어간다.
--------------------------------------------------------------------------------
insert into public.todo_updates (todo_id, note, progress_pct, signal, created_at)
select
  t.id,
  t.progress_note,
  t.progress_pct,
  t.signal,
  -- 등록 시점에 기록된 것으로 본다.
  t.created_at
from public.todos t
where btrim(coalesce(t.progress_note, '')) <> ''
  and not exists (select 1 from public.todo_updates u where u.todo_id = t.id);

--------------------------------------------------------------------------------
-- RLS — todos와 동일하게, 로그인 연동 시 함께 교체할 것
--------------------------------------------------------------------------------
alter table public.todo_updates enable row level security;

drop policy if exists todo_updates_anon_all on public.todo_updates;
create policy todo_updates_anon_all on public.todo_updates
  for all to anon, authenticated
  using (true) with check (true);
