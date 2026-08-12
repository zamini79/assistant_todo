# Handoff: 전략 Assistant To-do Management

## Overview
사장님(CEO)이 회의·메일 등으로 내리는 지시사항을 전략 Assistant 1인이 기록·관리하고, 담당 임원에게 전달·리마인드하며 진척을 추적하는 사내 웹 시스템. 최종 사용자는 전략 Assistant 1명이며, 향후 사장님 전용 뷰와 권한(Assistant만 등록/수정, 나머지는 조회) 추가를 고려한다.

현재 범위:
- 로그인 없음 (추후 사내 조직도 연동)
- 조직/이름은 수동 입력 (추후 인사시스템 연동)
- 메일 발송은 UI만 존재, 실제 발송 없음 (추후 사내 메일서버 연동). 현재는 "발송 예약/발송 여부" 상태만 저장

기술 전제: 초기 GitHub + Supabase + Vercel → 최종 AWS(CodeCommit / MariaDB / ECS). 따라서 DB 접근은 특정 벤더 SDK에 직접 의존하지 말고 리포지토리 계층으로 감쌀 것.

## About the Design Files
이 폴더의 HTML 파일은 **디자인 레퍼런스(프로토타입)** 입니다. 의도한 화면 구성과 동작을 보여주기 위한 것이며, 그대로 프로덕션에 복사해 쓰는 코드가 아닙니다. 대상 코드베이스의 기존 환경(React/Next.js 등)과 컴포넌트 패턴으로 **다시 구현**해 주세요. 아직 코드베이스가 없다면 Next.js(App Router) + TypeScript + Supabase(추후 MariaDB 교체 가능한 데이터 계층) 조합을 권장합니다.

파일은 `.dc.html` 확장자이며 로컬 프리뷰용 런타임(`support.js`)에 의존합니다. 브라우저로 직접 열면 렌더링됩니다. 로직은 파일 하단 `class Component extends DCLogic` 블록(데이터·상태·핸들러), 마크업은 상단 템플릿에 있습니다.

## Fidelity
**High-fidelity.** 색상·타이포·간격·상태색이 확정값입니다. 아래 문서의 hex/px 값을 그대로 사용해 픽셀에 가깝게 재현하되, 대상 코드베이스에 디자인 시스템이 이미 있으면 동등한 토큰으로 매핑하세요.

기준 해상도: **1920×1080 데스크톱**. 앱 셸 최소 폭 1440px, 그 이하에서는 페이지 가로 스크롤(`body{overflow-x:auto}`). 모바일/태블릿 대응은 이번 범위 아님.

## Screens / Views

앱 셸: CSS Grid `264px minmax(0,1fr)`, `min-height:100vh`, `min-width:1440px`, 배경 `#faf8f5`.

### 1) 사이드바 (모든 화면 공통)
- 배경 `#3b3128`, padding `26px 22px 30px`
- 타이틀 "전략 Assistant" — 600 13px/1.4, `#f3ede4`, letter-spacing -.01em
- 서브 "TO-DO MANAGEMENT" — IBM Plex Mono 400 10.5px, `#9c8f7f`, margin-top 3px
- 메뉴 3개 (margin-top 24px, 항목 padding `9px 11px`, radius 3px, 12.5px)
  - 오늘의 브리핑 / 전체 지시사항 / 지시사항 등록(모달 오픈)
  - 활성: 배경 `#4d4033`, 텍스트 `#f3ede4`, weight 500 / 비활성: 텍스트 `#c3b6a5`, hover 배경 `#4d4033`
- 섹션 라벨 "개인별", "회의체별" — Mono 600 10px, letter-spacing .1em, `#7d7061`
- 개인별 항목: 신호등 점(6px 원) + 이름 + 미결 건수(Mono 11px `#9c8f7f`). 클릭 → 전체 지시사항 뷰로 이동 + 해당 인물 필터
- 회의체별 항목: 이름 + 건수. 클릭 → 전체 지시사항 + 회의체 필터
- 하단 안내 박스: border `1px solid #55483a`, radius 3px, padding 12px, 10.5px/1.6 `#9c8f7f`, 문구 "사내 메일서버 · 인사시스템 연동 예정"

