;(function (g) {
	const { TYPES: MSG_TYPES } = g.NC_BG_CONSTANTS
	const { sendTabMessage } = g.NC_BG_UTILS
	const { requestObservation } = g.NC_BG_EXECUTOR
	const actionContract = g.NC_ACTION_CONTRACT || null
	const OUTCOME_KIND = actionContract?.OUTCOME_KIND || {
		FAILED: 'failed',
		NO_EFFECT: 'no_effect',
		FOCUSED: 'focused',
		NONE: 'none',
	}

	function shouldVerifyAction(action) {
		if (!action || typeof action.name !== 'string') return false
		return [
			'click',
			'click_element_by_index',
			'input_text',
			'type',
			'scroll',
			'scroll_horizontally',
			'keypress',
			'hover_element_by_index',
			'open_dropdown',
			'choose_dropdown_option',
			'select_dropdown_option',
			'select_checkbox_option',
			'select_cascader_path',
			'locate_by_vision',
		].includes(action.name)
	}

	async function verifyExecutionOutcome(session, action, preObservation, execution) {
		const name = getEffectiveVerificationActionName(action)
		const post = await requestPostObservationForVerification(
			session,
			action,
			preObservation,
			execution,
			name
		)
		if (!post?.ok) {
			return { ok: false, reason: post?.error || '无法获取动作后页面状态' }
		}

		const postObs = post.data
		const input = action?.input || {}
		const urlChanged = String(postObs.url || '') !== String(preObservation.url || '')
		const domChanged = String(postObs.content || '') !== String(preObservation.content || '')

		if (name === 'scroll') {
			const outcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: false })
			if (outcomeVerdict) return outcomeVerdict
			const preY = Number(preObservation.scrollY || 0)
			const postY = Number(postObs.scrollY || 0)
			if (Math.abs(postY - preY) >= 4) return { ok: true, reason: `scrollY: ${preY} -> ${postY}` }
			if (domChanged) return { ok: true, reason: '滚动后 DOM 摘要已变化' }
			const hasContainerIndex = Number.isFinite(Number(input.index))
			if (hasContainerIndex) return { ok: true, reason: '容器滚动不使用 window.scrollY 校验' }
			const finalOutcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: true })
			if (finalOutcomeVerdict) return finalOutcomeVerdict
			return { ok: false, reason: '滚动后 scrollY 无明显变化' }
		}

		if (name === 'scroll_horizontally') {
			const outcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: false })
			if (outcomeVerdict) return outcomeVerdict
			if (domChanged) return { ok: true, reason: '横向滚动后 DOM 摘要已变化' }
			const hasContainerIndex = Number.isFinite(Number(input.index))
			if (hasContainerIndex) return { ok: true, reason: '容器横向滚动不使用 window.scrollX 校验' }
			return { ok: true, reason: '已派发横向滚动动作' }
		}

		if (name === 'input_text' || name === 'type') {
			const expected = getActionInputText(action)
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

		if (
			name === 'click' ||
			name === 'click_element_by_index' ||
			name === 'keypress' ||
			name === 'hover_element_by_index' ||
			name === 'open_dropdown' ||
			name === 'choose_dropdown_option' ||
			name === 'select_dropdown_option' ||
			name === 'select_checkbox_option' ||
			name === 'select_cascader_path'
		) {
			if (isDropdownOpenProbeAction(action)) {
				const visibleOptions = getDropdownProbeCandidateLabels(execution, postObs)
				if (!visibleOptions.length) {
					return { ok: false, reason: '下拉框已触发但未发现可见候选项' }
				}
				return {
					ok: true,
					reason: '下拉框已展开并返回候选项',
					outcome: createVerifierOutcome(OUTCOME_KIND.OPTIONS_VISIBLE, {
						visibleOptions,
					}),
				}
			}
			const outcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: false })
			if (outcomeVerdict) return outcomeVerdict
			if (hasExecutionStateChange(execution)) return { ok: true, reason: '执行返回状态已变化' }
			if (isDropdownSelectionCommitAction(action)) {
				if (hasObservedIndexedTargetValueChanged(preObservation, postObs, input.index)) {
					return { ok: true, reason: '下拉选择后字段值已变化' }
				}
				const finalOutcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: true })
				if (finalOutcomeVerdict) return finalOutcomeVerdict
				return { ok: false, reason: '下拉选择后未观察到字段值或选项状态变化' }
			}
			if (isSearchWorkflowStep(action, 'submit_search')) {
				if (urlChanged) return { ok: true, reason: 'URL 已变化' }
				if (domChanged) return { ok: true, reason: 'DOM 摘要已变化' }
				return { ok: true, reason: '搜索提交动作已触发' }
			}
			if (isSearchWorkflowStep(action, 'reset_filters')) {
				if (hasSearchWorkflowFieldCleared(preObservation, postObs, input)) {
					return { ok: true, reason: '搜索重置后字段已清空' }
				}
				if (!Number.isFinite(Number(input.workflow_field_index))) {
					return { ok: true, reason: '搜索重置动作已触发' }
				}
			}
			if (urlChanged) return { ok: true, reason: 'URL 已变化' }
			if (domChanged) return { ok: true, reason: 'DOM 摘要已变化' }
			const finalOutcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: true })
			if (finalOutcomeVerdict) return finalOutcomeVerdict
			return { ok: false, reason: `${name} 后页面无可见变化` }
		}

		return { ok: true, reason: '无需校验' }
	}

	async function requestPostObservationForVerification(session, action, preObservation, execution, effectiveName) {
		const delays = getPostObservationRetryDelays(action, execution, effectiveName)
		let last = null
		for (const delay of delays) {
			if (delay > 0) await sleep(delay)
			last = await requestObservation(session.currentTabId)
			if (!last?.ok) continue
			if (isPostObservationSatisfied(action, execution, preObservation, last.data)) return last
		}
		return last
	}

	function getPostObservationRetryDelays(action, execution, effectiveName) {
		if (isDropdownOpenProbeAction(action)) {
			const visibleOptions = execution?.meta?.visibleOptions
			return Array.isArray(visibleOptions) && visibleOptions.length > 0
				? [0]
				: [0, 350, 900, 1400]
		}
		if (!shouldRetryPostObservation(action, execution, effectiveName)) return [0]
		return [0, 450, 1100]
	}

	function shouldRetryPostObservation(action, execution, effectiveName) {
		if (evaluateStructuredOutcome(execution, { finalNoEffect: false })) return false
		if (hasExecutionStateChange(execution)) return false
		const name = String(effectiveName || action?.name || '')
		return [
			'click',
			'click_element_by_index',
			'keypress',
			'hover_element_by_index',
			'open_dropdown',
			'choose_dropdown_option',
			'select_dropdown_option',
			'select_checkbox_option',
			'select_cascader_path',
		].includes(name)
	}

	function isPostObservationSatisfied(action, execution, preObservation, postObservation) {
		if (isDropdownOpenProbeAction(action)) {
			return hasDropdownProbeCandidates(execution, postObservation)
		}
		if (isDropdownSelectionCommitAction(action)) {
			const index = Number(action?.input?.index)
			if (Number.isFinite(index)) {
				return hasObservedIndexedTargetValueChanged(preObservation, postObservation, index)
			}
		}
		if (isSearchWorkflowStep(action, 'submit_search')) {
			return hasPostObservationProgress(preObservation, postObservation)
		}
		if (isSearchWorkflowStep(action, 'reset_filters')) {
			return hasSearchWorkflowFieldCleared(preObservation, postObservation, action?.input || {}) ||
				hasPostObservationProgress(preObservation, postObservation)
		}
		return hasPostObservationProgress(preObservation, postObservation)
	}

	function hasPostObservationProgress(preObservation, postObservation) {
		if (!postObservation) return false
		if (String(postObservation.url || '') !== String(preObservation?.url || '')) return true
		if (String(postObservation.content || '') !== String(preObservation?.content || '')) return true
		return false
	}

	function evaluateStructuredOutcome(execution, options = {}) {
		const outcome = actionContract?.getOutcome
			? actionContract.getOutcome(execution)
			: execution?.meta?.outcome
		const kind = String(outcome?.kind || '').trim().toLowerCase()
		if (!kind || kind === OUTCOME_KIND.NONE || kind === OUTCOME_KIND.FOCUSED) return null
		if (kind === OUTCOME_KIND.FAILED || (kind === OUTCOME_KIND.NO_EFFECT && options.finalNoEffect)) {
			return { ok: false, reason: outcome?.reason || `动作结果: ${kind}` }
		}
		if (kind === OUTCOME_KIND.NO_EFFECT) return null
		const isProgress = actionContract?.isProgressOutcome
			? actionContract.isProgressOutcome(kind)
			: !!outcome?.progress
		if (isProgress) return { ok: true, reason: `动作结果: ${kind}` }
		return null
	}

	function getEffectiveVerificationActionName(action) {
		const name = String(action?.name || '')
		if (name !== 'locate_by_vision') return name
		return getActionInputText(action) ? 'input_text' : 'click_element_by_index'
	}

	function getActionInputText(action) {
		const input = action?.input || {}
		return String(input.text || input.value || '').trim()
	}

	function isDropdownOpenProbeAction(action) {
		const name = String(action?.name || '')
		const input = action?.input || {}
		if (name === 'open_dropdown') return Number.isFinite(Number(input.index))
		if (name !== 'select_dropdown_option') return false
		if (String(input.text || input.label || '').trim()) return false
		return Number.isFinite(Number(input.index))
	}

	function isDropdownSelectionCommitAction(action) {
		const name = String(action?.name || '')
		if (
			name !== 'select_dropdown_option' &&
			name !== 'choose_dropdown_option' &&
			name !== 'select_checkbox_option' &&
			name !== 'select_cascader_path'
		) return false
		const input = action?.input || {}
		if (name === 'select_cascader_path') {
			return Array.isArray(input.path) ? input.path.length > 0 : !!String(input.path || '').trim()
		}
		return !!String(input.text || input.label || '').trim()
	}

	function isSearchWorkflowStep(action, step) {
		const input = action?.input || {}
		return String(input.workflow || '') === 'search-fields' &&
			String(input.workflow_step || '') === String(step || '')
	}

	function hasDropdownProbeCandidates(execution, postObs) {
		return getDropdownProbeCandidateLabels(execution, postObs).length > 0
	}

	function getDropdownProbeCandidateLabels(execution, postObs) {
		const labels = []
		const visibleOptions = execution?.meta?.visibleOptions
		if (Array.isArray(visibleOptions)) labels.push(...visibleOptions)
		for (const item of getObservedChoiceCandidates(postObs)) {
			labels.push(item?.label || item?.text || '')
		}
		return uniqueVisibleLabels(labels)
	}

	function hasObservedChoiceCandidates(observation) {
		return getObservedChoiceCandidates(observation).length > 0
	}

	function getObservedChoiceCandidates(observation) {
		const candidates = [
			...(Array.isArray(observation?.options) ? observation.options : []),
			...(Array.isArray(observation?.popups) ? observation.popups : []),
		]
		return candidates.filter((item) => {
			if (!item || typeof item !== 'object') return false
			const label = String(item.label || item.text || '').trim()
			if (!label) return false
			const region = String(item.region || '')
			const role = String(item.role || '').toLowerCase()
			const control = String(item.selectionControl || '').toLowerCase()
			return (
				item.newSinceLastObservation === true ||
				['popover', 'dialog'].includes(region) ||
				['option', 'menuitem', 'treeitem', 'checkbox', 'radio'].includes(role) ||
				!!control
			)
		})
	}

	function uniqueVisibleLabels(labels) {
		const out = []
		const seen = new Set()
		for (const label of (Array.isArray(labels) ? labels : [])) {
			const text = String(label || '').trim()
			const key = text.replace(/\s+/g, '').toLowerCase()
			if (!key || seen.has(key)) continue
			seen.add(key)
			out.push(text)
		}
		return out
	}

	function createVerifierOutcome(kind, extras = {}) {
		if (actionContract?.createOutcome) return actionContract.createOutcome(kind, extras)
		return {
			kind,
			progress: kind !== OUTCOME_KIND.NONE && kind !== OUTCOME_KIND.FAILED && kind !== OUTCOME_KIND.NO_EFFECT && kind !== OUTCOME_KIND.FOCUSED,
			...extras,
		}
	}

	function hasExecutionStateChange(execution) {
		const before = execution?.meta?.before
		const after = execution?.meta?.after
		if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return false
		for (const key of ['value', 'text', 'checked', 'selected', 'childChecked', 'childSelected', 'childValue', 'expanded']) {
			if (before[key] !== after[key]) return true
		}
		return false
	}

	function hasObservedIndexedTargetValueChanged(preObservation, postObservation, indexValue) {
		const index = Number(indexValue)
		if (!Number.isFinite(index)) return false
		const before = findObservedIndexedItem(preObservation, index)
		const after = findObservedIndexedItem(postObservation, index)
		if (!before || !after) return false
		return readObservedValueSignature(before) !== readObservedValueSignature(after)
	}

	function hasSearchWorkflowFieldCleared(preObservation, postObservation, input) {
		const index = Number(input?.workflow_field_index)
		if (!Number.isFinite(index)) return false
		const before = findObservedIndexedItem(preObservation, index)
		const after = findObservedIndexedItem(postObservation, index)
		if (!before || !after) return false
		return isObservedFilled(before) && !isObservedFilled(after)
	}

	function findObservedIndexedItem(observation, index) {
		for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
			for (const field of (Array.isArray(form?.fields) ? form.fields : [])) {
				if (Number(field?.index) === index) return field
			}
		}
		for (const listName of ['elements', 'actions']) {
			for (const item of (Array.isArray(observation?.[listName]) ? observation[listName] : [])) {
				if (Number(item?.index) === index) return item
			}
		}
		return null
	}

	function readObservedValueSignature(item) {
		return String([
			item?.valueState,
			item?.value,
			item?.selected,
			item?.checked,
			item?.expandedState,
		].filter((part) => part !== undefined && part !== null).join('|')).trim()
	}

	function isObservedFilled(item) {
		const signature = readObservedValueSignature(item).toLowerCase()
		if (!signature) return false
		if (/filled:|selected:/.test(signature)) return true
		if (/\bchecked\b|\btrue\b/.test(signature)) return true
		const parts = signature.split('|').map((part) => part.trim()).filter(Boolean)
		return parts.some((part) => !/^(empty|unknown|false|null|undefined|-)$/.test(part))
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

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
	}

	g.NC_BG_VERIFIER = {
		shouldVerifyAction,
		verifyExecutionOutcome,
	}
})(globalThis)
