-- MariaDB 11.4 스키마 — 사내 AWS 이관용.
--
-- Postgres(Supabase) 마이그레이션 14개를 접어 하나로 만든 최종 형태다.
-- 증분이 아니라 "빈 DB에 한 번 돌리는" 파일이다. 이관 대상 데이터가 적고
-- (지시사항 수십 건 · 명부 1천여 명) 사내 DB는 새로 만들기 때문이다.
-- 여기서부터의 변경은 db/mariadb/migrations/ 에 증분으로 쌓는다.
--
-- Postgres에서 바꾼 것과 그 이유:
--
--   uuid            → char(36)
--       11.4에 네이티브 UUID 타입이 있지만(10.7+) 드라이버가 Buffer로 돌려줘
--       매퍼 10여 곳에서 변환이 필요해진다. id는 애플리케이션이
--       crypto.randomUUID()로 만들어 넣으므로 DB가 생성할 일도 없다.
--       저장 공간은 8건·1천 행 규모에서 문제가 되지 않는다.
--
--   jsonb           → json
--       통째로 읽고 쓰기만 하므로 인덱싱 차이가 영향을 주지 않는다.
--
--   timestamptz     → datetime(3)
--       MariaDB의 timestamp는 세션 타임존에 따라 값을 바꿔 읽는다. 앱은 ISO
--       문자열(UTC)을 주고받으므로 변환이 끼면 시각이 밀린다. datetime은
--       타임존 변환을 하지 않아 "넣은 값이 그대로" 나온다. 커넥션도 UTC로
--       고정한다(lib/repository/mariadb-todo-repository.ts).
--
--   check (col ~ '정규식')  → check (col regexp '정규식')
--       이메일 형식 검사. MariaDB는 regexp 연산자를 쓴다.
--
--   unique (lower(email))  → unique (email)
--       collation이 utf8mb4_uca1400_ai_ci(대소문자 무시)라 인덱스가 이미
--       대소문자를 같게 본다. 함수 인덱스가 필요 없다.
--
--   trigger set_updated_at → on update current_timestamp(3)
--       같은 일을 컬럼 정의만으로 한다.
--
--   row level security → 삭제
--       MariaDB에 없다. 지금도 익명 전체 허용이라 보안 효과가 없었다.
--       접근 통제는 ALB/사내 SSO 계층에서 건다.
--
--   progress_pct    → 삭제
--       도메인이 쓰지 않는다. Postgres 쪽은 삭제 마이그레이션이 있는데도
--       운영 DB에 남아 있었다 — 여기서 정리하고 넘어간다.

set names utf8mb4 collate utf8mb4_uca1400_ai_ci;

