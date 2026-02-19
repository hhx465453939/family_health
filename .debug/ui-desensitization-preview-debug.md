# 脱敏预览 视觉升维记录

## 🎨 艺术指导
**Mood**: 冷静、工具化、效率优先  
**Metaphor**: 顶部指挥台 + 下方作业区

## 运行上下文与测试规则（首次确认后填写，后续优先读取，不再反复询问）
- 运行环境: NAS Ubuntu 24（本机）
- SSH 方式（若远程）: N/A
- 远程项目路径（若远程）: /home/damncheater/Development/family_health
- 验证/Checkfix 执行方式: 直接在本机终端执行

## 👁️ 视觉审计
| 维度 | 现状 | 升维策略 |
|------|------|----------|
| 空间 | 规则区与预览区竞争视线 | 将规则区置于顶部并粘性固定 |
| 操作路径 | 规则列表过长时需要滚动 | 默认折叠规则列表，按需展开 |
| 层级 | 操作与内容混在一起 | 规则区加边界与阴影，形成清晰分区 |

## 🛠️ 实施记录
- `frontend/src/components/DesensitizationModal.tsx`: 增加规则列表折叠/展开，规则区置顶，长文档时不丢操作入口。
- `frontend/src/styles/global.css`: 规则区粘性吸顶、轻阴影与合理高度。
- 用户说明书更新: `docs/USER_GUIDE.md`（补充规则列表折叠说明）
- 部署/运行文档联动检查: 未涉及部署说明
- Checkfix: `npm run build` ✅

## 追加优化
- 窗口宽度收敛至 900px 上限，避免过宽。
- 强制内容自适应，禁用横向滚动（`min-width:0` / `overflow-x:hidden`）。
- Checkfix: `npm run build` ✅

## 滚动修复
- 移除规则区粘性定位，避免与文档滚动时重叠。
- Checkfix: `npm run build` ✅

## 交互增强
- 原文选中后出现浮动“+”图标，点击即可添加规则。
- 点击高亮命中可弹出编辑/删除操作。
- Checkfix: `npm run build` ✅

## 交互修复
- 规则列表展开/收起使用可见的折叠面板，并自动滚动到列表区域。
- “+”快捷按钮强化对比度与视觉权重。
- Checkfix: `npm run build` ✅

## 规则管理增强
- 顶部新增“选择规则”快速管理区：加载/启用/删除/新建一键可用。
- 切换文档时顶部提示条显示文件名，减少误判。
- Checkfix: `npm run build` ✅

## 文档切换修复
- 预览区新增“上一份/下一份”切换按钮与计数显示。
- 切换后自动滚动回顶部并显示提示条。
- Checkfix: `npm run build` ✅

## 上一个/下一个无效修复
- 批量上传改为基于文件列表与索引切换，预览按钮可以正常切换文档。
- Checkfix: `npm run build` ✅

## 底部切换入口
- 预览底部增加“上一份/下一份”按钮，便于读完一份直接切换。
- Checkfix: `npm run build` ✅

## 知识库上传入口优化
- 新增拖拽上传方块，支持点击选择文件或拖拽上传。
- Checkfix: `npm run build` ✅

## 隐私提醒
- 知识库上传预览顶部增加隐私责任提示条。
- README 增加隐私提醒与功能亮点说明。
- Checkfix: `npm run build` ✅
