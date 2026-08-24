-- 발송 이력에 수신자 이름·직책 남기기.
--
-- 지금까지는 주소만 남겨서 이력에 "누구에게 보냈는지"가 이메일로만 보였다.
-- 명부를 참조하지 않고 값으로 복사한다 — 인사정보 연동 시 명부를 비우고
-- 직책도 승진하면 바뀌지만, 그때 누구에게 보냈는가는 남아야 한다.

alter table public.remind_logs
  add column if not exists recipient_name text not null default '',
  add column if not exists recipient_title text not null default '';

-- 옛 이력 채우기 (1) — 그 지시사항의 담당자에게 보낸 건.
update public.remind_logs l
set recipient_name = t.assignee_name,
    recipient_title = coalesce(t.assignee_title, '')
from public.todos t
where l.todo_id = t.id
  and coalesce(l.recipient_name, '') = ''
  and lower(l.recipient) = lower(coalesce(t.assignee_email, ''));

-- 옛 이력 채우기 (2) — 그 외 주소는 사원 명부에서 찾는다.
update public.remind_logs l
set recipient_name = e.name,
    recipient_title = coalesce(e.title, '')
from public.employees e
where coalesce(l.recipient_name, '') = ''
  and lower(e.email) = lower(l.recipient);

-- 어느 쪽으로도 못 찾은 이력은 빈 값으로 둔다. 화면이 이메일로 되돌아간다.
