"use strict";

const METRICS = [
  { name: "Gain_CL", label: "闭环增益", unit: "dBΩ", factor: 1, operator: "min", value: 55, weight: 1, enabled: true, group: "primary" },
  { name: "BW_CL", label: "闭环带宽", unit: "GHz", factor: 1e9, operator: "min", value: 10, weight: 2, enabled: true, group: "primary", log: true },
  { name: "Power", label: "功耗", unit: "mW", factor: 1e-3, operator: "max", value: 10, weight: 1.5, enabled: true, group: "primary", log: true },
  { name: "Noise_rms", label: "输入噪声", unit: "pA/√Hz", factor: 1e-12, operator: "max", value: 10, weight: 1.5, enabled: true, group: "primary", log: true },
  { name: "Phase_Margin", label: "相位裕度", unit: "°", factor: 1, operator: "min", value: 70, weight: 1, enabled: true, group: "primary" },
  { name: "Gain_OL", label: "开环增益", unit: "dB", factor: 1, operator: "min", value: 17, weight: 1, enabled: false, group: "advanced" },
  { name: "BW_OL", label: "开环带宽", unit: "GHz", factor: 1e9, operator: "min", value: 10, weight: 1, enabled: false, group: "advanced", log: true },
  { name: "GDV", label: "群延迟变化", unit: "ps", factor: 1e-12, operator: "max", value: 20, weight: 1, enabled: false, group: "advanced", log: true },
  { name: "DC_OP_V", label: "直流工作点", unit: "V", factor: 1, operator: "target", value: 0.55, weight: 1, enabled: false, group: "advanced" },
];

const DATASETS = {
  one_stage: {
    label: "单级 TIA",
    path: "./data/TIA_one_stage/query.csv",
    id: "sample_id",
    count: 8475,
    metrics: { DC_OP_V: "DC_OP_V", Gain_CL: "Gain_CL", Gain_OL: "Gain_OL", BW_CL: "BW_CL", BW_OL: "BW_OL", Power: "Power", GDV: "GDV", Noise_rms: "Noise_rms", Phase_Margin: "Phase_Margin" },
    parameters: ["VDD", "WN_nm", "WP_nm", "Finger", "Multiplier", "RF_length_um", "L1_pH", "L2_pH"],
    core: (row) => row.phase !== "P05",
  },
  three_stage: {
    label: "三级 TIA",
    path: "./data/TIA_three_stage/query.csv",
    id: "design_id",
    count: 19652,
    metrics: { DC_OP_V: "DC_OP_V", Gain_CL: "Gain_CL", Gain_OL: "Gain_OL", BW_CL: "BW_CL_Hz", BW_OL: "BW_OL_Hz", Power: "Power_W", GDV: "GDV_s", Noise_rms: "Noise_rms_A", Phase_Margin: "Phase_Margin_deg" },
    parameters: ["VDD", "Cload_fF", "Cpd_fF", "Cpad_fF", "LBW_pH", "WN_nm", "WP_nm", "Finger1", "Multiplier1", "Finger2", "Multiplier2", "Finger3", "Multiplier3", "Finger4", "Multiplier4", "Finger5", "Multiplier5", "RF_len_um", "L1_pH", "L2_pH", "L3_pH", "L4_pH"],
    core: (row) => String(row.p7_core).toLowerCase() === "true",
  },
};

const TARGET_TOLERANCE = {
  DC_OP_V: (value) => Math.max(0.005, Math.abs(value) * 0.01),
  Gain_CL: () => 0.5,
  Gain_OL: () => 0.5,
  Phase_Margin: () => 1,
};

const state = { modelId: "one_stage", cache: new Map(), rows: [], scales: {}, result: null, request: 0 };
const metricByName = Object.fromEntries(METRICS.map((metric) => [metric.name, metric]));
const dom = Object.fromEntries([
  "model-status", "model-id", "vdd", "top-k", "search-mode", "cload", "cpd", "three-stage-environment",
  "metric-list", "advanced-metric-list", "parameter-note", "goal-form", "reset-button", "predict-button",
  "row-count", "model-type", "integrity", "results", "result-title", "result-context", "result-summary",
  "result-body", "pair-heading", "inductor-heading", "export-csv", "download-json", "candidate-dialog",
  "candidate-detail", "loading", "toast",
].map((id) => [id.replaceAll("-", "_"), document.getElementById(id)]));

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function parseCsv(text) {
  const table = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); table.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); table.push(row); }
  const headers = table.shift();
  return table.filter((cells) => cells.length === headers.length && cells.some(Boolean)).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]]))
  );
}

