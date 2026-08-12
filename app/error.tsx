"use client";

/**
 * 에러 상태 (README "구현 시 추가로 필요한 것").
 * 리포지토리 실패(Supabase 접속 불가 등)가 여기로 올라온다.
 */
import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen min-w-[1440px] items-center justify-center bg-page">
      <div className="w-[420px] rounded-card border border-line-card bg-card px-[28px] py-[26px]">
        <h1 className="text-modal font-semibold text-ink">
          화면을 불러오지 못했습니다.
        </h1>
        <p className="mt-[10px] text-label leading-[1.7] text-ink-3">
          잠시 후 다시 시도해 주세요. 문제가 계속되면 데이터 연결 설정을 확인해 주세요.
        </p>
        {error.digest ? (
          <p className="mt-[8px] font-mono text-note text-ink-5">오류 코드: {error.digest}</p>
        ) : null}
        <div className="mt-[18px] flex gap-[8px]">
          <button
            type="button"
            onClick={reset}
            className="cursor-pointer rounded-ctl bg-dark px-[15px] py-[9px] text-cell leading-none font-semibold text-on-dark hover:bg-dark-hover"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="rounded-ctl border border-line-field px-[15px] py-[9px] text-cell leading-none text-ink-field hover:border-line-hover"
          >
            브리핑으로
          </Link>
        </div>
      </div>
    </div>
  );
}