### 2) 오늘의 브리핑 (기본 진입 화면)
Assistant의 하루 운영 화면. padding `32px 44px 40px`.

헤더
- 날짜 "2026. 08. 12  WED" — Mono 400 11px, letter-spacing .1em, `#a1968a`
- 제목 "오늘 챙겨야 할 지시사항 N건" — 600 26px/1.3, `#2a231c`, letter-spacing -.02em, 숫자는 `#b03434`
- 우측 버튼: [주간 리포트] 흰 배경 + `1px solid #ddd6cc`, radius 3px, padding `9px 13px`, 12px / [+ 지시사항 등록] 배경 `#3b3128`, 텍스트 `#f3ede4`, 600 12px, padding `9px 15px`

본문 그리드: `minmax(0,1fr) minmax(380px,440px)`, gap 26px, align-items start

좌측 컬럼
- **마감 임박 · 지연** (섹션 제목 600 13px `#2a231c` + 보조 "완료목표일 순" 11px `#a1968a`)
  - 카드: 배경 #fff, `1px solid #eae4db`, radius 4px, padding `16px 20px`, hover border `#c9bfb2`
  - 카드 내부 그리드 `86px minmax(0,1fr) 150px`, gap 18px
    - 좌: 완료목표일 Mono 500 12px (지연 시 `#b03434`), D-라벨 10.5px `#a1968a`
    - 중: 신호등 점(7px) + 구분 500 10.5px `#5c5346` + 회의체 10.5px `#a1968a` + 첨부 아이콘 / 지시 내용 12.5px/1.5 `#2a231c` / "이름 · 조직 — 진행상황" 11px `#8b8072`
    - 우: Remind 상태 뱃지, 그 아래 "수정" 링크(11px, `#3b3128`, border-bottom `1px solid #d8cfc3`) → 수정 모달
  - 정렬: 완료목표일 오름차순 상위 5건
- **임원별 미결 현황** (보조 "사장님 보고용 요약")
  - 컨테이너 #fff, `1px solid #eae4db`, radius 4px, padding `6px 16px`
  - 행 그리드 `172px minmax(0,1fr) 60px`, gap 18px, padding 12px 0, 하단선 `#f2ede6`
  - 이름 12.5px `#2a231c` + 조직 10.5px `#a1968a` / G·Y·R 누적 막대(높이 8px, radius 2px, 트랙 `#f2ede6`) / 건수 Mono 500 12px
  - 행 클릭 → 해당 인물 필터로 전체 지시사항 이동

우측 레일 (세로 gap 16px)
- **Remind 메일 큐** — 배경 `#3b3128`, radius 4px, padding `18px 18px 16px`
  - 헤더 "Remind 메일 큐" 600 13px `#f3ede4` + "N 대기" Mono 11px `#9c8f7f`
  - 행: 체크박스(16px, radius 3px, border `1px solid #7d7061`, 미선택 배경 `#4d4033` / 선택 배경 `#f3ede4` + ✓ `#3b3128`) + 수신자 12px `#f3ede4` + 제목 "[구분] 내용 22자…" 10.5px `#9c8f7f` + 마감(MM-DD) Mono 10.5px (Red 건은 `#e08b8b`)
  - 버튼: [선택 발송 (준비중)] 배경 `#f3ede4` 텍스트 `#3b3128` 600 12px / [템플릿] border `1px solid #6b5d4d` 텍스트 `#c3b6a5`
  - 각주 10.5px/1.6 `#9c8f7f` "사내 메일서버 구축 후 실제 발송 · 현재는 발송 예약만 기록"
  - 큐 = Remind 상태가 `wait`(발송대기)인 항목
- **지시사항 구분별 분포** — #fff 카드, 항목 그리드 `76px minmax(0,1fr) 30px`, 막대 높이 6px 채움색 `#3b3128`, 최대값 기준 100% 스케일. 클릭 → 구분 필터
- **이번 주 회의 일정** — 날짜(Mono 500 11px, 폭 52px) + 회의명 12px, 보조 문구 `#a1968a`

### 3) 전체 지시사항 (표 뷰)
배경 #fff, `min-height:100vh`.