-- ─────────────────────────────────────────────────────────
-- 지시사항
-- ─────────────────────────────────────────────────────────
create table if not exists todos (
  id             char(36)      not null,
  instructed_at  date          not null,
  due_date       date          not null,
  meeting_body   varchar(200)  not null,
  org            varchar(200)  not null,
  assignee_name  varchar(100)  not null,
  -- 사원 명부에서 복사한 값. 옛 데이터는 비어 있고, 그 경우 이름만으로 호칭한다.
  assignee_title varchar(100)  not null default '',
  assignee_email varchar(320)      null,
  category       varchar(20)   not null,
  detail         text          not null,
  progress_note  text          not null,
  signal         char(1)       not null,
  remind_status  varchar(10)   not null default 'none',
  -- 첨부 메타데이터 배열. 실물은 오브젝트 스토리지에 있고 storageKey가 가리킨다.
  -- storageKey가 없으면 실물 저장 이전에 등록된 이름뿐인 옛 데이터다.
  attachments    json          not null,
  -- 완료 시각. null이면 미결. 완료 판정은 이 컬럼 하나로만 한다.
  completed_at   datetime(3)       null,
  created_at     datetime(3)   not null default current_timestamp(3),
  updated_at     datetime(3)   not null default current_timestamp(3)
                                        on update current_timestamp(3),

  primary key (id),
  constraint todos_category_check
    check (category in ('전략검토', '자료요청', '이행점검', '의사결정', '대외대응')),
  constraint todos_signal_check
    check (signal in ('G', 'Y', 'R')),
  constraint todos_remind_status_check
    check (remind_status in ('sent', 'wait', 'none')),
  constraint todos_due_after_instructed_check
    check (due_date >= instructed_at),
  constraint todos_assignee_email_check
    check (assignee_email is null
           or assignee_email regexp '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

-- 표 뷰의 정렬·필터 조합을 받아내는 인덱스
create index todos_due_date_idx      on todos (due_date);
create index todos_instructed_at_idx on todos (instructed_at desc);
create index todos_assignee_idx      on todos (assignee_name);
create index todos_meeting_body_idx  on todos (meeting_body);
create index todos_category_idx      on todos (category);
create index todos_signal_idx        on todos (signal);
-- 미결 목록이 기본 화면이다. Postgres의 부분 인덱스(where completed_at is null)
-- 대신 선두 컬럼으로 얹는다 — MariaDB에는 부분 인덱스가 없다.
create index todos_open_idx          on todos (completed_at, due_date);

-- ─────────────────────────────────────────────────────────
-- 진행 이력 — 가장 최근 것이 곧 지시사항의 현재 상태다
-- ─────────────────────────────────────────────────────────
create table if not exists todo_updates (
  id         char(36)     not null,
  todo_id    char(36)     not null,
  note       text         not null,
  signal     char(1)      not null,
  author     varchar(100)     null,
  created_at datetime(3)  not null default current_timestamp(3),

  primary key (id),
  constraint todo_updates_todo_fk
    foreign key (todo_id) references todos (id) on delete cascade,
  constraint todo_updates_signal_check check (signal in ('G', 'Y', 'R')),
  constraint todo_updates_note_check   check (char_length(trim(note)) > 0)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

create index todo_updates_todo_id_created_at_idx
  on todo_updates (todo_id, created_at desc);

-- ─────────────────────────────────────────────────────────
-- 이력 첨부 파일 (메타데이터만 — 실물은 오브젝트 스토리지)
-- ─────────────────────────────────────────────────────────
create table if not exists todo_update_files (
  id           char(36)      not null,
  update_id    char(36)      not null,
  name         varchar(255)  not null,
  size         bigint        not null,
  content_type varchar(255)      null,
  storage_key  varchar(255)  not null,
  created_at   datetime(3)   not null default current_timestamp(3),

  primary key (id),
  -- 같은 키를 두 행이 가리키면 한쪽을 지울 때 다른 쪽의 실물이 사라진다.
  unique key todo_update_files_storage_key_unique (storage_key),
  constraint todo_update_files_update_fk
    foreign key (update_id) references todo_updates (id) on delete cascade,
  constraint todo_update_files_name_check check (char_length(trim(name)) > 0),
  constraint todo_update_files_size_check check (size >= 0)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

create index todo_update_files_update_id_idx
  on todo_update_files (update_id, created_at);

-- ─────────────────────────────────────────────────────────
-- Remind 발송 이력
--
-- 수신자의 이름·직책을 보낼 당시 값으로 복사해 둔다. 명부를 참조하면
-- 인사정보 연동으로 명부를 비울 때, 승진으로 직책이 바뀔 때 지난 이력의
-- 수신자까지 소급해 바뀐다.
-- ─────────────────────────────────────────────────────────
create table if not exists remind_logs (
  id              char(36)      not null,
  todo_id         char(36)      not null,
  recipient       varchar(320)  not null,
  recipient_name  varchar(100)  not null default '',
  recipient_title varchar(100)  not null default '',
  status          varchar(10)   not null default 'queued',
  scheduled_at    datetime(3)   not null default current_timestamp(3),
  sent_at         datetime(3)       null,
  created_at      datetime(3)   not null default current_timestamp(3),

  primary key (id),
  constraint remind_logs_todo_fk
    foreign key (todo_id) references todos (id) on delete cascade,
  constraint remind_logs_status_check check (status in ('queued', 'sent', 'failed'))
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

create index remind_logs_todo_id_idx on remind_logs (todo_id, created_at desc);

-- ─────────────────────────────────────────────────────────
-- 앱 설정 — 한 행만 존재한다
-- ─────────────────────────────────────────────────────────
create table if not exists app_settings (
  -- 단일 행 고정 키. tinyint(1) + check로 Postgres의 boolean 기본키를 흉내낸다.
  id              tinyint(1)    not null default 1,
  assistant_name  varchar(100)  not null default '',
  assistant_email varchar(320)      null,
  updated_at      datetime(3)   not null default current_timestamp(3)
                                         on update current_timestamp(3),

  primary key (id),
  constraint app_settings_single_row check (id = 1),
  constraint app_settings_email_check
    check (assistant_email is null
           or assistant_email regexp '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

insert ignore into app_settings (id) values (1);

-- ─────────────────────────────────────────────────────────
-- 회의체 마스터
--
-- 지시사항은 회의체를 FK가 아니라 텍스트로 들고 있다(필터·집계가 문자열 기준).
-- 마스터 이름을 고치면 어댑터가 지시사항의 표기도 함께 바꾼다.
-- ─────────────────────────────────────────────────────────
create table if not exists meeting_bodies (
  id         char(36)      not null,
  name       varchar(200)  not null,
  created_at datetime(3)   not null default current_timestamp(3),

  primary key (id),
  -- collation이 대소문자를 무시하므로 lower() 없이도 "AX Board"와 "ax board"가
  -- 같은 값으로 걸린다. 앞뒤 공백은 애플리케이션이 미리 떼고 넣는다.
  unique key meeting_bodies_name_unique (name),
  constraint meeting_bodies_name_not_blank check (char_length(trim(name)) > 0)
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

-- ─────────────────────────────────────────────────────────
-- 사원 명부 — 사내 인사정보 연동 전까지 쓰는 임시 마스터
-- ─────────────────────────────────────────────────────────
create table if not exists employees (
  id         char(36)      not null,
  name       varchar(100)  not null,
  email      varchar(320)  not null,
  department varchar(200)  not null default '',
  title      varchar(100)  not null default '',
  created_at datetime(3)   not null default current_timestamp(3),

  primary key (id),
  unique key employees_email_unique (email),
  constraint employees_name_check check (char_length(trim(name)) > 0),
  constraint employees_email_check
    check (email regexp '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;

-- 동명이인이 있어 이름만으로는 정렬이 유일하지 않다 — id를 함께 얹는다.
create index employees_name_idx on employees (name, id);

-- ─────────────────────────────────────────────────────────
-- 지시사항별 추가 수신자
--
-- 명부를 FK로 참조하지 않고 이메일·이름을 값으로 복사한다 —
-- 인사정보 연동 시 명부를 비워도 지정이 남아야 한다.
-- ─────────────────────────────────────────────────────────
create table if not exists todo_recipients (
  todo_id    char(36)      not null,
  email      varchar(320)  not null,
  name       varchar(100)  not null default '',
  created_at datetime(3)   not null default current_timestamp(3),

  -- email이 키의 일부다. varchar(320)이 utf8mb4에서 1280바이트라 기본
  -- 인덱스 한도(3072B)에는 들어간다.
  primary key (todo_id, email),
  constraint todo_recipients_todo_fk
    foreign key (todo_id) references todos (id) on delete cascade,
  constraint todo_recipients_email_check
    check (email regexp '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')
) engine = innodb default charset = utf8mb4 collate = utf8mb4_uca1400_ai_ci;
