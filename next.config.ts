import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * 실행에 필요한 파일만 추린 독립 실행 번들을 만든다.
   * Render 무료 플랜은 램이 512MB뿐이라 node_modules 전체를 안고 도는 `next start`보다
   * 여유가 있고, 최종 목표인 AWS ECS 컨테이너에도 같은 산출물을 그대로 쓴다.
   */
  output: "standalone",

  experimental: {
    /*
     * 서버 액션 본문 한도. 기본값 1MB로는 첨부 파일이 통째로 반려된다.
     *
     * 진행 이력 첨부는 서버 액션으로 올라오므로 도메인의 상한
     * (한 파일 10MB · 합계 20MB)보다 여유를 둔다. 폼 필드까지 같은 본문에 실린다.
     * Render 무료 플랜이 512MB 램이라 무제한으로 열지는 않는다 —
     * 본문 전체가 메모리에 올라오기 때문.
     */
    serverActions: { bodySizeLimit: "24mb" },
  },
};

export default nextConfig;
