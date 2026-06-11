;(function (g) {
	const MEMORY_VERSION = 1
	const DEFAULT_MAX_ITEMS = 24
	const DEFAULT_MAX_TEXT = 7000
	const FIELD_ACTIONS = new Set([
		'input_text',
		'choose_dropdown_option',
		'select_checkbox_option',
		'select_cascader_path',
		'set_input_value',
		'fill_field',
	])

	function createConversationMemorySnapshot(source = {}) {
		const items = []
		const traceItems = Array.isArray(source.traceItems) ? source.traceItems : []
		for (let index = 0; index < traceItems.length; index += 1) {
			collectTraceMemoryItems(items, traceItems[index], index)
		}
		appendResultSummaryMemory(items, source.resultSummary)
		appendActivityMemory(items, source.activityText)
		const maxItems = clampNumber(source.maxItems, 1, 80, DEFAULT_MAX_ITEMS)
		const selected = selectMemoryItems(items, maxItems)
		return normalizeConversationMemorySnapshot({
			version: MEMORY_VERSION,
			scope: 'current_conversation',
			task: cleanText(source.task, 240),
			conversationId: cleanText(source.conversationId, 120),
			turnCount: Number(source.turnCount) || 0,
			createdAt: Number(source.createdAt || Date.now()),
			items: selected,
		})
	}

	function normalizeConversationMemorySnapshot(value = {}) {
		const raw = value && typeof value === 'object' ? value : {}
		const items = (Array.isArray(raw.items) ? raw.items : [])
			.map(normalizeMemoryItem)
			.filter(Boolean)
			.slice(0, 80)
		if (!items.length) return null
		return {
			version: Number(raw.version) || MEMORY_VERSION,
			scope: 'current_conversation',
			task: cleanText(raw.task, 240),
			conversationId: cleanText(raw.conversationId, 120),
			turnCount: Number(raw.turnCount) || 0,
			createdAt: Number(raw.createdAt) || Date.now(),
			itemCount: items.length,
			items,
		}
	}

	function formatConversationMemoryForPrompt(memory, options = {}) {
		const normalized = normalizeConversationMemorySnapshot(memory)
		if (!normalized) return ''
		const maxChars = clampNumber(options.maxChars, 800, 20000, DEFAULT_MAX_TEXT)
		const maxItems = clampNumber(options.maxItems, 1, 80, options.compact ? 12 : DEFAULT_MAX_ITEMS)
		const lines = [
			`<conversation_memory scope="current_conversation" version="${normalized.version}" turns="${normalized.turnCount || 0}" items="${normalized.itemCount || normalized.items.length}">`,
			'- 这些事实只来自当前侧边栏对话，不是全局长期记忆；新对话应视为空。',
			'- 用它优先解析“刚才、上次、前面、这个、它”等指代；涉及页面记录是否真实存在时仍要用当前页面、接口或反馈验证。',
			'- failed/error/unknown 的创建、提交或保存事实不能当作已经成功创建，只能作为失败原因或待验证候选。',
		]
		for (const item of normalized.items.slice(0, maxItems)) {
			lines.push(formatMemoryItemLine(item))
		}
		lines.push('</conversation_memory>')
		return clampBlock(lines.join('\n'), maxChars)
	}

	function collectTraceMemoryItems(out, item, order) {
		if (!item || typeof item !== 'object') return
		const title = cleanText(item.title, 160)
		const detail = cleanText(item.detail, 800)
		if (item.kind === 'user' || /^用户输入\s*#/.test(title)) {
			pushMemoryItem(out, {
				type: 'user_request',
				status: 'observed',
				title,
				summary: detail,
				order,
				priority: 20,
			})
			return
		}

		const action = item.action && typeof item.action === 'object' ? item.action : null
		if (!action?.name) {
			if (item.kind === 'error' && detail) {
				pushMemoryItem(out, {
					type: 'runtime_error',
					status: 'failed',
					title,
					summary: detail,
					order,
					priority: 50,
				})
			}
			return
		}

		const name = cleanText(action.name, 80)
		const input = action.input && typeof action.input === 'object' ? action.input : {}
		const output = cleanText(action.output || detail, 1000)
		const status = deriveTraceStatus(item, action)
		if (FIELD_ACTIONS.has(name)) {
			pushMemoryItem(out, {
				type: 'field_action',
				status,
				action: name,
				label: extractActionLabel(input),
				value: extractActionValue(input),
				summary: output,
				title,
				order,
				priority: status === 'passed' ? 70 : 80,
			})
			return
		}
		if (name === 'ask_user') {
			pushMemoryItem(out, {
				type: 'user_answer',
				status,
				action: name,
				label: cleanText(input.question || input.reason || input.target_label || '', 120),
				value: extractUserAnswer(output),
				summary: output || cleanText(input.question || '', 400),
				title,
				order,
				priority: 75,
			})
			return
		}
		if (name === 'done') {
			pushMemoryItem(out, {
				type: 'task_result',
				status: input.success === false || item.kind === 'error' ? 'failed' : status,
				action: name,
				summary: cleanText(input.text || output, 1000),
				title,
				order,
				priority: input.success === false || item.kind === 'error' ? 95 : 90,
			})
			return
		}
		if (isSubmitOrCommitAction(name, input, output) || /\.verify$|\.vision_recovery$/.test(name) || item.kind === 'error') {
			pushMemoryItem(out, {
				type: isSubmitOrCommitAction(name, input, output) ? 'submission' : 'action_outcome',
				status,
				action: name,
				label: extractActionLabel(input),
				value: extractActionValue(input),
				summary: output,
				title,
				order,
				priority: status === 'failed' ? 85 : 60,
			})
		}
	}

	function appendResultSummaryMemory(out, summary) {
		if (!summary || typeof summary !== 'object') return
		const title = cleanText(summary.title || '结果总结', 120)
		const status = normalizeStatus(summary.status)
		const parts = [
			cleanText(summary.headline, 1000),
			cleanText(summary.reason, 800),
			formatSummaryItems(summary.items, 6),
			formatSummaryItems(summary.issues, 4),
			formatSummaryItems(summary.remainingDetails, 4),
		].filter(Boolean)
		if (!parts.length) return
		pushMemoryItem(out, {
			type: 'result_summary',
			status,
			title,
			summary: parts.join(' | '),
			order: 100000,
			priority: status === 'failed' ? 100 : 88,
		})
	}

	function appendActivityMemory(out, activityText) {
		const text = cleanText(activityText, 1000)
		if (!text) return
		pushMemoryItem(out, {
			type: 'latest_activity',
			status: inferTextStatus(text),
			title: '最近状态',
			summary: text,
			order: 100001,
			priority: /失败|错误|未成功|不能|无法/.test(text) ? 82 : 58,
		})
	}

	function pushMemoryItem(out, item) {
		const normalized = normalizeMemoryItem(item)
		if (!normalized) return
		out.push(normalized)
	}

	function normalizeMemoryItem(item) {
		if (!item || typeof item !== 'object') return null
		const summary = cleanText(item.summary || item.text || item.output || '', 1200)
		const value = cleanText(item.value, 500)
		const label = cleanText(item.label, 160)
		const action = cleanText(item.action, 80)
		const title = cleanText(item.title, 160)
		if (!summary && !value && !label && !action && !title) return null
		return {
			type: cleanText(item.type || 'note', 60),
			status: normalizeStatus(item.status),
			action,
			label,
			value,
			summary,
			title,
			order: Number.isFinite(Number(item.order)) ? Number(item.order) : 0,
			priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
		}
	}

	function selectMemoryItems(items, maxItems) {
		const normalized = (Array.isArray(items) ? items : []).map(normalizeMemoryItem).filter(Boolean)
		const seen = new Set()
		const deduped = []
		for (const item of normalized) {
			const key = [item.type, item.action, item.label, item.value, item.summary].join('\n')
			if (seen.has(key)) continue
			seen.add(key)
			deduped.push(item)
		}
		return deduped
			.sort((a, b) => (b.priority - a.priority) || (b.order - a.order))
			.slice(0, maxItems)
			.sort((a, b) => a.order - b.order)
	}

	function formatMemoryItemLine(item) {
		const parts = [
			`- type=${escapeToken(item.type || 'note')}`,
			`status=${escapeToken(item.status || 'unknown')}`,
			item.action ? `action=${escapeQuoted(item.action)}` : '',
			item.label ? `label=${escapeQuoted(item.label)}` : '',
			item.value ? `value=${escapeQuoted(item.value)}` : '',
			item.title ? `title=${escapeQuoted(item.title)}` : '',
			item.summary ? `summary=${escapeQuoted(item.summary)}` : '',
		].filter(Boolean)
		return parts.join(' ')
	}

	function extractActionLabel(input) {
		return cleanText(
			input.workflow_field_label ||
			input.target_label ||
			input.label ||
			input.placeholder ||
			input.target_description ||
			input.description ||
			'',
			160
		)
	}

	function extractActionValue(input) {
		if (Array.isArray(input.path) && input.path.length) return cleanText(input.path.join(' / '), 500)
		if (Array.isArray(input.values) && input.values.length) return cleanText(input.values.join(' / '), 500)
		for (const key of ['text', 'value', 'label', 'selectedText', 'selected_label', 'key', 'url', 'target_url']) {
			const value = cleanText(input[key], 500)
			if (value) return value
		}
		return ''
	}

	function extractUserAnswer(output) {
		const text = cleanText(output, 500)
		const match = text.match(/用户回答\s*[:：]\s*([^（\n\r]+)/)
		return cleanText(match?.[1] || '', 240)
	}

	function deriveTraceStatus(item, action) {
		if (item?.kind === 'error') return 'failed'
		const input = action?.input || {}
		if (input.success === false) return 'failed'
		const text = cleanText([item?.detail, action?.output].filter(Boolean).join(' '), 1000)
		return inferTextStatus(text)
	}

	function inferTextStatus(text) {
		const raw = String(text || '')
		if (/(失败|错误|异常|未成功|未完成|无法|不能|校验失败|验证失败|no_effect|failed|error)/i.test(raw)) return 'failed'
		if (/(成功|已完成|完成|通过|已提交|已保存|value_changed|dom_changed|success=true|passed|completed)/i.test(raw)) return 'passed'
		return 'unknown'
	}

	function normalizeStatus(status) {
		const text = String(status || '').trim().toLowerCase()
		if (/^(passed|pass|success|successful|completed|complete|ok|done|true|通过|成功|已完成)$/.test(text)) return 'passed'
		if (/^(failed|fail|error|invalid|false|失败|错误|未通过)$/.test(text)) return 'failed'
		if (/^(skipped|skip|stopped|中止|跳过)$/.test(text)) return 'skipped'
		return text || 'unknown'
	}

	function isSubmitOrCommitAction(name, input, output) {
		const text = [
			name,
			input?.target_label,
			input?.label,
			input?.text,
			input?.target_description,
			output,
		].filter(Boolean).join(' ')
		return /(保存|提交|确定|完成|创建|新增|新建|添加|save|submit|confirm|create|add|new)/i.test(text)
	}

	function formatSummaryItems(items, limit) {
		const list = Array.isArray(items) ? items : []
		return list.slice(0, Math.max(1, Number(limit) || 4)).map((item) => {
			if (!item || typeof item !== 'object') return cleanText(item, 180)
			return cleanText([
				item.label,
				item.statusLabel || item.status,
				item.value ? `值=${item.value}` : '',
				item.summary,
			].filter(Boolean).join('；'), 260)
		}).filter(Boolean).join('；')
	}

	function cleanText(value, maxLen = 200) {
		const text = String(value ?? '').replace(/\s+/g, ' ').trim()
		if (!text || /^(null|undefined|\(empty\))$/i.test(text)) return ''
		const limit = Math.max(20, Number(maxLen) || 200)
		return text.length > limit ? `${text.slice(0, Math.max(10, limit - 3))}...` : text
	}

	function clampBlock(text, maxChars) {
		const raw = String(text || '')
		if (raw.length <= maxChars) return raw
		return `${raw.slice(0, Math.max(200, maxChars - 80))}\n... conversation_memory truncated ...\n</conversation_memory>`
	}

	function clampNumber(value, min, max, fallback) {
		const number = Number(value)
		if (!Number.isFinite(number)) return fallback
		return Math.min(max, Math.max(min, Math.floor(number)))
	}

	function escapeToken(value) {
		return String(value || '').replace(/\s+/g, '_').replace(/"/g, '')
	}

	function escapeQuoted(value) {
		return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
	}

	g.NC_CONVERSATION_MEMORY = {
		MEMORY_VERSION,
		createConversationMemorySnapshot,
		normalizeConversationMemorySnapshot,
		formatConversationMemoryForPrompt,
	}
})(globalThis)
