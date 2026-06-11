;(function (g) {
	const TASK_INTENT_VERSION = 15
	const READY_STATUSES = new Set(['ready', 'failed', 'invalid', 'skipped'])
	const DEFAULT_CREATE_ENTRY_LABELS = ['新增', '新建', '创建', '添加', '新 增']
	const DEFAULT_DETAIL_ENTRY_LABELS = ['详情', '查看', '明细', '预览']

	function buildTaskIntentSystemPrompt() {
		return [
			'你是网页自动化任务理解器。请把用户自然语言任务拆成结构化 JSON，只输出 JSON。',
			'核心原则：',
			'1. 导航目标是页面模块、菜单或列表；页面内动作不属于导航目标。',
			'2. “新增/新建/创建/添加/编辑/详情/查看/删除/导出/搜索/筛选/保存/提交”等是页面内动作，不要放进 canonical。',
			'3. 用户说法可能不等于真实菜单。若用户说“X页面/区域/section”，真实菜单可能只叫“X”。',
			'4. navigationTargets[].raw 保留用户原文里的模块说法。',
			'5. navigationTargets[].canonical 写推断出的目标模块，不要求等于真实菜单文本。',
			'6. navigationTargets[].aliases 写可能出现在菜单里的等价名称、简称、子菜单名或列表名。',
			'7. 如果用户说“X页面/区域/section”，aliases 应包含“X”和用户原始说法。',
			'8. 如果用户说“X新增页面/新建X/新增一条X数据”，只有出现“进入/找到/打开 X 页面/模块/菜单/区域”这类导航语境时，navigationTargets 才是 X；否则 X 只是要创建的对象，不要编造成导航目标。',
			'9. 如果用户只说“创建一个 X/新增一条 X/编辑一个 X”，没有明确页面/模块/菜单/区域，navigationTargets 必须为空，operation 写 create/edit。',
			'10. 如果用户说“查看第一条X详情”，navigationTargets 应是用户明确提到的页面/模块 X，operation 应是 view_first_record_detail。',
			'11. 如果只有“记录/数据/信息/资料/列表第一条记录”等泛称对象，没有“进入/找到 X 页面/模块/菜单/区域”这类导航语境，navigationTargets 必须为空；这些词只可放入 recordSelector.entity。',
			'12. forbiddenNavigationTargets 写出容易误判但不应该作为导航目标的词，例如“X新增”“X详情”“第一条X详情”。',
			'13. 只有用户明确给出 URL，或明确说打开百度/Google/Bing/DuckDuckGo 等公共站点时，才可以填写 url；未明确给出的应用或后台地址禁止猜测。',
			'14. 公共搜索任务可以把 url 写成对应搜索页，例如“打开百度搜索黄金价格”可写百度搜索 URL；但“打开 X 新增页面”不能猜应用 URL。',
			'15. 不要猜用户没给出的字段值。字段值只放入 formData。',
			'16. auth 中的登录账号/密码只用于登录，不要重复放入 formData；formData 只放后续页面表单中明确要求填写的字段。',
			'17. “测试 X 的每一个搜索功能/搜索项/筛选条件”属于 search 操作，导航目标是 X；如果没有 X，不要把“每一个/所有/全部/搜索功能/搜索项/筛选条件”当导航目标。',
			'18. 英文 “go/open/navigate to X and test/check every filter/search field” 这类并列句中，X 是导航目标，test/check every filter/search field 是页面内 search 操作。',
			'19. operationScope 表示页面内动作覆盖范围；“每一个/每个/所有/全部/all/every/each 搜索项/筛选条件/字段”写 all_matching_controls。',
			'20. 任务可能按 1./2./3. 分步书写，步骤编号和“帮我/请/麻烦”等礼貌词不是导航目标。',
			'21. “查询/查看刚才创建/上次新增/前面保存的记录”是引用当前对话历史的查询或查看任务，不是新的 create 任务；具体对象应交给 conversation memory 和当前页面证据确认。',
			'22. 不确定时保守输出 unknown 或空数组，不要编造页面不存在的菜单。',
			'输出 JSON Schema:',
			'{',
			'  "url": "string|null",',
			'  "auth": { "username": "string|null", "password": "string|null" },',
			'  "navigationTargets": [',
			'    { "raw": "string", "canonical": "string", "aliases": ["string"], "entity": "string|null" }',
			'  ],',
			'  "operation": "create|edit|view_detail|view_first_record_detail|search|fill_form|unknown",',
			'  "operationScope": "all_matching_controls|single_target|explicit_items|unspecified",',
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
		if (!taskText || !looksLikeStructuredPageTask(taskText)) return false
		const state = getTaskIntentState(session)
		if (!state) return true
		if (state.version !== TASK_INTENT_VERSION) return true
		if (String(state.taskText || '') !== taskText) return true
		return !READY_STATUSES.has(String(state.status || ''))
	}

	function deriveHeuristicTaskIntent(taskText) {
		const text = String(taskText || '').trim()
		if (!text || !looksLikeStructuredPageTask(text)) return null
		const operation = normalizeOperation('', text)
		const targets = []
		const forbidden = []
		for (const match of extractHeuristicTargetMatches(text, operation)) {
			const candidateText = normalizeHeuristicTargetCandidate(match.canonical)
			const canonical = cleanNavigationName(candidateText)
			if (isHeuristicNoiseTarget(canonical, match)) continue
			if (!canonical) continue
			const raw = operation === 'search'
				? (cleanNavigationName(normalizeHeuristicTargetCandidate(match.raw || match.canonical)) || canonical)
				: (cleanShortString(match.raw || match.canonical, 80) || canonical)
			targets.push({
				raw,
				canonical,
				aliases: normalizeNavigationAliases([raw, canonical]),
				entity: canonical,
			})
			for (const value of buildForbiddenNavigationNames(raw, canonical, operation)) {
				addUnique(forbidden, value)
			}
		}
		if (!targets.length && operation === 'unknown') return null
		const intent = normalizeTaskIntent({
			url: extractTaskUrl(text),
			auth: extractTaskAuth(text),
			navigationTargets: targets,
			operation,
			operationScope: inferOperationScope(operation, text),
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
			`- task_intent status="ready" operation="${escapeAttr(intent.operation || 'unknown')}" scope="${escapeAttr(intent.operationScope || 'unspecified')}" navigation="${escapeAttr(nav)}"`,
		]
		if (forbidden) lines.push(`- task_intent_forbidden_navigation "${escapeAttr(forbidden)}"`)
		return lines
	}

	function normalizeTaskIntent(value, taskText = '') {
		const raw = value && typeof value === 'object' ? value : {}
		const operation = normalizeOperation(raw.operation, taskText)
		const operationScope = normalizeOperationScope(raw.operationScope || raw.scope || raw.coverage, operation, taskText)
		const navigationTargets = normalizeNavigationTargets(raw.navigationTargets, operation, taskText)
		const auth = normalizeAuth(raw.auth, taskText)
		const intent = {
			url: cleanNullableString(raw.url),
			auth,
			navigationTargets,
			operation,
			operationScope,
			recordSelector: normalizeRecordSelector(raw.recordSelector, taskText),
			formData: normalizeFormData(raw.formData, taskText, auth),
			createEntryLabels: normalizeLabelList(raw.createEntryLabels, DEFAULT_CREATE_ENTRY_LABELS),
			detailEntryLabels: normalizeLabelList(raw.detailEntryLabels, DEFAULT_DETAIL_ENTRY_LABELS),
			forbiddenNavigationTargets: normalizeForbiddenNavigationTargets(raw.forbiddenNavigationTargets),
			notes: cleanShortString(raw.notes, 200),
		}
		return intent
	}

	function normalizeNavigationTargets(value, operation = '', taskText = '') {
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
			}
			if (!target.canonical && !target.aliases.length) continue
			if (!target.aliases.includes(target.canonical)) target.aliases.unshift(target.canonical)
			target.aliases = uniqueStrings(target.aliases).slice(0, 12)
			if (shouldDropPreviousActionReferenceNavigationTarget(target, operation, taskText)) continue
			if (shouldDropReferentialRecordNavigationTarget(target, operation, taskText)) continue
			if (shouldDropGenericRecordNavigationTarget(target, operation, taskText)) continue
			if (shouldDropImplicitOperationObjectNavigationTarget(target, operation, taskText)) continue
			targets.push(target)
		}
		return targets.slice(0, 5)
	}

	function shouldDropPreviousActionReferenceNavigationTarget(target, operation, taskText = '') {
		const op = String(operation || '').trim()
		if (op !== 'search' && op !== 'view_detail' && op !== 'view_first_record_detail') return false
		if (!hasPreviousActionReference(taskText)) return false
		const rawValues = [
			target?.canonical,
			target?.raw,
			target?.entity,
			...(Array.isArray(target?.aliases) ? target.aliases : []),
		].map((item) => String(item || '').replace(/\s+/g, '').trim()).filter(Boolean)
		if (!rawValues.length) return false
		return rawValues.some((value) =>
			/(?:刚才|刚刚|上次|上一(?:个|步|轮|次)|之前|前面|先前)/.test(value) ||
			/(?:创建|新增|新建|添加|保存|提交|填写|录入)/.test(value)
		)
	}

	function shouldDropReferentialRecordNavigationTarget(target, operation, taskText = '') {
		const op = String(operation || '').trim()
		if (op !== 'view_detail' && op !== 'view_first_record_detail') return false
		const values = [
			target?.canonical,
			target?.raw,
			target?.entity,
			...(Array.isArray(target?.aliases) ? target.aliases : []),
		].map(cleanNavigationName).filter(Boolean)
		if (!values.length) return false
		if (values.some((value) => taskTextHasExplicitNavigationForTarget(taskText, value))) return false
		return values.some(isReferentialRecordObjectName)
	}

	function shouldDropImplicitOperationObjectNavigationTarget(target, operation, taskText = '') {
		const op = String(operation || '').trim()
		if (op !== 'create' && op !== 'edit') return false
		const values = [
			target?.canonical,
			target?.raw,
			target?.entity,
			...(Array.isArray(target?.aliases) ? target.aliases : []),
		].map(cleanNavigationName).filter(Boolean)
		if (!values.length) return false
		return !values.some((value) => taskTextHasExplicitNavigationForTarget(taskText, value))
	}

	function shouldDropGenericRecordNavigationTarget(target, operation, taskText = '') {
		const op = String(operation || '').trim()
		if (op !== 'view_detail' && op !== 'view_first_record_detail') return false
		const values = [
			target?.canonical,
			target?.raw,
			target?.entity,
			...(Array.isArray(target?.aliases) ? target.aliases : []),
		].map(cleanNavigationName).filter(Boolean)
		if (!values.length) return false
		if (values.some((value) => !isGenericRecordObjectName(value))) return false
		return !values.some((value) => taskTextHasExplicitNavigationForTarget(taskText, value))
	}

	function isGenericRecordObjectName(value) {
		const text = cleanNavigationName(value)
		if (!text) return false
		return /^(数据|信息|资料|记录|列表记录|列表第一条记录|第一条记录|条目|项目|对象|内容)$/.test(text)
	}

	function isReferentialRecordObjectName(value) {
		const text = cleanNavigationName(value)
		if (!text) return false
		if (/(页面|网页|模块|区域|面板|菜单|标签页|page|screen|view|section|area|panel|menu|module|tab)$/i.test(text)) return false
		return /^(?:这个|那个|该|本|此|当前|目标)[\u4e00-\u9fa5A-Za-z0-9_-]{1,24}的?$/.test(text)
	}

	function taskTextHasExplicitNavigationForTarget(taskText, target) {
		const text = String(taskText || '').replace(/\s+/g, '')
		const key = cleanNavigationName(target)
		if (!text || !key) return false
		const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		const context = '(?:部分|模块|页面|网页|页|区域|面板|菜单|标签页|列表|page|screen|view|section|area|panel|menu|module|tab)'
		const navVerb = '(?:找到|找出|进入|打开|前往|切换到|定位到|访问|在|open|goto|goto|navigateto|visit|switchto|find|enter)'
		const directNavVerb = '(?:找到|找出|进入|打开|前往|切换到|定位到|访问|到|open|goto|navigateto|visit|switchto|find|enter)'
		const directBoundary = '(?:$|[，。；;、,.!?]|现在|当前|马上|立即|帮我|请|麻烦|然后|接着|再|并且|同时|随后|按|按照|根据|依照|基于|创建|新增|新建|添加|增加|编辑|修改|更新|查看|测试|验证|检查|搜索|查询|筛选|填写|填入|填表|录入|and|then|by|basedon|create|add|new|edit|update|view|test|search|query|filter|fill)'
		const actionQualifier = '(?:新增|新建|创建|添加|增加|编辑|修改|更新|详情|明细|查看|预览|create|new|add|edit|update|detail|details|view)?'
		if (new RegExp(`${navVerb}${escaped}${actionQualifier}${context}`, 'i').test(text)) return true
		if (new RegExp(`${escaped}${actionQualifier}${context}(?:中|里|内|下)?`, 'i').test(text)) return true
		if (new RegExp(`${directNavVerb}${escaped}${directBoundary}`, 'i').test(text)) return true
		return false
	}

	function normalizeNavigationAliases(values) {
		const aliases = []
		for (const value of values) {
			const cleaned = cleanNavigationName(value)
			if (!cleaned) continue
			addUnique(aliases, cleaned)
			const stem = stripNavigationContextSuffix(cleaned)
			if (stem && stem !== cleaned) addUnique(aliases, stem)
		}
		return aliases.filter((alias) => !isGenericNavigationName(alias)).slice(0, 12)
	}

	function normalizeForbiddenNavigationTargets(value) {
		return uniqueStrings((Array.isArray(value) ? value : [])
			.map(cleanForbiddenNavigationName)
			.filter(Boolean))
			.slice(0, 12)
	}

	function normalizeOperationScope(value, operation = '', taskText = '') {
		const raw = getIntentKey(value)
		if (/^(all|every|each|allmatching|allmatchingcontrols|allmatchingfields|allfields|allcontrols|每一个|每个|所有|全部|各个|全部字段|全部条件|全部搜索项|全部筛选项)$/.test(raw)) {
			return 'all_matching_controls'
		}
		if (/^(single|one|current|singletarget|onetarget|currenttarget|singlefield|onefield|当前|单个|一个|某个|指定)$/.test(raw)) {
			return 'single_target'
		}
		if (/^(explicit|explicititems|explicitvalues|explicitfields|taskvalues|specified|指定项|明确字段|明确值|任务字段)$/.test(raw)) {
			return 'explicit_items'
		}
		return inferOperationScope(operation, taskText)
	}

	function inferOperationScope(operation, taskText = '') {
		const op = String(operation || '').trim()
		if (op === 'search' && taskRequestsAllMatchingSearchControls(taskText)) return 'all_matching_controls'
		return 'unspecified'
	}

	function taskRequestsAllMatchingSearchControls(taskText) {
		const text = String(taskText || '')
		if (!text.trim()) return false
		const searchNoun = '(?:搜索|查询|筛选|过滤|search|query|filter)'
		const searchObject = '(?:功能|条件|项|字段|控件|输入框|field|fields|control|controls|condition|conditions|input|inputs)?'
		return new RegExp(`(?:每一个|每个|全部|所有|各个|all|every|each).{0,18}${searchNoun}${searchObject}`, 'i').test(text) ||
			new RegExp(`${searchNoun}${searchObject}.{0,18}(?:每一个|每个|全部|所有|各个|all|every|each)`, 'i').test(text) ||
			new RegExp(`${searchNoun}(?:区域|区|面板|area|panel|section).{0,24}(?:${searchNoun})?(?:字段|项|条件|控件|输入框|field|fields|control|controls|condition|conditions|input|inputs).{0,16}(?:功能|正常|可用|实现|work|works|available|implemented)`, 'i').test(text)
	}

	function normalizeOperation(value, taskText = '') {
		const raw = getIntentKey(value)
		const text = String(taskText || '')
		if (isReferentialPreviousActionSearchText(text)) return 'search'
		if (isReferentialPreviousActionViewText(text)) return 'view_detail'
		if (/^(create|add|new|新增|新建|创建|添加|增加)$/.test(raw)) return 'create'
		if (/^(edit|modify|update|编辑|修改|更新)$/.test(raw)) return 'edit'
		if (/^(viewfirstrecorddetail|view_first_record_detail|firstdetail|查看第一条详情|第一条详情)$/.test(raw)) return 'view_first_record_detail'
		if (/^(viewdetail|view_detail|detail|details|查看详情|详情|明细|查看|预览)$/.test(raw)) return 'view_detail'
		if (/^(search|query|filter|搜索|查询|筛选|过滤)$/.test(raw)) return 'search'
		if (/^(fillform|fill_form|填写|填入|填表|录入|补全|设置字段)$/.test(raw)) return 'fill_form'
		if (/(第一条|第一行|首条|首行|第\s*1\s*[条行]).{0,20}(详情|明细|查看|预览)/i.test(text)) return 'view_first_record_detail'
		if (/(新增|新建|创建|添加|增加)/.test(text)) return 'create'
		if (/(编辑|修改|更新)/.test(text)) return 'edit'
		if (/(填写|填入|填表|录入|补全|设置.{0,8}(字段|表单|内容|值))/.test(text)) return 'fill_form'
		if (/(详情|明细|查看|预览)/.test(text)) return 'view_detail'
		if (/(搜索|查询|筛选|过滤|search|query|filter)/i.test(text)) return 'search'
		return 'unknown'
	}

	function isReferentialPreviousActionSearchText(value) {
		const text = String(value || '')
		if (!hasPreviousActionReference(text)) return false
		return /(查询|搜索|查找|找到|检索|筛选|过滤|query|search|find|lookup|filter)/i.test(text)
	}

	function isReferentialPreviousActionViewText(value) {
		const text = String(value || '')
		if (!hasPreviousActionReference(text)) return false
		return /(查看|看一下|详情|明细|打开|预览|view|detail|details|open|inspect)/i.test(text)
	}

	function hasPreviousActionReference(value) {
		const text = String(value || '').replace(/\s+/g, '')
		if (!text) return false
		const action = '(?:创建|新增|新建|添加|增加|保存|提交|填写|填入|录入|建过|加过|create|created|add|added|new|save|saved|submit|submitted|fill|filled)'
		const temporal = '(?:刚才|刚刚|刚|上次|上一(?:个|步|轮|次)|之前|前面|前一步|先前|刚才那个|刚刚那个|刚才的|刚刚的|previous|last|just|earlier)'
		return new RegExp(`${temporal}.{0,24}${action}`, 'i').test(text) ||
			new RegExp(`${action}.{0,16}(?:的|过的|好的)?(?:这个|那个|该|它|其|记录|数据|信息|对象|条目|用户|项目|内容)?`, 'i').test(text) && new RegExp(temporal, 'i').test(text)
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

	function normalizeAuth(value, taskText = '') {
		const auth = value && typeof value === 'object' ? value : {}
		const fallback = extractTaskAuth(taskText)
		return {
			username: cleanNullableString(auth.username || auth.account || auth.user || fallback.username),
			password: cleanNullableString(auth.password || auth.pass || fallback.password),
		}
	}

	function extractTaskAuth(taskText) {
		const pair = extractTaskCredentialPairs(taskText)[0] || {}
		return {
			username: cleanNullableString(pair.username),
			password: cleanNullableString(pair.password),
		}
	}

	function normalizeFormData(value, taskText = '', auth = null) {
		const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
		const credentialValues = collectAuthCredentialValues(auth, taskText)
		const data = {}
		for (const [key, rawValue] of Object.entries(source)) {
			const cleanKey = cleanShortString(key, 60)
			const cleanValue = cleanShortString(rawValue, 200)
			if (!cleanKey || !cleanValue) continue
			if (shouldDropAuthCredentialFormDataEntry(cleanKey, cleanValue, taskText, credentialValues)) continue
			data[cleanKey] = cleanValue
		}
		return data
	}

	function collectAuthCredentialValues(auth, taskText = '') {
		const normalizedAuth = normalizeAuth(auth)
		const values = { usernames: [], passwords: [] }
		addCredentialValue(values.usernames, normalizedAuth.username)
		addCredentialValue(values.passwords, normalizedAuth.password)
		for (const pair of extractTaskCredentialPairs(taskText)) {
			addCredentialValue(values.usernames, pair.username)
			addCredentialValue(values.passwords, pair.password)
		}
		return values
	}

	function extractTaskCredentialPairs(taskText) {
		const text = String(taskText || '')
		const pairs = []
		const accountLabel = '(?:登录账号|登陆账号|用户名|用户|账户|账号)(?!名)'
		const passwordLabel = '(?:登录密码|登陆密码|密码|口令)'
		const separator = '(?:\\s*(?:是|为|=|:|：)\\s*|\\s+|(?=[A-Za-z0-9_@.\\-]))'
		const value = '([^\\s，。；;、]+)'
		const pattern = new RegExp(`${accountLabel}${separator}${value}.{0,18}?${passwordLabel}${separator}${value}`, 'g')
		for (const match of text.matchAll(pattern)) {
			if (!isAuthCredentialPairContext(text, Number(match.index || 0))) continue
			const username = cleanShortString(match[1], 120)
			const password = cleanShortString(match[2], 120)
			if (username || password) pairs.push({ username, password })
		}
		return pairs
	}

	function isAuthCredentialPairContext(taskText, pairIndex) {
		const text = String(taskText || '')
		const safeIndex = Math.max(0, Number(pairIndex) || 0)
		const prefix = text.slice(Math.max(0, safeIndex - 90), safeIndex)
		if (/(?:登录|登陆|log\s*in|sign\s*in)/i.test(prefix)) return true
		if (!/(?:https?:\/\/|打开|进入|访问|前往|open|visit|goto|go\s+to|navigate\s+to)/i.test(prefix)) return false
		return !/(?:创建|新增|新建|添加|增加|编辑|修改|更新|填写|填入|填表|录入|设置|设为|改为|测试|验证|检查|搜索|查询|筛选|过滤)/.test(prefix)
	}

	function shouldDropAuthCredentialFormDataEntry(key, value, taskText, credentialValues) {
		const type = getCredentialFormFieldType(key)
		if (!type) return false
		const values = type === 'password' ? credentialValues?.passwords : credentialValues?.usernames
		if (!hasCredentialValue(values, value)) return false
		return !taskTextHasExplicitNonAuthFormDataValue(taskText, key, value, type)
	}

	function getCredentialFormFieldType(key) {
		const text = String(key || '').replace(/\s+/g, '').trim()
		if (!text) return ''
		if (/^(?:登录|登陆)?(?:账号|账户|用户名|账号名|账户名|用户)$/.test(text)) return 'username'
		if (/^(?:login)?(?:account|username|user|userid|loginid)$/i.test(text)) return 'username'
		if (/^(?:登录|登陆)?(?:密码|口令|确认密码|新密码|旧密码|原密码)$/.test(text)) return 'password'
		if (/^(?:password|passcode|confirmPassword|newPassword|oldPassword)$/i.test(text)) return 'password'
		return ''
	}

	function taskTextHasExplicitNonAuthFormDataValue(taskText, key, value, type) {
		const compactTask = String(taskText || '').replace(/\s+/g, '')
		const compactValue = String(value || '').replace(/\s+/g, '').trim()
		if (!compactTask || !compactValue) return false
		const labels = buildCredentialFormLabelCandidates(key, type)
		let fromIndex = 0
		while (fromIndex < compactTask.length) {
			const valueIndex = compactTask.indexOf(compactValue, fromIndex)
			if (valueIndex < 0) break
			fromIndex = valueIndex + Math.max(1, compactValue.length)
			const contextBeforeValue = compactTask.slice(Math.max(0, valueIndex - 80), valueIndex)
			if (!/(?:创建|新增|新建|添加|增加|编辑|修改|更新|填写|填入|填表|录入|设置|设为|改为|输入)/.test(contextBeforeValue)) continue
			const before = compactTask.slice(Math.max(0, valueIndex - 40), valueIndex)
			if (labels.some((label) => label && new RegExp(`${escapeRegExp(label)}(?:是|为|设为|设置为|填为|填写为|输入为|录入为|:|：|=)?$`).test(before))) {
				return true
			}
		}
		return false
	}

	function buildCredentialFormLabelCandidates(key, type) {
		const labels = [String(key || '').replace(/\s+/g, '').trim()]
		if (type === 'username') {
			labels.push('登录账号', '登陆账号', '账号名', '账户名', '用户名', '账号', '账户', '用户', 'account', 'username', 'user', 'userid', 'loginid')
		} else if (type === 'password') {
			labels.push('登录密码', '登陆密码', '确认密码', '新密码', '旧密码', '原密码', '密码', '口令', 'password', 'passcode', 'confirmPassword', 'newPassword', 'oldPassword')
		}
		return uniqueStrings(labels.map((item) => String(item || '').replace(/\s+/g, '').trim()))
	}

	function addCredentialValue(list, value) {
		const cleaned = cleanShortString(value, 120)
		if (!cleaned) return
		addUnique(list, cleaned)
	}

	function hasCredentialValue(list, value) {
		const key = getCredentialValueKey(value)
		if (!key) return false
		return (Array.isArray(list) ? list : []).some((item) => getCredentialValueKey(item) === key)
	}

	function getCredentialValueKey(value) {
		return cleanShortString(value, 200).replace(/\s+/g, '')
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
		if (containsUrlLikeIntentName(text)) return ''
		if (containsCredentialLikeIntentName(text)) return ''
		text = text.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi, ' ')
			.replace(/[“”‘’"'`<>《》【】[\]()（）{}]/g, ' ')
			.replace(/\s+/g, '')
			.trim()
		text = stripTaskStepPrefix(text)
		text = stripLeadingNoise(text)
		for (let i = 0; i < 4; i++) {
			const next = stripNavigationContextSuffix(stripActionAffixes(stripLeadingNoise(stripTaskStepPrefix(text))))
			if (next === text) break
			text = next
		}
		text = stripLeadingNoise(stripTaskStepPrefix(text))
		if (!text || text.length < 2 || text.length > 24) return ''
		if (isGenericNavigationName(text)) return ''
		return text
	}

	function cleanForbiddenNavigationName(value) {
		let text = cleanShortString(value, 80)
		if (!text) return ''
		if (containsUrlLikeIntentName(text)) return ''
		if (containsCredentialLikeIntentName(text)) return ''
		text = text.replace(/[“”‘’"'`<>《》【】[\]()（）{}]/g, ' ')
			.replace(/\s+/g, '')
			.trim()
		text = stripTaskStepPrefix(text)
		text = stripLeadingNoise(text)
		for (let i = 0; i < 4; i++) {
			const next = stripNavigationContextSuffix(stripLeadingNoise(stripTaskStepPrefix(text)))
			if (next === text) break
			text = next
		}
		if (!text || text.length < 2 || text.length > 32) return ''
		if (isGenericNavigationName(text)) return ''
		return text
	}

	function stripLeadingNoise(value) {
		let text = String(value || '').trim()
		for (let i = 0; i < 4; i++) {
			const next = stripTaskStepPrefix(text)
				.replace(/^[，。；;、,.!?！？:：\s]+/g, '')
				.replace(/^(?:然后|接着|再|并且|同时|随后|现在|当前|马上|立即|帮我|请|麻烦|你|我|先|去|到|把|将|给我|一条|一个|一笔|一份|1条|1个)+/g, '')
				.replace(/^(?:找到|找出|进入|打开|前往|切换到|定位到|在)\s*/g, '')
				.replace(/^(?:the|The|THE|a|A|an|An|AN)(?=[A-Z])/g, '')
				.trim()
			if (next === text) break
			text = next
		}
		return text
	}

	function stripTaskStepPrefix(value) {
		let text = String(value || '').trim()
		for (let i = 0; i < 4; i++) {
			const next = text
				.replace(/^[（(]?\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*[.)．、:：]\s*/g, '')
				.replace(/^第\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*步\s*[:：、.)．-]?\s*/g, '')
				.trim()
			if (next === text) break
			text = next
		}
		return text
	}

	function normalizeTaskTextForHeuristic(value) {
		return String(value || '')
			.replace(/(^|[\n\r])\s*[（(]?\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*[.)．、:：]\s*/g, '$1')
			.replace(/(^|[\n\r])\s*第\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*步\s*[:：、.)．-]?\s*/g, '$1')
	}

	function stripActionAffixes(value) {
		return String(value || '')
			.replace(/^(?:新增|新建|创建|添加|增加|编辑|修改|更新|填写|填入|填表|录入|查看|预览|测试一下|测试|验证一下|验证|检查一下|检查|排查一下|排查)\s*/g, '')
			.replace(/(?:新增|新建|创建|添加|增加|编辑|修改|更新|填写|填入|填表|录入|查看|预览|测试一下|测试|验证一下|验证|检查一下|检查|排查一下|排查|搜索|查询|筛选|过滤).+$/g, '')
			.replace(/(?:新增|新建|创建|添加|增加|编辑|修改|更新|填写|填入|填表|录入|详情|明细|查看|预览|搜索|查询|筛选|过滤|测试|验证|检查|排查)$/g, '')
			.trim()
	}

	function stripNavigationContextSuffix(value) {
		return String(value || '')
			.replace(/(?:部分|模块|页面|网页|页|区域|列表|面板|菜单|标签页|中|里|内|下)$/g, '')
			.replace(/(?:page|screen|view|section|area|panel|menu|module|tab)$/i, '')
			.trim()
	}

	function looksLikeStructuredPageTask(taskText) {
		const text = normalizeTaskTextForHeuristic(taskText)
			.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi, ' ')
		if (/(新增|新建|创建|添加|增加|编辑|修改|更新|详情|明细|查看|预览|填写|填入|填表|录入|补全|第一条|第一行|首条|首行|第\s*1\s*[条行])/.test(text)) {
			return true
		}
		if (extractHeuristicTargetMatches(text, 'unknown')
			.some((match) => cleanNavigationName(normalizeHeuristicTargetCandidate(match?.canonical)))) {
			return true
		}
		return looksLikeSearchTestTask(text)
	}

	function extractHeuristicTargetMatches(taskText, operation) {
		const text = normalizeTaskTextForHeuristic(taskText)
			.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi, ' ')
		const matches = []
		collectNavigationClauseMatches(matches, text)
		if (operation === 'create') {
			collectCreateObjectMatches(matches, text)
		} else if (operation === 'edit') {
			collectEditObjectMatches(matches, text)
		} else if (operation === 'view_first_record_detail' || operation === 'view_detail') {
			collectDetailObjectMatches(matches, text)
		} else if (operation === 'search') {
			collectSearchObjectMatches(matches, text)
		}
		return uniqueHeuristicMatches(matches).slice(0, 5)
	}

	function looksLikeSearchTestTask(text) {
		return /(?:测试|验证|检查|排查|test|verify|check).{0,30}(?:搜索|查询|筛选|过滤|search|query|filter)|(?:每一个|每个|全部|所有|各个|all|every|each).{0,18}(?:搜索|查询|筛选|过滤|search|query|filter)|(?:搜索|查询|筛选|过滤|search|query|filter)(?:功能|条件|项|字段|控件|field|fields|control|controls|condition|conditions)?.{0,18}(?:正常|实现|可用|normal|work|works|available|implemented)/i.test(String(text || ''))
	}

	function collectNavigationClauseMatches(out, text) {
		const boundary = '(?:^|[，。；;、\\s])'
		const politePrefix = '(?:(?:现在|当前|马上|立即|帮我|请|麻烦|先|给我)\\s*)*'
		const chineseTargetContext = '(?:部分|模块|页面|网页|页|区域|列表|面板|菜单|标签页|中|里|内|下)'
		collectTargetMatches(out, text, /(?:找到|进入|打开|前往|切换到|定位到|访问|查看)\s*[“"']([^”"']{1,56})[”"']/g)
		collectTargetMatches(out, text, new RegExp(`${boundary}${politePrefix}(?:找到|进入|打开|前往|切换到|定位到|访问|查看|在)\\s*([^，。；;、\\n\\r]{1,56}?)${chineseTargetContext}`, 'g'))
		collectTargetMatches(out, text, /在\s*([^，。；;、\n\r]{2,40}?)(?=(?:新增|新建|创建|添加|增加|编辑|修改|更新|查看|预览|测试|验证|检查|排查|搜索|查询|筛选|过滤|填写|填入|填表|录入))/g)
		collectTargetMatches(out, text, new RegExp(`${boundary}${politePrefix}(?:找到|进入|前往|切换到|定位到|访问)\\s*([^，。；;、\\n\\r]{2,40})(?=[，。；;、\\n\\r]|$)`, 'g'))
		collectTargetMatches(out, text, new RegExp(`${boundary}([^，。；;、\\n\\r]{2,48}?)${chineseTargetContext}(?=[，。；;、\\n\\r]|$)`, 'g'))
		collectTargetMatches(out, text, /(?:open|go\s+to|goto|navigate\s+to|visit|switch\s+to|find|enter)\s+["']?([^"',.;\n\r]{2,56}?)["']?\s+(?:page|screen|view|section|area|panel|menu|module|tab)\b/gi)
		collectTargetMatches(out, text, /["']([^"']{2,56})["']\s+(?:page|screen|view|section|area|panel|menu|module|tab)\b/gi)
		collectTargetMatches(out, text, /(?:on|in|inside|within)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _/-]{1,40}?)\s+(?:page|screen|view|section|area|panel|menu|module|tab)\b/gi)
		collectTargetMatches(out, text, /(?:open|go\s+to|goto|navigate\s+to|visit|switch\s+to|find|enter)\s+(?!https?:\/\/|www\.)([A-Za-z][A-Za-z0-9 _/-]{1,40}?)(?=\s+(?:and|then|,)\s*(?:test|verify|check|search|query|filter|fill|create|add|new|edit|update|view)\b)/gi)
		collectTargetMatches(out, text, /(?:go\s+to|goto|navigate\s+to|switch\s+to|find|enter)\s+(?!https?:\/\/|www\.)([A-Za-z][A-Za-z0-9 _/-]{1,40})(?=$|[，。；;,.\n\r])/gi)
	}

	function collectCreateObjectMatches(out, text) {
		collectTargetMatches(out, text, /(?:新增|新建|创建|添加|增加)\s*(?:一条|一个|一笔|一份|1条|1个)?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,24}?)(?:数据|信息|资料|记录)?(?=$|[，。；;、\s])/g)
		collectTargetMatches(out, text, /([\u4e00-\u9fa5A-Za-z0-9]{2,24})(?:新增|新建|创建|添加|增加)(?:页面|页|列表|模块)?/g)
	}

	function collectEditObjectMatches(out, text) {
		collectTargetMatches(out, text, /(?:编辑|修改|更新)\s*(?:一条|一个|一笔|一份|1条|1个)?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,24}?)(?:数据|信息|资料|记录)?(?=$|[，。；;、\s])/g)
		collectTargetMatches(out, text, /([\u4e00-\u9fa5A-Za-z0-9]{2,24})(?:编辑|修改|更新)(?:页面|页|列表|模块)?/g)
	}

	function collectDetailObjectMatches(out, text) {
		collectTargetMatches(out, text, /(?:查看|预览|打开|进入)?\s*(?:列表)?(?:第一条|第一行|首条|首行|第\s*1\s*[条行])?\s*([\u4e00-\u9fa5A-Za-z0-9]{2,24}?)(?:详情|明细)/g)
	}

	function collectSearchObjectMatches(out, text) {
		const namedTarget = '([^，。；;、\\n\\r]{2,48}?)'
		collectTargetMatches(out, text, new RegExp(`(?:测试|验证|检查|排查)\\s*(?:一下|下)?\\s*${namedTarget}\\s*(?:的)?\\s*(?:每一个|每个|全部|所有|各个)?\\s*(?:搜索|查询|筛选)(?:功能|条件|项|字段|区域)?`, 'g'))
		collectTargetMatches(out, text, new RegExp(`${namedTarget}\\s*(?:的)?\\s*(?:每一个|每个|全部|所有|各个)?\\s*(?:搜索|查询|筛选)(?:功能|条件|项|字段|区域)`, 'g'))
		collectTargetMatches(out, text, /(?:test|verify|check)\s+(?:all|every|each)?\s*(?:search|query|filter)(?:\s*[/&+]\s*(?:search|query|filter))?\s*(?:field|fields|control|controls|condition|conditions|input|inputs)?\s+(?:on|in|inside|within)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _/-]{1,40}?)\s+(?:page|screen|view|section|area|panel|menu|module|tab)\b/gi)
		collectTargetMatches(out, text, /(?:test|verify|check)\s+(?:all|every|each)?\s*(?:search|query|filter)(?:\s*[/&+]\s*(?:search|query|filter))?\s*(?:field|fields|control|controls|condition|conditions|input|inputs)?\s+(?:on|in|inside|within)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9 _/-]{1,40}?)(?=$|[,.;\n\r])/gi)
	}

	function collectTargetMatches(out, text, pattern) {
		for (const match of String(text || '').matchAll(pattern)) {
			const raw = String(match?.[0] || '').trim()
			const canonical = String(match?.[1] || '').trim()
			if (!canonical) continue
			out.push({ raw, canonical })
		}
	}

	function uniqueHeuristicMatches(matches) {
		const output = []
		for (const match of Array.isArray(matches) ? matches : []) {
			const canonical = cleanNavigationName(normalizeHeuristicTargetCandidate(match?.canonical))
			if (!canonical) continue
			if (output.some((item) =>
				cleanNavigationName(normalizeHeuristicTargetCandidate(item.canonical)) === canonical
			)) continue
			output.push(match)
		}
		return output
	}

	function normalizeHeuristicTargetCandidate(value) {
		return stripTaskStepPrefix(trimToLastTaskNavigationVerb(String(value || '')))
			.replace(/^[，。；;、,.!?！？:：\s]+/g, '')
			.replace(/^[（(]?\s*(?:\d{1,3}|[一二三四五六七八九十]{1,3})\s*[.)．、:：]\s*/g, '')
			.replace(/^(?:一条|一个|一笔|一份|1条|1个)/g, '')
			.replace(/^(?:现在|当前|马上|立即)(?:帮我|给我|请|麻烦)?/g, '')
			.replace(/^(?:帮我|给我|请|麻烦)/g, '')
			.replace(/^(?:on|in|inside|within)\s+(?:the\s+)?/i, '')
			.replace(/^(?:测试|验证|检查|排查)(?:一下|下)?/g, '')
			.replace(/^(?:test|verify|check)\s+(?:all|every|each)?\s*(?:search|query|filter)(?:\s*[/&+]\s*(?:search|query|filter))?\s*(?:field|fields|control|controls|condition|conditions|input|inputs)?\s+(?:on|in|inside|within)\s+(?:the\s+)?/i, '')
			.replace(/(?:新增|新建|创建|添加|增加|编辑|修改|更新|填写|填入|填表|录入|查看|预览|测试一下|测试|验证一下|验证|检查一下|检查|排查一下|排查|搜索|查询|筛选|过滤).+$/g, '')
			.replace(/(?:并|且|然后|再|接着)?(?:测试|验证|检查|排查)(?:一下|下)?.*$/g, '')
			.trim()
	}

	function trimToLastTaskNavigationVerb(value) {
		const text = String(value || '')
		const matches = [...text.matchAll(/(?:找到|进入|打开|前往|切换到|定位到|访问|查看)\s*/g)]
		const last = matches[matches.length - 1]
		if (!last || Number(last.index) <= 0) return text
		return text.slice(Number(last.index) + last[0].length)
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
		if (operation === 'edit') {
			for (const suffix of ['编辑', '修改', '更新']) {
				addUnique(names, `${base}${suffix}`)
				addUnique(names, `${base}${suffix}页面`)
			}
		}
		if (operation === 'view_detail' || operation === 'view_first_record_detail') {
			for (const suffix of ['详情', '明细', '查看', '预览']) {
				addUnique(names, `${base}${suffix}`)
				addUnique(names, `${base}${suffix}页面`)
			}
		}
		return names
	}

	function isHeuristicNoiseTarget(value, match = null) {
		const text = String(value || '').trim()
		if (!text) return true
		if (/^(?:现在帮我|帮我|给我|请|麻烦|一条|一个|一笔|一份|1条|1个)/.test(text)) return true
		if (/^(按|按照|根据|依照|基于|以).+/.test(text)) return true
		if (/(?:列表)?(?:第一条|第一行|首条|首行|第\s*1\s*[条行])/.test(text)) return true
		if (isExplicitNavigationMatch(match)) return false
		return /^(要求|需求|规则|数据|信息|资料|记录|一条记录|一个记录|1条记录|1个记录)$/.test(text) || /规则$/.test(text)
	}

	function isExplicitNavigationMatch(match) {
		const raw = String(match?.raw || '')
		if (!raw) return false
		const hasStrongNavigationContext = /(?:部分|模块|页面|网页|页|区域|面板|菜单|标签页|page|screen|view|section|area|panel|menu|module|tab)/i.test(raw)
		const hasNavigationContext = hasStrongNavigationContext || /(?:列表|中|里|内|下)/.test(raw)
		if (/(?:列表)?(?:第一条|第一行|首条|首行|第\s*1\s*[条行])|详情|明细|预览/.test(raw) && !hasStrongNavigationContext) {
			return false
		}
		if (/(?:找到|找出|进入|打开|前往|切换到|定位到|访问|在|open|go\s+to|goto|navigate\s+to|visit|switch\s+to|find|enter)/i.test(raw)) {
			return true
		}
		return hasNavigationContext && /(?:查看|view)/i.test(raw)
	}

	function extractTaskUrl(value) {
		const match = String(value || '').match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i)
		return match?.[0] || null
	}

	function containsUrlLikeIntentName(value) {
		return /(https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,}(?:\/|\b)|\S+@\S+\.\S+)/i.test(String(value || ''))
	}

	function containsCredentialLikeIntentName(value) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		return /(?:账号|账户|用户名|登录账号|密码|口令|验证码|手机号|手机|电话)\s*[:：= ]/i.test(text) ||
			/\b(?:account|username|user|password|passcode|otp|phone|mobile)\s*[:= ]/i.test(text)
	}

	function isGenericNavigationName(value) {
		const text = String(value || '').trim()
		return /^(这个|那个|当前|目标|该|本|此|页面|网页|地址|链接|网站|站点|应用|模块|列表|每一个|每个|所有|全部|全部的|各个|新增|新建|创建|添加|详情|查看|明细|预览|搜索|查询|筛选|过滤|搜索区域|筛选区域|查询区域|搜索功能|搜索项|搜索条件|筛选功能|筛选项|筛选条件|查询功能|查询项|查询条件|过滤功能|过滤项|过滤条件|page|site|website|app|application|screen|view|section|area|panel|menu|module|tab|all|every|each)$/i.test(text)
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

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
