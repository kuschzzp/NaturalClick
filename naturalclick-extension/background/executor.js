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
			const delegation = buildVisionDelegatedAction(input)
			if (!delegation.ok) {
				return { success: false, message: delegation.message }
			}
			const observation = await requestObservation(session.currentTabId)
			if (!observation?.ok) {
				return { success: false, message: observation?.error || '视觉回退失败：无法观察页面。' }
			}
			const result = await g.NC_BG_VISION.attemptVisionFallback(
				session,
				{
					thought: 'manual vision fallback',
					next_goal: delegation.targetDescription,
					action: delegation.action,
				},
				observation.data
			)
			return {
				success: result.success,
				message: result.message,
				meta: result.meta || null,
			}
		}

		if (g.NC_BG_TOOLS?.hasTool?.(name)) {
			return g.NC_BG_TOOLS.executeTool(session, { name, input })
		}

		return { success: false, message: `不支持的工具: ${name}` }
	}

	function buildVisionDelegatedAction(input) {
		const targetDescription = getVisionTargetDescription(input)
		if (!targetDescription) {
			return { ok: false, message: 'locate_by_vision 缺少 target_description，无法执行语义视觉定位。' }
		}
		const rawText = String(input?.text || input?.value || '').trim()
		const rawActionName = String(input?.action_name || input?.action || '').trim()
		const explicit = normalizeVisionActionName(rawActionName)
		if (rawActionName && !explicit) {
			return { ok: false, message: `locate_by_vision 不支持 action_name=${rawActionName}。` }
		}
		const name = explicit || (rawText ? 'input_text' : 'click_element_by_index')
		if ((name === 'input_text' || name === 'type') && !rawText) {
			return { ok: false, message: 'locate_by_vision 输入类动作缺少 text，无法执行。' }
		}
		const delegatedInput = {}
		if (rawText) delegatedInput.text = rawText
		return {
			ok: true,
			targetDescription,
			action: { name, input: delegatedInput },
		}
	}

	function getVisionTargetDescription(input) {
		return String(input?.target_description || input?.description || '').trim()
	}

	function normalizeVisionActionName(value) {
		const raw = String(value || '').trim()
		if (!raw) return ''
		if (raw === 'click') return 'click'
		if (raw === 'click_element_by_index') return raw
		if (raw === 'input_text' || raw === 'type') return raw
		return ''
	}

	g.NC_BG_EXECUTOR = {
		requestObservation,
		executeAction,
		buildVisionDelegatedAction,
	}
})(globalThis)
