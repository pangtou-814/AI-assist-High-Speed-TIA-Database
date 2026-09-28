# AI-assisted High-Speed TIA Predictor

基于 Cadence Spectre 仿真数据的高速 TIA 反向设计平台。用户输入目标电路指标，页面返回最接近目标的单级或三级 TIA 参数候选。

## 已发布数据

- `data/TIA_one_stage/tia_database_valid.csv`：单级 TIA 有效数据，8,475 条。
- `data/TIA_three_stage/final_dataset_all_valid.csv`：三级 TIA 全部有效数据，19,652 条。
- `data/TIA_three_stage/final_dataset_core_15360.csv`：三级 TIA 均衡 Core 子集，15,360 条。
- 两个 `query.csv`：页面使用的轻量字段投影，可由源 CSV 重建，不替代源数据。

RF 字段是反馈电阻几何长度，范围 2–8 µm、步长 0.05 µm，不是欧姆阻值。页面把原始 SI 单位换算为 GHz、mW、pA 显示。

## 在线预测平台

打开 <https://pangtou-814.github.io/AI-assist-High-Speed-TIA-Database/>：

1. 选择单级或三级 TIA。
2. 固定 VDD；三级可固定 Cload、Cpd。
3. 对增益、带宽、功耗、噪声、相位裕度等指标设置下限、上限或目标值及权重。
4. 点击“开始预测”，获取 Top-K 电路参数、满足状态、综合偏差和全部指标详情。
5. 可复制参数，并导出 CSV 或 JSON。

页面在浏览器内执行加权目标约束检索。指标按数据库分布尺度归一化，带宽、功耗、群延迟和噪声在对数空间比较；优先返回全部满足硬条件且最接近目标边界的已仿真设计。三级默认使用 15,360 条 Core 数据，也可扩展到全部 19,652 条有效样本。无需后端服务器，输入不会写入仓库。

## 数据边界

仓库保存用于反向预测的最终表，不保存约 2.8 GB 的 Spectre 原始波形、运行目录、日志和界面截图。原始仿真证据留在数据生成主机。当前在线版只推荐已有 Spectre 有效样本，不生成未经验证的新参数组合；候选仍应按设计流程复核。三级 `BW_*_censored_high=true` 表示测量超过 100 GHz 上限，不应当作精确值。

## 本地检查

```powershell
node scripts/build-query-data.mjs
node scripts/check-data.mjs
node --check assets/app.js
```

用任意静态 HTTP 服务打开仓库根目录即可预览。直接双击 `index.html` 会因浏览器禁止 `file://` 读取 CSV 而失败。
