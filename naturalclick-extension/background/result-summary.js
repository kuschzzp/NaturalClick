;(function (g) {
	const SEARCH_STATUS_LABELS = {
		passed_match: '通过',
		failed_empty_result: '失败：结果为空',
		failed_value_missing: '失败：结果未包含测试值',
		failed_terminal: '失败：任务终止',
		unknown_no_value: '未确认：缺少测试值',
		unknown_no_table: '未确认：缺少表格摘要',
		unknown_empty_result: '未确认：结果为空',
		unknown_value_missing: '未确认：结果未包含测试值',
		unknown_missing_sample: '未确认：缺少真实样本/候选证据',
		unknown_not_recorded: '未确认：缺少结果记录',
		unknown_result_pending: '未确认：已提交待观察',
	}
	const SOURCE_LABELS = {
		table_sample: '列表样本',
		task_value: '任务文本',
		visible_option: '真实候选',
		option_candidate: '真实候选',
		missing_sample: '缺少样本',
	}
	const FIELD_ACTION_LABELS = {
		click: '点击/切换控件',
		click_element_by_index: '点击/切换控件',
		input_text: '输入文本',
		choose_dropdown_option: '选择候选',
		select_checkbox_option: '选择选项',
		select_cascader_path: '选择级联路径',
		select_visible_cascader_option: '选择级联候选',
		open_dropdown: '展开候选',
	}
	const FIELD_VALUE_SOURCE_LABELS = {
		type_constraints: '字段约束',
		type_default: '类型默认值',
		task_value: '任务文本',
		table_sample: '列表样本',
		visible_option: '真实候选',
		option_candidate: '真实候选',
		page_validation: '页面校验',
		previous_action: '历史动作',
	}

	function buildResultSummary(session) {
		const search = buildSearchResultSummary(session)
		if (search) return enrichResultSummaryWithOperationalDiagnostics(search, session)
		const information = buildInformationResultSummary(session)
		if (information) return enrichResultSummaryWithOperationalDiagnostics(information, session)
		const formTask = buildFormTaskResultSummary(session)
		if (formTask) return enrichResultSummaryWithOperationalDiagnostics(formTask, session)
		const fieldActions = buildFieldActionResultSummary(session)
		if (fieldActions) return enrichResultSummaryWithOperationalDiagnostics(fieldActions, session)
		const login = buildLoginResultSummary(session)
		if (login) return enrichResultSummaryWithOperationalDiagnostics(login, session)
		const navigation = buildNavigationResultSummary(session)
		if (navigation) return enrichResultSummaryWithOperationalDiagnostics(navigation, session)
		return enrichResultSummaryWithOperationalDiagnostics(buildGenericResultSummary(session), session)
	}

	function buildNavigationResultSummary(session) {
		const state = session?.workflowState?.navigation && typeof session.workflowState.navigation === 'object'
			? session.workflowState.navigation
			: null
		const history = Array.isArray(session?.history) ? session.history : []
		const navHistory = history.filter(isNavigationSummaryHistoryItem)
		if (!state && !navHistory.length) return null
		const keys = collectNavigationSummaryKeys(state, navHistory)
		if (!keys.length) return null
		const items = keys.map((key, index) => buildNavigationSummaryItem(key, state, navHistory, index + 1))
		const terminalReason = extractNavigationTerminalReason(session, navHistory)
		const userInputRequired = countGenericUserInputRequired(history, terminalReason)
		const total = items.length
		const tested = items.filter((item) => item.recorded).length
		const reached = items.filter((item) => item.status === 'passed').length
		const failed = items.filter((item) => item.status === 'failed').length
		const unknown = items.filter((item) => item.status === 'unknown').length
		const remaining = items.filter((item) => !item.recorded).length
		const clickedUnverified = items.filter((item) => item.status === 'unknown' && item.recorded).length
		const revealAttempts = Array.isArray(state?.revealAttemptKeys) ? state.revealAttemptKeys.length : 0
		const visionAttempts = Array.isArray(state?.visionAttemptKeys) ? state.visionAttemptKeys.length : 0
		const terminalFailed = terminalReason && String(session?.status || '') === 'error' && !userInputRequired ? 1 : 0
		const status = deriveNavigationSummaryStatus(session, { reached, failed, unknown, remaining, terminalFailed, userInputRequired })
		const diagnostics = buildNavigationDiagnostics(items, {
			reached,
			failed,
			unknown,
			remaining,
			clickedUnverified,
			revealAttempts,
			visionAttempts,
			terminalReason,
			userInputRequired,
			terminalFailed,
		})
		const headline = buildNavigationHeadline(status, {
			total,
			tested,
			reached,
			failed,
			unknown,
			remaining,
			clickedUnverified,
			revealAttempts,
			visionAttempts,
			userInputRequired,
			terminalFailed,
		})
		const issues = [
			terminalReason ? {
				label: userInputRequired ? '需要用户补充' : '导航终态',
				status: userInputRequired ? 'unknown' : 'failed',
				statusLabel: userInputRequired ? '需要用户补充' : '失败',
				summary: terminalReason,
			} : null,
			...items
				.filter((item) => item.status !== 'passed')
				.map((item) => ({
					label: item.label,
					status: item.status,
					statusLabel: item.statusLabel,
					neededEvidence: item.neededEvidence || '',
					summary: item.summary,
				})),
		].filter(Boolean).slice(0, 12)
		return {
			type: 'navigation',
			title: '导航结果总结',
			status,
			headline,
			stats: {
				total,
				tested,
				passed: reached,
				reached,
				failed,
				unknown,
				remaining,
				clickedUnverified,
				revealAttempts,
				visionAttempts,
				userInputRequired,
				terminalFailed,
			},
			diagnostics,
			items,
			issues,
			remaining: items
				.filter((item) => item.status !== 'passed')
				.map((item) => item.label),
			remainingDetails: buildSummaryRemainingDetails(items),
			reason: issues.map((item) => item.summary).filter(Boolean).join('\n'),
			text: [
				headline,
				...diagnostics.map((item) => `诊断：${item.text}`),
				...items.map(formatNavigationSummaryItemLine),
				terminalReason ? `最后问题：${terminalReason}` : '',
			].filter(Boolean).join('\n'),
			generatedAt: Date.now(),
		}
	}

	function isNavigationSummaryHistoryItem(item) {
		const input = item?.input && typeof item.input === 'object' ? item.input : {}
		const step = String(input.workflow_step || '').trim()
		if (String(input.workflow || '').trim() === 'task-navigation') return true
		if (/^(navigate_to_task_target|reveal_navigation_options)$/i.test(step)) return true
		return !!String(input.workflow_nav_key || input.workflow_nav_alias || '').trim()
	}

	function collectNavigationSummaryKeys(state, navHistory) {
		const values = [
			...(Array.isArray(state?.plannedKeys) ? state.plannedKeys : []),
			...(Array.isArray(state?.attemptedKeys) ? state.attemptedKeys : []),
			...(Array.isArray(state?.succeededKeys) ? state.succeededKeys : []),
			...(Array.isArray(state?.failedKeys) ? state.failedKeys : []),
			...(Array.isArray(state?.concreteSucceededKeys) ? state.concreteSucceededKeys : []),
		]
		for (const item of (Array.isArray(navHistory) ? navHistory : [])) {
			const input = item?.input && typeof item.input === 'object' ? item.input : {}
			values.push(input.workflow_nav_key, input.workflow_nav_alias, input.target_label, input.label)
		}
		const out = []
		const seen = new Set()
		for (const value of values) {
			const key = normalizeNavigationSummaryKey(value)
			if (!key || seen.has(key)) continue
			seen.add(key)
			out.push(key)
		}
		return out
	}

	function buildNavigationSummaryItem(key, state, navHistory, order) {
		const records = (Array.isArray(navHistory) ? navHistory : [])
			.filter((item) => navigationHistoryItemMatchesKey(item, key))
		const concrete = navigationStateHasKey(state?.concreteSucceededKeys, key)
		const succeeded = navigationStateHasKey(state?.succeededKeys, key) || records.some((item) => item?.success === true)
		const failed = !concrete && (navigationStateHasKey(state?.failedKeys, key) || records.some((item) => item?.success === false))
		const attempted = navigationStateHasKey(state?.attemptedKeys, key) || records.length > 0
		const planned = navigationStateHasKey(state?.plannedKeys, key)
		const status = concrete
			? 'passed'
			: failed
				? 'failed'
				: succeeded || attempted
					? 'unknown'
					: 'unknown'
		const recorded = attempted || succeeded || failed || concrete
		const failedAttempts = records.filter((item) => item?.success === false).length + (failed && !records.some((item) => item?.success === false) ? 1 : 0)
		return {
			key,
			order,
			label: key,
			status,
			statusLabel: status === 'passed' ? '已到达' : status === 'failed' ? '失败' : recorded ? '已点击待确认' : '未尝试',
			recorded,
			value: '',
			source: 'task-navigation',
			sourceLabel: status === 'passed'
				? '到达确认'
				: status === 'failed'
					? '导航失败'
					: recorded
						? '导航点击'
						: planned
							? '已规划'
							: '导航目标',
			sourceTitle: '动作',
			attempts: records.length || (recorded ? 1 : 0),
			failedAttempts,
			neededEvidence: status === 'passed' ? '' : buildNavigationNeededEvidence(status, recorded),
			summary: buildNavigationItemSummary(key, { status, recorded, attempted, succeeded, concrete, failed, planned, failedAttempts }),
		}
	}

	function navigationHistoryItemMatchesKey(item, key) {
		const target = normalizeNavigationSummaryKey(key)
		if (!target) return false
		const input = item?.input && typeof item.input === 'object' ? item.input : {}
		return [
			input.workflow_nav_key,
			input.workflow_nav_alias,
			input.target_label,
			input.label,
			input.text,
			item?.nextGoal,
		].some((value) => normalizeNavigationSummaryKey(value) === target)
	}

	function navigationStateHasKey(values, key) {
		const target = normalizeNavigationSummaryKey(key)
		if (!target) return false
		return (Array.isArray(values) ? values : []).some((value) => normalizeNavigationSummaryKey(value) === target)
	}

	function normalizeNavigationSummaryKey(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
	}

	function buildNavigationNeededEvidence(status, recorded) {
		if (status === 'failed') return '需要换用更可靠的导航候选、先展开父级导航、补充导航上下文，或用视觉定位约束到真实子菜单。'
		if (recorded) return '需要观察页面标题、激活导航项或内容区表格/表单等证据，确认目标页面已经到达。'
		return '需要形成一次导航尝试，或说明该目标不属于本次任务范围。'
	}

	function buildNavigationItemSummary(key, meta = {}) {
		if (meta.concrete) return `目标 "${key}" 已有具体到达证据。`
		if (meta.failed) return `目标 "${key}" 的导航尝试失败${meta.failedAttempts ? `，失败 ${meta.failedAttempts} 次` : ''}。`
		if (meta.succeeded || meta.attempted) return `目标 "${key}" 已点击导航，但缺少页面到达证据。`
		if (meta.planned) return `目标 "${key}" 已规划但尚未形成导航动作记录。`
		return `目标 "${key}" 尚未形成导航动作记录。`
	}

	function deriveNavigationSummaryStatus(session, counts) {
		const sessionStatus = String(session?.status || '').trim()
		if (sessionStatus === 'running') return 'running'
		if (sessionStatus === 'stopped') return 'stopped'
		if (Number(counts.userInputRequired || 0)) return 'inconclusive'
		if (Number(counts.failed || 0) || Number(counts.terminalFailed || 0)) return 'failed'
		if (Number(counts.unknown || 0) || Number(counts.remaining || 0)) return 'inconclusive'
		if (Number(counts.reached || 0)) return 'passed'
		return 'inconclusive'
	}

	function buildNavigationHeadline(status, counts) {
		const prefix = status === 'running'
			? '导航进行中'
			: status === 'stopped'
				? '导航已中止'
				: status === 'passed'
					? '导航目标已到达'
					: status === 'failed'
						? '导航发现异常'
						: '导航未完全确认'
		const parts = [
			`共 ${counts.total} 项`,
			`已记录 ${counts.tested} 项`,
			`已到达 ${counts.reached} 项`,
			counts.clickedUnverified ? `点击未确认 ${counts.clickedUnverified} 项` : '',
			counts.failed ? `失败 ${counts.failed} 项` : '',
			counts.unknown ? `未确认 ${counts.unknown} 项` : '',
			counts.remaining ? `未尝试 ${counts.remaining} 项` : '',
			counts.revealAttempts ? `展开导航 ${counts.revealAttempts} 次` : '',
			counts.visionAttempts ? `视觉导航 ${counts.visionAttempts} 次` : '',
			counts.userInputRequired ? `需要用户补充 ${counts.userInputRequired} 项` : '',
			counts.terminalFailed ? `终态异常 ${counts.terminalFailed} 项` : '',
		].filter(Boolean)
		return `${prefix}：${parts.join('，')}。`
	}

	function buildNavigationDiagnostics(items, counts = {}) {
		const diagnostics = []
		const failed = Number(counts.failed || 0)
		const clickedUnverified = Number(counts.clickedUnverified || 0)
		const remaining = Number(counts.remaining || 0)
		const revealAttempts = Number(counts.revealAttempts || 0)
		const visionAttempts = Number(counts.visionAttempts || 0)
		const reached = Number(counts.reached || 0)
		const userInputRequired = Number(counts.userInputRequired || 0)
		const terminalReason = String(counts.terminalReason || '').trim()
		if (failed) {
			diagnostics.push({
				kind: 'navigation_failed',
				severity: 'error',
				count: failed,
				text: `导航失败：${failed} 项目标模块导航未成功${formatDiagnosticFieldList((items || []).filter((item) => item.status === 'failed'))}。`,
			})
		}
		if (clickedUnverified) {
			diagnostics.push({
				kind: 'navigation_unconfirmed',
				severity: 'warning',
				count: clickedUnverified,
				text: `导航到达未确认：${clickedUnverified} 项已点击导航，但尚缺页面标题、激活菜单或内容区证据，不能直接开始目标页测试。`,
			})
		}
		if (remaining) {
			diagnostics.push({
				kind: 'navigation_unattempted',
				severity: 'warning',
				count: remaining,
				text: `导航未尝试：${remaining} 项目标仍未形成导航动作记录。`,
			})
		}
		if (revealAttempts) {
			diagnostics.push({
				kind: 'navigation_reveal_attempt',
				severity: 'info',
				count: revealAttempts,
				text: `已尝试展开导航：${revealAttempts} 次，用于寻找隐藏的目标入口。`,
			})
		}
		if (visionAttempts) {
			diagnostics.push({
				kind: 'navigation_vision_attempt',
				severity: 'info',
				count: visionAttempts,
				text: `已尝试视觉导航：${visionAttempts} 次，用于处理父子菜单被合并或缺少稳定索引的情况。`,
			})
		}
		if (reached && !failed && !clickedUnverified && !remaining) {
			diagnostics.push({
				kind: 'navigation_reached',
				severity: 'success',
				count: reached,
				text: `导航目标已到达：${reached} 项目标有具体页面到达证据。`,
			})
		}
		if (userInputRequired) {
			diagnostics.push({
				kind: 'user_input_required',
				severity: 'warning',
				count: userInputRequired,
				text: `需要用户补充信息：${userInputRequired} 条记录显示导航过程中需要用户确认、缺失地址或额外信息。`,
			})
		}
		if (terminalReason && !userInputRequired) {
			diagnostics.push({
				kind: 'task_terminal_failure',
				severity: 'error',
				count: 1,
				text: `导航终态异常：${terminalReason}`,
			})
		}
		appendNextStepRecommendations(diagnostics, buildNavigationNextStepRecommendations(diagnostics))
		return diagnostics
	}

	function buildNavigationNextStepRecommendations(diagnostics) {
		const kinds = new Set((Array.isArray(diagnostics) ? diagnostics : []).map((item) => String(item?.kind || '')))
		const recommendations = []
		if (kinds.has('navigation_failed')) {
			recommendations.push('建议：先复查失败导航目标的候选标签、父级展开状态和点击后页面反馈，必要时请求导航区域上下文或改用受限视觉定位。')
		}
		if (kinds.has('navigation_unconfirmed')) {
			recommendations.push('建议：点击导航后先重新观察页面标题、激活菜单和内容区证据，确认到达目标页后再执行搜索、字段或表单测试。')
		}
		if (kinds.has('navigation_unattempted')) {
			recommendations.push('建议：从未尝试的目标继续，优先点击高置信导航项；若目标不可见，先展开相关导航容器。')
		}
		if (kinds.has('navigation_reveal_attempt')) {
			recommendations.push('建议：展开导航后重新观察，避免重复点击同一个展开入口。')
		}
		if (kinds.has('navigation_vision_attempt')) {
			recommendations.push('建议：视觉导航后必须用页面结构证据复核到达状态，不把视觉点击本身当作完成。')
		}
		if (kinds.has('user_input_required')) {
			recommendations.push('建议：先补充缺失地址、确认信息或必要输入，再继续导航。')
		}
		if (kinds.has('task_terminal_failure')) {
			recommendations.push('建议：先处理导航终止原因，再继续页面内测试，避免在错误页面执行后续动作。')
		}
		return recommendations
	}

	function extractNavigationTerminalReason(session, navHistory) {
		const terminal = extractSessionTerminalReason(session)
		if (terminal) return terminal
		const lastFailure = [...(Array.isArray(navHistory) ? navHistory : [])].reverse().find((item) => item?.success === false)
		return String(lastFailure?.outcome?.reason || lastFailure?.output || '').trim().slice(0, 600)
	}

	function formatNavigationSummaryItemLine(item) {
		const parts = [
			`${item.order}. ${item.label || item.key}：${item.statusLabel}`,
			item.sourceLabel ? `动作=${item.sourceLabel}` : '',
			item.attempts > 1 ? `尝试=${item.attempts}` : '',
			item.neededEvidence ? `需要补充=${item.neededEvidence}` : '',
			item.summary,
		].filter(Boolean)
		return parts.join('；')
	}

	function buildLoginResultSummary(session) {
		const state = session?.workflowState?.login && typeof session.workflowState.login === 'object'
			? session.workflowState.login
			: null
		const history = Array.isArray(session?.history) ? session.history : []
		const loginHistory = history.filter(isLoginHistoryItem)
		if (!state && !loginHistory.length) return null
		const sensitiveValues = collectSensitiveLoginValues(loginHistory)
		const terminalReason = maskSensitiveValuesInText(
			String(state?.failedReason || extractSessionTerminalReason(session) || '').trim(),
			sensitiveValues
		)
		const items = buildLoginSummaryItems(state, loginHistory, { sensitiveValues, terminalReason })
		if (!items.length && !terminalReason) return null
		const total = items.length
		const tested = items.filter((item) => item.recorded).length
		const passed = items.filter((item) => item.status === 'passed').length
		const failed = items.filter((item) => item.status === 'failed').length
		const unknown = items.filter((item) => item.status === 'unknown').length
		const submitted = items.some((item) => item.key === 'submit' && item.status === 'passed') ? 1 : 0
		const userInputRequired = countGenericUserInputRequired(history, terminalReason)
		const terminalFailed = terminalReason && String(session?.status || '') === 'error' && !userInputRequired ? 1 : 0
		const status = deriveLoginSummaryStatus(session, { failed, unknown, submitted, terminalFailed, userInputRequired })
		const diagnostics = buildLoginDiagnostics(items, {
			terminalReason,
			userInputRequired,
			terminalFailed,
			submitted,
		})
		const issues = [
			terminalReason ? {
				label: userInputRequired ? '需要用户补充' : '登录流程',
				status: userInputRequired ? 'unknown' : 'failed',
				statusLabel: userInputRequired ? '需要用户补充' : '失败',
				summary: terminalReason,
			} : null,
			...items
				.filter((item) => item.status !== 'passed')
				.map((item) => ({
					label: item.label,
					status: item.status,
					statusLabel: item.statusLabel,
					neededEvidence: item.neededEvidence || '',
					summary: item.summary,
				})),
		].filter(Boolean).slice(0, 12)
		const headline = buildLoginHeadline(status, {
			total,
			tested,
			passed,
			failed,
			unknown,
			submitted,
			userInputRequired,
			terminalFailed,
		})
		return {
			type: 'login',
			title: '登录结果总结',
			status,
			headline,
			stats: { total, tested, passed, failed, unknown, submitted, userInputRequired, terminalFailed },
			diagnostics,
			items,
			issues,
			remaining: items
				.filter((item) => !item.recorded || item.status === 'unknown')
				.map((item) => item.label),
			remainingDetails: buildSummaryRemainingDetails(items),
			reason: issues.map((item) => item.summary).filter(Boolean).join('\n'),
			text: [
				headline,
				...diagnostics.map((item) => `诊断：${item.text}`),
				...items.map(formatLoginSummaryItemLine),
				terminalReason ? `最后问题：${terminalReason}` : '',
			].filter(Boolean).join('\n'),
			generatedAt: Date.now(),
		}
	}

	function isLoginHistoryItem(item) {
		const input = item?.input && typeof item.input === 'object' ? item.input : {}
		const step = String(input.workflow_step || '').trim()
		if (String(input.workflow || '').trim() === 'login') return true
		return /^(fill_username|fill_password|submit_login)$/i.test(step)
	}

	function collectSensitiveLoginValues(history) {
		const values = []
		for (const item of (Array.isArray(history) ? history : [])) {
			const input = item?.input && typeof item.input === 'object' ? item.input : {}
			if (String(input.workflow_step || '').trim() !== 'fill_password' && !isSensitiveFieldAction(item)) continue
			for (const value of [input.text, input.value, item?.output, getActionOutcome(item).reason]) {
				const text = String(value || '').trim()
				if (text.length >= 4) values.push(text)
			}
		}
		return uniqueSensitiveValues(values)
	}

	function buildLoginSummaryItems(state, history, options = {}) {
		const username = buildLoginStepSummaryItem('username', '账号填写', state, history, options)
		const password = buildLoginStepSummaryItem('password', '密码填写', state, history, options)
		const submit = buildLoginStepSummaryItem('submit', '登录提交', state, history, options)
		return [username, password, submit]
			.filter(Boolean)
			.map((item, index) => ({ ...item, order: index + 1 }))
	}

	function buildLoginStepSummaryItem(key, label, state, history, options = {}) {
		const steps = key === 'username'
			? ['fill_username']
			: key === 'password'
				? ['fill_password']
				: ['submit_login']
		const records = (Array.isArray(history) ? history : []).filter((item) => steps.includes(String(item?.input?.workflow_step || '').trim()))
		const last = records[records.length - 1] || null
		const failed = [...records].reverse().find((item) => item?.success === false) || null
		const statePassed = key === 'username'
			? state?.usernameDone === true
			: key === 'password'
				? state?.passwordDone === true
				: state?.submitted === true || String(state?.phase || '') === 'submitted'
		const stateFailed = String(state?.phase || '') === 'failed' && loginFailureBelongsToStep(key, state?.failedReason, records)
		const recorded = !!last || statePassed || stateFailed
		if (!recorded && key === 'submit' && !state?.usernameDone && !state?.passwordDone && !records.length) return null
		if (!recorded && key !== 'submit' && !Number.isFinite(Number(key === 'username' ? state?.usernameIndex : state?.passwordIndex))) return null
		const status = failed || stateFailed
			? 'failed'
			: statePassed || (last && last.success === true)
				? 'passed'
				: 'unknown'
		const rawValue = getLoginStepValue(last)
		const value = key === 'password' && rawValue ? '已隐藏' : maskSensitiveValuesInText(rawValue, options.sensitiveValues)
		const summary = buildLoginStepSummaryText(key, status, last, state, options)
		return {
			key,
			label,
			status,
			statusLabel: status === 'passed' ? '通过' : status === 'failed' ? '失败' : '未确认',
			recorded,
			value,
			sensitive: key === 'password',
			source: String(last?.action || '').trim(),
			sourceLabel: key === 'submit' ? '点击提交' : '输入文本',
			sourceTitle: '动作',
			attempts: records.length || (recorded ? 1 : 0),
			failedAttempts: records.filter((item) => item?.success === false).length + (stateFailed && !failed ? 1 : 0),
			neededEvidence: status === 'passed' ? '' : buildLoginStepNeededEvidence(key),
			summary,
		}
	}

	function loginFailureBelongsToStep(key, reason, records) {
		if ((Array.isArray(records) ? records : []).some((item) => item?.success === false)) return true
		const text = normalizeCompactText(reason)
		if (!text) return key === 'submit'
		if (key === 'username') return /(账号|账户|用户名|username|account|user)/i.test(text)
		if (key === 'password') return /(密码|口令|password|pwd|passcode)/i.test(text)
		return !/(账号|账户|用户名|username|account|user|密码|口令|password|pwd|passcode)/i.test(text) ||
			/(登录|登陆|提交|submit|signin|login)/i.test(text)
	}

	function getLoginStepValue(item) {
		const input = item?.input && typeof item.input === 'object' ? item.input : {}
		return String(input.text || input.value || '').trim()
	}

	function buildLoginStepSummaryText(key, status, item, state, options = {}) {
		const detail = maskSensitiveValuesInText([
			getActionOutcome(item).reason,
			item?.output,
			status === 'failed' ? state?.failedReason : '',
		].filter(Boolean).join(' '), options.sensitiveValues)
		const label = key === 'username' ? '账号填写' : key === 'password' ? '密码填写' : '登录提交'
		if (status === 'passed') return `${label}已完成${detail ? `：${detail}` : '。'}`
		if (status === 'failed') return `${label}失败${detail ? `：${detail}` : '。'}`
		return `${label}尚未形成可验证动作记录。`
	}

	function buildLoginStepNeededEvidence(key) {
		if (key === 'username') return '需要记录账号输入动作，并复核账号字段值已写入。'
		if (key === 'password') return '需要记录密码输入动作，并复核密码字段已写入；密码明文应始终脱敏。'
		return '需要记录登录提交动作，并观察页面跳转、登录态变化或明确错误提示。'
	}

	function deriveLoginSummaryStatus(session, counts) {
		const sessionStatus = String(session?.status || '').trim()
		if (sessionStatus === 'running') return 'running'
		if (sessionStatus === 'stopped') return 'stopped'
		if (Number(counts.userInputRequired || 0)) return 'inconclusive'
		if (Number(counts.failed || 0) || Number(counts.terminalFailed || 0)) return 'failed'
		if (Number(counts.unknown || 0)) return 'inconclusive'
		if (Number(counts.submitted || 0)) return 'passed'
		return 'inconclusive'
	}

	function buildLoginHeadline(status, counts) {
		const prefix = status === 'running'
			? '登录进行中'
			: status === 'stopped'
				? '登录已中止'
				: status === 'passed'
					? '登录流程已提交'
					: status === 'failed'
						? '登录发现异常'
						: '登录未完全确认'
		const parts = [
			`共 ${counts.total} 项`,
			`已记录 ${counts.tested} 项`,
			`通过 ${counts.passed} 项`,
			counts.failed ? `失败 ${counts.failed} 项` : '',
			counts.unknown ? `未确认 ${counts.unknown} 项` : '',
			counts.submitted ? `已提交 ${counts.submitted} 项` : '',
			counts.userInputRequired ? `需要用户补充 ${counts.userInputRequired} 项` : '',
			counts.terminalFailed ? `终态异常 ${counts.terminalFailed} 项` : '',
		].filter(Boolean)
		return `${prefix}：${parts.join('，')}。`
	}

	function buildLoginDiagnostics(items, counts = {}) {
		const diagnostics = []
		const failed = countItems(items, (item) => item.status === 'failed')
		const unknown = countItems(items, (item) => item.status === 'unknown')
		const submitted = Number(counts.submitted || 0)
		const userInputRequired = Number(counts.userInputRequired || 0)
		if (failed) {
			diagnostics.push({
				kind: 'login_step_failed',
				severity: 'error',
				count: failed,
				text: `登录步骤失败：${failed} 项账号、密码或提交动作未成功${formatDiagnosticFieldList((items || []).filter((item) => item.status === 'failed'))}。`,
			})
		}
		if (unknown) {
			diagnostics.push({
				kind: 'login_incomplete',
				severity: 'warning',
				count: unknown,
				text: `登录步骤未确认：${unknown} 项缺少可验证动作记录，需要确认字段写入、提交点击或登录态变化。`,
			})
		}
		if (submitted && !failed && !unknown) {
			diagnostics.push({
				kind: 'login_submitted',
				severity: 'success',
				count: submitted,
				text: '登录表单已提交；若后续页面仍未进入目标区域，需要继续观察登录态、跳转或页面错误提示。',
			})
		}
		if (userInputRequired) {
			diagnostics.push({
				kind: 'user_input_required',
				severity: 'warning',
				count: userInputRequired,
				text: `需要用户补充信息：${userInputRequired} 条记录显示登录过程中需要验证码、动态码、账号信息或用户确认。`,
			})
		}
		const terminalReason = String(counts.terminalReason || '').trim()
		if (terminalReason && !userInputRequired) {
			diagnostics.push({
				kind: 'task_terminal_failure',
				severity: 'error',
				count: 1,
				text: `登录终态异常：${terminalReason}`,
			})
		}
		appendNextStepRecommendations(diagnostics, buildLoginNextStepRecommendations(diagnostics))
		return diagnostics
	}

	function buildLoginNextStepRecommendations(diagnostics) {
		const kinds = new Set((Array.isArray(diagnostics) ? diagnostics : []).map((item) => String(item?.kind || '')))
		const recommendations = []
		if (kinds.has('login_step_failed')) {
			recommendations.push('建议：先查看失败步骤的字段定位、可编辑状态、登录按钮命中结果和页面错误提示；不要重复提交未确认写入的凭据。')
		}
		if (kinds.has('login_incomplete')) {
			recommendations.push('建议：从未确认的登录步骤继续，先补齐账号/密码输入复核，再提交并观察登录态变化。')
		}
		if (kinds.has('user_input_required')) {
			recommendations.push('建议：先补充验证码、动态码或缺失凭据，再从等待用户回答前的登录步骤继续。')
		}
		if (kinds.has('task_terminal_failure')) {
			recommendations.push('建议：根据页面错误提示区分凭据错误、验证码缺失、网络失败或跳转未完成，再决定是否重试。')
		}
		if (kinds.has('login_submitted')) {
			recommendations.push('建议：继续观察提交后的页面跳转、登录态标识或目标页面是否出现，避免把“已点击登录”误判为完整任务成功。')
		}
		return recommendations
	}

	function formatLoginSummaryItemLine(item) {
		const parts = [
			`${item.order}. ${item.label || item.key}：${item.statusLabel}`,
			item.value ? `值=${item.value}` : '',
			item.sourceLabel ? `动作=${item.sourceLabel}` : '',
			item.attempts > 1 ? `尝试=${item.attempts}` : '',
			item.summary,
		].filter(Boolean)
		return parts.join('；')
	}

	function buildSearchResultSummary(session) {
		const state = session?.workflowState?.search
		if (!state || typeof state !== 'object') return null
		const fieldOrder = Array.isArray(state.fieldOrder) ? state.fieldOrder : []
		const fields = state.fields && typeof state.fields === 'object' ? state.fields : {}
		const resultsByKey = state.resultsByKey && typeof state.resultsByKey === 'object' ? state.resultsByKey : {}
		const completedKeys = new Set(Array.isArray(state.completedKeys) ? state.completedKeys : [])
		const clearedKeys = new Set(Array.isArray(state.resetCompletedKeys) ? state.resetCompletedKeys : [...completedKeys])
		const skippedKeys = new Set(Array.isArray(state.skippedKeys) ? state.skippedKeys : [])
		const rawTerminalReason = String(state.terminalReason || state.failedReason || extractSessionTerminalReason(session) || '').trim()
		const sensitiveValues = collectSensitiveSearchSummaryValues(fields, resultsByKey)
		const terminalReason = maskSensitiveValuesInText(rawTerminalReason, sensitiveValues)
		const cleanupFailureKey = findSearchCleanupFailureKey(state, rawTerminalReason)
		const missingEvidenceKey = findSearchMissingEvidenceKey(state, rawTerminalReason)
		const userInputRequired = countGenericUserInputRequired(session?.history || [], terminalReason || rawTerminalReason)
		const terminalFailureKey = userInputRequired ? '' : findSearchTerminalFailureKey(session, state, rawTerminalReason, {
			cleanupFailureKey,
			missingEvidenceKey,
		})
		const items = buildSearchSummaryItems(fieldOrder, fields, resultsByKey, clearedKeys, skippedKeys, {
			sensitiveValues,
			cleanupFailureKey,
			cleanupFailureReason: terminalReason,
			missingEvidenceKey,
			missingEvidenceReason: terminalReason,
			terminalFailureKey,
			terminalFailureReason: terminalReason,
		})
		const total = fieldOrder.length || items.length
		const tested = items.filter((item) => item.recorded).length
		const passed = items.filter((item) => item.status === 'passed').length
		const failed = items.filter((item) => item.status === 'failed').length
		const unknown = items.filter((item) => item.recorded && item.status === 'unknown').length
		const skipped = items.filter((item) => item.statusCode === 'unknown_missing_sample').length
		const remaining = Math.max(0, total - tested - skipped)
		const cleanupPassed = items.filter((item) => item.clearStatus === 'cleared').length
		const cleanupFailed = items.filter((item) => item.clearStatus === 'cleanup_failed').length
		const cleanupUnverified = items.filter((item) => item.clearStatus === 'pending_or_unverified').length
		const skippedDetails = buildSearchSkippedDetails(items)
		const remainingDetails = buildSummaryRemainingDetails(items)
		const issueItems = items.filter((item) =>
			item.statusCode !== 'unknown_missing_sample' &&
			(item.status !== 'passed' || item.clearStatus === 'cleanup_failed' || item.clearStatus === 'pending_or_unverified')
		)
		const contextRequestLimit = isContextRequestLimitReason(terminalReason) ? 1 : 0
		const verificationRecoveryIncomplete = countSearchVerificationRecoveryIncomplete(items, terminalReason)
		const dateCandidateOwnership = countItems(items, (item) => isDateCandidateOwnershipSummaryItem(item, terminalReason))
		const summaryStatus = deriveSearchSummaryStatus(session, state, { failed, unknown, skipped, remaining, tested, cleanupFailed, cleanupUnverified, dateCandidateOwnership, contextRequestLimit, verificationRecoveryIncomplete, userInputRequired })
		const headline = buildSearchHeadline(session, summaryStatus, { total, tested, passed, failed, unknown, skipped, remaining, cleanupPassed, cleanupFailed, cleanupUnverified, dateCandidateOwnership, contextRequestLimit, verificationRecoveryIncomplete, userInputRequired })
		const diagnostics = buildSearchDiagnostics(items, {
			total,
			tested,
			failed,
			unknown,
			skipped,
			remaining,
			cleanupFailed,
			cleanupUnverified,
			dateCandidateOwnership,
			contextRequestLimit,
			verificationRecoveryIncomplete,
			userInputRequired,
			terminalReason,
		})
		const textLines = [
			headline,
			terminalReason ? `停止原因：${terminalReason}` : '',
			...diagnostics.map((item) => `诊断：${item.text}`),
			...items.map(formatSearchSummaryItemLine),
		].filter(Boolean)
		return {
			type: 'search_test',
			title: '搜索测试结果总结',
			status: summaryStatus,
			headline,
			stats: { total, tested, passed, failed, unknown, skipped, remaining, cleanupPassed, cleanupFailed, cleanupUnverified, dateCandidateOwnership, contextRequestLimit, verificationRecoveryIncomplete, userInputRequired },
			diagnostics,
			items,
			issues: issueItems.slice(0, 12).map((item) => ({
				label: item.label,
				status: item.status,
				statusLabel: item.statusLabel,
				clearStatus: item.clearStatus,
				clearStatusLabel: item.clearStatusLabel,
				neededEvidence: item.neededEvidence || '',
				summary: item.clearStatus === 'cleanup_failed'
					? [item.summary, item.clearFailureReason ? `清空异常：${item.clearFailureReason}` : '清空异常。'].filter(Boolean).join(' ')
					: item.clearStatus === 'pending_or_unverified'
						? [item.summary, '清空未确认：尚未记录清空/重置复核。'].filter(Boolean).join(' ')
					: item.summary,
			})),
			remaining: items
				.filter((item) => !item.recorded && item.statusCode !== 'unknown_missing_sample')
				.slice(0, 12)
				.map((item) => item.label || item.key),
			remainingDetails,
			skipped: items
				.filter((item) => item.statusCode === 'unknown_missing_sample')
				.slice(0, 12)
				.map((item) => item.label || item.key),
			skippedDetails,
			reason: terminalReason,
			text: textLines.join('\n'),
			generatedAt: Date.now(),
		}
	}

	function buildSearchSkippedDetails(items) {
		return (Array.isArray(items) ? items : [])
			.filter((item) => item?.statusCode === 'unknown_missing_sample')
			.slice(0, 50)
			.map((item) => ({
				label: item.label || item.key || '未命名字段',
				status: item.status,
				statusLabel: item.statusLabel,
				summary: item.summary,
				sourceLabel: item.sourceLabel || '',
				basis: item.basis || '',
				neededEvidence: buildSearchSkippedNeededEvidence(item),
			}))
	}

	function buildSearchSkippedNeededEvidence(item) {
		const label = String(item?.label || item?.key || '该字段').trim()
		return `${label} 需要真实列表样本、任务显式值，或目标字段范围内可归属的真实候选；补足其中一种证据后再继续测试。`
	}

	function buildSearchDiagnostics(items, counts = {}) {
		const diagnostics = []
		const list = Array.isArray(items) ? items : []
		const cleanupFailed = countItems(list, (item) => item.clearStatus === 'cleanup_failed')
		const cleanupUnverified = countItems(list, (item) => item.clearStatus === 'pending_or_unverified')
		const noTable = countItems(list, (item) => item.recorded && item.statusCode === 'unknown_no_table')
		const resultPending = countItems(list, (item) => item.recorded && item.statusCode === 'unknown_result_pending')
		const missingEvidence = countItems(list, (item) => item.statusCode === 'unknown_missing_sample')
		const dateCandidateOwnership = Math.max(
			Number(counts.dateCandidateOwnership || 0),
			countItems(list, (item) => isDateCandidateOwnershipSummaryItem(item, counts.terminalReason))
		)
		const contextRequestLimit = Math.max(
			Number(counts.contextRequestLimit || 0),
			isContextRequestLimitReason(counts.terminalReason) ? 1 : 0
		)
		const verificationRecoveryIncomplete = Math.max(
			Number(counts.verificationRecoveryIncomplete || 0),
			countSearchVerificationRecoveryIncomplete(list, counts.terminalReason)
		)
		const userInputRequired = Math.max(
			Number(counts.userInputRequired || 0),
			isUserInputRequiredReason(counts.terminalReason) ? 1 : 0
		)
		const missingResult = countItems(list, (item) => (!item.recorded && item.statusCode !== 'unknown_missing_sample') || item.statusCode === 'unknown_not_recorded')
		const terminalFailure = countItems(list, (item) => item.statusCode === 'failed_terminal')
		const valueMissing = countItems(list, (item) => /^(failed|unknown)_value_missing$/.test(String(item.statusCode || '')))
		const emptyResult = countItems(list, (item) => /^(failed|unknown)_empty_result$/.test(String(item.statusCode || '')))
		if (cleanupFailed) {
			diagnostics.push({
				kind: 'cleanup_failed',
				severity: 'error',
				count: cleanupFailed,
				text: `清空/重置异常：${cleanupFailed} 项筛选条件未确认清空，后续字段测试可能受到残留条件影响。`,
			})
		}
		if (cleanupUnverified) {
			diagnostics.push({
				kind: 'cleanup_unverified',
				severity: 'warning',
				count: cleanupUnverified,
				text: `清空待确认：${cleanupUnverified} 项已形成搜索结果，但尚未记录清空/重置复核，继续下一项前需要确认条件已清空。`,
			})
		}
		if (noTable) {
			diagnostics.push({
				kind: 'missing_table_evidence',
				severity: 'warning',
				count: noTable,
				text: `结果证据不足：${noTable} 项已提交搜索，但没有拿到表格/列表摘要，无法确认结果是否正确。`,
			})
		}
		if (missingEvidence) {
			diagnostics.push({
				kind: 'missing_sample_evidence',
				severity: 'warning',
				count: missingEvidence,
				text: `样本证据不足：${missingEvidence} 项字段缺少真实列表样本、任务显式值或可归属候选，已安全跳过，未填写随机值。`,
			})
		}
		if (dateCandidateOwnership) {
			diagnostics.push({
				kind: 'date_candidate_ownership',
				severity: 'warning',
				count: dateCandidateOwnership,
				text: `日期/时间候选归属不足：${dateCandidateOwnership} 项日期类字段只看到未稳定归属的弹层候选，已安全跳过，避免误选其他日期弹层。`,
			})
		}
		if (contextRequestLimit) {
			diagnostics.push({
				kind: 'context_request_limit',
				severity: 'warning',
				count: contextRequestLimit,
				text: '上下文补证达到上限：模型连续请求内部上下文仍未形成可执行证据，通常需要复查最后一次 request_context/request_options_for 的候选归属、列表样本或目标字段定位。',
			})
		}
		if (verificationRecoveryIncomplete) {
			diagnostics.push({
				kind: 'verification_recovery_incomplete',
				severity: 'warning',
				count: verificationRecoveryIncomplete,
				text: `校验恢复未完成：${verificationRecoveryIncomplete} 项失败记录包含恢复处理原因，说明 Agent 已判断不能安全视觉恢复、恢复失败，或需要重新观察后再规划。`,
			})
		}
		if (userInputRequired) {
			diagnostics.push({
				kind: 'user_input_required',
				severity: 'warning',
				count: userInputRequired,
				text: `需要用户补充信息：${userInputRequired} 条记录显示搜索测试过程中需要用户确认、验证码、缺失账号信息或冲突字段新值；补足信息前不应继续猜测页面动作。`,
			})
		}
		if (terminalFailure) {
			const reason = String(counts.terminalReason || '').trim()
			diagnostics.push({
				kind: 'task_terminal_failure',
				severity: 'error',
				count: terminalFailure,
				text: `任务终止：${terminalFailure} 项字段在测试过程中触发终止${reason ? `，原因：${reason}` : '。'}`,
			})
		}
		if (valueMissing) {
			diagnostics.push({
				kind: 'value_missing',
				severity: 'warning',
				count: valueMissing,
				text: `结果不匹配：${valueMissing} 项结果中没有确认测试值，需要复查结果抽取或搜索实现。`,
			})
		}
		if (emptyResult) {
			diagnostics.push({
				kind: 'empty_result',
				severity: 'warning',
				count: emptyResult,
				text: `结果为空：${emptyResult} 项搜索后列表为空，需要确认测试值是否来自真实样本。`,
			})
		}
		if (resultPending) {
			diagnostics.push({
				kind: 'result_pending',
				severity: 'info',
				count: resultPending,
				text: `结果待确认：${resultPending} 项已提交搜索，但还没有完成提交后的列表观察。`,
			})
		}
		if (missingResult) {
			diagnostics.push({
				kind: 'coverage_incomplete',
				severity: 'info',
				count: missingResult,
				text: `覆盖未完成：${missingResult} 项搜索字段尚未形成可验证结果记录。`,
			})
		}
		if (!diagnostics.length && Number(counts.tested || 0) > 0) {
			diagnostics.push({
				kind: 'evidence_complete',
				severity: 'success',
				count: Number(counts.tested || 0),
				text: '已形成字段级测试结果记录，没有聚合级证据缺口。',
			})
		}
		appendNextStepRecommendations(diagnostics, buildSearchNextStepRecommendations(diagnostics, counts))
		return diagnostics
	}

	function buildSearchNextStepRecommendations(diagnostics, counts = {}) {
		const kinds = new Set((Array.isArray(diagnostics) ? diagnostics : []).map((item) => String(item?.kind || '')))
		const recommendations = []
		if (kinds.has('cleanup_failed')) {
			recommendations.push('建议：优先复查清空/重置按钮识别和清空复核，避免残留条件影响后续字段。')
		}
		if (kinds.has('cleanup_unverified')) {
			recommendations.push('建议：继续前先完成清空/重置复核，确认不会带着残留条件测试后续字段。')
		}
		if (kinds.has('missing_sample_evidence')) {
			recommendations.push('建议：先观察列表/表格真实样本或让用户提供明确测试值，继续保持不随机填写搜索项。')
		}
		if (kinds.has('date_candidate_ownership')) {
			recommendations.push('建议：复查日期/时间选择器的弹层归属、当前活动字段和候选坐标，优先让候选稳定归属到对应字段后再选择。')
		}
		if (kinds.has('context_request_limit')) {
			recommendations.push('建议：不要继续等待同一轮模型；先查看最后的补充上下文，确认是缺少列表样本、候选未归属，还是目标字段定位不稳定。')
		}
		if (kinds.has('verification_recovery_incomplete')) {
			recommendations.push('建议：不要重复同一失败动作；先重新观察页面状态，确认目标是否被遮挡、候选是否归属当前字段，再换定位或补上下文。')
		}
		if (kinds.has('user_input_required')) {
			recommendations.push('建议：先补充 Agent 请求的验证码、账号、确认信息或替代字段值，再从等待用户回答前的搜索步骤继续。')
		}
		if (kinds.has('missing_table_evidence') || kinds.has('result_pending')) {
			recommendations.push('建议：提交搜索后补充一次列表/表格观察，再判断搜索结果是否命中测试值。')
		}
		if (kinds.has('value_missing') || kinds.has('empty_result')) {
			recommendations.push('建议：核对测试值来源、结果抽取和搜索实现，确认是否存在搜索接口未生效或结果列未被识别。')
		}
		if (kinds.has('task_terminal_failure')) {
			recommendations.push('建议：先处理终止原因中的最后失败动作，再从对应字段继续搜索测试。')
		}
		if (!recommendations.length && Number(counts.remaining || 0) > 0) {
			recommendations.push('建议：继续从未完成字段开始测试，完成提交验证和清空复核后再汇总结果。')
		}
		return recommendations
	}

	function countItems(items, predicate) {
		let count = 0
		for (const item of (Array.isArray(items) ? items : [])) {
			if (predicate(item)) count += 1
		}
		return count
	}

	function countSearchVerificationRecoveryIncomplete(items, terminalReason) {
		return Math.max(
			countItems(items, (item) => hasVerificationRecoveryIncompleteDetail([item?.summary, item?.clearFailureReason].filter(Boolean).join(' '))),
			hasVerificationRecoveryIncompleteDetail(terminalReason) ? 1 : 0
		)
	}

	function countFieldActionVerificationRecoveryIncomplete(items, terminalIssue) {
		return Math.max(
			countItems(items, (item) => hasVerificationRecoveryIncompleteDetail(item?.summary)),
			hasVerificationRecoveryIncompleteDetail(terminalIssue?.summary) ? 1 : 0
		)
	}

	function extractSessionTerminalReason(session) {
		const status = String(session?.status || '').trim()
		const history = Array.isArray(session?.history) ? session.history : []
		const last = history[history.length - 1] || null
		const lastFailed = last?.success === false
		if (!lastFailed && !/^(error|stopped)$/i.test(status)) return ''
		const input = last?.input && typeof last.input === 'object' ? last.input : {}
		const candidates = [
			input.workflow_result_summary,
			input.workflow_skip_reason,
			input.text,
			input.reason,
			last?.outcome?.reason,
			last?.output,
			session?.activityText,
		]
		for (const value of candidates) {
			const text = String(value || '').trim()
			if (text) return text.slice(0, 600)
		}
		return ''
	}

	function buildSearchSummaryItems(fieldOrder, fields, resultsByKey, completedKeys, skippedKeys, options = {}) {
		const keys = []
		const seen = new Set()
		for (const key of fieldOrder) {
			const normalized = String(key || '').trim()
			if (!normalized || seen.has(normalized)) continue
			seen.add(normalized)
			keys.push(normalized)
		}
		for (const key of Object.keys(resultsByKey || {})) {
			const normalized = String(key || '').trim()
			if (!normalized || seen.has(normalized)) continue
			seen.add(normalized)
			keys.push(normalized)
		}
		return keys.map((key, index) => {
			const field = fields?.[key] || {}
			const result = resultsByKey?.[key] || null
			const missingEvidence = skippedKeys.has(key) || (!result &&
				String(options.missingEvidenceKey || '').trim() === key &&
				isMissingEvidenceReason(options.missingEvidenceReason))
			const terminalFailed = !missingEvidence &&
				String(options.terminalFailureKey || '').trim() === key &&
				isSearchTerminalFailureReason(options.terminalFailureReason)
			const rawStatusCode = String(result?.status || '').trim()
			const statusCode = String(terminalFailed && normalizeSearchSummaryStatus(rawStatusCode) !== 'passed'
				? 'failed_terminal'
				: (rawStatusCode || (missingEvidence ? 'unknown_missing_sample' : 'unknown_not_recorded'))).trim()
			const status = normalizeSearchSummaryStatus(statusCode)
			const skipped = statusCode === 'unknown_missing_sample'
			const rawValue = String(result?.value || field.lastTestValue || '').trim()
			const sensitive = isSensitiveSearchSummaryField(field, result, key)
			const value = formatSearchSummaryDisplayValue(rawValue, sensitive)
			const source = String(result?.source || field.lastValueSource || '').trim()
			const cleanupFailed = !!result &&
				String(options.cleanupFailureKey || '').trim() === key &&
				isCleanupFailureReason(options.cleanupFailureReason)
			const rawBasis = String(field.lastValueBasis || '').trim()
			const rawSummary = String(terminalFailed
				? `该字段测试终止：${String(options.terminalFailureReason || '').trim()}`
				: (result?.summary || (missingEvidence
					? `该字段未安全测试：${String(options.missingEvidenceReason || '').trim()}`
					: '该字段尚未形成提交后的可验证结果记录。'))).trim()
			const summary = maskSensitiveValuesInText(
				maskSensitiveSearchSummaryText(rawSummary, rawValue, sensitive),
				options.sensitiveValues
			)
			return {
				key,
				order: index + 1,
				label: String(result?.label || field.label || key).trim(),
				status,
				statusCode,
				statusLabel: SEARCH_STATUS_LABELS[statusCode] || statusCode || '未确认',
				recorded: (!!result || terminalFailed) && !skipped,
				value,
				sensitive,
				source,
				sourceLabel: SOURCE_LABELS[source] || source,
				sourceTitle: '取值来源',
				basis: maskSensitiveValuesInText(rawBasis, options.sensitiveValues),
				neededEvidence: statusCode === 'unknown_not_recorded' ? buildSearchUntestedNeededEvidence(result?.label || field.label || key) : '',
				clearStatus: skipped ? 'not_applicable' : (completedKeys.has(key) ? 'cleared' : (cleanupFailed ? 'cleanup_failed' : (result ? 'pending_or_unverified' : 'not_reached'))),
				clearStatusLabel: skipped ? '无需清空' : (completedKeys.has(key) ? '已清空' : (cleanupFailed ? '清空失败' : (result ? '未确认清空' : '未测试'))),
				clearFailureReason: cleanupFailed ? String(options.cleanupFailureReason || '').trim() : '',
				summary,
			}
		}).map((item) => {
			const testSteps = buildSearchSummaryTestSteps(item)
			return {
				...item,
				testSteps,
				testStepSummary: formatSearchSummaryTestSteps(testSteps),
			}
		})
	}

	function buildSearchSummaryTestSteps(item) {
		const status = String(item?.status || '').trim()
		const statusCode = String(item?.statusCode || '').trim()
		const clearStatus = String(item?.clearStatus || '').trim()
		const skipped = statusCode === 'unknown_missing_sample'
		const hasValue = !!String(item?.value || '').trim()
		const recorded = item?.recorded === true
		return [
			{
				key: 'value',
				label: '取值',
				status: skipped ? 'skipped' : (hasValue ? 'passed' : 'missing'),
				text: skipped
					? '安全跳过'
					: (hasValue ? '已确定测试值' : '缺少测试值'),
			},
			{
				key: 'submit',
				label: '提交',
				status: skipped ? 'skipped' : (recorded ? (statusCode === 'failed_terminal' ? 'failed' : 'passed') : 'missing'),
				text: skipped
					? '无需提交'
					: (recorded ? (statusCode === 'failed_terminal' ? '提交/执行异常' : '已提交或已形成结果记录') : '未形成提交记录'),
			},
			{
				key: 'result',
				label: '结果',
				status: skipped ? 'skipped' : (status === 'passed' ? 'passed' : status === 'failed' ? 'failed' : (recorded ? 'unknown' : 'missing')),
				text: skipped
					? '未验证结果'
					: (item?.statusLabel || '未确认结果'),
			},
			{
				key: 'cleanup',
				label: '清空',
				status: formatSearchClearStepStatus(clearStatus),
				text: item?.clearStatusLabel || '未测试',
			},
		]
	}

	function formatSearchClearStepStatus(clearStatus) {
		if (clearStatus === 'cleared') return 'passed'
		if (clearStatus === 'cleanup_failed') return 'failed'
		if (clearStatus === 'pending_or_unverified') return 'unknown'
		if (clearStatus === 'not_applicable') return 'skipped'
		return 'missing'
	}

	function formatSearchSummaryTestSteps(steps) {
		return (Array.isArray(steps) ? steps : [])
			.map((step) => `${step.label}:${formatSearchSummaryStepStatus(step.status)}`)
			.filter(Boolean)
			.join(' > ')
	}

	function formatSearchSummaryStepStatus(status) {
		const labels = {
			passed: '完成',
			failed: '异常',
			unknown: '未确认',
			missing: '缺失',
			skipped: '跳过',
		}
		return labels[String(status || '').trim()] || String(status || '未确认')
	}

	function buildSearchUntestedNeededEvidence(label) {
		const name = String(label || '该搜索字段').trim()
		return `${name} 需要完成一次填值、提交搜索、观察结果和清空复核，或明确说明它不属于本次搜索测试范围。`
	}

	function formatSearchSummaryDisplayValue(value, sensitive) {
		const text = String(value || '').trim()
		if (!text) return ''
		return sensitive ? '已隐藏' : text
	}

	function isSensitiveSearchSummaryField(field, result, key) {
		const text = [
			field?.label,
			field?.placeholder,
			field?.name,
			field?.fieldType,
			field?.type,
			field?.semanticContainer,
			result?.label,
			key,
		].map((value) => String(value || '')).join(' ')
		return isSensitiveFieldDescriptor(text)
	}

	function collectSensitiveSearchSummaryValues(fields, resultsByKey) {
		const values = []
		const keys = new Set([
			...Object.keys(fields || {}),
			...Object.keys(resultsByKey || {}),
		])
		for (const key of keys) {
			const field = fields?.[key] || {}
			const result = resultsByKey?.[key] || {}
			if (!isSensitiveSearchSummaryField(field, result, key)) continue
			for (const value of [result.value, field.lastTestValue]) {
				const text = String(value || '').trim()
				if (text.length >= 4) values.push(text)
			}
		}
		return uniqueSensitiveValues(values)
	}

	function uniqueSensitiveValues(values) {
		const out = []
		const seen = new Set()
		for (const value of (Array.isArray(values) ? values : [])) {
			const text = String(value || '').trim()
			if (!text || seen.has(text)) continue
			seen.add(text)
			out.push(text)
		}
		return out.sort((a, b) => b.length - a.length)
	}

	function maskSensitiveValuesInText(text, values) {
		let out = String(text || '').trim()
		if (!out) return ''
		for (const value of (Array.isArray(values) ? values : [])) {
			const secret = String(value || '').trim()
			if (secret.length < 4) continue
			out = out.replace(new RegExp(escapeRegExp(secret), 'g'), '已隐藏')
		}
		return out
	}

	function maskSensitiveSearchSummaryText(text, value, sensitive) {
		const source = String(text || '').trim()
		if (!source || !sensitive) return source
		const secret = String(value || '').trim()
		if (secret.length < 4) return source
		return source.replace(new RegExp(escapeRegExp(secret), 'g'), '已隐藏')
	}

	function normalizeSearchSummaryStatus(statusCode) {
		const text = String(statusCode || '')
		if (text === 'passed_match') return 'passed'
		if (/^failed_/i.test(text)) return 'failed'
		return 'unknown'
	}

	function findSearchCleanupFailureKey(state, reason) {
		if (!isCleanupFailureReason(reason)) return ''
		return String(state?.activeFieldKey || state?.lastSearchedFieldKey || '').trim()
	}

	function isCleanupFailureReason(reason) {
		return /(清空|重置|reset|clear|search_reset|字段仍未清空|残留条件)/i.test(String(reason || ''))
	}

	function findSearchMissingEvidenceKey(state, reason) {
		if (!isMissingEvidenceReason(reason)) return ''
		const explicit = String(state?.terminalFieldKey || state?.activeFieldKey || state?.lastSearchedFieldKey || '').trim()
		if (explicit) return explicit
		const fields = state?.fields && typeof state.fields === 'object' ? state.fields : {}
		for (const [key, field] of Object.entries(fields)) {
			const label = String(field?.label || '').trim()
			if (label && String(reason || '').includes(label)) return key
		}
		return ''
	}

	function findSearchTerminalFailureKey(session, state, reason, classified = {}) {
		if (!isSearchTerminalFailureReason(reason)) return ''
		if (String(session?.status || '').trim() === 'stopped') return ''
		if (String(classified.cleanupFailureKey || '').trim() || String(classified.missingEvidenceKey || '').trim()) return ''
		const explicit = String(state?.terminalFieldKey || state?.activeFieldKey || state?.lastSearchedFieldKey || '').trim()
		if (explicit) return explicit
		return ''
	}

	function isSearchTerminalFailureReason(reason) {
		return /(失败|错误|异常|终止|超时|timeout|上限|无法|不能|未归属|未命中|校验失败|连续失败)/i.test(String(reason || ''))
	}

	function isContextRequestLimitReason(reason) {
		return /(内部\s*(?:ReAct\s*)?上下文请求次数达到上限|上下文请求次数达到上限|planning_context_limit|context[-_\s]?request[-_\s]?limit|context[-_\s]?round[-_\s]?limit|补充上下文.*上限|上下文补证.*上限)/i.test(String(reason || ''))
	}

	function hasVerificationRecoveryIncompleteDetail(text) {
		return /(恢复处理[:：]|视觉恢复失败|视觉回退失败|不支持视觉恢复|不适合视觉恢复|不做视觉恢复|恢复未完成|recovery\s+failed|verification_recovery.*failed|vision_recovery.*failed)/i.test(String(text || ''))
	}

	function isMissingEvidenceReason(reason) {
		return /(没有可用列表样本|缺少.*样本|缺少.*候选|缺少.*证据|没有可用.*任务显式值|missing_table_samples|option_candidates_unobserved|global_popup_diagnostic|global_selectable_popup_diagnostic|option_sample_mismatch|本地上下文补充后仍缺证据|未观测到真实候选|没有观测到候选|诊断候选|字段外可见|字段外候选|不要直接选择字段外候选|候选.*未归属|未归属.*候选|候选未能与目标字段建立稳定归属|稳定归属到目标字段|避免无意义测试|避免无依据搜索|避免随机搜索|真实候选.*没有可用列表样本)/i.test(String(reason || ''))
	}

	function isDateCandidateOwnershipSummaryItem(item, terminalReason) {
		if (!item || item.statusCode !== 'unknown_missing_sample') return false
		const descriptor = [
			item.label,
			item.key,
			item.summary,
			item.basis,
			terminalReason,
		].map((value) => String(value || '')).join(' ')
		if (!/(日期|时间|date|time|daterange|datetime|timerange|起止|区间|范围|创建时间|更新时间|跟进时间)/i.test(descriptor)) return false
		return /(诊断候选|字段外可见|字段外候选|global_popup_diagnostic|global_selectable_popup_diagnostic|未归属|候选未能与目标字段建立稳定归属|没有稳定归属|未观测到真实候选)/i.test(descriptor)
	}

	function deriveSearchSummaryStatus(session, state, counts) {
		const sessionStatus = String(session?.status || '').trim()
		if (sessionStatus === 'running') return 'running'
		if (sessionStatus === 'stopped') return 'stopped'
		if (counts.failed > 0 || counts.cleanupFailed > 0) return 'failed'
		if (counts.unknown > 0 || counts.skipped > 0 || counts.remaining > 0 || counts.cleanupUnverified > 0 || counts.dateCandidateOwnership > 0 || counts.contextRequestLimit > 0 || counts.verificationRecoveryIncomplete > 0 || counts.userInputRequired > 0 || counts.tested === 0) return 'inconclusive'
		if (String(state?.phase || '') === 'completed' && state?.terminalSuccess === false) return 'inconclusive'
		return 'passed'
	}

	function buildFormTaskResultSummary(session) {
		const history = Array.isArray(session?.history) ? session.history : []
		const hasFormWorkflowEvidence = history.some(isFormTaskSummaryHistoryItem)
		const hasSubmitEvidence = history.some(isFormSubmitSummaryHistoryItem)
		if (!hasFormWorkflowEvidence && !hasSubmitEvidence) return null
		const sensitiveValues = collectSensitiveFieldActionValues(history)
		const fieldItems = collectFieldActionSummaryItems(history, { sensitiveValues })
		const submitItems = collectFormSubmitSummaryItems(history, { sensitiveValues })
		const terminalIssue = buildTerminalFieldActionIssue(session, history, { sensitiveValues })
		const completionItem = buildFormCompletionSummaryItem(session, history, submitItems, fieldItems, terminalIssue, { sensitiveValues })
		if (
			!fieldItems.length &&
			!submitItems.length &&
			!completionItem &&
			!(terminalIssue && isFormTaskSummaryTask(session))
		) {
			return null
		}
		const items = [
			...fieldItems,
			...submitItems,
			completionItem,
		].filter(Boolean).map((item, index) => ({ ...item, order: index + 1 }))
		const fieldTotal = fieldItems.length
		const fieldTested = fieldItems.filter((item) => item.recorded).length
		const fieldPassed = fieldItems.filter((item) => item.status === 'passed').length
		const fieldFailed = fieldItems.filter((item) => item.status === 'failed').length
		const fieldUnknown = fieldItems.filter((item) => item.status === 'unknown').length
		const fieldRemaining = fieldItems.filter((item) => !item.recorded).length
		const submitPassed = submitItems.filter((item) => item.status === 'passed').length
		const submitFailed = submitItems.filter((item) => item.status === 'failed').length
		const submitUnknown = submitItems.filter((item) => item.status === 'unknown').length
		const submitMissing = completionItem?.key === 'form_completion' && completionItem.recorded === false ? 1 : 0
		const formCompleted = completionItem?.status === 'passed' ? 1 : 0
		const completionUnknown = completionItem?.status === 'unknown' ? 1 : 0
		const recoveredFailures = fieldItems.filter((item) => item.status === 'passed' && Number(item.failedAttempts || 0) > 0).length
		const verificationRecoveryIncomplete = countFieldActionVerificationRecoveryIncomplete(fieldItems, terminalIssue)
		const userInputRequired = countGenericUserInputRequired(history, terminalIssue?.summary || session?.activityText || '')
		const terminalFailed = terminalIssue?.status === 'failed' ? 1 : 0
		const failed = fieldFailed + submitFailed + terminalFailed
		const unknown = fieldUnknown + submitUnknown + completionUnknown + userInputRequired
		const remaining = fieldRemaining + submitMissing
		const tested = items.filter((item) => item.recorded !== false).length
		const passed = fieldPassed + submitPassed + formCompleted
		const status = deriveFormTaskSummaryStatus(session, {
			failed,
			unknown,
			remaining,
			tested,
			formCompleted,
			recoveredFailures,
			verificationRecoveryIncomplete,
			userInputRequired,
			terminalFailed,
		})
		const counts = {
			total: items.length,
			tested,
			passed,
			failed,
			unknown,
			remaining,
			formFields: fieldTotal,
			fieldTested,
			fieldPassed,
			fieldFailed,
			fieldUnknown,
			fieldRemaining,
			submitted: submitPassed,
			submitFailed,
			submitUnknown,
			submitMissing,
			formCompleted,
			completionUnknown,
			recoveredFailures,
			verificationRecoveryIncomplete,
			userInputRequired,
			terminalFailed,
		}
		const diagnostics = buildFormTaskDiagnostics(fieldItems, submitItems, completionItem, {
			...counts,
			terminalIssue,
		})
		const headline = buildFormTaskHeadline(status, counts)
		const issues = [
			terminalIssue,
			...items
				.filter((item) => item.status !== 'passed' || Number(item.failedAttempts || 0) > 0)
				.map((item) => ({
					label: item.label,
					status: item.status,
					statusLabel: item.statusLabel,
					neededEvidence: item.neededEvidence || '',
					summary: item.summary,
				})),
		].filter(Boolean).slice(0, 14)
		return {
			type: 'form_task',
			title: '表单任务结果总结',
			status,
			headline,
			stats: counts,
			diagnostics,
			items,
			issues,
			remaining: items
				.filter((item) => item.status !== 'passed')
				.slice(0, 50)
				.map((item) => item.label || item.key),
			remainingDetails: buildSummaryRemainingDetails(items),
			reason: issues.map((item) => item.summary).filter(Boolean).join('\n'),
			text: [
				headline,
				...diagnostics.map((item) => `诊断：${item.text}`),
				...items.map(formatFormTaskSummaryItemLine),
			].filter(Boolean).join('\n'),
			generatedAt: Date.now(),
		}
	}

	function isFormTaskSummaryTask(session) {
		const operation = String(
			session?.workflowState?.taskIntent?.intent?.operation ||
			session?.taskIntent?.operation ||
			''
		).trim()
		if (/^(create|edit|fill_form)$/i.test(operation)) return true
		const text = String([session?.latestTask, session?.task].filter(Boolean).join(' ')).trim()
		return /(创建|新增|新建|添加|编辑|修改|更新|改为|改成|填写|填入|填表|录入|设置|保存|提交|create|add|new|edit|update|change|fill|save|submit)/i.test(text)
	}

	function isFormTaskSummaryHistoryItem(item) {
		const input = item?.input && typeof item.input === 'object' ? item.input : {}
		const workflow = String(input.workflow || '').trim()
		const step = String(input.workflow_step || '').trim()
		if (workflow === 'form-fill' || workflow === 'create-task') return true
		return isFormTaskWorkflowStep(step)
	}

	function isFormTaskWorkflowStep(step) {
		return /^(fill_form_field_timeout_recovery|open_form_dropdown_timeout_recovery|choose_form_dropdown_timeout_recovery|select_cascader_path_timeout_recovery|select_visible_cascader_option_timeout_recovery|submit_form_timeout_recovery|resolve_duplicate_field_conflict|resolve_field_validation_error|open_create_form_timeout_recovery|finish_create_after_submit_no_form)$/i.test(String(step || '').trim())
	}

	function isFormSubmitSummaryHistoryItem(item) {
		const input = item?.input && typeof item.input === 'object' ? item.input : {}
		const step = String(input.workflow_step || '').trim()
		if (step === 'submit_form_timeout_recovery') return true
		if (String(input.workflow || '').trim() !== 'form-fill' && String(input.workflow || '').trim() !== 'create-task') return false
		const action = normalizeActionName(item?.action)
		if (!isClickActionName(action)) return false
		return isFormSubmitLabel(input.workflow_submit_label || input.target_label || input.label || input.text || '')
	}

	function isFormSubmitLabel(value) {
		return /^(保存|提交|确定|确认|完成|save|submit|ok|confirm|done)$/i.test(String(value || '').replace(/\s+/g, '').trim())
	}

	function collectFormSubmitSummaryItems(history, options = {}) {
		const records = (Array.isArray(history) ? history : []).filter(isFormSubmitSummaryHistoryItem)
		if (!records.length) return []
		const last = records[records.length - 1]
		const failedAttempts = records.filter((item) => item?.success === false).length
		const passedAttempts = records.filter((item) => item?.success === true).length
		const status = last?.success === false
			? 'failed'
			: passedAttempts > 0
				? 'passed'
				: 'unknown'
		const label = getFormSubmitSummaryLabel(last)
		const detail = maskSensitiveValuesInText(getFormHistoryDetailText(last), options.sensitiveValues)
		return [{
			key: 'form_submit',
			order: 0,
			label,
			status,
			statusLabel: status === 'passed' ? '已提交' : status === 'failed' ? '提交失败' : '提交未确认',
			recorded: true,
			value: '',
			source: 'form_submit',
			sourceLabel: '提交表单',
			sourceTitle: '动作',
			attempts: records.length,
			failedAttempts,
			neededEvidence: status === 'passed' ? '' : buildFormSubmitNeededEvidence(status),
			summary: buildFormSubmitSummaryText(status, records.length, failedAttempts, detail),
		}]
	}

	function getFormSubmitSummaryLabel(item) {
		const input = item?.input && typeof item.input === 'object' ? item.input : {}
		return String(input.workflow_submit_label || input.target_label || input.label || input.text || '表单提交').trim()
	}

	function getFormHistoryDetailText(item) {
		return String(
			getActionOutcome(item).reason ||
			getActionOutcome(item).message ||
			item?.output ||
			item?.message ||
			''
		).trim()
	}

	function buildFormSubmitNeededEvidence(status) {
		if (status === 'failed') return '需要复查当前表单/弹层范围内的保存、提交或确定按钮是否定位正确，以及页面校验或权限提示。'
		return '需要观察提交动作后的页面状态，确认是否出现成功反馈、列表刷新、详情页更新或表单关闭。'
	}

	function buildFormSubmitSummaryText(status, attempts, failedAttempts, detail) {
		const prefix = status === 'passed'
			? '表单提交动作已成功'
			: status === 'failed'
				? '表单提交动作失败'
				: '表单提交动作缺少明确结果'
		const retry = attempts > 1 ? `；共尝试 ${attempts} 次${failedAttempts ? `，失败 ${failedAttempts} 次` : ''}` : ''
		return `${prefix}${retry}${detail ? `：${detail}` : '。'}`
	}

	function buildFormCompletionSummaryItem(session, history, submitItems, fieldItems, terminalIssue, options = {}) {
		const completion = findFormCompletionHistoryItem(history)
		if (completion) {
			const detail = maskSensitiveValuesInText(getFormHistoryDetailText(completion), options.sensitiveValues)
			return {
				key: 'form_completion',
				order: 0,
				label: '表单完成',
				status: completion.success === false ? 'failed' : 'passed',
				statusLabel: completion.success === false ? '完成失败' : '已完成',
				recorded: true,
				value: '',
				source: 'form_completion',
				sourceLabel: '完成确认',
				sourceTitle: '证据',
				attempts: 1,
				failedAttempts: completion.success === false ? 1 : 0,
				neededEvidence: completion.success === false ? '需要解决完成确认失败原因，再重新观察当前页面状态。' : '',
				summary: detail || '表单提交后已形成任务完成记录。',
			}
		}
		if (terminalIssue?.status === 'failed') {
			return {
				key: 'form_completion',
				order: 0,
				label: '表单完成',
				status: 'failed',
				statusLabel: '完成失败',
				recorded: true,
				value: '',
				source: 'terminal_failure',
				sourceLabel: '终态异常',
				sourceTitle: '证据',
				attempts: 1,
				failedAttempts: 1,
				neededEvidence: '需要先解决任务终态异常，再把字段填写或提交动作视为完整表单结果。',
				summary: terminalIssue.summary || '任务以失败状态结束。',
			}
		}
		if (terminalIssue?.status === 'unknown') {
			return {
				key: 'form_completion',
				order: 0,
				label: '表单完成',
				status: 'unknown',
				statusLabel: '需要用户补充',
				recorded: true,
				value: '',
				source: 'user_input_required',
				sourceLabel: '用户补充',
				sourceTitle: '证据',
				attempts: 1,
				failedAttempts: 0,
				neededEvidence: '需要用户补充确认、验证码、替代字段值或其他必要信息后才能继续完成表单。',
				summary: terminalIssue.summary || '任务需要用户补充信息。',
			}
		}
		const submitPassed = (Array.isArray(submitItems) ? submitItems : []).some((item) => item.status === 'passed')
		const submitFailed = (Array.isArray(submitItems) ? submitItems : []).some((item) => item.status === 'failed')
		if (submitFailed) {
			return {
				key: 'form_completion',
				order: 0,
				label: '表单完成',
				status: 'failed',
				statusLabel: '完成失败',
				recorded: true,
				value: '',
				source: 'submit_failed',
				sourceLabel: '提交失败',
				sourceTitle: '证据',
				attempts: 1,
				failedAttempts: 1,
				neededEvidence: '需要先修正页面校验、提交按钮定位或必填字段问题，再重新提交表单。',
				summary: '提交动作失败，因此不能视为表单任务已完成。',
			}
		}
		if (submitPassed && String(session?.status || '').trim() === 'completed') {
			return {
				key: 'form_completion',
				order: 0,
				label: '表单完成',
				status: 'passed',
				statusLabel: '已完成',
				recorded: true,
				value: '',
				source: 'session_completed',
				sourceLabel: '任务完成',
				sourceTitle: '证据',
				attempts: 1,
				failedAttempts: 0,
				neededEvidence: '',
				summary: '提交动作成功且任务已结束为完成状态。',
			}
		}
		if (submitPassed) {
			return {
				key: 'form_completion',
				order: 0,
				label: '表单完成',
				status: 'unknown',
				statusLabel: '完成未确认',
				recorded: true,
				value: '',
				source: 'submit_pending',
				sourceLabel: '提交待确认',
				sourceTitle: '证据',
				attempts: 1,
				failedAttempts: 0,
				neededEvidence: '需要提交后重新观察页面，确认成功提示、列表刷新、详情页更新或表单关闭。',
				summary: '表单已提交，但还缺少提交后的完成证据。',
			}
		}
		if ((Array.isArray(fieldItems) ? fieldItems : []).length) {
			return {
				key: 'form_completion',
				order: 0,
				label: '表单完成',
				status: 'unknown',
				statusLabel: '未提交',
				recorded: false,
				value: '',
				source: 'submit_missing',
				sourceLabel: '缺少提交',
				sourceTitle: '证据',
				attempts: 0,
				failedAttempts: 0,
				neededEvidence: '需要在当前表单或弹层范围内找到保存、提交、确定等提交动作，并观察提交后的页面结果。',
				summary: '字段已有输入/选择记录，但没有表单提交或完成记录，不能视为表单任务完成。',
			}
		}
		return null
	}

	function findFormCompletionHistoryItem(history) {
		for (const item of [...(Array.isArray(history) ? history : [])].reverse()) {
			const input = item?.input && typeof item.input === 'object' ? item.input : {}
			const step = String(input.workflow_step || '').trim()
			if (step === 'finish_create_after_submit_no_form') return item
			if (
				normalizeActionName(item?.action) === 'done' &&
				item?.success === true &&
				(String(input.workflow || '').trim() === 'form-fill' || String(input.workflow || '').trim() === 'create-task')
			) {
				return item
			}
		}
		return null
	}

	function deriveFormTaskSummaryStatus(session, counts) {
		const sessionStatus = String(session?.status || '').trim()
		if (sessionStatus === 'running') return 'running'
		if (sessionStatus === 'stopped') return 'stopped'
		if (counts.failed > 0 || counts.terminalFailed > 0) return 'failed'
		if (
			counts.unknown > 0 ||
			counts.remaining > 0 ||
			counts.recoveredFailures > 0 ||
			counts.verificationRecoveryIncomplete > 0 ||
			counts.userInputRequired > 0 ||
			counts.tested === 0 ||
			!counts.formCompleted
		) {
			return 'inconclusive'
		}
		return 'passed'
	}

	function buildFormTaskHeadline(status, counts) {
		const prefix = status === 'running'
			? '表单任务进行中'
			: status === 'stopped'
				? '表单任务已中止'
				: status === 'passed'
					? '表单任务完成'
					: status === 'failed'
						? '表单任务发现异常'
						: '表单任务未完全确认'
		const parts = [
			`字段 ${counts.fieldTested}/${counts.formFields} 项`,
			counts.fieldPassed ? `字段通过 ${counts.fieldPassed} 项` : '',
			counts.fieldFailed ? `字段失败 ${counts.fieldFailed} 项` : '',
			counts.fieldUnknown ? `字段未确认 ${counts.fieldUnknown} 项` : '',
			counts.submitted ? `已提交 ${counts.submitted} 次` : '',
			counts.submitFailed ? `提交失败 ${counts.submitFailed} 次` : '',
			counts.submitUnknown ? `提交未确认 ${counts.submitUnknown} 次` : '',
			counts.submitMissing ? '缺少提交动作' : '',
			counts.formCompleted ? '完成已确认' : '',
			counts.completionUnknown ? '完成未确认' : '',
			counts.recoveredFailures ? `失败后成功 ${counts.recoveredFailures} 项` : '',
			counts.verificationRecoveryIncomplete ? `校验恢复未完成 ${counts.verificationRecoveryIncomplete} 项` : '',
			counts.userInputRequired ? `需要用户补充 ${counts.userInputRequired} 项` : '',
			counts.terminalFailed ? `终态异常 ${counts.terminalFailed} 项` : '',
		].filter(Boolean)
		return `${prefix}：${parts.join('，')}。`
	}

	function buildFormTaskDiagnostics(fieldItems, submitItems, completionItem, counts = {}) {
		const diagnostics = []
		const fieldFailed = Number(counts.fieldFailed || 0)
		const fieldUnknown = Number(counts.fieldUnknown || 0)
		const submitFailed = Number(counts.submitFailed || 0)
		const submitUnknown = Number(counts.submitUnknown || 0)
		const submitMissing = Number(counts.submitMissing || 0)
		const completionUnknown = Number(counts.completionUnknown || 0)
		const verificationRecoveryIncomplete = Math.max(
			Number(counts.verificationRecoveryIncomplete || 0),
			countFieldActionVerificationRecoveryIncomplete(fieldItems, counts.terminalIssue)
		)
		const userInputRequired = Math.max(
			Number(counts.userInputRequired || 0),
			isUserInputRequiredReason(counts.terminalIssue?.summary)
		)
		if (fieldFailed) {
			diagnostics.push({
				kind: 'form_field_failed',
				severity: 'error',
				count: fieldFailed,
				text: `表单字段异常：${fieldFailed} 项字段输入/选择失败，需要复查目标字段定位、可编辑状态、候选归属或页面校验。`,
			})
		}
		if (fieldUnknown) {
			diagnostics.push({
				kind: 'form_field_unconfirmed',
				severity: 'warning',
				count: fieldUnknown,
				text: `表单字段未确认：${fieldUnknown} 项字段动作缺少明确执行结果。`,
			})
		}
		if (submitMissing) {
			diagnostics.push({
				kind: 'form_submit_missing',
				severity: 'warning',
				count: submitMissing,
				text: '缺少表单提交：已记录字段输入/选择，但没有保存、提交、确定等提交动作或完成证据。',
			})
		}
		if (submitFailed) {
			diagnostics.push({
				kind: 'form_submit_failed',
				severity: 'error',
				count: submitFailed,
				text: `表单提交失败：${submitFailed} 次提交动作失败，需要复查提交按钮定位、必填字段、页面校验或权限反馈。`,
			})
		}
		if (submitUnknown) {
			diagnostics.push({
				kind: 'form_submit_unconfirmed',
				severity: 'warning',
				count: submitUnknown,
				text: `表单提交未确认：${submitUnknown} 次提交动作缺少明确结果。`,
			})
		}
		if (completionUnknown) {
			diagnostics.push({
				kind: 'form_completion_unconfirmed',
				severity: 'warning',
				count: completionUnknown,
				text: `表单完成未确认：${completionUnknown} 条记录缺少提交后的成功反馈、列表刷新、详情更新或表单关闭证据。`,
			})
		}
		if (verificationRecoveryIncomplete) {
			diagnostics.push({
				kind: 'verification_recovery_incomplete',
				severity: 'warning',
				count: verificationRecoveryIncomplete,
				text: `校验恢复未完成：${verificationRecoveryIncomplete} 项字段或提交动作包含恢复处理原因，说明 Agent 已判断不能安全视觉恢复、恢复失败，或需要重新观察后再规划。`,
			})
		}
		if (userInputRequired) {
			diagnostics.push({
				kind: 'user_input_required',
				severity: 'warning',
				count: userInputRequired,
				text: `需要用户补充信息：${userInputRequired} 条记录显示表单任务需要用户确认、验证码、替代字段值或其他必要信息。`,
			})
		}
		if (counts.terminalIssue && counts.terminalIssue.status === 'failed') {
			diagnostics.push({
				kind: 'task_terminal_failure',
				severity: 'error',
				count: 1,
				text: `任务终态异常：表单任务最终以失败结束，原因：${counts.terminalIssue.summary}`,
			})
		}
		if (!diagnostics.length && completionItem?.status === 'passed') {
			diagnostics.push({
				kind: 'form_task_completed',
				severity: 'success',
				count: 1,
				text: '表单字段动作、提交动作和完成证据已经形成闭环。',
			})
		}
		appendNextStepRecommendations(diagnostics, buildFormTaskNextStepRecommendations(diagnostics, submitItems))
		return diagnostics
	}

	function buildFormTaskNextStepRecommendations(diagnostics, submitItems) {
		const kinds = new Set((Array.isArray(diagnostics) ? diagnostics : []).map((item) => String(item?.kind || '')))
		const recommendations = []
		if (kinds.has('form_field_failed')) {
			recommendations.push('建议：先处理失败字段，确认目标字段范围、候选归属、页面校验和异步稳定性，再提交表单。')
		}
		if (kinds.has('form_field_unconfirmed')) {
			recommendations.push('建议：补充字段动作后的页面观察，确认字段值是否真正写入或选中。')
		}
		if (kinds.has('form_submit_missing')) {
			recommendations.push('建议：字段满足后只在当前表单或弹层范围内寻找保存、提交、确定按钮；提交前不要重新点击创建入口。')
		}
		if (kinds.has('form_submit_failed')) {
			recommendations.push('建议：提交失败后优先读取页面校验和错误提示，不要重复同一提交按钮；必要时询问用户替代字段值。')
		}
		if (kinds.has('form_submit_unconfirmed') || kinds.has('form_completion_unconfirmed')) {
			recommendations.push('建议：提交后重新观察页面主体、弹层和提示区域，确认是否已保存成功、列表刷新、详情更新或表单关闭。')
		}
		if (kinds.has('verification_recovery_incomplete')) {
			recommendations.push('建议：不要重复同一失败表单动作；先重新观察当前字段、候选弹层和提交反馈，再换定位或补上下文。')
		}
		if (kinds.has('user_input_required')) {
			recommendations.push('建议：先补充 Agent 请求的确认信息、验证码或替代字段值，再从等待用户回答前的表单步骤继续。')
		}
		if (kinds.has('task_terminal_failure')) {
			recommendations.push('建议：先解决任务终态异常，再把字段填写或提交动作视为完整表单结果。')
		}
		if (!kinds.size && (Array.isArray(submitItems) ? submitItems : []).length) {
			recommendations.push('建议：保留提交后的页面证据，便于用户复核本次表单任务结果。')
		}
		return recommendations
	}

	function formatFormTaskSummaryItemLine(item) {
		const parts = [
			`${item.order}. ${item.label || item.key}：${item.statusLabel}`,
			item.value ? `值=${item.value}` : '',
			item.sourceLabel ? `${item.sourceTitle || '证据'}=${item.sourceLabel}` : '',
			item.valueSourceLabel ? `依据=${item.valueSourceLabel}${item.basis ? `/${item.basis}` : ''}` : '',
			item.attempts > 1 ? `尝试=${item.attempts}` : '',
			item.summary,
		].filter(Boolean)
		return parts.join('；')
	}

	function buildFieldActionResultSummary(session) {
		const history = Array.isArray(session?.history) ? session.history : []
		const sensitiveValues = collectSensitiveFieldActionValues(history)
		const actionItems = collectFieldActionSummaryItems(history, { sensitiveValues })
		const expectedCoverage = collectExpectedFieldActionCoverage(session)
		const items = mergeFieldActionCoverageItems(actionItems, expectedCoverage, { sensitiveValues })
		const terminalIssue = buildTerminalFieldActionIssue(session, history, { sensitiveValues })
		if (!items.length && !(terminalIssue && isFieldActionSummaryTask(session))) return null
		const total = items.length
		const tested = items.filter((item) => item.recorded).length
		const passed = items.filter((item) => item.status === 'passed').length
		const failed = items.filter((item) => item.status === 'failed').length
		const unknown = items.filter((item) => item.status === 'unknown').length
		const remaining = items.filter((item) => !item.recorded).length
		const retried = items.filter((item) => Number(item.attempts || 0) > 1).length
		const recoveredFailures = items.filter((item) => item.status === 'passed' && Number(item.failedAttempts || 0) > 0).length
		const verificationRecoveryIncomplete = countFieldActionVerificationRecoveryIncomplete(items, terminalIssue)
		const userInputRequired = countGenericUserInputRequired(history, terminalIssue?.summary || session?.activityText || '')
		const terminalFailed = terminalIssue?.status === 'failed' ? 1 : 0
		const summaryStatus = deriveFieldActionSummaryStatus(session, { failed, unknown, tested, remaining, terminalFailed, recoveredFailures, verificationRecoveryIncomplete, userInputRequired })
		const title = isInputBoxTestTask(session) ? '输入框测试结果总结' : '字段操作结果总结'
		const headline = buildFieldActionHeadline(summaryStatus, { total, tested, passed, failed, unknown, remaining, retried, recoveredFailures, verificationRecoveryIncomplete, userInputRequired, terminalFailed }, {
			testTask: isFieldActionSummaryTask(session),
		})
		const diagnostics = buildFieldActionDiagnostics(items, { tested, remaining, terminalIssue, recoveredFailures, verificationRecoveryIncomplete, userInputRequired })
		const remainingDetails = buildSummaryRemainingDetails(items)
		const issues = items
			.filter((item) => item.status !== 'passed' || Number(item.failedAttempts || 0) > 0)
			.slice(0, 12)
			.map((item) => ({
				label: item.label,
				status: item.status,
				statusLabel: item.statusLabel,
				neededEvidence: item.neededEvidence || '',
				summary: item.summary,
			}))
		if (terminalIssue) issues.unshift(terminalIssue)
		const textLines = [
			headline,
			...diagnostics.map((item) => `诊断：${item.text}`),
			...items.map(formatFieldActionSummaryItemLine),
		].filter(Boolean)
		return {
			type: 'field_actions',
			title,
			status: summaryStatus,
			headline,
			stats: { total, tested, passed, failed, unknown, remaining, retried, recoveredFailures, verificationRecoveryIncomplete, userInputRequired, terminalFailed },
			diagnostics,
			items,
			issues,
			remaining: items
				.filter((item) => !item.recorded)
				.slice(0, 50)
				.map((item) => item.label || item.key),
			remainingDetails,
			reason: issues.map((item) => item.summary).filter(Boolean).join('\n'),
			text: textLines.join('\n'),
			generatedAt: Date.now(),
		}
	}

	function buildSummaryRemainingDetails(items) {
		return (Array.isArray(items) ? items : [])
			.filter((item) => item && item.recorded === false && item.statusCode !== 'unknown_missing_sample')
			.slice(0, 50)
			.map((item) => ({
				label: item.label || item.key || '未命名项',
				status: item.status || 'unknown',
				statusLabel: item.statusLabel || '未完成',
				summary: item.summary || '该项目尚未形成完整测试记录。',
				neededEvidence: item.neededEvidence || '',
				sourceLabel: item.sourceLabel || '',
				sourceTitle: item.sourceTitle || '',
				basis: item.basis || '',
			}))
	}

	function collectFieldActionSummaryItems(history, options = {}) {
		const entries = []
		for (let index = 0; index < (Array.isArray(history) ? history : []).length; index += 1) {
			const item = history[index]
			if (!isFieldActionHistoryItem(item)) continue
			const key = getFieldActionKey(item)
			if (!key) continue
			entries.push({
				item,
				index,
				key,
				action: normalizeActionName(item?.action),
			})
		}
		const selectionIndexesByKey = new Map()
		for (const entry of entries) {
			if (!isFinalFieldSelectionActionName(entry.action)) continue
			if (!selectionIndexesByKey.has(entry.key)) selectionIndexesByKey.set(entry.key, [])
			selectionIndexesByKey.get(entry.key).push(entry.index)
		}
		const byKey = new Map()
		const optionEvidenceByKey = new Map()
		const order = []
		for (const entry of entries) {
			const item = entry.item
			const key = entry.key
			if (entry.action === 'open_dropdown') {
				updateFieldActionOptionEvidence(optionEvidenceByKey, key, item)
			}
			if (shouldSuppressOpenDropdownProbeSummary(entry, selectionIndexesByKey)) continue
			if (!byKey.has(key)) order.push(key)
			const previous = byKey.get(key) || null
			byKey.set(key, mergeFieldActionSummaryItem(previous, item, order.length, {
				...options,
				optionEvidence: optionEvidenceByKey.get(key) || null,
			}))
		}
		return order
			.map((key, index) => {
				const item = byKey.get(key)
				return item ? { ...item, order: index + 1 } : null
			})
			.filter(Boolean)
	}

	function updateFieldActionOptionEvidence(optionEvidenceByKey, key, item) {
		if (!optionEvidenceByKey || !key || item?.success === false) return
		const visibleOptions = extractOpenDropdownVisibleOptions(item)
		if (!visibleOptions.length) return
		optionEvidenceByKey.set(key, { visibleOptions })
	}

	function collectExpectedFieldActionCoverage(session) {
		const inventory = Array.isArray(session?.observedFieldInventory) ? session.observedFieldInventory : []
		if (!inventory.length || !isFieldActionSummaryTask(session)) return []
		const coverageMode = getFieldActionCoverageMode(session)
		const scope = getFieldActionCoverageScope(session)
		const taskText = getFieldActionTaskText(session)
		const seen = new Set()
		const out = []
		for (const field of inventory) {
			const item = normalizeExpectedFieldCoverageItem(field)
			if (!item || seen.has(item.key)) continue
			if (!matchesFieldActionCoverageMode(item, coverageMode)) continue
			if (isExcludedFieldActionCoverageField(item, coverageMode)) continue
			if (scope !== 'all' && !isFieldExplicitlyMentionedInTask(item, taskText)) continue
			seen.add(item.key)
			out.push(item)
		}
		return out
	}

	function getFieldActionCoverageMode(session) {
		if (isInputBoxTestTask(session)) return 'input'
		const text = normalizeCompactText(getFieldActionTaskText(session))
		if (/(选择控件|选择类控件|选择字段|selectioncontrols?|selectionfields?)/i.test(text)) return 'selection'
		if (/(复选|多选|单选|开关|checkbox|radio|switch|toggle)/i.test(text)) return 'selectable'
		if (/(下拉|选择器|选择框|级联|日期|时间|select|dropdown|combobox|picker|cascader|tree-?select|date|time|calendar)/i.test(text)) return 'dropdown'
		return 'all'
	}

	function getFieldActionCoverageScope(session) {
		const text = normalizeCompactText(getFieldActionTaskText(session))
		return /(每个|每一个|所有|全部|全量|逐个|逐一|all|every|each)/i.test(text) ? 'all' : 'targeted'
	}

	function getFieldActionTaskText(session) {
		return [
			session?.latestTask,
			session?.task,
		].filter(Boolean).join(' ')
	}

	function matchesFieldActionCoverageMode(field, coverageMode) {
		if (coverageMode === 'input') return isInputCoverageField(field)
		if (coverageMode === 'dropdown') return isDropdownCoverageField(field)
		if (coverageMode === 'selectable') return isSelectableCoverageField(field)
		if (coverageMode === 'selection') return isDropdownCoverageField(field) || isSelectableCoverageField(field)
		return true
	}

	function normalizeExpectedFieldCoverageItem(field) {
		const key = String(field?.key || '').trim() ||
			(Number.isFinite(Number(field?.index)) ? `index:${Number(field.index)}` : '')
		const label = String(field?.label || '').trim()
		if (!key || !label) return null
		return {
			key,
			label,
			kind: String(field?.kind || 'field').trim() || 'field',
			fieldType: String(field?.fieldType || field?.type || field?.control || '').trim(),
			region: String(field?.region || field?.sourceRegion || '').trim(),
		}
	}

	function isInputCoverageField(field) {
		return /^input$/i.test(String(field?.kind || '').trim())
	}

	function isDropdownCoverageField(field) {
		if (isSelectableCoverageField(field)) return false
		const descriptor = normalizeCompactText([
			field?.kind,
			field?.fieldType,
		].filter(Boolean).join(' '))
		if (/(selection|select|dropdown|combobox|picker|cascader|tree-?select|date|time|calendar|daterange|timerange|datetime|级联|下拉|选择器|选择框|日期|时间)/i.test(descriptor)) return true
		const label = normalizeCompactText(field?.label || '')
		return /(日期|时间|创建时间|更新时间|跟进时间|有效期|起止|区间)/i.test(label) && !isInputCoverageField(field)
	}

	function isSelectableCoverageField(field) {
		const descriptor = normalizeCompactText([
			field?.kind,
			field?.fieldType,
		].filter(Boolean).join(' '))
		return /(checkbox|radio|switch|toggle|multiselect|multiple|selectable|复选|多选|单选|开关)/i.test(descriptor)
	}

	function isExcludedFieldActionCoverageField(field, coverageMode) {
		const region = normalizeCompactText(field?.region || '')
		if (/^(header|sidebar|navigation|nav|toolbar|pagination|footer|statusbar)$/.test(region)) return true
		const text = normalizeCompactText([
			field?.label,
			field?.fieldType,
			field?.kind,
		].filter(Boolean).join(' '))
		if (/(captcha|verification|verifycode|otp|token|secret|api[_-]?key|csrf|file|upload|attachment|image|color|range|验证码|校验码|动态码|短信码|令牌|密钥|秘钥|上传|附件|文件)/i.test(text)) return true
		if (/^(首页|个人信息|退出登录|更多|确定|取消|提交|保存|删除|新增|新建|创建|导入|导出|共\d*条|\d+条\/页|条\/页)$/i.test(String(field?.label || '').trim())) return true
		if (coverageMode === 'input') return false
		return /^(搜索|查询|重置|清空|刷新|关闭|返回|上一页|下一页)$/i.test(String(field?.label || '').trim())
	}

	function isFieldExplicitlyMentionedInTask(field, taskText) {
		const taskKey = normalizeCompactText(taskText)
		if (!taskKey) return false
		for (const key of getFieldCoverageLabelKeys(field)) {
			if (key.length < 2) continue
			if (taskKey.includes(key)) return true
		}
		return false
	}

	function getFieldCoverageLabelKeys(field) {
		const raw = String(field?.label || '').trim()
		const variants = [
			raw,
			raw.replace(/^(请输入|请填写|请录入|请选择|选择|输入|填写|录入)\s*/i, ''),
			raw.replace(/\s*(输入框|文本框|下拉框|下拉|选择器|选择框|控件|字段|项)$/i, ''),
		]
		const out = []
		const seen = new Set()
		for (const value of variants) {
			const key = normalizeCompactText(value)
			if (!key || seen.has(key)) continue
			seen.add(key)
			out.push(key)
		}
		return out
	}

	function mergeFieldActionCoverageItems(actionItems, expectedCoverage, options = {}) {
		const actions = Array.isArray(actionItems) ? actionItems : []
		const expected = Array.isArray(expectedCoverage) ? expectedCoverage : []
		if (!expected.length) return actions
		const byKey = new Map(actions.map((item) => [String(item?.key || '').trim(), item]))
		const merged = []
		const seen = new Set()
		for (const field of expected) {
			const key = String(field?.key || '').trim()
			if (!key || seen.has(key)) continue
			seen.add(key)
			merged.push(byKey.get(key) || buildUntestedFieldActionSummaryItem(field, merged.length + 1, options))
		}
		for (const item of actions) {
			const key = String(item?.key || '').trim()
			if (!key || seen.has(key)) continue
			seen.add(key)
			merged.push(item)
		}
		return merged.map((item, index) => ({ ...item, order: index + 1 }))
	}

	function buildUntestedFieldActionSummaryItem(field, order, options = {}) {
		const label = String(field?.label || field?.key || '未命名字段').trim()
		const sensitive = isSensitiveFieldDescriptor([
			label,
			field?.fieldType,
			field?.kind,
		].filter(Boolean).join(' '))
		return {
			key: String(field?.key || '').trim(),
			order,
			label,
			status: 'unknown',
			statusLabel: '未测试',
			recorded: false,
			value: '',
			sensitive,
			source: '',
			sourceLabel: '',
			sourceTitle: '动作',
			attempts: 0,
			failedAttempts: 0,
			neededEvidence: buildUntestedFieldActionNeededEvidence(label, field),
			summary: maskSensitiveValuesInText('该字段在最近页面观察中可见，但尚未记录输入/选择测试动作。', options.sensitiveValues),
		}
	}

	function buildUntestedFieldActionNeededEvidence(label, field = {}) {
		const name = String(label || '该字段').trim()
		const descriptor = normalizeCompactText([
			field?.kind,
			field?.fieldType,
			field?.role,
			field?.selectionControl,
		].filter(Boolean).join(' '))
		if (isDropdownCoverageField(field)) {
			return `${name} 需要形成一次输入/选择测试动作记录：选择类字段应先展开或读取真实候选，再选择可归属当前字段的真实候选并复核字段值；若不可测，需要明确跳过原因。`
		}
		if (isSelectableCoverageField(field)) {
			return `${name} 需要形成一次输入/选择测试动作记录：开关、单选或复选类控件应记录点击前后状态变化或页面反馈；若不可测，需要明确跳过原因。`
		}
		if (isInputCoverageField(field) || /(input|textarea|textbox|text|number|email|search|password|tel|url|文本|输入)/i.test(descriptor)) {
			return `${name} 需要形成一次输入/选择测试动作记录：输入类字段应记录写入值、字段值复核或页面校验反馈；若敏感、只读或不属于范围，需要明确跳过原因。`
		}
		return `${name} 需要形成一次输入/选择测试动作记录，或明确说明它不属于本次测试范围。`
	}

	function isFieldActionHistoryItem(item) {
		const action = normalizeActionName(item?.action)
		if (!Object.prototype.hasOwnProperty.call(FIELD_ACTION_LABELS, action)) return false
		const input = item?.input || {}
		const workflowStep = String(input.workflow_step || '').trim()
		if (String(input.workflow || '').trim() === 'login' || /^(fill_username|fill_password|submit_login)$/i.test(workflowStep)) return false
		if (/^(clear_field|reset_filters|submit_search|skip_field|expand_search_panel|finish_search_fields)$/i.test(workflowStep)) return false
		if (input.workflow_field_clear === true || String(input.workflow_clear_context || '').trim()) return false
		if (action === 'open_dropdown' && item?.success !== false && !hasOpenDropdownVisibleEvidence(item)) return false
		if (isClickActionName(action) && !isFieldToggleClickHistoryItem(item)) return false
		return !!getFieldActionKey(item)
	}

	function shouldSuppressOpenDropdownProbeSummary(entry, selectionIndexesByKey) {
		if (!entry || entry.action !== 'open_dropdown' || entry.item?.success === false) return false
		const indexes = selectionIndexesByKey.get(entry.key) || []
		return indexes.some((index) => index > entry.index)
	}

	function isFinalFieldSelectionActionName(action) {
		return action === 'choose_dropdown_option' ||
			action === 'select_checkbox_option' ||
			action === 'select_cascader_path' ||
			action === 'select_visible_cascader_option'
	}

	function hasOpenDropdownVisibleEvidence(item) {
		const outcome = getActionOutcome(item)
		const kind = String(outcome.kind || '').trim()
		if (/options_visible/i.test(kind)) return true
		if (extractOpenDropdownVisibleOptions(item).length) return true
		return /(候选|options_visible|visibleOptions|candidates=|candidates")/i.test(String(item?.output || ''))
	}

	function isClickActionName(action) {
		return action === 'click' || action === 'click_element_by_index'
	}

	function isFieldToggleClickHistoryItem(item) {
		const input = item?.input || {}
		if (String(input.workflow || '') === 'search-fields') return false
		if (input.workflow_field_key || input.workflow_field_label || input.workflow_field_type) return true
		const text = normalizeCompactText([
			input.target_label,
			input.label,
			input.text,
			input.name,
			input.role,
			input.control,
			input.fieldType,
			input.workflow_field_type,
			item?.output,
			getActionOutcome(item).kind,
			getActionOutcome(item).reason,
		].filter(Boolean).join(' '))
		if (!text) return false
		if (isCommandClickLabel(text)) return false
		return /(checkbox|radio|switch|toggle|checked|unchecked|selected|unselected|state_changed|复选|单选|开关|切换|勾选|取消勾选|选中|未选中|启用|停用)/i.test(text)
	}

	function isCommandClickLabel(text) {
		return /(搜索|查询|筛选|重置|清空|提交|保存|确定|取消|删除|移除|新增|新建|创建|导入|导出|详情|编辑|关闭|返回|下一步|上一步|search|query|filter|reset|clear|submit|save|confirm|cancel|delete|remove|create|add|import|export|detail|edit|close|back|next|previous)/i.test(String(text || ''))
	}

	function mergeFieldActionSummaryItem(previous, item, fallbackOrder, options = {}) {
		const action = normalizeActionName(item?.action)
		const sourceAction = getFieldActionSourceAction(item, action)
		const input = item?.input || {}
		const label = getFieldActionLabel(item)
			const rawValue = getFieldActionValue(item)
			const value = formatFieldActionDisplayValue(rawValue, item)
			const valueSource = getFieldActionValueSource(item, { rawValue, value, optionEvidence: options.optionEvidence })
			const valueSourceLabel = valueSource ? (FIELD_VALUE_SOURCE_LABELS[valueSource] || valueSource) : ''
			const basis = maskSensitiveValuesInText(getFieldActionValueBasis(item, { rawValue, value, optionEvidence: options.optionEvidence }), options.sensitiveValues)
			const success = item?.success
		const status = success === false ? 'failed' : (success === true ? 'passed' : 'unknown')
		const attempts = Number(previous?.attempts || 0) + 1
		const failedAttempts = Number(previous?.failedAttempts || 0) + (success === false ? 1 : 0)
		const summary = buildFieldActionItemSummary(item, {
			action: sourceAction,
			status,
			attempts,
			failedAttempts,
		}, options)
		return {
			key: getFieldActionKey(item),
			order: Number(previous?.order || fallbackOrder || 0),
			label,
			status,
			statusLabel: status === 'passed' ? '通过' : status === 'failed' ? '失败' : '未确认',
			recorded: true,
			value,
				source: sourceAction,
				sourceLabel: FIELD_ACTION_LABELS[sourceAction] || sourceAction,
				sourceTitle: '动作',
				valueSource,
				valueSourceLabel,
				basis,
				attempts,
				failedAttempts,
				summary,
		}
	}

	function getFieldActionSourceAction(item, action) {
		const input = item?.input || {}
		const step = String(input.workflow_step || '').trim()
		if (action === 'click_element_by_index' && step === 'select_visible_cascader_option_timeout_recovery') {
			return 'select_visible_cascader_option'
		}
		return action
	}

	function getFieldActionKey(item) {
		const input = item?.input || {}
		const explicit = String(input.workflow_field_key || '').trim()
		if (explicit) return explicit
		const index = Number(input.workflow_field_index ?? input.index)
		if (Number.isFinite(index)) return `index:${index}`
		const label = normalizeCompactText(getFieldActionLabel(item))
		return label ? `label:${label}` : ''
	}

	function getFieldActionLabel(item) {
		const input = item?.input || {}
		return String(
			input.workflow_field_label ||
			input.target_label ||
			input.label ||
			input.name ||
			input.placeholder ||
			''
		).trim() || String(getFieldActionKeyFromInput(input) || '未命名字段').trim()
	}

	function getFieldActionKeyFromInput(input) {
		const index = Number(input?.workflow_field_index ?? input?.index)
		if (Number.isFinite(index)) return `index:${index}`
		return ''
	}

	function getFieldActionValue(item) {
		if (normalizeActionName(item?.action) === 'open_dropdown') {
			return formatOpenDropdownActionValue(item)
		}
		const input = item?.input || {}
		const visibleCascaderValue = getVisibleCascaderOptionClickValue(item)
		if (visibleCascaderValue) return visibleCascaderValue
		const selectedPathValue = getFieldActionSelectedPathValue(item)
		if (selectedPathValue) return selectedPathValue
		const pathValue = formatFieldActionPathValue(input.path)
		if (pathValue) return pathValue
		for (const value of [
			input.workflow_test_value,
			input.text,
			input.value,
			input.label,
			input.selected_text,
			input.option,
		]) {
			const text = String(value ?? '').trim()
			if (text) return text
		}
		return ''
	}

	function getVisibleCascaderOptionClickValue(item) {
		const action = normalizeActionName(item?.action)
		const input = item?.input || {}
		if (action !== 'click_element_by_index' && action !== 'click') return ''
		if (String(input.workflow_step || '').trim() !== 'select_visible_cascader_option_timeout_recovery') return ''
		return String(input.workflow_requested_text || input.target_label || '').trim()
	}

	function getFieldActionSelectedPathValue(item) {
		if (normalizeActionName(item?.action) !== 'select_cascader_path') return ''
		for (const path of [
			item?.meta?.selectedPath,
			item?.meta?.selectedLabels,
			item?.meta?.outcome?.selectedPath,
			item?.meta?.outcome?.selectedLabels,
			getActionOutcome(item).selectedPath,
			getActionOutcome(item).selectedLabels,
		]) {
			const text = formatFieldActionPathValue(path)
			if (text) return text
		}
		return ''
	}

	function formatFieldActionPathValue(path) {
		const parts = Array.isArray(path)
			? path
			: String(path || '').split(/\s*(?:->|→|＞|>|\/|\\|,|，|、|\|)\s*/g)
		const values = parts
			.map((item) => String(item || '').trim())
			.filter(Boolean)
			.slice(0, 8)
		return values.join(' / ')
	}

	function getFieldActionValueSource(item, meta = {}) {
		const input = item?.input || {}
		const explicit = String(input.workflow_value_source || input.value_source || '').trim()
		if (explicit) return explicit
		return inferFieldActionValueSource(item, meta)
	}

	function getFieldActionValueBasis(item, meta = {}) {
		const input = item?.input || {}
		const explicit = String(input.workflow_value_basis || input.value_basis || '').trim()
		if (explicit) return explicit
		return inferFieldActionValueBasis(item, meta)
	}

	function inferFieldActionValueSource(item, meta = {}) {
		const action = normalizeActionName(item?.action)
		if (action === 'open_dropdown' && item?.success !== false && extractOpenDropdownVisibleOptions(item).length) {
			return 'visible_option'
		}
		if (fieldActionSelectedValueMatchesOptionEvidence(meta.rawValue || meta.value, meta.optionEvidence)) {
			return 'visible_option'
		}
		if (fieldActionSelectedValueMatchesVisibleOptions(meta.rawValue || meta.value, item)) {
			return 'visible_option'
		}
		if (action === 'select_cascader_path' && getFieldActionSelectedPathValue(item)) {
			return 'visible_option'
		}
		if (getVisibleCascaderOptionClickValue(item)) {
			return 'visible_option'
		}
		return ''
	}

	function inferFieldActionValueBasis(item, meta = {}) {
		const action = normalizeActionName(item?.action)
		if (action === 'open_dropdown' && item?.success !== false) {
			const visible = extractOpenDropdownVisibleOptions(item)
			if (visible.length) return `动作结果返回可见候选 ${visible.length} 项`
		}
		if (fieldActionSelectedValueMatchesOptionEvidence(meta.rawValue || meta.value, meta.optionEvidence)) {
			const count = Array.isArray(meta.optionEvidence?.visibleOptions) ? meta.optionEvidence.visibleOptions.length : 0
			return count ? `先前展开候选包含所选值（候选 ${count} 项）` : '先前展开候选包含所选值'
		}
		if (fieldActionSelectedValueMatchesVisibleOptions(meta.rawValue || meta.value, item)) {
			const visible = extractOpenDropdownVisibleOptions(item)
			return visible.length ? `动作结果返回可见候选并包含所选值（候选 ${visible.length} 项）` : '动作结果返回可见候选并包含所选值'
		}
		if (action === 'select_cascader_path' && getFieldActionSelectedPathValue(item)) {
			return '动作结果返回已选路径'
		}
		if (getVisibleCascaderOptionClickValue(item)) {
			return '可见候选点击后字段值变化'
		}
		return ''
	}

	function fieldActionSelectedValueMatchesVisibleOptions(value, item) {
		return fieldActionSelectedValueMatchesOptionEvidence(value, {
			visibleOptions: extractOpenDropdownVisibleOptions(item),
		})
	}

	function fieldActionSelectedValueMatchesOptionEvidence(value, optionEvidence) {
		const selected = normalizeCompactText(value)
		const visibleOptions = Array.isArray(optionEvidence?.visibleOptions) ? optionEvidence.visibleOptions : []
		if (!selected || !visibleOptions.length) return false
		return visibleOptions.some((option) => normalizeCompactText(option) === selected)
	}

	function formatOpenDropdownActionValue(item) {
		if (item?.success === false) return ''
		const visible = extractOpenDropdownVisibleOptions(item)
		if (visible.length) {
			const preview = formatOpenDropdownCandidatePreview(visible)
			return preview ? `候选 ${visible.length} 项：${preview}` : `候选 ${visible.length} 项`
		}
		return hasOpenDropdownVisibleEvidence(item) ? '已展开' : ''
	}

	function formatOpenDropdownCandidatePreview(values) {
		const visible = uniqueVisibleOptionTexts(values)
		if (!visible.length) return ''
		const preview = visible.slice(0, 4).join(' / ')
		return visible.length > 4 ? `${preview} 等` : preview
	}

	function extractOpenDropdownVisibleOptions(item) {
		const outcome = getActionOutcome(item)
		const direct = Array.isArray(outcome.visibleOptions)
			? outcome.visibleOptions
			: Array.isArray(item?.visibleOptions)
				? item.visibleOptions
				: []
		if (direct.length) return uniqueVisibleOptionTexts(direct)
		const output = String(item?.output || '')
		const candidatesMatch = output.match(/candidates=["']([^"']+)["']/i)
		if (candidatesMatch) return splitVisibleOptionText(candidatesMatch[1])
		const currentMatch = output.match(/当前候选[:：]\s*([^。|]+?)(?:\s+状态变化|\s*\|\s*动作结果|$)/)
		if (currentMatch) return splitVisibleOptionText(currentMatch[1])
		return []
	}

	function getActionOutcome(item) {
		if (item?.outcome && typeof item.outcome === 'object') return item.outcome
		if (item?.meta?.outcome && typeof item.meta.outcome === 'object') return item.meta.outcome
		return {}
	}

	function splitVisibleOptionText(value) {
		return uniqueVisibleOptionTexts(String(value || '').split(/[|、,，;；]/))
	}

	function uniqueVisibleOptionTexts(values) {
		const out = []
		const seen = new Set()
		for (const value of (Array.isArray(values) ? values : [])) {
			const text = String(value || '').trim()
			const key = normalizeCompactText(text)
			if (!key || seen.has(key)) continue
			seen.add(key)
			out.push(text)
		}
		return out
	}

	function formatFieldActionDisplayValue(value, item) {
		const text = String(value || '').trim()
		if (!text) return ''
		if (isSensitiveFieldAction(item)) return '已隐藏'
		return text.length > 120 ? `${text.slice(0, 117)}...` : text
	}

	function isSensitiveFieldAction(item) {
		const input = item?.input || {}
		const text = normalizeCompactText([
			input.workflow_field_label,
			input.target_label,
			input.label,
			input.name,
			input.placeholder,
			input.type,
			input.workflow_field_type,
		].filter(Boolean).join(' '))
		return isSensitiveFieldDescriptor(text)
	}

	function isSensitiveFieldDescriptor(text) {
		return /(password|passcode|pwd|otp|captcha|verification|secret|token|密码|口令|验证码|校验码|动态码|安全码|密钥|令牌)/i.test(String(text || ''))
	}

	function collectSensitiveFieldActionValues(history) {
		const values = []
		for (const item of (Array.isArray(history) ? history : [])) {
			if (!isSensitiveFieldAction(item)) continue
			const text = String(getFieldActionValue(item) || '').trim()
			if (text.length >= 4) values.push(text)
		}
		return uniqueSensitiveValues(values)
	}

	function buildFieldActionItemSummary(item, meta = {}, options = {}) {
		const output = String(item?.output || '').trim()
		const outcome = getActionOutcome(item)
		const reason = String(outcome.reason || outcome.message || '').trim()
		const actionLabel = FIELD_ACTION_LABELS[meta.action] || meta.action || '字段动作'
		const statusText = meta.status === 'passed' ? '已成功' : meta.status === 'failed' ? '失败' : '未确认'
		const retryText = meta.attempts > 1
			? `；共尝试 ${meta.attempts} 次${meta.failedAttempts ? `，失败 ${meta.failedAttempts} 次` : ''}`
			: ''
		const detail = maskSensitiveValuesInText(reason || output, options.sensitiveValues)
		return `${actionLabel}${statusText}${retryText}${detail ? `：${detail}` : '。'}`
	}

	function deriveFieldActionSummaryStatus(session, counts) {
		const sessionStatus = String(session?.status || '').trim()
		if (sessionStatus === 'running') return 'running'
		if (sessionStatus === 'stopped') return 'stopped'
		if (counts.failed > 0 || counts.terminalFailed > 0) return 'failed'
		if (counts.unknown > 0 || counts.remaining > 0 || counts.recoveredFailures > 0 || counts.verificationRecoveryIncomplete > 0 || counts.userInputRequired > 0 || counts.tested === 0) return 'inconclusive'
		return 'passed'
	}

	function buildFieldActionHeadline(status, counts, options = {}) {
		const noun = options.testTask ? '字段测试' : '字段操作'
		const prefix = status === 'running'
			? `${noun}进行中`
			: status === 'stopped'
				? `${noun}已中止`
				: status === 'passed'
					? `${noun}完成`
					: status === 'failed'
						? `${noun}发现异常`
						: `${noun}未完全确认`
		const parts = [
			`共 ${counts.total} 项`,
			`已记录 ${counts.tested} 项`,
			`通过 ${counts.passed} 项`,
			counts.failed ? `失败 ${counts.failed} 项` : '',
			counts.unknown ? `未确认 ${counts.unknown} 项` : '',
			counts.remaining ? `未测试 ${counts.remaining} 项` : '',
			counts.recoveredFailures ? `失败后成功 ${counts.recoveredFailures} 项` : '',
			counts.verificationRecoveryIncomplete ? `校验恢复未完成 ${counts.verificationRecoveryIncomplete} 项` : '',
			counts.userInputRequired ? `需要用户补充 ${counts.userInputRequired} 项` : '',
			counts.retried ? `重试 ${counts.retried} 项` : '',
			counts.terminalFailed ? `终态异常 ${counts.terminalFailed} 项` : '',
		].filter(Boolean)
		return `${prefix}：${parts.join('，')}。`
	}

	function buildFieldActionDiagnostics(items, counts = {}) {
		const diagnostics = []
		const failed = countItems(items, (item) => item.status === 'failed')
		const selectionFailures = (Array.isArray(items) ? items : []).filter(isFieldSelectionFailureItem)
		const unknown = countItems(items, (item) => item.status === 'unknown')
		const retried = countItems(items, (item) => Number(item.attempts || 0) > 1)
		const recoveredFailures = Number(counts.recoveredFailures || 0)
		const remaining = Number(counts.remaining || 0)
		const verificationRecoveryIncomplete = Math.max(
			Number(counts.verificationRecoveryIncomplete || 0),
			countFieldActionVerificationRecoveryIncomplete(items, counts.terminalIssue)
		)
		const userInputRequired = Math.max(
			Number(counts.userInputRequired || 0),
			isUserInputRequiredReason(counts.terminalIssue?.summary)
		)
		if (failed) {
			diagnostics.push({
				kind: 'field_action_failed',
				severity: 'error',
				count: failed,
				text: `字段动作失败：${failed} 项输入/选择动作未成功，需要复查元素定位、可编辑状态或页面校验。`,
			})
		}
		if (selectionFailures.length) {
			diagnostics.push({
				kind: 'field_selection_failed',
				severity: 'error',
				count: selectionFailures.length,
				text: `选择类字段失败：${selectionFailures.length} 项下拉/复选/级联动作未成功${formatDiagnosticFieldList(selectionFailures)}，需要复查目标字段范围、可见候选、弹层归属或级联路径。`,
			})
		}
		if (unknown) {
			diagnostics.push({
				kind: 'field_action_unknown',
				severity: 'warning',
				count: unknown,
				text: `字段动作未确认：${unknown} 项缺少明确执行结果。`,
			})
		}
		if (remaining) {
			diagnostics.push({
				kind: 'field_action_coverage_incomplete',
				severity: 'warning',
				count: remaining,
				text: `字段覆盖未完成：最近页面观察中还有 ${remaining} 项字段没有形成输入/选择测试记录，不能视为“每一个字段”都已测试。`,
			})
		}
		if (recoveredFailures) {
			diagnostics.push({
				kind: 'field_action_recovered_failure',
				severity: 'warning',
				count: recoveredFailures,
				text: `失败后成功：${recoveredFailures} 项字段最终通过，但曾出现失败尝试，建议复查元素定位、弹层归属或页面异步稳定性。`,
			})
		}
		if (verificationRecoveryIncomplete) {
			diagnostics.push({
				kind: 'verification_recovery_incomplete',
				severity: 'warning',
				count: verificationRecoveryIncomplete,
				text: `校验恢复未完成：${verificationRecoveryIncomplete} 项字段失败记录包含恢复处理原因，说明 Agent 已判断不能安全视觉恢复、恢复失败，或需要重新观察后再规划。`,
			})
		}
		if (userInputRequired) {
			diagnostics.push({
				kind: 'user_input_required',
				severity: 'warning',
				count: userInputRequired,
				text: `需要用户补充信息：${userInputRequired} 条记录显示字段测试过程中需要用户确认、验证码、缺失账号信息或冲突字段新值；补足信息前不应继续猜测页面动作。`,
			})
		}
		if (retried) {
			diagnostics.push({
				kind: 'field_action_retried',
				severity: 'info',
				count: retried,
				text: `字段动作重试：${retried} 项字段发生过重复尝试，建议关注是否存在定位漂移或校验回退。`,
			})
		}
		if (counts.terminalIssue && counts.terminalIssue.status === 'failed') {
			diagnostics.push({
				kind: 'task_terminal_failure',
				severity: 'error',
				count: 1,
				text: `任务终态异常：字段动作记录之后任务仍以失败结束，原因：${counts.terminalIssue.summary}`,
			})
		}
		if (!diagnostics.length && Number(counts.tested || 0) > 0) {
			diagnostics.push({
				kind: 'field_actions_complete',
				severity: 'success',
				count: Number(counts.tested || 0),
				text: '已形成字段级输入/选择动作记录，没有聚合级异常。',
			})
		}
		appendNextStepRecommendations(diagnostics, buildFieldActionNextStepRecommendations(diagnostics))
		return diagnostics
	}

	function isFieldSelectionFailureItem(item) {
		if (!item || item.status !== 'failed') return false
		const source = String(item.source || '').trim()
		return /^(open_dropdown|choose_dropdown_option|select_checkbox_option|select_cascader_path|select_visible_cascader_option)$/i.test(source)
	}

	function formatDiagnosticFieldList(items) {
		const labels = []
		const seen = new Set()
		for (const item of (Array.isArray(items) ? items : [])) {
			const label = String(item?.label || item?.key || '').trim()
			const key = normalizeCompactText(label)
			if (!label || seen.has(key)) continue
			seen.add(key)
			labels.push(label)
			if (labels.length >= 4) break
		}
		return labels.length ? `（${labels.join('、')}）` : ''
	}

	function buildFieldActionNextStepRecommendations(diagnostics) {
		const kinds = new Set((Array.isArray(diagnostics) ? diagnostics : []).map((item) => String(item?.kind || '')))
		const recommendations = []
		if (kinds.has('field_action_failed')) {
			recommendations.push('建议：优先复查失败字段的元素定位、可编辑状态、候选归属和页面校验反馈。')
		}
		if (kinds.has('field_selection_failed')) {
			recommendations.push('建议：选择类失败先看目标字段范围内的真实候选、弹层是否归属该字段，以及级联路径每一级是否存在；不要用字段外候选或普通点击绕过选择工具。')
		}
		if (kinds.has('field_action_recovered_failure') || kinds.has('field_action_retried')) {
			recommendations.push('建议：关注重试字段是否存在定位漂移、弹层异步渲染或校验回退。')
		}
		if (kinds.has('field_action_unknown')) {
			recommendations.push('建议：补充动作后的字段状态观察，确认值是否真正写入或选中。')
		}
		if (kinds.has('verification_recovery_incomplete')) {
			recommendations.push('建议：不要重复同一失败字段动作；先确认目标字段可命中、候选归属和页面异步状态，再换定位或补上下文。')
		}
		if (kinds.has('user_input_required')) {
			recommendations.push('建议：先补充 Agent 请求的验证码、账号、确认信息或替代字段值，再从等待用户回答前的字段测试步骤继续。')
		}
		if (kinds.has('field_action_coverage_incomplete')) {
			recommendations.push('建议：从未测试字段继续执行，或说明这些字段为何不属于本次测试范围。')
		}
		if (kinds.has('task_terminal_failure')) {
			recommendations.push('建议：先解决任务终态异常，再把字段动作结果当作完整测试结论。')
		}
		return recommendations
	}

	function buildTerminalFieldActionIssue(session, history, options = {}) {
		const status = String(session?.status || '').trim()
		if (status !== 'error') return null
		const text = getTerminalFailureText(session, history, options)
		if (!text) return null
		if (isUserInputRequiredReason(text)) {
			return {
				label: '需要用户补充',
				status: 'unknown',
				statusLabel: '需要用户补充',
				summary: text,
			}
		}
		return {
			label: '任务终态',
			status: 'failed',
			statusLabel: '失败',
			summary: text,
		}
	}

	function getTerminalFailureText(session, history, options = {}) {
		const lastFailure = [...(Array.isArray(history) ? history : [])]
			.reverse()
			.find((item) => item?.success === false)
		const values = [
			lastFailure?.output,
			lastFailure?.outcome?.reason,
			session?.activityText,
		]
		for (const value of values) {
			const text = maskSensitiveValuesInText(value, options.sensitiveValues)
			if (text) return text.length > 240 ? `${text.slice(0, 237)}...` : text
		}
		return ''
	}

	function formatFieldActionSummaryItemLine(item) {
		const parts = [
			`${item.order}. ${item.label || item.key}：${item.statusLabel}`,
			item.value ? `值=${item.value}` : '',
			item.sourceLabel ? `动作=${item.sourceLabel}` : '',
			item.valueSourceLabel ? `依据=${item.valueSourceLabel}${item.basis ? `/${item.basis}` : ''}` : '',
			item.attempts > 1 ? `尝试=${item.attempts}` : '',
			item.summary,
		].filter(Boolean)
		return parts.join('；')
	}

	function isInputBoxTestTask(session) {
		const text = String(session?.latestTask || session?.task || '').trim()
		return /(输入框|输入项|文本框|表单字段|form\s*field|input)/i.test(text) &&
			/(测试|验证|检查|每个|每一个|所有|全部|test|verify|check)/i.test(text)
	}

	function isFieldActionSummaryTask(session) {
		if (isInputBoxTestTask(session)) return true
		const text = String(session?.latestTask || session?.task || '').trim()
		return /(字段|表单|控件|下拉|选择器|复选|单选|开关|field|form|control|dropdown|select|checkbox|radio|switch)/i.test(text) &&
			/(测试|验证|检查|每个|每一个|所有|全部|test|verify|check)/i.test(text)
	}

	function isInformationSeekingSummaryTask(session) {
		const text = String(session?.latestTask || session?.task || '').trim()
		if (!text || isFieldActionSummaryTask(session)) return false
		if (/(测试|验证|检查|每个|每一个|所有|全部|功能是否|是否正常|test|verify|check)/i.test(text)) return false
		return /(搜索一下|搜一下|查一下|查询一下|谷歌搜索|百度搜索|必应搜索|网上搜索|搜索最新|最新|价格|行情|新闻|资讯|资料|总结|分析|是否|是不是|值得|买入|卖出|search\s+(?:for|the\s+web|google|bing)|look\s*up|research|latest|price|news|summari[sz]e|analy[sz]e|whether|worth)/i.test(text)
	}

	function buildInformationResultSummary(session) {
		if (!isInformationSeekingSummaryTask(session)) return null
		const status = String(session?.status || '').trim()
		if (!status || status === 'idle') return null
		const history = Array.isArray(session?.history) ? session.history : []
		if (status === 'running' && !history.length) return null
		const failed = history.filter((item) => item?.success === false).length
		const completed = history.filter((item) => item?.success === true).length
		const sensitiveValues = collectGenericSensitiveValues(session, history)
		const finalAnswer = maskSensitiveValuesInText(extractInformationFinalAnswer(history), sensitiveValues)
		const terminalReason = maskSensitiveValuesInText(extractSessionTerminalReason(session), sensitiveValues)
		const contextRequestLimit = countGenericContextRequestLimit(history, terminalReason)
		const verificationRecoveryIncomplete = countGenericVerificationRecoveryIncomplete(history, terminalReason)
		const userInputRequired = countGenericUserInputRequired(history, terminalReason)
		const missingFinalAnswer = finalAnswer ? 0 : 1
		const prefix = status === 'completed' && finalAnswer
			? '信息查询已完成'
			: status === 'running'
				? '信息查询进行中'
				: status === 'stopped'
					? '信息查询已中止'
					: '信息查询未完成'
		const headline = [
			prefix,
			`已执行 ${history.length} 个动作`,
			completed ? `成功 ${completed} 个` : '',
			failed ? `失败 ${failed} 个` : '',
			missingFinalAnswer ? '尚未形成最终答复' : '已形成最终答复',
			contextRequestLimit ? `上下文补证上限 ${contextRequestLimit} 个` : '',
			verificationRecoveryIncomplete ? `校验恢复未完成 ${verificationRecoveryIncomplete} 个` : '',
			userInputRequired ? `需要用户补充 ${userInputRequired} 个` : '',
		].filter(Boolean).join('，') + '。'
		const diagnostics = buildGenericDiagnostics(status, terminalReason, {
			contextRequestLimit,
			verificationRecoveryIncomplete,
			userInputRequired,
		})
		if (missingFinalAnswer) {
			diagnostics.unshift({
				kind: 'missing_final_answer',
				severity: status === 'completed' ? 'warning' : 'error',
				count: 1,
				text: '信息查询任务尚未记录给用户的最终答复，不能只用页面点击或展开动作作为任务结果。',
			})
			diagnostics.push({
				kind: 'next_step_recommendation',
				severity: 'info',
				count: 1,
				text: '建议：先整理已观察到的来源、关键事实和时间点，再用最终答复明确回答用户问题。',
			})
		}
		const actionIssues = buildGenericFailedActionIssues(history, { sensitiveValues })
		const issue = status === 'completed' ? '' : terminalReason
		const issueLabel = status === 'stopped' ? '终止原因' : '最后问题'
		return {
			type: 'information',
			title: '信息查询结果总结',
			status: status === 'completed' && finalAnswer ? 'passed' : status === 'running' ? 'running' : status === 'stopped' ? 'stopped' : userInputRequired ? 'inconclusive' : 'failed',
			headline,
			stats: { total: history.length, completed, failed, missingFinalAnswer, contextRequestLimit, verificationRecoveryIncomplete, userInputRequired, terminalFailed: issue && status === 'error' && !userInputRequired ? 1 : 0 },
			diagnostics,
			items: finalAnswer ? [{ order: 1, label: '最终答复', status: 'passed', statusLabel: '已记录', summary: finalAnswer }] : [],
			issues: [
				missingFinalAnswer ? { label: '最终答复', status: 'unknown', statusLabel: '未形成', summary: '任务过程没有记录面向用户的最终总结或结论。' } : null,
				issue ? { label: issueLabel, status: status === 'stopped' ? 'stopped' : 'failed', statusLabel: status === 'stopped' ? '已中止' : '失败', summary: issue } : null,
				...actionIssues,
			].filter(Boolean),
			remaining: missingFinalAnswer ? ['最终答复'] : [],
			reason: issue || (missingFinalAnswer ? '任务过程没有记录面向用户的最终总结或结论。' : ''),
			text: [
				headline,
				finalAnswer ? `最终答复：${finalAnswer}` : '',
				...diagnostics.map((item) => `诊断：${item.text}`),
				issue ? `${issueLabel}：${issue}` : '',
				...actionIssues.map(formatGenericFailedActionIssueLine),
			].filter(Boolean).join('\n'),
			generatedAt: Date.now(),
		}
	}

	function extractInformationFinalAnswer(history) {
		for (let index = (Array.isArray(history) ? history.length : 0) - 1; index >= 0; index -= 1) {
			const item = history[index]
			if (normalizeActionName(item?.action) !== 'done' || item?.success === false) continue
			const input = item?.input && typeof item.input === 'object' ? item.input : {}
			const text = String(input.text || input.summary || item?.output || '').trim()
			if (text) return text.length > 1200 ? `${text.slice(0, 1197)}...` : text
		}
		return ''
	}

	function buildSearchHeadline(session, status, counts) {
		const prefix = status === 'running'
			? '搜索测试进行中'
			: status === 'stopped'
				? '搜索测试已中止'
				: status === 'passed'
					? '搜索测试完成'
					: status === 'failed'
						? '搜索测试发现异常'
						: '搜索测试未完全确认'
		const parts = [
			`共 ${counts.total} 项`,
			`已形成 ${counts.tested} 项结果`,
			`通过 ${counts.passed} 项`,
			counts.cleanupPassed ? `清空完成 ${counts.cleanupPassed} 项` : '',
			counts.failed ? `异常 ${counts.failed} 项` : '',
			counts.cleanupFailed ? `清空异常 ${counts.cleanupFailed} 项` : '',
			counts.cleanupUnverified ? `清空未确认 ${counts.cleanupUnverified} 项` : '',
			counts.dateCandidateOwnership ? `日期候选归属 ${counts.dateCandidateOwnership} 项` : '',
			counts.contextRequestLimit ? `上下文补证上限 ${counts.contextRequestLimit} 项` : '',
			counts.verificationRecoveryIncomplete ? `校验恢复未完成 ${counts.verificationRecoveryIncomplete} 项` : '',
			counts.userInputRequired ? `需要用户补充 ${counts.userInputRequired} 项` : '',
			counts.unknown ? `未确认 ${counts.unknown} 项` : '',
			counts.skipped ? `安全跳过 ${counts.skipped} 项` : '',
			counts.remaining ? `未完成 ${counts.remaining} 项` : '',
		].filter(Boolean)
		return `${prefix}：${parts.join('，')}。`
	}

	function formatSearchSummaryItemLine(item) {
		const parts = [
			`${item.order}. ${item.label || item.key}：${item.statusLabel}`,
			item.value ? `测试值=${item.value}` : '',
			item.sourceLabel ? `取值来源=${item.sourceLabel}` : '',
			item.basis ? `依据说明=${item.basis}` : '',
			item.testStepSummary ? `结果步骤=${item.testStepSummary}` : '',
			item.clearStatusLabel ? `清空=${item.clearStatusLabel}` : '',
			item.summary,
		].filter(Boolean)
		return parts.join('；')
	}

	function normalizeActionName(action) {
		return String(action || '').replace(/\..*$/, '').trim()
	}

	function normalizeCompactText(value) {
		return String(value || '').replace(/\s+/g, '').trim()
	}

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	function buildGenericResultSummary(session) {
		const status = String(session?.status || '').trim()
		if (!status || status === 'idle') return null
		const history = Array.isArray(session?.history) ? session.history : []
		if (status === 'running' && !history.length) return null
		const failed = history.filter((item) => item?.success === false).length
		const completed = history.filter((item) => item?.success === true).length
		const verifiedAfterFailure = history.filter((item) => item?.success === true && item?.verifiedAfterFailure === true).length
		const recoveredFailures = status === 'completed' ? failed + verifiedAfterFailure : 0
		const sensitiveValues = collectGenericSensitiveValues(session, history)
		const terminalReason = maskSensitiveValuesInText(extractSessionTerminalReason(session), sensitiveValues)
		const contextRequestLimit = countGenericContextRequestLimit(history, terminalReason)
		const verificationRecoveryIncomplete = countGenericVerificationRecoveryIncomplete(history, terminalReason)
		const userInputRequired = countGenericUserInputRequired(history, terminalReason)
		const recoveredIssue = recoveredFailures
			? `任务最终完成，但过程中有 ${recoveredFailures} 个动作失败后被后续步骤恢复或复核确认；建议复查这些失败动作是否说明定位、页面异步或校验存在不稳定。`
			: ''
		const headline = [
			status === 'completed' && recoveredFailures ? '任务已完成但存在恢复记录' : status === 'completed' ? '任务已完成' : status === 'running' ? '任务执行中' : status === 'stopped' ? '任务已中止' : '任务未完成',
			`已执行 ${history.length} 个动作`,
			completed ? `成功 ${completed} 个` : '',
			failed ? `失败 ${failed} 个` : '',
			verifiedAfterFailure ? `失败后复核 ${verifiedAfterFailure} 个` : '',
			contextRequestLimit ? `上下文补证上限 ${contextRequestLimit} 个` : '',
			verificationRecoveryIncomplete ? `校验恢复未完成 ${verificationRecoveryIncomplete} 个` : '',
			userInputRequired ? `需要用户补充 ${userInputRequired} 个` : '',
		].filter(Boolean).join('，') + '。'
		const issue = status === 'completed' ? '' : terminalReason
		const issueLabel = status === 'stopped' ? '终止原因' : '最后问题'
		const issueStatus = status === 'stopped' ? 'stopped' : 'failed'
		const diagnostics = buildGenericDiagnostics(status, issue, { recoveredFailures, contextRequestLimit, verificationRecoveryIncomplete, userInputRequired })
		const actionIssues = buildGenericFailedActionIssues(history, { sensitiveValues })
		return {
			type: 'general',
			title: '任务结果总结',
			status: status === 'completed' ? (recoveredFailures || contextRequestLimit || verificationRecoveryIncomplete || userInputRequired ? 'inconclusive' : 'passed') : status === 'running' ? 'running' : status === 'stopped' ? 'stopped' : userInputRequired ? 'inconclusive' : 'failed',
			headline,
			stats: { total: history.length, completed, failed, verifiedAfterFailure, recoveredFailures, contextRequestLimit, verificationRecoveryIncomplete, userInputRequired, terminalFailed: issue && status === 'error' && !userInputRequired ? 1 : 0 },
			diagnostics,
			items: [],
			issues: [
				issue ? { label: issueLabel, status: issueStatus, statusLabel: status === 'stopped' ? '已中止' : '失败', summary: issue } : null,
				...actionIssues,
				recoveredIssue ? { label: '恢复记录', status: 'unknown', statusLabel: '需关注', summary: recoveredIssue } : null,
			].filter(Boolean),
			remaining: [],
			reason: issue || recoveredIssue,
			text: [
				headline,
				...diagnostics.map((item) => `诊断：${item.text}`),
				issue ? `${issueLabel}：${issue}` : '',
				...actionIssues.map(formatGenericFailedActionIssueLine),
				recoveredIssue ? `恢复记录：${recoveredIssue}` : '',
			].filter(Boolean).join('\n'),
			generatedAt: Date.now(),
		}
	}

	function buildGenericFailedActionIssues(history, options = {}) {
		const issues = []
		const seen = new Set()
		for (let index = (Array.isArray(history) ? history.length : 0) - 1; index >= 0; index -= 1) {
			const item = history[index]
			if (item?.success !== false) continue
			const action = normalizeActionName(item?.action)
			if (!action || action === 'done') continue
			const label = formatGenericFailedActionLabel(item, action, options)
			const summary = buildGenericFailedActionSummary(item, options)
			const key = `${action}\n${label}\n${summary}`
			if (seen.has(key)) continue
			seen.add(key)
			issues.push({
				label,
				status: 'failed',
				statusLabel: '失败动作',
				summary,
				neededEvidence: buildGenericFailedActionNeededEvidence(item),
			})
			if (issues.length >= 3) break
		}
		return issues
	}

	function formatGenericFailedActionLabel(item, action, options = {}) {
		const input = item?.input && typeof item.input === 'object' ? item.input : {}
		const actionLabel = getGenericActionDisplayName(action)
		const target = [
			input.target_label,
			input.label,
			input.target_description,
			input.description,
			Number.isFinite(Number(input.index)) ? `index=${Number(input.index)}` : '',
		].map((value) => maskSensitiveValuesInText(clampGenericSummaryText(value, 48), options.sensitiveValues)).find(Boolean)
		return target ? `${actionLabel}：${target}` : actionLabel
	}

	function getGenericActionDisplayName(action) {
		const labels = {
			click_element_by_index: '点击元素',
			click: '点击元素',
			input_text: '输入文本',
			type: '输入文本',
			open_dropdown: '展开候选',
			choose_dropdown_option: '选择候选',
			select_dropdown_option: '选择候选',
			select_checkbox_option: '选择选项',
			select_cascader_path: '选择级联路径',
			hover_element_by_index: '悬浮元素',
			scroll: '滚动页面',
			scroll_horizontally: '横向滚动',
			keypress: '键盘操作',
			wait: '等待',
			ask_user: '询问用户',
			open_new_tab: '打开标签页',
			switch_to_tab: '切换标签页',
			close_tab: '关闭标签页',
			locate_by_vision: '视觉定位',
		}
		return labels[action] || action || '页面动作'
	}

	function buildGenericFailedActionSummary(item, options = {}) {
		const outcome = getActionOutcome(item)
		for (const value of [
			item?.output,
			outcome.message,
			outcome.reason,
			item?.evaluationPreviousGoal,
		]) {
			const text = maskSensitiveValuesInText(clampGenericSummaryText(value, 240), options.sensitiveValues)
			if (text) return text
		}
		return '该动作返回失败，但没有提供更具体的失败文本。'
	}

	function buildGenericFailedActionNeededEvidence(item) {
		const text = [
			item?.output,
			item?.evaluationPreviousGoal,
			getActionOutcome(item).message,
			getActionOutcome(item).reason,
		].filter(Boolean).join(' ')
		if (/(遮挡|covered|occluded|命中|hit)/i.test(text)) return '需要重新观察目标区域，确认点击点是否可命中，以及是否存在浮层、遮罩或固定元素遮挡。'
		if (/(超时|timeout|timed\s*out|action_timeout)/i.test(text)) return '需要复核动作是否已在页面上生效；若未生效，再缩小目标范围或等待页面稳定后重试。'
		if (/(循环保护|loop_guard|loop\s*guard)/i.test(text)) return '需要停止重复同一动作，重新观察页面状态，换目标、换工具或补充上下文。'
		if (/(校验失败|动作校验失败|验证失败|verification|verify)/i.test(text)) return '需要查看动作前后的页面证据，确认目标值、页面反馈或 DOM 变化是否被正确识别。'
		if (/(候选|option|candidate|归属|owner|ownership)/i.test(text)) return '需要确认候选是否真实可见，并稳定归属到当前字段或弹层后再选择。'
		return '需要查看失败动作前后的页面观察、目标索引、命中状态和动作返回信息。'
	}

	function formatGenericFailedActionIssueLine(issue) {
		const parts = [
			`失败动作：${issue.label}`,
			issue.summary,
			issue.neededEvidence ? `需要补充=${issue.neededEvidence}` : '',
		].filter(Boolean)
		return parts.join('；')
	}

	function clampGenericSummaryText(value, maxLength) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		if (!text) return ''
		const limit = Math.max(12, Number(maxLength) || 120)
		return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
	}

	function collectGenericSensitiveValues(session, history) {
		const values = []
		const add = (value) => {
			const text = String(value || '').trim()
			if (text.length >= 4) values.push(text)
		}
		for (const item of (Array.isArray(history) ? history : [])) {
			const input = item?.input && typeof item.input === 'object' ? item.input : {}
			if (isSensitiveFieldAction(item) || hasGenericSensitiveInputKey(input)) {
				for (const value of [input.text, input.value, input.password, input.token, input.code]) add(value)
			}
			const combined = [
				item?.output,
				item?.evaluationPreviousGoal,
				getActionOutcome(item).message,
				getActionOutcome(item).reason,
				input.reason,
				input.question,
			].filter(Boolean).join(' ')
			for (const value of extractGenericSensitiveAssignments(combined)) add(value)
		}
		for (const value of extractGenericSensitiveAssignments([
			session?.activityText,
			session?.task,
			session?.latestTask,
		].filter(Boolean).join(' '))) add(value)
		return uniqueSensitiveValues(values)
	}

	function hasGenericSensitiveInputKey(input) {
		if (!input || typeof input !== 'object') return false
		return Object.keys(input).some((key) =>
			/(password|passcode|pwd|otp|captcha|verification|secret|token|api[_-]?key|验证码|校验码|动态码|安全码|密码|口令|密钥|令牌)/i.test(String(key || ''))
		)
	}

	function extractGenericSensitiveAssignments(text) {
		const out = []
		const source = String(text || '')
		const pattern = /(?:密码|口令|验证码|校验码|动态码|安全码|密钥|令牌|password|passcode|pwd|otp|captcha|verification(?:\s*code)?|secret|token|api[_-]?key)\s*(是|为|=|:|：)?\s*([^\s,，;；。"'<>`]+)/gi
		for (const match of source.matchAll(pattern)) {
			const hasSeparator = !!String(match[1] || '').trim()
			const value = String(match[2] || '').trim()
			if (value.length >= 4 && (hasSeparator || isLikelyGenericSecretToken(value))) out.push(value)
		}
		return out
	}

	function isLikelyGenericSecretToken(value) {
		const text = String(value || '').trim()
		if (text.length < 4) return false
		if (/[0-9]/.test(text)) return true
		if (/[^A-Za-z\u4e00-\u9fff]/.test(text)) return true
		if (/^[A-Za-z]{10,}$/.test(text)) return true
		return false
	}

	function countGenericVerificationRecoveryIncomplete(history, terminalReason) {
		const historyCount = countItems(history, (item) => hasVerificationRecoveryIncompleteDetail([
			item?.output,
			item?.evaluationPreviousGoal,
			getActionOutcome(item).reason,
			getActionOutcome(item).message,
		].filter(Boolean).join(' ')))
		return Math.max(historyCount, hasVerificationRecoveryIncompleteDetail(terminalReason) ? 1 : 0)
	}

	function countGenericContextRequestLimit(history, terminalReason) {
		const historyCount = countItems(history, (item) => {
			const input = item?.input && typeof item.input === 'object' ? item.input : {}
			if (input.planning_context_limit === true) return true
			return isContextRequestLimitReason([
				item?.output,
				item?.evaluationPreviousGoal,
				getActionOutcome(item).reason,
				getActionOutcome(item).message,
				input.text,
				input.reason,
				input.planning_context_diagnostic,
				input.workflow_planning_context_diagnostic,
			].filter(Boolean).join(' '))
		})
		return Math.max(historyCount, isContextRequestLimitReason(terminalReason) ? 1 : 0)
	}

	function countGenericUserInputRequired(history, terminalReason) {
		const historyCount = countItems(history, (item) => {
			const input = item?.input && typeof item.input === 'object' ? item.input : {}
			const text = [
				item?.output,
				item?.evaluationPreviousGoal,
				getActionOutcome(item).reason,
				getActionOutcome(item).message,
				input.question,
				input.reason,
				input.purpose,
			].filter(Boolean).join(' ')
			const action = normalizeActionName(item?.action)
			return action === 'ask_user'
				? item?.success === false || isUserInputRequiredReason(text)
				: item?.success === false && isUserInputRequiredReason(text)
		})
		return Math.max(historyCount, isUserInputRequiredReason(terminalReason) ? 1 : 0)
	}

	function isUserInputRequiredReason(reason) {
		return /(ask_user|等待用户回答|用户未提供回答|询问用户失败|用户介入|需要你确认|需要用户|用户确认|验证码|校验码|动态码|短信码|缺少.*(?:账号|手机号|验证码|校验码|动态码|确认|信息)|无法判断.*(?:用户|选项|意图)|确认新值|提供.*新值)/i.test(String(reason || ''))
	}

	function enrichResultSummaryWithOperationalDiagnostics(summary, session) {
		if (!summary || typeof summary !== 'object') return summary
		const signals = collectOperationalResultSignals(session)
		if (!hasOperationalResultSignals(signals)) return summary
		const out = { ...summary }
		out.stats = mergeOperationalStats(summary.stats, signals)
		out.headline = appendOperationalSignalsToHeadline(summary.headline, signals)
		const additions = buildOperationalResultDiagnostics(signals)
		out.diagnostics = mergeResultDiagnostics(summary.diagnostics, additions)
		out.text = appendOperationalDiagnosticsToSummaryText(summary.text, additions)
		return out
	}

	function collectOperationalResultSignals(session) {
		const traceItems = Array.isArray(session?.traceItems) ? session.traceItems : []
		const history = Array.isArray(session?.history) ? session.history : []
		const terminalReason = extractSessionTerminalReason(session)
		const plannerCorrectionCounts = {}
		const validationFeedbackCounts = {}
		for (const item of traceItems) {
			const stage = String(item?.progress?.stage || '').trim()
			if (stage === 'invalid_model_output' || stage === 'invalid_action_name') {
				plannerCorrectionCounts[stage] = (plannerCorrectionCounts[stage] || 0) + 1
			}
			if (stage === 'validation_feedback') {
				const kind = String(item?.progress?.validationKind || 'validation_feedback').trim() || 'validation_feedback'
				validationFeedbackCounts[kind] = (validationFeedbackCounts[kind] || 0) + 1
			}
		}
		const traceTimeouts = countItems(traceItems, (item) => isOperationalTimeoutText(buildOperationalTraceText(item)))
		const historyTimeouts = countItems(history, (item) => isOperationalTimeoutText(buildOperationalHistoryText(item)))
		const traceLoopGuards = countItems(traceItems, (item) => isOperationalLoopGuardText(buildOperationalTraceText(item)))
		const historyLoopGuards = countItems(history, (item) => isOperationalLoopGuardText(buildOperationalHistoryText(item)))
		const traceVerificationFailures = countItems(traceItems, (item) => isOperationalVerificationFailureText(buildOperationalTraceText(item)))
		const historyVerificationFailures = countItems(history, (item) => isOperationalVerificationFailureText(buildOperationalHistoryText(item)))
		const candidateAssociation = collectOperationalCandidateAssociationSignals(traceItems, history, terminalReason)
		return {
			modelErrors: countItems(traceItems, isOperationalModelErrorTrace),
			timeouts: Math.max(traceTimeouts, historyTimeouts, isOperationalTimeoutText(terminalReason) ? 1 : 0),
			plannerCorrections: countMapValues(plannerCorrectionCounts),
			plannerCorrectionCounts,
			validationFeedback: countMapValues(validationFeedbackCounts),
			validationFeedbackCounts,
			lastValidationGuidance: findLastTraceValue(traceItems, (item) => item?.progress?.stage === 'validation_feedback', (item) => item?.progress?.validationGuidance),
			loopGuards: Math.max(traceLoopGuards, historyLoopGuards, isOperationalLoopGuardText(terminalReason) ? 1 : 0),
			lastLoopGuardGuidance: findLastTraceValue(traceItems, (item) => isOperationalLoopGuardText(buildOperationalTraceText(item)), (item) => item?.action?.loopGuardGuidance),
			verificationFailures: Math.max(traceVerificationFailures, historyVerificationFailures),
			candidateAssociationAmbiguous: candidateAssociation.ambiguous,
			candidateAssociationUnowned: candidateAssociation.unowned,
		}
	}

	function hasOperationalResultSignals(signals) {
		return !!(
			Number(signals?.modelErrors || 0) ||
			Number(signals?.timeouts || 0) ||
			Number(signals?.plannerCorrections || 0) ||
			Number(signals?.validationFeedback || 0) ||
			Number(signals?.loopGuards || 0) ||
			Number(signals?.verificationFailures || 0) ||
			countCandidateAssociationIssues(signals)
		)
	}

	function mergeOperationalStats(stats, signals) {
		const out = { ...(stats && typeof stats === 'object' ? stats : {}) }
		mergeMaxStat(out, 'modelErrors', signals.modelErrors)
		mergeMaxStat(out, 'timeouts', signals.timeouts)
		mergeMaxStat(out, 'plannerCorrections', signals.plannerCorrections)
		mergeMaxStat(out, 'loopGuards', signals.loopGuards)
		mergeMaxStat(out, 'verificationFailures', signals.verificationFailures)
		mergeMaxStat(out, 'candidateAssociationAmbiguous', signals.candidateAssociationAmbiguous)
		mergeMaxStat(out, 'candidateAssociationUnowned', signals.candidateAssociationUnowned)
		return out
	}

	function mergeMaxStat(stats, key, value) {
		const next = Number(value || 0)
		if (!next) return
		stats[key] = Math.max(Number(stats[key] || 0), next)
	}

	function appendOperationalSignalsToHeadline(headline, signals) {
		const base = String(headline || '').trim()
		if (/运行诊断/.test(base)) return base
		const fragments = buildOperationalHeadlineFragments(signals)
		if (!fragments.length) return base
		const suffix = `运行诊断：${fragments.join('，')}。`
		return base ? `${base} ${suffix}` : suffix
	}

	function buildOperationalHeadlineFragments(signals) {
		return [
			formatOperationalHeadlineCount('模型错误', signals?.modelErrors),
			formatOperationalHeadlineCount('超时', signals?.timeouts),
			formatOperationalHeadlineCount('规划纠偏', signals?.plannerCorrections),
			formatOperationalHeadlineCount('执行前校验', signals?.validationFeedback),
			formatOperationalHeadlineCount('循环保护', signals?.loopGuards),
			formatOperationalHeadlineCount('校验失败', signals?.verificationFailures),
			formatOperationalHeadlineCount('候选归属待确认', countCandidateAssociationIssues(signals)),
		].filter(Boolean)
	}

	function formatOperationalHeadlineCount(label, value) {
		const count = Number(value || 0)
		return count ? `${label} ${count} 次` : ''
	}

	function buildOperationalResultDiagnostics(signals) {
		const diagnostics = []
		const recommendations = []
		if (Number(signals.modelErrors || 0)) {
			diagnostics.push({
				kind: 'model_error',
				severity: 'error',
				count: Number(signals.modelErrors || 0),
				text: `模型调用异常：${Number(signals.modelErrors || 0)} 次；页面动作可能尚未执行或执行前规划不完整。`,
			})
			recommendations.push('建议：先查看最近模型错误、模型配置和请求上下文；不要把模型未返回动作误判为页面操作失败。')
		}
		if (Number(signals.timeouts || 0)) {
			diagnostics.push({
				kind: 'timeout',
				severity: 'warning',
				count: Number(signals.timeouts || 0),
				text: `等待或请求超时：${Number(signals.timeouts || 0)} 次；需要区分模型等待、页面动作等待和动作后复核等待。`,
			})
			recommendations.push('建议：查看超时发生阶段；模型超时应减少上下文或换用紧凑观察，页面动作超时应先复核页面是否已生效。')
		}
		if (Number(signals.plannerCorrections || 0)) {
			const summary = formatOperationalCountMap(signals.plannerCorrectionCounts, {
				invalid_model_output: '模型输出格式',
				invalid_action_name: '工具名',
			})
			diagnostics.push({
				kind: 'planner_correction',
				severity: 'warning',
				count: Number(signals.plannerCorrections || 0),
				text: `规划输出纠偏：${summary || `${Number(signals.plannerCorrections || 0)} 次`}；这些纠偏发生在执行页面动作前。`,
			})
			recommendations.push('建议：查看最近模型输出、可用工具列表和工具 schema；如果频繁纠偏，应拆小任务或检查模型配置。')
		}
		if (Number(signals.validationFeedback || 0)) {
			const summary = formatOperationalCountMap(signals.validationFeedbackCounts, {})
			diagnostics.push({
				kind: 'validation_feedback',
				severity: 'warning',
				count: Number(signals.validationFeedback || 0),
				text: `执行前校验拦截：${summary || `${Number(signals.validationFeedback || 0)} 次`}。`,
			})
			const guidance = String(signals.lastValidationGuidance || '').trim()
			if (guidance) recommendations.push(`建议：${guidance}`)
		}
		if (Number(signals.loopGuards || 0)) {
			diagnostics.push({
				kind: 'loop_guard',
				severity: 'warning',
				count: Number(signals.loopGuards || 0),
				text: `循环保护触发：${Number(signals.loopGuards || 0)} 次；说明同类无进展动作、等待或失败恢复正在重复。`,
			})
			const guidance = String(signals.lastLoopGuardGuidance || '').trim()
			recommendations.push(guidance ? `建议：${guidance}` : '建议：停止重复同一动作，先重新观察页面，换目标、换工具或补充上下文。')
		}
		if (Number(signals.verificationFailures || 0)) {
			diagnostics.push({
				kind: 'verification_failure',
				severity: 'warning',
				count: Number(signals.verificationFailures || 0),
				text: `动作校验失败：${Number(signals.verificationFailures || 0)} 次；页面没有出现预期变化或变化证据不足。`,
			})
			recommendations.push('建议：对校验失败动作先看命中目标、遮挡状态、页面反馈和候选归属，再决定是否重试。')
		}
		const candidateAssociationIssues = countCandidateAssociationIssues(signals)
		if (candidateAssociationIssues) {
			const ambiguous = Number(signals.candidateAssociationAmbiguous || 0)
			const unowned = Number(signals.candidateAssociationUnowned || 0)
			diagnostics.push({
				kind: 'candidate_association',
				severity: 'warning',
				count: candidateAssociationIssues,
				text: `候选归属待确认：${[
					ambiguous ? `归属模糊 ${ambiguous} 项` : '',
					unowned ? `未归属 ${unowned} 项` : '',
				].filter(Boolean).join('，')}；说明当前可见候选还不能稳定绑定到目标字段。`,
			})
			recommendations.push('建议：先用 request_options_for/open_dropdown/inspect_region 复核当前活动字段与弹层候选归属，不要直接选择归属模糊或未归属候选。')
		}
		appendNextStepRecommendations(diagnostics, recommendations)
		return diagnostics
	}

	function mergeResultDiagnostics(current, additions) {
		const out = Array.isArray(current) ? [...current] : []
		const seen = new Set(out.map((item) => `${String(item?.kind || '')}\n${String(item?.text || '')}`))
		for (const item of (Array.isArray(additions) ? additions : [])) {
			const key = `${String(item?.kind || '')}\n${String(item?.text || '')}`
			if (seen.has(key)) continue
			seen.add(key)
			out.push(item)
		}
		return out
	}

	function appendOperationalDiagnosticsToSummaryText(text, additions) {
		const lines = String(text || '')
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
		const seen = new Set(lines)
		for (const item of (Array.isArray(additions) ? additions : [])) {
			const detail = String(item?.text || '').trim()
			if (!detail) continue
			const line = `诊断：${detail}`
			if (seen.has(line)) continue
			seen.add(line)
			lines.push(line)
		}
		return lines.join('\n')
	}

	function isOperationalModelErrorTrace(item) {
		if (!item || item.kind !== 'error') return false
		if (item.io) return true
		return /模型调用|model/i.test(String(item.title || ''))
	}

	function buildOperationalTraceText(item) {
		const input = item?.action?.input && typeof item.action.input === 'object' ? item.action.input : {}
		return [
			item?.title,
			item?.detail,
			item?.kind,
			item?.progress?.stage,
			item?.progress?.validationKind,
			item?.progress?.validationGuidance,
			item?.action?.name,
			item?.action?.output,
			item?.action?.loopGuardKind,
			item?.action?.loopGuardGuidance,
			input.text,
			input.reason,
			input.workflow_result_summary,
		].filter(Boolean).join(' ')
	}

	function buildOperationalHistoryText(item) {
		const input = item?.input && typeof item.input === 'object' ? item.input : {}
		const outcome = getActionOutcome(item)
		return [
			item?.action,
			item?.output,
			item?.evaluationPreviousGoal,
			outcome.reason,
			outcome.message,
			input.text,
			input.reason,
			input.workflow_result_summary,
		].filter(Boolean).join(' ')
	}

	function isOperationalTimeoutText(text) {
		return /(超时|timeout|timed\s*out|action_timeout|timeout_recovery|timeout_no_recovery)/i.test(String(text || ''))
	}

	function isOperationalLoopGuardText(text) {
		return /(循环保护|loop_guard|loop\s*guard)/i.test(String(text || ''))
	}

	function isOperationalVerificationFailureText(text) {
		return /(校验失败|动作校验失败|验证失败|verify(?:_|\\s|-)?failed|verification(?:_|\\s|-)?failed)/i.test(String(text || ''))
	}

	function collectOperationalCandidateAssociationSignals(traceItems, history, terminalReason) {
		const counts = { ambiguous: 0, unowned: 0 }
		for (const item of (Array.isArray(traceItems) ? traceItems : [])) {
			mergeStructuredCandidateAssociationCounts(counts, item?.progress)
			mergeCandidateAssociationCounts(counts, buildOperationalTraceText(item))
		}
		for (const item of (Array.isArray(history) ? history : [])) {
			mergeCandidateAssociationCounts(counts, buildOperationalHistoryText(item))
		}
		mergeCandidateAssociationCounts(counts, terminalReason)
		return counts
	}

	function mergeStructuredCandidateAssociationCounts(target, progress) {
		if (!progress || typeof progress !== 'object') return target
		const ambiguous = Number(progress.candidateAssociationAmbiguous || 0)
		const unowned = Number(progress.candidateAssociationUnowned || 0)
		if (Number.isFinite(ambiguous) && ambiguous > target.ambiguous) target.ambiguous = ambiguous
		if (Number.isFinite(unowned) && unowned > target.unowned) target.unowned = unowned
		return target
	}

	function mergeCandidateAssociationCounts(target, text) {
		const counts = extractCandidateAssociationCounts(text)
		target.ambiguous = Math.max(Number(target.ambiguous || 0), counts.ambiguous)
		target.unowned = Math.max(Number(target.unowned || 0), counts.unowned)
		return target
	}

	function extractCandidateAssociationCounts(text) {
		return {
			ambiguous: extractMaxCountFromText(text, /候选归属模糊\s*(\d+)/g),
			unowned: extractMaxCountFromText(text, /候选未归属\s*(\d+)/g),
		}
	}

	function extractMaxCountFromText(text, pattern) {
		const source = String(text || '')
		let max = 0
		for (const match of source.matchAll(pattern)) {
			const value = Number(match?.[1] || 0)
			if (Number.isFinite(value) && value > max) max = value
		}
		return max
	}

	function countCandidateAssociationIssues(signals) {
		return Number(signals?.candidateAssociationAmbiguous || 0) + Number(signals?.candidateAssociationUnowned || 0)
	}

	function findLastTraceValue(items, predicate, reader) {
		for (let i = (Array.isArray(items) ? items.length : 0) - 1; i >= 0; i -= 1) {
			const item = items[i]
			if (!predicate(item)) continue
			const value = String(reader(item) || '').trim()
			if (value) return value
		}
		return ''
	}

	function formatOperationalCountMap(counts, labels = {}) {
		const parts = []
		for (const [key, value] of Object.entries(counts && typeof counts === 'object' ? counts : {})) {
			const count = Number(value || 0)
			if (!count) continue
			parts.push(`${labels[key] || key} ${count}`)
		}
		return parts.join('，')
	}

	function countMapValues(counts) {
		return Object.values(counts && typeof counts === 'object' ? counts : {})
			.reduce((sum, value) => sum + (Number(value) || 0), 0)
	}

	function buildGenericDiagnostics(status, issue, counts = {}) {
		const text = String(issue || '').trim()
		const recoveredFailures = Number(counts?.recoveredFailures || 0)
		const contextRequestLimit = Math.max(
			Number(counts?.contextRequestLimit || 0),
			isContextRequestLimitReason(text) ? 1 : 0
		)
		const verificationRecoveryIncomplete = Math.max(
			Number(counts?.verificationRecoveryIncomplete || 0),
			hasVerificationRecoveryIncompleteDetail(text) ? 1 : 0
		)
		const userInputRequired = Math.max(
			Number(counts?.userInputRequired || 0),
			isUserInputRequiredReason(text) ? 1 : 0
		)
		const diagnostics = []
		const recommendations = []
		if (recoveredFailures > 0) {
			diagnostics.push({
				kind: 'recovered_action_failure',
				severity: 'warning',
				count: recoveredFailures,
				text: `失败后成功：${recoveredFailures} 个动作曾失败或超时，但任务最终完成；建议复查元素定位、页面异步稳定性或动作校验反馈。`,
			})
			recommendations.push('建议：查看失败动作前后的页面观察和结构化结果，确认恢复不是偶然通过。')
		}
		if (verificationRecoveryIncomplete) {
			diagnostics.push({
				kind: 'verification_recovery_incomplete',
				severity: 'warning',
				count: verificationRecoveryIncomplete,
				text: `校验恢复未完成：${verificationRecoveryIncomplete} 条失败记录包含恢复处理原因，说明 Agent 已判断不能安全视觉恢复、恢复失败，或需要重新观察后再规划。`,
			})
			recommendations.push('建议：不要重复同一失败动作；先重新观察页面状态，确认目标是否被遮挡、候选是否归属当前字段，再换定位或补上下文。')
		}
		if (contextRequestLimit) {
			diagnostics.push({
				kind: 'context_request_limit',
				severity: 'warning',
				count: contextRequestLimit,
				text: `上下文补证达到上限：${contextRequestLimit} 条失败记录显示模型连续请求内部上下文仍未形成可执行证据。`,
			})
			recommendations.push('建议：先查看最后的补充上下文，确认是缺少页面证据、候选归属不稳定，还是目标字段定位不稳定，再重新规划。')
		}
		if (userInputRequired) {
			diagnostics.push({
				kind: 'user_input_required',
				severity: 'warning',
				count: userInputRequired,
				text: `需要用户补充信息：${userInputRequired} 条记录显示 Agent 已请求用户确认、验证码、缺失账号信息或冲突字段新值；在补足信息前不应继续猜测页面动作。`,
			})
			recommendations.push('建议：先补充 Agent 请求的验证码、账号、确认信息或替代字段值，再从等待用户回答前的步骤继续。')
		}
		if (!text) {
			appendNextStepRecommendations(diagnostics, recommendations)
			return diagnostics
		}
		if (status === 'stopped') {
			diagnostics.push({
				kind: 'task_stopped',
				severity: 'warning',
				count: 1,
				text: `任务已中止：${text}`,
			})
			recommendations.push('建议：如需继续，请从中止前最后一个可验证步骤恢复，并确认页面仍处于同一状态。')
			appendNextStepRecommendations(diagnostics, recommendations)
			return diagnostics
		}
		if (status === 'running') {
			diagnostics.push({
				kind: 'recent_action_failure',
				severity: 'warning',
				count: 1,
				text: `最近动作失败：${text}`,
			})
			recommendations.push('建议：下一轮应基于失败原因换用更具体的字段、候选或上下文请求，避免重复同一动作。')
			appendNextStepRecommendations(diagnostics, recommendations)
			return diagnostics
		}
		if (userInputRequired) {
			appendNextStepRecommendations(diagnostics, recommendations)
			return diagnostics
		}
		diagnostics.push({
			kind: 'task_terminal_failure',
			severity: 'error',
			count: 1,
			text: `任务终止：${text}`,
		})
		if (!contextRequestLimit && !verificationRecoveryIncomplete && !userInputRequired) {
			recommendations.push('建议：优先查看最后失败动作和页面观察证据，再决定是补充上下文、重试定位还是调整任务目标。')
		}
		appendNextStepRecommendations(diagnostics, recommendations)
		return diagnostics
	}

	function appendNextStepRecommendations(diagnostics, recommendations) {
		if (!Array.isArray(diagnostics) || !Array.isArray(recommendations)) return
		const seen = new Set(diagnostics.map((item) => String(item?.text || '').trim()).filter(Boolean))
		for (const text of recommendations) {
			const normalized = String(text || '').trim()
			if (!normalized || seen.has(normalized)) continue
			seen.add(normalized)
			diagnostics.push({
				kind: 'next_step_recommendation',
				severity: 'info',
				count: 1,
				text: normalized,
			})
		}
	}

	g.NC_BG_RESULT_SUMMARY = {
		buildResultSummary,
		buildSearchResultSummary,
		buildFormTaskResultSummary,
		buildNavigationResultSummary,
		buildLoginResultSummary,
	}
})(globalThis)
