# 전략 Assistant To-do Management

사장님(CEO)이 회의·메일로 내리는 지시사항을 전략 Assistant가 기록·관리하고, 담당 임원에게
전달·리마인드하며 진척을 추적하는 사내 웹 시스템.

디자인 원본은 [`design_handoff_strategy_assistant_todo/README.md`](./design_handoff_strategy_assistant_todo/README.md)
와 같은 폴더의 `.dc.html` 프로토타입이다.

## 빠른 시작

```bash
npm install
npm run dev        # http://localhost:3000
```

**Supabase 크리덴셜 없이도 바로 실행된다.** env가 비어 있으면 인메모리 리포지토리가
시드 데이터 26건으로 동작한다. 실제 DB를 붙이려면 아래 "Supabase 연결"을 참고.

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 도메인·리포지토리 유닛 테스트 (Vitest) |
| `npm run db:generate-seed` | `lib/seed/todos.ts` → `supabase/seed.sql` 재생성 |

## 아키텍처 — 왜 이렇게 나눴나

핸드오프 문서의 기술 전제가 설계를 결정했다.

> 초기 GitHub + Supabase + Vercel → 최종 AWS(CodeCommit / MariaDB / ECS).
> 따라서 DB 접근은 특정 벤더 SDK에 직접 의존하지 말고 리포지토리 계층으로 감쌀 것.

```
app/                      Next.js App Router
  page.tsx                오늘의 브리핑
  todos/page.tsx          전체 지시사항 (표)
  actions/todos.ts        서버 액션 (create / update / delete)
  api/todos/export/       CSV(Excel) 내보내기

components/               UI — 디자인 토큰만 사용, 데이터 접근 없음
  shell/                  앱 셸 · 사이드바
  brief/                  브리핑 뷰 구성요소
  todos/                  표 뷰 구성요소
  todo-dialog/            등록/수정 모달과 트리거
  ui/                     프리미티브 (뱃지 · 막대 · 토스트 · 확인창)

lib/
  domain/                 ★ 벤더 무관 순수 계층 — 타입, 날짜, 필터/정렬, 집계, 검증
  repository/
    todo-repository.ts    ★ 포트 (interface)
    memory-todo-repository.ts    인메모리 어댑터
    supabase-todo-repository.ts  Supabase 어댑터
    index.ts              env를 보고 어댑터를 고르는 팩토리
  ui/                     디자인 토큰 매핑, URL 상태 변환
  seed/                   시드 데이터

supabase/migrations/      스키마 (MariaDB 이관을 염두에 둔 SQL)
```

**의존 방향은 한쪽이다.** 페이지와 서버 액션은 `TodoRepository` 인터페이스만 안다.
`@supabase/supabase-js` import는 `supabase-todo-repository.ts` **한 파일에만** 존재한다.

### MariaDB로 옮길 때

1. `lib/repository/mariadb-todo-repository.ts`를 만들어 `TodoRepository`를 구현한다.
2. `lib/repository/index.ts`의 팩토리에 분기 한 줄을 추가한다.
3. `supabase/migrations/*.sql`을 MariaDB 문법으로 옮긴다
   (`gen_random_uuid()` → `UUID()`, `jsonb` → `JSON`. 나머지는 그대로 이식된다).

`tests/repository.test.ts`는 어댑터 구현에 묶여 있지 않으므로 새 어댑터의 계약 테스트로
그대로 재사용할 수 있다. 앱 코드와 UI는 손대지 않는다.

## Supabase 연결

```bash
cp .env.example .env.local     # 값 입력
supabase db push               # 또는 SQL 에디터에서 migrations/*.sql 실행
psql "$DATABASE_URL" -f supabase/seed.sql   # 선택: 시드 투입
```

env가 채워지는 순간 팩토리가 Supabase 어댑터로 전환된다. 코드 변경은 필요 없다.

`supabase/seed.sql`은 자동 생성 파일이다. 시드를 바꿀 때는 `lib/seed/todos.ts`를 고치고
`npm run db:generate-seed`를 돌린다.

## 상태 관리

프로토타입은 모든 상태를 컴포넌트 `useState`에 뒀지만, 실제 구현은 나눴다.

