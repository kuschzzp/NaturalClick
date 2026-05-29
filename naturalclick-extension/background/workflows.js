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
		open_create_entry: 'create-record',
		fill_create_field: 'create-record',
		open_create_option_field: 'create-record',
		select_create_option: 'create-record',
		select_create_cascader: 'create-record',
		open_create_required_field: 'create-record',
		select_create_required_option: 'create-record',
		submit_create_record: 'create-record',
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
			name: 'create-record',
			run: (session, observation) =>
				deriveCreateRecordWorkflowDecision(session, observation),
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
			name: 'create-record',
			run: (session, observation) =>
				deriveCreateRecordWorkflowDecision(session, observation),
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
		if (workflowName === 'create-record') {
			recordCreateRecordWorkflowOutcome(session, routedDecision, outcome)
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

	function deriveTaskNavigationWorkflowDecision(session, observation) {
		const state = syncNavigationState(session)
		const attempted = getReservedNavigationKeys(state)
		const unresolved = getExpectedNavigationKeys(session, state)
			.filter((key) => !isNavigationTargetReached(observation, key))
			.filter((key) => !attempted.includes(key))
		for (const key of unresolved) {
			const candidate = findNavigationCandidateForKey(observation, key)
			if (!candidate) continue
			addUnique(state.plannedKeys, key)
			const label = getObservedItemLabel(candidate) || key
			return {
				evaluation_previous_goal: `任务目标模块 "${label}" 尚未到达，当前观察中存在同名导航入口。`,
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
		if (!unresolved.length) return null
		const revealDecision = buildNavigationRevealDecision(state, observation, unresolved, '目标导航尚未直接可见')
		if (revealDecision) return revealDecision
		return null
	}

	function deriveCreateRecordWorkflowDecision(session, observation) {
		const taskText = String(session?.latestTask || session?.task || '')
		if (!isCreateRecordTask(taskText)) return null
		const navState = syncNavigationState(session)
		const unresolved = getExpectedNavigationKeys(session, navState)
			.filter((key) => !isNavigationTargetReached(observation, key))
		if (unresolved.length) return null
		const state = syncCreateRecordState(session)
		const form = findCreateRecordForm(observation)
		if (form) return deriveCreateFormWorkflowDecision(session, observation, state, form, taskText)
		if (state.openAttempted) return null
		if (hasLikelyCreateDialogOrForm(observation)) return null
		const candidate = findCreateEntryCandidate(observation, taskText)
		if (!candidate) return null
		const label = getObservedItemLabel(candidate) || '新增'
		state.openAttempted = true
		state.openCandidateKey = buildCreateCandidateKey(candidate)
		return {
			evaluation_previous_goal: '目标模块已到达，任务要求创建/新增记录。',
			memory: '使用通用创建入口流程只打开一次新增/创建入口；后续表单填写继续交给模型和页面观察。',
			thought: '先打开页面内创建入口，避免模型在大表格页面上超时。',
			next_goal: `打开创建入口：${label}`,
			action: {
				name: 'click_element_by_index',
				input: {
					index: Number(candidate.index),
					target_label: label,
					target_region: String(candidate.region || ''),
					workflow_step: 'open_create_entry',
				},
			},
		}
	}

	function deriveCreateFormWorkflowDecision(session, observation, state, form, taskText) {
		const values = extractCreateRecordValues(taskText)
		const fields = annotateCreateRecordFields(collectCreateRecordFields(form), values)
		if (!fields.length) return null
		seedCreateRecordStateFromHistory(state, session)
		const targets = fields
			.map((field) => {
				const target = getCreateFieldTarget(field, values)
				return target ? { field, target, key: getCreateFieldKey(field, target.kind) } : null
			})
			.filter(Boolean)
		const nextTarget = targets.find((item) => {
			const { field, target, key } = item
			if (state.completedKeys.includes(key)) return false
			if (isCreateFieldAlreadySatisfied(field, target)) return false
			return getCreateFieldFailureCount(state, key) < getCreateFieldRetryLimit(target)
		})
		if (nextTarget) return buildCreateFieldDecision(nextTarget.field, nextTarget.target, state)
		const blockedTarget = targets.find((item) => {
			const { field, target, key } = item
			return !state.completedKeys.includes(key) && !isCreateFieldAlreadySatisfied(field, target)
		})
		if (blockedTarget) {
			const label = getObservedItemLabel(blockedTarget.field) || blockedTarget.target.kind
			return {
				evaluation_previous_goal: `创建表单字段 "${label}" 多次填写失败，已停止提交。`,
				memory: '通用创建表单 workflow 不会在明确字段失败后继续保存，避免提交缺字段表单。',
				thought: `字段 "${label}" 仍未成功填写，继续保存会触发表单校验失败。`,
				next_goal: `停止创建表单：${label} 未完成`,
				action: {
					name: 'done',
					input: {
						success: false,
						text: `创建表单字段 "${label}" 未能完成，已停止提交以避免保存不完整数据。`,
						workflow: 'create-record',
						workflow_step: 'create_record_blocked',
					},
				},
			}
		}
		const requiredDecision = deriveMissingRequiredCreateFieldDecision(fields, state)
		if (requiredDecision) return requiredDecision
		const field = fields.find((item) => {
			const target = getCreateFieldTarget(item, values)
			if (!target) return false
			const key = getCreateFieldKey(item, target.kind)
			if (state.completedKeys.includes(key)) return false
			return !isCreateFieldAlreadySatisfied(item, target)
		})
		if (field) return buildCreateFieldDecision(field, getCreateFieldTarget(field, values), state)
		const submit = findCreateSubmitAction(observation)
		if (submit && !state.submitAttempted && areCreateTargetsComplete(targets, state) && hasAnyCreateFieldCompleted(state)) {
			state.submitAttempted = true
			return {
				evaluation_previous_goal: '新增/创建表单字段已按任务信息填写完成。',
				memory: '通用创建表单 workflow 已处理文本字段、选择字段和级联字段，准备提交保存。',
				thought: '表单中的任务目标字段已经处理完，点击保存完成创建。',
				next_goal: `提交创建表单：${getObservedItemLabel(submit) || '保存'}`,
				action: {
					name: 'click_element_by_index',
					input: {
						index: Number(submit.index),
						target_label: getObservedItemLabel(submit) || '保存',
						workflow_step: 'submit_create_record',
					},
				},
			}
		}
		return null
	}

	function buildCreateFieldDecision(field, target, state) {
		const label = getObservedItemLabel(field) || target.kind
		if (target.kind === 'region' && Array.isArray(target.path) && target.path.length) {
			return {
				evaluation_previous_goal: `准备填写创建表单的级联字段 "${label}"。`,
				memory: '通用创建表单 workflow 根据任务中的地区/区域描述生成级联路径。',
				thought: '地区是级联选择器，直接使用完整路径逐级选择。',
				next_goal: `选择级联字段：${label}`,
				action: {
					name: 'select_cascader_path',
					input: {
						index: Number(field.index),
						path: target.path,
						target_label: label,
						workflow_step: 'select_create_cascader',
						create_field_key: getCreateFieldKey(field, target.kind),
					},
				},
			}
		}
		if (isCreateSelectionField(field)) {
			const key = getCreateFieldKey(field, target.kind)
			const rememberedOptions = getRememberedCreateOptions(state, key)
			const option = pickCreateOptionForTarget(rememberedOptions, target.value)
			const actionName = getCreateSelectionActionName(field, target)
			if (target.kind === 'role' && !option) {
				return {
					evaluation_previous_goal: `准备填写创建表单的选择字段 "${label}"。`,
					memory: '通用创建表单 workflow 对角色这类多选下拉使用一次性展开并勾选，避免弹层在两步之间关闭。',
					thought: `角色字段通常是复选下拉，直接在字段范围内选择 "${target.value}"。`,
					next_goal: `选择字段 "${label}"：${target.value}`,
					action: {
						name: actionName,
						input: {
							index: Number(field.index),
							text: target.value,
							label: target.value,
							target_label: label,
							workflow_step: 'select_create_option',
							create_field_key: key,
						},
					},
				}
			}
			if (option) {
				return {
					evaluation_previous_goal: `准备填写创建表单的选择字段 "${label}"。`,
					memory: '通用创建表单 workflow 使用字段真实候选，避免臆造不存在的下拉项。',
					thought: `目标值 "${target.value}" 已匹配到真实候选 "${option}"，现在选择它。`,
					next_goal: `选择字段 "${label}"：${option}`,
					action: {
						name: actionName,
						input: {
							index: Number(field.index),
							text: option,
							label: option,
							target_label: label,
							workflow_step: 'select_create_option',
							create_field_key: key,
						},
					},
				}
			}
			if (!state.openedOptionKeys.includes(key)) {
				return {
					evaluation_previous_goal: `准备填写创建表单的选择字段 "${label}"。`,
					memory: '通用创建表单 workflow 会先展开选择字段读取真实候选，再进行选择。',
					thought: `字段 "${label}" 是下拉选择器，先展开获取真实候选。`,
					next_goal: `展开选择字段 "${label}"`,
					action: {
						name: 'open_dropdown',
						input: {
							index: Number(field.index),
							target_label: label,
							workflow_step: 'open_create_option_field',
							create_field_key: key,
						},
					},
				}
			}
			return {
				evaluation_previous_goal: `准备填写创建表单的选择字段 "${label}"。`,
				memory: '通用创建表单 workflow 使用任务中的目标值，并让页面动作在字段范围内展开和选择真实候选。',
				thought: '该字段是下拉选择器，使用字段索引绑定选择目标，避免全局误选。',
				next_goal: `选择字段 "${label}"：${target.value}`,
				action: {
					name: actionName,
					input: {
						index: Number(field.index),
						text: target.value,
						label: target.value,
						target_label: label,
						workflow_step: 'select_create_option',
						create_field_key: key,
					},
				},
			}
		}
		return {
			evaluation_previous_goal: `准备填写创建表单文本字段 "${label}"。`,
			memory: '通用创建表单 workflow 优先填写任务中明确给出的文本字段。',
			thought: '该字段是普通输入框，直接写入任务目标值。',
			next_goal: `填写字段 "${label}"`,
			action: {
				name: 'input_text',
				input: {
					index: Number(field.index),
					text: target.value,
					target_label: label,
					workflow_step: 'fill_create_field',
					create_field_key: getCreateFieldKey(field, target.kind),
				},
			},
		}
	}

	function deriveMissingRequiredCreateFieldDecision(fields, state) {
		const missing = (Array.isArray(fields) ? fields : []).find((field) =>
			isMissingRequiredCreateSelectionField(field, state)
		)
		if (!missing) return null
		const key = getCreateFieldKey(missing, 'required')
		const label = getObservedItemLabel(missing) || '必填下拉字段'
		const rememberedOptions = getRememberedRequiredOptions(state, key)
		const option = pickRequiredCreateOption(rememberedOptions)
		if (option) {
			return {
				evaluation_previous_goal: `必填选择字段 "${label}" 仍为空，使用已观察到的真实候选补齐。`,
				memory: '通用创建表单 workflow 会先补齐必填选择字段，再提交保存。',
				thought: `字段 "${label}" 是必填下拉，选择已展开候选中的 "${option}"。`,
				next_goal: `选择必填字段 "${label}"：${option}`,
				action: {
					name: 'choose_dropdown_option',
					input: {
						index: Number(missing.index),
						text: option,
						label: option,
						target_label: label,
						workflow_step: 'select_create_required_option',
						create_field_key: key,
					},
				},
			}
		}
		if (!state.openedRequiredKeys.includes(key)) {
			return {
				evaluation_previous_goal: `必填选择字段 "${label}" 仍为空，先展开查看真实候选。`,
				memory: '通用创建表单 workflow 不会在必填选择字段为空时直接提交。',
				thought: `字段 "${label}" 是必填下拉，先展开候选再选择。`,
				next_goal: `展开必填字段 "${label}"`,
				action: {
					name: 'open_dropdown',
					input: {
						index: Number(missing.index),
						target_label: label,
						workflow_step: 'open_create_required_field',
						create_field_key: key,
					},
				},
			}
		}
		return {
			evaluation_previous_goal: `必填选择字段 "${label}" 仍为空，且没有可用候选。`,
			memory: '通用创建表单 workflow 已避免提交缺少必填项的表单。',
			thought: `字段 "${label}" 需要选择，但当前没有稳定候选可用。`,
			next_goal: `停止创建表单：${label} 缺少候选`,
			action: {
				name: 'done',
				input: {
					success: false,
					text: `创建表单缺少必填字段 "${label}"，且未观察到可选择候选。`,
					workflow: 'create-record',
					workflow_step: 'create_record_missing_required',
				},
			},
		}
	}

	function isMissingRequiredCreateSelectionField(field, state) {
		if (!field?.required) return false
		if (!isCreateSelectionField(field)) return false
		const key = getCreateFieldKey(field, 'required')
		if (state.completedKeys.includes(key)) return false
		if (hasCompletedCreateFieldForSameControl(state, field)) return false
		const value = getNavigationKey(field.valueState || field.value || '')
		return !value || /^(empty|unknown)$/.test(value)
	}

	function hasCompletedCreateFieldForSameControl(state, field) {
		const sid = String(field?.stableId || field?.sid || '').trim()
		const index = String(Number(field?.index) || '')
		return (Array.isArray(state?.completedKeys) ? state.completedKeys : []).some((key) => {
			const parts = String(key || '').split(':')
			return (sid && parts[1] === sid) || (index && parts[1] === index) || (index && parts[2] === index)
		})
	}

	function getRememberedRequiredOptions(state, key) {
		const options = state?.requiredOptionsByKey?.[key]
		return Array.isArray(options) ? options : []
	}

	function getRememberedCreateOptions(state, key) {
		const options = state?.createOptionsByKey?.[key]
		return Array.isArray(options) ? options : []
	}

	function getCreateSelectionActionName(field, target) {
		const kind = getNavigationKey(target?.kind || '')
		const control = getNavigationKey(field?.selectionControl || field?.control || field?.controlKind || '')
		const fieldKind = getNavigationKey(field?.kind || '')
		const value = getNavigationKey(field?.valueState || field?.value || '')
		if (kind === 'role') return 'select_checkbox_option'
		if (/(checkbox|multi|multiple)/i.test(`${control} ${fieldKind} ${value}`)) return 'select_checkbox_option'
		return 'choose_dropdown_option'
	}

	function pickCreateOptionForTarget(options, requested) {
		const list = (Array.isArray(options) ? options : [])
			.map((item) => String(item || '').trim())
			.filter((item) => item && !/^\(?empty\)?$/i.test(item) && !/^(请选择|选择|展开选项)$/i.test(item))
		const expected = getNavigationKey(requested || '')
		if (!expected || !list.length) return ''
		return list.find((item) => getNavigationKey(item) === expected) ||
			list.find((item) => getNavigationKey(item).includes(expected)) ||
			list.find((item) => expected.includes(getNavigationKey(item))) ||
			''
	}

	function pickRequiredCreateOption(options) {
		return (Array.isArray(options) ? options : [])
			.map((item) => String(item || '').trim())
			.find((item) => item && !/^\(?empty\)?$/i.test(item) && !/^(请选择|选择|展开选项)$/i.test(item)) || ''
	}

	function buildNavigationRevealDecision(state, observation, unresolved, reason) {
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
		if (!items.length) return null
		return items.sort((a, b) => scoreNavigationCandidate(a, targetKey) - scoreNavigationCandidate(b, targetKey))[0]
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
		if (labelKey === targetKey) return true
		if (labelKey.endsWith(targetKey)) return true
		return targetKey.length >= 3 && labelKey.includes(targetKey)
	}

	function scoreNavigationCandidate(item, targetKey) {
		const labelKey = getNavigationKey(getObservedItemLabel(item))
		let score = 0
		if (labelKey !== targetKey) score += 20
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

	function isCreateRecordTask(taskText) {
		return /(创建|新建|新增|添加|增加|create|add|new)\s*(一个|一条|新的)?[\u4e00-\u9fa5A-Za-z0-9_-]{0,18}/i.test(String(taskText || ''))
	}

	function findCreateEntryCandidate(observation, taskText) {
		const entityHints = extractCreateEntityHints(taskText)
		const items = collectCreateEntryItems(observation)
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => isCreateEntryCandidateItem(item))
		if (!items.length) return null
		return items.sort((a, b) =>
			scoreCreateEntryCandidate(a, entityHints) - scoreCreateEntryCandidate(b, entityHints)
		)[0]
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

	function hasLikelyCreateDialogOrForm(observation) {
		const title = getNavigationKey(observation?.title || '')
		if (/(新增|新建|创建|添加|增加|add|create|new)/i.test(title)) return true
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		return forms.some((form) => {
			const name = getNavigationKey(form?.name || form?.title || '')
			const fields = Array.isArray(form?.fields) ? form.fields : []
			if (/(新增|新建|创建|添加|增加|add|create|new)/i.test(name)) return true
			return fields.length >= 2 && fields.some((field) => /^(dialog|popover)$/.test(getNavigationKey(field?.region)))
		})
	}

	function findCreateRecordForm(observation) {
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		const candidates = forms
			.map((form) => ({
				form,
				fields: Array.isArray(form?.fields) ? form.fields.filter(isCreateRecordField) : [],
			}))
			.filter((item) => item.fields.length >= 2)
			.filter((item) => !isSearchLikeForm(item.form))
		if (!candidates.length) return null
		return candidates.sort((a, b) => scoreCreateRecordForm(a) - scoreCreateRecordForm(b))[0].form
	}

	function isCreateRecordField(field) {
		if (!field || typeof field !== 'object') return false
		if (!Number.isFinite(Number(field.index))) return false
		const region = getNavigationKey(field.region || '')
		if (/^(header|sidebar|pagination)$/.test(region)) return false
		const role = getNavigationKey(field.role || '')
		if (/^(checkbox|radio|option|menuitem)$/.test(role)) return false
		return true
	}

	function isSearchLikeForm(form) {
		const text = getNavigationKey([form?.name, form?.id, form?.label].filter(Boolean).join(' '))
		return /(搜索|查询|筛选|过滤|filter|search|query)/i.test(text)
	}

	function scoreCreateRecordForm(item) {
		const form = item?.form || {}
		const name = getNavigationKey(form.name || form.title || form.id || '')
		const fields = Array.isArray(item?.fields) ? item.fields : []
		let score = 0
		if (/(新增|新建|创建|添加|增加|add|create|new|弹层|dialog)/i.test(name)) score -= 12
		if (fields.some((field) => /^(dialog|popover)$/.test(getNavigationKey(field?.region)))) score -= 10
		if (fields.some((field) => /(username|password|name|role|gender|region)/i.test(String(field?.fieldType || '')))) score -= 4
		return score * 1000 - Math.min(fields.length, 30)
	}

	function collectCreateRecordFields(form) {
		const fields = (Array.isArray(form?.fields) ? form.fields : [])
			.filter(isCreateRecordField)
			.filter((field) => !isActionLikeFormField(field))
		return fields.sort((a, b) => {
			const ar = a?.rect || {}
			const br = b?.rect || {}
			return (Number(ar.top) || 0) - (Number(br.top) || 0) ||
				(Number(ar.left) || 0) - (Number(br.left) || 0) ||
				(Number(a.index) || 0) - (Number(b.index) || 0)
		})
	}

	function isActionLikeFormField(field) {
		const role = getNavigationKey(field?.role || '')
		const control = getNavigationKey(field?.selectionControl || field?.control || '')
		return role === 'button' || /^(checkbox|radio)$/.test(control)
	}

	function extractCreateRecordValues(taskText) {
		const text = String(taskText || '')
		const username = matchTaskValue(text, ['用户名', '登录账号', '账号名称', '账户名称', 'user name', 'username'])
		const name = matchTaskValue(text, ['用户姓名', '姓名', '名称', '名字', 'name'])
		const password = matchLastTaskValue(text, ['密码', 'password', 'pwd'])
		const gender = matchTaskChoice(text, ['性别', 'gender', 'sex'], ['男', '女', '未知', '保密'])
		const role = matchTaskValue(text, ['所属角色', '角色', 'role'])
		const platform = matchTaskValue(text, ['用户平台', '平台', 'platform'])
		return {
			username,
			name: name || username,
			password,
			gender,
			role,
			platform,
			regionPath: extractRegionPath(text),
		}
	}

	function matchTaskValue(text, labels) {
		const source = String(text || '')
		for (const label of labels) {
			const pattern = new RegExp(`${escapeRegExp(label)}\\s*(?:是|为|叫|名为|名称为|设为|设置为|[:：=])?\\s*([^\\s，,；;。]+)`, 'i')
			const match = source.match(pattern)
			if (match?.[1]) return cleanTaskValue(match[1])
		}
		return ''
	}

	function matchLastTaskValue(text, labels) {
		let found = ''
		const source = String(text || '')
		for (const label of labels) {
			const pattern = new RegExp(`${escapeRegExp(label)}\\s*(?:是|为|叫|名为|设为|设置为|[:：=])?\\s*([^\\s，,；;。]+)`, 'gi')
			for (const match of source.matchAll(pattern)) {
				const value = cleanTaskValue(match?.[1] || '')
				if (value) found = value
			}
		}
		return found
	}

	function matchTaskChoice(text, labels, choices) {
		const source = String(text || '')
		for (const label of labels) {
			const pattern = new RegExp(`${escapeRegExp(label)}\\s*(?:是|为|[:：=])?\\s*(${choices.map(escapeRegExp).join('|')})`, 'i')
			const match = source.match(pattern)
			if (match?.[1]) return match[1]
		}
		return ''
	}

	function cleanTaskValue(value) {
		return String(value || '')
			.replace(/^(是|为|叫|名为|名称为|设为|设置为)/, '')
			.replace(/[，,；;。].*$/, '')
			.trim()
	}

	function extractRegionPath(taskText) {
		const explicit = matchTaskValue(taskText, ['所属区域', '地区', '区域', '籍贯', '所在地', '地址'])
		const raw = explicit || String(taskText || '').match(/([^\s，,；;。]{2,30})人(?:，|,|。|；|;|$)/)?.[1] || ''
		return splitRegionPath(raw)
	}

	function splitRegionPath(rawValue) {
		let text = cleanTaskValue(rawValue)
			.replace(/(人|人士|户籍|籍贯|所在地)$/g, '')
			.trim()
		if (!text) return []
		const delimited = text.split(/[>\/\\|,，\s]+/).map((item) => item.trim()).filter(Boolean)
		if (delimited.length > 1) return delimited.slice(0, 4)
		const province = findLeadingRegionName(text, CHINA_PROVINCE_NAMES)
		const parts = []
		if (province) {
			parts.push(province)
			text = text.slice(province.length)
		}
		text = text.replace(/^(省|市|自治区|特别行政区)/, '')
		if (!text) return parts
		const suffixParts = text.match(/([\u4e00-\u9fa5]{2,12}?(?:省|市|区|县|州|盟|旗))/g)
		if (suffixParts?.length) return [...parts, ...suffixParts.map((item) => item.replace(/(省|市|区|县|州|盟|旗)$/g, ''))].slice(0, 4)
		if (text.length <= 3) return [...parts, text]
		const city = text.slice(0, 2)
		const rest = text.slice(2)
		return [...parts, city, rest].filter(Boolean).slice(0, 4)
	}

	function findLeadingRegionName(text, names) {
		const source = String(text || '')
		return names.find((name) => source.startsWith(name)) || ''
	}

	const CHINA_PROVINCE_NAMES = [
		'北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽',
		'福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西',
		'甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门',
	]

	function annotateCreateRecordFields(fields, values) {
		const list = (Array.isArray(fields) ? fields : []).map((field) => ({ ...field }))
		if (values?.role && !list.some((field) => fieldMatchesCreateKind(field, 'role'))) {
			const roleField = inferRoleFieldFromCreateLayout(list)
			if (roleField) roleField.createInferredKind = 'role'
		}
		return list
	}

	function inferRoleFieldFromCreateLayout(fields) {
		const list = Array.isArray(fields) ? fields : []
		const positionIndex = list.findIndex((field) => fieldMatchesAuxiliaryCreateKind(field, 'position'))
		const regionIndex = list.findIndex((field) => fieldMatchesCreateKind(field, 'region'))
		const platformIndex = list.findIndex((field) => fieldMatchesCreateKind(field, 'platform'))
		const candidates = list
			.map((field, index) => ({ field, index }))
			.filter(({ field }) => isCreateSelectionField(field))
			.filter(({ field }) => isWeakCreateFieldLabel(field))
			.filter(({ field }) => !fieldMatchesCreateKind(field, 'gender') && !fieldMatchesCreateKind(field, 'region') && !fieldMatchesCreateKind(field, 'platform'))
			.filter(({ index }) => positionIndex < 0 || index > positionIndex)
			.filter(({ index }) => regionIndex < 0 || index < regionIndex)
		if (!candidates.length) return null
		const beforePlatform = platformIndex >= 0
			? candidates.find(({ index }) => index < platformIndex)
			: null
		return (beforePlatform || candidates[0]).field
	}

	function isWeakCreateFieldLabel(field) {
		const label = getNavigationKey(getObservedItemLabel(field) || field?.label || field?.placeholder || field?.text || '')
		return !label || /^(展开选项|请选择|选择|select|choose|empty|\(empty\))$/i.test(label)
	}

	function fieldMatchesAuxiliaryCreateKind(field, kind) {
		const text = getNavigationKey([
			field?.fieldType,
			field?.label,
			field?.placeholder,
			field?.aliases,
			field?.text,
		].filter(Boolean).join(' '))
		if (kind === 'position') return /(position|岗位|职位|职务)/i.test(text)
		if (kind === 'department') return /(department|部门|组织|机构)/i.test(text)
		return false
	}

	function getCreateFieldTarget(field, values) {
		if (!field || !values) return null
		if (field.createInferredKind === 'role' && values.role) return { kind: 'role', value: values.role }
		if (fieldMatchesCreateKind(field, 'username') && values.username) return { kind: 'username', value: values.username }
		if (fieldMatchesCreateKind(field, 'password') && values.password) return { kind: 'password', value: values.password }
		if (fieldMatchesCreateKind(field, 'confirm_password') && values.password) return { kind: 'confirm_password', value: values.password }
		if (fieldMatchesCreateKind(field, 'name') && values.name) return { kind: 'name', value: values.name }
		if (fieldMatchesCreateKind(field, 'gender') && values.gender) return { kind: 'gender', value: values.gender }
		if (fieldMatchesCreateKind(field, 'role') && values.role) return { kind: 'role', value: values.role }
		if (fieldMatchesCreateKind(field, 'platform') && values.platform) return { kind: 'platform', value: values.platform }
		if (fieldMatchesCreateKind(field, 'region') && values.regionPath?.length) return { kind: 'region', path: values.regionPath }
		return null
	}

	function fieldMatchesCreateKind(field, kind) {
		const text = getNavigationKey([
			field?.fieldType,
			field?.label,
			field?.placeholder,
			field?.aliases,
			field?.text,
		].filter(Boolean).join(' '))
		const value = getNavigationKey(field?.valueState || field?.value || '')
		const control = getNavigationKey(field?.selectionControl || field?.control || field?.controlKind || '')
		if (kind === 'username') return /(username|account|账号|账户|用户名|登录账号|登录名)/i.test(text)
		if (kind === 'password') return /(password|pwd|密码)/i.test(text) && !/(confirm|确认|重复|再次)/i.test(text)
		if (kind === 'confirm_password') return /(confirm_password|确认密码|重复密码|再次输入密码|passwordconfirm)/i.test(text)
		if (kind === 'name') return /(用户姓名|姓名|真实姓名|name)/i.test(text) && !/(username|用户名|登录账号|账号)/i.test(text)
		if (kind === 'gender') return /(gender|sex|性别)/i.test(text) || /(男.*女|女.*男)/i.test(value)
		if (kind === 'role') return /(role|角色)/i.test(text) || /(管理员|admin|manager)/i.test(value)
		if (kind === 'platform') return /(platform|平台|客户端)/i.test(text) || /\b(web|app|ios|android|other)\b/i.test(value)
		if (kind === 'region') return /(region|area|province|city|district|所属区域|区域|地区|省|市|区|县)/i.test(text) || /cascader/.test(control)
		return false
	}

	function isCreateSelectionField(field) {
		const role = getNavigationKey(field?.role || '')
		const control = getNavigationKey(field?.selectionControl || field?.control || field?.controlKind || '')
		const kind = getNavigationKey(field?.controlKind || field?.kind || '')
		return role === 'combobox' || /(dropdown|select|cascader|checkbox|radio)/i.test(`${control} ${kind}`)
	}

	function isCreateFieldAlreadySatisfied(field, target) {
		if (!field || !target) return false
		if (target.kind === 'region') return false
		const expected = getNavigationKey(target.value || '')
		if (!expected) return false
		const value = getNavigationKey(field.valueState || field.value || '')
		if (!value || /^(empty|unknown)$/.test(value)) return false
		if (isCreateSelectionField(field)) return false
		return value.includes(expected)
	}

	function getCreateFieldKey(field, kind) {
		return [
			String(kind || ''),
			String(Number(field?.index) || ''),
			getNavigationKey(getObservedItemLabel(field) || field?.fieldType || ''),
		].join(':')
	}

	function findCreateSubmitAction(observation) {
		const actions = Array.isArray(observation?.actions) ? observation.actions : []
		return actions
			.filter((item) => Number.isFinite(Number(item?.index)))
			.filter((item) => /^(dialog|popover|content)$/.test(getNavigationKey(item?.region || '')))
			.filter((item) => {
				const text = getNavigationKey([item?.actionIntent || item?.intent, getObservedItemLabel(item)].join(' '))
				if (/(取消|关闭|返回|cancel|close|back)/i.test(text)) return false
				return /(保存|提交|确认|完成|确定|save|submit|confirm|ok)/i.test(text)
			})
			.sort((a, b) => scoreCreateSubmitAction(a) - scoreCreateSubmitAction(b))[0] || null
	}

	function scoreCreateSubmitAction(item) {
		const text = getNavigationKey([item?.actionIntent || item?.intent, getObservedItemLabel(item)].join(' '))
		let score = 0
		if (/(保存|save)/i.test(text)) score -= 10
		if (/(提交|确认|确定|submit|confirm|ok)/i.test(text)) score -= 5
		const rect = item?.rect || {}
		return score * 1000000 + (Number(rect.top) || 0) * 1000 + (Number(rect.left) || 0)
	}

	function recordCreateRecordWorkflowOutcome(session, decision, outcome) {
		const state = syncCreateRecordState(session)
		const item = {
			action: decision?.action?.name || '',
			input: decision?.action?.input || {},
			success: outcome?.success !== false,
			output: String(outcome?.output || outcome?.message || ''),
			meta: outcome?.meta || null,
			outcome: outcome?.outcome || outcome?.meta?.outcome || null,
		}
		applyCreateRecordHistoryItemToState(state, item)
	}

	function seedCreateRecordStateFromHistory(state, session) {
		if (!state || state.seededFieldHistory) return
		for (const item of Array.isArray(session?.history) ? session.history : []) {
			applyCreateRecordHistoryItemToState(state, item)
		}
		state.seededFieldHistory = true
	}

	function applyCreateRecordHistoryItemToState(state, item) {
		if (!state || !item) return
		const input = item?.input || {}
		const step = String(input.workflow_step || '')
		if (step === 'open_create_entry') {
			state.openAttempted = true
			return
		}
		if (step === 'submit_create_record') {
			state.submitAttempted = true
			return
		}
		if (step === 'open_create_required_field') {
			const key = String(input.create_field_key || '').trim()
			if (!key) return
			const options = extractVisibleOptionsFromOutcome(item)
			if (options.length) state.requiredOptionsByKey[key] = options
			if (item.success !== false || options.length) {
				addUnique(state.openedRequiredKeys, key)
			} else {
				addUnique(state.failedKeys, key)
				state.failedCounts[key] = getCreateFieldFailureCount(state, key) + 1
			}
			return
		}
		if (step === 'open_create_option_field') {
			const key = String(input.create_field_key || '').trim()
			if (!key) return
			const options = extractVisibleOptionsFromOutcome(item)
			if (options.length) state.createOptionsByKey[key] = options
			if (item.success !== false || options.length) {
				addUnique(state.openedOptionKeys, key)
			} else {
				addUnique(state.failedKeys, key)
				state.failedCounts[key] = getCreateFieldFailureCount(state, key) + 1
			}
			return
		}
		if (!/^(fill_create_field|select_create_option|select_create_cascader|select_create_required_option)$/.test(step)) return
		const key = String(input.create_field_key || '').trim()
		if (!key) return
		const options = extractVisibleOptionsFromOutcome(item)
		if (options.length && step === 'select_create_option') state.createOptionsByKey[key] = options
		if (item.success === false) {
			addUnique(state.failedKeys, key)
			state.failedCounts[key] = getCreateFieldFailureCount(state, key) + 1
		} else {
			removeValue(state.failedKeys, key)
			delete state.failedCounts[key]
			addUnique(state.completedKeys, key)
		}
	}

	function hasAnyCreateFieldCompleted(state) {
		return Array.isArray(state?.completedKeys) && state.completedKeys.length > 0
	}

	function areCreateTargetsComplete(targets, state) {
		const list = Array.isArray(targets) ? targets : []
		if (!list.length) return false
		return list.every(({ field, target, key }) =>
			state.completedKeys.includes(key) || isCreateFieldAlreadySatisfied(field, target)
		)
	}

	function getCreateFieldFailureCount(state, key) {
		if (!state || !key) return 0
		const counts = state.failedCounts && typeof state.failedCounts === 'object' ? state.failedCounts : {}
		if (Number.isFinite(Number(counts[key]))) return Number(counts[key])
		return Array.isArray(state.failedKeys) && state.failedKeys.includes(key) ? 1 : 0
	}

	function getCreateFieldRetryLimit(target) {
		if (target?.kind === 'region') return 3
		return 2
	}

	function extractVisibleOptionsFromOutcome(item) {
		const candidates = []
		for (const value of [
			item?.meta?.visibleOptions,
			item?.outcome?.visibleOptions,
			item?.meta?.outcome?.visibleOptions,
		]) {
			if (Array.isArray(value)) candidates.push(...value)
		}
		return candidates.map((option) => String(option || '').trim()).filter(Boolean).slice(0, 24)
	}

	function syncCreateRecordState(session) {
		if (!session || typeof session !== 'object') {
			return {
				version: 1,
				openAttempted: false,
				completedKeys: [],
				failedKeys: [],
				failedCounts: {},
				openedOptionKeys: [],
				createOptionsByKey: {},
				openedRequiredKeys: [],
				requiredOptionsByKey: {},
				submitAttempted: false,
			}
		}
		if (!session.workflowState || typeof session.workflowState !== 'object') session.workflowState = {}
		const existing = session.workflowState.createRecord
		const state = existing && typeof existing === 'object' ? existing : { version: 1, openAttempted: false }
		state.version = 1
		if (!Array.isArray(state.completedKeys)) state.completedKeys = []
		if (!Array.isArray(state.failedKeys)) state.failedKeys = []
		if (!Array.isArray(state.openedOptionKeys)) state.openedOptionKeys = []
		if (!Array.isArray(state.openedRequiredKeys)) state.openedRequiredKeys = []
		if (!state.failedCounts || typeof state.failedCounts !== 'object') state.failedCounts = {}
		if (!state.createOptionsByKey || typeof state.createOptionsByKey !== 'object') state.createOptionsByKey = {}
		if (!state.requiredOptionsByKey || typeof state.requiredOptionsByKey !== 'object') state.requiredOptionsByKey = {}
		state.submitAttempted = !!state.submitAttempted
		session.workflowState.createRecord = state
		if (!state.seededFromHistory) {
			state.openAttempted = state.openAttempted || hasCreateEntryHistory(session)
			state.seededFromHistory = true
		}
		return state
	}

	function hasCreateEntryHistory(session) {
		return (Array.isArray(session?.history) ? session.history : []).some((item) =>
			String(item?.input?.workflow_step || '') === 'open_create_entry'
		)
	}

	function buildCreateCandidateKey(item) {
		return [
			getNavigationKey(item?.region || ''),
			getNavigationKey(getObservedItemLabel(item)),
			String(Number(item?.index) || ''),
		].join(':')
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
			version: 3,
			plannedKeys: [],
			attemptedKeys: [],
			succeededKeys: [],
			failedKeys: [],
			revealAttemptKeys: [],
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
		state.version = 3
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
		if (title.includes(targetKey)) return true
		return collectObservedNavigationStateItems(observation).some((item) => {
			if (!isSelectedOrActiveObservedItem(item)) return false
			return getNavigationKey(getObservedItemLabel(item)) === targetKey
		})
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
		if (action !== 'click_element_by_index' && action !== 'click') return false
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
