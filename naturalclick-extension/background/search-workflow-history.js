;(function (g) {
	function createSearchWorkflowHistoryHelpers(deps = {}) {
		const normalizeText = typeof deps.normalizeText === 'function'
			? deps.normalizeText
			: (value) => String(value || '').replace(/\s+/g, '').trim()
		const isUsableLabel = typeof deps.isUsableLabel === 'function'
			? deps.isUsableLabel
			: (label) => !!normalizeText(label)

		function normalizeActionName(action) {
			return String(action || '').replace(/\.(verify|loop_guard|vision_recovery)$/i, '')
		}

		function isSearchWorkflowHistory(item) {
			const input = item?.input || {}
			const workflow = String(input.workflow || '').trim()
			const step = String(input.workflow_step || '').trim()
			return workflow === 'search-fields' ||
				/^(expand_search_panel|fill_field|open_dropdown|select_option|submit_search|reset_filters)$/i.test(step)
		}

		function isSearchPanelExpandHistory(item) {
			const action = normalizeActionName(item?.action)
			if (action !== 'click_element_by_index' && action !== 'click') return false
			const input = item?.input || {}
			if (String(input.workflow_step || '').trim() === 'expand_search_panel') return true
			const text = normalizeText([
				input.target_label,
				input.label,
				input.text,
				item?.nextGoal,
				item?.output,
				item?.evaluationPreviousGoal,
			].filter(Boolean).join(' '))
			return /(展开|更多|高级|筛选区域|搜索区域)/i.test(text) &&
				/(搜索|查询|筛选|filter|search)/i.test(text)
		}

		function isSearchWorkflowFinishHistory(item) {
			const action = normalizeActionName(item?.action)
			const input = item?.input || {}
			return action === 'done' &&
				String(input.workflow || '').trim() === 'search-fields' &&
				String(input.workflow_step || '').trim() === 'finish_search_fields'
		}

		function isSearchFieldAction(action) {
			return ['input_text', 'type', 'open_dropdown', 'choose_dropdown_option', 'select_dropdown_option', 'select_checkbox_option', 'select_cascader_path'].includes(action)
		}

		function hasMeaningfulSelectionInput(item) {
			return !!String(item?.input?.text || item?.input?.label || '').trim()
		}

		function isDropdownOpenHistory(item) {
			const action = normalizeActionName(item?.action)
			return action === 'open_dropdown' ||
				(action === 'select_dropdown_option' && !hasMeaningfulSelectionInput(item))
		}

		function isDropdownChoiceHistory(item) {
			const action = normalizeActionName(item?.action)
			return action === 'choose_dropdown_option' ||
				action === 'select_checkbox_option' ||
				action === 'select_cascader_path' ||
				(action === 'select_dropdown_option' && hasMeaningfulSelectionInput(item))
		}

		function isSearchSubmitHistory(item) {
			if (!item?.success) return false
			const action = normalizeActionName(item?.action)
			if (action !== 'click_element_by_index' && action !== 'click') return false
			if (isSearchPanelExpandHistory(item)) return false
			if (isResetHistory(item)) return false
			const text = normalizeText([
				item?.input?.target_label,
				item?.input?.label,
				item?.input?.text,
				item?.nextGoal,
				item?.output,
			].filter(Boolean).join(' '))
			return /(搜索|查询|search|submit)/i.test(text)
		}

		function isSearchSubmitFailureHistory(item) {
			if (!item || item.success !== false) return false
			const action = normalizeActionName(item?.action)
			if (action !== 'click_element_by_index' && action !== 'click') return false
			if (isSearchPanelExpandHistory(item)) return false
			const text = normalizeText([
				item?.input?.target_label,
				item?.input?.label,
				item?.input?.text,
				item?.nextGoal,
				item?.output,
				item?.evaluationPreviousGoal,
			].filter(Boolean).join(' '))
			return /(搜索|查询|search|submit)/i.test(text)
		}

		function isResetHistory(item) {
			if (!item?.success) return false
			const action = normalizeActionName(item?.action)
			if (action !== 'click_element_by_index' && action !== 'click') return false
			const text = normalizeText([
				item?.input?.target_label,
				item?.input?.label,
				item?.input?.text,
				item?.nextGoal,
				item?.output,
			].filter(Boolean).join(' '))
			return /(重置|清空|reset|clear)/i.test(text)
		}

		function getHistoryOutcome(item) {
			return normalizeOutcomeObject(item?.outcome || item?.meta?.outcome)
		}

		function getHistoryFailureReason(item, fallback) {
			const outcome = getHistoryOutcome(item)
			return String(outcome?.reason || item?.output || item?.evaluationPreviousGoal || fallback || '').trim()
		}

		function getOutcomeRequestedText(outcome) {
			return String(outcome?.requestedText || outcome?.requested || '').trim()
		}

		function getOutcomeVisibleOptions(outcome) {
			return Array.isArray(outcome?.visibleOptions)
				? outcome.visibleOptions.map((item) => String(item || '').trim()).filter(isUsableLabel)
				: []
		}

		function normalizeOutcomeObject(outcome) {
			if (!outcome || typeof outcome !== 'object') return null
			const normalized = g.NC_ACTION_CONTRACT?.normalizeOutcome
				? g.NC_ACTION_CONTRACT.normalizeOutcome(outcome)
				: { ...outcome, kind: String(outcome.kind || '').trim().toLowerCase() }
			if (!normalized?.kind || normalized.kind === 'none') return null
			return normalized
		}

		return {
			normalizeActionName,
			isSearchWorkflowHistory,
			isSearchPanelExpandHistory,
			isSearchWorkflowFinishHistory,
			isSearchFieldAction,
			hasMeaningfulSelectionInput,
			isDropdownOpenHistory,
			isDropdownChoiceHistory,
			isSearchSubmitHistory,
			isSearchSubmitFailureHistory,
			isResetHistory,
			getHistoryOutcome,
			getHistoryFailureReason,
			getOutcomeRequestedText,
			getOutcomeVisibleOptions,
			normalizeOutcomeObject,
		}
	}

	g.NC_BG_SEARCH_WORKFLOW_HISTORY = {
		createSearchWorkflowHistoryHelpers,
	}
	g.NC_BG_SEARCH_WORKFLOW_HISTORY_TESTS = {
		createSearchWorkflowHistoryHelpers,
	}
})(globalThis)
