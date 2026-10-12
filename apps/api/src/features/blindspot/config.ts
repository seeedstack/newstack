import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// config/product/blindspot.yaml (PRODUCT §4.4) is 5 flat numeric keys with trailing comments --
// simple enough that a YAML dependency isn't worth adding for it.
export interface BlindspotParams {
  nMin: number;
  materiality: number;
  z: number;
  baselineWindowDays: number;
  poolCutoverAppearances: number;
}

const CONFIG_PATH = fileURLToPath(new URL("../../../../../config/product/blindspot.yaml", import.meta.url));

export function loadBlindspotConfig(path: string = CONFIG_PATH): BlindspotParams {
  const text = readFileSync(path, "utf-8");
  const values: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const match = /^(\w+):\s*([0-9.]+)/.exec(line);
    if (match) values[match[1]] = Number(match[2]);
  }
  for (const key of ["n_min", "materiality", "z", "baseline_window_days", "pool_cutover_appearances"]) {
    if (!(key in values)) throw new Error(`blindspot.yaml missing required key: ${key}`);
  }
  return {
    nMin: values.n_min,
    materiality: values.materiality,
    z: values.z,
    baselineWindowDays: values.baseline_window_days,
    poolCutoverAppearances: values.pool_cutover_appearances,
  };
}
