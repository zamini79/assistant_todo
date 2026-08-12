/**
 * 푸터 — "N건 표시 (전체 M건)" + 페이지네이션 (README §3).
 * 프로토타입은 표시만 있었고, 여기서는 실제로 동작한다.
 */
import Link from "next/link";
import clsx from "clsx";

import { pageCount } from "@/lib/domain/query";
import { todosHref, type TodoSearchParams } from "@/lib/ui/search-params";

/** 현재 페이지 주변만 노출 — 페이지가 많아져도 푸터가 넘치지 않게 한다. */
const WINDOW = 2;

function pageNumbers(current: number, total: number): number[] {
  const from = Math.max(1, Math.min(current - WINDOW, total - WINDOW * 2));
  const to = Math.min(total, Math.max(current + WINDOW, WINDOW * 2 + 1));
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const CELL = "rounded-ctl px-[10px] py-[6px] font-mono text-cell leading-none";

export function Pagination({
  params,
  shown,
  total,
  page,
  pageSize,
}: {
  params: TodoSearchParams;
  /** 현재 페이지에 표시된 건수 */
  shown: number;
  /** 필터 적용 후 총 건수 */
  total: number;
  page: number;
  pageSize: number;
}) {
  const last = pageCount(total, pageSize);

  return (
    <div className="flex items-center justify-between bg-surface-alt px-[44px] py-[16px]">
      <div className="text-aux leading-none text-ink-3">
        {shown}건 표시 (전체 {total}건)
      </div>

      {last > 1 ? (
        <nav className="flex gap-[4px] text-ink-3" aria-label="페이지 이동">
          {page > 1 ? (
            <Link
              href={todosHref(params, { page: String(page - 1) })}
              aria-label="이전 페이지"
              className={clsx(CELL, "border border-line-field hover:border-line-hover")}
            >
              ‹
            </Link>
          ) : null}

          {pageNumbers(page, last).map((n) => (
            <Link
              key={n}
              href={todosHref(params, { page: String(n) })}
              aria-current={n === page ? "page" : undefined}
              className={clsx(
                CELL,
                n === page
                  ? "bg-dark text-on-dark"
                  : "border border-line-field hover:border-line-hover",
              )}
            >
              {n}
            </Link>
          ))}

          {page < last ? (
            <Link
              href={todosHref(params, { page: String(page + 1) })}
              aria-label="다음 페이지"
              className={clsx(CELL, "border border-line-field hover:border-line-hover")}
            >
              ›
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
