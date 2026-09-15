# 사내 AWS 배포

CodeCommit(main) → CodeBuild → ECR → ECS Fargate.

`taskdef.json`은 **ECS가 검증하는 규격 그대로**라 주석을 넣을 수 없다(정의되지 않은
필드가 있으면 `register-task-definition`이 거부한다). 왜 그 값인지는 여기 적는다.

## 자리 채우기

`<...>`를 사내 값으로 바꾼다. **비밀은 이 파일에 쓰지 않는다** — 비밀번호·키는
Secrets Manager 참조(`valueFrom`)로만 들어간다. 이미지에도 굽지 않는다:
앱이 DB·스토리지·메일 설정을 전부 런타임에 읽기 때문에 빌드에는 크리덴셜이
필요 없다.

## 왜 이 값인가

**메모리 1024MB.** 첨부 업로드 때문이다. 서버 액션 본문 한도가 24MB인데
(`next.config.ts`) 본문 전체가 메모리에 올라온다. 512MB로 잡으면 큰 첨부에서
OOM으로 태스크가 재시작된다.

**역할이 둘.** `executionRoleArn`은 ECR pull과 Secrets Manager 읽기를,
`taskRoleArn`은 앱이 쓰는 S3 접근을 맡는다. 앱 권한과 플랫폼 권한을 섞지 않는다.
S3 자격증명을 환경변수로 넣지 않는 이유도 같다 — 태스크 역할을 SDK가 알아서
집으므로 키가 컨테이너 덤프나 로그에 섞여 나갈 일이 없다.

**헬스체크가 DB를 안 본다.** `/api/health`는 일부러 DB에 질의하지 않는다. DB가
잠시 불안정할 때 멀쩡한 컨테이너까지 교체되는 것을 막기 위함이다. 데이터 소스
상태는 응답 본문(`dataSource`, `storage`)으로 확인한다. ALB 대상 그룹의 상태 검사
경로도 같은 `/api/health`로 맞춘다.

**`MARIADB_POOL_SIZE` × 태스크 수 ≤ 서버의 `max_connections`.** 태스크마다 풀을
따로 잡는다. 오토스케일링을 켤 거면 최대 태스크 수로 계산한다.

**`CONTAINER_NAME`은 `buildspec.yml`과 같아야 한다.** 다르면 배포 단계가
`imagedefinitions.json`을 무시해 옛 이미지가 그대로 돈다.

## 순서

1. **DB** — `db/mariadb/schema.sql`을 빈 스키마에 한 번 올린다.
2. **S3 버킷** — 비공개로 만든다. 퍼블릭 액세스 차단을 켜 둔 채로 둔다.
   다운로드는 앱이 내용을 읽어 내려주므로 버킷을 열 필요가 없다.
3. **Secrets Manager** — `assistant-todo/db`에 `{"password": "..."}`.
4. **ECR 리포지토리** 생성.
5. **CodeBuild** — privileged mode 켜고(도커 빌드), 서비스 역할에 ECR 푸시 권한.
   환경변수 `AWS_ACCOUNT_ID` · `AWS_DEFAULT_REGION` · `IMAGE_REPO_NAME`.
6. **태스크 정의 등록** → **ECS 서비스** 생성(ALB 뒤, 프라이빗 서브넷).
7. **데이터 이관** — `npm run migrate:to-mariadb` (아래).

## 데이터 이관

Supabase에서 MariaDB·S3로 옮긴다. 양쪽 환경변수를 모두 채운 셸에서:

```bash
# 미리보기 — 아무것도 쓰지 않는다
npm run migrate:to-mariadb

# 실제 이관
npm run migrate:to-mariadb -- --commit
```

대상 테이블이 비어 있어야 한다. 한 번 더 돌리면 중복이 아니라 거부된다.

## 접근 통제 — 미결

앱에는 로그인이 없다. 지금은 URL만 알면 임원 지시사항과 사원 명부(실명·이메일·
직책)가 전부 열린다. 사내망이라도 그대로 두면 안 된다. 코드 변경 없이
**ALB에 OIDC 인증**을 붙이거나 내부 전용 리스너로 제한하는 것이 가장 빠르다.
