;(function (g) {
	const { TYPES: MSG_TYPES } = g.NC_BG_CONSTANTS
	const { sendRuntimeMessage, generateId } = g.NC_BG_UTILS

	const __ncPendingConfirmations = new Map()

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
		const inputText = JSON.stringify(decision?.action?.input || {})
		const context = `${session.task}\n${decision?.next_goal || ''}\n${inputText}`.toLowerCase()

		const riskyPattern =
			/(delete|remove|drop|truncate|payment|pay|purchase|checkout|submit order|transfer|send money|wire|publish|post|unsubscribe|注销|删除|清空|支付|购买|提交订单|转账|发布)/

		const isPotentiallyRiskyAction =
			['click', 'click_element_by_index', 'input_text', 'type', 'keypress'].includes(actionName) &&
			riskyPattern.test(context)

		if (isPotentiallyRiskyAction) {
			return {
				isDangerous: true,
				reason: '检测到删除/支付/发布/转账等高风险意图',
			}
		}

		return { isDangerous: false, reason: '' }
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
