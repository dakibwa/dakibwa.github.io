import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  // A lone `ignores` entry is a global ignore in flat config. Combined with
  // other keys it would only scope that one block, which is why the Worker's
  // generated .wrangler bundles kept being linted.
  { ignores: [".next/**", "node_modules/**", ".data/**", "out/**", "**/.wrangler/**"] },
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  }
];

export default config;
