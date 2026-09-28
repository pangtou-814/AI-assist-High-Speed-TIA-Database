import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";

const jobs = [
  {
    source: "data/TIA_one_stage/tia_database_valid.csv",
    output: "data/TIA_one_stage/query.csv",
    columns: ["sample_id", "phase", "family", "status", "VDD", "WN_nm", "WP_nm", "Finger", "Multiplier", "RF_length_um", "L1_pH", "L2_pH", "DC_OP_V", "dc_error_mV", "Gain_CL", "Gain_OL", "BW_CL", "BW_OL", "Power", "GDV", "Noise_rms", "Phase_Margin", "run_timestamp"],
  },
  {
    source: "data/TIA_three_stage/final_dataset_all_valid.csv",
    output: "data/TIA_three_stage/query.csv",
    columns: ["design_id", "pool", "subpool", "p7_core", "split", "VDD", "Cload_fF", "Cpd_fF", "Cpad_fF", "LBW_pH", "WN_nm", "WP_nm", "Finger1", "Multiplier1", "Finger2", "Multiplier2", "Finger3", "Multiplier3", "Finger4", "Multiplier4", "Finger5", "Multiplier5", "RF_len_um", "RF_ohm", "L1_pH", "L2_pH", "L3_pH", "L4_pH", "DC_OP_V", "dc_error_mV", "Gain_CL", "Gain_OL", "BW_CL_Hz", "BW_OL_Hz", "Power_W", "GDV_s", "Noise_rms_A", "Phase_Margin_deg", "BW_CL_censored_high", "BW_OL_censored_high", "status", "completed_at"],
  },
];

function parseLine(line) {
  const cells = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { cells.push(value); value = ""; }
    else value += char;
  }
  cells.push(value);
  return cells;
}

function csv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

for (const job of jobs) {
  await mkdir(dirname(job.output), { recursive: true });
  const reader = createInterface({ input: createReadStream(job.source, { encoding: "utf8" }), crlfDelay: Infinity });
  const writer = createWriteStream(job.output, { encoding: "utf8" });
  let indices, count = 0;
  for await (const line of reader) {
    if (!indices) {
      const headers = parseLine(line.replace(/^\ufeff/, ""));
      indices = job.columns.map((column) => {
        const index = headers.indexOf(column);
        if (index < 0) throw new Error(`${job.source}: missing ${column}`);
        return index;
      });
      writer.write(job.columns.join(",") + "\n");
      continue;
    }
    const cells = parseLine(line);
    writer.write(indices.map((index) => csv(cells[index])).join(",") + "\n");
    count += 1;
  }
  await new Promise((resolve, reject) => { writer.end(resolve); writer.on("error", reject); });
  console.log(`${job.output}: ${count} rows`);
}
