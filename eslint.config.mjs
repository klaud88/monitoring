import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"]
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // React Compiler rules added in eslint-config-next 16; existing effects
    // (localStorage reads, ?edit= deep links) trip them, so warn for now.
    // Scoped to the files the react-hooks plugin is registered for.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn"
    }
  },
  {
    // CommonJS by necessity (pm2 loads ecosystem.config.cjs with require).
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  }
];

export default eslintConfig;
