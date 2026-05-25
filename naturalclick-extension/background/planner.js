;(function (g) {
	const { safeJsonParse, generateId } = g.NC_BG_UTILS

	async function planAction(session, observation) {
		const tabs = await chrome.tabs.query({ windowId: session.windowId })
		const tabsSummary = tabs
			.filter((tab) => tab.id)
			.map((tab) => ({
				id: tab.id,
				title: tab.title || '',
				url: tab.url || '',
				current: tab.id === session.currentTabId,
			}))

		const historyText = session.history
			.slice(-5)
			.map(
				(h) =>
					`#${h.stepIndex} goal=${h.nextGoal || '-'} action=${h.action} success=${h.success} output=${h.output}`
			)
			.join('\n')
		const observationText = buildObservationText(observation)
		const toolLines = g.NC_BG_TOOLS?.getToolPromptLines?.() || []

		const system = [
			'你是网页自动化 Agent 的规划器，负责在每一步给出下一动作。',
			'必须严格输出 JSON 对象，不要输出 markdown、解释或多余文本。',
			'只能从 <available_tools> 列出的工具中选择 action.name。',
			'动作优先使用高层专用工具：select_dropdown_option、select_checkbox_option、select_cascader_path、hover_element_by_index；其次才使用 click_element_by_index。',
			'输入文本时优先使用 input_text；尽量避免依赖 Ctrl/Cmd + C/V/X 等系统剪贴板快捷键。',
			'若任务已完成或无法继续，必须输出 done 动作。',
			'禁止在连续步骤中重复同一失败动作（同 name + 同 input）超过 2 次，失败后要改变策略。',
			'若上一步 input_text 已 success，禁止继续对同一 index 重复输入相同或相近目标（除非明确校验失败）。',
			'表单填写要按字段推进：不要在“密码”字段连续循环输入；出现“确认密码”字段时，应尽快切换到确认密码索引。',
			'优先使用 <forms> 与 <simplified_dom> 中的 fieldType/label/value/control/rel 信息选择目标，raw_candidates 仅作兜底。',
			'<simplified_dom> 是压缩语义 HTML：index 是可操作目标，control 表示 checkbox/radio/cascader，rel 表示 aria-controls/owns/for 等关联。',
			'当字段 value 为 filled:* 时视为已填写；确认密码应选择 fieldType=confirm_password，而不是 fieldType=password。',
			'当动作目标存在 action intent 时，优先选择 intent 匹配任务目标的按钮或链接。',
			'普通下拉框/选择器流程：先点击或使用 select_dropdown_option 的 index 打开字段，再用 text 选择可见选项。',
			'多选下拉框常见为 option 行内嵌 checkbox；优先使用 select_checkbox_option，并提供待选文本，不要点击文字中心。',
			'级联选择器流程：优先使用 select_cascader_path 一次性给出完整路径，例如 {"path":["江苏省","南京市","鼓楼区"]}；不要手动滚动上一级菜单来查找下一级选项，必须先保持父级悬浮并等待下一列出现。',
			'复选框/单选框不要使用 input_text；优先使用 select_checkbox_option 或 click_element_by_index 点击 value=unchecked/unselected 的目标。',
			'遇到验证码、缺少账号/手机号、同名选项过多、无法判断用户真实意图时，使用 ask_user，不要死循环。',
			'页面加载、弹层、下拉选项尚未出现时，使用 wait 短暂等待后重新观察。',
			'如果上一步点击选项后目标字段仍 value=empty，说明未选中，不要反复点击同一个 index；应换成更具体的 option/checkbox/radio 子项或重新展开对应 combobox。',
			'当页面没有合适目标时，优先选择 scroll 或切换标签页重新定位，不要盲点。',
			'input_text 必须提供明确 text，且 index 必须是数字。',
			'click_element_by_index 的 index 必须来自当前可交互元素列表。',
			'每次输出都要包含 4 个核心字段：evaluation_previous_goal, memory, next_goal, action。',
			'action 必须是 {"name":"动作名","input":{...}} 格式。',
			'done 动作 input 格式为 {"text":"给用户的总结","success":true|false}。',
			'done 前请确保给出完成依据；若失败结束，success 必须为 false 并说明主要阻塞原因。',
		].join('\n')

		const user = [
			'<agent_state>',
			`任务: ${session.task}`,
			`当前步骤: ${session.step}`,
			`当前 URL: ${observation.url}`,
			`当前标题: ${observation.title}`,
			'</agent_state>',
			'',
			'<browser_state>',
			`标签页列表:\n${JSON.stringify(tabsSummary, null, 2)}`,
			observationText,
			'</browser_state>',
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
			'  "next_goal": "下一步最直接目标",',
			'  "action": { "name": "动作名", "input": {} }',
			'}',
		].join('\n')

		const endpoint = session.config.textLLM
		const messages = [
			{ role: 'system', content: system },
			{ role: 'user', content: user },
		]
		let content = ''
		try {
			const result = await callOpenAI(endpoint, messages, { returnMeta: true })
			content = result.content
			appendModelTrace(session, {
				title: '模型调用: 文本规划',
				ok: true,
				detail: `${endpoint.model} 请求成功`,
				io: result.io,
			})
		} catch (error) {
			appendModelTrace(session, {
				title: '模型调用: 文本规划',
				ok: false,
				detail: String(error?.message || error || '模型请求失败'),
				io: error?.io || null,
			})
			throw error
		}

		const parsed = safeJsonParse(content)
		const normalized = normalizeDecision(parsed)
		if (!normalized) {
			return {
				thought: '模型输出解析失败',
				next_goal: '结束任务',
				action: {
					name: 'done',
					input: { text: '模型输出不是有效 JSON，任务终止。', success: false },
				},
			}
		}
		return normalized
	}

	async function callOpenAI(endpoint, messages, options = {}) {
		const baseURL = String(endpoint.baseURL || '').replace(/\/+$/, '')
		const url = `${baseURL}/chat/completions`
		const headers = {
			'Content-Type': 'application/json',
		}
		if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`
		const controller = new AbortController()
		const timeoutMs = clampTimeoutMs(endpoint.timeoutMs, 60000)
		const timeout = setTimeout(() => controller.abort(), timeoutMs)
		const requestBody = {
			model: endpoint.model,
			messages,
			temperature: 0.2,
			response_format: { type: 'json_object' },
		}
		const requestPreview = buildRequestPreview(url, requestBody)

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			})
			if (!response.ok) {
				const text = await response.text()
				const error = new Error(`模型请求失败: ${response.status} ${text}`)
				error.io = {
					request: requestPreview,
					response: {
						status: response.status,
						error: shortText(text, 1800),
					},
				}
				throw error
			}
			const data = await response.json()
			const content = data?.choices?.[0]?.message?.content || ''
			if (options?.returnMeta) {
				return {
					content,
					io: {
						request: requestPreview,
						response: buildResponsePreview(data, content),
					},
				}
			}
			return content
		} catch (error) {
			if (error?.name === 'AbortError') {
				const timeoutError = new Error(`模型请求超时（${Math.round(timeoutMs / 1000)}秒）`)
				timeoutError.io = {
					request: requestPreview,
					response: { error: timeoutError.message },
				}
				throw timeoutError
			}
			throw error
		} finally {
			clearTimeout(timeout)
		}
	}

	function clampTimeoutMs(value, fallback) {
		const raw = Number(value)
		if (!Number.isFinite(raw) || raw <= 0) return fallback
		return Math.max(5000, Math.min(180000, Math.floor(raw)))
	}

	function appendModelTrace(session, payload) {
		if (!session || !Array.isArray(session.traceItems)) return
		const maxTrace = g.NC_BG_CONSTANTS?.MAX_TRACE_ITEMS || 80
		session.traceItems.push({
			id: generateId('m'),
			title: payload.title,
			detail: payload.detail,
			kind: payload.ok ? 'model' : 'error',
			io: payload.io || undefined,
		})
		session.traceItems = session.traceItems.slice(-maxTrace)
	}

	function buildObservationText(observation) {
		const parts = []
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		const actions = Array.isArray(observation?.actions) ? observation.actions : []
		const treeCandidates = Array.isArray(observation?.treeCandidates) ? observation.treeCandidates : []
		const simplifiedDom = Array.isArray(observation?.simplifiedDom) ? observation.simplifiedDom : []
		const rawCandidates = Array.isArray(observation?.rawCandidates)
			? observation.rawCandidates
			: String(observation?.content || '')
					.split('\n')
					.filter(Boolean)

		if (forms.length) {
			parts.push('<forms>')
			for (const form of forms.slice(0, 6)) {
				parts.push(`form id=${form.id || '-'} name="${form.name || '页面表单'}"`)
				const fields = Array.isArray(form.fields) ? form.fields : []
				for (const field of fields.slice(0, 40)) {
					parts.push(formatFieldLine(field))
				}
			}
			parts.push('</forms>')
		}

		if (actions.length) {
			parts.push('<actions>')
			for (const action of actions.slice(0, 60)) {
				parts.push(formatActionLine(action))
			}
			parts.push('</actions>')
		}

		if (treeCandidates.length) {
			parts.push('<dom_tree>')
			for (const row of treeCandidates.slice(0, 80)) {
				parts.push(String(row?.line || row || ''))
			}
			parts.push('</dom_tree>')
		}

		if (simplifiedDom.length) {
			parts.push('<simplified_dom>')
			for (const row of simplifiedDom.slice(0, 100)) {
				parts.push(String(row || ''))
			}
			parts.push('</simplified_dom>')
		}

		parts.push('<raw_candidates>')
		parts.push(...rawCandidates.slice(0, 80))
		if (rawCandidates.length > 80) {
			parts.push(`... omitted ${rawCandidates.length - 80} raw candidates`)
		}
		parts.push('</raw_candidates>')
		return parts.join('\n')
	}

	function formatFieldLine(field) {
		return [
			`field index=${field.index}`,
			`fieldType=${field.fieldType || 'unknown'}`,
			`label="${shortText(field.label || field.placeholder || field.text || '', 48)}"`,
			`value=${field.valueState || 'unknown'}`,
			`type=${field.type || '-'}`,
			`role=${field.role || '-'}`,
			`expanded=${field.expandedState || '-'}`,
			`required=${field.required ? 'true' : 'false'}`,
			`conf=${field.confidence || '-'}`,
		].join(' ')
	}

	function formatActionLine(action) {
		return [
			`action index=${action.index}`,
			`intent=${action.actionIntent || 'unknown'}`,
			`label="${shortText(action.label || action.text || '', 48)}"`,
			`role=${action.role || '-'}`,
			`value=${action.valueState || 'unknown'}`,
			`control=${action.selectionControl || '-'}`,
			`expanded=${action.expandedState || '-'}`,
			`conf=${action.confidence || '-'}`,
		].join(' ')
	}

	function buildRequestPreview(url, body) {
		return {
			url,
			model: body?.model || '',
			temperature: body?.temperature,
			messages: sanitizeMessages(body?.messages || []),
		}
	}

	function buildResponsePreview(data, content) {
		return {
			id: data?.id || '',
			model: data?.model || '',
			content: shortText(content, 2400),
			choices: Array.isArray(data?.choices) ? data.choices.length : 0,
			usage: data?.usage || null,
		}
	}

	function sanitizeMessages(messages) {
		return messages.map((msg) => ({
			role: msg?.role || '',
			content: sanitizeContent(msg?.content),
		}))
	}

	function sanitizeContent(content) {
		if (typeof content === 'string') return shortText(content, 1800)
		if (Array.isArray(content)) {
			return content.map((item) => {
				if (!item || typeof item !== 'object') return item
				if (item.type === 'image_url') {
					return { type: 'image_url', image_url: '[omitted]' }
				}
				if (item.type === 'text' || item.type === 'input_text') {
					return { ...item, text: shortText(item.text || '', 1200) }
				}
				return item
			})
		}
		return content
	}

	function shortText(value, maxLen) {
		const text = String(value || '')
		if (text.length <= maxLen) return text
		return `${text.slice(0, maxLen)} ...[truncated ${text.length - maxLen}]`
	}

	function normalizeDecision(value) {
		if (!value || typeof value !== 'object') return null
		const action = normalizeAction(value.action)
		if (!action) return null
		return {
			evaluation_previous_goal: shortText(value.evaluation_previous_goal || '', 480),
			memory: shortText(value.memory || '', 1200),
			thought: shortText(value.thought || value.evaluation_previous_goal || '', 1000),
			next_goal: shortText(value.next_goal || value.goal || '', 640),
			action,
		}
	}

	function normalizeAction(actionValue) {
		if (!actionValue || typeof actionValue !== 'object') return null
		if (typeof actionValue.name === 'string' && actionValue.name.trim()) {
			return {
				name: actionValue.name.trim(),
				input:
					actionValue.input && typeof actionValue.input === 'object' && !Array.isArray(actionValue.input)
						? actionValue.input
						: {},
			}
		}
		const entries = Object.entries(actionValue).filter(
			([key]) => key !== 'name' && key !== 'input' && key !== 'type'
		)
		if (entries.length !== 1) return null
		const [name, input] = entries[0]
		if (!name || typeof name !== 'string') return null
		return {
			name: name.trim(),
			input: input && typeof input === 'object' && !Array.isArray(input) ? input : {},
		}
	}

	g.NC_BG_PLANNER = {
		planAction,
		callOpenAI,
	}
})(globalThis)
