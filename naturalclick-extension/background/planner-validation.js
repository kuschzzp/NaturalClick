;(function (g) {
	const plannerContext = g.NC_BG_PLANNER_CONTEXT
	if (!plannerContext) throw new Error('NC_BG_PLANNER_CONTEXT 未加载。')
	const actionContract = g.NC_ACTION_CONTRACT || null
	const controlSemantics = g.NC_CONTROL_SEMANTICS || null
	const { findObservedIndexMatches, shortText } = plannerContext

	function validateExecutableAction(action, observation, tabsSummary) {
		const name = String(action?.name || '').trim()
		const input = action?.input || {}
		const requiresIndex = new Set(['click_element_by_index', 'click', 'input_text', 'type', 'hover_element_by_index', 'open_dropdown'])
		const optionalIndex = new Set(['scroll', 'scroll_horizontally', 'select_dropdown_option', 'select_checkbox_option', 'select_cascader_path'])
		const hitCheckedIndex = new Set(['click_element_by_index', 'click', 'input_text', 'type', 'hover_element_by_index', 'open_dropdown'])
		if (requiresIndex.has(name)) {
			const indexError = validateObservedIndex(input.index, observation, true)
			if (indexError) return indexError
		}
		if (optionalIndex.has(name) && input.index !== undefined && input.index !== null && input.index !== '') {
			const indexError = validateObservedIndex(input.index, observation, true)
			if (indexError) return indexError
		}
		if (hitCheckedIndex.has(name)) {
			const hitError = validateIndexHitState(name, input.index, observation)
			if (hitError) return hitError
		}
		if (name === 'click_element_by_index' || name === 'click') {
			const clickTargetError = validateDirectClickTarget(input, observation, name)
			if (clickTargetError) return clickTargetError
			const clickIntentError = validateClickHasDeclaredTargetLabel(name, input)
			if (clickIntentError) return clickIntentError
		}
		const declaredTargetError = validateDeclaredTargetLabel(name, input, observation)
		if (declaredTargetError) return declaredTargetError
		if (name === 'hover_element_by_index') {
			const hoverIntentError = validateHoverHasDeclaredTargetLabel(name, input)
			if (hoverIntentError) return hoverIntentError
		}
		if (name === 'scroll' || name === 'scroll_horizontally') {
			const scrollIntentError = validateIndexedScrollHasDeclaredTargetLabel(name, input)
			if (scrollIntentError) return scrollIntentError
		}
		if (name === 'keypress') {
			const keypressIntentError = validateKeypressHasDeclaredIntent(name, input)
			if (keypressIntentError) return keypressIntentError
		}
		if ((name === 'input_text' || name === 'type') && !String(input.text || '').trim()) {
			return `${name} 缺少非空 text。`
		}
		if (name === 'input_text' || name === 'type') {
			const inputIntentError = validateInputHasDeclaredTargetLabel(name, input)
			if (inputIntentError) return inputIntentError
			const targetError = validateTextInputTarget(input.index, observation, name)
			if (targetError) return targetError
		}
		const hasSelectionText = !!String(input.text || input.label || '').trim()
		const hasIndexInput = input.index !== undefined && input.index !== null && input.index !== ''
		if (name === 'open_dropdown' && hasSelectionText) {
			return 'open_dropdown 只负责展开下拉框，不接受 text/label；要选择选项请使用 choose_dropdown_option。'
		}
		if (name === 'open_dropdown') {
			const targetError = validateDropdownTarget(input.index, observation, name)
			if (targetError) return targetError
			const selectionIntentError = validateSelectionHasDeclaredTargetLabel(name, input)
			if (selectionIntentError) return selectionIntentError
		}
		if (name === 'choose_dropdown_option' && !hasSelectionText) {
			return 'choose_dropdown_option 缺少待选择的 text/label。'
		}
		if (name === 'choose_dropdown_option' && !hasIndexInput) {
			return 'choose_dropdown_option 缺少目标字段 index；必须先 open_dropdown(index) 或 request_options_for(index) 确认候选后，再按该字段范围选择真实 text/label。'
		}
		if (name === 'choose_dropdown_option') {
			const indexError = validateObservedIndex(input.index, observation, true)
			if (indexError) return indexError
			const cascaderToolError = validateCascaderSelectionToolMismatch(input.index, observation, name)
			if (cascaderToolError) return cascaderToolError
			const targetError = validateDropdownTarget(input.index, observation, name)
			if (targetError) return targetError
			const selectionIntentError = validateSelectionHasDeclaredTargetLabel(name, input)
			if (selectionIntentError) return selectionIntentError
			const optionError = validateSelectionTextAgainstVisibleOptions(input.index, getActionSelectionText(input), observation, name, input)
			if (optionError) return optionError
		}
		if (name === 'select_dropdown_option' && !hasSelectionText && !hasIndexInput) {
			return 'select_dropdown_option 缺少 index 或待选择的 text/label。'
		}
		if (name === 'select_dropdown_option' && hasSelectionText && !hasIndexInput) {
			return 'select_dropdown_option 选择选项时缺少目标字段 index；必须先 open_dropdown(index) 或 request_options_for(index) 确认候选后，再按该字段范围选择真实 text/label。'
		}
		if (name === 'select_dropdown_option' && hasIndexInput) {
			const cascaderToolError = validateCascaderSelectionToolMismatch(input.index, observation, name)
			if (cascaderToolError) return cascaderToolError
			const targetError = validateDropdownTarget(input.index, observation, name)
			if (targetError) return targetError
			if (hasSelectionText) {
				const optionError = validateSelectionTextAgainstVisibleOptions(input.index, getActionSelectionText(input), observation, name, input)
				if (optionError) return optionError
			}
		}
		if (name === 'select_checkbox_option' && !hasSelectionText) {
			return 'select_checkbox_option 缺少待选择的 text/label。'
		}
		if (name === 'select_checkbox_option' && !hasIndexInput) {
			return 'select_checkbox_option 缺少目标字段 index；必须先 open_dropdown(index) 或 request_options_for(index) 确认候选后，再按该字段范围选择真实 text/label。'
		}
		if (name === 'select_checkbox_option' && hasIndexInput) {
			const selectionIntentError = validateSelectionHasDeclaredTargetLabel(name, input)
			if (selectionIntentError) return selectionIntentError
			const optionError = validateSelectionTextAgainstVisibleOptions(input.index, getActionSelectionText(input), observation, name, input)
			if (optionError) return optionError
		}
		if (name === 'select_cascader_path') {
			const pathValue = Array.isArray(input.path) ? input.path.join('') : String(input.path || '')
			if (!pathValue.trim()) return 'select_cascader_path 缺少 path。'
			if (!hasIndexInput) {
				return 'select_cascader_path 缺少目标字段 index；必须先定位级联字段 index，再按该字段范围选择真实路径。'
			}
			const selectionIntentError = validateSelectionHasDeclaredTargetLabel(name, input)
			if (selectionIntentError) return selectionIntentError
			const targetError = validateCascaderPathTarget(input.index, observation, name)
			if (targetError) return targetError
		}
		if (name === 'open_new_tab') {
			if (!/^https?:\/\//i.test(String(input.url || '').trim())) {
				return 'open_new_tab 缺少有效 http(s) url。'
			}
			const tabContextError = validateBrowserTabActionHasDeclaredContext(name, input)
			if (tabContextError) return tabContextError
		}
		if (name === 'switch_to_tab' || name === 'close_tab') {
			const tabId = Number(input.tab_id)
			if (!Number.isFinite(tabId)) return `${name} 缺少有效 tab_id。`
			const tab = (Array.isArray(tabsSummary) ? tabsSummary : []).find((item) => Number(item?.id) === tabId)
			if (!tab) return `${name} 指向当前标签列表中不存在的 tab_id=${input.tab_id}。`
			const tabContextError = validateBrowserTabActionHasDeclaredContext(name, input, {
				reasonRequired: name === 'close_tab',
			})
			if (tabContextError) return tabContextError
			const tabTargetError = validateBrowserTabDeclaredTargetMatches(name, input, tab)
			if (tabTargetError) return tabTargetError
		}
		if (name === 'wait' && !String(input.reason || input.purpose || '').trim()) {
			return 'wait 缺少 reason；等待页面、弹层或异步内容时必须说明正在等待什么，避免无意义拖慢任务。'
		}
		if (name === 'ask_user' && !String(input.question || input.text || '').trim()) {
			return 'ask_user 缺少 question。'
		}
		if (name === 'ask_user' && !String(input.reason || input.purpose || '').trim()) {
			return 'ask_user 缺少 reason；向用户提问前必须说明缺少什么信息、为什么需要用户介入。'
		}
		if (name === 'locate_by_vision' && !String(input.target_description || input.description || '').trim()) {
			return 'locate_by_vision 缺少 target_description，无法进行语义视觉定位。'
		}
		if (name === 'locate_by_vision') {
			const visionTargetError = validateDirectClickTarget(input, observation, name)
			if (visionTargetError) return visionTargetError
			const visionDescriptionError = validateVisionSelectionDescription(input, observation)
			if (visionDescriptionError) return visionDescriptionError
		}
		return ''
	}

	function validateActionAgainstHistory(action, session) {
		const name = normalizeActionName(action?.name)
		const input = action?.input || {}
		if (!isSelectionActionName(name)) return ''
		const currentIndex = normalizeOptionalIndex(input.index)
		const currentText = normalizeSelectionText(getActionSelectionText(input))
		const recent = Array.isArray(session?.history) ? session.history.slice(-8).reverse() : []
		for (const item of recent) {
			const historyName = normalizeActionName(item?.action)
			if (!isSelectionActionName(historyName)) continue
			const historyIndex = normalizeOptionalIndex(item?.input?.index)
			if (currentIndex !== null && historyIndex !== null && currentIndex !== historyIndex) continue
			const outcome = getHistoryOutcome(item)
			if (outcome.kind === 'failed') {
				const requested = outcome.requestedText
				const candidates = outcome.candidates
				if (selectionTextMatchesRequested(currentText, requested)) {
					return [
						`历史显示同一选择动作已经失败：index=${currentIndex ?? '-'} requested="${shortText(requested, 80)}" 未命中。`,
						candidates ? `可见候选为 "${shortText(candidates, 180)}"。` : '',
						'禁止重复同一个 requested；下一轮必须从 candidates 中选择真实候选，或先使用 request_options_for/重新展开字段确认候选。',
					].filter(Boolean).join('')
				}
			}
			if (outcome.kind === 'options_visible' && !currentText && currentIndex !== null) {
				const candidates = outcome.candidates
				if (candidates) {
					if (!visibleCandidatesLookReusableForRepeatedOpen(input, candidates, session)) continue
					return [
						`历史显示 index=${currentIndex} 的下拉候选已经可见，候选为 "${shortText(candidates, 180)}"。`,
						'不要重复只展开同一字段；下一轮必须选择 candidates 中的真实候选，或使用 request_options_for 获取更精确候选。',
					].join('')
				}
			}
		}
		return ''
	}

	function visibleCandidatesLookReusableForRepeatedOpen(input, candidates, session) {
		const values = splitCandidateText(candidates)
		if (!values.length) return false
		const expected = [
			input?.workflow_test_value,
			input?.text,
			input?.label,
			input?.value,
		].map(normalizeSelectionText).filter(Boolean)
		if (expected.length && values.some((item) => expected.some((target) => item.key === target || item.key.includes(target) || target.includes(item.key)))) {
			return true
		}
		const targetLabel = normalizeSelectionText(input?.target_label || input?.workflow_field_label || '')
		const searchFieldLabels = collectSearchWorkflowFieldLabels(session)
		const fieldLabelHits = values.filter((item) => searchFieldLabels.has(item.key))
		if (fieldLabelHits.length && (!targetLabel || !fieldLabelHits.some((item) => item.key === targetLabel))) {
			return false
		}
		const uiNoise = values.filter((item) => isLikelyUiOrNavigationCandidate(item.raw)).length
		const nonNoise = values.length - uiNoise
		if (targetLabel && !values.some((item) => item.key === targetLabel) && uiNoise >= 2 && values.length >= 5) {
			return false
		}
		if (uiNoise >= 2 && nonNoise <= Math.max(1, Math.floor(values.length / 3))) {
			return false
		}
		if (uiNoise >= Math.max(2, Math.ceil(values.length / 2))) {
			return false
		}
		return true
	}

	function splitCandidateText(candidates) {
		return String(candidates || '')
			.split(/[|,，;；、\n]+/)
			.map((raw) => String(raw || '').trim())
			.filter(Boolean)
			.map((raw) => ({ raw, key: normalizeSelectionText(raw) }))
			.filter((item) => item.key)
	}

	function collectSearchWorkflowFieldLabels(session) {
		const labels = new Set()
		const fields = session?.workflowState?.search?.fields || {}
		for (const field of Object.values(fields)) {
			for (const value of [
				field?.label,
				field?.workflow_field_label,
				field?.placeholder,
				field?.searchLabel,
			]) {
				const key = normalizeSelectionText(value)
				if (key) labels.add(key)
			}
		}
		return labels
	}

	function isLikelyUiOrNavigationCandidate(value) {
		const text = normalizeSelectionText(value)
		if (!text) return true
		if (/^(empty|unknown|null|undefined|-|--)$/.test(text)) return true
		return /(首页|菜单|更多|展开|收起|搜索内容|搜索|查询|筛选|重置|清空|新增|新建|导入|导出|详情|编辑|删除|操作|退出登录|个人信息|上一页|下一页|分页|返回|刷新|关闭|取消|确定|保存|提交)/i.test(text)
	}

	function isSelectionActionName(name) {
		return [
			'open_dropdown',
			'choose_dropdown_option',
			'select_dropdown_option',
			'select_checkbox_option',
			'select_cascader_path',
		].includes(String(name || ''))
	}

	function getActionSelectionText(input) {
		if (Array.isArray(input?.path)) return input.path.map((item) => String(item || '').trim()).filter(Boolean).join('>')
		return String(input?.text || input?.label || input?.value || input?.path || '').trim()
	}

	function selectionTextMatchesRequested(currentText, requested) {
		const requestedText = normalizeSelectionText(requested)
		if (!currentText || !requestedText) return false
		return currentText === requestedText || currentText.includes(requestedText)
	}

	function validateObservedIndex(value, observation, required) {
		if (!required && (value === undefined || value === null || value === '')) return ''
		const index = Number(value)
		if (!Number.isFinite(index)) return `动作索引无效：${value}`
		if (!hasObservedIndex(observation, index)) {
			return `动作索引 ${index} 不在当前观察到的可交互元素中。`
		}
		return ''
	}

	function hasObservedIndex(observation, index) {
		return findObservedIndexMatches(observation, index).length > 0
	}

	function validateIndexHitState(actionName, indexValue, observation) {
		const index = Number(indexValue)
		if (!Number.isFinite(index)) return ''
		const matches = findObservedIndexMatches(observation, index)
		if (!matches.length) return ''
		const actionable = matches.filter((match) => isHitStateRelevantSource(match.source))
		if (!actionable.length) return ''
		if (actionable.some((match) => isHittableHitState(match.item))) return ''
		const covered = actionable.find((match) => isCoveredHitState(match.item))
		if (!covered) return ''
		const item = covered.item || {}
		const blocker = String(item.hitBlocker || '').trim()
		const hit = [
			item.hitState ? `hit=${item.hitState}` : '',
			item.hitPoints ? `points=${item.hitPoints}` : '',
			Number.isFinite(Number(item.hitRatio)) ? `ratio=${Number(item.hitRatio)}` : '',
		].filter(Boolean).join(', ')
		return [
			`${actionName} 目标 index=${index} 当前被遮挡，不能直接对该 index 执行页面动作。`,
			hit ? `命中状态：${hit}。` : '',
			blocker ? `遮挡者：${shortText(blocker, 120)}。` : '',
			'请先选择当前弹层/下拉/日历中的真实候选，或使用 wait、inspect_index/inspect_region/request_context 重新定位可命中目标。',
		].filter(Boolean).join('')
	}

	function validateDirectClickTarget(input, observation, actionName) {
		if (isAllowedDirectSelectionClick(input)) return ''
		const index = Number(input?.index)
		if (!Number.isFinite(index)) return ''
		const matches = findObservedIndexMatches(observation, index)
		if (!matches.length) return ''
		const selectionOptionMatches = matches.filter((match) => isObservedSelectionOptionMatch(match))
		if (!selectionOptionMatches.length) return ''
		const nonOptionMatches = matches.filter((match) => !isOptionLikeSource(match.source) && !isObservedSelectionOptionMatch(match))
		if (nonOptionMatches.some((match) => isSafeDirectClickMatch(match))) return ''
		const item = selectionOptionMatches[0].item || {}
		const label = item.label || item.text || ''
		const control = item.selectionControl || item.controlKind || '-'
		const role = item.role || '-'
		return [
			`${actionName} 目标 index=${index} 是弹层/下拉中的选择候选（label="${shortText(label, 64)}", role=${role}, control=${control}），不能用普通点击绕过字段归属校验。`,
			'请改用带目标字段 index 的 choose_dropdown_option/select_checkbox_option/select_cascader_path，或先 request_options_for/open_dropdown/inspect_region 确认候选归属。',
		].join('')
	}

	function isAllowedDirectSelectionClick(input) {
		const step = String(input?.workflow_step || '').trim()
		return step === 'select_visible_cascader_option_timeout_recovery'
	}

	function isObservedSelectionOptionMatch(match) {
		const item = match?.item || {}
		const structuralSelectionCandidate = hasStructuralSelectionCandidateSemantics(item)
		if (!isOptionLikeSource(match?.source) && !isPopupSelectionCandidate(item, structuralSelectionCandidate)) return false
		if (isActionMenuCandidate(item, structuralSelectionCandidate)) return false
		const role = String(item.role || '').toLowerCase()
		if (/^(menuitem|treeitem)$/.test(role)) return structuralSelectionCandidate
		return structuralSelectionCandidate || isSelectionLikeItem(item, match.source)
	}

	function isOptionLikeSource(source) {
		return ['options', 'popups'].includes(String(source || '').split(':')[0])
	}

	function isPopupSelectionCandidate(item, structuralSelectionCandidate) {
		if (!structuralSelectionCandidate) return false
		return /^(popover|popup|dropdown|listbox|calendar)$/i.test(String(item?.region || '').trim())
	}

	function hasStructuralSelectionCandidateSemantics(item) {
		if (!item || typeof item !== 'object') return false
		const role = String(item.role || '').toLowerCase()
		if (/^(option|listbox|checkbox|radio|switch|treeitem)$/.test(role)) return true
		const tokens = [
			item.selectionControl,
			item.controlKind,
			item.control,
			item.kind,
			item.fieldType,
		].map((value) => String(value || '').toLowerCase()).join(' ')
		return /(cascader|date-option|time-option|option|select|dropdown|listbox|combobox|checkbox|radio|switch|picker|tree-select|multiselect)/.test(tokens)
	}

	function isActionMenuCandidate(item, structuralSelectionCandidate) {
		if (!item || typeof item !== 'object') return false
		const intent = String(item.actionIntent || item.intent || '').toLowerCase()
		if (intent && !/^(unknown|toggle_option|option|select|choose|dropdown|checkbox|radio|switch|cascader|date|time|filter)$/.test(intent)) {
			return true
		}
		const control = String(item.selectionControl || item.controlKind || item.control || '').toLowerCase()
		return /(^|[-_\s])(menu|action|command)([-_\s]|$)/.test(control) && !structuralSelectionCandidate
	}

	function isSafeDirectClickMatch(match) {
		const item = match?.item || {}
		const role = String(item.role || '').toLowerCase()
		if (/^(button|link|menuitem|treeitem|tab)$/.test(role)) return true
		const intent = String(item.actionIntent || item.intent || '').toLowerCase()
		if (intent && !/^(unknown|toggle_option|option|select)$/.test(intent)) return true
		return false
	}

	function validateClickHasDeclaredTargetLabel(actionName, input) {
		if (isAllowedDirectSelectionClick(input)) return ''
		const declaredTargets = collectClickDeclaredTargetLabels(input).filter((entry) => isConcreteTargetLabel(entry.normalized))
		if (declaredTargets.length) return ''
		return [
			`${actionName} 缺少 target_label/label/target_description 等目标说明；只给 index 无法复核是否点错元素。`,
			'请根据当前观察里的 label/text/intent 填写 target_label，或先使用 inspect_index/inspect_region 复核目标。',
		].join('')
	}

	function validateInputHasDeclaredTargetLabel(actionName, input) {
		const declaredTargets = collectInputDeclaredTargetLabels(input).filter((entry) => isConcreteTargetLabel(entry.normalized))
		if (declaredTargets.length) return ''
		return [
			`${actionName} 缺少 target_label/workflow_field_label 等字段目标说明；只给 index 和 text 无法复核是否填错字段。`,
			'请根据当前观察里的字段 label/placeholder 填写 target_label，或先使用 inspect_index/inspect_region 复核目标输入框。',
		].join('')
	}

	function validateHoverHasDeclaredTargetLabel(actionName, input) {
		const declaredTargets = collectClickDeclaredTargetLabels(input).filter((entry) => isConcreteTargetLabel(entry.normalized))
		if (declaredTargets.length) return ''
		return [
			`${actionName} 缺少 target_label/label/target_description 等悬浮目标说明；只给 index 无法复核是否悬浮到正确父项。`,
			'请根据当前观察里的 label/text/intent 填写 target_label，或先使用 inspect_index/inspect_region 复核目标。',
		].join('')
	}

	function validateIndexedScrollHasDeclaredTargetLabel(actionName, input) {
		const index = normalizeOptionalIndex(input?.index)
		if (index === null) return ''
		const declaredTargets = collectClickDeclaredTargetLabels(input).filter((entry) => isConcreteTargetLabel(entry.normalized))
		if (declaredTargets.length) return ''
		return [
			`${actionName} 指定了 index=${index}，但缺少 target_label/label/target_description 等滚动容器目标说明。`,
			'页面级滚动可以省略 index；如果要滚动某个容器，请根据当前观察里的 label/text/region 填写 target_label，或先 inspect_index 复核容器。',
		].join('')
	}

	function validateKeypressHasDeclaredIntent(actionName, input) {
		if (!String(input?.key || '').trim()) return `${actionName} 缺少 key。`
		const declaredTargets = collectKeypressDeclaredIntentLabels(input).filter((entry) => isConcreteTargetLabel(entry.normalized))
		if (declaredTargets.length) return ''
		return [
			`${actionName} 缺少 target_label/reason 等按键目标或目的说明；向当前焦点发送按键时必须说明焦点或意图，避免盲按键。`,
			'请填写 target_label（当前焦点字段、弹层或控件）或 reason/purpose（提交当前搜索、关闭当前弹层、切换焦点等）。',
		].join('')
	}

	function validateBrowserTabActionHasDeclaredContext(actionName, input, options = {}) {
		const declaredTargets = collectBrowserTabDeclaredTargets(input).filter((entry) => isConcreteTargetLabel(entry.normalized))
		if (!declaredTargets.length) {
			return [
				`${actionName} 缺少 target_label/target_url/target_title 等标签页目标说明；只给 URL 或 tab_id 无法复核浏览器上下文是否切错。`,
				'请填写目标标签页标题、URL 或任务目标说明；关闭标签页时还必须提供 reason。',
			].join('')
		}
		if (options.reasonRequired && !String(input?.reason || input?.purpose || '').trim()) {
			return `${actionName} 缺少 reason；关闭标签页属于浏览器上下文变更，必须说明关闭原因。`
		}
		return ''
	}

	function validateBrowserTabDeclaredTargetMatches(actionName, input, tab) {
		const targetUrl = String(input?.target_url || input?.targetUrl || '').trim()
		if (targetUrl && !isCompatibleTabUrl(tab?.url, targetUrl)) {
			return [
				`${actionName} 声明 target_url="${shortText(targetUrl, 100)}"，但 tab_id=${input?.tab_id} 当前 URL 是 "${shortText(tab?.url || '', 120)}"。`,
				'请重新选择与目标 URL 匹配的标签页，或先刷新 tabsSummary 后再切换/关闭。',
			].join('')
		}
		const targetTitle = normalizeTargetText(input?.target_title || input?.targetTitle || '')
		const tabTitle = normalizeTargetText(tab?.title || '')
		if (targetTitle && tabTitle && !targetTextMatches(targetTitle, tabTitle)) {
			return [
				`${actionName} 声明 target_title="${shortText(input?.target_title || input?.targetTitle || '', 80)}"，但 tab_id=${input?.tab_id} 当前标题是 "${shortText(tab?.title || '', 100)}"。`,
				'请重新选择与目标标题匹配的标签页，或改用 target_url 复核。',
			].join('')
		}
		return ''
	}

	function validateSelectionHasDeclaredTargetLabel(actionName, input) {
		const declaredTargets = collectDeclaredTargetLabels(input).filter((entry) => isConcreteTargetLabel(entry.normalized))
		if (declaredTargets.length) return ''
		return [
			`${actionName} 缺少 target_label/workflow_field_label 等选择目标说明；只给 index 无法复核是否操作了正确字段或候选。`,
			'请根据当前观察里的字段 label/placeholder 或具体候选 label 填写 target_label；候选值继续放在 text/path。',
		].join('')
	}

	function validateVisionSelectionDescription(input, observation) {
		if (String(input?.text || input?.value || '').trim()) return ''
		const description = String(input?.target_description || input?.description || '').trim()
		if (!description || !looksLikeSelectionCandidateDescription(description)) return ''
		const normalizedDescription = normalizeTargetText(description)
		if (!normalizedDescription) return ''
		const matches = collectVisibleSelectionOptionMatches(observation)
		const matched = matches.find((match) => {
			const item = match.item || {}
			return collectSelectionOptionLabels(item).some((label) => {
				const normalized = normalizeTargetText(label)
				return normalized.length >= 2 && (normalizedDescription.includes(normalized) || normalized.includes(normalizedDescription))
			})
		})
		if (!matched) return ''
		const item = matched.item || {}
		const label = item.label || item.text || ''
		return [
			`locate_by_vision 目标描述 "${shortText(description, 100)}" 命中了当前可见的选择候选（label="${shortText(label, 64)}"），不能用视觉定位绕过字段归属校验。`,
			'请先用 open_dropdown/request_options_for/inspect_region 确认候选归属，再使用 choose_dropdown_option/select_checkbox_option/select_cascader_path。',
		].join('')
	}

	function looksLikeSelectionCandidateDescription(value) {
		return /(候选|选项|下拉|选择项|列表项|弹层.*项|option|dropdown|select option|listbox|popup item)/i.test(String(value || ''))
	}

	function collectVisibleSelectionOptionMatches(observation) {
		const out = []
		for (const item of (Array.isArray(observation?.options) ? observation.options : [])) {
			const match = { source: 'options', item }
			if (isObservedSelectionOptionMatch(match)) out.push(match)
		}
		for (const item of (Array.isArray(observation?.popups) ? observation.popups : [])) {
			const match = { source: 'popups', item }
			if (isObservedSelectionOptionMatch(match)) out.push(match)
		}
		return out
	}

	function collectSelectionOptionLabels(item) {
		return [
			item?.label,
			item?.text,
			item?.ariaLabel,
			item?.accessibleName,
			item?.title,
			...(Array.isArray(item?.aliases) ? item.aliases : []),
		].map((value) => String(value || '').trim()).filter(Boolean)
	}

	function isHitStateRelevantSource(source) {
		const root = String(source || '').split(':')[0]
		return !['options', 'popups', 'panels'].includes(root)
	}

	function isCoveredHitState(item) {
		if (!item || typeof item !== 'object') return false
		const state = String(item.hitState || '').trim().toLowerCase()
		if (state === 'covered') return true
		const points = String(item.hitPoints || '').trim()
		const match = points.match(/^(\d+)\s*\/\s*(\d+)$/)
		if (match && Number(match[1]) <= 0 && Number(match[2]) > 0) return true
		const ratio = Number(item.hitRatio)
		return Number.isFinite(ratio) && ratio <= 0 && !!points
	}

	function isHittableHitState(item) {
		if (!item || typeof item !== 'object') return false
		const state = String(item.hitState || '').trim().toLowerCase()
		if (state === 'hittable' || state === 'partial') return true
		const points = String(item.hitPoints || '').trim()
		const match = points.match(/^(\d+)\s*\/\s*(\d+)$/)
		if (match) return Number(match[1]) > 0
		const ratio = Number(item.hitRatio)
		return Number.isFinite(ratio) && ratio > 0
	}

	function validateDeclaredTargetLabel(actionName, input, observation) {
		const index = normalizeOptionalIndex(input?.index)
		if (index === null) return ''
		const declaredTargets = collectExecutableDeclaredTargetLabels(actionName, input).filter((entry) => isConcreteTargetLabel(entry.normalized))
		if (!declaredTargets.length) return ''
		const matches = findObservedIndexMatches(observation, index)
		if (!matches.length) return ''
		const observedLabels = collectObservedTargetLabels(matches)
		if (!observedLabels.length) return ''
		for (const declared of declaredTargets) {
			if (observedLabels.some((observed) => declaredTargetMatchesObserved(declared, observed))) return ''
		}
		const strongObserved = observedLabels.filter((observed) => observed.strong && isConcreteObservedTargetText(observed.normalized))
		if (!strongObserved.length) return ''
		const declared = declaredTargets[0]
		const observedSummary = uniqueNormalizedLabels(strongObserved.map((observed) => observed.text)).slice(0, 5).join('|')
		if (!observedSummary) return ''
		return [
			`动作 ${actionName} 声明 ${declared.key}="${shortText(declared.text, 80)}"，但 index=${index} 当前观察到的是 "${shortText(observedSummary, 160)}"。`,
			'请重新选择与目标标签匹配的 index，或先使用 inspect_index/inspect_region 复核。',
		].join('')
	}

	function collectExecutableDeclaredTargetLabels(actionName, input) {
		const name = normalizeActionName(actionName)
		if (name === 'input_text' || name === 'type') return collectInputDeclaredTargetLabels(input)
		if (name === 'click_element_by_index' || name === 'click') return collectClickDeclaredTargetLabels(input)
		return collectDeclaredTargetLabels(input)
	}

	function collectDeclaredTargetLabels(input) {
		const keys = [
			'target_label',
			'targetLabel',
			'target_description',
			'targetDescription',
			'workflow_field_label',
			'workflowFieldLabel',
			'workflow_create_label',
			'workflowCreateLabel',
			'workflow_submit_label',
			'workflowSubmitLabel',
			'workflow_nav_key',
			'workflowNavKey',
			'workflow_nav_alias',
			'workflowNavAlias',
		]
		const out = []
		for (const key of keys) {
			const value = input?.[key]
			const values = Array.isArray(value) ? value : [value]
			for (const item of values) {
				const text = String(item || '').trim()
				if (!text) continue
				out.push({ key, text, normalized: normalizeTargetText(text) })
			}
		}
		return out
	}

	function collectClickDeclaredTargetLabels(input) {
		const out = collectDeclaredTargetLabels(input)
		for (const key of ['label', 'text', 'description']) {
			const value = input?.[key]
			const values = Array.isArray(value) ? value : [value]
			for (const item of values) {
				const text = String(item || '').trim()
				if (!text) continue
				out.push({ key, text, normalized: normalizeTargetText(text) })
			}
		}
		return out
	}

	function collectInputDeclaredTargetLabels(input) {
		const out = collectDeclaredTargetLabels(input)
		for (const key of ['label', 'placeholder', 'description']) {
			const value = input?.[key]
			const values = Array.isArray(value) ? value : [value]
			for (const item of values) {
				const text = String(item || '').trim()
				if (!text) continue
				out.push({ key, text, normalized: normalizeTargetText(text) })
			}
		}
		return out
	}

	function collectKeypressDeclaredIntentLabels(input) {
		const out = collectDeclaredTargetLabels(input)
		for (const key of ['label', 'description', 'reason', 'purpose']) {
			const value = input?.[key]
			const values = Array.isArray(value) ? value : [value]
			for (const item of values) {
				const text = String(item || '').trim()
				if (!text) continue
				out.push({ key, text, normalized: normalizeTargetText(text) })
			}
		}
		return out
	}

	function collectBrowserTabDeclaredTargets(input) {
		const out = []
		for (const key of ['target_label', 'targetLabel', 'target_url', 'targetUrl', 'target_title', 'targetTitle', 'label', 'title']) {
			const value = input?.[key]
			const values = Array.isArray(value) ? value : [value]
			for (const item of values) {
				const text = String(item || '').trim()
				if (!text) continue
				out.push({ key, text, normalized: normalizeTargetText(text) })
			}
		}
		return out
	}

	function collectObservedTargetLabels(matches) {
		const out = []
		for (const match of matches) {
			const item = match?.item || {}
			addObservedTargetLabel(out, item.label, 'label', true)
			addObservedTargetLabel(out, item.text, 'text', true)
			addObservedTargetLabel(out, item.placeholder, 'placeholder', true)
			addObservedTargetLabel(out, item.name, 'name', true)
			addObservedTargetLabel(out, item.title, 'title', true)
			addObservedTargetLabel(out, item.ariaLabel, 'ariaLabel', true)
			addObservedTargetLabel(out, item.accessibleName, 'accessibleName', true)
			addObservedTargetLabel(out, item.tooltip, 'tooltip', true)
			addObservedTargetLabel(out, item.description, 'description', true)
			addObservedTargetLabel(out, item.semanticContainer, 'semanticContainer', true)
			addObservedTargetLabel(out, item.navigationTarget, 'navigationTarget', true)
			addObservedTargetLabel(out, item.target, 'target', true)
			addObservedTargetArray(out, item.aliases, 'aliases', true)
			addObservedTargetArray(out, item.labelAliases, 'labelAliases', true)
			addObservedTargetLabel(out, item.actionIntent, 'actionIntent', false)
			addObservedTargetLabel(out, item.intent, 'intent', false)
			addObservedTargetLabel(out, item.fieldType, 'fieldType', false)
			addObservedTargetLabel(out, item.controlKind, 'controlKind', false)
			addObservedTargetLabel(out, item.selectionControl, 'selectionControl', false)
		}
		return out
	}

	function addObservedTargetArray(out, values, kind, strong) {
		if (!Array.isArray(values)) return
		for (const value of values) addObservedTargetLabel(out, value, kind, strong)
	}

	function addObservedTargetLabel(out, value, kind, strong) {
		const text = String(value || '').trim()
		if (!text) return
		const normalized = normalizeTargetText(text)
		if (!normalized) return
		out.push({ text, normalized, kind, strong: !!strong })
	}

	function declaredTargetMatchesObserved(declared, observed) {
		if (targetTextMatches(declared.normalized, observed.normalized)) return true
		if (semanticTargetGroupsMatch(declared.normalized, observed.normalized)) return true
		if (['actionIntent', 'intent', 'fieldType', 'controlKind', 'selectionControl'].includes(observed.kind)) {
			return targetLabelMatchesObservedSemantic(declared.normalized, observed.normalized)
		}
		return false
	}

	function targetTextMatches(left, right) {
		if (!left || !right) return false
		if (left === right) return true
		if (left.includes(right) && isConcreteContainedTargetText(right)) return true
		if (right.includes(left) && isConcreteContainedTargetText(left)) return true
		return false
	}

	function targetLabelMatchesObservedSemantic(label, semantic) {
		if (!label || !semantic) return false
		const labelGroups = getSemanticTargetGroups(label)
		if (!labelGroups.length) return false
		const semanticGroups = getSemanticTargetGroups(semantic)
		if (semanticGroups.some((group) => labelGroups.includes(group))) return true
		const intent = semantic.toLowerCase()
		if (labelGroups.includes('create') && /add|create|new|plus/.test(intent)) return true
		if (labelGroups.includes('search') && /search|query|filter|find/.test(intent)) return true
		if (labelGroups.includes('reset') && /reset|clear|clean/.test(intent)) return true
		if (labelGroups.includes('submit') && /submit|save|confirm|ok|apply|done/.test(intent)) return true
		if (labelGroups.includes('more') && /more|expand|menu|overflow/.test(intent)) return true
		return false
	}

	function semanticTargetGroupsMatch(left, right) {
		const leftGroups = getSemanticTargetGroups(left)
		if (!leftGroups.length) return false
		const rightGroups = getSemanticTargetGroups(right)
		return rightGroups.some((group) => leftGroups.includes(group))
	}

	function getSemanticTargetGroups(text) {
		const value = String(text || '').toLowerCase()
		const groups = []
		if (/新增|新建|添加|创建|add|new|create|plus/.test(value)) groups.push('create')
		if (/搜索|查询|筛选|过滤|检索|search|query|filter|find/.test(value)) groups.push('search')
		if (/清空|重置|清除|清理|reset|clear|clean/.test(value)) groups.push('reset')
		if (/提交|保存|确定|确认|应用|完成|submit|save|confirm|ok|apply|done/.test(value)) groups.push('submit')
		if (/更多|展开|more|expand|overflow|menu/.test(value)) groups.push('more')
		return groups
	}

	function isConcreteContainedTargetText(text) {
		if (!isConcreteTargetLabel(text)) return false
		if (/^[a-z0-9]+$/i.test(text) && text.length < 3) return false
		return text.length >= 2
	}

	function isConcreteTargetLabel(text) {
		const normalized = normalizeTargetText(text)
		if (!normalized || normalized.length < 2) return false
		if (/^index\d+$/i.test(normalized)) return false
		return !getGenericTargetLabels().has(normalized)
	}

	function isConcreteObservedTargetText(text) {
		const normalized = normalizeTargetText(text)
		if (!isConcreteTargetLabel(normalized)) return false
		return !getGenericObservedLabels().has(normalized)
	}

	function getGenericTargetLabels() {
		return new Set([
			'目标',
			'元素',
			'当前',
			'这个',
			'该',
			'按钮',
			'链接',
			'菜单',
			'导航',
			'字段',
			'输入框',
			'下拉框',
			'选择框',
			'选项',
			'列表',
			'表格',
			'内容',
			'区域',
			'页面',
			'目标模块',
			'模块',
			'管理',
			'搜索条件',
			'搜索项',
			'筛选条件',
			'筛选项',
			'target',
			'element',
			'button',
			'field',
			'input',
			'select',
			'option',
			'menu',
			'nav',
			'page',
			'module',
		])
	}

	function getGenericObservedLabels() {
		return new Set([
			...getGenericTargetLabels(),
			'请输入',
			'请选择',
			'unknown',
			'empty',
		])
	}

	function normalizeTargetText(value) {
		return String(value || '')
			.trim()
			.replace(/\s+/g, '')
			.replace(/[：:,，。.;；、/\\|"'`~!！?？（）()\[\]{}<>《》【】_-]+/g, '')
			.toLowerCase()
	}

	function isCompatibleTabUrl(tabUrl, targetUrl) {
		try {
			const current = new URL(String(tabUrl || ''))
			const target = new URL(String(targetUrl || ''))
			if (current.origin !== target.origin) return false
			const currentPath = normalizeUrlPath(current.pathname)
			const targetPath = normalizeUrlPath(target.pathname)
			const targetIsSiteRoot = targetPath === '/' && !target.search && !target.hash
			if (targetIsSiteRoot) return true
			if (currentPath !== targetPath) return false
			if (target.search && current.search !== target.search) return false
			if (target.hash && current.hash !== target.hash) return false
			return true
		} catch (_) {
			return String(tabUrl || '').trim() === String(targetUrl || '').trim()
		}
	}

	function normalizeUrlPath(pathname) {
		const raw = String(pathname || '/').replace(/\/+$/, '')
		return raw || '/'
	}

	function validateTextInputTarget(indexValue, observation, actionName) {
		const index = Number(indexValue)
		if (!Number.isFinite(index)) return ''
		const matches = findObservedIndexMatches(observation, index)
		if (!matches.length) return ''
		const selectionMatch = matches.find((match) => isSelectionLikeItem(match.item, match.source))
		if (!selectionMatch && matches.some((match) => isPlainEditableTextItem(match.item, match.source))) return ''
		const allKnownNonEditable = matches.every((match) => match.item?.editable === false || isSelectionLikeItem(match.item, match.source))
		if (!selectionMatch && !allKnownNonEditable) return ''
		const match = selectionMatch || matches[0]
		const item = match.item || {}
		const source = String(match.source || 'unknown')
		const info = describeObservedControl(item, source)
		const role = info.role
		const control = info.control
		const fieldType = info.fieldType
		const label = item.label || item.placeholder || item.text || ''
		if (info.selectionLike) {
			return `${actionName} 目标 index=${index} 是选择控件（label="${shortText(label, 48)}", control=${control || '-'}, role=${role || '-'}, fieldType=${fieldType || '-'}），应改用 open_dropdown/choose_dropdown_option/select_checkbox_option/click 或先请求候选。`
		}
		return `${actionName} 目标 index=${index} 当前观察为不可编辑元素（label="${shortText(label, 48)}", source=${source}），应选择真实输入框或改用点击/选择动作。`
	}

	function validateDropdownTarget(indexValue, observation, actionName) {
		const index = Number(indexValue)
		if (!Number.isFinite(index)) return ''
		const matches = findObservedIndexMatches(observation, index)
		if (!matches.length) return ''
		if (matches.some((match) => isSelectionLikeItem(match.item, match.source))) return ''
		const knownEditable = matches.filter((match) => isPlainEditableTextItem(match.item, match.source))
		if (!knownEditable.length || knownEditable.length !== matches.length) return ''
		const item = knownEditable[0].item || {}
		const role = String(item.role || '').toLowerCase()
		const fieldType = String(item.fieldType || '').toLowerCase()
		const label = item.label || item.placeholder || item.text || ''
		return `${actionName} 目标 index=${index} 是普通可编辑输入框（label="${shortText(label, 48)}", role=${role || '-'}, fieldType=${fieldType || '-'}），应使用 input_text/type；只有真实下拉、combobox 或带候选项的字段才使用 open_dropdown/choose_dropdown_option。`
	}

	function validateCascaderSelectionToolMismatch(indexValue, observation, actionName) {
		const index = Number(indexValue)
		if (!Number.isFinite(index)) return ''
		const matches = findObservedIndexMatches(observation, index)
		const match = matches.find((entry) => isCascaderParentTarget(entry.item, entry.source))
		if (!match) return ''
		const item = match.item || {}
		const label = item.label || item.placeholder || item.text || ''
		return [
			`${actionName} 目标 index=${index} 是级联选择字段（label="${shortText(label, 48)}"），不能按普通下拉候选选择。`,
			'请使用 select_cascader_path，并提供同一字段 index、target_label 与完整 path 数组；若缺少路径，先 request_options_for/open_dropdown/inspect_region 获取真实级联候选。',
		].join('')
	}

	function validateCascaderPathTarget(indexValue, observation, actionName) {
		const index = Number(indexValue)
		if (!Number.isFinite(index)) return ''
		const matches = findObservedIndexMatches(observation, index)
		if (!matches.length) return ''
		if (matches.some((entry) => isCascaderParentTarget(entry.item, entry.source))) return ''
		const textMatch = matches.find((entry) => isPlainEditableTextItem(entry.item, entry.source))
		if (textMatch) {
			const item = textMatch.item || {}
			const label = item.label || item.placeholder || item.text || ''
			return [
				`${actionName} 目标 index=${index} 是普通可编辑输入框（label="${shortText(label, 48)}"），不能按级联路径选择。`,
				'请使用 input_text/type 填写文本；只有层级/树形/级联选择字段才使用 select_cascader_path。',
			].join('')
		}
		const selectionMatch = matches.find((entry) => isSelectionLikeItem(entry.item, entry.source))
		if (!selectionMatch) return ''
		const item = selectionMatch.item || {}
		const label = item.label || item.placeholder || item.text || ''
		const info = describeObservedControl(item, selectionMatch.source)
		return [
			`${actionName} 目标 index=${index} 是非层级选择控件（label="${shortText(label, 48)}", control=${info.control || '-'}, role=${info.role || '-'}, fieldType=${info.fieldType || '-'}），不能按级联路径选择。`,
			'请使用 open_dropdown/choose_dropdown_option/select_checkbox_option 处理普通选择控件；只有层级/树形/级联选择字段才使用 select_cascader_path。',
		].join('')
	}

	function isCascaderParentTarget(item, source) {
		if (!item || typeof item !== 'object') return false
		const info = describeObservedControl(item, source)
		const tokens = [
			info.control,
			info.fieldType,
			item.selectionControl,
			item.controlKind,
			item.control,
			item.kind,
			item.fieldType,
		].map((value) => String(value || '').toLowerCase()).join(' ')
		return /(cascader|tree|hierarchy)/.test(tokens) && !/(leaf|option|candidate)/.test(tokens)
	}

	function validateSelectionTextAgainstVisibleOptions(indexValue, selectionText, observation, actionName, input = {}) {
		const index = Number(indexValue)
		const requested = normalizeSelectionText(selectionText)
		if (!Number.isFinite(index) || !requested) return ''
		const dateLikeTarget = hasDateLikeObservedTarget(observation, index) ||
			isDateLikeDeclaredSelectionTarget(input, selectionText)
		const rangeLikeRequest = isTemporalRangeSelectionRequest(selectionText)
		const candidates = collectSelectionCandidatesForIndex(observation, index, dateLikeTarget)
		if (candidates.some((candidate) => selectionRequestMatchesCandidate(selectionText, requested, candidate, { dateLikeTarget }))) return ''
		if (hasTrustedWorkflowScopedCandidate(input, selectionText)) return ''
		const diagnostics = collectDiagnosticSelectionCandidatesForIndex(observation, index)
		if (diagnostics.some((candidate) => selectionRequestMatchesCandidate(selectionText, requested, candidate, { dateLikeTarget }))) {
			return [
				`${actionName} 目标 index=${index} 只有未归属到该字段的诊断候选 "${shortText(diagnostics.join('|'), 180)}" 包含 "${shortText(selectionText, 80)}"。`,
				dateLikeTarget
					? '日期/时间诊断候选不能直接选择；请先 open_dropdown(index)、request_options_for(index) 或 inspect_region popover/content，直到 date-option/time-option 能稳定归属到目标字段。'
					: '诊断候选不能直接选择；请先 open_dropdown(index)、request_options_for(index) 或 inspect_region popover/content，直到候选能稳定归属到目标字段。',
			].join('')
		}
		if (!candidates.length && diagnostics.length) {
			return [
				`${actionName} 目标 index=${index} 当前只有未归属到该字段的诊断候选 "${shortText(diagnostics.join('|'), 180)}"，没有稳定归属到该字段的真实候选。`,
				dateLikeTarget
					? `不能在这种状态下选择日期/时间值 "${shortText(selectionText, 80)}"；请先 open_dropdown(index)、request_options_for(index) 或 inspect_region popover/content，直到候选能稳定归属到目标字段。`
					: `不能在这种状态下选择 "${shortText(selectionText, 80)}"；请先 open_dropdown(index)、request_options_for(index) 或 inspect_region popover/content，直到候选能稳定归属到目标字段。`,
			].join('')
		}
		if (!candidates.length) return ''
		return [
			`${actionName} 目标 index=${index} 当前可见候选为 "${shortText(candidates.join('|'), 180)}"，没有 "${shortText(selectionText, 80)}"。`,
			rangeLikeRequest
				? '这是范围选择请求；下一轮应从可见且归属目标字段的起止边界候选中选择当前边界，或先 request_options_for/open_dropdown 重新确认范围候选。'
				: '不要臆造或重复不存在的选项；下一轮必须从可见候选中选择真实文本，或先 request_options_for/open_dropdown 重新确认。',
		].join('')
	}

	function hasTrustedWorkflowScopedCandidate(input, selectionText) {
		const workflowStep = String(input?.workflow_step || '').trim()
		if (workflowStep !== 'select_option') return false
		if (String(input?.workflow_candidate_evidence || '').trim() !== 'field_scoped_options') return false
		const target = normalizeSelectionText(selectionText)
		if (!target) return false
		const values = String(input?.workflow_scoped_candidates || '')
			.split(/[|,，;；、\n]+/)
			.map((item) => String(item || '').trim())
			.filter(Boolean)
		if (!values.length) return false
		return values.some((candidate) => {
			const key = normalizeSelectionText(candidate)
			return key && (key === target || selectionRequestMatchesCandidate(selectionText, target, candidate, {}))
		})
	}

	function isTemporalRangeSelectionRequest(value) {
		return extractSelectionDateCandidates(value).length >= 2 || extractSelectionPeriodCandidates(value).length >= 2
	}

	function collectSelectionCandidatesForIndex(observation, index, dateLikeTarget = false) {
		const matches = findObservedIndexMatches(observation, index)
		const targetItems = matches
			.filter((match) => !['options', 'popups'].includes(String(match.source || '').split(':')[0]))
			.map((match) => match.item)
			.filter(Boolean)
		const labels = []
		for (const item of targetItems) {
			if (!Array.isArray(item?.optionLabels)) continue
			for (const label of item.optionLabels) labels.push(String(label || '').trim())
		}
		const visibleItems = [
			...(Array.isArray(observation?.popups) ? observation.popups : []),
			...(Array.isArray(observation?.options) ? observation.options : []),
		].filter(Boolean)
		const scoped = getScopedVisibleOptionItems(visibleItems, targetItems)
		for (const item of scoped) {
			const label = String(item?.label || item?.text || '').trim()
			if (label) labels.push(label)
		}
		if (!scoped.length && (dateLikeTarget || targetItems.some(isDateLikeObservedTarget))) {
			for (const item of collectFallbackVisibleDateOptionItems(visibleItems, targetItems)) {
				const label = String(item?.label || item?.text || '').trim()
				if (label) labels.push(label)
			}
		}
		return uniqueNormalizedLabels(labels)
	}

	function getScopedVisibleOptionItems(visibleItems, targetItems) {
		if (!visibleItems.length || !targetItems.length || !controlSemantics?.scoreObservedOptionAssociation) return []
		const scored = []
		for (const item of visibleItems) {
			let best = Number.POSITIVE_INFINITY
			for (const target of targetItems) {
				const score = controlSemantics.scoreObservedOptionAssociation(item, target)
				if (Number.isFinite(score)) best = Math.min(best, score)
			}
			if (Number.isFinite(best)) scored.push({ item, score: best })
		}
		const scoped = scored.sort((a, b) => a.score - b.score).map((entry) => entry.item)
		if (scoped.length) return scoped
		return controlSemantics.collectActiveNewPopupItemsForTargets?.(visibleItems, targetItems) || []
	}

	function collectDiagnosticSelectionCandidatesForIndex(observation, index) {
		const matches = findObservedIndexMatches(observation, index)
		const targetItems = matches
			.filter((match) => !['options', 'popups'].includes(String(match.source || '').split(':')[0]))
			.map((match) => match.item)
			.filter(Boolean)
		if (!targetItems.length || !controlSemantics?.scoreObservedOptionAssociation) return []
		const visibleItems = [
			...(Array.isArray(observation?.popups) ? observation.popups : []),
			...(Array.isArray(observation?.options) ? observation.options : []),
		].filter(Boolean)
		const labels = []
		for (const item of visibleItems) {
			let associated = false
			for (const target of targetItems) {
				if (Number.isFinite(controlSemantics.scoreObservedOptionAssociation(item, target))) {
					associated = true
					break
				}
			}
			if (!associated && controlSemantics.isActiveNewPopupItemForTargets?.(item, targetItems)) associated = true
			if (associated) continue
			const label = String(item?.label || item?.text || '').trim()
			if (label) labels.push(label)
		}
		return uniqueNormalizedLabels(labels)
	}

	function uniqueNormalizedLabels(labels) {
		const out = []
		const seen = new Set()
		for (const label of labels) {
			const text = String(label || '').trim()
			const key = normalizeSelectionText(text)
			if (!key || seen.has(key)) continue
			seen.add(key)
			out.push(text)
		}
		return out
	}

	function selectionRequestMatchesCandidate(rawRequested, normalizedRequested, candidate, options = {}) {
		if (selectionMatchesCandidate(normalizedRequested, candidate)) return true
		return dateRangeSelectionMatchesCandidate(rawRequested, candidate)
			|| temporalRangeSelectionMatchesCandidate(rawRequested, candidate)
			|| (options?.dateLikeTarget === true && dateSelectionMatchesDayOnlyCandidate(rawRequested, candidate))
	}

	function selectionMatchesCandidate(requested, candidate) {
		const normalized = normalizeSelectionText(candidate)
		if (!requested || !normalized) return false
		if (normalized === requested) return true
		return optionTextHasBoundedDecorationMatch(normalized, requested) ||
			optionTextHasBoundedDecorationMatch(requested, normalized) ||
			selectionTextContainsWithBoundaries(normalized, requested) ||
			selectionTextContainsWithBoundaries(requested, normalized)
	}

	function optionTextHasBoundedDecorationMatch(label, expected) {
		if (!label || !expected) return false
		if (label.startsWith(expected)) {
			const next = label.charAt(expected.length)
			if (isSelectionDecorationBoundaryChar(next)) return true
		}
		if (label.endsWith(expected)) {
			const prev = label.charAt(label.length - expected.length - 1)
			if (isSelectionDecorationBoundaryChar(prev)) return true
		}
		return false
	}

	function selectionTextContainsWithBoundaries(value, part) {
		if (!value || !part || value === part) return false
		let index = value.indexOf(part)
		while (index >= 0) {
			const before = value.charAt(index - 1)
			const after = value.charAt(index + part.length)
			if (isSelectionDecorationBoundaryChar(before) && isSelectionDecorationBoundaryChar(after)) return true
			index = value.indexOf(part, index + 1)
		}
		return false
	}

	function isSelectionDecorationBoundaryChar(value) {
		if (!value) return true
		return /[\s()[\]{}（）【】《》<>:：;；,，.。/\\|｜\-_\u2013\u2014+＋#＃]/.test(String(value))
	}

	function dateRangeSelectionMatchesCandidate(rawRequested, candidate) {
		const requestedDates = extractSelectionDateCandidates(rawRequested)
		if (requestedDates.length < 2) return false
		const candidateDates = extractSelectionDateCandidates(candidate)
		if (!candidateDates.length) return false
		return candidateDates.some((date) => requestedDates.includes(date))
	}

	function temporalRangeSelectionMatchesCandidate(rawRequested, candidate) {
		const requestedPeriods = extractSelectionPeriodCandidates(rawRequested)
		if (requestedPeriods.length < 2) return false
		const candidatePeriods = extractSelectionPeriodCandidates(candidate)
		if (!candidatePeriods.length) return false
		return candidatePeriods.some((period) => requestedPeriods.includes(period))
	}

	function extractSelectionDateCandidates(value) {
		const text = String(value || '').trim()
		const out = []
		const seen = new Set()
		const push = (year, month, day) => {
			const date = `${year}-${pad2(month)}-${pad2(day)}`
			if (seen.has(date)) return
			seen.add(date)
			out.push(date)
		}
		for (const match of text.matchAll(/(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})/g)) {
			push(match[1], match[2], match[3])
		}
		for (const match of text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g)) {
			push(match[1], match[2], match[3])
		}
		return out
	}

	function extractSelectionPeriodCandidates(value) {
		const text = String(value || '').trim()
		const out = []
		const seen = new Set()
		const push = (value) => {
			const normalized = String(value || '').trim()
			if (!normalized || seen.has(normalized)) return
			seen.add(normalized)
			out.push(normalized)
		}
		for (const match of text.matchAll(/(\d{4})\s*[-/]\s*(\d{1,2})(?!\s*[-/]\s*\d{1,2})/g)) {
			push(formatSelectionMonth(match[1], match[2]))
		}
		for (const match of text.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月(?!\s*\d{1,2}\s*日?)/g)) {
			push(formatSelectionMonth(match[1], match[2]))
		}
		for (const match of text.matchAll(/(\d{4})\s*(?:年|-)?\s*(?:第)?\s*(?:W|w|week)?\s*(\d{1,2})\s*周/g)) {
			push(formatSelectionWeek(match[1], match[2]))
		}
		const standalone = normalizeStandaloneTemporalSelectionText(text)
		if (standalone) push(standalone)
		return out.filter(Boolean)
	}

	function dateSelectionMatchesDayOnlyCandidate(rawRequested, candidate) {
		const requestedDates = extractSelectionDateCandidates(rawRequested)
		if (!requestedDates.length) return false
		const candidateDay = parseDayOnlySelectionCandidate(candidate)
		if (!Number.isFinite(candidateDay)) return false
		return requestedDates.some((date) => {
			const requestedDay = Number(date.slice(-2))
			return Number.isFinite(requestedDay) && requestedDay > 0 && candidateDay === requestedDay
		})
	}

	function parseDayOnlySelectionCandidate(value) {
		const text = String(value || '').replace(/\s+/g, '').trim()
		if (!text || text.length > 6) return null
		const match = text.match(/^(\d{1,2})(?:日|号|今天)?$/)
		if (!match) return null
		const day = Number(match[1])
		return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null
	}

	function collectVisibleDateOptionItems(items) {
		return (Array.isArray(items) ? items : []).filter(isDateOptionObservedItem)
	}

	function collectFallbackVisibleDateOptionItems(items, targetItems) {
		const dateItems = collectVisibleDateOptionItems(items)
		if (!dateItems.length) return []
		const ownerKeys = new Set(dateItems.map(getExplicitDateOptionOwnerKey).filter(Boolean))
		const hasTargetAuthoritativeRelation = (Array.isArray(targetItems) ? targetItems : []).some(hasAuthoritativePopupRelation)
		if (ownerKeys.size > 1 && hasStrongDatePopupOwnerSplit(ownerKeys)) return []
		if (hasTargetAuthoritativeRelation && ownerKeys.size > 0) return []
		if ((Array.isArray(targetItems) ? targetItems : []).some(isExpandedDateLikeObservedTarget)) return dateItems
		if (hasTargetAuthoritativeRelation) return []
		return dateItems
	}

	function hasStrongDatePopupOwnerSplit(ownerKeys) {
		const keys = Array.from(ownerKeys || []).map((key) => String(key || '').trim()).filter(Boolean)
		if (keys.length <= 1) return false
		return keys.some((key) => key.startsWith('popupId:'))
	}

	function isExpandedDateLikeObservedTarget(item) {
		if (!isDateLikeObservedTarget(item)) return false
		return /(expanded|open|opened|visible|active|弹层|展开|已展开)/i.test([
			item?.expandedState,
			item?.stateHints,
			item?.popupHints,
		].map((value) => String(value || '')).join(' '))
	}

	function hasAuthoritativePopupRelation(item) {
		const hints = String(item?.relationHints || '')
		if (controlSemantics?.extractObservedHintIdRefs) {
			return controlSemantics.extractObservedHintIdRefs(hints, ['aria-controls', 'aria-owns']).length > 0
		}
		return /(?:^|,)(?:aria-controls|aria-owns)=([^,]+)/.test(hints)
	}

	function getExplicitDateOptionOwnerKey(item) {
		const popupHints = String(item?.popupHints || '')
		const popupIds = controlSemantics?.extractObservedHintIdRefs
			? controlSemantics.extractObservedHintIdRefs(popupHints, ['popupId'])
			: extractHintValues(popupHints, 'popupId')
		if (popupIds.length) return `popupId:${popupIds.sort().join('|')}`
		const labelledByIds = controlSemantics?.extractObservedHintIdRefs
			? controlSemantics.extractObservedHintIdRefs(popupHints, ['popupLabelledBy'])
			: extractHintValues(popupHints, 'popupLabelledBy')
		if (labelledByIds.length) return `popupLabelledBy:${labelledByIds.sort().join('|')}`
		return ''
	}

	function extractHintValues(hints, name) {
		const pattern = new RegExp(`${escapeRegExp(String(name || ''))}=([^,]+)`, 'g')
		const values = []
		for (const match of String(hints || '').matchAll(pattern)) {
			for (const value of String(match[1] || '').split(/\s+/)) {
				const text = value.trim()
				if (text) values.push(text)
			}
		}
		return [...new Set(values)]
	}

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	function hasDateLikeObservedTarget(observation, index) {
		return findObservedIndexMatches(observation, index).some((match) => isDateLikeObservedTarget(match.item))
	}

	function isDateLikeDeclaredSelectionTarget(input, selectionText) {
		if (!extractSelectionDateCandidates(selectionText).length && !extractSelectionPeriodCandidates(selectionText).length) return false
		const descriptor = [
			input?.target_label,
			input?.workflow_field_label,
			input?.label,
			input?.field_label,
			input?.name,
		].map((value) => String(value || '')).join(' ')
		return /(date|time|picker|range|日期|时间|起止|区间|范围|开始|结束)/i.test(descriptor)
	}

	function isDateOptionObservedItem(item) {
		if (!item || typeof item !== 'object') return false
		const control = String(item.selectionControl || item.control || '').toLowerCase()
		if (control === 'date-option') return true
		const role = String(item.role || '').toLowerCase()
		const label = String(item.label || item.text || '').trim()
		return role === 'option' && (
			/^\d{4}\s*[-/年]\s*\d{1,2}\s*[-/月]\s*\d{1,2}/.test(label) ||
			!!normalizeStandaloneTemporalSelectionText(label) ||
			parseDayOnlySelectionCandidate(label) !== null
		)
	}

	function isDateLikeObservedTarget(item) {
		if (!item || typeof item !== 'object') return false
		const descriptor = [
			item.fieldType,
			item.type,
			item.selectionControl,
			item.controlKind,
			item.role,
			item.label,
			item.placeholder,
			item.text,
			item.name,
			item.semanticContainer,
		].map((value) => String(value || '')).join(' ')
		return /(date|time|picker|range|日期|时间|起止|区间|范围|开始|结束)/i.test(descriptor)
	}

	function pad2(value) {
		return String(Number(value)).padStart(2, '0')
	}

	function isSelectionLikeItem(item, source) {
		if (controlSemantics?.isObservedSelectionLike) return controlSemantics.isObservedSelectionLike(item, source)
		if (!item || typeof item !== 'object') return false
		const role = String(item.role || '').toLowerCase()
		const tag = String(item.tag || '').toLowerCase()
		const control = String(item.selectionControl || '').toLowerCase()
		const fieldType = String(item.fieldType || '').toLowerCase()
		const compactFieldType = fieldType.replace(/[-_\s]+/g, '')
		if (['options', 'popups'].includes(String(source || ''))) return true
		if (Array.isArray(item.optionLabels) && item.optionLabels.length) return true
		if (control && control !== '-') return true
		if (['combobox', 'option', 'checkbox', 'radio', 'switch', 'listbox'].includes(role)) return true
		if (tag === 'select') return true
		return ['select', 'date', 'time', 'daterange', 'datetimerange', 'timerange', 'month', 'monthrange', 'year', 'yearrange', 'week', 'weekrange', 'datetime'].includes(compactFieldType)
	}

	function isPlainEditableTextItem(item, source) {
		if (controlSemantics?.isObservedPlainEditableText) return controlSemantics.isObservedPlainEditableText(item, source)
		return item?.editable === true && !isSelectionLikeItem(item, source)
	}

	function describeObservedControl(item, source) {
		if (controlSemantics?.describeObservedControl) return controlSemantics.describeObservedControl(item, source)
		return {
			role: String(item?.role || '').toLowerCase(),
			control: String(item?.selectionControl || item?.control || '').toLowerCase(),
			fieldType: String(item?.fieldType || '').toLowerCase(),
			selectionLike: isSelectionLikeItem(item, source),
		}
	}

	function getHistoryOutcome(item) {
		const structured = normalizeStructuredOutcome(item?.outcome || item?.meta?.outcome)
		if (structured) return structured
		const output = String(item?.output || '')
		const summary = extractHistoryOutcomeSummary(output) || output
		return {
			kind: isFailedOutcome(summary) ? 'failed' : isOptionsVisibleOutcome(summary) ? 'options_visible' : '',
			requestedText: extractOutcomeField(summary, 'requested'),
			candidates: extractOutcomeField(summary, 'candidates'),
		}
	}

	function normalizeStructuredOutcome(outcome) {
		const normalized = actionContract?.normalizeOutcome
			? actionContract.normalizeOutcome(outcome)
			: normalizeOutcomeObject(outcome)
		if (!normalized?.kind || normalized.kind === 'none') return null
		return {
			kind: String(normalized.kind || '').trim().toLowerCase(),
			requestedText: String(normalized.requestedText || ''),
			candidates: Array.isArray(normalized.visibleOptions)
				? normalized.visibleOptions.map((item) => String(item)).filter(Boolean).join('|')
				: '',
		}
	}

	function normalizeOutcomeObject(outcome) {
		if (!outcome || typeof outcome !== 'object') return null
		return { ...outcome, kind: String(outcome.kind || '').trim().toLowerCase() }
	}

	function extractHistoryOutcomeSummary(output) {
		const text = String(output || '')
		const marker = '动作结果:'
		const index = text.indexOf(marker)
		if (index < 0) return ''
		return shortText(text.slice(index).trim(), 240)
	}

	function normalizeActionName(value) {
		return String(value || '').trim().replace(/[\s-]+/g, '_').toLowerCase()
	}

	function normalizeOptionalIndex(value) {
		if (value === undefined || value === null || value === '') return null
		const number = Number(value)
		return Number.isFinite(number) ? number : null
	}

	function normalizeSelectionText(value) {
		const temporal = normalizeStandaloneTemporalSelectionText(value)
		if (temporal) return temporal
		return String(value || '').trim().replace(/\s+/g, '').toLowerCase()
	}

	function normalizeStandaloneTemporalSelectionText(value) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		if (!text) return ''
		let match = text.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/)
		if (!match) match = text.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/)
		if (match) return formatSelectionDate(match[1], match[2], match[3])
		match = text.match(/^(\d{4})\s*[-/]\s*(\d{1,2})$/)
		if (!match) match = text.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月$/)
		if (match) return formatSelectionMonth(match[1], match[2])
		match = text.match(/^(\d{4})\s*(?:年|-)?\s*(?:第)?\s*(?:W|w|week)?\s*(\d{1,2})\s*周$/)
		if (!match) match = text.match(/^(\d{4})-W(\d{1,2})$/i)
		if (match) return formatSelectionWeek(match[1], match[2])
		match = text.match(/^(\d{4})\s*年?$/)
		if (!match) return ''
		const year = Number(match[1])
		return Number.isFinite(year) && year >= 1 && year <= 9999 ? String(year) : ''
	}

	function formatSelectionDate(year, month, day) {
		const yearNum = Number(year)
		const monthNum = Number(month)
		const dayNum = Number(day)
		if (![yearNum, monthNum, dayNum].every(Number.isFinite)) return ''
		const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum))
		if (
			date.getUTCFullYear() !== yearNum ||
			date.getUTCMonth() + 1 !== monthNum ||
			date.getUTCDate() !== dayNum
		) {
			return ''
		}
		return `${yearNum}-${pad2(monthNum)}-${pad2(dayNum)}`
	}

	function formatSelectionMonth(year, month) {
		const yearNum = Number(year)
		const monthNum = Number(month)
		if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return ''
		return `${yearNum}-${pad2(monthNum)}`
	}

	function formatSelectionWeek(year, week) {
		const yearNum = Number(year)
		const weekNum = Number(week)
		if (!Number.isFinite(yearNum) || !Number.isFinite(weekNum) || weekNum < 1 || weekNum > 53) return ''
		return `${yearNum}-W${pad2(weekNum)}`
	}

	function isFailedOutcome(text) {
		return /动作结果:\s*failed\b/i.test(String(text || ''))
	}

	function isOptionsVisibleOutcome(text) {
		return /动作结果:\s*options_visible\b/i.test(String(text || ''))
	}

	function extractOutcomeField(text, field) {
		const pattern = new RegExp(`${field}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s]+))`, 'i')
		const match = String(text || '').match(pattern)
		return match ? String(match[2] ?? match[3] ?? match[4] ?? '').trim() : ''
	}

	g.NC_BG_PLANNER_VALIDATION = {
		getHistoryOutcome,
		validateExecutableAction,
		validateActionAgainstHistory,
	}
})(globalThis)
