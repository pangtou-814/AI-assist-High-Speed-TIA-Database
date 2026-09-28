"use strict";

const DATASETS = {
  one: {
    label: "单级有效数据 · 8,475 条",
    query: "./data/TIA_one_stage/query.csv",
    source: "./data/TIA_one_stage/tia_database_valid.csv",
    id: "sample_id",
    fields: { bw: "BW_CL", power: "Power", noise: "Noise_rms", pm: "Phase_Margin", rf: "RF_length_um" },
  },
  three: {
    label: "三级有效数据 · 19,652 条（含 Core 15,360 条）",
    query: "./data/TIA_three_stage/query.csv",
    source: "./data/TIA_three_stage/final_dataset_all_valid.csv",
    id: "design_id",
    fields: { bw: "BW_CL_Hz", power: "Power_W", noise: "Noise_rms_A", pm: "Phase_Margin_deg", rf: "RF_len_um" },
  },
};

const state = { model: "one", rows: [], filtered: [], page: 1, pageSize: 50, request: 0 };
const dom = Object.fromEntries([
  "filters", "text-query", "vdd", "cload", "cpd", "gain-min", "bw-min", "power-max", "noise-max", "pm-min",
  "sort-by", "core-only", "reset", "dataset-note", "noise-label", "match-count", "load-status", "download-source",
  "table-head", "table-body", "page-info", "prev-page", "next-page", "error-state", "record-dialog",
  "dialog-title", "dialog-content", "dialog-close",
].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift();
  return rows.filter((cells) => cells.length === headers.length && cells.some(Boolean)).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]]))
  );
}

const number = (value) => value === "" || value == null ? NaN : Number(value);
const text = (value) => value == null || value === "" ? "—" : String(value);
const format = (value, digits = 3) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits }) : "—";
const bool = (value) => String(value).toLowerCase() === "true";

function normalized(row) {
  const config = DATASETS[state.model];
  return {
    raw: row,
    id: row[config.id],
    vdd: number(row.VDD),
    cload: number(row.Cload_fF),
    cpd: number(row.Cpd_fF),
    gain: number(row.Gain_CL),
    bw: number(row[config.fields.bw]),
    power: number(row[config.fields.power]),
    noise: number(row[config.fields.noise]),
    pm: number(row[config.fields.pm]),
    core: bool(row.p7_core),
  };
}

function uniqueValues(field) {
  return [...new Set(state.rows.map((row) => row.raw[field]).filter((value) => value !== "" && value != null))]
    .sort((a, b) => number(a) - number(b));
}

function populateSelect(select, values, unit = "") {
  select.replaceChildren(new Option("全部", ""), ...values.map((value) => new Option(`${format(value)}${unit}`, value)));
}

function readLimit(input, multiplier = 1) {
  if (!input.value.trim()) return null;
  const value = Number(input.value) * multiplier;
  return Number.isFinite(value) ? value : null;
}

function applyFilters() {
  const query = dom.text_query.value.trim().toLowerCase();
  const vdd = dom.vdd.value;
  const cload = dom.cload.value;
  const cpd = dom.cpd.value;
  const gainMin = readLimit(dom.gain_min);
  const bwMin = readLimit(dom.bw_min, 1e9);
  const powerMax = readLimit(dom.power_max, 1e-3);
  const noiseMax = readLimit(dom.noise_max, 1e-12);
  const pmMin = readLimit(dom.pm_min);

  state.filtered = state.rows.filter((row) => {
    if (query && !row.id.toLowerCase().includes(query)) return false;
    if (vdd && row.raw.VDD !== vdd) return false;
    if (state.model === "three" && cload && row.raw.Cload_fF !== cload) return false;
    if (state.model === "three" && cpd && row.raw.Cpd_fF !== cpd) return false;
    if (state.model === "three" && dom.core_only.checked && !row.core) return false;
    if (gainMin !== null && row.gain < gainMin) return false;
    if (bwMin !== null && row.bw < bwMin) return false;
    if (powerMax !== null && row.power > powerMax) return false;
    if (noiseMax !== null && row.noise > noiseMax) return false;
    if (pmMin !== null && row.pm < pmMin) return false;
    return true;
  });

  const [field, direction] = dom.sort_by.value.split("-");
  const key = { gain: "gain", bw: "bw", power: "power", noise: "noise", pm: "pm", vdd: "vdd" }[field];
  state.filtered.sort((left, right) => (left[key] - right[key]) * (direction === "asc" ? 1 : -1));
  state.page = 1;
  renderTable();
}

function cell(content, className = "") {
  const element = document.createElement("td");
  element.textContent = content;
  if (className) element.className = className;
  return element;
}

