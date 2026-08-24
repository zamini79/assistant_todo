/**
 * 앱 셸 — README: CSS Grid `264px minmax(0,1fr)`, min-height 100vh,
 * min-width 1440px, 배경 #faf8f5.
 *
 * 사이드바는 현재 필터를 강조 표시해야 하는데 Next의 layout은 searchParams를 받지 못한다.
 * 그래서 레이아웃 파일 대신 각 페이지가 이 컴포넌트를 감싸는 형태로 둔다.
 */
import { TodoDialogProvider } from "@/components/todo-dialog/todo-dialog-provider";
import { getTodoRepository } from "@/lib/repository";

import { Sidebar } from "./sidebar";

export async function AppShell({
  active,
  activePerson,
  activeMeeting,
  children,
}: {
  active: "brief" | "all" | "settings" | "report";
  activePerson?: string;
  activeMeeting?: string;
  children: React.ReactNode;
}) {
  const repository = getTodoRepository();
  // 사이드바 집계는 항상 전체 기준 (필터와 무관하게 총량을 보여준다).
  const [aggregates, options, settings, recipients, meetingBodies] = await Promise.all([
    repository.aggregate(),
    repository.options(),
    repository.getSettings(),
    repository.listRecipients(),
    repository.listMeetingBodies(),
  ]);

  return (
    <TodoDialogProvider
      options={options}
      recipients={recipients}
      meetingBodies={meetingBodies}
    >
      <div className="grid min-h-screen min-w-[1440px] grid-cols-[264px_minmax(0,1fr)] items-stretch bg-page">
        <Sidebar
          aggregates={aggregates}
          active={active}
          activePerson={activePerson}
          activeMeeting={activeMeeting}
          settings={settings}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </TodoDialogProvider>
  );
}
