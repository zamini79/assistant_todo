-- 회의체 마스터
--
-- 지금까지 회의체는 등록된 지시사항에서 유도한 자유 입력이었다.
-- 표기가 조금만 흔들려도(공백·오타) 사이드바 '회의체별' 집계가 갈라지므로
-- 설정에서 관리하는 마스터를 둔다.
--
-- 지시사항은 회의체를 FK가 아니라 텍스트(todos.meeting_body)로 계속 들고 간다.
-- 필터·정렬·집계가 모두 문자열 기준으로 짜여 있어 FK 이관은 별건으로 미룬다.
-- 대신 마스터에서 이름을 바꾸면 앱이 기존 지시사항의 표기도 함께 갱신한다.

create table if not exists public.meeting_bodies (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now(),

  constraint meeting_bodies_name_not_blank check (btrim(name) <> '')
);

-- 같은 회의체를 두 번 등록하지 않는다. 대소문자·앞뒤 공백 차이는 같은 것으로 본다.
-- (중간 연속 공백까지는 여기서 못 잡으므로 앱이 저장 전에 normalizeMeetingBodyName으로 접는다.)
create unique index if not exists meeting_bodies_name_unique
  on public.meeting_bodies (lower(btrim(name)));

--------------------------------------------------------------------------------
-- 기존 지시사항에 쓰인 회의체를 마스터로 옮긴다.
-- 이 작업 없이 배포하면 등록 화면의 선택지가 비어 기존 회의체를 다시 타이핑해야 한다.
--------------------------------------------------------------------------------
insert into public.meeting_bodies (name)
select distinct on (lower(btrim(meeting_body))) btrim(meeting_body)
  from public.todos
 where btrim(coalesce(meeting_body, '')) <> ''
 order by lower(btrim(meeting_body))
on conflict do nothing;

--------------------------------------------------------------------------------
-- RLS — 기존 테이블과 동일 정책. 로그인 연동 시 함께 교체할 것.
--------------------------------------------------------------------------------
alter table public.meeting_bodies enable row level security;

drop policy if exists meeting_bodies_anon_all on public.meeting_bodies;
create policy meeting_bodies_anon_all on public.meeting_bodies
  for all to anon, authenticated using (true) with check (true);