const number = (value) => value === "" || value == null ? NaN : Number(value);
const finite = (value) => Number.isFinite(Number(value));
const bool = (value) => String(value).toLowerCase() === "true";
const transform = (name, value) => metricByName[name].log ? Math.log10(value) : value;
const formatNumber = (value, digits = 3) => Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits });

function quantile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

function normalizeRows(rawRows, config) {
  return rawRows.map((raw) => {
    const metrics = {};
    for (const metric of METRICS) metrics[metric.name] = number(raw[config.metrics[metric.name]]);
    return { raw, id: raw[config.id], metrics };
  }).filter((row) => METRICS.every((metric) => Number.isFinite(row.metrics[metric.name]) && (!metric.log || row.metrics[metric.name] > 0)));
}

function calculateScales(rows) {
  const scales = {};
  for (const metric of METRICS) {
    const values = rows.map((row) => transform(metric.name, row.metrics[metric.name])).sort((left, right) => left - right);
    const spread = quantile(values, 0.75) - quantile(values, 0.25);
    scales[metric.name] = spread > 1e-12 ? spread : Math.max(Math.abs(values.at(-1) - values[0]), 1);
  }
  return scales;
}

function examplesFor(modelId) {
  return modelId === "three_stage"
    ? { BW_CL: 3, Power: 80, Noise_rms: 50 }
    : { BW_CL: 10, Power: 10, Noise_rms: 10 };
}

function displayMetric(metric) {
  return { ...metric, value: examplesFor(state.modelId)[metric.name] ?? metric.value,
    unit: metric.name === "Noise_rms" && state.modelId === "three_stage" ? "pA" : metric.unit };
}

function renderMetric(metric) {
  const row = makeElement("div", `metric-row${metric.enabled ? "" : " disabled"}`);
  row.dataset.metric = metric.name;
  const toggle = makeElement("input", "metric-toggle");
  toggle.type = "checkbox"; toggle.checked = metric.enabled; toggle.setAttribute("aria-label", `启用${metric.label}`);
  const name = makeElement("div", "metric-name");
  name.append(makeElement("strong", "", metric.label), makeElement("span", "", metric.name));
  const operator = makeElement("select", "metric-operator");
  for (const [value, label] of [["min", "不低于"], ["max", "不高于"], ["target", "目标值"]]) {
    const option = makeElement("option", "", label); option.value = value; option.selected = metric.operator === value; operator.append(option);
  }
  operator.disabled = !metric.enabled; operator.setAttribute("aria-label", `${metric.label}要求`);
  const valueField = makeElement("div", "value-field");
  const value = makeElement("input", "metric-value");
  value.type = "number"; value.step = metric.unit === "V" ? "0.001" : "any"; value.value = String(metric.value);
  value.disabled = !metric.enabled; value.setAttribute("aria-label", `${metric.label}数值`);
  valueField.append(value, makeElement("span", "", metric.unit));
  const weightWrap = makeElement("label", "weight-field");
  const weight = makeElement("input", "metric-weight");
  weight.type = "number"; weight.min = "0.1"; weight.max = "10"; weight.step = "0.1"; weight.value = String(metric.weight);
  weight.disabled = !metric.enabled; weight.setAttribute("aria-label", `${metric.label}权重`); weightWrap.append(weight);
  toggle.addEventListener("change", () => {
    row.classList.toggle("disabled", !toggle.checked);
    operator.disabled = value.disabled = weight.disabled = !toggle.checked;
  });
  row.append(toggle, name, operator, valueField, weightWrap);
  return row;
}

function renderMetricLists() {
  dom.metric_list.replaceChildren(...METRICS.filter((metric) => metric.group === "primary").map((metric) => renderMetric(displayMetric(metric))));
  dom.advanced_metric_list.replaceChildren(...METRICS.filter((metric) => metric.group === "advanced").map((metric) => renderMetric(displayMetric(metric))));
}

function showToast(message) {
  dom.toast.textContent = message; dom.toast.hidden = false;
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { dom.toast.hidden = true; }, 4500);
}

function setStatus(kind, message) {
  dom.model_status.className = `status-pill ${kind}`;
  dom.model_status.lastChild.textContent = message;
}

