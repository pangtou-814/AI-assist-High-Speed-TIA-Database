import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";

const expected = [
  ["data/TIA_one_stage/tia_database_valid.csv", 8475, "baff843d4d099e7739dfc077da790ebb7d98d58e796fdfe8fecfbac0c3f13972"],
  ["data/TIA_three_stage/final_dataset_all_valid.csv", 19652, "7d9166a84bad9438d277e90971f3c71d8f500c293784316606b11eb4eb6a71d9"],
  ["data/TIA_three_stage/final_dataset_core_15360.csv", 15360, "aeb4fbf6d040f7d68db4b45bde0f5ff11d2a57bb5c455fc3d61e5fdc48de12d1"],
  ["data/TIA_one_stage/query.csv", 8475, "fa7dba4af414762181d896a18523cda415e377257974eefb36c434d6920e8cc2"],
  ["data/TIA_three_stage/query.csv", 19652, "55dfa3dbedc4bdb4f513ff538cc14dc2b1bdac2ca8540f43e965f4d64baaf673"],
];

for (const [file, expectedRows, expectedHash] of expected) {
  const bytes = await readFile(file);
  const rows = bytes.toString("utf8").split(/\r?\n/).filter(Boolean).length - 1;
  if (rows !== expectedRows) throw new Error(`${file}: expected ${expectedRows} rows, got ${rows}`);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (expectedHash && hash !== expectedHash) throw new Error(`${file}: SHA-256 mismatch`);
  console.log(`${file}: ${rows} rows; sha256=${hash}`);
}

for (const file of ["index.html", "assets/styles.css", "assets/app.js"]) {
  await createReadStream(file).close();
}
