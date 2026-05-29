;(function (g) {
	const stateModule = g.NC_BG_SEARCH_WORKFLOW_STATE
	const historyModule = g.NC_BG_SEARCH_WORKFLOW_HISTORY
	if (!stateModule?.createSearchStateHelpers) throw new Error('NC_BG_SEARCH_WORKFLOW_STATE is required')
	if (!historyModule?.createSearchWorkflowHistoryHelpers) throw new Error('NC_BG_SEARCH_WORKFLOW_HISTORY is required')

	const searchHistory = historyModule.createSearchWorkflowHistoryHelpers({
		normalizeText,
		isUsableLabel: (label) => !!normalizeText(label),
	})
	const searchState = stateModule.createSearchStateHelpers({
		getFieldKey,
		getFieldLabel,
		isTerminalSearchPhase,
		isFilled,
		normalizeText,
	})

	function deriveSearchWorkflowDecision(session, observation) {
		const taskIsSearchTest = isSearchTestTask(session?.latestTask || session?.task || '')
		const activeState = session?.workflowState?.search
		const hasActiveSearchState = !!activeState &&
			!isTerminalSearchPhase(activeState.phase) &&
			String(activeState.phase || '') !== 'failed'
		if (!taskIsSearchTest && !hasActiveSearchState) return null

		const collapsedPanel = findCollapsedSearchPanel(observation)
		if (collapsedPanel) return buildExpandSearchPanelDecision(collapsedPanel)

		const fields = collectSearchFields(observation)
		if (!fields.length) return null
		const state = searchState.syncSearchState(session, fields, seedSearchStateFromHistory)
		if (!state) return null
		if (String(state.phase || '') === 'failed') {
			return finishSearchWorkflowDecision(false, state.failedReason || '搜索工作流失败。')
		}
		if (allSearchFieldsCompleted(state)) {
			return finishSearchWorkflowDecision(true, '搜索/筛选区域的所有字段已完成测试。')
		}

		if (state.phase === 'awaiting_submit') {
			return buildSubmitSearchDecision(observation, state, fields)
		}
		if (state.phase === 'awaiting_reset') {
			return buildResetSearchDecision(observation, state, fields)
		}
		if (state.phase === 'awaiting_option') {
			return buildAwaitingOptionDecision(state, fields)
		}

		const field = searchState.getNextPendingField(state, fields)
		if (!field) return finishSearchWorkflowDecision(true, '搜索/筛选区域的所有字段已完成测试。')
		return buildFieldTestDecision(session, state, field)
	}

	function buildSearchWorkflowHintLines(session, observation) {
		const lines = []
		const taskIsSearchTest = isSearchTestTask(session?.latestTask || session?.task || '')
		if (!taskIsSearchTest) {
			appendSearchStateHint(lines, session?.workflowState?.search, [])
			return lines
		}
		const collapsedPanel = findCollapsedSearchPanel(observation)
		if (collapsedPanel) {
			appendSearchStateHint(lines, session?.workflowState?.search, [])
			lines.push([
				'- search_panel',
				'state="collapsed"',
				`triggerIndex="${Number(collapsedPanel.triggerIndex)}"`,
				`triggerLabel="${escapeAttr(collapsedPanel.triggerLabel || collapsedPanel.label || '展开搜索')}"`,
				'guidance="expand before testing fields"',
			].join(' '))
			return lines
		}
		const fields = collectSearchFields(observation)
		const state = fields.length
			? searchState.syncSearchState(session, fields, seedSearchStateFromHistory)
			: session?.workflowState?.search
		appendSearchStateHint(lines, state, fields)
		if (fields.length) {
			lines.push([
				'- search_fields',
				`count="${fields.length}"`,
				`items="${escapeAttr(fields.map(formatSearchFieldHint).join('; '))}"`,
				'guidance="use ReAct/model planning; do not assume unlisted dropdown options"',
			].join(' '))
		}
		const submit = findSearchSubmitAction(observation)
		const reset = findSearchResetAction(observation)
		if (submit || reset) {
			lines.push([
				'- search_actions',
				submit ? `submitIndex="${Number(submit.index)}"` : '',
				submit ? `submitLabel="${escapeAttr(getActionLabel(submit) || '搜索')}"` : '',
				reset ? `resetIndex="${Number(reset.index)}"` : '',
				reset ? `resetLabel="${escapeAttr(getActionLabel(reset) || '重置')}"` : '',
			].filter(Boolean).join(' '))
		}
		return lines
	}

	function buildExpandSearchPanelDecision(panel) {
		const label = String(panel?.triggerLabel || panel?.label || '展开搜索').trim()
		return {
			evaluation_previous_goal: '搜索/筛选区域仍处于折叠状态，需要先展开。',
			memory: '搜索测试由确定性工作流接管：先展开筛选区，再按字段逐一测试。',
			thought: '先打开页面内搜索区域，避免误操作页头全局搜索或分页控件。',
			next_goal: `展开搜索区域：${label}`,
			action: {
				name: 'click_element_by_index',
				input: {
					index: Number(panel.triggerIndex),
					target_label: label,
					workflow_step: 'expand_search_panel',
				},
			},
		}
	}

	function buildFieldTestDecision(session, state, field) {
		const key = getFieldKey(field)
		if (!key) return null
		rememberFieldMetadata(state, key, buildFieldWorkflowInput(field))
		state.activeFieldKey = key
		const label = getFieldLabel(field)
		if (isSelectionField(field)) {
			const candidate = pickOptionCandidateForField(state, field)
			if (candidate) return buildSelectionChoiceDecision(field, candidate)
			return {
				evaluation_previous_goal: `准备测试选择类搜索字段 "${label}"。`,
				memory: '选择类字段必须先展开并读取真实候选，禁止猜测选项文本。',
				thought: '该字段是下拉/选择器，先展开获取真实候选。',
				next_goal: `展开搜索字段：${label}`,
				action: {
					name: 'open_dropdown',
					input: {
						...buildFieldWorkflowInput(field),
						index: Number(field.index),
						target_label: label,
						workflow_step: 'open_dropdown',
					},
				},
			}
		}
		const text = buildSearchFieldTestText(session, field)
		return {
			evaluation_previous_goal: `准备测试文本类搜索字段 "${label}"。`,
			memory: '搜索测试按字段推进：填写当前字段后提交搜索，再重置进入下一字段。',
			thought: '该字段是可输入搜索条件，写入测试值后提交验证。',
			next_goal: `填写搜索字段：${label}`,
			action: {
				name: 'input_text',
				input: {
					...buildFieldWorkflowInput(field),
					index: Number(field.index),
					text,
					target_label: label,
					workflow_step: 'fill_field',
				},
			},
		}
	}

	function buildAwaitingOptionDecision(state, fields) {
		const field = searchState.getFieldByKey(fields, state.activeFieldKey) ||
			searchState.getNextPendingField(state, fields)
		if (!field) return finishSearchWorkflowDecision(false, '等待选择候选时找不到对应搜索字段。')
		const candidate = pickOptionCandidateForField(state, field)
		if (candidate) return buildSelectionChoiceDecision(field, candidate)
		const key = getFieldKey(field)
		const attempts = searchState.getDropdownOpenAttemptCount(state, key)
		if (attempts <= 0) {
			return buildFieldTestDecision({ task: '' }, state, field)
		}
		return finishSearchWorkflowDecision(
			false,
			`搜索字段 "${getFieldLabel(field)}" 已展开但没有检测到真实候选，已停止以避免猜选项。`
		)
	}

	function buildSelectionChoiceDecision(field, candidate) {
		const label = getFieldLabel(field)
		const actionName = isCheckboxLikeField(field) ? 'select_checkbox_option' : 'choose_dropdown_option'
		return {
			evaluation_previous_goal: `已获得搜索字段 "${label}" 的真实候选。`,
			memory: `选择候选 "${candidate}" 后提交搜索；候选来自页面观察或下拉展开结果。`,
			thought: '只从真实候选中选择，避免臆造下拉项。',
			next_goal: `选择搜索字段 "${label}" 的候选：${candidate}`,
			action: {
				name: actionName,
				input: {
					...buildFieldWorkflowInput(field),
					index: Number(field.index),
					text: candidate,
					label: candidate,
					target_label: label,
					workflow_step: 'select_option',
				},
			},
		}
	}

	function buildSubmitSearchDecision(observation, state, fields) {
		const action = findSearchSubmitAction(observation)
		if (!action) return finishSearchWorkflowDecision(false, '当前搜索区域没有找到可点击的搜索/查询按钮。')
		const field = searchState.getFieldByKey(fields, state.activeFieldKey)
		return {
			evaluation_previous_goal: '当前搜索字段已填写或已选择。',
			memory: '提交当前搜索条件，随后重置筛选项再测试下一个字段。',
			thought: '字段条件已设置，点击搜索按钮验证该字段。',
			next_goal: `点击搜索验证：${getFieldLabel(field) || state.activeFieldKey || '当前字段'}`,
			action: {
				name: 'click_element_by_index',
				input: {
					...buildFieldWorkflowInput(field || state.fields?.[state.activeFieldKey] || {}),
					index: Number(action.index),
					target_label: getActionLabel(action) || '搜索',
					workflow_step: 'submit_search',
				},
			},
		}
	}

	function buildResetSearchDecision(observation, state, fields) {
		const action = findSearchResetAction(observation)
		if (!action) return finishSearchWorkflowDecision(false, '当前搜索区域没有找到重置/清空按钮，无法安全进入下一个字段测试。')
		const key = state.activeFieldKey || state.lastSearchedFieldKey || ''
		const field = searchState.getFieldByKey(fields, key) || state.fields?.[key] || {}
		return {
			evaluation_previous_goal: '当前搜索字段已经提交。',
			memory: '重置筛选条件后才能进入下一个字段，避免多个条件叠加影响测试结果。',
			thought: '先清空当前筛选条件，再继续测试下一个搜索项。',
			next_goal: `重置搜索条件：${getFieldLabel(field) || key || '当前字段'}`,
			action: {
				name: 'click_element_by_index',
				input: {
					...buildFieldWorkflowInput(field),
					index: Number(action.index),
					target_label: getActionLabel(action) || '重置',
					workflow_step: 'reset_filters',
				},
			},
		}
	}

	function finishSearchWorkflowDecision(success, text) {
		return {
			evaluation_previous_goal: success ? '搜索字段测试已完成。' : '搜索字段测试无法继续。',
			memory: success ? '所有搜索/筛选字段均已按字段流程测试。' : String(text || ''),
			thought: success ? '状态机已完成所有字段。' : '继续自动操作可能导致误选或循环，因此停止。',
			next_goal: success ? '完成搜索字段测试' : '停止搜索字段测试',
			action: {
				name: 'done',
				input: {
					text: String(text || (success ? '搜索字段测试完成。' : '搜索字段测试失败。')),
					success: !!success,
					workflow_step: 'finish_search_fields',
				},
			},
		}
	}

	function appendSearchStateHint(lines, state, fields) {
		const phase = String(state?.phase || '').trim()
		if (!phase || isTerminalSearchPhase(phase)) return
		const activeKey = String(state?.activeFieldKey || '').trim()
		const active = getStateFieldSummary(state, fields, activeKey)
		const nextField = searchState.getNextPendingField(state, fields)
		const nextKey = nextField ? getFieldKey(nextField) : ''
		const completedKeys = Array.isArray(state?.completedKeys) ? state.completedKeys : []
		const total = Array.isArray(state?.fieldOrder) ? state.fieldOrder.length : 0
		const remaining = total > 0 ? Math.max(0, total - completedKeys.length) : -1
		const allComplete = total > 0 && remaining === 0
		const completedLabels = completedKeys
			.map((key) => getStateFieldSummary(state, fields, key).label || key)
			.filter(Boolean)
		const pendingCandidates = Array.isArray(state?.pendingDropdownCandidates)
			? state.pendingDropdownCandidates.map((item) => String(item || '').trim()).filter(Boolean)
			: []
		lines.push([
			'- search_state',
			`phase="${escapeAttr(phase)}"`,
			`activeKey="${escapeAttr(activeKey)}"`,
			active.label ? `activeLabel="${escapeAttr(active.label)}"` : '',
			Number.isFinite(Number(active.index)) ? `activeIndex="${Number(active.index)}"` : '',
			`completed="${completedKeys.length}/${total || '?'}"`,
			total > 0 ? `remaining="${remaining}"` : '',
			allComplete ? 'allComplete="true"' : '',
			completedLabels.length ? `completedLabels="${escapeAttr(completedLabels.join('|'))}"` : '',
			nextKey ? `nextKey="${escapeAttr(nextKey)}"` : '',
			nextField ? `nextIndex="${Number(nextField.index)}"` : '',
			nextField ? `nextLabel="${escapeAttr(getFieldLabel(nextField))}"` : '',
			pendingCandidates.length ? `candidates="${escapeAttr(pendingCandidates.slice(0, 8).join('|'))}"` : '',
			'guidance="search workflow is deterministic when possible; model should only continue planning when no local decision was emitted. If allComplete=true output done with success=true and workflow_step=finish_search_fields."',
		].filter(Boolean).join(' '))
	}

	function getStateFieldSummary(state, fields, key) {
		const field = searchState.getFieldByKey(fields, key)
		const stored = key ? state?.fields?.[key] : null
		return {
			index: field?.index ?? stored?.index,
			label: getFieldLabel(field) || String(stored?.label || ''),
		}
	}

	function recordSearchWorkflowOutcome(session, decision, outcome) {
		const actionInput = decision?.action?.input || {}
		const isSearchWorkflowAction = String(actionInput.workflow || '') === 'search-fields' ||
			!!actionInput.workflow_step ||
			!!session?.workflowState?.search
		if (!isSearchWorkflowAction) return
		const state = session?.workflowState?.search || createSearchState()
		if (session && (!session.workflowState || typeof session.workflowState !== 'object')) session.workflowState = {}
		if (session) session.workflowState.search = state
		const item = {
			action: decision?.action?.name || '',
			input: actionInput,
			success: outcome?.success !== false,
			output: String(outcome?.output || outcome?.message || ''),
			outcome: normalizeOutcomeObject(outcome?.outcome || outcome?.meta?.outcome),
			evaluationPreviousGoal: String(outcome?.reason || decision?.evaluation_previous_goal || ''),
			nextGoal: String(decision?.next_goal || ''),
		}
		applySearchHistoryItemToState(state, item)
	}

	function shouldRecordSearchWorkflowOutcome(session, decision, outcome) {
		const hasActiveSearchState = !!session?.workflowState?.search &&
			!isTerminalSearchPhase(session.workflowState.search.phase)
		if (!isSearchTestTask(session?.latestTask || session?.task || '') && !hasActiveSearchState) return false
		const actionInput = decision?.action?.input || {}
		if (String(actionInput.workflow || '') === 'search-fields' || String(actionInput.workflow_step || '').trim()) return true
		const item = {
			action: decision?.action?.name || '',
			input: actionInput,
			success: outcome?.success !== false,
			output: String(outcome?.output || outcome?.message || ''),
			evaluationPreviousGoal: String(outcome?.reason || decision?.evaluation_previous_goal || ''),
			nextGoal: String(decision?.next_goal || ''),
		}
		if (isSearchPanelExpandHistory(item) || isSearchSubmitHistory(item) || isSearchSubmitFailureHistory(item) || isResetHistory(item)) {
			return true
		}
		const state = session?.workflowState?.search
		if (state && !isTerminalSearchPhase(state.phase) && isSearchFieldAction(normalizeActionName(item.action))) return true
		if (!isSearchFieldAction(normalizeActionName(item.action))) return false
		const text = normalizeText([
			actionInput.target_label,
			actionInput.label,
			actionInput.text,
			decision?.next_goal,
			decision?.evaluation_previous_goal,
			decision?.memory,
			decision?.thought,
			outcome?.output,
			outcome?.message,
		].filter(Boolean).join(' '))
		return /(搜索项|筛选项|搜索字段|筛选字段|搜索条件|筛选条件|查询条件|测试字段)/i.test(text)
	}

	function createSearchState() {
		return searchState.createSearchState()
	}

	function seedSearchStateFromHistory(state, session) {
		const history = Array.isArray(session?.history) ? session.history : []
		for (const item of history) applySearchHistoryItemToState(state, item)
	}

	function applySearchHistoryItemToState(state, item) {
		if (!item || !state) return
		if (isSearchWorkflowFinishHistory(item)) {
			markSearchWorkflowCompleted(state, item)
			return
		}
		const action = normalizeActionName(item.action)
		const input = item.input || {}
		const key = findKnownFieldKeyByIndex(state, input.workflow_field_index ?? input.index) ||
			buildSyntheticFieldKey(input) ||
			String(input.workflow_field_key || '')
		const historyOutcome = getHistoryOutcome(item)
		if (isSearchFieldAction(action)) {
			if (!key) return
			rememberFieldMetadata(state, key, input)
			state.activeFieldKey = key
			if (isDropdownOpenHistory(item)) {
				incrementDropdownOpenAttempt(state, key)
				state.pendingDropdownOutput = String(item.output || '')
				state.pendingDropdownCandidates = getOutcomeVisibleOptions(historyOutcome)
				state.phase = 'awaiting_option'
				return
			}
			if (item.success === false) {
				if (isDropdownChoiceHistory(item)) {
					rememberFailedSelectionLabel(
						state,
						key,
						getOutcomeRequestedText(historyOutcome) || input.text || input.label || input.value
					)
					state.pendingDropdownOutput = String(item.output || '')
					state.pendingDropdownCandidates = getOutcomeVisibleOptions(historyOutcome)
					state.phase = 'awaiting_option'
					return
				}
				markSearchWorkflowFailed(state, getHistoryFailureReason(item, '搜索字段动作失败'))
				return
			}
			state.phase = 'awaiting_submit'
			state.pendingDropdownOutput = ''
			state.pendingDropdownCandidates = []
			return
		}
		if (action !== 'click_element_by_index' && action !== 'click') return
		if (isSearchPanelExpandHistory(item)) {
			state.phase = 'select_field'
			state.pendingDropdownOutput = ''
			state.pendingDropdownCandidates = []
			return
		}
		if (isResetHistory(item)) {
			if (item.success === false) {
				markSearchWorkflowFailed(state, getHistoryFailureReason(item, '搜索重置失败'))
				return
			}
			const completedKey = state.activeFieldKey || state.lastSearchedFieldKey || key
			if (completedKey) markSearchFieldCompleted(state, completedKey, { requiresClear: true })
			state.activeFieldKey = ''
			state.lastSearchedFieldKey = ''
			state.pendingDropdownOutput = ''
			state.pendingDropdownCandidates = []
			state.phase = 'select_field'
			return
		}
		if (isSearchSubmitHistory(item) || isSearchSubmitFailureHistory(item)) {
			if (item.success === false) {
				markSearchWorkflowFailed(state, getHistoryFailureReason(item, '搜索提交失败'))
				return
			}
			if (key) {
				rememberFieldMetadata(state, key, input)
				state.activeFieldKey = key
			}
			state.lastSearchedFieldKey = state.activeFieldKey || key || state.lastSearchedFieldKey || ''
			state.phase = 'awaiting_reset'
			return
		}
	}

	function rememberFieldMetadata(state, key, input) {
		if (!state || !key) return
		if (!Array.isArray(state.fieldOrder)) state.fieldOrder = []
		if (!state.fieldOrder.includes(key)) state.fieldOrder.push(key)
		if (!state.fields || typeof state.fields !== 'object') state.fields = {}
		state.fields[key] = {
			...(state.fields[key] || {}),
			key,
			index: Number(input?.workflow_field_index ?? input?.index),
			label: String(input?.workflow_field_label || input?.target_label || input?.label || ''),
			fieldType: String(input?.workflow_field_type || ''),
		}
	}

	function buildSyntheticFieldKey(input) {
		const index = Number(input?.workflow_field_index ?? input?.index)
		if (Number.isFinite(index)) return `index:${index}`
		const label = normalizeText(input?.workflow_field_label || input?.target_label || input?.label)
		return label ? `label:${label}` : ''
	}

	function markSearchWorkflowFailed(state, reason) {
		searchState.markSearchWorkflowFailed(state, reason)
	}

	function markSearchWorkflowCompleted(state, item) {
		const success = item?.success !== false && item?.input?.success !== false
		state.phase = 'completed'
		state.activeFieldKey = ''
		state.lastSearchedFieldKey = ''
		state.pendingDropdownOutput = ''
		state.pendingDropdownCandidates = []
		state.terminalSuccess = success
		state.terminalReason = getHistoryFailureReason(item, success ? '搜索工作流已完成' : '搜索工作流已终止')
		if (!success) state.failedReason = state.terminalReason
	}

	function isTerminalSearchPhase(phase) {
		return /^(complete|completed|done|finished|terminal)$/i.test(String(phase || '').trim())
	}

	function markSearchFieldCompleted(state, key, options = {}) {
		searchState.markSearchFieldCompleted(state, key, options)
	}

	function rememberFailedSelectionLabel(state, key, label) {
		searchState.rememberFailedSelectionLabel(state, key, label)
	}

	function incrementDropdownOpenAttempt(state, key) {
		searchState.incrementDropdownOpenAttempt(state, key)
	}

	function findKnownFieldKeyByIndex(state, indexValue) {
		return searchState.findKnownFieldKeyByIndex(state, indexValue)
	}

	function normalizeActionName(action) {
		return searchHistory.normalizeActionName(action)
	}

	function isSearchWorkflowFinishHistory(item) {
		return searchHistory.isSearchWorkflowFinishHistory(item)
	}

	function isSearchPanelExpandHistory(item) {
		return searchHistory.isSearchPanelExpandHistory(item)
	}

	function isSearchSubmitHistory(item) {
		return searchHistory.isSearchSubmitHistory(item)
	}

	function isSearchSubmitFailureHistory(item) {
		return searchHistory.isSearchSubmitFailureHistory(item)
	}

	function isResetHistory(item) {
		return searchHistory.isResetHistory(item)
	}

	function isSearchFieldAction(action) {
		return searchHistory.isSearchFieldAction(action)
	}

	function isDropdownOpenHistory(item) {
		return searchHistory.isDropdownOpenHistory(item)
	}

	function isDropdownChoiceHistory(item) {
		return searchHistory.isDropdownChoiceHistory(item)
	}

	function getHistoryOutcome(item) {
		return searchHistory.getHistoryOutcome(item)
	}

	function getHistoryFailureReason(item, fallback) {
		return searchHistory.getHistoryFailureReason(item, fallback)
	}

	function getOutcomeRequestedText(outcome) {
		return searchHistory.getOutcomeRequestedText(outcome)
	}

	function getOutcomeVisibleOptions(outcome) {
		return searchHistory.getOutcomeVisibleOptions(outcome)
	}

	function normalizeOutcomeObject(outcome) {
		return searchHistory.normalizeOutcomeObject(outcome)
	}

	function getFieldKey(field) {
		const index = Number(field?.index)
		if (Number.isFinite(index)) return `index:${index}`
		const label = normalizeText(field?.label || field?.placeholder || field?.text)
		return label ? `label:${label}` : ''
	}

	function getFieldLabel(field) {
		return String(field?.label || field?.placeholder || field?.text || '').trim()
	}

	function isSearchTestTask(taskText) {
		const text = normalizeText(taskText)
		return /(搜索|查询|筛选|过滤|search|filter)/i.test(text) &&
			/(测试|验证|检查|每个|每一个|所有|全部|功能|是否正常|test|verify|check)/i.test(text)
	}

	function findCollapsedSearchPanel(observation) {
		const panels = Array.isArray(observation?.panels) ? observation.panels : []
		return panels.find((panel) =>
			isSearchPanel(panel) &&
			/^collapsed$/i.test(String(panel?.state || '')) &&
			Number.isFinite(Number(panel?.triggerIndex))
		) || null
	}

	function isSearchPanel(panel) {
		const text = normalizeText([panel?.kind, panel?.label, panel?.triggerLabel, panel?.fields].filter(Boolean).join(' '))
		return /(filter|search|搜索|查询|筛选)/i.test(text)
	}

	function collectSearchFields(observation) {
		const panels = Array.isArray(observation?.panels) ? observation.panels : []
		const hasExpandedSearchPanel = panels.some((panel) => isSearchPanel(panel) && /^expanded$/i.test(String(panel?.state || '')))
		const fields = []
		for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
			const formText = normalizeText([form?.id, form?.name].filter(Boolean).join(' '))
			const formLooksSearch = /(filter|search|搜索|查询|筛选)/i.test(formText)
			for (const field of (Array.isArray(form?.fields) ? form.fields : [])) {
				if (!Number.isFinite(Number(field?.index))) continue
				if (!isBusinessSearchRegion(field)) continue
				const containerText = normalizeText([field?.semanticContainer, field?.container].filter(Boolean).join(' '))
				const fieldLooksSearch = /(filter|search|搜索|查询|筛选)/i.test(containerText)
				if (!hasExpandedSearchPanel && !formLooksSearch && !fieldLooksSearch) continue
				if (!isUsableSearchField(field)) continue
				fields.push(field)
			}
		}
		return dedupeFields(fields)
	}

	function isBusinessSearchRegion(field) {
		const region = String(field?.region || '').trim().toLowerCase()
		return !region || ['content', 'dialog', 'popover'].includes(region)
	}

	function isUsableSearchField(field) {
		const label = getFieldLabel(field)
		if (!label || /^(请输入|to)$/i.test(label)) return false
		const role = String(field?.role || '').toLowerCase()
		const type = String(field?.type || '').toLowerCase()
		const fieldType = String(field?.fieldType || '').toLowerCase()
		if (['hidden', 'button', 'submit'].includes(type)) return false
		if (['button', 'link'].includes(role)) return false
		return !!fieldType || !!role || !!type
	}

	function dedupeFields(fields) {
		const seen = new Set()
		const out = []
		for (const field of fields) {
			const key = getFieldKey(field)
			if (!key || seen.has(key)) continue
			seen.add(key)
			out.push(field)
		}
		return out
	}

	function isSelectionField(field) {
		const role = String(field?.role || '').toLowerCase()
		const control = String(field?.selectionControl || field?.control || '').toLowerCase()
		const fieldType = String(field?.fieldType || '').toLowerCase()
		if (Array.isArray(field?.optionLabels) && field.optionLabels.length) return true
		if (['combobox', 'listbox'].includes(role)) return true
		if (/(dropdown|select|cascader|checkbox|radio)/i.test(control)) return true
		return /(select|platform|role|department|position|region|gender|status|state|type|category|date|time)/i.test(fieldType)
	}

	function findSearchSubmitAction(observation) {
		return findActionByText(observation, /(搜索|查询|search|submit)/i)
	}

	function findSearchResetAction(observation) {
		return findActionByText(observation, /(重置|清空|reset|clear)/i)
	}

	function findActionByText(observation, pattern) {
		const actions = Array.isArray(observation?.actions) ? observation.actions : []
		return actions.find((action) => {
			if (!Number.isFinite(Number(action?.index))) return false
			const region = String(action?.region || '').trim().toLowerCase()
			if (region && !['content', 'dialog', 'popover'].includes(region)) return false
			const text = normalizeText([
				action?.actionIntent,
				action?.intent,
				action?.label,
				action?.text,
				action?.valueState,
			].filter(Boolean).join(' '))
			return pattern.test(text)
		}) || null
	}

	function getActionLabel(action) {
		return String(action?.label || action?.text || '').trim()
	}

	function formatSearchFieldHint(field) {
		const index = Number(field?.index)
		const label = getFieldLabel(field) || `index:${index}`
		const fieldType = String(field?.fieldType || '').trim() || '-'
		const value = String(field?.valueState || field?.value || '').trim() || 'unknown'
		const control = isSelectionField(field) ? 'selection' : 'text'
		const optionLabels = Array.isArray(field?.optionLabels)
			? field.optionLabels.map((item) => String(item || '').trim()).filter(Boolean)
			: []
		const optionText = optionLabels.length ? `,options=${optionLabels.slice(0, 8).join('|')}` : ''
		return `${label}[index=${Number.isFinite(index) ? index : '-'},type=${fieldType},control=${control},value=${value}${optionText}]`
	}

	function isFilled(field) {
		return /^filled:|^selected:/i.test(String(field?.valueState || field?.value || ''))
	}

	function allSearchFieldsCompleted(state) {
		const total = Array.isArray(state?.fieldOrder) ? state.fieldOrder.length : 0
		const completed = Array.isArray(state?.completedKeys) ? state.completedKeys.length : 0
		return total > 0 && completed >= total
	}

	function buildFieldWorkflowInput(field) {
		const key = getFieldKey(field)
		return {
			workflow_field_key: key,
			workflow_field_index: Number(field?.index),
			workflow_field_label: getFieldLabel(field),
			workflow_field_type: String(field?.fieldType || ''),
		}
	}

	function buildSearchFieldTestText(session, field) {
		const taskText = String(session?.latestTask || session?.task || '')
		const label = normalizeText(getFieldLabel(field))
		const fieldType = String(field?.fieldType || '').toLowerCase()
		const type = String(field?.type || '').toLowerCase()
		if (/(username|account|login|user)/i.test(fieldType) || /(登录账号|用户名|账号|账户|account|username)/i.test(label)) {
			return extractTaskValue(taskText, /(?:登录账号|用户名|账号|账户|account|username)\s*[:：]?\s*([A-Za-z0-9_.@-]{2,64})/i) || 'admin'
		}
		if (/(phone|mobile|tel)/i.test(fieldType) || /(手机|电话|手机号|phone|mobile|tel)/i.test(label)) return '13800138000'
		if (/(email|mail)/i.test(fieldType) || /(邮箱|邮件|email|mail)/i.test(label)) return 'test@example.com'
		if (/(date|time)/i.test(fieldType) || type === 'date' || /(日期|时间|开始|结束|date|time)/i.test(label)) return '2026-01-01'
		if (/(number|amount|price|count|quantity)/i.test(fieldType) || type === 'number') return '1'
		if (/(name|realname)/i.test(fieldType) || /(姓名|名称|名字|name)/i.test(label)) return '测试'
		return '测试'
	}

	function extractTaskValue(text, pattern) {
		const match = String(text || '').match(pattern)
		return String(match?.[1] || '').trim()
	}

	function pickOptionCandidateForField(state, field) {
		const key = getFieldKey(field)
		const failed = new Set((state?.failedLabelsByKey?.[key] || []).map(normalizeText).filter(Boolean))
		const candidates = [
			...(Array.isArray(state?.pendingDropdownCandidates) ? state.pendingDropdownCandidates : []),
			...(Array.isArray(field?.optionLabels) ? field.optionLabels : []),
		]
		const seen = new Set()
		for (const candidate of candidates) {
			const text = String(candidate || '').trim()
			const normalized = normalizeText(text)
			if (!normalized || seen.has(normalized) || failed.has(normalized)) continue
			seen.add(normalized)
			return text
		}
		return ''
	}

	function isCheckboxLikeField(field) {
		const control = String(field?.selectionControl || field?.control || '').toLowerCase()
		const fieldType = String(field?.fieldType || '').toLowerCase()
		return /(checkbox|multi|multiple)/i.test(control) || /(checkbox|multi|multiple)/i.test(fieldType)
	}

	function normalizeText(value) {
		return String(value || '').replace(/\s+/g, '').trim()
	}

	function escapeAttr(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
	}

	g.NC_BG_SEARCH_WORKFLOW = {
		buildSearchWorkflowHintLines,
		deriveSearchWorkflowDecision,
		recordSearchWorkflowOutcome,
		shouldRecordSearchWorkflowOutcome,
	}
	g.NC_BG_SEARCH_WORKFLOW_TESTS = {
		applySearchHistoryItemToState,
		buildSearchWorkflowHintLines,
		buildSearchFieldTestText,
		collectSearchFields,
		createSearchState,
		deriveSearchWorkflowDecision,
		isSearchTestTask,
		pickOptionCandidateForField,
		recordSearchWorkflowOutcome,
		shouldRecordSearchWorkflowOutcome,
	}
})(globalThis)
