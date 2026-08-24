-- 메일 수신자를 사원 명부에서 고르도록
--
-- 손으로 관리하던 수신자 마스터(recipients)를 없앤다. 1천여 명짜리 사원 명부가
-- 생기면서 별도 목록을 따로 유지할 이유가 사라졌고, 설정에서 그 화면도 걷어냈다.
--
-- 지시사항별 추가 수신자는 남는다 — "todo마다 받는 사람이 다르다"는 요구는 그대로다.
-- 다만 명부를 FK로 참조하지 않고 이메일·이름을 값으로 복사해 둔다.
-- 인사정보 연동 시 명부를 비울 예정인데, FK로 묶여 있으면 그때 지정이 함께 날아간다.

drop table if exists public.todo_recipients;

create table public.todo_recipients (
  todo_id    uuid        not null references public.todos (id) on delete cascade,
  email      text        not null,
  -- 표시용. 명부가 사라져도 누구였는지 남기기 위해 함께 복사한다.
  name       text        not null default '',
  created_at timestamptz not null default now(),

  primary key (todo_id, email),
  constraint todo_recipients_email_check
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

drop table if exists public.recipients;
