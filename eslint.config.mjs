import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Reuse the exact jsx-a11y plugin instance registered by eslint-config-next so
// our custom a11y rule (below) shares its namespace without redefining it.
const jsxA11yPlugin = nextCoreWebVitals.find((c) => c.plugins?.["jsx-a11y"])
  ?.plugins["jsx-a11y"];

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".next-playwright/**",
      ".open-next/**",
      ".aiox/**",
      ".aiox-core/**",
      ".claude/**",
      ".codex/**",
      ".cursor/**",
      ".gemini/**",
      "legacy/**",
      "node_modules/**",
      "playwright-report/**",
      "storybook-static/**",
      "test-results/**",
      "supabase/functions/**",
      "next-env.d.ts",
      // Artefatos de referência do redesign Trust Keith (Epic 14) — preservados apenas como documentação
      "public/_ds/**",
      "public/support.js",
      "docs/design/redesign/reference/canvases/**",
      "docs/design-system/trust-keith/ds-package/**",
      // Bundle gerado pela ferramenta de design system (@ds-bundle) — não é código de app, não deve ser editado manualmente
      "docs/design-system/_ds_bundle.js"
    ]
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ["coverage/**", "dist/**", "**/dist/**"]
  },
  {
    plugins: { "jsx-a11y": jsxA11yPlugin },
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-img-element": "off",
      // A11y regression guard (D-2.3): every interactive control must expose an
      // accessible name (visible text, aria-label, or aria-labelledby).
      "jsx-a11y/control-has-associated-label": "error"
    }
  },
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/__tests__/**/*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      // Test fixtures may render bare controls without labels.
      "jsx-a11y/control-has-associated-label": "off"
    }
  }
];

export default eslintConfig;