| 상태 | 위치 | 이유 |
| --- | --- | --- |
| 뷰 | 라우트 (`/`, `/todos`) | 링크·뒤로가기 |
| 탭 · 필터 · 정렬 · 페이지 | **URL searchParams** | 서버 사이드 필터링과 맞물리고 링크 공유가 된다 |
| 모달 열림/편집 중 값 | 클라이언트 상태 | 서버가 알 필요 없다 |
| Remind 큐 체크 | 클라이언트 상태 | 핸드오프 문서대로 로컬 상태 |

필터·정렬·페이지네이션은 전부 리포지토리에서 처리한다(핸드오프 문서 "서버 사이드 권장").

## 디자인 충실도

색상·타이포·간격·그리드 트랙 폭은 핸드오프 문서의 확정값을 그대로 쓴다.
토큰은 `app/globals.css`의 `@theme` 한 곳에 모여 있고, 컴포넌트는 hex를 직접 쓰지 않는다.

주의: `app/globals.css`의 요소 규칙(`button { font: inherit }` 등)은 반드시 `@layer base`
안에 있어야 한다. 레이어 밖의 CSS는 Tailwind 유틸리티보다 우선하므로, 레이어를 벗기면
모든 버튼이 상속된 16px로 렌더된다.

폰트는 `next/font/google`로 빌드 시점에 내려받아 자체 도메인에서 서빙한다
(핸드오프 문서의 "사내 환경에서는 셀프호스팅 권장" 충족, 런타임 외부 요청 없음).

기준 해상도는 1920×1080, 앱 셸 최소 폭 1440px. 모바일 대응은 이번 범위가 아니다.

## 프로토타입과 달라진 점

의도적으로 바꾼 것들. 되돌릴 일이 생기면 근거를 보고 판단할 수 있게 남긴다.

- **표 헤더 정렬**은 asc/desc를 토글한다 (프로토타입은 오름차순 고정, 핸드오프 문서가 토글 권장).
- **탭**은 강조 표시만이 아니라 기본 정렬 기준을 바꾼다 — 개인별→이름, 회의체별→회의체,
  구분별→구분. 탭이 아무 동작도 하지 않으면 사용자에게 거짓 신호가 된다.
- **모달에 "진행률" 입력을 추가**했다. 표 뷰가 진척 막대를 그리는데 프로토타입 모달에는
  입력란이 없어, 없으면 새로 등록한 건이 영구히 0%에 묶인다. 진행상황 라벨 줄 오른쪽에
  좁게 배치해 레이아웃은 유지했다.
- **사이드바·집계 건수는 실데이터에서 계산**한다 (프로토타입은 하드코딩 값).
  "미결"은 진척 100% 미만으로 정의했다 — 프로토타입에 완료 상태가 없었기 때문이다.
- **"오늘 챙겨야 할 N건"** = 지연됐거나 완료목표일이 7일 이내인 미결 건.
- **Excel 다운로드**는 UTF-8 BOM이 붙은 CSV다. 외부 의존성 없이 Excel에서 한글이 깨지지 않는다.
  현재 화면의 필터가 그대로 적용된다.
- **아이콘**은 Lucide로 교체했다 (핸드오프 문서 권장). 📎 ▾ ⇅ ✓ 자리.

## 아직 없는 것

핸드오프 문서가 "추후"로 남긴 항목들이며, 붙일 자리는 만들어 뒀다.

- **로그인·권한 모델** — 현재는 인증 없음. `supabase/migrations`의 RLS 정책이
  전체 접근을 허용하고 있으므로, 조직도 연동 시 "Assistant 편집 / 그 외 조회"로 교체해야 한다.
- **메일 실제 발송** — UI와 `remind_logs` 테이블만 있고 발송은 하지 않는다.
  현재는 발송 예약 상태(`wait`)만 기록한다.
- **첨부 파일 업로드** — 파일명·크기 메타데이터만 저장한다. `Attachment.storageKey`가
  스토리지 연동 시 채울 자리다.
- **인사시스템 연동** — 조직·이름 선택지는 지금은 등록된 데이터에서 유도한다.
- **주간 리포트** — 버튼만 있고 비활성이다.
- **회의 일정** — `lib/seed/todos.ts`의 정적 데이터. 회의체 마스터 테이블이 생기면 옮긴다.

## 테스트

```bash
npm test        # 88 tests
```

날짜 계산(D-day·요일·타임존), 필터/정렬/페이지네이션, 집계(누적 막대 폭 합=100% 등),
폼 검증, 리포지토리 계약을 덮는다. UI 렌더링 테스트는 아직 없다.
