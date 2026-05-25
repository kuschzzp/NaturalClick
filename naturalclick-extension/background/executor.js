;(function (g) {
	const { TYPES: MSG_TYPES } = g.NC_BG_CONSTANTS
	const { sendTabMessage } = g.NC_BG_UTILS

	async function requestObservation(tabId) {
		try {
			const data = await sendTabMessage(tabId, { type: MSG_TYPES.OBSERVE })
			return { ok: true, data }
		} catch (error) {
			return { ok: false, error: String(error) }
		}
	}

	async function executeAction(session, action) {
		const name = action.name
		const input = action.input || {}

		if (name === 'locate_by_vision') {
			const observation = await requestObservation(session.currentTabId)
			if (!observation?.ok) {
				return { success: false, message: observation?.error || '视觉回退失败：无法观察页面。' }
			}
			const result = await g.NC_BG_VISION.attemptVisionFallback(
				session,
				{
					thought: 'manual vision fallback',
					next_goal: action?.input?.target_description || '视觉定位并执行',
					action,
				},
				observation.data
			)
			return {
				success: result.success,
				message: result.message,
			}
		}

		if (g.NC_BG_TOOLS?.hasTool?.(name)) {
			return g.NC_BG_TOOLS.executeTool(session, { name, input })
		}

		return { success: false, message: `不支持的工具: ${name}` }
	}

	g.NC_BG_EXECUTOR = {
		requestObservation,
		executeAction,
	}
})(globalThis)
