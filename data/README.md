# Dataset inventory

| 数据 | 行数 | 用途 |
|---|---:|---|
| `TIA_one_stage/tia_database_valid.csv` | 8,475 | 单级有效样本 |
| `TIA_three_stage/final_dataset_all_valid.csv` | 19,652 | 三级全部有效样本 |
| `TIA_three_stage/final_dataset_core_15360.csv` | 15,360 | 三级均衡训练/验证/测试子集 |

源数据直接复制自 `TIA_database/data/TIA_one_stage` 与 `TIA_database/data/TIA_three_stage` 的最终表。没有复制原始 Spectre 波形、日志、截图和中间批次。

单级筛选规则：`status == OK` 且 `abs(dc_error_mV) <= 10`。最终表无 canonical/sample ID 重复，九项指标为有限值。

三级 Core 使用源表内 `p7_core` 与 `split` 标记。带宽上限截断保留在 `*_censored_high` 字段。
