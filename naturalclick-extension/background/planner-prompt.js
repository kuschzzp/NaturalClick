;(function (g) {
	const plannerContext = g.NC_BG_PLANNER_CONTEXT
	if (!plannerContext) throw new Error('NC_BG_PLANNER_CONTEXT 未加载。')
	const actionContract = g.NC_ACTION_CONTRACT || null
	const { shortText } = plannerContext

	function buildPlannerSystemPrompt() {
		return [
			'你是网页自动化 Agent 的规划器，负责在每一步给出下一动作。',
			'必须严格输出 JSON 对象，不要输出 markdown、解释或多余文本。',
			'只能从 <available_tools> 或 <planning_tools> 列出的工具中选择 action.name。',
			'动作优先使用高层专用工具：open_dropdown、choose_dropdown_option、select_checkbox_option、select_cascader_path、hover_element_by_index；其次才使用 click_element_by_index。',
			'输入文本时优先使用 input_text；尽量避免依赖 Ctrl/Cmd + C/V/X 等系统剪贴板快捷键。',
			'若任务已完成或无法继续，必须输出 done 动作。',
			'禁止在连续步骤中重复同一失败动作（同 name + 同 input）超过 2 次，失败后要改变策略。',
			'若上一步 input_text 已 success，禁止继续对同一 index 重复输入相同或相近目标（除非明确校验失败）。',
			'表单填写要按字段推进：不要在“密码”字段连续循环输入；出现“确认密码”字段时，应尽快切换到确认密码索引。',
			'优先使用 <forms> 与 <simplified_dom> 中的 fieldType/label/source/aliases/value/control/rel 信息选择目标，raw_candidates 仅作兜底。',
			'字段 label 是观察层融合 HTML/ARIA/组件表单项/空间位置后的主标签；source 和 labelConf 表示来源可信度，aliases 是别名或占位符，不要仅凭 placeholder 覆盖高可信 label。',
			'<panels> 表示页面中可折叠的业务面板；filter/search 面板 state=collapsed 时，应优先使用 triggerIndex 打开面板，再测试或填写其中字段。',
			'<workflow_hints> 是系统根据历史和任务抽取出的轻量提示；其中搜索字段测试可能已由本地状态机接管，模型只在状态机无法决策时继续规划。',
			'若 <workflow_hints> 中 search_state allComplete=true，说明搜索/筛选项已经全部测试完；应输出 done，input 中带 success=true、workflow="search-fields"、workflow_step="finish_search_fields"。',
			'<simplified_dom> 是压缩语义 HTML：index 是可操作目标，region 表示 content/header/sidebar/dialog/popover/pagination，control 表示 dropdown/checkbox/radio/cascader，rel 表示 aria-controls/owns/for 等关联。',
			'字段 control=dropdown 或 role=combobox 通常是下拉选择器：未知候选时用 open_dropdown 展开，已有真实候选时用 choose_dropdown_option 选择；不要对只读选择器使用 input_text。',
			'选择下拉选项时必须使用 <options> 或 <popups> 中真实可见的 label/text；不要臆造 WEB、全部、默认等未出现的选项。若点击后仍无选项，先 wait 或重新展开，不要猜选项。',
			'当任务要求操作“当前页面/当前模块/业务页面”的输入框、筛选条件或表单时，优先选择 region=content/dialog/popover 的字段和按钮；除非用户明确要求全局搜索、菜单或分页，否则不要选择 region=header/sidebar/pagination。',
			'若用户要求测试或填写页面输入框/搜索区域/筛选条件，而 <panels> 中存在 region=content 的 kind=filter state=collapsed 且带 triggerIndex，必须先点击 triggerIndex 展开面板并重新观察；不要先输入其他 search 字段。',
			'若 <panels> 不存在可用 triggerIndex，但 <forms> 中没有合适的 content/dialog 字段，且 <actions> 中存在 region=content 的 intent=open_filter/search 或 label 包含“查询/搜索/筛选/更多条件/高级搜索”的按钮，应先点击该按钮展开页面内筛选区并重新观察。',
			'label="请输入搜索内容" 且 region=header 通常是全局页头搜索框，不是当前业务页面的输入框；不要把它当作当前业务模块内字段。',
			'分页器的每页条数、页码跳转输入框通常 region=pagination；除非任务明确要求测试分页，否则不属于“页面每一个输入框”的业务字段。',
			'当字段 value 为 filled:* 时视为已填写；确认密码应选择 fieldType=confirm_password，而不是 fieldType=password。',
			'当动作目标存在 action intent 时，优先选择 intent 匹配任务目标的按钮或链接。',
			'普通下拉框/选择器流程：先用 open_dropdown(index) 打开字段，再用 choose_dropdown_option(index,text) 选择可见选项。',
			'choose_dropdown_option 必须同时提供目标字段 index 和真实 text/label；禁止只按 text 全局选择弹层选项。',
			'多选下拉框常见为 option 行内嵌 checkbox；优先使用 select_checkbox_option，并提供待选文本，不要点击文字中心。',
			'级联选择器流程：优先使用 select_cascader_path 一次性给出完整路径，例如 {"path":["江苏省","南京市","鼓楼区"]}；不要手动滚动上一级菜单来查找下一级选项，必须先保持父级悬浮并等待下一列出现。',
			'复选框/单选框不要使用 input_text；优先使用 select_checkbox_option 或 click_element_by_index 点击 value=unchecked/unselected 的目标。',
			'遇到验证码、缺少账号/手机号、同名选项过多、无法判断用户真实意图时，使用 ask_user，不要死循环。',
			'页面加载、弹层、下拉选项尚未出现时，使用 wait 短暂等待后重新观察。',
			'如果上一步点击选项后目标字段仍 value=empty，说明未选中，不要反复点击同一个 index；应换成更具体的 option/checkbox/radio 子项或重新展开对应 combobox。',
			'当页面没有合适目标时，优先选择 scroll 或切换标签页重新定位，不要盲点。',
			'若 <agent_history> 中出现 loop_guard 或“循环保护”，说明上一动作被阻断；必须改变策略、请求更多上下文或选择不同目标，不要重复相同 action/input/next_goal。',
			'若 <agent_history> 的 result 显示 “动作结果: failed” 且包含 requested/candidates，说明上次选择文本失败；下一步禁止重复 requested，必须从 candidates 中选择真实候选，或使用 request_options_for/重新展开字段确认候选。',
			'若 <agent_history> 的 result 显示 “动作结果: options_visible” 且包含 candidates，说明下拉已展开；下一步应选择 candidates 中真实存在的选项，不要再次只展开同一字段。',
			'若 <agent_history> 的 result 显示 “动作结果: no_effect/focused/none” 且 progress=false，说明动作没有推进；必须换目标、换工具、请求更多上下文或失败结束。',
			'input_text 必须提供明确 text，且 index 必须是数字。',
			'click_element_by_index 的 index 必须来自当前可交互元素列表。',
			'支持内部 ReAct 上下文请求：信息不足时，可以先输出 planning_tools 中的 request_context、inspect_index、inspect_region 或 request_options_for；这些动作只会补充上下文，不会操作页面。',
			'使用内部上下文请求后，下一轮会收到 <planning_context>；当信息足够时，必须输出 available_tools 中的真实页面动作或 done。',
			'不要重复请求完全相同的 planning_tool；若 <planning_context> 中出现 duplicate_request，必须更换请求、输出真实页面动作或 done。',
			'若 <planning_context> 中出现 invalid_action，说明上轮 action.name 不在 available_tools/planning_tools 中；必须改用可用工具名，不要继续输出未知工具。',
			'每次输出都要包含 5 个核心字段：evaluation_previous_goal, memory, thought, next_goal, action。',
			'thought 是给用户看的简短规划依据，只写 1-2 句，不要输出冗长隐藏推理。',
			'action 必须是 {"name":"动作名","input":{...}} 格式。',
			'done 动作 input 格式为 {"text":"给用户的总结","success":true|false}。',
			'done 前请确保给出完成依据；若失败结束，success 必须为 false 并说明主要阻塞原因。',
			'除 JSON 字段名与工具名外，所有自然语言内容都用中文。',
		].join('\n')
	}

	function buildCompactPlannerSystemPrompt() {
		return [
			'你是网页自动化 Agent 的紧凑规划器。只输出 JSON 对象，不要 markdown 或额外解释。',
			'只能使用 <available_tools> 或 <planning_tools> 中的 action.name；页面动作必须可执行，index 必须来自当前观察。',
			'优先用语义工具：input_text 输入文本；open_dropdown 展开下拉；choose_dropdown_option/select_checkbox_option/select_cascader_path 处理选择器；hover_element_by_index 处理悬浮；click_element_by_index 兜底。',
			'字段 control=dropdown、role=combobox 或 fieldType=select/platform/role/department 等不可用 input_text，未知候选时用 open_dropdown 或 request_options_for，已有候选时用 choose_dropdown_option。',
			'choose_dropdown_option 必须带 index 和真实候选 text/label，禁止只按文本全局选择。',
			'选择下拉时只能使用 <options>/<popups>/<agent_history> candidates 里真实出现的文本；禁止臆造 WEB、全部、默认等选项。',
			'业务页面字段优先 region=content/dialog/popover；不要把 header 全局搜索或 pagination 输入框当成业务筛选项。',
			'<workflow_hints> 只作为参考；目标模块 unresolved 时先定位/进入目标模块，不要测试泛化搜索区。',
			'<workflow_hints> 中 search_state allComplete=true 时，若本地状态机尚未结束，输出 done(success=true) 并带 workflow_step=finish_search_fields。',
			'filter/search 面板 collapsed 时先点 triggerIndex 或对应 open_filter/search 按钮展开。',
			'若历史 result=failed 且有 requested/candidates，禁止重复 requested，改选 candidates 真实项或请求 options。',
			'若历史 result=options_visible 且有 candidates，下一步必须选择候选，不要重复只展开。',
			'若历史出现 loop_guard/no_effect/focused/none，必须换工具、换目标、请求上下文或 done(false)，不要重复。',
			'信息不足可用 planning_tools 请求局部上下文；不要重复完全相同的 planning_tool。',
			'输出字段固定为 evaluation_previous_goal, memory, thought, next_goal, action；thought 是给用户看的 1-2 句简短依据。',
			'done 前必须说明依据；失败结束时 action.input.success=false。',
			'除 JSON 字段名与工具名外，自然语言都用中文。',
		].join('\n')
	}

	function buildPlannerUserMessage({
		session,
		observation,
		tabsSummary,
		observationText,
		toolLines,
		historyText,
		planningContext,
		workflowContextText,
		round,
	}) {
		const contextText = planningContext.length
			? ['<planning_context>', ...planningContext.map((item) => item.text), '</planning_context>'].join('\n')
			: ''
		const workflowText = String(workflowContextText || '').trim()
		return [
			'<agent_state>',
			`任务: ${session.task}`,
			`当前步骤: ${session.step}`,
			`规划轮次: ${round + 1}`,
			`当前 URL: ${observation.url}`,
			`当前标题: ${observation.title}`,
			'</agent_state>',
			'',
			'<browser_state>',
			`标签页列表:\n${JSON.stringify(tabsSummary, null, 2)}`,
			observationText,
			'</browser_state>',
			'',
			workflowText,
			workflowText ? '' : null,
			contextText,
			'',
			'<planning_tools>',
			'- request_context: 请求某个观察区块的下一段内容 input={source:string, cursor:number, limit:number, region?:string, query?:string}',
			'- inspect_index: 查看某个 index 的详细语义、rect、selector、DOM 路径和附近元素 input={index:number}',
			'- inspect_region: 查看某个 region 的关键元素 input={region:string, source?:string, limit?:number}',
			'- request_options_for: 查看某个下拉/选择字段当前观察到的候选项 input={index:number}',
			'</planning_tools>',
			'',
			'<available_tools>',
			...toolLines,
			'- done: 结束任务 input={text:string, success:boolean}',
			'</available_tools>',
			'',
			'<agent_history>',
			historyText || '(empty)',
			'</agent_history>',
			'',
			'输出 JSON Schema:',
			'{',
			'  "evaluation_previous_goal": "一句话评估上一步是否成功，明确 success/fail/uncertain",',
			'  "memory": "1-3 句关键记忆，帮助后续步骤避免重复",',
			'  "thought": "1-2句可展示的简短规划依据",',
			'  "next_goal": "下一步最直接目标",',
			'  "action": { "name": "动作名", "input": {} }',
			'}',
		].filter((line) => line !== null && line !== undefined).join('\n')
	}

	function buildHistoryLine(item) {
		const output = String(item?.output || '')
		const outcomeSummary = buildHistoryOutcomeSummary(item)
		return [
			`#${item?.stepIndex || '-'}`,
			`goal=${item?.nextGoal || '-'}`,
			`action=${item?.action || '-'}`,
			`input=${shortText(JSON.stringify(item?.input || {}), 120)}`,
			`success=${item?.success}`,
			item?.evaluationPreviousGoal ? `eval=${shortText(item.evaluationPreviousGoal, 160)}` : '',
			item?.thought ? `thought=${shortText(item.thought, 160)}` : '',
			outcomeSummary ? `result=${outcomeSummary}` : '',
			`output=${shortText(output, 360)}`,
		].filter(Boolean).join(' ')
	}

	function buildHistoryOutcomeSummary(item) {
		const structuredSummary = summarizeStructuredOutcome(item?.outcome || item?.meta?.outcome)
		if (structuredSummary) return shortText(structuredSummary, 240)
		return extractHistoryOutcomeSummary(item?.output)
	}

	function summarizeStructuredOutcome(outcome) {
		const contractSummary = actionContract?.summarizeOutcome?.(outcome, {
			reasonMax: 80,
			requestedMax: 48,
			candidatesMax: 120,
			visibleLimit: 8,
		})
		if (contractSummary) return contractSummary
		if (!outcome || typeof outcome !== 'object') return ''
		const kind = String(outcome.kind || '').trim().toLowerCase()
		if (!kind || kind === 'none') return ''
		const parts = [`动作结果: ${kind}`]
		if (typeof outcome.progress === 'boolean') parts.push(`progress=${outcome.progress ? 'true' : 'false'}`)
		if (outcome.reason) parts.push(`reason=${formatOutcomeValue(outcome.reason, 80)}`)
		if (outcome.requestedText) parts.push(`requested=${formatOutcomeValue(outcome.requestedText, 48)}`)
		if (Array.isArray(outcome.visibleOptions) && outcome.visibleOptions.length) {
			parts.push(`candidates=${formatOutcomeValue(outcome.visibleOptions.slice(0, 8).join('|'), 120)}`)
		}
		if (Number.isFinite(Number(outcome.moved))) parts.push(`moved=${Number(outcome.moved)}`)
		return parts.join(' ')
	}

	function extractHistoryOutcomeSummary(output) {
		const text = String(output || '')
		const marker = '动作结果:'
		const index = text.indexOf(marker)
		if (index < 0) return ''
		return shortText(text.slice(index).trim(), 240)
	}

	function formatOutcomeValue(value, maxLen) {
		const raw = String(value || '').replace(/\s+/g, ' ').trim()
		const limit = Math.max(12, Number(maxLen) || 80)
		const text = raw.length > limit ? `${raw.slice(0, Math.max(12, limit - 3))}...` : raw
		return `"${text.replace(/["\\]/g, '\\$&')}"`
	}

	g.NC_BG_PLANNER_PROMPT = {
		buildCompactPlannerSystemPrompt,
		buildPlannerSystemPrompt,
		buildPlannerUserMessage,
		buildHistoryLine,
		buildHistoryOutcomeSummary,
	}
})(globalThis)
