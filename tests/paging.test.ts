/**
 * 나눠 읽기 — Supabase REST의 1000행 상한을 넘기는 목록.
 *
 * 상한에 걸리면 오류 없이 조용히 잘린다. 그래서 "끊겼다"를 무엇으로
 * 판정하는지가 이 함수의 전부다.
 */
import { describe, expect, it, vi } from "vitest";

import { readAllPages } from "@/lib/repository/supabase-todo-repository";

/** from..to 범위를 흉내 내는 가짜 서버. cap보다 많이는 주지 않는다. */
function fakeServer(total: number, cap = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const size = Math.min(to - from + 1, cap);
    return { data: rows.slice(from, from + size), error: null };
  };
  return { fetchPage, calls };
}

describe("readAllPages", () => {
  it("한 장에 담기면 한 번만 더 확인하고 끝낸다", async () => {
    const { fetchPage, calls } = fakeServer(12);
    const out = await readAllPages<{ id: number }>(fetchPage, "실패");
    expect(out).toHaveLength(12);
    // 12건(<1000)을 받은 뒤 빈 장을 한 번 확인한다.
    expect(calls).toHaveLength(2);
  });

  it("상한을 넘는 목록을 끝까지 읽는다", async () => {
    const { fetchPage } = fakeServer(1170);
    const out = await readAllPages<{ id: number }>(fetchPage, "실패");
    expect(out).toHaveLength(1170);
    expect(out.at(-1)).toEqual({ id: 1169 });
  });

  it("빠뜨리거나 겹치지 않는다", async () => {
    const { fetchPage } = fakeServer(2500);
    const out = await readAllPages<{ id: number }>(fetchPage, "실패");
    expect(out.map((r) => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
  });

  it("서버 상한이 요청보다 작아도 끝까지 읽는다", async () => {
    // 받은 만큼만 다음 시작점으로 삼기 때문에, 상한 설정이 바뀌어도 끊기지 않는다.
    const { fetchPage } = fakeServer(1170, 300);
    const out = await readAllPages<{ id: number }>(fetchPage, "실패");
    expect(out).toHaveLength(1170);
  });

  it("빈 목록", async () => {
    const { fetchPage } = fakeServer(0);
    expect(await readAllPages(fetchPage, "실패")).toEqual([]);
  });

  it("도중에 실패하면 부분 결과를 내놓지 않고 던진다", async () => {
    // 절반만 담긴 목록으로 집계하면 합계가 조용히 틀어진다.
    let n = 0;
    const fetchPage = async () => {
      n += 1;
      if (n === 1) return { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null };
      return { data: null, error: { message: "boom" } };
    };
    await expect(readAllPages(fetchPage, "명부를 불러오지 못했습니다.")).rejects.toThrow(
      "명부를 불러오지 못했습니다.",
    );
  });

  it("끝나지 않는 응답에도 멈춘다", async () => {
    // 항상 가득 찬 장을 주는 서버라면 폭주한다 — 상한에서 끊고 로그를 남긴다.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchPage = async () => ({
      data: Array.from({ length: 1000 }, (_, i) => ({ id: i })),
      error: null,
    });
    const out = await readAllPages(fetchPage, "실패");
    expect(out).toHaveLength(200 * 1000);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