- 헤더 padding `26px 44px 0`: 제목 "전체 지시사항" 600 22px `#2a231c` + 현재 필터 요약 11.5px `#a1968a`("필터: 박현수 본부장 · 전략검토" / "필터 없음 · 전체 보기"). 우측 [Excel 다운로드], [+ 지시사항 등록]
- 탭 4개 (전체 To-do / 개인별 / 회의체별 / 지시사항 구분별): padding `8px 2px 12px`, gap 22px, 활성 600 13px `#2a231c` + `border-bottom:2px solid #3b3128`, 비활성 400 `#8b8072`
- 필터 바 (padding `16px 44px`, 하단선 `#eae4db`, flex-wrap, gap 8px)
  - 지시일 범위 / 회의체 / 조직·이름 / 구분 드롭다운: `1px solid #ddd6cc`, radius 3px, padding `7px 10px`, 12px `#4a4137`, 화살표 `#b6ada1`
  - 신호등 칩 3종(Green/Yellow/Red + 건수): radius 20px, padding `6px 10px`, 500 11.5px. 선택 시 Green `#eaf0ea`/`#2f6b45`, Yellow `#f6efdf`/`#8a6314`, Red `#f7e8e8`/`#963030`; 미선택 `#f6f4f0`/`#8b8072`. 토글 방식
  - 우측 "필터 초기화" 11.5px `#8b8072`, border-bottom `1px solid #ddd6cc`
- 표 그리드(헤더/행 동일): `36px 96px 100px 126px 158px 96px minmax(0,1fr) 220px 88px 44px 76px`, padding 좌우 44px
  - 헤더: 높이 40px, 배경 `#faf8f5`, 하단선 `#eae4db`, 600 11px `#8b8072`. 정렬 가능한 열에 `⇅` (지시일/완료목표일/회의체/조직·이름/구분)
  - 행: min-height 56px, 하단선 `#f2ede6`, hover 배경 `#faf8f5`
    - 신호등 점 9px 원
    - 지시일 Mono 11.5px `#5c5346` / 완료목표일 Mono 500 11.5px (Red일 때 `#b03434`)
    - 회의체 11.5px / 조직(위 `#2a231c`) + 이름(아래 `#a1968a`)
    - 구분 뱃지: 배경 `#f2ede6`, radius 3px, padding `4px 7px`, 500 10.5px `#5c5346`
    - 지시사항 세부 내용 12px/1.5 `#2a231c`, padding-right 18px
    - 진행상황: 텍스트 11px `#8b8072` + 진척 막대(높이 4px, 트랙 `#f2ede6`, 채움 = 신호등 색, 폭 = pct%)
    - Remind 뱃지 / 첨부 아이콘 `#b6ada1` / 관리 [수정]`#3b3128` · [삭제]`#a1968a`
- 푸터: "N건 표시 (전체 M건)" + 페이지네이션(현재 페이지 배경 `#3b3128` 텍스트 `#f3ede4`, 나머지 `1px solid #ddd6cc`)

### 4) 지시사항 등록/수정 모달
- 오버레이 `position:fixed; inset:0; background:rgba(42,35,28,.45)`, 상단 정렬, padding `48px 20px`, `overflow:auto`, z-index 50
- 다이얼로그: 폭 820px, #fff, radius 6px, shadow `0 24px 60px rgba(42,35,28,.3)`
- 헤더 padding `20px 26px`, 하단선 `#eae4db`: 제목 600 16px ("지시사항 등록" / "지시사항 수정") + 보조 11px `#a1968a` "전략 Assistant 직접 입력 · 조직/이름은 추후 인사시스템 연동" + 우측 ✕ 닫기
- 본문 padding `22px 26px 24px`, 2열 그리드 gap 14px
  - 지시일 / 완료목표일 (date input, Mono 12px)
  - 회의체 (select, 전체 폭)
  - 조직 / 이름 (select 2열, 조직 아래 각주 "추후 인사시스템 연동")
  - 지시사항 구분: 칩 5개(전략검토·자료요청·이행점검·의사결정·대외대응). 선택 배경 `#3b3128` 텍스트 `#f3ede4`, 미선택 border `1px solid #ddd6cc` 텍스트 `#5c5346`
  - 지시사항 세부 내용 (textarea, min-height 70px, 12.5px/1.7)
  - 진행상황 (textarea, min-height 44px)
  - 진행상황 신호등: 3분할 버튼, 선택 시 해당 파스텔 배경 + 신호등색 테두리
  - Remind 메일 발송: 배경 `#faf8f5` 박스 + 토글(40×22, 켜짐 `#3b3128` / 꺼짐 `#ddd6cc`, 노브 18px 흰 원). 각주 "사내 메일서버 연동 후 활성화 · 현재는 발송 예약만 기록"
  - 첨부 파일: dashed `1px dashed #ddd6cc` 드롭존, 안내문 + 파일명
