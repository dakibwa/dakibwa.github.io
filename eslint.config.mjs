import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", ".data/**"],
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  }
];

export default config;
