import eslint from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Relax rules that conflict with the project's style
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "preserve-caught-error": "off",

      // Catch real issues
      "no-constant-condition": "error",
      "no-debugger": "error",
      "no-duplicate-case": "error",
      "no-fallthrough": "error",
      "prefer-const": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      // Non-null assertions are fine in tests (values are asserted by expect())
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    ignores: [
      "node_modules/",
      "dist/",
      "samples/",
      "scripts/",
      "bin/",
      "eslint.config.js",
    ],
  },
)
