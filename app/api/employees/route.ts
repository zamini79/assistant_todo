/**
 * 사원 명부 전체 목록.
 *
 * 검색은 화면에서 한다 — "한 글자 칠 때마다 바로" 보여야 하는데
 * 매 타건마다 서버를 왕복하면 지연이 그대로 드러난다.
 * 1천여 명 규모라 한 번 받아 두고 로컬에서 거르는 편이 빠르고 단순하다.
 *
 * 모달을 처음 열 때만 부른다. 모든 화면에 명부를 실어 보내면
 * 첨부·표 같은 무관한 페이지까지 무거워진다.
 */
import { getTodoRepository } from "@/lib/repository";

export async function GET() {
  try {
    const employees = await getTodoRepository().listEmployees();
    return Response.json(
      { employees },
      {
        headers: {
          // 사내 인명 정보라 중간 캐시에 남기지 않는다.
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("사원 명부 조회 실패", error);
    return Response.json({ employees: [], error: "명부를 불러오지 못했습니다." }, { status: 502 });
  }
}
