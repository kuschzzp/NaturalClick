;(function (g) {
	const plannerContext = g.NC_BG_PLANNER_CONTEXT
	if (!plannerContext) throw new Error('NC_BG_PLANNER_CONTEXT 未加载。')
	const actionContract = g.NC_ACTION_CONTRACT || null
	const controlSemantics = g.NC_CONTROL_SEMANTICS || null
	const { findObservedIndexMatches, shortText } = plannerContext

	function validateExecutableAction(action, observation, tabsSummary) {
		const name = String(action?.name || '').trim()
		const input = action?.input || {}
		const requiresIndex = new Set(['click_element_by_index', 'click', 'input_text', 'type', 'hover_element_by_index', 'open_dropdown'])
		const optionalIndex = new Set(['scroll', 'scroll_horizontally', 'select_dropdown_option', 'select_checkbox_option', 'select_cascader_path'])
		if (requiresIndex.has(name)) {
			const indexError = validateObservedIndex(input.index, observation, true)
			if (indexError) return indexError
		}
		if (optionalIndex.has(name) && input.index !== undefined && input.index !== null && input.index !== '') {
			const indexError = validateObservedIndex(input.index, observation, true)
			if (indexError) return indexError
		}
		if ((name === 'input_text' || name === 'type') && !String(input.text || '').trim()) {
			return `${name} 缺少非空 text。`
		}
		if (name === 'input_text' || name === 'type') {
			const targetError = validateTextInputTarget(input.index, observation, name)
			if (targetError) return targetError
		}
		const hasSelectionText = !!String(input.text || input.label || '').trim()
		const hasIndexInput = input.index !== undefined && input.index !== null && input.index !== ''
		if (name === 'open_dropdown' && hasSelectionText) {
			return 'open_dropdown 只负责展开下拉框，不接受 text/label；要选择选项请使用 choose_dropdown_option。'
		}
		if (name === 'open_dropdown') {
			const targetError = validateDropdownTarget(input.index, observation, name)
			if (targetError) return targetError
		}
		if (name === 'choose_dropdown_option' && !hasSelectionText) {
			return 'choose_dropdown_option 缺少待选择的 text/label。'
		}
		if (name === 'choose_dropdown_option' && !hasIndexInput) {
			return 'choose_dropdown_option 缺少目标字段 index；必须先 open_dropdown(index) 或 request_options_for(index) 确认候选后，再按该字段范围选择真实 text/label。'
		}
		if (name === 'choose_dropdown_option') {
			const indexError = validateObservedIndex(input.index, observation, true)
			if (indexError) return indexError
			const targetError = validateDropdownTarget(input.index, observation, name)
			if (targetError) return targetError
			const optionError = validateSelectionTextAgainstVisibleOptions(input.index, getActionSelectionText(input), observation, name)
			if (optionError) return optionError
		}
		if (name === 'select_dropdown_option' && !hasSelectionText && !hasIndexInput) {
			return 'select_dropdown_option 缺少 index 或待选择的 text/label。'
		}
		if (name === 'select_dropdown_option' && hasIndexInput) {
			const targetError = validateDropdownTarget(input.index, observation, name)
			if (targetError) return targetError
			if (hasSelectionText) {
				const optionError = validateSelectionTextAgainstVisibleOptions(input.index, getActionSelectionText(input), observation, name)
				if (optionError) return optionError
			}
		}
		if (name === 'select_checkbox_option' && !hasSelectionText) {
			return 'select_checkbox_option 缺少待选择的 text/label。'
		}
		if (name === 'select_checkbox_option' && hasIndexInput) {
			const optionError = validateSelectionTextAgainstVisibleOptions(input.index, getActionSelectionText(input), observation, name)
			if (optionError) return optionError
		}
		if (name === 'select_cascader_path') {
			const pathValue = Array.isArray(input.path) ? input.path.join('') : String(input.path || '')
			if (!pathValue.trim()) return 'select_cascader_path 缺少 path。'
		}
		if (name === 'open_new_tab' && !/^https?:\/\//i.test(String(input.url || '').trim())) {
			return 'open_new_tab 缺少有效 http(s) url。'
		}
		if (name === 'switch_to_tab' || name === 'close_tab') {
			const tabId = Number(input.tab_id)
			if (!Number.isFinite(tabId)) return `${name} 缺少有效 tab_id。`
			const exists = (Array.isArray(tabsSummary) ? tabsSummary : []).some((tab) => Number(tab?.id) === tabId)
			if (!exists) return `${name} 指向当前标签列表中不存在的 tab_id=${input.tab_id}。`
		}
		if (name === 'ask_user' && !String(input.question || input.text || '').trim()) {
			return 'ask_user 缺少 question。'
		}
		if (name === 'locate_by_vision' && !String(input.target_description || input.description || '').trim()) {
			return 'locate_by_vision 缺少 target_description，无法进行语义视觉定位。'
		}
		return ''
	}

	function validateActionAgainstHistory(action, session) {
		const name = normalizeActionName(action?.name)
		const input = action?.input || {}
		if (!isSelectionActionName(name)) return ''
		const currentIndex = normalizeOptionalIndex(input.index)
		const currentText = normalizeSelectionText(getActionSelectionText(input))
		const recent = Array.isArray(session?.history) ? session.history.slice(-8).reverse() : []
		for (const item of recent) {
			const historyName = normalizeActionName(item?.action)
			if (!isSelectionActionName(historyName)) continue
			const historyIndex = normalizeOptionalIndex(item?.input?.index)
			if (currentIndex !== null && historyIndex !== null && currentIndex !== historyIndex) continue
			const outcome = getHistoryOutcome(item)
			if (outcome.kind === 'failed') {
				const requested = outcome.requestedText
				const candidates = outcome.candidates
				if (selectionTextMatchesRequested(currentText, requested)) {
					return [
						`历史显示同一选择动作已经失败：index=${currentIndex ?? '-'} requested="${shortText(requested, 80)}" 未命中。`,
						candidates ? `可见候选为 "${shortText(candidates, 180)}"。` : '',
						'禁止重复同一个 requested；下一轮必须从 candidates 中选择真实候选，或先使用 request_options_for/重新展开字段确认候选。',
					].filter(Boolean).join('')
				}
			}
			if (outcome.kind === 'options_visible' && !currentText && currentIndex !== null) {
				const candidates = outcome.candidates
				if (candidates) {
					return [
						`历史显示 index=${currentIndex} 的下拉候选已经可见，候选为 "${shortText(candidates, 180)}"。`,
						'不要重复只展开同一字段；下一轮必须选择 candidates 中的真实候选，或使用 request_options_for 获取更精确候选。',
					].join('')
				}
			}
		}
		return ''
	}

	function isSelectionActionName(name) {
		return [
			'open_dropdown',
			'choose_dropdown_option',
			'select_dropdown_option',
			'select_checkbox_option',
			'select_cascader_path',
		].includes(String(name || ''))
	}

	function getActionSelectionText(input) {
		if (Array.isArray(input?.path)) return input.path.map((item) => String(item || '').trim()).filter(Boolean).join('>')
		return String(input?.text || input?.label || input?.value || input?.path || '').trim()
	}

	function selectionTextMatchesRequested(currentText, requested) {
		const requestedText = normalizeSelectionText(requested)
		if (!currentText || !requestedText) return false
		return currentText === requestedText || currentText.includes(requestedText)
	}

	function validateObservedIndex(value, observation, required) {
		if (!required && (value === undefined || value === null || value === '')) return ''
		const index = Number(value)
		if (!Number.isFinite(index)) return `动作索引无效：${value}`
		if (!hasObservedIndex(observation, index)) {
			return `动作索引 ${index} 不在当前观察到的可交互元素中。`
		}
		return ''
	}

	function hasObservedIndex(observation, index) {
		return findObservedIndexMatches(observation, index).length > 0
	}

	function validateTextInputTarget(indexValue, observation, actionName) {
		const index = Number(indexValue)
		if (!Number.isFinite(index)) return ''
		const matches = findObservedIndexMatches(observation, index)
		if (!matches.length) return ''
		const selectionMatch = matches.find((match) => isSelectionLikeItem(match.item, match.source))
		if (!selectionMatch && matches.some((match) => isPlainEditableTextItem(match.item, match.source))) return ''
		const allKnownNonEditable = matches.every((match) => match.item?.editable === false || isSelectionLikeItem(match.item, match.source))
		if (!selectionMatch && !allKnownNonEditable) return ''
		const match = selectionMatch || matches[0]
		const item = match.item || {}
		const source = String(match.source || 'unknown')
		const info = describeObservedControl(item, source)
		const role = info.role
		const control = info.control
		const fieldType = info.fieldType
		const label = item.label || item.placeholder || item.text || ''
		if (info.selectionLike) {
			return `${actionName} 目标 index=${index} 是选择控件（label="${shortText(label, 48)}", control=${control || '-'}, role=${role || '-'}, fieldType=${fieldType || '-'}），应改用 open_dropdown/choose_dropdown_option/select_checkbox_option/click 或先请求候选。`
		}
		return `${actionName} 目标 index=${index} 当前观察为不可编辑元素（label="${shortText(label, 48)}", source=${source}），应选择真实输入框或改用点击/选择动作。`
	}

	function validateDropdownTarget(indexValue, observation, actionName) {
		const index = Number(indexValue)
		if (!Number.isFinite(index)) return ''
		const matches = findObservedIndexMatches(observation, index)
		if (!matches.length) return ''
		if (matches.some((match) => isSelectionLikeItem(match.item, match.source))) return ''
		const knownEditable = matches.filter((match) => isPlainEditableTextItem(match.item, match.source))
		if (!knownEditable.length || knownEditable.length !== matches.length) return ''
		const item = knownEditable[0].item || {}
		const role = String(item.role || '').toLowerCase()
		const fieldType = String(item.fieldType || '').toLowerCase()
		const label = item.label || item.placeholder || item.text || ''
		return `${actionName} 目标 index=${index} 是普通可编辑输入框（label="${shortText(label, 48)}", role=${role || '-'}, fieldType=${fieldType || '-'}），应使用 input_text/type；只有真实下拉、combobox 或带候选项的字段才使用 open_dropdown/choose_dropdown_option。`
	}

	function validateSelectionTextAgainstVisibleOptions(indexValue, selectionText, observation, actionName) {
		const index = Number(indexValue)
		const requested = normalizeSelectionText(selectionText)
		if (!Number.isFinite(index) || !requested) return ''
		const candidates = collectSelectionCandidatesForIndex(observation, index)
		if (!candidates.length) return ''
		if (candidates.some((candidate) => selectionMatchesCandidate(requested, candidate))) return ''
		return [
			`${actionName} 目标 index=${index} 当前可见候选为 "${shortText(candidates.join('|'), 180)}"，没有 "${shortText(selectionText, 80)}"。`,
			'不要臆造或重复不存在的选项；下一轮必须从可见候选中选择真实文本，或先 request_options_for/open_dropdown 重新确认。',
		].join('')
	}

	function collectSelectionCandidatesForIndex(observation, index) {
		const matches = findObservedIndexMatches(observation, index)
		const targetItems = matches
			.filter((match) => !['options', 'popups'].includes(String(match.source || '').split(':')[0]))
			.map((match) => match.item)
			.filter(Boolean)
		const labels = []
		for (const item of targetItems) {
			if (!Array.isArray(item?.optionLabels)) continue
			for (const label of item.optionLabels) labels.push(String(label || '').trim())
		}
		const visibleItems = [
			...(Array.isArray(observation?.popups) ? observation.popups : []),
			...(Array.isArray(observation?.options) ? observation.options : []),
		].filter(Boolean)
		const scoped = getScopedVisibleOptionItems(visibleItems, targetItems)
		for (const item of scoped) {
			const label = String(item?.label || item?.text || '').trim()
			if (label) labels.push(label)
		}
		return uniqueNormalizedLabels(labels)
	}

	function getScopedVisibleOptionItems(visibleItems, targetItems) {
		if (!visibleItems.length || !targetItems.length || !controlSemantics?.scoreObservedOptionAssociation) return []
		const scored = []
		for (const item of visibleItems) {
			let best = Number.POSITIVE_INFINITY
			for (const target of targetItems) {
				const score = controlSemantics.scoreObservedOptionAssociation(item, target)
				if (Number.isFinite(score)) best = Math.min(best, score)
			}
			if (Number.isFinite(best)) scored.push({ item, score: best })
		}
		return scored.sort((a, b) => a.score - b.score).map((entry) => entry.item)
	}

	function uniqueNormalizedLabels(labels) {
		const out = []
		const seen = new Set()
		for (const label of labels) {
			const text = String(label || '').trim()
			const key = normalizeSelectionText(text)
			if (!key || seen.has(key)) continue
			seen.add(key)
			out.push(text)
		}
		return out
	}

	function selectionMatchesCandidate(requested, candidate) {
		const normalized = normalizeSelectionText(candidate)
		if (!requested || !normalized) return false
		return normalized === requested || normalized.includes(requested) || requested.includes(normalized)
	}

	function isSelectionLikeItem(item, source) {
		if (controlSemantics?.isObservedSelectionLike) return controlSemantics.isObservedSelectionLike(item, source)
		if (!item || typeof item !== 'object') return false
		const role = String(item.role || '').toLowerCase()
		const tag = String(item.tag || '').toLowerCase()
		const control = String(item.selectionControl || '').toLowerCase()
		const fieldType = String(item.fieldType || '').toLowerCase()
		if (['options', 'popups'].includes(String(source || ''))) return true
		if (Array.isArray(item.optionLabels) && item.optionLabels.length) return true
		if (control && control !== '-') return true
		if (['combobox', 'option', 'checkbox', 'radio', 'switch', 'listbox'].includes(role)) return true
		if (tag === 'select') return true
		return ['select', 'platform', 'role', 'department', 'position', 'region', 'gender'].includes(fieldType)
	}

	function isPlainEditableTextItem(item, source) {
		if (controlSemantics?.isObservedPlainEditableText) return controlSemantics.isObservedPlainEditableText(item, source)
		return item?.editable === true && !isSelectionLikeItem(item, source)
	}

	function describeObservedControl(item, source) {
		if (controlSemantics?.describeObservedControl) return controlSemantics.describeObservedControl(item, source)
		return {
			role: String(item?.role || '').toLowerCase(),
			control: String(item?.selectionControl || item?.control || '').toLowerCase(),
			fieldType: String(item?.fieldType || '').toLowerCase(),
			selectionLike: isSelectionLikeItem(item, source),
		}
	}

	function getHistoryOutcome(item) {
		const structured = normalizeStructuredOutcome(item?.outcome || item?.meta?.outcome)
		if (structured) return structured
		const output = String(item?.output || '')
		const summary = extractHistoryOutcomeSummary(output) || output
		return {
			kind: isFailedOutcome(summary) ? 'failed' : isOptionsVisibleOutcome(summary) ? 'options_visible' : '',
			requestedText: extractOutcomeField(summary, 'requested'),
			candidates: extractOutcomeField(summary, 'candidates'),
		}
	}

	function normalizeStructuredOutcome(outcome) {
		const normalized = actionContract?.normalizeOutcome
			? actionContract.normalizeOutcome(outcome)
			: normalizeOutcomeObject(outcome)
		if (!normalized?.kind || normalized.kind === 'none') return null
		return {
			kind: String(normalized.kind || '').trim().toLowerCase(),
			requestedText: String(normalized.requestedText || ''),
			candidates: Array.isArray(normalized.visibleOptions)
				? normalized.visibleOptions.map((item) => String(item)).filter(Boolean).join('|')
				: '',
		}
	}

	function normalizeOutcomeObject(outcome) {
		if (!outcome || typeof outcome !== 'object') return null
		return { ...outcome, kind: String(outcome.kind || '').trim().toLowerCase() }
	}

	function extractHistoryOutcomeSummary(output) {
		const text = String(output || '')
		const marker = '动作结果:'
		const index = text.indexOf(marker)
		if (index < 0) return ''
		return shortText(text.slice(index).trim(), 240)
	}

	function normalizeActionName(value) {
		return String(value || '').trim().replace(/[\s-]+/g, '_').toLowerCase()
	}

	function normalizeOptionalIndex(value) {
		if (value === undefined || value === null || value === '') return null
		const number = Number(value)
		return Number.isFinite(number) ? number : null
	}

	function normalizeSelectionText(value) {
		return String(value || '').trim().replace(/\s+/g, '').toLowerCase()
	}

	function isFailedOutcome(text) {
		return /动作结果:\s*failed\b/i.test(String(text || ''))
	}

	function isOptionsVisibleOutcome(text) {
		return /动作结果:\s*options_visible\b/i.test(String(text || ''))
	}

	function extractOutcomeField(text, field) {
		const pattern = new RegExp(`${field}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s]+))`, 'i')
		const match = String(text || '').match(pattern)
		return match ? String(match[2] ?? match[3] ?? match[4] ?? '').trim() : ''
	}

	g.NC_BG_PLANNER_VALIDATION = {
		getHistoryOutcome,
		validateExecutableAction,
		validateActionAgainstHistory,
	}
})(globalThis)
