;(function (g) {
	const controlSemantics = g.NC_CONTROL_SEMANTICS || null

	function buildObservationText(observation, opts = {}) {
		const parts = []
		const compact = !!opts.compact
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		const actions = Array.isArray(observation?.actions) ? observation.actions : []
		const optionItems = Array.isArray(observation?.options) ? observation.options : []
		const popups = Array.isArray(observation?.popups) ? observation.popups : []
		const panels = Array.isArray(observation?.panels) ? observation.panels : []
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
		return limitObservationText(parts, opts.maxChars || (compact ? 4200 : 8000))
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
		return {
			name,
			input: action?.input || {},
			text: [
				`<context_response seq="${seq + 1}" request="${name}" duplicate_request="true" count="${count}">`,
				`重复的 planning_tool 请求已被拦截：${planningRequestSignature(action)}`,
				'上一轮已经提供过相同上下文；下一轮必须更换上下文请求、输出真实页面动作，或在无法继续时 done。',
				'</context_response>',
			].join('\n'),
		}
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
		return {
			name: 'invalid_action_input',
			input: action?.input || {},
			text: [
				`<context_response seq="${seq + 1}" invalid_action_input="true">`,
				`工具 ${name} 的参数无法执行：${reason}`,
				`原始 input: ${shortText(stableJson(action?.input || {}), 500)}`,
				'下一轮必须修正参数、请求更多上下文，或选择其他 available_tools 中的动作。',
				'</context_response>',
			].join('\n'),
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
		const query = normalizeSearchText(input.query || input.label || '')
		const allRows = buildSectionRows(observation, source, { region })
		const rows = query
			? allRows.filter((line) => normalizeSearchText(line).includes(query))
			: allRows
		const limit = clampInteger(input.limit, 1, 80, 40)
		const cursor = clampInteger(input.cursor, -1, Number.MAX_SAFE_INTEGER, 0)
		const cursorInRange = rows.length > 0 && cursor >= 0 && cursor < rows.length
		const slice = cursorInRange ? rows.slice(cursor, cursor + limit) : []
		const nextCursor = cursorInRange && cursor + slice.length < rows.length ? cursor + slice.length : -1
		return [
			`<context_chunk source="${source}" cursor="${cursor}" limit="${limit}" nextCursor="${nextCursor}" total="${rows.length}" region="${region || '-'}" query="${shortText(input.query || '', 40)}">`,
			...(slice.length ? slice : ['(empty)']),
			'</context_chunk>',
		].join('\n')
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
		const matchWithOptions = matches.find((match) => Array.isArray(match.item?.optionLabels) && match.item.optionLabels.length)
		const item = (matchWithOptions || matches[0])?.item || null
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
			rows.push(`<visible_popups scoped="${popups.scope}" total="${popups.total}">`)
			rows.push(...popups.rows)
			rows.push('</visible_popups>')
		}
		if (options.rows.length) {
			rows.push(`<visible_options scoped="${options.scope}" total="${options.total}">`)
			rows.push(...options.rows)
			rows.push('</visible_options>')
		}
		if (!nativeOptions.length && !popups.rows.length && !options.rows.length) {
			rows.push('当前观察没有可见下拉候选。通常需要先对该字段执行 open_dropdown 后重新观察；旧 select_dropdown_option 仅作兼容。')
		}
		rows.push('</options_for>')
		return rows.join('\n')
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
		if (item.newSinceLastObservation) score -= 3
		const region = String(item.region || '')
		if (['content', 'dialog', 'popover'].includes(region)) score -= 2
		if (region === 'pagination') score += 4
		if (region === 'header' || region === 'sidebar') score += 2
		if (item.selectionControl || item.fieldType || item.actionIntent) score -= 1
		if (item.actionIntent === 'open_filter' || item.actionIntent === 'search') score -= 1
		const rect = item.rect || {}
		return score * 1000000 + (Number(rect.top) || 0) * 1000 + (Number(rect.left) || 0)
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
		return `element index=${item.index} region=${item.region || '-'} role=${item.role || '-'} fieldType=${item.fieldType || '-'} intent=${item.actionIntent || '-'} control=${item.selectionControl || '-'} label="${shortText(item.label || item.placeholder || item.text || '', 48)}" value=${item.valueState || '-'}${options} rect=${formatRect(item.rect)}`
	}

	function formatElementDetailLine(item) {
		const hint = item.selectorHints || {}
		return [
			formatElementBriefLine(item),
			`stableId=${item.stableId || '-'} tag=${item.tag || '-'} type=${item.type || '-'} labelSource=${item.labelSource || '-'} labelConf=${item.labelConfidence || '-'} aliases="${Array.isArray(item.aliases) ? item.aliases.join('|') : ''}" expanded=${item.expandedState || '-'} required=${item.required ? 'true' : 'false'} conf=${item.confidence || '-'}`,
			`placeholder="${item.placeholder || ''}" text="${shortText(item.text || '', 80)}"`,
			`selectorHints=${JSON.stringify(hint)} domPath="${shortText(item.domPath || '', 160)}"`,
		].join('\n')
	}

	function formatFieldLine(field) {
		return [
			`field index=${field.index}`,
			field.stableId ? `sid=${field.stableId}` : '',
			field.region ? `region=${field.region}` : '',
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
			Array.isArray(field.optionLabels) && field.optionLabels.length
				? `options="${shortText(field.optionLabels.join('|'), 160)}"`
				: '',
			`expanded=${field.expandedState || '-'}`,
			`required=${field.required ? 'true' : 'false'}`,
			`conf=${field.confidence || '-'}`,
		].filter(Boolean).join(' ')
	}

	function formatActionLine(action) {
		return [
			`action index=${action.index}`,
			action.stableId ? `sid=${action.stableId}` : '',
			action.region ? `region=${action.region}` : '',
			`intent=${action.actionIntent || 'unknown'}`,
			action.controlKind ? `kind=${action.controlKind}` : '',
			`label="${shortText(action.label || action.text || '', 48)}"`,
			`role=${action.role || '-'}`,
			`value=${action.valueState || 'unknown'}`,
			`control=${action.selectionControl || '-'}`,
			action.stateHints ? `state="${shortText(action.stateHints, 96)}"` : '',
			action.relationHints ? `rel="${shortText(action.relationHints, 96)}"` : '',
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

	function formatRect(rect) {
		if (!rect || typeof rect !== 'object') return '-'
		return `${rect.left || 0},${rect.top || 0},${rect.width || 0}x${rect.height || 0}`
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
		}
		return aliases[raw] || raw || 'simplified_dom'
	}

	function extractTaskTargetLabels(taskText) {
		const text = String(taskText || '')
		const labels = []
		const targetCore = '[\\u4e00-\\u9fa5A-Za-z0-9]{2,16}?(?:管理|审批|报表|区域|模块|页面|列表|中心|设置|配置)'
		const targetContextSuffix = '(?:部分|模块|页面|区域|列表|中|里|内|下)'
		const patterns = [
			new RegExp(`(?:找到|进入|打开|前往|切换到|定位到|在)\\s*(${targetCore})(?:${targetContextSuffix})?`, 'g'),
			new RegExp(`(${targetCore})${targetContextSuffix}`, 'g'),
		]
		for (const pattern of patterns) {
			for (const match of text.matchAll(pattern)) {
				const label = String(match?.[1] || '')
					.replace(/^(找到|进入|打开|前往|切换到|定位到|在)/g, '')
					.replace(/(部分|模块|页面|区域|列表|中|里|内|下)$/g, '')
					.trim()
				if (!isGenericTaskTargetLabel(label) && !isAssignmentLikeTaskTargetLabel(label)) labels.push(label)
			}
		}
		return [...new Set(labels.map((item) => item.trim()).filter((item) => item.length >= 2))]
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

	g.NC_BG_PLANNER_CONTEXT = {
		buildDuplicatePlanningContext,
		buildInvalidActionContext,
		buildInvalidActionInputContext,
		buildInvalidModelOutputContext,
		buildObservationText,
		buildSectionRows,
		findObservedIndexMatches,
		planningRequestSignature,
		resolvePlanningContextRequest,
		shortText,
		stableJson,
	}
})(globalThis)
