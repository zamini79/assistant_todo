-- 담당자 이메일
--
-- Remind 메일을 실제로 보내려면 수신 주소가 필요하다.
-- 인사시스템 연동 전까지는 조직·이름과 마찬가지로 수동 입력이므로
-- todos에 직접 둔다. 인물 마스터가 생기면 그쪽으로 옮길 것.
--
-- nullable: 주소를 모르는 지시사항도 등록은 되어야 한다.
-- 주소가 없으면 Remind 큐에서 발송 대상에서 빠지고 UI가 그 사실을 알린다.

alter table public.todos add column if not exists assignee_email text;

-- 형식 검증은 애플리케이션(zod)에서 하고, DB에서는 최소한만 막는다.
alter table public.todos drop constraint if exists todos_assignee_email_check;
alter table public.todos add constraint todos_assignee_email_check
  check (assignee_email is null or assignee_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
