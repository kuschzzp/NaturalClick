;(function (g) {
	const TASK_INTENT_VERSION = 1
	const READY_STATUSES = new Set(['ready', 'failed', 'invalid', 'skipped'])
	const DEFAULT_CREATE_ENTRY_LABELS = ['新增', '新建', '创建', '添加', '新 增']
	const DEFAULT_DETAIL_ENTRY_LABELS = ['详情', '查看', '明细', '预览']

	function buildTaskIntentSystemPrompt() {
		return [
			'你是网页自动化任务理解器。请把用户自然语言任务拆成结构化 JSON，只输出 JSON。',
			'核心原则：',
			'1. 导航目标是业务模块、菜单或列表；页面内动作不属于导航目标。',
			'2. “新增/新建/创建/添加/编辑/详情/查看/删除/导出/搜索/筛选/保存/提交”等是页面内动作，不要放进 canonical。',
			'3. 用户说法可能不等于真实菜单。若用户说“X管理”，真实菜单可能叫“X”；若用户说“X”，真实菜单也可能叫“X管理”。',
			'4. navigationTargets[].raw 保留用户原文里的模块说法。',
			'5. navigationTargets[].canonical 写推断出的业务目标，不要求等于真实菜单文本。',
			'6. navigationTargets[].aliases 写可能出现在菜单里的等价名称、简称、子菜单名或列表名。',
			'7. 如果用户说“X管理”，aliases 必须包含“X”和“X管理”。',
			'8. 如果用户说“X新增页面/新建X/新增一条X数据”，navigationTargets 应是 X，operation 应是 create，不要把“新增”放进导航目标。',
			'9. 如果用户说“查看第一条X详情”，navigationTargets 应是 X 或 X管理，operation 应是 view_first_record_detail。',
			'10. forbiddenNavigationTargets 写出容易误判但不应该作为导航目标的词，例如“X新增”“X详情”“第一条X详情”。',
			'11. 只有用户明确给出 URL，或明确说打开百度/Google/Bing/DuckDuckGo 等公共站点时，才可以填写 url；私有业务系统地址禁止猜测。',
			'12. 公共搜索任务可以把 url 写成对应搜索页，例如“打开百度搜索黄金价格”可写百度搜索 URL；但“打开销售订单新增页面”不能猜业务系统 URL。',
			'13. 不要猜用户没给出的字段值。字段值只放入 formData。',
			'14. 不确定时保守输出 unknown 或空数组，不要编造页面不存在的菜单。',
			'输出 JSON Schema:',
			'{',
			'  "url": "string|null",',
			'  "auth": { "username": "string|null", "password": "string|null" },',
			'  "navigationTargets": [',
			'    { "raw": "string", "canonical": "string", "aliases": ["string"], "entity": "string|null", "moduleType": "management|order|approval|settings|report|unknown" }',
			'  ],',
			'  "operation": "create|edit|view_detail|view_first_record_detail|search|fill_form|unknown",',
			'  "recordSelector": { "position": "first|last|index|null", "index": "number|null", "entity": "string|null" },',
			'  "formData": { "字段名": "字段值" },',
			'  "createEntryLabels": ["string"],',
			'  "detailEntryLabels": ["string"],',
			'  "forbiddenNavigationTargets": ["string"],',
			'  "notes": "string"',
			'}',
		].join('\n')
	}

	function buildTaskIntentUserMessage(session) {
		return [
			'<task>',
			String(session?.latestTask || session?.task || '').trim(),
			'</task>',
			'只输出一个 JSON 对象，不要 markdown。',
		].join('\n')
	}

	function shouldRequestTaskIntent(session) {
		const taskText = getTaskText(session)
		if (!taskText || !looksLikeStructuredBusinessTask(taskText)) return false
		const state = getTaskIntentState(session)
		if (!state) return true
		if (state.version !== TASK_INTENT_VERSION) return true
		if (String(state.taskText || '') !== taskText) return true
		return !READY_STATUSES.has(String(state.status || ''))
	}

	function deriveHeuristicTaskIntent(taskText) {
		const text = String(taskText || '').trim()
		if (!text || !looksLikeStructuredBusinessTask(text)) return null
		const operation = normalizeOperation('', text)
		const targets = []
		const forbidden = []
		for (const match of extractHeuristicTargetMatches(text, operation)) {
			const canonical = cleanNavigationName(match.canonical)
			if (isHeuristicNoiseTarget(canonical)) continue
			if (!canonical) continue
			const raw = cleanShortString(match.raw || match.canonical, 80) || canonical
			targets.push({
				raw,
				canonical,
				aliases: normalizeNavigationAliases([raw, canonical, `${canonical}管理`]),
				entity: canonical,
				moduleType: inferModuleTypeFromName(canonical),
			})
			for (const value of buildForbiddenNavigationNames(raw, canonical, operation)) {
				addUnique(forbidden, value)
			}
		}
		if (!targets.length && operation === 'unknown') return null
		const intent = normalizeTaskIntent({
			url: extractTaskUrl(text),
			auth: {},
			navigationTargets: targets,
			operation,
			recordSelector: {},
			formData: {},
			createEntryLabels: operation === 'create' ? DEFAULT_CREATE_ENTRY_LABELS : [],
			detailEntryLabels: /detail|view_detail|view_first_record_detail/.test(operation) ? DEFAULT_DETAIL_ENTRY_LABELS : [],
			forbiddenNavigationTargets: forbidden,
			notes: targets.length
				? '本地启发式已将动作词从导航目标中拆出。'
				: '本地启发式仅识别到页面内动作，未识别到明确导航目标。',
		}, text)
		if (!intent.navigationTargets.length && intent.operation === 'unknown') return null
		return intent
	}

	function storeTaskIntent(session, intent, meta = {}) {
		const state = ensureTaskIntentState(session)
		state.status = 'ready'
		state.version = TASK_INTENT_VERSION
		state.taskText = getTaskText(session)
		state.intent = normalizeTaskIntent(intent, state.taskText)
		state.updatedAt = Date.now()
		state.model = String(meta.model || '')
		return state.intent
	}

	function markTaskIntentUnavailable(session, status, reason) {
		const state = ensureTaskIntentState(session)
		state.status = READY_STATUSES.has(String(status || '')) ? String(status || '') : 'failed'
		state.version = TASK_INTENT_VERSION
		state.taskText = getTaskText(session)
		state.reason = String(reason || '').trim()
		state.updatedAt = Date.now()
		return state
	}

	function getTaskIntent(session) {
		const state = getTaskIntentState(session)
		if (!state || state.version !== TASK_INTENT_VERSION) return null
		if (String(state.status || '') !== 'ready') return null
		const intent = state.intent && typeof state.intent === 'object' ? state.intent : null
		return intent || null
	}

	function getNavigationTargetKeys(session) {
		const intent = getTaskIntent(session)
		if (!intent) return []
		const forbidden = new Set(getForbiddenNavigationTargetKeys(session))
		const keys = []
		for (const target of (Array.isArray(intent.navigationTargets) ? intent.navigationTargets : [])) {
			const values = [
				target?.canonical,
				target?.raw,
				target?.entity,
				...(Array.isArray(target?.aliases) ? target.aliases : []),
			]
			for (const value of values) {
				const cleaned = cleanNavigationName(value)
				const key = getIntentKey(cleaned)
				if (!key || forbidden.has(key)) continue
				addUnique(keys, key)
				const stem = stripNavigationContextSuffix(cleaned)
				const stemKey = getIntentKey(stem)
				if (stemKey && !forbidden.has(stemKey)) addUnique(keys, stemKey)
			}
		}
		return keys
	}

	function getForbiddenNavigationTargetKeys(session) {
		const intent = getTaskIntent(session)
		if (!intent) return []
		const values = Array.isArray(intent.forbiddenNavigationTargets)
			? intent.forbiddenNavigationTargets
			: []
		return values
			.map(cleanForbiddenNavigationName)
			.map(getIntentKey)
			.filter(Boolean)
	}

	function getOperation(session) {
		return getTaskIntent(session)?.operation || ''
	}

	function getCreateEntryLabels(session) {
		return normalizeLabelList(getTaskIntent(session)?.createEntryLabels, DEFAULT_CREATE_ENTRY_LABELS)
	}

	function getDetailEntryLabels(session) {
		return normalizeLabelList(getTaskIntent(session)?.detailEntryLabels, DEFAULT_DETAIL_ENTRY_LABELS)
	}

	function buildTaskIntentHintLines(session) {
		const intent = getTaskIntent(session)
		if (!intent) return []
		const nav = getNavigationTargetKeys(session).join('|')
		const forbidden = getForbiddenNavigationTargetKeys(session).join('|')
		const lines = [
			`- task_intent status="ready" operation="${escapeAttr(intent.operation || 'unknown')}" navigation="${escapeAttr(nav)}"`,
		]
		if (forbidden) lines.push(`- task_intent_forbidden_navigation "${escapeAttr(forbidden)}"`)
		return lines
	}

	function normalizeTaskIntent(value, taskText = '') {
		const raw = value && typeof value === 'object' ? value : {}
		const operation = normalizeOperation(raw.operation, taskText)
		const navigationTargets = normalizeNavigationTargets(raw.navigationTargets)
		const intent = {
			url: cleanNullableString(raw.url),
			auth: normalizeAuth(raw.auth),
			navigationTargets,
			operation,
			recordSelector: normalizeRecordSelector(raw.recordSelector, taskText),
			formData: normalizeFormData(raw.formData),
			createEntryLabels: normalizeLabelList(raw.createEntryLabels, DEFAULT_CREATE_ENTRY_LABELS),
			detailEntryLabels: normalizeLabelList(raw.detailEntryLabels, DEFAULT_DETAIL_ENTRY_LABELS),
			forbiddenNavigationTargets: normalizeForbiddenNavigationTargets(raw.forbiddenNavigationTargets),
			notes: cleanShortString(raw.notes, 200),
		}
		return intent
	}

	function normalizeNavigationTargets(value) {
		const list = Array.isArray(value) ? value : []
		const targets = []
		for (const item of list) {
			const raw = typeof item === 'string' ? item : item?.raw
			const canonical = cleanNavigationName(typeof item === 'string' ? item : (item?.canonical || item?.raw || item?.entity))
			const entity = cleanNavigationName(typeof item === 'string' ? '' : item?.entity)
			const aliasValues = [
				raw,
				canonical,
				entity,
				...(Array.isArray(item?.aliases) ? item.aliases : []),
			]
			const aliases = normalizeNavigationAliases(aliasValues)
			const target = {
				raw: cleanShortString(raw, 80),
				canonical: canonical || aliases[0] || '',
				aliases,
				entity: entity || null,
				moduleType: normalizeModuleType(typeof item === 'string' ? '' : item?.moduleType),
			}
			if (!target.canonical && !target.aliases.length) continue
			if (!target.aliases.includes(target.canonical)) target.aliases.unshift(target.canonical)
			target.aliases = uniqueStrings(target.aliases).slice(0, 12)
			targets.push(target)
		}
		return targets.slice(0, 5)
	}

	function normalizeNavigationAliases(values) {
		const aliases = []
		for (const value of values) {
			const cleaned = cleanNavigationName(value)
			if (!cleaned) continue
			addUnique(aliases, cleaned)
			const stem = stripNavigationContextSuffix(cleaned)
			if (stem && stem !== cleaned) addUnique(aliases, stem)
			if (/管理$/.test(cleaned) && cleaned.length > 2) addUnique(aliases, cleaned.replace(/管理$/g, ''))
			else if (cleaned.length >= 2) addUnique(aliases, `${cleaned}管理`)
		}
		return aliases.filter((alias) => !isGenericNavigationName(alias)).slice(0, 12)
	}

	function normalizeForbiddenNavigationTargets(value) {
		return uniqueStrings((Array.isArray(value) ? value : [])
			.map(cleanForbiddenNavigationName)
			.filter(Boolean))
			.slice(0, 12)
	}

	function normalizeOperation(value, taskText = '') {
		const raw = getIntentKey(value)
		if (/^(create|add|new|新增|新建|创建|添加|增加)$/.test(raw)) return 'create'
		if (/^(edit|modify|update|编辑|修改)$/.test(raw)) return 'edit'
		if (/^(viewfirstrecorddetail|view_first_record_detail|firstdetail|查看第一条详情|第一条详情)$/.test(raw)) return 'view_first_record_detail'
		if (/^(viewdetail|view_detail|detail|details|查看详情|详情|明细|查看|预览)$/.test(raw)) return 'view_detail'
		if (/^(search|query|filter|搜索|查询|筛选|过滤)$/.test(raw)) return 'search'
		if (/^(fillform|fill_form|填写|填表)$/.test(raw)) return 'fill_form'
		const text = String(taskText || '')
		if (/(第一条|第一行|首条|首行|第\s*1\s*[条行]).{0,20}(详情|明细|查看|预览)/i.test(text)) return 'view_first_record_detail'
		if (/(新增|新建|创建|添加|增加)/.test(text)) return 'create'
		if (/(编辑|修改)/.test(text)) return 'edit'
		if (/(详情|明细|查看|预览)/.test(text)) return 'view_detail'
		if (/(搜索|查询|筛选|过滤)/.test(text)) return 'search'
		return 'unknown'
	}

	function normalizeRecordSelector(value, taskText = '') {
		const selector = value && typeof value === 'object' ? value : {}
		let position = getIntentKey(selector.position || '')
		if (/^(first|首条|首行|第一条|第一行|1)$/.test(position)) position = 'first'
		else if (/^(last|末条|最后一条|最后一行)$/.test(position)) position = 'last'
		else if (/^(index|指定|序号)$/.test(position)) position = 'index'
		else position = null
		if (!position && /(第一条|第一行|首条|首行|第\s*1\s*[条行])/.test(String(taskText || ''))) position = 'first'
		const index = Number(selector.index)
		return {
			position,
			index: Number.isFinite(index) && index > 0 ? Math.floor(index) : null,
			entity: cleanNavigationName(selector.entity) || null,
		}
	}

	function normalizeAuth(value) {
		const auth = value && typeof value === 'object' ? value : {}
		return {
			username: cleanNullableString(auth.username || auth.account || auth.user),
			password: cleanNullableString(auth.password || auth.pass),
		}
	}

	function normalizeFormData(value) {
		const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
		const data = {}
		for (const [key, rawValue] of Object.entries(source)) {
			const cleanKey = cleanShortString(key, 60)
			const cleanValue = cleanShortString(rawValue, 200)
			if (!cleanKey || !cleanValue) continue
			data[cleanKey] = cleanValue
		}
		return data
	}

	function normalizeLabelList(value, fallback) {
		const labels = uniqueStrings((Array.isArray(value) ? value : [])
			.map((item) => cleanShortString(item, 30))
			.filter(Boolean))
		for (const item of fallback) addUnique(labels, item)
		return labels.slice(0, 12)
	}

	function cleanNavigationName(value) {
		let text = cleanShortString(value, 80)
		if (!text) return ''
		text = text.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi, ' ')
			.replace(/[“”‘’"'`<>《》【】[\]()（）{}]/g, ' ')
			.replace(/\s+/g, '')
			.trim()
		text = stripLeadingNoise(text)
		for (let i = 0; i < 4; i++) {
			const next = stripNavigationContextSuffix(stripActionAffixes(text))
			if (next === text) break
			text = next
		}
		text = text.replace(/(数据|资料|信息)$/g, '')
		if (!text || text.length < 2 || text.length > 24) return ''
		if (isGenericNavigationName(text)) return ''
		return text
	}

	function cleanForbiddenNavigationName(value) {
		let text = cleanShortString(value, 80)
		if (!text) return ''
		text = text.replace(/[“”‘’"'`<>《》【】[\]()（）{}]/g, ' ')
			.replace(/\s+/g, '')
			.trim()
		text = stripLeadingNoise(text)
		text = stripNavigationContextSuffix(text)
		if (!text || text.length < 2 || text.length > 32) return ''
		if (isGenericNavigationName(text)) return ''
		return text
	}

	function stripLeadingNoise(value) {
		return String(value || '')
			.replace(/^(?:然后|接着|再|并且|同时|随后|帮我|请|麻烦|你|我|先|去|到|把|将|给我)+/g, '')
			.replace(/^(?:找到|进入|打开|前往|切换到|定位到|在)\s*/g, '')
			.trim()
	}

	function stripActionAffixes(value) {
		return String(value || '')
			.replace(/^(?:新增|新建|创建|添加|增加|编辑|修改|查看|预览)\s*/g, '')
			.replace(/(?:新增|新建|创建|添加|增加|编辑|修改|详情|明细|查看|预览|搜索|查询|筛选|过滤)$/g, '')
			.trim()
	}

	function stripNavigationContextSuffix(value) {
		return String(value || '')
			.replace(/(?:部分|模块|页面|页|区域|列表|中|里|内|下)$/g, '')
			.trim()
	}

	function looksLikeStructuredBusinessTask(taskText) {
		const text = String(taskText || '')
			.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi, ' ')
		return /(新增|新建|创建|添加|增加|编辑|修改|详情|明细|查看|预览|第一条|第一行|首条|首行|第\s*1\s*[条行])/.test(text)
	}

	function extractHeuristicTargetMatches(taskText, operation) {
		const text = String(taskText || '')
			.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi, ' ')
		const matches = []
		if (operation === 'create') {
			collectTargetMatches(matches, text, /(?:打开|进入|前往|切换到|定位到|找到|在)?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,24}?)(新增|新建|创建|添加|增加)(?:页面|页|列表|模块)?/g)
			collectTargetMatches(matches, text, /(?:新增|新建|创建|添加|增加)\s*(?:一条|一个|1条|1个)?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,24}?)(?:数据|信息|资料|记录)?/g)
		} else if (operation === 'view_first_record_detail' || operation === 'view_detail') {
			collectTargetMatches(matches, text, /(?:打开|进入|前往|切换到|定位到|找到|在)?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,24}?)(?:管理|页面|列表|模块)?[^，。；;]{0,24}(?:详情|明细|查看|预览)/g)
		} else {
			collectTargetMatches(matches, text, /(?:打开|进入|前往|切换到|定位到|找到|在)\s*([\u4e00-\u9fa5A-Za-z0-9]{2,24}?)(?:页面|页|列表|模块|管理)?/g)
		}
		return matches.filter((match, index, list) =>
			list.findIndex((item) => cleanNavigationName(item.canonical) === cleanNavigationName(match.canonical)) === index
		).slice(0, 5)
	}

	function collectTargetMatches(out, text, pattern) {
		for (const match of String(text || '').matchAll(pattern)) {
			const raw = String(match?.[0] || '').trim()
			const canonical = String(match?.[1] || '').trim()
			if (!canonical) continue
			out.push({ raw, canonical })
		}
	}

	function buildForbiddenNavigationNames(raw, canonical, operation) {
		const names = []
		const base = cleanNavigationName(canonical)
		if (!base) return names
		const rawForbidden = cleanForbiddenNavigationName(raw)
		if (rawForbidden && rawForbidden !== base) addUnique(names, rawForbidden)
		if (operation === 'create') {
			for (const suffix of ['新增', '新建', '创建', '添加', '增加']) {
				addUnique(names, `${base}${suffix}`)
				addUnique(names, `${base}${suffix}页面`)
			}
			addUnique(names, '新增页面')
			addUnique(names, '新建页面')
		}
		if (operation === 'view_detail' || operation === 'view_first_record_detail') {
			for (const suffix of ['详情', '明细', '查看', '预览']) {
				addUnique(names, `${base}${suffix}`)
				addUnique(names, `${base}${suffix}页面`)
			}
		}
		return names
	}

	function isHeuristicNoiseTarget(value) {
		const text = String(value || '').trim()
		if (!text) return true
		if (/^(按|按照|根据|依照|基于|以).+/.test(text)) return true
		return /^(业务规则|要求|需求|规则|数据|信息|资料|记录|一条记录|一个记录|1条记录|1个记录)$/.test(text)
	}

	function inferModuleTypeFromName(value) {
		const key = getIntentKey(value)
		if (/订单|order/.test(key)) return 'order'
		if (/审批|approval/.test(key)) return 'approval'
		if (/设置|配置|settings?/.test(key)) return 'settings'
		if (/报表|统计|分析|report/.test(key)) return 'report'
		if (/管理|manage|management/.test(key)) return 'management'
		return 'unknown'
	}

	function extractTaskUrl(value) {
		const match = String(value || '').match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i)
		return match?.[0] || null
	}

	function isGenericNavigationName(value) {
		const text = String(value || '').trim()
		return /^(这个|那个|当前|目标|该|本|此|页面|网页|地址|链接|模块|列表|新增|新建|创建|添加|详情|查看|明细|预览)$/.test(text)
	}

	function normalizeModuleType(value) {
		const raw = getIntentKey(value)
		if (/^(management|order|approval|settings|report|unknown)$/.test(raw)) return raw
		return 'unknown'
	}

	function cleanNullableString(value) {
		const text = cleanShortString(value, 200)
		return text || null
	}

	function cleanShortString(value, maxLen) {
		const text = String(value ?? '').replace(/\s+/g, ' ').trim()
		if (!text || /^(null|undefined|unknown|-|\(empty\))$/i.test(text)) return ''
		const limit = Math.max(20, Number(maxLen) || 120)
		return text.length > limit ? text.slice(0, limit) : text
	}

	function getTaskIntentState(session) {
		return session?.workflowState?.taskIntent || null
	}

	function ensureTaskIntentState(session) {
		if (!session.workflowState || typeof session.workflowState !== 'object') session.workflowState = {}
		if (!session.workflowState.taskIntent || typeof session.workflowState.taskIntent !== 'object') {
			session.workflowState.taskIntent = {}
		}
		return session.workflowState.taskIntent
	}

	function getTaskText(session) {
		return String(session?.latestTask || session?.task || '').trim()
	}

	function getIntentKey(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
	}

	function uniqueStrings(values) {
		return [...new Set((Array.isArray(values) ? values : [])
			.map((item) => String(item || '').trim())
			.filter(Boolean))]
	}

	function addUnique(list, value) {
		if (!Array.isArray(list) || !value || list.includes(value)) return
		list.push(value)
	}

	function escapeAttr(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
	}

	g.NC_BG_TASK_INTENT = {
		TASK_INTENT_VERSION,
		buildTaskIntentSystemPrompt,
		buildTaskIntentUserMessage,
		buildTaskIntentHintLines,
		cleanForbiddenNavigationName,
		cleanNavigationName,
		deriveHeuristicTaskIntent,
		getCreateEntryLabels,
		getDetailEntryLabels,
		getForbiddenNavigationTargetKeys,
		getNavigationTargetKeys,
		getOperation,
		getTaskIntent,
		markTaskIntentUnavailable,
		normalizeTaskIntent,
		shouldRequestTaskIntent,
		storeTaskIntent,
	}
})(globalThis)
