<div align="center">

# NaturalClick Agent

**一个 DOM 优先、视觉回退辅助的 Chrome 侧边栏浏览器 Agent。**

让浏览器拥有一个可观察的自动化 Agent：它能识别页面、调用 OpenAI 兼容模型规划动作、在本地 Chrome 中执行操作，并在 DOM 控制不足时回退到视觉坐标定位。

[English](./README.md) · [许可证](./LICENSE) · [扩展源码](./naturalclick-extension) · [Issues](https://github.com/kuschzzp/NaturalClick/issues)

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4)](./naturalclick-extension/manifest.json)
[![Side Panel](https://img.shields.io/badge/UI-Side%20Panel-10B981)](./naturalclick-extension/sidepanel.html)
[![DOM First](https://img.shields.io/badge/Automation-DOM--first-111827)](./naturalclick-extension/content/observer.js)
[![Vision Fallback](https://img.shields.io/badge/Fallback-Vision-7C3AED)](./naturalclick-extension/background/vision.js)
[![License: MIT](https://img.shields.io/badge/license-MIT-10B981)](./LICENSE)

</div>

---

## 这是什么？

NaturalClick Agent 是一个 Chrome 扩展，它把浏览器侧边栏变成一个本地浏览器 Agent 工作区。

它会通过结构化 DOM 提取观察当前页面，把当前浏览器状态发送给文本模型，要求模型返回严格 JSON 动作，然后在本地 Chrome 中执行动作，并把每一步保存为可检查的会话轨迹。当 DOM 索引执行失败时，NaturalClick 可以截取当前标签页截图，并让多模态模型或视觉服务返回候选坐标。

这不是隐蔽自动化工具，也不是 CAPTCHA 绕过项目。目标是透明、可调试、用户可控的真实网页自动化。

## 安装

克隆仓库：

```bash
git clone https://github.com/kuschzzp/NaturalClick.git
cd NaturalClick
```

在 Chrome 中加载扩展：

1. 打开 `chrome://extensions/`。
2. 开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**。
4. 选择 `naturalclick-extension` 目录。
5. 点击浏览器工具栏中的 NaturalClick 图标，打开侧边栏。

目前没有构建步骤，Chrome 会直接加载扩展源码文件。

## 配置模型

打开侧边栏设置页，配置 OpenAI 兼容接口。

| 配置项 | 用途 | 是否必需 |
|---|---|:---:|
| 文本模型 | 主规划器，负责返回严格 JSON 动作 | 是 |
| 多模态模型 | 第一层截图坐标视觉回退 | 推荐 |
| 视觉服务 | 多模态结果不确定时的第二层视觉回退 | 可选 |

接口格式：

```text
Base URL: https://api.openai.com/v1
Model:    your-model-name
API Key:  your-api-key
```

配置会保存在本地 `chrome.storage.local` 中。

## 快速开始

加载扩展后，打开一个普通网页，然后输入任务：

```text
Open github.com and search for NaturalClick.
Go to this login page and find the registration entry.
Fill this form with test data but stop before submitting.
搜索最新的黄金价格并总结结果。
```

NaturalClick 会：

1. 观察当前标签页并提取结构化页面状态。
2. 调用文本模型规划下一步动作。
3. 在页面或浏览器中优先执行 DOM 动作。
4. 对输入、滚动等部分结果进行校验。
5. DOM 执行失败时使用视觉回退。
6. 保存轨迹，便于调试和复盘。

## 包含什么？

```text
naturalclick-extension/
├── manifest.json                    # Chrome MV3 扩展清单
├── background.js                    # Service Worker 入口和任务启动
├── background/
│   ├── config.js                    # 本地配置归一化
│   ├── confirmation.js              # 高风险动作确认
│   ├── constants.js                 # 运行时常量
│   ├── executor.js                  # 标签页工具和页面动作派发
│   ├── login-workflow.js            # 确定性登录流程
│   ├── planner.js                   # 规划器编排
│   ├── planner-context.js           # 观察压缩和上下文请求
│   ├── planner-model-client.js      # OpenAI 兼容模型客户端
│   ├── planner-prompt.js            # 完整/紧凑规划 Prompt
│   ├── planner-validation.js        # 动作校验和重规划提示
│   ├── search-workflow*.js          # 确定性搜索/筛选流程
│   ├── session-engine.js            # Observe-Plan-Act 主循环
│   ├── session-*.js                 # 会话生命周期、计时、恢复和记录
│   ├── tools.js                     # 规划器可见工具注册表
│   ├── utils.js                     # Chrome/runtime 工具函数
│   ├── verifier.js                  # 动作后校验
│   ├── workflows.js                 # 模型前置和超时恢复工作流
│   └── vision.js                    # 截图和坐标回退
├── content.js                       # 页面侧通信桥
├── content/
│   ├── action-*.js                  # DOM、输入、选择、滚动动作辅助
│   ├── actions.js                   # 页面动作路由
│   ├── observer.js                  # DOM 观察和语义提取
│   ├── verification.js              # 命中检测和输入校验
│   └── visual.js                    # 索引高亮和点击反馈
├── shared/
│   ├── action-contract.js           # 结构化动作结果契约
│   ├── control-semantics.js         # 共享控件和字段语义
│   └── protocol.js                  # 共享消息类型和状态
├── sidepanel.html                   # 侧边栏 UI 结构和样式
├── sidepanel.js                     # UI 状态、设置、历史、轨迹
└── assets/                          # 扩展图标
```

## 自动化能力

| 能力 | 当前支持 |
|---|---|
| DOM 索引 | 可交互元素、字段、标签、角色、占位符、值状态 |
| 表单理解 | 用户名、密码、确认密码、手机号、验证码、邀请码、昵称、邮箱、部门、角色、平台、区域、日期 |
| 选择控件 | 显式展开/选择工具，支持下拉框、复选项、单选项、树节点和 Element 风格下拉项 |
| 级联选择器 | 按完整路径选择，保持父级悬浮展开下一级，并在弹层内安全收起浮层 |
| 确定性工作流 | 目标 URL、登录、任务导航、搜索/筛选测试，以及受限表单超时恢复 |
| 跨标签页动作 | 打开、切换、关闭标签页 |
| 视觉回退 | 基于截图的坐标定位，并在执行前做命中检测 |
| 轨迹检查 | 模型 IO、动作输入、输出、校验失败、候选诊断、导出的会话日志 |
| 结果校验 | 结构化动作结果、循环保护、输入/下拉/级联校验，以及弹层意外消失检测 |
| 中止处理 | 使用独立 `stopped` 状态，不把用户中止当作错误 |

## 支持的动作

| 动作 | 说明 |
|---|---|
| `click_element_by_index` | 按索引点击观察到的 DOM 元素 |
| `input_text` | 向观察到的可编辑元素输入文本 |
| `open_dropdown` | 按字段索引展开下拉框，并返回真实可见候选 |
| `choose_dropdown_option` | 在指定字段范围内选择真实可见下拉选项 |
| `select_checkbox_option` | 按可见文本选择复选类选项 |
| `select_cascader_path` | 按完整路径选择级联项，例如省/市/区 |
| `hover_element_by_index` | 悬浮观察到的元素，主要用于菜单和级联选择器 |
| `scroll` | 纵向滚动页面或目标容器 |
| `scroll_horizontally` | 横向滚动页面或目标容器 |
| `keypress` | 向当前焦点元素派发键盘事件 |
| `open_new_tab` | 在新的 Chrome 标签页打开 URL |
| `switch_to_tab` | 切换到已有标签页 |
| `close_tab` | 关闭已有标签页 |
| `wait` | 短暂等待页面、弹层或下拉候选稳定 |
| `ask_user` | 缺少账号、验证码或确认信息时向用户提问 |
| `locate_by_vision` | 按语义描述触发截图视觉定位，执行点击或输入 |
| `done` | 用最终消息结束任务 |

`select_dropdown_option` 仍保留为兼容旧动作的别名，但新规划优先使用 `open_dropdown` 加 `choose_dropdown_option`。坐标点击和坐标输入主要用于视觉回退内部流程。

## 运行流程

```text
用户任务
  -> 侧边栏发送 START_TASK
  -> Background 准备可自动化标签页
  -> Content Observer 返回结构化页面状态
  -> 确定性工作流可能先处理 URL、登录、导航、搜索或安全表单恢复
  -> Planner 调用文本模型
  -> Executor 执行浏览器或页面动作
  -> Verifier 校验部分动作结果
  -> 超时恢复可补填明确字段，或仅在当前表单字段已满足时提交
  -> Vision Fallback 重试失败的点击/输入动作
  -> 会话轨迹更新到侧边栏
```

## 开发

在仓库根目录运行语法检查：

```bash
node --check naturalclick-extension/background.js
node --check naturalclick-extension/content.js
node --check naturalclick-extension/sidepanel.js
node -e "JSON.parse(require('fs').readFileSync('naturalclick-extension/manifest.json','utf8')); console.log('manifest ok')"
```

运行通用运行时契约检查：

```bash
node scripts/validate-runtime-contracts.js
```

修改扩展文件后：

1. 在 `chrome://extensions/` 重新加载 NaturalClick。
2. 刷新目标页面，让 Chrome 注入最新 Content Script。
3. 重新执行任务，并检查侧边栏里的会话轨迹。

## 安全与隐私

NaturalClick 运行在你的本地 Chrome 配置中，但你配置的模型接口可能会收到页面摘要和截图。

可能发送给模型接口的数据：

- 任务文本
- 当前 URL 和页面标题
- 结构化 DOM 摘要
- 最近执行历史
- 使用视觉回退时的截图

扩展申请了较宽的权限，因为它的目标是自动化用户选择的任意普通网页。请使用可信模型接口，处理敏感页面前先理解数据流，并手动检查高影响操作。

NaturalClick 对删除、支付、购买、转账、发布等高风险意图做了启发式确认。这是安全辅助层，不是正式安全边界。

## 当前限制

- CAPTCHA、短信验证、银行、支付和身份认证通常需要人工介入。
- 复杂自定义组件可能仍需要站点级或框架级启发式规则。
- 视觉回退效果依赖截图质量和模型可靠性。
- 目前还没有打包发布流程。
- 已有运行时契约检查，但目前还没有真实浏览器端到端回归测试套件。

## 路线图

| 方向 | 计划改进 |
|---|---|
| DOM 识别 | 更好的重复过滤、更强标签绑定、更丰富的自定义组件元数据 |
| 选择控件 | 覆盖更多自定义多选和树选择组件 |
| 结果校验 | 用浏览器 fixture 覆盖执行前后观察差异和点击结果 |
| 调试能力 | 轨迹回放、紧凑失败报告、基于 fixture 的复现 |
| 打包发布 | 可安装 Chrome 扩展构建和发布流程 |
| 隐私控制 | 可选域名白名单和更清晰的存储/历史控制 |

## 贡献

欢迎提交 Issue 和 Pull Request。

适合贡献的内容包括：

- 带可复现步骤和导出轨迹的自动化失败报告
- 针对特定组件库的 DOM 识别增强
- 更安全的执行和校验策略
- 侧边栏 UI/UX 优化
- 文档和示例补充

提交前请运行上面的语法检查和通用运行时契约检查，并尽量把无关改动拆开。

## 许可证

NaturalClick Agent 使用 [MIT License](./LICENSE) 发布。
