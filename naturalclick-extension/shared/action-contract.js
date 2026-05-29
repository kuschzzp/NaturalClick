;(function (g) {
	const OUTCOME_KIND = Object.freeze({
		NONE: 'none',
		FAILED: 'failed',
		NO_EFFECT: 'no_effect',
		FOCUSED: 'focused',
		VALUE_CHANGED: 'value_changed',
		STATE_CHANGED: 'state_changed',
		OPTIONS_VISIBLE: 'options_visible',
		NAVIGATED: 'navigated',
		DOM_CHANGED: 'dom_changed',
		SCROLLED: 'scrolled',
		INPUT_VERIFIED: 'input_verified',
	})

	const PROGRESS_OUTCOMES = new Set([
		OUTCOME_KIND.VALUE_CHANGED,
		OUTCOME_KIND.STATE_CHANGED,
		OUTCOME_KIND.OPTIONS_VISIBLE,
		OUTCOME_KIND.NAVIGATED,
		OUTCOME_KIND.DOM_CHANGED,
		OUTCOME_KIND.SCROLLED,
		OUTCOME_KIND.INPUT_VERIFIED,
	])

	const PROGRESS_SENSITIVE_ACTIONS = new Set([
		'click',
		'click_element_by_index',
		'keypress',
		'hover_element_by_index',
		'open_dropdown',
		'choose_dropdown_option',
		'select_dropdown_option',
		'select_checkbox_option',
		'select_cascader_path',
	])

	const REPEATABLE_ACTIONS = new Set(['scroll', 'scroll_horizontally'])
	const PASSIVE_ACTIONS = new Set(['wait'])

	function normalizeActionName(value) {
		return String(value || '').replace(/\.(loop_guard|verify)$/i, '').trim()
	}

	function normalizeOutcomeKind(value) {
		const kind = String(value || '').trim().toLowerCase()
		return Object.values(OUTCOME_KIND).includes(kind) ? kind : OUTCOME_KIND.NONE
	}

	function isProgressOutcome(kind) {
		return PROGRESS_OUTCOMES.has(normalizeOutcomeKind(kind))
	}

	function isProgressSensitiveAction(name) {
		return PROGRESS_SENSITIVE_ACTIONS.has(normalizeActionName(name))
	}

	function isRepeatableAction(name) {
		return REPEATABLE_ACTIONS.has(normalizeActionName(name))
	}

	function isPassiveAction(name) {
		return PASSIVE_ACTIONS.has(normalizeActionName(name))
	}

	function createOutcome(kind, extras = {}) {
		const normalized = normalizeOutcomeKind(kind)
		return {
			kind: normalized,
			progress: isProgressOutcome(normalized),
			...extras,
		}
	}

	function createActionResult({ success, message, kind, outcome, meta } = {}) {
		const finalOutcome =
			outcome || createOutcome(kind || (success ? OUTCOME_KIND.NONE : OUTCOME_KIND.FAILED))
		return {
			success: !!success,
			message: String(message || ''),
			meta: {
				...(meta || {}),
				outcome: finalOutcome,
			},
		}
	}

	function getOutcome(value) {
		const outcome = value?.meta?.outcome
		if (!outcome || typeof outcome !== 'object') return null
		return createOutcome(outcome.kind, outcome)
	}

	function normalizeOutcome(outcome) {
		if (!outcome || typeof outcome !== 'object') return null
		return createOutcome(outcome.kind, outcome)
	}

	function summarizeOutcome(outcome, options = {}) {
		const normalized = normalizeOutcome(outcome)
		if (!normalized?.kind || normalized.kind === OUTCOME_KIND.NONE) return ''
		const parts = [`动作结果: ${normalized.kind}`]
		if (typeof normalized.progress === 'boolean') {
			parts.push(`progress=${normalized.progress ? 'true' : 'false'}`)
		}
		if (normalized.reason) {
			parts.push(`reason=${formatOutcomeValue(normalized.reason, options.reasonMax || 80)}`)
		}
		if (normalized.requestedText) {
			parts.push(`requested=${formatOutcomeValue(normalized.requestedText, options.requestedMax || 48)}`)
		}
		if (Array.isArray(normalized.visibleOptions) && normalized.visibleOptions.length) {
			const limit = Math.max(1, Number(options.visibleLimit || 8))
			const candidates = normalized.visibleOptions.slice(0, limit).join('|')
			parts.push(`candidates=${formatOutcomeValue(candidates, options.candidatesMax || 120)}`)
		}
		if (Number.isFinite(Number(normalized.moved))) parts.push(`moved=${Number(normalized.moved)}`)
		return parts.join(' ')
	}

	function formatOutcomeValue(value, maxLen) {
		const raw = String(value || '').replace(/\s+/g, ' ').trim()
		const limit = Math.max(12, Number(maxLen) || 80)
		const text = raw.length > limit ? `${raw.slice(0, Math.max(12, limit - 3))}...` : raw
		return `"${text.replace(/["\\]/g, '\\$&')}"`
	}

	g.NC_ACTION_CONTRACT = {
		OUTCOME_KIND,
		PROGRESS_OUTCOMES,
		PROGRESS_SENSITIVE_ACTIONS,
		REPEATABLE_ACTIONS,
		PASSIVE_ACTIONS,
		normalizeActionName,
		normalizeOutcomeKind,
		isProgressOutcome,
		isProgressSensitiveAction,
		isRepeatableAction,
		isPassiveAction,
		createOutcome,
		createActionResult,
		getOutcome,
		normalizeOutcome,
		summarizeOutcome,
	}
})(globalThis)
