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
		VALUE_CHANGED: 'value_changed',
		STATE_CHANGED: 'state_changed',
		OPTIONS_VISIBLE: 'options_visible',
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

	function shouldVerifyFailedExecution(action, execution) {
		if (!action || execution?.success !== false) return false
		if (!shouldVerifyAction(action)) return false
		const text = [
			execution?.message,
			execution?.error,
			execution?.meta?.outcome?.reason,
			execution?.meta?.outcome?.kind,
		].map((part) => String(part || '')).join(' ')
		if (!/(超时|timeout|未响应|已放弃等待|通信超时)/i.test(text)) return false
		const name = getEffectiveVerificationActionName(action)
		return [
			'input_text',
			'type',
			'open_dropdown',
			'choose_dropdown_option',
			'select_dropdown_option',
			'select_checkbox_option',
			'select_cascader_path',
			'click',
			'click_element_by_index',
		].includes(name)
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
			const fallbackVerdict = evaluateMissingPostObservationStructuredOutcome(action, execution)
			if (fallbackVerdict) return fallbackVerdict
			return { ok: false, reason: post?.error || '无法获取动作后页面状态' }
		}

		const postObs = post.data
		const input = action?.input || {}
		const urlChanged = String(postObs.url || '') !== String(preObservation.url || '')
		const domChanged = String(postObs.content || '') !== String(preObservation.content || '')
		const dialogCloseVerdict = detectUnexpectedDialogCloseAfterFieldAction(action, preObservation, postObs)
		if (dialogCloseVerdict) return dialogCloseVerdict

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
			const shouldVerifyEmpty = isSearchWorkflowStep(action, 'clear_field')
			if (!expected && !shouldVerifyEmpty) return { ok: true, reason: '输入文本为空，跳过校验' }

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

			const outcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: false })
			if (outcomeVerdict) return outcomeVerdict

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
			if (isFormSubmitAction(action, preObservation)) {
				return evaluateFormSubmitAction(action, preObservation, postObs, execution, urlChanged, domChanged)
			}
			const createEntryVerdict = evaluateCreateEntryClick(action, preObservation, postObs, urlChanged)
			if (createEntryVerdict) return createEntryVerdict
			if (isDropdownSelectionCommitAction(action)) {
				if (hasObservedIndexedTargetValueChanged(preObservation, postObs, input.index)) {
					return { ok: true, reason: '下拉选择后字段值已变化' }
				}
				if (hasObservedIndexedTargetValueSatisfied(postObs, input.index, action)) {
					return { ok: true, reason: '下拉/级联选择后字段值已满足目标值' }
				}
				if (isDateSelectionCommitAction(action, preObservation) && hasDateSelectionProgress(preObservation, postObs, action)) {
					return { ok: true, reason: '日期/时间选择后观察到日期候选或字段状态变化' }
				}
				const finalOutcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: true })
				if (finalOutcomeVerdict) return finalOutcomeVerdict
				return { ok: false, reason: '下拉选择后未观察到字段值或选项状态变化' }
			}
			const outcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: false })
			if (outcomeVerdict) return outcomeVerdict
			if (hasExecutionStateChange(execution)) return { ok: true, reason: '执行返回状态已变化' }
			if (isSearchWorkflowStep(action, 'submit_search')) {
				return evaluateSearchSubmitAction(action, preObservation, postObs, execution, urlChanged, domChanged)
			}
			if (isSearchWorkflowStep(action, 'reset_filters')) {
				const clearState = getSearchWorkflowClearState(preObservation, postObs, input)
				if (clearState.ok) {
					return {
						ok: true,
						reason: clearState.alreadyEmpty
							? '搜索重置后目标字段已处于空状态'
							: '搜索重置后字段已清空',
					}
				}
				const networkClearState = getSearchWorkflowNetworkResetState(preObservation, postObs, input)
				if (networkClearState.ok) {
					return {
						ok: true,
						reason: `搜索重置后接口请求字段已不再携带旧筛选值（${networkClearState.detail}）`,
					}
				}
				if (hasSearchWorkflowTrackedResetFields(input)) {
					const detail = formatSearchWorkflowClearStateDetail(clearState)
					return {
						ok: false,
						reason: `search_reset_field_not_cleared: 搜索重置后已知筛选字段仍未清空（${detail}）`,
						outcome: createVerifierOutcome(OUTCOME_KIND.NO_EFFECT, {
							reason: 'search_reset_field_not_cleared',
							clearState: summarizeSearchWorkflowClearStateForOutcome(clearState),
						}),
					}
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
		const delays = getPostObservationRetryDelays(action, execution, effectiveName, preObservation)
		let last = null
		for (const delay of delays) {
			if (delay > 0) await sleep(delay)
			last = await requestObservation(session.currentTabId)
			if (!last?.ok) continue
			if (isPostObservationSatisfied(action, execution, preObservation, last.data)) return last
		}
		return last
	}

	function getPostObservationRetryDelays(action, execution, effectiveName, preObservation) {
		if (isFormSubmitAction(action, preObservation)) return [0, 700, 1600, 3000]
		if (isDropdownOpenProbeAction(action)) {
			const visibleOptions = execution?.meta?.visibleOptions
			return Array.isArray(visibleOptions) && visibleOptions.length > 0
				? [0]
				: [0, 350, 900, 1400]
		}
		if (!shouldRetryPostObservation(action, execution, effectiveName, preObservation)) return [0]
		return [0, 450, 1100]
	}

	function shouldRetryPostObservation(action, execution, effectiveName, preObservation) {
		if (isFormSubmitAction(action, preObservation)) return true
		if (isCreateEntryClickAction(action, preObservation)) return true
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
				return hasObservedIndexedTargetValueChanged(preObservation, postObservation, index) ||
					hasObservedIndexedTargetValueSatisfied(postObservation, index, action) ||
					(isDateSelectionCommitAction(action, preObservation) && hasDateSelectionProgress(preObservation, postObservation, action))
			}
		}
		if (isFormSubmitAction(action, preObservation)) {
			return hasFormSubmitProgress(preObservation, postObservation)
		}
		if (isSearchWorkflowStep(action, 'submit_search')) {
			return hasSearchSubmitProgress(preObservation, postObservation)
		}
		if (isSearchWorkflowStep(action, 'reset_filters')) {
			const input = action?.input || {}
			if (hasSearchWorkflowTrackedResetFields(input)) {
				return getSearchWorkflowClearState(preObservation, postObservation, input).ok ||
					getSearchWorkflowNetworkResetState(preObservation, postObservation, input).ok
			}
			return hasPostObservationProgress(preObservation, postObservation) ||
				buildTableSummarySignature(preObservation) !== buildTableSummarySignature(postObservation)
		}
		if (isCreateEntryClickAction(action, preObservation)) {
			return hasCreateEntryClickReachedExpectedState(preObservation, postObservation)
		}
		return hasPostObservationProgress(preObservation, postObservation)
	}

	function hasPostObservationProgress(preObservation, postObservation) {
		if (!postObservation) return false
		if (String(postObservation.url || '') !== String(preObservation?.url || '')) return true
		if (String(postObservation.content || '') !== String(preObservation?.content || '')) return true
		return false
	}

	function hasSearchSubmitProgress(preObservation, postObservation) {
		if (hasPostObservationProgress(preObservation, postObservation)) return true
		if (buildTableSummarySignature(preObservation) !== buildTableSummarySignature(postObservation)) return true
		const feedback = getSearchSubmitFeedback(preObservation, postObservation)
		return !!(feedback.success || feedback.empty || feedback.error)
	}

	function evaluateSearchSubmitAction(action, preObservation, postObservation, execution, urlChanged, domChanged) {
		const feedback = getSearchSubmitFeedback(preObservation, postObservation)
		const tableChanged = buildTableSummarySignature(preObservation) !== buildTableSummarySignature(postObservation)
		const evidence = summarizeSearchSubmitEvidence(preObservation, postObservation, urlChanged, domChanged, tableChanged, feedback)
		if (urlChanged) return { ok: true, reason: `搜索提交后 URL 已变化（${evidence}）` }
		if (domChanged) return { ok: true, reason: `搜索提交后 DOM 摘要已变化（${evidence}）` }
		if (tableChanged) return { ok: true, reason: `搜索提交后表格/列表摘要已变化（${evidence}）` }
		if (feedback.success) return { ok: true, reason: `搜索提交后观察到结果反馈: ${feedback.success}（${evidence}）` }
		if (feedback.empty) return { ok: true, reason: `搜索提交后观察到空结果反馈: ${feedback.empty}（${evidence}）` }
		if (feedback.error) {
			return {
				ok: false,
				reason: `search_submit_failed: 搜索提交后观察到失败/错误反馈: ${feedback.error}（${evidence}）`,
				outcome: createVerifierOutcome(OUTCOME_KIND.NO_EFFECT, {
					reason: feedback.error,
				}),
			}
		}
		const finalOutcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: true })
		if (finalOutcomeVerdict) return finalOutcomeVerdict
		return {
			ok: false,
			reason: `search_submit_no_feedback: 搜索提交后未观察到 URL、DOM、表格/列表摘要或结果反馈变化（${evidence}）`,
			outcome: createVerifierOutcome(OUTCOME_KIND.NO_EFFECT, {
				reason: 'search_submit_no_feedback',
			}),
		}
	}

	function summarizeSearchSubmitEvidence(preObservation, postObservation, urlChanged, domChanged, tableChanged, feedback) {
		return [
			`urlChanged=${urlChanged ? 'true' : 'false'}`,
			`domChanged=${domChanged ? 'true' : 'false'}`,
			`tableChanged=${tableChanged ? 'true' : 'false'}`,
			`tables=${countObservedTables(preObservation)}->${countObservedTables(postObservation)}`,
			feedback?.success ? `success="${feedback.success}"` : '',
			feedback?.empty ? `empty="${feedback.empty}"` : '',
			feedback?.error ? `error="${feedback.error}"` : '',
		].filter(Boolean).join(' ')
	}

	function hasFormSubmitProgress(preObservation, postObservation) {
		if (!postObservation) return false
		if (String(postObservation.url || '') !== String(preObservation?.url || '')) return true
		if (hasDialogClosed(preObservation, postObservation)) return true
		const feedback = getFormSubmitFeedback(preObservation, postObservation)
		if (feedback.success || feedback.error) return true
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

	function evaluateMissingPostObservationStructuredOutcome(action, execution) {
		const name = getEffectiveVerificationActionName(action)
		const verdict = evaluateStructuredOutcome(execution, { finalNoEffect: false })
		if ((name === 'input_text' || name === 'type') && verdict?.ok) {
			return {
				...verdict,
				reason: `${verdict.reason}；动作后观察暂不可用，采用输入执行层结构化结果`,
			}
		}
		if (isDropdownSelectionCommitAction(action) && verdict?.ok) {
			return {
				...verdict,
				reason: `${verdict.reason}；动作后观察暂不可用，采用选择执行层结构化结果`,
			}
		}
		if (isSearchWorkflowStep(action, 'submit_search') && execution?.success !== false) {
			return {
				ok: true,
				reason: '搜索提交动作已执行；动作后观察暂不可用，交由搜索工作流记录为已提交待观察并继续恢复。',
				outcome: createVerifierOutcome(OUTCOME_KIND.STATE_CHANGED, {
					reason: 'search_submit_post_observation_unavailable',
				}),
			}
		}
		if (isSearchWorkflowStep(action, 'reset_filters') && verdict?.ok) {
			return {
				...verdict,
				reason: `${verdict.reason}；搜索重置动作已执行且动作后观察暂不可用，采用执行层结构化结果并继续后续字段。`,
				outcome: createVerifierOutcome(OUTCOME_KIND.STATE_CHANGED, {
					reason: 'search_reset_post_observation_unavailable',
				}),
			}
		}
		return null
	}

	function getEffectiveVerificationActionName(action) {
		const name = String(action?.name || '')
		if (name !== 'locate_by_vision') return name
		return getActionInputText(action) ? 'input_text' : 'click_element_by_index'
	}

	function getActionInputText(action) {
		const input = action?.input || {}
		if (Object.prototype.hasOwnProperty.call(input, 'text')) return String(input.text || '').trim()
		if (Object.prototype.hasOwnProperty.call(input, 'value')) return String(input.value || '').trim()
		return ''
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

	function evaluateFormSubmitAction(action, preObservation, postObservation, execution, urlChanged, domChanged) {
		const feedback = getFormSubmitFeedback(preObservation, postObservation)
		const evidence = summarizeFormSubmitEvidence(preObservation, postObservation, urlChanged, domChanged, feedback)
		if (urlChanged) return { ok: true, reason: `表单提交后 URL 已变化（${evidence}）` }
		if (hasDialogClosed(preObservation, postObservation)) return { ok: true, reason: `表单提交后弹层已关闭（${evidence}）` }
		if (feedback.success) return { ok: true, reason: `表单提交后观察到成功反馈: ${feedback.success}（${evidence}）` }
		if (feedback.error) {
			return {
				ok: false,
				reason: `form_submit_failed: 表单提交后观察到错误/校验提示: ${feedback.error}（${evidence}）`,
				outcome: createVerifierOutcome(OUTCOME_KIND.NO_EFFECT, {
					reason: feedback.error,
				}),
			}
		}
		if (hasPersistentDialogForm(preObservation, postObservation)) {
			return {
				ok: false,
				reason: `form_submit_dialog_still_open: 表单提交后弹层仍打开，未观察到成功反馈或关闭（${evidence}）`,
				outcome: createVerifierOutcome(OUTCOME_KIND.NO_EFFECT, {
					reason: 'form_submit_dialog_still_open',
				}),
			}
		}
		const outcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: false })
		if (outcomeVerdict?.ok) return outcomeVerdict
		if (domChanged) return { ok: true, reason: '表单提交后 DOM 摘要已变化' }
		const finalOutcomeVerdict = evaluateStructuredOutcome(execution, { finalNoEffect: true })
		if (finalOutcomeVerdict) return finalOutcomeVerdict
		return {
			ok: false,
			reason: `form_submit_no_feedback: 表单提交后未观察到成功反馈、错误提示、弹层关闭或页面变化（${evidence}）`,
			outcome: createVerifierOutcome(OUTCOME_KIND.NO_EFFECT, {
				reason: 'form_submit_no_feedback',
			}),
		}
	}

	function isFormSubmitAction(action, preObservation) {
		const name = getEffectiveVerificationActionName(action)
		if (name !== 'click' && name !== 'click_element_by_index') return false
		const input = action?.input || {}
		if (String(input.workflow_step || '') === 'submit_form_timeout_recovery') return true
		if (isSubmitLabel(input.workflow_submit_label || input.target_label || input.label || input.text || input.target_description)) {
			return true
		}
		const index = Number(input.index)
		if (!Number.isFinite(index)) return false
		const item = findObservedIndexedItem(preObservation, index)
		if (!item) return false
		return isSubmitLabel(getObservedItemLabel(item))
	}

	function isSubmitLabel(value) {
		const label = normalizeVerifierKey(value)
		return /^(保存|提交|确定|完成|确认|save|submit|ok|confirm|done)$/.test(label)
	}

	function evaluateCreateEntryClick(action, preObservation, postObservation, urlChanged) {
		if (!isCreateEntryClickAction(action, preObservation)) return null
		const evidence = summarizeCreateEntryClickEvidence(preObservation, postObservation)
		if (urlChanged) return { ok: true, reason: '创建入口点击后 URL 已变化' }
		if (evidence.reached) {
			return { ok: true, reason: `创建入口点击后观察到目标状态: ${evidence.reason}` }
		}
		return {
			ok: false,
			reason: `create_form_not_opened: 创建入口点击后未观察到新增表单/弹层字段或创建选项（${evidence.reason}），不能仅凭 DOM 摘要变化判定成功`,
		}
	}

	function hasCreateEntryClickReachedExpectedState(preObservation, postObservation) {
		if (String(postObservation?.url || '') !== String(preObservation?.url || '')) return true
		return summarizeCreateEntryClickEvidence(preObservation, postObservation).reached
	}

	function hasDialogClosed(preObservation, postObservation) {
		return hasObservedDialogForm(preObservation) && !hasObservedDialogForm(postObservation)
	}

	function hasPersistentDialogForm(preObservation, postObservation) {
		return hasObservedDialogForm(preObservation) && hasObservedDialogForm(postObservation)
	}

	function summarizeFormSubmitEvidence(preObservation, postObservation, urlChanged, domChanged, feedback) {
		return [
			`urlChanged=${urlChanged ? 'true' : 'false'}`,
			`domChanged=${domChanged ? 'true' : 'false'}`,
			`dialog=${hasObservedDialogForm(preObservation) ? 'open' : 'none'}->${hasObservedDialogForm(postObservation) ? 'open' : 'none'}`,
			`forms=${countObservedForms(preObservation)}->${countObservedForms(postObservation)}`,
			feedback?.success ? `success="${feedback.success}"` : '',
			feedback?.error ? `error="${feedback.error}"` : '',
		].filter(Boolean).join(' ')
	}

	function countObservedForms(observation) {
		return (Array.isArray(observation?.forms) ? observation.forms : []).length
	}

	function countObservedTables(observation) {
		return Array.isArray(observation?.tables) ? observation.tables.length : 0
	}

	function buildTableSummarySignature(observation) {
		return JSON.stringify((Array.isArray(observation?.tables) ? observation.tables : []).map((table) => ({
			kind: String(table?.kind || ''),
			headers: (Array.isArray(table?.headers) ? table.headers : []).map((item) => String(item || '').trim()).slice(0, 20),
			rows: (Array.isArray(table?.rows) ? table.rows : [])
				.slice(0, 12)
				.map((row) => (Array.isArray(row) ? row : [row]).map((cell) => String(cell || '').trim()).slice(0, 12)),
		})))
	}

	function getFormSubmitFeedback(preObservation, postObservation) {
		const before = collectObservationFeedbackText(preObservation)
		const afterText = collectObservationFeedbackText(postObservation)
		const after = afterText
			.split(/\n+/)
			.map((line) => line.trim())
			.filter((line) => line && !before.includes(line))
			.join('\n') || afterText
		const success = findFirstFeedback(after, [
			/操作成功|保存成功|提交成功|新增成功|创建成功|处理成功|已保存|已提交|成功保存|success(?:ful)?|saved|submitted|created/i,
		])
		const error = findFirstFeedback(after, [
			/不能为空|必填|请选择|请输入|请填写|请录入|校验失败|验证失败|格式错误|重复|已存在|已经存在|不能重复|唯一|保存失败|提交失败|操作失败|请求失败|提交异常|保存异常|is\s+required|required\s+field|invalid\s+(?:value|input|format)|duplicate|already\s+exists|\bunique\b|\berror\s*:|\bfailed\b/i,
		])
		return { success, error }
	}

	function getSearchSubmitFeedback(preObservation, postObservation) {
		const before = collectObservationFeedbackText(preObservation)
		const afterText = collectObservationFeedbackText(postObservation)
		const after = afterText
			.split(/\n+/)
			.map((line) => line.trim())
			.filter((line) => line && !before.includes(line))
			.join('\n') || afterText
		const success = findFirstFeedback(after, [
			/搜索成功|查询成功|筛选成功|过滤成功|搜索完成|查询完成|筛选完成|过滤完成|结果已更新|列表已刷新|results?\s+(?:updated|loaded|refreshed)|search\s+(?:complete|completed|success)/i,
		])
		const empty = findFirstFeedback(after, [
			/暂无数据|无数据|没有数据|暂无结果|无结果|未找到|没有匹配|no\s+(?:data|records|results|matches)|empty\s+result/i,
		])
		const error = findFirstFeedback(after, [
			/搜索失败|查询失败|筛选失败|过滤失败|搜索异常|查询异常|筛选异常|请求失败|加载失败|search\s+failed|query\s+failed|filter\s+failed|request\s+failed|load(?:ing)?\s+failed/i,
		])
		return { success, empty, error }
	}

	function collectObservationFeedbackText(observation) {
		const parts = [
			observation?.title,
			observation?.content,
			...(Array.isArray(observation?.rawCandidates) ? observation.rawCandidates : []),
		]
		for (const item of (Array.isArray(observation?.feedback) ? observation.feedback : [])) {
			parts.push(item?.text, item?.message, item?.kind)
		}
		for (const listName of ['actions', 'elements', 'options', 'popups']) {
			for (const item of (Array.isArray(observation?.[listName]) ? observation[listName] : [])) {
				parts.push(item?.label, item?.text, item?.valueState, item?.validationMessage, item?.error)
			}
		}
		for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
			parts.push(form?.name)
			for (const field of (Array.isArray(form?.fields) ? form.fields : [])) {
				parts.push(field?.label, field?.text, field?.placeholder, field?.valueState, field?.validationMessage, field?.error)
			}
		}
		return parts.map(sanitizeFeedbackText).filter(Boolean).join('\n')
	}

	function sanitizeFeedbackText(value) {
		return String(value || '')
			.replace(/\b(required|invalid)=false\b/gi, '')
			.replace(/\berror=""\b/gi, '')
			.replace(/\bprogress=false\b/gi, '')
			.trim()
	}

	function findFirstFeedback(text, patterns) {
		const source = String(text || '')
		const lines = source
			.split(/\n+/)
			.map((line) => line.trim())
			.filter(Boolean)
		for (const line of lines) {
			for (const pattern of patterns) {
				const match = line.match(pattern)
				if (match?.[0]) return compactFeedbackLine(line, match.index || 0)
			}
		}
		for (const pattern of patterns) {
			const match = source.match(pattern)
			if (match?.[0]) return compactFeedbackLine(source, match.index || 0)
		}
		return ''
	}

	function compactFeedbackLine(value, matchIndex) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		if (text.length <= 160) return text
		const center = Math.max(0, Number(matchIndex) || 0)
		const start = Math.max(0, center - 60)
		const end = Math.min(text.length, center + 100)
		return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`
	}

	function summarizeCreateEntryClickEvidence(preObservation, postObservation) {
		const before = collectCreateFormEvidence(preObservation)
		const after = collectCreateFormEvidence(postObservation)
		if (after.createNamedForms > before.createNamedForms && after.structuredFields > 0) {
			return {
				reached: true,
				reason: `create_named_forms ${before.createNamedForms}->${after.createNamedForms}`,
			}
		}
		if (after.dialogFields >= 2 && after.dialogFields > before.dialogFields) {
			return {
				reached: true,
				reason: `dialog_fields ${before.dialogFields}->${after.dialogFields}`,
			}
		}
		if (after.structuredFields >= 2 && after.structuredFields > before.structuredFields && after.denseForms >= before.denseForms) {
			return {
				reached: true,
				reason: `structured_fields ${before.structuredFields}->${after.structuredFields}`,
			}
		}
		if (after.createOptions > before.createOptions) {
			return {
				reached: true,
				reason: `create_options ${before.createOptions}->${after.createOptions}`,
			}
		}
		return {
			reached: false,
			reason: `forms ${before.forms}->${after.forms}, structured_fields ${before.structuredFields}->${after.structuredFields}, dialog_fields ${before.dialogFields}->${after.dialogFields}, create_named_forms ${before.createNamedForms}->${after.createNamedForms}, create_options ${before.createOptions}->${after.createOptions}`,
		}
	}

	function collectCreateFormEvidence(observation) {
		const evidence = {
			forms: 0,
			structuredFields: 0,
			dialogFields: 0,
			createNamedForms: 0,
			denseForms: 0,
			createOptions: 0,
		}
		for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
			evidence.forms += 1
			const fields = (Array.isArray(form?.fields) ? form.fields : [])
				.filter((field) => isStructuredCreateFormField(field))
			const formName = normalizeVerifierKey(form?.name || form?.id || '')
			evidence.structuredFields += fields.length
			evidence.dialogFields += fields.filter((field) => isObservedDialogItem(field)).length
			if (fields.length >= 1 && /(弹层|dialog|modal|drawer|新增|新建|创建|添加|create|new|add)/i.test(formName)) {
				evidence.createNamedForms += 1
			}
			if (fields.length >= 2 && !/(搜索|筛选|filter|search)/i.test(formName)) {
				evidence.denseForms += 1
			}
		}
		for (const item of getObservedChoiceCandidates(observation)) {
			const label = normalizeVerifierKey(getObservedItemLabel(item))
			if (!label || label === '(empty)') continue
			if (/(新增|新建|创建|添加|增加|add|create|new)/i.test(label)) {
				evidence.createOptions += 1
			}
		}
		return evidence
	}

	function isStructuredCreateFormField(item) {
		if (!item || typeof item !== 'object') return false
		const region = normalizeVerifierKey(item.region)
		if (/^(header|sidebar|pagination)$/.test(region)) return false
		const role = normalizeVerifierKey(item.role)
		if (/^(button|link|menuitem|option|checkbox|radio|switch|tab)$/.test(role)) return false
		const label = getObservedItemLabel(item)
		const key = normalizeVerifierKey(label)
		if (!key || key === '(empty)') return false
		return true
	}

	function isCreateEntryClickAction(action, preObservation) {
		const name = getEffectiveVerificationActionName(action)
		if (name !== 'click' && name !== 'click_element_by_index') return false
		if (isFormSubmitAction(action, preObservation)) return false
		const input = action?.input || {}
		const workflowStep = String(input.workflow_step || '').trim()
		if (workflowStep === 'open_create_form_timeout_recovery') return true
		if (isCreateEntryLabel(input.target_label || input.label || input.text || input.target_description)) {
			return true
		}
		const index = Number(input.index)
		if (!Number.isFinite(index)) return false
		const item = findObservedIndexedItem(preObservation, index)
		if (!item) return false
		const label = getObservedItemLabel(item)
		if (isCreateEntryLabel(label)) return true
		if (isSubmitLabel(label)) return false
		const role = normalizeVerifierKey(item.role)
		const intent = normalizeVerifierKey(item.actionIntent || item.intent)
		return /^(button|link)$/.test(role) &&
			/(新增|新建|创建|添加|增加|add|create|new)/i.test(intent) &&
			!isNonCreateEntryActionLabel(label)
	}

	function isCreateEntryLabel(value) {
		const label = normalizeVerifierKey(value)
		if (!label) return false
		if (/^(新增|新建|创建|添加|增加|add|create|new|\+)$/.test(label)) return true
		if (/^(新增|新建|创建|添加|增加)[\u4e00-\u9fa5A-Za-z0-9_-]{1,8}$/.test(label)) {
			return true
		}
		if (/^(add|create|new)[A-Za-z0-9_-]{1,16}$/i.test(label)) return true
		return false
	}

	function isNonCreateEntryActionLabel(value) {
		const label = normalizeVerifierKey(value)
		if (!label) return false
		if (/^(新增|新建|创建|添加|增加|add|create|new|\+)/i.test(label)) return false
		return /^(导入|导出|搜索|查询|重置|清空|删除|编辑|修改|提交|保存|取消|返回|详情|查看|import|export|search|query|reset|clear|delete|edit|submit|save|cancel|back|view)$/i.test(label)
	}

	function detectUnexpectedDialogCloseAfterFieldAction(action, preObservation, postObservation) {
		if (!isDialogFieldAction(action)) return null
		const index = Number(action?.input?.index)
		if (!Number.isFinite(index)) return null
		const targetBefore = findObservedIndexedItem(preObservation, index)
		if (!isObservedDialogItem(targetBefore)) return null
		if (hasObservedDialogForm(postObservation)) return null
		return {
			ok: false,
			reason: '字段动作后弹层消失，疑似点击了弹层外遮罩或触发了关闭；本次不应视为填写成功',
		}
	}

	function isDialogFieldAction(action) {
		const name = String(action?.name || '')
		return [
			'input_text',
			'type',
			'open_dropdown',
			'choose_dropdown_option',
			'select_dropdown_option',
			'select_checkbox_option',
			'select_cascader_path',
		].includes(name)
	}

	function hasObservedDialogForm(observation) {
		return (Array.isArray(observation?.forms) ? observation.forms : [])
			.some((form) => isObservedDialogForm(form))
	}

	function isObservedDialogForm(form) {
		if (!form || typeof form !== 'object') return false
		const name = String(form.name || form.id || '').toLowerCase()
		if (/弹层|dialog|modal|drawer/.test(name)) return true
		return (Array.isArray(form.fields) ? form.fields : [])
			.some((field) => isObservedDialogItem(field))
	}

	function isObservedDialogItem(item) {
		if (!item || typeof item !== 'object') return false
		const region = String(item.region || '').toLowerCase()
		if (region === 'dialog') return true
		const container = String(item.container || item.formName || '').toLowerCase()
		return /弹层|dialog|modal|drawer/.test(container)
	}

	function isSearchWorkflowStep(action, step) {
		const input = action?.input || {}
		const workflowStep = String(input.workflow_step || '')
		if (workflowStep !== String(step || '')) return false
		if (String(input.workflow || '') === 'search-fields') return true
		return /^(expand_search_panel|fill_field|open_dropdown|select_option|submit_search|reset_filters|clear_field|finish_search_fields)$/.test(workflowStep)
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

	function hasObservedIndexedTargetValueSatisfied(observation, indexValue, action) {
		const index = Number(indexValue)
		if (!Number.isFinite(index)) return false
		const item = findObservedIndexedItem(observation, index)
		if (!item) return false
		const actual = normalizeVerifierKey(readObservedValueSignature(item))
		if (!actual) return false
		const input = action?.input || {}
		const expectedParts = []
		if (Array.isArray(input.path)) expectedParts.push(...input.path)
		else if (String(input.path || '').trim()) expectedParts.push(...String(input.path).split(/[>\/,，、]+/))
		expectedParts.push(input.text, input.label, input.workflow_requested_text)
		const expected = expectedParts
			.map((part) => normalizeVerifierKey(part))
			.filter(Boolean)
			.filter((part) => !/^(empty|unknown|null|undefined|-)$/.test(part))
		if (!expected.length) return false
		if (hasExpectedDateTokensSatisfied(item, expected)) return true
		if (hasExpectedTimeTokensSatisfied(item, expectedParts)) return true
		return expected.every((part) => actual.includes(part))
	}

	function hasSearchWorkflowFieldCleared(preObservation, postObservation, input) {
		return getSearchWorkflowClearState(preObservation, postObservation, input).ok
	}

	function getSearchWorkflowClearState(preObservation, postObservation, input) {
		const indexes = getSearchWorkflowResetFieldIndexes(input)
		if (!indexes.length) return { ok: false, alreadyEmpty: false, observed: 0, total: 0, states: [] }
		const states = indexes.map((index) => {
			const beforeMatch = findObservedIndexedItemWithSource(preObservation, index)
			const afterMatch = findObservedIndexedItemWithSource(postObservation, index)
			const before = beforeMatch?.item || null
			const after = afterMatch?.item || null
			return {
				index,
				label: getObservedItemLabel(after || before),
				beforeSource: beforeMatch?.source || '',
				afterSource: afterMatch?.source || '',
				beforeValue: summarizeObservedValueForClearState(before),
				afterValue: summarizeObservedValueForClearState(after),
				observedBefore: !!before,
				observedAfter: !!after,
				wasFilled: !!before && isObservedFilled(before),
				nowFilled: !!after && isObservedFilled(after),
			}
		})
		const observed = states.filter((state) => !!state.observedAfter)
		if (!observed.length) {
			return {
				ok: false,
				alreadyEmpty: false,
				observed: 0,
				total: states.length,
				states,
				detail: formatSearchWorkflowClearStateDetail({ observed: 0, total: states.length, states }),
			}
		}
		const filledBefore = observed.filter((state) => state.wasFilled)
		if (filledBefore.length) {
			const ok = filledBefore.every((state) => !state.nowFilled)
			return {
				ok,
				alreadyEmpty: false,
				observed: observed.length,
				total: states.length,
				states,
				detail: formatSearchWorkflowClearStateDetail({ observed: observed.length, total: states.length, states }),
			}
		}
		const ok = observed.every((state) => !state.nowFilled)
		return {
			ok,
			alreadyEmpty: ok,
			observed: observed.length,
			total: states.length,
			states,
			detail: formatSearchWorkflowClearStateDetail({ observed: observed.length, total: states.length, states }),
		}
	}

	function hasSearchWorkflowTrackedResetFields(input) {
		return getSearchWorkflowResetFieldIndexes(input).length > 0
	}

	function getSearchWorkflowNetworkResetState(preObservation, postObservation, input) {
		const expected = normalizeVerifierKey(input?.workflow_test_value)
		const labels = getSearchWorkflowResetFieldLabels(input)
		if (!expected || !labels.length) {
			return { ok: false, beforeMatched: false, afterMatched: false, detail: '缺少字段标签或测试值' }
		}
		const before = collectNetworkRequestValueMatches(preObservation, labels, expected)
		const after = collectNetworkRequestValueMatches(postObservation, labels, expected)
		const postRequests = countNetworkRequestsWithFields(postObservation)
		const ok = before.matched && !after.matched && postRequests > 0
		return {
			ok,
			beforeMatched: before.matched,
			afterMatched: after.matched,
			detail: `requestValue ${before.count}->${after.count}, postRequests=${postRequests}, labels=${labels.join('|')}`,
		}
	}

	function getSearchWorkflowResetFieldLabels(input) {
		const raw = [
			input?.workflow_field_label,
			...String(input?.workflow_filled_fields || '').split(/[|,，、\s]+/),
		]
		const seen = new Set()
		const labels = []
		for (const value of raw) {
			const text = String(value || '').trim()
			const key = normalizeVerifierKey(text)
			if (!key || seen.has(key)) continue
			seen.add(key)
			labels.push(text)
		}
		return labels
	}

	function collectNetworkRequestValueMatches(observation, labels, expected) {
		let count = 0
		const matched = []
		const normalizedLabels = (Array.isArray(labels) ? labels : [])
			.map(normalizeVerifierKey)
			.filter(Boolean)
		for (const item of (Array.isArray(observation?.network) ? observation.network : [])) {
			for (const field of (Array.isArray(item?.requestFields) ? item.requestFields : [])) {
				if (!networkRequestFieldMatchesLabels(field, normalizedLabels)) continue
				const value = normalizeVerifierKey(field?.value)
				if (!value || value !== expected) continue
				count += 1
				matched.push(String(field?.path || field?.key || field?.label || '').trim())
			}
		}
		return { matched: count > 0, count, fields: matched }
	}

	function networkRequestFieldMatchesLabels(field, normalizedLabels) {
		if (!normalizedLabels.length) return false
		const key = normalizeVerifierKey([
			field?.key,
			field?.path,
			field?.label,
		].filter(Boolean).join('|'))
		if (!key) return false
		return normalizedLabels.some((label) => key.includes(label) || label.includes(key))
	}

	function countNetworkRequestsWithFields(observation) {
		return (Array.isArray(observation?.network) ? observation.network : [])
			.filter((item) => Array.isArray(item?.requestFields) && item.requestFields.length > 0)
			.length
	}

	function getSearchWorkflowResetFieldIndexes(input) {
		const raw = [
			input?.workflow_field_index,
			...String(input?.workflow_filled_field_indexes || '')
				.split(/[|,，、\s]+/)
				.filter(Boolean),
		]
		const seen = new Set()
		const indexes = []
		for (const value of raw) {
			const index = Number(value)
			if (!Number.isFinite(index) || seen.has(index)) continue
			seen.add(index)
			indexes.push(index)
		}
		return indexes
	}

	function findObservedIndexedItem(observation, index) {
		return findObservedIndexedItemWithSource(observation, index)?.item || null
	}

	function findObservedIndexedItemWithSource(observation, index) {
		for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
			for (const field of (Array.isArray(form?.fields) ? form.fields : [])) {
				if (Number(field?.index) === index) return { item: field, source: 'form' }
			}
		}
		for (const listName of ['elements', 'actions']) {
			for (const item of (Array.isArray(observation?.[listName]) ? observation[listName] : [])) {
				if (Number(item?.index) === index) return { item, source: listName }
			}
		}
		return null
	}

	function summarizeSearchWorkflowClearStateForOutcome(clearState) {
		return {
			observed: Number(clearState?.observed || 0),
			total: Number(clearState?.total || 0),
			detail: formatSearchWorkflowClearStateDetail(clearState),
			states: (Array.isArray(clearState?.states) ? clearState.states : []).map((state) => ({
				index: state.index,
				label: state.label,
				beforeSource: state.beforeSource,
				afterSource: state.afterSource,
				beforeValue: state.beforeValue,
				afterValue: state.afterValue,
				observedBefore: !!state.observedBefore,
				observedAfter: !!state.observedAfter,
				wasFilled: !!state.wasFilled,
				nowFilled: !!state.nowFilled,
			})),
		}
	}

	function formatSearchWorkflowClearStateDetail(clearState) {
		const states = Array.isArray(clearState?.states) ? clearState.states : []
		const observed = Number(clearState?.observed || 0)
		const total = Number(clearState?.total || states.length || 0)
		if (!states.length) return `观察字段 ${observed}/${total}`
		const uncleared = states.filter((state) => state.observedAfter && state.nowFilled)
		const missing = states.filter((state) => !state.observedAfter)
		const parts = []
		if (uncleared.length) {
			parts.push(`仍有值: ${uncleared.slice(0, 4).map(formatSearchWorkflowClearStateField).join('；')}`)
		}
		if (missing.length) {
			parts.push(`未观察到: ${missing.slice(0, 4).map(formatSearchWorkflowClearStateField).join('；')}`)
		}
		if (!parts.length) {
			parts.push(`观察字段 ${observed}/${total}`)
		}
		return parts.join('；')
	}

	function formatSearchWorkflowClearStateField(state) {
		const label = String(state?.label || '未命名字段').replace(/\s+/g, ' ').trim()
		const source = String(state?.afterSource || state?.beforeSource || 'unknown').trim()
		const before = state?.observedBefore ? String(state?.beforeValue || (state?.wasFilled ? 'filled' : 'empty')) : 'not_observed'
		const after = state?.observedAfter ? String(state?.afterValue || (state?.nowFilled ? 'filled' : 'empty')) : 'not_observed'
		return `${label}[index=${state?.index},source=${source},before=${before},after=${after}]`
	}

	function summarizeObservedValueForClearState(item) {
		if (!item) return ''
		const value = readObservedValueSignature(item).replace(/\s+/g, ' ').trim()
		const summary = value || (isObservedFilled(item) ? 'filled' : 'empty')
		return summary.length > 80 ? `${summary.slice(0, 77)}...` : summary
	}

	function getObservedItemLabel(item) {
		return String(item?.label || item?.text || item?.placeholder || item?.target_label || '').trim()
	}

	function normalizeVerifierKey(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
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

	function isDateSelectionCommitAction(action, preObservation) {
		if (!isDropdownSelectionCommitAction(action)) return false
		const input = action?.input || {}
		if (!extractDateTokens([input.text, input.label, input.workflow_requested_text].join(' ')).length) return false
		const index = Number(input.index)
		const item = Number.isFinite(index) ? findObservedIndexedItem(preObservation, index) : null
		if (!item) return true
		const typeText = normalizeVerifierKey([
			item.fieldType,
			item.type,
			item.selectionControl,
			item.control,
			item.role,
			getObservedItemLabel(item),
		].filter(Boolean).join(' '))
		return /(date|time|daterange|datetimerange|picker|日期|时间|起止|区间|范围)/i.test(typeText)
	}

	function hasDateSelectionProgress(preObservation, postObservation, action) {
		if (!hasPostObservationProgress(preObservation, postObservation)) {
			return hasObservedIndexedTargetValueSatisfied(postObservation, action?.input?.index, action)
		}
		const expectedDates = extractDateTokens([
			action?.input?.text,
			action?.input?.label,
			action?.input?.workflow_requested_text,
		].filter(Boolean).join(' '))
		if (!expectedDates.length) return false
		if (hasObservedIndexedTargetValueSatisfied(postObservation, action?.input?.index, action)) return true
		const selectedDates = extractDateTokens(collectSelectedChoiceText(postObservation))
		return expectedDates.some((date) => selectedDates.includes(date))
	}

	function hasExpectedDateTokensSatisfied(item, expectedParts) {
		const expectedDates = extractDateTokens(expectedParts.join(' '))
		if (!expectedDates.length) return false
		const actualDates = extractDateTokens([
			readObservedValueSignature(item),
			getObservedItemLabel(item),
			item?.placeholder,
			item?.text,
		].filter(Boolean).join(' '))
		if (!actualDates.length) return false
		return expectedDates.every((date) => actualDates.includes(date))
	}

	function hasExpectedTimeTokensSatisfied(item, expectedParts) {
		const expectedTimes = extractTimeTokens(expectedParts.join(' '))
		if (!expectedTimes.length) return false
		const actualTimes = extractTimeTokens([
			readObservedValueSignature(item),
			getObservedItemLabel(item),
			item?.placeholder,
			item?.text,
		].filter(Boolean).join(' '))
		if (!actualTimes.length) return false
		return expectedTimes.every((time) => actualTimes.includes(time))
	}

	function collectSelectedChoiceText(observation) {
		const parts = []
		for (const item of getObservedChoiceCandidates(observation)) {
			const selectedText = [
				item?.selected,
				item?.checked,
				item?.valueState,
				item?.state,
				item?.stateHints,
				item?.className,
				item?.classes,
				item?.ariaSelected,
				item?.ariaChecked,
			].filter(Boolean).join(' ')
			if (!/(true|selected|checked|active|current|range|start|end|in-range|is-selected|is-today)/i.test(selectedText)) continue
			parts.push(item?.label, item?.text, item?.value)
		}
		return parts.filter(Boolean).join(' ')
	}

	function extractDateTokens(value) {
		const source = String(value || '')
		const out = []
		const seen = new Set()
		const push = (year, month, day) => {
			const normalized = `${year}-${pad2(month)}-${pad2(day)}`
			if (seen.has(normalized)) return
			seen.add(normalized)
			out.push(normalized)
		}
		for (const match of source.matchAll(/(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})/g)) {
			push(match[1], match[2], match[3])
		}
		for (const match of source.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/g)) {
			push(match[1], match[2], match[3])
		}
		return out
	}

	function extractTimeTokens(value) {
		const source = String(value || '')
		const out = []
		const seen = new Set()
		for (const match of source.matchAll(/(?:^|[^\d])(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?(?=$|[^\d])/g)) {
			const normalized = normalizeTimeParts(match[1], match[2], match[3])
			if (!normalized || seen.has(normalized)) continue
			seen.add(normalized)
			out.push(normalized)
		}
		return out
	}

	function normalizeTimeParts(hour, minute, second = '') {
		const h = Number(hour)
		const m = Number(minute)
		const s = second === undefined || second === '' ? 0 : Number(second)
		if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return ''
		if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return ''
		const base = `${pad2(h)}:${pad2(m)}`
		return s ? `${base}:${pad2(s)}` : base
	}

	function pad2(value) {
		return String(Number(value)).padStart(2, '0')
	}

	function isObservedFilled(item) {
		if (!item || typeof item !== 'object') return false
		const valueState = String(item.valueState || '').trim().toLowerCase()
		if (/^(filled|selected):/.test(valueState)) return true
		if (/^(checked|selected|true)$/.test(valueState)) return true
		if (valueState && !isEmptyObservedValueToken(valueState)) return true
		const value = String(item.value ?? '').trim().toLowerCase()
		if (value && !isEmptyObservedValueToken(value)) return true
		const checked = String(item.checked ?? '').trim().toLowerCase()
		if (/^(true|checked|1)$/.test(checked)) return true
		const selected = String(item.selected ?? '').trim().toLowerCase()
		return /^(true|selected|1)$/.test(selected)
	}

	function isEmptyObservedValueToken(value) {
		const text = String(value || '').replace(/\s+/g, '').toLowerCase()
		return /^(empty|unknown|false|null|undefined|-|unchecked|unselected|collapsed|expanded|open|closed)$/.test(text)
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
		shouldVerifyFailedExecution,
		verifyExecutionOutcome,
	}
})(globalThis)
