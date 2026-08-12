import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * 실행에 필요한 파일만 추린 독립 실행 번들을 만든다.
   * Render 무료 플랜은 램이 512MB뿐이라 node_modules 전체를 안고 도는 `next start`보다
   * 여유가 있고, 최종 목표인 AWS ECS 컨테이너에도 같은 산출물을 그대로 쓴다.
   */
  output: "standalone",
};

export default nextConfig;
