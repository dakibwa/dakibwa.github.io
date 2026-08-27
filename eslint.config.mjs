import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  // A lone `ignores` entry is a global ignore in flat config. Combined with
  // other keys it would only scope that one block, which is why the Worker's
  // generated .wrangler bundles kept being linted.
  // tmp/ is gitignored scratch — QA scripts, prototype builds, screenshots. It
  // never ships, and a stray built bundle in there was failing the lint gate on
  // rules that have nothing to do with this codebase.
  { ignores: [".next/**", "node_modules/**", ".data/**", "out/**", "tmp/**", "**/.wrangler/**"] },
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  }
];

export default config;
