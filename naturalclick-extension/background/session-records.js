;(function (g) {
	const PLAN_FRAGMENT_MAX_CHARS = 140

	function buildReflection(decision) {
		return {
			evaluation_previous_goal: String(decision?.evaluation_previous_goal || '').trim(),
			memory: String(decision?.memory || '').trim(),
			thought: String(decision?.thought || '').trim(),
			next_goal: String(decision?.next_goal || '').trim(),
		}
	}

	function recordVerificationSuccess(session, decision, verify) {
		const reason = String(verify?.reason || '').trim()
		if (!reason) return
		const last = session.history[session.history.length - 1]
		const verifiedOutcome = createVerificationSuccessOutcome(reason, verify?.outcome || verify?.meta?.outcome || last?.outcome)
		if (
			last &&
			last.stepIndex === session.step &&
			last.action === decision?.action?.name &&
			last.success === true
		) {
			last.verified = true
			last.verifyReason = reason
			if (verifiedOutcome) {
				last.outcome = verifiedOutcome
				last.output = replaceOutcomeSummary(last.output, verifiedOutcome)
			}
			last.output = appendVerificationSummary(last.output, reason)
		}
		const trace = Array.isArray(session.traceItems)
			? session.traceItems
					.slice()
					.reverse()
					.find((item) =>
						item &&
						item.action?.name === decision?.action?.name &&
						item.kind === 'step'
					)
			: null
		if (
			trace &&
			trace.action?.name === decision?.action?.name &&
			trace.kind === 'step'
		) {
			if (verifiedOutcome) {
				trace.detail = replaceOutcomeSummary(trace.detail, verifiedOutcome)
				if (trace.action) trace.action.output = replaceOutcomeSummary(trace.action.output, verifiedOutcome)
			}
			trace.detail = appendVerificationSummary(trace.detail, reason)
			if (trace.action) trace.action.output = appendVerificationSummary(trace.action.output, reason)
		}
	}

	function createVerificationSuccessOutcome(reason, existingOutcome) {
		const existing = normalizeOutcomeObject(existingOutcome)
		if (existing?.kind && isProgressOutcomeKind(existing.kind)) {
			return existing
		}
		const normalizedReason = String(reason || '')
		let kind = 'dom_changed'
		if (/输入值与预期匹配/i.test(normalizedReason)) kind = 'input_verified'
		else if (/URL\s*已变化|URL已变化/i.test(normalizedReason)) kind = 'navigated'
		else if (/scrollY|滚动/i.test(normalizedReason)) kind = 'scrolled'
		else if (/下拉框已展开|候选项/i.test(normalizedReason)) kind = 'options_visible'
		else if (/搜索重置后字段已清空/i.test(normalizedReason)) kind = 'value_changed'
		else if (/执行返回状态已变化|搜索提交动作已触发|搜索重置动作已触发/i.test(normalizedReason)) kind = 'state_changed'
		return createActionOutcome(kind, {
			progress: true,
			reason: summarizeFailureReason(reason || '动作校验通过', 100),
			...(Array.isArray(existing?.visibleOptions) && existing.visibleOptions.length
				? { visibleOptions: existing.visibleOptions }
				: {}),
		})
	}

	function isProgressOutcomeKind(kind) {
		if (g.NC_ACTION_CONTRACT?.isProgressOutcome) return g.NC_ACTION_CONTRACT.isProgressOutcome(kind)
		return ['value_changed', 'state_changed', 'options_visible', 'navigated', 'dom_changed', 'scrolled', 'input_verified'].includes(String(kind || '').trim().toLowerCase())
	}

	function appendVerificationSummary(output, reason) {
		const base = String(output || '').trim()
		const suffix = `校验通过: ${reason}`
		if (!base) return suffix
		if (base.includes(suffix)) return base
		return `${base} | ${suffix}`
	}

	function appendVerificationFailureOutcome(output, reason) {
		const base = String(output || '').trim()
		const outcome = [
			'动作结果: no_effect',
			'progress=false',
			`reason=${formatOutcomeValue(reason || '动作校验失败', 100)}`,
		].join(' ')
		if (!base) return outcome
		if (base.includes(outcome)) return base
		return `${base} | ${outcome}`
	}

	function appendExecutionOutcomeSummary(output, execution) {
		const base = String(output || '').trim()
		const summary = summarizeExecutionOutcome(execution)
		if (!summary) return base
		if (base.includes(summary)) return base
		return base ? `${base} | ${summary}` : summary
	}

	function appendOutcomeSummary(output, outcome) {
		const base = String(output || '').trim()
		const summary = summarizeActionOutcome(outcome)
		if (!summary) return base
		if (base.includes(summary)) return base
		return base ? `${base} | ${summary}` : summary
	}

	function summarizeExecutionOutcome(execution) {
		const outcome = getExecutionOutcome(execution)
		return summarizeActionOutcome(outcome)
	}

	function summarizeActionOutcome(outcome) {
		if (!outcome?.kind) {
			return ''
		}
		const contractSummary = g.NC_ACTION_CONTRACT?.summarizeOutcome?.(outcome, {
			reasonMax: 80,
			requestedMax: 48,
			candidatesMax: 120,
			visibleLimit: 8,
		})
		if (contractSummary) return contractSummary
		const parts = [`动作结果: ${outcome.kind}`]
		if (typeof outcome.progress === 'boolean') parts.push(`progress=${outcome.progress ? 'true' : 'false'}`)
		if (outcome.reason) parts.push(`reason=${formatOutcomeValue(outcome.reason, 80)}`)
		if (outcome.requestedText) parts.push(`requested=${formatOutcomeValue(outcome.requestedText, 48)}`)
		if (Array.isArray(outcome.visibleOptions) && outcome.visibleOptions.length) {
			parts.push(`candidates=${formatOutcomeValue(outcome.visibleOptions.slice(0, 8).join('|'), 120)}`)
		}
		if (Number.isFinite(Number(outcome.moved))) parts.push(`moved=${Number(outcome.moved)}`)
		return parts.join(' ')
	}

	function replaceOutcomeSummary(output, outcome) {
		const summary = summarizeActionOutcome(outcome)
		const base = String(output || '').trim()
		if (!summary) return base
		const parts = base
			.split('|')
			.map((part) => part.trim())
			.filter((part) => part && !/^动作结果:/i.test(part))
		if (parts.includes(summary)) return parts.join(' | ')
		return parts.length ? `${parts.join(' | ')} | ${summary}` : summary
	}

	function getExecutionOutcome(execution) {
		const fromContract = g.NC_ACTION_CONTRACT?.getOutcome?.(execution)
		if (fromContract?.kind) return normalizeOutcomeObject(fromContract)
		if (execution?.success === false) {
			return createActionOutcome('failed', {
				progress: false,
				reason: summarizeFailureReason(execution?.message || '执行失败', 80),
			})
		}
		return null
	}

	function createVerificationFailureOutcome(reason) {
		return createActionOutcome('no_effect', {
			progress: false,
			reason: summarizeFailureReason(reason || '动作校验失败', 100),
		})
	}

	function createActionOutcome(kind, extras = {}) {
		const created = g.NC_ACTION_CONTRACT?.createOutcome?.(kind, extras)
		return normalizeOutcomeObject(created || { kind, ...extras })
	}

	function normalizeOutcomeObject(outcome) {
		if (!outcome || typeof outcome !== 'object') return null
		const normalized = {
			kind: String(outcome.kind || '').trim().toLowerCase(),
		}
		if (!normalized.kind) return null
		if (typeof outcome.progress === 'boolean') normalized.progress = outcome.progress
		if (outcome.reason) normalized.reason = String(outcome.reason)
		if (outcome.requestedText) normalized.requestedText = String(outcome.requestedText)
		if (Array.isArray(outcome.visibleOptions)) {
			normalized.visibleOptions = outcome.visibleOptions.map((item) => String(item)).filter(Boolean)
		}
		if (Number.isFinite(Number(outcome.moved))) normalized.moved = Number(outcome.moved)
		return normalized
	}

	function formatOutcomeValue(value, maxLen) {
		const text = summarizeFailureReason(value, maxLen).replace(/["\\]/g, '\\$&')
		return `"${text}"`
	}

	function derivePlanItems(session) {
		const historyItems = (Array.isArray(session?.history) ? session.history : []).map((item, idx, history) => {
			const isLast = idx === history.length - 1
			const title = item.nextGoal || `执行 ${item.action}`
			let status = 'done'
			if (isLast && session.status === 'running') status = 'running'
			if (isLast && !item.success) status = 'failed'
			return {
				id: `p_${item.stepIndex}`,
				title,
				status,
			}
		})
		const workflowItem = buildSearchWorkflowPlanItem(session)
		const planningItem = buildCurrentPlanningProgressPlanItem(session)
		const runtimeItem = buildCurrentRuntimeProgressPlanItem(session)
		if (runtimeItem || planningItem || workflowItem) {
			return [runtimeItem, planningItem, workflowItem, ...historyItems].filter(Boolean)
		}
		if (!historyItems.length) {
			return [{ id: 'boot', title: '解析任务与页面状态', status: 'running' }]
		}
		return historyItems
	}

	function buildCurrentPlanningProgressPlanItem(session) {
		if (String(session?.status || '') !== 'running') return null
		const progress = session?.currentPlanningProgress
		if (!progress || typeof progress !== 'object') return null
		const text = cleanPlanFragment(progress.text || '')
		if (!text) return null
		const stage = String(progress.stage || '').trim()
		const round = Number(progress.round) || 0
		const prefix = formatPlanningProgressStage(stage)
		const hint = formatPlanningProgressHint(stage)
		const roundText = round > 0 ? `，第 ${round} 轮` : ''
		return {
			id: 'current_planning_progress',
			title: `${prefix}${hint ? `（${hint}）` : ''}${roundText}：${text}`,
			status: 'running',
		}
	}

	function buildCurrentRuntimeProgressPlanItem(session) {
		if (String(session?.status || '') !== 'running') return null
		const progress = session?.currentRuntimeProgress
		if (!progress || typeof progress !== 'object') return null
		const text = cleanPlanFragment(progress.text || '')
		if (!text) return null
		const stage = String(progress.stage || '').trim()
		return {
			id: 'current_runtime_progress',
			title: `${formatRuntimeProgressStage(stage)}：${text}`,
			status: 'running',
		}
	}

	function formatRuntimeProgressStage(stage) {
		const labels = {
			observation_heartbeat: '页面观察进度',
			action_execution_heartbeat: '动作执行进度',
			execution_recovery: '执行恢复进度',
			verification_heartbeat: '动作复核进度',
			verification_recovery: '校验恢复进度',
		}
		return labels[String(stage || '').trim()] || '运行进度'
	}

	function formatPlanningProgressStage(stage) {
		const labels = {
			observation_summary: '页面观察摘要',
			task_intent_request: '理解任务',
			task_intent_heuristic: '本地任务理解',
			workflow_analysis: '工作流分析',
			workflow_decision: '工作流决策',
			model_request: '请求模型规划',
			model_compact_request: '压缩上下文后请求模型',
			model_context_round: '补充上下文',
			model_wait_heartbeat: '等待模型响应',
			model_stream_delta: '读取模型流式输出',
			compact_retry: '压缩上下文重试',
			planning_context_request: '请求页面上下文',
			planning_context: '补充页面上下文',
			validation_feedback: '执行前校验',
			timeout_recovery: '超时恢复分析',
			timeout_no_recovery: '超时停止分析',
		}
		return labels[String(stage || '').trim()] || '规划进度'
	}

	function formatPlanningProgressHint(stage) {
		const key = String(stage || '').trim()
		if ([
			'task_intent_request',
			'model_request',
			'model_compact_request',
			'model_context_round',
			'model_wait_heartbeat',
			'model_stream_delta',
			'compact_retry',
			'timeout_recovery',
			'timeout_no_recovery',
		].includes(key)) {
			return '尚未操作页面'
		}
		if (key === 'planning_context_request' || key === 'planning_context') return '只补证据'
		if (key === 'validation_feedback') return '已拦截待改选'
		if (key === 'workflow_analysis') return '核对页面证据'
		if (key === 'workflow_decision') return '准备执行或结束'
		return ''
	}

	function buildSearchWorkflowPlanItem(session) {
		const state = session?.workflowState?.search
		if (!state || typeof state !== 'object') return null
		const phase = String(state.phase || '').trim()
		const fieldOrder = Array.isArray(state.fieldOrder) ? state.fieldOrder : []
		if (!fieldOrder.length && !phase) return null
		const completed = countSearchWorkflowCoveredFields(state)
		const total = fieldOrder.length
		const terminalFailed = phase === 'completed' && state.terminalSuccess === false
		const status = phase === 'completed'
			? (terminalFailed ? 'failed' : 'done')
			: (phase === 'failed' || session?.status === 'error' ? 'failed' : 'running')
		const activeKey = String(state.activeFieldKey || state.lastSearchedFieldKey || '').trim()
		const active = activeKey && state.fields && typeof state.fields === 'object' ? state.fields[activeKey] : null
		const nextKey = fieldOrder.find((key) => !isSearchWorkflowFieldCovered(state, key))
		const next = nextKey && state.fields && typeof state.fields === 'object' ? state.fields[nextKey] : null
		const label = cleanPlanFragment(active?.label || next?.label || '')
		const totalText = total > 0 ? `${Math.min(completed, total)}/${total}` : `${completed}`
		const phaseText = terminalFailed
			? '已停止'
			: formatSearchWorkflowPlanPhase(phase)
		const reason = status === 'failed'
			? cleanPlanFragment(state.terminalReason || state.failedReason || '')
			: ''
		const auditFieldKey = (active ? activeKey : nextKey) || getLastSearchWorkflowAuditKey(state)
		const auditField = active || next || (auditFieldKey && state.fields && typeof state.fields === 'object'
			? state.fields[auditFieldKey]
			: null)
		const audit = buildSearchWorkflowPlanAudit(
			state,
			auditField ? { ...auditField, key: auditFieldKey || auditField?.key || '' } : null,
			phase
		)
		const detail = [
			`进度 ${totalText}`,
			label ? `当前：${label}` : '',
			phaseText,
			audit,
			reason ? `原因：${reason}` : '',
		].filter(Boolean).join('，')
		return {
			id: 'search_workflow_progress',
			title: `搜索项测试${detail ? `（${detail}）` : ''}`,
			status,
		}
	}

	function countSearchWorkflowCoveredFields(state) {
		const seen = new Set()
		for (const key of (Array.isArray(state?.completedKeys) ? state.completedKeys : [])) {
			if (key) seen.add(key)
		}
		for (const key of (Array.isArray(state?.skippedKeys) ? state.skippedKeys : [])) {
			if (key) seen.add(key)
		}
		return seen.size
	}

	function isSearchWorkflowFieldCovered(state, key) {
		return (Array.isArray(state?.completedKeys) && state.completedKeys.includes(key)) ||
			(Array.isArray(state?.skippedKeys) && state.skippedKeys.includes(key))
	}

	function getLastSearchWorkflowAuditKey(state) {
		const order = Array.isArray(state?.fieldOrder) ? state.fieldOrder : []
		const results = state?.resultsByKey && typeof state.resultsByKey === 'object' ? state.resultsByKey : {}
		for (const key of order.slice().reverse()) {
			if (results[key]) return key
		}
		const completed = Array.isArray(state?.completedKeys) ? state.completedKeys : []
		for (const key of completed.slice().reverse()) {
			if (key) return key
		}
		const skipped = Array.isArray(state?.skippedKeys) ? state.skippedKeys : []
		for (const key of skipped.slice().reverse()) {
			if (key) return key
		}
		return ''
	}

	function buildSearchWorkflowPlanAudit(state, field, phase) {
		const parts = []
		const key = String(field?.key || '').trim()
		const value = cleanPlanFragment(field?.lastTestValue || '')
		const source = formatSearchWorkflowValueSource(field?.lastValueSource)
		const basis = cleanPlanFragment(field?.lastValueBasis || '')
		const result = key && state?.resultsByKey && typeof state.resultsByKey === 'object'
			? state.resultsByKey[key]
			: null
		if (value) parts.push(`测试值：${value}`)
		if (source) parts.push(`依据：${source}${basis ? `/${basis}` : ''}`)
		if (result?.status) parts.push(`结果：${formatSearchWorkflowResultStatus(result.status)}`)
		if (Array.isArray(state?.skippedKeys) && key && state.skippedKeys.includes(key)) parts.push('状态：安全跳过')
		if (phase === 'awaiting_submit') parts.push('提交：待验证')
		else if (phase === 'awaiting_reset') parts.push('清空：待清空')
		else if (phase === 'awaiting_option') {
			const candidates = Array.isArray(state?.pendingDropdownCandidates)
				? state.pendingDropdownCandidates.map(cleanPlanFragment).filter(Boolean)
				: []
			parts.push(candidates.length ? `候选：${candidates.slice(0, 4).join('|')}` : '候选：待观察')
		} else if (phase === 'select_field' && field && !value) {
			parts.push('依据：待从列表样本或任务值确认')
		}
		return parts.join('，')
	}

	function formatSearchWorkflowValueSource(source) {
		const labels = {
			table_sample: '列表样本',
			task_value: '任务文本',
			visible_option: '真实候选',
			option_candidate: '真实候选',
			missing_sample: '缺少样本',
		}
		return labels[String(source || '').trim()] || cleanPlanFragment(source)
	}

	function formatSearchWorkflowResultStatus(status) {
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
		}
		return labels[String(status || '').trim()] || cleanPlanFragment(status)
	}

	function formatSearchWorkflowPlanPhase(phase) {
		const labels = {
			select_field: '选择字段',
			awaiting_submit: '等待提交',
			awaiting_reset: '等待清空',
			awaiting_option: '等待候选',
			completed: '已完成',
			failed: '已停止',
		}
		return labels[String(phase || '').trim()] || ''
	}

	function cleanPlanFragment(value) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		if (!text) return ''
		return text
			.replace(/[。；;，,.\s]+$/g, '')
			.slice(0, PLAN_FRAGMENT_MAX_CHARS)
	}

	function summarizeFailureReason(text, maxLen) {
		const raw = String(text || '').replace(/\s+/g, ' ').trim()
		if (!raw) return '未知原因'
		if (raw.length <= maxLen) return raw
		return `${raw.slice(0, Math.max(12, maxLen - 3))}...`
	}

	g.NC_BG_SESSION_RECORDS = {
		appendExecutionOutcomeSummary,
		appendOutcomeSummary,
		appendVerificationFailureOutcome,
		buildReflection,
		createActionOutcome,
		createVerificationFailureOutcome,
		derivePlanItems,
		getExecutionOutcome,
		recordVerificationSuccess,
		summarizeExecutionOutcome,
		summarizeFailureReason,
	}
})(globalThis)
