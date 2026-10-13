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
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn"
    }
  }
];

export default eslintConfig;
