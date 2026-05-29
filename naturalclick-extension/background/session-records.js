;(function (g) {
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
		const trace = session.traceItems[session.traceItems.length - 1]
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
		if (!session.history.length) {
			return [{ id: 'boot', title: '解析任务与页面状态', status: 'running' }]
		}

		return session.history.map((item, idx) => {
			const isLast = idx === session.history.length - 1
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