- 푸터 padding `16px 26px`, 상단선 `#eae4db`, 배경 `#faf8f5`: [저장] `#3b3128`/`#f3ede4` 600 13px, [취소] outline, 우측 끝 [삭제] border `1px solid #ecdcdc` 텍스트 `#a35555` — 삭제는 수정 모드에서만 표시

## Interactions & Behavior
- 사이드바 "오늘의 브리핑" / "전체 지시사항" → 뷰 전환
- 사이드바 개인별 항목 클릭 → view=all, 인물 필터, 탭=개인별
- 사이드바 회의체별 클릭 → view=all, 회의체 필터, 탭=회의체별
- 구분별 분포 막대 클릭 → view=all, 구분 필터, 탭=구분별
- 임원별 미결 현황 행 클릭 → 인물 필터로 이동
- 신호등 칩 클릭 → 해당 신호등 필터 토글(+ view=all)
- 표 헤더 클릭 → 해당 컬럼 기준 정렬(현 프로토타입은 오름차순 고정, 실제 구현은 asc/desc 토글 권장, 한국어는 `localeCompare(…, 'ko')`)
- [+ 지시사항 등록] / 사이드바 등록 → 빈 폼 모달, 행의 [수정] / 브리핑 카드의 [수정] → 값이 채워진 모달
- 저장: id 없으면 신규 추가, 있으면 갱신 후 모달 닫기. 취소/✕ → 변경 폐기
- 삭제: 표 행의 [삭제] 및 모달 [삭제] — 실제 구현에서는 확인 다이얼로그 필요(프로토타입에는 없음)
- Remind 큐 항목 클릭 → 발송 대상 체크 토글(로컬 상태). "선택 발송"은 비활성/준비중
- 상태 없음 처리: 필터 결과 0건일 때의 empty state는 프로토타입에 없음 — 구현 시 추가 필요
- 로딩/에러/폼 검증(필수: 지시일, 완료목표일, 회의체, 조직, 이름, 구분, 세부내용)도 구현 시 추가 필요
- 전환 애니메이션 없음. hover만 즉시 색/보더 변화

## State Management
프로토타입의 상태(그대로 옮겨도 무방):
- `view`: `"brief" | "all"`
- `items`: To-do 배열
- `sort`: `"date" | "due" | "meeting" | "name" | "kind"`
- `tab`: `"전체" | "개인별" | "회의체별" | "구분별"`
- `fMeeting`, `fPerson`, `fKind`: 문자열 필터(기본 `"전체"`)
- `fSig`: `"G" | "Y" | "R" | null`
- `formOpen`: boolean, `form`: 편집 중 항목(신규는 기본값 객체)
- `sent`: `{ [todoId]: boolean }` — Remind 큐 체크 상태

데이터 요구:
- To-do CRUD (목록/생성/수정/삭제), 필터·정렬은 서버 사이드 권장(건수 증가 대비)
- 집계: 신호등별 건수, 인물별 미결 및 G/Y/R 비율, 회의체별 건수, 구분별 건수
- 첨부파일 업로드/다운로드(스토리지), 파일명·크기 저장
- Remind 발송 이력 테이블(발송 여부/일시/수신자) — 실제 발송은 추후

### To-do 필드 (DB 컬럼 후보)
`id`, `instructed_at`(지시일), `due_date`(완료목표일), `meeting_body`(회의체), `org`(조직), `assignee_name`(이름), `category`(지시사항 구분), `detail`(세부 내용), `progress_note`(진행상황), `progress_pct`(0–100), `signal`(G/Y/R), `remind_status`(sent/wait/none), `attachment`(파일 메타), `created_at`, `updated_at`

