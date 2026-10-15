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
    ".superpowers/**",
    // 홈페이지 구축 보조 자료(RED 보고서 생성기·순서도 등) — 앱 코드가 아니다
    "다빈치스쿨 홈페이지 구축/**",
  ]),
]);

export default eslintConfig;
