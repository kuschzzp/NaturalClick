;(function (g) {
	const DEFAULT_MODEL_ROUND_TIMEOUT_MS = 22000
	const MIN_CONFIGURED_MODEL_ROUND_TIMEOUT_MS = 8000
	const MAX_CONFIGURED_MODEL_ROUND_TIMEOUT_MS = 60000
	const MAX_MODEL_PLANNING_CALLS = 4
	const PLANNING_OVERHEAD_MS = 15000
	const maximumBudgetMs = MAX_MODEL_PLANNING_CALLS * MAX_CONFIGURED_MODEL_ROUND_TIMEOUT_MS + PLANNING_OVERHEAD_MS
	const minimumBudgetMs = MAX_MODEL_PLANNING_CALLS * DEFAULT_MODEL_ROUND_TIMEOUT_MS + PLANNING_OVERHEAD_MS

	function getPlanningTimeoutMs(session) {
		const roundTimeout = getEffectiveModelRoundTimeoutMs(session?.config?.textLLM)
		const budget = roundTimeout * MAX_MODEL_PLANNING_CALLS + PLANNING_OVERHEAD_MS
		return Math.max(minimumBudgetMs, Math.min(maximumBudgetMs, Math.floor(budget)))
	}

	function getEffectiveModelRoundTimeoutMs(endpoint) {
		const configured = Number(endpoint?.timeoutMs)
		if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MODEL_ROUND_TIMEOUT_MS
		return Math.max(MIN_CONFIGURED_MODEL_ROUND_TIMEOUT_MS, Math.min(MAX_CONFIGURED_MODEL_ROUND_TIMEOUT_MS, Math.floor(configured)))
	}

	function withTimeout(promise, timeoutMs, message) {
		let timer = null
		const timeout = new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(message)), Math.max(1000, Number(timeoutMs) || 55000))
		})
		return Promise.race([promise, timeout]).finally(() => {
			if (timer) clearTimeout(timer)
		})
	}

	async function settleAfterAction(action) {
		const name = String(action?.name || '')
		if (!name) return
		const input = action?.input || {}
		const workflow = String(input.workflow || '').trim()
		const workflowStep = String(input.workflow_step || '').trim()
		if (['open_new_tab', 'switch_to_tab'].includes(name)) {
			await sleep(420)
			return
		}
		if (workflow === 'login' && workflowStep === 'submit_login') {
			await sleep(950)
			return
		}
		if (workflow === 'task-navigation' && workflowStep === 'navigate_to_task_target') {
			await sleep(520)
			return
		}
		if (name === 'select_cascader_path') {
			await sleep(320)
			return
		}
		if (
			[
				'click',
				'click_element_by_index',
				'keypress',
				'close_tab',
				'scroll',
				'scroll_horizontally',
				'hover_element_by_index',
				'open_dropdown',
				'choose_dropdown_option',
				'select_dropdown_option',
				'select_checkbox_option',
			].includes(name)
		) {
			await sleep(220)
			return
		}
		if (['input_text', 'type'].includes(name)) {
			await sleep(120)
		}
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
	}

	g.NC_BG_SESSION_TIMING = {
		getEffectiveModelRoundTimeoutMs,
		getPlanningTimeoutMs,
		settleAfterAction,
		sleep,
		withTimeout,
	}
})(globalThis)
