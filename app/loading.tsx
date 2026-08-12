/**
 * 로딩 상태 (README "구현 시 추가로 필요한 것").
 * 셸의 형태를 유지해 화면이 튀지 않게 한다.
 */
export default function Loading() {
  return (
    <div className="grid min-h-screen min-w-[1440px] grid-cols-[264px_minmax(0,1fr)] bg-page">
      <div className="bg-dark px-[22px] pt-[26px] pb-[30px]">
        <div className="text-section leading-[1.4] font-semibold tracking-[-0.01em] text-on-dark">
          전략 Assistant
        </div>
        <div className="mt-[3px] font-mono text-note leading-[1.4] text-on-dark-3">
          TO-DO MANAGEMENT
        </div>
      </div>
      <div className="px-[44px] pt-[32px]">
        <div className="h-[14px] w-[160px] animate-pulse rounded-bar bg-surface" />
        <div className="mt-[12px] h-[30px] w-[380px] animate-pulse rounded-bar bg-surface" />
        <div className="mt-[26px] flex flex-col gap-[8px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[86px] animate-pulse rounded-card border border-line-card bg-card"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
