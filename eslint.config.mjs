import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", ".xyz-harness/**", ".bare/**"],
  },

  // Standard strict config
  eslint.configs.recommended,
  ...tseslint.configs.strict,

  // taste-lint base rules (inline for portability)
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
