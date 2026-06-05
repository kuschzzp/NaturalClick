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
		derivePostModelWorkflowDecision,
		derivePostContextWorkflowDecision,
		derivePostValidationWorkflowDecision,
		deriveTimeoutRecoveryWorkflowDecision,
		recordPlanningContextDeferral,
	} = plannerWorkflows
	const MAX_PLANNING_ROUNDS = 4
	const MODEL_ROUND_TIMEOUT_MS = 60000
	const MIN_MODEL_ROUND_TIMEOUT_MS = 8000
	const MAX_MODEL_ROUND_TIMEOUT_MS = 180000
	const MODEL_WAIT_HEARTBEAT_INITIAL_MS = 2500
	const MODEL_WAIT_HEARTBEAT_INTERVAL_MS = 5000
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
		publishObservationSummaryProgress(session, options, observation, observationText, startCompactObservation, planningConfig)
		const toolLines = g.NC_BG_TOOLS?.getToolPromptLines?.() || []
		const availableActionNames = getAvailableActionNames()
		const endpoint = session.config.textLLM
		const preIntentWorkflowContextText = buildWorkflowContextText(session, observation)
		publishWorkflowAnalysisProgress(session, options, preIntentWorkflowContextText)
		const preIntentWorkflowDecision = derivePreIntentWorkflowDecision(session, observation, { tabsSummary })
		if (preIntentWorkflowDecision) {
			publishWorkflowDecisionProgress(session, options, preIntentWorkflowDecision)
			return preIntentWorkflowDecision
		}
		await ensureTaskIntent(session, observation, endpoint, options)
		const workflowDecision = derivePreModelWorkflowDecision(session, observation, { tabsSummary })
		if (workflowDecision) {
			publishWorkflowDecisionProgress(session, options, workflowDecision)
			return workflowDecision
		}
		const workflowContextText = buildWorkflowContextText(session, observation)
		if (workflowContextText !== preIntentWorkflowContextText) {
			publishWorkflowAnalysisProgress(session, options, workflowContextText)
		}
		const initialPlanningContext = buildInitialWorkflowPlanningContext(
			session,
			observation,
			workflowContextText,
			options
		)
		const initialWorkflowRecovery = typeof derivePostContextWorkflowDecision === 'function'
			? derivePostContextWorkflowDecision(session, workflowContextText, initialPlanningContext, { observation, tabsSummary })
			: null
		if (initialWorkflowRecovery) {
			publishWorkflowDecisionProgress(session, options, initialWorkflowRecovery)
			return initialWorkflowRecovery
		}

		const system = buildPlannerSystemPrompt()
		const compactSystem = buildCompactPlannerSystemPrompt()

		const modelRoundTimeoutMs = getModelRoundTimeoutMs(endpoint)
		const planningContext = initialPlanningContext
		const planningRequestSeen = seedPlanningRequestSeen(planningContext)
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
				const result = await callOpenAIWithPlanningHeartbeat(session, options, endpoint, messages, {
					returnMeta: true,
					timeoutMs: modelRoundTimeoutMs,
					stream: endpoint?.stream !== false,
					onStream: createModelStreamProgressPublisher(session, options, round + 1, modelRoundTimeoutMs),
				}, {
					round: round + 1,
					phase: initialCompactRound
						? '模型正在精简页面上下文中选择下一步动作'
						: '模型正在分析页面结构、任务目标和可执行动作',
					compact: useCompactObservation,
					contextCount: planningContext.length,
					checkpoint: '核对任务目标是否到达、列表/表格样本、真实下拉候选、可执行按钮和遮挡命中状态，避免随机搜索或盲点。',
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
						publishWorkflowDecisionProgress(session, options, timeoutRecovery)
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
					const retryResult = await callOpenAIWithPlanningHeartbeat(session, options, endpoint, [
						{ role: 'system', content: compactSystem },
						{ role: 'user', content: compactUser },
					], {
						returnMeta: true,
						timeoutMs: modelRoundTimeoutMs,
						stream: endpoint?.stream !== false,
						onStream: createModelStreamProgressPublisher(session, options, round + 1, modelRoundTimeoutMs),
					}, {
						round: round + 1,
						phase: '模型正在用压缩后的页面上下文重试规划',
						compact: true,
						contextCount: planningContext.length,
						checkpoint: '核对压缩上下文里的任务目标、列表/表格样本、真实候选和可执行目标，避免在信息不足时盲目操作。',
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
						publishWorkflowDecisionProgress(session, options, timeoutRecovery)
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
					if (!validationError) {
						const annotated = annotateDecisionWithPlanningContextDiagnostics(normalized, planningContext)
						const workflowRecovery = typeof derivePostModelWorkflowDecision === 'function'
							? derivePostModelWorkflowDecision(session, annotated, { observation, tabsSummary, planningContext })
							: null
						if (workflowRecovery) {
							publishWorkflowDecisionProgress(session, options, workflowRecovery)
							return workflowRecovery
						}
						return annotated
					}
					const workflowValidationRecovery = typeof derivePostValidationWorkflowDecision === 'function'
						? derivePostValidationWorkflowDecision(session, normalized.action, validationError, { observation, tabsSummary, planningContext })
						: null
					if (workflowValidationRecovery) {
						publishWorkflowDecisionProgress(session, options, workflowValidationRecovery)
						return workflowValidationRecovery
					}
					planningContext.push(buildInvalidActionInputContext(normalized.action, planningContext.length, validationError))
					notifyPlanningProgress(session, options, {
						stage: 'validation_feedback',
						round: round + 1,
						text: buildValidationFeedbackProgressText(session, normalized.action, validationError),
					})
					continue
				}
				planningContext.push(buildInvalidActionContext(normalized.action, planningContext.length, availableActionNames))
				continue
			}
			const requestSig = planningRequestSignature(normalized.action)
			const previousCount = planningRequestSeen.get(requestSig) || 0
			planningRequestSeen.set(requestSig, previousCount + 1)
			if (typeof recordPlanningContextDeferral === 'function') {
				recordPlanningContextDeferral(session, normalized, { observation, tabsSummary, planningContext })
			}
			notifyPlanningProgress(session, options, {
				stage: 'planning_context_request',
				round: round + 1,
				text: buildPlanningContextRequestProgressText(session, normalized.action, normalized, previousCount + 1),
			})
			const contextResult = previousCount > 0
				? buildDuplicatePlanningContext(normalized.action, planningContext.length, previousCount + 1)
				: resolvePlanningContextRequest(observation, normalized.action, planningContext.length)
			planningContext.push(contextResult)
			notifyPlanningProgress(session, options, {
				stage: 'planning_context',
				round: round + 1,
				text: buildPlanningContextProgressText(session, normalized.action, normalized, contextResult),
			})
			const postContextWorkflowRecovery = typeof derivePostContextWorkflowDecision === 'function'
				? derivePostContextWorkflowDecision(session, workflowContextText, planningContext, { observation, tabsSummary })
				: null
			if (postContextWorkflowRecovery) {
				publishWorkflowDecisionProgress(session, options, postContextWorkflowRecovery)
				return postContextWorkflowRecovery
			}
		}
		const limitDiagnostic = summarizePlanningContextLimitDiagnostic(planningContext)
		const limitText = limitDiagnostic
			? `内部上下文请求次数达到上限，任务暂停以避免循环。最近阻塞原因：${limitDiagnostic}`
			: '内部上下文请求次数达到上限，任务暂停以避免循环。'
		const limitDecision = {
			evaluation_previous_goal: lastDecision?.evaluation_previous_goal || '已多次请求上下文，但仍未形成可执行页面动作。',
			memory: lastDecision?.memory || '',
			thought: limitDiagnostic
				? `内部 ReAct 上下文请求次数达到上限：${limitDiagnostic}`
				: '内部 ReAct 上下文请求次数达到上限。',
			next_goal: '暂停并暴露阻塞原因',
			action: {
				name: 'done',
				input: {
					text: limitText,
					success: false,
					planning_context_limit: true,
					planning_context_diagnostic: limitDiagnostic,
				},
			},
		}
		const workflowRecovery = typeof derivePostModelWorkflowDecision === 'function'
			? derivePostModelWorkflowDecision(session, limitDecision, { observation, tabsSummary, planningContext })
			: null
		if (workflowRecovery) {
			publishWorkflowDecisionProgress(session, options, workflowRecovery)
			return workflowRecovery
		}
		return limitDecision
	}

	async function ensureTaskIntent(session, observation, endpoint, options = {}) {
		if (!shouldRequestTaskIntent(session)) return null
		if (shouldSkipTaskIntentForObservation(observation)) return null
		const heuristicIntent = storeHeuristicTaskIntentIfAvailable(session, '模型调用前', true, { requireTarget: true })
		if (heuristicIntent) {
			publishHeuristicTaskIntentProgress(session, options, heuristicIntent)
			return heuristicIntent
		}
		const localSurfaceIntent = storeHeuristicTaskIntentIfAvailable(session, '模型调用前', true, {
			requireLocalSurface: true,
			observation,
		})
		if (localSurfaceIntent) {
			publishHeuristicTaskIntentProgress(session, options, localSurfaceIntent)
			return localSurfaceIntent
		}
		const operationOnlyIntent = storeHeuristicTaskIntentIfAvailable(session, '模型调用前', true, {
			requireHighConfidenceOperation: true,
		})
		if (operationOnlyIntent) {
			publishHeuristicTaskIntentProgress(session, options, operationOnlyIntent)
			return operationOnlyIntent
		}
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
			const result = await callOpenAIWithPlanningHeartbeat(session, options, endpoint, messages, {
				returnMeta: true,
				timeoutMs,
				stream: false,
			}, {
				round: 1,
				phase: '模型正在解析用户任务意图',
				compact: false,
				contextCount: 0,
				checkpoint: '拆分导航目标、页面内动作、登录信息和明确字段值；不猜用户没给出的页面或菜单。',
			})
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
		if (options?.requireLocalSurface && !hasPageLocalOperationSurface(options.observation, intent)) return null
		if (options?.requireHighConfidenceOperation && !isHighConfidenceLocalOperationIntent(intent)) return null
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

	function isHighConfidenceLocalOperationIntent(intent) {
		const operation = String(intent?.operation || '').trim()
		const scope = String(intent?.operationScope || '').trim()
		const hasTarget = Array.isArray(intent?.navigationTargets) && intent.navigationTargets.length > 0
		if (hasTarget) return true
		return operation === 'search' && scope === 'all_matching_controls'
	}

	function hasPageLocalOperationSurface(observation, intent) {
		const operation = String(intent?.operation || '').trim()
		if (!operation || operation === 'unknown') return false
		if (hasDialogOrPopoverSurface(observation)) return true
		if (operation === 'search') return hasSearchOperationSurface(observation)
		if (['create', 'edit', 'fill_form', 'view_detail', 'view_first_record_detail'].includes(operation)) {
			return hasRecordOperationSurface(observation, operation)
		}
		return false
	}

	function hasDialogOrPopoverSurface(observation) {
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		if (forms.some((form) => {
			const formText = `${form?.name || ''} ${form?.id || ''} ${form?.region || ''}`
			if (/(弹层|对话框|dialog|modal|drawer|popover)/i.test(formText)) return true
			return (Array.isArray(form?.fields) ? form.fields : []).some((field) => /^(dialog|popover)$/i.test(String(field?.region || '')))
		})) return true
		return collectLocalActions(observation).some((item) => /^(dialog|popover)$/i.test(String(item?.region || '')))
	}

	function hasSearchOperationSurface(observation) {
		const panels = Array.isArray(observation?.panels) ? observation.panels : []
		if (panels.some((panel) => /(filter|search|搜索|查询|筛选|过滤)/i.test(`${panel?.kind || ''} ${panel?.label || ''} ${panel?.fields || ''}`))) {
			return true
		}
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		if (forms.some((form) => /(filter|search|搜索|查询|筛选|过滤)/i.test(`${form?.id || ''} ${form?.name || ''}`))) return true
		return collectLocalActions(observation).some((item) => /(搜索|查询|筛选|过滤|search|query|filter)/i.test(getObservedActionText(item)))
	}

	function hasRecordOperationSurface(observation, operation) {
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		if (forms.some((form) => (Array.isArray(form?.fields) ? form.fields : []).some(isLocalContentField))) return true
		const actionText = collectLocalActions(observation).map(getObservedActionText).join(' ')
		if (operation === 'create') return /(新增|新建|创建|添加|增加|add|create|new)/i.test(actionText)
		if (operation === 'edit') return /(编辑|修改|更新|edit|modify|update)/i.test(actionText)
		if (operation === 'view_detail' || operation === 'view_first_record_detail') return /(详情|查看|明细|预览|detail|view|preview)/i.test(actionText)
		return /(保存|提交|确定|确认|应用|save|submit|confirm|ok|apply)/i.test(actionText)
	}

	function isLocalContentField(field) {
		const region = String(field?.region || '').trim().toLowerCase()
		if (region && !['content', 'dialog', 'popover'].includes(region)) return false
		const role = String(field?.role || '').trim().toLowerCase()
		if (['button', 'link', 'menuitem', 'tab', 'option'].includes(role)) return false
		const label = String(field?.label || field?.placeholder || field?.text || '').trim()
		return !!label && !/^(请输入|请选择|搜索内容|展开选项)$/i.test(label)
	}

	function collectLocalActions(observation) {
		return [
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.elements) ? observation.elements : []),
		].filter((item) => {
			const region = String(item?.region || '').trim().toLowerCase()
			return !region || ['content', 'dialog', 'popover'].includes(region)
		})
	}

	function getObservedActionText(item) {
		return [
			item?.label,
			item?.text,
			item?.actionIntent,
			item?.intent,
			item?.ariaLabel,
			item?.title,
			item?.name,
		].filter(Boolean).join(' ')
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
		const scope = String(intent?.operationScope || 'unspecified')
		const authParts = []
		if (intent?.auth?.username) authParts.push('账号')
		if (intent?.auth?.password) authParts.push('密码')
		const targets = (Array.isArray(intent?.navigationTargets) ? intent.navigationTargets : [])
			.map((target) => target?.canonical || target?.raw || '')
			.filter(Boolean)
			.join('、')
		return `任务理解：operation=${operation}${scope && scope !== 'unspecified' ? `，scope=${scope}` : ''}${authParts.length ? `，auth=${authParts.join('+')}` : ''}${targets ? `，navigation=${targets}` : ''}`
	}

	function publishHeuristicTaskIntentProgress(session, options, intent) {
		notifyPlanningProgress(session, options, {
			stage: 'task_intent_heuristic',
			round: 1,
			text: `第 ${session.step} 步：本地已识别任务意图（${summarizeTaskIntent(intent)}），不等待任务理解模型。`,
		})
	}

	function publishWorkflowDecisionProgress(session, options, decision) {
		const text = buildWorkflowDecisionProgressText(session, decision)
		if (!text) return
		notifyPlanningProgress(session, options, {
			stage: 'workflow_decision',
			round: 1,
			text,
		})
	}

	function publishWorkflowAnalysisProgress(session, options, workflowContextText) {
		const text = buildWorkflowAnalysisProgressText(session, workflowContextText)
		if (!text) return
		notifyPlanningProgress(session, options, {
			stage: 'workflow_analysis',
			round: 1,
			text,
		})
	}

	function publishObservationSummaryProgress(session, options, observation, observationText, startCompactObservation, planningConfig) {
		const text = buildObservationSummaryProgressText(session, observation, observationText, startCompactObservation, planningConfig)
		if (!text) return
		notifyPlanningProgress(session, options, {
			stage: 'observation_summary',
			round: 0,
			text,
		})
	}

	function buildObservationSummaryProgressText(session, observation, observationText, startCompactObservation, planningConfig) {
		const summary = buildObservationProgressSummary(observation)
		const total = countObservationItems(observation)
		const rawCount = countRawCandidates(observation)
		const textChars = String(observationText || '').length
		const limits = getPlanningContextConfig({ planning: planningConfig })
		const compactReason = startCompactObservation
			? buildObservationCompactReason(total, rawCount, textChars, observationText, limits)
			: '未触发精简'
		return [
			`第 ${session?.step || 0} 步：页面观察完成`,
			`字段 ${summary.fields}`,
			`动作 ${summary.actions}`,
			`表格 ${summary.tables}`,
			`面板 ${summary.panels}`,
			`候选 ${summary.options + summary.popups}`,
			`raw ${rawCount}`,
			`上下文≈${textChars}字`,
			compactReason,
		].join('；') + '。'
	}

	function buildObservationProgressSummary(observation) {
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		const fields = forms.reduce((sum, form) => sum + arrayLength(form?.fields), 0)
		return {
			fields,
			actions: arrayLength(observation?.actions),
			tables: arrayLength(observation?.tables),
			panels: arrayLength(observation?.panels),
			options: arrayLength(observation?.options),
			popups: arrayLength(observation?.popups),
		}
	}

	function buildObservationCompactReason(total, rawCount, textChars, observationText, limits) {
		const reasons = []
		if (textChars >= limits.fullObservationMaxChars || isObservationTextTruncatedAtLimit(observationText, limits.fullObservationMaxChars)) {
			reasons.push(`文本达到 ${textChars}/${limits.fullObservationMaxChars}`)
		}
		if (total >= limits.compactElementThreshold) reasons.push(`元素达到 ${total}/${limits.compactElementThreshold}`)
		if (rawCount >= limits.compactRawCandidateThreshold) reasons.push(`raw达到 ${rawCount}/${limits.compactRawCandidateThreshold}`)
		return reasons.length ? `将使用精简观察（${reasons.join('，')}）` : '将使用精简观察'
	}

	function buildWorkflowAnalysisProgressText(session, workflowContextText) {
		const context = String(workflowContextText || '')
		const unresolvedTargets = getUnresolvedWorkflowTaskTargets(context)
		if (unresolvedTargets.length) {
			return buildUnresolvedTargetProgressText(session, unresolvedTargets)
		}
		const recordViewLine = (context.match(/^- record_view_requirement\b[^\n]*/m) || [])[0] || ''
		if (recordViewLine) {
			return buildRecordViewRequirementProgressText(session, recordViewLine)
		}
		const optionMismatchLine = (context.match(/^- search_option_requirement\b[^\n]*status="option_sample_mismatch"[^\n]*/m) || [])[0] || ''
		if (optionMismatchLine) {
			return buildOptionSampleMismatchProgressText(session, optionMismatchLine)
		}
		const optionUnobservedLine = (context.match(/^- search_option_requirement\b[^\n]*status="option_candidates_unobserved"[^\n]*/m) || [])[0] || ''
		if (optionUnobservedLine) {
			return buildOptionCandidatesUnobservedProgressText(session, optionUnobservedLine)
		}
		const collapsedPanelLine = (context.match(/^- search_panel\b[^\n]*state="collapsed"[^\n]*/m) || [])[0] || ''
		if (collapsedPanelLine) {
			return buildCollapsedSearchPanelProgressText(session, collapsedPanelLine)
		}
		const resetMissingLine = (context.match(/^- search_reset_requirement\b[^\n]*status="reset_action_missing"[^\n]*/m) || [])[0] || ''
		if (resetMissingLine) {
			return buildResetActionMissingProgressText(session, resetMissingLine)
		}
		const submitMissingLine = (context.match(/^- search_submit_requirement\b[^\n]*status="submit_action_missing"[^\n]*/m) || [])[0] || ''
		if (submitMissingLine) {
			return buildSubmitActionMissingProgressText(session, submitMissingLine)
		}
		const sampleLine = (context.match(/^- search_data_samples\b[^\n]*status="available"[^\n]*/m) || [])[0] || ''
		if (sampleLine) {
			return buildSearchSamplesAvailableProgressText(session, sampleLine, context)
		}
		const requirementLine = (context.match(/^- search_data_requirement\b[^\n]*/m) || [])[0] || ''
		if (!requirementLine) return ''
		const fields = extractAttr(requirementLine, 'fields')
			.split('|')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const fieldText = fields.length ? `：${fields.slice(0, 6).join('、')}` : ''
		const suffix = fields.length > 6 ? `等 ${fields.length} 个字段` : ''
		return `第 ${session?.step || 0} 步：搜索测试正在先分析列表数据，当前缺少可用列表样本${fieldText}${suffix}；将补充表格/页面上下文，不会随机填写泛化测试词。`
	}

	function buildOptionSampleMismatchProgressText(session, requirementLine) {
		const samples = extractAttr(requirementLine, 'samples')
			.split(';')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const candidates = extractAttr(requirementLine, 'visibleCandidates')
			.split(';')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const sampleText = samples.length ? `：${samples.slice(0, 4).join('、')}` : ''
		const candidateText = candidates.length ? `；可见候选=${candidates.slice(0, 3).join('、')}` : ''
		const suffix = samples.length > 4 ? `等 ${samples.length} 个字段` : ''
		return `第 ${session?.step || 0} 步：搜索测试正在核对列表样本与选择候选，当前候选不匹配${sampleText}${suffix}${candidateText}；将重新获取候选或请求选项上下文，不会选择非匹配候选。`
	}

	function buildRecordViewRequirementProgressText(session, requirementLine) {
		const status = cleanSearchProgressFragment(extractAttr(requirementLine, 'status'))
		if (status === 'detail_action_missing') {
			const rows = cleanSearchProgressFragment(extractAttr(requirementLine, 'tableRows'))
			const rowText = rows ? `，已看到 ${rows} 行列表数据` : ''
			return `第 ${session?.step || 0} 步：列表详情任务正在定位第一条记录入口${rowText}；当前没有稳定的第一行详情/查看按钮，将请求动作上下文或使用受限视觉定位，不会点击列表外按钮。`
		}
		return `第 ${session?.step || 0} 步：列表详情任务正在先确认第一条记录；当前缺少可见列表/表格行证据，将补充 tables/content 上下文，不会直接点击工具栏、页头或列表外的详情/查看按钮。`
	}

	function buildCollapsedSearchPanelProgressText(session, panelLine) {
		const label = cleanSearchProgressFragment(extractAttr(panelLine, 'triggerLabel') || extractAttr(panelLine, 'label') || '搜索/筛选区域')
		const index = cleanSearchProgressFragment(extractAttr(panelLine, 'triggerIndex'))
		const indexText = index ? `，触发 index=${index}` : ''
		return `第 ${session?.step || 0} 步：搜索测试已识别搜索/筛选区域处于折叠状态：${label}${indexText}；先展开后再分析字段和列表样本，不会直接随机测试。`
	}

	function buildSearchSamplesAvailableProgressText(session, sampleLine, context) {
		const samples = extractAttr(sampleLine, 'samples')
			.split(';')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const fields = extractAttr(sampleLine, 'fields')
			.split('|')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const fieldCount = Number(extractAttr((context.match(/^- search_fields\b[^\n]*/m) || [])[0] || '', 'count')) || fields.length
		const sampleText = samples.length ? `；样本=${samples.slice(0, 5).join('、')}` : ''
		const suffix = samples.length > 5 ? `等 ${samples.length} 个` : ''
		const countText = fieldCount > 0 ? `发现 ${fieldCount} 个搜索项` : '发现搜索项'
		return `第 ${session?.step || 0} 步：搜索测试已先分析列表数据，${countText}，并提取到真实字段样本${sampleText}${suffix}；将按字段逐项测试，提交后先清空条件再进入下一项。`
	}

	function buildOptionCandidatesUnobservedProgressText(session, requirementLine) {
		const fields = extractAttr(requirementLine, 'fields')
			.split('|')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const samples = extractAttr(requirementLine, 'samples')
			.split(';')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const taskValue = cleanSearchProgressFragment(extractAttr(requirementLine, 'taskValue'))
		const attempts = cleanSearchProgressFragment(extractAttr(requirementLine, 'attempts'))
		const fieldText = fields.length ? `：${fields.slice(0, 4).join('、')}` : ''
		const sampleText = samples.length ? `，列表样本=${samples.slice(0, 3).join('、')}` : ''
		const taskText = taskValue ? `，任务值=${taskValue}` : ''
		const attemptText = attempts ? `，已展开 ${attempts} 次` : ''
		return `第 ${session?.step || 0} 步：搜索测试已展开选择字段但未观测到候选${fieldText}${attemptText}${sampleText}${taskText}；将请求候选上下文或检查弹层区域，不会猜选项。`
	}

	function buildResetActionMissingProgressText(session, requirementLine) {
		const fields = extractAttr(requirementLine, 'fields')
			.split('|')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const context = cleanSearchProgressFragment(extractAttr(requirementLine, 'context'))
		const contextLabel = {
			baseline: '恢复列表基线',
			after_submit: '提交后进入下一项前',
			clear_retry: '清空复核',
		}[context] || '继续测试前'
		const fieldText = fields.length ? `：${fields.slice(0, 5).join('、')}` : ''
		const suffix = fields.length > 5 ? `等 ${fields.length} 个字段` : ''
		const status = cleanSearchProgressFragment(extractAttr(requirementLine, 'status'))
		if (status === 'field_clear_fallback_available') {
			const clearable = extractAttr(requirementLine, 'clearableFields')
				.split('|')
				.map(cleanSearchProgressFragment)
				.filter(Boolean)
			const clearableText = clearable.length ? `：${clearable.slice(0, 5).join('、')}` : fieldText
			return `第 ${session?.step || 0} 步：搜索测试未观测到重置/清空按钮${fieldText}${suffix}（${contextLabel}）；将先用普通文本字段置空兜底${clearableText}，选择类字段不会猜测清空。`
		}
		return `第 ${session?.step || 0} 步：搜索测试需要清空条件但未观测到重置/清空按钮${fieldText}${suffix}（${contextLabel}）；将请求 actions 或检查搜索区域上下文，不会带残留条件继续测试。`
	}

	function buildSubmitActionMissingProgressText(session, requirementLine) {
		const fields = extractAttr(requirementLine, 'fields')
			.split('|')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const testValue = cleanSearchProgressFragment(extractAttr(requirementLine, 'testValue'))
		const fieldText = fields.length ? `：${fields.slice(0, 4).join('、')}` : ''
		const valueText = testValue ? `，测试值=${testValue}` : ''
		return `第 ${session?.step || 0} 步：搜索字段已设置但未观测到搜索/查询按钮${fieldText}${valueText}；将请求 actions 或检查搜索区域上下文，不会跳过提交验证或直接进入下一项。`
	}

	function buildUnresolvedTargetProgressText(session, targets) {
		const labels = (Array.isArray(targets) ? targets : [])
			.map(cleanSearchProgressFragment)
			.filter(Boolean)
		const labelText = labels.length ? `：${labels.slice(0, 4).join('、')}` : ''
		const suffix = labels.length > 4 ? `等 ${labels.length} 个目标` : ''
		return `第 ${session?.step || 0} 步：正在先定位任务目标模块${labelText}${suffix}；目标未到达前不会测试当前页面的通用搜索/筛选区。`
	}

	function getUnresolvedWorkflowTaskTargets(workflowContextText) {
		const targets = []
		for (const match of String(workflowContextText || '').matchAll(/^- task_target\b[^\n]*status="unresolved"[^\n]*/gm)) {
			const key = extractAttr(match[0], 'key')
			if (key) targets.push(key)
		}
		return targets
	}

	function buildWorkflowDecisionProgressText(session, decision) {
		const action = decision?.action || {}
		const input = action?.input || {}
		const workflow = String(input.workflow || input.workflow_step || '').trim()
		const name = String(action.name || '').trim()
		if (!workflow && !name) return ''
			const searchProgressText = buildSearchWorkflowProgressText(session, decision, input)
			if (searchProgressText) return searchProgressText
			const navigationProgressText = buildNavigationWorkflowProgressText(session, decision, input)
			if (navigationProgressText) return navigationProgressText
			const fieldTestProgressText = buildFieldTestWorkflowProgressText(session, decision, input)
			if (fieldTestProgressText) return fieldTestProgressText
			const target = [
				input.target_label,
			input.workflow_field_label,
			input.workflow_nav_key,
			input.text,
		].map((value) => String(value || '').trim()).find(Boolean)
		const index = Number(input.index)
		const indexText = Number.isFinite(index) ? `index=${index}` : ''
		const nextGoal = String(decision?.next_goal || '').trim()
		const details = [
			workflow ? `workflow=${workflow}` : '',
			name ? `action=${name}` : '',
			target ? `target=${target}` : '',
			indexText,
		].filter(Boolean).join('，')
		const summary = nextGoal || '执行本地确定性动作'
			return `第 ${session.step} 步：本地 workflow 接管：${summary}${details ? `（${details}）` : ''}。`
		}

		function buildFieldTestWorkflowProgressText(session, decision, input) {
			const workflowStep = String(input?.workflow_step || '').trim()
			if (!['test_input_field', 'finish_field_test'].includes(workflowStep)) return ''
			const label = cleanSearchProgressFragment(input.workflow_field_label || input.target_label || '')
			const order = Number(input.workflow_field_order)
			const total = Number(input.workflow_field_total)
			const ordinal = Number.isFinite(order) && Number.isFinite(total) && total > 0
				? `第 ${Math.min(order, total)}/${total} 个`
				: '当前'
			if (workflowStep === 'finish_field_test') {
				const success = input.success === false ? '发现异常' : '已完成'
				const failed = Number(input.workflow_failed_count)
				const failedText = Number.isFinite(failed) && failed > 0 ? `，失败 ${failed} 项` : ''
				const totalText = Number.isFinite(total) ? `，共 ${total} 项` : ''
				return `第 ${session?.step || 0} 步：页面输入框测试${success}${totalText}${failedText}，正在生成结果总结。`
			}
			const index = Number(input.index)
			const indexText = Number.isFinite(index) ? `，index=${index}` : ''
			const type = cleanSearchProgressFragment(input.workflow_field_type || '')
			const typeText = type ? `，类型=${type}` : ''
			return `第 ${session?.step || 0} 步：正在测试页面输入框${ordinal}${label ? `：填写「${label}」` : ''}${indexText}${typeText}。`
		}

		function buildNavigationWorkflowProgressText(session, decision, input) {
		const workflowStep = String(input?.workflow_step || '').trim()
		if (!['navigate_to_task_target', 'reveal_navigation_options', 'request_missing_target_url'].includes(workflowStep)) return ''
		const actionName = String(decision?.action?.name || '').trim()
		const navKey = cleanSearchProgressFragment(input.workflow_nav_key || input.workflow_nav_alias || '')
		const target = cleanSearchProgressFragment(input.target_label || input.label || input.workflow_nav_alias || '')
		const parent = cleanSearchProgressFragment(input.parent_label || '')
		const region = cleanSearchProgressFragment(input.target_region || input.region || '')
		const index = Number(input.index)
		const indexText = Number.isFinite(index) ? `，index=${index}` : ''
		const regionText = region ? `，region=${region}` : ''
		if (workflowStep === 'request_missing_target_url') {
			const label = navKey || target || '目标页面'
			return `第 ${session?.step || 0} 步：任务导航无法确认当前应用网址，目标=${label}；先向用户确认入口地址，不会在通用起始页盲目点击菜单或测试页面内功能。`
		}
		if (workflowStep === 'reveal_navigation_options') {
			const label = target || '导航容器'
			const targetText = navKey ? `，目标=${navKey}` : ''
			return `第 ${session?.step || 0} 步：任务导航尚未看到目标入口${targetText}；先展开候选导航容器「${label}」${indexText}${regionText}，重新观察后再选择具体页面。`
		}
		if (actionName === 'locate_by_vision') {
			const label = target || navKey || '目标子菜单'
			const parentText = parent ? `，父级=${parent}` : ''
			const targetText = navKey && navKey !== label ? `，目标=${navKey}` : ''
			return `第 ${session?.step || 0} 步：任务导航将用视觉定位具体子菜单「${label}」${targetText}${parentText}${regionText}；用于处理父子菜单合并或 DOM 索引不稳定，目标未到达前不执行页面内搜索/表单动作。`
		}
		const label = target || navKey || '目标入口'
		const targetText = navKey && navKey !== label ? `，目标=${navKey}` : ''
		return `第 ${session?.step || 0} 步：任务导航先进入目标页面/模块：候选「${label}」${targetText}${indexText}${regionText}；到达目标前不会测试当前页面的通用搜索/表单区域。`
	}

	function buildSearchWorkflowProgressText(session, decision, input) {
		const workflowStep = String(input?.workflow_step || '').trim()
		if (!isSearchWorkflowStep(workflowStep)) return ''
		const state = session?.workflowState?.search || {}
		const completed = countSearchWorkflowCoveredFields(state)
		const total = Array.isArray(state.fieldOrder) ? state.fieldOrder.length : 0
		const ordinal = total > 0 ? `第 ${Math.min(total, completed + 1)}/${total} 个搜索项` : '当前搜索项'
		const label = cleanSearchProgressFragment(input.workflow_field_label || input.target_label || '')
		const value = cleanSearchProgressFragment(input.workflow_test_value || input.text || input.label || '')
		const source = formatSearchProgressValueSource(input.workflow_value_source)
		const basis = cleanSearchProgressFragment(input.workflow_value_basis || '')
		const details = [
			value ? `值=${value}` : '',
			source ? `来源=${source}` : '',
			basis ? `依据=${basis}` : '',
			input.workflow_result_status ? `结果=${input.workflow_result_status}` : '',
		].filter(Boolean)
		let phrase = ''
		if (workflowStep === 'expand_search_panel') {
			phrase = `正在展开搜索/筛选区域${label ? `：${label}` : ''}`
		} else if (workflowStep === 'open_dropdown') {
			phrase = `正在测试${ordinal}${label ? `：展开「${label}」读取真实候选` : '：展开选择字段读取真实候选'}`
		} else if (workflowStep === 'select_option') {
			phrase = `正在测试${ordinal}${label ? `：选择「${label}」候选` : '：选择真实候选'}`
		} else if (workflowStep === 'fill_field') {
			phrase = `正在测试${ordinal}${label ? `：填写「${label}」` : '：填写字段'}`
		} else if (workflowStep === 'submit_search') {
			phrase = `正在提交${ordinal}${label ? `：验证「${label}」` : '：验证当前字段'}`
		} else if (workflowStep === 'reset_filters' && input.workflow_baseline_reset) {
			phrase = '正在清空已有搜索条件，恢复列表基线'
		} else if (workflowStep === 'reset_filters' && input.workflow_clear_retry) {
			phrase = `清空复核未通过，正在重试${label ? `：${label}` : ''}`
		} else if (workflowStep === 'reset_filters') {
			phrase = `正在清空${ordinal}${label ? `：${label}` : '：当前搜索条件'}，准备测试下一项`
		} else if (workflowStep === 'clear_field' && input.workflow_clear_context === 'baseline') {
			phrase = `未找到清空按钮，正在用字段级置空恢复列表基线${label ? `：${label}` : ''}`
		} else if (workflowStep === 'clear_field' && input.workflow_clear_retry) {
			phrase = `清空复核未通过，正在字段级置空重试${label ? `：${label}` : ''}`
		} else if (workflowStep === 'clear_field') {
			phrase = `未找到清空按钮，正在清空${ordinal}${label ? `：${label}` : '：当前文本字段'}`
		} else if (workflowStep === 'skip_field') {
			phrase = `安全跳过${ordinal}${label ? `：${label}` : '：当前搜索字段'}，继续测试下一项`
		} else if (workflowStep === 'finish_search_fields') {
			phrase = input.success === false ? '搜索项测试已停止并给出原因' : '搜索项测试已完成'
		}
		if (!phrase) return ''
		const suffix = details.length ? `（${details.join('，')}）` : ''
		return `第 ${session?.step || 0} 步：${phrase}${suffix}。`
	}

	function isSearchWorkflowStep(workflowStep) {
		return [
			'expand_search_panel',
			'open_dropdown',
			'select_option',
			'fill_field',
			'submit_search',
			'reset_filters',
			'clear_field',
			'skip_field',
			'finish_search_fields',
		].includes(String(workflowStep || '').trim())
	}

	function countSearchWorkflowCoveredFields(state) {
		const seen = new Set()
		for (const key of (Array.isArray(state?.completedKeys) ? state.completedKeys : [])) {
			if (key) seen.add(key)
		}
		for (const key of (Array.isArray(state?.skippedKeys) ? state.skippedKeys : [])) {
			if (key) seen.add(key)
		}
		return seen.size
	}

	function formatSearchProgressValueSource(source) {
		const key = String(source || '').trim()
		const labels = {
			table_sample: '列表样本',
			task_value: '任务文本',
			visible_option: '真实候选',
			option_candidate: '真实候选',
			missing_sample: '缺少样本',
		}
		return labels[key] || key
	}

	function cleanSearchProgressFragment(value) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		if (!text) return ''
		return text
			.replace(/[。；;，,.\s]+$/g, '')
			.slice(0, 96)
	}

	function buildPlanningContextProgressText(session, action, decision = {}, contextResult = null) {
		return buildPlanningContextProgressTextWithActor(session, action, decision, contextResult, '模型')
	}

	function buildPlanningContextProgressTextWithActor(session, action, decision = {}, contextResult = null, actor = '模型') {
		const name = String(action?.name || '').trim() || 'request_context'
		const input = action?.input || {}
		const detail = formatPlanningContextRequestDetail(name, input)
		const purpose = buildPlanningContextPurposeText(decision)
		const result = buildPlanningContextResultText(contextResult)
		const followup = buildPlanningContextFollowupText(contextResult)
		return `第 ${session.step} 步：${actor}请求内部上下文 ${name}${detail ? `（${detail}）` : ''}${purpose ? `；目的=${purpose}` : ''}，${result}${followup ? `；${followup}` : ''}...`
	}

	function buildPlanningContextRequestProgressText(session, action, decision = {}, attempt = 1) {
		return buildPlanningContextRequestProgressTextWithActor(session, action, decision, attempt, '模型')
	}

	function buildPlanningContextRequestProgressTextWithActor(session, action, decision = {}, attempt = 1, actor = '模型') {
		const name = String(action?.name || '').trim() || 'request_context'
		const input = action?.input || {}
		const detail = formatPlanningContextRequestDetail(name, input)
		const purpose = buildPlanningContextPurposeText(decision)
		const target = formatPlanningContextLookupTarget(name, input)
		const repeat = Number(attempt) > 1 ? `；第 ${Number(attempt)} 次相同请求，将检查是否重复` : ''
		return `第 ${session.step} 步：${actor}准备请求内部上下文 ${name}${detail ? `（${detail}）` : ''}${purpose ? `；目的=${purpose}` : ''}${target ? `；正在查找${target}` : '；正在查找当前观察里的相关页面证据'}${repeat}，页面保持原状态；这一步只补充上下文，不操作页面。`
	}

	function buildInitialWorkflowPlanningContext(session, observation, workflowContextText, options = {}) {
		const actions = buildInitialWorkflowPlanningActions(workflowContextText)
		const contexts = []
		for (const action of actions) {
			const decision = {
				next_goal: String(action?.reason || '').trim(),
			}
			notifyPlanningProgress(session, options, {
				stage: 'planning_context_request',
				round: 0,
				text: buildPlanningContextRequestProgressTextWithActor(
					session,
					action,
					decision,
					1,
					'本地预检'
				),
			})
			const contextResult = resolvePlanningContextRequest(observation, action, contexts.length)
			contexts.push(contextResult)
			notifyPlanningProgress(session, options, {
				stage: 'planning_context',
				round: 0,
				text: buildPlanningContextProgressTextWithActor(
					session,
					action,
					decision,
					contextResult,
					'本地预检'
				),
			})
		}
		return contexts
	}

	function buildInitialWorkflowPlanningActions(workflowContextText) {
		const context = String(workflowContextText || '')
		const actions = []
		const missingSamples = (context.match(/^- search_data_requirement\b[^\n]*status="missing_table_samples"[^\n]*/m) || [])[0] || ''
		if (missingSamples) {
			actions.push({
				name: 'request_context',
				input: {
					source: 'tables',
					limit: 10,
				},
				reason: '搜索测试缺少列表样本，本地先补表格/列表上下文。',
			})
		}
		const optionRequirementLines = context.match(/^- search_option_requirement\b[^\n]*status="(?:option_sample_mismatch|option_candidates_unobserved)"[^\n]*/gm) || []
		for (const line of optionRequirementLines) {
			const action = buildInitialOptionPlanningAction(line, context)
			if (action) actions.push(action)
		}
		const submitRequirementLines = context.match(/^- search_submit_requirement\b[^\n]*status="submit_action_missing"[^\n]*/gm) || []
		for (const line of submitRequirementLines) {
			const action = buildInitialSearchActionPlanningAction(line, 'submit')
			if (action) actions.push(action)
		}
		const resetRequirementLines = context.match(/^- search_reset_requirement\b[^\n]*status="reset_action_missing"[^\n]*/gm) || []
		for (const line of resetRequirementLines) {
			const action = buildInitialSearchActionPlanningAction(line, 'reset')
			if (action) actions.push(action)
		}
		return actions
	}

	function buildInitialSearchActionPlanningAction(requirementLine, kind) {
		const label = extractAttr(requirementLine, 'fields')
			.split('|')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)[0] || ''
		const context = cleanSearchProgressFragment(extractAttr(requirementLine, 'context'))
		const isReset = kind === 'reset'
		const query = isReset
			? '重置 清空 清除 清理 取消筛选 reset clear clear filters'
			: '搜索 查询 筛选 过滤 应用 search query filter apply submit'
		const reason = isReset
			? `搜索测试需要清空 ${label || '当前字段'} 但缺少重置/清空按钮，本地先补可点击动作上下文。`
			: `搜索字段 ${label || '当前字段'} 已设置但缺少提交按钮，本地先补可点击动作上下文。`
		return {
			name: 'request_context',
			input: {
				source: 'actions',
				region: 'content',
				query,
				limit: 20,
			},
			reason: context ? `${reason} 场景=${context}。` : reason,
		}
	}

	function buildInitialOptionPlanningAction(requirementLine, workflowContextText) {
		const label = extractAttr(requirementLine, 'fields')
			.split('|')
			.map(cleanSearchProgressFragment)
			.filter(Boolean)[0] || ''
		const activeIndex = extractAttr(requirementLine, 'activeIndex') ||
			findSearchFieldIndexFromWorkflowContext(workflowContextText, label)
		const index = Number(activeIndex)
		if (!Number.isFinite(index)) return null
		const status = extractAttr(requirementLine, 'status')
		const reason = status === 'option_sample_mismatch'
			? `搜索测试发现 ${label || `index:${index}`} 的列表样本与候选不匹配，本地先补该字段候选上下文。`
			: `搜索测试没有观测到 ${label || `index:${index}`} 的真实候选，本地先补该字段候选上下文。`
		return {
			name: 'request_options_for',
			input: {
				index,
				...(label ? { label } : {}),
				limit: 20,
			},
			reason,
		}
	}

	function findSearchFieldIndexFromWorkflowContext(workflowContextText, label) {
		const target = normalizePlanningLookupText(label)
		if (!target) return ''
		const searchFieldsLine = (String(workflowContextText || '').match(/^- search_fields\b[^\n]*/m) || [])[0] || ''
		const items = extractAttr(searchFieldsLine, 'items')
			.split(';')
			.map((item) => item.trim())
			.filter(Boolean)
		for (const item of items) {
			const match = item.match(/^(.*?)\[index=([^,\]]+)/)
			if (!match) continue
			if (normalizePlanningLookupText(match[1]) === target) return match[2]
		}
		return ''
	}

	function normalizePlanningLookupText(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
	}

	function seedPlanningRequestSeen(planningContext) {
		const seen = new Map()
		for (const context of (Array.isArray(planningContext) ? planningContext : [])) {
			const name = String(context?.name || '').trim()
			if (!name) continue
			const sig = planningRequestSignature({ name, input: context?.input || {} })
			seen.set(sig, (seen.get(sig) || 0) + 1)
		}
		return seen
	}

	function formatPlanningContextLookupTarget(name, input) {
		const safeInput = input && typeof input === 'object' ? input : {}
		if (name === 'request_context') {
			const source = String(safeInput.source || '').trim()
			const region = String(safeInput.region || '').trim()
			const query = String(safeInput.query || '').trim()
			const sourceLabels = {
				tables: '表格/列表摘要',
				forms: '表单字段',
				actions: '可点击动作',
				options: '候选项',
				popups: '弹层候选',
				raw_candidates: '原始候选',
				simplified_dom: '精简 DOM',
			}
			const parts = [sourceLabels[source] || source, region ? `${region} 区域` : '', query ? `匹配 "${query}"` : ''].filter(Boolean)
			return parts.join('，')
		}
		if (name === 'inspect_index') {
			const index = String(safeInput.index ?? '').trim()
			return index ? `index=${index} 的详细状态` : '指定元素详情'
		}
		if (name === 'inspect_region') {
			const region = String(safeInput.region || '').trim()
			const query = String(safeInput.query || '').trim()
			return [region ? `${region} 区域` : '页面区域', query ? `匹配 "${query}"` : '关键元素'].filter(Boolean).join('，')
		}
		if (name === 'request_options_for') {
			const label = String(safeInput.label || '').trim()
			const index = String(safeInput.index ?? '').trim()
			return `${label || (index ? `index=${index}` : '目标字段')} 的真实可见候选`
		}
		return ''
	}

	function buildPlanningContextResultText(contextResult) {
		const text = String(contextResult?.text || '')
		if (/duplicate_request="true"/.test(text)) {
			const guidance = extractAttr(text, 'guidance')
			return `重复请求已拦截${guidance ? `，建议=${cleanSearchProgressFragment(guidance)}` : '，已提示模型换请求或执行真实动作'}`
		}
		if (/empty_context\b/.test(text)) {
			const reason = extractAttr(text, 'reason')
			const guidance = extractAttr(text, 'guidance')
			const parts = [
				reason ? `reason=${reason}` : '',
				guidance ? `建议=${cleanSearchProgressFragment(guidance)}` : '',
			].filter(Boolean)
			return `没有找到匹配上下文${parts.length ? `（${parts.join('，')}）` : ''}，已提示模型换请求`
		}
		return '已补充后继续规划'
	}

	function buildPlanningContextFollowupText(contextResult) {
		const text = String(contextResult?.text || '')
		if (/duplicate_request="true"/.test(text)) return '下一步应换证据、执行已确认页面动作，或结束并说明原因'
		if (/empty_context\b/.test(text)) return '下一步应按建议换证据，或在确实缺少证据时结束并说明原因'
		return '下一轮会基于新证据继续规划可校验动作'
	}

	function buildValidationFeedbackProgressText(session, action, reason) {
		const name = String(action?.name || '').trim() || 'unknown_action'
		const input = action?.input || {}
		const index = input.index === undefined || input.index === null || input.index === ''
			? ''
			: ` index=${input.index}`
		const target = String(input.target_label || input.workflow_field_label || input.label || '').trim()
		const targetText = target ? ` target=${target}` : ''
		return `第 ${session?.step || 0} 步：执行前校验拦截 ${name}${index}${targetText}；原因=${cleanSearchProgressFragment(reason)}。已把原因补给模型，下一轮会改选工具、目标或请求更多上下文。`
	}

	function buildPlanningContextPurposeText(decision) {
		const candidates = [
			decision?.next_goal,
			decision?.thought,
			decision?.evaluation_previous_goal,
			decision?.memory,
		]
		for (const value of candidates) {
			const text = cleanSearchProgressFragment(value)
			if (text) return text
		}
		return ''
	}

	function formatPlanningContextRequestDetail(name, input) {
		const safeInput = input && typeof input === 'object' ? input : {}
		const detailParts = []
		if (name === 'request_context') {
			for (const key of ['source', 'region', 'query', 'cursor', 'limit']) {
				appendPlanningContextDetail(detailParts, key, safeInput[key])
			}
		} else if (name === 'inspect_index') {
			appendPlanningContextDetail(detailParts, 'index', safeInput.index)
		} else if (name === 'inspect_region') {
			for (const key of ['region', 'query', 'limit']) {
				appendPlanningContextDetail(detailParts, key, safeInput[key])
			}
		} else if (name === 'request_options_for') {
			for (const key of ['index', 'label', 'limit']) {
				appendPlanningContextDetail(detailParts, key, safeInput[key])
			}
		}
		return detailParts.join('，')
	}

	function appendPlanningContextDetail(parts, key, value) {
		const text = String(value ?? '').trim()
		if (!text) return
		parts.push(`${key}=${text}`)
	}

	function annotateDecisionWithPlanningContextDiagnostics(decision, planningContext) {
		if (!isFailureDoneDecision(decision)) return decision
		const diagnostic = getLatestEmptyPlanningContextDiagnostic(planningContext)
		if (!diagnostic) return decision
		const input = decision.action?.input || {}
		const text = String(input.text || '').trim()
		const suffix = `最近补充上下文为空：${diagnostic}`
		if (text.includes(diagnostic) || text.includes('最近补充上下文为空')) return decision
		return {
			...decision,
			action: {
				...decision.action,
				input: {
					...input,
					text: `${text || '任务无法继续。'} ${suffix}`,
					planning_context_diagnostic: diagnostic,
				},
			},
		}
	}

	function isFailureDoneDecision(decision) {
		return String(decision?.action?.name || '') === 'done' &&
			decision.action?.input?.success === false
	}

	function getLatestEmptyPlanningContextDiagnostic(planningContext) {
		const contexts = Array.isArray(planningContext) ? planningContext : []
		for (let i = contexts.length - 1; i >= 0; i--) {
			const text = String(contexts[i]?.text || '')
			if (!text.includes('empty_context')) continue
			const reason = extractAttr(text, 'reason')
			const guidance = extractAttr(text, 'guidance')
			const parts = [
				reason ? `reason=${reason}` : '',
				guidance || '',
			].filter(Boolean)
			if (parts.length) return parts.join('；')
		}
		return ''
	}

	function summarizePlanningContextLimitDiagnostic(planningContext) {
		const contexts = Array.isArray(planningContext) ? planningContext : []
		for (let i = contexts.length - 1; i >= 0; i--) {
			const text = String(contexts[i]?.text || '')
			if (!text.trim()) continue
			const invalidInput = extractContextLine(text, /^工具\s+.+参数无法执行：/)
			if (invalidInput) return cleanSearchProgressFragment(invalidInput)
			const invalidAction = extractContextLine(text, /^模型输出了不可用工具：/)
			if (invalidAction) return cleanSearchProgressFragment(invalidAction)
			const duplicateGuidance = extractAttr(text, 'guidance')
			if (/duplicate_request="true"/.test(text) && duplicateGuidance) {
				return cleanSearchProgressFragment(`重复上下文请求：${duplicateGuidance}`)
			}
			if (/empty_context\b/.test(text)) {
				const emptyDiagnostic = getLatestEmptyPlanningContextDiagnostic(contexts.slice(0, i + 1))
				if (emptyDiagnostic) return cleanSearchProgressFragment(emptyDiagnostic)
			}
			const fallback = extractContextLine(text, /^下一步建议：/)
			if (fallback) return cleanSearchProgressFragment(fallback)
		}
		return ''
	}

	function extractContextLine(text, pattern) {
		const lines = String(text || '')
			.split('\n')
			.map((line) => line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
			.filter(Boolean)
		return lines.find((line) => pattern.test(line)) || ''
	}

	function extractAttr(text, name) {
		const pattern = new RegExp(`${name}="([^"]*)"`)
		const match = String(text || '').match(pattern)
		return unescapeAttr(match?.[1] || '')
	}

	function unescapeAttr(value) {
		return String(value || '')
			.replace(/&quot;/g, '"')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
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

	async function callOpenAIWithPlanningHeartbeat(session, progressOptions, endpoint, messages, callOptions = {}, heartbeat = {}) {
		if (typeof progressOptions?.onProgress !== 'function') {
			return await callOpenAI(endpoint, messages, callOptions)
		}
		const timeoutMs = Number(callOptions.timeoutMs || endpoint?.timeoutMs || MODEL_ROUND_TIMEOUT_MS)
		const startedAt = Date.now()
		let finished = false
		let lastStreamAt = 0
		let timer = null
		const publishHeartbeat = () => {
			if (finished) return
			notifyPlanningProgress(session, progressOptions, {
				stage: 'model_wait_heartbeat',
				round: Number(heartbeat.round) || 1,
				text: buildModelWaitHeartbeatText(session, {
					...heartbeat,
					timeoutMs,
					elapsedMs: Date.now() - startedAt,
					streamSeen: lastStreamAt > 0,
					sinceStreamMs: lastStreamAt > 0 ? Date.now() - lastStreamAt : 0,
				}),
			})
		}
		const scheduleHeartbeat = (delay) => {
			timer = setTimeout(() => {
				publishHeartbeat()
				if (!finished) scheduleHeartbeat(MODEL_WAIT_HEARTBEAT_INTERVAL_MS)
			}, Math.max(1000, Number(delay) || MODEL_WAIT_HEARTBEAT_INTERVAL_MS))
		}
		scheduleHeartbeat(getModelWaitHeartbeatInitialDelay(timeoutMs))
		const wrappedOptions = {
			...callOptions,
			onStream: (event) => {
				lastStreamAt = Date.now()
				if (typeof callOptions.onStream === 'function') callOptions.onStream(event)
			},
		}
		try {
			return await callOpenAI(endpoint, messages, wrappedOptions)
		} finally {
			finished = true
			if (timer) clearTimeout(timer)
		}
	}

	function getModelWaitHeartbeatInitialDelay(timeoutMs) {
		const timeout = Math.max(5000, Number(timeoutMs) || MODEL_ROUND_TIMEOUT_MS)
		return Math.min(MODEL_WAIT_HEARTBEAT_INITIAL_MS, Math.max(1800, Math.floor(timeout / 4)))
	}

	function buildModelWaitHeartbeatText(session, status = {}) {
		const timeoutMs = Math.max(1000, Number(status.timeoutMs) || MODEL_ROUND_TIMEOUT_MS)
		const elapsedMs = Math.max(0, Number(status.elapsedMs) || 0)
		const elapsed = formatSeconds(elapsedMs)
		const timeout = formatSeconds(timeoutMs)
		const phase = String(status.phase || '模型正在规划下一步动作').trim()
		const contextCount = Number(status.contextCount) || 0
		const details = [
			`已等待 ${elapsed}/${timeout} 秒`,
			status.compact ? '使用精简观察' : '',
			contextCount > 0 ? `已补充 ${contextCount} 段内部上下文` : '',
			status.streamSeen
				? `距离上次流式片段 ${formatSeconds(status.sinceStreamMs)} 秒`
				: '尚未收到流式片段',
		].filter(Boolean)
		const checkpoint = [
			cleanSearchProgressFragment(
				status.checkpoint ||
					'核对任务目标、页面结构、列表样本、真实候选、可执行目标和遮挡状态，避免随机搜索或盲点。'
			),
			buildWorkflowHeartbeatCheckpoint(session),
		].filter(Boolean).join('；')
		return `第 ${session?.step || 0} 步：${phase}（${details.join('，')}）；安全检查：${checkpoint}；页面动作尚未执行，仍在等待模型给出可执行 JSON...`
	}

	function buildWorkflowHeartbeatCheckpoint(session) {
		const search = session?.workflowState?.search
		if (!search || typeof search !== 'object' || !Array.isArray(search.fieldOrder) || !search.fieldOrder.length) return ''
		const total = search.fieldOrder.length
		const completed = countSearchWorkflowCoveredFields(search)
		const key = String(search.activeFieldKey || search.lastSearchedFieldKey || search.terminalFieldKey || search.fieldOrder[Math.min(total - 1, completed)] || '').trim()
		const field = search.fields?.[key] || {}
		const label = cleanSearchProgressFragment(field.label || key || '当前字段')
		const phase = formatSearchWorkflowHeartbeatPhase(search.phase)
		const ordinal = `第 ${Math.min(total, completed + 1)}/${total} 个搜索项`
		const value = cleanSearchProgressFragment(field.lastTestValue || '')
		const source = formatSearchProgressValueSource(field.lastValueSource)
		const details = [
			`当前搜索工作流：${ordinal}`,
			label ? `字段=${label}` : '',
			phase ? `阶段=${phase}` : '',
			value ? `值=${value}` : '',
			source ? `来源=${source}` : '',
		].filter(Boolean)
		if (!details.length) return ''
		return `${details.join('，')}；逐项测试，提交后复核并清空，不猜选项。`
	}

	function formatSearchWorkflowHeartbeatPhase(phase) {
		const labels = {
			select_field: '选择下一个字段',
			awaiting_option: '等待/确认真实候选',
			awaiting_submit: '等待提交搜索',
			awaiting_reset: '等待清空条件',
			completed: '已完成',
			failed: '已停止',
		}
		const key = String(phase || '').trim()
		return labels[key] || key
	}

	function buildModelStreamProgressText(session, event, timeoutMs) {
		const content = String(event?.content || '')
		const reasoning = String(event?.reasoning || '')
		const actionReady = /"action"\s*:\s*\{/.test(content) || /"name"\s*:\s*"[^"]+"/.test(content)
		const phase = actionReady
			? '已开始输出可执行动作'
			: (reasoning && !content ? '仍在推理，尚未输出可执行动作' : '正在组织动作 JSON')
		const previewSource = reasoning && !actionReady ? reasoning : content || reasoning
		const preview = shortStreamPreview(previewSource)
		const parts = [
			`第 ${session.step} 步：模型正在流式响应（${phase}）`,
			`正文 ${content.length} 字`,
			reasoning ? `推理 ${reasoning.length} 字` : '',
			`最多等待 ${formatSeconds(timeoutMs)} 秒`,
			actionReady ? '动作输出后会先校验目标再执行' : '页面动作尚未执行',
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
		buildModelWaitHeartbeatText,
		buildObservationSummaryProgressText,
		getDisplayModelThought,
		getModelRoundTimeoutMs,
		getPlanningContextConfig,
		getTaskIntentTimeoutMs,
		formatSeconds,
	}
})(globalThis)
