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
	}

	function buildResultSummary(session) {
		const search = buildSearchResultSummary(session)
		if (search) return search
		const fieldActions = buildFieldActionResultSummary(session)
		if (fieldActions) return fieldActions
		return buildGenericResultSummary(session)
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
		const terminalFailureKey = findSearchTerminalFailureKey(session, state, rawTerminalReason, {
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
		const cleanupFailed = items.filter((item) => item.clearStatus === 'cleanup_failed').length
		const cleanupUnverified = items.filter((item) => item.clearStatus === 'pending_or_unverified').length
		const issueItems = items.filter((item) => item.status !== 'passed' || item.clearStatus === 'cleanup_failed' || item.clearStatus === 'pending_or_unverified')
		const skippedDetails = buildSearchSkippedDetails(items)
		const contextRequestLimit = isContextRequestLimitReason(terminalReason) ? 1 : 0
		const verificationRecoveryIncomplete = countSearchVerificationRecoveryIncomplete(items, terminalReason)
		const dateCandidateOwnership = countItems(items, (item) => isDateCandidateOwnershipSummaryItem(item, terminalReason))
		const summaryStatus = deriveSearchSummaryStatus(session, state, { failed, unknown, skipped, remaining, tested, cleanupFailed, cleanupUnverified, dateCandidateOwnership, contextRequestLimit, verificationRecoveryIncomplete })
		const headline = buildSearchHeadline(session, summaryStatus, { total, tested, passed, failed, unknown, skipped, remaining, cleanupFailed, cleanupUnverified, dateCandidateOwnership, contextRequestLimit, verificationRecoveryIncomplete })
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
			stats: { total, tested, passed, failed, unknown, skipped, remaining, cleanupFailed, cleanupUnverified, dateCandidateOwnership, contextRequestLimit, verificationRecoveryIncomplete },
			diagnostics,
			items,
			issues: issueItems.slice(0, 12).map((item) => ({
				label: item.label,
				status: item.status,
				statusLabel: item.statusLabel,
				clearStatus: item.clearStatus,
				clearStatusLabel: item.clearStatusLabel,
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
			}))
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
				basis: maskSensitiveValuesInText(rawBasis, options.sensitiveValues),
				clearStatus: skipped ? 'not_applicable' : (completedKeys.has(key) ? 'cleared' : (cleanupFailed ? 'cleanup_failed' : (result ? 'pending_or_unverified' : 'not_reached'))),
				clearStatusLabel: skipped ? '无需清空' : (completedKeys.has(key) ? '已清空' : (cleanupFailed ? '清空失败' : (result ? '未确认清空' : '未测试'))),
				clearFailureReason: cleanupFailed ? String(options.cleanupFailureReason || '').trim() : '',
				summary,
			}
		})
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
		if (counts.unknown > 0 || counts.skipped > 0 || counts.remaining > 0 || counts.cleanupUnverified > 0 || counts.dateCandidateOwnership > 0 || counts.contextRequestLimit > 0 || counts.verificationRecoveryIncomplete > 0 || counts.tested === 0) return 'inconclusive'
		if (String(state?.phase || '') === 'completed' && state?.terminalSuccess === false) return 'inconclusive'
		return 'passed'
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
		const summaryStatus = deriveFieldActionSummaryStatus(session, { failed, unknown, tested, remaining, terminalFailed: !!terminalIssue, recoveredFailures, verificationRecoveryIncomplete })
		const title = isInputBoxTestTask(session) ? '输入框测试结果总结' : '字段操作结果总结'
		const headline = buildFieldActionHeadline(summaryStatus, { total, tested, passed, failed, unknown, remaining, retried, recoveredFailures, verificationRecoveryIncomplete, terminalFailed: terminalIssue ? 1 : 0 }, {
			testTask: isFieldActionSummaryTask(session),
		})
		const diagnostics = buildFieldActionDiagnostics(items, { tested, remaining, terminalIssue, recoveredFailures, verificationRecoveryIncomplete })
		const issues = items
			.filter((item) => item.status !== 'passed' || Number(item.failedAttempts || 0) > 0)
			.slice(0, 12)
			.map((item) => ({
				label: item.label,
				status: item.status,
				statusLabel: item.statusLabel,
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
			stats: { total, tested, passed, failed, unknown, remaining, retried, recoveredFailures, verificationRecoveryIncomplete, terminalFailed: terminalIssue ? 1 : 0 },
			diagnostics,
			items,
			issues,
			remaining: items
				.filter((item) => !item.recorded)
				.slice(0, 50)
				.map((item) => item.label || item.key),
			reason: issues.map((item) => item.summary).filter(Boolean).join('\n'),
			text: textLines.join('\n'),
			generatedAt: Date.now(),
		}
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
		const order = []
		for (const entry of entries) {
			if (shouldSuppressOpenDropdownProbeSummary(entry, selectionIndexesByKey)) continue
			const item = entry.item
			const key = entry.key
			if (!byKey.has(key)) order.push(key)
			const previous = byKey.get(key) || null
			byKey.set(key, mergeFieldActionSummaryItem(previous, item, order.length, options))
		}
		return order
			.map((key, index) => {
				const item = byKey.get(key)
				return item ? { ...item, order: index + 1 } : null
			})
			.filter(Boolean)
	}

	function collectExpectedFieldActionCoverage(session) {
		const inventory = Array.isArray(session?.observedFieldInventory) ? session.observedFieldInventory : []
		if (!inventory.length || !isFieldActionSummaryTask(session)) return []
		const inputOnly = isInputBoxTestTask(session)
		const seen = new Set()
		const out = []
			for (const field of inventory) {
				const item = normalizeExpectedFieldCoverageItem(field)
				if (!item || seen.has(item.key)) continue
				if (inputOnly && item.kind !== 'input') continue
				if (inputOnly && isExcludedInputCoverageField(item)) continue
				seen.add(item.key)
				out.push(item)
			}
		return out
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

		function isExcludedInputCoverageField(field) {
			const region = normalizeCompactText(field?.region || '')
			if (/^(header|sidebar|navigation|nav|toolbar|pagination|footer|statusbar)$/.test(region)) return true
			const text = normalizeCompactText([
				field?.label,
				field?.fieldType,
				field?.kind,
			].filter(Boolean).join(' '))
			if (/(captcha|verification|verifycode|otp|token|secret|api[_-]?key|csrf|file|upload|attachment|image|color|range|验证码|校验码|动态码|短信码|令牌|密钥|秘钥|上传|附件|文件)/i.test(text)) return true
			return /^(首页|个人信息|退出登录|更多|确定|取消|提交|保存|删除|新增|新建|创建|导入|导出|共\d*条|\d+条\/页|条\/页)$/i.test(String(field?.label || '').trim())
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
			summary: maskSensitiveValuesInText('该字段在最近页面观察中可见，但尚未记录输入/选择测试动作。', options.sensitiveValues),
		}
	}

	function isFieldActionHistoryItem(item) {
		const action = normalizeActionName(item?.action)
		if (!Object.prototype.hasOwnProperty.call(FIELD_ACTION_LABELS, action)) return false
		const input = item?.input || {}
		const workflowStep = String(input.workflow_step || '').trim()
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
		const outcome = item?.outcome && typeof item.outcome === 'object' ? item.outcome : {}
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
			item?.outcome?.kind,
			item?.outcome?.reason,
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
		const input = item?.input || {}
		const label = getFieldActionLabel(item)
			const rawValue = getFieldActionValue(item)
			const value = formatFieldActionDisplayValue(rawValue, item)
			const valueSource = getFieldActionValueSource(item)
			const valueSourceLabel = valueSource ? (FIELD_VALUE_SOURCE_LABELS[valueSource] || valueSource) : ''
			const basis = maskSensitiveValuesInText(getFieldActionValueBasis(item), options.sensitiveValues)
			const success = item?.success
		const status = success === false ? 'failed' : (success === true ? 'passed' : 'unknown')
		const attempts = Number(previous?.attempts || 0) + 1
		const failedAttempts = Number(previous?.failedAttempts || 0) + (success === false ? 1 : 0)
		const summary = buildFieldActionItemSummary(item, {
			action,
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
				source: action,
				sourceLabel: FIELD_ACTION_LABELS[action] || action,
				sourceTitle: '动作',
				valueSource,
				valueSourceLabel,
				basis,
				attempts,
				failedAttempts,
				summary,
		}
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

	function getFieldActionValueSource(item) {
		const input = item?.input || {}
		return String(input.workflow_value_source || input.value_source || '').trim()
	}

	function getFieldActionValueBasis(item) {
		const input = item?.input || {}
		return String(input.workflow_value_basis || input.value_basis || '').trim()
	}

	function formatOpenDropdownActionValue(item) {
		if (item?.success === false) return ''
		const visible = extractOpenDropdownVisibleOptions(item)
		if (visible.length) return `候选 ${visible.length} 项`
		return hasOpenDropdownVisibleEvidence(item) ? '已展开' : ''
	}

	function extractOpenDropdownVisibleOptions(item) {
		const outcome = item?.outcome && typeof item.outcome === 'object' ? item.outcome : {}
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
		const outcome = item?.outcome && typeof item.outcome === 'object' ? item.outcome : {}
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
		if (counts.unknown > 0 || counts.remaining > 0 || counts.recoveredFailures > 0 || counts.verificationRecoveryIncomplete > 0 || counts.tested === 0) return 'inconclusive'
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
			counts.retried ? `重试 ${counts.retried} 项` : '',
			counts.terminalFailed ? `终态异常 ${counts.terminalFailed} 项` : '',
		].filter(Boolean)
		return `${prefix}：${parts.join('，')}。`
	}

	function buildFieldActionDiagnostics(items, counts = {}) {
		const diagnostics = []
		const failed = countItems(items, (item) => item.status === 'failed')
		const unknown = countItems(items, (item) => item.status === 'unknown')
		const retried = countItems(items, (item) => Number(item.attempts || 0) > 1)
		const recoveredFailures = Number(counts.recoveredFailures || 0)
		const remaining = Number(counts.remaining || 0)
		const verificationRecoveryIncomplete = Math.max(
			Number(counts.verificationRecoveryIncomplete || 0),
			countFieldActionVerificationRecoveryIncomplete(items, counts.terminalIssue)
		)
		if (failed) {
			diagnostics.push({
				kind: 'field_action_failed',
				severity: 'error',
				count: failed,
				text: `字段动作失败：${failed} 项输入/选择动作未成功，需要复查元素定位、可编辑状态或页面校验。`,
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
		if (retried) {
			diagnostics.push({
				kind: 'field_action_retried',
				severity: 'info',
				count: retried,
				text: `字段动作重试：${retried} 项字段发生过重复尝试，建议关注是否存在定位漂移或校验回退。`,
			})
		}
		if (counts.terminalIssue) {
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

	function buildFieldActionNextStepRecommendations(diagnostics) {
		const kinds = new Set((Array.isArray(diagnostics) ? diagnostics : []).map((item) => String(item?.kind || '')))
		const recommendations = []
		if (kinds.has('field_action_failed')) {
			recommendations.push('建议：优先复查失败字段的元素定位、可编辑状态、候选归属和页面校验反馈。')
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
			counts.failed ? `异常 ${counts.failed} 项` : '',
			counts.cleanupFailed ? `清空异常 ${counts.cleanupFailed} 项` : '',
			counts.cleanupUnverified ? `清空未确认 ${counts.cleanupUnverified} 项` : '',
			counts.dateCandidateOwnership ? `日期候选归属 ${counts.dateCandidateOwnership} 项` : '',
			counts.contextRequestLimit ? `上下文补证上限 ${counts.contextRequestLimit} 项` : '',
			counts.verificationRecoveryIncomplete ? `校验恢复未完成 ${counts.verificationRecoveryIncomplete} 项` : '',
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
			item.sourceLabel ? `依据=${item.sourceLabel}${item.basis ? `/${item.basis}` : ''}` : '',
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
		const terminalReason = extractSessionTerminalReason(session)
		const contextRequestLimit = countGenericContextRequestLimit(history, terminalReason)
		const verificationRecoveryIncomplete = countGenericVerificationRecoveryIncomplete(history, terminalReason)
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
		].filter(Boolean).join('，') + '。'
		const issue = status === 'completed' ? '' : terminalReason
		const issueLabel = status === 'stopped' ? '终止原因' : '最后问题'
		const issueStatus = status === 'stopped' ? 'stopped' : 'failed'
		const diagnostics = buildGenericDiagnostics(status, issue, { recoveredFailures, contextRequestLimit, verificationRecoveryIncomplete })
		return {
			type: 'general',
			title: '任务结果总结',
			status: status === 'completed' ? (recoveredFailures || contextRequestLimit || verificationRecoveryIncomplete ? 'inconclusive' : 'passed') : status === 'running' ? 'running' : status === 'stopped' ? 'stopped' : 'failed',
			headline,
			stats: { total: history.length, completed, failed, verifiedAfterFailure, recoveredFailures, contextRequestLimit, verificationRecoveryIncomplete, terminalFailed: issue && status === 'error' ? 1 : 0 },
			diagnostics,
			items: [],
			issues: [
				issue ? { label: issueLabel, status: issueStatus, statusLabel: status === 'stopped' ? '已中止' : '失败', summary: issue } : null,
				recoveredIssue ? { label: '恢复记录', status: 'unknown', statusLabel: '需关注', summary: recoveredIssue } : null,
			].filter(Boolean),
			remaining: [],
			reason: issue || recoveredIssue,
			text: [
				headline,
				...diagnostics.map((item) => `诊断：${item.text}`),
				issue ? `${issueLabel}：${issue}` : '',
				recoveredIssue ? `恢复记录：${recoveredIssue}` : '',
			].filter(Boolean).join('\n'),
			generatedAt: Date.now(),
		}
	}

	function countGenericVerificationRecoveryIncomplete(history, terminalReason) {
		const historyCount = countItems(history, (item) => hasVerificationRecoveryIncompleteDetail([
			item?.output,
			item?.evaluationPreviousGoal,
			item?.outcome?.reason,
			item?.outcome?.message,
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
				item?.outcome?.reason,
				item?.outcome?.message,
				input.text,
				input.reason,
				input.planning_context_diagnostic,
				input.workflow_planning_context_diagnostic,
			].filter(Boolean).join(' '))
		})
		return Math.max(historyCount, isContextRequestLimitReason(terminalReason) ? 1 : 0)
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
		diagnostics.push({
			kind: 'task_terminal_failure',
			severity: 'error',
			count: 1,
			text: `任务终止：${text}`,
		})
		if (!contextRequestLimit && !verificationRecoveryIncomplete) {
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
	}
})(globalThis)
