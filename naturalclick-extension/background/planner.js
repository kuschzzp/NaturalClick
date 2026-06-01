;(function (g) {
	const { safeJsonParse, generateId } = g.NC_BG_UTILS
	const plannerContext = g.NC_BG_PLANNER_CONTEXT
	if (!plannerContext) throw new Error('NC_BG_PLANNER_CONTEXT 未加载。')
	const plannerFastPath = g.NC_BG_PLANNER_FASTPATH
	if (!plannerFastPath) throw new Error('NC_BG_PLANNER_FASTPATH 未加载。')
	const plannerValidation = g.NC_BG_PLANNER_VALIDATION
	if (!plannerValidation) throw new Error('NC_BG_PLANNER_VALIDATION 未加载。')
	const plannerModelClient = g.NC_BG_PLANNER_MODEL_CLIENT
	if (!plannerModelClient) throw new Error('NC_BG_PLANNER_MODEL_CLIENT 未加载。')
	const plannerDecision = g.NC_BG_PLANNER_DECISION
	if (!plannerDecision) throw new Error('NC_BG_PLANNER_DECISION 未加载。')
	const plannerPrompt = g.NC_BG_PLANNER_PROMPT
	if (!plannerPrompt) throw new Error('NC_BG_PLANNER_PROMPT 未加载。')
	const taskIntent = g.NC_BG_TASK_INTENT
	if (!taskIntent) throw new Error('NC_BG_TASK_INTENT 未加载。')
	const plannerWorkflows = g.NC_BG_PLANNER_WORKFLOWS
	if (!plannerWorkflows) throw new Error('NC_BG_PLANNER_WORKFLOWS 未加载。')
	const {
		buildDuplicatePlanningContext,
		buildInvalidActionContext,
		buildInvalidActionInputContext,
		buildInvalidModelOutputContext,
		buildObservationText,
		planningRequestSignature,
		resolvePlanningContextRequest,
	} = plannerContext
	const {
		deriveFastPathDecision,
		extractTargetUrl,
		hasRecentTargetUrlNavigation,
		isSameUrlFamily,
		isTaskTargetLocation,
	} = plannerFastPath
	const {
		validateExecutableAction,
		validateActionAgainstHistory,
	} = plannerValidation
	const {
		callOpenAI,
		isModelTimeoutError,
	} = plannerModelClient
	const { normalizeDecision } = plannerDecision
	const {
		buildCompactPlannerSystemPrompt,
		buildPlannerSystemPrompt,
		buildPlannerUserMessage,
		buildHistoryLine,
	} = plannerPrompt
	const {
		buildTaskIntentSystemPrompt,
		buildTaskIntentUserMessage,
		deriveHeuristicTaskIntent,
		markTaskIntentUnavailable,
		normalizeTaskIntent,
		shouldRequestTaskIntent,
		storeTaskIntent,
	} = taskIntent
	const {
		buildWorkflowContextText,
		derivePreIntentWorkflowDecision,
		derivePreModelWorkflowDecision,
		deriveTimeoutRecoveryWorkflowDecision,
	} = plannerWorkflows
	const MAX_PLANNING_ROUNDS = 4
	const MODEL_ROUND_TIMEOUT_MS = 60000
	const MIN_MODEL_ROUND_TIMEOUT_MS = 8000
	const MAX_MODEL_ROUND_TIMEOUT_MS = 180000
	const DEFAULT_FULL_OBSERVATION_MAX_CHARS = 262144
	const DEFAULT_COMPACT_OBSERVATION_MAX_CHARS = 4200
	const DEFAULT_COMPACT_ELEMENT_THRESHOLD = 120
	const DEFAULT_COMPACT_RAW_CANDIDATE_THRESHOLD = 80
	const PLANNING_ACTIONS = new Set(['request_context', 'inspect_index', 'inspect_region', 'request_options_for'])

	async function planAction(session, observation, options = {}) {
		const tabs = await chrome.tabs.query({ windowId: session.windowId })
		const tabsSummary = tabs
			.filter((tab) => tab.id)
			.map((tab) => ({
				id: tab.id,
				title: tab.title || '',
				url: tab.url || '',
				current: tab.id === session.currentTabId,
			}))

		const historyText = session.history
			.slice(-5)
			.map(buildHistoryLine)
			.join('\n')
		const planningConfig = getPlanningContextConfig(session.config)
		const observationText = buildObservationText(observation, {
			task: session.task,
			maxChars: planningConfig.fullObservationMaxChars,
		})
		const startCompactObservation = shouldStartWithCompactObservation(observation, observationText, planningConfig)
		const toolLines = g.NC_BG_TOOLS?.getToolPromptLines?.() || []
		const availableActionNames = getAvailableActionNames()
		const endpoint = session.config.textLLM
		const preIntentWorkflowDecision = derivePreIntentWorkflowDecision(session, observation, { tabsSummary })
		if (preIntentWorkflowDecision) return preIntentWorkflowDecision
		await ensureTaskIntent(session, observation, endpoint, options)
		const workflowDecision = derivePreModelWorkflowDecision(session, observation, { tabsSummary })
		if (workflowDecision) return workflowDecision
		const workflowContextText = buildWorkflowContextText(session, observation)

		const system = buildPlannerSystemPrompt()
		const compactSystem = buildCompactPlannerSystemPrompt()

		const modelRoundTimeoutMs = getModelRoundTimeoutMs(endpoint)
		const planningContext = []
		const planningRequestSeen = new Map()
		let lastDecision = null
		let useCompactObservation = startCompactObservation
		const buildCompactObservationText = (reason = 'compact_retry') =>
			buildObservationText(observation, {
				task: session.task,
				compact: true,
				compactReason: reason,
				maxChars: planningConfig.compactObservationMaxChars,
			})
		for (let round = 0; round < MAX_PLANNING_ROUNDS; round++) {
			const initialCompactRound = round === 0 && startCompactObservation
			const compactReason = startCompactObservation ? 'large_observation' : 'compact_retry'
			const compactObservationText = useCompactObservation
				? buildCompactObservationText(compactReason)
				: ''
			notifyPlanningProgress(session, options, {
				stage: round === 0
					? (initialCompactRound ? 'model_compact_request' : 'model_request')
					: 'model_context_round',
				round: round + 1,
				text: round === 0
					? (initialCompactRound
						? buildCompactProgressText(session, observation, observationText, compactObservationText, endpoint, modelRoundTimeoutMs, '大页面阈值触发', planningConfig)
						: `第 ${session.step} 步：请求模型规划动作（最多等待 ${formatSeconds(modelRoundTimeoutMs)} 秒）...`)
					: `第 ${session.step} 步：模型补充上下文后继续规划（第 ${round + 1} 轮，最多等待 ${formatSeconds(modelRoundTimeoutMs)} 秒）...`,
			})
			const user = buildPlannerUserMessage({
				session,
				observation,
				tabsSummary,
				observationText: useCompactObservation
					? compactObservationText
					: observationText,
				toolLines,
				historyText,
				planningContext,
				workflowContextText,
				round,
				compact: useCompactObservation,
			})
			const systemForRound = useCompactObservation ? compactSystem : system
			const messages = [
				{ role: 'system', content: systemForRound },
				{ role: 'user', content: user },
			]
			let content = ''
			try {
				const result = await callOpenAI(endpoint, messages, {
					returnMeta: true,
					timeoutMs: modelRoundTimeoutMs,
					stream: endpoint?.stream !== false,
					onStream: createModelStreamProgressPublisher(session, options, round + 1, modelRoundTimeoutMs),
				})
				content = result.content
				appendModelTrace(session, {
					title: round ? `模型调用: 文本规划补充 #${round + 1}` : '模型调用: 文本规划',
					ok: true,
					detail: `${endpoint.model} 请求成功`,
					io: result.io,
				})
			} catch (error) {
				appendModelTrace(session, {
					title: round ? `模型调用: 文本规划补充 #${round + 1}` : '模型调用: 文本规划',
					ok: false,
					detail: String(error?.message || error || '模型请求失败'),
					io: error?.io || null,
				})
				if (!(round === 0 && isModelTimeoutError(error))) throw error
				if (useCompactObservation) {
					const timeoutRecovery = deriveTimeoutRecoveryWorkflowDecision(session, observation, { tabsSummary })
					if (timeoutRecovery) {
						notifyPlanningProgress(session, options, {
							stage: 'timeout_recovery',
							round: round + 1,
							text: `第 ${session.step} 步：精简上下文请求超时，使用受限 workflow 恢复策略...`,
						})
						return timeoutRecovery
					}
					notifyPlanningProgress(session, options, {
						stage: 'timeout_no_recovery',
						round: round + 1,
						text: `第 ${session.step} 步：精简上下文请求超时，且没有可用确定性恢复动作。`,
					})
					return buildModelTimeoutFailureDecision(error)
				}
				const compactObservationText = buildCompactObservationText()
				notifyPlanningProgress(session, options, {
					stage: 'compact_retry',
					round: round + 1,
					text: buildCompactRetryProgressText(session, observation, observationText, compactObservationText, endpoint, modelRoundTimeoutMs, planningConfig),
				})
				const compactUser = buildPlannerUserMessage({
					session,
					observation,
					tabsSummary,
					observationText: compactObservationText,
					toolLines,
					historyText,
					planningContext,
					workflowContextText,
					round,
					compact: true,
				})
				try {
					const retryResult = await callOpenAI(endpoint, [
						{ role: 'system', content: compactSystem },
						{ role: 'user', content: compactUser },
					], {
						returnMeta: true,
						timeoutMs: modelRoundTimeoutMs,
						stream: endpoint?.stream !== false,
						onStream: createModelStreamProgressPublisher(session, options, round + 1, modelRoundTimeoutMs),
					})
					content = retryResult.content
					useCompactObservation = true
					appendModelTrace(session, {
						title: '模型调用: 文本规划压缩重试',
						ok: true,
						detail: `${endpoint.model} 压缩上下文重试成功`,
						io: retryResult.io,
					})
				} catch (retryError) {
					appendModelTrace(session, {
						title: '模型调用: 文本规划压缩重试',
						ok: false,
						detail: String(retryError?.message || retryError || '模型请求失败'),
						io: retryError?.io || null,
					})
					const timeoutRecovery = isModelTimeoutError(retryError)
						? deriveTimeoutRecoveryWorkflowDecision(session, observation, { tabsSummary })
						: null
					if (timeoutRecovery) {
						notifyPlanningProgress(session, options, {
							stage: 'timeout_recovery',
							round: round + 1,
							text: `第 ${session.step} 步：模型重试仍超时，使用受限 workflow 恢复策略...`,
						})
						return timeoutRecovery
					}
					if (isModelTimeoutError(retryError)) {
						notifyPlanningProgress(session, options, {
							stage: 'timeout_no_recovery',
							round: round + 1,
							text: `第 ${session.step} 步：模型重试仍超时，且没有可用确定性恢复动作。`,
						})
						return buildModelTimeoutFailureDecision(retryError)
					}
					throw retryError
				}
			}

			const parsed = safeJsonParse(content)
			const normalized = normalizeDecision(parsed)
			if (!normalized) {
				planningContext.push(buildInvalidModelOutputContext(content, planningContext.length))
				continue
			}
			lastDecision = normalized
			if (!isPlanningAction(normalized.action)) {
				if (isAvailableAction(normalized.action, availableActionNames)) {
					const validationError =
						validateExecutableAction(normalized.action, observation, tabsSummary) ||
						validateActionAgainstHistory(normalized.action, session)
					if (!validationError) return normalized
					planningContext.push(buildInvalidActionInputContext(normalized.action, planningContext.length, validationError))
					continue
				}
				planningContext.push(buildInvalidActionContext(normalized.action, planningContext.length, availableActionNames))
				continue
			}
			const requestSig = planningRequestSignature(normalized.action)
			const previousCount = planningRequestSeen.get(requestSig) || 0
			planningRequestSeen.set(requestSig, previousCount + 1)
			if (previousCount > 0) {
				planningContext.push(buildDuplicatePlanningContext(normalized.action, planningContext.length, previousCount + 1))
			} else {
				planningContext.push(resolvePlanningContextRequest(observation, normalized.action, planningContext.length))
			}
			notifyPlanningProgress(session, options, {
				stage: 'planning_context',
				round: round + 1,
				text: `第 ${session.step} 步：模型请求内部上下文 ${normalized.action.name}，已补充后继续规划...`,
			})
		}
		return {
			evaluation_previous_goal: lastDecision?.evaluation_previous_goal || '已多次请求上下文，但仍未形成可执行页面动作。',
			memory: lastDecision?.memory || '',
			thought: '内部 ReAct 上下文请求次数达到上限。',
			next_goal: '结束任务',
			action: {
				name: 'done',
				input: { text: '内部上下文请求次数达到上限，任务终止以避免循环。', success: false },
			},
		}
	}

	async function ensureTaskIntent(session, observation, endpoint, options = {}) {
		if (!shouldRequestTaskIntent(session)) return null
		if (shouldSkipTaskIntentForObservation(observation)) return null
		const heuristicIntent = storeHeuristicTaskIntentIfAvailable(session, '模型调用前', true, { requireTarget: true })
		if (heuristicIntent) return heuristicIntent
		if (!endpoint?.baseURL || !endpoint?.model) {
			if (!storeHeuristicTaskIntentIfAvailable(session, '文本模型配置不完整', true)) {
				markTaskIntentUnavailable(session, 'skipped', '文本模型配置不完整，跳过任务理解。')
			}
			return null
		}
		const timeoutMs = getTaskIntentTimeoutMs(endpoint)
		notifyPlanningProgress(session, options, {
			stage: 'task_intent_request',
			round: 1,
			text: `第 ${session.step} 步：先解析用户任务意图（最多等待 ${formatSeconds(timeoutMs)} 秒）...`,
		})
		const messages = [
			{ role: 'system', content: buildTaskIntentSystemPrompt() },
			{ role: 'user', content: buildTaskIntentUserMessage(session) },
		]
		try {
			const result = await callOpenAI(endpoint, messages, { returnMeta: true, timeoutMs })
			const parsed = safeJsonParse(result.content)
			if (!parsed || typeof parsed !== 'object') {
				const fallbackIntent = storeHeuristicTaskIntentIfAvailable(session, '任务理解返回非法 JSON')
				if (!fallbackIntent) markTaskIntentUnavailable(session, 'invalid', '任务理解模型没有返回合法 JSON。')
				appendModelTrace(session, {
					title: '模型调用: 任务理解',
					ok: !!fallbackIntent,
					detail: fallbackIntent
						? '任务理解返回内容不是合法 JSON，已使用本地启发式任务理解。'
						: '任务理解返回内容不是合法 JSON，已回退到本地任务解析。',
					modelThought: fallbackIntent ? summarizeTaskIntent(fallbackIntent) : '',
					io: result.io,
				})
				return fallbackIntent
			}
			const intent = normalizeTaskIntent(parsed, session?.latestTask || session?.task || '')
			storeTaskIntent(session, intent, { model: endpoint.model })
			appendModelTrace(session, {
				title: '模型调用: 任务理解',
				ok: true,
				detail: `${endpoint.model} 任务理解成功`,
				modelThought: summarizeTaskIntent(intent),
				io: result.io,
			})
			return intent
		} catch (error) {
			const fallbackIntent = storeHeuristicTaskIntentIfAvailable(session, String(error?.message || error || '任务理解失败'))
			if (!fallbackIntent) markTaskIntentUnavailable(session, 'failed', String(error?.message || error || '任务理解失败'))
			appendModelTrace(session, {
				title: '模型调用: 任务理解',
				ok: !!fallbackIntent,
				detail: fallbackIntent
					? `${String(error?.message || error || '任务理解失败')}，已使用本地启发式任务理解。`
					: `${String(error?.message || error || '任务理解失败')}，已回退到本地任务解析。`,
				modelThought: fallbackIntent ? summarizeTaskIntent(fallbackIntent) : '',
				io: error?.io || null,
			})
			return fallbackIntent
		}
	}

	function storeHeuristicTaskIntentIfAvailable(session, reason, trace = false, options = {}) {
		const intent = typeof deriveHeuristicTaskIntent === 'function'
			? deriveHeuristicTaskIntent(session?.latestTask || session?.task || '')
			: null
		if (!intent) return null
		const hasTarget = Array.isArray(intent.navigationTargets) && intent.navigationTargets.length > 0
		const hasOperation = intent.operation && intent.operation !== 'unknown'
		if (options?.requireTarget && !hasTarget) return null
		if (!hasTarget && !hasOperation) return null
		const stored = storeTaskIntent(session, intent, { model: 'local-heuristic' })
		if (trace && reason && Array.isArray(session?.traceItems)) {
			appendModelTrace(session, {
				title: '模型调用: 任务理解',
				ok: true,
				detail: `${reason}，已使用本地启发式任务理解。`,
				modelThought: summarizeTaskIntent(stored),
			})
		}
		return stored
	}

	function shouldSkipTaskIntentForObservation(observation) {
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		if (forms.some((form) => {
			const formText = `${form?.name || ''} ${form?.id || ''} ${form?.region || ''}`
			if (/(弹层|对话框|dialog|modal|drawer|popover)/i.test(formText)) return true
			const fields = Array.isArray(form?.fields) ? form.fields : []
			return fields.some((field) => /^(dialog|popover)$/i.test(String(field?.region || '')))
		})) return true
		return (Array.isArray(observation?.actions) ? observation.actions : [])
			.some((item) => /^(dialog|popover)$/i.test(String(item?.region || '')))
	}

	function buildModelTimeoutFailureDecision(error) {
		const reason = String(error?.message || error || '模型请求连续超时')
		return {
			evaluation_previous_goal: `模型完整规划和压缩重试均未在时限内返回: ${reason}`,
			memory: '本步没有可用的确定性 workflow 恢复动作；为避免盲点或循环，停止自动推进并保留模型请求日志供排查。',
			thought: '模型连续超时且没有安全的本地恢复动作，继续自动点击风险更高。',
			next_goal: '结束任务并提示模型超时原因',
			action: {
				name: 'done',
				input: {
					text: `模型连续超时，且当前页面没有可用的确定性恢复动作。请查看最近的模型调用日志 diagnostics 后重试。最后错误: ${reason}`,
					success: false,
				},
			},
		}
	}

	function getModelRoundTimeoutMs(endpoint) {
		const configured = Number(endpoint?.timeoutMs)
		if (!Number.isFinite(configured) || configured <= 0) return MODEL_ROUND_TIMEOUT_MS
		return Math.max(MIN_MODEL_ROUND_TIMEOUT_MS, Math.min(MAX_MODEL_ROUND_TIMEOUT_MS, Math.floor(configured)))
	}

	function getTaskIntentTimeoutMs(endpoint) {
		const configured = Number(endpoint?.taskIntentTimeoutMs)
		if (Number.isFinite(configured) && configured > 0) {
			return Math.max(5000, Math.min(20000, Math.floor(configured)))
		}
		return Math.max(5000, Math.min(12000, getModelRoundTimeoutMs(endpoint)))
	}

	function summarizeTaskIntent(intent) {
		const operation = String(intent?.operation || 'unknown')
		const targets = (Array.isArray(intent?.navigationTargets) ? intent.navigationTargets : [])
			.map((target) => target?.canonical || target?.raw || '')
			.filter(Boolean)
			.join('、')
		return `任务理解：operation=${operation}${targets ? `，navigation=${targets}` : ''}`
	}

	function buildCompactProgressText(session, observation, fullText, compactText, endpoint, timeoutMs, fallbackReason, planningConfig) {
		return `第 ${session.step} 步：观察内容较大，使用精简上下文请求模型规划动作（${buildCompactObservationSummary(observation, fullText, compactText, endpoint, timeoutMs, fallbackReason, planningConfig)}）...`
	}

	function buildCompactRetryProgressText(session, observation, fullText, compactText, endpoint, timeoutMs, planningConfig) {
		return `第 ${session.step} 步：模型首轮超时，正在压缩上下文重试（${buildCompactObservationSummary(observation, fullText, compactText, endpoint, timeoutMs, '首轮完整上下文超时', planningConfig)}）...`
	}

	function buildCompactObservationSummary(observation, fullText, compactText, endpoint, timeoutMs, fallbackReason, planningConfig) {
		const limits = getPlanningContextConfig({ planning: planningConfig })
		const fullChars = String(fullText || '').length
		const compactChars = String(compactText || '').length
		const itemCount = countObservationItems(observation)
		const rawCount = countRawCandidates(observation)
		const triggers = []
		if (
			fullChars >= limits.fullObservationMaxChars ||
			isObservationTextTruncatedAtLimit(fullText, limits.fullObservationMaxChars)
		) {
			triggers.push(`文本=${fullChars}/${limits.fullObservationMaxChars}`)
		}
		if (itemCount >= limits.compactElementThreshold) {
			triggers.push(`元素=${itemCount}/${limits.compactElementThreshold}`)
		}
		if (rawCount >= limits.compactRawCandidateThreshold) {
			triggers.push(`raw=${rawCount}/${limits.compactRawCandidateThreshold}`)
		}
		const reason = triggers.length
			? `触发：${triggers.join('，')}`
			: `原因：${fallbackReason || '压缩上下文'}`
		const model = String(endpoint?.model || '未配置')
		return `${reason}；完整≈${fullChars}字，精简≈${compactChars}字；元素=${itemCount}，raw=${rawCount}；模型=${model}；最多等待 ${formatSeconds(timeoutMs)} 秒`
	}

	function formatSeconds(ms) {
		return Math.max(1, Math.round((Number(ms) || 0) / 1000))
	}

	function notifyPlanningProgress(session, options, event) {
		const callback = options?.onProgress
		if (typeof callback !== 'function') return
		try {
			callback({
				step: session?.step,
				stage: event?.stage || '',
				round: Number(event?.round) || 0,
				text: String(event?.text || '').trim(),
				stream: event?.stream || undefined,
			})
		} catch (_) {}
	}

	function createModelStreamProgressPublisher(session, options, round, timeoutMs) {
		let lastAt = 0
		let lastChars = 0
		return (event) => {
			const content = String(event?.content || '')
			const reasoning = String(event?.reasoning || '')
			const receivedChars = content.length + reasoning.length
			const now = Date.now()
			if (!event?.done && now - lastAt < 300 && receivedChars - lastChars < 120) return
			lastAt = now
			lastChars = receivedChars
			notifyPlanningProgress(session, options, {
				stage: 'model_stream_delta',
				round,
				text: buildModelStreamProgressText(session, event, timeoutMs),
				stream: {
					contentChars: content.length,
					reasoningChars: reasoning.length,
					chunkCount: Number(event?.chunkCount || 0),
					done: !!event?.done,
				},
			})
		}
	}

	function buildModelStreamProgressText(session, event, timeoutMs) {
		const content = String(event?.content || '')
		const reasoning = String(event?.reasoning || '')
		const preview = shortStreamPreview(reasoning || content)
		const parts = [
			`第 ${session.step} 步：模型正在流式响应`,
			`正文 ${content.length} 字`,
			reasoning ? `推理 ${reasoning.length} 字` : '',
			`最多等待 ${formatSeconds(timeoutMs)} 秒`,
		].filter(Boolean)
		return `${parts.join('，')}...${preview ? `\n${preview}` : ''}`
	}

	function shortStreamPreview(value) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		if (!text) return ''
		return text.length > 420 ? `${text.slice(0, 420)}...` : text
	}

	function isPlanningAction(action) {
		return PLANNING_ACTIONS.has(String(action?.name || '').trim())
	}

	function getAvailableActionNames() {
		const names = new Set(['done'])
		const plannerTools = g.NC_BG_TOOLS?.listPlannerTools?.()
		const tools = Array.isArray(plannerTools)
			? plannerTools
			: (g.NC_BG_TOOLS?.listTools?.() || [])
		for (const tool of tools) {
			const name = String(tool?.name || '').trim()
			if (name) names.add(name)
		}
		for (const line of (g.NC_BG_TOOLS?.getToolPromptLines?.() || [])) {
			const match = String(line || '').match(/^-\s*([A-Za-z0-9_:-]+)\s*:/)
			if (match?.[1]) names.add(match[1])
		}
		return names
	}

	function isAvailableAction(action, availableActionNames) {
		const name = String(action?.name || '').trim()
		return !!name && availableActionNames.has(name)
	}

	function shouldStartWithCompactObservation(observation, observationText, planningConfig) {
		const limits = getPlanningContextConfig({ planning: planningConfig })
		if (String(observationText || '').length >= limits.fullObservationMaxChars) return true
		if (isObservationTextTruncatedAtLimit(observationText, limits.fullObservationMaxChars)) return true
		if (countObservationItems(observation) >= limits.compactElementThreshold) return true
		if (countRawCandidates(observation) >= limits.compactRawCandidateThreshold) return true
		return false
	}

	function isObservationTextTruncatedAtLimit(observationText, limit) {
		const safeLimit = Math.max(1, Math.floor(Number(limit) || 0))
		return String(observationText || '').includes(`observation truncated at ${safeLimit} chars`)
	}

	function getPlanningContextConfig(config) {
		const planning = config?.planning || {}
		const full = clampInteger(
			planning.fullObservationMaxChars,
			DEFAULT_FULL_OBSERVATION_MAX_CHARS,
			7600,
			1048576
		)
		const compact = clampInteger(
			planning.compactObservationMaxChars,
			DEFAULT_COMPACT_OBSERVATION_MAX_CHARS,
			1000,
			Math.min(65536, full)
		)
		const elementThreshold = clampInteger(
			planning.compactElementThreshold,
			DEFAULT_COMPACT_ELEMENT_THRESHOLD,
			20,
			10000
		)
		const rawThreshold = clampInteger(
			planning.compactRawCandidateThreshold,
			DEFAULT_COMPACT_RAW_CANDIDATE_THRESHOLD,
			20,
			10000
		)
		return {
			fullObservationMaxChars: full,
			compactObservationMaxChars: compact,
			compactElementThreshold: elementThreshold,
			compactRawCandidateThreshold: rawThreshold,
		}
	}

	function clampInteger(value, fallback, min, max) {
		const number = Number(value)
		const base = Number.isFinite(number) && number > 0 ? number : Number(fallback)
		return Math.max(min, Math.min(max, Math.floor(base)))
	}

	function countObservationItems(observation) {
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		const formFields = forms.reduce((sum, form) => {
			const fields = Array.isArray(form?.fields) ? form.fields : []
			return sum + fields.length
		}, 0)
		return [
			formFields,
			arrayLength(observation?.actions),
			arrayLength(observation?.options),
			arrayLength(observation?.popups),
			arrayLength(observation?.panels),
			arrayLength(observation?.treeCandidates),
			arrayLength(observation?.simplifiedDom),
			arrayLength(observation?.rawCandidates),
		].reduce((sum, count) => sum + count, 0)
	}

	function countRawCandidates(observation) {
		if (Array.isArray(observation?.rawCandidates)) return observation.rawCandidates.length
		return String(observation?.content || '').split('\n').filter(Boolean).length
	}

	function arrayLength(value) {
		return Array.isArray(value) ? value.length : 0
	}

	function appendModelTrace(session, payload) {
		if (!session || !Array.isArray(session.traceItems)) return
		const maxTrace = g.NC_BG_CONSTANTS?.MAX_TRACE_ITEMS || 80
		const modelThought = getDisplayModelThought(payload)
		session.traceItems.push({
			id: generateId('m'),
			title: payload.title,
			detail: payload.detail,
			kind: payload.ok ? 'model' : 'error',
			modelThought: modelThought || undefined,
			io: payload.io || undefined,
		})
		session.traceItems = session.traceItems.slice(-maxTrace)
	}

	function getDisplayModelThought(payload) {
		const response = payload?.io?.response || {}
		return String(
			payload?.modelThought ||
			response.displayThought ||
			response.thought ||
			response.reasoning ||
			response.reasoning_content ||
			''
		).trim()
	}

	g.NC_BG_PLANNER = {
		planAction,
		callOpenAI,
	}
	g.NC_BG_PLANNER_TESTS = {
		deriveFastPathDecision,
		derivePreModelWorkflowDecision,
		deriveTimeoutRecoveryWorkflowDecision,
		extractTargetUrl,
		buildWorkflowContextText,
		getAvailableActionNames,
		isTaskTargetLocation,
		hasRecentTargetUrlNavigation,
		isSameUrlFamily,
		recordWorkflowOutcome: plannerWorkflows.recordWorkflowOutcome,
		resolveDecisionWorkflowName: plannerWorkflows.resolveDecisionWorkflowName,
		shouldStartWithCompactObservation,
		isObservationTextTruncatedAtLimit,
		buildModelStreamProgressText,
		getDisplayModelThought,
		getModelRoundTimeoutMs,
		getPlanningContextConfig,
		getTaskIntentTimeoutMs,
		formatSeconds,
	}
})(globalThis)
