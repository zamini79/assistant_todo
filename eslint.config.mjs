import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 디자인 레퍼런스 프로토타입 — 핸드오프 문서가 "이식 대상 아님"으로 명시한
    // 원본 파일이라 그대로 보존한다. 우리 코드가 아니므로 린트 대상에서 뺀다.
    "design_handoff_strategy_assistant_todo/**",
  ]),
]);

export default eslintConfig;
