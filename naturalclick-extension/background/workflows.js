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