function columns() {
  return state.model === "one" ? [
    ["样本 ID", (row) => row.id, "id-cell"],
    ["VDD", (row) => format(row.vdd, 1)],
    ["WN / WP", (row) => `${text(row.raw.WN_nm)} / ${text(row.raw.WP_nm)} nm`],
    ["Finger × Mult.", (row) => `${text(row.raw.Finger)} × ${text(row.raw.Multiplier)}`],
    ["RF", (row) => `${format(row.raw.RF_length_um, 2)} µm`],
    ["L1 / L2", (row) => `${text(row.raw.L1_pH)} / ${text(row.raw.L2_pH)} pH`],
    ["Gain CL", (row) => `${format(row.gain)} dBΩ`, "metric-good"],
    ["BW CL", (row) => `${format(row.bw / 1e9)} GHz`, "metric-good"],
    ["Power", (row) => `${format(row.power * 1e3)} mW`],
    ["Noise", (row) => `${format(row.noise * 1e12)} pA/√Hz`],
    ["PM", (row) => `${format(row.pm)}°`],
  ] : [
    ["设计 ID", (row) => row.id, "id-cell"],
    ["VDD", (row) => format(row.vdd, 1)],
    ["Cload / Cpd", (row) => `${text(row.raw.Cload_fF)} / ${text(row.raw.Cpd_fF)} fF`],
    ["WN / WP", (row) => `${text(row.raw.WN_nm)} / ${text(row.raw.WP_nm)} nm`],
    ["五组 F×M", (row) => [1, 2, 3, 4, 5].map((index) => `${row.raw[`Finger${index}`]}×${row.raw[`Multiplier${index}`]}`).join(" / ")],
    ["RF", (row) => `${format(row.raw.RF_len_um, 2)} µm`],
    ["L1–L4", (row) => [1, 2, 3, 4].map((index) => row.raw[`L${index}_pH`]).join(" / ") + " pH"],
    ["Gain CL", (row) => `${format(row.gain)} dBΩ`, "metric-good"],
    ["BW CL", (row) => `${bool(row.raw.BW_CL_censored_high) ? "≥ " : ""}${format(row.bw / 1e9)} GHz`, "metric-good"],
    ["Power", (row) => `${format(row.power * 1e3)} mW`],
    ["Noise", (row) => `${format(row.noise * 1e12)} pA`],
    ["PM", (row) => `${format(row.pm)}°`],
    ["集合", (row) => row.core ? `Core · ${text(row.raw.split)}` : "扩展"],
  ];
}

function renderTable() {
  const schema = columns();
  dom.table_head.replaceChildren(...schema.map(([label]) => {
    const th = document.createElement("th"); th.textContent = label; return th;
  }), (() => { const th = document.createElement("th"); th.textContent = ""; return th; })());
  dom.match_count.textContent = state.filtered.length.toLocaleString("zh-CN");
  const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * state.pageSize;
  const visible = state.filtered.slice(start, start + state.pageSize);

  if (!visible.length) {
    const tr = document.createElement("tr");
    const td = cell("没有符合当前条件的数据", "empty-cell");
    td.colSpan = schema.length + 1; tr.append(td); dom.table_body.replaceChildren(tr);
  } else {
    dom.table_body.replaceChildren(...visible.map((row) => {
      const tr = document.createElement("tr");
      tr.append(...schema.map(([, render, className]) => cell(render(row), className)));
      const action = cell("");
      const button = document.createElement("button");
      button.type = "button"; button.className = "detail-trigger"; button.textContent = "详情";
      button.addEventListener("click", () => showDetails(row));
      action.append(button); tr.append(action); return tr;
    }));
  }
  dom.page_info.textContent = `${state.page} / ${pages} 页 · 每页 ${state.pageSize} 条`;
  dom.prev_page.disabled = state.page <= 1;
  dom.next_page.disabled = state.page >= pages;
}

function showDetails(row) {
  dom.dialog_title.textContent = row.id;
  dom.dialog_content.replaceChildren(...Object.entries(row.raw).map(([name, value]) => {
    const field = document.createElement("div");
    const label = document.createElement("span"); label.textContent = name;
    const data = document.createElement("strong"); data.textContent = text(value);
    field.append(label, data); return field;
  }));
  dom.record_dialog.showModal();
}

async function loadDataset(model) {
  state.model = model;
  state.rows = []; state.filtered = []; state.page = 1;
  const request = ++state.request;
  const config = DATASETS[model];
  dom.dataset_note.textContent = config.label;
  dom.noise_label.textContent = model === "one" ? "最大噪声 (pA/√Hz)" : "最大噪声 (pA)";
  dom.download_source.href = config.source;
  dom.load_status.hidden = false;
  dom.load_status.className = "status loading";
  dom.load_status.textContent = "正在读取数据库";
  dom.error_state.hidden = true;
  document.querySelectorAll(".three-only").forEach((element) => { element.hidden = model !== "three"; });
  renderTable();
  try {
    const response = await fetch(config.query);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = parseCsv(await response.text());
    if (request !== state.request) return;
    state.rows = parsed.map(normalized);
    populateSelect(dom.vdd, uniqueValues("VDD"), " V");
    if (model === "three") {
      populateSelect(dom.cload, uniqueValues("Cload_fF"), " fF");
      populateSelect(dom.cpd, uniqueValues("Cpd_fF"), " fF");
    }
    dom.load_status.className = "status";
    dom.load_status.textContent = "数据已就绪";
    applyFilters();
  } catch (error) {
    console.error(error);
    if (request !== state.request) return;
    dom.load_status.hidden = true;
    dom.error_state.hidden = false;
  }
}

let filterTimer;
dom.filters.addEventListener("input", () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(applyFilters, 120);
});
dom.filters.addEventListener("change", applyFilters);
document.querySelectorAll('input[name="model"]').forEach((radio) => radio.addEventListener("change", () => loadDataset(radio.value)));
dom.reset.addEventListener("click", () => {
  dom.filters.reset();
  if (state.model === "three") dom.core_only.checked = true;
  applyFilters();
});
dom.prev_page.addEventListener("click", () => { state.page -= 1; renderTable(); document.querySelector(".results-panel").scrollIntoView({ behavior: "smooth" }); });
dom.next_page.addEventListener("click", () => { state.page += 1; renderTable(); document.querySelector(".results-panel").scrollIntoView({ behavior: "smooth" }); });
dom.dialog_close.addEventListener("click", () => dom.record_dialog.close());
dom.record_dialog.addEventListener("click", (event) => { if (event.target === dom.record_dialog) dom.record_dialog.close(); });

loadDataset("one");
