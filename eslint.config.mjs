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
  ]),
  {
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/#[0-9a-fA-F]{3,6}/]",
          message: "Avoid using hardcoded hex colors in className. Use Tailwind tokens instead."
        },
        {
          selector: "JSXAttribute[name.name='className'] TemplateLiteral Element[value.raw=/#[0-9a-fA-F]{3,6}/]",
          message: "Avoid using hardcoded hex colors in className. Use Tailwind tokens instead."
        }
      ]
    }
  }
]);

export default eslintConfig;
