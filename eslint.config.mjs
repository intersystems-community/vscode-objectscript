import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  {
    ignores: ["**/vscode.d.ts", "**/vscode.proposed.d.ts"],
  },
  js.configs.recommended,
  ...typescriptEslint.configs["flat/recommended"],
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 2018,
      sourceType: "module",

      parserOptions: {
        project: "./tsconfig.json",
      },
    },

    rules: {
      "@typescript-eslint/no-explicit-any": 0,
      "@typescript-eslint/explicit-function-return-type": 0,
      "@typescript-eslint/no-unused-vars": 0,
      "@typescript-eslint/no-require-imports": 0,
      "@typescript-eslint/no-unused-expressions": 0,
    },
  },
];
