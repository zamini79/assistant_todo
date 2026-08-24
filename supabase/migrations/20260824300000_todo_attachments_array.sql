-- 지시사항 첨부를 여러 개로
--
-- attachment(jsonb 단일 객체) → attachments(jsonb 배열).
--
-- 별도 테이블로 빼지 않는다. 표·브리핑·CSV가 이미 지시사항 행에서 첨부를 바로 읽고 있어
-- 테이블로 옮기면 화면마다 조인이나 별도 조회(N+1)가 붙는다. 건당 5개 상한이라
-- 배열로 두어도 행이 비대해지지 않는다.

alter table public.todos
  add column if not exists attachments jsonb not null default '[]'::jsonb;

--------------------------------------------------------------------------------
-- 기존 단일 첨부를 배열로 옮긴다.
--
-- 배열 안에서 한 건을 가리킬 id가 필요하다 (다운로드·삭제 경로에 쓴다).
-- 옛 데이터에는 없으므로 여기서 만들어 넣는다.
-- 이미 옮겨진 행(attachments가 비어 있지 않음)은 건드리지 않아 여러 번 실행해도 안전하다.
--------------------------------------------------------------------------------
update public.todos
   set attachments = jsonb_build_array(
         attachment || jsonb_build_object('id', gen_random_uuid()::text)
       )
 where attachment is not null
   and attachments = '[]'::jsonb;

-- 옮긴 뒤에 지운다. 같은 마이그레이션 안이라 위 update가 실패하면 여기까지 오지 않는다.
alter table public.todos drop column if exists attachment;

comment on column public.todos.attachments is
  '첨부 메타데이터 배열. 실물은 Storage(todo-attachments 버킷)에 있고 storageKey가 가리킨다. storageKey가 없으면 실물 저장 이전에 등록된 이름뿐인 옛 데이터다.';
