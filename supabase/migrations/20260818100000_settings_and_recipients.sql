-- 설정: 전략 Assistant · 메일 수신자 마스터
--
-- 전략 Assistant는 주기적으로 담당자가 바뀐다. 코드에 박지 않고 설정으로 뺀다.
-- 수신자는 지시사항마다 다르므로 마스터 목록을 두고 건별로 골라 붙인다.
-- 추후 인사시스템 연동 시 recipients를 그쪽에서 동기화하면 된다.

--------------------------------------------------------------------------------
-- 앱 설정 (단일 행)
--------------------------------------------------------------------------------
create table if not exists public.app_settings (
  -- 행이 하나만 존재하도록 고정 키를 쓴다. upsert 대상이 명확해진다.
  id               boolean primary key default true,
  assistant_name   text        not null default '',
  assistant_email  text,
  updated_at       timestamptz not null default now(),

  constraint app_settings_single_row check (id),
  constraint app_settings_email_check
    check (assistant_email is null
           or assistant_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

--------------------------------------------------------------------------------
-- 메일 수신자 마스터
--------------------------------------------------------------------------------
create table if not exists public.recipients (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null,
  org        text        not null default '',
  created_at timestamptz not null default now(),

  constraint recipients_email_check
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- 같은 주소를 두 번 등록하지 않는다. 대소문자 차이도 같은 사람으로 본다.
create unique index if not exists recipients_email_unique on public.recipients (lower(email));

--------------------------------------------------------------------------------
-- 지시사항별 추가 수신자
--
-- 담당자(todos.assignee_email)는 항상 수신 대상이므로 여기 넣지 않는다.
-- 마스터를 FK로 참조한다 — 주소가 바뀌면 연결된 지시사항에 자동 반영된다.
--------------------------------------------------------------------------------
create table if not exists public.todo_recipients (
  todo_id      uuid not null references public.todos (id)     on delete cascade,
  recipient_id uuid not null references public.recipients (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (todo_id, recipient_id)
);

create index if not exists todo_recipients_recipient_idx
  on public.todo_recipients (recipient_id);

--------------------------------------------------------------------------------
-- RLS — 기존 테이블과 동일 정책. 로그인 연동 시 함께 교체할 것.
--------------------------------------------------------------------------------
alter table public.app_settings    enable row level security;
alter table public.recipients      enable row level security;
alter table public.todo_recipients enable row level security;

drop policy if exists app_settings_anon_all on public.app_settings;
create policy app_settings_anon_all on public.app_settings
  for all to anon, authenticated using (true) with check (true);

drop policy if exists recipients_anon_all on public.recipients;
create policy recipients_anon_all on public.recipients
  for all to anon, authenticated using (true) with check (true);

drop policy if exists todo_recipients_anon_all on public.todo_recipients;
create policy todo_recipients_anon_all on public.todo_recipients
  for all to anon, authenticated using (true) with check (true);
