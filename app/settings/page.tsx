/**
 * 설정 — 전략 Assistant · 메일 수신자 마스터.
 *
 * Assistant는 주기적으로 바뀌고 수신자는 지시사항마다 다르므로,
 * 둘 다 코드가 아니라 운영 중에 바꿀 수 있어야 한다.
 */
import { AppShell } from "@/components/shell/app-shell";
import { AssistantForm } from "@/components/settings/assistant-form";
import { RecipientList } from "@/components/settings/recipient-list";
import { SectionHeading } from "@/components/ui/primitives";
import { getMailStatus } from "@/lib/mail";
import { getTodoRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const repository = getTodoRepository();
  const [settings, recipients, usage] = await Promise.all([
    repository.getSettings(),
    repository.listRecipients(),
    repository.countRecipientUsage(),
  ]);
  const mail = getMailStatus();

  return (
    <AppShell active="settings">
      <div className="min-h-screen bg-card px-[44px] pt-[26px] pb-[40px]">
        <header className="mb-[26px]">
          <h1 className="text-view font-semibold tracking-[-0.02em] text-ink">설정</h1>
          <p className="mt-[4px] text-aux leading-[1.6] text-ink-4">
            전략 Assistant와 메일 수신자를 관리합니다
          </p>
        </header>

        <div className="max-w-[840px]">
          <SectionHeading
            title="전략 Assistant"
            hint="담당자가 바뀌면 여기서 교체합니다"
            className="mb-[12px]"
          />
          <AssistantForm settings={settings} />

          <SectionHeading
            title="메일 수신자"
            hint="지시사항마다 여기서 골라 지정합니다"
            className="mt-[32px] mb-[12px]"
          />
          <RecipientList recipients={recipients} usage={usage} />

          <SectionHeading title="메일 발송" hint="읽기 전용" className="mt-[32px] mb-[12px]" />
          <div className="rounded-card border border-line-card bg-surface-alt px-[20px] py-[16px]">
            {mail.configured ? (
              <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-y-[8px] text-cell">
                <dt className="text-ink-3">상태</dt>
                <dd className="text-signal-g-fg">발송 가능</dd>
                <dt className="text-ink-3">서버</dt>
                <dd className="font-mono text-ink-2">{mail.host}</dd>
                <dt className="text-ink-3">발신자</dt>
                <dd className="text-ink-2">{mail.from}</dd>
              </dl>
            ) : (
              <p className="text-cell leading-[1.7] text-danger-fg">
                SMTP 환경변수가 설정되지 않아 발송할 수 없습니다.
              </p>
            )}
            <p className="mt-[12px] text-note leading-[1.6] text-ink-4">
              메일 서버는 보안상 환경변수로만 설정합니다 (`SMTP_*`). 사내 메일서버로 옮길 때도
              환경변수만 교체하면 됩니다.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
