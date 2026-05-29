;(function (g) {
	const actionContract = g.NC_ACTION_CONTRACT || null
	const NATURALLY_REPEATABLE_ACTIONS = actionContract?.REPEATABLE_ACTIONS || new Set([
		'scroll',
		'scroll_horizontally',
	])
	const PASSIVE_ACTIONS = actionContract?.PASSIVE_ACTIONS || new Set(['wait'])
	const MOVEMENT_ACTIONS = new Set(['scroll', 'scroll_horizontally'])
	const TRANSIENT_ACTIONS = new Set(['hover_element_by_index'])
	const PROGRESS_SENSITIVE_ACTIONS = actionContract?.PROGRESS_SENSITIVE_ACTIONS || new Set([
		'click',
		'click_element_by_index',
		'keypress',
		'hover_element_by_index',
		'open_dropdown',
		'choose_dropdown_option',
		'select_dropdown_option',
		'select_checkbox_option',
		'select_cascader_path',
	])

	function detectActionLoop(session, decision) {
		const actionName = normalizeHistoryActionName(decision?.action?.name, decision?.action?.input)
		if (!actionName || actionName === 'done') return { blocked: false, reason: '' }
		const nextGoal = normalizeLoopText(decision?.next_goal || '')
		const thought = normalizeLoopText(decision?.thought || '')
		const memory = normalizeLoopText(decision?.memory || '')
		const inputSig = stableActionInputSignatureForAction(actionName, decision?.action?.input || {})
		const recent = Array.isArray(session?.history) ? session.history.slice(-8) : []
		const sameGoalActionCount = recent.filter(
			(item) =>
				item?.success &&
				!hasVerifiedProgress(item) &&
				normalizeHistoryActionName(item?.action, item?.input) === actionName &&
				normalizeLoopText(item?.nextGoal || '') === nextGoal
		).length
		const sameInputCount = recent.filter(
			(item) =>
				item?.success &&
				!hasVerifiedProgress(item) &&
				normalizeHistoryActionName(item?.action, item?.input) === actionName &&
				stableActionInputSignatureForAction(actionName, item?.input || {}) === inputSig
		).length
		const sameFailedGoalActionCount = recent.filter(
			(item) =>
				item &&
				item.success === false &&
				normalizeHistoryActionName(item?.action, item?.input) === actionName &&
				normalizeLoopText(item?.nextGoal || '') === nextGoal
		).length
		const sameFailedInputCount = recent.filter(
			(item) =>
				item &&
				item.success === false &&
				normalizeHistoryActionName(item?.action, item?.input) === actionName &&
				stableActionInputSignatureForAction(actionName, item?.input || {}) === inputSig
		).length
		const sameActionSuccessCount = recent.filter(
			(item) =>
				item?.success &&
				normalizeHistoryActionName(item?.action, item?.input) === actionName
		).length
		const naturallyRepeatable = NATURALLY_REPEATABLE_ACTIONS.has(actionName)
		const passiveAction = PASSIVE_ACTIONS.has(actionName)
		const movementAction = MOVEMENT_ACTIONS.has(actionName)
		const transientAction = TRANSIENT_ACTIONS.has(actionName)
		const isRecoveredFallback =
			thought.includes('快路径') ||
			thought.includes('兜底') ||
			thought.includes('模型规划超时') ||
			memory.includes('兜底')
		if (passiveAction && sameInputCount >= 2) {
			return {
				blocked: true,
				reason: `检测到被动等待动作重复：${actionName} ${inputSig}`,
			}
		}
		if (passiveAction && sameGoalActionCount >= 2) {
			return {
				blocked: true,
				reason: `检测到被动等待目标重复：${actionName} / ${decision.next_goal || '-'}`,
			}
		}
		if (passiveAction && sameActionSuccessCount >= 3) {
			return {
				blocked: true,
				reason: `检测到短窗口内被动等待过多：${actionName} 已执行 ${sameActionSuccessCount} 次`,
			}
		}
		if (movementAction && sameFailedInputCount >= 1) {
			return {
				blocked: true,
				reason: `检测到滚动未产生位移后仍重复同一方向：${actionName} ${inputSig}`,
			}
		}
		if (movementAction && sameFailedGoalActionCount >= 1) {
			return {
				blocked: true,
				reason: `检测到滚动失败后仍重复同一目标：${actionName} / ${decision.next_goal || '-'}`,
			}
		}
		if (transientAction && sameFailedInputCount >= 1) {
			return {
				blocked: true,
				reason: `检测到悬浮未产生效果后仍重复同一目标：${actionName} ${inputSig}`,
			}
		}
		if (!naturallyRepeatable && sameFailedInputCount >= 2) {
			return {
				blocked: true,
				reason: `检测到同一失败动作参数重复：${actionName} ${inputSig}`,
			}
		}
		if (!naturallyRepeatable && sameFailedGoalActionCount >= 2) {
			return {
				blocked: true,
				reason: `检测到重复失败动作循环：${actionName} / ${decision.next_goal || '-'}`,
			}
		}
		if (PROGRESS_SENSITIVE_ACTIONS.has(actionName) && sameInputCount >= 1) {
			return {
				blocked: true,
				reason: `检测到未验证进展的同一动作重复：${actionName} ${inputSig}`,
			}
		}
		if (!naturallyRepeatable && (isRecoveredFallback ? sameGoalActionCount >= 2 : sameGoalActionCount >= 3)) {
			return {
				blocked: true,
				reason: `检测到重复动作循环：${actionName} / ${decision.next_goal || '-'}`,
			}
		}
		if (!naturallyRepeatable && sameInputCount >= 3) {
			return {
				blocked: true,
				reason: `检测到同一动作参数重复执行：${actionName} ${inputSig}`,
			}
		}
		return { blocked: false, reason: '' }
	}

	function countRecentLoopGuardFailures(session) {
		const recent = Array.isArray(session?.history) ? session.history.slice(-8) : []
		let count = 0
		for (let index = recent.length - 1; index >= 0; index -= 1) {
			const item = recent[index]
			if (!item) continue
			if (item.success === true && isSubstantiveRecoveryAction(item.action)) break
			if (item.success === false && /\.loop_guard$/i.test(String(item.action || ''))) count += 1
		}
		return count
	}

	function getUnsafeDoneSuccessReason(session, decision) {
		if (decision?.action?.input?.success === false) return ''
		const recent = Array.isArray(session?.history) ? session.history.slice(-6) : []
		for (let index = recent.length - 1; index >= 0; index -= 1) {
			const item = recent[index]
			if (!item) continue
			if (item.success === true && isSubstantiveRecoveryAction(item.action)) return ''
			if (item.success === false) {
				const action = String(item.action || '')
				if (/(\.loop_guard|\.verify)$/i.test(action)) {
					return '最近一次实质状态仍处于循环保护或校验失败，不能直接标记成功完成'
				}
				return '最近一次实质状态是失败且尚未出现成功恢复动作，不能直接标记成功完成'
			}
		}
		return ''
	}

	function detectRedundantInputRewrite(session, action) {
		if (!action || !['input_text', 'type'].includes(String(action.name || ''))) {
			return { blocked: false, reason: '' }
		}
		const index = Number(action?.input?.index)
		if (!Number.isFinite(index)) return { blocked: false, reason: '' }
		const text = String(action?.input?.text || '').trim()
		if (!text) return { blocked: false, reason: '' }
		const normalizedText = normalizeLoopText(text)
		const recent = Array.isArray(session?.history) ? session.history.slice(-4) : []
		const repeatedSameTextSuccess = recent.filter(
			(item) =>
				item &&
				item.success === true &&
				(item.action === 'input_text' || item.action === 'type') &&
				Number(item?.input?.index) === index &&
				normalizeLoopText(item?.input?.text || '') === normalizedText
		)
		if (repeatedSameTextSuccess.length < 2) {
			return { blocked: false, reason: '' }
		}
		return {
			blocked: true,
			reason: `检测到同一输入框索引 ${index} 重复写入相同文本，已阻断当前输入并要求重规划。`,
		}
	}

	function hasVerifiedProgress(item) {
		if (!item) return false
		const structuredOutcome = getHistoryOutcome(item)
		if (structuredOutcome?.kind && isProgressOutcome(structuredOutcome.kind)) return true
		if (structuredOutcome && structuredOutcome.progress === false) return false
		if (item.verified !== true) return false
		const rawReason = String(item.verifyReason || item.output || '')
		const reason = normalizeLoopText(rawReason)
		if (!reason) return false
		const outputOutcome = rawReason.match(/动作结果:\s*([a-z_]+)/i)?.[1]
		if (outputOutcome && isProgressOutcome(outputOutcome)) return true
		return (
			reason.includes('执行返回状态已变化') ||
			reason.includes('URL已变化') ||
			reason.includes('DOM摘要已变化') ||
			reason.includes('下拉框已展开并返回候选项') ||
			reason.includes('输入值与预期匹配') ||
			reason.includes('scrollY:')
		)
	}

	function getHistoryOutcome(item) {
		const outcome = item?.outcome
		if (outcome && typeof outcome === 'object') {
			return {
				...outcome,
				kind: String(outcome.kind || '').trim().toLowerCase(),
			}
		}
		const metaOutcome = item?.meta?.outcome
		if (metaOutcome && typeof metaOutcome === 'object') {
			return {
				...metaOutcome,
				kind: String(metaOutcome.kind || '').trim().toLowerCase(),
			}
		}
		return null
	}

	function isProgressOutcome(kind) {
		if (actionContract?.isProgressOutcome) return actionContract.isProgressOutcome(kind)
		return [
			'value_changed',
			'state_changed',
			'options_visible',
			'navigated',
			'dom_changed',
			'scrolled',
			'input_verified',
		].includes(String(kind || '').trim().toLowerCase())
	}

	function isSubstantiveRecoveryAction(action) {
		const normalized = normalizeHistoryActionName(action)
		return !!normalized && !PASSIVE_ACTIONS.has(normalized)
	}

	function normalizeLoopText(value) {
		return String(value || '').replace(/\s+/g, '').trim()
	}

	function normalizeHistoryActionName(value, input = {}) {
		const raw = String(value || '').replace(/\.(loop_guard|verify)$/i, '').trim()
		if (raw === 'select_dropdown_option') {
			return hasDropdownSelectionText(input) ? 'choose_dropdown_option' : 'open_dropdown'
		}
		return raw
	}

	function hasDropdownSelectionText(input) {
		return !!String(input?.text || input?.label || input?.value || '').trim()
	}

	function stableActionInputSignature(input) {
		try {
			return JSON.stringify(canonicalizeActionInputValue(input, ''))
		} catch (_) {
			return String(input || '')
		}
	}

	function stableActionInputSignatureForAction(actionName, input) {
		return stableActionInputSignature(canonicalizeActionInputForAction(actionName, input))
	}

	function canonicalizeActionInputForAction(actionName, input) {
		const raw = input && typeof input === 'object' ? { ...input } : {}
		if (actionName === 'open_dropdown') {
			delete raw.text
			delete raw.label
			delete raw.value
			return raw
		}
		if (actionName === 'choose_dropdown_option') {
			const selection = String(raw.text || raw.label || raw.value || '').trim()
			delete raw.label
			delete raw.value
			if (selection) raw.text = selection
			return raw
		}
		return raw
	}

	function canonicalizeActionInputValue(value, key) {
		if (Array.isArray(value)) {
			return value.map((item) => canonicalizeActionInputValue(item, key))
		}
		if (value && typeof value === 'object') {
			const sorted = {}
			for (const childKey of Object.keys(value).sort()) {
				sorted[childKey] = canonicalizeActionInputValue(value[childKey], childKey)
			}
			return sorted
		}
		if (typeof value === 'string') {
			const trimmed = value.trim()
			if (isNumericInputKey(key) && /^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
			if (isBooleanInputKey(key)) {
				if (/^(true|1)$/i.test(trimmed)) return true
				if (/^(false|0)$/i.test(trimmed)) return false
			}
			if (isTextualInputKey(key)) return trimmed
			return trimmed
		}
		return value
	}

	function isNumericInputKey(key) {
		return [
			'index',
			'tab_id',
			'tabId',
			'ms',
			'timeout_ms',
			'timeoutMs',
			'pixels',
			'limit',
			'cursor',
			'x',
			'y',
		].includes(String(key || ''))
	}

	function isBooleanInputKey(key) {
		return ['down', 'right', 'ctrlKey', 'metaKey', 'shiftKey', 'altKey'].includes(String(key || ''))
	}

	function isTextualInputKey(key) {
		return ['text', 'label', 'value', 'target_description', 'description', 'reason', 'question', 'key'].includes(String(key || ''))
	}

	g.NC_BG_LOOP_GUARD = {
		countRecentLoopGuardFailures,
		detectActionLoop,
		detectRedundantInputRewrite,
		getUnsafeDoneSuccessReason,
		getHistoryOutcome,
		hasVerifiedProgress,
		isProgressOutcome,
		normalizeHistoryActionName,
		normalizeLoopText,
		stableActionInputSignature,
		stableActionInputSignatureForAction,
	}
})(globalThis)
