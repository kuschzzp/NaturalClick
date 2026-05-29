;(function (g) {
	const { MAX_TRACE_ITEMS } = g.NC_BG_CONSTANTS
	const { generateId } = g.NC_BG_UTILS
	const TRACEABLE_PLANNING_STAGES = new Set([
		'model_compact_request',
		'model_context_round',
		'compact_retry',
		'planning_context',
		'timeout_recovery',
		'timeout_no_recovery',
	])

	function publishSession(session) {
		const payload = {
			sessionId: session.id,
			status: session.status,
			currentTask: session.task,
			activityText: session.activityText,
			currentTabId: session.currentTabId,
			planItems: session.planItems,
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

	function publishPlanningProgress(session, event) {
		if (!session || session.aborted || session.status !== 'running') return
		const text = String(event?.text || '').trim()
		if (!text) return
		session.activityText = text
		appendPlanningProgressTrace(session, event, text)
		publishSession(session)
	}

	function appendPlanningProgressTrace(session, event, text) {
		const stage = String(event?.stage || '').trim()
		if (!TRACEABLE_PLANNING_STAGES.has(stage)) return
		const round = Number(event?.round) || 0
		const key = `${session.step || 0}:${stage}:${round}:${text}`
		if (session.lastPlanningProgressTraceKey === key) return
		session.lastPlanningProgressTraceKey = key
		appendTrace(session, {
			title: '规划进度',
			detail: text,
			kind: 'step',
			progress: { stage, round },
		})
	}

	function failSession(session, errorText, sessions) {
		session.status = 'error'
		session.activityText = errorText
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

	function appendTrace(session, traceItem) {
		session.traceItems.push({ id: generateId('t'), ...traceItem })
		session.traceItems = session.traceItems.slice(-MAX_TRACE_ITEMS)
	}

	g.NC_BG_SESSION_LIFECYCLE = {
		appendTrace,
		appendPlanningProgressTrace,
		failSession,
		finalizeIfAborted,
		finalizeStoppedSession,
		publishPlanningProgress,
		publishSession,
	}
})(globalThis)
