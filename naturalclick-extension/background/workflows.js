;(function (g) {
	const fastPath = g.NC_BG_PLANNER_FASTPATH
	if (!fastPath) throw new Error('NC_BG_PLANNER_FASTPATH 未加载。')
	const loginWorkflow = g.NC_BG_LOGIN_WORKFLOW
	if (!loginWorkflow) throw new Error('NC_BG_LOGIN_WORKFLOW 未加载。')
	const searchWorkflow = g.NC_BG_SEARCH_WORKFLOW
	if (!searchWorkflow) throw new Error('NC_BG_SEARCH_WORKFLOW 未加载。')
	const taskIntent = g.NC_BG_TASK_INTENT || null

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
		clear_field: 'search-fields',
		skip_field: 'search-fields',
		finish_search_fields: 'search-fields',
		test_input_field: 'field-test',
		finish_field_test: 'field-test',
		navigate_to_task_target: 'task-navigation',
		reveal_navigation_options: 'task-navigation',
		view_first_record_detail: 'record-view',
		return_after_record_view: 'record-view',
		finish_record_view: 'record-view',
		fill_form_field_timeout_recovery: 'form-fill',
		fill_form_field_task_value: 'form-fill',
		open_form_dropdown_timeout_recovery: 'form-fill',
		choose_form_dropdown_timeout_recovery: 'form-fill',
		select_cascader_path_timeout_recovery: 'form-fill',
		select_visible_cascader_option_timeout_recovery: 'form-fill',
		open_external_value_lookup_source: 'form-fill',
		return_to_main_task_with_task_value: 'form-fill',
		submit_form_timeout_recovery: 'form-fill',
		resolve_duplicate_field_conflict: 'form-fill',
		resolve_field_validation_error: 'form-fill',
		open_create_form_timeout_recovery: 'create-task',
		information_query_alternate_source: 'information-query',
		information_query_unreadable_source: 'information-query',
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
			name: 'task-value-return',
			run: (session, observation, context) =>
				deriveTaskValueReturnToMainTabDecision(session, observation, context),
		},
		{
			name: 'task-navigation',
			run: (session, observation) =>
				deriveTaskNavigationWorkflowDecision(session, observation),
		},
		{
			name: 'record-view',
			run: (session, observation) =>
				deriveRecordViewWorkflowDecision(session, observation),
		},
		{
			name: 'search-fields',
			run: (session, observation, context) =>
				deriveSearchWorkflowDecisionIfAllowed(session, observation, context),
		},
		{
			name: 'field-test',
			run: (session, observation) =>
				deriveInputFieldTestWorkflowDecision(session, observation),
		},
		{
			name: 'form-fill',
			run: (session, observation) =>
				deriveFormFillPreModelDecision(session, observation),
		},
	]

	const PRE_INTENT_WORKFLOWS = [
		getPreModelWorkflowByName('target-url'),
		getPreModelWorkflowByName('login'),
		getPreModelWorkflowByName('search-fields'),
	].filter(Boolean)

	function getPreModelWorkflowByName(name) {
		return PRE_MODEL_WORKFLOWS.find((workflow) => workflow?.name === name) || null
	}

	const TIMEOUT_RECOVERY_WORKFLOWS = [
		{
			name: 'task-navigation',
			run: (session, observation) =>
				deriveUnresolvedNavigationTimeoutDecision(session, observation),
		},
		{
			name: 'search-fields',
			run: (session, observation, context) =>
				typeof searchWorkflow.deriveSearchTimeoutRecoveryDecision === 'function'
					? searchWorkflow.deriveSearchTimeoutRecoveryDecision(session, observation, context)
					: null,
		},
		{
			name: 'form-fill',
			run: (session, observation) =>
				deriveVisibleCascaderOptionTimeoutDecision(session, observation) ||
				deriveFailedCascaderPathRetryTimeoutDecision(session, observation) ||
				deriveFormAssignedFieldTimeoutDecision(session, observation) ||
				deriveFormCascaderTimeoutDecision(session, observation) ||
				deriveTaskValueExternalLookupDecision(session, observation) ||
				deriveTaskValueMemoryFieldDecision(session, observation) ||
				deriveFormSubmitTimeoutDecision(session, observation),
		},
		{
			name: 'create-task',
			run: (session, observation) =>
				deriveCreateEntryTimeoutDecision(session, observation),
		},
		{
			name: 'information-query',
			run: (session, observation, context) =>
				deriveInformationQueryRecoveryDecision(session, observation, context),
		},
	]

	function derivePreModelWorkflowDecision(session, observation, context) {
		return runWorkflowList(PRE_MODEL_WORKFLOWS, session, observation, { ...(context || {}), workflowPhase: 'pre_model' })
	}

	function derivePreIntentWorkflowDecision(session, observation, context) {
		return runWorkflowList(PRE_INTENT_WORKFLOWS, session, observation, { ...(context || {}), workflowPhase: 'pre_intent' })
	}

	function deriveTimeoutRecoveryWorkflowDecision(session, observation, context) {
		return runWorkflowList(TIMEOUT_RECOVERY_WORKFLOWS, session, observation, context)
	}

	function deriveObservationFailureWorkflowDecision(session, error) {
		if (typeof searchWorkflow.deriveSearchObservationFailureDecision !== 'function') return null
		const recovered = searchWorkflow.deriveSearchObservationFailureDecision(session, error)
		return recovered ? annotateWorkflowDecision(recovered, 'search-fields') : null
	}

	function derivePostModelWorkflowDecision(session, decision, context = {}) {
		const recordViewRecovery = deriveRecordViewPostModelDecision(session, decision, context)
		if (recordViewRecovery) return annotateWorkflowDecision(recordViewRecovery, 'record-view')
		if (typeof searchWorkflow.deriveSearchPostModelDecision !== 'function') return null
		const recovered = searchWorkflow.deriveSearchPostModelDecision(session, decision, context)
		return recovered ? annotateWorkflowDecision(recovered, 'search-fields') : null
	}

	function derivePostContextWorkflowDecision(session, workflowContextText, planningContext, context = {}) {
		const navigationRecovery = deriveNavigationPostContextDecision(session, context?.observation, planningContext)
		if (navigationRecovery) return annotateWorkflowDecision(navigationRecovery, 'task-navigation')
		const requiredSelectionRecovery = deriveRequiredSelectionPostContextDecision(session, context?.observation, planningContext)
		if (requiredSelectionRecovery) return annotateWorkflowDecision(requiredSelectionRecovery, 'form-fill')
		const informationRecovery = deriveInformationQueryPostContextDecision(session, workflowContextText, planningContext, context)
		if (informationRecovery) return annotateWorkflowDecision(informationRecovery, 'information-query')
		if (typeof searchWorkflow.deriveSearchPostContextDecision !== 'function') return null
		const recovered = searchWorkflow.deriveSearchPostContextDecision(session, workflowContextText, planningContext, context)
		return recovered ? annotateWorkflowDecision(recovered, 'search-fields') : null
	}

	function derivePostValidationWorkflowDecision(session, action, validationError, context = {}) {
		if (typeof searchWorkflow.deriveSearchPostValidationDecision !== 'function') return null
		const recovered = searchWorkflow.deriveSearchPostValidationDecision(session, action, validationError, context)
		return recovered ? annotateWorkflowDecision(recovered, 'search-fields') : null
	}

	function deriveFormFillPreModelDecision(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		const operation = taskIntent?.getOperation?.(session) || ''
		if (operation !== 'create' && !isCreateTask(taskText)) return null
		if (!hasRecordCreateFormOpen(observation)) return null
		const decision =
			deriveDuplicateFieldConflictDecision(session, observation) ||
			deriveInvalidFormFieldCorrectionDecision(session, observation) ||
			deriveVisibleCascaderOptionTimeoutDecision(session, observation) ||
			deriveFailedCascaderPathRetryTimeoutDecision(session, observation) ||
			deriveFormAssignedFieldTimeoutDecision(session, observation) ||
			deriveFormCascaderTimeoutDecision(session, observation) ||
			deriveTaskValueExternalLookupDecision(session, observation) ||
			deriveTaskValueMemoryFieldDecision(session, observation) ||
			deriveFormSubmitTimeoutDecision(session, observation)
		return decision ? adaptPreModelFormFillDecision(decision) : null
	}

	function adaptPreModelFormFillDecision(decision) {
		if (!decision || typeof decision !== 'object') return decision
		return {
			...decision,
			evaluation_previous_goal: String(decision.evaluation_previous_goal || '')
				.replace(/^模型规划超时，但/, '当前表单动作可由任务文本和页面字段唯一确定，')
				.replace(/^模型超时后，/, '无需等待模型，'),
			memory: String(decision.memory || '').replace(/^使用通用表单恢复策略/, '使用通用表单自动推进策略'),
			thought: String(decision.thought || '')
				.replace(/^模型超时后，/, '无需等待模型，')
				.replace(/且模型再次超时，/, '，'),
		}
	}

	function buildWorkflowContextText(session, observation) {
		const lines = []
		const state = syncNavigationState(session)
		const expectedKeys = getExpectedNavigationKeys(session, state)
		const searchContinuationReady = canContinueSearchWorkflowAfterPrerequisite(session, observation)
		const reachedByKey = new Map(expectedKeys.map((key) => [
			key,
			isNavigationTargetReachedForSession(session, observation, key, state),
		]))
		for (const key of expectedKeys) {
			const status = reachedByKey.get(key) ? 'reached' : (searchContinuationReady ? 'deferred' : 'unresolved')
			lines.push(`- task_target key="${escapeAttr(key)}" status="${status}"`)
		}
		if (expectedKeys.some((key) => !reachedByKey.get(key)) && !searchContinuationReady) {
			lines.push('- guidance: named task target is unresolved; do not test generic search/filter areas until the target module/page is reached.')
		} else if (expectedKeys.some((key) => !reachedByKey.get(key)) && searchContinuationReady) {
			lines.push('- guidance: a prior page prerequisite has returned to a list with an expanded search/filter area; continue the search-field workflow instead of repeating completed navigation.')
		}
		if (taskIntent?.buildTaskIntentHintLines) {
			for (const line of taskIntent.buildTaskIntentHintLines(session)) {
				if (String(line || '').trim()) lines.push(line)
			}
		}
		for (const line of buildRecordViewHintLines(session, observation, expectedKeys, state)) {
			if (String(line || '').trim()) lines.push(line)
		}
		const searchHints = typeof searchWorkflow.buildSearchWorkflowHintLines === 'function'
			? searchWorkflow.buildSearchWorkflowHintLines(session, observation)
			: []
		for (const line of searchHints) {
			if (String(line || '').trim()) lines.push(line)
		}
		for (const line of buildCreateTaskHintLines(session, observation, expectedKeys, state)) {
			if (String(line || '').trim()) lines.push(line)
		}
		for (const line of buildRequiredSelectionHintLines(session, observation)) {
			if (String(line || '').trim()) lines.push(line)
		}
		for (const line of buildTaskValueHintLines(session, observation, expectedKeys, state)) {
			if (String(line || '').trim()) lines.push(line)
		}
		for (const line of buildInformationQueryHintLines(session, observation)) {
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
		if (workflowName === 'record-view') {
			recordRecordViewWorkflowOutcome(session, routedDecision, outcome)
			return
		}
		if (workflowName !== 'search-fields') return
		if (typeof searchWorkflow.recordSearchWorkflowOutcome === 'function') {
			searchWorkflow.recordSearchWorkflowOutcome(session, routedDecision, outcome)
		}
	}

	function recordPlanningContextDeferral(session, decision, context = {}) {
		void context
		if (!session?.workflowState?.search) return
		if (typeof searchWorkflow.recordSearchWorkflowDeferral !== 'function') return
		if (!isSearchEvidencePlanningAction(decision?.action)) return
		searchWorkflow.recordSearchWorkflowDeferral(session, decision)
	}

	function isSearchEvidencePlanningAction(action) {
		const name = String(action?.name || '').trim()
		const input = action?.input || {}
		if (name === 'request_options_for') return Number.isFinite(Number(input.index))
		if (name !== 'request_context') return false
		return ['tables', 'network'].includes(String(input.source || input.target || '').trim())
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
			.filter((key) => !isNavigationTargetReachedForSession(session, observation, key, state))
		if (!unresolved.length) return null
		const revealDecision = buildNavigationRevealDecision(state, observation, unresolved, '模型规划超时', {
			allowExploratory: true,
		})
		if (revealDecision) return revealDecision
		const missingContextDecision = buildMissingNavigationContextDecision(session, observation, unresolved)
		if (missingContextDecision) return missingContextDecision
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

	function deriveCreateEntryTimeoutDecision(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		const operation = taskIntent?.getOperation?.(session) || ''
		if (operation !== 'create' && !isCreateTask(taskText)) return null
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReached(observation, key))
		if (unresolved.length) return null
		if (hasRecordCreateFormOpen(observation)) return null
		if (hasRecentExecutedFormSubmitClick(session)) {
			const submitBlocker = getVisibleFormCompletionBlockerText(observation)
			if (submitBlocker) {
				return {
					evaluation_previous_goal: `最近已执行过当前创建表单的提交动作，但页面仍有错误/校验反馈：${submitBlocker}`,
					memory: '提交后不能仅凭表单未出现就判定成功；若页面仍有错误反馈，应停止并报告未完成原因。',
					thought: '表单提交后的错误反馈优先级高于 DOM 消失/变化，继续宣称成功会误导用户。',
					next_goal: '停止创建任务并报告提交失败',
					action: {
						name: 'done',
						input: {
							success: false,
							text: `表单提交未成功确认：${submitBlocker}`,
							workflow: 'create-task',
							workflow_step: 'finish_create_after_submit_no_form',
						},
					},
				}
			}
			return {
				evaluation_previous_goal: '最近已执行过当前创建表单的提交动作，且当前观察中已没有新增表单。',
				memory: '提交后表单消失时，不再自动重新点击新增入口，避免重复创建同一条数据。',
				thought: '表单提交后已经回到列表/模块页，停止自动创建第二条记录。',
				next_goal: '结束创建任务',
				action: {
					name: 'done',
					input: {
						success: true,
						text: '表单已提交且当前未再观察到新增表单，已停止以避免重复创建。',
						workflow: 'create-task',
						workflow_step: 'finish_create_after_submit_no_form',
					},
				},
			}
		}
		const entityHints = extractCreateEntityHints(taskText)
		const candidates = uniqueCreateEntryCandidates(collectCreateEntryItems(observation)
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => isCreateEntryCandidateItem(item))
			.filter((item) => isStrongCreateEntryCandidateItem(item)), entityHints)
			.filter((item) => !hasRecentCreateEntryAttempt(session, item))
		const candidate = candidates[0]
		if (!candidate) return buildCreateEntryVisionFallbackDecision(session)
		const label = getObservedItemLabel(candidate) || '新增'
		return {
			evaluation_previous_goal: '模型规划超时，但任务已到达目标模块且当前页面仍未观察到新增表单，页面存在明确的创建入口。',
			memory: `使用通用创建任务恢复策略，只点击一次明确的 "${label}" 入口；若点击后仍无表单，将交给校验/下一轮处理。`,
			thought: '目标模块已经到达，当前还没有目标表单，先重试页面上最明确的新增入口。',
			next_goal: `打开新增表单：${label}`,
			action: {
				name: 'click_element_by_index',
				input: {
					index: Number(candidate.index),
					target_label: label,
					target_region: String(candidate.region || ''),
					workflow_step: 'open_create_form_timeout_recovery',
					workflow_create_label: label,
					workflow_create_rect: formatCandidateRect(candidate?.rect),
				},
			},
		}
	}

	function buildCreateEntryVisionFallbackDecision(session) {
		if (!hasRecentCreateEntryFailure(session)) return null
		if (hasRecentCreateEntryVisionAttempt(session)) return null
		return {
			evaluation_previous_goal: '近期点击创建入口后未观察到新增表单，且当前没有未尝试过的强可信 DOM 创建入口。',
			memory: '改用受限视觉定位，只查找当前页面主体列表工具栏中的新增/新建/创建/添加按钮，排除表格行、导入开关、筛选项和侧边栏菜单。',
			thought: 'DOM 候选已经出现过无效点击，需要用视觉约束重新定位真实的工具栏新增按钮。',
			next_goal: '重新定位真实新增按钮',
			action: {
				name: 'locate_by_vision',
				input: {
					target_description: '当前页面主体列表工具栏中的新增、新建、创建或添加按钮；优先蓝色工具栏按钮，排除表格行标题、导入开关、筛选项、侧边栏菜单和浏览器/扩展界面',
					action_name: 'click_element_by_index',
					workflow_step: 'open_create_form_timeout_recovery',
					workflow_create_label: '新增/新建/创建/添加',
				},
			},
		}
	}

	function deriveDuplicateFieldConflictDecision(session, observation) {
		const conflict = getRecentDuplicateFormSubmitFailure(session)
		if (!conflict) return null
		const field = findDuplicateConflictField(observation, conflict.text)
		if (!field) return null
		const index = Number(field.index)
		if (!Number.isFinite(index)) return null
		const label = normalizeFormFieldLabel(getObservedItemLabel(field)) || '该字段'
		const currentValue = extractObservedFieldValue(field)
		if (
			hasRecentDuplicateConflictReplacementForField(session, label, index) &&
			isAmbiguousDuplicateConstraintText(conflict.text, label, currentValue)
		) {
			return null
		}
		const answered = getRecentDuplicateConflictAnswer(session, label, index, currentValue)
		if (answered.cancelled) {
			return {
				evaluation_previous_goal: `表单提交提示字段 "${label}" 的值冲突，用户选择不修改。`,
				memory: '已停止重复提交，避免继续制造重复记录或覆盖用户明确指定的数据。',
				thought: '唯一性冲突需要用户确认新值，用户未提供可替换值。',
				next_goal: '停止重复提交',
				action: {
					name: 'done',
					input: {
						success: false,
						text: `表单提交失败：字段「${label}」当前值「${currentValue || '空'}」重复/已存在，且没有新的替代值。`,
					},
				},
			}
		}
		if (answered.value && answered.value !== currentValue) {
			const decision = buildTextFormFieldRecoveryDecision(index, label, answered.value)
			decision.evaluation_previous_goal = `表单提交提示字段 "${label}" 的值冲突，用户已提供新的替代值。`
			decision.memory = `使用用户确认的新值改写字段 "${label}"，避免重复提交原值。`
			decision.thought = '重复/已存在属于唯一性冲突，先改写冲突字段再重新提交。'
			decision.next_goal = `改写${label}`
			decision.action.input.workflow_step = 'resolve_duplicate_field_conflict'
			decision.action.input.workflow_old_value = currentValue
			decision.action.input.workflow_conflict_reason = shortWorkflowText(conflict.text, 120)
			return decision
		}
		if (hasRecentDuplicateConflictAsk(session, label, index, currentValue)) return null
		return {
			evaluation_previous_goal: `表单提交提示字段 "${label}" 的值重复/已存在，继续提交同一值不会推进任务。`,
			memory: '遇到唯一性冲突时不自动篡改用户明确指定的字段值；先询问用户新值，避免静默创建错误数据。',
			thought: '当前报错是重复值冲突，需要用户确认是否换一个值。',
			next_goal: `询问${label}的新值`,
			action: {
				name: 'ask_user',
				input: {
					question: `字段「${label}」当前值「${currentValue || '空'}」提交后提示重复/已存在。请提供一个新的值；如果不想修改，请回复“取消”。`,
					reason: `字段「${label}」的当前值提交后触发重复/已存在提示，继续提交原值不会推进任务。`,
					placeholder: suggestDuplicateReplacementValue(currentValue),
					timeout_ms: 120000,
					workflow_step: 'resolve_duplicate_field_conflict',
					workflow_field_label: label,
					workflow_field_index: index,
					workflow_old_value: currentValue,
				},
			},
		}
	}

	function deriveInvalidFormFieldCorrectionDecision(session, observation) {
		const fields = collectObservedFormControlItems(observation)
			.filter(isPageFormField)
			.filter((field) => Number.isFinite(Number(field.index)))
		const requiredSelection = collectRequiredSelectionValidationTargets(session, observation)
		for (const match of requiredSelection) {
			const answered = buildRequiredSelectionAnswerDecision(session, observation, match)
			if (answered) return answered
			const visibleOption = chooseSingleVisibleRequiredOption(session, observation, match.field)
			if (visibleOption) return buildValidationChooseDropdownDecision(match.index, match.label, visibleOption, match.errorText)
			const nativeOption = isCascaderFormField(match.field) ? '' : chooseSingleNativeRequiredOption(match.field)
			const recentAttempt = hasRecentRequiredSelectionValidationAttempt(session, match.index, match.errorText)
			if (nativeOption && !recentAttempt) {
				return buildValidationChooseDropdownDecision(match.index, match.label, nativeOption, match.errorText)
			}
			if (!recentAttempt) return buildValidationOpenDropdownDecision(match.index, match.label, match.errorText)
			if (shouldDeferRequiredSelectionToContext(session, observation, match)) continue
			const userInputDecision = buildRequiredSelectionUserInputDecision(session, observation, match)
			if (userInputDecision) return userInputDecision
		}
		const candidates = fields
			.filter((field) => isPlainTextFormField(field))
			.map((field) => {
				const errorText = getFieldValidationErrorText(field)
				const currentValue = extractObservedFieldValue(field)
				const correctedValue = deriveValidationCorrectedValue(currentValue, errorText)
				return {
					field,
					errorText,
					currentValue,
					correctedValue,
				}
			})
			.filter((item) => item.errorText && item.currentValue && item.correctedValue && item.correctedValue !== item.currentValue)
			.filter((item) => !hasRecentValidationCorrectionAttempt(session, Number(item.field.index), item.currentValue, item.correctedValue))
			.sort((a, b) => getFormFieldOrderScore(a.field) - getFormFieldOrderScore(b.field))
		const match = candidates[0]
		if (!match) return null
		const index = Number(match.field.index)
		const label = normalizeFormFieldLabel(getObservedItemLabel(match.field)) || '该字段'
		return {
			evaluation_previous_goal: `当前表单字段 "${label}" 存在页面校验错误：${match.errorText}`,
			memory: `使用通用表单校验恢复策略，根据页面错误提示修正字段 "${label}"。`,
			thought: '页面已经给出字段级校验错误，先修正当前字段值再重新提交。',
			next_goal: `修正${label}`,
			action: {
				name: 'input_text',
				input: {
					index,
					text: match.correctedValue,
					target_label: label,
					workflow_step: 'resolve_field_validation_error',
					workflow_field_label: label,
					workflow_old_value: match.currentValue,
					workflow_validation_error: shortWorkflowText(match.errorText, 120),
					workflow_value_source: 'page_validation',
					workflow_value_basis: shortWorkflowText(match.errorText, 120),
				},
			},
		}
	}

	function collectRequiredSelectionValidationTargets(session, observation) {
		const recentSubmitValidationText = getRecentFormSubmitFailureValidationText(session)
		return collectObservedFormControlItems(observation)
			.filter(isPageFormField)
			.filter((field) => Number.isFinite(Number(field.index)))
			.filter((field) => isRequiredSelectionControlField(field))
			.map((field) => {
				const errorText = getFieldValidationErrorText(field)
				return {
					field,
					errorText,
					index: Number(field.index),
					label: normalizeFormFieldLabel(getObservedItemLabel(field)) || '该字段',
				}
			})
			.filter((item) => isRequiredSelectionValidationTarget(item.field, item.errorText, recentSubmitValidationText))
			.sort((a, b) => getFormFieldOrderScore(a.field) - getFormFieldOrderScore(b.field))
	}

	function buildRequiredSelectionHintLines(session, observation) {
		if (!isCreateOrFormFillTask(session)) return []
		if (!hasRecordCreateFormOpen(observation)) return []
		const lines = []
		for (const match of collectRequiredSelectionValidationTargets(session, observation)) {
			const recentAttempt = hasRecentRequiredSelectionValidationAttempt(session, match.index, match.errorText)
			if (!recentAttempt) continue
			const visibleLabels = collectVisibleRequiredSelectionOptionLabels(session, observation, match.field)
			const nativeLabels = isCascaderFormField(match.field) ? [] : collectNativeRequiredOptionLabels(match.field)
			if (visibleLabels.length || nativeLabels.length) continue
			if (hasRecentRequiredSelectionAsk(session, match.index, match.errorText)) continue
			lines.push(
				`- form_required_selection_requirement status="candidates_unobserved" field="${escapeAttr(match.label)}" activeIndex="${match.index}" error="${escapeAttr(shortWorkflowText(match.errorText || 'required selection empty', 120))}" guidance="required selection was opened but no stable field-owned candidates were observed; request_options_for this index before repeating dropdown clicks or guessing."`
			)
		}
		return lines
	}

	function isCreateOrFormFillTask(session) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		const operation = taskIntent?.getOperation?.(session) || ''
		if (['create', 'edit', 'fill'].includes(operation)) return true
		if (isCreateTask(taskText)) return true
		return /(填写|录入|编辑|修改|补充|保存|提交).*(表单|字段|信息|记录|资料)?/i.test(taskText)
	}

	function shouldDeferRequiredSelectionToContext(session, observation, match) {
		if (!match) return false
		if (!hasRecentRequiredSelectionValidationAttempt(session, match.index, match.errorText)) return false
		if (hasRecentRequiredSelectionAsk(session, match.index, match.errorText)) return false
		if (collectVisibleRequiredSelectionOptionLabels(session, observation, match.field).length) return false
		if (!isCascaderFormField(match.field) && collectNativeRequiredOptionLabels(match.field).length) return false
		return true
	}

	function hasUnresolvedRequiredSelectionValidation(session, observation) {
		return collectRequiredSelectionValidationTargets(session, observation).some((match) =>
			shouldDeferRequiredSelectionToContext(session, observation, match) ||
			(!chooseSingleVisibleRequiredOption(session, observation, match.field) &&
				(isCascaderFormField(match.field) || !chooseSingleNativeRequiredOption(match.field)))
		)
	}

	function deriveRequiredSelectionPostContextDecision(session, observation, planningContext) {
		if (!isCreateOrFormFillTask(session)) return null
		if (!hasRecordCreateFormOpen(observation)) return null
		for (const match of collectRequiredSelectionValidationTargets(session, observation)) {
			if (!hasRecentRequiredSelectionValidationAttempt(session, match.index, match.errorText)) continue
			const contextOptions = collectRequiredSelectionContextOptions(planningContext, match)
			if (!contextOptions.requested) continue
			const labels = contextOptions.labels
			if (labels.length === 1) {
				const decision = buildValidationChooseDropdownDecision(match.index, match.label, labels[0], match.errorText)
				decision.evaluation_previous_goal = `必填选择字段 "${match.label}" 展开后未稳定暴露候选，内部上下文补采集到唯一安全候选 "${labels[0]}"。`
				decision.memory = `使用 request_options_for 补充的字段候选选择 "${match.label}"，避免重复展开同一下拉。`
				decision.thought = '候选来自目标字段上下文，且过滤占位/诊断项后唯一，可以受限自动选择。'
				decision.action.input.workflow_value_source = 'context_options'
				decision.action.input.workflow_value_basis = 'request_options_for 字段候选上下文'
				decision.action.input.workflow_context_recovered = true
				return decision
			}
			const userInputDecision = buildRequiredSelectionUserInputDecision(session, observation, match, labels)
			if (userInputDecision) {
				userInputDecision.evaluation_previous_goal = labels.length
					? `必填选择字段 "${match.label}" 补采集到多个候选，任务没有指定取值。`
					: `必填选择字段 "${match.label}" 展开和补采集后仍没有稳定候选。`
				userInputDecision.memory = labels.length
					? `request_options_for 已拿到字段候选，但存在多个可选值，必须由用户确认。`
					: `request_options_for 也没有拿到稳定候选，停止猜测并询问用户。`
				userInputDecision.action.input.workflow_context_recovered = true
				userInputDecision.action.input.workflow_value_basis = labels.length
					? 'request_options_for 返回多个字段候选'
					: 'request_options_for 未返回稳定字段候选'
				return userInputDecision
			}
		}
		return null
	}

	function collectRequiredSelectionContextOptions(planningContext, match) {
		const context = findLatestRequiredSelectionOptionsContext(planningContext, match)
		if (!context) return { requested: false, labels: [] }
		return {
			requested: true,
			labels: extractRequiredSelectionContextLabels(String(context.text || ''), match.field),
		}
	}

	function findLatestRequiredSelectionOptionsContext(planningContext, match) {
		const contexts = Array.isArray(planningContext) ? planningContext : []
		const targetIndex = Number(match?.index)
		if (!Number.isFinite(targetIndex)) return null
		for (let index = contexts.length - 1; index >= 0; index -= 1) {
			const context = contexts[index]
			if (String(context?.name || '').trim() !== 'request_options_for') continue
			const inputIndex = Number(context?.input?.index ?? extractContextAttr(context?.text || '', 'index'))
			if (Number.isFinite(inputIndex) && inputIndex !== targetIndex) continue
			const text = String(context?.text || '')
			if (text && !new RegExp(`<options_for\\b[^>]*index="${targetIndex}"`).test(text) && Number.isFinite(inputIndex) && inputIndex !== targetIndex) continue
			return context
		}
		return null
	}

	function extractRequiredSelectionContextLabels(text, field) {
		const labels = []
		const addLabel = (value) => {
			const label = decodeContextText(cleanAssignmentValue(value))
			if (isSafeRequiredSelectionOptionLabel(label, field) && !labels.includes(label)) labels.push(label)
		}
		for (const section of extractContextSections(text, 'native_options')) {
			for (const label of extractOptionLabelsFromContextBody(section.body)) addLabel(label)
		}
		for (const section of [
			...extractContextSections(text, 'visible_options'),
			...extractContextSections(text, 'visible_popups'),
		]) {
			if (!isUsableRequiredSelectionContextScope(section.attrs)) continue
			for (const label of extractOptionLabelsFromContextBody(section.body)) addLabel(label)
		}
		for (const section of extractContextSections(text, 'target_matches')) {
			for (const rawLine of String(section.body || '').split(/\n+/)) {
				const options = extractContextAttr(rawLine, 'options')
				if (!options) continue
				for (const label of options.split('|')) addLabel(label)
			}
		}
		return labels
	}

	function extractContextSections(text, tagName) {
		const sections = []
		const tag = escapeRegExp(tagName)
		const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi')
		for (const match of String(text || '').matchAll(pattern)) {
			sections.push({
				attrs: String(match[1] || ''),
				body: String(match[2] || ''),
			})
		}
		return sections
	}

	function extractOptionLabelsFromContextBody(body) {
		const labels = []
		for (const rawLine of String(body || '').split(/\n+/)) {
			const line = rawLine.trim()
			if (!line) continue
			const attrLabel = extractContextAttr(line, 'label')
			if (attrLabel) {
				labels.push(attrLabel)
				continue
			}
			const optionMatch = line.match(/^(?:[-*]\s*)?(?:option|candidate|item)\s*(?:index=\d+|\d+)?\s*:?\s*(.+)$/i)
			if (optionMatch?.[1]) labels.push(optionMatch[1])
		}
		return labels
	}

	function isUsableRequiredSelectionContextScope(attrs) {
		const text = getNavigationKey([
			extractContextAttr(attrs, 'scoped'),
			extractContextAttr(attrs, 'scope'),
			attrs,
		].filter(Boolean).join(' '))
		if (/(diagnostic|globalfallback|globalpopup|globalselectable|unscoped|external)/.test(text)) return false
		if (!text) return true
		return /(explicit|field|active|owned|target|native|controlled|aria|geometry|popup)/.test(text)
	}

	function decodeContextText(value) {
		return String(value || '')
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
	}

	function isRequiredSelectionControlField(field) {
		return isDropdownFormField(field) || isCascaderFormField(field)
	}

	function isRequiredSelectionValidationTarget(field, errorText, submitErrorText = '') {
		if (!field || !isEmptyFormField(field)) return false
		const required = field.required === true || String(field.required || '').toLowerCase() === 'true'
		const invalid = field.invalid === true || String(field.invalid || '').toLowerCase() === 'true'
		const error = String(errorText || '').trim()
		const submitError = String(submitErrorText || '').trim()
		const label = normalizeFormFieldLabel(getObservedItemLabel(field))
		const labelKey = getNavigationKey(label)
		const submitKey = getNavigationKey(submitError)
		const submitMentionsField = !!labelKey && !!submitKey && submitKey.includes(labelKey)
		const requiredTextPattern = /(必填|不能为空|请选择|选择|未选择|required|please\s+select|must\s+select)/i
		const submitHasRequiredSignal = requiredTextPattern.test(submitError)
		if (!invalid && !error && !(submitMentionsField && submitHasRequiredSignal)) return false
		if (invalid) return true
		if (required && (error || (submitMentionsField && submitHasRequiredSignal))) return true
		return requiredTextPattern.test([error, submitError].filter(Boolean).join(' '))
	}

	function chooseSingleNativeRequiredOption(field) {
		const unique = collectNativeRequiredOptionLabels(field)
		return unique.length === 1 ? unique[0] : ''
	}

	function collectNativeRequiredOptionLabels(field) {
		const labels = (Array.isArray(field?.optionLabels) ? field.optionLabels : [])
			.map((item) => cleanAssignmentValue(item))
			.filter(Boolean)
			.filter((item) => isSafeRequiredSelectionOptionLabel(item, field))
		return [...new Set(labels)]
	}

	function isSafeRequiredSelectionOptionLabel(label, field) {
		const text = cleanAssignmentValue(label)
		if (!text) return false
		const key = getNavigationKey(text)
		const fieldLabel = getNavigationKey(getObservedItemLabel(field))
		if (!key || key === fieldLabel) return false
		if (/^(请选择|请选择一项|选择|全部|任意|不限|空|无|none|null|empty|select|pleasechoose|pleaseselect|choose)$/i.test(key)) return false
		if (/请选择|please\s+select|choose\s+one/i.test(text)) return false
		return true
	}

	function buildValidationOpenDropdownDecision(index, label, errorText) {
		return {
			evaluation_previous_goal: `当前必填选择字段 "${label}" 仍未选择：${errorText || '页面提示需要选择'}`,
			memory: `使用通用表单校验恢复策略，先展开必填选择字段 "${label}" 获取真实候选。`,
			thought: '提交后页面给出字段级必填/选择校验；必须先读取真实候选，避免臆造选项。',
			next_goal: `展开${label}`,
			action: {
				name: 'open_dropdown',
				input: {
					index,
					target_label: label,
					workflow_step: 'resolve_field_validation_error',
					workflow_field_label: label,
					workflow_validation_error: shortWorkflowText(errorText || 'required selection empty', 120),
					workflow_value_source: 'page_validation',
					workflow_value_basis: '必填选择字段为空，需展开真实候选',
				},
			},
		}
	}

	function buildValidationChooseDropdownDecision(index, label, value, errorText) {
		return {
			evaluation_previous_goal: `当前必填选择字段 "${label}" 仍未选择，且字段自身只暴露一个安全候选 "${value}"。`,
			memory: `使用通用表单校验恢复策略，选择字段 "${label}" 的唯一真实候选。`,
			thought: '候选来自字段自身 optionLabels，且过滤占位项后唯一，可受限自动选择。',
			next_goal: `选择${label}`,
			action: {
				name: 'choose_dropdown_option',
				input: {
					index,
					text: value,
					target_label: label,
					workflow_step: 'resolve_field_validation_error',
					workflow_field_label: label,
					workflow_validation_error: shortWorkflowText(errorText || 'required selection empty', 120),
					workflow_value_source: 'page_validation',
					workflow_value_basis: '字段自身唯一安全候选',
				},
			},
		}
	}

	function buildRequiredSelectionAnswerDecision(session, observation, match) {
		const answer = getRecentRequiredSelectionAnswer(session, match.label, match.index, match.errorText)
		if (!answer.value && !answer.cancelled) return null
		if (answer.cancelled) {
			return {
				evaluation_previous_goal: `字段 "${match.label}" 是必填选择项，但用户取消了继续补充。`,
				memory: '必填选择项缺少明确取值，且用户取消补充；停止提交，避免创建错误记录。',
				thought: '必填选择字段不能靠猜测补齐，用户取消后应明确失败。',
				next_goal: '停止表单提交',
				action: {
					name: 'done',
					input: {
						success: false,
						text: `表单提交失败：字段「${match.label}」是必填选择项，页面提示「${match.errorText || '需要选择'}」，但缺少可用取值。`,
					},
				},
			}
		}
		const visible = chooseVisibleRequiredOptionForValue(session, observation, match.field, answer.value)
		if (visible) {
			const decision = buildValidationChooseDropdownDecision(match.index, match.label, visible, match.errorText)
			decision.evaluation_previous_goal = `用户已为必填选择字段 "${match.label}" 提供取值 "${answer.value}"，且该候选当前可见。`
			decision.memory = `使用用户补充的值选择字段 "${match.label}"。`
			decision.action.input.workflow_value_source = 'user_input'
			decision.action.input.workflow_value_basis = '用户提供的必填选择值'
			decision.action.input.workflow_requested_text = answer.value
			return decision
		}
		if (!hasRecentRequiredSelectionAnswerOpenAttempt(session, match.index, answer.value)) {
			const decision = buildValidationOpenDropdownDecision(match.index, match.label, match.errorText)
			decision.evaluation_previous_goal = `用户已为必填选择字段 "${match.label}" 提供取值 "${answer.value}"，但当前还没有看到匹配候选。`
			decision.memory = `先重新展开字段 "${match.label}"，用用户提供的取值匹配真实候选。`
			decision.action.input.workflow_value_source = 'user_input'
			decision.action.input.workflow_value_basis = '用户提供的必填选择值'
			decision.action.input.workflow_requested_text = answer.value
			return decision
		}
		return {
			evaluation_previous_goal: `用户为字段 "${match.label}" 提供了取值 "${answer.value}"，但页面候选中仍未看到可匹配项。`,
			memory: '已避免继续猜测不可见选项；需要用户换一个页面真实存在的候选值，或手动处理后继续。',
			thought: '用户给定值和当前候选不匹配，继续选择会被执行前校验拦截。',
			next_goal: `询问${match.label}的可用候选`,
			action: {
				name: 'ask_user',
				input: {
					question: `字段「${match.label}」需要选择，但我没有在当前候选中找到「${answer.value}」。请回复页面真实存在的候选值；如果不继续请回复“取消”。`,
					reason: `字段「${match.label}」是必填选择项，用户给定值「${answer.value}」未匹配当前可见候选。`,
					placeholder: answer.value,
					timeout_ms: 120000,
					workflow_step: 'resolve_field_validation_error',
					workflow_field_label: match.label,
					workflow_field_index: match.index,
					workflow_validation_error: shortWorkflowText(match.errorText || 'required selection empty', 120),
					workflow_value_source: 'user_input_required',
					workflow_requested_text: answer.value,
				},
			},
		}
	}

	function chooseSingleVisibleRequiredOption(session, observation, field) {
		const labels = collectVisibleRequiredSelectionOptionLabels(session, observation, field)
		const unique = [...new Set(labels)]
		return unique.length === 1 ? unique[0] : ''
	}

	function chooseVisibleRequiredOptionForValue(session, observation, field, value) {
		const requested = cleanAssignmentValue(value)
		if (!requested) return ''
		const matches = collectVisibleRequiredSelectionOptionLabels(session, observation, field)
			.filter((label) => labelsMatchAssignedValue(label, requested))
		const unique = [...new Set(matches)]
		return unique.length === 1 ? unique[0] : ''
	}

	function collectVisibleRequiredSelectionOptionLabels(session, observation, field) {
		const fieldIndex = Number(field?.index)
		if (!Number.isFinite(fieldIndex)) return []
		const strong = []
		const active = []
		for (const item of collectVisibleSelectionOptionItems(observation)) {
			if (Number(item?.index) === fieldIndex) continue
			const label = cleanAssignmentValue(getObservedItemLabel(item))
			if (!isSafeRequiredSelectionOptionLabel(label, field)) continue
			const scope = getRequiredSelectionOptionScope(item, field)
			if (scope === 'strong') strong.push(label)
			else if (scope === 'active') active.push(label)
		}
		const source = strong.length ? strong : active
		return [...new Set(source)]
	}

	function getRequiredSelectionOptionScope(item, field) {
		if (item?.ambiguous === true || item?.owner === 'ambiguous') return ''
		const diagnosticText = getNavigationKey([
			item?.scoped,
			item?.scope,
			item?.ownerEvidence,
			item?.source,
			item?.relationHints,
			item?.popupHints,
		].filter(Boolean).join(' '))
		if (/(diagnostic|globalfallback|globalpopup|globalselectable|unscoped|fieldexternal|externalcandidate)/.test(diagnosticText)) return ''
		const fieldIndex = Number(field?.index)
		const ownerIndex = Number(item?.ownerIndex ?? item?.owner_index ?? item?.fieldIndex ?? item?.targetIndex)
		if (Number.isFinite(ownerIndex) && ownerIndex === fieldIndex) return 'strong'
		const fieldLabel = getNavigationKey(getObservedItemLabel(field))
		const ownerLabel = getNavigationKey(item?.ownerLabel || item?.fieldLabel || item?.targetLabel || item?.owner || '')
		if (fieldLabel && ownerLabel && (ownerLabel === fieldLabel || ownerLabel.includes(fieldLabel) || fieldLabel.includes(ownerLabel))) return 'strong'
		if (/(fieldscoped|explicit|geometry|controlled|popuplabelledby|aria)/.test(diagnosticText)) return 'strong'
		if (!isObservedSelectionFieldOpen(field)) return ''
		const region = getNavigationKey(item?.region)
		const role = getNavigationKey(item?.role)
		const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control || item?.kind || item?.fieldType)
		if (region === 'popover' && (/^(option|menuitem|treeitem)$/.test(role) || /(option|select|dropdown|cascader|checkbox|radio)/.test(control))) return 'active'
		return ''
	}

	function isObservedSelectionFieldOpen(field) {
		const text = getNavigationKey([
			field?.expandedState,
			field?.stateHints,
			field?.popupHints,
			field?.relationHints,
			field?.ariaExpanded,
			field?.expanded,
		].filter((part) => part !== undefined && part !== null).join(' '))
		return /(expanded|open|opened|visible|active|true|展开|打开)/i.test(text)
	}

	function buildRequiredSelectionUserInputDecision(session, observation, match, contextLabels = []) {
		if (hasRecentRequiredSelectionAsk(session, match.index, match.errorText)) return null
		const supplied = Array.isArray(contextLabels) ? contextLabels : []
		const labels = supplied.length
			? [...new Set(supplied.map((item) => cleanAssignmentValue(item)).filter(Boolean))]
			: [
				...collectVisibleRequiredSelectionOptionLabels(session, observation, match.field),
				...(isCascaderFormField(match.field) ? [] : collectNativeRequiredOptionLabels(match.field)),
			].filter((label, index, list) => label && list.indexOf(label) === index)
		const preview = labels.slice(0, 8).join('、')
		const hasOptions = labels.length > 0
		return {
			evaluation_previous_goal: `字段 "${match.label}" 是必填选择项，自动恢复后仍缺少唯一安全取值。`,
			memory: hasOptions
				? `字段 "${match.label}" 有多个可见候选或字段候选，必须由用户确认取值，避免选择错误权限、分类或状态。`
				: `字段 "${match.label}" 展开后仍没有稳定可见候选，必须由用户补充取值或手动处理。`,
			thought: '必填选择字段没有任务指定值，不能随意猜一个候选当作完成。',
			next_goal: `询问${match.label}的取值`,
			action: {
				name: 'ask_user',
				input: {
					question: hasOptions
						? `字段「${match.label}」是必填选择项，页面提示「${match.errorText || '请选择'}」。我看到候选：${preview}${labels.length > 8 ? ' 等' : ''}。请回复要选择的值；如果不继续请回复“取消”。`
						: `字段「${match.label}」是必填选择项，页面提示「${match.errorText || '请选择'}」，但我没有读取到稳定候选。请告诉我应选择哪个值；如果不继续请回复“取消”。`,
					reason: hasOptions
						? `字段「${match.label}」存在多个可见候选或字段候选，任务没有指定取值，自动选择可能造成错误数据。`
						: `字段「${match.label}」必填但候选不可见或无法稳定归属，继续猜测会导致提交失败或错误数据。`,
					placeholder: hasOptions ? labels[0] : '请输入页面真实存在的候选值',
					timeout_ms: 120000,
					workflow_step: 'resolve_field_validation_error',
					workflow_field_label: match.label,
					workflow_field_index: match.index,
					workflow_validation_error: shortWorkflowText(match.errorText || 'required selection empty', 120),
					workflow_value_source: 'user_input_required',
					workflow_visible_options: labels.join('|'),
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
			if (!isPageFormField(field)) continue
			if (!isCascaderFormField(field)) continue
			const index = Number(field.index)
			if (!Number.isFinite(index)) continue
			const label = normalizeFormFieldLabel(getObservedItemLabel(field))
			if (!label) continue
			const segment = extractTaskAssignmentSegment(taskText, label, labels)
			const path = parseCascaderPathSegment(segment)
			if (path.length < 1) continue
			if (!shouldRecoverAssignedCascaderField(session, field, path)) continue
			if (hasRecentCascaderPathAttempt(session, index, path)) continue
			matches.push({ field, index, label, path, updatingExisting: !isEmptyFormField(field) })
		}
		if (matches.length !== 1) return null
		const match = matches[0]
		return {
			evaluation_previous_goal: match.updatingExisting
				? `模型规划超时，但当前表单字段 "${match.label}" 的现有值与任务中的目标路径不一致。`
				: '模型规划超时，但当前表单中有一个与任务文字明确匹配的空级联字段。',
			memory: `使用通用表单恢复策略，仅根据字段标签 "${match.label}" 与任务中的层级值继续一次级联选择。`,
			thought: '模型超时后，任务文本和当前表单字段能唯一确定下一步级联路径，先执行受限恢复动作。',
			next_goal: `选择${match.label}`,
			action: {
				name: 'select_cascader_path',
				input: {
					index: match.index,
					path: match.path,
					target_label: match.label,
					workflow_step: 'select_cascader_path_timeout_recovery',
					workflow_field_label: match.label,
					workflow_value_source: 'task_value',
					workflow_value_basis: '字段标签与任务文本匹配',
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
		const leaf = cleanCascaderPathPart(getLastCascaderPathPart(failed?.input?.path))
		if (leaf && getNavigationKey(requested) !== getNavigationKey(leaf)) return null
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
					workflow_value_source: 'visible_option',
					workflow_value_basis: `可见级联候选与请求值匹配：${shortWorkflowText(requested, 80)}`,
				},
			},
		}
	}

	function deriveFailedCascaderPathRetryTimeoutDecision(session, observation) {
		const failed = getRecentFailedCascaderPathForRetry(session, observation)
		if (!failed) return null
		return {
			evaluation_previous_goal: `上一次级联路径选择未完成，且同一字段 "${failed.label}" 后续已经重新展开过，可受限重试一次完整路径。`,
			memory: `使用通用级联恢复策略，复用历史中已声明的字段 index 与完整 path，不改写为普通下拉或候选点击。`,
			thought: '历史里已经有完整级联 path，页面也显示同一字段仍未达到目标值；模型超时后直接重试一次字段限定的级联路径。',
			next_goal: `重新选择${failed.label}`,
			action: {
				name: 'select_cascader_path',
				input: {
					index: failed.index,
					path: failed.path,
					target_label: failed.label,
					workflow_step: 'select_cascader_path_timeout_recovery',
					workflow_field_label: failed.label,
					workflow_retry_reason: 'previous_cascader_path_failed_after_reopen',
					workflow_value_source: 'previous_action',
					workflow_value_basis: '复用已声明的字段限定级联路径',
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
			if (!isPageFormField(field)) continue
			if (isCascaderFormField(field)) continue
			const index = Number(field.index)
			if (!Number.isFinite(index)) continue
			const label = normalizeFormFieldLabel(getObservedItemLabel(field))
			if (!label) continue
			const value = parseScalarAssignmentSegment(extractTaskAssignmentSegment(taskText, label, labels))
			if (!value) continue
			if (!shouldRecoverAssignedScalarField(session, field, value)) continue
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
			evaluation_previous_goal: `模型规划超时，但当前表单字段 "${label}" 与任务文字明确匹配，且任务文本给出了取值。`,
			memory: `使用通用表单恢复策略，按表单顺序填写或更新字段 "${label}"。`,
			thought: '模型超时后，任务文字和当前表单字段能唯一确定下一步文本输入。',
			next_goal: `填写${label}`,
			action: {
				name: 'input_text',
				input: {
					index,
					text: value,
					target_label: label,
					workflow_step: 'fill_form_field_timeout_recovery',
					workflow_field_label: label,
					workflow_value_source: 'task_value',
					workflow_value_basis: '字段标签与任务文本匹配',
				},
			},
		}
	}

	function deriveTaskValueMemoryFieldDecision(session, observation) {
		if (!isInformationValueLookupSubtask(session)) return null
		const taskValues = collectTaskValueHints(session, observation)
			.filter((item) => item.value)
		if (!taskValues.length) return null
		const formItems = collectObservedFormControlItems(observation)
			.filter(isPageFormField)
			.filter((field) => Number.isFinite(Number(field?.index)))
			.filter(isPlainTextFormField)
		for (const taskValue of taskValues) {
			const match = chooseTaskValueTargetField(formItems, taskValue)
			if (!match) continue
			const index = Number(match.field.index)
			if (hasRecentTaskValueFieldAttempt(session, index, taskValue.value)) continue
			if (!isEmptyFormField(match.field) && observedFieldValueMatchesScalar(match.field, taskValue.value)) continue
			if (!isEmptyFormField(match.field) && !isEditLikeFormAssignmentTask(session)) continue
			const label = normalizeFormFieldLabel(getObservedItemLabel(match.field)) || taskValue.label || '目标字段'
			return {
				evaluation_previous_goal: `外部信息查询已得到可复用值 "${taskValue.value}"，当前表单中字段 "${label}" 与任务目标字段匹配。`,
				memory: `使用当前任务变量填写 "${label}"；变量来源=${taskValue.source || 'recent_history'}，值=${taskValue.value}。`,
				thought: '外部查询只是为主任务取得字段值；当前字段唯一匹配，直接把已确认值填入表单。',
				next_goal: `填写${label}`,
				action: {
					name: 'input_text',
					input: {
						index,
						text: taskValue.value,
						target_label: label,
						workflow_step: 'fill_form_field_task_value',
						workflow_field_label: label,
						workflow_task_value_label: taskValue.label || '',
						workflow_value_source: taskValue.source || 'recent_history',
						workflow_value_basis: taskValue.basis || '',
					},
				},
			}
		}
		return null
	}

	function deriveTaskValueReturnToMainTabDecision(session, observation, context = {}) {
		if (!isInformationValueLookupSubtask(session)) return null
		const taskValues = collectTaskValueHints(session, observation).filter((item) => item.value)
		if (!taskValues.length) return null
		if (hasRecordCreateFormOpen(observation)) return null
		const targetUrl = getMainTaskTargetUrl(session)
		if (!targetUrl) return null
		const tabs = Array.isArray(context?.tabsSummary) ? context.tabsSummary : []
		const currentTab = tabs.find((tab) => tab?.current) || null
		const currentUrl = String(observation?.url || currentTab?.url || '').trim()
		if (currentUrl && fastPath.isSameUrlFamily?.(currentUrl, targetUrl)) return null
		const tab = findMainTaskTabForTaskValueReturn(session, tabs, targetUrl)
		if (!tab || hasRecentTaskValueReturnSwitch(session, tab)) return null
		const valueSummary = taskValues
			.slice(0, 3)
			.map((item) => `${item.label || '字段'}=${item.value}`)
			.join('，')
		return {
			evaluation_previous_goal: `外部信息查询已得到当前任务变量：${valueSummary}。当前仍停留在外部来源页，需要回到主任务页面继续填写。`,
			memory: `当前任务变量已可用，先切回已打开的主任务标签页；变量=${valueSummary}。`,
			thought: '外部查询只负责取值，主任务表单在另一个已打开标签页中，先切回去再填表。',
			next_goal: '切回主任务页面继续填写表单',
			action: {
				name: 'switch_to_tab',
				input: {
					tab_id: tab.id,
					target_label: shortWorkflowText(tab.title || tab.url || '主任务页面', 120),
					target_url: String(tab.url || ''),
					reason: '已取得外部查询值，切回主任务页面继续填写表单。',
					workflow: 'form-fill',
					workflow_step: 'return_to_main_task_with_task_value',
					workflow_task_value_labels: taskValues.map((item) => item.label || '').filter(Boolean).join('|'),
				},
			},
		}
	}

	function deriveTaskValueExternalLookupDecision(session, observation) {
		if (!isInformationValueLookupSubtask(session)) return null
		if (!hasRecordCreateFormOpen(observation)) return null
		if (isExternalInformationSourceLocation(observation)) return null
		const taskText = String(session?.latestTask || session?.task || '').trim()
		const pendingValues = collectTaskValueHints(session, observation).filter((item) => !item.value)
		if (!pendingValues.length) return null
		const formItems = collectObservedFormControlItems(observation)
			.filter(isPageFormField)
			.filter((field) => Number.isFinite(Number(field?.index)))
			.filter(isPlainTextFormField)
		for (const taskValue of pendingValues) {
			const match = chooseTaskValueTargetField(formItems, taskValue)
			if (!match) continue
			if (!isEmptyFormField(match.field) && !isEditLikeFormAssignmentTask(session)) continue
			const lookup = extractExternalTaskValueLookup(taskText, taskValue)
			if (!lookup) continue
			if (hasRecentTaskValueLookupOpen(session, taskValue, lookup)) continue
			const fieldLabel = normalizeFormFieldLabel(getObservedItemLabel(match.field)) || taskValue.label || '目标字段'
			return {
				evaluation_previous_goal: `当前表单字段 "${fieldLabel}" 需要外部查询值，但尚未取得可复用任务变量。`,
				memory: `保留当前主任务表单，使用新标签页查询 "${lookup.query}"；取得值后再切回主任务继续填写。`,
				thought: '这是填表中的外部取值子流程，必须保留主表单上下文，不能在当前标签页直接跳走。',
				next_goal: `打开外部查询：${lookup.query}`,
				action: {
					name: 'open_new_tab',
					input: {
						url: lookup.url,
						target_url: lookup.url,
						target_label: `外部查询：${lookup.query}`,
						reason: `为当前表单字段 "${fieldLabel}" 获取外部查询值，并保留主任务表单标签页。`,
						workflow: 'form-fill',
						workflow_step: 'open_external_value_lookup_source',
						workflow_field_label: fieldLabel,
						workflow_task_value_label: taskValue.label || '',
						workflow_lookup_engine: lookup.engine,
						workflow_lookup_query: lookup.query,
					},
				},
			}
		}
		return null
	}

	function extractExternalTaskValueLookup(taskText, taskValue) {
		const query = extractExternalTaskValueLookupQuery(taskText, taskValue)
		if (!query) return null
		const engine = detectExplicitSearchEngine(taskText)
		if (!engine) return null
		const url = buildSearchEngineUrl(engine, query)
		return url ? { engine, query, url } : null
	}

	function extractExternalTaskValueLookupQuery(taskText, taskValue) {
		const text = String(taskText || '').replace(/\s+/g, ' ').trim()
		if (!text) return ''
		const labelPattern = buildTaskValueTargetRegex(taskValue)
		const patterns = [
			new RegExp(`(?:${labelPattern}).{0,30}?(?:使用|用|采用|取用|use).{0,20}?(?:google|谷歌|百度|bing|duckduckgo)?\\s*(?:搜索一下|搜一下|查一下|查询一下|搜索|查询|检索|search(?:\\s+for)?|look\\s*up)\\s*([^，。；;\\n\\r]{2,100})`, 'i'),
			/(?:google|谷歌|百度|bing|duckduckgo).{0,12}?(?:搜索一下|搜一下|查一下|查询一下|搜索|查询|检索|search(?:\s+for)?|look\s*up)?\s*([^，。；;\n\r]{2,100})/i,
			/(?:搜索一下|搜一下|查一下|查询一下|搜索|查询|检索|search(?:\s+for)?|look\s*up)\s*([^，。；;\n\r]{2,100})/i,
		]
		for (const pattern of patterns) {
			const match = text.match(pattern)
			const query = cleanExternalTaskValueLookupQuery(match?.[1] || '', taskValue)
			if (query) return query
		}
		return ''
	}

	function cleanExternalTaskValueLookupQuery(value, taskValue) {
		let text = cleanAssignmentValue(value)
		if (!text) return ''
		text = text
			.replace(/^(?:一下|请|帮我|帮忙|最新查询|查询|搜索|搜|查)+/g, '')
			.replace(/(?:作为|当作|用作|用于|填入|填写到|写入|录入到|设置为|设为|命名为).*/g, '')
			.replace(/(?:as|for|into)\s+(?:the\s+)?[A-Za-z][A-Za-z0-9 _-]{1,30}.*/i, '')
			.trim()
		const aliases = Array.isArray(taskValue?.aliases) ? taskValue.aliases : [taskValue?.label]
		for (const alias of aliases) {
			const normalized = normalizeFormFieldLabel(alias)
			if (!normalized) continue
			const aliasPattern = new RegExp(`(?:作为|当作|用作)?${escapeRegExp(normalized)}$`, 'i')
			text = text.replace(aliasPattern, '').trim()
		}
		text = cleanAssignmentValue(text)
		if (!text || text.length < 2 || text.length > 80) return ''
		if (/(作为|当作|用作|填入|填写|写入|设置为|命名为)$/i.test(text)) return ''
		return text
	}

	function detectExplicitSearchEngine(taskText) {
		const text = String(taskText || '')
		if (/百度|baidu/i.test(text)) return 'baidu'
		if (/bing|必应/i.test(text)) return 'bing'
		if (/duckduckgo|ddg/i.test(text)) return 'duckduckgo'
		if (/google|谷歌/i.test(text)) return 'google'
		return ''
	}

	function buildSearchEngineUrl(engine, query) {
		const q = String(query || '').trim()
		if (!q) return ''
		const encoded = encodeURIComponent(q)
		if (engine === 'baidu') return `https://www.baidu.com/s?wd=${encoded}`
		if (engine === 'bing') return `https://www.bing.com/search?q=${encoded}`
		if (engine === 'duckduckgo') return `https://duckduckgo.com/?q=${encoded}`
		if (engine === 'google') return `https://www.google.com/search?q=${encoded}`
		return ''
	}

	function hasRecentTaskValueLookupOpen(session, taskValue, lookup) {
		const targetKey = getNavigationKey(taskValue?.label || '')
		const queryKey = getNavigationKey(lookup?.query || '')
		return getRecentHistoryItems(session, 12).some((item) => {
			const action = String(item?.action || '').replace(/\..*$/, '')
			if (action !== 'open_new_tab') return false
			const input = item?.input || {}
			if (String(input.workflow_step || '') !== 'open_external_value_lookup_source') return false
			const historyTargetKey = getNavigationKey(input.workflow_task_value_label || input.workflow_field_label || '')
			const historyQueryKey = getNavigationKey(input.workflow_lookup_query || input.target_label || input.url || '')
			return (!targetKey || !historyTargetKey || targetKey === historyTargetKey) &&
				(!queryKey || !historyQueryKey || historyQueryKey.includes(queryKey) || queryKey.includes(historyQueryKey))
		})
	}

	function getMainTaskTargetUrl(session) {
		const startup = String(session?.workflowState?.initialNavigation?.targetUrl || '').trim()
		if (startup) return startup
		const taskText = String(session?.latestTask || session?.task || '')
		return typeof fastPath.extractTargetUrl === 'function' ? fastPath.extractTargetUrl(taskText) : ''
	}

	function findMainTaskTabForTaskValueReturn(session, tabsSummary, targetUrl) {
		const tabs = Array.isArray(tabsSummary) ? tabsSummary : []
		const state = syncNavigationState(session)
		const expectedKeys = getExpectedNavigationKeys(session, state)
		let best = null
		for (const tab of tabs) {
			if (!tab || tab.current || !tab.id) continue
			const url = String(tab.url || '').trim()
			if (!/^https?:\/\//i.test(url)) continue
			if (!fastPath.isSameUrlFamily?.(url, targetUrl)) continue
			let score = 10
			if (typeof fastPath.isTaskTargetLocation === 'function' && fastPath.isTaskTargetLocation(url, targetUrl)) score += 4
			const tabText = getNavigationKey(`${tab.title || ''} ${url}`)
			for (const key of expectedKeys) {
				if (key && tabText.includes(key)) score += 5
			}
			if (!best || score > best.score) best = { ...tab, score }
		}
		return best
	}

	function hasRecentTaskValueReturnSwitch(session, tab) {
		const targetId = String(tab?.id || '')
		const targetUrl = String(tab?.url || '').trim()
		return getRecentHistoryItems(session, 8).some((item) => {
			const action = String(item?.action || '').replace(/\..*$/, '')
			if (action !== 'switch_to_tab') return false
			const input = item?.input || {}
			if (String(input.workflow_step || '') !== 'return_to_main_task_with_task_value') return false
			return String(input.tab_id || '') === targetId || (targetUrl && String(input.target_url || '') === targetUrl)
		})
	}

	function buildOpenDropdownRecoveryDecision(index, label, value) {
		return {
			evaluation_previous_goal: `模型规划超时，但当前表单字段 "${label}" 与任务文字明确匹配，且任务文本给出了目标值 "${value}"。`,
			memory: `使用通用表单恢复策略，先展开 "${label}" 下拉框以获取真实候选。`,
			thought: '选择类字段需要先获得页面真实候选，避免臆造选项。',
			next_goal: `展开${label}下拉框`,
			action: {
				name: 'open_dropdown',
				input: {
					index,
					target_label: label,
					workflow_step: 'open_form_dropdown_timeout_recovery',
					workflow_field_label: label,
					workflow_requested_text: value,
					workflow_value_source: 'task_value',
					workflow_value_basis: `任务目标值：${shortWorkflowText(value, 80)}`,
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
					target_label: label,
					workflow_step: 'choose_form_dropdown_timeout_recovery',
					workflow_field_label: label,
					workflow_value_source: 'visible_option',
					workflow_value_basis: `可见候选与任务目标值匹配：${shortWorkflowText(value, 80)}`,
				},
			},
		}
	}

	function getRecentDuplicateFormSubmitFailure(session) {
		for (const item of getRecentHistoryItems(session, 10)) {
			if (isLoopGuardHistoryItem(item)) continue
			if (isDuplicateConflictReplacementHistory(item)) return null
			if (item?.success !== false) continue
			const input = item?.input || {}
			if (String(input.workflow_step || '') !== 'submit_form_timeout_recovery') continue
			const text = getHistoryFailureText(item)
			if (isSystemRepeatGuardText(text)) continue
			if (!isDuplicateConstraintText(text)) continue
			return { item, text }
		}
		return null
	}

	function getRecentFormSubmitFailureValidationText(session) {
		for (const item of getRecentHistoryItems(session, 8)) {
			if (isLoopGuardHistoryItem(item)) continue
			if (item?.success !== false) continue
			const input = item?.input || {}
			if (String(input.workflow_step || '') !== 'submit_form_timeout_recovery') continue
			const text = getHistoryFailureText(item)
			if (!text || isSystemRepeatGuardText(text)) continue
			if (/(form_submit_failed|表单提交|校验|错误|请选择|必填|不能为空|required|please\s+select|must\s+select)/i.test(text)) {
				return text
			}
		}
		return ''
	}

	function getVisibleFormCompletionBlockerText(observation) {
		const fieldIssues = []
		for (const field of collectObservedFormControlItems(observation).filter(isPageFormField)) {
			const errorText = getFieldValidationErrorText(field)
			const invalid = field?.invalid === true || String(field?.invalid || '').toLowerCase() === 'true'
			const requiredEmpty = isRequiredEmptyFormControl(field)
			if (!invalid && !errorText && !requiredEmpty) continue
			const label = normalizeFormFieldLabel(getObservedItemLabel(field)) || '未命名字段'
			const detail = errorText || (requiredEmpty ? '必填字段仍为空' : '字段仍处于无效状态')
			fieldIssues.push(`${label}: ${shortWorkflowText(detail, 90)}`)
			if (fieldIssues.length >= 3) break
		}
		if (fieldIssues.length) return fieldIssues.join('；')
		const feedback = collectVisibleFormCompletionFeedback(observation)
		return feedback ? shortWorkflowText(feedback, 180) : ''
	}

	function collectVisibleFormCompletionFeedback(observation) {
		const values = []
		for (const item of (Array.isArray(observation?.feedback) ? observation.feedback : [])) {
			values.push(item?.text, item?.message, item?.label)
		}
		for (const item of [
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...(Array.isArray(observation?.popups) ? observation.popups : []),
		]) {
			values.push(item?.validationMessage, item?.errorText, item?.error, item?.message)
		}
		const content = String(observation?.content || '')
		for (const line of content.split(/\n+/).slice(-80)) {
			if (/(错误|失败|校验|验证|请选择|请输入|必填|不能为空|required|invalid|error|failed)/i.test(line)) {
				values.push(line)
			}
		}
		for (const value of values) {
			const text = String(value || '').replace(/\s+/g, ' ').trim()
			if (!text || !isFormCompletionErrorText(text)) continue
			return text
		}
		return ''
	}

	function isRequiredEmptyFormControl(field) {
		const required = field?.required === true || String(field?.required || '').toLowerCase() === 'true'
		if (!required) return false
		const value = extractObservedFieldValue(field)
		const state = String(field?.valueState || '').toLowerCase()
		return !String(value || '').trim() || /empty|blank|未填|未选|请选择|请输入/.test(state)
	}

	function isFormCompletionErrorText(value) {
		return /(不能为空|必填|请选择|请输入|请填写|请录入|未选择|校验失败|验证失败|格式错误|重复|已存在|已经存在|不能重复|唯一|保存失败|提交失败|操作失败|请求失败|提交异常|保存异常|required\s+field|is\s+required|please\s+(?:select|enter|input)|must\s+select|invalid\s+(?:value|input|format)|duplicate|already\s+exists|\bunique\b|\berror\b|\bfailed\b)/i.test(String(value || ''))
	}

	function isDuplicateConstraintText(text) {
		return /重复|已存在|已经存在|不能重复|唯一|duplicate|already\s+exists|exists|unique/i.test(String(text || ''))
	}

	function isSystemRepeatGuardText(text) {
		return /循环保护|重复动作循环|同一失败动作参数重复|未验证进展的同一动作重复|同一动作参数重复执行|动作参数重复|被动等待.*重复|滚动.*重复|悬浮.*重复/i.test(String(text || ''))
	}

	function hasRecentDuplicateConflictReplacement(session) {
		return getRecentHistoryItems(session, 8).some((item) => isDuplicateConflictReplacementHistory(item))
	}

	function isDuplicateConflictReplacementHistory(item) {
		if (!item || item.success === false) return false
		const action = String(item.action || '').replace(/\..*$/, '')
		if (action !== 'input_text' && action !== 'type') return false
		const input = item.input || {}
		return String(input.workflow_step || '') === 'resolve_duplicate_field_conflict'
	}

	function findDuplicateConflictField(observation, failureText) {
		const textKey = getNavigationKey(failureText)
		const fields = collectObservedFormControlItems(observation)
			.filter(isPageFormField)
			.filter((field) => Number.isFinite(Number(field.index)))
			.filter((field) => isPlainTextFormField(field))
			.filter((field) => !isEmptyFormField(field))
		if (!fields.length) return null
		for (const field of fields) {
			if (isDuplicateConstraintText(getFieldValidationErrorText(field))) return field
		}
		for (const field of fields) {
			const label = normalizeFormFieldLabel(getObservedItemLabel(field))
			if (label && textKey.includes(getNavigationKey(label))) return field
		}
		const valueMatches = fields.filter((field) => {
			const value = getNavigationKey(extractObservedFieldValue(field))
			return value && textKey.includes(value)
		})
		if (valueMatches.length === 1) return valueMatches[0]
		return fields.length === 1 ? fields[0] : null
	}

	function getRecentDuplicateConflictAnswer(session, label, index, oldValue) {
		for (const item of getRecentHistoryItems(session, 8)) {
			const input = item?.input || {}
			if (String(input.workflow_step || '') !== 'resolve_duplicate_field_conflict') continue
			if (String(item?.action || '').replace(/\..*$/, '') !== 'ask_user') continue
			if (!isSameConflictAskInput(input, label, index, oldValue)) continue
			if (item.success === false) return { value: '', cancelled: true }
			const answer = parseAskUserAnswer(item)
			if (!answer) continue
			if (/^(取消|不用|不改|停止|算了|否|no|cancel)$/i.test(answer)) {
				return { value: '', cancelled: true }
			}
			return { value: cleanAssignmentValue(answer), cancelled: false }
		}
		return { value: '', cancelled: false }
	}

	function hasRecentDuplicateConflictAsk(session, label, index, oldValue) {
		return getRecentHistoryItems(session, 8).some((item) => {
			const input = item?.input || {}
			return String(input.workflow_step || '') === 'resolve_duplicate_field_conflict' &&
				String(item?.action || '').replace(/\..*$/, '') === 'ask_user' &&
				isSameConflictAskInput(input, label, index, oldValue)
		})
	}

	function hasRecentDuplicateConflictReplacementForField(session, label, index) {
		return getRecentHistoryItems(session, 10).some((item) => {
			if (!isDuplicateConflictReplacementHistory(item)) return false
			const input = item?.input || {}
			if (Number.isFinite(Number(input.index)) && Number(input.index) !== Number(index)) return false
			const changedLabel = normalizeFormFieldLabel(input.workflow_field_label || '')
			return !changedLabel || changedLabel === normalizeFormFieldLabel(label)
		})
	}

	function isAmbiguousDuplicateConstraintText(text, label, value) {
		const raw = String(text || '')
		const key = getNavigationKey(raw)
		if (!isDuplicateConstraintText(raw)) return false
		const labelKey = getNavigationKey(label)
		const valueKey = getNavigationKey(value)
		if (labelKey && key.includes(labelKey)) return false
		if (valueKey && key.includes(valueKey)) return false
		return true
	}

	function isSameConflictAskInput(input, label, index, oldValue) {
		if (Number.isFinite(Number(input.workflow_field_index)) && Number(input.workflow_field_index) !== Number(index)) return false
		const askedLabel = normalizeFormFieldLabel(input.workflow_field_label || '')
		if (askedLabel && askedLabel !== normalizeFormFieldLabel(label)) return false
		const askedValue = String(input.workflow_old_value || '')
		if (askedValue && oldValue && askedValue !== oldValue) return false
		return true
	}

	function parseAskUserAnswer(item) {
		const text = [
			item?.output,
			item?.message,
			item?.detail,
			item?.result,
		].map((value) => String(value || '')).join('\n')
		const match = text.match(/用户回答:\s*([\s\S]+?)(?:\s*\|\s*动作结果:|$)/)
		return cleanAssignmentValue(match?.[1] || '')
	}

	function extractObservedFieldValue(field) {
		const state = String(field?.valueState || '').trim()
		const match = state.match(/^(?:filled|selected):\s*(.+)$/i)
		if (match?.[1]) return cleanAssignmentValue(match[1])
		const value = String(field?.value || field?.text || '').trim()
		return cleanAssignmentValue(value)
	}

	function getFieldValidationErrorText(field) {
		if (!field || typeof field !== 'object') return ''
		const invalid = String(field.invalid || '').toLowerCase() === 'true' || field.invalid === true
		const text = [
			field.error,
			field.validationMessage,
			field.validationError,
			field.message,
			field.errorText,
		].map((value) => cleanAssignmentValue(value)).filter(Boolean).join('；')
		return invalid || text ? text : ''
	}

	function deriveValidationCorrectedValue(value, errorText) {
		const current = cleanAssignmentValue(value)
		const error = String(errorText || '')
		if (!current || !error) return ''
		const forbidden = extractForbiddenValidationToken(error)
		if (forbidden) {
			const corrected = removeForbiddenToken(current, forbidden)
			if (corrected && corrected !== current) return corrected
		}
		if (/(只能|仅能|只允许|仅允许|must\s+only|only\s+allow|invalid|格式错误)/i.test(error)) {
			const corrected = current.replace(/[^\u4e00-\u9fa5A-Za-z0-9_]/g, '')
			if (corrected && corrected !== current) return corrected
		}
		return ''
	}

	function extractForbiddenValidationToken(errorText) {
		const text = String(errorText || '').trim()
		const patterns = [
			/(?:不能|不得|不允许|禁止)(?:包含|含有|出现|输入)\s*["“”'‘’`]?([^\s"“”'‘’`，,。；;、]{1,12})["“”'‘’`]?\s*(?:字符|符号)?/i,
			/cannot\s+contain\s*["']?([^"',.;\s]{1,12})["']?/i,
			/must\s+not\s+contain\s*["']?([^"',.;\s]{1,12})["']?/i,
		]
		for (const pattern of patterns) {
			const match = text.match(pattern)
			const token = cleanAssignmentValue(match?.[1] || '')
			if (token && !/^(字符|符号|内容|特殊字符)$/i.test(token)) return token
		}
		if (/空格|space/i.test(text) && /(不能|不得|不允许|禁止|cannot|must\s+not)/i.test(text)) {
			return ' '
		}
		return ''
	}

	function removeForbiddenToken(value, token) {
		const current = String(value || '')
		const raw = String(token || '')
		if (!current || !raw) return ''
		if (/^(空格|space)$/i.test(raw)) return current.replace(/\s+/g, '')
		const chars = [...raw]
			.filter((char) => char && !/\s/.test(char))
			.map(escapeRegExp)
		if (!chars.length) return current
		return current.replace(new RegExp(`[${chars.join('')}]`, 'g'), '')
	}

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	function suggestDuplicateReplacementValue(value) {
		const text = cleanAssignmentValue(value)
		if (!text) return '请输入新的不重复值'
		return `${text}${Date.now().toString(36).slice(-4)}`
	}

	function hasRecentValidationCorrectionAttempt(session, index, oldValue, newValue) {
		return getRecentHistoryItems(session, 8).some((item) => {
			const input = item?.input || {}
			return String(input.workflow_step || '') === 'resolve_field_validation_error' &&
				Number(input.index) === Number(index) &&
				String(input.workflow_old_value || '') === String(oldValue || '') &&
				String(input.text || '') === String(newValue || '')
		})
	}

	function hasRecentRequiredSelectionValidationAttempt(session, index, errorText) {
		const targetError = getNavigationKey(errorText || '')
		return getRecentHistoryItems(session, 8).some((item) => {
			const action = String(item?.action || '').replace(/\..*$/, '')
			if (action !== 'open_dropdown' && action !== 'choose_dropdown_option' && action !== 'select_dropdown_option') return false
			const input = item?.input || {}
			if (String(input.workflow_step || '') !== 'resolve_field_validation_error') return false
			if (Number(input.index) !== Number(index)) return false
			const attemptedError = getNavigationKey(input.workflow_validation_error || '')
			return !targetError || !attemptedError || attemptedError === targetError
		})
	}

	function getRecentRequiredSelectionAnswer(session, label, index, errorText) {
		for (const item of getRecentHistoryItems(session, 10)) {
			const input = item?.input || {}
			if (String(input.workflow_step || '') !== 'resolve_field_validation_error') continue
			if (String(item?.action || '').replace(/\..*$/, '') !== 'ask_user') continue
			if (!isSameRequiredSelectionInput(input, label, index, errorText)) continue
			if (item.success === false) return { value: '', cancelled: true }
			const answer = parseAskUserAnswer(item)
			if (!answer) continue
			if (/^(取消|不用|不选|停止|算了|否|no|cancel)$/i.test(answer)) {
				return { value: '', cancelled: true }
			}
			return { value: cleanAssignmentValue(answer), cancelled: false }
		}
		return { value: '', cancelled: false }
	}

	function hasRecentRequiredSelectionAsk(session, index, errorText) {
		return getRecentHistoryItems(session, 8).some((item) => {
			const input = item?.input || {}
			return String(input.workflow_step || '') === 'resolve_field_validation_error' &&
				String(item?.action || '').replace(/\..*$/, '') === 'ask_user' &&
				isSameRequiredSelectionInput(input, input.workflow_field_label || '', index, errorText)
		})
	}

	function hasRecentRequiredSelectionAnswerOpenAttempt(session, index, requestedText) {
		const targetText = getNavigationKey(requestedText || '')
		return getRecentHistoryItems(session, 8).some((item) => {
			const action = String(item?.action || '').replace(/\..*$/, '')
			if (action !== 'open_dropdown') return false
			const input = item?.input || {}
			if (String(input.workflow_step || '') !== 'resolve_field_validation_error') return false
			if (Number(input.index) !== Number(index)) return false
			const attemptedText = getNavigationKey(input.workflow_requested_text || '')
			return !targetText || !attemptedText || attemptedText === targetText
		})
	}

	function isSameRequiredSelectionInput(input, label, index, errorText) {
		if (Number.isFinite(Number(input.workflow_field_index)) && Number(input.workflow_field_index) !== Number(index)) return false
		const askedLabel = normalizeFormFieldLabel(input.workflow_field_label || '')
		const currentLabel = normalizeFormFieldLabel(label || '')
		if (askedLabel && currentLabel && askedLabel !== currentLabel) return false
		const targetError = getNavigationKey(errorText || '')
		const askedError = getNavigationKey(input.workflow_validation_error || '')
		if (targetError && askedError && targetError !== askedError) return false
		return true
	}

	function shortWorkflowText(value, maxLen) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		const limit = Math.max(20, Number(maxLen) || 120)
		return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
	}

	function deriveFormSubmitTimeoutDecision(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!taskText || !isCreateTask(taskText)) return null
		if (hasUnresolvedRequiredSelectionValidation(session, observation)) return null
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReached(observation, key))
		if (unresolved.length) return null
		const assignedFieldsSatisfied = areTaskAssignedFormFieldsSatisfied(session, observation)
		const duplicateConflictResolved = hasRecentDuplicateConflictReplacement(session)
		if (!hasRecentSuccessfulFormFillRecovery(session) && !assignedFieldsSatisfied && !duplicateConflictResolved) return null
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
				memory: `使用通用表单恢复策略，仅点击当前打开表单中的 "${label}" 按钮提交一次。`,
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
			.filter(isPageFormField)
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
				if (path.length < 1) continue
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

	function shouldRecoverAssignedScalarField(session, field, expected) {
		if (isEmptyFormField(field)) return true
		if (!isEditLikeFormAssignmentTask(session)) return false
		return !observedFieldValueMatchesScalar(field, expected)
	}

	function shouldRecoverAssignedCascaderField(session, field, path) {
		if (isEmptyFormField(field)) return true
		if (!isEditLikeFormAssignmentTask(session)) return false
		return !observedFieldValueMatchesCascaderPath(field, path)
	}

	function isEditLikeFormAssignmentTask(session) {
		const operation = String(taskIntent?.getOperation?.(session) || inferFormAssignmentOperation(session) || '').trim()
		return operation === 'edit' || operation === 'fill_form'
	}

	function inferFormAssignmentOperation(session) {
		const text = String(session?.latestTask || session?.task || '').trim()
		if (!text) return ''
		if (/(?:编辑|修改|更新|改为|修改为|更新为|变更为|调整为|改成|修改成|更新成|变更成|edit|update|change)/i.test(text)) return 'edit'
		if (/(?:填写|填入|填表|录入|设置|设为|设置为|选择为|选为|填为|填写为|录入为|fill|set)/i.test(text)) return 'fill_form'
		return ''
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
			.every((part) => actual.includes(part) || compactCascaderValueMatches(actual, part))
	}

	function compactCascaderValueMatches(actualValue, expectedValue) {
		const actual = getCompactCascaderCompareKey(actualValue)
		const expected = getCompactCascaderCompareKey(expectedValue)
		if (!actual || !expected || expected.length < 2) return false
		if (actual.includes(expected)) return true
		return isOrderedSubsequence(expected, actual)
	}

	function getCompactCascaderCompareKey(value) {
		return String(value || '')
			.replace(/^(?:selected|filled|value|已选|当前值)\s*[:：]/i, '')
			.replace(/[\s"'“”‘’【】\[\]()（）{}<>《》,，、。.;；:：!?！？>＞\/\\|-]+/g, '')
			.trim()
			.toLowerCase()
	}

	function isOrderedSubsequence(needle, haystack) {
		let cursor = 0
		for (const ch of String(haystack || '')) {
			if (ch === needle[cursor]) cursor += 1
			if (cursor >= needle.length) return true
		}
		return false
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
			.filter((key) => !isNavigationTargetReachedForSession(session, observation, key, state))
		const unattempted = unresolved.filter((key) => !hasNavigationKeyMatch(attempted, key))
		for (const key of unattempted) {
			const candidate = findNavigationCandidateForKey(observation, key)
			if (!candidate) continue
			return buildNavigationCandidateDecision(state, candidate, key, '当前观察中存在同名导航入口。')
		}
		for (const key of unresolved.filter((item) => hasNavigationKeyMatch(attempted, item))) {
			const candidate = findConcreteNavigationAliasCandidateForKey(observation, key, state)
			if (!candidate) continue
			return buildNavigationCandidateDecision(state, candidate, key, '之前点击的是导航组，现在观察到更具体的子菜单入口。')
		}
		const visionDecision = buildCompositeNavigationVisionDecision(state, observation, unresolved, '目标导航组已展开但目标页面仍未到达')
		if (visionDecision) return visionDecision
		if (!unattempted.length) return null
		const revealDecision = buildNavigationRevealDecision(state, observation, unattempted, '目标导航尚未直接可见')
		if (revealDecision) return revealDecision
		const missingContextDecision = buildMissingNavigationContextDecision(session, observation, unresolved)
		if (missingContextDecision) return missingContextDecision
		return null
	}

	function deriveNavigationPostContextDecision(session, observation, planningContext) {
		if (!observation || typeof observation !== 'object') return null
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReachedForSession(session, observation, key, state))
		if (!unresolved.length) return null
		if (!hasRecentNavigationContextMiss(planningContext, unresolved)) return null
		const revealDecision = buildNavigationRevealDecision(state, observation, unresolved, '补充上下文没有匹配到目标导航，改用受限导航探索', {
			allowExploratory: true,
		})
		if (revealDecision) return revealDecision
		return null
	}

	function hasRecentNavigationContextMiss(planningContext, unresolved) {
		const contexts = Array.isArray(planningContext) ? planningContext.slice(-4) : []
		if (!contexts.length) return false
		const targetKeys = (Array.isArray(unresolved) ? unresolved : [])
			.map(getNavigationKey)
			.filter(Boolean)
		if (!targetKeys.length) return false
		return contexts.some((context) => {
			const name = String(context?.name || '').trim()
			if (name !== 'request_context' && name !== 'inspect_region') return false
			const input = context?.input && typeof context.input === 'object' ? context.input : {}
			const text = String(context?.text || '')
			if (!/empty_context\b/.test(text) || !/reason="query_no_match"/.test(text)) return false
			const query = getNavigationKey(input.query || extractContextAttr(text, 'query') || '')
			if (!query) return true
			return targetKeys.some((target) => navigationLookupTextMatchesTarget(query, target))
		})
	}

	function navigationLookupTextMatchesTarget(query, targetKey) {
		const queryKey = getNavigationKey(query)
		const target = getNavigationKey(targetKey)
		if (!queryKey || !target) return false
		if (queryKey === target || queryKey.includes(target) || target.includes(queryKey)) return true
		return getNavigationTargetAliases(target).some((alias) =>
			alias && (queryKey.includes(alias) || alias.includes(queryKey))
		)
	}

	function extractContextAttr(text, name) {
		const match = String(text || '').match(new RegExp(`${name}="([^"]*)"`))
		return match?.[1] || ''
	}

	function buildMissingNavigationContextDecision(session, observation, unresolved) {
		const labels = (Array.isArray(unresolved) ? unresolved : [])
			.map(getNavigationKey)
			.filter(Boolean)
		if (!labels.length) return null
		if (taskTextHasExplicitUrl(session)) return null
		if (!isGenericFallbackLocation(observation)) return null
		if (hasRecentMissingNavigationContextAsk(session)) return null
		const labelText = labels.join('、')
		return {
			evaluation_previous_goal: `任务目标模块尚未到达: ${labelText}，但当前页面不是目标应用页面。`,
			memory: '任务里没有明确目标应用网址，当前标签页处于通用起始/搜索页面，无法可靠定位目标菜单。',
			thought: '先向用户确认要进入的目标应用网址，再继续导航到目标模块。',
			next_goal: '询问目标应用网址',
			action: {
				name: 'ask_user',
				input: {
					question: `当前没有打开目标应用页面，也没有在任务里看到网站地址。请提供要进入的目标应用网址，我再继续找「${labelText}」。`,
					reason: `任务要求进入「${labelText}」，但当前位于通用起始/搜索页面且任务未提供目标网址。`,
					placeholder: '例如：http://example.com/',
					timeout_ms: 60000,
					workflow_step: 'request_missing_target_url',
					workflow_nav_key: labels[0],
				},
			},
		}
	}

	function taskTextHasExplicitUrl(session) {
		const text = String(session?.latestTask || session?.task || '')
		return /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i.test(text)
	}

	function isGenericFallbackLocation(observation) {
		const url = String(observation?.url || '').trim()
		const title = getNavigationKey(observation?.title || '')
		if (!url) return true
		if (/^(about:blank|chrome:\/\/|edge:\/\/|moz-extension:\/\/|chrome-extension:\/\/)/i.test(url)) return true
		if (/^https?:\/\/(?:www\.)?(google|bing|baidu|duckduckgo)\.[^/]+/i.test(url)) return true
		return /^(google|bing|百度|duckduckgo|新标签页|newtab)$/.test(title)
	}

	function isExternalInformationSourceLocation(observation) {
		const url = String(observation?.url || '').trim()
		const title = getNavigationKey(observation?.title || '')
		if (/^https?:\/\/(?:www\.)?(google|bing|baidu|duckduckgo)\.[^/]+/i.test(url)) return true
		if (/(search|news|article|finance|market|price|财经|新闻|行情|价格|搜索|资讯)/i.test(`${url} ${title}`)) return true
		return false
	}

	function hasRecentMissingNavigationContextAsk(session) {
		const history = Array.isArray(session?.history) ? session.history : []
		return history.slice(-5).some((item) => {
			const input = item?.input || item?.action?.input || {}
			return String(item?.action || item?.name || item?.action?.name || '') === 'ask_user' &&
				String(input.workflow_step || '') === 'request_missing_target_url'
		})
	}

	function deriveRecordViewWorkflowDecision(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		const operation = taskIntent?.getOperation?.(session) || ''
		if (operation !== 'view_first_record_detail' && !isFirstRecordDetailTask(taskText)) return null
		if (hasSuccessfulRecordViewAttempt(session)) {
			if (taskHasPostRecordViewContinuation(taskText)) {
				if (hasRecordViewReturnAttempt(session)) return null
				const returnCandidate = findRecordViewReturnCandidate(observation)
				if (!returnCandidate) return null
				const label = getObservedItemLabel(returnCandidate) || '返回'
				return {
					evaluation_previous_goal: '已触发列表第一条记录的详情查看动作，但用户任务仍包含后续页面操作。',
					memory: '列表详情只是链式任务中的中间步骤；先回到列表或关闭详情，再继续后续搜索/查询/筛选测试。',
					thought: '详情已打开，当前不能把整条任务判定为完成。先使用页面内可见的返回/关闭入口回到列表。',
					next_goal: `回到列表继续后续任务：${label}`,
					action: {
						name: 'click_element_by_index',
						input: {
							index: Number(returnCandidate.index),
							target_label: label,
							workflow_step: 'return_after_record_view',
						},
					},
				}
			}
			return {
				evaluation_previous_goal: '已触发列表第一条记录的详情查看动作。',
				memory: '任务要求查看列表第一条记录详情，详情入口已成功点击。',
				thought: '第一条记录详情已经打开或正在展示，任务目标已满足。',
				next_goal: '结束任务',
				action: {
					name: 'done',
					input: {
						success: true,
						text: '已打开列表第一条记录的详情。',
						workflow_step: 'finish_record_view',
					},
				},
			}
		}
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReachedForSession(session, observation, key, state))
		if (unresolved.length) return null
		if (hasRecordViewAttempt(session)) return null
		const hasRecordList = hasRecordListEvidence(observation)
		const candidate = hasRecordList ? findFirstRecordDetailCandidate(observation) : null
		if (candidate) {
			const label = getObservedItemLabel(candidate) || '详情'
			return {
				evaluation_previous_goal: '已到达目标列表页面，任务明确要求查看列表第一条记录详情。',
				memory: '使用受限列表查看工作流，只点击内容区第一条记录附近的详情/查看入口。',
				thought: '当前页面已是目标列表，且能确定第一条记录的详情入口，直接打开详情。',
				next_goal: '查看列表第一条记录详情',
				action: {
					name: 'click_element_by_index',
					input: {
						index: Number(candidate.index),
						target_label: label,
						workflow_step: 'view_first_record_detail',
					},
				},
			}
		}
		if (!hasRecordList) return null
		return {
			evaluation_previous_goal: '已到达目标列表页面，但当前 DOM 观察没有稳定的第一条记录详情按钮索引。',
			memory: '使用受限视觉定位，仅查找当前页面主体列表第一行的详情/查看入口。',
			thought: '任务要求查看第一条记录详情，改用视觉语义定位第一行详情按钮。',
			next_goal: '定位并查看第一条记录详情',
			action: {
				name: 'locate_by_vision',
				input: {
					target_description: '当前页面主体列表第一行的详情或查看按钮',
					action_name: 'click_element_by_index',
					workflow_step: 'view_first_record_detail',
					workflow_record_position: 'first',
				},
			},
		}
	}

	function deriveRecordViewPostModelDecision(session, decision, context = {}) {
		if (!isSuccessfulDoneDecision(decision)) return null
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!taskHasPostRecordViewContinuation(taskText)) return null
		if (!hasSuccessfulRecordViewAttempt(session)) return null
		const observation = context?.observation || null
		const returnCandidate = !hasRecordViewReturnAttempt(session)
			? findRecordViewReturnCandidate(observation)
			: null
		if (returnCandidate) {
			const label = getObservedItemLabel(returnCandidate) || '返回'
			return {
				evaluation_previous_goal: '模型把详情查看子步骤当成整条任务完成，但用户任务仍包含后续页面操作。',
				memory: '详情查看完成后需要回到列表继续后续搜索/查询/筛选测试，不能直接结束。',
				thought: '当前页面有可见的返回/关闭入口，先回到列表继续。',
				next_goal: `回到列表继续后续任务：${label}`,
				action: {
					name: 'click_element_by_index',
					input: {
						index: Number(returnCandidate.index),
						target_label: label,
						workflow_step: 'return_after_record_view',
					},
				},
			}
		}
		return {
			evaluation_previous_goal: '模型把详情查看子步骤当成整条任务完成，但用户任务仍包含后续页面操作。',
			memory: '详情查看只是链式任务中的中间步骤；缺少可靠返回/关闭入口时不能报告成功完成。',
			thought: '继续执行需要先回到列表，但当前观察没有稳定的返回列表入口。',
			next_goal: '停止并报告链式任务未完成',
			action: {
				name: 'done',
				input: {
					success: false,
					text: '已打开列表第一条记录详情，但原任务仍包含后续页面操作；当前未观察到稳定的返回/关闭/返回列表入口，未执行后续搜索/查询/筛选测试。',
					workflow_step: 'return_after_record_view',
				},
			},
		}
	}

	function buildRecordViewHintLines(session, observation, expectedKeys = [], state = null) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		const operation = taskIntent?.getOperation?.(session) || ''
		if (operation !== 'view_first_record_detail' && !isFirstRecordDetailTask(taskText)) return []
		if (
			hasSuccessfulRecordViewAttempt(session) &&
			taskHasPostRecordViewContinuation(taskText) &&
			hasRecordViewReturnAttempt(session)
		) {
			return [
				[
					'- record_view',
					'status="returned_continuation_ready"',
					'position="first"',
					'guidance="列表第一条记录详情已经查看且已返回列表；继续执行后续搜索/查询/筛选/表单任务，不要重复点击详情或返回入口。"',
				].join(' '),
			]
		}
		const unresolved = (Array.isArray(expectedKeys) ? expectedKeys : [])
			.filter((key) => !isNavigationTargetReachedForSession(session, observation, key, state))
		if (unresolved.length) return []
		if (hasSuccessfulRecordViewAttempt(session)) {
			if (!taskHasPostRecordViewContinuation(taskText)) return []
			const candidate = findRecordViewReturnCandidate(observation)
			return [
				[
					'- record_view',
					'status="detail_opened_continuation_required"',
					'position="first"',
					candidate ? `returnIndex="${Number(candidate.index)}"` : '',
					candidate ? `returnLabel="${escapeAttr(getObservedItemLabel(candidate) || '返回')}"` : '',
					'guidance="列表第一条记录详情已经打开，但原任务仍包含后续页面操作；不要 done，先通过页面内返回/关闭/返回列表入口回到列表，再继续后续搜索/查询/筛选/表单任务。"',
				].filter(Boolean).join(' '),
			]
		}
		const listTables = getRecordListEvidenceTables(observation)
		const paginationEvidence = getPositivePaginationRecordEvidenceItems(observation)
		if (!listTables.length && !paginationEvidence.length) {
			return [
				[
					'- record_view_requirement',
					'status="missing_record_list_evidence"',
					'position="first"',
					'guidance="任务要求查看列表第一条记录详情；当前未观察到真实列表/表格行证据，先 request_context source=tables 或 inspect_region content 获取列表上下文，不要点击工具栏、页头或列表外的详情/查看按钮。"',
				].join(' '),
			]
		}
		const candidate = findFirstRecordDetailCandidate(observation)
		if (!candidate) {
			const paginationText = paginationEvidence
				.map((item) => shortWorkflowText(getObservedItemLabel(item), 80))
				.filter(Boolean)
				.slice(0, 3)
				.join('|')
			return [
				[
					'- record_view_requirement',
					'status="detail_action_missing"',
					'position="first"',
					`tableRows="${Number(countRecordListEvidenceRows(listTables))}"`,
					paginationText ? `pagination="${escapeAttr(paginationText)}"` : '',
					'guidance="已观察到列表/分页数据，但没有稳定的第一行详情/查看入口；先 request_context source=actions region=content query=\'详情 查看 明细 预览\' 或 locate_by_vision 定位第一行入口，不要点击列表外按钮。"',
				].filter(Boolean).join(' '),
			]
		}
		return [
			[
				'- record_view',
				'status="ready"',
				'position="first"',
				`candidateIndex="${Number(candidate.index)}"`,
				`candidateLabel="${escapeAttr(getObservedItemLabel(candidate) || '详情')}"`,
				`tableRows="${Number(countRecordListEvidenceRows(listTables))}"`,
				'guidance="本地 workflow 可点击列表范围内第一条记录附近的详情/查看入口。"',
			].join(' '),
		]
	}

	function countRecordListEvidenceRows(tables) {
		let count = 0
		for (const table of (Array.isArray(tables) ? tables : [])) {
			for (const row of (Array.isArray(table?.rows) ? table.rows : [])) {
				if (Array.isArray(row) && row.some((cell) => String(cell || '').trim())) count += 1
			}
		}
		return count
	}

	function buildCreateTaskHintLines(session, observation, expectedKeys = [], state = null) {
		const taskText = String(session?.latestTask || session?.task || '')
		const operation = taskIntent?.getOperation?.(session) || ''
		if (operation !== 'create' && !isCreateTask(taskText)) return []
		const unresolved = (Array.isArray(expectedKeys) ? expectedKeys : [])
			.filter((key) => !isNavigationTargetReachedForSession(session, observation, key, state))
		if (unresolved.length) return []
		const createLabels = taskIntent?.getCreateEntryLabels?.(session) || []
		const createLabelText = createLabels.length
			? ` 可优先匹配入口文本：${createLabels.join('、')}。`
			: ''
		const lines = [
			`- create_task status="active" guidance="任务包含创建/新增意图；页面动作仍由模型根据当前元素分析后决定。${escapeAttr(createLabelText)}若紧凑观察未展示创建入口，先 request_context source=actions region=content query='新增 新建 创建 添加' 或 inspect_region content，不要直接 done。"`,
		]
		const candidates = uniqueCreateEntryCandidates(collectCreateEntryItems(observation)
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => isCreateEntryCandidateItem(item))
			.filter((item) => isStrongCreateEntryCandidateItem(item)), extractCreateEntityHints(taskText))
			.slice(0, 5)
			.map((item) => `index=${Number(item.index)} label="${escapeAttr(getObservedItemLabel(item) || '')}" region="${escapeAttr(item.region || '')}" intent="${escapeAttr(item.actionIntent || item.intent || '')}" rect="${escapeAttr(formatCandidateRect(item?.rect))}"`)
		if (candidates.length) {
			lines.push(`- create_candidates ${candidates.join('; ')}`)
		}
		return lines
	}

	function buildTaskValueHintLines(session, observation, expectedKeys = [], state = null) {
		if (!isInformationValueLookupSubtask(session)) return []
		const unresolved = (Array.isArray(expectedKeys) ? expectedKeys : [])
			.filter((key) => !isNavigationTargetReachedForSession(session, observation, key, state))
		if (unresolved.length && !isExternalInformationSourceLocation(observation)) return []
		const values = collectTaskValueHints(session, observation)
		if (!values.length) return []
		return values.slice(0, 5).map((item) => [
			'- task_value',
			item.value ? 'status="available"' : 'status="pending"',
			`field="${escapeAttr(item.label || '')}"`,
			item.aliases?.length ? `aliases="${escapeAttr(item.aliases.join('|'))}"` : '',
			item.value ? `value="${escapeAttr(item.value)}"` : '',
			item.source ? `source="${escapeAttr(item.source)}"` : '',
			item.basis ? `basis="${escapeAttr(shortWorkflowText(item.basis, 160))}"` : '',
			item.value
				? 'guidance="这是当前任务内取得的临时字段值；若主任务表单中出现匹配字段，应优先使用该值继续填写/提交，不要回外部来源重复查询。"'
				: 'guidance="主任务需要外部查询值填入该字段；在信息来源页拿到可信值后，把值写入 memory/thought，再切回主任务页面继续。"',
		].filter(Boolean).join(' '))
	}

	function collectTaskValueHints(session, observation = null) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		const targets = extractTaskValueTargets(taskText)
		if (!targets.length) return []
		const candidates = extractTaskValueCandidatesFromHistory(session, targets)
		const visibleCandidates = extractTaskValueCandidatesFromObservation(observation, targets, taskText)
		const output = []
		for (const target of targets) {
			const candidate = candidates.find((item) => item.targetKey === target.key) ||
				visibleCandidates.find((item) => item.targetKey === target.key) ||
				null
			output.push({
				...target,
				value: candidate?.value || '',
				source: candidate?.source || '',
				basis: candidate?.basis || '',
			})
		}
		return output
	}

	function extractTaskValueTargets(taskText) {
		const text = String(taskText || '')
		if (!text.trim()) return []
		const labels = []
		const addLabel = (value) => {
			const label = normalizeTaskValueTargetLabel(value)
			if (!label) return
			addUnique(labels, label)
		}
		const patterns = [
			/(?:作为|当作|用作|命名为|设为|设置为)\s*([^，。；;、\n\r]{2,24}?)(?:字段|输入框|账号|名称)?(?=$|[，。；;、\n\r\s])/g,
			/(?:填入|填写到|写入|录入到)\s*([^，。；;、\n\r]{2,24}?)(?:字段|输入框)?(?=$|[，。；;、\n\r\s])/g,
			/([^\s，。；;、\n\r]{2,18}?)(?:使用|采用|取用).{0,80}?(?:搜索|查询|查一下|搜一下|google|Google|百度|Bing|latest|search)/g,
			/([^\s，。；;、\n\r]{2,18}?)(?<![使采取])用\s*(?:(?:google|Google|谷歌|百度|Bing|bing|duckduckgo|DuckDuckGo).{0,16}?)?(?:搜索|查询|查一下|搜一下|搜|查|latest|search|look\s*up)/g,
		]
		for (const pattern of patterns) {
			for (const match of text.matchAll(pattern)) addLabel(match?.[1])
		}
		for (const match of text.matchAll(/(?:as|for)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _-]{1,30})(?:\s+field)?/gi)) {
			addLabel(match?.[1])
		}
		return labels.slice(0, 6).map((label) => {
			const aliases = buildTaskValueTargetAliases(label)
			return {
				key: getNavigationKey(label),
				label,
				aliases,
			}
		}).filter((item) => item.key)
	}

	function normalizeTaskValueTargetLabel(value) {
		let text = cleanAssignmentValue(value)
		if (!text) return ''
		text = text
			.replace(/^(?:这个|那个|该|本|此|当前|目标|主任务|页面|表单|作为|当作|用作)+/g, '')
			.replace(/(?:字段|输入框|表单项|内容|值)$/g, '')
			.replace(/^(?:the|a|an)\s+/i, '')
			.trim()
		if (!text || text.length < 2 || text.length > 30) return ''
		if (/(搜索|查询|最新|价格|新闻|网页|网站|页面|结果|信息|值|数据)$/i.test(text) && !/(账号|用户名|名称|标题|邮箱|验证码|phone|email|code|name|title|username|account)/i.test(text)) return ''
		return text
	}

	function buildTaskValueTargetAliases(label) {
		const raw = normalizeFormFieldLabel(label)
		const aliases = []
		addUnique(aliases, raw)
		const key = getNavigationKey(raw)
		const push = (...values) => values.forEach((value) => addUnique(aliases, normalizeFormFieldLabel(value)))
		if (/^(用户名|用户账号|账户名|账号|账户|登录账号|登陆账号)$/i.test(key) || /username|account|login/i.test(key)) {
			push('用户名', '登录账号', '登陆账号', '账号', '账户', '账户名', '用户账号', 'username', 'account', 'login account')
		}
		if (/^(名称|姓名|名字|标题)$/i.test(key) || /name|title/i.test(key)) {
			push('名称', '姓名', '名字', '标题', 'name', 'title')
		}
		if (/^(邮箱|电子邮箱|邮件|email|e-mail)$/i.test(key)) {
			push('邮箱', '电子邮箱', '邮件', 'email', 'e-mail')
		}
		if (/^(验证码|校验码|动态码|otp|code|verificationcode)$/i.test(key)) {
			push('验证码', '校验码', '动态码', 'otp', 'code', 'verification code')
		}
		if (/^(手机号|手机号码|电话|联系电话|phone|mobile|tel)$/i.test(key)) {
			push('手机号', '手机号码', '电话', '联系电话', 'phone', 'mobile', 'tel')
		}
		return [...new Set(aliases.filter(Boolean))].slice(0, 12)
	}

	function extractTaskValueCandidatesFromHistory(session, targets) {
		const candidates = []
		const recent = getRecentHistoryItems(session, 16)
		for (const item of recent) {
			if (item?.success === false) continue
			const input = item?.input || {}
			for (const target of targets) {
				const direct = extractDirectTaskValueFromInput(input, target)
				if (direct) {
					candidates.push({
						targetKey: target.key,
						value: direct,
						source: 'previous_field_action',
						basis: `历史字段动作 ${item.action || ''}`,
					})
					continue
				}
				const text = [
					item?.memory,
					item?.thought,
					item?.nextGoal,
					item?.evaluationPreviousGoal,
					item?.output,
				].map((value) => String(value || '')).filter(Boolean).join(' | ')
				const value = extractTaskValueFromText(text, target)
				if (!value) continue
				candidates.push({
					targetKey: target.key,
					value,
					source: 'recent_history',
					basis: shortWorkflowText(text, 180),
				})
			}
		}
		return dedupeTaskValueCandidates(candidates)
	}

	function extractTaskValueCandidatesFromObservation(observation, targets, taskText) {
		if (!observation || typeof observation !== 'object') return []
		const text = collectInformationEvidenceSnippets(observation, taskText).join(' | ')
		if (!text) return []
		const candidates = []
		for (const target of targets) {
			const value = extractTaskValueFromText(text, target)
			if (!value) continue
			candidates.push({
				targetKey: target.key,
				value,
				source: 'visible_evidence',
				basis: shortWorkflowText(text, 180),
			})
		}
		return dedupeTaskValueCandidates(candidates)
	}

	function extractDirectTaskValueFromInput(input, target) {
		if (!input || typeof input !== 'object') return ''
		const label = normalizeFormFieldLabel(input.workflow_field_label || input.target_label || input.label || '')
		if (!taskValueTargetMatchesLabel(label, target)) return ''
		return normalizeTaskValueCandidate(input.text || input.value || input.label || '')
	}

	function extractTaskValueFromText(text, target) {
		const raw = String(text || '').replace(/\s+/g, ' ').trim()
		if (!raw) return ''
		const labelPattern = buildTaskValueTargetRegex(target)
		const labelValuePattern = new RegExp(`(?:${labelPattern})\\s*(?:=|:|：|为|是|使用|采用|取值为|设置为|设为|填为|填写为)\\s*["“”']?([^"“”'，。；;|\\n\\r]{1,80})`, 'i')
		const labelMatch = raw.match(labelValuePattern)
		const labelValue = normalizeTaskValueCandidate(labelMatch?.[1] || '')
		if (labelValue) return labelValue
		const explicitPattern = /(?:提取到|得到|查到|查询到|找到|获取到|识别到|拿到|结果为|值为|候选值为|可用值为|价格为|报价为)\s*["“”']?([^"“”'，。；;|\n\r]{1,80})/i
		const explicit = normalizeTaskValueCandidate(raw.match(explicitPattern)?.[1] || '')
		if (explicit) return explicit
		const codeMatch = raw.match(/(?:验证码|校验码|动态码|otp|code).{0,20}\b([A-Za-z0-9]{4,10})\b/i)
		if (codeMatch?.[1] && target.aliases.some((alias) => /验证码|校验码|动态码|otp|code/i.test(alias))) {
			return normalizeTaskValueCandidate(codeMatch[1])
		}
		if (/(价格|报价|行情|price|gold|黄金|latest)/i.test(raw)) {
			const number = extractNumericTaskValue(raw)
			if (number) return number
		}
		return ''
	}

	function buildTaskValueTargetRegex(target) {
		const aliases = Array.isArray(target?.aliases) ? target.aliases : []
		const parts = aliases
			.map((alias) => normalizeFormFieldLabel(alias))
			.filter(Boolean)
			.sort((a, b) => b.length - a.length)
			.map(escapeRegExp)
		return parts.length ? parts.join('|') : escapeRegExp(target?.label || '')
	}

	function normalizeTaskValueCandidate(value) {
		let text = cleanAssignmentValue(value)
		if (!text) return ''
		const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0]
		if (email) return email
		const number = extractNumericTaskValue(text)
		if (number && /(价格|报价|行情|\$|¥|€|£|美元|美金|元|usd|cny|gold|黄金|price)/i.test(text)) return number
		text = text.replace(/^(?:为|是|：|:|=)+/g, '').trim()
		text = text.split(/\s*(?:\||，|,|。|；|;)\s*/)[0] || ''
		text = cleanAssignmentValue(text)
		if (!text || text.length > 80) return ''
		if (/^(success|true|false|null|undefined|empty|unknown)$/i.test(text)) return ''
		if (/^https?:\/\//i.test(text)) return ''
		return text
	}

	function extractNumericTaskValue(text) {
		const source = String(text || '')
		const candidates = Array.from(source.matchAll(/(?:[$¥€£]\s*)?(\d[\d,]{1,12}(?:\.\d+)?)(?:\s*(?:美元|美金|人民币|元|usd|cny|eur|gbp|%|％|盎司|oz))?/gi))
			.map((match) => buildNumericTaskValueCandidate(match, source))
			.filter(Boolean)
		if (!candidates.length) return ''
		candidates.sort((a, b) => (b.score - a.score) || (a.index - b.index))
		return candidates[0].value || ''
	}

	function buildNumericTaskValueCandidate(match, source) {
		const value = String(match?.[1] || '').replace(/,/g, '')
		const number = Number(value)
		if (!Number.isFinite(number) || value.length < 2) return null
		const full = String(match?.[0] || '')
		const index = Number(match?.index || 0)
		const before = source.slice(Math.max(0, index - 36), index)
		const after = source.slice(index + full.length, index + full.length + 36)
		const context = `${before} ${full} ${after}`
		let score = 0
		const hasCurrencyOrUnit = /[$¥€£]|美元|美金|人民币|元|usd|cny|eur|gbp|盎司|oz/i.test(full)
		if (hasCurrencyOrUnit) score += 10
		if (/(价格|报价|行情|现货|买入|卖出|涨跌|price|quote|market|spot|bid|ask|gold|黄金)/i.test(context)) score += 7
		if (/\.\d+/.test(value)) score += 2
		if (value.replace(/\D/g, '').length >= 4) score += 1
		if (isLikelyDateNumberCandidate(value, number, context, hasCurrencyOrUnit)) score -= 12
		if (number <= 31 && !hasCurrencyOrUnit) score -= 4
		if (/^(?:00|0\d)$/.test(value)) score -= 5
		return { value, score, index }
	}

	function isLikelyDateNumberCandidate(value, number, context, hasCurrencyOrUnit) {
		if (hasCurrencyOrUnit) return false
		const text = String(context || '')
		if (/日期|时间|发布|更新|年|月|日|时|分|秒|date|time|updated|published/i.test(text)) {
			if (/^\d{4}$/.test(value) && number >= 1900 && number <= 2099) return true
			if (number >= 1 && number <= 31) return true
		}
		if (/^\d{4}$/.test(value) && number >= 1900 && number <= 2099 && /[-/.]\s*\d{1,2}|年|月|日/.test(text)) return true
		return false
	}

	function dedupeTaskValueCandidates(candidates) {
		const seen = new Set()
		const output = []
		for (const item of Array.isArray(candidates) ? candidates : []) {
			const value = normalizeTaskValueCandidate(item?.value || '')
			const key = `${item?.targetKey || ''}:${value}`
			if (!value || seen.has(key)) continue
			seen.add(key)
			output.push({ ...item, value })
		}
		return output
	}

	function chooseTaskValueTargetField(fields, taskValue) {
		const candidates = (Array.isArray(fields) ? fields : [])
			.map((field) => {
				const label = normalizeFormFieldLabel(getObservedItemLabel(field))
				const score = scoreTaskValueFieldLabel(label, taskValue)
				return { field, label, score }
			})
			.filter((item) => item.score < Number.MAX_SAFE_INTEGER)
			.sort((a, b) => a.score - b.score || getFormFieldOrderScore(a.field) - getFormFieldOrderScore(b.field))
		if (!candidates.length) return null
		if (candidates.length === 1) return candidates[0]
		const best = candidates[0]
		const second = candidates[1]
		return best.score + 4 <= second.score ? best : null
	}

	function scoreTaskValueFieldLabel(label, taskValue) {
		const field = normalizeFormFieldLabel(label)
		if (!field) return Number.MAX_SAFE_INTEGER
		const aliases = Array.isArray(taskValue?.aliases) ? taskValue.aliases : [taskValue?.label]
		let best = Number.MAX_SAFE_INTEGER
		for (const alias of aliases) {
			const target = normalizeFormFieldLabel(alias)
			if (!target) continue
			if (field === target) best = Math.min(best, 0)
			else if (field.endsWith(target) || target.endsWith(field)) best = Math.min(best, 4)
			else if (field.includes(target) || target.includes(field)) best = Math.min(best, 8)
		}
		return best
	}

	function taskValueTargetMatchesLabel(label, taskValue) {
		return scoreTaskValueFieldLabel(label, taskValue) <= 8
	}

	function hasRecentTaskValueFieldAttempt(session, index, value) {
		const target = getNavigationKey(cleanAssignmentValue(value))
		return getRecentHistoryItems(session, 8).some((item) => {
			const action = String(item?.action || '').replace(/\..*$/, '')
			const input = item?.input || {}
			if (action !== 'input_text' && action !== 'type') return false
			if (Number(input.index) !== Number(index)) return false
			if (String(input.workflow_step || '') !== 'fill_form_field_task_value') return false
			const attempted = getNavigationKey(cleanAssignmentValue(input.text || ''))
			return !target || !attempted || attempted === target
		})
	}

	function buildInformationQueryHintLines(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!isInformationQueryTask(taskText)) return []
		const valueLookup = isInformationValueLookupSubtask(session)
		const snippets = collectInformationEvidenceSnippets(observation, taskText)
		const sourceState = isSparseInformationSource(observation, snippets) ? 'sparse' : 'visible_evidence'
		const lines = [
			valueLookup
				? [
					'- information_value_lookup',
					'status="active"',
					`sourceState="${sourceState}"`,
					`evidenceCount="${snippets.length}"`,
					'guidance="这是为主页面表单/页面操作取得外部字段值的子流程；拿到可信可见值后，必须切回主任务页面继续填写/提交，不要在查询页直接 done 成问答总结。"',
				].join(' ')
				: [
					'- information_query',
					'status="active"',
					`sourceState="${sourceState}"`,
					`evidenceCount="${snippets.length}"`,
					'guidance="这是信息查询/问答任务；目标是收集少量可信可见证据后用 done 直接回答用户。不要把网页浏览本身当完成，也不要为了完美继续无限开链接、滚动或 inspect。"',
				].join(' '),
			valueLookup
				? '- information_value_rule minEvidence="1" guidance="若当前观察、搜索结果摘要、文章标题/正文片段或已打开来源足以提取字段值，应把值写入 memory/thought，并切换回主任务页面继续操作；证据不足时请求上下文或换来源，不要输出最终问答。"'
				: '- information_answer_rule minEvidence="1" guidance="若当前观察、搜索结果摘要、文章标题/正文片段或已打开来源足以支撑结论，应输出 done(success=true) 给出答案、依据和不确定性；证据不足时也要明确缺口，不要空转。"',
		]
		if (snippets.length) {
			lines.push(`- information_evidence snippets="${escapeAttr(snippets.slice(0, 5).join(' | '))}"`)
		}
		if (!valueLookup && sourceState === 'sparse' && hasRecentInformationSourceStall(session)) {
			lines.push('- information_source status="unreadable" guidance="当前来源在等待/滚动/补上下文后仍缺少可读正文；下一步应切换到已打开的相关来源或搜索结果页，或 done(false) 说明来源不可读和已缺少哪些证据；不要重复同一方向滚动、重复点击同一查看原文链接或重复 inspect 同一区域。"')
		}
		return lines
	}

	function deriveInformationQueryPostContextDecision(session, workflowContextText, planningContext, context = {}) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!isInformationQueryTask(taskText)) return null
		if (isInformationValueLookupSubtask(session)) return null
		if (!String(workflowContextText || '').includes('information_query')) return null
		const requestCount = countInformationContentContextRequests(planningContext)
		if (requestCount < 2) return null
		const observation = context?.observation || {}
		const snippets = collectInformationEvidenceSnippets(observation, taskText)
		if (!isSparseInformationSource(observation, snippets) || !hasRecentInformationSourceStall(session)) return null
		return deriveInformationQueryRecoveryDecision(session, observation, context, {
			reason: '当前信息来源补充上下文后仍没有可读正文证据。',
		})
	}

	function deriveInformationQueryRecoveryDecision(session, observation, context = {}, options = {}) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!isInformationQueryTask(taskText)) return null
		if (isInformationValueLookupSubtask(session)) return null
		const snippets = collectInformationEvidenceSnippets(observation, taskText)
		if (!isSparseInformationSource(observation, snippets) && !hasRecentInformationSourceStall(session)) return null
		const tab = findInformationQueryAlternateTab(session, context?.tabsSummary || [], taskText)
		const reason = String(options.reason || '当前信息来源缺少可读证据，继续等待或滚动风险较高。').trim()
		if (tab) {
			return {
				evaluation_previous_goal: `${reason} 已找到另一个已打开的相关来源。`,
				memory: '信息查询任务应围绕证据和最终答复收束；当前来源不可读时改用其他已打开来源，避免重复滚动、等待或 inspect。',
				thought: '当前来源看不到可读内容，切换到已打开的相关页面继续提取证据。',
				next_goal: `切换到相关信息来源：${shortWorkflowText(tab.title || tab.url || '已打开标签页', 80)}`,
				action: {
					name: 'switch_to_tab',
					input: {
						tab_id: tab.id,
						target_label: shortWorkflowText(tab.title || tab.url || '相关信息来源', 120),
						target_url: shortWorkflowText(tab.url || '', 240),
						reason: '当前信息来源不可读，改用已打开的相关来源继续信息查询。',
						workflow_step: 'information_query_alternate_source',
					},
				},
			}
		}
		return {
			evaluation_previous_goal: `${reason} 未找到更可靠的已打开来源。`,
			memory: '信息查询任务已经遇到不可读来源；为避免继续空转，停止并说明缺少的证据。',
			thought: '当前来源不可读且没有可切换的相关标签页，先把阻塞原因告诉用户。',
			next_goal: '结束信息查询并说明证据缺口',
			action: {
				name: 'done',
				input: {
					text: '当前信息来源在等待、滚动或补充上下文后仍没有可读正文证据，也没有找到可切换的相关来源，因此无法可靠形成最终答复。请换一个可访问来源或重新发起查询。',
					success: false,
					workflow_step: 'information_query_unreadable_source',
				},
			},
		}
	}

	function isInformationQueryTask(taskText) {
		const text = String(taskText || '').trim()
		if (!text) return false
		if (/(测试|验证|检查|每个|每一个|所有|全部|功能是否|是否正常|test|verify|check)/i.test(text)) return false
		return /(搜索一下|搜一下|查一下|查询一下|检索|网上搜索|最新|价格|行情|新闻|资讯|总结|分析|是否|是不是|值得|买入|卖出|search\s+(?:for|web)|look\s*up|research|latest|price|news|summari[sz]e|analy[sz]e|whether|worth)/i.test(text)
	}

	function isInformationValueLookupSubtask(session) {
		const operation = String(
			taskIntent?.getOperation?.(session) ||
			session?.workflowState?.taskIntent?.intent?.operation ||
			session?.taskIntent?.operation ||
			''
		).trim()
		if (/^(create|edit|fill_form)$/i.test(operation)) return true
		const text = String([session?.latestTask, session?.task].filter(Boolean).join(' ')).trim()
		return /(创建|新增|新建|添加|编辑|修改|更新|填写|填入|填表|录入|设置|保存|提交|create|add|new|edit|update|change|fill|save|submit)/i.test(text) &&
			/(作为|用于|用作|填入|填写|写入|设置为|命名为|字段|表单|账号|用户名|名称|标题|as\s+(?:the\s+)?|use\s+.+\s+as|field|form|username|account|name|title)/i.test(text)
	}

	function collectInformationEvidenceSnippets(observation, taskText) {
		const keywords = extractInformationQueryKeywords(taskText)
		const snippets = []
		const seen = new Set()
		const add = (value) => {
			const text = shortWorkflowText(String(value || '').replace(/\s+/g, ' ').trim(), 160)
			if (!isUsefulInformationEvidenceText(text, keywords)) return
			const key = text.toLowerCase()
			if (seen.has(key)) return
			seen.add(key)
			snippets.push(text)
		}
		add(observation?.title)
		for (const item of [
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...(Array.isArray(observation?.actions) ? observation.actions : []),
		]) {
			if (isLikelyChromeOnlyInformationItem(item)) continue
			add(getObservedItemLabel(item) || item?.text || item?.description)
		}
		for (const table of (Array.isArray(observation?.tables) ? observation.tables : [])) {
			for (const row of (Array.isArray(table?.rows) ? table.rows : [])) {
				add(Array.isArray(row) ? row.join(' ') : row)
			}
		}
		return snippets.slice(0, 8)
	}

	function isUsefulInformationEvidenceText(text, keywords) {
		const value = String(text || '').trim()
		if (!value || value.length < 3) return false
		if (/^(empty|share article|toggle side menu|更多|分享|菜单|登录|注册)$/i.test(value)) return false
		const compact = value.replace(/\s+/g, '').toLowerCase()
		if (/(?:\d[\d,.]*\s*(?:美元|美金|元|%|％|usd|eur|cny|jpy|gbp|ounce|oz|盎司)|[$¥€£]\s*\d)/i.test(value)) return true
		for (const keyword of (Array.isArray(keywords) ? keywords : [])) {
			if (keyword && compact.includes(keyword)) return true
		}
		return /(结论|摘要|概览|观点|分析|建议|风险|趋势|价格|行情|新闻|answer|summary|analysis|price|trend|risk|source)/i.test(value)
	}

	function extractInformationQueryKeywords(taskText) {
		const text = String(taskText || '').toLowerCase()
		const stop = new Set(['一下', '然后', '帮我', '现在', '是不是', '是否', '最佳', '时间', '最新', '搜索', '查询', '总结', '分析', '这个', '那个', '什么', '怎么', '一下现在'])
		const values = []
		for (const match of text.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
			const word = match[0]
			for (let size = 2; size <= Math.min(4, word.length); size += 1) {
				for (let index = 0; index <= word.length - size; index += 1) {
					const token = word.slice(index, index + size)
					if (!stop.has(token)) values.push(token)
				}
			}
		}
		for (const match of text.matchAll(/[a-z][a-z0-9-]{2,}/g)) {
			const token = match[0]
			if (!/^(the|and|for|with|latest|search|look|research|summary)$/.test(token)) values.push(token)
		}
		const unique = []
		for (const value of values) addUnique(unique, value)
		return unique.slice(0, 40)
	}

	function isLikelyChromeOnlyInformationItem(item) {
		const region = String(item?.region || '').toLowerCase()
		const label = String(getObservedItemLabel(item) || item?.text || '').trim()
		if (/^(header|sidebar|pagination)$/.test(region) && !/[0-9]|价格|行情|新闻|摘要|概览|分析|建议|price|news|summary|analysis/i.test(label)) return true
		return /^(share article|toggle side menu|更多输入项|麦克风|新话题|历史记录|应用|账号|首页|microphone|new topic|history|apps|account|home)$/i.test(label)
	}

	function isSparseInformationSource(observation, snippets) {
		const contentActions = (Array.isArray(observation?.actions) ? observation.actions : [])
			.filter((item) => String(item?.region || '') === 'content')
			.length
		const contentElements = (Array.isArray(observation?.elements) ? observation.elements : [])
			.filter((item) => String(item?.region || '') === 'content')
			.length
		const tableRows = (Array.isArray(observation?.tables) ? observation.tables : [])
			.reduce((total, table) => total + (Array.isArray(table?.rows) ? table.rows.length : 0), 0)
		return (Array.isArray(snippets) ? snippets : []).length < 2 && tableRows === 0 && contentActions + contentElements <= 3
	}

	function hasRecentInformationSourceStall(session) {
		const history = Array.isArray(session?.history) ? session.history : []
		return history.slice(-10).some((item) => {
			const action = String(item?.action || '').trim()
			const input = item?.input && typeof item.input === 'object' ? item.input : {}
			const text = [
				action,
				input.target_label,
				input.reason,
				item?.output,
				item?.outcome?.reason,
				item?.nextGoal,
			].join(' ')
			return /(页面未发生纵向滚动|scroll_no_progress|正文未显示|正文缺失|不可读|没有可滚动|查看原文|no vertical movement|unreadable|no readable content|body missing)/i.test(text)
		})
	}

	function countInformationContentContextRequests(planningContext) {
		return (Array.isArray(planningContext) ? planningContext : [])
			.filter((item) => {
				const name = String(item?.name || '').trim()
				const input = item?.input && typeof item.input === 'object' ? item.input : {}
				const text = String(item?.text || '')
				if (name === 'inspect_region' && String(input.region || '') === 'content') return true
				if (name === 'request_context' && /content|simplified_dom|raw_candidates|actions/.test(String(input.source || input.region || ''))) return true
				return /request="inspect_region"[\s\S]*region="content"|region_detail region="content"/.test(text)
			})
			.length
	}

	function findInformationQueryAlternateTab(session, tabsSummary, taskText) {
		const tabs = Array.isArray(tabsSummary) ? tabsSummary : []
		const current = tabs.find((tab) => tab?.current) || null
		const keywords = extractInformationQueryKeywords(taskText)
		let best = null
		for (const tab of tabs) {
			if (!tab || tab.current || !tab.id) continue
			const title = String(tab.title || '')
			const url = String(tab.url || '')
			if (!/^https?:\/\//i.test(url)) continue
			if (hasRecentlySwitchedInformationTab(session, tab)) continue
			const score = scoreInformationQueryTab(title, url, taskText, keywords)
			if (score <= 0) continue
			if (!best || score > best.score) best = { ...tab, score }
		}
		if (!best) return null
		const currentScore = current ? scoreInformationQueryTab(current.title || '', current.url || '', taskText, keywords) : 0
		return best.score >= Math.max(2, currentScore) ? best : null
	}

	function scoreInformationQueryTab(title, url, taskText, keywords) {
		const text = `${title} ${url}`.replace(/\s+/g, '').toLowerCase()
		if (!text || /(localhost|127\.0\.0\.1|chrome:\/\/|about:blank)/i.test(text)) return 0
		let score = 0
		const compactTask = String(taskText || '').replace(/\s+/g, '').toLowerCase()
		if (compactTask && text.includes(compactTask.slice(0, Math.min(28, compactTask.length)))) score += 5
		for (const keyword of (Array.isArray(keywords) ? keywords : [])) {
			if (keyword && text.includes(keyword)) score += 1
		}
		if (/search|news|article|insight|analysis|finance|market|财经|新闻|价格|行情|分析|观点/i.test(`${title} ${url}`)) score += 1
		return score
	}

	function hasRecentlySwitchedInformationTab(session, tab) {
		const history = Array.isArray(session?.history) ? session.history : []
		const targetId = String(tab?.id || '')
		const targetTitle = String(tab?.title || '').trim()
		return history.slice(-8).some((item) => {
			if (String(item?.action || '') !== 'switch_to_tab') return false
			const input = item?.input && typeof item.input === 'object' ? item.input : {}
			return String(input.tab_id || '') === targetId ||
				(targetTitle && String(input.target_label || input.target_title || '').includes(targetTitle.slice(0, 40)))
		})
	}

	function buildNavigationRevealDecision(state, observation, unresolved, reason, options = {}) {
		const visionDecision = buildCompositeNavigationVisionDecision(state, observation, unresolved, reason)
		if (visionDecision) return visionDecision
		const revealCandidate = findNavigationRevealCandidate(observation, state, unresolved, options)
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

	function deriveSearchWorkflowDecisionIfAllowed(session, observation, context = {}) {
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReachedForSession(session, observation, key, state))
		if (unresolved.length && !canContinueSearchWorkflowAfterPrerequisite(session, observation)) return null
		if (typeof searchWorkflow.deriveSearchWorkflowDecision !== 'function') return null
		const decision = searchWorkflow.deriveSearchWorkflowDecision(session, observation)
		if (shouldDeferSearchDecisionToModel(decision)) {
			if (String(context?.workflowPhase || '') === 'pre_model' && typeof searchWorkflow.recordSearchWorkflowDeferral === 'function') {
				searchWorkflow.recordSearchWorkflowDeferral(session, decision)
			}
			return null
		}
		return decision
	}

	function canContinueSearchWorkflowAfterPrerequisite(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!isSearchFieldCoverageTaskText(taskText)) return false
		if (!hasRecentRecordViewReturnAttempt(session)) return false
		return hasExpandedSearchFilterArea(observation)
	}

	function isSearchFieldCoverageTaskText(taskText) {
		const text = String(taskText || '')
		return /(搜索|查询|筛选|过滤|search|filter)/i.test(text) &&
			/(测试|验证|检查|每个|每一个|所有|全部|功能|是否正常|test|verify|check)/i.test(text)
	}

	function hasExpandedSearchFilterArea(observation) {
		const panels = Array.isArray(observation?.panels) ? observation.panels : []
		const hasPanel = panels.some((panel) => {
			const text = getNavigationKey([panel?.kind, panel?.label, panel?.triggerLabel, panel?.fields].filter(Boolean).join(' '))
			return /^expanded$/i.test(String(panel?.state || '')) &&
				/(filter|search|搜索|查询|筛选)/i.test(text)
		})
		if (!hasPanel) return false
		return collectObservedFormFields(observation).some((field) => {
			const region = getNavigationKey(field?.region)
			if (region && !/^(content|dialog|main)$/.test(region)) return false
			const label = getNavigationKey([field?.searchLabel, field?.label, field?.placeholder, field?.text].filter(Boolean).join(' '))
			return !!label && Number.isFinite(Number(field?.index))
		})
	}

	function deriveInputFieldTestWorkflowDecision(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '').trim()
		if (!isInputFieldTestTaskText(taskText)) return null
		const state = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReachedForSession(session, observation, key, state))
		if (unresolved.length) return null
		const candidates = collectInputFieldTestCandidates(observation)
		if (!candidates.length) {
			return {
				evaluation_previous_goal: '任务要求测试输入框，但当前观察没有可安全测试的普通可编辑输入控件。',
				memory: '通用输入框测试 workflow 已排除页头/分页/导航、验证码/令牌/上传、下拉、日期等非普通输入控件。',
				thought: '没有稳定输入目标时停止，避免随机点击或填写非目标控件。',
				next_goal: '停止输入框测试并报告原因',
				action: {
					name: 'done',
					input: {
						success: false,
						text: '没有观察到可安全测试的普通输入框；已跳过页头、分页、导航、验证码、令牌、上传、下拉和日期等非普通输入控件。',
						workflow_step: 'finish_field_test',
						workflow_field_total: 0,
					},
				},
			}
		}
		const attemptedKeys = getInputFieldTestAttemptedKeys(session)
		const nextIndex = candidates.findIndex((item) => !attemptedKeys.has(item.key))
		if (nextIndex < 0) {
			const failed = countFailedInputFieldTestAttempts(session, new Set(candidates.map((item) => item.key)))
			return {
				evaluation_previous_goal: `当前页面可安全测试的普通输入框均已逐项尝试，共 ${candidates.length} 项${failed ? `，其中 ${failed} 项失败` : ''}。`,
				memory: failed
					? '输入框逐项测试已完成覆盖，但存在失败字段，最终结果需要标记为异常。'
					: '输入框逐项测试已完成覆盖，没有发现动作级失败。',
				thought: '所有候选输入框都已形成输入动作记录，停止 workflow 并交给结果总结聚合。',
				next_goal: '结束输入框测试',
				action: {
					name: 'done',
					input: {
						success: failed === 0,
						text: failed
							? `已完成当前页面普通输入框逐项测试：共 ${candidates.length} 项，${failed} 项输入失败，请查看字段级结果总结。`
							: `已完成当前页面普通输入框逐项测试：共 ${candidates.length} 项，均已逐项输入测试值。`,
						workflow_step: 'finish_field_test',
						workflow_field_total: candidates.length,
						workflow_failed_count: failed,
					},
				},
			}
		}
		const item = candidates[nextIndex]
		const value = buildInputFieldTestValue(item.field)
		const constraintAware = hasInputFieldConstraintHints(item.field)
		return {
			evaluation_previous_goal: `任务要求测试页面每一个输入框，已识别到 ${candidates.length} 个可安全测试的普通输入控件。`,
			memory: `使用通用输入框逐项测试 workflow，当前测试 "${item.label}"，不依赖具体应用名称或预设数据。`,
			thought: '对普通可编辑输入框写入类型匹配的固定测试值，只验证输入控件可写入，不把筛选/搜索结果验证混入本 workflow。',
			next_goal: `测试输入框 ${item.label}`,
			action: {
				name: 'input_text',
				input: {
					index: Number(item.field.index),
					text: value,
					target_label: item.label,
					workflow_step: 'test_input_field',
					workflow_field_key: item.key,
					workflow_field_index: Number(item.field.index),
					workflow_field_label: item.label,
					workflow_field_type: item.fieldType,
					workflow_field_order: nextIndex + 1,
					workflow_field_total: candidates.length,
					workflow_test_value: value,
					workflow_value_source: constraintAware ? 'type_constraints' : 'type_default',
					workflow_value_basis: constraintAware ? buildInputFieldConstraintBasis(item.field) : '',
				},
			},
		}
	}

	function shouldDeferSearchDecisionToModel(decision) {
		const action = decision?.action || {}
		const input = action?.input || {}
		return String(action.name || '') === 'done' &&
			input.success === false &&
			(
				input.workflow_missing_table_samples === true ||
				input.workflow_option_sample_mismatch === true ||
				input.workflow_option_candidates_unobserved === true ||
				input.workflow_submit_action_missing === true ||
				input.workflow_reset_action_missing === true
			)
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

	function findConcreteNavigationAliasCandidateForKey(observation, key, state = null) {
		const targetKey = getNavigationKey(key)
		if (!targetKey) return null
		const items = collectObservedNavigationStateItems(observation)
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => isNavigationCandidateItem(item))
			.filter((item) => labelMatchesNavigationKey(getObservedItemLabel(item), targetKey))
			.filter((item) => isConcreteNavigationAliasCandidate(item, targetKey))
			.filter((item) => !hasExactNavigationAttempt(state, getObservedItemLabel(item)))
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

	function findNavigationRevealCandidate(observation, state, targetKeys = [], options = {}) {
		const attempted = new Set((Array.isArray(state?.revealAttemptKeys) ? state.revealAttemptKeys : [])
			.map((value) => String(value || '')))
		const baseItems = collectObservedNavigationStateItems(observation)
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => !attempted.has(buildNavigationRevealAttemptKey(item)))
			.filter((item) => !hasExactNavigationAttempt(state, getObservedItemLabel(item)))
		const items = baseItems.filter((item) => isNavigationRevealCandidateItem(item, targetKeys))
		if (items.length) return items.sort((a, b) => scoreNavigationRevealCandidate(a, targetKeys) - scoreNavigationRevealCandidate(b, targetKeys))[0]
		if ((Array.isArray(targetKeys) ? targetKeys : []).map(getNavigationKey).some(Boolean)) {
			const genericContainers = baseItems.filter(isGenericCollapsedNavigationContainer)
			if (genericContainers.length === 1) return genericContainers[0]
			const allowExploratory = Boolean(options?.allowExploratory)
			const exploratoryContainers = allowExploratory
				? baseItems.filter((item) => isExploratoryNavigationRevealCandidateItem(item, targetKeys))
				: []
			if (allowExploratory && exploratoryContainers.length) {
				return exploratoryContainers.sort((a, b) =>
					scoreExploratoryNavigationRevealCandidate(a, targetKeys) -
					scoreExploratoryNavigationRevealCandidate(b, targetKeys)
				)[0]
			}
		}
		return null
	}

	function isGenericCollapsedNavigationContainer(item) {
		const region = getNavigationKey(item?.region)
		if (region !== 'header' && region !== 'sidebar') return false
		if (isSelectedOrActiveObservedItem(item)) return false
		const role = getNavigationKey(item?.role)
		if (!/^(menuitem|button|link|tab)$/.test(role)) return false
		const label = getNavigationKey(getObservedItemLabel(item))
		const rel = getNavigationKey(item?.rel || item?.ariaControls || item?.ariaOwns || '')
		const expanded = getNavigationKey(item?.expandedState || item?.expanded || '')
		const stateText = getNavigationKey(item?.stateHints || item?.state || '')
		const hasPopup = /haspopup|dropdown|menu|list/.test(rel)
		const expandable = expanded === 'collapsed' || hasPopup || /(submenu|dropdown|menu|collapsed|fold)/.test(stateText)
		return expandable && isStructuralNavigationContainerLabel(label)
	}

	function isExploratoryNavigationRevealCandidateItem(item, targetKeys = []) {
		const region = getNavigationKey(item?.region)
		if (region !== 'header' && region !== 'sidebar') return false
		if (isSelectedOrActiveObservedItem(item)) return false
		const role = getNavigationKey(item?.role)
		if (!/^(menuitem|button|link|tab)$/.test(role)) return false
		const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
		if (/^(textbox|combobox|option|checkbox|radio|switch|listbox)$/.test(role)) return false
		if (/(dropdown|select|checkbox|radio|cascader)/i.test(control)) return false
		const label = getNavigationKey(getObservedItemLabel(item))
		if (!isSafeExploratoryNavigationContainerLabel(label)) return false
		if (!isExpandableNavigationContainer(item)) return false
		if ((Array.isArray(targetKeys) ? targetKeys : []).some((target) => labelMatchesNavigationKey(label, getNavigationKey(target)))) return false
		return true
	}

	function isExpandableNavigationContainer(item) {
		const rel = getNavigationKey(item?.rel || item?.ariaControls || item?.ariaOwns || '')
		const expanded = getNavigationKey(item?.expandedState || item?.expanded || '')
		const stateText = getNavigationKey(item?.stateHints || item?.state || '')
		return expanded === 'collapsed' ||
			/haspopup|dropdown|menu|list/.test(rel) ||
			/(submenu|sub-menu|dropdown|menu|collapsed|fold|expandable|haschildren|has-children|treeitem)/.test(stateText)
	}

	function isSafeExploratoryNavigationContainerLabel(label) {
		const key = getNavigationKey(label)
		if (!key) return false
		if (key.length > 30) return false
		if (isStructuralNavigationContainerLabel(key)) return true
		if (/^(首页|主页|home|搜索|查询|筛选|搜索内容|登录|登陆|退出|退出登录|个人信息|用户中心|消息|通知|帮助|刷新|返回|关闭|取消|保存|提交|确定|上一页|下一页|分页|新建|新增|创建|添加|编辑|删除|详情|导入|导出)$/i.test(key)) {
			return false
		}
		return !/(新增|新建|创建|添加|编辑|删除|详情|明细|导入|导出|保存|提交|确定|取消)$/i.test(key)
	}

	function isStructuralNavigationContainerLabel(label) {
		const key = getNavigationKey(label)
		if (!key) return false
		return /^(更多|更多菜单|菜单|导航|全部|全部菜单|展开菜单|more|moremenu|menu|navigation|nav|all|allmenu)$/i.test(key)
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
		const expandable = expanded === 'collapsed' || hasPopup || /(submenu|dropdown|menu|collapsed|fold)/.test(stateText)
		if (/^(更多|更多菜单|菜单|导航|全部|全部菜单|展开菜单)$/.test(label)) return true
		if (isPotentialNavigationParentCandidate(label, role, targetKeys, expandable)) return true
		if ((Array.isArray(targetKeys) ? targetKeys : []).map(getNavigationKey).filter(Boolean).length) return false
		return false
	}

	function isLikelyNavigationContainerLabel(label, role) {
		if (!label) return false
		if (/^(首页|主页|home|展开选项|搜索内容|搜索|查询|筛选|登录|退出|消息|通知)$/.test(label)) return false
		return /^(menuitem|button|link|tab)$/.test(role) && isStructuralNavigationContainerLabel(label)
	}

	function isPotentialNavigationParentCandidate(label, role, targetKeys = [], expandable = false) {
		if (!/^(menuitem|button|link|tab)$/.test(role)) return false
		if (!label) return false
		if (isLikelyNavigationContainerLabel(label, role)) return true
		return (Array.isArray(targetKeys) ? targetKeys : []).some((targetKey) =>
			hasStrongNavigationParentRelation(label, targetKey, expandable)
		)
	}

	function hasStrongNavigationParentRelation(label, targetKey, expandable = false) {
		const parent = getNavigationKey(label)
		const target = getNavigationKey(targetKey)
		if (!parent || !target) return false
		if (parent === target) return !!expandable
		if (target.includes(parent) || parent.includes(target)) return !!expandable
		const targetStem = stripNavigationSuffix(target)
		if (targetStem && targetStem !== target && parent === targetStem) return !!expandable
		if (scoreNavigationParentRelation(parent, target) > -10) return false
		if (isLikelyLeafNavigationLabel(parent, target)) return false
		return false
	}

	function isNavigationContainerName(label) {
		const key = getNavigationKey(label)
		if (!key) return false
		return isStructuralNavigationContainerLabel(key)
	}

	function isLikelyLeafNavigationLabel(label, targetKey) {
		const key = getNavigationKey(label)
		const target = getNavigationKey(targetKey)
		if (!key || key === target || target.includes(key) || key.includes(target)) return false
		if (isNavigationContainerName(key)) return false
		return /(新增|新建|创建|详情|明细|查看|编辑|删除|导入|导出)$/i.test(key)
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

	function scoreExploratoryNavigationRevealCandidate(item, targetKeys = []) {
		const label = getNavigationKey(getObservedItemLabel(item))
		let score = scoreNavigationRevealCandidate(item, targetKeys)
		if (isStructuralNavigationContainerLabel(label)) score -= 8000000
		if (/(管理|中心|系统|设置|配置|工具|console|admin|management|settings|config)$/i.test(label)) score -= 2000000
		return score
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

	const NAVIGATION_PARENT_RELATION_RULES = []

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
		return /^(管理|中心|模块|页面|列表|系统|数据|信息|设置|配置)$/.test(getNavigationKey(value))
	}

	function isFirstRecordDetailTask(taskText) {
		const text = String(taskText || '')
		return /(第一条|第一行|首条|首行|第一位|第\s*1\s*条|第\s*1\s*行|列表第一)/i.test(text) &&
			/(详情|明细|查看|预览|view|detail|details|preview)/i.test(text)
	}

	function taskHasPostRecordViewContinuation(taskText) {
		const text = String(taskText || '').trim()
		if (!text) return false
		const detailMatches = Array.from(text.matchAll(/(?:第一条|第一行|首条|首行|第一位|第\s*1\s*[条行]|列表第一)?.{0,24}(?:详情|明细|查看|预览|detail|details|view|preview)/gi))
		const last = detailMatches[detailMatches.length - 1]
		if (!last) return false
		const suffix = text.slice(Number(last.index || 0) + String(last[0] || '').length)
		if (!/(然后|接着|再|随后|继续|回到|返回|去|到|并且|同时|then|next|after|continue|back|return|and)/i.test(suffix)) return false
		return /(搜索|查询|筛选|过滤|测试|验证|检查|排查|填写|填入|填表|录入|新增|新建|创建|添加|编辑|修改|更新|删除|导入|导出|search|query|filter|test|verify|check|fill|create|add|new|edit|update|delete|import|export)/i.test(suffix)
	}

	function findRecordViewReturnCandidate(observation) {
		const candidates = collectRecordViewReturnCandidateItems(observation)
			.filter(isRecordViewReturnCandidateItem)
			.sort(scoreRecordViewReturnCandidate)
		return candidates[0] || null
	}

	function collectRecordViewReturnCandidateItems(observation) {
		return uniqueObservedItems([
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...collectTextNavigationItems(observation),
		])
	}

	function isRecordViewReturnCandidateItem(item) {
		const index = Number(item?.index)
		if (!Number.isFinite(index)) return false
		const region = getNavigationKey(item?.region)
		if (region && !/^(content|dialog|header|main)$/.test(region)) return false
		if (isSelectedOrActiveObservedItem(item)) return false
		const role = getNavigationKey(item?.role)
		if (role && !/^(button|link|menuitem)$/.test(role)) return false
		const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
		if (/(dropdown|select|checkbox|radio|switch|cascader|textbox|combobox|listbox)/i.test(control)) return false
		const label = getNavigationKey(getObservedItemLabel(item))
		if (!label) return false
		if (/(保存|提交|删除|移除|新增|新建|创建|添加|编辑|修改|搜索|查询|筛选|重置|导入|导出|登录|注册|save|submit|delete|remove|create|add|new|edit|search|query|filter|reset|import|export|login|sign)/i.test(label)) return false
		return /^(返回|返回列表|返回上一页|回列表|回到列表|关闭|取消|收起|back|backtolist|return|returntolist|close|cancel|×|x)$/.test(label) ||
			/(返回列表|回到列表|返回上一页|backtolist|returntolist)/i.test(label)
	}

	function scoreRecordViewReturnCandidate(a, b) {
		return getRecordViewReturnCandidateScore(a) - getRecordViewReturnCandidateScore(b)
	}

	function getRecordViewReturnCandidateScore(item) {
		const label = getNavigationKey(getObservedItemLabel(item))
		const region = getNavigationKey(item?.region)
		const rect = normalizeWorkflowRect(item?.rect)
		let score = 0
		if (/^(返回列表|回列表|回到列表|backtolist|returntolist)$/.test(label)) score -= 40
		else if (/^(返回|返回上一页|back|return)$/.test(label)) score -= 28
		else if (/^(关闭|取消|close|cancel|×|x)$/.test(label)) score -= 12
		if (region === 'content' || region === 'dialog') score -= 8
		else if (region === 'header') score += 6
		score += rect ? Math.max(0, rect.top) / 1000 + Math.max(0, rect.left) / 100000 : 50
		return score
	}

	function hasRecentRecordViewReturnAttempt(session) {
		return getRecentHistoryItems(session, 4).some((item) => {
			const input = item?.input || {}
			return String(input.workflow_step || '') === 'return_after_record_view'
		})
	}

	function hasRecordViewReturnAttempt(session) {
		if (session?.workflowState?.recordView?.returned === true) return true
		return hasHistoryItem(session, isRecordViewReturnHistoryItem)
	}

	function hasRecentSuccessfulRecordViewAttempt(session) {
		return getRecentHistoryItems(session, 6).some((item) => {
			if (item?.success === false) return false
			return isRecordViewHistoryItem(item)
		})
	}

	function hasSuccessfulRecordViewAttempt(session) {
		if (session?.workflowState?.recordView?.viewed === true) return true
		return hasHistoryItem(session, (item) => {
			if (item?.success === false) return false
			return isRecordViewHistoryItem(item)
		})
	}

	function hasRecentRecordViewAttempt(session) {
		return getRecentHistoryItems(session, 6).some((item) => isRecordViewHistoryItem(item))
	}

	function hasRecordViewAttempt(session) {
		return hasSuccessfulRecordViewAttempt(session) || hasRecentRecordViewAttempt(session)
	}

	function isRecordViewHistoryItem(item) {
		const input = item?.input || {}
		return String(input.workflow_step || '') === 'view_first_record_detail'
	}

	function isRecordViewReturnHistoryItem(item) {
		const input = item?.input || {}
		return String(input.workflow_step || '') === 'return_after_record_view'
	}

	function hasHistoryItem(session, predicate) {
		const history = Array.isArray(session?.history) ? session.history : []
		return history.some((item) => {
			try {
				return !!predicate(item)
			} catch (_) {
				return false
			}
		})
	}

	function recordRecordViewWorkflowOutcome(session, decision, outcome) {
		if (!session || !decision) return
		if (!session.workflowState || typeof session.workflowState !== 'object') session.workflowState = {}
		const state = session.workflowState.recordView && typeof session.workflowState.recordView === 'object'
			? session.workflowState.recordView
			: {}
		session.workflowState.recordView = state
		const input = decision?.action?.input || {}
		const step = String(input.workflow_step || '').trim()
		if (outcome?.success === false) {
			state.failedReason = String(outcome?.output || outcome?.message || outcome?.reason || 'record-view action failed')
			return
		}
		if (step === 'view_first_record_detail') {
			state.viewed = true
			state.failedReason = ''
		} else if (step === 'return_after_record_view') {
			state.returned = true
			state.failedReason = ''
		} else if (step === 'finish_record_view') {
			state.finished = true
			state.failedReason = ''
		}
	}

	function isSuccessfulDoneDecision(decision) {
		const action = String(decision?.action?.name || '').trim()
		if (action !== 'done') return false
		const input = decision?.action?.input || {}
		return input.success !== false
	}

	function findFirstRecordDetailCandidate(observation) {
		const listRects = getRecordListEvidenceRects(observation)
		if (!listRects.length && hasPositivePaginationRecordEvidence(observation)) return null
		const candidates = collectRecordDetailCandidateItems(observation)
			.filter(isRecordDetailCandidateItem)
			.filter((item) => isRecordDetailCandidateNearList(item, listRects))
			.sort((a, b) => scoreRecordDetailCandidate(a, listRects) - scoreRecordDetailCandidate(b, listRects))
		return candidates[0] || null
	}

	function hasRecordListEvidence(observation) {
		return getRecordListEvidenceTables(observation).length > 0 ||
			hasPositivePaginationRecordEvidence(observation)
	}

	function getRecordListEvidenceTables(observation) {
		return (Array.isArray(observation?.tables) ? observation.tables : [])
			.filter((table) => {
				const region = getNavigationKey(table?.region)
				if (region && region !== 'content' && region !== 'dialog') return false
				const rows = Array.isArray(table?.rows) ? table.rows : []
				return rows.some((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim()))
			})
	}

	function getRecordListEvidenceRects(observation) {
		return getRecordListEvidenceTables(observation)
			.map((table) => normalizeWorkflowRect(table?.rect))
			.filter(Boolean)
	}

	function hasPositivePaginationRecordEvidence(observation) {
		return getPositivePaginationRecordEvidenceItems(observation).length > 0
	}

	function getPositivePaginationRecordEvidenceItems(observation) {
		const items = [
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...(Array.isArray(observation?.popups) ? observation.popups : []),
			...(Array.isArray(observation?.options) ? observation.options : []),
			...collectObservedFormFields(observation),
		]
		const evidence = items
			.filter((item) => {
				const region = getNavigationKey(item?.region)
				const text = [
					getObservedItemLabel(item),
					item?.valueState,
					item?.value,
					item?.stateHints,
				].filter(Boolean).join(' ')
				return (region === 'pagination' || /分页|pagination|pager|page-size|page-jump/i.test(text)) &&
					extractPositiveRecordTotal(text) > 0
			})
		for (const row of (Array.isArray(observation?.simplifiedDom) ? observation.simplifiedDom : [])) {
			const text = String(row || '')
			if (/region=["']?pagination|pagination|分页|pager/i.test(text) && extractPositiveRecordTotal(text) > 0) {
				evidence.push({ label: text, region: 'pagination' })
			}
		}
		return evidence
	}

	function collectObservedFormFields(observation) {
		const fields = []
		for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
			for (const field of (Array.isArray(form?.fields) ? form.fields : [])) {
				if (field && typeof field === 'object') fields.push(field)
			}
		}
		return fields
	}

	function extractPositiveRecordTotal(value) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		if (!text) return 0
		const patterns = [
			/(?:共|总计|总共|合计|total)\s*[:：]?\s*([1-9]\d*)\s*(?:条|项|筆|笔|records?|items?|rows?)?/i,
			/(?:records?|items?|rows?)\s*[:：]?\s*([1-9]\d*)/i,
			/(?:of|\/)\s*([1-9]\d*)\b/i,
		]
		for (const pattern of patterns) {
			const match = text.match(pattern)
			const total = Number(match?.[1])
			if (Number.isFinite(total) && total > 0) return total
		}
		return 0
	}

	function isRecordDetailCandidateNearList(item, listRects) {
		const rects = Array.isArray(listRects) ? listRects : []
		if (!rects.length) return true
		const rect = normalizeWorkflowRect(item?.rect)
		if (!rect) return false
		const centerX = rect.left + rect.width / 2
		const centerY = rect.top + rect.height / 2
		return rects.some((listRect) =>
			centerY >= listRect.top - 16 &&
			centerY <= listRect.top + listRect.height + 48 &&
			centerX >= listRect.left - 80 &&
			centerX <= listRect.left + listRect.width + 240
		)
	}

	function collectRecordDetailCandidateItems(observation) {
		return uniqueObservedItems([
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...collectTextNavigationItems(observation),
		])
	}

	function isRecordDetailCandidateItem(item) {
		const index = Number(item?.index)
		if (!Number.isFinite(index)) return false
		const region = getNavigationKey(item?.region)
		if (region && region !== 'content') return false
		if (isSelectedOrActiveObservedItem(item)) return false
		const role = getNavigationKey(item?.role)
		if (role && !/^(button|link|menuitem)$/.test(role)) return false
		const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
		if (/(dropdown|select|checkbox|radio|switch|cascader|textbox|combobox|listbox)/i.test(control)) return false
		const label = getNavigationKey(getObservedItemLabel(item))
		const intent = getNavigationKey(item?.actionIntent || item?.intent)
		const target = getNavigationKey(item?.navigationTarget || item?.target || '')
		if (/^(详情|明细|查看|预览|detail|details|view|preview)$/.test(label)) return true
		return /(detail|details|view|preview|详情|明细|查看|预览)/i.test(`${intent} ${target}`) &&
			!/(新增|新建|创建|添加|删除|移除|编辑|保存|提交|取消|关闭|搜索|查询|重置|add|create|new|delete|remove|edit|save|submit|cancel|close|search|reset)/i.test(label)
	}

	function scoreRecordDetailCandidate(item, listRects = []) {
		const rect = item?.rect || {}
		const top = Number(rect.top)
		const left = Number(rect.left)
		const label = getNavigationKey(getObservedItemLabel(item))
		let score = 0
		if (/^(详情|查看|detail|view)$/.test(label)) score -= 8
		else if (/^(明细|预览|details|preview)$/.test(label)) score -= 4
		const normalized = normalizeWorkflowRect(rect)
		if (normalized && Array.isArray(listRects) && listRects.length) {
			const centerY = normalized.top + normalized.height / 2
			const nearestTableTop = Math.min(...listRects.map((listRect) => Math.abs(centerY - listRect.top)))
			score += Math.min(40, nearestTableTop / 12)
		}
		return score * 100000000 + (Number.isFinite(top) ? top : Number(item?.index) || 9999) * 10000 + (Number.isFinite(left) ? left : 0)
	}

	function normalizeWorkflowRect(rect) {
		if (!rect || typeof rect !== 'object') return null
		const left = Number(rect.left)
		const top = Number(rect.top)
		const width = Number(rect.width)
		const height = Number(rect.height)
		if (![left, top, width, height].every(Number.isFinite)) return null
		if (width <= 0 || height <= 0) return null
		return { left, top, width, height }
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
		const exactCreateLabel = isExactCreateEntryLabel(getObservedItemLabel(item))
		const role = getNavigationKey(item?.role)
		if (
			region &&
			!/^(content|header|dialog|popover)$/.test(region) &&
			!(region === 'sidebar' && exactCreateLabel && /^(button|link)$/.test(role))
		) return false
		if (isSelectedOrActiveObservedItem(item)) return false
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

	function isStrongCreateEntryCandidateItem(item) {
		const label = getNavigationKey(getObservedItemLabel(item))
		const role = getNavigationKey(item?.role)
		if (isExactCreateEntryLabel(label)) return true
		if (/^(新增|新建|创建|添加|增加)[\u4e00-\u9fa5a-z0-9_-]{1,8}$/.test(label)) {
			return !/(管理|审批|导入|搜索|查询|重置|删除|编辑)/.test(label)
		}
		if (/^(add|create|new)[a-z0-9_-]{1,16}$/.test(label)) return true
		return /^(button|link)$/.test(role) &&
			/(新增|新建|创建|添加|增加|add|create|new)/i.test(label) &&
			label.length <= 16 &&
			!/(管理|审批|导入|搜索|查询|重置|删除|编辑)/.test(label)
	}

	function isExactCreateEntryLabel(label) {
		const key = getNavigationKey(label)
		return /^(新增|新建|创建|添加|增加|add|create|new|\+)$/.test(key)
	}

	function scoreCreateEntryCandidate(item, entityHints) {
		const label = getNavigationKey(getObservedItemLabel(item))
		const intent = getNavigationKey(item?.actionIntent || item?.intent)
		const region = getNavigationKey(item?.region)
		const role = getNavigationKey(item?.role)
		let score = 0
		if (isExactCreateEntryLabel(label)) score -= 35
		else if (isStrongCreateEntryCandidateItem(item)) score -= 20
		if (/(新增|新建|创建|添加|增加|add|create|new)/i.test(intent)) score -= 12
		for (const hint of entityHints) {
			const key = getNavigationKey(hint)
			if (key && label.includes(key)) score -= 10
		}
		if (role === 'button' || role === 'link') score -= 8
		if (region === 'content' || region === 'dialog') score -= 10
		else if (region === 'sidebar' && isExactCreateEntryLabel(label)) score -= 4
		else if (region === 'header') score -= 1
		if (item?.newSinceLastObservation) score -= 2
		if (label.length > 12) score += Math.min(8, Math.floor((label.length - 12) / 4) + 1)
		const rect = item?.rect || {}
		return score * 1000000 + (Number(rect.top) || 0) * 1000 + (Number(rect.left) || 0)
	}

	function uniqueCreateEntryCandidates(items, entityHints) {
		const sorted = (Array.isArray(items) ? items : [])
			.filter(Boolean)
			.sort((a, b) => scoreCreateEntryCandidate(a, entityHints) - scoreCreateEntryCandidate(b, entityHints))
		const seenStrict = new Set()
		const seenLoose = new Set()
		const result = []
		for (const item of sorted) {
			const strictKey = buildCreateEntryCandidateStrictKey(item)
			const looseKey = buildCreateEntryCandidateLooseKey(item)
			if (strictKey && seenStrict.has(strictKey)) continue
			if (looseKey && seenLoose.has(looseKey)) continue
			if (strictKey) seenStrict.add(strictKey)
			if (looseKey) seenLoose.add(looseKey)
			result.push(item)
		}
		return result
	}

	function buildCreateEntryCandidateStrictKey(item) {
		const stableId = String(item?.stableId || '').trim()
		if (stableId) return `sid:${stableId}`
		const rectKey = buildRectBucketKey(item?.rect, 8)
		const label = getNavigationKey(getObservedItemLabel(item))
		const region = getNavigationKey(item?.region)
		const role = getNavigationKey(item?.role)
		if (rectKey) return `rect:${label}:${region}:${role}:${rectKey}`
		const index = Number(item?.index)
		return Number.isFinite(index) ? `index:${index}:${label}:${region}:${role}` : ''
	}

	function buildCreateEntryCandidateLooseKey(item) {
		const label = getNavigationKey(getObservedItemLabel(item))
		if (!isExactCreateEntryLabel(label)) return ''
		const region = getNavigationKey(item?.region)
		const role = getNavigationKey(item?.role)
		const rectKey = buildRectBucketKey(item?.rect, 16)
		return `${label}:${region}:${role}:${rectKey || 'no-rect'}`
	}

	function buildRectBucketKey(rect, bucketSize = 8) {
		if (!rect || typeof rect !== 'object') return ''
		const values = [rect.left, rect.top, rect.width, rect.height].map((value) => Number(value))
		if (values.some((value) => !Number.isFinite(value))) return ''
		const bucket = Math.max(1, Number(bucketSize) || 8)
		return values.map((value) => Math.round(value / bucket)).join(',')
	}

	function formatCandidateRect(rect) {
		if (!rect || typeof rect !== 'object') return ''
		const left = Math.round(Number(rect.left) || 0)
		const top = Math.round(Number(rect.top) || 0)
		const width = Math.round(Number(rect.width) || 0)
		const height = Math.round(Number(rect.height) || 0)
		return `${left},${top},${width}x${height}`
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
			if ((action === 'input_text' || action === 'type') && step === 'fill_form_field_task_value') return true
			if (action === 'select_cascader_path' && step === 'select_cascader_path_timeout_recovery') return true
			return action === 'click_element_by_index' && step === 'select_visible_cascader_option_timeout_recovery'
		})
	}

	function hasRecentFormSubmitRecoveryAttempt(session) {
		for (const item of getRecentHistoryItems(session, 8)) {
			if (isLoopGuardHistoryItem(item)) continue
			if (isFormValueChangeHistory(item)) return false
			const input = item?.input || {}
			if (String(input.workflow_step || '') === 'submit_form_timeout_recovery') return true
		}
		return false
	}

	function isLoopGuardHistoryItem(item) {
		return /\.loop_guard$/i.test(String(item?.action || ''))
	}

	function hasRecentExecutedFormSubmitClick(session) {
		return getRecentHistoryItems(session, 6).some((item) => {
			const action = String(item?.action || '').replace(/\..*$/, '')
			const input = item?.input || {}
			if (action !== 'click_element_by_index' && action !== 'click') return false
			return String(input.workflow_step || '') === 'submit_form_timeout_recovery'
		})
	}

	function isFormValueChangeHistory(item) {
		if (!item || item.success === false) return false
		const action = String(item.action || '').replace(/\..*$/, '')
		const input = item.input || {}
		const step = String(input.workflow_step || '')
		if (action === 'input_text' || action === 'type') {
			return step === 'fill_form_field_timeout_recovery' ||
				step === 'fill_form_field_task_value' ||
				step === 'resolve_duplicate_field_conflict' ||
				step === 'resolve_field_validation_error'
		}
		return [
			'choose_dropdown_option',
			'select_dropdown_option',
			'select_checkbox_option',
			'select_cascader_path',
			'click_element_by_index',
		].includes(action) && /form|dropdown|cascader|visible_cascader_option/.test(step)
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

	function isPageFormField(item) {
		const region = getNavigationKey(item?.region)
		return !region || /^(content|dialog|popover)$/.test(region)
	}

	function hasRecordCreateFormOpen(observation) {
		for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
			const formName = getNavigationKey(form?.name || form?.id || '')
			const fields = (Array.isArray(form?.fields) ? form.fields : [])
				.filter((field) => isPageFormField(field))
				.filter((field) => {
					const label = normalizeFormFieldLabel(getObservedItemLabel(field))
					const role = getNavigationKey(field?.role)
					if (!label || label === '(empty)') return false
					if (/^(button|link|menuitem|option|checkbox|radio|switch|tab)$/.test(role)) return false
					if (/(首页|个人信息|退出登录|搜索内容|更多|共\d*条|条\/页)/.test(label)) return false
					return true
				})
			if (!fields.length) continue
			if (/(弹层|dialog|modal|drawer|新增|新建|创建|添加|create|new|add)/i.test(formName)) return true
			if (fields.some((field) => /^(dialog|popover)$/.test(getNavigationKey(field?.region)))) return true
			if (fields.length >= 2 && !/(搜索|筛选|filter|search)/i.test(formName)) return true
		}
		return false
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
		if ((isDropdownFormField(item) || isCascaderFormField(item)) && isPlaceholderSelectionValue(value, item)) return true
		if (/^(filled|selected|checked):/i.test(value)) return false
		return false
	}

	function isPlaceholderSelectionValue(value, item) {
		const raw = String(value || '').trim()
		if (!raw) return true
		const match = raw.match(/^(?:selected|filled):\s*(.+)$/i)
		const text = cleanAssignmentValue(match?.[1] || raw)
		if (!text) return true
		const key = getNavigationKey(text)
		const labelKey = getNavigationKey(getObservedItemLabel(item))
		if (!key) return true
		if (labelKey && key === labelKey) return true
		if (/^(empty|unknown|null|undefined|none|select|choose|pleaseselect|pleasechoose|请选择|请选择一项|选择|展开选项|全部|任意|不限|无|空)$/i.test(key)) return true
		if (/^请选择/i.test(text)) return true
		if (/^(选择|please\s+select|choose|select)(\s|$)/i.test(text)) return true
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

	function isInputFieldTestTaskText(taskText) {
		const text = String(taskText || '').trim()
		if (!text) return false
		return /(输入框|输入项|文本框|表单字段|form\s*field|input|textbox|text\s*box)/i.test(text) &&
			/(测试|验证|检查|每个|每一个|所有|全部|逐个|逐项|test|verify|check|every|all)/i.test(text)
	}

	function collectInputFieldTestCandidates(observation) {
		const seen = new Set()
		return collectObservedFormControlItems(observation)
			.filter(isPageFormField)
			.filter(isPlainTextFormField)
			.filter(isSafeInputFieldTestCandidate)
			.sort((a, b) => getFormFieldOrderScore(a) - getFormFieldOrderScore(b))
			.map((field) => {
				const label = normalizeFormFieldLabel(getObservedItemLabel(field))
				const key = getInputFieldTestKey(field)
				return {
					field,
					key,
					label,
					fieldType: inferInputFieldTestType(field),
				}
			})
			.filter((item) => {
				if (!item.key || !item.label || seen.has(item.key)) return false
				seen.add(item.key)
				return true
			})
	}

	function isSafeInputFieldTestCandidate(field) {
		const index = Number(field?.index)
		if (!Number.isFinite(index)) return false
		const label = normalizeFormFieldLabel(getObservedItemLabel(field))
		if (!label || label === '(empty)') return false
		const region = getNavigationKey(field?.region)
		if (region && !/^(content|dialog|popover)$/.test(region)) return false
		if (isUnsafeInputFieldTestState(field)) return false
		if (isUnsafeInputFieldTestDescriptor(field, label)) return false
		if (isCommandLikeInputFieldLabel(label)) return false
		return true
	}

	function isUnsafeInputFieldTestState(field) {
		if (field?.disabled === true || field?.readOnly === true || field?.readonly === true || field?.hidden === true) return true
		if (String(field?.editable || '').toLowerCase() === 'false') return true
		const text = getNavigationKey([
			field?.state,
			field?.stateHints,
			field?.ariaDisabled,
			field?.ariaReadonly,
			field?.disabled,
			field?.readonly,
			field?.readOnly,
			field?.visible,
			field?.hidden,
		].filter((part) => part !== undefined && part !== null).join(' '))
		return /(disabled|readonly|read-only|hidden|invisible|不可编辑|禁用|只读|隐藏)/i.test(text)
	}

	function isUnsafeInputFieldTestDescriptor(field, label) {
		const text = getNavigationKey([
			label,
			field?.placeholder,
			field?.name,
			field?.type,
			field?.fieldType,
			field?.kind,
			field?.controlKind,
			field?.control,
			field?.autocomplete,
			field?.semanticContainer,
		].filter(Boolean).join(' '))
		return /(captcha|verification|verifycode|otp|token|secret|api[_-]?key|csrf|file|upload|attachment|image|color|range|验证码|校验码|动态码|短信码|令牌|密钥|秘钥|上传|附件|文件)/i.test(text)
	}

	function isCommandLikeInputFieldLabel(label) {
		return /^(首页|个人信息|退出登录|更多|确定|取消|提交|保存|删除|新增|新建|创建|导入|导出|共\d*条|\d+条\/页|条\/页)$/i.test(String(label || '').trim())
	}

	function getInputFieldTestKey(field) {
		const explicit = String(field?.key || '').trim()
		if (explicit) return explicit
		const index = Number(field?.index)
		if (Number.isFinite(index)) return `index:${index}`
		const label = normalizeFormFieldLabel(getObservedItemLabel(field))
		return label ? `label:${getNavigationKey(label)}` : ''
	}

	function inferInputFieldTestType(field) {
		const text = getNavigationKey([
			field?.type,
			field?.fieldType,
			field?.kind,
			field?.role,
			field?.name,
			field?.placeholder,
			getObservedItemLabel(field),
		].filter(Boolean).join(' '))
		if (/password|pwd|passcode|密码|口令/.test(text)) return 'password'
		if (/email|mail|邮箱|邮件/.test(text)) return 'email'
		if (/tel|phone|mobile|cell|contact|联系方式|电话|手机号|手机|传真/.test(text)) return 'tel'
		if (/url|网址|链接|地址链接/.test(text)) return 'url'
		if (/number|amount|price|qty|quantity|count|percent|数字|数量|金额|价格|比例/.test(text)) return 'number'
		if (/textarea|多行|备注|说明|描述/.test(text)) return 'textarea'
		if (/search|搜索|查询/.test(text)) return 'search'
		return 'text'
	}

	function buildInputFieldTestValue(field) {
		const type = inferInputFieldTestType(field)
		const patternValue = buildPatternInputFieldTestValue(field)
		if (patternValue) return fitInputFieldTestValueLength(field, patternValue, type)
		if (type === 'number') return buildNumberInputFieldTestValue(field)
		const base = getInputFieldTypeDefaultValue(type, field)
		return fitInputFieldTestValueLength(field, base, type)
	}

	function getInputFieldTypeDefaultValue(type, field) {
		if (type === 'password') return 'NcTest123!'
		if (type === 'email') {
			const maxLength = getInputFieldPositiveInteger(field, 'maxLength', 'maxlength')
			return maxLength > 0 && maxLength < 16 ? 'a@b.co' : 'test@example.com'
		}
		if (type === 'tel') return '+15555550123'
		if (type === 'url') {
			const maxLength = getInputFieldPositiveInteger(field, 'maxLength', 'maxlength')
			return maxLength > 0 && maxLength < 20 ? 'https://a.co' : 'https://example.com/'
		}
		if (type === 'textarea') return 'NaturalClick test'
		return 'NaturalClickTest'
	}

	function buildPatternInputFieldTestValue(field) {
		const digitLength = inferFixedDigitInputLength(field)
		if (digitLength > 0) return '1'.repeat(Math.min(64, digitLength))
		const text = String(field?.pattern || '').trim()
		if (!text) return ''
		if (/(?:\\d|\[0-9\]|\[\\d\])/.test(text)) return '123'
		return ''
	}

	function inferFixedDigitInputLength(field) {
		const source = [
			field?.pattern,
			field?.placeholder,
			field?.validationMessage,
			getObservedItemLabel(field),
		].map((value) => String(value || '')).join(' ')
		const patternMatch = source.match(/(?:\\d|\[0-9\]|\[\\d\])\{(\d{1,2})\}/)
		if (patternMatch?.[1]) return clampInputFieldLengthHint(patternMatch[1])
		const zhMatch = source.match(/(\d{1,2})\s*(?:位|个)?\s*(?:数字|手机号|手机号码|电话号码|位数)/)
		if (zhMatch?.[1]) return clampInputFieldLengthHint(zhMatch[1])
		const enMatch = source.match(/(\d{1,2})\s*(?:digits?|numbers?)/i)
		if (enMatch?.[1]) return clampInputFieldLengthHint(enMatch[1])
		return 0
	}

	function clampInputFieldLengthHint(value) {
		const number = Number(value)
		if (!Number.isFinite(number) || number <= 0) return 0
		return Math.max(1, Math.min(64, Math.round(number)))
	}

	function buildNumberInputFieldTestValue(field) {
		const min = parseInputFieldNumber(field?.min)
		const max = parseInputFieldNumber(field?.max)
		const step = parseInputFieldNumber(field?.step)
		let value = 123
		value = clampInputFieldNumber(value, min, max)
		if (Number.isFinite(step) && step > 0) {
			const base = Number.isFinite(min) ? min : 0
			value = alignInputFieldNumberToStep(value, base, step, min, max)
		}
		return formatInputFieldNumber(value)
	}

	function clampInputFieldNumber(value, min, max) {
		let result = Number.isFinite(value) ? value : 123
		if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
			return Math.min(max, Math.max(min, result))
		}
		if (Number.isFinite(min) && result < min) result = min
		if (Number.isFinite(max) && result > max) result = max
		return result
	}

	function alignInputFieldNumberToStep(value, base, step, min, max) {
		if (!Number.isFinite(value) || !Number.isFinite(base) || !Number.isFinite(step) || step <= 0) {
			return value
		}
		const offsets = new Set()
		const rawOffset = (value - base) / step
		addInputFieldStepOffsets(offsets, rawOffset)
		if (Number.isFinite(min)) addInputFieldStepOffsets(offsets, (min - base) / step)
		if (Number.isFinite(max)) addInputFieldStepOffsets(offsets, (max - base) / step)
		offsets.add(0)
		const candidates = Array.from(offsets)
			.map((offset) => normalizeInputFieldNumber(base + offset * step))
			.filter((candidate) => isInputFieldNumberWithinRange(candidate, min, max))
		candidates.sort((left, right) => {
			const distance = Math.abs(left - value) - Math.abs(right - value)
			if (Math.abs(distance) > Number.EPSILON) return distance
			return left - right
		})
		return Number.isFinite(candidates[0]) ? candidates[0] : clampInputFieldNumber(value, min, max)
	}

	function addInputFieldStepOffsets(target, rawOffset) {
		if (!Number.isFinite(rawOffset)) return
		target.add(Math.floor(rawOffset))
		target.add(Math.round(rawOffset))
		target.add(Math.ceil(rawOffset))
	}

	function normalizeInputFieldNumber(value) {
		return Number.isFinite(value) ? Number(value.toFixed(10)) : value
	}

	function isInputFieldNumberWithinRange(value, min, max) {
		if (!Number.isFinite(value)) return false
		const epsilon = Math.max(1, Math.abs(value), Math.abs(min || 0), Math.abs(max || 0)) * 1e-9
		if (Number.isFinite(min) && value < min - epsilon) return false
		if (Number.isFinite(max) && value > max + epsilon) return false
		return true
	}

	function parseInputFieldNumber(value) {
		const text = String(value || '').trim()
		if (!text || /^any$/i.test(text)) return NaN
		const number = Number(text)
		return Number.isFinite(number) ? number : NaN
	}

	function formatInputFieldNumber(value) {
		if (!Number.isFinite(value)) return '123'
		if (Number.isInteger(value)) return String(value)
		return String(Number(value.toFixed(6))).replace(/\.0+$/, '')
	}

	function fitInputFieldTestValueLength(field, value, type) {
		const maxLength = getInputFieldPositiveInteger(field, 'maxLength', 'maxlength')
		const minLength = getInputFieldPositiveInteger(field, 'minLength', 'minlength')
		let text = String(value || '')
		const alternatives = getLengthAlternativeInputValues(type)
		if (maxLength > 0 && text.length > maxLength) {
			const alternative = alternatives.find((item) => item.length <= maxLength)
			text = alternative || text.slice(0, maxLength)
		}
		const targetMin = minLength > 0 ? minLength : 0
		if (targetMin > 0 && text.length < targetMin) {
			const limit = maxLength > 0 ? Math.min(maxLength, targetMin) : targetMin
			text = padInputFieldTestValue(text, limit, type)
		}
		return text || 'x'
	}

	function getLengthAlternativeInputValues(type) {
		if (type === 'email') return ['a@b.co', 'a@b.c']
		if (type === 'url') return ['https://a.co', 'http://a.b']
		if (type === 'password') return ['Aa1!Aa', 'Aa1!']
		if (type === 'tel') return ['123456', '123']
		if (type === 'number') return ['1']
		return ['NC', 'x']
	}

	function padInputFieldTestValue(value, length, type) {
		const text = String(value || '')
		if (text.length >= length) return text
		if (type === 'email' && text.includes('@')) {
			const [local, domain] = text.split('@')
			const missing = Math.max(0, length - text.length)
			return `${local}${'x'.repeat(missing)}@${domain}`
		}
		if (type === 'url' && /^https?:\/\//i.test(text)) {
			const base = text.endsWith('/') ? text.slice(0, -1) : text
			return `${base}${'x'.repeat(Math.max(0, length - base.length))}`
		}
		const pad = type === 'number' || type === 'tel' ? '1' : 'x'
		return `${text}${pad.repeat(Math.max(0, length - text.length))}`
	}

	function getInputFieldPositiveInteger(field, primary, alias) {
		for (const key of [primary, alias]) {
			const number = Number(field?.[key])
			if (Number.isFinite(number) && number > 0) return Math.round(number)
		}
		return 0
	}

	function hasInputFieldConstraintHints(field) {
		return getInputFieldPositiveInteger(field, 'maxLength', 'maxlength') > 0 ||
			getInputFieldPositiveInteger(field, 'minLength', 'minlength') > 0 ||
			!!String(field?.min || field?.max || field?.step || field?.pattern || field?.inputMode || '').trim() ||
			inferFixedDigitInputLength(field) > 0
	}

	function buildInputFieldConstraintBasis(field) {
		const parts = []
		const maxLength = getInputFieldPositiveInteger(field, 'maxLength', 'maxlength')
		const minLength = getInputFieldPositiveInteger(field, 'minLength', 'minlength')
		if (maxLength > 0) parts.push(`maxLength=${maxLength}`)
		if (minLength > 0) parts.push(`minLength=${minLength}`)
		for (const key of ['min', 'max', 'step', 'pattern', 'inputMode']) {
			const text = String(field?.[key] || '').trim()
			if (text) parts.push(`${key}=${shortWorkflowText(text, 40)}`)
		}
		const digitLength = inferFixedDigitInputLength(field)
		if (digitLength > 0) parts.push(`digits=${digitLength}`)
		return parts.join(' ')
	}

	function getInputFieldTestAttemptedKeys(session) {
		const out = new Set()
		for (const item of (Array.isArray(session?.history) ? session.history : [])) {
			const action = String(item?.action || '').replace(/\..*$/, '')
			if (action !== 'input_text' && action !== 'type') continue
			const input = item?.input || {}
			const step = String(input.workflow_step || '').trim()
			const workflow = String(input.workflow || '').trim()
			const belongsToFieldTest = workflow === 'field-test' ||
				step === 'test_input_field' ||
				(isInputFieldTestTaskText(session?.latestTask || session?.task) && !/^fill_field$/.test(step))
			if (!belongsToFieldTest) continue
			const key = String(input.workflow_field_key || '').trim() ||
				(Number.isFinite(Number(input.workflow_field_index ?? input.index)) ? `index:${Number(input.workflow_field_index ?? input.index)}` : '') ||
				(normalizeFormFieldLabel(input.workflow_field_label || input.target_label || input.label) ? `label:${getNavigationKey(normalizeFormFieldLabel(input.workflow_field_label || input.target_label || input.label))}` : '')
			if (key) out.add(key)
		}
		return out
	}

	function countFailedInputFieldTestAttempts(session, candidateKeys) {
		let count = 0
		const failed = new Set()
		for (const item of (Array.isArray(session?.history) ? session.history : [])) {
			if (item?.success !== false) continue
			const action = String(item?.action || '').replace(/\..*$/, '')
			if (action !== 'input_text' && action !== 'type') continue
			const input = item?.input || {}
			const key = String(input.workflow_field_key || '').trim() ||
				(Number.isFinite(Number(input.workflow_field_index ?? input.index)) ? `index:${Number(input.workflow_field_index ?? input.index)}` : '')
			if (!key || !(candidateKeys instanceof Set) || !candidateKeys.has(key) || failed.has(key)) continue
			failed.add(key)
			count += 1
		}
		return count
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
			return action === 'select_cascader_path' &&
				Array.isArray(input.path) &&
				normalizeCascaderPathParts(input.path).length >= 1
		}) || null
	}

	function getRecentFailedCascaderPathForRetry(session, observation) {
		const history = Array.isArray(session?.history) ? session.history : []
		const start = Math.max(0, history.length - 14)
		for (let pos = history.length - 1; pos >= start; pos -= 1) {
			const item = history[pos]
			if (item?.success !== false) continue
			const action = String(item?.action || '').replace(/\..*$/, '')
			if (action !== 'select_cascader_path') continue
			const input = item?.input || {}
			const index = Number(input.index)
			if (!Number.isFinite(index)) continue
			const path = normalizeCascaderPathParts(input.path)
			if (path.length < 1) continue
			if (!hasCascaderRetryEvidenceAfterFailure(history, pos, index, observation)) continue
			if (hasLaterCascaderPathRecoveryRetry(history, pos, index, path)) continue
			const field = findObservedFormFieldByIndex(observation, index)
			if (!field || !isCascaderFormField(field)) continue
			if (observedFieldValueMatchesCascaderPath(field, path)) continue
			const label = normalizeFormFieldLabel(getObservedItemLabel(field)) ||
				normalizeFormFieldLabel(input.target_label || input.workflow_field_label) ||
				'该级联字段'
			return { item, input, index, path, field, label }
		}
		return null
	}

	function hasCascaderRetryEvidenceAfterFailure(history, failedPos, index, observation) {
		if (hasVisibleCascaderPopupOption(observation)) return true
		for (const item of history.slice(failedPos + 1)) {
			const action = String(item?.action || '').replace(/\..*$/, '')
			const input = item?.input || {}
			if (Number(input.index) !== Number(index)) continue
			if (action !== 'open_dropdown' && action !== 'select_dropdown_option') continue
			if (item?.success === false) continue
			const text = getHistoryFailureText(item)
			const outcome = item?.outcome || item?.meta?.outcome || {}
			if (/options_visible|候选|已展开|opened|visibleOptions|candidates/i.test(text)) return true
			if (/^(options_visible|opened|state_changed)$/i.test(String(outcome.kind || ''))) return true
		}
		return false
	}

	function hasVisibleCascaderPopupOption(observation) {
		return collectVisibleCascaderOptionItems(observation).some((item) => {
			const region = getNavigationKey(item?.region)
			const role = getNavigationKey(item?.role)
			const control = getNavigationKey(item?.selectionControl || item?.controlKind || item?.control)
			if (!/^(popover|popup|dropdown|listbox)$/.test(region)) return false
			return /^(option|menuitem|treeitem)$/.test(role) || /cascader-(?:leaf|option|candidate)/.test(control)
		})
	}

	function hasLaterCascaderPathRecoveryRetry(history, failedPos, index, path) {
		const targetPath = normalizeCascaderPathForCompare(path)
		return history.slice(failedPos + 1).some((item) => {
			const action = String(item?.action || '').replace(/\..*$/, '')
			if (action !== 'select_cascader_path') return false
			const input = item?.input || {}
			if (Number(input.index) !== Number(index)) return false
			if (String(input.workflow_step || '') !== 'select_cascader_path_timeout_recovery') return false
			return normalizeCascaderPathForCompare(input.path) === targetPath
		})
	}

	function findObservedFormFieldByIndex(observation, index) {
		return collectObservedFormControlItems(observation)
			.find((item) => Number(item?.index) === Number(index) && isPageFormField(item)) || null
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

	function normalizeCascaderPathParts(path) {
		return (Array.isArray(path) ? path : String(path || '').split(/[>\/\\,，、]+/g))
			.map(cleanCascaderPathPart)
			.filter(Boolean)
			.filter(isSafeCascaderPathPart)
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
			if (!/^(fill_form_field_timeout_recovery|fill_form_field_task_value|open_form_dropdown_timeout_recovery|choose_form_dropdown_timeout_recovery)$/.test(step)) return false
			if (!target) return true
			const attempted = getNavigationKey(cleanAssignmentValue(input.text || input.label || input.workflow_requested_text || ''))
			return !attempted || attempted === target
		})
	}

	function hasRecentCreateEntryAttempt(session, item) {
		const index = Number(item?.index)
		const label = getNavigationKey(getObservedItemLabel(item))
		return getRecentHistoryItems(session, 8).some((historyItem) => {
			const action = String(historyItem?.action || '').replace(/\..*$/, '')
			const input = historyItem?.input || {}
			if (action !== 'click_element_by_index' && action !== 'click') return false
			const failedCreateEntry = isCreateEntryFailureHistory(historyItem)
			const workflowCreateAttempt = String(input.workflow_step || '') === 'open_create_form_timeout_recovery'
			if (!failedCreateEntry && !workflowCreateAttempt) return false
			if (Number.isFinite(index) && Number(input.index) === index) return true
			const attempted = getNavigationKey(input.workflow_create_label || input.target_label || '')
			return !!label && attempted === label
		})
	}

	function hasRecentCreateEntryFailure(session) {
		return getRecentHistoryItems(session, 10).some((item) => isCreateEntryFailureHistory(item))
	}

	function hasRecentCreateEntryVisionAttempt(session) {
		return getRecentHistoryItems(session, 10).some((historyItem) => {
			const action = String(historyItem?.action || '').replace(/\..*$/, '')
			const input = historyItem?.input || {}
			if (action !== 'locate_by_vision') return false
			return String(input.workflow_step || '') === 'open_create_form_timeout_recovery'
		})
	}

	function isCreateEntryFailureHistory(historyItem) {
		const action = String(historyItem?.action || '').replace(/\..*$/, '')
		if (action !== 'click_element_by_index' && action !== 'click') return false
		const input = historyItem?.input || {}
		const text = getHistoryFailureText(historyItem)
		if (/create_form_not_opened/i.test(text)) return true
		if (historyItem?.success !== false) return false
		if (String(input.workflow_step || '') === 'open_create_form_timeout_recovery') return true
		const attempted = getNavigationKey(input.workflow_create_label || input.target_label || '')
		return !!attempted && isExactCreateEntryLabel(attempted) && /(动作结果:\s*(?:no_effect|focused|none)|progress=false)/i.test(text)
	}

	function getHistoryFailureText(historyItem) {
		return [
			historyItem?.output,
			historyItem?.message,
			historyItem?.detail,
			historyItem?.error,
			historyItem?.result,
			historyItem?.outcome?.reason,
			historyItem?.meta?.outcome?.reason,
			historyItem?.meta?.outcome?.kind,
		].map((value) => String(value || '')).filter(Boolean).join(' ')
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
		const matches = []
		const seen = new Set()
		for (const key of getFormFieldLabelAliases(label)) {
			const pattern = new RegExp(Array.from(key).map(escapeRegExp).join('\\s*'), 'gi')
			for (const match of String(source || '').matchAll(pattern)) {
				const signature = `${Number(match.index)}:${String(match[0] || '')}`
				if (seen.has(signature)) continue
				seen.add(signature)
				matches.push(match)
			}
		}
		return matches.sort((a, b) => {
			const diff = Number(a.index) - Number(b.index)
			if (diff) return diff
			return String(b[0] || '').length - String(a[0] || '').length
		})
	}

	function getFormFieldLabelAliases(label) {
		const key = normalizeFormFieldLabel(label)
		if (!key) return []
		const aliases = [key]
		for (const qualifier of ['公司', '企业', '单位', '机构', '组织']) {
			const suffix = `${qualifier}名称`
			if (key.endsWith(suffix) && key.length > suffix.length) {
				addUnique(aliases, `${key.slice(0, -suffix.length)}名称`)
			}
		}
		return aliases.sort((a, b) => b.length - a.length)
	}

	function matchTaskAssignmentConnector(value) {
		const match = String(value || '').match(/^\s*(?:[，,、]\s*)?(?:(?:修改为|改为|更新为|变更为|调整为|设置为|设为|选择为|选为|指定为|填为|填写为|录入为|输入为|改成|修改成|更新成|变更成|为|是|=|:|：)\s*)+/)
		return match?.[0] || ''
	}

	function findNextAssignmentLabelIndex(source, cursor, currentLabel, allLabels) {
		let end = -1
		const currentAliases = new Set(getFormFieldLabelAliases(currentLabel))
		for (const label of allLabels || []) {
			const aliases = getFormFieldLabelAliases(label)
			if (!aliases.length || aliases.some((alias) => currentAliases.has(alias))) continue
			for (const match of findLooseLabelMatches(source.slice(cursor), label)) {
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
		const separatorPattern = getCascaderPathSeparatorPattern(text)
		const parts = text
			.split(separatorPattern)
			.map(cleanCascaderPathPart)
			.filter(Boolean)
		if (parts.length < 2) return parts.length === 1 && isSafeCascaderPathPart(parts[0]) ? parts : []
		if (parts.some((part) => !isSafeCascaderPathPart(part))) return []
		return parts
	}

	function getCascaderPathSeparatorPattern(text) {
		const source = String(text || '')
		const allowBareDash = /[\u4e00-\u9fff][\-–—－][\u4e00-\u9fff]/.test(source)
		const dash = allowBareDash ? '|[-–—－]' : '|\\s+[-–—－]\\s+'
		const whitespace = shouldTreatWhitespaceAsCascaderPathSeparator(source) ? '|\\s+' : ''
		return new RegExp(`\\s*(?:->|=>|→|＞|>|/|\\\\|,|，|、|;|；|\\|${dash}${whitespace})\\s*`, 'g')
	}

	function shouldTreatWhitespaceAsCascaderPathSeparator(text) {
		const parts = String(text || '').trim().split(/\s+/).filter(Boolean)
		if (parts.length < 2) return false
		return parts.every((part) => /^[\u4e00-\u9fff]{1,12}$/.test(cleanAssignmentValue(part)))
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
			version: 5,
			plannedKeys: [],
			attemptedKeys: [],
			succeededKeys: [],
			failedKeys: [],
			concreteSucceededKeys: [],
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
		if (!Array.isArray(state.concreteSucceededKeys)) state.concreteSucceededKeys = []
		if (!Array.isArray(state.revealAttemptKeys)) state.revealAttemptKeys = []
		if (!Array.isArray(state.visionAttemptKeys)) state.visionAttemptKeys = []
		state.version = 5
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
		else {
			addUnique(state.succeededKeys, key)
			if (isConcreteNavigationAliasHistoryItem(item, key)) addUnique(state.concreteSucceededKeys, key)
		}
	}

	function isConcreteNavigationAliasHistoryItem(item, targetKey) {
		const target = getNavigationKey(targetKey)
		if (!target) return false
		const input = item?.input || {}
		const label = getNavigationKey(
			input.workflow_nav_alias ||
			input.target_label ||
			input.label ||
			input.text ||
			item?.nextGoal ||
			''
		)
		if (!label || label === target) return false
		return getNavigationTargetAliases(target)
			.filter((alias) => alias && alias !== target)
			.some((alias) => label === alias || label.endsWith(alias))
	}

	function getReservedNavigationKeys(state) {
		const keys = [
			...(Array.isArray(state?.plannedKeys) ? state.plannedKeys : []),
			...(Array.isArray(state?.attemptedKeys) ? state.attemptedKeys : []),
		]
		return [...new Set(keys.map(getNavigationKey).filter(Boolean))]
	}

	function hasNavigationKeyMatch(keys, key) {
		const target = getNavigationKey(key)
		if (!target) return false
		const targetAliases = new Set(getNavigationTargetAliases(target))
		return (Array.isArray(keys) ? keys : []).some((value) => {
			const candidate = getNavigationKey(value)
			if (!candidate) return false
			if (targetAliases.has(candidate)) return true
			return getNavigationTargetAliases(candidate).includes(target)
		})
	}

	function hasExactNavigationAttempt(state, label) {
		const key = getNavigationKey(label)
		if (!key) return false
		return (Array.isArray(state?.attemptedKeys) ? state.attemptedKeys : [])
			.map(getNavigationKey)
			.filter(Boolean)
			.includes(key)
	}

	function getExpectedNavigationKeys(session, state) {
		const forbidden = new Set(getTaskIntentForbiddenNavigationKeys(session))
		return [
			...getReservedNavigationKeys(state),
			...getTaskIntentNavigationKeys(session),
			...extractTaskNavigationTargetKeys(session),
		].filter((key) => key && !forbidden.has(getNavigationKey(key)))
			.filter((key, index, list) => list.indexOf(key) === index)
	}

	function getTaskIntentNavigationKeys(session) {
		if (!taskIntent?.getNavigationTargetKeys) return []
		return taskIntent.getNavigationTargetKeys(session)
			.map(getNavigationKey)
			.filter(Boolean)
	}

	function getTaskIntentForbiddenNavigationKeys(session) {
		if (!taskIntent?.getForbiddenNavigationTargetKeys) return []
		return taskIntent.getForbiddenNavigationTargetKeys(session)
			.map(getNavigationKey)
			.filter(Boolean)
	}

	function extractTaskNavigationTargetKeys(session) {
		const text = normalizeTaskTextForNavigation(String(session?.latestTask || session?.task || ''))
		const labels = []
		const chineseTargetContext = '(?:部分|模块|页面|网页|页|区域|列表|面板|菜单|标签页|中|里|内|下)'
		const nextAction = '(?:新增|新建|创建|添加|增加|编辑|修改|更新|查看|预览|测试|验证|检查|排查|搜索|查询|筛选|过滤|填写|填入|填表|录入)'
		const chinesePatterns = [
			/(?:找到|进入|打开|前往|切换到|定位到|访问|查看)\s*[“"']([^”"']{1,48})[”"']/g,
			new RegExp(`(?:找到|进入|打开|前往|切换到|定位到|访问|查看|在)\\s*([^，。；;,\\n\\r]{2,40}?)(?=(?:后|之后|以后)(?:再|就)?${nextAction})`, 'g'),
			new RegExp(`(?:找到|进入|打开|前往|切换到|定位到|访问|查看|在)\\s*([^，。；;,\\n\\r]{1,56}?)${chineseTargetContext}`, 'g'),
			/在\s*([^，。；;,\n\r]{2,40}?)(?=(?:新增|新建|创建|添加|增加|编辑|修改|更新|查看|预览|测试|验证|检查|排查|搜索|查询|筛选|过滤|填写|填入|填表|录入))/g,
			/(?:找到|进入|前往|切换到|定位到|访问)\s*([^，。；;,\n\r]{2,40})(?=[，。；;,\n\r]|$)/g,
			new RegExp(`([^，。；;,\\n\\r]{2,48}?)${chineseTargetContext}(?=[，。；;,\\n\\r]|$)`, 'g'),
		]
		const englishPatterns = [
			/(?:open|go\s+to|goto|navigate\s+to|visit|switch\s+to|find|enter)\s+["']?([^"',.;\n\r]{2,56}?)["']?\s+(?:page|screen|view|section|area|panel|menu|module|tab)\b/gi,
			/["']([^"']{2,56})["']\s+(?:page|screen|view|section|area|panel|menu|module|tab)\b/gi,
			/(?:go\s+to|goto|navigate\s+to|switch\s+to|find|enter)\s+(?!https?:\/\/|www\.)([A-Za-z][A-Za-z0-9 _/-]{1,40})(?=$|[，。；;,.\n\r])/gi,
		]
		for (const pattern of [...chinesePatterns, ...englishPatterns]) {
			for (const match of text.matchAll(pattern)) {
				const label = normalizeTaskTargetLabel(match?.[1])
				if (label) labels.push(label)
			}
		}
		return [...new Set(labels.map(getNavigationKey).filter(Boolean))]
	}

	function normalizeTaskTargetLabel(value) {
		const raw = stripTaskStepPrefix(trimToLastTaskNavigationVerb(String(value || '')))
			.replace(/[“”"']/g, '')
			.replace(/\s+/g, ' ')
			.trim()
		if (containsUrlLikeText(raw)) return ''
		const withoutVerb = stripTaskNavigationActionNoise(stripTaskNavigationLeadingNoise(raw))
		if (isGenericTaskTargetLabel(withoutVerb)) return ''
		if (isAssignmentLikeTaskTargetLabel(withoutVerb)) return ''
		const label = stripTaskNavigationActionNoise(stripTaskNavigationContextSuffix(withoutVerb))
			.replace(/^(?:the|a|an)\s+/i, '')
			.trim()
		const compact = label.replace(/\s+/g, '')
		if (!label || compact.length < 2 || compact.length > 40) return ''
		if (containsUrlLikeText(label)) return ''
		if (containsCredentialLikeText(label)) return ''
		if (isRecordSelectorLikeTaskTarget(label)) return ''
		if (isGenericTaskTargetLabel(label)) return ''
		if (isAssignmentLikeTaskTargetLabel(label)) return ''
		if (/^(搜索|查询|筛选|过滤)(区域|条件|页面|列表)?$/.test(label)) return ''
		return label
	}

	function stripTaskNavigationContextSuffix(value) {
		const text = String(value || '')
			.replace(/(?:部分|模块|页面|网页|页|区域|列表|面板|菜单|标签页|中|里|内|下)$/gi, '')
			.replace(/\s+(?:page|screen|view|section|area|panel|menu|module|tab)$/i, '')
			.trim()
		return stripTaskNavigationSequenceSuffix(text)
	}

	function stripTaskNavigationSequenceSuffix(value) {
		let text = String(value || '').trim()
		for (let i = 0; i < 3; i++) {
			const next = removeOneTaskNavigationSequenceSuffix(text)
			if (next === text) break
			text = next
		}
		return text.trim()
	}

	function removeOneTaskNavigationSequenceSuffix(value) {
		const text = String(value || '').trim()
		if (!text) return ''
		const afterMatch = text.match(/^(.+?)(?:之后|以后|后再|后就)$/)
		if (afterMatch?.[1] && isLikelyNavigationSequenceStem(afterMatch[1])) return afterMatch[1].trim()
		const bareAfterMatch = text.match(/^(.+?)后$/)
		if (bareAfterMatch?.[1] && isLikelyNavigationSequenceStem(bareAfterMatch[1])) return bareAfterMatch[1].trim()
		return text
	}

	function isLikelyNavigationSequenceStem(value) {
		const text = String(value || '').replace(/\s+/g, '').trim()
		if (text.length < 2) return false
		return /(?:管理|中心|模块|页面|网页|页|区域|列表|面板|菜单|标签页|系统|设置|配置|审批|报表|工具)$/i.test(text) ||
			/(?:page|screen|view|section|area|panel|menu|module|tab)$/i.test(text)
	}

	function trimToLastTaskNavigationVerb(value) {
		const text = String(value || '')
		const matches = [...text.matchAll(/(?:找到|进入|打开|前往|切换到|定位到|访问|查看)\s*/g)]
		const last = matches[matches.length - 1]
		if (!last || Number(last.index) <= 0) return text
		return text.slice(Number(last.index) + last[0].length)
	}

	function containsUrlLikeText(value) {
		return /(https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,}(?:\/|\b)|\S+@\S+\.\S+)/i.test(String(value || ''))
	}

	function containsCredentialLikeText(value) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		return /(?:账号|账户|用户名|登录账号|密码|口令|验证码|手机号|手机|电话)\s*[:：= ]/i.test(text) ||
			/\b(?:account|username|user|password|passcode|otp|phone|mobile)\s*[:= ]/i.test(text)
	}

	function isRecordSelectorLikeTaskTarget(value) {
		return /(?:列表)?(?:第一条|第一行|首条|首行|第\s*1\s*[条行])/.test(String(value || ''))
	}

	function stripTaskNavigationLeadingNoise(value) {
		let text = String(value || '').trim()
		for (let i = 0; i < 4; i++) {
			const next = stripTaskStepPrefix(text)
				.replace(/^(?:然后|接着|再|并且|同时|随后|帮我|请|麻烦|你|我|先|去|到|把|将|给我)+/g, '')
				.replace(/^(?:找到|找出|进入|打开|前往|切换到|定位到|在|查看)\s*/g, '')
				.trim()
			if (next === text) break
			text = next
		}
		return text
	}

	function stripTaskStepPrefix(value) {
		let text = String(value || '').trim()
		for (let i = 0; i < 4; i++) {
			const next = text
				.replace(/^[（(]?\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*[.)．、:：]\s*/g, '')
				.replace(/^第\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*步\s*[:：、.)．-]?\s*/g, '')
				.trim()
			if (next === text) break
			text = next
		}
		return text
	}

	function normalizeTaskTextForNavigation(value) {
		return String(value || '')
			.replace(/(^|[\n\r])\s*[（(]?\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*[.)．、:：]\s*/g, '$1')
			.replace(/(^|[\n\r])\s*第\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*步\s*[:：、.)．-]?\s*/g, '$1')
	}

	function stripTaskNavigationActionNoise(value) {
		let text = String(value || '').trim()
		for (let i = 0; i < 4; i++) {
			const next = text
				.replace(/^(?:新增|新建|创建|添加|增加|编辑|修改|查看|预览|测试|检查|验证|核验|确认)\s*/g, '')
				.replace(/(?:新增|新建|创建|添加|增加|编辑|修改|查看|预览|测试|检查|验证|核验|确认|填写|填入|搜索|查询|筛选|过滤).+$/g, '')
				.replace(/(?:新增|新建|创建|添加|增加|编辑|修改|详情|明细|查看|预览|搜索|查询|筛选|过滤)$/g, '')
				.trim()
			if (next === text) break
			text = next
		}
		return text
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

	function isNavigationTargetReachedForSession(session, observation, key, state = null) {
		if (isNavigationTargetReached(observation, key)) return true
		const targetKey = getNavigationKey(key)
		if (!targetKey) return true
		const navState = state || syncNavigationState(session)
		if (!hasConcreteNavigationSuccessForTarget(session, navState, targetKey)) return false
		if (hasSelectedNavigationConflict(observation, targetKey)) return false
		return hasPageContentSurface(observation)
	}

	function hasConcreteNavigationSuccessForTarget(session, state, targetKey) {
		const target = getNavigationKey(targetKey)
		if (!target) return false
		const concreteSucceeded = Array.isArray(state?.concreteSucceededKeys)
			? state.concreteSucceededKeys.map(getNavigationKey).filter(Boolean)
			: []
		if (concreteSucceeded.includes(target)) return true
		return getRecentHistoryItems(session, 6).some((item) => {
			if (item?.success === false || !isNavigationClickHistory(item)) return false
			const input = item?.input || {}
			const key = getNavigationKey(input.workflow_nav_key || input.target_label || input.label || '')
			return key === target && isConcreteNavigationAliasHistoryItem(item, target)
		})
	}

	function hasSelectedNavigationConflict(observation, targetKey) {
		const target = getNavigationKey(targetKey)
		if (!target) return false
		const aliases = getNavigationTargetAliases(target)
		let sawTargetAlias = false
		let sawConflict = false
		for (const item of collectObservedNavigationStateItems(observation)) {
			if (!isSelectedOrActiveObservedItem(item)) continue
			const region = getNavigationKey(item?.region)
			if (region && region !== 'header' && region !== 'sidebar') continue
			const label = getNavigationKey(getObservedItemLabel(item))
			if (!label || isIgnoredSelectedNavigationLabel(label)) continue
			if (aliases.some((alias) => label === alias)) {
				sawTargetAlias = true
				continue
			}
			sawConflict = true
		}
		return !sawTargetAlias && sawConflict
	}

	function isIgnoredSelectedNavigationLabel(label) {
		return /^(首页|主页|home|更多|菜单|全部|全部菜单|导航|消息|通知|个人中心)$/.test(getNavigationKey(label))
	}

	function isLikelyAppNavigationLabel(label) {
		const key = getNavigationKey(label)
		return isNavigationContainerName(key)
	}

	function hasPageContentSurface(observation) {
		if (!observation || typeof observation !== 'object') return false
		if ((Array.isArray(observation?.panels) ? observation.panels : []).some(isSearchOrFilterPanelSummary)) return true
		if ((Array.isArray(observation?.tables) ? observation.tables : []).some(hasUsableTableSummary)) return true
		if ((Array.isArray(observation?.forms) ? observation.forms : []).some(hasSearchOrRecordFormFields)) return true
		return [
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
		].some(isPageContentAction)
	}

	function isSearchOrFilterPanelSummary(panel) {
		const text = getNavigationKey([panel?.kind, panel?.label, panel?.triggerLabel, panel?.fields].filter(Boolean).join(' '))
		return /(filter|search|搜索|查询|筛选|过滤)/i.test(text)
	}

	function hasUsableTableSummary(table) {
		return (Array.isArray(table?.headers) && table.headers.length >= 2) ||
			(Array.isArray(table?.rows) && table.rows.length > 0)
	}

	function hasSearchOrRecordFormFields(form) {
		const fields = Array.isArray(form?.fields) ? form.fields : []
		if (!fields.length) return false
		const formText = getNavigationKey([form?.id, form?.name].filter(Boolean).join(' '))
		if (/(filter|search|搜索|查询|筛选|过滤)/i.test(formText)) return true
		return fields.some((field) => {
			const region = getNavigationKey(field?.region)
			if (region && region !== 'content' && region !== 'dialog') return false
			const label = getNavigationKey(getObservedItemLabel(field))
			return !!label && !/^(请输入|请选择|搜索内容|展开选项)$/.test(label)
		})
	}

	function isPageContentAction(item) {
		const index = Number(item?.index)
		if (!Number.isFinite(index)) return false
		const region = getNavigationKey(item?.region)
		if (region && region !== 'content' && region !== 'dialog' && region !== 'popover') return false
		const label = getNavigationKey(getObservedItemLabel(item))
		const intent = getNavigationKey(item?.actionIntent || item?.intent || '')
		return /(搜索|查询|筛选|重置|清空|新增|新建|创建|添加|导入|导出|详情|查看|编辑|删除|search|query|filter|reset|clear|add|create|new|export|import|detail|view|edit|delete)/i.test(`${label} ${intent}`)
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
		derivePreIntentWorkflowDecision,
		derivePreModelWorkflowDecision,
		derivePostModelWorkflowDecision,
		derivePostContextWorkflowDecision,
		derivePostValidationWorkflowDecision,
		deriveObservationFailureWorkflowDecision,
		deriveTimeoutRecoveryWorkflowDecision,
		recordPlanningContextDeferral,
		recordWorkflowOutcome,
		resolveDecisionWorkflowName,
	}
	g.NC_BG_PLANNER_WORKFLOWS_TESTS = {
		buildWorkflowContextText,
		derivePreIntentWorkflowDecision,
		derivePreModelWorkflowDecision,
		derivePostModelWorkflowDecision,
		derivePostContextWorkflowDecision,
		recordPlanningContextDeferral,
			derivePostValidationWorkflowDecision,
			deriveObservationFailureWorkflowDecision,
			deriveSearchWorkflowDecisionIfAllowed,
			deriveInputFieldTestWorkflowDecision,
			deriveTaskNavigationWorkflowDecision,
		deriveRecordViewWorkflowDecision,
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
