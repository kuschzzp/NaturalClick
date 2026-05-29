;(function (g) {
	const { safeJsonParse } = g.NC_BG_UTILS
	const plannerContext = g.NC_BG_PLANNER_CONTEXT
	if (!plannerContext) throw new Error('NC_BG_PLANNER_CONTEXT 未加载。')
	const { shortText } = plannerContext

	function normalizeDecision(value) {
		if (!value || typeof value !== 'object') return null
		const action = normalizeAction(resolveActionCandidate(value))
		if (!action) return null
		return {
			evaluation_previous_goal: shortText(value.evaluation_previous_goal || '', 480),
			memory: shortText(value.memory || '', 1200),
			thought: shortText(
				value.thought || value.reasoning || value.analysis || value.evaluation_previous_goal || '',
				1000
			),
			next_goal: shortText(value.next_goal || value.goal || '', 640),
			action,
		}
	}

	function resolveActionCandidate(value) {
		for (const key of ['action', 'action_call', 'tool_call', 'function_call']) {
			const candidate = value?.[key]
			if (candidate && typeof candidate === 'object') return candidate
		}
		for (const key of ['tool_calls', 'action_calls', 'function_calls', 'actions']) {
			const list = Array.isArray(value?.[key]) ? value[key] : []
			const candidate = list.find((item) => item && typeof item === 'object')
			if (candidate) return candidate
		}
		return value
	}

	function normalizeAction(actionValue) {
		if (!actionValue || typeof actionValue !== 'object') return null
		if (actionValue.function && typeof actionValue.function === 'object') {
			return normalizeAction(actionValue.function)
		}
		const directName = firstStringValue(actionValue, [
			'name',
			'action',
			'tool',
			'tool_name',
			'toolName',
			'function_name',
			'functionName',
			'type',
		])
		if (directName) {
			return {
				name: normalizeActionName(directName),
				input: normalizeActionInput(actionValue),
			}
		}
		const entries = Object.entries(actionValue).filter(
			([key]) => !ACTION_NAME_KEYS.has(key) && !ACTION_INPUT_KEYS.has(key)
		)
		if (entries.length !== 1) return null
		const [name, input] = entries[0]
		if (!name || typeof name !== 'string') return null
		return {
			name: normalizeActionName(name),
			input: input && typeof input === 'object' && !Array.isArray(input) ? input : {},
		}
	}

	const ACTION_NAME_KEYS = new Set([
		'name',
		'action',
		'tool',
		'tool_name',
		'toolName',
		'function_name',
		'functionName',
		'type',
	])
	const ACTION_INPUT_KEYS = new Set(['input', 'arguments', 'args', 'params', 'parameters'])

	function firstStringValue(source, keys) {
		for (const key of keys) {
			const value = source?.[key]
			if (typeof value === 'string' && value.trim()) return value.trim()
		}
		return ''
	}

	function normalizeActionName(value) {
		return String(value || '')
			.trim()
			.replace(/[\s-]+/g, '_')
			.toLowerCase()
	}

	function normalizeActionInput(actionValue) {
		for (const key of ACTION_INPUT_KEYS) {
			const value = actionValue?.[key]
			if (value && typeof value === 'object' && !Array.isArray(value)) return value
			if (typeof value === 'string' && value.trim()) {
				const parsed = safeJsonParse(value)
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
			}
		}
		const input = {}
		for (const [key, value] of Object.entries(actionValue || {})) {
			if (ACTION_NAME_KEYS.has(key) || ACTION_INPUT_KEYS.has(key) || key === 'function') continue
			input[key] = value
		}
		return input
	}

	g.NC_BG_PLANNER_DECISION = {
		normalizeDecision,
		normalizeAction,
		normalizeActionName,
	}
})(globalThis)
