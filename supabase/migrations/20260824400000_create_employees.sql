-- 사원 명부 (임시)
--
-- 사내 인사정보 연동 전까지 쓰는 마스터다. 엑셀 명부를 올려 통째로 갈아끼우고,
-- 연동이 되면 이 테이블을 비우고 연동 소스로 대체한다.
--
-- 지시사항은 이 테이블을 FK로 참조하지 않는다. 담당자의 이름·조직·이메일을
-- 값으로 복사해 두므로, 명부가 사라져도 과거 지시사항의 담당자 정보는 남는다.

create table if not exists public.employees (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null,
  department text        not null default '',
  title      text        not null default '',
  created_at timestamptz not null default now(),

  constraint employees_name_check  check (length(btrim(name)) > 0),
  constraint employees_email_check
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- 같은 사람이 두 번 들어가지 않는다. 대소문자 차이는 같은 주소로 본다.
create unique index if not exists employees_email_unique on public.employees (lower(email));

-- 검색은 이름·부서에 대한 부분 일치다. 1천여 명 규모라 순차 검색으로 충분하지만,
-- 정렬·목록 조회가 이름순이라 인덱스를 하나 둔다.
create index if not exists employees_name_idx on public.employees (name);

alter table public.employees enable row level security;

drop policy if exists employees_anon_all on public.employees;
create policy employees_anon_all on public.employees
  for all to anon, authenticated using (true) with check (true);
