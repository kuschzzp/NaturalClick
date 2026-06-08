;(function (g) {
	const { MAX_TRACE_ITEMS } = g.NC_BG_CONSTANTS
	const { generateId } = g.NC_BG_UTILS
	const TRACEABLE_PLANNING_STAGES = new Set([
		'observation_summary',
		'task_intent_request',
		'task_intent_heuristic',
		'workflow_analysis',
		'workflow_decision',
		'model_request',
		'model_compact_request',
		'model_context_round',
		'model_wait_heartbeat',
		'model_stream_delta',
		'compact_retry',
		'planning_context_request',
		'planning_context',
		'invalid_model_output',
		'invalid_action_name',
		'validation_feedback',
		'timeout_recovery',
		'timeout_no_recovery',
	])

	function publishSession(session) {
		const resultSummary = buildSessionResultSummary(session)
		if (resultSummary) session.resultSummary = resultSummary
		const payload = {
			sessionId: session.id,
			status: session.status,
			currentTask: session.task,
			activityText: session.activityText,
			currentTabId: session.currentTabId,
			planItems: session.planItems,
			resultSummary: resultSummary || session.resultSummary || null,
			traceItems: session.traceItems,
		}
		chrome.runtime.sendMessage(
			{
				type: g.NC_BG_CONSTANTS.TYPES.SESSION_UPDATE,
				payload,
			},
			() => {
				// Side panel may be closed; consume lastError to avoid noisy MV3 runtime errors.
				void chrome.runtime.lastError
			}
		)
	}

	function buildSessionResultSummary(session) {
		const builder = g.NC_BG_RESULT_SUMMARY?.buildResultSummary
		if (typeof builder !== 'function') return session?.resultSummary || null
		try {
			return builder(session) || session?.resultSummary || null
		} catch (error) {
			return buildResultSummaryErrorFallback(session, error)
		}
	}

	function buildResultSummaryErrorFallback(session, error) {
		const status = String(session?.status || '').trim()
		const history = Array.isArray(session?.history) ? session.history : []
		const completed = history.filter((item) => item?.success === true).length
		const failed = history.filter((item) => item?.success === false).length
		const errorText = formatResultSummaryError(error)
		const headline = `结果总结生成异常：任务状态=${status || 'unknown'}，已执行 ${history.length} 个动作。`
		const recommendation = '建议：优先查看最后失败动作和规划/运行进度；结果总结模块需要单独复查，但任务轨迹仍可用于判断执行过程。'
		return {
			type: 'summary_error',
			title: '结果总结生成异常',
			status: status === 'error' ? 'failed' : 'inconclusive',
			fallback: true,
			headline,
			stats: {
				total: history.length,
				completed,
				failed,
				summaryErrors: 1,
			},
			diagnostics: [
				{
					kind: 'summary_generation_failed',
					severity: status === 'error' ? 'error' : 'warning',
					count: 1,
					text: `结果总结生成失败：${errorText}`,
				},
				{
					kind: 'next_step_recommendation',
					severity: 'info',
					count: 1,
					text: recommendation,
				},
			],
			items: [],
			issues: [
				{
					label: '结果总结',
					status: 'failed',
					statusLabel: '失败',
					summary: `结果总结生成失败：${errorText}`,
				},
			],
			remaining: [],
			reason: errorText,
			text: [
				headline,
				`诊断：结果总结生成失败：${errorText}`,
				`诊断：${recommendation}`,
			].join('\n'),
			generatedAt: Date.now(),
		}
	}

	function formatResultSummaryError(error) {
		const name = String(error?.name || '').trim()
		const message = String(error?.message || error || '').replace(/\s+/g, ' ').trim()
		const text = [name && name !== 'Error' ? name : '', message].filter(Boolean).join(': ') || '未知异常'
		return text.length > 180 ? `${text.slice(0, 177)}...` : text
	}

	function publishPlanningProgress(session, event) {
		if (!session || session.aborted || session.status !== 'running') return
		const text = String(event?.text || '').trim()
		if (!text) return
		session.activityText = text
		session.currentRuntimeProgress = null
		session.currentPlanningProgress = normalizeCurrentPlanningProgress(event, text)
		if (g.NC_BG_SESSION_RECORDS?.derivePlanItems) {
			session.planItems = g.NC_BG_SESSION_RECORDS.derivePlanItems(session)
		}
		appendPlanningProgressTrace(session, event, text)
		publishSession(session)
	}

	function publishRuntimeProgress(session, event) {
		if (!session || session.aborted || session.status !== 'running') return
		const text = String(event?.text || '').trim()
		if (!text) return
		session.activityText = text
		session.currentPlanningProgress = null
		session.currentRuntimeProgress = normalizeCurrentRuntimeProgress(event, text)
		if (g.NC_BG_SESSION_RECORDS?.derivePlanItems) {
			session.planItems = g.NC_BG_SESSION_RECORDS.derivePlanItems(session)
		}
		appendRuntimeProgressTrace(session, event, text)
		publishSession(session)
	}

	function normalizeCurrentPlanningProgress(event, text) {
		return {
			stage: String(event?.stage || '').trim(),
			round: Number(event?.round) || 0,
			text: String(text || '').trim(),
			elapsedMs: Math.max(0, Number(event?.elapsedMs) || 0),
			timeoutMs: Math.max(0, Number(event?.timeoutMs) || 0),
			validationKind: String(event?.validationKind || '').trim(),
			validationGuidance: String(event?.validationGuidance || '').trim().slice(0, 600),
			ts: Date.now(),
		}
	}

	function normalizeCurrentRuntimeProgress(event, text) {
		return {
			stage: String(event?.stage || '').trim(),
			text: String(text || '').trim(),
			elapsedMs: Math.max(0, Number(event?.elapsedMs) || 0),
			ts: Date.now(),
		}
	}

	function appendPlanningProgressTrace(session, event, text) {
		const stage = String(event?.stage || '').trim()
		if (!TRACEABLE_PLANNING_STAGES.has(stage)) return
		if (stage === 'model_stream_delta') {
			upsertModelStreamTrace(session, event, text)
			return
		}
		if (stage === 'model_wait_heartbeat') {
			upsertModelWaitTrace(session, event, text)
			return
		}
		const round = Number(event?.round) || 0
		const key = `${session.step || 0}:${stage}:${round}:${text}`
		if (session.lastPlanningProgressTraceKey === key) return
		session.lastPlanningProgressTraceKey = key
		appendTrace(session, {
			title: '规划进度',
			detail: text,
			kind: 'step',
			progress: {
				stage,
				round,
				elapsedMs: Math.max(0, Number(event?.elapsedMs) || 0),
				timeoutMs: Math.max(0, Number(event?.timeoutMs) || 0),
				validationKind: String(event?.validationKind || '').trim(),
				validationGuidance: String(event?.validationGuidance || '').trim().slice(0, 600),
			},
		})
	}

	function upsertModelStreamTrace(session, event, text) {
		const round = Number(event?.round) || 0
		const key = `${session.step || 0}:${round}`
		const existingId = session.modelStreamTraceKey === key ? session.modelStreamTraceId : ''
		const progress = {
			stage: 'model_stream_delta',
			round,
			...(event?.stream || {}),
		}
		const existing = existingId
			? session.traceItems.find((item) => item?.id === existingId)
			: null
		if (existing) {
			existing.detail = text
			existing.progress = progress
			return
		}
		appendTrace(session, {
			title: '模型流式输出',
			detail: text,
			kind: 'model',
			progress,
		})
		const last = session.traceItems[session.traceItems.length - 1]
		session.modelStreamTraceKey = key
		session.modelStreamTraceId = last?.id || ''
	}

	function upsertModelWaitTrace(session, event, text) {
		const round = Number(event?.round) || 0
		const key = `${session.step || 0}:${round}`
		const existingId = session.modelWaitTraceKey === key ? session.modelWaitTraceId : ''
		const progress = {
			stage: 'model_wait_heartbeat',
			round,
			elapsedMs: Math.max(0, Number(event?.elapsedMs) || 0),
			timeoutMs: Math.max(0, Number(event?.timeoutMs) || 0),
		}
		const existing = existingId
			? session.traceItems.find((item) => item?.id === existingId)
			: null
		if (existing) {
			existing.detail = text
			existing.progress = progress
			return
		}
		appendTrace(session, {
			title: '模型等待状态',
			detail: text,
			kind: 'model',
			progress,
		})
		const last = session.traceItems[session.traceItems.length - 1]
		session.modelWaitTraceKey = key
		session.modelWaitTraceId = last?.id || ''
	}

	function appendRuntimeProgressTrace(session, event, text) {
		const stage = String(event?.stage || '').trim()
		if (!stage) return
		const key = `${session.step || 0}:${stage}`
		const progress = {
			stage,
			runtimeKey: key,
			elapsedMs: Math.max(0, Number(event?.elapsedMs) || 0),
		}
		const existing = Array.isArray(session?.traceItems)
			? session.traceItems.find((item) => item?.progress?.runtimeKey === key)
			: null
		if (existing) {
			existing.title = String(event?.title || existing.title || formatRuntimeProgressTitle(stage))
			existing.detail = text
			existing.progress = progress
			return
		}
		appendTrace(session, {
			title: String(event?.title || '').trim() || formatRuntimeProgressTitle(stage),
			detail: text,
			kind: 'step',
			progress,
		})
	}

	function formatRuntimeProgressTitle(stage) {
		const labels = {
			observation_heartbeat: '页面观察进度',
			action_execution_heartbeat: '动作执行进度',
			execution_recovery: '执行恢复进度',
			verification_heartbeat: '动作复核进度',
			verification_recovery: '校验恢复进度',
		}
		return labels[String(stage || '').trim()] || '运行进度'
	}

	function failSession(session, errorText, sessions) {
		session.status = 'error'
		session.activityText = errorText
		markTerminalWorkflowState(session, errorText, 'error')
		appendTrace(session, { title: '错误', detail: errorText, kind: 'error' })
		publishSession(session)
		sessions.delete(session.id)
	}

	function finalizeIfAborted(session, sessions) {
		if (!session?.aborted) return false
		finalizeStoppedSession(session, sessions)
		return true
	}

	function finalizeStoppedSession(session, sessions) {
		session.status = 'stopped'
		session.activityText = '任务已中止。'
		markTerminalWorkflowState(session, session.activityText, 'stopped')
		if (!session.stopTraceAdded) {
			appendTrace(session, {
				title: '任务中止',
				detail: session.activityText,
				kind: 'step',
			})
			session.stopTraceAdded = true
		}
		publishSession(session)
		sessions.delete(session.id)
	}

	function markTerminalWorkflowState(session, reason, status) {
		const text = String(reason || '').trim()
		if (!text || !session?.workflowState || typeof session.workflowState !== 'object') return
		const search = session.workflowState.search
		if (search && typeof search === 'object') {
			if (!String(search.terminalReason || '').trim()) search.terminalReason = text
			search.terminalSuccess = false
			if (!String(search.terminalFieldKey || '').trim()) {
				search.terminalFieldKey = String(search.activeFieldKey || search.lastSearchedFieldKey || '').trim()
			}
			if (status === 'error' && !/^(completed|failed)$/i.test(String(search.phase || ''))) {
				search.phase = 'failed'
				search.failedReason = text
			}
		}
	}

	function appendTrace(session, traceItem) {
		session.traceItems.push({ id: generateId('t'), ...traceItem })
		session.traceItems = session.traceItems.slice(-MAX_TRACE_ITEMS)
	}

	g.NC_BG_SESSION_LIFECYCLE = {
		appendTrace,
		appendPlanningProgressTrace,
		appendRuntimeProgressTrace,
		failSession,
		finalizeIfAborted,
		finalizeStoppedSession,
		publishPlanningProgress,
		publishRuntimeProgress,
		publishSession,
	}
})(globalThis)
