"use client";

/**
 * 사원 명부 검색 입력.
 *
 * 한 글자 칠 때마다 바로 결과가 나와야 해서, 명부를 한 번 받아 두고 로컬에서 거른다.
 * 타건마다 서버를 왕복하면 그 지연이 그대로 드러난다.
 * 명부는 모듈 수준에 한 번만 담아 여러 입력칸이 같이 쓴다 —
 * 지시사항 담당자·추가 수신자·담당 Assistant가 같은 화면에 함께 있을 수 있다.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";

import {
  employeeLabel,
  searchEmployees,
  type Employee,
} from "@/lib/domain/employee";

/** 세션 동안 유지되는 명부 캐시 — 모달을 여닫을 때마다 다시 받지 않는다 */
let cache: Employee[] | null = null;
let inFlight: Promise<Employee[]> | null = null;

async function loadEmployees(): Promise<Employee[]> {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = fetch("/api/employees")
      .then((res) => (res.ok ? res.json() : { employees: [] }))
      .then((data: { employees?: Employee[] }) => {
        cache = data.employees ?? [];
        return cache;
      })
      .catch(() => {
        // 실패하면 캐시에 남기지 않는다 — 다음 입력에서 다시 시도한다.
        inFlight = null;
        return [];
      });
  }
  return inFlight;
}

export function EmployeeSearch({
  placeholder = "이름 또는 부서로 검색",
  onSelect,
  autoFocus,
  disabledIds = [],
  emptyHint,
}: {
  placeholder?: string;
  onSelect: (employee: Employee) => void;
  autoFocus?: boolean;
  /** 이미 고른 사람 — 목록에서 회색으로 두고 다시 못 고르게 한다 */
  disabledIds?: string[];
  /** 명부가 비었을 때 보여줄 안내 */
  emptyHint?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState<Employee[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadEmployees().then((list) => {
      if (!alive) return;
      setEmployees(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 바깥을 누르면 목록을 닫는다.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = useMemo(() => searchEmployees(employees, query), [employees, query]);
  const blocked = new Set(disabledIds);

  const choose = (employee: Employee) => {
    if (blocked.has(employee.id)) return;
    onSelect(employee);
    setQuery("");
    setOpen(false);
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // 폼 안에 있으므로 Enter가 제출로 새지 않게 막는다.
      e.preventDefault();
      const picked = results[active];
      if (picked) choose(picked);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search
          size={13}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-[10px] -translate-y-1/2 text-ink-5"
        />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          placeholder={loading ? "명부 불러오는 중…" : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-ctl border border-line-field bg-card py-[10px] pr-[11px] pl-[30px] text-cell text-ink outline-none transition-colors focus:border-line-hover"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label="검색어 지우기"
            className="absolute top-1/2 right-[8px] -translate-y-1/2 cursor-pointer p-[3px] text-ink-5 hover:text-ink-2"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      {open && query.trim() ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%+4px)] right-0 left-0 z-[80] max-h-[260px] overflow-auto rounded-ctl border border-line-card bg-card py-[4px] shadow-modal"
        >
          {employees.length === 0 ? (
            <li className="px-[12px] py-[10px] text-note leading-[1.6] text-ink-4">
              {emptyHint ?? "설정 → 사원 명부에서 엑셀을 올려주세요."}
            </li>
          ) : results.length === 0 ? (
            <li className="px-[12px] py-[10px] text-note text-ink-4">
              검색 결과가 없습니다.
            </li>
          ) : (
            results.map((e, i) => {
              const off = blocked.has(e.id);
              return (
                <li key={e.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    disabled={off}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(e)}
                    className={clsx(
                      "flex w-full items-baseline gap-[8px] px-[12px] py-[8px] text-left transition-colors",
                      off
                        ? "cursor-not-allowed opacity-45"
                        : "cursor-pointer",
                      !off && i === active && "bg-surface-alt",
                    )}
                  >
                    <span className="shrink-0 text-cell font-medium text-ink">{e.name}</span>
                    <span className="min-w-0 flex-1 truncate text-note text-ink-4">
                      {[e.department, e.title].filter(Boolean).join(" · ")}
                    </span>
                    {off ? (
                      <span className="shrink-0 text-note text-ink-5">선택됨</span>
                    ) : (
                      <span className="shrink-0 truncate font-mono text-note text-ink-5">
                        {e.email}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

export { employeeLabel };
