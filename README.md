# AI-assisted High-Speed TIA Database

Cadence Spectre 仿真生成的高速 TIA 数据库，以及纯静态的 GitHub Pages 查询页面。

## 已发布数据

- `data/TIA_one_stage/tia_database_valid.csv`：单级 TIA 有效数据，8,475 条。
- `data/TIA_three_stage/final_dataset_all_valid.csv`：三级 TIA 全部有效数据，19,652 条。
- `data/TIA_three_stage/final_dataset_core_15360.csv`：三级 TIA 均衡 Core 子集，15,360 条。
- 两个 `query.csv`：页面使用的轻量字段投影，可由源 CSV 重建，不替代源数据。

RF 字段是反馈电阻几何长度，范围 2–8 µm、步长 0.05 µm，不是欧姆阻值。页面把原始 SI 单位换算为 GHz、mW、pA 显示。

## 页面能力

页面在浏览器内完成筛选、排序、分页和样本详情查看。支持单级/三级切换、VDD、三级 Cload/Cpd、Core 范围，以及增益、带宽、功耗、噪声、相位裕度条件。无需数据库服务器，不会修改原始 CSV。

## 数据边界

仓库保存可查询的最终表，不保存约 2.8 GB 的 Spectre 原始波形、运行目录、日志和界面截图。原始仿真证据留在数据生成主机。三级 `BW_*_censored_high=true` 表示测量超过 100 GHz 上限，页面以 `≥` 显示，不应当作精确值。

## 本地检查

```powershell
node scripts/build-query-data.mjs
node scripts/check-data.mjs
node --check assets/app.js
```

用任意静态 HTTP 服务打开仓库根目录即可预览。直接双击 `index.html` 会因浏览器禁止 `file://` 读取 CSV 而失败。
