/**
 * 설정 — 전략 Assistant · 사원 명부 · 회의체.
 *
 * 모두 코드가 아니라 운영 중에 바꿀 수 있어야 하는 값이다.
 * 사원 명부는 사내 인사정보 연동 전까지 쓰는 임시 마스터다.
 */
import { AppShell } from "@/components/shell/app-shell";
import { AssistantForm } from "@/components/settings/assistant-form";
import { MeetingBodyList } from "@/components/settings/meeting-body-list";
import { RosterUpload } from "@/components/settings/roster-upload";
import { SectionHeading } from "@/components/ui/primitives";
import { getMailStatus } from "@/lib/mail";
import { getTodoRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const repository = getTodoRepository();
  const [settings, employees, meetingBodies, meetingUsage] = await Promise.all([
    repository.getSettings(),
    repository.listEmployees(),
    repository.listMeetingBodies(),
    repository.countMeetingBodyUsage(),
  ]);
  const mail = getMailStatus();

  return (
    <AppShell active="settings">
      <div className="min-h-screen bg-card px-[44px] pt-[26px] pb-[40px]">
        <header className="mb-[26px]">
          <h1 className="text-view font-semibold tracking-[-0.02em] text-ink">설정</h1>
          <p className="mt-[4px] text-aux leading-[1.6] text-ink-4">
            전략 Assistant · 사원 명부 · 회의체를 관리합니다
          </p>
        </header>

        <div className="max-w-[840px]">
          <SectionHeading
            title="전략 Assistant"
            hint="담당자가 바뀌면 여기서 교체합니다 · 1명"
            className="mb-[12px]"
          />
          <AssistantForm settings={settings} />

          <SectionHeading
            title="사원 명부"
            hint="사내 인사정보 연동 전까지 쓰는 임시 마스터"
            className="mt-[32px] mb-[12px]"
          />
          <RosterUpload count={employees.length} />

          <SectionHeading
            title="회의체"
            hint="지시사항 등록 화면의 선택지가 됩니다"
            className="mt-[32px] mb-[12px]"
          />
          <MeetingBodyList meetingBodies={meetingBodies} usage={meetingUsage} />

          <SectionHeading title="메일 발송" hint="읽기 전용" className="mt-[32px] mb-[12px]" />
          <div className="rounded-card border border-line-card bg-surface-alt px-[20px] py-[16px]">
            {mail.configured ? (
              <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-y-[8px] text-cell">
                <dt className="text-ink-3">상태</dt>
                <dd className="text-signal-g-fg">설정됨</dd>
                <dt className="text-ink-3">경로</dt>
                <dd className="font-mono text-ink-2">{mail.host}</dd>
                <dt className="text-ink-3">발신자</dt>
                <dd className="text-ink-2">{mail.from}</dd>
              </dl>
            ) : (
              <p className="text-cell leading-[1.7] text-danger-fg">
                메일 환경변수가 설정되지 않아 발송할 수 없습니다.
              </p>
            )}
            {/*
              "설정됨"은 값이 있다는 뜻일 뿐 실제로 나간다는 보장이 아니다.
              SMTP는 호스팅·사내 방화벽이 포트를 막으면 발송 순간에야 실패한다
              (Render 무료 플랜은 25·465·587을 차단한다). 그 함정을 여기 적어 둔다.
            */}
            {mail.configured && mail.transport === "smtp" ? (
              <p className="mt-[10px] text-note leading-[1.6] text-ink-4">
                SMTP로 나갑니다. 호스팅이 SMTP 포트를 막아 두면 값이 맞아도 발송에
                실패합니다 — 그 경우 <strong className="font-medium">RESEND_API_KEY</strong>를
                지정해 HTTP API로 보낼 수 있습니다.
              </p>
            ) : null}
            <p className="mt-[12px] text-note leading-[1.6] text-ink-4">
              발송 설정은 보안상 환경변수로만 둡니다 — HTTP API는 `RESEND_API_KEY`·`MAIL_FROM`,
              SMTP는 `SMTP_*`. 둘 다 있으면 HTTP API가 쓰입니다. 사내 메일서버로 옮길 때는
              `RESEND_API_KEY`를 빼면 SMTP로 되돌아옵니다.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
