;(function (g) {
	const stateModule = g.NC_BG_SEARCH_WORKFLOW_STATE
	const historyModule = g.NC_BG_SEARCH_WORKFLOW_HISTORY
	if (!stateModule?.createSearchStateHelpers) throw new Error('NC_BG_SEARCH_WORKFLOW_STATE is required')
	if (!historyModule?.createSearchWorkflowHistoryHelpers) throw new Error('NC_BG_SEARCH_WORKFLOW_HISTORY is required')
	const controlSemantics = g.NC_CONTROL_SEMANTICS || null
	const taskIntent = g.NC_BG_TASK_INTENT || null

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
		const taskIsSearchTest = isSearchWorkflowTask(session)
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
		const unclearedField = searchState.findUnclearedCompletedField(state, fields)
		if (unclearedField) {
			return buildUnclearedFieldResetDecision(observation, state, fields, unclearedField)
		}
		if (allSearchFieldsCompleted(state)) {
			return buildFinalSearchWorkflowDecision(state)
		}
		if (
			state.phase === 'select_field' &&
			!state.baselineResetDone &&
			hasFilledSearchFields(fields)
		) {
			return buildBaselineResetSearchDecision(observation, fields, state)
		}

		if (state.phase === 'awaiting_submit') {
			return buildSubmitSearchDecision(observation, state, fields)
		}
		if (state.phase === 'awaiting_reset') {
			return buildResetSearchDecision(observation, state, fields)
		}
		if (state.phase === 'awaiting_option') {
			return buildAwaitingOptionDecision(session, state, fields, observation)
		}

		const field = searchState.getNextPendingField(state, fields)
		if (!field) return buildFinalSearchWorkflowDecision(state)
		return buildFieldTestDecision(session, state, field, observation)
	}

	function buildSearchWorkflowHintLines(session, observation) {
		const lines = []
		const taskIsSearchTest = isSearchWorkflowTask(session)
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
		const submit = findSearchSubmitAction(observation, fields)
		const reset = findSearchResetAction(observation, fields)
		if (fields.length) {
			lines.push([
				'- search_fields',
				`count="${fields.length}"`,
				`items="${escapeAttr(fields.map(formatSearchFieldHint).join('; '))}"`,
				'guidance="use ReAct/model planning; do not assume unlisted dropdown options"',
			].join(' '))
			appendSearchDataSamplesHint(lines, session, observation, fields)
			appendSearchResetRequirementHint(lines, fields, state, reset)
			appendSearchSubmitRequirementHint(lines, fields, state, submit)
			appendSearchDataRequirementHint(lines, session, observation, fields, state)
		}
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

	function appendSearchDataRequirementHint(lines, session, observation, fields, state = null) {
		const optionMismatches = collectSelectionFieldSampleMismatches(state, fields, observation)
		if (optionMismatches.length) {
			lines.push([
				'- search_option_requirement',
				'status="option_sample_mismatch"',
				`fields="${escapeAttr(optionMismatches.map((item) => getFieldLabel(item.field)).filter(Boolean).join('|'))}"`,
				Number.isFinite(Number(optionMismatches[0]?.field?.index)) ? `activeIndex="${Number(optionMismatches[0].field.index)}"` : '',
				`samples="${escapeAttr(buildOptionMismatchSummary(optionMismatches))}"`,
				`visibleCandidates="${escapeAttr(buildOptionMismatchCandidateSummary(optionMismatches))}"`,
				'guidance="列表样本与可见候选不匹配；先 request_options_for 或重新 open_dropdown 获取完整候选，不要选择非匹配候选。"',
			].filter(Boolean).join(' '))
		}
		const unobservedOptions = getSelectionFieldOptionsUnobserved(state, fields, observation, session)
		if (unobservedOptions) {
			lines.push([
				'- search_option_requirement',
				'status="option_candidates_unobserved"',
				`fields="${escapeAttr(getFieldLabel(unobservedOptions.field) || getFieldKey(unobservedOptions.field))}"`,
				Number.isFinite(Number(unobservedOptions.field?.index)) ? `activeIndex="${Number(unobservedOptions.field.index)}"` : '',
				unobservedOptions.sample ? `samples="${escapeAttr(`${getFieldLabel(unobservedOptions.field) || getFieldKey(unobservedOptions.field)}:${unobservedOptions.sample}`)}"` : '',
				unobservedOptions.taskValue ? `taskValue="${escapeAttr(unobservedOptions.taskValue)}"` : '',
				`attempts="${Number(unobservedOptions.attempts) || 0}"`,
				'guidance="选择字段已尝试展开但未观测到候选；先 request_options_for 或 inspect_region popups/content 确认弹层候选，不要猜选项。"',
			].filter(Boolean).join(' '))
		}
		const sampleDependentFields = (Array.isArray(fields) ? fields : [])
			.filter((field) => buildSearchFieldTestValue(session, field, observation).source === 'missing_sample')
		if (!sampleDependentFields.length) return
		const selectionFields = sampleDependentFields.filter(isSelectionField)
		const candidateSummary = buildSearchDataRequirementCandidateSummary(state, selectionFields)
		const guidance = selectionFields.length
			? '当前搜索选择字段缺少可用列表样本或任务显式值；即使下拉候选可见，也不要随意选择第一个候选；先 request_context source=tables 或 inspect_region content 获取对应列样本，不要填泛化测试词。'
			: '当前搜索字段缺少可用列表样本；先 request_context source=tables 或 inspect_region content 获取列表数据，不要填泛化测试词。'
		lines.push([
			'- search_data_requirement',
			'status="missing_table_samples"',
			`fields="${escapeAttr(sampleDependentFields.map(getFieldLabel).filter(Boolean).join('|'))}"`,
			selectionFields.length ? `selectionFields="${escapeAttr(selectionFields.map(getFieldLabel).filter(Boolean).join('|'))}"` : '',
			candidateSummary ? `visibleCandidates="${escapeAttr(candidateSummary)}"` : '',
			`guidance="${escapeAttr(guidance)}"`,
		].join(' '))
	}

	function appendSearchDataSamplesHint(lines, session, observation, fields) {
		const samples = collectSearchFieldTableSamples(session, observation, fields)
		if (!samples.length) return
		lines.push([
			'- search_data_samples',
			'status="available"',
			`fields="${escapeAttr(samples.map((item) => item.label).join('|'))}"`,
			`samples="${escapeAttr(samples.map((item) => `${item.label}:${item.value}`).join('; '))}"`,
			'guidance="已从当前列表/表格提取字段样本；优先使用这些真实样本逐项测试，提交验证后先清空条件再进入下一项，不要随机造值。"',
		].join(' '))
	}

	function collectSearchFieldTableSamples(session, observation, fields) {
		const seen = new Set()
		const samples = []
		for (const field of (Array.isArray(fields) ? fields : [])) {
			const value = buildSearchFieldTestValue(session, field, observation)
			if (value.source !== 'table_sample' || !value.text) continue
			const label = getFieldLabel(field) || getFieldKey(field)
			const key = `${normalizeText(label)}:${normalizeText(value.text)}`
			if (!label || seen.has(key)) continue
			seen.add(key)
			samples.push({ label, value: value.text })
			if (samples.length >= 8) break
		}
		return samples
	}

	function appendSearchResetRequirementHint(lines, fields, state, resetAction) {
		if (resetAction) return
		const requirement = getSearchResetRequirement(fields, state)
		if (!requirement) return
		const labels = getResetRequirementLabels(requirement)
		const clearableFields = (Array.isArray(requirement.fields) ? requirement.fields : [])
			.filter(canClearSearchFieldByInput)
		const hasFieldClearFallback = clearableFields.length > 0
		lines.push([
			'- search_reset_requirement',
			`status="${hasFieldClearFallback ? 'field_clear_fallback_available' : 'reset_action_missing'}"`,
			`context="${escapeAttr(requirement.context)}"`,
			labels.length ? `fields="${escapeAttr(labels.join('|'))}"` : '',
			hasFieldClearFallback ? `clearableFields="${escapeAttr(clearableFields.map(getFieldLabel).filter(Boolean).join('|'))}"` : '',
			Number.isFinite(Number(requirement.field?.index)) ? `activeIndex="${Number(requirement.field.index)}"` : '',
			hasFieldClearFallback
				? 'guidance="当前未观测到清空/重置按钮，但普通可编辑文本字段可用字段级置空兜底；选择/日期/多选控件仍需 request_context source=actions 或 inspect_region content 查找清空入口，不要猜测清空。"'
				: 'guidance="需要先 request_context source=actions 或 inspect_region content 查找清空/重置/清除/取消筛选按钮；不要带残留条件继续测试。"',
		].filter(Boolean).join(' '))
	}

	function appendSearchSubmitRequirementHint(lines, fields, state, submitAction) {
		if (submitAction) return
		const requirement = getSearchSubmitRequirement(fields, state)
		if (!requirement) return
		const label = getFieldLabel(requirement.field) || String(requirement.field?.label || requirement.field?.key || '').trim()
		lines.push([
			'- search_submit_requirement',
			'status="submit_action_missing"',
			'context="after_field_value"',
			label ? `fields="${escapeAttr(label)}"` : '',
			Number.isFinite(Number(requirement.field?.index)) ? `activeIndex="${Number(requirement.field.index)}"` : '',
			requirement.testValue ? `testValue="${escapeAttr(requirement.testValue)}"` : '',
			'guidance="搜索字段已设置但未观测到搜索/查询/筛选/应用筛选按钮；先 request_context source=actions 或 inspect_region content 查找提交入口，不要跳过提交验证或直接清空进入下一项。"',
		].filter(Boolean).join(' '))
	}

	function getSearchSubmitRequirement(fields, state) {
		if (!Array.isArray(fields) || !fields.length || !state || state.phase !== 'awaiting_submit') return null
		const key = state.activeFieldKey || ''
		const field = (key && searchState.getFieldByKey(fields, key)) || state.fields?.[key] || null
		if (!field) return null
		const stored = state.fields?.[key] || {}
		return {
			field,
			testValue: String(stored.lastTestValue || '').trim(),
		}
	}

	function getSearchResetRequirement(fields, state) {
		if (!Array.isArray(fields) || !fields.length || !state) return null
		const unclearedField = searchState.findUnclearedCompletedField(state, fields)
		if (unclearedField) return { context: 'clear_retry', field: unclearedField, fields: [unclearedField] }
		if (state.phase === 'awaiting_reset') {
			const key = state.activeFieldKey || state.lastSearchedFieldKey || ''
			const field = (key && searchState.getFieldByKey(fields, key)) || state.fields?.[key] || null
			return {
				context: 'after_submit',
				field,
				fields: field ? [field] : [],
			}
		}
		if (state.phase === 'select_field' && !state.baselineResetDone && hasFilledSearchFields(fields)) {
			const filledFields = fields.filter(isFilled)
			return { context: 'baseline', field: filledFields[0] || null, fields: filledFields }
		}
		return null
	}

	function getResetRequirementLabels(requirement) {
		const labels = []
		for (const field of (Array.isArray(requirement?.fields) ? requirement.fields : [])) {
			const label = getFieldLabel(field) || String(field?.label || field?.workflow_field_label || field?.key || '').trim()
			if (label) labels.push(label)
		}
		return [...new Set(labels)]
	}

	function buildSearchDataRequirementCandidateSummary(state, fields) {
		const parts = []
		for (const field of (Array.isArray(fields) ? fields : [])) {
			const candidates = collectFieldVisibleCandidatesForHint(state, field)
			if (!candidates.length) continue
			parts.push(`${getFieldLabel(field) || getFieldKey(field)}:${candidates.slice(0, 6).join('|')}`)
		}
		return parts.join('; ')
	}

	function collectFieldVisibleCandidatesForHint(state, field) {
		const key = getFieldKey(field)
		const values = [
			...(Array.isArray(field?.optionLabels) ? field.optionLabels : []),
			...(key && key === String(state?.activeFieldKey || '') && Array.isArray(state?.pendingDropdownCandidates)
				? state.pendingDropdownCandidates
				: []),
		]
		const seen = new Set()
		const result = []
		for (const value of values) {
			if (!isUsableSearchOptionCandidate(value, field, state)) continue
			const text = String(value || '').trim()
			const normalized = normalizeText(text)
			if (!normalized || seen.has(normalized)) continue
			seen.add(normalized)
			result.push(text)
		}
		return result
	}

	function collectSelectionFieldSampleMismatches(state, fields, observation) {
		const mismatches = []
		for (const field of (Array.isArray(fields) ? fields : [])) {
			const mismatch = getSelectionFieldSampleMismatch(state, field, observation)
			if (mismatch) mismatches.push(mismatch)
		}
		return mismatches
	}

	function buildOptionMismatchSummary(mismatches) {
		return (Array.isArray(mismatches) ? mismatches : [])
			.map((item) => `${getFieldLabel(item.field) || getFieldKey(item.field)}:${item.sample}`)
			.filter(Boolean)
			.join('; ')
	}

	function buildOptionMismatchCandidateSummary(mismatches) {
		return (Array.isArray(mismatches) ? mismatches : [])
			.map((item) => `${getFieldLabel(item.field) || getFieldKey(item.field)}:${item.candidates.slice(0, 6).join('|')}`)
			.filter(Boolean)
			.join('; ')
	}

	function getSelectionFieldOptionsUnobserved(state, fields, observation, session = null) {
		const activeKey = String(state?.activeFieldKey || '')
		const field = (activeKey ? searchState.getFieldByKey(fields, activeKey) : null) ||
			(Array.isArray(fields) ? fields : []).find((item) => {
				const key = getFieldKey(item)
				return isSelectionField(item) && searchState.getDropdownOpenAttemptCount(state, key) > 0
			})
		if (!field || !isSelectionField(field)) return null
		if (collectUsableOptionCandidates(state, field, observation).length) return null
		const key = getFieldKey(field)
		const attempts = searchState.getDropdownOpenAttemptCount(state, key)
		if (attempts <= 0) return null
		return {
			field,
			attempts,
			sample: pickSearchFieldSampleText(observation, field),
			taskValue: extractTaskSearchValueForField(String(session?.latestTask || session?.task || ''), field),
		}
	}

	function buildFieldTestDecision(session, state, field, observation) {
		const key = getFieldKey(field)
		if (!key) return null
		if (String(state?.activeFieldKey || '').trim() !== key) {
			state.pendingDropdownOutput = ''
			state.pendingDropdownCandidates = []
		}
		const value = buildSearchFieldTestValue(session, field, observation)
		rememberFieldMetadata(state, key, {
			...buildFieldWorkflowInput(field),
			workflow_test_value: value.text,
			workflow_value_source: value.source,
			workflow_value_basis: value.basis,
		})
		state.activeFieldKey = key
		const label = getFieldLabel(field)
		if (isSelectionField(field)) {
			const candidate = pickOptionCandidateDetailForField(state, field, observation, session)
			if (candidate.text) return buildSelectionChoiceDecision(field, candidate)
			const mismatch = getSelectionFieldSampleMismatch(state, field, observation)
			if (mismatch) return buildOptionSampleMismatchDecision(state, field, mismatch)
			if (hasUsableOptionCandidate(state, field, observation)) {
				return buildEvidenceStopOrSkipDecision(
					state,
					field,
					`搜索字段 "${label}" 已有真实候选，但当前没有可用列表样本或任务显式值用于选择候选，已停止以避免无依据搜索。`,
					{
						...buildFieldWorkflowInput(field),
						workflow_missing_table_samples: true,
					}
				)
			}
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
		if (value.source === 'missing_sample') {
			return buildEvidenceStopOrSkipDecision(
				state,
				field,
				`搜索字段 "${label}" 当前没有可用列表样本或任务显式值，继续使用泛化测试词容易得到空结果，已停止以避免无意义测试。`,
				{
					...buildFieldWorkflowInput(field),
					workflow_missing_table_samples: true,
				}
			)
		}
		return buildTextSearchFillDecision(field, value)
	}

	function buildAwaitingOptionDecision(session, state, fields, observation) {
		const field = searchState.getFieldByKey(fields, state.activeFieldKey) ||
			searchState.getNextPendingField(state, fields)
		if (!field) return finishSearchWorkflowDecision(false, '等待选择候选时找不到对应搜索字段。')
		const rangeCompletion = buildPendingDateRangeCompletionDecision(state, field, observation)
		if (rangeCompletion) return rangeCompletion
		const candidate = pickOptionCandidateDetailForField(state, field, observation, session)
		if (candidate.text) return buildSelectionChoiceDecision(field, candidate)
		const mismatch = getSelectionFieldSampleMismatch(state, field, observation)
		if (mismatch) return buildOptionSampleMismatchDecision(state, field, mismatch)
		if (hasUsableOptionCandidate(state, field, observation)) {
			return buildEvidenceStopOrSkipDecision(
				state,
				field,
				`搜索字段 "${getFieldLabel(field)}" 已展开并有真实候选，但当前没有可用列表样本或任务显式值用于选择候选，已停止以避免无依据搜索。`,
				{
					...buildFieldWorkflowInput(field),
					workflow_missing_table_samples: true,
				}
			)
		}
		const key = getFieldKey(field)
		const attempts = searchState.getDropdownOpenAttemptCount(state, key)
		if (attempts <= 0) {
			return buildFieldTestDecision({ task: '' }, state, field, null)
		}
		return buildOptionCandidatesUnobservedDecision(session, state, field, observation, attempts)
	}

	function buildSelectionChoiceDecision(field, candidate) {
		const label = getFieldLabel(field)
		const candidateText = String(candidate?.text || candidate || '').trim()
		const source = String(candidate?.source || 'option_candidate').trim()
		const basis = String(candidate?.basis || '真实可见候选').trim()
		const isCascader = isCascaderLikeField(field)
		const actionName = isCheckboxLikeField(field)
			? 'select_checkbox_option'
			: isCascader
				? 'select_cascader_path'
				: 'choose_dropdown_option'
		const cascaderPath = isCascader ? parseSearchCascaderCandidatePath(candidateText) : []
		return {
			evaluation_previous_goal: `已获得搜索字段 "${label}" 的真实候选。`,
			memory: `选择候选 "${candidateText}" 后提交搜索；候选来源=${source}${basis ? `，依据=${basis}` : ''}。`,
			thought: source === 'table_sample'
				? '候选来自真实下拉项，并与当前列表对应列已有值匹配，优先用于避免空结果。'
				: '只从真实候选中选择，避免臆造下拉项。',
			next_goal: `选择搜索字段 "${label}" 的候选：${candidateText}`,
			action: {
				name: actionName,
				input: {
					...buildFieldWorkflowInput(field),
					index: Number(field.index),
					target_label: label,
					workflow_value_source: source,
					workflow_value_basis: basis,
					workflow_step: 'select_option',
					workflow_test_value: candidateText,
					...(isCascader
						? { path: cascaderPath }
						: { text: candidateText, label: candidateText }),
				},
			},
		}
	}

	function buildTextSearchFillDecision(field, value) {
		const label = getFieldLabel(field)
		const source = String(value?.source || '').trim()
		const basis = String(value?.basis || '').trim()
		return {
			evaluation_previous_goal: `准备测试文本类搜索字段 "${label}"。`,
			memory: `搜索测试按字段推进：填写当前字段后提交搜索，再重置进入下一字段。测试值来源=${source}${basis ? `，依据=${basis}` : ''}。`,
			thought: source === 'table_sample'
				? '该字段是可输入搜索条件，使用列表已有数据作为搜索值，避免随机词导致空结果。'
				: '该字段是可输入搜索条件，写入可解释来源的测试值后提交验证。',
			next_goal: `填写搜索字段：${label}`,
			action: {
				name: 'input_text',
				input: {
					...buildFieldWorkflowInput(field),
					index: Number(field.index),
					text: String(value?.text || '').trim(),
					target_label: label,
					workflow_value_source: source,
					workflow_value_basis: basis,
					workflow_step: 'fill_field',
				},
			},
		}
	}

	function buildOptionSampleMismatchDecision(state, field, mismatch) {
		const label = getFieldLabel(field)
		const sample = String(mismatch?.sample || '').trim()
		const visible = (Array.isArray(mismatch?.candidates) ? mismatch.candidates : [])
			.slice(0, 8)
			.join('|')
		return buildEvidenceStopOrSkipDecision(
			state,
			field,
			`搜索字段 "${label}" 已有列表样本 "${sample}"，但当前可见候选（${visible || '无'}）没有匹配项；需要重新展开或 request_options_for 获取完整候选，已停止以避免选择不匹配候选。`,
			{
				...buildFieldWorkflowInput(field),
				workflow_option_sample_mismatch: true,
				workflow_table_sample: sample,
				workflow_visible_candidates: visible,
			}
		)
	}

	function buildOptionCandidatesUnobservedDecision(session, state, field, observation, attempts) {
		const label = getFieldLabel(field)
		const sample = pickSearchFieldSampleText(observation, field)
		const taskValue = extractTaskSearchValueForField(String(session?.latestTask || session?.task || ''), field)
		return buildEvidenceStopOrSkipDecision(
			state,
			field,
			`搜索字段 "${label}" 已尝试展开 ${Number(attempts) || 1} 次，但当前观察没有检测到真实候选；需要 request_options_for 或检查弹层区域后再选择，已停止以避免猜选项。`,
			{
				...buildFieldWorkflowInput(field),
				workflow_option_candidates_unobserved: true,
				workflow_dropdown_attempts: Number(attempts) || 1,
				workflow_table_sample: sample,
				workflow_expected_value: taskValue || sample,
				workflow_dropdown_output: String(state?.pendingDropdownOutput || '').slice(0, 240),
			}
		)
	}

	function buildEvidenceStopOrSkipDecision(state, field, reason, extraInput = {}) {
		const key = getFieldKey(field)
		if (state && key && searchState.getEvidenceRequestAttemptCount(state, key) > 0) {
			return buildSearchFieldSkipDecision(field, reason, extraInput)
		}
		return finishSearchWorkflowDecision(false, reason, extraInput)
	}

	function buildSearchFieldSkipDecision(field, reason, extraInput = {}) {
		const label = getFieldLabel(field) || String(field?.label || field?.key || '').trim() || '当前字段'
		const skipReason = formatSearchSkipReason(reason)
		const summary = formatSearchSkipReason(extraInput.workflow_result_summary || `该字段未安全测试：${skipReason}`)
		return {
			evaluation_previous_goal: `搜索字段 "${label}" 缺少足够证据。`,
			memory: `已避免对 "${label}" 使用随机值或不匹配候选；记录为未确认并继续后续字段。`,
			thought: '单个字段缺少真实样本/候选证据时，不终止整轮搜索测试，而是安全跳过并继续覆盖其它字段。',
			next_goal: `安全跳过搜索字段：${label}`,
			action: {
				name: 'wait',
				input: {
					...buildFieldWorkflowInput(field),
					...(extraInput && typeof extraInput === 'object' ? extraInput : {}),
					ms: 200,
					reason: `记录搜索字段安全跳过：${label}`,
					text: formatSearchSkipReason(extraInput.text || summary || skipReason || ''),
					workflow: 'search-fields',
					workflow_step: 'skip_field',
					workflow_field_skipped: true,
					workflow_value_source: 'missing_sample',
					workflow_result_status: 'unknown_missing_sample',
					workflow_result_summary: summary,
					workflow_skip_reason: skipReason,
				},
			},
		}
	}

	function formatSearchSkipReason(value) {
		return String(value || '')
			.trim()
			.replace(/已停止以避免/g, '已安全跳过以避免')
			.replace(/停止以避免/g, '安全跳过以避免')
			.replace(/已停止/g, '已安全跳过')
			.replace(/，?\s*停止。?$/g, '，已安全跳过。')
	}

	function buildPendingDateRangeCompletionDecision(state, field, observation = null) {
		if (!state || !field || !isDateRangeField(field)) return null
		const key = getFieldKey(field)
		const start = normalizeDateCandidate(state.pendingDateRangeStartByKey?.[key] || '')
		if (!key || !start) return null
		const failed = new Set((state?.failedLabelsByKey?.[key] || []).map(normalizeText).filter(Boolean))
		const range = pickDateRangeCandidate(collectUsableOptionCandidates(state, field, observation), failed, start)
		if (!range) {
			return buildSearchFieldSkipDecision(
				field,
				`搜索字段 "${getFieldLabel(field)}" 已选择开始日期 "${start}"，但当前没有可用的第二个日期候选完成范围，已跳过以避免半选日期范围提交。`,
				{
					workflow_option_candidates_unobserved: true,
					workflow_expected_value: start,
				}
			)
		}
		const peer = range.split('..').find((item) => normalizeDateCandidate(item) !== start) || range.split('..')[1] || start
		const label = getFieldLabel(field)
		return {
			evaluation_previous_goal: `搜索字段 "${label}" 已选择日期范围起点。`,
			memory: `日期范围控件需要开始和结束日期；已选起点=${start}，下一步选择终点=${peer}，避免半选范围直接提交。`,
			thought: '补齐日期范围的第二个真实日期候选，再提交搜索验证。',
			next_goal: `补齐搜索字段 "${label}" 的日期范围：${range}`,
			action: {
				name: 'choose_dropdown_option',
				input: {
					...buildFieldWorkflowInput(field),
					index: Number(field.index),
					text: peer,
					label: peer,
					target_label: label,
					workflow_test_value: range,
					workflow_value_source: 'visible_option',
					workflow_value_basis: `日期范围起点：${start}`,
					workflow_step: 'select_option',
					workflow_date_range_completion: true,
				},
			},
		}
	}

	function buildSubmitSearchDecision(observation, state, fields) {
		const action = findSearchSubmitAction(observation, fields)
		const field = searchState.getFieldByKey(fields, state.activeFieldKey)
		const stored = state.fields?.[state.activeFieldKey] || {}
		if (!action) return buildSubmitActionMissingDecision(field || stored, stored)
		return {
			evaluation_previous_goal: '当前搜索字段已填写或已选择。',
			memory: `提交当前搜索条件，随后观察结果并重置筛选项再测试下一个字段。${stored.lastTestValue ? `当前值=${stored.lastTestValue}，来源=${stored.lastValueSource || 'unknown'}。` : ''}`,
			thought: '字段条件已设置，点击搜索按钮验证该字段。',
			next_goal: `点击搜索验证：${getFieldLabel(field) || state.activeFieldKey || '当前字段'}`,
			action: {
				name: 'click_element_by_index',
				input: {
					...buildFieldWorkflowInput(field || stored),
					index: Number(action.index),
					target_label: getActionLabel(action) || '搜索',
					workflow_test_value: String(stored.lastTestValue || ''),
					workflow_value_source: String(stored.lastValueSource || ''),
					workflow_step: 'submit_search',
				},
			},
		}
	}

	function buildSubmitActionMissingDecision(field, stored = {}) {
		const label = getFieldLabel(field) || String(stored?.label || '').trim() || '当前字段'
		const testValue = String(stored?.lastTestValue || '').trim()
		return finishSearchWorkflowDecision(
			false,
			`搜索字段 "${label}" 已设置${testValue ? `为 "${testValue}"` : ''}，但当前观察没有找到可点击的搜索/查询/筛选/应用筛选按钮；需要补充 actions 或检查搜索区域按钮后再提交验证。`,
			{
				...buildFieldWorkflowInput(field || stored),
				workflow_submit_action_missing: true,
				workflow_submit_context: 'after_field_value',
				workflow_test_value: testValue,
				workflow_value_source: String(stored?.lastValueSource || ''),
			}
		)
	}

	function buildBaselineResetSearchDecision(observation, fields, state = null) {
		const action = findSearchResetAction(observation, fields)
		const filledFields = fields.filter(isFilled)
		const filled = filledFields.map(getFieldLabel).filter(Boolean)
		const failedResetField = filledFields.find((field) =>
			searchState.getClearRetryAttemptCount(state, getFieldKey(field)) > 0 &&
			canClearSearchFieldByInput(field)
		)
		if (failedResetField) {
			const retryCount = searchState.getClearRetryAttemptCount(state, getFieldKey(failedResetField))
			const clearFallback = buildFieldClearFallbackDecision('baseline', failedResetField, filled, {
				workflow_clear_retry: true,
				workflow_clear_retry_count: retryCount,
				workflow_reset_ineffective: !!action,
				workflow_reset_action_index: action ? Number(action.index) : undefined,
				workflow_reset_action_label: action ? (getActionLabel(action) || '重置') : undefined,
			})
			if (clearFallback) return clearFallback
		}
		if (!action) {
			const clearFallback = buildFieldClearFallbackDecision('baseline', filledFields.find(canClearSearchFieldByInput), filled)
			if (clearFallback) return clearFallback
			return buildResetActionMissingDecision('baseline', filledFields[0] || null, filled)
		}
		return {
			evaluation_previous_goal: '进入搜索测试前检测到页面已有筛选条件。',
			memory: `先清空已有筛选条件，恢复列表基线后再从真实列表数据提取搜索样本。已填字段：${filled.join('、') || '未知字段'}。`,
			thought: '已有条件可能让列表为空或让后续条件叠加，先做基线清空。',
			next_goal: '清空已有搜索条件，恢复列表基线',
			action: {
				name: 'click_element_by_index',
				input: {
					index: Number(action.index),
					target_label: getActionLabel(action) || '重置',
					workflow_step: 'reset_filters',
					workflow_baseline_reset: true,
					workflow_field_index: Number(filledFields[0]?.index),
					workflow_filled_field_indexes: filledFields
						.map((field) => Number(field?.index))
						.filter((index) => Number.isFinite(index))
						.join('|'),
					workflow_filled_fields: filled.join('|'),
				},
			},
		}
	}

	function buildResetSearchDecision(observation, state, fields) {
		const action = findSearchResetAction(observation, fields)
		const key = state.activeFieldKey || state.lastSearchedFieldKey || ''
		const field = searchState.getFieldByKey(fields, key) || state.fields?.[key] || {}
		const result = recordSearchResultObservation(state, key, analyzeSearchResultAfterSubmit(observation, state, field))
		const retryCount = searchState.getClearRetryAttemptCount(state, key)
		if (retryCount > 0 && canClearSearchFieldByInput(field)) {
			const clearFallback = buildFieldClearFallbackDecision('clear_retry', field, getFieldLabel(field) ? [getFieldLabel(field)] : [], {
				workflow_result_status: result.status,
				workflow_result_summary: result.summary,
				workflow_clear_retry: true,
				workflow_clear_retry_count: retryCount,
				workflow_reset_ineffective: !!action,
				workflow_reset_action_index: action ? Number(action.index) : undefined,
				workflow_reset_action_label: action ? (getActionLabel(action) || '重置') : undefined,
			})
			if (clearFallback) return clearFallback
		}
		if (!action) {
			const labels = getFieldLabel(field) ? [getFieldLabel(field)] : []
			const clearFallback = buildFieldClearFallbackDecision('after_submit', field, labels, {
				workflow_result_status: result.status,
				workflow_result_summary: result.summary,
				workflow_clear_retry: retryCount > 0 || undefined,
				workflow_clear_retry_count: retryCount || undefined,
			})
			if (clearFallback) return clearFallback
			return buildResetActionMissingDecision('after_submit', field, labels, {
				workflow_result_status: result.status,
				workflow_result_summary: result.summary,
				workflow_clear_retry: retryCount > 0 || undefined,
				workflow_clear_retry_count: retryCount || undefined,
			})
		}
		return {
			evaluation_previous_goal: '当前搜索字段已经提交。',
			memory: `${retryCount > 0 ? `上次重置复核未通过，正在第 ${retryCount}/2 次重试。` : ''}重置筛选条件后才能进入下一个字段，避免多个条件叠加影响测试结果。${result.summary}`,
			thought: retryCount > 0
				? '清空复核失败时应受控重试，而不是立刻终止整轮搜索测试。'
				: '先清空当前筛选条件，再继续测试下一个搜索项。',
			next_goal: retryCount > 0
				? `重试重置搜索条件：${getFieldLabel(field) || key || '当前字段'}`
				: `重置搜索条件：${getFieldLabel(field) || key || '当前字段'}`,
			action: {
				name: 'click_element_by_index',
				input: {
					...buildFieldWorkflowInput(field),
					index: Number(action.index),
					target_label: getActionLabel(action) || '重置',
					workflow_result_status: result.status,
					workflow_result_summary: result.summary,
					workflow_step: 'reset_filters',
					workflow_clear_retry: retryCount > 0 || undefined,
					workflow_clear_retry_count: retryCount || undefined,
				},
			},
		}
	}

	function buildFinalSearchWorkflowDecision(state) {
		const summary = buildSearchResultsSummary(state)
		const results = getOrderedSearchResults(state, { includeMissing: true })
		const failed = getSearchResultFailures(state)
		const issues = getSearchResultIssues(state)
		const success = results.length > 0 && issues.length === 0
		const status = success ? 'passed' : (failed.length ? 'failed' : 'inconclusive')
		const finalText = buildFinalSearchOutcomeText(results, issues, summary)
		return finishSearchWorkflowDecision(
			success,
			finalText,
			{
				workflow_result_status: status,
				workflow_result_summary: summary,
				workflow_result_failures: failed.map((item) => `${item.label || item.key}: ${item.summary}`).join(' | '),
			}
		)
	}

	function buildFinalSearchOutcomeText(results, issues, summary) {
		const counts = countSearchResultStatuses(results)
		const prefix = issues.length ? '搜索/筛选区域测试未完全确认' : '搜索/筛选区域测试完成'
		const statParts = [
			`共 ${counts.total} 项`,
			`通过 ${counts.passed} 项`,
			counts.failed ? `异常 ${counts.failed} 项` : '',
			counts.unknown ? `未确认 ${counts.unknown} 项` : '',
			counts.skipped ? `安全跳过 ${counts.skipped} 项` : '',
		].filter(Boolean)
		const issueText = issues.length
			? `重点问题：${issues.slice(0, 3).map(formatSearchIssueBrief).join('；')}${issues.length > 3 ? `；另有 ${issues.length - 3} 项。` : '。'}`
			: ''
		return [prefix, statParts.join('，')].filter(Boolean).join('：') + `。${summary}${issueText}`
	}

	function countSearchResultStatuses(results) {
		const counts = { total: 0, passed: 0, failed: 0, unknown: 0, skipped: 0 }
		for (const result of (Array.isArray(results) ? results : [])) {
			counts.total += 1
			const status = String(result?.status || '').trim()
			if (status === 'passed_match') {
				counts.passed += 1
			} else if (/^failed_/i.test(status)) {
				counts.failed += 1
			} else {
				counts.unknown += 1
				if (status === 'unknown_missing_sample') counts.skipped += 1
			}
		}
		return counts
	}

	function formatSearchIssueBrief(result) {
		const label = String(result?.label || result?.key || '未命名字段').trim()
		const status = formatSearchResultStatus(result?.status)
		const detail = formatSearchResultDetail(result)
		const summary = compactSearchDiagnosticText(result?.summary || '', 120)
		return `${label}=${status}${detail}${summary ? `：${summary}` : ''}`
	}

	function buildUnclearedFieldResetDecision(observation, state, fields, field) {
		const key = getFieldKey(field)
		const label = getFieldLabel(field) || key || '当前字段'
		const attempts = searchState.getClearRetryAttemptCount(state, key)
		if (attempts > 0 && canClearSearchFieldByInput(field)) {
			const action = findSearchResetAction(observation, fields)
			const clearFallback = buildFieldClearFallbackDecision('clear_retry', field, [label], {
				workflow_clear_failed: true,
				workflow_clear_retry: true,
				workflow_clear_retry_count: attempts,
				workflow_reset_ineffective: !!action,
				workflow_reset_action_index: action ? Number(action.index) : undefined,
				workflow_reset_action_label: action ? (getActionLabel(action) || '重置') : undefined,
			})
			if (clearFallback) return clearFallback
		}
		if (attempts >= 2) {
			return finishSearchWorkflowDecision(
				false,
				`搜索字段 "${label}" 已执行清空，但当前观察仍显示未清空；已停止以避免带着残留条件继续测试。`,
				{
					...buildFieldWorkflowInput(field),
					workflow_clear_failed: true,
					workflow_clear_retry_count: attempts,
				}
			)
		}
		const action = findSearchResetAction(observation, fields)
		if (!action) {
			if (canClearSearchFieldByInput(field)) {
				const nextAttempt = searchState.incrementClearRetryAttempt(state, key)
				const clearFallback = buildFieldClearFallbackDecision('clear_retry', field, [label], {
					workflow_clear_failed: true,
					workflow_clear_retry: true,
					workflow_clear_retry_count: nextAttempt,
				})
				if (clearFallback) return clearFallback
			}
			return buildResetActionMissingDecision('clear_retry', field, [label], {
				workflow_clear_failed: true,
				workflow_clear_retry_count: attempts,
			})
		}
		const nextAttempt = searchState.incrementClearRetryAttempt(state, key)
		return {
			evaluation_previous_goal: `搜索字段 "${label}" 清空后仍显示有值。`,
			memory: `清空复核发现字段 "${label}" 仍未清空，重试清空（第 ${nextAttempt}/2 次），避免残留条件影响后续字段。`,
			thought: '清空动作需要以字段状态为准；当前字段仍有值，先重试清空而不是继续下一项。',
			next_goal: `重试清空搜索条件：${label}`,
			action: {
				name: 'click_element_by_index',
				input: {
					...buildFieldWorkflowInput(field),
					index: Number(action.index),
					target_label: getActionLabel(action) || '重置',
					workflow_step: 'reset_filters',
					workflow_clear_retry: true,
					workflow_clear_retry_count: nextAttempt,
				},
			},
		}
	}

	function buildFieldClearFallbackDecision(context, field, labels = [], extraInput = {}) {
		if (!canClearSearchFieldByInput(field)) return null
		const label = getFieldLabel(field) || String(field?.label || field?.key || '').trim() || '当前字段'
		const labelList = (Array.isArray(labels) ? labels : [])
			.map((item) => String(item || '').trim())
			.filter(Boolean)
		const textByContext = {
			baseline: extraInput?.workflow_reset_ineffective
				? `搜索区已有筛选条件（${labelList.join('、') || label}），但页面清空/重置按钮复核未通过；先对普通可编辑文本字段 "${label}" 执行字段级清空兜底。`
				: `搜索区已有筛选条件（${labelList.join('、') || label}），但当前观察没有找到重置/清空按钮；先对普通可编辑文本字段 "${label}" 执行字段级清空兜底。`,
			after_submit: `搜索字段 "${label}" 已提交验证，但当前观察没有找到重置/清空按钮；先对该普通可编辑文本字段执行字段级清空，再进入下一项。`,
			clear_retry: extraInput?.workflow_reset_ineffective
				? `搜索字段 "${label}" 清空/重置按钮复核未通过；改用字段级置空重试。`
				: `搜索字段 "${label}" 清空复核未通过且当前观察没有找到重置/清空按钮；改用字段级置空重试。`,
		}
		return {
			evaluation_previous_goal: textByContext[context] || textByContext.after_submit,
			memory: '搜索测试仍保持通用策略：优先使用页面清空/重置按钮；缺失时只对普通可编辑文本框置空，不对选择、日期或多选控件猜测清空。',
			thought: '字段级清空是结构化兜底，适用于可编辑文本字段；清空后继续按字段逐项测试。',
			next_goal: `清空搜索字段：${label}`,
			action: {
				name: 'input_text',
				input: {
					...buildFieldWorkflowInput(field),
					...(extraInput && typeof extraInput === 'object' ? extraInput : {}),
					index: Number(field.index),
					text: '',
					target_label: label,
					workflow_step: 'clear_field',
					workflow_field_clear: true,
					workflow_clear_context: context,
					workflow_filled_fields: labelList.join('|'),
				},
			},
		}
	}

	function buildResetActionMissingDecision(context, field, labels = [], extraInput = {}) {
		const fieldInput = field ? buildFieldWorkflowInput(field) : {}
		const labelList = (Array.isArray(labels) ? labels : [])
			.map((item) => String(item || '').trim())
			.filter(Boolean)
		const fieldText = labelList.join('、') || getFieldLabel(field) || '未知字段'
		const textByContext = {
			baseline: `搜索区已有筛选条件（${fieldText}），但当前观察没有找到重置/清空/清除按钮；需要补充 actions 或区域上下文确认清空入口，不能带残留条件继续测试。`,
			after_submit: `搜索字段 "${fieldText}" 已提交验证，但当前观察没有找到重置/清空/清除按钮；需要补充 actions 或检查搜索区按钮后再继续下一个字段。`,
			clear_retry: `搜索字段 "${fieldText}" 清空复核未通过且当前观察没有找到可用重置/清空/清除按钮；需要重新获取 actions 或检查搜索区按钮，不能带残留条件继续测试。`,
		}
		return finishSearchWorkflowDecision(
			false,
			textByContext[context] || textByContext.after_submit,
			{
				...fieldInput,
				...(extraInput && typeof extraInput === 'object' ? extraInput : {}),
				workflow_reset_action_missing: true,
				workflow_reset_context: context,
				workflow_filled_fields: labelList.join('|'),
			}
		)
	}

	function finishSearchWorkflowDecision(success, text, extraInput = {}) {
		return {
			evaluation_previous_goal: success ? '搜索字段测试已完成。' : '搜索字段测试无法继续。',
			memory: success ? '所有搜索/筛选字段均已按字段流程测试。' : String(text || ''),
			thought: success ? '状态机已完成所有字段。' : '继续自动操作可能导致误选或循环，因此停止。',
			next_goal: success ? '完成搜索字段测试' : '停止搜索字段测试',
			action: {
				name: 'done',
				input: {
					...(extraInput && typeof extraInput === 'object' ? extraInput : {}),
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
		const skippedKeys = Array.isArray(state?.skippedKeys) ? state.skippedKeys : []
		const coveredKeys = mergeSearchFieldKeys(completedKeys, skippedKeys)
		const total = Array.isArray(state?.fieldOrder) ? state.fieldOrder.length : 0
		const remaining = total > 0 ? Math.max(0, total - coveredKeys.length) : -1
		const allComplete = total > 0 && remaining === 0
		const completedLabels = completedKeys
			.map((key) => getStateFieldSummary(state, fields, key).label || key)
			.filter(Boolean)
		const skippedLabels = skippedKeys
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
			`completed="${coveredKeys.length}/${total || '?'}"`,
			total > 0 ? `remaining="${remaining}"` : '',
			allComplete ? 'allComplete="true"' : '',
			completedLabels.length ? `completedLabels="${escapeAttr(completedLabels.join('|'))}"` : '',
			skippedLabels.length ? `skippedLabels="${escapeAttr(skippedLabels.join('|'))}"` : '',
			skippedLabels.length ? `skipped="${skippedLabels.length}"` : '',
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
		if (!isSearchWorkflowTask(session) && !hasActiveSearchState) return false
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
		if (isSearchPanelExpandHistory(item) || isSearchSubmitHistory(item) || isSearchSubmitFailureHistory(item) || isResetHistory(item) || isResetFailureHistory(item)) {
			return true
		}
		const state = session?.workflowState?.search
		if (state && !isTerminalSearchPhase(state.phase) && isSearchDateOptionClickHistory(state, item, normalizeActionName(item.action), item.input || {})) return true
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

	function deriveSearchPostModelDecision(session, decision, context = {}) {
		if (!isFailureDoneDecision(decision)) return null
		const state = session?.workflowState?.search
		if (!state || isTerminalSearchPhase(state.phase) || String(state.phase || '') === 'failed') return null
		const input = decision?.action?.input || {}
		const contextLimit = input.planning_context_limit === true
		const key = contextLimit ? resolveRecoverableSearchStateKey(state) : resolveActiveSearchStateKey(state)
		if (!key) return null
		if (contextLimit) {
			const executableRecovery = deriveSearchContextLimitExecutableDecision(session, state, context?.observation, context, input)
			if (executableRecovery) return executableRecovery
		}
		const evidenceAttempts = searchState.getEvidenceRequestAttemptCount(state, key)
		if (evidenceAttempts <= 0 && !contextLimit) return null
		const evidence = classifySearchEvidenceFailure(decision)
		if (!evidence.any) return null
		const field = buildFieldFromSearchState(state, key)
		if (!field) return null
		const reason = buildSearchFailureSkipReason(decision, evidence)
		return buildSearchFieldSkipDecision(field, reason, {
			workflow_missing_table_samples: evidence.missingTableSamples || undefined,
			workflow_option_sample_mismatch: evidence.optionSampleMismatch || undefined,
			workflow_option_candidates_unobserved: evidence.optionCandidatesUnobserved || undefined,
			workflow_model_failure_recovered: true,
			workflow_context_limit_recovered: contextLimit || undefined,
			planning_context_diagnostic: String(input.planning_context_diagnostic || ''),
			workflow_planning_context_diagnostic: String(input.planning_context_diagnostic || ''),
			workflow_context_rounds: Array.isArray(context?.planningContext) ? context.planningContext.length : undefined,
			text: reason,
		})
	}

	function deriveSearchContextLimitExecutableDecision(session, state, observation, context = {}, limitInput = {}) {
		if (!state || !observation) return null
		const fields = collectSearchFields(observation)
		if (!fields.length) return null
		const planningContext = Array.isArray(context?.planningContext) ? context.planningContext : []
		const diagnostic = String(limitInput?.planning_context_diagnostic || '')
		const recoveryInput = {
			workflow_context_limit_recovered: true,
			workflow_model_failure_recovered: true,
			planning_context_diagnostic: diagnostic,
			workflow_planning_context_diagnostic: diagnostic,
			workflow_context_rounds: planningContext.length || undefined,
		}
		const phase = String(state.phase || '')
		let recovered = null
		if (phase === 'awaiting_option') {
			const field = searchState.getFieldByKey(fields, state.activeFieldKey) ||
				searchState.getNextPendingField(state, fields)
			if (!field) return null
			const candidateState = buildStateWithPlanningContextOptionCandidates(state, field, planningContext)
			const rangeCompletion = buildPendingDateRangeCompletionDecision(candidateState, field, observation)
			if (isExecutableSearchRecoveryDecision(rangeCompletion)) {
				recovered = rangeCompletion
			} else {
				const candidate = pickOptionCandidateDetailForField(candidateState, field, observation, session, { planningContext })
				if (candidate.text) recovered = buildSelectionChoiceDecision(field, candidate)
			}
		} else if (phase === 'awaiting_submit') {
			recovered = buildSubmitSearchDecision(observation, state, fields)
		} else if (phase === 'awaiting_reset') {
			recovered = buildResetSearchDecision(observation, state, fields)
		}
		if (!isExecutableSearchRecoveryDecision(recovered)) return null
		return annotateSearchDecisionInput(recovered, recoveryInput)
	}

	function isExecutableSearchRecoveryDecision(decision) {
		const name = String(decision?.action?.name || '')
		if (!name || name === 'done') return false
		const input = decision?.action?.input || {}
		if (name === 'wait' && String(input.workflow_step || '') === 'skip_field') return false
		return true
	}

	function annotateSearchDecisionInput(decision, extraInput = {}) {
		if (!decision?.action || !decision.action.input) return decision
		return {
			...decision,
			action: {
				...decision.action,
				input: {
					...decision.action.input,
					...Object.fromEntries(
						Object.entries(extraInput || {}).filter(([, value]) => value !== undefined && value !== '')
					),
				},
			},
		}
	}

	function buildStateWithPlanningContextOptionCandidates(state, field, planningContext) {
		const candidates = extractScopedOptionLabelsFromPlanningContext(planningContext, field)
		if (!candidates.length) return state
		return {
			...state,
			pendingDropdownCandidates: [
				...(Array.isArray(state?.pendingDropdownCandidates) ? state.pendingDropdownCandidates : []),
				...candidates,
			],
		}
	}

	function extractScopedOptionLabelsFromPlanningContext(planningContext, field) {
		const contexts = Array.isArray(planningContext) ? planningContext : []
		const index = Number(field?.index)
		if (!Number.isFinite(index)) return []
		const labels = []
		const seen = new Set()
		for (const context of contexts) {
			if (String(context?.name || '') !== 'request_options_for') continue
			if (Number(context?.input?.index) !== index) continue
			const text = String(context?.text || '')
			for (const label of extractScopedOptionLabelsFromContextText(text)) {
				const key = normalizeText(label)
				if (!key || seen.has(key)) continue
				seen.add(key)
				labels.push(label)
				if (labels.length >= 40) return labels
			}
		}
		return labels
	}

	function extractScopedOptionLabelsFromContextText(text) {
		const labels = []
		for (const block of extractContextBlocks(text, 'native_options')) {
			labels.push(...extractOptionLabelsFromContextText(block.body))
		}
		for (const tag of ['visible_options', 'visible_popups']) {
			for (const block of extractContextBlocks(text, tag)) {
				if (!/\bscoped=["'](?:field|explicit)["']/i.test(block.openTag || '')) continue
				labels.push(...extractOptionLabelsFromContextText(block.body))
			}
		}
		return labels
	}

	function extractContextBlocks(text, tagName) {
		const blocks = []
		const tag = escapeRegExp(String(tagName || '').trim())
		if (!tag) return blocks
		const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi')
		for (const match of String(text || '').matchAll(pattern)) {
			blocks.push({
				openTag: `<${tagName}${match[1] || ''}>`,
				body: String(match[2] || ''),
			})
		}
		return blocks
	}

	function extractOptionLabelsFromContextText(text) {
		const labels = []
		for (const line of String(text || '').split(/\n+/)) {
			const trimmed = line.replace(/\s+/g, ' ').trim()
			if (!trimmed || /<\/?(?:visible_options|visible_popups|native_options|options_for|target_matches)\b/i.test(trimmed)) continue
			const attrLabel = readContextLineAttribute(trimmed, 'label')
			if (attrLabel) {
				labels.push(attrLabel)
				continue
			}
			const nativeMatch = trimmed.match(/^option\s+\d+\s*:\s*(.+)$/i)
			if (nativeMatch) labels.push(unescapeContextText(nativeMatch[1]))
		}
		return labels.map((item) => String(item || '').trim()).filter(Boolean)
	}

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	function readContextLineAttribute(line, name) {
		const pattern = new RegExp(`${name}=(["'])(.*?)\\1`)
		const match = String(line || '').match(pattern)
		return match ? unescapeContextText(match[2]) : ''
	}

	function unescapeContextText(value) {
		return String(value || '')
			.replace(/&quot;/g, '"')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.trim()
	}

	function deriveSearchPostContextDecision(session, workflowContextText, planningContext = []) {
		const state = session?.workflowState?.search
		if (!state || isTerminalSearchPhase(state.phase) || String(state.phase || '') === 'failed') return null
		const key = resolveActiveSearchStateKey(state)
		if (!key || searchState.getEvidenceRequestAttemptCount(state, key) <= 0) return null
		const field = buildFieldFromSearchState(state, key)
		if (!field) return null
		const diagnostic = summarizeSearchPlanningContextDiagnostic(planningContext)
		const executableRecovery = deriveSearchPostContextExecutableDecision(session, state, field, planningContext)
		if (isExecutableSearchRecoveryDecision(executableRecovery)) {
			return annotateSearchDecisionInput(executableRecovery, {
				workflow_context_recovered: true,
				planning_context_diagnostic: diagnostic || undefined,
				workflow_planning_context_diagnostic: diagnostic || undefined,
				workflow_context_rounds: Array.isArray(planningContext) && planningContext.length ? planningContext.length : undefined,
			})
		}
		if (!diagnostic) return null
		const combinedText = [
			workflowContextText,
			diagnostic,
		].map((value) => String(value || '').trim()).filter(Boolean).join('\n')
		const evidence = classifySearchEvidenceFailure({
			evaluation_previous_goal: combinedText,
			memory: diagnostic,
			thought: combinedText,
			next_goal: combinedText,
			action: {
				name: 'done',
				input: {
					success: false,
					text: combinedText,
					reason: diagnostic,
					planning_context_diagnostic: diagnostic,
				},
			},
		})
		if (!evidence.any) return null
		const reason = buildSearchFailureSkipReason({
			action: {
				input: {
					text: '本地上下文补充后仍没有足够证据安全测试该字段。',
					planning_context_diagnostic: diagnostic,
				},
			},
			thought: combinedText,
			memory: diagnostic,
		}, evidence)
		return buildSearchFieldSkipDecision(field, `本地上下文补充后仍缺证据：${reason}`, {
			workflow_missing_table_samples: evidence.missingTableSamples || undefined,
			workflow_option_sample_mismatch: evidence.optionSampleMismatch || undefined,
			workflow_option_candidates_unobserved: evidence.optionCandidatesUnobserved || undefined,
			workflow_context_recovered: true,
			planning_context_diagnostic: diagnostic,
			workflow_planning_context_diagnostic: diagnostic,
			text: `本地上下文补充后仍缺证据：${reason}`,
		})
	}

	function deriveSearchPostContextExecutableDecision(session, state, field, planningContext = []) {
		if (!state || !field) return null
		const key = getFieldKey(field)
		if (key) {
			rememberFieldMetadata(state, key, buildFieldWorkflowInput(field))
			state.activeFieldKey = key
		}
		if (isSelectionField(field)) {
			const candidateState = buildStateWithPlanningContextOptionCandidates(state, field, planningContext)
			const candidate = pickOptionCandidateDetailForField(candidateState, field, null, session, { planningContext })
			if (candidate.text) return buildSelectionChoiceDecision(field, candidate)
			return null
		}
		const value = buildSearchFieldTestValue(session, field, null, planningContext)
		if (!value.text) return null
		if (key) {
			rememberFieldMetadata(state, key, {
				...buildFieldWorkflowInput(field),
				workflow_test_value: value.text,
				workflow_value_source: value.source,
				workflow_value_basis: value.basis,
			})
		}
		return buildTextSearchFillDecision(field, value)
	}

	function deriveSearchPostValidationDecision(session, action, validationError, context = {}) {
		void context
		const state = session?.workflowState?.search
		if (!state || isTerminalSearchPhase(state.phase) || String(state.phase || '') === 'failed') return null
		if (!isSearchValidationRecoveryAction(action)) return null
		const text = String(validationError || '').trim()
		if (!text) return null
		const evidence = classifySearchEvidenceFailure({
			evaluation_previous_goal: text,
			memory: text,
			thought: text,
			next_goal: text,
			action: {
				name: 'done',
				input: {
					success: false,
					text,
					reason: text,
					planning_context_diagnostic: text,
				},
			},
		})
		if (!evidence.any) return null
		const input = action?.input || {}
		const key = resolveSearchValidationFieldKey(state, input)
		if (!key) return null
		const field = buildFieldFromSearchState(state, key) || buildFieldFromValidationInput(input, key)
		if (!field) return null
		const reason = buildSearchFailureSkipReason({
			action: {
				input: {
					text,
					planning_context_diagnostic: text,
				},
			},
			thought: text,
			memory: text,
		}, evidence)
		return buildSearchFieldSkipDecision(field, `执行前校验拦截：${reason}`, {
			workflow_missing_table_samples: evidence.missingTableSamples || undefined,
			workflow_option_sample_mismatch: evidence.optionSampleMismatch || undefined,
			workflow_option_candidates_unobserved: evidence.optionCandidatesUnobserved || undefined,
			workflow_validation_recovered: true,
			workflow_validation_error: text,
			text: `执行前校验拦截：${reason}`,
		})
	}

	function summarizeSearchPlanningContextDiagnostic(planningContext) {
		const contexts = Array.isArray(planningContext) ? planningContext : []
		const parts = []
		for (const context of contexts) {
			const text = String(context?.text || '').trim()
			if (!text || !isSearchEvidencePlanningContext(context, text)) continue
			const summary = summarizeSearchPlanningContextText(context, text)
			if (summary) parts.push(summary)
		}
		return parts.slice(-3).join('；')
	}

	function isSearchEvidencePlanningContext(context, text) {
		const name = String(context?.name || '').trim()
		const input = context?.input || {}
		const source = String(input.source || input.target || '').trim()
		if (name === 'request_options_for') return true
		if (name === 'request_context' && source === 'tables') return true
		return /(empty_context|diagnostic_(?:options|popups)|候选未能与目标字段建立稳定归属|当前观察没有可见下拉候选|没有找到匹配上下文)/.test(text)
	}

	function summarizeSearchPlanningContextText(context, text) {
		const name = String(context?.name || '').trim()
		const input = context?.input || {}
		const target = [
			name,
			input.index !== undefined ? `index=${input.index}` : '',
			input.label ? `label=${input.label}` : '',
			input.source ? `source=${input.source}` : '',
		].filter(Boolean).join(' ')
		const lines = String(text || '')
			.split(/\n+/)
			.map((line) => line.replace(/\s+/g, ' ').trim())
			.filter(Boolean)
		const picked = []
		for (const line of lines) {
			if (!/(empty_context|diagnostic_(?:options|popups)|visible_(?:options|popups)|native_options|当前观察没有可见下拉候选|候选未能与目标字段建立稳定归属|options_for|context_chunk|option \d+|popup index=|option index=)/.test(line)) continue
			picked.push(line)
			if (picked.length >= 8) break
		}
		const body = picked.length ? picked.join(' | ') : lines.slice(0, 4).join(' | ')
		return compactSearchDiagnosticText([target, body].filter(Boolean).join(': '), 700)
	}

	function compactSearchDiagnosticText(value, maxLen = 700) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		const limit = Math.max(80, Number(maxLen) || 700)
		return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
	}

	function isSearchValidationRecoveryAction(action) {
		const name = normalizeActionName(action?.name)
		const input = action?.input || {}
		if (String(input.workflow || '') === 'search-fields') return true
		const step = String(input.workflow_step || '').trim()
		if (/^(fill_field|open_dropdown|select_option|clear_field|skip_field)$/.test(step)) return true
		return isSearchFieldAction(name) && !!resolveSearchFieldInputMarker(input)
	}

	function resolveSearchFieldInputMarker(input) {
		return String(input?.workflow_field_key || input?.workflow_field_label || input?.target_label || input?.label || '').trim() ||
			(Number.isFinite(Number(input?.workflow_field_index ?? input?.index)) ? 'index' : '')
	}

	function resolveSearchValidationFieldKey(state, input) {
		const explicitKey = String(input?.workflow_field_key || '').trim()
		if (explicitKey) return explicitKey
		const index = Number(input?.workflow_field_index ?? input?.index)
		if (Number.isFinite(index)) return findKnownFieldKeyByIndex(state, index) || `index:${index}`
		const active = String(state?.activeFieldKey || '').trim()
		if (active) return active
		const last = String(state?.lastSearchedFieldKey || '').trim()
		if (last) return last
		return buildSyntheticFieldKey(input)
	}

	function buildFieldFromValidationInput(input, key) {
		const index = Number(input?.workflow_field_index ?? input?.index)
		return {
			key,
			index: Number.isFinite(index) ? index : parseFieldIndexFromKey(key),
			label: String(input?.workflow_field_label || input?.target_label || input?.label || key || '').trim(),
			fieldType: String(input?.workflow_field_type || ''),
		}
	}

	function isFailureDoneDecision(decision) {
		return String(decision?.action?.name || '') === 'done' &&
			decision?.action?.input?.success === false
	}

	function resolveActiveSearchStateKey(state) {
		const candidates = [
			state?.activeFieldKey,
			state?.lastSearchedFieldKey,
			...(Array.isArray(state?.fieldOrder) ? state.fieldOrder : []),
		]
		for (const value of candidates) {
			const key = String(value || '').trim()
			if (!key) continue
			if (Array.isArray(state?.completedKeys) && state.completedKeys.includes(key)) continue
			if (Array.isArray(state?.skippedKeys) && state.skippedKeys.includes(key)) continue
			if (searchState.getEvidenceRequestAttemptCount(state, key) > 0) return key
		}
		return ''
	}

	function resolveRecoverableSearchStateKey(state) {
		const candidates = [
			state?.activeFieldKey,
			state?.lastSearchedFieldKey,
			...(Array.isArray(state?.fieldOrder) ? state.fieldOrder : []),
		]
		for (const value of candidates) {
			const key = String(value || '').trim()
			if (!key) continue
			if (Array.isArray(state?.completedKeys) && state.completedKeys.includes(key)) continue
			if (Array.isArray(state?.skippedKeys) && state.skippedKeys.includes(key)) continue
			return key
		}
		return ''
	}

	function buildFieldFromSearchState(state, key) {
		const stored = state?.fields?.[key] || {}
		const index = Number.isFinite(Number(stored.index))
			? Number(stored.index)
			: parseFieldIndexFromKey(key)
		return {
			...stored,
			key,
			index,
			label: String(stored.label || stored.workflow_field_label || key || '').trim(),
			fieldType: String(stored.fieldType || stored.workflow_field_type || ''),
		}
	}

	function parseFieldIndexFromKey(key) {
		const match = String(key || '').match(/^index:(-?\d+(?:\.\d+)?)$/)
		if (!match) return Number.NaN
		const index = Number(match[1])
		return Number.isFinite(index) ? index : Number.NaN
	}

	function classifySearchEvidenceFailure(decision) {
		const input = decision?.action?.input || {}
		const text = normalizeText([
			decision?.evaluation_previous_goal,
			decision?.memory,
			decision?.thought,
			decision?.next_goal,
			input.text,
			input.reason,
			input.planning_context_diagnostic,
			input.workflow_result_summary,
			input.workflow_skip_reason,
		].filter(Boolean).join(' '))
		const optionSampleMismatch = input.workflow_option_sample_mismatch === true ||
			/(option_sample_mismatch|候选.*不匹配|不匹配.*候选|列表样本和候选不匹配|非匹配候选|无法安全选择非匹配候选)/i.test(text)
		const optionCandidatesUnobserved = input.workflow_option_candidates_unobserved === true ||
			/(option_candidates_unobserved|global_popup_diagnostic|global_selectable_popup_diagnostic|候选.*未观测|未观测.*候选|没有观测到候选|没有检测到真实候选|下拉候选.*为空|无法确认可选候选|缺少候选|没有候选|不能猜选项|猜选项|字段外可见|字段外候选|不要直接选择字段外候选|候选.*未归属|未归属.*候选|候选未能.*目标字段.*归属|诊断候选|没有稳定归属|不能直接选择.*候选)/i.test(text)
		const rawMissingTableSamples = input.workflow_missing_table_samples === true ||
			/(missing_table_samples|no_observed_tables|missing_sample|缺少.*(表格|列表|样本|数据)|没有.*(可用)?(表格|列表)(摘要|样本|数据)|没有.*可用.*样本|无.*(表格|列表)(摘要|样本|数据)|泛化搜索词|随机值|随机搜索|无意义测试)/i.test(text)
		const missingTableSamples = rawMissingTableSamples && !optionSampleMismatch && !optionCandidatesUnobserved
		return {
			any: missingTableSamples || optionSampleMismatch || optionCandidatesUnobserved,
			missingTableSamples,
			optionSampleMismatch,
			optionCandidatesUnobserved,
		}
	}

	function buildSearchFailureSkipReason(decision, evidence) {
		const input = decision?.action?.input || {}
		const text = String(input.text || decision?.thought || decision?.memory || '模型确认当前字段缺少可安全使用的样本或候选证据。').trim()
		const diagnostic = String(input.planning_context_diagnostic || '').trim()
		const kind = evidence.optionSampleMismatch
			? '列表样本与候选不匹配'
			: evidence.optionCandidatesUnobserved
				? '未观测到真实候选'
				: '缺少真实列表样本'
		const suffix = diagnostic && !text.includes('最近补充上下文为空')
			? ` 最近补充上下文为空：${diagnostic}`
			: ''
		return `${kind}：${text}${suffix}`.trim()
	}

	function createSearchState() {
		return searchState.createSearchState()
	}

	function recordSearchWorkflowDeferral(session, decision) {
		if (!session || !decision) return
		if (!session.workflowState || typeof session.workflowState !== 'object') session.workflowState = {}
		const state = session.workflowState.search && typeof session.workflowState.search === 'object'
			? session.workflowState.search
			: createSearchState()
		session.workflowState.search = state
		const input = decision?.action?.input || {}
		const key = buildSyntheticFieldKey(input) || state.activeFieldKey || state.lastSearchedFieldKey || ''
		if (!key) return
		searchState.incrementEvidenceRequestAttempt(state, key)
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
		const key = resolveSearchHistoryFieldKey(state, item, action, input)
		const historyOutcome = getHistoryOutcome(item)
		if (String(input.workflow_step || '').trim() === 'skip_field') {
			if (!key) return
			rememberFieldMetadata(state, key, input)
			if (item.success === false) {
				markSearchWorkflowFailed(state, getHistoryFailureReason(item, '搜索字段跳过记录失败'))
				return
			}
			recordSearchResultObservation(state, key, {
				status: 'unknown_missing_sample',
				label: String(input.workflow_field_label || input.target_label || state.fields?.[key]?.label || key || '').trim(),
				value: '',
				source: 'missing_sample',
				summary: String(input.workflow_result_summary || input.workflow_skip_reason || '该字段缺少真实样本或可归属候选，已安全跳过。').trim(),
			})
			markSearchFieldSkipped(state, key)
			clearPendingDateRangeStart(state, key)
			state.activeFieldKey = ''
			state.lastSearchedFieldKey = ''
			state.pendingDropdownOutput = ''
			state.pendingDropdownCandidates = []
			state.phase = 'select_field'
			return
		}
		if (String(input.workflow_step || '').trim() === 'clear_field') {
			if (!key) return
			rememberFieldMetadata(state, key, input)
			if (item.success === false) {
				markSearchWorkflowFailed(state, getHistoryFailureReason(item, '搜索字段清空失败'))
				return
			}
			state.pendingDropdownOutput = ''
			state.pendingDropdownCandidates = []
			if (String(input.workflow_clear_context || '') === 'baseline') {
				state.activeFieldKey = ''
				state.lastSearchedFieldKey = ''
				state.phase = 'select_field'
				return
			}
			const completedKey = state.activeFieldKey || state.lastSearchedFieldKey || key
			if (completedKey) markSearchFieldCompleted(state, completedKey, { requiresClear: true })
			state.activeFieldKey = ''
			state.lastSearchedFieldKey = ''
			state.phase = 'select_field'
			return
		}
		if (isSearchDateOptionClickHistory(state, item, action, input)) {
			const activeKey = state.activeFieldKey || state.lastSearchedFieldKey || key
			const activeField = state.fields?.[activeKey] || {}
			const dateValue = extractDateValueFromHistoryItem(item, activeField, state, activeKey)
			if (!activeKey || !dateValue) return
			if (isDateRangeField(activeField)) {
				const start = normalizeDateCandidate(state.pendingDateRangeStartByKey?.[activeKey] || '')
				if (!start) {
					setPendingDateRangeStart(state, activeKey, dateValue)
					state.activeFieldKey = activeKey
					state.phase = 'awaiting_option'
					return
				}
				const pair = [start, dateValue].sort(compareDateStrings)
				rememberFieldMetadata(state, activeKey, {
					...activeField,
					workflow_field_key: activeKey,
					workflow_test_value: `${pair[0]}..${pair[1]}`,
					workflow_value_source: activeField.lastValueSource || 'visible_option',
					workflow_value_basis: activeField.lastValueBasis || '日期/时间候选点击',
				})
				clearPendingDateRangeStart(state, activeKey)
				state.activeFieldKey = activeKey
				state.phase = 'awaiting_submit'
				state.pendingDropdownOutput = ''
				state.pendingDropdownCandidates = []
				return
			}
			rememberFieldMetadata(state, activeKey, {
				...(state.fields?.[activeKey] || {}),
				workflow_field_key: activeKey,
				workflow_test_value: dateValue,
				workflow_value_source: state.fields?.[activeKey]?.lastValueSource || 'visible_option',
				workflow_value_basis: state.fields?.[activeKey]?.lastValueBasis || '日期/时间候选点击',
			})
			state.activeFieldKey = activeKey
			state.phase = 'awaiting_submit'
			clearPendingDateRangeStart(state, activeKey)
			state.pendingDropdownOutput = ''
			state.pendingDropdownCandidates = []
			return
		}
		if (isSearchFieldAction(action)) {
			if (!key) return
			rememberFieldMetadata(state, key, input)
			state.activeFieldKey = key
			if (isDropdownOpenHistory(item)) {
				incrementDropdownOpenAttempt(state, key)
				state.pendingDropdownOutput = String(item.output || '')
				state.pendingDropdownCandidates = getOutcomeVisibleOptions(historyOutcome)
				clearPendingDateRangeStart(state, key)
				state.phase = 'awaiting_option'
				return
			}
			if (item.success === false) {
				if (isDropdownChoiceHistory(item)) {
					if (isRecoverableDropdownChoiceFailure(item, historyOutcome)) {
						recordSearchResultObservation(state, key, {
							status: 'unknown_missing_sample',
							label: String(input.workflow_field_label || input.target_label || state.fields?.[key]?.label || key || '').trim(),
							value: String(input.workflow_test_value || input.text || input.label || '').trim(),
							source: 'missing_sample',
							summary: `该字段候选未能稳定归属到目标字段，已安全跳过以避免误选。${getHistoryFailureReason(item, '')}`,
						})
						markSearchFieldSkipped(state, key)
						clearPendingDateRangeStart(state, key)
						state.activeFieldKey = ''
						state.lastSearchedFieldKey = ''
						state.pendingDropdownOutput = ''
						state.pendingDropdownCandidates = []
						state.phase = 'select_field'
						return
					}
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
			if (isDropdownChoiceHistory(item) && isDateRangeFirstOptionSelection(state, key, item, historyOutcome)) {
				const activeField = state.fields?.[key] || {}
				const startDate = extractDateRangeFirstSelectionDate(item, historyOutcome, activeField, state, key)
				if (startDate) {
					setPendingDateRangeStart(state, key, startDate)
					rememberFieldMetadata(state, key, {
						...input,
						workflow_test_value: startDate,
						workflow_value_source: activeField.lastValueSource || input.workflow_value_source || 'visible_option',
						workflow_value_basis: activeField.lastValueBasis || input.workflow_value_basis || '日期范围起点已选择，等待结束日期',
					})
					state.activeFieldKey = key
					state.lastSearchedFieldKey = ''
					state.pendingDropdownOutput = String(item.output || '')
					const visibleOptions = getOutcomeVisibleOptions(historyOutcome)
					state.pendingDropdownCandidates = visibleOptions.length
						? visibleOptions
						: (Array.isArray(state.pendingDropdownCandidates) ? state.pendingDropdownCandidates : [])
					state.phase = 'awaiting_option'
					return
				}
			}
			if (isDropdownChoiceHistory(item)) {
				rememberSelectedSearchChoiceEvidence(state, key, input, historyOutcome)
			}
			state.phase = 'awaiting_submit'
			clearPendingDateRangeStart(state, key)
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
		if (isResetHistory(item) || isResetFailureHistory(item)) {
			if (item.success === false) {
				handleFailedResetHistory(state, key, input, item)
				return
			}
			if (input.workflow_baseline_reset) {
				state.baselineResetDone = true
				state.activeFieldKey = ''
				state.lastSearchedFieldKey = ''
				state.pendingDropdownOutput = ''
				state.pendingDropdownCandidates = []
				state.phase = 'select_field'
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
			recordProvisionalSearchSubmitResult(state, state.lastSearchedFieldKey)
			state.phase = 'awaiting_reset'
			return
		}
	}

	function isRecoverableDropdownChoiceFailure(item, outcome = null) {
		const text = normalizeText([
			item?.output,
			item?.evaluationPreviousGoal,
			item?.nextGoal,
			outcome?.reason,
			outcome?.source,
			Array.isArray(outcome?.visibleOptions) ? outcome.visibleOptions.join('|') : '',
		].filter(Boolean).join(' '))
		return /(global_popup_diagnostic|global_selectable_popup_diagnostic|字段外可见|字段外候选|不要直接选择字段外候选|候选未能与目标字段建立稳定归属|未归属到目标字段|没有稳定归属|不能直接选择.*候选)/i.test(text)
			|| /(诊断候选|diagnostic_(?:options|popups)|field[-_\s]?external|unscoped).*(候选|candidate|option)/i.test(text)
	}

	function rememberSelectedSearchChoiceEvidence(state, key, input, outcome) {
		if (!state || !key) return
		const field = state.fields?.[key] || {}
		const selectedPath = getOutcomeSelectedPath(outcome)
		const selectedValue = selectedPath.length
			? selectedPath.join(' / ')
			: getMatchedSearchChoiceVisibleOption(input, outcome)
		if (!selectedValue) return
		const basis = selectedPath.length
			? `动作结果返回已选路径：${selectedValue}`
			: `动作结果返回可见候选并包含所选值：${selectedValue}`
		rememberFieldMetadata(state, key, {
			...input,
			workflow_test_value: selectedValue,
			workflow_value_source: field.lastValueSource || input?.workflow_value_source || 'visible_option',
			workflow_value_basis: mergeSearchChoiceEvidenceBasis(field.lastValueBasis || input?.workflow_value_basis || '', basis),
		})
	}

	function getMatchedSearchChoiceVisibleOption(input, outcome) {
		const options = getOutcomeVisibleOptions(outcome)
		if (!options.length) return ''
		const requested = normalizeText([
			input?.workflow_test_value,
			input?.text,
			input?.label,
			input?.value,
		].filter(Boolean).join(' '))
		if (!requested && options.length === 1) return options[0]
		const exact = options.find((option) => normalizeText(option) === requested)
		return exact || ''
	}

	function mergeSearchChoiceEvidenceBasis(current, addition) {
		const base = String(current || '').trim()
		const extra = String(addition || '').trim()
		if (!base) return extra
		if (!extra || base.includes(extra)) return base
		return `${base}；${extra}`
	}

	function isDateRangeFirstOptionSelection(state, key, item, outcome) {
		if (!state || !key || !item?.success) return false
		const field = state.fields?.[key] || {}
		if (!isDateRangeField(field)) return false
		const reason = normalizeText(outcome?.reason || '')
		if (reason.includes('date_range_first_option_selected')) return true
		if (reason.includes('date_range_second_option_selected')) return false
		const requestedDates = extractDateCandidates(item?.input?.workflow_test_value || item?.input?.text || item?.input?.label || '')
		if (requestedDates.length < 2) return false
		const outputText = normalizeText([item?.output, item?.message].filter(Boolean).join(' '))
		return /(起点|开始日期|start)/i.test(outputText) && !/(结束日期.*已选择|date_range_second_option_selected)/i.test(outputText)
	}

	function extractDateRangeFirstSelectionDate(item, outcome, field, state, key) {
		const explicit = normalizeDateCandidate(outcome?.selectedDate || outcome?.value || '')
		if (explicit) return explicit
		const date = extractDateValueFromHistoryItem(item, field, state, key)
		if (date) return date
		const requested = extractDateCandidates(item?.input?.workflow_test_value || item?.input?.text || item?.input?.label || '')
		return requested[0] || ''
	}

	function resolveSearchHistoryFieldKey(state, item, action, input) {
		const fieldIndex = Number(input?.workflow_field_index)
		if (Number.isFinite(fieldIndex)) return findKnownFieldKeyByIndex(state, fieldIndex) || `index:${fieldIndex}`
		const explicitKey = String(input?.workflow_field_key || '').trim()
		if (explicitKey) return explicitKey
		if (isSearchFieldAction(action)) {
			const actionIndex = Number(input?.index)
			if (Number.isFinite(actionIndex)) return findKnownFieldKeyByIndex(state, actionIndex) || buildSyntheticFieldKey(input)
			return buildSyntheticFieldKey(input)
		}
		if (isSearchSubmitHistory(item) || isSearchSubmitFailureHistory(item) || isResetHistory(item) || isResetFailureHistory(item)) {
			return state.activeFieldKey || state.lastSearchedFieldKey || ''
		}
		return ''
	}

	function handleFailedResetHistory(state, key, input, item) {
		const resetKey = key || state.activeFieldKey || state.lastSearchedFieldKey || ''
		if (!resetKey) {
			markSearchWorkflowFailed(state, getHistoryFailureReason(item, '搜索重置失败'))
			return
		}
		const attempts = searchState.incrementClearRetryAttempt(state, resetKey)
		if (attempts >= 3) {
			markSearchWorkflowFailed(
				state,
				`${getHistoryFailureReason(item, '搜索重置失败')}（已重试 ${attempts - 1} 次）`
			)
			return
		}
		state.activeFieldKey = resetKey
		state.lastSearchedFieldKey = resetKey
		state.pendingDropdownOutput = ''
		state.pendingDropdownCandidates = []
		state.phase = input.workflow_baseline_reset ? 'select_field' : 'awaiting_reset'
	}

	function isSearchDateOptionClickHistory(state, item, action, input) {
		if (action !== 'click_element_by_index' && action !== 'click') return false
		if (item?.success === false) return false
		if (!state?.activeFieldKey || String(state.phase || '') !== 'awaiting_option') return false
		const field = state.fields?.[state.activeFieldKey] || {}
		if (!isDateLikeSearchField(field)) return false
		if (!extractDateValueFromHistoryItem(item, field, state, state.activeFieldKey)) return false
		const text = normalizeText([
			input?.target_label,
			input?.label,
			input?.text,
			item?.nextGoal,
			item?.output,
		].filter(Boolean).join(' '))
		if (/(搜索|查询|筛选|重置|清空|reset|clear|search|query|filter)/i.test(text)) return false
		return true
	}

	function isDateLikeSearchField(field) {
		if (isDateRangeField(field)) return true
		const fieldType = getCompactFieldType(field)
		const label = normalizeText([field?.label, field?.placeholder, field?.text].filter(Boolean).join(' '))
		return isTemporalFieldTypeToken(fieldType) ||
			/(日期|时间|月份|年份|年度|星期|周次|日历|date|time|month|year|week|calendar)/i.test(label)
	}

	function extractDateValueFromHistoryItem(item, field = null, state = null, key = '') {
		const input = item?.input || {}
		const text = [
			input.workflow_test_value,
			input.text,
			input.label,
			input.target_label,
			input.target_description,
			item?.nextGoal,
			item?.output,
		].filter(Boolean).join(' ')
		const date = normalizeDateCandidate(text)
		if (date) return date
		const day = extractDayOnlyDateFromHistoryItem(item)
		if (!day) return ''
		return inferDateFromDayOnlyHistory(day, field, state, key)
	}

	function extractDayOnlyDateFromHistoryItem(item) {
		const input = item?.input || {}
		for (const value of [input.text, input.label, input.target_label, input.target_description]) {
			const day = parseDayOnlyDateCandidate(value)
			if (day) return day
		}
		const output = String(item?.output || '')
		let match = output.match(/点击目标\s*=\s*[^"'“”]*["“']\s*(\d{1,2})(?:日|号)?\s*["”']/)
		if (match) return parseDayOnlyDateCandidate(match[1])
		const goal = String(item?.nextGoal || '')
		match = goal.match(/(?:日期|date|day|日历|候选|选项)[^\d]{0,20}(\d{1,2})(?:日|号)?/i)
		if (match) return parseDayOnlyDateCandidate(match[1])
		return 0
	}

	function inferDateFromDayOnlyHistory(day, field = null, state = null, key = '') {
		const bases = []
		const pending = normalizeDateCandidate(state?.pendingDateRangeStartByKey?.[key] || '')
		if (pending) bases.push(pending)
		for (const value of [
			field?.lastTestValue,
			field?.lastValueBasis,
			field?.value,
			field?.text,
		]) {
			for (const date of extractDateCandidates(value)) {
				if (!bases.includes(date)) bases.push(date)
			}
		}
		let best = ''
		let bestDistance = Number.POSITIVE_INFINITY
		for (const base of bases) {
			for (const candidate of buildNearbyDayOnlyDates(base, day)) {
				const distance = Math.abs(dateDistanceDays(candidate, base))
				if (distance < bestDistance) {
					best = candidate
					bestDistance = distance
				}
			}
		}
		return best
	}

	function buildNearbyDayOnlyDates(baseDate, day) {
		const parts = parseDateParts(baseDate)
		if (!parts || !day) return []
		const out = []
		for (const offset of [-1, 0, 1]) {
			const date = new Date(Date.UTC(parts.year, parts.month - 1 + offset, Number(day)))
			if (date.getUTCDate() !== Number(day)) continue
			out.push(`${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`)
		}
		return out
	}

	function dateDistanceDays(a, b) {
		const left = parseDateParts(a)
		const right = parseDateParts(b)
		if (!left || !right) return Number.POSITIVE_INFINITY
		const leftMs = Date.UTC(left.year, left.month - 1, left.day)
		const rightMs = Date.UTC(right.year, right.month - 1, right.day)
		return Math.round((leftMs - rightMs) / 86400000)
	}

	function recordProvisionalSearchSubmitResult(state, key) {
		if (!state || !key) return
		const field = state.fields?.[key] || {}
		if (state.resultsByKey?.[key]) return
		const value = String(field.lastTestValue || '').trim()
		recordSearchResultObservation(state, key, {
			status: value ? 'unknown_result_pending' : 'unknown_no_value',
			label: String(field.label || key || '').trim(),
			value,
			source: String(field.lastValueSource || '').trim(),
			summary: value
				? `搜索结果观察：已提交测试值 "${value}"，等待提交后列表观察确认。`
				: '搜索结果观察：已提交搜索，但没有记录到本字段测试值。',
		})
	}

	function rememberFieldMetadata(state, key, input) {
		if (!state || !key) return
		if (!Array.isArray(state.fieldOrder)) state.fieldOrder = []
		if (!state.fieldOrder.includes(key)) state.fieldOrder.push(key)
		if (!state.fields || typeof state.fields !== 'object') state.fields = {}
		const previous = state.fields[key] || {}
		const next = {
			...previous,
			key,
			index: Number(input?.workflow_field_index ?? input?.index),
			label: String(input?.workflow_field_label || input?.target_label || input?.label || ''),
			fieldType: String(input?.workflow_field_type || ''),
		}
		const testValue = String(input?.workflow_test_value || input?.text || input?.label || '').trim()
		if (testValue) {
			next.lastTestValue = testValue
			next.lastValueSource = String(input?.workflow_value_source || previous.lastValueSource || '')
			next.lastValueBasis = String(input?.workflow_value_basis || previous.lastValueBasis || '')
		}
		state.fields[key] = next
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
		const terminalFieldKey = buildSyntheticFieldKey(item?.input || {}) || state.activeFieldKey || state.lastSearchedFieldKey || ''
		state.phase = 'completed'
		state.activeFieldKey = ''
		state.lastSearchedFieldKey = ''
		state.pendingDropdownOutput = ''
		state.pendingDropdownCandidates = []
		state.terminalSuccess = success
		state.terminalFieldKey = success ? '' : terminalFieldKey
		state.terminalReason = getHistoryFailureReason(item, success ? '搜索工作流已完成' : '搜索工作流已终止')
		if (!success) state.failedReason = state.terminalReason
	}

	function isTerminalSearchPhase(phase) {
		return /^(complete|completed|done|finished|terminal)$/i.test(String(phase || '').trim())
	}

	function markSearchFieldCompleted(state, key, options = {}) {
		searchState.markSearchFieldCompleted(state, key, options)
	}

	function markSearchFieldSkipped(state, key) {
		searchState.markSearchFieldSkipped(state, key)
	}

	function rememberFailedSelectionLabel(state, key, label) {
		searchState.rememberFailedSelectionLabel(state, key, label)
	}

	function incrementDropdownOpenAttempt(state, key) {
		searchState.incrementDropdownOpenAttempt(state, key)
	}

	function setPendingDateRangeStart(state, key, value) {
		if (!state || !key) return
		if (!state.pendingDateRangeStartByKey || typeof state.pendingDateRangeStartByKey !== 'object') {
			state.pendingDateRangeStartByKey = {}
		}
		const date = normalizeDateCandidate(value)
		if (date) state.pendingDateRangeStartByKey[key] = date
	}

	function clearPendingDateRangeStart(state, key) {
		if (!state?.pendingDateRangeStartByKey || !key) return
		delete state.pendingDateRangeStartByKey[key]
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

	function isResetFailureHistory(item) {
		return searchHistory.isResetFailureHistory(item)
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

	function getOutcomeSelectedPath(outcome) {
		return searchHistory.getOutcomeSelectedPath(outcome)
	}

	function normalizeOutcomeObject(outcome) {
		return searchHistory.normalizeOutcomeObject(outcome)
	}

	function getFieldKey(field) {
		const index = Number(field?.index)
		if (Number.isFinite(index)) return `index:${index}`
		const label = normalizeText(getFieldLabel(field) || field?.label || field?.placeholder || field?.text)
		return label ? `label:${label}` : ''
	}

	function getFieldLabel(field) {
		for (const value of [field?.searchLabel, field?.label, field?.placeholder, field?.text]) {
			const label = normalizeSearchFieldLabel(value)
			if (label) return label
		}
		return ''
	}

	function isSearchTestTask(taskText) {
		const text = normalizeText(taskText)
		return /(搜索|查询|筛选|过滤|search|filter)/i.test(text) &&
			/(测试|验证|检查|每个|每一个|所有|全部|功能|是否正常|test|verify|check)/i.test(text)
	}

	function isSearchWorkflowTask(session) {
		const intent = typeof taskIntent?.getTaskIntent === 'function'
			? taskIntent.getTaskIntent(session)
			: null
		if (intent && typeof intent === 'object') {
			const operation = String(intent.operation || '').trim()
			const scope = String(intent.operationScope || '').trim()
			if (operation === 'search' && scope === 'all_matching_controls') return true
			if (operation && operation !== 'search') return false
		}
		return isSearchTestTask(session?.latestTask || session?.task || '')
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
		const expandedSearchPanels = panels.filter((panel) => isSearchPanel(panel) && /^expanded$/i.test(String(panel?.state || '')))
		const hasExpandedSearchPanel = expandedSearchPanels.length > 0
		const panelLabels = collectSearchPanelFieldLabels(expandedSearchPanels)
		const fields = []
		for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
			const formText = normalizeText([form?.id, form?.name].filter(Boolean).join(' '))
			const formLooksSearch = /(filter|search|搜索|查询|筛选)/i.test(formText)
			for (const field of (Array.isArray(form?.fields) ? form.fields : [])) {
				if (!Number.isFinite(Number(field?.index))) continue
				if (!isPageSearchRegion(field)) continue
				const containerText = normalizeText([field?.semanticContainer, field?.container].filter(Boolean).join(' '))
				const fieldLooksSearch = /(filter|search|搜索|查询|筛选)/i.test(containerText)
				const panelLabel = findPanelMatchedFieldLabel(field, panelLabels)
				if (hasExpandedSearchPanel) {
					if (!formLooksSearch && !fieldLooksSearch && !panelLabel) continue
				} else if (!formLooksSearch && !fieldLooksSearch) {
					continue
				}
				const normalizedField = panelLabel ? { ...field, searchLabel: panelLabel } : field
				if (!isUsableSearchField(normalizedField)) continue
				fields.push(normalizedField)
			}
		}
		return pruneDuplicateWeakLabelFields(dedupeFields(fields))
	}

	function isPageSearchRegion(field) {
		const region = String(field?.region || '').trim().toLowerCase()
		return !region || ['content', 'dialog'].includes(region)
	}

	function isUsableSearchField(field) {
		const label = getFieldLabel(field)
		if (!label || isGenericSearchFieldLabel(label)) return false
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

	function pruneDuplicateWeakLabelFields(fields) {
		const list = Array.isArray(fields) ? fields : []
		const groups = new Map()
		for (const field of list) {
			const key = normalizeText(getFieldLabel(field))
			if (!key) continue
			if (!groups.has(key)) groups.set(key, [])
			groups.get(key).push(field)
		}
		const dropped = new Set()
		for (const group of groups.values()) {
			if (!Array.isArray(group) || group.length < 2) continue
			const scored = group.map((field, order) => ({
				field,
				order,
				score: scoreSearchFieldLabelEvidence(field),
				weak: isWeakSearchFieldLabelEvidence(field),
			}))
			const strongest = scored.reduce((best, item) =>
				!best || item.score > best.score || (item.score === best.score && item.order < best.order)
					? item
					: best
			, null)
			if (!strongest) continue
			const hasStrongEvidence = scored.some((item) => !item.weak)
			for (const item of scored) {
				if (item === strongest) continue
				if (hasStrongEvidence && item.weak && item.score + 8 < strongest.score) {
					dropped.add(item.field)
				}
			}
		}
		return dropped.size ? list.filter((field) => !dropped.has(field)) : list
	}

	function scoreSearchFieldLabelEvidence(field) {
		const source = normalizeText(field?.labelSource || field?.source || '')
		const confidence = Number(field?.labelConfidence ?? field?.labelConf ?? 0)
		let score = 20
		if (/(aria-labelledby|native-label|label-for|form-item-label|wrapped-label)/i.test(source)) score = 100
		else if (/(aria-label|data-label)/i.test(source)) score = 88
		else if (/spatial-left/i.test(source)) score = 72
		else if (/placeholder/i.test(source)) score = 48
		else if (/spatial-above/i.test(source)) score = 36
		else if (/(name|id|text)/i.test(source)) score = 26
		if (Number.isFinite(confidence) && confidence > 0) score += Math.min(20, Math.max(0, confidence * 20))
		return score
	}

	function isWeakSearchFieldLabelEvidence(field) {
		const source = normalizeText(field?.labelSource || field?.source || '')
		const confidence = Number(field?.labelConfidence ?? field?.labelConf ?? 0)
		if (/spatial-above|placeholder|name|id|text|unknown/i.test(source)) return true
		return Number.isFinite(confidence) && confidence > 0 && confidence < 0.72
	}

	function normalizeSearchFieldLabel(value) {
		let text = String(value || '')
			.replace(/\s+/g, ' ')
			.replace(/^[：:：\s]+|[：:：\s]+$/g, '')
			.trim()
		if (!text) return ''
		text = text
			.replace(/^(?:请输入|请选择|请填写|请录入|请搜索|请查询|输入|选择|搜索|查询|select|choose|pick|enter)\s*/i, '')
			.replace(/^[：:：\s]+|[：:：\s]+$/g, '')
			.trim()
		if (isGenericSearchFieldLabel(text)) return ''
		return text
	}

	function isGenericSearchFieldLabel(value) {
		const text = normalizeText(value)
		if (!text) return true
		if (/^(empty|\(empty\)|unknown|null|undefined|-|--|—|_|\*|请选择|请输入|请填写|请录入|输入|选择|搜索|查询|筛选|过滤|搜索内容|查询内容|筛选条件|过滤条件|展开选项|to|from|start|end)$/i.test(text)) {
			return true
		}
		return false
	}

	function isSelectionField(field) {
		const role = String(field?.role || '').toLowerCase()
		const tag = String(field?.tag || '').toLowerCase()
		const control = String(field?.selectionControl || field?.control || '').toLowerCase()
		const fieldType = String(field?.fieldType || '').toLowerCase()
		const compactFieldType = fieldType.replace(/[-_\s]+/g, '')
		if (Array.isArray(field?.optionLabels) && field.optionLabels.length) return true
		if (['combobox', 'listbox'].includes(role)) return true
		if (tag === 'select') return true
		if (/(dropdown|select|cascader|checkbox|radio)/i.test(control)) return true
		return /^(select|date|time|datetime|month|year|week|daterange|datetimerange|timerange|monthrange|yearrange|weekrange)$/.test(compactFieldType)
	}

	function findSearchSubmitAction(observation, fields = []) {
		return findActionByText(observation, /(搜索|查询|查找|检索|筛选|过滤|应用|确定|确认|提交|search|query|submit|filter|apply|ok|go|run)/i, fields, 'submit')
	}

	function findSearchResetAction(observation, fields = []) {
		return findActionByText(
			observation,
			/(重置|清空|清除|清理|恢复默认|取消筛选|清除筛选|清空筛选|重置筛选|移除筛选|清除过滤|清空过滤|重置过滤|清除条件|清空条件|重置条件|清除全部条件|全部清除条件|清空全部条件|重置全部条件|清空表单|重置表单|清空字段|重置字段|清除字段|清除已选|清空已选|重置已选|清除选择|清空选择|重置选择|取消选择|取消全部选择|清除查询|清空查询|重置查询|reset|clear|removefilter|clearcriteria|clearallcriteria|resetcriteria|resetallcriteria|removecriteria|removeallcriteria|clearform|resetform|clearfields|resetfields|removefields|clearselection|clearselections|resetselection|resetselections|clearselected|remove selected|removeselected|deselectall|unselectall|clearquery|resetquery)/i,
			fields,
			'reset'
		)
	}

	function findActionByText(observation, pattern, fields = [], kind = '') {
		const actions = Array.isArray(observation?.actions) ? observation.actions : []
		const candidates = actions.filter((action) => {
			if (!Number.isFinite(Number(action?.index))) return false
			const region = String(action?.region || '').trim().toLowerCase()
			if (region && !['content', 'dialog', 'popover'].includes(region)) return false
			const text = normalizeText(getActionSearchText(action))
			if (kind === 'submit' && !isSearchSubmitActionCandidate(action, text, fields)) return false
			if (kind === 'reset' && !isSearchResetActionCandidate(action, text, fields)) return false
			return pattern.test(text)
		})
		if (!candidates.length) return null
		return candidates
			.map((action, order) => ({
				action,
				order,
				score: scoreSearchActionCandidate(action, fields, kind),
			}))
			.sort((a, b) => a.score - b.score || a.order - b.order)
			[0]?.action || null
	}

	function scoreSearchActionCandidate(action, fields = [], kind = '') {
		const region = String(action?.region || '').trim().toLowerCase()
		const label = normalizeText(getActionLabel(action))
		const intent = normalizeText(getActionSearchText(action))
		let score = 0
		if (region === 'dialog') score -= 30
		else if (region === 'content') score -= 20
		else if (region === 'popover') score += 10
		if (kind === 'submit') {
			if (isExplicitFilterSubmitActionText(intent)) score -= 95
			if (/^(搜索|查询|查找|检索|筛选|过滤|应用筛选|应用过滤|应用|确定|确认|提交|search|query|submit|filter|apply|ok|go|run)$/i.test(label)) score -= 80
			if (/(search|query|submit|filter|搜索|查询|查找|检索|筛选|过滤|确定|确认|提交)/i.test(intent)) score -= 40
		} else if (kind === 'reset') {
			if (isExplicitFilterResetActionText(intent)) score -= 95
			if (/^(重置|清空|清除|清理|恢复默认|清空全部|全部清空|重置全部|全部重置|清除全部条件|全部清除条件|清空全部条件|重置全部条件|清空表单|重置表单|清空字段|重置字段|清除字段|清除已选|清空已选|重置已选|清除选择|清空选择|重置选择|取消选择|取消全部选择|reset|clear|clearall|resetall|clearallcriteria|resetallcriteria|removeallcriteria|clearform|resetform|clearfields|resetfields|removefields|clearselection|clearselections|resetselection|resetselections|clearselected|removeselected|deselectall|unselectall)$/.test(label)) score -= 80
			if (/(reset|clear|重置|清空|清除|清理|恢复默认|取消筛选|清除筛选|清空筛选|重置筛选|移除筛选|清除过滤|清空过滤|重置过滤|清除条件|清空条件|重置条件|清除已选|清空已选|重置已选|清除选择|清空选择|重置选择|取消选择|取消全部选择|清除查询|清空查询|重置查询|clearfilters|clearallfilters|resetfilters|resetallfilters|removefilters|removeallfilters|clearcriteria|resetcriteria|clearselection|clearselections|resetselection|resetselections|clearselected|removeselected|deselectall|unselectall|clearquery|resetquery)/i.test(intent)) score -= 40
		}
		const spatial = scoreSearchActionSpatialRelation(action, fields)
		if (Number.isFinite(spatial)) score += spatial
		const rect = normalizeRect(action?.rect)
		const fallbackTop = rect ? rect.top : Number(action?.index) || 9999
		const fallbackLeft = rect ? rect.left : 0
		return score * 1000000 + fallbackTop * 1000 + fallbackLeft
	}

	function isSearchSubmitActionCandidate(action, normalizedText = '', fields = []) {
		const text = normalizedText || normalizeText(getActionSearchText(action))
		if (!text) return false
		if (isExplicitFilterResetActionText(text)) return false
		if (isDangerousNonResetActionText(text)) return false
		if (isExplicitFilterSubmitActionText(text)) return true
		const label = normalizeText(getActionLabel(action))
		const intent = normalizeText(action?.actionIntent || action?.intent || '')
		if (/^(搜索|查询|查找|检索|筛选|过滤|应用筛选|应用过滤|search|query|submit|filter)$/i.test(label)) return true
		if (/^(search|query|filter)$/i.test(intent)) return true
		if (intent === 'submit' && hasSearchActionSpatialEvidence(action, fields)) return true
		if (/^(应用|确定|确认|提交|apply|ok|go|run)$/i.test(label)) return hasSearchActionSpatialEvidence(action, fields)
		return false
	}

	function isExplicitFilterSubmitActionText(text) {
		return /(应用筛选|应用过滤|确定筛选|确认筛选|执行筛选|执行过滤|执行搜索|执行查询|开始筛选|开始过滤|提交筛选|提交过滤|搜索|查询|查找|检索|筛选|过滤|search|query|filter|find|lookup|applyfilter|applyfilters|confirmfilter|confirmfilters|submitsearch|submitfilter|runsearch|runquery|runfilter|searchsubmit|filterapply)/i.test(normalizeActionCueText(text))
	}

	function isSearchResetActionCandidate(action, normalizedText = '', fields = []) {
		const text = normalizedText || normalizeText(getActionSearchText(action))
		if (!text) return false
		if (/(resetpassword|forgotpassword|找回密码|忘记密码)/i.test(text)) return false
		if (isExplicitFilterResetActionText(text)) {
			if (isSelectionResetActionText(text)) return hasSelectionResetActionEvidence(action, fields)
			return true
		}
		if (isDangerousNonResetActionText(text)) return false
		const label = normalizeText(getActionLabel(action))
		const intent = normalizeText(action?.actionIntent || action?.intent || '')
		if (intent === 'reset') return !isSearchActionSpatiallyContradicted(action, fields)
		if (/^(重置|清空|清除|清理|恢复默认|清空全部|全部清空|重置全部|全部重置|清除全部条件|全部清除条件|清空全部条件|重置全部条件|清空表单|重置表单|清空字段|重置字段|清除字段|清除已选|清空已选|重置已选|清除选择|清空选择|重置选择|取消选择|取消全部选择|reset|clear|clearall|resetall|clearallcriteria|resetallcriteria|removeallcriteria|clearform|resetform|clearfields|resetfields|removefields|clearselection|clearselections|resetselection|resetselections|clearselected|removeselected|deselectall|unselectall)$/.test(label)) {
			if (isSelectionResetActionText(label)) return hasSelectionResetActionEvidence(action, fields)
			return !isSearchActionSpatiallyContradicted(action, fields)
		}
		return false
	}

	function isExplicitFilterResetActionText(text) {
		return /(取消筛选|清除筛选|清空筛选|重置筛选|移除筛选|取消过滤|清除过滤|清空过滤|重置过滤|移除过滤|清除条件|清空条件|重置条件|清除全部条件|全部清除条件|清空全部条件|重置全部条件|清空表单|重置表单|清空字段|重置字段|清除字段|清除已选|清空已选|重置已选|清除选择|清空选择|重置选择|取消选择|取消全部选择|清除搜索|清空搜索|重置搜索|清除查询|清空查询|重置查询|clearfilter|clearfilters|clearallfilters|resetfilter|resetfilters|resetallfilters|removefilter|removefilters|removeallfilters|clearsearch|resetsearch|clearcondition|resetcondition|clearcriteria|clearallcriteria|resetcriteria|resetallcriteria|removecriteria|removeallcriteria|clearform|resetform|clearfields|resetfields|removefields|clearselection|clearselections|resetselection|resetselections|clearselected|removeselected|deselectall|unselectall|clearquery|resetquery)/i.test(normalizeActionCueText(text))
	}

	function isSelectionResetActionText(text) {
		return /(清除已选|清空已选|重置已选|清除选择|清空选择|重置选择|取消选择|取消全部选择|clearselection|clearselections|resetselection|resetselections|clearselected|removeselected|deselectall|unselectall)/i.test(normalizeActionCueText(text))
	}

	function hasSelectionResetActionEvidence(action, fields = []) {
		if (isSearchActionSpatiallyContradicted(action, fields)) return false
		if (hasSearchActionSpatialEvidence(action, fields)) return true
		return (Array.isArray(fields) ? fields : []).some(isSelectionField)
	}

	function isDangerousNonResetActionText(text) {
		return /(删除|移除|作废|注销|退出|关闭|取消|delete|remove|trash|void|logout|signout|close|cancel)/i.test(normalizeActionCueText(text))
	}

	function normalizeActionCueText(value) {
		return String(value || '').replace(/[\s_\-:：.。/\\|｜]+/g, '').trim().toLowerCase()
	}

	function hasSearchActionSpatialEvidence(action, fields = []) {
		const actionRect = normalizeRect(action?.rect)
		const fieldRects = (Array.isArray(fields) ? fields : [])
			.map((field) => normalizeRect(field?.rect))
			.filter(Boolean)
		if (!actionRect || !fieldRects.length) return false
		if (isSearchActionSpatiallyContradicted(action, fields)) return false
		const spatial = scoreSearchActionSpatialRelation(action, fields)
		return Number.isFinite(spatial) && spatial < 3200
	}

	function isSearchActionSpatiallyContradicted(action, fields = []) {
		const actionRect = normalizeRect(action?.rect)
		const fieldRects = (Array.isArray(fields) ? fields : [])
			.map((field) => normalizeRect(field?.rect))
			.filter(Boolean)
		if (!actionRect || !fieldRects.length) return false
		const bounds = getRectBounds(fieldRects)
		const actionCenter = rectCenter(actionRect)
		if (actionCenter.y > bounds.bottom + 220) return true
		if (actionCenter.y < bounds.top - 140) return true
		if (actionCenter.x < bounds.left - 220) return true
		if (actionCenter.x > bounds.right + 520) return true
		const spatial = scoreSearchActionSpatialRelation(action, fields)
		return !Number.isFinite(spatial) || spatial >= 4600
	}

	function scoreSearchActionSpatialRelation(action, fields = []) {
		const actionRect = normalizeRect(action?.rect)
		const fieldRects = (Array.isArray(fields) ? fields : [])
			.map((field) => normalizeRect(field?.rect))
			.filter(Boolean)
		if (!actionRect || !fieldRects.length) return Number.POSITIVE_INFINITY
		const bounds = getRectBounds(fieldRects)
		const nearest = Math.min(...fieldRects.map((rect) => rectCenterDistance(actionRect, rect)))
		let score = Math.min(5000, nearest)
		const actionCenter = rectCenter(actionRect)
		if (actionCenter.y >= bounds.top - 32 && actionCenter.y <= bounds.bottom + 96) score -= 2200
		else score += 1800
		if (actionCenter.x >= bounds.left - 40 && actionCenter.x <= bounds.right + 360) score -= 700
		if (actionCenter.y < bounds.top - 96) score += 1800
		if (actionCenter.y > bounds.bottom + 220) score += 1200
		return score
	}

	function getRectBounds(rects) {
		const left = Math.min(...rects.map((rect) => rect.left))
		const top = Math.min(...rects.map((rect) => rect.top))
		const right = Math.max(...rects.map((rect) => rect.left + rect.width))
		const bottom = Math.max(...rects.map((rect) => rect.top + rect.height))
		return { left, top, right, bottom }
	}

	function rectCenterDistance(a, b) {
		const ac = rectCenter(a)
		const bc = rectCenter(b)
		return Math.abs(ac.x - bc.x) + Math.abs(ac.y - bc.y)
	}

	function rectCenter(rect) {
		return {
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
		}
	}

	function normalizeRect(rect) {
		if (!rect || typeof rect !== 'object') return null
		const left = Number(rect.left)
		const top = Number(rect.top)
		const width = Number(rect.width)
		const height = Number(rect.height)
		if (![left, top, width, height].every(Number.isFinite)) return null
		if (width <= 0 || height <= 0) return null
		return { left, top, width, height }
	}

	function getActionLabel(action) {
		return String(
			action?.label ||
			action?.text ||
			action?.accessibleName ||
			action?.ariaLabel ||
			action?.aria_label ||
			action?.title ||
			action?.name ||
			action?.tooltip ||
			action?.description ||
			''
		).trim()
	}

	function getActionSearchText(action) {
		const selectorHints = action?.selectorHints && typeof action.selectorHints === 'object'
			? action.selectorHints
			: {}
		return [
			action?.actionIntent,
			action?.intent,
			action?.label,
			action?.text,
			action?.accessibleName,
			action?.ariaLabel,
			action?.aria_label,
			action?.title,
			action?.name,
			action?.tooltip,
			action?.description,
			action?.placeholder,
			action?.valueState,
			action?.className,
			action?.parentClassName,
			action?.iconClass,
			selectorHints.id,
			selectorHints.name,
			selectorHints.testId,
			selectorHints.dataTest,
			selectorHints.dataCy,
			selectorHints.className,
		].filter(Boolean).join(' ')
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

	function hasFilledSearchFields(fields) {
		return (Array.isArray(fields) ? fields : []).some((field) => isFilled(field))
	}

	function canClearSearchFieldByInput(field) {
		if (!field || typeof field !== 'object') return false
		if (!Number.isFinite(Number(field.index))) return false
		if (!isPageSearchRegion(field)) return false
		if (isSelectionField(field)) return false
		if (isUnsafeSearchFieldClearTarget(field)) return false
		if (hasReadonlyOrDisabledState(field)) return false
		if (field.editable === false) return false
		const role = String(field.role || '').toLowerCase()
		const tag = String(field.tag || '').toLowerCase()
		const type = String(field.type || '').toLowerCase()
		const fieldType = String(field.fieldType || '').toLowerCase()
		if (/(select|dropdown|date|time|range|checkbox|radio|switch|cascader|picker|calendar|multi|multiple)/i.test(fieldType)) return false
		if (['textbox', 'searchbox'].includes(role)) return true
		if (tag === 'textarea') return true
		if (tag === 'input') return !type || /^(text|search|email|tel|url|number)$/i.test(type)
		if (type && /^(text|search|email|tel|url|number)$/i.test(type)) return true
		return field.editable === true
	}

	function isUnsafeSearchFieldClearTarget(field) {
		if (!field || typeof field !== 'object') return false
		if (/^selected:/i.test(String(field.valueState || field.value || ''))) return true
		if (isTemporalSearchField(field)) return true
		const structuralText = normalizeText([
			field.fieldType,
			field.selectionControl,
			field.control,
			field.role,
			field.className,
			field.classes,
			field.inputMode,
		].filter(Boolean).join(' '))
		if (/(select|dropdown|combobox|listbox|picker|calendar|cascader|tree|checkbox|radio|switch|multi|multiple)/i.test(structuralText)) {
			return true
		}
		const promptText = normalizeText([
			field.placeholder,
			field.ariaLabel,
			field.aria_label,
			field.title,
			field.name,
			field.valueState,
		].filter(Boolean).join(' '))
		return /^(请选择|选择|select|choose|pick)/i.test(promptText)
	}

	function hasReadonlyOrDisabledState(field) {
		if (!field || typeof field !== 'object') return false
		for (const key of ['disabled', 'readonly', 'readOnly', 'ariaDisabled', 'ariaReadonly']) {
			const value = field[key]
			if (value === true || String(value || '').toLowerCase() === 'true') return true
		}
		const text = normalizeText([
			field.state,
			field.stateHints,
			field.flags,
			field.className,
			field.classes,
		].filter(Boolean).join(' '))
		return /(disabled=true|readonly=true|aria-disabled=true|aria-readonly=true|is-disabled|disabled|readonly)/i.test(text)
	}

	function allSearchFieldsCompleted(state) {
		const total = Array.isArray(state?.fieldOrder) ? state.fieldOrder.length : 0
		const covered = mergeSearchFieldKeys(state?.completedKeys, state?.skippedKeys).length
		return total > 0 && covered >= total
	}

	function mergeSearchFieldKeys(...groups) {
		const out = []
		const seen = new Set()
		for (const group of groups) {
			for (const key of (Array.isArray(group) ? group : [])) {
				const text = String(key || '').trim()
				if (!text || seen.has(text)) continue
				seen.add(text)
				out.push(text)
			}
		}
		return out
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

	function buildSearchFieldTestText(session, field, observation) {
		return buildSearchFieldTestValue(session, field, observation).text
	}

	function buildSearchFieldTestValue(session, field, observation, planningContext = []) {
		const observedSample = pickSearchFieldSampleText(observation, field)
		const contextSample = observedSample ? '' : pickSearchFieldSampleTextFromPlanningContext(planningContext, field)
		const sampled = observedSample || contextSample
		if (sampled) {
			return {
				text: sampled,
				source: 'table_sample',
				basis: observedSample ? '当前列表已有数据' : '补充表格上下文已有数据',
			}
		}
		const taskText = String(session?.latestTask || session?.task || '')
		const explicitTaskValue = extractTaskSearchValueForField(taskText, field)
		if (explicitTaskValue) {
			return {
				text: explicitTaskValue,
				source: 'task_value',
				basis: '任务文本明确指定的搜索值',
			}
		}
		return { text: '', source: 'missing_sample', basis: '无列表样本或任务显式值' }
	}

	function extractTaskValue(text, pattern, field = null) {
		const source = String(text || '')
		for (const match of matchTaskValues(source, pattern)) {
			const value = String(match?.[1] || '').trim()
			if (!value) continue
			if (isCredentialSearchValueAmbiguous(source, field, match.index || 0)) continue
			return value
		}
		return ''
	}

	function matchTaskValues(text, pattern) {
		if (!(pattern instanceof RegExp)) return []
		const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
		const globalPattern = new RegExp(pattern.source, flags)
		return [...String(text || '').matchAll(globalPattern)]
	}

	function extractTaskSearchValueForField(taskText, field) {
		const text = String(taskText || '')
		if (!text.trim()) return ''
		for (const label of getFieldLabelCandidates(field)) {
			const value = extractTaskValueAfterLabel(text, label, field)
			if (isUsableTaskSearchValue(value, field)) return value
		}
		return extractTypedTaskSearchValue(text, field)
	}

	function extractTaskValueAfterLabel(taskText, label, field = null) {
		const rawLabel = String(label || '').trim()
		if (!rawLabel) return ''
		if (isDateRangeField(field)) {
			const rangeValue = extractDateRangeTaskValueAfterLabel(taskText, rawLabel)
			if (rangeValue) return rangeValue
		}
		const wrappedValue = extractWrappedTaskValueAfterLabel(taskText, rawLabel, field)
		if (wrappedValue) return wrappedValue
		const escaped = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const pattern = new RegExp(`${escaped}\\s*(是|为|=|:|：|设为|设置为|选择)?\\s*([^\\s,，;；。]{1,64})`, 'ig')
		for (const match of String(taskText || '').matchAll(pattern)) {
			const connector = String(match?.[1] || '').trim()
			const value = String(match?.[2] || '').trim()
			if (!value) continue
			if (!connector && isImplicitTaskSearchInstructionValue(value)) continue
			if (isCredentialSearchValueAmbiguous(taskText, field, match.index || 0)) continue
			return value
		}
		return ''
	}

	function extractWrappedTaskValueAfterLabel(taskText, label, field = null) {
		const source = String(taskText || '')
		const rawLabel = String(label || '').trim()
		if (!source.trim() || !rawLabel) return ''
		const escaped = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const connector = '(?:设置为|设定为|指定为|选择为|选为|填写为|填为|输入为|录入为|搜索为|查询为|设为|是|为|=|:|：|equals?|is|set\\s+to)'
		const wrappers = [
			['["“]', '["”]'],
			["['‘]", "['’]"],
			['`', '`'],
			['「', '」'],
			['『', '』'],
			['《', '》'],
			['【', '】'],
			['\\[', '\\]'],
			['\\(', '\\)'],
			['（', '）'],
		]
		for (const [open, close] of wrappers) {
			const pattern = new RegExp(`${escaped}\\s*${connector}\\s*${open}([^\\n]{1,64}?)${close}`, 'ig')
			for (const match of source.matchAll(pattern)) {
				const value = String(match?.[1] || '').trim()
				if (!value) continue
				if (isCredentialSearchValueAmbiguous(source, field, match.index || 0)) continue
				return value
			}
		}
		return ''
	}

	function extractDateRangeTaskValueAfterLabel(taskText, label) {
		const rawLabel = String(label || '').trim()
		if (!rawLabel) return ''
		const escaped = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const pattern = new RegExp(`${escaped}\\s*(?:是|为|=|:|：|设为|设置为|选择|从|在)?\\s*([^,，;；。\\n]{1,160})`, 'ig')
		for (const match of String(taskText || '').matchAll(pattern)) {
			const text = String(match?.[1] || '').trim()
			const range = extractExplicitDateRangeText(text)
			if (range) return range
		}
		return ''
	}

	function extractExplicitDateRangeText(value) {
		const text = String(value || '').trim()
		if (!text) return ''
		const dateToken = '(?:\\d{4}\\s*[-/.年]\\s*\\d{1,2}\\s*[-/.月]\\s*\\d{1,2}\\s*(?:日)?|\\b\\d{8}\\b)'
		const pattern = new RegExp(`(${dateToken})\\s*(?:至|到|~|～|—|–|－|--|\\.\\.|-|to|through|thru|until|and)\\s*(${dateToken})`, 'i')
		const match = text.match(pattern)
		if (!match) return ''
		const start = normalizeDateCandidate(match[1])
		const end = normalizeDateCandidate(match[2])
		if (!start || !end || start === end) return ''
		return match[0].trim()
	}

	function extractTypedTaskSearchValue(taskText, field) {
		const label = normalizeText(getFieldLabel(field))
		const fieldType = String(field?.fieldType || '').toLowerCase()
		const type = String(field?.type || '').toLowerCase()
		const patterns = []
		if (/(phone|mobile|tel)/i.test(fieldType) || /(联系方式|手机|电话|手机号|phone|mobile|tel)/i.test(label)) {
			patterns.push(/(?:联系方式|联系电话|手机号|手机|电话|phone|mobile|tel)\s*(?:是|为|=|:|：)?\s*([+\d][\d\s-]{5,24})/i)
		}
		if (/(email|mail)/i.test(fieldType) || /(邮箱|邮件|email|mail)/i.test(label)) {
			patterns.push(/(?:邮箱|邮件|email|mail)\s*(?:是|为|=|:|：)?\s*([A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i)
		}
		if (/(date|time)/i.test(fieldType) || type === 'date' || /(日期|时间|开始|结束|date|time)/i.test(label)) {
			patterns.push(/(?:日期|时间|开始时间|结束时间|date|time)\s*(?:是|为|=|:|：)?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/i)
			patterns.push(/(?:时间|开始时间|结束时间|time|starttime|endtime)\s*(?:是|为|=|:|：)?\s*(\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?)/i)
		}
		if (/(number|amount|price|count|quantity)/i.test(fieldType) || type === 'number') {
			patterns.push(/(?:数量|金额|价格|编号|编码|number|amount|price|count|quantity)\s*(?:是|为|=|:|：)?\s*([A-Za-z0-9_.-]{1,64})/i)
		}
		for (const pattern of patterns) {
			const value = extractTaskValue(taskText, pattern, field)
			if (isUsableTaskSearchValue(value, field)) return value
		}
		return ''
	}

	function isImplicitTaskSearchInstructionValue(value) {
		const normalized = normalizeText(value)
		if (!normalized) return false
		if (/^(?:每一个|每个|所有|全部|各个|all|every|each).{0,16}(?:搜索|查询|筛选|过滤|search|query|filter)/i.test(normalized)) return true
		if (/^(?:搜索|查询|筛选|过滤|search|query|filter)(?:功能|条件|项|字段|控件|区域|框|内容|value|field|fields|control|controls|condition|conditions|area|box)?(?:是否)?(?:正常|实现|可用|work|works|available|implemented)?$/i.test(normalized)) return true
		if (/^(?:搜索|查询|筛选|过滤|search|query|filter).{0,20}(?:是否)?(?:正常|实现|可用|work|works|available|implemented)$/i.test(normalized)) return true
		if (/^(?:输入框|输入项|文本框|字段|控件|条件|功能|field|fields|input|inputs|control|controls|condition|conditions|function|feature)(?:是否)?(?:正常|实现|可用|work|works|available|implemented)?$/i.test(normalized)) return true
		if (/^(?:输入框|输入项|文本框|字段|控件|条件|功能|field|fields|input|inputs|control|controls|condition|conditions|function|feature).{0,20}(?:是否)?(?:正常|实现|可用|work|works|available|implemented)$/i.test(normalized)) return true
		return false
	}

	function isCredentialSearchValueAmbiguous(taskText, field, matchIndex = 0) {
		if (!isCredentialLikeSearchField(field)) return false
		const text = String(taskText || '')
		const index = Math.max(0, Number(matchIndex) || 0)
		const before = text.slice(Math.max(0, index - 64), index)
		const after = text.slice(index, Math.min(text.length, index + 80))
		if (/(搜索|查询|筛选|过滤|search|query|filter)(?:字段|项|条件|值)?\s*$/i.test(before)) return false
		if (isAccountLikeSearchField(field) && /(密码|口令|验证码|password|passcode|otp)\s*(?:是|为|=|:|：)?\s*\S+/i.test(after)) return true
		if ((isPasswordLikeSearchField(field) || isOtpLikeSearchField(field)) && hasCredentialAccountBefore(before)) return true
		if ((isPhoneLikeSearchField(field) || isEmailLikeSearchField(field)) && hasCredentialSecretAfter(after)) return true
		if (/(登录|登陆|认证|login|sign\s*in)/i.test(before + after)) return true
		return false
	}

	function isCredentialLikeSearchField(field) {
		return isAccountLikeSearchField(field) ||
			isPasswordLikeSearchField(field) ||
			isOtpLikeSearchField(field) ||
			isPhoneLikeSearchField(field) ||
			isEmailLikeSearchField(field)
	}

	function isAccountLikeSearchField(field) {
		const label = normalizeText(getFieldLabel(field))
		const fieldType = String(field?.fieldType || '').toLowerCase()
		return /(username|account|login|user)/i.test(fieldType) ||
			/(登录账号|用户名|账号|账户|account|username|user)/i.test(label)
	}

	function isPasswordLikeSearchField(field) {
		const label = normalizeText(getFieldLabel(field))
		const fieldType = String(field?.fieldType || '').toLowerCase()
		const type = String(field?.type || '').toLowerCase()
		return /(password|passcode|pwd)/i.test(fieldType) ||
			/(password|passcode|pwd)/i.test(type) ||
			/(登录密码|登陆密码|密码|口令|password|passcode|pwd)/i.test(label)
	}

	function isOtpLikeSearchField(field) {
		const label = normalizeText(getFieldLabel(field))
		const fieldType = String(field?.fieldType || '').toLowerCase()
		return /(otp|captcha|verification|verify|authcode|securitycode)/i.test(fieldType) ||
			/(验证码|校验码|动态码|安全码|otp|captcha|verificationcode|verifycode|authcode|securitycode)/i.test(label)
	}

	function isPhoneLikeSearchField(field) {
		const label = normalizeText(getFieldLabel(field))
		const fieldType = String(field?.fieldType || '').toLowerCase()
		const type = String(field?.type || '').toLowerCase()
		return /(phone|mobile|tel)/i.test(fieldType) ||
			/(phone|mobile|tel)/i.test(type) ||
			/(联系方式|联系电话|手机号|手机|电话|phone|mobile|tel)/i.test(label)
	}

	function isEmailLikeSearchField(field) {
		const label = normalizeText(getFieldLabel(field))
		const fieldType = String(field?.fieldType || '').toLowerCase()
		const type = String(field?.type || '').toLowerCase()
		return /(email|mail)/i.test(fieldType) ||
			/(email|mail)/i.test(type) ||
			/(邮箱|邮件|email|mail)/i.test(label)
	}

	function hasCredentialAccountBefore(text) {
		return /(?:账号|账户|用户名|登录账号|登陆账号|user|username|account)\s*(?:是|为|=|:|：)?\s*[^\s，,；;。]+(?:\s*)$/i.test(String(text || ''))
	}

	function hasCredentialSecretAfter(text) {
		return /(?:密码|口令|验证码|校验码|动态码|安全码|password|passcode|pwd|otp|captcha|verificationcode|verifycode|authcode)\s*(?:是|为|=|:|：)?\s*\S+/i.test(String(text || ''))
	}

	function isUsableTaskSearchValue(value, field) {
		const text = String(value || '').trim()
		const normalized = normalizeText(text)
		if (!normalized || normalized.length > 64) return false
		if (/^(empty|\(empty\)|unknown|null|undefined|-|--|请选择|请输入|搜索|查询|筛选|清空|重置|新增|导入|导出|详情|编辑|删除|操作|每一个|每个|所有|全部)$/i.test(normalized)) {
			return false
		}
		return !getFieldLabelCandidates(field).some((label) => normalizeText(label) === normalized)
	}

	function pickOptionCandidateForField(state, field) {
		return pickFirstVisibleOptionCandidate(state, field).text
	}

	function pickOptionCandidateDetailForField(state, field, observation, session = null, context = {}) {
		const key = getFieldKey(field)
		const failed = new Set((state?.failedLabelsByKey?.[key] || []).map(normalizeText).filter(Boolean))
		const candidates = collectUsableOptionCandidates(state, field, observation)
		const planningContext = Array.isArray(context?.planningContext) ? context.planningContext : []
		const observedSample = pickSearchFieldSampleText(observation, field)
		const contextSample = observedSample ? '' : pickSearchFieldSampleTextFromPlanningContext(planningContext, field)
		const sample = observedSample || contextSample
		const sampleBasisPrefix = observedSample ? '当前列表对应列已有' : '补充表格上下文对应列已有'
		if (sample) {
			if (isCascaderLikeField(field) && parseSearchCascaderCandidatePath(sample).length) {
				return {
					text: sample,
					source: 'table_sample',
					basis: `${sampleBasisPrefix}级联路径：${sample}`,
				}
			}
			if (isDateRangeField(field)) {
				const range = pickDateRangeCandidate(candidates, failed, sample)
				if (range) {
					const date = extractDateRangeBounds(sample) ? sample : (normalizeDateCandidate(sample) || sample)
					return {
						text: range,
						source: 'table_sample',
						basis: `${sampleBasisPrefix}日期：${date}`,
					}
				}
				return { text: '', source: '', basis: '' }
			}
			const matched = pickCandidateMatchingSample(candidates, sample, failed)
			if (matched) {
				return {
					text: matched,
					source: 'table_sample',
					basis: `${sampleBasisPrefix}值：${sample}`,
				}
			}
		}
		if (isDateRangeField(field)) {
			const taskValue = extractTaskSearchValueForField(String(session?.latestTask || session?.task || ''), field)
			const range = pickDateRangeCandidate(candidates, failed, taskValue)
			if (range) {
				const date = extractDateRangeBounds(taskValue) ? taskValue : (normalizeDateCandidate(taskValue) || taskValue)
				return {
					text: range,
					source: 'task_value',
					basis: `任务文本明确指定的日期：${date}`,
				}
			}
			if (hasRejectedTemporalSampleForField(observation, planningContext, field)) {
				return { text: '', source: '', basis: '' }
			}
			const visibleRange = pickVisibleDateRangeCandidate(candidates, failed)
			if (visibleRange) {
				return {
					text: visibleRange,
					source: 'visible_option',
					basis: `日期控件真实可见候选组成范围：${visibleRange}`,
				}
			}
			return { text: '', source: '', basis: '' }
		}
		if (isCascaderLikeField(field)) {
			const taskValue = extractTaskSearchValueForField(String(session?.latestTask || session?.task || ''), field)
			if (parseSearchCascaderCandidatePath(taskValue).length) {
				return {
					text: taskValue,
					source: 'task_value',
					basis: '任务文本明确指定的级联路径',
				}
			}
		}
		const taskMatched = pickCandidateMatchingTaskValue(candidates, field, session, failed)
		if (taskMatched) {
			return {
				text: taskMatched,
				source: 'task_value',
				basis: '任务文本明确指定的候选',
			}
		}
		return { text: '', source: '', basis: '' }
	}

	function getSelectionFieldSampleMismatch(state, field, observation) {
		if (!isSelectionField(field)) return null
		const sample = pickSearchFieldSampleText(observation, field)
		if (!sample) return null
		const candidates = collectUsableOptionCandidates(state, field, observation)
		if (!candidates.length) return null
		const key = getFieldKey(field)
		const failed = new Set((state?.failedLabelsByKey?.[key] || []).map(normalizeText).filter(Boolean))
		if (isDateRangeField(field)) {
			if (pickDateRangeCandidate(candidates, failed, sample)) return null
			return {
				field,
				sample,
				candidates,
			}
		}
		if (pickCandidateMatchingSample(candidates, sample, failed)) return null
		return {
			field,
			sample,
			candidates,
		}
	}

	function collectUsableOptionCandidates(state, field, observation = null) {
		const key = getFieldKey(field)
		const activeKey = String(state?.activeFieldKey || '').trim()
		const pendingBelongsToField = !!key && !!activeKey && key === activeKey
		const values = [
			...(pendingBelongsToField && Array.isArray(state?.pendingDropdownCandidates) ? state.pendingDropdownCandidates : []),
			...(Array.isArray(field?.optionLabels) ? field.optionLabels : []),
			...collectObservedOptionCandidatesForField(observation, field),
		]
		const seen = new Set()
		const result = []
		for (const candidate of values) {
			if (!isUsableSearchOptionCandidate(candidate, field, state)) continue
			const text = String(candidate || '').trim()
			const normalized = normalizeText(text)
			if (!normalized || seen.has(normalized)) continue
			seen.add(normalized)
			result.push(text)
		}
		return result
	}

	function collectObservedOptionCandidatesForField(observation, field) {
		if (!observation || !field || !controlSemantics?.scoreObservedOptionAssociation) return []
		const visibleItems = [
			...(Array.isArray(observation?.popups) ? observation.popups : []),
			...(Array.isArray(observation?.options) ? observation.options : []),
		].filter(Boolean)
		const scored = []
		for (const item of visibleItems) {
			if (!isObservedOptionCandidateCompatibleWithSearchField(item, field)) continue
			const score = controlSemantics.scoreObservedOptionAssociation(item, field)
			if (!Number.isFinite(score)) continue
			const label = String(item?.label || item?.text || '').trim()
			if (!label) continue
			scored.push({ label, score })
		}
		if (scored.length) return scored.sort((a, b) => a.score - b.score).map((entry) => entry.label)
		return collectActiveNewPopupOptionLabels(visibleItems, field)
	}

	function isObservedOptionCandidateCompatibleWithSearchField(item, field) {
		const label = String(item?.label || item?.text || '').trim()
		const descriptor = [
			item?.selectionControl,
			item?.controlKind,
			item?.kind,
			item?.fieldType,
			item?.role,
			item?.source,
		].filter(Boolean).join(' ')
		const temporalOption = String(item?.selectionControl || '').trim() === 'date-option' ||
			/(date-option|datepicker|date-picker|timepicker|time-picker|calendar|daterange|date|time|picker)/i.test(descriptor) ||
			!!normalizeDateCandidate(label) ||
			!!parseMonthDayDateCandidate(label)
		if (temporalOption && !isTemporalSearchField(field)) return false
		return true
	}

	function collectActiveNewPopupOptionLabels(items, field) {
		const active = controlSemantics?.collectActiveNewPopupItemsForTargets?.(items, [field]) || []
		return active
			.filter((item) => isObservedOptionCandidateCompatibleWithSearchField(item, field))
			.map((item) => String(item?.label || item?.text || '').trim())
			.filter(Boolean)
	}

	function pickFirstVisibleOptionCandidate(state, field, observation = null) {
		const key = getFieldKey(field)
		const failed = new Set((state?.failedLabelsByKey?.[key] || []).map(normalizeText).filter(Boolean))
		for (const candidate of collectUsableOptionCandidates(state, field, observation)) {
			const text = String(candidate || '').trim()
			const normalized = normalizeText(text)
			if (!normalized || failed.has(normalized)) continue
			return {
				text,
				source: 'visible_option',
				basis: '真实候选列表',
			}
		}
		return { text: '', source: '', basis: '' }
	}

	function hasUsableOptionCandidate(state, field, observation = null) {
		return !!pickFirstVisibleOptionCandidate(state, field, observation).text
	}

	function pickCandidateMatchingTaskValue(candidates, field, session, failed) {
		const taskText = String(session?.latestTask || session?.task || '')
		if (!taskText.trim()) return ''
		const labels = getFieldLabelCandidates(field).map(normalizeTaskOptionText).filter(Boolean)
		if (!labels.length) return ''
		const compactTask = normalizeTaskOptionText(taskText)
		if (!compactTask) return ''
		const explicitTaskValue = extractTaskSearchValueForField(taskText, field)
		for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
			const text = String(candidate || '').trim()
			const key = normalizeText(text)
			const candidateKey = normalizeTaskOptionText(text)
			if (!key || !candidateKey || failed?.has(key)) continue
			if (explicitTaskValue && timeCandidatesOverlap(text, explicitTaskValue)) return text
			if (labels.some((label) => taskMentionsFieldOption(compactTask, label, candidateKey))) return text
		}
		return ''
	}

	function taskMentionsFieldOption(taskText, label, candidate) {
		if (!taskText || !label || !candidate) return false
		return [
			`${label}为${candidate}`,
			`${label}是${candidate}`,
			`${label}设为${candidate}`,
			`${label}设置为${candidate}`,
			`${label}选择${candidate}`,
			`选择${label}${candidate}`,
		].some((pattern) => taskText.includes(pattern))
	}

	function normalizeTaskOptionText(value) {
		return normalizeText(value).replace(/[：:=，,。.;；、|/\\'"“”‘’\[\]()（）{}<>《》\s-]+/g, '')
	}

	function pickCandidateMatchingSample(candidates, sample, failed) {
		const sampleKey = normalizeText(sample)
		if (!sampleKey) return ''
		const matches = []
		for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
			const text = String(candidate || '').trim()
			const key = normalizeText(text)
			if (!key || failed.has(key)) continue
			if (key === sampleKey) return text
			const score = scoreCandidateSampleTextMatch(key, sampleKey)
			if (Number.isFinite(score)) matches.push({ text, score })
		}
		if (!matches.length) return ''
		const bestScore = Math.min(...matches.map((item) => item.score))
		const best = matches.filter((item) => item.score === bestScore)
		return best.length === 1 ? best[0].text : ''
	}

	function scoreCandidateSampleTextMatch(candidateKey, sampleKey) {
		if (!candidateKey || !sampleKey || candidateKey === sampleKey) return Number.POSITIVE_INFINITY
		if (timeCandidatesOverlap(candidateKey, sampleKey)) return 1
		if (
			optionTextHasBoundedDecorationMatch(candidateKey, sampleKey) ||
			optionTextHasBoundedDecorationMatch(sampleKey, candidateKey)
		) {
			return 1
		}
		if (!hasAsciiOrDigit(candidateKey) && !hasAsciiOrDigit(sampleKey)) return Number.POSITIVE_INFINITY
		return candidateSampleContainsWithBoundaries(candidateKey, sampleKey) ? 3 : Number.POSITIVE_INFINITY
	}

	function optionTextHasBoundedDecorationMatch(label, expected) {
		label = normalizeText(label)
		expected = normalizeText(expected)
		if (!label || !expected || label === expected) return false
		if (label.startsWith(expected)) {
			const after = label.slice(expected.length, expected.length + 1)
			if (isOptionDecorationBoundaryChar(after)) return true
		}
		if (label.endsWith(expected)) {
			const before = label.slice(label.length - expected.length - 1, label.length - expected.length)
			if (isOptionDecorationBoundaryChar(before)) return true
		}
		return false
	}

	function isOptionDecorationBoundaryChar(char) {
		return !char || /[\s,，.。:：;；|/\\\-_()[\]（）{}<>《》【】「」『』"'“”‘’#№·•+＋~～]/.test(char)
	}

	function candidateSampleContainsWithBoundaries(candidateKey, sampleKey) {
		if (!candidateKey || !sampleKey) return false
		const smallerLength = Math.min(candidateKey.length, sampleKey.length)
		if (smallerLength < 2) return false
		const constrained = hasAsciiOrDigit(candidateKey) || hasAsciiOrDigit(sampleKey)
		if (!constrained) return candidateKey.includes(sampleKey) || sampleKey.includes(candidateKey)
		return containsWithAsciiDigitBoundary(candidateKey, sampleKey) ||
			containsWithAsciiDigitBoundary(sampleKey, candidateKey)
	}

	function hasAsciiOrDigit(value) {
		return /[0-9A-Za-z]/.test(String(value || ''))
	}

	function containsWithAsciiDigitBoundary(haystack, needle) {
		const source = String(haystack || '')
		const target = String(needle || '')
		if (!source || !target) return false
		const start = source.indexOf(target)
		if (start < 0) return false
		const before = start > 0 ? source[start - 1] : ''
		const after = start + target.length < source.length ? source[start + target.length] : ''
		return isAsciiDigitBoundary(before) && isAsciiDigitBoundary(after)
	}

	function isAsciiDigitBoundary(char) {
		return !char || !/[0-9A-Za-z]/.test(char)
	}

	function collectSearchPanelFieldLabels(panels) {
		const labels = []
		const seen = new Set()
		for (const panel of (Array.isArray(panels) ? panels : [])) {
			const values = Array.isArray(panel?.fields)
				? panel.fields
				: String(panel?.fields || '').split(/[,，|、]/)
			for (const value of values) {
				const label = normalizeSearchFieldLabel(value)
				const key = normalizeText(label)
				if (!key || seen.has(key) || isGenericSearchFieldLabel(label)) continue
				seen.add(key)
				labels.push(label)
			}
		}
		return labels
	}

	function findPanelMatchedFieldLabel(field, panelLabels) {
		if (!Array.isArray(panelLabels) || !panelLabels.length) return ''
		const fieldLabels = getFieldLabelCandidates(field)
		for (const panelLabel of panelLabels) {
			const panelKey = normalizeText(panelLabel)
			const compositePanelLabel = isCompositePanelFieldLabel(panelLabel)
			if (!panelKey) continue
			for (const label of fieldLabels) {
				const key = normalizeText(label)
				if (!key) continue
				if (key === panelKey || key.includes(panelKey)) return panelLabel
				if (!compositePanelLabel && panelKey.includes(key)) return panelLabel
			}
		}
		return ''
	}

	function isCompositePanelFieldLabel(value) {
		return /[\s,，、|;；/\\]+/.test(String(value || '').trim())
	}

	function getFieldLabelCandidates(field) {
		const values = [
			field?.searchLabel,
			field?.label,
			field?.placeholder,
			field?.text,
			...(Array.isArray(field?.aliases) ? field.aliases : []),
		]
		const out = []
		const seen = new Set()
		for (const value of values) {
			for (const candidate of [normalizeSearchFieldLabel(value), String(value || '').trim()]) {
				const text = String(candidate || '').trim()
				const key = normalizeText(text)
				if (!key || seen.has(key) || isGenericSearchFieldLabel(text)) continue
				seen.add(key)
				out.push(text)
			}
		}
		return out
	}

	function pickSearchFieldSampleText(observation, field) {
		if (!observation || !field) return ''
		const tables = Array.isArray(observation?.tables) ? observation.tables : []
		const labelCandidates = getFieldLabelCandidates(field)
		for (const table of tables) {
			const sample = pickTableSampleForField(table, labelCandidates, field)
			if (sample) return sample
		}
		const rowSample = pickTextRowSampleForField(observation, labelCandidates, field)
		return rowSample || ''
	}

	function pickSearchFieldSampleTextFromPlanningContext(planningContext, field) {
		if (!field) return ''
		const contexts = Array.isArray(planningContext) ? planningContext : []
		const labelCandidates = getFieldLabelCandidates(field)
		if (!labelCandidates.length) return ''
		for (const context of contexts) {
			const text = String(context?.text || '')
			if (!isTablePlanningContext(context, text)) continue
			const sample = pickContextTableSampleForField(text, labelCandidates, field)
			if (sample) return sample
		}
		return ''
	}

	function hasRejectedTemporalSampleForField(observation, planningContext, field) {
		if (!isTemporalSearchField(field)) return false
		const labelCandidates = getFieldLabelCandidates(field)
		if (!labelCandidates.length) return false
		for (const table of (Array.isArray(observation?.tables) ? observation.tables : [])) {
			if (hasRejectedTemporalTableSample(table, labelCandidates, field)) return true
		}
		for (const line of collectObservationTextRows(observation)) {
			const text = String(line || '').trim()
			if (!isLikelyDataRow(text)) continue
			for (const label of labelCandidates) {
				if (isRejectedTemporalSearchSample(extractSampleAfterLabel(text, label), labelCandidates, field)) return true
			}
		}
		for (const context of (Array.isArray(planningContext) ? planningContext : [])) {
			const text = String(context?.text || '')
			if (!isTablePlanningContext(context, text)) continue
			if (hasRejectedTemporalContextSample(text, labelCandidates, field)) return true
		}
		return false
	}

	function hasRejectedTemporalTableSample(table, labelCandidates, field) {
		const headers = (Array.isArray(table?.headers) ? table.headers : [])
			.map((header) => String(header || '').trim())
		const rows = Array.isArray(table?.rows) ? table.rows : []
		if (!headers.length || !rows.length) return false
		const index = findMatchingHeaderIndex(headers, labelCandidates)
		if (index < 0) return false
		return rows.some((row) => {
			const cells = Array.isArray(row) ? row : []
			return isRejectedTemporalSearchSample(cells[index], labelCandidates, field)
		})
	}

	function hasRejectedTemporalContextSample(text, labelCandidates, field) {
		let headers = []
		for (const line of String(text || '').split(/\n+/)) {
			const trimmed = line.replace(/\s+/g, ' ').trim()
			if (!trimmed) continue
			const nextHeaders = extractContextTableHeaders(trimmed)
			if (nextHeaders.length) headers = nextHeaders
			if (!isContextTableRowLine(trimmed)) continue
			for (const label of labelCandidates) {
				if (isRejectedTemporalSearchSample(extractSampleAfterLabel(trimmed, label), labelCandidates, field)) return true
			}
			const headerIndex = headers.length ? findMatchingHeaderIndex(headers, labelCandidates) : -1
			if (headerIndex < 0) continue
			const cells = parseContextTableRowCells(trimmed)
			if (isRejectedTemporalSearchSample(cells[headerIndex], labelCandidates, field)) return true
		}
		return false
	}

	function isRejectedTemporalSearchSample(value, labelCandidates, field) {
		const text = String(value || '').trim()
		if (!text || !looksLikeTemporalSearchSample(text)) return false
		if (isNonDataTableSample(text)) return false
		return !isUsableTableSample(text, labelCandidates, field)
	}

	function looksLikeTemporalSearchSample(value) {
		const text = String(value || '').trim()
		if (!text) return false
		if (/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/.test(text)) return true
		if (/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/.test(text)) return true
		if (/\b\d{8}\b/.test(text)) return true
		if (/(?:^|[^\d])\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?(?=$|[^\d])/.test(text)) return true
		if (/(?:^|[^\d])\d{1,2}\s*[-/.]\s*\d{1,2}(?=$|[^\d])/.test(text)) return true
		return /(?:^|[^\d])\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?(?=$|[^\d])/.test(text)
	}

	function isTablePlanningContext(context, text = '') {
		const name = String(context?.name || '').trim()
		const input = context?.input || {}
		const source = String(input.source || input.target || '').trim()
		if (name === 'request_context' && source === 'tables') return true
		return /<context_chunk\b[^>]*\bsource=(["'])tables\1/i.test(String(text || ''))
	}

	function pickContextTableSampleForField(text, labelCandidates, field) {
		let headers = []
		for (const line of String(text || '').split(/\n+/)) {
			const trimmed = line.replace(/\s+/g, ' ').trim()
			if (!trimmed) continue
			const nextHeaders = extractContextTableHeaders(trimmed)
			if (nextHeaders.length) headers = nextHeaders
			if (!isContextTableRowLine(trimmed)) continue
			for (const label of (Array.isArray(labelCandidates) ? labelCandidates : [])) {
				const sample = extractSampleAfterLabel(trimmed, label)
				if (isUsableTableSample(sample, labelCandidates, field)) return sample
			}
			const headerIndex = headers.length ? findMatchingHeaderIndex(headers, labelCandidates) : -1
			if (headerIndex < 0) continue
			const cells = parseContextTableRowCells(trimmed)
			const value = String(cells[headerIndex] || '').trim()
			if (isUsableTableSample(value, labelCandidates, field)) return value
		}
		return ''
	}

	function extractContextTableHeaders(line) {
		const attr = readContextLineAttribute(line, 'headers')
		if (!attr) return []
		return attr
			.split('|')
			.map((item) => String(item || '').trim())
			.filter(Boolean)
	}

	function isContextTableRowLine(line) {
		const text = String(line || '').trim()
		if (!text || /^</.test(text)) return false
		return /\brow\s+\d+\b/i.test(text) && /[=:：|]/.test(text)
	}

	function parseContextTableRowCells(line) {
		const body = String(line || '')
			.replace(/^.*?\brow\s+\d+\s*:?\s*/i, '')
			.trim()
		if (!body) return []
		return body
			.split('|')
			.map((cell) => {
				const text = String(cell || '').trim()
				const match = text.match(/^[^=:：]{1,80}\s*(?:=|:|：)\s*(.+)$/)
				return String(match?.[1] || text).trim()
			})
			.filter(Boolean)
	}

	function summarizeSearchResultAfterSubmit(observation, state, field) {
		return analyzeSearchResultAfterSubmit(observation, state, field).summary
	}

	function analyzeSearchResultAfterSubmit(observation, state, field) {
		const key = getFieldKey(field) || state.activeFieldKey || state.lastSearchedFieldKey || ''
		const stored = key ? state.fields?.[key] : null
		const value = String(stored?.lastTestValue || '').trim()
		const source = String(stored?.lastValueSource || '').trim()
		const label = getFieldLabel(field) || String(stored?.label || key || '').trim()
		if (!value) {
			return {
				status: 'unknown_no_value',
				label,
				value,
				source,
				summary: '搜索结果观察：没有记录到本字段测试值。',
			}
		}
		const tables = Array.isArray(observation?.tables) ? observation.tables : []
		if (!tables.length) {
			if (textRowResultContainsValue(observation, field, value)) {
				return {
					status: 'passed_match',
					label,
					value,
					source,
					summary: `搜索结果观察：未拿到结构化表格摘要，但在列表/表格文本行中看到测试值 "${value}"。`,
				}
			}
			return {
				status: 'unknown_no_table',
				label,
				value,
				source,
				summary: `搜索结果观察：当前观察没有表格摘要，测试值="${value}"。`,
			}
		}
		const matched = tableResultContainsValue(tables, field, value)
		if (matched) {
			return {
				status: 'passed_match',
				label,
				value,
				source,
				summary: `搜索结果观察：结果列表中仍能看到测试值 "${value}"。`,
			}
		}
		const expectValueVisible = shouldExpectSearchValueVisible(source)
		if (tables.every((table) => !Array.isArray(table?.rows) || table.rows.length === 0)) {
			return {
				status: expectValueVisible ? 'failed_empty_result' : 'unknown_empty_result',
				label,
				value,
				source,
				summary: `搜索结果观察：结果列表为空，测试值="${value}"；将先清空条件再继续，避免叠加影响后续字段。`,
			}
		}
		return {
			status: expectValueVisible ? 'failed_value_missing' : 'unknown_value_missing',
			label,
			value,
			source,
			summary: `搜索结果观察：结果列表有数据，但未在可读表格摘要中确认测试值 "${value}"。`,
		}
	}

	function textRowResultContainsValue(observation, field, value) {
		const normalizedValue = normalizeText(value)
		if (!normalizedValue) return false
		const labelCandidates = getFieldLabelCandidates(field)
		const normalizedLabels = labelCandidates.map(normalizeText).filter(Boolean)
		for (const line of collectObservationTextRows(observation)) {
			const text = String(line || '').trim()
			if (!isLikelyDataRow(text)) continue
			for (const label of labelCandidates) {
				const sample = extractSampleAfterLabel(text, label)
				if (sample && searchResultCellMatchesValue(sample, normalizedValue, value)) return true
			}
			const lineKey = normalizeText(text)
			const mentionsField = normalizedLabels.some((label) => label && lineKey.includes(label))
			if (mentionsField && searchResultCellMatchesValue(text, normalizedValue, value)) return true
			if (/(row|cell|table|grid|列表|数据|tbody|el-table|ant-table|vxe-table)/i.test(text) &&
				searchResultCellMatchesValue(text, normalizedValue, value)) {
				return true
			}
		}
		return false
	}

	function shouldExpectSearchValueVisible(source) {
		return /^(table_sample|task_value)$/i.test(String(source || '').trim())
	}

	function recordSearchResultObservation(state, key, analysis) {
		const result = normalizeSearchResultAnalysis(key, analysis)
		if (!state || !result.key) return result
		if (!state.resultsByKey || typeof state.resultsByKey !== 'object') state.resultsByKey = {}
		state.resultsByKey[result.key] = result
		return result
	}

	function normalizeSearchResultAnalysis(key, analysis) {
		const result = analysis && typeof analysis === 'object' ? analysis : {}
		return {
			key: String(key || result.key || '').trim(),
			label: String(result.label || '').trim(),
			value: String(result.value || '').trim(),
			source: String(result.source || '').trim(),
			status: String(result.status || 'unknown').trim() || 'unknown',
			summary: String(result.summary || '搜索结果观察：未能分析当前结果。').trim(),
		}
	}

	function buildSearchResultsSummary(state) {
		const results = getOrderedSearchResults(state, { includeMissing: true })
		if (!results.length) return '结果汇总：没有记录到可分析的字段结果。'
		const parts = results.map((item) => {
			const label = item.label || state?.fields?.[item.key]?.label || item.key
			const detail = formatSearchResultDetail(item)
			return `${label}=${formatSearchResultStatus(item.status)}${detail}`
		})
		return `结果汇总：${parts.join('；')}。`
	}

	function getSearchResultFailures(state) {
		return getOrderedSearchResults(state).filter((item) => /^failed_/i.test(String(item.status || '')))
	}

	function getSearchResultIssues(state) {
		return getOrderedSearchResults(state, { includeMissing: true }).filter((item) => String(item.status || '') !== 'passed_match')
	}

	function getOrderedSearchResults(state, options = {}) {
		const resultsByKey = state?.resultsByKey && typeof state.resultsByKey === 'object'
			? state.resultsByKey
			: {}
		const ordered = []
		const seen = new Set()
		for (const key of (Array.isArray(state?.fieldOrder) ? state.fieldOrder : [])) {
			if (!resultsByKey[key]) {
				if (options?.includeMissing) ordered.push(buildMissingSearchResult(state, key))
				continue
			}
			ordered.push(resultsByKey[key])
			seen.add(key)
		}
		for (const [key, value] of Object.entries(resultsByKey)) {
			if (seen.has(key)) continue
			ordered.push({ ...(value || {}), key })
		}
		return ordered
	}

	function buildMissingSearchResult(state, key) {
		const field = state?.fields?.[key] || {}
		return {
			key: String(key || '').trim(),
			label: String(field.label || key || '').trim(),
			value: '',
			source: '',
			status: 'unknown_not_recorded',
			summary: '搜索结果观察：该字段尚未形成提交后的可验证结果记录。',
		}
	}

	function formatSearchResultStatus(status) {
		const key = String(status || '').trim()
		const labels = {
			passed_match: '通过',
			failed_empty_result: '失败:结果为空',
			failed_value_missing: '失败:结果未包含测试值',
			unknown_no_value: '未确认:缺少测试值',
			unknown_no_table: '未确认:缺少表格摘要',
			unknown_empty_result: '未确认:结果为空',
			unknown_value_missing: '未确认:结果未包含测试值',
			unknown_missing_sample: '未确认:缺少真实样本/候选证据',
			unknown_not_recorded: '未确认:缺少结果记录',
			unknown_result_pending: '未确认:已提交待观察',
		}
		return labels[key] || key || '未确认'
	}

	function formatSearchResultDetail(result) {
		const parts = []
		const value = String(result?.value || '').trim()
		const source = String(result?.source || '').trim()
		if (value) parts.push(`值=${value}`)
		if (source) parts.push(`来源=${formatSearchResultSource(source)}`)
		if (String(result?.status || '') === 'unknown_not_recorded') parts.push('未记录提交后结果')
		return parts.length ? `(${parts.join('，')})` : ''
	}

	function formatSearchResultSource(source) {
		const key = String(source || '').trim()
		const labels = {
			table_sample: '列表样本',
			task_value: '任务文本',
			visible_option: '真实候选',
			option_candidate: '真实候选',
			missing_sample: '缺少样本',
		}
		return labels[key] || key
	}

	function tableResultContainsValue(tables, field, value) {
		const normalizedValue = normalizeText(value)
		if (!normalizedValue) return false
		const labelCandidates = getFieldLabelCandidates(field)
		let sawMatchedHeader = false
		let fallbackMatched = false
		for (const table of (Array.isArray(tables) ? tables : [])) {
			const headers = Array.isArray(table?.headers) ? table.headers : []
			const rows = Array.isArray(table?.rows) ? table.rows : []
			const headerIndex = findMatchingHeaderIndex(headers, labelCandidates)
			for (const row of rows) {
				const cells = Array.isArray(row) ? row : []
				if (headerIndex >= 0) {
					sawMatchedHeader = true
					if (searchResultCellMatchesValue(cells[headerIndex], normalizedValue, value)) return true
					continue
				}
				if (cells.some((cell) => searchResultCellMatchesValue(cell, normalizedValue, value))) fallbackMatched = true
			}
		}
		return sawMatchedHeader ? false : fallbackMatched
	}

	function searchResultCellMatchesValue(cell, normalizedValue, rawValue = '') {
		const cellKey = normalizeText(cell)
		const valueKey = normalizeText(normalizedValue)
		if (!cellKey || !valueKey) return false
		if (cellKey === valueKey) return true
		if (timeCandidatesOverlap(cell, rawValue || normalizedValue)) return true
		if (candidateSampleContainsWithBoundaries(cellKey, valueKey)) return true
		if (formatInsensitiveResultMatches(cell, rawValue || normalizedValue)) return true
		return temporalRangeCellMatchesValue(cell, rawValue || normalizedValue)
	}

	function formatInsensitiveResultMatches(cell, rawValue) {
		const cellToken = normalizeComparableResultToken(cell)
		const valueToken = normalizeComparableResultToken(rawValue)
		if (!cellToken || !valueToken || cellToken.length < 4 || valueToken.length < 4) return false
		if (!isComparableResultToken(cell, rawValue)) return false
		if (cellToken === valueToken) return true
		return containsWithAsciiDigitBoundary(cellToken, valueToken) ||
			containsWithAsciiDigitBoundary(valueToken, cellToken)
	}

	function normalizeComparableResultToken(value) {
		return normalizeText(value)
			.replace(/[：:=，,。.;；、|/\\'"“”‘’\[\]()（）{}<>《》#№\s_-]+/g, '')
	}

	function isComparableResultToken(cell, rawValue) {
		const combined = `${cell || ''} ${rawValue || ''}`
		const digits = countAsciiDigits(combined)
		if (digits >= 3) return true
		return digits >= 1 && /[A-Za-z]/.test(combined) && normalizeComparableResultToken(combined).length >= 5
	}

	function countAsciiDigits(value) {
		const matches = String(value || '').match(/[0-9]/g)
		return matches ? matches.length : 0
	}

	function pickTableSampleForField(table, labelCandidates, field) {
		const headers = (Array.isArray(table?.headers) ? table.headers : [])
			.map((header) => String(header || '').trim())
		const rows = Array.isArray(table?.rows) ? table.rows : []
		if (!headers.length || !rows.length) return ''
		const index = findMatchingHeaderIndex(headers, labelCandidates)
		if (index < 0) return ''
		for (const row of rows) {
			const cells = Array.isArray(row) ? row : []
			const value = String(cells[index] || '').trim()
			if (isUsableTableSample(value, labelCandidates, field)) return value
		}
		return ''
	}

	function findMatchingHeaderIndex(headers, labelCandidates) {
		const rawLabels = (Array.isArray(labelCandidates) ? labelCandidates : [])
			.map(normalizeText)
			.filter(Boolean)
		if (!rawLabels.length) return -1
		const exactMatch = findUniqueHeaderIndex(headers, (header) => {
			const normalized = normalizeText(header)
			return !!normalized && rawLabels.some((label) => normalized === label)
		})
		if (exactMatch >= 0) return exactMatch
		const rawPartialMatch = findUniqueHeaderIndex(headers, (header) => {
			const normalized = normalizeText(header)
			return !!normalized && rawLabels.some((label) => headerPartiallyMatchesLabel(normalized, label))
		})
		if (rawPartialMatch >= 0) return rawPartialMatch
		const normalizedLabels = rawLabels
			.map(normalizeHeaderLabel)
			.filter(Boolean)
		const normalizedMatch = findUniqueHeaderIndex(headers, (header) => {
			const normalized = normalizeHeaderLabel(header)
			return !!normalized && normalizedLabels.some((label) => headerMatchesLabel(normalized, label))
		})
		if (normalizedMatch >= 0) return normalizedMatch
		return findUniqueHeaderIndex(headers, (header) => {
			const normalized = normalizeText(header)
			return !!normalized && rawLabels.some((label) => headerAffixMatchesGenericLabel(normalized, label))
		})
	}

	function findUniqueHeaderIndex(headers, matches) {
		let matchedIndex = -1
		for (let index = 0; index < headers.length; index += 1) {
			if (!matches(headers[index], index)) continue
			if (matchedIndex >= 0) return -1
			matchedIndex = index
		}
		return matchedIndex
	}

	function headerPartiallyMatchesLabel(header, label) {
		if (!header || !label || header === label) return false
		if (header.includes(label)) return true
		return label.length >= 3 && label.includes(header)
	}

	function headerMatchesLabel(header, label) {
		return header === label || headerPartiallyMatchesLabel(header, label)
	}

	function headerAffixMatchesGenericLabel(header, label) {
		if (!header || !label || header === label) return false
		if (!isGenericHeaderLabel(label)) return false
		return header.endsWith(label) || header.startsWith(label)
	}

	function isGenericHeaderLabel(label) {
		const text = normalizeText(label)
		if (!text) return false
		if (/^(名称|姓名|编号|编码|账号|账户|用户名|状态|类型|等级|来源|意向|条件|方式|电话|手机|邮箱|邮件|地址|日期|时间|金额|数量|价格|部门|岗位|角色|人员|负责人|联系人)$/.test(text)) {
			return true
		}
		return text.length <= 2 && !/^(是|否|有|无|到|至|和|与)$/.test(text)
	}

	function pickTextRowSampleForField(observation, labelCandidates, field) {
		const labels = (Array.isArray(labelCandidates) ? labelCandidates : [])
			.map((item) => String(item || '').trim())
			.filter(Boolean)
		if (!labels.length) return ''
		for (const line of collectObservationTextRows(observation)) {
			const text = String(line || '').trim()
			if (!isLikelyDataRow(text)) continue
			for (const label of labels) {
				const sample = extractSampleAfterLabel(text, label)
				if (isUsableTableSample(sample, labels, field)) return sample
			}
		}
		return ''
	}

	function collectObservationTextRows(observation) {
		const rows = []
		for (const source of ['rawCandidates', 'simplifiedDom']) {
			for (const row of (Array.isArray(observation?.[source]) ? observation[source] : [])) {
				rows.push(String(row || ''))
			}
		}
		for (const row of (Array.isArray(observation?.treeCandidates) ? observation.treeCandidates : [])) {
			rows.push(String(row?.line || row || ''))
		}
		return rows
	}

	function isLikelyDataRow(text) {
		const value = normalizeText(text)
		if (!value) return false
		if (/^(field|action|option|popup|panel)\s+index=/i.test(text)) return false
		if (/<(field|action|option|popup|panel)\b/i.test(text)) return false
		if (isCommandOnlyDataRowText(value)) return false
		return /(table|row|cell|td|tr|grid|列表|数据|tbody|el-table|ant-table|vxe-table)/i.test(text)
	}

	function isCommandOnlyDataRowText(value) {
		const text = normalizeText(value)
		if (!text) return true
		if (/^(请输入|请选择).{0,32}$/.test(text)) return true
		return /^(搜索|查询|筛选|过滤|清空|重置|新增|新建|创建|添加|导入|导出|详情|编辑|修改|删除|操作|search|query|filter|clear|reset|create|add|new|import|export|detail|edit|delete|actions?)$/i.test(text)
	}

	function extractSampleAfterLabel(line, label) {
		const source = String(line || '')
		const rawLabel = String(label || '').trim()
		if (!rawLabel) return ''
		const escaped = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const quotedPattern = new RegExp(`${escaped}\\s*(?:=|:|：|>|</[^>]+>\\s*)\\s*["“']([^"“”']{1,64})["”']`, 'i')
		const quoted = source.match(quotedPattern)
		if (quoted?.[1]) return String(quoted[1]).trim()
		const delimitedPattern = new RegExp(`${escaped}\\s*(?:=|:|：|>|</[^>]+>\\s*)\\s*([^|,，;；<>]{1,64})(?=\\s*(?:[|,，;；]|$))`, 'i')
		const delimited = source.match(delimitedPattern)
		if (delimited?.[1]) return String(delimited[1]).trim()
		const compactPattern = new RegExp(`${escaped}\\s*(?:=|:|：|>|</[^>]+>\\s*)?\\s*["“']?([^"“”'|,，;；<>\\s]{1,64})`, 'i')
		const compact = source.match(compactPattern)
		return String(compact?.[1] || '').trim()
	}

	function normalizeHeaderLabel(value) {
		const normalized = normalizeText(value)
		const stripped = normalized
			.replace(/^(搜索|查询|筛选|过滤)/g, '')
			.replace(/(搜索|查询|筛选|过滤|名称|姓名|编号|编码)$/g, '')
		return stripped || normalized
	}

	function isUsableTableSample(value, labelCandidates, field) {
		const text = String(value || '').trim()
		const normalized = normalizeText(text)
		if (!normalized || normalized.length > 64) return false
		if (isTruncatedTableSample(text)) return false
		if (isNonDataTableSample(text)) return false
		if (/^(empty|\(empty\)|unknown|null|undefined|-|--|请选择|请输入|搜索|查询|筛选|清空|重置|新增|导入|导出|详情|编辑|删除|操作)$/i.test(normalized)) {
			return false
		}
		if ((Array.isArray(labelCandidates) ? labelCandidates : []).some((label) => normalizeText(label) === normalized)) return false
		if (isTemporalSearchField(field) && !isUsableTemporalSample(text)) return false
		if (isSelectionField(field) && /^(是|否)$/.test(text)) return true
		return true
	}

	function isTruncatedTableSample(value) {
		const text = String(value || '').trim()
		if (!text) return false
		return /(?:\.\.\.|…|⋯)$/.test(text)
	}

	function isNonDataTableSample(value) {
		const text = String(value || '').trim()
		const normalized = normalizeText(text)
		if (!normalized) return true
		if (/^(暂无数据|暂无记录|暂无结果|无数据|无记录|没有数据|没有记录|未查询到数据|未找到数据|没有匹配结果|无匹配结果)$/i.test(normalized)) return true
		if (/^(nodata|norecords?|noresults?|notfound|noitems?|emptydata)$/i.test(normalized)) return true
		if (/^(loading|加载中|载入中|读取中|查询中|处理中|请稍候|请等待|数据加载中)$/i.test(normalized)) return true
		if (/^(n\/a|n\.a\.?|notavailable|不可用|不适用)$/i.test(normalized)) return true
		if (/^[-—–_/\\|]+$/.test(normalized)) return true
		if (/^[*＊•●·.。]{3,}$/.test(normalized)) return true
		if (/^(masked|redacted|已隐藏|已脱敏|隐藏数据|脱敏数据)$/i.test(normalized)) return true
		return false
	}

	function isUsableSearchOptionCandidate(candidate, field, state) {
		const text = String(candidate || '').trim()
		const normalized = normalizeText(text)
		if (!normalized || normalized.length > 64) return false
		if (/^(empty|\(empty\)|unknown|null|undefined|-|--|请选择|请输入|搜索|查询|筛选|清空|重置|新增|导入|导出|更多|展开选项|搜索内容)$/i.test(normalized)) {
			return false
		}
		if (/(首页|个人信息|退出登录|导入|导出|导航|菜单)/.test(normalized)) return false
		const labels = new Set([normalizeText(getFieldLabel(field))])
		for (const item of Object.values(state?.fields || {})) {
			const label = normalizeText(item?.label)
			if (label) labels.add(label)
		}
		if (labels.has(normalized)) return false
		return true
	}

	function isDateRangeField(field) {
		const fieldType = getCompactFieldType(field)
		const label = normalizeText([field?.label, field?.placeholder, field?.text].filter(Boolean).join(' '))
		if (fieldType === 'daterange' || fieldType === 'datetimerange') return true
		if (/^(timerange|monthrange|yearrange|weekrange)$/.test(fieldType)) return false
		const hasRangeSignal = /(起止|区间|范围|开始.*结束|start.*end|range)/i.test(label)
		const hasDateSignal = /(日期|日历|date|calendar)/i.test(label)
		return hasRangeSignal && hasDateSignal
	}

	function isTemporalSearchField(field) {
		const fieldType = getCompactFieldType(field)
		const type = String(field?.type || '').toLowerCase()
		const control = String(field?.selectionControl || field?.control || '').toLowerCase()
		const label = normalizeText([field?.label, field?.placeholder, field?.text].filter(Boolean).join(' '))
		return isTemporalFieldTypeToken(fieldType) ||
			/(date|time|picker|calendar)/i.test(`${fieldType} ${type} ${control}`) ||
			/(日期|时间|月份|年份|年度|星期|周次|日历|起止|区间|范围|开始|结束|date|time|month|year|week|calendar|start|end)/i.test(label)
	}

	function isTemporalFieldTypeToken(value) {
		if (controlSemantics?.isDateLikeFieldTypeToken) return controlSemantics.isDateLikeFieldTypeToken(value)
		return /^(date|time|datetime|month|year|week|daterange|datetimerange|timerange|monthrange|yearrange|weekrange)$/i.test(String(value || ''))
	}

	function getCompactFieldType(field) {
		const value = String(field?.fieldType || '')
		if (controlSemantics?.compactTypeToken) return controlSemantics.compactTypeToken(value)
		return value.trim().toLowerCase().replace(/[-_\s]+/g, '')
	}

	function isUsableTemporalSample(value) {
		const text = String(value || '').trim()
		if (!text) return false
		if (normalizeDateCandidate(text)) return true
		if (parseMonthDayDateCandidate(text)) return true
		return !!normalizeTimeCandidate(text)
	}

	function temporalRangeCellMatchesValue(cell, rawValue) {
		const range = extractDateRangeBounds(rawValue)
		if (!range) return false
		const cellDates = extractDateCandidates(cell)
		if (cellDates.some((date) => compareDateStrings(date, range.start) >= 0 && compareDateStrings(date, range.end) <= 0)) return true
		return extractMonthDayCandidates(cell).some((monthDay) => monthDayFallsWithinDateRange(monthDay, range))
	}

	function extractDateRangeBounds(value) {
		const dates = extractDateCandidates(value)
		if (dates.length < 2) return null
		const sorted = [dates[0], dates[1]].sort(compareDateStrings)
		return { start: sorted[0], end: sorted[1] }
	}

	function extractDateCandidates(value) {
		const text = String(value || '').trim()
		const out = []
		const seen = new Set()
		const push = (year, month, day) => {
			const date = buildDateFromParts(year, month, day)
			if (!date) return
			if (seen.has(date)) return
			seen.add(date)
			out.push(date)
		}
		for (const match of text.matchAll(/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/g)) {
			push(match[1], match[2], match[3])
		}
		for (const match of text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/g)) {
			push(match[1], match[2], match[3])
		}
		for (const match of text.matchAll(/\b(\d{4})(\d{2})(\d{2})\b/g)) {
			push(match[1], match[2], match[3])
		}
		return out
	}

	function pickDateRangeCandidate(candidates, failed, anchorValue = '') {
		const fullDateCandidates = collectDateCandidateEntries(candidates, failed)
		const explicitRange = pickExplicitDateRangeCandidate(candidates, failed, anchorValue, fullDateCandidates)
		if (explicitRange) return explicitRange
		const anchorDate = normalizeDateCandidate(anchorValue) ||
			inferFullDateFromMonthDayCandidate(anchorValue, fullDateCandidates)
		if (!anchorDate) return ''
		const dates = collectDateCandidateEntries(candidates, failed, anchorDate)
		const anchorIndex = dates.findIndex((item) => item.date === anchorDate)
		if (anchorIndex < 0) return pickDateRangeFromDayOnlyCandidates(candidates, failed, anchorDate)
		const peer = dates[anchorIndex + 1] || dates[anchorIndex - 1]
		if (!peer) return pickDateRangeFromDayOnlyCandidates(candidates, failed, anchorDate)
		const pair = [dates[anchorIndex].date, peer.date].sort(compareDateStrings)
		return `${pair[0]}..${pair[1]}`
	}

	function pickVisibleDateRangeCandidate(candidates, failed) {
		const dates = collectDateCandidateEntries(candidates, failed)
			.map((item) => String(item?.date || '').trim())
			.filter(Boolean)
			.sort(compareDateStrings)
		for (let index = 0; index < dates.length - 1; index += 1) {
			const start = dates[index]
			const end = dates[index + 1]
			if (start && end && start !== end) return `${start}..${end}`
		}
		return ''
	}

	function pickExplicitDateRangeCandidate(candidates, failed, anchorValue = '', fullDateCandidates = null) {
		const range = extractDateRangeBounds(anchorValue)
		if (!range || range.start === range.end) return ''
		const pair = [range.start, range.end].sort(compareDateStrings)
		if (failed?.has(normalizeText(pair[0])) || failed?.has(normalizeText(pair[1]))) return ''
		const dates = [
			...(Array.isArray(fullDateCandidates) ? fullDateCandidates : []),
			...collectDateCandidateEntries(candidates, failed, pair[0]),
		]
		const visibleDates = new Set(dates.map((item) => String(item?.date || '').trim()).filter(Boolean))
		if (visibleDates.has(pair[0]) && visibleDates.has(pair[1])) return `${pair[0]}..${pair[1]}`
		if (dateRangeEndpointsVisibleAsDayOnly(candidates, failed, pair[0], pair[1])) return `${pair[0]}..${pair[1]}`
		return ''
	}

	function collectDateCandidateEntries(candidates, failed, anchorDate = '') {
		const dates = []
		const seen = new Set()
		const blocked = failed instanceof Set ? failed : new Set()
		for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
			const text = String(candidate || '').trim()
			const date = normalizeDateCandidate(text) || inferFullDateFromMonthDayCandidate(text, anchorDate ? [{ date: anchorDate }] : [])
			const key = normalizeText(text)
			if (!date || seen.has(date) || blocked.has(key) || blocked.has(normalizeText(date))) continue
			seen.add(date)
			dates.push({ text, date })
		}
		return dates
	}

	function inferFullDateFromMonthDayCandidate(value, dateCandidates) {
		const monthDay = parseMonthDayDateCandidate(value)
		if (!monthDay) return ''
		let best = ''
		let bestDistance = Number.POSITIVE_INFINITY
		for (const item of (Array.isArray(dateCandidates) ? dateCandidates : [])) {
			const base = normalizeDateCandidate(item?.date || item)
			if (!base) continue
			for (const candidate of buildNearbyMonthDayDates(base, monthDay)) {
				const distance = Math.abs(dateDistanceDays(candidate, base))
				if (distance < bestDistance) {
					best = candidate
					bestDistance = distance
				}
			}
		}
		return best
	}

	function extractMonthDayCandidates(value) {
		const text = String(value || '').trim()
		const out = []
		const seen = new Set()
		const push = (month, day) => {
			const item = normalizeMonthDayParts(month, day)
			if (!item) return
			const key = `${item.month}-${item.day}`
			if (seen.has(key)) return
			seen.add(key)
			out.push(item)
		}
		for (const match of text.matchAll(/(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/g)) {
			push(match[1], match[2])
		}
		for (const match of text.matchAll(/(?:^|[^\d])(\d{1,2})\s*[-/.]\s*(\d{1,2})(?=$|[^\d])/g)) {
			push(match[1], match[2])
		}
		return out
	}

	function parseMonthDayDateCandidate(value) {
		return extractMonthDayCandidates(value)[0] || null
	}

	function normalizeMonthDayParts(month, day) {
		const monthNum = Number(month)
		const dayNum = Number(day)
		if (!Number.isFinite(monthNum) || !Number.isFinite(dayNum)) return null
		const daysByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
		if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > daysByMonth[monthNum - 1]) return null
		return { month: monthNum, day: dayNum }
	}

	function buildNearbyMonthDayDates(baseDate, monthDay) {
		const base = parseDateParts(baseDate)
		if (!base || !monthDay) return []
		const out = []
		for (const year of [base.year - 1, base.year, base.year + 1]) {
			const date = buildDateFromParts(year, monthDay.month, monthDay.day)
			if (date) out.push(date)
		}
		return out
	}

	function buildDateFromParts(year, month, day) {
		const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
		if (
			date.getUTCFullYear() !== Number(year) ||
			date.getUTCMonth() + 1 !== Number(month) ||
			date.getUTCDate() !== Number(day)
		) {
			return ''
		}
		return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
	}

	function monthDayFallsWithinDateRange(monthDay, range) {
		const start = parseDateParts(range?.start)
		const end = parseDateParts(range?.end)
		if (!monthDay || !start || !end) return false
		for (let year = start.year - 1; year <= end.year + 1; year += 1) {
			const date = buildDateFromParts(year, monthDay.month, monthDay.day)
			if (!date) continue
			if (compareDateStrings(date, range.start) >= 0 && compareDateStrings(date, range.end) <= 0) return true
		}
		return false
	}

	function pickDateRangeFromDayOnlyCandidates(candidates, failed, anchorDate) {
		const parts = parseDateParts(anchorDate)
		if (!parts) return ''
		const visibleDays = new Set()
		for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
			const text = String(candidate || '').trim()
			const day = parseDayOnlyDateCandidate(text)
			if (!day) continue
			if (failed.has(normalizeText(text))) continue
			visibleDays.add(day)
		}
		if (!visibleDays.has(parts.day)) return ''
		for (const offset of [1, -1]) {
			const peer = shiftDate(anchorDate, offset)
			const peerParts = parseDateParts(peer)
			if (!peer || !peerParts || !visibleDays.has(peerParts.day)) continue
			if (failed.has(normalizeText(peer))) continue
			const pair = [anchorDate, peer].sort(compareDateStrings)
			return `${pair[0]}..${pair[1]}`
		}
		return ''
	}

	function dateRangeEndpointsVisibleAsDayOnly(candidates, failed, start, end) {
		const startParts = parseDateParts(start)
		const endParts = parseDateParts(end)
		if (!startParts || !endParts) return false
		if (startParts.year !== endParts.year || startParts.month !== endParts.month) return false
		const visibleDays = new Set()
		for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
			const text = String(candidate || '').trim()
			const day = parseDayOnlyDateCandidate(text)
			if (!day) continue
			if (failed?.has(normalizeText(text))) continue
			visibleDays.add(day)
		}
		return visibleDays.has(startParts.day) && visibleDays.has(endParts.day)
	}

	function parseDayOnlyDateCandidate(value) {
		const text = normalizeText(value)
		const match = text.match(/^(\d{1,2})(?:日|号|今天|今)?$/)
		if (!match) return 0
		const day = Number(match[1])
		return day >= 1 && day <= 31 ? day : 0
	}

	function parseDateParts(value) {
		const date = normalizeDateCandidate(value)
		const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
		if (!match) return null
		return {
			year: Number(match[1]),
			month: Number(match[2]),
			day: Number(match[3]),
		}
	}

	function shiftDate(value, offsetDays) {
		const parts = parseDateParts(value)
		if (!parts) return ''
		const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + Number(offsetDays || 0)))
		return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
	}

	function compareDateStrings(a, b) {
		return String(a || '').localeCompare(String(b || ''))
	}

	function normalizeDateCandidate(value) {
		const text = String(value || '').trim()
		let match = text.match(/(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/)
		if (!match) match = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/)
		if (!match) match = text.match(/\b(\d{4})(\d{2})(\d{2})\b/)
		if (!match) return ''
		return buildDateFromParts(match[1], match[2], match[3])
	}

	function timeCandidatesOverlap(a, b) {
		const left = extractTimeCandidates(a)
		const right = new Set(extractTimeCandidates(b))
		if (!left.length || !right.size) return false
		return left.some((item) => right.has(item))
	}

	function extractTimeCandidates(value) {
		const text = String(value || '').trim()
		const out = []
		const seen = new Set()
		for (const match of text.matchAll(/(?:^|[^\d])(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?(?=$|[^\d])/g)) {
			const normalized = normalizeTimeParts(match[1], match[2], match[3])
			if (!normalized || seen.has(normalized)) continue
			seen.add(normalized)
			out.push(normalized)
		}
		return out
	}

	function normalizeTimeCandidate(value) {
		return extractTimeCandidates(value)[0] || ''
	}

	function normalizeTimeParts(hour, minute, second = '') {
		const h = Number(hour)
		const m = Number(minute)
		const s = second === undefined || second === '' ? 0 : Number(second)
		if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return ''
		if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return ''
		const base = `${pad2(h)}:${pad2(m)}`
		return s ? `${base}:${pad2(s)}` : base
	}

	function pad2(value) {
		return String(Number(value)).padStart(2, '0')
	}

	function isCheckboxLikeField(field) {
		const control = String(field?.selectionControl || field?.control || '').toLowerCase()
		const fieldType = String(field?.fieldType || '').toLowerCase()
		return /(checkbox|multi|multiple)/i.test(control) || /(checkbox|multi|multiple)/i.test(fieldType)
	}

	function isCascaderLikeField(field) {
		const control = String(field?.selectionControl || field?.control || '').toLowerCase()
		const fieldType = String(field?.fieldType || '').toLowerCase()
		return /(cascader|tree|hierarchy)/i.test(control) ||
			/(cascader|tree|hierarchy)/i.test(fieldType)
	}

	function parseSearchCascaderCandidatePath(value) {
		const text = String(value || '').trim()
		if (!text) return []
		const separatorPattern = getCascaderPathSeparatorPattern(text)
		const parts = text
			.split(separatorPattern)
			.map((part) => part.trim())
			.filter(Boolean)
		const path = parts.length > 1 ? parts : [text]
		return path
			.map((part) => String(part || '').trim())
			.filter((part) => {
				const key = normalizeText(part)
				return key && key.length <= 40 && !/^(请选择|选择|全部|不限|未知|empty|\(empty\))$/i.test(key)
			})
	}

	function getCascaderPathSeparatorPattern(text) {
		const source = String(text || '')
		const allowBareDash = /[\u4e00-\u9fff][\-–—－][\u4e00-\u9fff]/.test(source)
		const dash = allowBareDash ? '|[-–—－]' : '|\\s+[-–—－]\\s+'
		return new RegExp(`\\s*(?:->|=>|→|＞|>|/|\\\\|,|，|、|;|；|\\|${dash})\\s*`, 'g')
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
		deriveSearchPostModelDecision,
		deriveSearchPostContextDecision,
		deriveSearchPostValidationDecision,
		recordSearchWorkflowDeferral,
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
		deriveSearchPostModelDecision,
		deriveSearchPostContextDecision,
		deriveSearchPostValidationDecision,
		isSearchWorkflowTask,
		isSearchTestTask,
		pickOptionCandidateForField,
		recordSearchWorkflowDeferral,
		recordSearchWorkflowOutcome,
		shouldRecordSearchWorkflowOutcome,
	}
})(globalThis)