## Design Tokens

색상
- 배경: 페이지 `#faf8f5`, 카드 `#ffffff`, 보조면 `#f2ede6` / `#faf8f5`
- 다크(사이드바·강조): `#3b3128`, hover/활성 `#4d4033`, 보더 `#55483a`, 다크 위 텍스트 `#f3ede4` / 보조 `#c3b6a5` / 약함 `#9c8f7f` / 라벨 `#7d7061`
- 텍스트: 본문 `#2a231c`, 준본문 `#5c5346`, 보조 `#8b8072`, 약함 `#a1968a`, 아주 약함 `#b6ada1`
- 보더: `#eae4db`(카드), `#ddd6cc`(입력/버튼), `#f2ede6`(행 구분), hover `#c9bfb2`
- 신호등: Green `#3f8f5b`, Yellow `#d9a03a`, Red `#c04141`, 지연 텍스트 `#b03434`
- 신호등 배경/텍스트 쌍: `#eaf0ea`/`#2f6b45`, `#f6efdf`/`#8a6314`, `#f7e8e8`/`#963030`
- Remind 뱃지: 발송완료 `#eaf0ea`/`#2f6b45`, 발송대기 `#f6efdf`/`#8a6314`, 미발송 `#f2f0ec`/`#8b8072`
- 위험(삭제): 텍스트 `#a35555`, 보더 `#ecdcdc`

타이포그래피
- 본문: `'IBM Plex Sans KR'` 300/400/500/600/700
- 숫자·날짜·코드: `'IBM Plex Mono'` 400/500
- 스케일: 26px/600(페이지 타이틀) · 22px/600(뷰 타이틀) · 16px/600(모달 타이틀) · 13px/600(섹션) · 12.5px/400(본문) · 12px/400(표 셀) · 11.5px/400(보조) · 11px(라벨) · 10.5px(각주)
- letter-spacing: 큰 제목 -.02em, Mono 라벨 .1em

간격 / 형태
- 페이지 padding 좌우 44px, 카드 padding 16–20px, 모달 padding 22–26px
- gap: 26px(메인 2컬럼) · 18px(카드 내부) · 16px(레일) · 8px(버튼) · 6px(칩)
- radius: 3px(버튼/입력/뱃지) · 4px(카드) · 6px(모달) · 20px(칩) · 50%(신호등 점)
- 그림자: 모달 `0 24px 60px rgba(42,35,28,.3)`. 그 외 그림자 없음(보더로 구분)
- 진척 막대 높이 4px(표) / 6px(차트) / 8px(누적 막대), radius 2px

## Assets
외부 이미지·아이콘 없음. 첨부 표시는 📎 이모지, 드롭다운 화살표는 `▾`(&#9662;), 정렬은 `⇅`(&#8645;), 체크는 `✓`. 실제 구현에서는 코드베이스의 아이콘 세트(예: Lucide)로 교체 권장. 폰트는 Google Fonts(IBM Plex Sans KR, IBM Plex Mono) — 사내 환경에서는 셀프호스팅 권장.

샘플 데이터(인물·회의체·지시 내용)는 전부 가상입니다. 실제 데이터로 교체하세요.

## Files
- `전략 Assistant To-do v2.dc.html` — **구현 대상 최종 디자인**. 브리핑 뷰 + 표 뷰 + 등록/수정 모달, 상태·핸들러 포함
- `전략 Assistant To-do (샘플 3안).dc.html` — 초기 시안 3안(1a 표 중심 / 1b 신호등 보드 / 1c 브리핑 뷰). 맥락 참고용
- `support.js` — 프리뷰용 런타임. 프로토타입 렌더링에만 필요하며 이식 대상 아님

## 구현 시 추가로 필요한 것 (프로토타입 미포함)
- 필터 결과 0건 empty state, 로딩/에러 상태
- 삭제 확인 다이얼로그, 저장 후 토스트
- 폼 검증 및 서버 에러 표시
- 페이지네이션 실제 동작(현재는 표시만)
- Excel 다운로드
- 권한 모델(Assistant 편집 / 그 외 조회), 로그인 연동
- Remind 스케줄러 및 메일 템플릿, 발송 이력
