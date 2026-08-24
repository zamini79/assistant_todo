-- 진행 이력 첨부 파일
--
-- 지시사항 본문의 첨부(todos.attachment)는 파일명·크기만 들고 있는 메타데이터다.
-- 이력에 붙는 첨부는 "그때 무엇을 받았는지"가 증빙이라 실제 파일을 저장해야 한다.
--
-- 바이트는 Storage 버킷에, 메타데이터만 이 테이블에 둔다.
-- DB는 storage_key만 알고 있어서 스토리지 벤더(→ S3)가 바뀌어도 스키마는 그대로다.

create table if not exists public.todo_update_files (
  id           uuid primary key default gen_random_uuid(),
  update_id    uuid        not null references public.todo_updates (id) on delete cascade,
  -- 사용자가 올린 원래 이름. 다운로드 시 이 이름으로 내려준다.
  name         text        not null,
  size         bigint      not null,
  content_type text,
  -- 버킷 내부 경로. 같은 이름을 두 번 올려도 겹치지 않게 앱이 구분자를 붙인다.
  storage_key  text        not null unique,
  created_at   timestamptz not null default now(),

  constraint todo_update_files_name_check check (length(btrim(name)) > 0),
  constraint todo_update_files_size_check check (size >= 0)
);

-- 한 이력의 첨부를 올린 순서로 뽑는 것이 유일한 접근 패턴이다.
create index if not exists todo_update_files_update_id_idx
  on public.todo_update_files (update_id, created_at);

--------------------------------------------------------------------------------
-- Storage 버킷
--
-- 비공개다. 링크가 새면 사내 문서가 그대로 열리므로 공개 URL을 두지 않고,
-- 다운로드할 때마다 짧은 서명 URL을 새로 만든다.
--------------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('todo-attachments', 'todo-attachments', false)
on conflict (id) do nothing;

--------------------------------------------------------------------------------
-- RLS — 기존 테이블과 동일 정책. 로그인 연동 시 함께 교체할 것.
--
-- 앱은 서버에서만 스토리지를 만지고 service role 키를 쓰면 RLS를 우회하지만,
-- anon 키만 설정된 환경에서도 동작해야 하므로 버킷에도 같은 정책을 걸어 둔다.
--------------------------------------------------------------------------------
alter table public.todo_update_files enable row level security;

drop policy if exists todo_update_files_anon_all on public.todo_update_files;
create policy todo_update_files_anon_all on public.todo_update_files
  for all to anon, authenticated using (true) with check (true);

drop policy if exists todo_attachments_anon_all on storage.objects;
create policy todo_attachments_anon_all on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'todo-attachments')
  with check (bucket_id = 'todo-attachments');
