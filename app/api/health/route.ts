/**
 * 헬스체크.
 *
 * 플랫폼(Render, 이후 ECS의 ALB)이 컨테이너 생존 여부를 확인하는 엔드포인트다.
 * 일부러 DB를 건드리지 않는다 — Supabase가 잠시 불안정할 때 헬스체크가 실패해
 * 멀쩡한 컨테이너가 교체되는 일을 막기 위함이다.
 * 데이터 소스 상태는 응답 본문으로만 알린다.
 */
import { getDataSource } from "@/lib/repository";
import { getStorageKind } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      status: "ok",
      dataSource: getDataSource(),
      storage: getStorageKind(),
      uptimeSeconds: Math.round(process.uptime()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