async function loadModel(modelId) {
  state.modelId = modelId; state.rows = []; state.scales = {}; state.result = null; dom.results.hidden = true;
  const request = ++state.request; const config = DATASETS[modelId];
  dom.predict_button.disabled = true; setStatus("pending", "正在载入预测数据");
  dom.row_count.textContent = "—"; dom.integrity.textContent = "载入中";
  try {
    let cached = state.cache.get(modelId);
    if (!cached) {
      const response = await fetch(config.path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = normalizeRows(parseCsv(await response.text()), config);
      if (rows.length !== config.count) throw new Error(`数据行数异常：${rows.length}`);
      cached = { rows, scales: calculateScales(rows) }; state.cache.set(modelId, cached);
    }
    if (request !== state.request) return;
    state.rows = cached.rows; state.scales = cached.scales;
    dom.row_count.textContent = modelId === "three_stage" ? "15,360 Core / 19,652" : state.rows.length.toLocaleString("zh-CN");
    dom.model_type.textContent = "加权目标约束检索"; dom.integrity.textContent = "数据已校验";
    dom.predict_button.disabled = false; setStatus("ready", `${config.label}预测器已就绪`);
  } catch (error) {
    console.error(error); if (request !== state.request) return;
    dom.integrity.textContent = "读取失败"; setStatus("error", "预测数据读取失败"); showToast("预测数据读取失败，请刷新页面");
  }
}

function buildGoal() {
  const targets = {};
  document.querySelectorAll(".metric-row").forEach((row) => {
    if (!row.querySelector(".metric-toggle").checked) return;
    const metric = metricByName[row.dataset.metric];
    const rawValue = row.querySelector(".metric-value").value.trim();
    const value = Number(rawValue); const weight = Number(row.querySelector(".metric-weight").value);
    if (!rawValue || !Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) throw new Error(`${metric.label}数值或权重无效`);
    if (metric.log && value <= 0) throw new Error(`${metric.label}必须大于 0`);
    targets[metric.name] = { operator: row.querySelector(".metric-operator").value, value: value * metric.factor, weight };
  });
  if (!Object.keys(targets).length) throw new Error("至少启用一个目标指标");
  return {
    model_id: state.modelId,
    fixed: {
      VDD: dom.vdd.value ? Number(dom.vdd.value) : null,
      Cload_fF: state.modelId === "three_stage" ? Number(dom.cload.value) : null,
      Cpd_fF: state.modelId === "three_stage" ? Number(dom.cpd.value) : null,
    },
    subset: dom.search_mode.value,
    top_k: Number(dom.top_k.value),
    targets,
  };
}

function targetTolerance(name, value) {
  return TARGET_TOLERANCE[name]?.(value) ?? Math.abs(value) * 0.05;
}

function scoreRow(row, goal) {
  let total = 0, totalWeight = 0, all = true;
  const satisfaction = {};
  for (const [name, spec] of Object.entries(goal.targets)) {
    const observed = row.metrics[name];
    const prediction = transform(name, observed); const target = transform(name, spec.value);
    let error = 0, passed = true;
    if (spec.operator === "min") { error = Math.abs(prediction - target) / state.scales[name]; passed = observed >= spec.value; }
    else if (spec.operator === "max") { error = Math.abs(prediction - target) / state.scales[name]; passed = observed <= spec.value; }
    else { error = Math.abs(prediction - target) / state.scales[name]; passed = Math.abs(observed - spec.value) <= targetTolerance(name, spec.value); }
    const huber = error <= 1 ? 0.5 * error * error : error - 0.5;
    total += spec.weight * huber; totalWeight += spec.weight; satisfaction[name] = passed; all &&= passed;
  }
  return { score: total / totalWeight, satisfaction, all_targets_satisfied: all };
}

function eligibleRows(goal) {
  const config = DATASETS[goal.model_id];
  return state.rows.filter((row) => {
    if (goal.subset === "core" && !config.core(row.raw)) return false;
    if (goal.fixed.VDD !== null && Math.abs(number(row.raw.VDD) - goal.fixed.VDD) > 1e-8) return false;
    if (goal.model_id === "three_stage" && number(row.raw.Cload_fF) !== goal.fixed.Cload_fF) return false;
    if (goal.model_id === "three_stage" && number(row.raw.Cpd_fF) !== goal.fixed.Cpd_fF) return false;
    return true;
  });
}

function runPrediction(goal = buildGoal()) {
  const eligible = eligibleRows(goal);
  if (!eligible.length) throw new Error("当前固定条件没有可用样本，请放宽 VDD 或环境条件");
  const candidates = eligible.map((row) => ({ row, ...scoreRow(row, goal) }))
    .sort((left, right) => Number(right.all_targets_satisfied) - Number(left.all_targets_satisfied) || left.score - right.score)
    .slice(0, goal.top_k).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  state.result = { generated_at: new Date().toISOString(), model_id: goal.model_id, goal, eligible: eligible.length, candidates };
  renderResult(); return state.result;
}

function formatMetricValue(name, value) {
  if (["BW_CL", "BW_OL"].includes(name)) return `${formatNumber(value / 1e9)} GHz`;
  if (name === "Power") return `${formatNumber(value * 1e3)} mW`;
  if (name === "GDV") return `${formatNumber(value * 1e12)} ps`;
  if (name === "Noise_rms") return `${formatNumber(value * 1e12)} ${state.modelId === "three_stage" ? "pA" : "pA/√Hz"}`;
  if (name === "Phase_Margin") return `${formatNumber(value)}°`;
  if (name === "DC_OP_V") return `${formatNumber(value, 5)} V`;
  if (name === "Gain_CL") return `${formatNumber(value, 5)} dBΩ`;
  if (name === "Gain_OL") return `${formatNumber(value, 5)} dB`;
  return formatNumber(value, 5);
}

function parameterObject(candidate) {
  const config = DATASETS[state.result.model_id];
  return Object.fromEntries(config.parameters.map((name) => [name, finite(candidate.row.raw[name]) ? number(candidate.row.raw[name]) : candidate.row.raw[name]]));
}

function metricSummary(metrics) {
  return [`增益 ${formatNumber(metrics.Gain_CL)} dBΩ`, `带宽 ${formatNumber(metrics.BW_CL / 1e9)} GHz`, `功耗 ${formatNumber(metrics.Power * 1e3)} mW`].join(" · ");
}

function renderSummary() {
  const result = state.result;
  const items = [
    ["推荐候选", result.candidates.length],
    ["全部满足目标", result.candidates.filter((item) => item.all_targets_satisfied).length],
    ["可检索样本", result.eligible.toLocaleString("zh-CN")],
    ["最佳综合偏差", formatNumber(result.candidates[0]?.score ?? 0, 4)],
  ];
  dom.result_summary.replaceChildren(...items.map(([label, value]) => {
    const card = makeElement("div", "summary-item"); card.append(makeElement("span", "", label), makeElement("strong", "", String(value))); return card;
  }));
}

function renderTable() {
  const three = state.result.model_id === "three_stage";
  dom.pair_heading.textContent = three ? "五组 Finger × Mult." : "Finger × Mult.";
  dom.inductor_heading.textContent = three ? "L1 / L2 / L3 / L4" : "L1 / L2";
  dom.result_body.replaceChildren(...state.result.candidates.map((candidate) => {
    const parameters = parameterObject(candidate); const row = document.createElement("tr");
    const cells = [
      makeElement("td", "", String(candidate.rank)), makeElement("td"), makeElement("td", "", formatNumber(candidate.score, 4)),
      makeElement("td", "", formatNumber(parameters.VDD, 1)), makeElement("td", "", `${parameters.WN_nm} / ${parameters.WP_nm} nm`),
      makeElement("td", "", three ? [1,2,3,4,5].map((i) => `${parameters[`Finger${i}`]}×${parameters[`Multiplier${i}`]}`).join(" / ") : `${parameters.Finger} × ${parameters.Multiplier}`),
      makeElement("td", "", `${formatNumber(parameters.RF_len_um ?? parameters.RF_length_um, 2)} µm`),
      makeElement("td", "", `${(three ? [1,2,3,4] : [1,2]).map((i) => parameters[`L${i}_pH`]).join(" / ")} pH`),
      makeElement("td", "metric-compact", metricSummary(candidate.row.metrics)), makeElement("td"),
    ];
    cells[1].append(makeElement("span", `badge ${candidate.all_targets_satisfied ? "pass" : "fail"}`, candidate.all_targets_satisfied ? "满足" : "近似"));
    const detail = makeElement("button", "detail-button", "详情"); detail.type = "button"; detail.addEventListener("click", () => showCandidate(candidate)); cells[9].append(detail);
    row.append(...cells); return row;
  }));
}

function renderResult() {
  const result = state.result; const config = DATASETS[result.model_id]; const fixed = result.goal.fixed;
  dom.result_title.textContent = `${config.label} · 预测结果`;
  dom.result_context.textContent = result.model_id === "three_stage"
    ? `从 ${result.eligible.toLocaleString("zh-CN")} 条 Cload=${fixed.Cload_fF} fF、Cpd=${fixed.Cpd_fF} fF 的有效仿真中反向匹配。结果是已仿真设计；目标值采用 5% 默认容差。`
    : `从 ${result.eligible.toLocaleString("zh-CN")} 条有效仿真中反向匹配。结果是已仿真设计；目标值采用 5% 默认容差。`;
  renderSummary(); renderTable(); dom.results.hidden = false; dom.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showCandidate(candidate) {
  const parameters = parameterObject(candidate); const detail = dom.candidate_detail;
  const title = makeElement("h2", "", `候选 ${candidate.rank} · ${candidate.row.id}`);
  const note = makeElement("p", "dialog-note", "参数与指标来自已完成 Spectre 仿真，可直接作为下一轮电路起点。");
  const grid = makeElement("div", "detail-grid");
  const fields = [...Object.entries(parameters), ...Object.entries(candidate.row.metrics).map(([name, value]) => [name, formatMetricValue(name, value)])];
  for (const [name, value] of fields) {
    const field = makeElement("div", "detail-field"); field.append(makeElement("span", "", name), makeElement("strong", "", String(value))); grid.append(field);
  }
  const verdicts = makeElement("p", "metric-verdicts", Object.entries(candidate.satisfaction).map(([name, passed]) => `${metricByName[name].label}：${passed ? "满足" : "未满足"}`).join("；"));
  const copy = makeElement("button", "primary-button copy-button", "复制电路参数"); copy.type = "button";
  copy.addEventListener("click", async () => { await navigator.clipboard.writeText(Object.entries(parameters).map(([name, value]) => `${name}=${value}`).join(", ")); showToast("参数已复制"); });
  detail.replaceChildren(title, note, grid, verdicts, copy); dom.candidate_dialog.showModal();
}

function downloadBlob(filename, content, type) {
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = filename;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

function exportCsv() {
  if (!state.result?.candidates.length) return;
  const records = state.result.candidates.map((candidate) => ({ model_id: state.result.model_id, rank: candidate.rank, sample_id: candidate.row.id,
    all_targets_satisfied: candidate.all_targets_satisfied, score: candidate.score, ...parameterObject(candidate), ...candidate.row.metrics }));
  const headers = Object.keys(records[0]); const lines = [headers, ...records.map((record) => headers.map((header) => record[header]))]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  downloadBlob(`tia_${state.result.model_id}_prediction.csv`, `\ufeff${lines}`, "text/csv;charset=utf-8");
}

function exportJson() {
  if (!state.result) return;
  const payload = { ...state.result, candidates: state.result.candidates.map((candidate) => ({ rank: candidate.rank, sample_id: candidate.row.id,
    all_targets_satisfied: candidate.all_targets_satisfied, score: candidate.score, target_satisfaction: candidate.satisfaction,
    parameters: parameterObject(candidate), metrics: candidate.row.metrics })) };
  downloadBlob(`tia_${state.result.model_id}_prediction.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function resetForm() {
  dom.vdd.value = "1.1"; dom.top_k.value = "10"; dom.search_mode.value = state.modelId === "three_stage" ? "core" : "all"; dom.cload.value = "30"; dom.cpd.value = "80";
  renderMetricLists(); dom.results.hidden = true; state.result = null;
}

dom.goal_form.addEventListener("submit", (event) => {
  event.preventDefault(); dom.loading.hidden = false;
  requestAnimationFrame(() => setTimeout(() => {
    try { runPrediction(); } catch (error) { showToast(error.message); } finally { dom.loading.hidden = true; }
  }, 20));
});
dom.reset_button.addEventListener("click", resetForm);
dom.model_id.addEventListener("change", () => {
  const three = dom.model_id.value === "three_stage"; dom.three_stage_environment.hidden = !three;
  state.modelId = dom.model_id.value;
  dom.parameter_note.textContent = three
    ? "RF：2–8 µm，步长 0.05 µm；L1–L4：0 或 50–300 pH，步长 10 pH。五组晶体管使用已验证架构。"
    : "RF：2–8 µm，步长 0.05 µm；L1–L2：0 或 90–300 pH，步长 10 pH。";
  resetForm(); void loadModel(dom.model_id.value);
});
dom.export_csv.addEventListener("click", exportCsv); dom.download_json.addEventListener("click", exportJson);
document.querySelector(".dialog-close").addEventListener("click", () => dom.candidate_dialog.close());
dom.candidate_dialog.addEventListener("click", (event) => { if (event.target === dom.candidate_dialog) dom.candidate_dialog.close(); });

renderMetricLists();
void loadModel("one_stage");
