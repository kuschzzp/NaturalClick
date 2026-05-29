;(function (g) {
	const fastPath = g.NC_BG_PLANNER_FASTPATH
	if (!fastPath) throw new Error('NC_BG_PLANNER_FASTPATH 未加载。')
	const loginWorkflow = g.NC_BG_LOGIN_WORKFLOW
	if (!loginWorkflow) throw new Error('NC_BG_LOGIN_WORKFLOW 未加载。')
	const searchWorkflow = g.NC_BG_SEARCH_WORKFLOW
	if (!searchWorkflow) throw new Error('NC_BG_SEARCH_WORKFLOW 未加载。')

	const WORKFLOW_BY_STEP = {
		fill_username: 'login',
		fill_password: 'login',
		submit_login: 'login',
		expand_search_panel: 'search-fields',
		fill_field: 'search-fields',
		open_dropdown: 'search-fields',
		select_option: 'search-fields',
		submit_search: 'search-fields',
		reset_filters: 'search-fields',
		finish_search_fields: 'search-fields',
		navigate_to_task_target: 'task-navigation',
		reveal_navigation_options: 'task-navigation',
		fill_form_field_timeout_recovery: 'form-fill',
		open_form_dropdown_timeout_recovery: 'form-fill',
		choose_form_dropdown_timeout_recovery: 'form-fill',
		select_cascader_path_timeout_recovery: 'form-fill',
		select_visible_cascader_option_timeout_recovery: 'form-fill',
		submit_form_timeout_recovery: 'form-fill',
	}

	const PRE_MODEL_WORKFLOWS = [
		{
			name: 'target-url',
			run: (session, observation, context) =>
				fastPath.deriveFastPathDecision(session, observation, context?.tabsSummary || []),
		},
		{
			name: 'login',
			run: (session, observation) =>
				loginWorkflow.deriveLoginWorkflowDecision(session, observation),
		},
		{
			name: 'task-navigation',
			run: (session, observation) =>
				deriveTaskNavigationWorkflowDecision(session, observation),
		},
		{
			name: 'search-fields',
			run: (session, observation) =>
				deriveSearchWorkflowDecisionIfAllowed(session, observation),
		},
	]

	const TIMEOUT_RECOVERY_WORKFLOWS = [
		{
			name: 'task-navigation',
			run: (session, observation) =>
				deriveUnresolvedNavigationTimeoutDecision(session, observation),
		},
		{
			name: 'form-fill',
			run: (session, observation) =>
				deriveVisibleCascaderOptionTimeoutDecision(session, observation) ||
				deriveFormAssignedFieldTimeoutDecision(session, observation) ||
				deriveFormCascaderTimeoutDecision(session, observation) ||
				deriveFormSubmitTimeoutDecision(session, observation),
		},
	]

	function derivePreModelWorkflowDecision(session, observation, context) {
		return runWorkflowList(PRE_MODEL_WORKFLOWS, session, observation, context)
	}

	function deriveTimeoutRecoveryWorkflowDecision(session, observation, context) {
		return runWorkflowList(TIMEOUT_RECOVERY_WORKFLOWS, session, observation, context)
	}

	function buildWorkflowContextText(session, observation) {
		const lines = []
		const state = syncNavigationState(session)
		const expectedKeys = getExpectedNavigationKeys(session, state)
		for (const key of expectedKeys) {
			const status = isNavigationTargetReached(observation, key) ? 'reached' : 'unresolved'
			lines.push(`- task_target key="${escapeAttr(key)}" status="${status}"`)
		}
		if (expectedKeys.some((key) => !isNavigationTargetReached(observation, key))) {
			lines.push('- guidance: named task target is unresolved; do not test generic search/filter areas until the target module/page is reached.')
		}
		const searchHints = typeof searchWorkflow.buildSearchWorkflowHintLines === 'function'
			? searchWorkflow.buildSearchWorkflowHintLines(session, observation)
			: []
		for (const line of searchHints) {
			if (String(line || '').trim()) lines.push(line)
		}
		for (const line of buildCreateTaskHintLines(session, observation, expectedKeys)) {
			if (String(line || '').trim()) lines.push(line)
		}
		if (!lines.length) return ''
		return ['<workflow_hints>', ...lines, '</workflow_hints>'].join('\n')
	}

	function recordWorkflowOutcome(session, decision, outcome) {
		const workflowName = resolveDecisionWorkflowName(decision) || inferWorkflowNameFromOutcome(session, decision, outcome)
		if (!workflowName) return
		const routedDecision = annotateWorkflowDecision(decision, workflowName)
		if (workflowName === 'login') {
			if (typeof loginWorkflow.recordLoginWorkflowOutcome === 'function') {
				loginWorkflow.recordLoginWorkflowOutcome(session, routedDecision, outcome)
			}
			return
		}
		if (workflowName === 'task-navigation') {
			recordNavigationWorkflowOutcome(session, routedDecision, outcome)
			return
		}
		if (workflowName !== 'search-fields') return
		if (typeof searchWorkflow.recordSearchWorkflowOutcome === 'function') {
			searchWorkflow.recordSearchWorkflowOutcome(session, routedDecision, outcome)
		}
	}

	function inferWorkflowNameFromOutcome(session, decision, outcome) {
		if (
			typeof searchWorkflow.shouldRecordSearchWorkflowOutcome === 'function' &&
			searchWorkflow.shouldRecordSearchWorkflowOutcome(session, decision, outcome)
		) {
			return 'search-fields'
		}
		return ''
	}

	function runWorkflowList(workflows, session, observation, context) {
		for (const workflow of workflows) {
			const decision = workflow.run(session, observation, context)
			if (decision) return annotateWorkflowDecision(decision, workflow.name)
		}
		return null
	}

	function deriveUnresolvedNavigationTimeoutDecision(session, observation) {
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReached(observation, key))
		if (!unresolved.length) return null
		const revealDecision = buildNavigationRevealDecision(state, observation, unresolved, '模型规划超时')
		if (revealDecision) return revealDecision
		const labels = unresolved.join('、')
		return {
			evaluation_previous_goal: `模型规划连续超时，且任务目标模块仍未到达: ${labels}。`,
			memory: '已停止本地 workflow 自动推进，避免在错误页面继续测试搜索区域或重复点击导航。',
			thought: '任务目标模块未到达且模型不可用，继续确定性操作风险较高。',
			next_goal: '停止任务并报告未到达的目标模块',
			action: {
				name: 'done',
				input: {
					success: false,
					text: `模型连续超时，且仍未到达任务目标模块: ${labels}。已停止以避免在错误页面继续测试。`,
					workflow_step: 'navigate_to_task_target',
					workflow_nav_key: unresolved[0],
				},
			},
		}
	}

	function deriveFormCascaderTimeoutDecision(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!taskText) return null
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReached(observation, key))
		if (unresolved.length) return null
		const formItems = collectObservedFormControlItems(observation)
		const labels = formItems
			.map((item) => normalizeFormFieldLabel(getObservedItemLabel(item)))
			.filter(Boolean)
		const matches = []
		for (const field of formItems) {
			if (!isBusinessFormField(field)) continue
			if (!isCascaderFormField(field)) continue
			if (!isEmptyFormField(field)) continue
			const index = Number(field.index)
			if (!Number.isFinite(index)) continue
			const label = normalizeFormFieldLabel(getObservedItemLabel(field))
			if (!label) continue
			const segment = extractTaskAssignmentSegment(taskText, label, labels)
			const path = parseCascaderPathSegment(segment)
			if (path.length < 2) continue
			if (hasRecentCascaderPathAttempt(session, index, path)) continue
			matches.push({ field, index, label, path })
		}
		if (matches.length !== 1) return null
		const match = matches[0]
		return {
			evaluation_previous_goal: '模型规划超时，但当前表单中有一个与任务文字明确匹配的空级联字段。',
			memory: `使用通用表单恢复策略，仅根据字段标签 "${match.label}" 与任务中的层级值继续一次级联选择。`,
			thought: '模型超时后，任务文本和当前表单字段能唯一确定下一步级联路径，先执行受限恢复动作。',
			next_goal: `选择${match.label}`,
			action: {
				name: 'select_cascader_path',
				input: {
					index: match.index,
					path: match.path,
					workflow_step: 'select_cascader_path_timeout_recovery',
					workflow_field_label: match.label,
				},
			},
		}
	}

	function deriveVisibleCascaderOptionTimeoutDecision(session, observation) {
		const failed = getRecentFailedCascaderRecovery(session)
		if (!failed) return null
		const requested = cleanCascaderPathPart(
			getOutcomeRequestedText(failed) ||
			getLastCascaderPathPart(failed?.input?.path)
		)
		if (!requested) return null
		const candidates = collectVisibleCascaderOptionItems(observation)
			.filter((item) => labelsMatchAssignedValue(getObservedItemLabel(item), requested))
			.filter((item) => !hasRecentVisibleCascaderOptionAttempt(session, item, requested))
		if (candidates.length !== 1) return null
		const candidate = candidates[0]
		return {
			evaluation_previous_goal: `上一次级联路径选择失败，但当前级联菜单中已经出现与请求值匹配的真实候选 "${requested}"。`,
			memory: '使用通用表单恢复策略，优先点击已展开级联菜单里的可见叶子候选，避免因任务文本尾部标点导致再次失败。',
			thought: '级联候选已可见，且候选文本与清洗后的目标值唯一匹配，直接选择该候选。',
			next_goal: `选择级联候选：${requested}`,
			action: {
				name: 'click_element_by_index',
				input: {
					index: Number(candidate.index),
					target_label: getObservedItemLabel(candidate) || requested,
					workflow_step: 'select_visible_cascader_option_timeout_recovery',
					workflow_field_label: String(failed?.input?.workflow_field_label || ''),
					workflow_requested_text: requested,
				},
			},
		}
	}

	function deriveFormAssignedFieldTimeoutDecision(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!taskText) return null
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReached(observation, key))
		if (unresolved.length) return null
		const formItems = collectObservedFormControlItems(observation)
		const labels = formItems
			.map((item) => normalizeFormFieldLabel(getObservedItemLabel(item)))
			.filter(Boolean)
		const matches = []
		for (const field of formItems) {
			if (!isBusinessFormField(field)) continue
			if (!isEmptyFormField(field)) continue
			if (isCascaderFormField(field)) continue
			const index = Number(field.index)
			if (!Number.isFinite(index)) continue
			const label = normalizeFormFieldLabel(getObservedItemLabel(field))
			if (!label) continue
			const value = parseScalarAssignmentSegment(extractTaskAssignmentSegment(taskText, label, labels))
			if (!value) continue
			if (isPlainTextFormField(field)) {
				if (hasRecentFormFieldRecoveryAttempt(session, index, 'input_text', value)) continue
				matches.push({
					field,
					index,
					label,
					value,
					priority: getFormFieldOrderScore(field),
					decision: buildTextFormFieldRecoveryDecision(index, label, value),
				})
				continue
			}
			if (isDropdownFormField(field)) {
				const visible = findVisibleOptionLabelForValue(observation, value)
				if (visible && !hasRecentFormFieldRecoveryAttempt(session, index, 'choose_dropdown_option', visible)) {
					matches.push({
						field,
						index,
						label,
						value,
						priority: getFormFieldOrderScore(field),
						decision: buildChooseDropdownRecoveryDecision(index, label, visible),
					})
					continue
				}
				if (!hasRecentFormFieldRecoveryAttempt(session, index, 'open_dropdown', '')) {
					matches.push({
						field,
						index,
						label,
						value,
						priority: getFormFieldOrderScore(field) + 0.1,
						decision: buildOpenDropdownRecoveryDecision(index, label, value),
					})
				}
			}
		}
		if (!matches.length) return null
		matches.sort((a, b) => a.priority - b.priority)
		return matches[0].decision
	}

	function buildTextFormFieldRecoveryDecision(index, label, value) {
		return {
			evaluation_previous_goal: `模型规划超时，但当前表单字段 "${label}" 为空，且任务文本明确给出了取值。`,
			memory: `使用通用表单恢复策略，按表单顺序填写空字段 "${label}"。`,
			thought: '模型超时后，任务文字和当前表单字段能唯一确定下一步文本输入。',
			next_goal: `填写${label}`,
			action: {
				name: 'input_text',
				input: {
					index,
					text: value,
					workflow_step: 'fill_form_field_timeout_recovery',
					workflow_field_label: label,
				},
			},
		}
	}

	function buildOpenDropdownRecoveryDecision(index, label, value) {
		return {
			evaluation_previous_goal: `模型规划超时，但当前表单字段 "${label}" 为空，且任务文本明确给出了目标值 "${value}"。`,
			memory: `使用通用表单恢复策略，先展开 "${label}" 下拉框以获取真实候选。`,
			thought: '选择类字段需要先获得页面真实候选，避免臆造选项。',
			next_goal: `展开${label}下拉框`,
			action: {
				name: 'open_dropdown',
				input: {
					index,
					workflow_step: 'open_form_dropdown_timeout_recovery',
					workflow_field_label: label,
					workflow_requested_text: value,
				},
			},
		}
	}

	function buildChooseDropdownRecoveryDecision(index, label, value) {
		return {
			evaluation_previous_goal: `模型规划超时，但 "${label}" 的目标候选 "${value}" 已在当前页面可见。`,
			memory: `使用通用表单恢复策略，选择字段 "${label}" 的真实可见候选。`,
			thought: '下拉候选已经可见且与任务目标唯一匹配，直接选择该候选。',
			next_goal: `选择${label}为${value}`,
			action: {
				name: 'choose_dropdown_option',
				input: {
					index,
					text: value,
					workflow_step: 'choose_form_dropdown_timeout_recovery',
					workflow_field_label: label,
				},
			},
		}
	}

	function deriveFormSubmitTimeoutDecision(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!taskText || !isCreateTask(taskText)) return null
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReached(observation, key))
		if (unresolved.length) return null
		const assignedFieldsSatisfied = areTaskAssignedFormFieldsSatisfied(session, observation)
		if (!hasRecentSuccessfulFormFillRecovery(session) && !assignedFieldsSatisfied) return null
		if (hasRecentFormSubmitRecoveryAttempt(session)) return null
		const candidates = collectFormSubmitCandidateItems(observation)
			.filter(isFormSubmitCandidateItem)
			.sort(scoreFormSubmitCandidate)
		const candidate = chooseFormSubmitCandidate(candidates)
		if (candidate) {
			const label = normalizeFormFieldLabel(getObservedItemLabel(candidate)) || '提交按钮'
			return {
				evaluation_previous_goal: assignedFieldsSatisfied
					? '模型规划超时，但任务明确要求的表单字段已经填写完毕，且当前观察中存在稳定的通用提交按钮。'
					: '模型规划超时，但最近一次受限表单恢复已经完成字段选择，且当前观察中存在稳定的通用提交按钮。',
				memory: `使用通用表单恢复策略，仅点击当前业务表单中的 "${label}" 按钮提交一次。`,
				thought: '字段已满足任务要求且模型再次超时，当前能确定保存/提交按钮，执行一次受限提交动作。',
				next_goal: '提交当前表单',
				action: {
					name: 'click_element_by_index',
					input: {
						index: Number(candidate.index),
						workflow_step: 'submit_form_timeout_recovery',
						workflow_submit_label: label,
					},
				},
			}
		}
		if (candidates.length > 1) return null
		return {
			evaluation_previous_goal: '模型规划超时，最近一次受限表单恢复已完成字段选择，但当前 DOM 观察没有稳定的提交按钮索引。',
			memory: '使用通用表单恢复策略，请视觉定位当前打开表单或弹层底部的保存/提交按钮；若不存在应失败而不是点击页面入口。',
			thought: '字段已由恢复动作补完，但保存按钮没有稳定索引，改用受限视觉定位查找当前表单的提交按钮。',
			next_goal: '定位并提交当前表单',
			action: {
				name: 'locate_by_vision',
				input: {
					target_description: '当前打开的表单或弹层底部的保存、提交或确定按钮',
					action_name: 'click_element_by_index',
					workflow_step: 'submit_form_timeout_recovery',
					workflow_submit_label: '保存/提交/确定',
				},
			},
		}
	}

	function areTaskAssignedFormFieldsSatisfied(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!taskText) return false
		const formItems = collectObservedFormControlItems(observation)
			.filter(isBusinessFormField)
		const labels = formItems
			.map((item) => normalizeFormFieldLabel(getObservedItemLabel(item)))
			.filter(Boolean)
		let matchedCount = 0
		for (const field of formItems) {
			const label = normalizeFormFieldLabel(getObservedItemLabel(field))
			if (!label) continue
			const segment = extractTaskAssignmentSegment(taskText, label, labels)
			if (!segment) continue
			if (isCascaderFormField(field)) {
				const path = parseCascaderPathSegment(segment)
				if (path.length < 2) continue
				matchedCount += 1
				if (isEmptyFormField(field) || !observedFieldValueMatchesCascaderPath(field, path)) return false
				continue
			}
			const value = parseScalarAssignmentSegment(segment)
			if (!value) continue
			matchedCount += 1
			if (isEmptyFormField(field) || !observedFieldValueMatchesScalar(field, value)) return false
		}
		return matchedCount > 0
	}

	function observedFieldValueMatchesScalar(field, expected) {
		const actual = getObservedFormFieldValueText(field)
		if (!actual) return false
		return labelsMatchAssignedValue(actual, expected)
	}

	function observedFieldValueMatchesCascaderPath(field, path) {
		const actual = getNavigationKey(getObservedFormFieldValueText(field))
		if (!actual) return false
		return (Array.isArray(path) ? path : [])
			.map((part) => getNavigationKey(cleanCascaderPathPart(part)))
			.filter(Boolean)
			.every((part) => actual.includes(part))
	}

	function getObservedFormFieldValueText(item) {
		for (const raw of [
			item?.valueState,
			item?.value,
			item?.selected,
			item?.childValue,
			item?.childSelected,
			item?.text,
		]) {
			const text = String(raw || '').trim()
			if (!text || /^(unknown|empty|-|null|undefined)$/i.test(text)) continue
			return cleanAssignmentValue(text.replace(/^(filled|selected|checked)\s*:\s*/i, ''))
		}
		return ''
	}

	function deriveTaskNavigationWorkflowDecision(session, observation) {
		const state = syncNavigationState(session)
		const attempted = getReservedNavigationKeys(state)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReached(observation, key))
		const unattempted = unresolved.filter((key) => !attempted.includes(key))
		for (const key of unattempted) {
			const candidate = findNavigationCandidateForKey(observation, key)
			if (!candidate) continue
			return buildNavigationCandidateDecision(state, candidate, key, '当前观察中存在同名导航入口。')
		}
		for (const key of unresolved.filter((item) => attempted.includes(item))) {
			const candidate = findConcreteNavigationAliasCandidateForKey(observation, key)
			if (!candidate) continue
			return buildNavigationCandidateDecision(state, candidate, key, '之前点击的是导航组，现在观察到更具体的子菜单入口。')
		}
		const visionDecision = buildCompositeNavigationVisionDecision(state, observation, unresolved, '目标导航组已展开但目标页面仍未到达')
		if (visionDecision) return visionDecision
		if (!unattempted.length) return null
		const revealDecision = buildNavigationRevealDecision(state, observation, unattempted, '目标导航尚未直接可见')
		if (revealDecision) return revealDecision
		return null
	}

	function buildCreateTaskHintLines(session, observation, expectedKeys = []) {
		const taskText = String(session?.latestTask || session?.task || '')
		if (!isCreateTask(taskText)) return []
		const unresolved = (Array.isArray(expectedKeys) ? expectedKeys : [])
			.filter((key) => !isNavigationTargetReached(observation, key))
		if (unresolved.length) return []
		const lines = [
			'- create_task status="active" guidance="任务包含创建/新增意图；页面动作仍由模型根据当前元素分析后决定。若紧凑观察未展示创建入口，先 request_context source=actions region=content query=\'新增\' 或 inspect_region content，不要直接 done。"',
		]
		const candidates = collectCreateEntryItems(observation)
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => isCreateEntryCandidateItem(item))
			.sort((a, b) => scoreCreateEntryCandidate(a, extractCreateEntityHints(taskText)) - scoreCreateEntryCandidate(b, extractCreateEntityHints(taskText)))
			.slice(0, 5)
			.map((item) => `index=${Number(item.index)} label="${escapeAttr(getObservedItemLabel(item) || '')}" region="${escapeAttr(item.region || '')}" intent="${escapeAttr(item.actionIntent || item.intent || '')}"`)
		if (candidates.length) {
			lines.push(`- create_candidates ${candidates.join('; ')}`)
		}
		return lines
	}

	function buildNavigationRevealDecision(state, observation, unresolved, reason) {
		const visionDecision = buildCompositeNavigationVisionDecision(state, observation, unresolved, reason)
		if (visionDecision) return visionDecision
		const revealCandidate = findNavigationRevealCandidate(observation, state, unresolved)
		if (!revealCandidate) return null
		const label = getObservedItemLabel(revealCandidate) || '更多'
		addUnique(state.revealAttemptKeys, buildNavigationRevealAttemptKey(revealCandidate))
		return {
			evaluation_previous_goal: `${reason}，任务目标模块仍未直接可见: ${unresolved.join('、')}。`,
			memory: '使用通用导航展开动作暴露隐藏菜单；已尝试的展开入口会记录到状态中，避免重复点击。',
			thought: '目标模块未出现在当前观察里，先展开一个导航容器再重新观察。',
			next_goal: `展开导航入口：${label}`,
			action: {
				name: 'click_element_by_index',
				input: {
					index: Number(revealCandidate.index),
					target_label: label,
					target_region: String(revealCandidate.region || ''),
					workflow_step: 'reveal_navigation_options',
				},
			},
		}
	}

	function buildNavigationCandidateDecision(state, candidate, key, previousGoalSuffix) {
		addUnique(state.plannedKeys, key)
		const label = getObservedItemLabel(candidate) || key
		return {
			evaluation_previous_goal: `任务目标模块 "${label}" 尚未到达，${previousGoalSuffix}`,
			memory: '使用通用任务导航流程只点击一次同名导航；执行结果会进入 workflow 历史，失败后不重复同一目标。',
			thought: '先进入任务点名的目标模块，再测试页面内搜索区域。',
			next_goal: `进入目标模块：${label}`,
			action: {
				name: 'click_element_by_index',
				input: {
					index: Number(candidate.index),
					target_label: label,
					workflow_step: 'navigate_to_task_target',
					workflow_nav_key: key,
				},
			},
		}
	}

	function buildCompositeNavigationVisionDecision(state, observation, unresolved, reason) {
		const target = findExpandedCompositeNavigationTarget(observation, state, unresolved)
		if (!target) return null
		addUnique(state.visionAttemptKeys, target.attemptKey)
		const parentLabel = getObservedItemLabel(target.item) || '导航组'
		const childLabel = target.alias || target.key
		const description = `左侧侧边栏中已展开的「${parentLabel}」导航组里的「${childLabel}」子菜单项`
		return {
			evaluation_previous_goal: `${reason}: ${target.key}。`,
			memory: '当前观察把父菜单和子菜单合并成一个导航项，改用视觉定位点击具体子菜单，避免重复点击父菜单导致跳转到错误模块。',
			thought: '导航组已经展开，但目标子菜单没有稳定索引；直接按屏幕语义定位具体子菜单。',
			next_goal: `视觉定位并进入子菜单：${childLabel}`,
			action: {
				name: 'locate_by_vision',
				input: {
					target_description: description,
					action_name: 'click_element_by_index',
					target_label: childLabel,
					target_region: String(target.item?.region || 'sidebar'),
					parent_label: parentLabel,
					workflow_step: 'navigate_to_task_target',
					workflow_nav_key: target.key,
					workflow_nav_alias: childLabel,
					navigation_vision_attempt_key: target.attemptKey,
				},
			},
		}
	}

	function deriveSearchWorkflowDecisionIfAllowed(session, observation) {
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReached(observation, key))
		if (unresolved.length) return null
		if (typeof searchWorkflow.deriveSearchWorkflowDecision !== 'function') return null
		return searchWorkflow.deriveSearchWorkflowDecision(session, observation)
	}

	function findNavigationCandidateForKey(observation, key) {
		const targetKey = getNavigationKey(key)
		if (!targetKey) return null
		const items = collectObservedNavigationStateItems(observation)
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => isNavigationCandidateItem(item))
			.filter((item) => labelMatchesNavigationKey(getObservedItemLabel(item), targetKey))
			.filter((item) => !isExpandedCompositeNavigationParentForTarget(item, targetKey))
		if (!items.length) return null
		return items.sort((a, b) => scoreNavigationCandidate(a, targetKey) - scoreNavigationCandidate(b, targetKey))[0]
	}

	function findConcreteNavigationAliasCandidateForKey(observation, key) {
		const targetKey = getNavigationKey(key)
		if (!targetKey) return null
		const items = collectObservedNavigationStateItems(observation)
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => isNavigationCandidateItem(item))
			.filter((item) => labelMatchesNavigationKey(getObservedItemLabel(item), targetKey))
			.filter((item) => isConcreteNavigationAliasCandidate(item, targetKey))
		if (!items.length) return null
		return items.sort((a, b) => scoreNavigationCandidate(a, targetKey) - scoreNavigationCandidate(b, targetKey))[0]
	}

	function isConcreteNavigationAliasCandidate(item, targetKey) {
		const label = getNavigationKey(getObservedItemLabel(item))
		const target = getNavigationKey(targetKey)
		if (!label || !target || label === target) return false
		if (isExpandedCompositeNavigationParentForTarget(item, target)) return false
		const alias = getBestNavigationTargetAlias(label, target)
		return !!alias && alias !== target
	}

	function findExpandedCompositeNavigationTarget(observation, state, targetKeys = []) {
		const attempts = new Set((Array.isArray(state?.visionAttemptKeys) ? state.visionAttemptKeys : [])
			.map((value) => String(value || '')))
		const candidates = []
		for (const item of collectObservedNavigationStateItems(observation)) {
			if (!Number.isFinite(Number(item?.index))) continue
			if (getNavigationKey(item?.region) !== 'sidebar') continue
			for (const key of (Array.isArray(targetKeys) ? targetKeys : [])) {
				const target = getNavigationKey(key)
				if (!target || !isExpandedCompositeNavigationParentForTarget(item, target)) continue
				const alias = getConcreteNavigationVisionAlias(getObservedItemLabel(item), target)
				if (!alias) continue
				const attemptKey = buildNavigationVisionAttemptKey(item, target, alias)
				if (attempts.has(attemptKey)) continue
				candidates.push({ item, key: target, alias, attemptKey })
			}
		}
		if (!candidates.length) return null
		return candidates.sort((a, b) =>
			scoreNavigationCandidate(a.item, a.key) - scoreNavigationCandidate(b.item, b.key)
		)[0]
	}

	function isExpandedCompositeNavigationParentForTarget(item, targetKey) {
		const label = getNavigationKey(getObservedItemLabel(item))
		const target = getNavigationKey(targetKey)
		if (!label || !target || !isExpandedNavigationItem(item)) return false
		return isCompositeNavigationParentLabel(label, target)
	}

	function isExpandedNavigationItem(item) {
		const expanded = getNavigationKey(item?.expandedState || item?.expanded || '')
		const stateText = getNavigationKey(item?.stateHints || item?.state || '')
		return expanded === 'expanded' || /(is-opened|expanded|open=true|opened|展开)/i.test(stateText)
	}

	function getConcreteNavigationVisionAlias(label, targetKey) {
		const labelKey = getNavigationKey(label)
		const target = getNavigationKey(targetKey)
		const aliases = getNavigationTargetAliases(target)
			.filter((alias) => alias && alias !== target && labelKey.includes(alias))
			.sort((a, b) => a.length - b.length)
		if (aliases.length) return aliases[0]
		return labelKey.includes(target) ? target : ''
	}

	function findNavigationRevealCandidate(observation, state, targetKeys = []) {
		const attempted = new Set((Array.isArray(state?.revealAttemptKeys) ? state.revealAttemptKeys : [])
			.map((value) => String(value || '')))
		const items = collectObservedNavigationStateItems(observation)
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => !attempted.has(buildNavigationRevealAttemptKey(item)))
			.filter((item) => isNavigationRevealCandidateItem(item, targetKeys))
		if (!items.length) return null
		return items.sort((a, b) => scoreNavigationRevealCandidate(a, targetKeys) - scoreNavigationRevealCandidate(b, targetKeys))[0]
	}

	function isNavigationRevealCandidateItem(item, targetKeys = []) {
		const region = getNavigationKey(item?.region)
		if (region !== 'header' && region !== 'sidebar') return false
		if (isSelectedOrActiveObservedItem(item)) return false
		const role = getNavigationKey(item?.role)
		const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
		if (/^(textbox|combobox|option|checkbox|radio|switch|listbox)$/.test(role)) return false
		if (/(dropdown|select|checkbox|radio|cascader)/i.test(control)) return false
		const label = getNavigationKey(getObservedItemLabel(item))
		const rel = getNavigationKey(item?.rel || item?.ariaControls || item?.ariaOwns || '')
		const expanded = getNavigationKey(item?.expandedState || item?.expanded || '')
		const stateText = getNavigationKey(item?.stateHints || item?.state || '')
		const hasPopup = /haspopup|dropdown|menu|list/.test(rel)
		if (/^(更多|更多菜单|菜单|导航|全部|全部菜单|展开菜单)$/.test(label)) return true
		if (isPotentialNavigationParentCandidate(label, role, targetKeys)) return true
		const expandable = expanded === 'collapsed' || hasPopup || /(submenu|dropdown|menu|collapsed|fold)/.test(stateText)
		return expandable && isLikelyNavigationContainerLabel(label, role)
	}

	function isLikelyNavigationContainerLabel(label, role) {
		if (!label) return false
		if (/^(首页|主页|home|展开选项|搜索内容|搜索|查询|筛选|登录|退出|个人中心|消息|通知)$/.test(label)) return false
		if (/^(menuitem|button|link|tab)$/.test(role) && /(管理|设置|配置|中心|菜单|导航|模块|系统|权限|组织|部门|角色|用户|客户|订单|产品|数据|报表|审批|业务)/.test(label)) return true
		return false
	}

	function isPotentialNavigationParentCandidate(label, role, targetKeys = []) {
		if (!/^(menuitem|button|link|tab)$/.test(role)) return false
		if (!label || !isLikelyNavigationContainerLabel(label, role)) return false
		return (Array.isArray(targetKeys) ? targetKeys : []).some((targetKey) =>
			scoreNavigationParentRelation(label, targetKey) <= -10
		)
	}

	function scoreNavigationRevealCandidate(item, targetKeys = []) {
		const label = getNavigationKey(getObservedItemLabel(item))
		let score = 0
		if (label === '更多' || label === '菜单') score += 6
		for (const targetKey of (Array.isArray(targetKeys) ? targetKeys : [])) {
			const target = getNavigationKey(targetKey)
			if (!target) continue
			if (label && (target.includes(label) || label.includes(target))) score -= 20
			const targetStem = stripNavigationSuffix(target)
			if (targetStem && label.includes(targetStem)) score -= 12
			score += scoreNavigationParentRelation(label, target)
			if (getNavigationSuffix(label) && getNavigationSuffix(label) === getNavigationSuffix(target)) score -= 3
		}
		const region = getNavigationKey(item?.region)
		if (region === 'sidebar') score -= 5
		else if (region === 'header') score -= 1
		const rect = item?.rect || {}
		return score * 1000000 + (Number(rect.top) || 0) * 1000 + (Number(rect.left) || 0)
	}

	function scoreNavigationParentRelation(label, targetKey) {
		const parent = getNavigationKey(label)
		const target = getNavigationKey(targetKey)
		if (!parent || !target) return 0
		for (const rule of NAVIGATION_PARENT_RELATION_RULES) {
			if (rule.target.test(target) && rule.parent.test(parent)) return rule.score
		}
		return 0
	}

	const NAVIGATION_PARENT_RELATION_RULES = [
		{
			target: /(用户|账号|账户|成员|员工|人员|角色|权限|菜单|部门|岗位|字典|组织|租户|审计|日志)/,
			parent: /(系统|权限|组织|基础|平台|设置|配置|后台|安全|账户|账号)/,
			score: -18,
		},
		{
			target: /(客户|联系人|线索|商机|合同|回款|销售|跟进)/,
			parent: /(客户|销售|业务|crm|关系)/,
			score: -18,
		},
		{
			target: /(商品|产品|物料|库存|仓库|采购|供应商)/,
			parent: /(产品|商品|物料|库存|仓储|采购|供应)/,
			score: -18,
		},
		{
			target: /(报表|统计|分析|看板|仪表盘|数据)/,
			parent: /(报表|统计|分析|数据|看板)/,
			score: -18,
		},
	]

	function stripNavigationSuffix(value) {
		return getNavigationKey(value).replace(/(管理|中心|模块|页面|列表|报表|审批|设置|配置)$/g, '')
	}

	function getNavigationSuffix(value) {
		const match = getNavigationKey(value).match(/(管理|中心|模块|页面|列表|报表|审批|设置|配置)$/)
		return match?.[1] || ''
	}

	function buildNavigationRevealAttemptKey(item) {
		const label = getNavigationKey(getObservedItemLabel(item))
		const region = getNavigationKey(item?.region || item?.target_region)
		const target = getNavigationKey(item?.navigationTarget || item?.target || '')
		const stable = getNavigationKey(item?.stableId || item?.sid || '')
		return [
			region || '-',
			label || target || stable || String(Number(item?.index) || ''),
		].join(':')
	}

	function buildNavigationVisionAttemptKey(item, targetKey, alias) {
		const input = item || {}
		return [
			'vision',
			getNavigationKey(input.region || input.target_region || 'sidebar') || '-',
			getNavigationKey(targetKey || input.workflow_nav_key || ''),
			getNavigationKey(alias || input.workflow_nav_alias || input.target_label || ''),
			getNavigationKey(getObservedItemLabel(input) || input.parent_label || ''),
		].join(':')
	}

	function isNavigationCandidateItem(item) {
		const role = getNavigationKey(item?.role)
		const region = getNavigationKey(item?.region)
		const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
		const type = getNavigationKey(item?.type)
		const intent = getNavigationKey(item?.actionIntent || item?.intent)
		if (/^(textbox|combobox|option|checkbox|radio|switch|listbox)$/.test(role)) return false
		if (/^(input|textarea|select)$/.test(type)) return false
		if (/(dropdown|select|checkbox|radio|cascader)/i.test(control)) return false
		if (item?.navigationTarget || /^(navigate|open|menu|tab|link)$/.test(intent)) return true
		if (/^(header|sidebar)$/.test(region)) return true
		return /^(tab|menuitem|link)$/.test(role)
	}

	function labelMatchesNavigationKey(label, targetKey) {
		const labelKey = getNavigationKey(label)
		if (!labelKey || !targetKey) return false
		return getNavigationTargetAliases(targetKey).some((alias) => {
			if (!alias) return false
			if (labelKey === alias) return true
			if (labelKey.endsWith(alias)) return true
			return alias.length >= 3 && labelKey.includes(alias)
		})
	}

	function scoreNavigationCandidate(item, targetKey) {
		const labelKey = getNavigationKey(getObservedItemLabel(item))
		const matchedAlias = getBestNavigationTargetAlias(labelKey, targetKey)
		let score = 0
		if (matchedAlias && labelKey !== matchedAlias) score += 20
		else if (!matchedAlias && labelKey !== targetKey) score += 20
		if (isCompositeNavigationParentLabel(labelKey, targetKey)) score += 30
		const region = getNavigationKey(item?.region)
		const role = getNavigationKey(item?.role)
		if (region === 'sidebar') score -= 5
		else if (region === 'header') score -= 3
		else if (region === 'content') score += 8
		if (role === 'menuitem') score -= 3
		else if (role === 'tab') score -= 2
		else if (role === 'link') score -= 1
		const rect = item?.rect || {}
		return score * 1000000 + (Number(rect.top) || 0) * 1000 + (Number(rect.left) || 0)
	}

	function getNavigationTargetAliases(key) {
		const target = getNavigationKey(key)
		if (!target) return []
		const aliases = [target]
		const stem = stripNavigationSuffix(target)
		if (
			stem &&
			stem !== target &&
			stem.length >= 2 &&
			!isGenericNavigationAlias(stem)
		) {
			aliases.push(stem)
		}
		return [...new Set(aliases)]
	}

	function getBestNavigationTargetAlias(labelKey, targetKey) {
		const label = getNavigationKey(labelKey)
		if (!label) return ''
		const aliases = getNavigationTargetAliases(targetKey)
		return aliases.find((alias) => label === alias) ||
			aliases.find((alias) => label.endsWith(alias)) ||
			aliases.find((alias) => alias.length >= 3 && label.includes(alias)) ||
			''
	}

	function isCompositeNavigationParentLabel(labelKey, targetKey) {
		const label = getNavigationKey(labelKey)
		const target = getNavigationKey(targetKey)
		if (!label || !target || label === target) return false
		if (!label.includes(target)) return false
		const stem = stripNavigationSuffix(target)
		if (!stem || stem === target) return false
		return label.length >= target.length + Math.max(2, stem.length)
	}

	function isGenericNavigationAlias(value) {
		return /^(管理|中心|模块|页面|列表|系统|业务|数据|信息|设置|配置)$/.test(getNavigationKey(value))
	}

	function isCreateTask(taskText) {
		return /(创建|新建|新增|添加|增加|create|add|new)\s*(一个|一条|新的)?[\u4e00-\u9fa5A-Za-z0-9_-]{0,18}/i.test(String(taskText || ''))
	}

	function collectCreateEntryItems(observation) {
		return [
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...collectTextNavigationItems(observation),
		]
	}

	function isCreateEntryCandidateItem(item) {
		const region = getNavigationKey(item?.region)
		if (region && !/^(content|header|dialog|popover)$/.test(region)) return false
		if (isSelectedOrActiveObservedItem(item)) return false
		const role = getNavigationKey(item?.role)
		const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
		if (/^(textbox|combobox|option|checkbox|radio|switch|listbox)$/.test(role)) return false
		if (/(dropdown|select|checkbox|radio|cascader)/i.test(control)) return false
		const label = getNavigationKey(getObservedItemLabel(item))
		const intent = getNavigationKey(item?.actionIntent || item?.intent)
		const target = getNavigationKey(item?.navigationTarget || item?.target || '')
		const text = `${label} ${intent} ${target}`
		if (/(新增|新建|创建|添加|增加|add|create|new|plus)/i.test(text)) return true
		return false
	}

	function scoreCreateEntryCandidate(item, entityHints) {
		const label = getNavigationKey(getObservedItemLabel(item))
		const intent = getNavigationKey(item?.actionIntent || item?.intent)
		const region = getNavigationKey(item?.region)
		let score = 0
		if (/^(新增|新建|创建|添加|增加|add|create|new)$/.test(label)) score -= 15
		if (/(新增|新建|创建|添加|增加|add|create|new)/i.test(intent)) score -= 12
		for (const hint of entityHints) {
			const key = getNavigationKey(hint)
			if (key && label.includes(key)) score -= 10
		}
		if (region === 'content' || region === 'dialog') score -= 5
		else if (region === 'header') score -= 1
		if (item?.newSinceLastObservation) score -= 2
		const rect = item?.rect || {}
		return score * 1000000 + (Number(rect.top) || 0) * 1000 + (Number(rect.left) || 0)
	}

	function extractCreateEntityHints(taskText) {
		const text = String(taskText || '')
		const hints = []
		const patterns = [
			/(?:创建|新建|新增|添加|增加)\s*(?:一个|一条|新的)?\s*([\u4e00-\u9fa5A-Za-z0-9_-]{1,12})/gi,
			/(?:create|add|new)\s+(?:a|an|the)?\s*([A-Za-z0-9_-]{2,24})/gi,
		]
		for (const pattern of patterns) {
			for (const match of text.matchAll(pattern)) {
				const hint = String(match?.[1] || '')
					.replace(/^(记录|数据|信息)$/g, '')
					.replace(/(，|,|。|\.|；|;|:|：).*$/g, '')
					.trim()
				if (hint && !isGenericCreateEntityHint(hint)) hints.push(hint)
			}
		}
		return [...new Set(hints.map(getNavigationKey).filter(Boolean))]
	}

	function isGenericCreateEntityHint(value) {
		return /^(一个|一条|新的|记录|数据|信息|表单|item|record|data)$/i.test(String(value || '').trim())
	}

	function collectFormSubmitCandidateItems(observation) {
		const items = [
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...collectTextNavigationItems(observation),
		]
		const seen = new Set()
		return items.filter((item) => {
			const index = Number(item?.index)
			if (!Number.isFinite(index)) return false
			const label = normalizeFormFieldLabel(getObservedItemLabel(item))
			const key = `${index}:${label}:${getNavigationKey(item?.region)}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
	}

	function isFormSubmitCandidateItem(item) {
		const index = Number(item?.index)
		if (!Number.isFinite(index)) return false
		const region = getNavigationKey(item?.region)
		if (region && !/^(content|dialog|popover)$/.test(region)) return false
		if (isSelectedOrActiveObservedItem(item)) return false
		const role = getNavigationKey(item?.role)
		if (role && !/^(button|link)$/.test(role)) return false
		const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
		if (/(dropdown|select|checkbox|radio|switch|cascader|textbox|combobox|listbox)/i.test(control)) return false
		const label = getNavigationKey(getObservedItemLabel(item))
		if (!label || isKnownNonSubmitButtonLabel(label)) return false
		const intent = getNavigationKey(item?.actionIntent || item?.intent)
		const target = getNavigationKey(item?.navigationTarget || item?.target || '')
		if (/^(保存|提交|确定|完成|确认|save|submit|confirm|ok|done)$/.test(label)) return true
		if (/(保存并|保存后|提交并|确认提交|saveandsubmit|saveandclose)/i.test(label)) return true
		if (/(submit|save|confirm|ok|done)/i.test(`${intent} ${target}`) && /(保存|提交|确定|完成|确认|save|submit|confirm|ok|done)/i.test(label)) {
			return true
		}
		return false
	}

	function isKnownNonSubmitButtonLabel(label) {
		return /^(新增|新建|创建|添加|增加|删除|移除|取消|关闭|返回|重置|搜索|查询|展开|收起|更多|导出|导入|上传|下载|刷新|详情|明细|推送|编辑|add|create|new|delete|remove|cancel|close|back|reset|search|query|expand|collapse|more|export|import|upload|download|refresh|detail|edit)$/.test(String(label || ''))
	}

	function chooseFormSubmitCandidate(candidates) {
		const list = Array.isArray(candidates) ? candidates : []
		if (list.length <= 1) return list[0] || null
		const labels = [...new Set(list.map((item) => normalizeFormFieldLabel(getObservedItemLabel(item))).filter(Boolean))]
		const regions = [...new Set(list.map((item) => getNavigationKey(item?.region)).filter(Boolean))]
		if (
			labels.length === 1 &&
			regions.length === 1 &&
			/^(保存|提交|确定|完成|确认|save|submit|confirm|ok|done)$/i.test(labels[0])
		) {
			return list[0]
		}
		return null
	}

	function scoreFormSubmitCandidate(a, b) {
		return getFormSubmitCandidateScore(a) - getFormSubmitCandidateScore(b)
	}

	function getFormSubmitCandidateScore(item) {
		const label = getNavigationKey(getObservedItemLabel(item))
		const intent = getNavigationKey(item?.actionIntent || item?.intent)
		const region = getNavigationKey(item?.region)
		let score = 0
		if (region === 'dialog') score -= 30
		else if (region === 'popover') score -= 20
		else if (region === 'content') score -= 10
		if (/^(保存|提交|确定|完成|确认|save|submit|confirm|ok|done)$/.test(label)) score -= 10
		if (/(submit|save|confirm|ok|done)/i.test(intent)) score -= 5
		const rect = item?.rect || {}
		return score * 1000000 + (Number(rect.top) || 0) * 1000 + (Number(rect.left) || 0)
	}

	function hasRecentSuccessfulFormFillRecovery(session) {
		return getRecentHistoryItems(session, 6).some((item) => {
			if (item?.success === false) return false
			const action = String(item?.action || '').replace(/\..*$/, '')
			const input = item?.input || {}
			const step = String(input.workflow_step || '')
			const workflow = String(input.workflow || '')
			if (workflow && workflow !== 'form-fill') return false
			if (action === 'select_cascader_path' && step === 'select_cascader_path_timeout_recovery') return true
			return action === 'click_element_by_index' && step === 'select_visible_cascader_option_timeout_recovery'
		})
	}

	function hasRecentFormSubmitRecoveryAttempt(session) {
		return getRecentHistoryItems(session, 8).some((item) => {
			const input = item?.input || {}
			return String(input.workflow_step || '') === 'submit_form_timeout_recovery'
		})
	}

	function getRecentHistoryItems(session, limit) {
		const history = Array.isArray(session?.history) ? session.history : []
		const count = Math.max(0, Number(limit) || 0)
		return count ? history.slice(Math.max(0, history.length - count)).reverse() : []
	}

	function collectObservedFormControlItems(observation) {
		const items = []
		for (const form of Array.isArray(observation?.forms) ? observation.forms : []) {
			for (const field of Array.isArray(form?.fields) ? form.fields : []) {
				items.push({
					...field,
					formId: form?.id || field?.formId || '',
					formName: form?.name || field?.formName || '',
				})
			}
		}
		for (const item of [
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...(Array.isArray(observation?.popups) ? observation.popups : []),
		]) {
			if (isCascaderFormField(item)) items.push(item)
		}
		const seen = new Set()
		return items.filter((item) => {
			const label = normalizeFormFieldLabel(getObservedItemLabel(item))
			const key = `${Number(item?.index)}:${label}:${getNavigationKey(item?.region)}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
	}

	function isBusinessFormField(item) {
		const region = getNavigationKey(item?.region)
		return !region || /^(content|dialog|popover)$/.test(region)
	}

	function isCascaderFormField(item) {
		const text = getNavigationKey([
			item?.kind,
			item?.fieldType,
			item?.selectionControl,
			item?.controlKind,
			item?.control,
		].filter(Boolean).join(' '))
		return /cascader/.test(text)
	}

	function isEmptyFormField(item) {
		const value = String(item?.valueState || item?.value || item?.selected || '').trim()
		if (!value) return true
		if (/^(empty|空|未选择|未填写)$/i.test(value)) return true
		if (/^(filled|selected|checked):/i.test(value)) return false
		return false
	}

	function isPlainTextFormField(item) {
		if (!item) return false
		if (isCascaderFormField(item) || isDropdownFormField(item)) return false
		const role = getNavigationKey(item?.role)
		const kind = getNavigationKey([
			item?.kind,
			item?.fieldType,
			item?.selectionControl,
			item?.controlKind,
			item?.control,
		].filter(Boolean).join(' '))
		const type = getNavigationKey(item?.type)
		if (/(dropdown|select|combobox|checkbox|radio|switch|cascader|date|time|picker|tree|menu|listbox|option)/.test(kind)) return false
		if (/^(combobox|button|link|menuitem|option|checkbox|radio|switch|listbox|tab)$/.test(role)) return false
		if (/^(checkbox|radio|button|submit|reset|file|range|color|image)$/.test(type)) return false
		if (/^(textbox|text|input|textarea)$/.test(role)) return true
		if (/^(text|textarea|tel|number|email|url|search|password)$/.test(type)) return true
		return !role && !kind && !type
	}

	function isDropdownFormField(item) {
		if (!item || isCascaderFormField(item)) return false
		const text = getNavigationKey([
			item?.kind,
			item?.fieldType,
			item?.selectionControl,
			item?.controlKind,
			item?.control,
			item?.role,
		].filter(Boolean).join(' '))
		return /(dropdown|select|combobox|picker|category|listbox|option)/.test(text)
	}

	function getFormFieldOrderScore(item) {
		const rect = item?.rect || {}
		const top = Number(rect.top)
		const left = Number(rect.left)
		if (Number.isFinite(top) || Number.isFinite(left)) {
			return (Number.isFinite(top) ? top : 0) * 10000 + (Number.isFinite(left) ? left : 0)
		}
		const index = Number(item?.index)
		return (Number.isFinite(index) ? index : 9999) * 10000
	}

	function parseScalarAssignmentSegment(segment) {
		const text = cleanAssignmentValue(segment)
		if (!text) return ''
		if (/[，,、]/.test(text)) return ''
		const first = cleanAssignmentValue(String(text).split(/[。；;\n\r]/)[0])
		if (!first || first.length > 80) return ''
		return first
	}

	function cleanAssignmentValue(value) {
		let text = String(value || '').trim()
		if (!text) return ''
		for (let i = 0; i < 4; i++) {
			const next = text
				.replace(/^[\s"'“”‘’【】\[\]()（）{}<>《》,，、。.;；:：!?！？]+/g, '')
				.replace(/[\s"'“”‘’【】\[\]()（）{}<>《》,，、。.;；:：!?！？]+$/g, '')
				.trim()
			if (next === text) break
			text = next
		}
		return text
	}

	function findVisibleOptionLabelForValue(observation, value) {
		const requested = cleanAssignmentValue(value)
		if (!requested) return ''
		const labels = collectVisibleSelectionOptionItems(observation)
			.filter((item) => labelsMatchAssignedValue(getObservedItemLabel(item), requested))
			.map((item) => cleanAssignmentValue(getObservedItemLabel(item)))
			.filter(Boolean)
		const unique = [...new Set(labels)]
		return unique.length === 1 ? unique[0] : ''
	}

	function collectVisibleSelectionOptionItems(observation) {
		const items = [
			...(Array.isArray(observation?.options) ? observation.options : []),
			...(Array.isArray(observation?.popups) ? observation.popups : []),
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...collectTextNavigationItems(observation),
		]
		return uniqueObservedItems(items)
			.filter((item) => {
				const index = Number(item?.index)
				if (!Number.isFinite(index)) return false
				const label = getObservedItemLabel(item)
				if (!label || label === '(empty)') return false
				const region = getNavigationKey(item?.region)
				const role = getNavigationKey(item?.role)
				const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
				const kind = getNavigationKey(item?.kind || item?.fieldType || '')
				if (/^(header|pagination)$/.test(region)) return false
				if (/^(option|menuitem|treeitem)$/.test(role)) return true
				return /(option|dropdown|select|menuitem|checkbox|radio|cascader-leaf|cascader)/.test(`${control} ${kind}`)
			})
	}

	function collectVisibleCascaderOptionItems(observation) {
		return collectVisibleSelectionOptionItems(observation)
			.filter((item) => {
				const role = getNavigationKey(item?.role)
				const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
				const kind = getNavigationKey(item?.kind || item?.fieldType || '')
				const source = getNavigationKey(item?.source || '')
				if (/cascader/.test(`${control} ${kind} ${source}`)) return true
				return /^(menuitem|treeitem|option)$/.test(role) && getNavigationKey(item?.region) === 'popover'
			})
	}

	function uniqueObservedItems(items) {
		const seen = new Set()
		return (Array.isArray(items) ? items : []).filter((item) => {
			const index = Number(item?.index)
			if (!Number.isFinite(index)) return false
			const key = `${index}:${getObservedItemLabel(item)}:${getNavigationKey(item?.region)}:${getNavigationKey(item?.role)}:${getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
	}

	function labelsMatchAssignedValue(label, value) {
		const candidate = getNavigationKey(cleanAssignmentValue(label))
		const requested = getNavigationKey(cleanAssignmentValue(value))
		if (!candidate || !requested) return false
		if (candidate === requested) return true
		if (requested.length >= 2 && candidate.includes(requested)) return true
		return candidate.length >= 2 && requested.includes(candidate)
	}

	function getRecentFailedCascaderRecovery(session) {
		return getRecentHistoryItems(session, 10).find((item) => {
			if (item?.success !== false) return false
			const action = String(item?.action || '').replace(/\..*$/, '')
			const input = item?.input || {}
			return action === 'select_cascader_path' && String(input.workflow_step || '') === 'select_cascader_path_timeout_recovery'
		}) || null
	}

	function getOutcomeRequestedText(item) {
		const direct = item?.outcome?.requested || item?.outcome?.requestedText || item?.requested || item?.requestedText
		if (direct) return String(direct)
		const text = String(item?.output || item?.message || item?.detail || '')
		return (
			text.match(/\brequested="([^"]+)"/)?.[1] ||
			text.match(/未找到第\s*\d+\s*级选项\s*"([^"]+)"/)?.[1] ||
			text.match(/未找到[^"“”]*["“]([^"“”]+)["”]/)?.[1] ||
			''
		)
	}

	function getLastCascaderPathPart(path) {
		if (!Array.isArray(path) || !path.length) return ''
		return String(path[path.length - 1] || '')
	}

	function hasRecentVisibleCascaderOptionAttempt(session, item, requested) {
		const index = Number(item?.index)
		const target = getNavigationKey(requested)
		return getRecentHistoryItems(session, 8).some((historyItem) => {
			const action = String(historyItem?.action || '').replace(/\..*$/, '')
			const input = historyItem?.input || {}
			if (String(input.workflow_step || '') !== 'select_visible_cascader_option_timeout_recovery') return false
			if (action !== 'click_element_by_index' && action !== 'click') return false
			if (Number.isFinite(index) && Number(input.index) === index) return true
			return target && getNavigationKey(input.workflow_requested_text || input.target_label || '') === target
		})
	}

	function hasRecentFormFieldRecoveryAttempt(session, index, actionName, value) {
		const target = getNavigationKey(cleanAssignmentValue(value))
		return getRecentHistoryItems(session, 8).some((item) => {
			const action = String(item?.action || '').replace(/\..*$/, '')
			const input = item?.input || {}
			if (Number(input.index) !== Number(index)) return false
			if (String(actionName || '') && action !== actionName) return false
			const step = String(input.workflow_step || '')
			if (!/^(fill_form_field_timeout_recovery|open_form_dropdown_timeout_recovery|choose_form_dropdown_timeout_recovery)$/.test(step)) return false
			if (!target) return true
			const attempted = getNavigationKey(cleanAssignmentValue(input.text || input.label || input.workflow_requested_text || ''))
			return !attempted || attempted === target
		})
	}

	function normalizeFormFieldLabel(value) {
		return String(value || '')
			.replace(/^[\s*＊]+/g, '')
			.replace(/[\s:：]+$/g, '')
			.replace(/\s+/g, '')
			.trim()
	}

	function extractTaskAssignmentSegment(taskText, label, allLabels) {
		const source = String(taskText || '')
		for (const match of findLooseLabelMatches(source, label)) {
			let cursor = Number(match.index) + String(match[0] || '').length
			const connector = matchTaskAssignmentConnector(source.slice(cursor))
			if (!connector) continue
			cursor += connector.length
			let end = source.length
			const sentenceBreak = source.slice(cursor).search(/[。；;\n\r]/)
			if (sentenceBreak >= 0) end = Math.min(end, cursor + sentenceBreak)
			const nextLabel = findNextAssignmentLabelIndex(source, cursor, label, allLabels)
			if (nextLabel >= 0) end = Math.min(end, nextLabel)
			const segment = source.slice(cursor, end).trim()
			if (segment) return segment
		}
		return ''
	}

	function findLooseLabelMatches(source, label) {
		const key = normalizeFormFieldLabel(label)
		if (!key) return []
		const pattern = new RegExp(Array.from(key).map(escapeRegExp).join('\\s*'), 'gi')
		return Array.from(String(source || '').matchAll(pattern))
	}

	function matchTaskAssignmentConnector(value) {
		const match = String(value || '').match(/^\s*(?:(?:设置为|设为|选择为|选为|指定为|填为|填写为|为|是|=|:|：)\s*)+/)
		return match?.[0] || ''
	}

	function findNextAssignmentLabelIndex(source, cursor, currentLabel, allLabels) {
		let end = -1
		const current = normalizeFormFieldLabel(currentLabel)
		for (const label of allLabels || []) {
			const key = normalizeFormFieldLabel(label)
			if (!key || key === current) continue
			for (const match of findLooseLabelMatches(source.slice(cursor), key)) {
				const index = cursor + Number(match.index)
				const after = source.slice(index + String(match[0] || '').length)
				if (!matchTaskAssignmentConnector(after)) continue
				if (end < 0 || index < end) end = index
				break
			}
		}
		return end
	}

	function parseCascaderPathSegment(segment) {
		const text = cleanAssignmentValue(segment)
		if (!text) return []
		const parts = text
			.split(/\s*(?:->|→|＞|>|\/|\\|,|，|、|\s+)\s*/g)
			.map(cleanCascaderPathPart)
			.filter(Boolean)
		if (parts.length < 2) return []
		if (parts.some((part) => !isSafeCascaderPathPart(part))) return []
		return parts
	}

	function cleanCascaderPathPart(value) {
		return cleanAssignmentValue(value)
	}

	function isSafeCascaderPathPart(value) {
		const key = getNavigationKey(value)
		if (!key || key.length > 40) return false
		return !/^(和|及|以及|并且|然后|请选择|选择)$/.test(key)
	}

	function hasRecentCascaderPathAttempt(session, index, path) {
		const targetPath = normalizeCascaderPathForCompare(path)
		for (const item of Array.isArray(session?.history) ? session.history : []) {
			const action = String(item?.action || '').replace(/\..*$/, '')
			if (action !== 'select_cascader_path') continue
			const input = item?.input || {}
			if (Number(input.index) !== Number(index)) continue
			if (normalizeCascaderPathForCompare(input.path) !== targetPath) continue
			return true
		}
		return false
	}

	function normalizeCascaderPathForCompare(path) {
		return (Array.isArray(path) ? path : [])
			.map((part) => getNavigationKey(cleanCascaderPathPart(part)))
			.filter(Boolean)
			.join('>')
	}

	function syncNavigationState(session) {
		if (!session || typeof session !== 'object') return createNavigationState()
		if (!session.workflowState || typeof session.workflowState !== 'object') session.workflowState = {}
		const existing = session.workflowState.navigation
		const state = existing && typeof existing === 'object' ? existing : createNavigationState()
		session.workflowState.navigation = state
		upgradeNavigationState(state)
		if (!state.seededFromHistory) {
			seedNavigationStateFromHistory(state, session)
			state.seededFromHistory = true
		}
		return state
	}

	function createNavigationState() {
		return {
			version: 4,
			plannedKeys: [],
			attemptedKeys: [],
			succeededKeys: [],
			failedKeys: [],
			revealAttemptKeys: [],
			visionAttemptKeys: [],
			seededFromHistory: false,
		}
	}

	function upgradeNavigationState(state) {
		if (!state || typeof state !== 'object') return
		if (!Array.isArray(state.plannedKeys)) state.plannedKeys = []
		if (!Array.isArray(state.attemptedKeys)) state.attemptedKeys = []
		if (!Array.isArray(state.succeededKeys)) state.succeededKeys = []
		if (!Array.isArray(state.failedKeys)) state.failedKeys = []
		if (!Array.isArray(state.revealAttemptKeys)) state.revealAttemptKeys = []
		if (!Array.isArray(state.visionAttemptKeys)) state.visionAttemptKeys = []
		state.version = 4
	}

	function seedNavigationStateFromHistory(state, session) {
		const history = Array.isArray(session?.history) ? session.history : []
		for (const item of history) applyNavigationHistoryItemToState(state, item)
	}

	function recordNavigationWorkflowOutcome(session, decision, outcome) {
		const state = syncNavigationState(session)
		const input = decision?.action?.input || {}
		if (String(input.workflow_step || '') === 'reveal_navigation_options') {
			addUnique(state.revealAttemptKeys, buildNavigationRevealAttemptKey(input))
			return
		}
		if (decision?.action?.name === 'locate_by_vision' && String(input.workflow_step || '') === 'navigate_to_task_target') {
			addUnique(state.visionAttemptKeys, input.navigation_vision_attempt_key || buildNavigationVisionAttemptKey(input, input.workflow_nav_key, input.workflow_nav_alias))
		}
		const item = {
			action: decision?.action?.name || '',
			input,
			success: outcome?.success !== false,
			output: String(outcome?.output || outcome?.message || ''),
			nextGoal: String(decision?.next_goal || ''),
		}
		applyNavigationHistoryItemToState(state, item)
	}

	function applyNavigationHistoryItemToState(state, item) {
		if (!state || !item) return
		if (String(item?.input?.workflow_step || '') === 'reveal_navigation_options') {
			addUnique(state.revealAttemptKeys, buildNavigationRevealAttemptKey(item.input || {}))
			return
		}
		if (!isNavigationClickHistory(item)) return
		const key = getNavigationKey(
			item?.input?.workflow_nav_key ||
			item?.input?.target_label ||
			item?.input?.label ||
			item?.input?.text ||
			item?.nextGoal
		)
		if (!key) return
		addUnique(state.attemptedKeys, key)
		if (item.success === false) addUnique(state.failedKeys, key)
		else addUnique(state.succeededKeys, key)
	}

	function getReservedNavigationKeys(state) {
		const keys = [
			...(Array.isArray(state?.plannedKeys) ? state.plannedKeys : []),
			...(Array.isArray(state?.attemptedKeys) ? state.attemptedKeys : []),
		]
		return [...new Set(keys.map(getNavigationKey).filter(Boolean))]
	}

	function getExpectedNavigationKeys(session, state) {
		return [
			...getReservedNavigationKeys(state),
			...extractTaskNavigationTargetKeys(session),
		].filter((key, index, list) => key && list.indexOf(key) === index)
	}

	function extractTaskNavigationTargetKeys(session) {
		const text = String(session?.latestTask || session?.task || '')
		const labels = []
		const targetCore = '[\\u4e00-\\u9fa5A-Za-z0-9]{2,16}?(?:管理|中心|模块|页面|列表|报表|审批|设置|配置)'
		const targetContextSuffix = '(?:部分|模块|页面|区域|列表|中|里|内|下)'
		const patterns = [
			new RegExp(`(?:找到|进入|打开|前往|切换到|定位到|在)\\s*(${targetCore})(?:${targetContextSuffix})?`, 'g'),
			new RegExp(`(${targetCore})${targetContextSuffix}`, 'g'),
		]
		for (const pattern of patterns) {
			for (const match of text.matchAll(pattern)) {
				const label = normalizeTaskTargetLabel(match?.[1])
				if (label) labels.push(label)
			}
		}
		return [...new Set(labels.map(getNavigationKey).filter(Boolean))]
	}

	function normalizeTaskTargetLabel(value) {
		const withoutVerb = String(value || '')
			.replace(/^(找到|进入|打开|前往|切换到|定位到|在)/g, '')
			.trim()
		if (isGenericTaskTargetLabel(withoutVerb)) return ''
		if (isAssignmentLikeTaskTargetLabel(withoutVerb)) return ''
		const label = withoutVerb
			.replace(/(部分|模块|页面|区域|列表|中|里|内|下)$/g, '')
			.trim()
		if (!label || label.length < 2 || label.length > 20) return ''
		if (isGenericTaskTargetLabel(label)) return ''
		if (isAssignmentLikeTaskTargetLabel(label)) return ''
		if (/^(搜索|查询|筛选|过滤)(区域|条件|页面|列表)?$/.test(label)) return ''
		return label
	}

	function isAssignmentLikeTaskTargetLabel(value) {
		const label = String(value || '').replace(/\s+/g, '').trim()
		if (!label) return false
		return /^[\u4e00-\u9fa5A-Za-z0-9]{1,10}(?:为|是|叫|名为|名称为|设为|设置为).+/.test(label)
	}

	function isGenericTaskTargetLabel(value) {
		const label = String(value || '').trim()
		if (!label) return true
		if (/^(这个|那个|当前|目标|该|本|此)$/.test(label)) return true
		if (/^(这个|那个|当前|目标|该|本|此)?(页面|网页|地址|链接|URL|url)$/.test(label)) return true
		return false
	}

	function isNavigationTargetReached(observation, key) {
		const targetKey = getNavigationKey(key)
		if (!targetKey) return true
		const title = getNavigationKey(observation?.title || '')
		if (titleMatchesNavigationTarget(title, targetKey)) return true
		return collectObservedNavigationStateItems(observation).some((item) => {
			if (!isSelectedOrActiveObservedItem(item)) return false
			const label = getNavigationKey(getObservedItemLabel(item))
			return getNavigationTargetAliases(targetKey).some((alias) => label === alias)
		})
	}

	function titleMatchesNavigationTarget(title, targetKey) {
		const titleKey = getNavigationKey(title)
		const target = getNavigationKey(targetKey)
		if (!titleKey || !target) return false
		if (titleKey.includes(target)) return true
		return getNavigationTargetAliases(target)
			.filter((alias) => alias && alias !== target)
			.some((alias) => titleKey === alias || titleKey.startsWith(`${alias}-`) || titleKey.startsWith(`${alias}_`) || titleKey.startsWith(`${alias}|`) || titleKey.startsWith(`${alias}｜`))
	}

	function collectObservedNavigationStateItems(observation) {
		return [
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.popups) ? observation.popups : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...collectTextNavigationItems(observation),
		]
	}

	function collectTextNavigationItems(observation) {
		const rows = [
			...toTextRows(observation?.simplifiedDom),
			...toTextRows(observation?.treeCandidates),
			...toTextRows(observation?.rawCandidates),
		]
		const items = []
		const seen = new Set()
		for (const row of rows) {
			const item = parseNavigationTextRow(row)
			if (!item) continue
			const key = `${item.index}:${getObservedItemLabel(item)}:${item.region || ''}:${item.role || ''}`
			if (seen.has(key)) continue
			seen.add(key)
			items.push(item)
		}
		return items
	}

	function toTextRows(value) {
		return (Array.isArray(value) ? value : [])
			.map((row) => String(row?.line || row || '').trim())
			.filter(Boolean)
	}

	function parseNavigationTextRow(row) {
		const line = String(row || '').trim()
		if (!line) return null
		const index = extractRowNumber(line, 'index')
		if (!Number.isFinite(index)) return null
		const tag = extractRowTag(line)
		const item = {
			index,
			label: extractRowLabel(line),
			role: cleanRowValue(extractRowAttr(line, 'role')) || inferRoleFromTag(tag),
			region: cleanRowValue(extractRowAttr(line, 'region')),
			selectionControl: cleanRowValue(extractRowAttr(line, 'control')),
			controlKind: cleanRowValue(extractRowAttr(line, 'kind')),
			actionIntent: cleanRowValue(extractRowAttr(line, 'intent')),
			valueState: cleanRowValue(extractRowAttr(line, 'value')),
			stateHints: cleanRowValue(extractRowAttr(line, 'state')),
			relationHints: cleanRowValue(extractRowAttr(line, 'rel')),
			navigationTarget: cleanRowValue(extractRowAttr(line, 'target')),
			expandedState: cleanRowValue(extractRowAttr(line, 'expanded')),
			rect: extractRowRect(line),
			source: 'text-row',
		}
		return getObservedItemLabel(item) ? item : null
	}

	function extractRowTag(line) {
		return String(line || '').match(/^<([A-Za-z][A-Za-z0-9_-]*)\b/)?.[1] || ''
	}

	function inferRoleFromTag(tag) {
		const name = getNavigationKey(tag)
		if (['button', 'menuitem', 'link', 'tab', 'option'].includes(name)) return name
		if (name === 'a') return 'link'
		return ''
	}

	function extractRowNumber(line, name) {
		const value = extractRowAttr(line, name)
		const number = Number(value)
		return Number.isFinite(number) ? number : NaN
	}

	function extractRowAttr(line, name) {
		const source = String(line || '')
		const quoted = source.match(new RegExp(`\\b${escapeRegExp(name)}="([^"]*)"`))
		if (quoted) return quoted[1]
		const bare = source.match(new RegExp(`\\b${escapeRegExp(name)}=([^\\s>]+)`))
		return bare?.[1] || ''
	}

	function extractRowLabel(line) {
		const explicit = cleanRowValue(extractRowAttr(line, 'label'))
		if (explicit) return explicit
		const text = String(line || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
		if (!text || /^action\s+index=|^field\s+index=|^option\s+index=|^popup\s+index=/i.test(text)) return ''
		return text
	}

	function extractRowRect(line) {
		const rect = String(line || '').match(/\brect=([-\d.]+),([-\d.]+),([-\d.]+)x([-\d.]+)/)
		if (!rect) return {}
		return {
			left: Number(rect[1]) || 0,
			top: Number(rect[2]) || 0,
			width: Number(rect[3]) || 0,
			height: Number(rect[4]) || 0,
		}
	}

	function cleanRowValue(value) {
		const text = String(value || '').trim()
		return text === '-' ? '' : text
	}

	function isSelectedOrActiveObservedItem(item) {
		const text = getNavigationKey([
			item?.valueState,
			item?.selected,
			item?.active,
			item?.checked,
			item?.className,
			item?.classes,
			item?.stateHints,
			item?.state,
		].filter((part) => part !== undefined && part !== null).join(' '))
		return /(selected|active|checked|current|true|已选中)/i.test(text)
	}

	function getObservedItemLabel(item) {
		return String(item?.label || item?.text || item?.placeholder || item?.target_label || '').trim()
	}

	function isNavigationClickHistory(item) {
		const action = String(item?.action || '').replace(/\..*$/, '')
		if (action !== 'click_element_by_index' && action !== 'click' && action !== 'locate_by_vision') return false
		const input = item?.input || {}
		if (
			String(input.workflow || '') === 'task-navigation' ||
			String(input.workflow_step || '') === 'navigate_to_task_target' ||
			!!String(input.workflow_nav_key || '').trim()
		) return true
		const text = getNavigationKey([
			input.target_label,
			input.label,
			input.text,
			item?.nextGoal,
			item?.evaluationPreviousGoal,
		].filter(Boolean).join(' '))
		return /(进入|打开|前往|切换到|定位到).*(目标)?(模块|页面|中心|管理|列表|报表|审批|设置|配置)/i.test(text)
	}

	function getNavigationKey(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
	}

	function addUnique(list, value) {
		if (!Array.isArray(list) || !value || list.includes(value)) return
		list.push(value)
	}

	function removeValue(list, value) {
		if (!Array.isArray(list) || !value) return
		const index = list.indexOf(value)
		if (index >= 0) list.splice(index, 1)
	}

	function isTerminalPhase(value) {
		return /^(complete|completed|done|finished|terminal|failed)$/i.test(String(value || '').trim())
	}

	function escapeAttr(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
	}

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	function resolveDecisionWorkflowName(decision) {
		const input = decision?.action?.input || {}
		const explicit = String(input.workflow || '').trim()
		if (explicit) return explicit
		const step = String(input.workflow_step || '').trim()
		if (step && WORKFLOW_BY_STEP[step]) return WORKFLOW_BY_STEP[step]
		if (String(input.workflow_nav_key || '').trim()) return 'task-navigation'
		return ''
	}

	function annotateWorkflowDecision(decision, workflowName) {
		if (!decision || typeof decision !== 'object') return decision
		const input = decision.action?.input
		if (!input || typeof input !== 'object') return decision
		const existing = String(input.workflow || '').trim()
		if (existing === workflowName) return decision
		if (!existing) {
			return {
				...decision,
				action: {
					...decision.action,
					input: {
						...input,
						workflow: workflowName,
					},
				},
			}
		}
		return {
			...decision,
			memory: `${decision.memory || ''}${decision.memory ? ' ' : ''}workflow=${workflowName}`,
		}
	}

	g.NC_BG_PLANNER_WORKFLOWS = {
		buildWorkflowContextText,
		derivePreModelWorkflowDecision,
		deriveTimeoutRecoveryWorkflowDecision,
		recordWorkflowOutcome,
		resolveDecisionWorkflowName,
	}
	g.NC_BG_PLANNER_WORKFLOWS_TESTS = {
		buildWorkflowContextText,
		derivePreModelWorkflowDecision,
		deriveSearchWorkflowDecisionIfAllowed,
		deriveTaskNavigationWorkflowDecision,
		deriveUnresolvedNavigationTimeoutDecision,
		deriveTimeoutRecoveryWorkflowDecision,
		extractTaskNavigationTargetKeys,
		findNavigationCandidateForKey,
		recordWorkflowOutcome,
		resolveDecisionWorkflowName,
		runWorkflowList,
		syncNavigationState,
		inferWorkflowNameFromOutcome,
	}
})(globalThis)
