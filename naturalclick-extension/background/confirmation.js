;(function (g) {
	const { TYPES: MSG_TYPES } = g.NC_BG_CONSTANTS
	const { sendRuntimeMessage, generateId } = g.NC_BG_UTILS

	const __ncPendingConfirmations = new Map()
	const HIGH_RISK_ACTION_PATTERNS = [
		/\b(delete|remove|drop|truncate|destroy|void|unsubscribe)\b/i,
		/\b(payment|pay|purchase|checkout|transfer|wire|publish)\b/i,
		/\b(send\s+money)\b/i,
		/\b(wipe|erase|clear)\b.{0,16}\b(data|records|cache|files|account)\b/i,
		/(注销|删除|移除|作废|退订)/,
		/(支付|付款|购买|结算|转账|汇款|发布)/,
		/(?:提交|确认|完成|执行).{0,12}(?:支付|付款|购买|结算|转账|汇款|发布)/,
		/(?:清空|清除|清理).{0,8}(?:数据|记录|缓存|文件|账户|账号|内容)/,
	]

	function handleConfirmationResponse(confirmId, approved) {
		const key = String(confirmId || '')
		const pending = __ncPendingConfirmations.get(key)
		if (!pending) return { ok: false, error: '确认请求不存在或已过期。' }
		clearTimeout(pending.timeout)
		__ncPendingConfirmations.delete(key)
		pending.resolve(!!approved)
		return { ok: true }
	}

	function detectDangerousAction(session, decision) {
		const actionName = String(decision?.action?.name || '')
		const inputText = stringifyRiskRelevantActionInput(actionName, decision?.action?.input || {})
		const actionContext = `${decision?.next_goal || ''}\n${inputText}`.toLowerCase()
		const taskContext = String(session?.task || '').toLowerCase()
		const actionHasHighRiskIntent = matchesHighRiskIntent(actionContext)
		const actionRiskLooksLikeFilterValue = actionHasHighRiskIntent && isSearchOrFilterValueActionContext(actionContext, taskContext)

		const isPotentiallyRiskyAction =
			['click', 'click_element_by_index', 'keypress'].includes(actionName) &&
			(
				(actionHasHighRiskIntent && !actionRiskLooksLikeFilterValue) ||
				(matchesHighRiskIntent(taskContext) && isCommitmentActionContext(actionContext, taskContext))
			)

		if (isPotentiallyRiskyAction) {
			return {
				isDangerous: true,
				reason: '检测到删除/支付/发布/转账等高风险意图',
			}
		}

		return { isDangerous: false, reason: '' }
	}

	function matchesHighRiskIntent(context) {
		const text = String(context || '')
		return HIGH_RISK_ACTION_PATTERNS.some((pattern) => pattern.test(text))
	}

	function isCommitmentActionContext(context, taskContext = '') {
		const text = String(context || '').toLowerCase()
		if (!text) return false
		if (/(搜索|查询|筛选|过滤|检索|search|query|filter|find|lookup)/i.test(text)) return false
		if (isSearchOrFilterTestContext(taskContext) && /\bapply\b/i.test(text)) return false
		return /(确认|确定|提交|完成|执行|继续|同意|授权|保存|confirm|ok|submit|done|execute|continue|agree|approve|authorize|save|apply)/i.test(text)
	}

	function isSearchOrFilterTestContext(context) {
		const text = String(context || '').toLowerCase()
		if (!text) return false
		return /(?:测试|验证|检查|test|check).{0,48}(?:搜索|查询|筛选|过滤|检索|search|query|filter|lookup)/i.test(text) ||
			/(?:搜索|查询|筛选|过滤|检索|search|query|filter|lookup).{0,48}(?:测试|验证|检查|test|check)/i.test(text)
	}

	function isSearchOrFilterValueActionContext(context, taskContext = '') {
		if (!isSearchOrFilterTestContext(taskContext)) return false
		const text = String(context || '').toLowerCase()
		if (!text) return false
		return matchesHighRiskIntent(text) && hasSearchOrFilterValueCue(text)
	}

	function hasSearchOrFilterValueCue(context) {
		return /(状态|阶段|类型|类别|标签|筛选|过滤|搜索|查询|检索|值|选项|候选|status|state|stage|type|category|tag|filter|search|query|lookup|value|option|candidate)/i.test(String(context || ''))
	}

	function stringifyRiskRelevantActionInput(actionName, input) {
		if (!input || typeof input !== 'object') return ''
		if (!['input_text', 'type'].includes(String(actionName || ''))) {
			return JSON.stringify(input)
		}
		const safe = {}
		for (const key of [
			'target_label',
			'targetLabel',
			'target_description',
			'targetDescription',
			'workflow_field_label',
			'workflowFieldLabel',
			'reason',
			'purpose',
			'key',
		]) {
			if (input[key] !== undefined && input[key] !== null && input[key] !== '') safe[key] = input[key]
		}
		return JSON.stringify(safe)
	}

	async function requestUserConfirmation(session, options) {
		const confirmId = generateId('c')
		try {
			await sendRuntimeMessage({
				type: MSG_TYPES.CONFIRM_REQUEST,
				payload: {
					confirmId,
					sessionId: session.id,
					title: options.title || '请确认',
					description: options.description || '',
				},
			})
		} catch (_) {
			return false
		}

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				__ncPendingConfirmations.delete(confirmId)
				resolve(false)
			}, 45000)

			__ncPendingConfirmations.set(confirmId, {
				resolve,
				timeout,
			})
		})
	}

	g.NC_BG_CONFIRMATION = {
		handleConfirmationResponse,
		detectDangerousAction,
		requestUserConfirmation,
	}
})(globalThis)
