;(function (g) {
	const { TYPES: MSG_TYPES } = g.NC_BG_CONSTANTS
	const { sendTabMessage } = g.NC_BG_UTILS
	const { requestObservation } = g.NC_BG_EXECUTOR

	function shouldVerifyAction(action) {
		if (!action || typeof action.name !== 'string') return false
		return ['input_text', 'type', 'scroll'].includes(action.name)
	}

	async function verifyExecutionOutcome(session, action, preObservation, execution) {
		const post = await requestObservation(session.currentTabId)
		if (!post?.ok) {
			return { ok: false, reason: post?.error || '无法获取动作后页面状态' }
		}

		const postObs = post.data
		const name = action?.name
		const input = action?.input || {}
		const urlChanged = String(postObs.url || '') !== String(preObservation.url || '')
		const domChanged = String(postObs.content || '') !== String(preObservation.content || '')
		const activeChanged = String(postObs.activeElement || '') !== String(preObservation.activeElement || '')

		if (name === 'scroll') {
			const preY = Number(preObservation.scrollY || 0)
			const postY = Number(postObs.scrollY || 0)
			if (Math.abs(postY - preY) >= 4) return { ok: true, reason: `scrollY: ${preY} -> ${postY}` }
			if (domChanged) return { ok: true, reason: '滚动后 DOM 摘要已变化' }
			const hasContainerIndex = Number.isFinite(Number(input.index))
			if (hasContainerIndex) return { ok: true, reason: '容器滚动不使用 window.scrollY 校验' }
			return { ok: false, reason: '滚动后 scrollY 无明显变化' }
		}

		if (name === 'input_text' || name === 'type') {
			const expected = String(input.text || '')
			if (!expected) return { ok: true, reason: '输入文本为空，跳过校验' }

			const index = Number(input.index)
			if (Number.isFinite(index)) {
				const byIndex = await verifyInputByIndex(session, index, expected)
				if (byIndex.ok) return { ok: true, reason: '输入值与预期匹配(index)' }
			}

			const point = execution?.meta?.point
			if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
				const byPoint = await verifyInputByPoint(session, point.x, point.y, expected)
				if (byPoint.ok) return { ok: true, reason: '输入值与预期匹配(point)' }
			}

			return { ok: false, reason: '输入值校验失败（值未写入目标元素）' }
		}

		if (name === 'click' || name === 'click_element_by_index' || name === 'keypress') {
			if (urlChanged) return { ok: true, reason: 'URL 已变化' }
			if (domChanged) return { ok: true, reason: 'DOM 摘要已变化' }
			if (activeChanged) return { ok: true, reason: '焦点元素已变化' }
			return { ok: false, reason: '点击/按键后页面无可见变化' }
		}

		return { ok: true, reason: '无需校验' }
	}

	async function verifyInputByIndex(session, index, expected) {
		try {
			const result = await sendTabMessage(session.currentTabId, {
				type: MSG_TYPES.VERIFY_INPUT,
				payload: { index, text: expected },
			})
			if (result?.success && result?.matched) return { ok: true }
			return { ok: false, reason: result?.message || 'NC_VERIFY_INPUT failed' }
		} catch (error) {
			return { ok: false, reason: String(error) }
		}
	}

	async function verifyInputByPoint(session, x, y, expected) {
		try {
			const result = await sendTabMessage(session.currentTabId, {
				type: MSG_TYPES.VERIFY_INPUT_POINT,
				payload: { x, y, text: expected },
			})
			if (result?.success && result?.matched) return { ok: true }
			return { ok: false, reason: result?.message || 'NC_VERIFY_INPUT_POINT failed' }
		} catch (error) {
			return { ok: false, reason: String(error) }
		}
	}

	g.NC_BG_VERIFIER = {
		shouldVerifyAction,
		verifyExecutionOutcome,
	}
})(globalThis)
