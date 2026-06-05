;(function (g) {
	const controlSemantics = g.NC_CONTROL_SEMANTICS || null
	const DEFAULT_FULL_OBSERVATION_MAX_CHARS = 262144
	const DEFAULT_COMPACT_OBSERVATION_MAX_CHARS = 4200

	function buildObservationText(observation, opts = {}) {
		const parts = []
		const compact = !!opts.compact
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		const actions = Array.isArray(observation?.actions) ? observation.actions : []
		const optionItems = Array.isArray(observation?.options) ? observation.options : []
		const popups = Array.isArray(observation?.popups) ? observation.popups : []
		const panels = Array.isArray(observation?.panels) ? observation.panels : []
		const tables = Array.isArray(observation?.tables) ? observation.tables : []
		const candidateDiagnostics = observation?.candidateDiagnostics && typeof observation.candidateDiagnostics === 'object'
			? observation.candidateDiagnostics
			: null
		const treeCandidates = Array.isArray(observation?.treeCandidates) ? observation.treeCandidates : []
		const simplifiedDom = Array.isArray(observation?.simplifiedDom) ? observation.simplifiedDom : []
		const compactReason = normalizeCompactReason(opts.compactReason || 'compact_retry')
		const rawCandidates = Array.isArray(observation?.rawCandidates)
			? observation.rawCandidates
			: String(observation?.content || '')
					.split('\n')
					.filter(Boolean)

		const taskText = String(opts?.task || '')
		const rankedActions = selectObservationItems(actions, compact ? 10 : 18, taskText)
		const rankedPopups = selectObservationItems(popups, compact ? 10 : 16, taskText)
		const rankedOptions = selectObservationItems(optionItems, compact ? 12 : 20, taskText)
		const actionCursor = getContiguousPrefixCursor(rankObservationItems(actions), rankedActions)
		const popupCursor = getContiguousPrefixCursor(rankObservationItems(popups), rankedPopups)
		const optionCursor = getContiguousPrefixCursor(rankObservationItems(optionItems), rankedOptions)
		const rawLimit = compact ? 0 : (forms.length || actions.length || optionItems.length || popups.length || panels.length ? 8 : 36)
		const formLimit = compact ? 3 : 4
		const fieldLimit = compact ? 10 : 16
		const panelLimit = compact ? 4 : 6
		const treeLimit = compact ? 0 : 12
		const simplifiedLimit = compact ? 14 : 22
		const rankedSimplifiedDom = selectTextRows(simplifiedDom, simplifiedLimit, taskText)
		const simplifiedCursor = getContiguousPrefixCursor(simplifiedDom, rankedSimplifiedDom)

		if (panels.length) {
			parts.push('<panels>')
			for (const panel of panels.slice(0, panelLimit)) {
				parts.push(formatPanelLine(panel))
			}
			parts.push('</panels>')
		}

		if (tables.length) {
			parts.push('<tables>')
			for (const table of tables.slice(0, compact ? 2 : 4)) {
				parts.push(formatTableLine(table, compact ? 3 : 6))
			}
			parts.push('</tables>')
		}

		if (candidateDiagnostics && Number(candidateDiagnostics.textActionProbeCount || 0) > 0) {
			parts.push(formatCandidateDiagnostics(candidateDiagnostics, compact ? 5 : 10))
		}

		if (forms.length) {
			parts.push('<forms>')
			const totalFormRows = countFormRows(forms)
			let formRowOffset = 0
			const visibleForms = forms.slice(0, formLimit)
			for (const form of visibleForms) {
				parts.push(`form id=${form.id || '-'} name="${form.name || '页面表单'}"`)
				const fields = Array.isArray(form.fields) ? form.fields : []
				const visibleFields = fields.slice(0, fieldLimit)
				for (const field of visibleFields) {
					parts.push(formatFieldLine(field))
				}
				if (fields.length > visibleFields.length) {
					parts.push(formatMoreContextHint('forms', formRowOffset + 1 + visibleFields.length, totalFormRows, 'forms rows'))
				}
				formRowOffset += 1 + fields.length
			}
			if (forms.length > visibleForms.length) {
				parts.push(formatMoreContextHint('forms', formRowOffset, totalFormRows, 'forms rows'))
			}
			parts.push('</forms>')
		}

		if (actions.length) {
			parts.push('<actions>')
			for (const action of rankedActions) {
				parts.push(formatActionLine(action))
			}
			if (actions.length > rankedActions.length) {
				parts.push(formatMoreContextHint('actions', actionCursor, actions.length))
			}
			parts.push('</actions>')
		}

		if (popups.length) {
			parts.push('<popups>')
			for (const popup of rankedPopups) {
				parts.push(formatOptionLine(popup, 'popup'))
			}
			if (popups.length > rankedPopups.length) {
				parts.push(formatMoreContextHint('popups', popupCursor, popups.length))
			}
			parts.push('</popups>')
		}

		if (optionItems.length) {
			parts.push('<options>')
			for (const option of rankedOptions) {
				parts.push(formatOptionLine(option, 'option'))
			}
			if (optionItems.length > rankedOptions.length) {
				parts.push(formatMoreContextHint('options', optionCursor, optionItems.length))
			}
			parts.push('</options>')
		}

		if (treeCandidates.length && treeLimit > 0) {
			parts.push('<dom_tree>')
			for (const row of treeCandidates.slice(0, treeLimit)) {
				parts.push(String(row?.line || row || ''))
			}
			if (treeCandidates.length > treeLimit) {
				parts.push(formatMoreContextHint('dom_tree', treeLimit, treeCandidates.length))
			}
			parts.push('</dom_tree>')
		}

		if (simplifiedDom.length) {
			parts.push('<simplified_dom>')
			for (const row of rankedSimplifiedDom) {
				parts.push(String(row || ''))
			}
			if (simplifiedDom.length > rankedSimplifiedDom.length) {
				parts.push(formatMoreContextHint('simplified_dom', simplifiedCursor, simplifiedDom.length))
			}
			parts.push('</simplified_dom>')
		}

		if (rawLimit > 0) {
			parts.push('<raw_candidates>')
			parts.push(...rawCandidates.slice(0, rawLimit))
			if (rawCandidates.length > rawLimit) {
				parts.push(formatMoreContextHint('raw_candidates', rawLimit, rawCandidates.length))
			}
			parts.push('</raw_candidates>')
		} else {
			parts.push(`<raw_candidates omitted="${compactReason}" />`)
		}
		return limitObservationText(
			parts,
			opts.maxChars || (compact ? DEFAULT_COMPACT_OBSERVATION_MAX_CHARS : DEFAULT_FULL_OBSERVATION_MAX_CHARS)
		)
	}

	function countFormRows(forms) {
		return (Array.isArray(forms) ? forms : []).reduce((count, form) => {
			const fields = Array.isArray(form?.fields) ? form.fields : []
			return count + 1 + fields.length
		}, 0)
	}

	function normalizeCompactReason(value) {
		const raw = String(value || '').trim().toLowerCase()
		return /^[a-z0-9_-]{1,40}$/.test(raw) ? raw : 'compact_retry'
	}

	function getContiguousPrefixCursor(allItems, selectedItems) {
		const selected = new Set(Array.isArray(selectedItems) ? selectedItems : [])
		let cursor = 0
		for (const item of (Array.isArray(allItems) ? allItems : [])) {
			if (!selected.has(item)) break
			cursor += 1
		}
		return cursor
	}

	function formatMoreContextHint(source, shown, total, label = source) {
		const cursor = Math.max(0, Number(shown) || 0)
		const count = Math.max(0, (Number(total) || 0) - cursor)
		return [
			`... omitted ${count} ${label}`,
			`<more_context source="${source}" cursor="${cursor}" limit="40" action="request_context" hint='{"source":"${source}","cursor":${cursor},"limit":40}' />`,
		].join('\n')
	}

	function formatCandidateDiagnostics(candidateDiagnostics, limit) {
		const lines = [
			'<candidate_diagnostics>',
			`text_action_probes total=${Number(candidateDiagnostics.textActionProbeCount || 0)} indexed=${Number(candidateDiagnostics.indexedTextActionProbeCount || 0)} unindexed=${Number(candidateDiagnostics.unindexedTextActionProbeCount || 0)}`,
		]
		const probes = Array.isArray(candidateDiagnostics.unindexedTextActionProbes)
			? candidateDiagnostics.unindexedTextActionProbes
			: []
		for (const probe of probes.slice(0, Math.max(0, Number(limit) || 0))) {
			const rect = probe?.rect || {}
			lines.push(
				`  unindexed text="${shortText(probe?.text || '', 28)}" tag=${probe?.tag || '-'} role=${probe?.role || '-'} cursor=${probe?.cursor || '-'} context=${probe?.actionContext ? 'true' : 'false'} pointer=${probe?.pointer ? 'true' : 'false'} rect=${Number(rect.left) || 0},${Number(rect.top) || 0},${Number(rect.width) || 0}x${Number(rect.height) || 0} class="${shortText(probe?.className || '', 60)}" html="${shortText(probe?.html || '', 140)}"`
			)
		}
		lines.push('</candidate_diagnostics>')
		return lines.join('\n')
	}

	function resolvePlanningContextRequest(observation, action, seq) {
		const name = String(action?.name || '').trim()
		const input = action?.input || {}
		const header = `<context_response seq="${seq + 1}" request="${name}">`
		const footer = '</context_response>'
		let body = ''
		if (name === 'inspect_index') {
			body = buildIndexInspection(observation, input)
		} else if (name === 'inspect_region') {
			body = buildRegionInspection(observation, input)
		} else if (name === 'request_options_for') {
			body = buildOptionsInspection(observation, input)
		} else {
			body = buildContextChunk(observation, input)
		}
		return {
			name,
			input,
			text: [header, body || '(empty)', footer].join('\n'),
		}
	}

	function buildDuplicatePlanningContext(action, seq, count) {
		const name = String(action?.name || '').trim()
		const guidance = buildDuplicatePlanningGuidance(action)
		return {
			name,
			input: action?.input || {},
			text: [
				`<context_response seq="${seq + 1}" request="${name}" duplicate_request="true" count="${count}" guidance="${escapeAttr(guidance)}">`,
				`重复的 planning_tool 请求已被拦截：${planningRequestSignature(action)}`,
				`下一步建议：${guidance}`,
				'</context_response>',
			].join('\n'),
		}
	}

	function buildDuplicatePlanningGuidance(action) {
		const name = String(action?.name || '').trim()
		const input = action?.input && typeof action.input === 'object' ? action.input : {}
		if (name === 'request_context') {
			const source = normalizeContextSource(input.source || input.target || 'simplified_dom')
			if (source === 'tables') {
				return '不要重复请求相同表格上下文；改用 inspect_region content、request_context source=raw_candidates region=content，或在缺少样本时 done(false) 说明原因。'
			}
			if (source === 'actions') {
				return '不要重复请求相同动作上下文；更换 query/region，改用 inspect_region content，或选择当前已确认的真实按钮。'
			}
			if (source === 'forms') {
				return '不要重复请求相同表单上下文；更换 query/region，inspect_region content/dialog，或对已确认字段执行合适工具。'
			}
			return '不要重复请求相同页面上下文；更换 source、region、query、cursor，或输出真实页面动作/明确失败 done(false)。'
		}
		if (name === 'inspect_index') {
			return '不要重复 inspect 同一 index；根据已返回的 index_detail 选择真实动作，或改用 inspect_region 查看附近/当前弹层区域。'
		}
		if (name === 'inspect_region') {
			return '不要重复 inspect 同一区域；更换 source/query/region，或根据已返回的区域元素选择真实页面动作。'
		}
		if (name === 'request_options_for') {
			return '不要重复请求同一字段候选；若已看到 candidates 就选择真实候选，若仍为空则重新 open_dropdown、inspect_region popover/content，或说明缺少候选。'
		}
		return '不要重复相同 planning_tool；更换请求参数、输出真实页面动作，或 done(false) 说明无法继续。'
	}

	function buildInvalidActionContext(action, seq, availableActionNames) {
		const name = String(action?.name || '').trim() || '(empty)'
		return {
			name: 'invalid_action',
			input: action?.input || {},
			text: [
				`<context_response seq="${seq + 1}" invalid_action="true">`,
				`模型输出了不可用工具：${name}`,
				`可用工具名：${Array.from(availableActionNames).sort().join(', ')}`,
				'下一轮必须改用 available_tools 或 planning_tools 中列出的工具名；不要把自然语言动作名当成 action.name。',
				'</context_response>',
			].join('\n'),
		}
	}

	function buildInvalidActionInputContext(action, seq, reason) {
		const name = String(action?.name || '').trim() || '(empty)'
		const classified = classifyInvalidActionInput(reason)
		return {
			name: 'invalid_action_input',
			input: action?.input || {},
			text: [
				`<context_response seq="${seq + 1}" invalid_action_input="true" failure_kind="${classified.kind}">`,
				`工具 ${name} 的参数无法执行：${reason}`,
				`原始 input: ${shortText(stableJson(action?.input || {}), 500)}`,
				`下一步建议：${classified.guidance}`,
				'</context_response>',
			].join('\n'),
		}
	}

	function classifyInvalidActionInput(reason) {
		const text = String(reason || '')
		if (/当前被遮挡|hit=covered|points=0\//i.test(text)) {
			return {
				kind: 'covered_target',
				guidance: '不要直接操作被遮挡 index；先处理当前 dialog/popover/下拉/日历候选，或 wait 后 inspect_index/inspect_region/request_context 重新定位可命中目标。',
			}
		}
		if (/(诊断候选|diagnostic_(?:options|popups)|未归属|没有稳定归属|字段外可见|字段外候选|global_popup_diagnostic|global_selectable_popup_diagnostic|候选未能.*目标字段.*归属|unscoped|field[-_\s]?external)/i.test(text)) {
			return {
				kind: 'unowned_selection_candidate',
				guidance: '不要重复同一个选择动作，也不要直接点击候选；该候选还没有稳定归属到目标字段。先对目标字段 open_dropdown(index)，再 request_options_for(index) 或 inspect_region popover/content；只有看到 scoped="field" 或 scoped="explicit" 的 visible_options/visible_popups 后，才用目标字段 index 和真实 text 选择。',
			}
		}
		if (/(历史显示.*同一选择动作已经失败|禁止重复同一个 requested|不要重复只展开同一字段|下拉候选已经可见|重复.*(?:requested|选择动作|展开|open_dropdown)|same\s+requested|repeated\s+(?:selection|dropdown|open))/i.test(text)) {
			return {
				kind: 'repeat_selection_attempt',
				guidance: '不要重复同一失败选择或只展开同一字段；先读取历史/outcome 中的 candidates 并选择其中真实候选。若 candidates 不足或已过期，使用 request_options_for(index)、重新 open_dropdown(index) 或 inspect_region popover/content 获取新证据；仍无法确认时 done(false) 说明候选证据不足。',
			}
		}
		if (/(缺少\s+(?:target_label|label|target_description|workflow_field_label|target_url|target_title|reason|purpose)|目标说明|字段目标说明|悬浮目标说明|滚动容器目标说明|按键目标或目的说明|标签页目标说明|只给\s+(?:index|URL|tab_id)|盲按键|正在等待什么|用户介入|语义视觉定位|semantic target|declared target|missing\s+(?:target|reason|purpose|description))/i.test(text)) {
			return {
				kind: 'missing_action_context',
				guidance: '不要只换 index 或盲目重试；先补齐动作的语义上下文。点击/输入/悬浮/滚动要从当前观察的 label/text/placeholder/region 中填写 target_label，视觉定位要填写 target_description，wait/ask_user/close_tab/keypress 要填写 reason 或 purpose；如果无法确认目标，先 inspect_index、inspect_region 或 request_context 后再行动。',
			}
		}
		if (/(声明\s+(?:target_label|label|target_description|workflow_field_label|target_url|target_title)=["'][^"']+["'].*(?:但\s+(?:index|tab_id)=|当前观察到的是|当前 URL 是|当前标题是)|target[-_\s]?(?:label|url|title).*(?:mismatch|does not match)|declared.*(?:target|label|url|title).*observed)/i.test(text)) {
			return {
				kind: 'declared_target_mismatch',
				guidance: '不要为了通过校验而把 target_label/target_url 改成当前错误目标；这是声明目标和实际 index/tab_id 指向对象冲突。应重新选择与声明目标匹配的 index/tab_id，或先 inspect_index、inspect_region、request_context/tabsSummary 复核目标；只有确认当前对象才是真实目标时，才同步更新目标说明。',
			}
		}
		if (/(缺少\s*(?:非空\s*)?(?:text|key|path|有效\s+http\(s\)\s+url|有效\s+tab_id|待选择的\s+text\/label|目标字段\s+index)|动作索引无效|inspect_index 缺少有效 index|missing\s+(?:required\s+)?(?:parameter|field|text|key|path|url|tab_id|index))/i.test(text)) {
			return {
				kind: 'missing_required_parameter',
				guidance: '不要换成无关工具或随机目标；补齐当前工具的必填参数。输入动作要给非空 text，选择动作要给目标字段 index、target_label 和真实 text/path，级联选择要给 path 数组，标签页/导航动作要给有效 url 或 tab_id；缺少 index 时先 inspect_region/request_context 找到当前观察中的可用 index。',
			}
		}
		if (/(不能用(?:普通点击|视觉定位)绕过字段归属校验|命中了当前可见的选择候选|弹层\/下拉中的选择候选|choose_dropdown_option\/select_checkbox_option\/select_cascader_path|select_cascader_path|cascader-leaf|selection candidate|selection option|bypass.*(?:field|owner|ownership|selection))/i.test(text)) {
			return {
				kind: 'selection_bypass_attempt',
				guidance: '不要用普通点击或视觉定位直接点候选来绕过字段归属；必须保留目标字段范围。先确认目标字段 index，再用 open_dropdown(index)、request_options_for(index) 或 inspect_region popover/content 获取可归属候选；随后用 choose_dropdown_option、select_checkbox_option 或 select_cascader_path，并带上目标字段 target_label。',
			}
		}
		if (/选择控件|普通可编辑输入框|真实下拉|combobox|候选|open_dropdown|choose_dropdown_option/.test(text)) {
			return {
				kind: 'control_mismatch',
				guidance: '改用与控件类型匹配的工具；选择器先 open_dropdown/request_options_for，再 choose_dropdown_option/select_checkbox_option 选择真实候选。',
			}
		}
		if (/动作索引|不在当前观察|index/i.test(text)) {
			return {
				kind: 'bad_index',
				guidance: '重新观察当前页面，或使用 inspect_region/request_context 找到当前观察中存在的 index。',
			}
		}
		return {
			kind: 'invalid_input',
			guidance: '修正参数、请求更多上下文，或选择其他 available_tools 中的动作。',
		}
	}

	function buildInvalidModelOutputContext(content, seq) {
		return {
			name: 'invalid_model_output',
			input: {},
			text: [
				`<context_response seq="${seq + 1}" invalid_model_output="true">`,
				'模型上一轮输出不是符合要求的 JSON 对象，或缺少可解析的 action。',
				`原始输出片段: ${shortText(String(content || ''), 500)}`,
				'下一轮必须只输出 JSON 对象，并包含 action.name 和 action.input。',
				'</context_response>',
			].join('\n'),
		}
	}

	function planningRequestSignature(action) {
		return `${String(action?.name || '').trim()} ${stableJson(action?.input || {})}`
	}

	function findObservedIndexMatches(observation, index) {
		const targetIndex = Number(index)
		if (!Number.isFinite(targetIndex)) return []
		const matches = []
		const seen = new Set()
		const push = (source, item) => {
			if (!item || Number(item.index) !== targetIndex) return
			const key = `${source}:${stableJson(item)}`
			if (seen.has(key)) return
			seen.add(key)
			matches.push({ source, item })
		}
		for (const item of (Array.isArray(observation?.elements) ? observation.elements : [])) {
			push('elements', item)
		}
		for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
			for (const field of (Array.isArray(form?.fields) ? form.fields : [])) {
				push(`forms:${form?.id || form?.name || 'page_form'}`, field)
			}
		}
		for (const item of (Array.isArray(observation?.actions) ? observation.actions : [])) {
			push('actions', item)
		}
		for (const item of (Array.isArray(observation?.options) ? observation.options : [])) {
			push('options', item)
		}
		for (const item of (Array.isArray(observation?.popups) ? observation.popups : [])) {
			push('popups', item)
		}
		for (const panel of (Array.isArray(observation?.panels) ? observation.panels : [])) {
			if (Number(panel?.triggerIndex) !== targetIndex) continue
			push('panels', {
				index: panel.triggerIndex,
				region: panel.region,
				label: panel.triggerLabel || panel.label,
				role: 'button',
				kind: panel.kind,
				state: panel.state,
				panelLabel: panel.label,
			})
		}
		return matches
	}

	function buildContextChunk(observation, input) {
		const source = normalizeContextSource(input.source || input.target || 'simplified_dom')
		const region = String(input.region || '').trim()
		const queryText = String(input.query || input.label || '')
		const query = normalizeSearchText(queryText)
		const queryTerms = splitContextQueryTerms(queryText)
		const allRows = buildSectionRows(observation, source, { region })
		const rows = query
			? allRows.filter((line) => rowMatchesContextQuery(line, query, queryTerms))
			: allRows
		const limit = clampInteger(input.limit, 1, 80, 40)
		const cursor = clampInteger(input.cursor, -1, Number.MAX_SAFE_INTEGER, 0)
		const cursorInRange = rows.length > 0 && cursor >= 0 && cursor < rows.length
		const slice = cursorInRange ? rows.slice(cursor, cursor + limit) : []
		const nextCursor = cursorInRange && cursor + slice.length < rows.length ? cursor + slice.length : -1
		return [
			`<context_chunk source="${source}" cursor="${cursor}" limit="${limit}" nextCursor="${nextCursor}" total="${rows.length}" region="${region || '-'}" query="${shortText(input.query || '', 40)}">`,
			...(slice.length ? slice : buildEmptyContextChunkRows(source, allRows, queryText)),
			'</context_chunk>',
		].join('\n')
	}

	function buildEmptyContextChunkRows(source, allRows, queryText) {
		const rows = ['(empty)']
		const query = String(queryText || '').trim()
		const reason = Array.isArray(allRows) && allRows.length
			? 'query_no_match'
			: `no_observed_${source}`
		const guidance = buildEmptyContextGuidance(source, query, reason)
		rows.push(`empty_context reason="${escapeAttr(reason)}" guidance="${escapeAttr(guidance)}"`)
		return rows
	}

	function buildEmptyContextGuidance(source, query, reason) {
		if (source === 'tables') {
			return reason === 'query_no_match'
				? `当前表格摘要中没有匹配 "${query}" 的行；可放宽 query 或 inspect_region content 查看列表区域。`
				: '当前观察没有表格摘要；可 inspect_region content 或 request_context source=raw_candidates 查看列表区域，缺样本时不要填写泛化搜索词。'
		}
		if (source === 'forms') return '当前观察没有匹配的表单字段；可 inspect_region content 或放宽 query。'
		if (source === 'actions') return '当前观察没有匹配的动作按钮；可 inspect_region content 或放宽 query。'
		if (source === 'raw_candidates' || source === 'simplified_dom') return '当前观察没有匹配的原始候选；可 inspect_region content 或更换 query。'
		return '当前观察没有匹配上下文；可更换 source、region、query 或 inspect_region content。'
	}

	function splitContextQueryTerms(value) {
		return String(value || '')
			.split(/[\s,，;；|/、]+/)
			.map(normalizeSearchText)
			.filter((item) => item.length >= 2)
	}

	function rowMatchesContextQuery(line, query, terms) {
		const text = normalizeSearchText(line)
		if (!text) return false
		if (Array.isArray(terms) && terms.length) {
			return terms.some((term) => text.includes(term))
		}
		return text.includes(query)
	}

	function buildIndexInspection(observation, input) {
		const index = Number(input.index)
		if (!Number.isFinite(index)) return 'inspect_index 缺少有效 index。'
		const elements = Array.isArray(observation?.elements) ? observation.elements : []
		const matches = findObservedIndexMatches(observation, index)
		if (!matches.length) return `未找到 index=${index} 的元素。`
		const elementMatch = matches.find((match) => match.source === 'elements')
		const item = elementMatch?.item || matches[0].item
		const lines = [
			`<index_detail index="${index}">`,
			'<observed_matches>',
			...matches.slice(0, 10).map(formatObservedIndexMatchLine),
			'</observed_matches>',
		]
		const simplifiedRows = findRowsByIndex(observation?.simplifiedDom, index)
		if (simplifiedRows.length) {
			lines.push('<simplified_matches>')
			lines.push(...simplifiedRows.slice(0, 4))
			lines.push('</simplified_matches>')
		}
		const rawRows = findRowsByIndex(observation?.rawCandidates, index)
		if (rawRows.length) {
			lines.push('<raw_matches>')
			lines.push(...rawRows.slice(0, 4))
			lines.push('</raw_matches>')
		}
		const neighbors = elementMatch
			? elements
				.filter((el) => el && Number(el.index) !== index && (!item.region || el.region === item.region))
				.sort((a, b) => rectDistance(item.rect, a.rect) - rectDistance(item.rect, b.rect))
				.slice(0, 8)
			: []
		if (neighbors.length) {
			lines.push('<nearby>')
			lines.push(...neighbors.map(formatElementBriefLine))
			lines.push('</nearby>')
		}
		lines.push('</index_detail>')
		return lines.join('\n')
	}

	function buildRegionInspection(observation, input) {
		const region = String(input.region || 'content').trim()
		const source = normalizeContextSource(input.source || 'all')
		const limit = clampInteger(input.limit, 1, 120, 80)
		const rows = buildSectionRows(observation, source, { region }).slice(0, limit)
		return [
			`<region_detail region="${region}" source="${source}" totalShown="${rows.length}">`,
			...(rows.length ? rows : ['(empty)']),
			'</region_detail>',
		].join('\n')
	}

	function buildOptionsInspection(observation, input) {
		const index = Number(input.index)
		const matches = Number.isFinite(index) ? findObservedIndexMatches(observation, index) : []
		const item = chooseOptionTargetItem(matches)
		const rows = []
		rows.push(`<options_for index="${Number.isFinite(index) ? index : '-'}">`)
		if (matches.length) {
			rows.push('<target_matches>')
			rows.push(...matches.slice(0, 8).map(formatObservedIndexMatchLine))
			rows.push('</target_matches>')
		}
		const nativeOptions = Array.isArray(item?.optionLabels) ? item.optionLabels : []
		if (nativeOptions.length) {
			rows.push('<native_options>')
			rows.push(...nativeOptions.slice(0, 80).map((label, idx) => `option ${idx + 1}: ${label}`))
			rows.push('</native_options>')
		}
		const popups = buildScopedOptionRows(observation, 'popups', item, 'popup', 60)
		const options = buildScopedOptionRows(observation, 'options', item, 'option', 80)
		if (popups.rows.length) {
			const tag = isScopedOptionContextUsable(popups.scope) ? 'visible_popups' : 'diagnostic_popups'
			rows.push(`<${tag} scoped="${popups.scope}" total="${popups.total}"${formatDiagnosticOptionGuidance(popups.scope)}>`)
			rows.push(...popups.rows)
			rows.push(`</${tag}>`)
		}
		if (options.rows.length) {
			const tag = isScopedOptionContextUsable(options.scope) ? 'visible_options' : 'diagnostic_options'
			rows.push(`<${tag} scoped="${options.scope}" total="${options.total}"${formatDiagnosticOptionGuidance(options.scope)}>`)
			rows.push(...options.rows)
			rows.push(`</${tag}>`)
		}
		if (!nativeOptions.length && !popups.rows.length && !options.rows.length) {
			rows.push('当前观察没有可见下拉候选。通常需要先对该字段执行 open_dropdown 后重新观察；旧 select_dropdown_option 仅作兼容。')
		}
		rows.push('</options_for>')
		return rows.join('\n')
	}

	function chooseOptionTargetItem(matches) {
		const list = Array.isArray(matches) ? matches.filter((match) => match?.item) : []
		if (!list.length) return null
		return list
			.map((match, order) => ({
				match,
				order,
				score: scoreOptionTargetMatch(match),
			}))
			.sort((a, b) => b.score - a.score || a.order - b.order)[0]?.match?.item || null
	}

	function scoreOptionTargetMatch(match) {
		const item = match?.item || {}
		const source = String(match?.source || '').trim()
		const sourceRoot = source.split(':')[0]
		let score = 0
		if (source.startsWith('forms:')) score += 120
		else if (sourceRoot === 'elements') score += 20
		else if (sourceRoot === 'actions') score -= 20
		else if (sourceRoot === 'options' || sourceRoot === 'popups') score -= 120
		if (Array.isArray(item.optionLabels) && item.optionLabels.length) score += 90
		if (controlSemantics?.isObservedDropdownLike?.(item)) score += 80
		if (item.fieldType) score += 70
		if (item.selectionControl) score += 40
		if (item.label || item.placeholder || item.text) score += 25
		if (item.semanticContainer) score += 10
		if (item.relationHints || item.popupHints) score += 10
		return score
	}

	function buildScopedOptionRows(observation, source, targetItem, kind, limit) {
		const rawItems = Array.isArray(observation?.[source]) ? observation[source] : []
		const scoped = filterOptionItemsForTarget(rawItems, targetItem)
		const ranked = scoped.items.slice(0, limit)
		return {
			scope: scoped.scope,
			total: scoped.items.length,
			rows: ranked.map((item) => formatOptionLine(item, kind)),
		}
	}

	function filterOptionItemsForTarget(items, targetItem) {
		const list = rankObservationItems(Array.isArray(items) ? items.filter(Boolean) : [])
		if (!list.length) return { scope: 'global', items: [] }
		if (!targetItem) return { scope: 'global', items: list }
		const scores = controlSemantics?.OPTION_ASSOCIATION_SCORES || {}
		const explicitLimit = Number(scores.geometryOffset) || 1000
		const scored = list
			.map((item, order) => ({
				item,
				order,
				score: controlSemantics?.scoreObservedOptionAssociation
					? controlSemantics.scoreObservedOptionAssociation(item, targetItem)
					: Number.POSITIVE_INFINITY,
			}))
		const explicit = scored
			.filter((entry) => Number.isFinite(entry.score) && entry.score < explicitLimit)
			.sort((a, b) => a.score - b.score || a.order - b.order)
			.map((entry) => entry.item)
		if (explicit.length) return { scope: 'explicit', items: explicit }
		if (!controlSemantics?.normalizeRect?.(targetItem?.rect)) return { scope: 'global', items: list }
		const related = scored
			.filter((entry) => Number.isFinite(entry.score))
			.sort((a, b) => a.score - b.score || a.order - b.order)
			.map((entry) => entry.item)
		if (related.length) return { scope: 'field', items: related }
		return { scope: 'global_fallback', items: list }
	}

	function isScopedOptionContextUsable(scope) {
		return ['explicit', 'field'].includes(String(scope || '').trim())
	}

	function formatDiagnosticOptionGuidance(scope) {
		if (isScopedOptionContextUsable(scope)) return ''
		return ' guidance="候选未能与目标字段建立稳定归属，仅供定位/排查；不要直接选择这些候选，先重新 open_dropdown 或 inspect_region popover/content。分配候选时必须依赖显式 owner、当前活动弹层或几何关联。"'
	}

	function buildSectionRows(observation, source, filters = {}) {
		const normalized = normalizeContextSource(source)
		const region = String(filters.region || '').trim()
		const rows = []
		const pushRow = (item, formatter) => {
			if (region && item?.region !== region) return
			rows.push(formatter(item))
		}
		if (normalized === 'all' || normalized === 'panels') {
			for (const panel of (Array.isArray(observation?.panels) ? observation.panels : [])) {
				if (region && panel?.region !== region) continue
				rows.push(formatPanelLine(panel))
			}
			if (normalized === 'panels') return rows
		}
		if (normalized === 'all' || normalized === 'tables') {
			for (const table of (Array.isArray(observation?.tables) ? observation.tables : [])) {
				rows.push(formatTableLine(table, 8))
			}
			if (!rows.length) rows.push(...collectFallbackTableContextRows(observation, region))
			if (normalized === 'tables') return rows
		}
		if (normalized === 'all' || normalized === 'forms') {
			for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
				const fields = Array.isArray(form.fields) ? form.fields : []
				const selectedFields = region ? fields.filter((field) => field?.region === region) : fields
				if (!selectedFields.length) continue
				rows.push(`form id=${form.id || '-'} name="${form.name || '页面表单'}"`)
				for (const field of selectedFields) rows.push(formatFieldLine(field))
			}
			if (normalized === 'forms') return rows
		}
		if (normalized === 'all' || normalized === 'actions') {
			for (const action of rankObservationItems(Array.isArray(observation?.actions) ? observation.actions : [])) {
				pushRow(action, formatActionLine)
			}
			if (normalized === 'actions') return rows
		}
		if (normalized === 'all' || normalized === 'popups') {
			for (const popup of rankObservationItems(Array.isArray(observation?.popups) ? observation.popups : [])) {
				pushRow(popup, (item) => formatOptionLine(item, 'popup'))
			}
			if (normalized === 'popups') return rows
		}
		if (normalized === 'all' || normalized === 'options') {
			for (const option of rankObservationItems(Array.isArray(observation?.options) ? observation.options : [])) {
				pushRow(option, (item) => formatOptionLine(item, 'option'))
			}
			if (normalized === 'options') return rows
		}
		if (normalized === 'elements') {
			return rankObservationItems(Array.isArray(observation?.elements) ? observation.elements : [])
				.filter((item) => !region || item.region === region)
				.map(formatElementBriefLine)
		}
		if (normalized === 'dom_tree') {
			return (Array.isArray(observation?.treeCandidates) ? observation.treeCandidates : [])
				.map((row) => String(row?.line || row || ''))
				.filter((line) => !region || line.includes(`region=${region}`))
		}
		if (normalized === 'simplified_dom') {
			return (Array.isArray(observation?.simplifiedDom) ? observation.simplifiedDom : [])
				.map((row) => String(row || ''))
				.filter((line) => !region || line.includes(`region="${region}"`))
		}
		if (normalized === 'raw_candidates') {
			return (Array.isArray(observation?.rawCandidates) ? observation.rawCandidates : [])
				.map((row) => String(row || ''))
				.filter((line) => !region || line.includes(`region="${region}"`))
		}
		return rows
	}

	function collectFallbackTableContextRows(observation, region = '') {
		const rows = []
		const seen = new Set()
		const sources = [
			...(Array.isArray(observation?.simplifiedDom) ? observation.simplifiedDom : []),
			...(Array.isArray(observation?.rawCandidates) ? observation.rawCandidates : []),
			...(Array.isArray(observation?.treeCandidates)
				? observation.treeCandidates.map((row) => row?.line || row)
				: []),
		]
		for (const row of sources) {
			const line = String(row || '').trim()
			if (!isFallbackTableContextLine(line, region)) continue
			const key = line.replace(/\s+/g, ' ').slice(0, 240)
			if (seen.has(key)) continue
			seen.add(key)
			rows.push(line)
			if (rows.length >= 40) break
		}
		return rows
	}

	function isFallbackTableContextLine(line, region = '') {
		const text = String(line || '').trim()
		if (!text) return false
		if (region && !text.includes(`region="${region}"`) && !text.includes(`region=${region}`)) return false
		if (/^(field|action|option|popup|panel)\s+index=/i.test(text)) return false
		if (/<(field|action|option|popup|panel)\b/i.test(text)) return false
		if (/(请输入|请选择|清空|重置|新增|导入|导出)/.test(text.replace(/\s+/g, ''))) return false
		return /(table|row|cell|td|tr|grid|列表|数据|tbody|el-table|ant-table|vxe-table|record-list|data-list)/i.test(text)
	}

	function selectObservationItems(items, limit, taskText) {
		const ranked = rankObservationItems(items)
		const selected = []
		const add = (item) => {
			if (!item || selected.includes(item) || selected.length >= limit) return
			selected.push(item)
		}
		for (const item of ranked) {
			if (isTaskRelevantObservationItem(item, taskText)) add(item)
		}
		for (const item of ranked) add(item)
		return selected
	}

	function selectTextRows(rows, limit, taskText) {
		const list = Array.isArray(rows) ? rows : []
		const selected = []
		const add = (row) => {
			if (!row || selected.includes(row) || selected.length >= limit) return
			selected.push(row)
		}
		for (const row of list) {
			if (isTaskRelevantTextRow(row, taskText)) add(row)
		}
		for (const row of list) add(row)
		return selected
	}

	function isTaskRelevantTextRow(row, taskText) {
		const text = normalizeSearchText(row)
		if (!text) return false
		return extractTaskTargetLabels(taskText).some((target) => {
			const normalized = normalizeSearchText(target)
			return normalized && text.includes(normalized)
		})
	}

	function isTaskRelevantObservationItem(item, taskText) {
		const task = normalizeSearchText(taskText)
		if (!task || !item) return false
		const label = normalizeSearchText([
			item.label,
			item.text,
			item.placeholder,
			item.semanticContainer,
			item.actionIntent,
			item.fieldType,
		].filter(Boolean).join(' '))
		if (!label || label.length < 2) return false
		if (task.includes(label) || label.includes(task)) return true
		return extractTaskTargetLabels(taskText).some((target) => {
			const normalized = normalizeSearchText(target)
			return normalized && (label.includes(normalized) || normalized.includes(label))
		})
	}

	function rankObservationItems(items) {
		return [...items].sort((a, b) => scoreObservationItem(a) - scoreObservationItem(b))
	}

	function scoreObservationItem(item) {
		if (!item || typeof item !== 'object') return 99
		let score = 0
		const actionText = normalizeSearchText([
			item.label,
			item.text,
			item.placeholder,
			Array.isArray(item.aliases) ? item.aliases.join(' ') : '',
			item.semanticContainer,
			item.actionIntent,
			item.navigationTarget,
			item.target,
		].filter(Boolean).join(' '))
		if (item.newSinceLastObservation) score -= 3
		const region = String(item.region || '')
		if (region === 'popover') score -= 6
		else if (region === 'dialog') score -= 5
		else if (region === 'content') score -= 2
		if (region === 'pagination') score += 4
		if (region === 'header' || region === 'sidebar') score += 2
		score += scoreHitStateForRanking(item)
		if (item.selectionControl || item.fieldType || item.actionIntent) score -= 1
		if (item.actionIntent === 'open_filter' || item.actionIntent === 'search') score -= 1
		if (item.actionIntent === 'create') score -= 10
		if (/(新增|新建|创建|添加|增加|add|create|new|plus)/i.test(actionText)) score -= 8
		const rect = item.rect || {}
		return score * 1000000 + (Number(rect.top) || 0) * 1000 + (Number(rect.left) || 0)
	}

	function scoreHitStateForRanking(item) {
		if (!item || typeof item !== 'object') return 0
		const state = String(item.hitState || '').trim().toLowerCase()
		if (state === 'covered') return 30
		if (state === 'partial') return 3
		if (state === 'hittable') return -1
		const points = String(item.hitPoints || '').trim()
		const match = points.match(/^(\d+)\s*\/\s*(\d+)$/)
		if (match && Number(match[1]) <= 0 && Number(match[2]) > 0) return 30
		const ratio = Number(item.hitRatio)
		if (Number.isFinite(ratio) && ratio <= 0 && points) return 30
		return 0
	}

	function formatObservedIndexMatchLine(match) {
		const source = String(match?.source || 'unknown')
		const item = match?.item || {}
		let detail = ''
		if (source.startsWith('forms:')) detail = formatFieldLine(item)
		else if (source === 'actions') detail = formatActionLine(item)
		else if (source === 'options') detail = formatOptionLine(item, 'option')
		else if (source === 'popups') detail = formatOptionLine(item, 'popup')
		else detail = formatElementDetailLine(item)
		return `source=${source} ${detail}`
	}

	function findRowsByIndex(rows, index) {
		const list = Array.isArray(rows) ? rows : []
		const quoted = `index="${index}"`
		const bracket = `[${index}]`
		const plain = `index=${index}`
		return list.map((row) => String(row || '')).filter((line) => line.includes(quoted) || line.includes(bracket) || line.includes(plain))
	}

	function formatElementBriefLine(item) {
		const options = Array.isArray(item.optionLabels) && item.optionLabels.length
			? ` options="${shortText(item.optionLabels.join('|'), 160)}"`
			: ''
		const validation = item.invalid || item.validationMessage
			? ` invalid=${item.invalid ? 'true' : 'false'} error="${shortText(item.validationMessage || '', 96)}"`
			: ''
		return `element index=${item.index} region=${item.region || '-'} role=${item.role || '-'} fieldType=${item.fieldType || '-'} intent=${item.actionIntent || '-'} control=${item.selectionControl || '-'} label="${shortText(item.label || item.placeholder || item.text || '', 48)}" value=${item.valueState || '-'}${validation}${options} rect=${formatRect(item.rect)} hit=${formatHitState(item)}`
	}

	function formatElementDetailLine(item) {
		const hint = item.selectorHints || {}
		return [
			formatElementBriefLine(item),
			`stableId=${item.stableId || '-'} tag=${item.tag || '-'} type=${item.type || '-'} labelSource=${item.labelSource || '-'} labelConf=${item.labelConfidence || '-'} aliases="${Array.isArray(item.aliases) ? item.aliases.join('|') : ''}" expanded=${item.expandedState || '-'} required=${item.required ? 'true' : 'false'} invalid=${item.invalid ? 'true' : 'false'} errorSource=${item.validationSource || '-'} conf=${item.confidence || '-'}`,
			`placeholder="${item.placeholder || ''}" text="${shortText(item.text || '', 80)}"`,
			`selectorHints=${JSON.stringify(hint)} domPath="${shortText(item.domPath || '', 160)}"`,
		].join('\n')
	}

	function formatFieldLine(field) {
		return [
			`field index=${field.index}`,
			field.stableId ? `sid=${field.stableId}` : '',
			field.region ? `region=${field.region}` : '',
			field.rect ? `rect=${formatRect(field.rect)}` : '',
			`hit=${formatHitState(field)}`,
			`fieldType=${field.fieldType || 'unknown'}`,
			field.controlKind ? `kind=${field.controlKind}` : '',
			`label="${shortText(field.label || field.placeholder || field.text || '', 48)}"`,
			field.labelSource ? `source=${field.labelSource}` : '',
			field.labelConfidence ? `labelConf=${field.labelConfidence}` : '',
			Array.isArray(field.aliases) && field.aliases.length
				? `aliases="${shortText(field.aliases.join('|'), 96)}"`
				: '',
			field.semanticContainer ? `container="${shortText(field.semanticContainer, 48)}"` : '',
			`value=${field.valueState || 'unknown'}`,
			`type=${field.type || '-'}`,
			`role=${field.role || '-'}`,
			`control=${field.selectionControl || '-'}`,
			field.stateHints ? `state="${shortText(field.stateHints, 96)}"` : '',
			field.relationHints ? `rel="${shortText(field.relationHints, 96)}"` : '',
			field.popupHints ? `popup="${shortText(field.popupHints, 96)}"` : '',
			Array.isArray(field.optionLabels) && field.optionLabels.length
				? `options="${shortText(field.optionLabels.join('|'), 160)}"`
				: '',
			`expanded=${field.expandedState || '-'}`,
			`required=${field.required ? 'true' : 'false'}`,
			`invalid=${field.invalid ? 'true' : 'false'}`,
				field.validationMessage ? `error="${shortText(field.validationMessage, 120)}"` : '',
				field.validationSource ? `errorSource=${field.validationSource}` : '',
				formatFieldConstraintHints(field),
				`conf=${field.confidence || '-'}`,
			].filter(Boolean).join(' ')
		}

		function formatFieldConstraintHints(field) {
			const parts = []
			if (Number(field?.maxLength) > 0) parts.push(`maxLength=${Number(field.maxLength)}`)
			if (Number(field?.minLength) > 0) parts.push(`minLength=${Number(field.minLength)}`)
			if (field?.min !== undefined && String(field.min || '').trim()) parts.push(`min=${shortText(field.min, 32)}`)
			if (field?.max !== undefined && String(field.max || '').trim()) parts.push(`max=${shortText(field.max, 32)}`)
			if (field?.step !== undefined && String(field.step || '').trim()) parts.push(`step=${shortText(field.step, 32)}`)
			if (field?.inputMode) parts.push(`inputMode=${shortText(field.inputMode, 32)}`)
			if (field?.autocomplete) parts.push(`autocomplete=${shortText(field.autocomplete, 48)}`)
			if (field?.pattern) parts.push(`pattern="${shortText(field.pattern, 96)}"`)
			return parts.length ? `constraints="${parts.join(' ')}"` : ''
		}

	function formatActionLine(action) {
		return [
			`action index=${action.index}`,
			action.stableId ? `sid=${action.stableId}` : '',
			action.region ? `region=${action.region}` : '',
			action.rect ? `rect=${formatRect(action.rect)}` : '',
			`hit=${formatHitState(action)}`,
			`intent=${action.actionIntent || 'unknown'}`,
			action.controlKind ? `kind=${action.controlKind}` : '',
			`label="${shortText(action.label || action.text || '', 48)}"`,
			action.labelSource ? `source=${action.labelSource}` : '',
			action.labelConfidence ? `labelConf=${action.labelConfidence}` : '',
			Array.isArray(action.aliases) && action.aliases.length
				? `aliases="${shortText(action.aliases.join('|'), 96)}"`
				: '',
			action.semanticContainer ? `container="${shortText(action.semanticContainer, 48)}"` : '',
			`role=${action.role || '-'}`,
			`value=${action.valueState || 'unknown'}`,
			`control=${action.selectionControl || '-'}`,
			action.stateHints ? `state="${shortText(action.stateHints, 96)}"` : '',
			action.relationHints ? `rel="${shortText(action.relationHints, 96)}"` : '',
			action.popupHints ? `popup="${shortText(action.popupHints, 96)}"` : '',
			action.navigationTarget ? `target="${shortText(action.navigationTarget, 96)}"` : '',
			`expanded=${action.expandedState || '-'}`,
			`conf=${action.confidence || '-'}`,
		].filter(Boolean).join(' ')
	}

	function formatOptionLine(option, kind) {
		return [
			`${kind} index=${option.index}`,
			option.stableId ? `sid=${option.stableId}` : '',
			option.region ? `region=${option.region}` : '',
			option.rect ? `rect=${formatRect(option.rect)}` : '',
			`hit=${formatHitState(option)}`,
			`label="${shortText(option.label || option.text || '', 48)}"`,
			`role=${option.role || '-'}`,
			`value=${option.valueState || 'unknown'}`,
			option.controlKind ? `kind=${option.controlKind}` : '',
			`control=${option.selectionControl || '-'}`,
			option.relationHints ? `rel="${shortText(option.relationHints, 96)}"` : '',
			option.popupHints ? `popup="${shortText(option.popupHints, 96)}"` : '',
			`expanded=${option.expandedState || '-'}`,
			option.newSinceLastObservation ? 'new=true' : '',
			`conf=${option.confidence || '-'}`,
		].filter(Boolean).join(' ')
	}

	function formatPanelLine(panel) {
		const fields = Array.isArray(panel.fields) && panel.fields.length
			? `fields="${shortText(panel.fields.join(','), 160)}"`
			: ''
		const trigger = Number.isFinite(Number(panel.triggerIndex))
			? `triggerIndex=${panel.triggerIndex} triggerLabel="${shortText(panel.triggerLabel || '', 48)}"`
			: ''
		return [
			`panel kind=${panel.kind || 'unknown'}`,
			`region=${panel.region || '-'}`,
			`state=${panel.state || 'unknown'}`,
			`label="${shortText(panel.label || '', 48)}"`,
			trigger,
			fields,
		].filter(Boolean).join(' ')
	}

	function formatTableLine(table, rowLimit = 6) {
		const headers = Array.isArray(table?.headers) ? table.headers : []
		const lines = [
			`table region=${table?.region || '-'} rect=${formatRect(table?.rect)} headers="${shortText(headers.join('|'), 160)}"`,
		]
		const rows = Array.isArray(table?.rows) ? table.rows : []
		for (let rowIndex = 0; rowIndex < rows.length && rowIndex < rowLimit; rowIndex += 1) {
			const cells = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : []
			const pairs = cells.map((cell, cellIndex) => {
				const header = headers[cellIndex] || `col${cellIndex + 1}`
				return `${header}=${cell}`
			})
			lines.push(`  row ${rowIndex + 1}: ${shortText(pairs.join(' | '), 240)}`)
		}
		return lines.join('\n')
	}

	function formatRect(rect) {
		if (!rect || typeof rect !== 'object') return '-'
		return `${rect.left || 0},${rect.top || 0},${rect.width || 0}x${rect.height || 0}`
	}

	function formatHitState(item) {
		const state = String(item?.hitState || '').trim() || 'unknown'
		const points = String(item?.hitPoints || '').trim()
		const ratio = Number(item?.hitRatio)
		const ratioText = Number.isFinite(ratio) ? `:${ratio}` : ''
		const pointText = points ? `(${points})` : ''
		const blocker = item?.hitBlocker
			? ` blocker=${shortText(String(item.hitBlocker || '').replace(/["'<>]/g, '').replace(/\s+/g, '_'), 48)}`
			: ''
		return `${state}${ratioText}${pointText}${blocker}`
	}

	function rectDistance(a, b) {
		if (!a || !b) return Number.MAX_SAFE_INTEGER
		const ax = Number(a.left || 0) + Number(a.width || 0) / 2
		const ay = Number(a.top || 0) + Number(a.height || 0) / 2
		const bx = Number(b.left || 0) + Number(b.width || 0) / 2
		const by = Number(b.top || 0) + Number(b.height || 0) / 2
		return Math.abs(ax - bx) + Math.abs(ay - by)
	}

	function normalizeContextSource(value) {
		const raw = String(value || '').trim().toLowerCase()
		const aliases = {
			raw: 'raw_candidates',
			raw_candidate: 'raw_candidates',
			raw_candidates: 'raw_candidates',
			tree: 'dom_tree',
			dom: 'dom_tree',
			dom_tree: 'dom_tree',
			simplified: 'simplified_dom',
			simplified_dom: 'simplified_dom',
			form: 'forms',
			field: 'forms',
			fields: 'forms',
			action: 'actions',
			popup: 'popups',
			option: 'options',
			element: 'elements',
			table: 'tables',
			tables: 'tables',
		}
		return aliases[raw] || raw || 'simplified_dom'
	}

	function extractTaskTargetLabels(taskText) {
		const text = String(taskText || '')
		const labels = []
		const chineseTargetContext = '(?:部分|模块|页面|网页|页|区域|列表|面板|菜单|标签页|中|里|内|下)'
		const patterns = [
			/(?:找到|进入|打开|前往|切换到|定位到|访问|查看)\s*[“"']([^”"']{1,48})[”"']/g,
			new RegExp(`(?:找到|进入|打开|前往|切换到|定位到|访问|查看|在)\\s*([^，。；;,\\n\\r]{1,56}?)${chineseTargetContext}`, 'g'),
			/在\s*([^，。；;,\n\r]{2,40}?)(?=(?:新增|新建|创建|添加|增加|编辑|修改|更新|查看|预览|测试|验证|检查|排查|搜索|查询|筛选|过滤|填写|填入|填表|录入))/g,
			/(?:找到|进入|前往|切换到|定位到|访问)\s*([^，。；;,\n\r]{2,40})(?=[，。；;,\n\r]|$)/g,
			new RegExp(`([^，。；;,\\n\\r]{2,48}?)${chineseTargetContext}(?=[，。；;,\\n\\r]|$)`, 'g'),
			/(?:open|go\s+to|goto|navigate\s+to|visit|switch\s+to|find|enter)\s+["']?([^"',.;\n\r]{2,56}?)["']?\s+(?:page|screen|view|section|area|panel|menu|module|tab)\b/gi,
			/["']([^"']{2,56})["']\s+(?:page|screen|view|section|area|panel|menu|module|tab)\b/gi,
			/(?:go\s+to|goto|navigate\s+to|switch\s+to|find|enter)\s+(?!https?:\/\/|www\.)([A-Za-z][A-Za-z0-9 _/-]{1,40})(?=$|[，。；;,.\n\r])/gi,
		]
		for (const pattern of patterns) {
			for (const match of text.matchAll(pattern)) {
				const label = normalizeTaskTargetLabel(match?.[1])
				if (label) labels.push(label)
			}
		}
		return [...new Set(labels.map((item) => item.trim()).filter((item) => item.length >= 2))]
	}

	function normalizeTaskTargetLabel(value) {
		const raw = trimToLastTaskNavigationVerb(String(value || ''))
			.replace(/[“”"']/g, '')
			.replace(/\s+/g, ' ')
			.trim()
		if (containsUrlLikeTaskTarget(raw)) return ''
		const withoutVerb = stripTaskTargetActionNoise(stripTaskTargetLeadingNoise(raw))
		if (isGenericTaskTargetLabel(withoutVerb)) return ''
		if (isAssignmentLikeTaskTargetLabel(withoutVerb)) return ''
		const label = stripTaskTargetActionNoise(stripTaskTargetContextSuffix(withoutVerb))
			.replace(/^(?:the|a|an)\s+/i, '')
			.trim()
		const compact = label.replace(/\s+/g, '')
		if (!label || compact.length < 2 || compact.length > 40) return ''
		if (containsUrlLikeTaskTarget(label)) return ''
		if (containsCredentialLikeTaskTarget(label)) return ''
		if (isRecordSelectorLikeTaskTarget(label)) return ''
		if (isGenericTaskTargetLabel(label)) return ''
		if (isAssignmentLikeTaskTargetLabel(label)) return ''
		if (/^(搜索|查询|筛选|过滤)(区域|条件|页面|列表)?$/.test(label)) return ''
		return label
	}

	function stripTaskTargetContextSuffix(value) {
		return String(value || '')
			.replace(/(?:部分|模块|页面|网页|页|区域|列表|面板|菜单|标签页|中|里|内|下)$/gi, '')
			.replace(/\s+(?:page|screen|view|section|area|panel|menu|module|tab)$/i, '')
			.trim()
	}

	function trimToLastTaskNavigationVerb(value) {
		const text = String(value || '')
		const matches = [...text.matchAll(/(?:找到|进入|打开|前往|切换到|定位到|访问|查看)\s*/g)]
		const last = matches[matches.length - 1]
		if (!last || Number(last.index) <= 0) return text
		return text.slice(Number(last.index) + last[0].length)
	}

	function containsUrlLikeTaskTarget(value) {
		return /(https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,}(?:\/|\b)|\S+@\S+\.\S+)/i.test(String(value || ''))
	}

	function containsCredentialLikeTaskTarget(value) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		return /(?:账号|账户|用户名|登录账号|密码|口令|验证码|手机号|手机|电话)\s*[:：= ]/i.test(text) ||
			/\b(?:account|username|user|password|passcode|otp|phone|mobile)\s*[:= ]/i.test(text)
	}

	function isRecordSelectorLikeTaskTarget(value) {
		return /(?:列表)?(?:第一条|第一行|首条|首行|第\s*1\s*[条行])/.test(String(value || ''))
	}

	function stripTaskTargetLeadingNoise(value) {
		let text = String(value || '').trim()
		for (let i = 0; i < 4; i++) {
			const next = text
				.replace(/^(?:然后|接着|再|并且|同时|随后|帮我|请|麻烦|你|我|先|去|到|把|将|给我)+/g, '')
				.replace(/^(?:找到|找出|进入|打开|前往|切换到|定位到|在|查看)\s*/g, '')
				.trim()
			if (next === text) break
			text = next
		}
		return text
	}

	function stripTaskTargetActionNoise(value) {
		let text = String(value || '').trim()
		for (let i = 0; i < 4; i++) {
			const next = text
				.replace(/^(?:新增|新建|创建|添加|增加|编辑|修改|查看|预览|测试|检查|验证|核验|确认)\s*/g, '')
				.replace(/(?:新增|新建|创建|添加|增加|编辑|修改|查看|预览|测试|检查|验证|核验|确认|填写|填入|搜索|查询|筛选|过滤).+$/g, '')
				.replace(/(?:新增|新建|创建|添加|增加|编辑|修改|详情|明细|查看|预览|搜索|查询|筛选|过滤)$/g, '')
				.trim()
			if (next === text) break
			text = next
		}
		return text
	}

	function isGenericTaskTargetLabel(value) {
		const label = String(value || '').trim()
		if (!label) return true
		if (/^(这个|那个|当前|目标|该|本|此)$/.test(label)) return true
		return /^(这个|那个|当前|目标|该|本|此)?(页面|网页|地址|链接|URL|url)$/.test(label)
	}

	function isAssignmentLikeTaskTargetLabel(value) {
		const label = String(value || '').replace(/\s+/g, '').trim()
		if (!label) return false
		return /^[\u4e00-\u9fa5A-Za-z0-9]{1,10}(?:为|是|叫|名为|名称为|设为|设置为).+/.test(label)
	}

	function limitObservationText(lines, maxChars) {
		const limit = Math.max(4000, Number(maxChars) || 18000)
		const output = []
		let total = 0
		for (const line of lines) {
			const text = String(line || '')
			const nextTotal = total + text.length + 1
			if (nextTotal > limit) {
				output.push(`... observation truncated at ${limit} chars`)
				break
			}
			output.push(text)
			total = nextTotal
		}
		return output.join('\n')
	}

	function clampInteger(value, min, max, fallback) {
		const raw = Number(value)
		if (!Number.isFinite(raw)) return fallback
		return Math.max(min, Math.min(max, Math.floor(raw)))
	}

	function normalizeSearchText(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
	}

	function stableJson(value) {
		if (!value || typeof value !== 'object') return JSON.stringify(value)
		if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
		const pairs = Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
		return `{${pairs.join(',')}}`
	}

	function shortText(value, maxLen) {
		const text = String(value || '')
		if (text.length <= maxLen) return text
		return `${text.slice(0, maxLen)} ...[truncated ${text.length - maxLen}]`
	}

	function escapeAttr(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
	}

	g.NC_BG_PLANNER_CONTEXT = {
		buildDuplicatePlanningContext,
		buildInvalidActionContext,
		buildInvalidActionInputContext,
		buildInvalidModelOutputContext,
		buildObservationText,
		buildSectionRows,
		extractTaskTargetLabels,
		findObservedIndexMatches,
		planningRequestSignature,
		resolvePlanningContextRequest,
		shortText,
		stableJson,
	}
})(globalThis)
