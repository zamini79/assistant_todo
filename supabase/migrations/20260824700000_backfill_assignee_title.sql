-- 직책 백필 — assignee_title이 생기기 전에 만들어진 지시사항 채우기.
--
-- 직책이 비어 있으면 Remind 메일 호칭이 "홍길동님"으로 나간다.
-- 이름만으로 짐작해 채우면 엉뚱한 직책이 붙으므로, 사원 명부가
-- 확인해 주는 두 경우에만 손댄다. 확신이 없으면 비운 채로 둔다
-- (호칭은 이름만으로도 성립한다).
--
-- 명부가 비어 있는 환경에서는 아무것도 바꾸지 않는다.

-- (1) 이메일과 이름이 모두 명부와 일치하면 직책을 가져온다.
update public.todos t
set assignee_title = e.title
from public.employees e
where coalesce(t.assignee_title, '') = ''
  and coalesce(t.assignee_email, '') <> ''
  and lower(e.email) = lower(t.assignee_email)
  and e.name = t.assignee_name
  and coalesce(e.title, '') <> '';

-- (2) 이름칸에 직책까지 적혀 있던 옛 입력("홍길동 실장")을 쪼갠다.
--     명부에 "그 이름 + 그 직책"이 실제로 있을 때만 쪼갠다 —
--     그러지 않으면 "홍길동 실장 실장님"처럼 직책이 겹친다.
update public.todos t
set assignee_name = split_part(t.assignee_name, ' ', 1),
    assignee_title = e.title
from public.employees e
where coalesce(t.assignee_title, '') = ''
  and position(' ' in t.assignee_name) > 0
  and e.name = split_part(t.assignee_name, ' ', 1)
  and e.title = substr(t.assignee_name, length(split_part(t.assignee_name, ' ', 1)) + 2);
