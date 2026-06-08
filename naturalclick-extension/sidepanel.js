;(() => {
	const TYPES = globalThis.NC_PROTOCOL?.TYPES || {
		GET_CONFIG: 'NC_GET_CONFIG',
		SAVE_CONFIG: 'NC_SAVE_CONFIG',
		START_TASK: 'NC_START_TASK',
		STOP_TASK: 'NC_STOP_TASK',
		CONFIRM_RESPONSE: 'NC_CONFIRM_RESPONSE',
		CONFIRM_REQUEST: 'NC_CONFIRM_REQUEST',
		ASK_USER_REQUEST: 'NC_ASK_USER_REQUEST',
		SESSION_UPDATE: 'NC_SESSION_UPDATE',
	}

	const STORAGE_KEY_SESSIONS = 'nc_sessions_v1'
	const DEFAULT_TEXT_MODEL_TIMEOUT_MS = 60000
	const DEFAULT_PLANNING_CONTEXT = Object.freeze({
		fullObservationMaxChars: 262144,
		compactObservationMaxChars: 4200,
		compactElementThreshold: 120,
		compactRawCandidateThreshold: 80,
	})
	const PLANNING_CONTEXT_LIMITS = Object.freeze({
		fullObservationMaxChars: { min: 7600, max: 1048576 },
		compactObservationMaxChars: { min: 1000, max: 65536 },
		compactElementThreshold: { min: 20, max: 10000 },
		compactRawCandidateThreshold: { min: 20, max: 10000 },
	})
	const STATUS_LABELS = {
		idle: '空闲',
		running: '执行中',
		completed: '已完成',
		error: '错误',
		stopped: '已中止',
	}

	const state = {
		status: 'idle',
		currentTask: '',
		activityText: '等待任务...',
		planItems: [],
		resultSummary: null,
		traceItems: [],
		view: { name: 'chat' },
		sessions: [],
	}

	let currentConfig = null
	let currentSessionId = ''
	let activeConfirmId = ''
	let lastPersistedSessionId = ''
	let currentConversationId = ''
	let currentConversationStartedAt = 0
	let currentConversationTitle = ''
	let currentConversationTurnCount = 0
	let activeRun = null
	let activeAskResolve = null
	let taskStarting = false
	let taskStopping = false
	const connectivity = {
		text: { testing: false, status: '', message: '', clearTimer: 0 },
		mm: { testing: false, status: '', message: '', clearTimer: 0 },
	}
	const modelCatalog = {
		text: { loading: false, cacheKey: '', items: [] },
		mm: { loading: false, cacheKey: '', items: [] },
	}

	const el = {
		title: mustGet('sp-title'),
		statusDot: mustGet('sp-status-dot'),
		statusText: mustGet('sp-status-text'),
		copySession: mustGet('sp-copy-session'),
		downloadSession: mustGet('sp-download-session'),
		newConversation: mustGet('sp-new-conversation'),
		openHistory: mustGet('sp-open-history'),
		openSettings: mustGet('sp-open-settings'),
		historyBack: mustGet('sp-history-back'),
		detailBack: mustGet('sp-detail-back'),
		settingsBack: mustGet('sp-settings-back'),
		chatView: mustGet('view-chat'),
		historyView: mustGet('view-history'),
		historyDetailView: mustGet('view-history-detail'),
		settingsView: mustGet('view-settings'),
		currentTask: mustGet('sp-current-task'),
		currentTaskValue: mustGet('sp-current-task-value'),
		chatStream: mustGet('sp-chat-stream'),
		taskInput: mustGet('sp-task-input'),
		sendStop: mustGet('sp-send-stop'),
		historyList: mustGet('sp-history-list'),
		clearHistory: mustGet('sp-clear-history'),
		copyHistorySession: mustGet('sp-copy-history-session'),
		downloadHistorySession: mustGet('sp-download-history-session'),
		clearHistoryAllDetail: mustGet('sp-clear-history-all'),
		historyDetailTaskValue: mustGet('sp-history-detail-task-value'),
		historyDetailList: mustGet('sp-history-detail-list'),
		rerunHistory: mustGet('sp-rerun-history'),
		deleteHistory: mustGet('sp-delete-history'),
		cfgTextBase: mustGet('cfg-text-base'),
		cfgTextModel: mustGet('cfg-text-model'),
		cfgTextKey: mustGet('cfg-text-key'),
		cfgTextTimeoutSec: mustGet('cfg-text-timeout-sec'),
		cfgMmBase: mustGet('cfg-mm-base'),
		cfgMmModel: mustGet('cfg-mm-model'),
		cfgMmKey: mustGet('cfg-mm-key'),
		cfgInputMode: mustGet('cfg-input-mode'),
		cfgFullObservationMaxChars: mustGet('cfg-full-observation-max-chars'),
		cfgCompactObservationMaxChars: mustGet('cfg-compact-observation-max-chars'),
		cfgCompactElementThreshold: mustGet('cfg-compact-element-threshold'),
		cfgCompactRawCandidateThreshold: mustGet('cfg-compact-raw-candidate-threshold'),
		cfgVisionDisabledDomains: mustGet('cfg-vision-disabled-domains'),
		resetPlanningContext: mustGet('sp-reset-planning-context'),
		toggleTextKey: mustGet('sp-toggle-text-key'),
		toggleMmKey: mustGet('sp-toggle-mm-key'),
		configForm: mustGet('sp-config-form'),
		testTextConn: mustGet('sp-test-text-conn'),
		testTextResult: mustGet('sp-test-text-result'),
		testMmConn: mustGet('sp-test-mm-conn'),
		testMmResult: mustGet('sp-test-mm-result'),
		confirmOverlay: mustGet('sp-confirm-overlay'),
		confirmTitle: mustGet('sp-confirm-title'),
		confirmDesc: mustGet('sp-confirm-desc'),
		confirmApprove: mustGet('sp-confirm-approve'),
		confirmReject: mustGet('sp-confirm-reject'),
		askOverlay: mustGet('sp-ask-overlay'),
		askTitle: mustGet('sp-ask-title'),
		askDesc: mustGet('sp-ask-desc'),
		askInput: mustGet('sp-ask-input'),
		askSubmit: mustGet('sp-ask-submit'),
		askCancel: mustGet('sp-ask-cancel'),
	}

	bindEvents()
	bindRuntimeMessages()
	bootstrap().catch((error) => {
		state.status = 'error'
		state.activityText = `初始化失败: ${String(error)}`
		render()
	})

	async function bootstrap() {
		await Promise.all([loadConfig(), loadSessions()])
		autoResizeTaskInput()
		render()
	}

	function bindEvents() {
		el.newConversation.addEventListener('click', () => {
			startNewConversation()
		})

		el.openHistory.addEventListener('click', () => {
			state.view = { name: 'history' }
			render()
		})

		el.openSettings.addEventListener('click', () => {
			state.view = { name: 'settings' }
			render()
			hydrateModelOptions('text').catch(() => {})
			hydrateModelOptions('mm').catch(() => {})
		})

		el.historyBack.addEventListener('click', () => {
			state.view = { name: 'chat' }
			render()
		})

		el.detailBack.addEventListener('click', () => {
			state.view = { name: 'history' }
			render()
		})

		el.settingsBack.addEventListener('click', () => {
			state.view = { name: 'chat' }
			render()
		})

		el.copySession.addEventListener('click', async () => {
			await exportSessionToClipboard()
		})

		el.downloadSession.addEventListener('click', async () => {
			await exportSessionToTxt()
		})

		el.toggleTextKey.addEventListener('click', () => toggleSecretInput(el.cfgTextKey))
		el.toggleMmKey.addEventListener('click', () => toggleSecretInput(el.cfgMmKey))

		el.cfgTextBase.addEventListener('blur', () => {
			hydrateModelOptions('text').catch(() => {})
		})
		el.cfgTextKey.addEventListener('blur', () => {
			hydrateModelOptions('text').catch(() => {})
		})
		el.cfgMmBase.addEventListener('blur', () => {
			hydrateModelOptions('mm').catch(() => {})
		})
		el.cfgMmKey.addEventListener('blur', () => {
			hydrateModelOptions('mm').catch(() => {})
		})

		el.sendStop.addEventListener('click', async () => {
			if (taskStopping) return
			if (taskStarting || state.status === 'running') {
				await stopTask()
				return
			}
			const task = String(el.taskInput.value || '').trim()
			if (!task) return
			if (!currentConfig) await loadConfig()
			await runTask(task)
		})

		el.taskInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
				event.preventDefault()
				if (taskStopping || el.sendStop.disabled) return
				el.sendStop.click()
			}
		})

		el.taskInput.addEventListener('input', () => {
			autoResizeTaskInput()
			renderComposer()
		})

		el.configForm.addEventListener('submit', async (event) => {
			event.preventDefault()
			const config = getConfigFromForm()
			const result = await sendRuntimeMessage({ type: TYPES.SAVE_CONFIG, config })
			if (!result?.ok) {
				state.status = 'error'
				state.activityText = result?.error || '保存配置失败。'
				render()
				return
			}
			currentConfig = result.config || config
			state.activityText = '配置已保存。'
			state.view = { name: 'chat' }
			render()
		})

		el.resetPlanningContext.addEventListener('click', () => {
			setValue('cfg-text-timeout-sec', String(Math.round(DEFAULT_TEXT_MODEL_TIMEOUT_MS / 1000)))
			setPlanningContextToForm(DEFAULT_PLANNING_CONTEXT)
		})

		el.testTextConn.addEventListener('click', async () => {
			await testModelConnectivity('text')
		})

		el.testMmConn.addEventListener('click', async () => {
			await testModelConnectivity('mm')
		})

		el.clearHistory.addEventListener('click', async () => {
			if (!state.sessions.length) return
			state.sessions = []
			resetConversationState()
			state.traceItems = []
			state.currentTask = ''
			state.status = 'idle'
			state.activityText = '等待任务...'
			await persistSessions()
			render()
		})

		el.clearHistoryAllDetail.addEventListener('click', async () => {
			if (!state.sessions.length) return
			state.sessions = []
			resetConversationState()
			state.traceItems = []
			state.currentTask = ''
			state.status = 'idle'
			state.activityText = '等待任务...'
			await persistSessions()
			state.view = { name: 'history' }
			render()
		})

		el.copyHistorySession.addEventListener('click', async () => {
			if (state.view.name !== 'history-detail') return
			await exportSessionToClipboard({ sessionId: state.view.sessionId })
		})

		el.downloadHistorySession.addEventListener('click', async () => {
			if (state.view.name !== 'history-detail') return
			await exportSessionToTxt({ sessionId: state.view.sessionId })
		})

		el.historyList.addEventListener('click', async (event) => {
			const target = event.target
			if (!(target instanceof HTMLElement)) return
			const action = target.closest('[data-action]')?.getAttribute('data-action')
			const sessionId = target.closest('[data-session-id]')?.getAttribute('data-session-id')
			if (!sessionId) return

			const session = state.sessions.find((record) => record.id === sessionId)
			if (!session) return

			if (!action || action === 'view') {
				state.view = { name: 'history-detail', sessionId }
				render()
				return
			}

			if (action === 'rerun') {
				await runTask(session.latestTask || session.task, { newConversation: true })
				return
			}

			if (action === 'delete') {
				if (sessionId === currentConversationId) {
					resetConversationState()
					state.traceItems = []
					state.resultSummary = null
					state.currentTask = ''
					state.status = 'idle'
					state.activityText = '等待任务...'
				}
				state.sessions = state.sessions.filter((record) => record.id !== sessionId)
				await persistSessions()
				render()
			}
		})

		el.rerunHistory.addEventListener('click', async () => {
			if (state.view.name !== 'history-detail') return
			const session = state.sessions.find((record) => record.id === state.view.sessionId)
			if (!session) return
			await runTask(session.latestTask || session.task, { newConversation: true })
		})

		el.deleteHistory.addEventListener('click', async () => {
			if (state.view.name !== 'history-detail') return
			const deletingSessionId = state.view.sessionId
			if (deletingSessionId === currentConversationId) {
				resetConversationState()
				state.traceItems = []
				state.resultSummary = null
				state.currentTask = ''
				state.status = 'idle'
				state.activityText = '等待任务...'
			}
			state.sessions = state.sessions.filter((record) => record.id !== state.view.sessionId)
			await persistSessions()
			state.view = { name: 'history' }
			render()
		})

		el.confirmApprove.addEventListener('click', () => resolveConfirm(true))
		el.confirmReject.addEventListener('click', () => resolveConfirm(false))
		el.askSubmit.addEventListener('click', () => resolveAskUser(true))
		el.askCancel.addEventListener('click', () => resolveAskUser(false))
		el.askInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
				event.preventDefault()
				resolveAskUser(true)
			}
			if (event.key === 'Escape') {
				event.preventDefault()
				resolveAskUser(false)
			}
		})
	}

	function bindRuntimeMessages() {
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			if (!message || typeof message !== 'object') return

			if (message.type === TYPES.SESSION_UPDATE) {
				const payload = message.payload || {}
				if (currentSessionId && payload.sessionId && payload.sessionId !== currentSessionId) return
				if (payload.sessionId) currentSessionId = payload.sessionId

				const prevStatus = state.status
				const nextTraceItems = mergeTraceItemsFromRuntime(payload)
				const hasPayloadResultSummary = Object.prototype.hasOwnProperty.call(payload, 'resultSummary')
				const nextDiagnostics = hasPayloadResultSummary ? buildSessionDiagnostics(nextTraceItems) : null
				const nextResultSummary = hasPayloadResultSummary
					? mergeSessionDiagnosticsIntoResultSummary(payload.resultSummary, nextDiagnostics, {
						sensitiveValues: collectExportSensitiveValues({
							session: payload,
							traceItems: nextTraceItems,
							diagnostics: nextDiagnostics,
							activityText: payload.activityText || state.activityText,
						}),
					})
					: state.resultSummary
				Object.assign(state, {
					status: payload.status || state.status,
					currentTask: payload.currentTask || state.currentTask,
					activityText: payload.activityText || state.activityText,
					planItems: Array.isArray(payload.planItems) ? payload.planItems : state.planItems,
					resultSummary: nextResultSummary,
					traceItems: nextTraceItems,
				})

				persistSessionIfNeeded(prevStatus, state.status, payload.sessionId).catch(() => {})
				render()
				return
			}

			if (message.type === TYPES.CONFIRM_REQUEST) {
				const payload = message.payload || {}
				activeConfirmId = String(payload.confirmId || '')
				el.confirmTitle.textContent = String(payload.title || '请确认')
				el.confirmDesc.textContent = String(payload.description || '')
				el.confirmOverlay.style.display = 'flex'
				state.activityText = buildConfirmationActivityText(payload)
				state.planItems = upsertConfirmationPlanItem(state.planItems, payload)
				render()
				sendResponse({ ok: true })
				return
			}

			if (message.type === TYPES.ASK_USER_REQUEST) {
				const payload = message.payload || {}
				showAskUserDialog(payload).then(sendResponse)
				return true
			}
		})
	}

	async function loadConfig() {
		const result = await sendRuntimeMessage({ type: TYPES.GET_CONFIG })
		if (!result?.ok || !result.config) return
		currentConfig = result.config
		setConfigToForm(result.config)
	}

	async function runTask(task, options = {}) {
		if (taskStarting || taskStopping || state.status === 'running') return
		taskStarting = true
		state.activityText = '正在启动任务...'
		state.resultSummary = null
		render()

		const startNewConversation = !!options.newConversation
		try {
			if (startNewConversation) {
				resetConversationState()
				state.traceItems = []
			}

			const active = await getActiveTabContext()
			if (!active) {
				state.status = 'error'
				state.activityText = '无法识别当前活动标签页。请先切换到网页标签页。'
				return
			}

			const response = await sendRuntimeMessage({
				type: TYPES.START_TASK,
				task,
				config: currentConfig,
				controllerTabId: active.tabId,
				windowId: active.windowId,
			})

			if (!response?.ok) {
				if (response?.stopped) {
					state.status = 'stopped'
					state.activityText = response?.error || '任务启动已中止。'
				} else {
					state.status = 'error'
					state.activityText = response?.error || '任务启动失败。'
				}
				return
			}

			ensureConversation(task)
			currentConversationTurnCount += 1
			state.traceItems.push({
				id: createLocalId('u'),
				title: `用户输入 #${currentConversationTurnCount}`,
				detail: task,
				kind: 'user',
			})

			currentSessionId = response.sessionId
			lastPersistedSessionId = ''
			activeRun = {
				sessionId: response.sessionId,
				startIndex: state.traceItems.length,
				task,
			}
			state.status = 'running'
			state.currentTask = task
			state.activityText = '任务已启动，等待 Agent 更新...'
			state.planItems = [{ id: 'boot', title: '准备执行任务', status: 'running' }]
			el.taskInput.value = ''
			autoResizeTaskInput()
			state.view = { name: 'chat' }
		} finally {
			taskStarting = false
			render()
		}
	}

	async function stopTask() {
		if (taskStopping) return
		taskStopping = true
		state.activityText = '正在中止任务...'
		render()
		try {
			const result = await sendRuntimeMessage({ type: TYPES.STOP_TASK, sessionId: currentSessionId })
			if (!result?.ok) {
				state.status = 'error'
				state.activityText = result?.error || '停止失败。'
			} else {
				state.status = 'stopped'
				state.activityText = '任务已中止。'
				taskStarting = false
			}
		} finally {
			taskStopping = false
			render()
		}
	}

	async function resolveConfirm(approved) {
		if (!activeConfirmId) return
		const confirmId = activeConfirmId
		activeConfirmId = ''
		el.confirmOverlay.style.display = 'none'
		state.activityText = approved ? '已确认高风险动作，等待 Agent 继续执行...' : '已拒绝高风险动作，等待 Agent 停止任务...'
		state.planItems = completeConfirmationPlanItem(state.planItems, approved)
		render()
		await sendRuntimeMessage({ type: TYPES.CONFIRM_RESPONSE, confirmId, approved: !!approved })
	}

	function buildConfirmationActivityText(payload) {
		const title = String(payload?.title || '请确认').trim()
		const reason = getConfirmationReason(payload)
		return reason ? `等待用户确认：${title}（${reason}）` : `等待用户确认：${title}`
	}

	function getConfirmationReason(payload) {
		const direct = String(payload?.reason || payload?.purpose || '').trim()
		if (direct) return direct
		const description = String(payload?.description || '').replace(/\r/g, '').trim()
		const reasonLine = description
			.split('\n')
			.map((line) => line.trim())
			.find((line) => /^(原因|reason)\s*[:：]/i.test(line))
		if (reasonLine) return reasonLine.replace(/^(原因|reason)\s*[:：]\s*/i, '').trim()
		return ''
	}

	function upsertConfirmationPlanItem(planItems, payload) {
		const items = (Array.isArray(planItems) ? planItems : []).filter((item) => item?.id !== 'pending_user_confirmation')
		const title = buildConfirmationActivityText(payload)
		return [
			{
				id: 'pending_user_confirmation',
				title,
				status: 'pending',
			},
			...items,
		]
	}

	function completeConfirmationPlanItem(planItems, approved) {
		return (Array.isArray(planItems) ? planItems : []).map((item) => {
			if (item?.id !== 'pending_user_confirmation') return item
			return {
				...item,
				title: approved ? '用户已确认高风险动作，等待继续执行' : '用户已拒绝高风险动作，等待任务停止',
				status: approved ? 'done' : 'stopped',
			}
		})
	}

	function showAskUserDialog(payload) {
		if (activeAskResolve) {
			activeAskResolve({ ok: false, error: '新的用户确认请求覆盖了上一条请求。' })
			activeAskResolve = null
		}
		const question = String(payload.question || payload.description || '').trim()
		const reason = String(payload.reason || payload.purpose || '').trim()
		const title = String(payload.title || 'Agent 需要你确认').trim()
		const placeholder = String(payload.placeholder || '').trim()
		el.askTitle.textContent = title
		el.askDesc.textContent = reason ? `原因：${reason}\n\n${question}` : question
		el.askInput.value = placeholder
		el.askOverlay.style.display = 'flex'
		state.activityText = reason ? `等待用户回答：${reason}` : question ? `等待用户回答：${question}` : '等待用户回答...'
		render()
		setTimeout(() => {
			try {
				el.askInput.focus()
				el.askInput.select()
			} catch (_) {}
		}, 30)
		return new Promise((resolve) => {
			activeAskResolve = resolve
		})
	}

	function resolveAskUser(approved) {
		if (!activeAskResolve) return
		const resolve = activeAskResolve
		activeAskResolve = null
		el.askOverlay.style.display = 'none'
		const answer = String(el.askInput.value || '').trim()
		el.askInput.value = ''
		if (!approved) {
			resolve({ ok: false, error: '用户取消了回答。' })
			return
		}
		resolve({ ok: true, answer })
	}

	function render() {
		renderViews()
		renderChatHeader()
		renderChat()
		renderHistoryList()
		renderHistoryDetail()
		renderConnectivity()
	}

	function renderViews() {
		toggle(el.chatView, state.view.name === 'chat')
		toggle(el.historyView, state.view.name === 'history')
		toggle(el.historyDetailView, state.view.name === 'history-detail')
		toggle(el.settingsView, state.view.name === 'settings')
	}

	function renderChatHeader() {
		el.statusDot.className = `sp-status-dot ${state.status}`
		el.statusText.textContent = STATUS_LABELS[state.status] || state.status
		el.title.textContent = 'NaturalClick Agent'
		el.newConversation.disabled = state.status === 'running'
		const exportable = hasExportableSession()
		el.copySession.disabled = !exportable
		el.downloadSession.disabled = !exportable
	}

	function renderChat() {
		if (state.currentTask) {
			el.currentTask.classList.add('show')
			el.currentTaskValue.textContent = state.currentTask
		} else {
			el.currentTask.classList.remove('show')
			el.currentTaskValue.textContent = ''
		}

		el.chatStream.innerHTML = ''
		if (!state.traceItems.length) {
			const empty = document.createElement('div')
			empty.className = 'sp-empty-state'
			empty.innerHTML = `
				<div class="sp-empty-mark">
					<svg class="sp-icon-svg" viewBox="0 0 24 24"><path d="M5 17c6-1 8-5 8-11 4 2 6 5 6 9 0 5-3 8-8 8-2.7 0-4.8-1.2-6-3.1Z" /></svg>
				</div>
				<div class="sp-empty-title">开始你的自动化任务</div>
				<div class="sp-empty-desc">输入目标后按 Enter 发送，Agent 会在这里持续输出执行过程。</div>
			`
			el.chatStream.appendChild(empty)
		} else {
			state.traceItems.forEach((item) => {
				el.chatStream.appendChild(renderTraceCard(item))
			})
		}

		const planCard = renderPlanItemsCard(state.planItems)
		if (planCard) el.chatStream.appendChild(planCard)

		const resultSummary = renderResultSummaryCard(state.resultSummary)
		if (resultSummary) el.chatStream.appendChild(resultSummary)

		const activity = document.createElement('div')
		activity.className = 'sp-card activity'
		activity.textContent = state.activityText || '等待任务...'
		el.chatStream.appendChild(activity)
		el.chatStream.scrollTop = el.chatStream.scrollHeight
		renderComposer()
	}

	function renderTraceCard(item) {
		const card = document.createElement('div')
		const isUser = item?.kind === 'user'
		const isError = item?.kind === 'error'
		const kind = String(item?.kind || 'step')
		card.className = `sp-card event ${kind} ${isError ? 'error' : ''} ${isUser ? 'user' : ''}`.trim()
		const head = document.createElement('div')
		head.className = 'sp-card-head'
		const dot = document.createElement('span')
		dot.className = 'sp-card-dot'
		dot.textContent = getTraceMark(kind)
		const titleWrap = document.createElement('div')
		titleWrap.className = 'sp-card-title-wrap'
		const type = document.createElement('div')
		type.className = 'sp-card-type'
		type.textContent = getTraceTypeLabel(item)
		const title = document.createElement('div')
		title.className = 'sp-card-title'
		title.textContent = String(item?.title || '执行步骤')
		const detail = document.createElement('div')
		detail.className = 'sp-card-detail'
		detail.textContent = String(item?.detail || '')
		head.appendChild(dot)
		titleWrap.appendChild(type)
		titleWrap.appendChild(title)
		head.appendChild(titleWrap)
		card.appendChild(head)

		const reflection = normalizeReflection(item?.reflection)
		if (reflection.length) {
			card.appendChild(renderReflection(reflection))
		}

		if (item?.action && typeof item.action === 'object') {
			card.appendChild(renderActionSummary(item.action))
		}

		const modelReasoning = String(item?.modelThought || '').trim() || normalizeModelReasoning(item?.io)
		if (modelReasoning) {
			card.appendChild(renderReflection([{ icon: 'R', value: clampText(`模型思考: ${modelReasoning}`, 520) }]))
		}

		const modelError = getModelErrorSummary(item)
		if (modelError) {
			card.appendChild(renderModelErrorSummary(modelError))
		}

		const shouldShowDetail =
			detail.textContent &&
			String(item?.action?.output || '').trim() !== String(detail.textContent || '').trim()
		if (shouldShowDetail) {
			card.appendChild(detail)
		}
		if (isUser) {
			return card
		}
		if (item?.io) {
			card.appendChild(renderModelIO(item.io))
		}
		return card
	}

	function normalizeModelReasoning(io) {
		const thought = String(io?.response?.thought || io?.response?.displayThought || '').trim()
		if (thought) return thought
		const reasoning = String(io?.response?.reasoning || io?.response?.reasoning_content || '').trim()
		if (reasoning) return reasoning
		const content = String(io?.response?.content || '').trim()
		try {
			const parsed = JSON.parse(content)
			return String(parsed?.thought || parsed?.reasoning || parsed?.analysis || '').trim()
		} catch (_) {
			return ''
		}
	}

	function getModelErrorSummary(item) {
		const io = item?.io
		if (!io || typeof io !== 'object') return null
		const responseError = String(io?.response?.error || '').trim()
		const detailError = item?.kind === 'error' ? String(item?.detail || '').trim() : ''
		const message = responseError || detailError
		if (!message) return null
		const request = io.request || {}
		const diagnostics = request.diagnostics || {}
		return {
			message: clampText(message, 320),
			model: String(request.model || ''),
			timeoutMs: Number(request.timeoutMs || 0),
			totalMessageChars: Number(diagnostics.totalMessageChars || 0),
			truncatedMessages: Number(diagnostics.truncatedMessages || 0),
		}
	}

	function renderModelErrorSummary(summary) {
		const wrap = document.createElement('div')
		wrap.className = 'sp-model-error'
		const title = document.createElement('div')
		title.className = 'sp-model-error-title'
		title.textContent = `模型错误: ${summary.message}`
		wrap.appendChild(title)
		const meta = [
			summary.model ? `模型 ${summary.model}` : '',
			summary.timeoutMs ? `超时 ${Math.round(summary.timeoutMs / 1000)} 秒` : '',
			summary.totalMessageChars ? `请求 ${summary.totalMessageChars} 字符` : '',
			summary.truncatedMessages ? `日志预览截断 ${summary.truncatedMessages} 段` : '',
		].filter(Boolean)
		if (meta.length) {
			const line = document.createElement('div')
			line.className = 'sp-model-error-meta'
			line.textContent = meta.join(' · ')
			wrap.appendChild(line)
		}
		return wrap
	}

	function renderPlanItemsCard(planItems) {
		const items = normalizePlanItems(planItems, { maxTitleLength: 360 })
		if (!items.length) return null
		const card = document.createElement('div')
		card.className = 'sp-card sp-plan-card'
		const head = document.createElement('div')
		head.className = 'sp-plan-head'
		const title = document.createElement('div')
		title.className = 'sp-plan-title'
		title.textContent = '当前进度'
		const count = document.createElement('span')
		count.className = 'sp-plan-count'
		count.textContent = `${items.length} 项`
		head.appendChild(title)
		head.appendChild(count)
		card.appendChild(head)

		const list = document.createElement('div')
		list.className = 'sp-plan-list'
		items.slice(0, 6).forEach((item) => list.appendChild(renderPlanItemRow(item)))
		card.appendChild(list)
		if (items.length > 6) {
			const more = document.createElement('div')
			more.className = 'sp-plan-more'
			more.textContent = `另有 ${items.length - 6} 项进度已记录。`
			card.appendChild(more)
		}
		return card
	}

	function normalizePlanItems(planItems, options = {}) {
		const maxTitleLength = Math.max(80, Number(options.maxTitleLength) || 220)
		return (Array.isArray(planItems) ? planItems : [])
			.map((item, index) => ({
				id: String(item?.id || `plan_${index}`),
				title: clampText(String(item?.title || item?.label || item?.text || '').trim(), maxTitleLength),
				status: normalizePlanStatus(item?.status),
			}))
			.filter((item) => item.title)
	}

	function renderPlanItemRow(item) {
		const row = document.createElement('div')
		row.className = `sp-plan-item ${item.status}`.trim()
		const dot = document.createElement('span')
		dot.className = 'sp-plan-dot'
		const body = document.createElement('div')
		body.className = 'sp-plan-body'
		const title = document.createElement('div')
		title.className = 'sp-plan-item-title'
		title.textContent = item.title
		const status = document.createElement('div')
		status.className = 'sp-plan-item-status'
		status.textContent = formatPlanStatus(item.status)
		body.appendChild(title)
		body.appendChild(status)
		row.appendChild(dot)
		row.appendChild(body)
		return row
	}

	function normalizePlanStatus(status) {
		const value = String(status || '').trim().toLowerCase()
		if (['running', 'done', 'failed', 'pending', 'stopped'].includes(value)) return value
		if (['completed', 'success', 'passed'].includes(value)) return 'done'
		if (['error', 'fail'].includes(value)) return 'failed'
		return 'pending'
	}

	function formatPlanStatus(status) {
		const labels = {
			running: '进行中',
			done: '已完成',
			failed: '需关注',
			pending: '等待中',
			stopped: '已中止',
		}
		return labels[status] || '等待中'
	}

	function renderResultSummaryCard(summary) {
		if (!summary || typeof summary !== 'object') return null
		const headline = String(summary.headline || '').trim()
		if (!headline) return null
		const card = document.createElement('div')
		card.className = `sp-card sp-result-summary ${String(summary.status || '').trim()}`.trim()

		const head = document.createElement('div')
		head.className = 'sp-result-head'
		const title = document.createElement('div')
		title.className = 'sp-result-title'
		title.textContent = String(summary.title || '结果总结')
		const status = document.createElement('span')
		status.className = `sp-result-status ${String(summary.status || '').trim()}`.trim()
		status.textContent = formatResultSummaryStatus(summary.status)
		head.appendChild(title)
		head.appendChild(status)
		const sourceLabel = getResultSummarySourceLabel(summary)
		if (sourceLabel) {
			const source = document.createElement('span')
			source.className = 'sp-result-source'
			source.textContent = sourceLabel
			head.appendChild(source)
		}
		card.appendChild(head)

		const desc = document.createElement('div')
		desc.className = 'sp-result-headline'
		desc.textContent = headline
		card.appendChild(desc)

		const stats = renderResultStats(summary.stats)
		if (stats) card.appendChild(stats)

		const diagnostics = renderResultDiagnostics(summary.diagnostics)
		if (diagnostics) card.appendChild(diagnostics)

		const items = Array.isArray(summary.items) ? summary.items : []
		if (items.length) {
			const list = document.createElement('div')
			list.className = 'sp-result-list'
			items.slice(0, 8).forEach((item) => list.appendChild(renderResultSummaryItem(item)))
			card.appendChild(list)
			if (items.length > 8) {
				const more = document.createElement('div')
				more.className = 'sp-result-more'
				more.textContent = `另有 ${items.length - 8} 项明细，可在导出信息中查看完整结果。`
				card.appendChild(more)
			}
		}

		const issues = Array.isArray(summary.issues) ? summary.issues : []
		if (issues.length) {
			const issueWrap = document.createElement('div')
			issueWrap.className = 'sp-result-issues'
			const issueTitle = document.createElement('div')
			issueTitle.className = 'sp-result-issues-title'
			issueTitle.textContent = '重点问题'
			issueWrap.appendChild(issueTitle)
			issues.slice(0, 3).forEach((item) => issueWrap.appendChild(renderResultIssueLine(item)))
			card.appendChild(issueWrap)
		}
		const skippedDetails = Array.isArray(summary.skippedDetails) ? summary.skippedDetails : []
		if (skippedDetails.length) {
			const skippedWrap = document.createElement('div')
			skippedWrap.className = 'sp-result-issues'
			const skippedTitle = document.createElement('div')
			skippedTitle.className = 'sp-result-issues-title'
			skippedTitle.textContent = '安全跳过明细'
			skippedWrap.appendChild(skippedTitle)
			skippedDetails.slice(0, 5).forEach((item) => skippedWrap.appendChild(renderResultIssueLine(item)))
			if (skippedDetails.length > 5) {
				const more = document.createElement('div')
				more.className = 'sp-result-more'
				more.textContent = `另有 ${skippedDetails.length - 5} 个安全跳过字段，可在导出信息中查看完整原因。`
				skippedWrap.appendChild(more)
			}
			card.appendChild(skippedWrap)
		}
		const remainingDetails = buildResultRemainingDetails(summary)
		if (remainingDetails.length) {
			const remainingWrap = document.createElement('div')
			remainingWrap.className = 'sp-result-issues'
			const remainingTitle = document.createElement('div')
			remainingTitle.className = 'sp-result-issues-title'
			remainingTitle.textContent = '未完成明细'
			remainingWrap.appendChild(remainingTitle)
			remainingDetails.slice(0, 6).forEach((item) => remainingWrap.appendChild(renderResultIssueLine(item)))
			if (remainingDetails.length > 6) {
				const more = document.createElement('div')
				more.className = 'sp-result-more'
				more.textContent = `另有 ${remainingDetails.length - 6} 个未完成项目，可在导出信息中查看完整结果。`
				remainingWrap.appendChild(more)
			}
			card.appendChild(remainingWrap)
		}
		return card
	}

	function buildResultRemainingDetails(summary) {
		const explicitDetails = Array.isArray(summary?.remainingDetails)
			? summary.remainingDetails.map(normalizeResultRemainingDetail).filter(Boolean)
			: []
		if (explicitDetails.length) return explicitDetails
		const items = Array.isArray(summary?.items) ? summary.items : []
		const remainingLabels = Array.isArray(summary?.remaining) ? summary.remaining.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : []
		const remainingKeys = new Set(remainingLabels.map((item) => item.replace(/\s+/g, '').toLowerCase()))
		const details = []
		for (const item of items) {
			const label = String(item?.label || item?.key || '').trim()
			const key = label.replace(/\s+/g, '').toLowerCase()
			if (!label || (!item || item.recorded !== false) && !remainingKeys.has(key)) continue
			details.push({
				label,
				status: item?.status || 'unknown',
				statusLabel: item?.statusLabel || '未完成',
				summary: item?.summary || '该项目尚未形成完整测试记录。',
				neededEvidence: item?.neededEvidence || '',
			})
			remainingKeys.delete(key)
		}
		for (const label of remainingLabels) {
			const key = label.replace(/\s+/g, '').toLowerCase()
			if (!key || !remainingKeys.has(key)) continue
			details.push({
				label,
				status: 'unknown',
				statusLabel: '未完成',
				summary: '该项目尚未形成完整测试记录。',
			})
			remainingKeys.delete(key)
		}
		return details
	}

	function normalizeResultRemainingDetail(item) {
		const label = String(item?.label || item?.key || '').trim()
		if (!label) return null
		return {
			label,
			status: item?.status || 'unknown',
			statusLabel: item?.statusLabel || '未完成',
			summary: item?.summary || '该项目尚未形成完整测试记录。',
			neededEvidence: item?.neededEvidence || '',
			sourceLabel: item?.sourceLabel || '',
			sourceTitle: item?.sourceTitle || '',
			basis: item?.basis || '',
		}
	}

	function renderResultStats(stats) {
		if (!stats || typeof stats !== 'object') return null
		const entries = getResultSummaryStatEntries()
			.map(([key, label]) => ({ key, label, value: Number(stats[key]) }))
			.filter((item) => shouldShowResultStat(item.key, item.value, stats))
		if (!entries.length) return null
		const wrap = document.createElement('div')
		wrap.className = 'sp-result-stats'
		entries.forEach((item) => {
			const chip = document.createElement('span')
			chip.className = `sp-result-stat ${item.key}`.trim()
			chip.textContent = `${item.label} ${item.value}`
			wrap.appendChild(chip)
		})
		return wrap
	}

	function renderResultIssueLine(issue) {
		const row = document.createElement('div')
		row.className = `sp-result-issue ${String(issue?.status || '').trim()}`.trim()
		const head = document.createElement('div')
		head.className = 'sp-result-issue-head'
		head.textContent = [
			String(issue?.label || '未命名项').trim(),
			String(issue?.statusLabel || issue?.status || '').trim(),
			issue?.clearStatusLabel ? `清空：${issue.clearStatusLabel}` : '',
		].filter(Boolean).join(' · ')
		row.appendChild(head)
		const summary = String(issue?.summary || '').trim()
		const neededEvidence = String(issue?.neededEvidence || '').trim()
		const detail = [
			summary,
			neededEvidence ? `需要补充：${neededEvidence}` : '',
		].filter(Boolean).join(' ')
		if (detail) {
			const body = document.createElement('div')
			body.className = 'sp-result-issue-summary'
			body.textContent = clampText(detail, 320)
			row.appendChild(body)
		}
		return row
	}

	function renderResultDiagnostics(diagnostics) {
		const groups = groupResultDiagnostics(diagnostics)
		if (!groups.length) return null
		const wrap = document.createElement('div')
		wrap.className = 'sp-result-diagnostics'
		for (const group of groups) {
			wrap.appendChild(renderResultDiagnosticGroup(group))
		}
		return wrap
	}

	function renderResultDiagnosticGroup(group) {
		const section = document.createElement('div')
		section.className = `sp-result-diagnostic-group ${String(group?.kind || '').trim()}`.trim()
		const title = document.createElement('div')
		title.className = 'sp-result-diagnostic-title'
		title.textContent = String(group?.title || '诊断')
		section.appendChild(title)
		const limit = group?.kind === 'recommendations' ? 3 : 4
		const items = Array.isArray(group?.items) ? group.items : []
		items.slice(0, limit).forEach((item) => {
			const row = document.createElement('div')
			row.className = [
				'sp-result-diagnostic',
				String(item.severity || '').trim(),
				isResultRecommendation(item) ? 'recommendation' : '',
			].filter(Boolean).join(' ')
			row.textContent = String(item.text || '').trim()
			section.appendChild(row)
		})
		if (items.length > limit) {
			const more = document.createElement('div')
			more.className = 'sp-result-more'
			more.textContent = `另有 ${items.length - limit} 条${group?.kind === 'recommendations' ? '建议' : '诊断'}，可在导出信息中查看完整内容。`
			section.appendChild(more)
		}
		return section
	}

	function renderResultSummaryItem(item) {
		const row = document.createElement('div')
		row.className = `sp-result-item ${String(item?.status || '').trim()}`.trim()
		const label = document.createElement('div')
		label.className = 'sp-result-item-label'
		label.textContent = `${item?.order ? `${item.order}. ` : ''}${String(item?.label || item?.key || '未命名项')}`
		const status = document.createElement('div')
		status.className = 'sp-result-item-status'
		status.textContent = String(item?.statusLabel || item?.status || '未确认')
		row.appendChild(label)
		row.appendChild(status)
			const meta = [
				item?.value ? `值：${item.value}` : '',
				item?.sourceLabel ? `${item?.sourceTitle || '依据'}：${item.sourceLabel}` : '',
				item?.valueSourceLabel ? `取值：${item.valueSourceLabel}` : '',
				item?.basis ? `依据说明：${item.basis}` : '',
				item?.clearStatusLabel ? `清空：${item.clearStatusLabel}` : '',
				item?.neededEvidence ? `需要补充：${item.neededEvidence}` : '',
			].filter(Boolean).join(' · ')
		if (meta) {
			const metaLine = document.createElement('div')
			metaLine.className = 'sp-result-item-meta'
			metaLine.textContent = meta
			row.appendChild(metaLine)
		}
		const summary = String(item?.summary || '').trim()
		if (summary) {
			const summaryLine = document.createElement('div')
			summaryLine.className = 'sp-result-item-summary'
			summaryLine.textContent = clampText(summary, 180)
			row.appendChild(summaryLine)
		}
		return row
	}

	function formatResultSummaryStatus(status) {
		const labels = {
			running: '进行中',
			passed: '通过',
			failed: '异常',
			inconclusive: '未确认',
			stopped: '已中止',
		}
		return labels[String(status || '').trim()] || String(status || '总结')
	}

	function getTraceMark(kind) {
		if (kind === 'user') return '你'
		if (kind === 'model') return 'M'
		if (kind === 'error') return '!'
		return 'A'
	}

	function getTraceTypeLabel(item) {
		const kind = String(item?.kind || 'step')
		const actionName = String(item?.action?.name || '').trim()
		if (kind === 'user') return 'User'
		if (kind === 'model') return 'Planner'
		if (kind === 'error') return actionName.includes('.verify') ? 'Verify Failed' : 'Error'
		if (actionName === 'done') return 'Done'
		if (actionName) return `Action / ${actionName}`
		return 'Agent'
	}

	function renderModelIO(io) {
		const wrapper = document.createElement('details')
		wrapper.className = 'sp-io'
		const summary = document.createElement('summary')
		summary.className = 'sp-io-summary'
		summary.textContent = '模型输入 / 输出'
		wrapper.appendChild(summary)

		const body = document.createElement('div')
		body.className = 'sp-io-body'

		const tabs = document.createElement('div')
		tabs.className = 'sp-io-tabs'
		const requestTab = document.createElement('button')
		requestTab.type = 'button'
		requestTab.className = 'sp-io-tab'
		requestTab.textContent = '输入'
		const responseTab = document.createElement('button')
		responseTab.type = 'button'
		responseTab.className = 'sp-io-tab'
		responseTab.textContent = '输出'
		tabs.appendChild(requestTab)
		tabs.appendChild(responseTab)

		const copyBar = document.createElement('div')
		copyBar.className = 'sp-io-copybar'
		const copyActiveBtn = createCopyBtn('复制当前')
		copyBar.appendChild(copyActiveBtn)

		const pre = document.createElement('pre')
		pre.className = 'sp-io-pre'

		const requestText = stringifyIO(io?.request)
		const responseText = stringifyIO(io?.response)
		let activeTab = 'request'

		const refresh = () => {
			const isReq = activeTab === 'request'
			requestTab.classList.toggle('active', isReq)
			responseTab.classList.toggle('active', !isReq)
			pre.textContent = isReq ? requestText : responseText
		}

		requestTab.addEventListener('click', () => {
			activeTab = 'request'
			refresh()
		})
		responseTab.addEventListener('click', () => {
			activeTab = 'response'
			refresh()
		})

		copyActiveBtn.addEventListener('click', async () => {
			const payload = activeTab === 'request' ? requestText : responseText
			await copyText(payload)
			flashCopyState(copyActiveBtn)
		})

		body.appendChild(tabs)
		body.appendChild(copyBar)
		body.appendChild(pre)
		wrapper.appendChild(body)
		refresh()
		return wrapper
	}

	function renderReflection(items) {
		const wrap = document.createElement('div')
		wrap.className = 'sp-reflection'
		items.forEach((row) => {
			const item = document.createElement('div')
			item.className = 'sp-ref-item'
			const icon = document.createElement('span')
			icon.className = 'sp-ref-icon'
			icon.textContent = row.icon
			const text = document.createElement('span')
			text.className = 'sp-ref-text'
			text.title = row.value
			text.textContent = row.value
			item.appendChild(icon)
			item.appendChild(text)
			wrap.appendChild(item)
		})
		return wrap
	}

	function renderActionSummary(action) {
		const wrap = document.createElement('div')
		wrap.className = 'sp-action'

		const name = String(action?.name || '').trim() || 'unknown'
		const inputText = compactJson(action?.input)
		const outputText = String(action?.output || '').trim()

		const head = document.createElement('div')
		head.className = 'sp-action-head'
		head.textContent = `动作: ${name}`
		wrap.appendChild(head)

		if (inputText && inputText !== '{}') {
			const input = document.createElement('div')
			input.className = 'sp-action-line'
			input.textContent = `参数: ${inputText}`
			wrap.appendChild(input)
		}

		if (outputText) {
			const output = document.createElement('div')
			output.className = 'sp-action-line'
			output.textContent = `结果: ${outputText}`
			wrap.appendChild(output)
		}
		return wrap
	}

	function normalizeReflection(value) {
		const rows = []
		const pick = (k1, k2) => String(value?.[k1] || value?.[k2] || '').trim()
		const evaluation = pick('evaluation_previous_goal', 'evaluationPreviousGoal')
		const memory = pick('memory', 'memo')
		const thought = pick('thought', 'reasoning')
		const nextGoal = pick('next_goal', 'nextGoal')
		if (evaluation) rows.push({ icon: '☑', value: clampText(evaluation, 260) })
		if (memory) rows.push({ icon: '🧠', value: clampText(memory, 320) })
		if (thought) rows.push({ icon: '💭', value: clampText(thought, 320) })
		if (nextGoal) rows.push({ icon: '🎯', value: clampText(nextGoal, 260) })
		return rows
	}

	function stringifyIO(value) {
		if (typeof value === 'string') return clampText(value, 6400)
		try {
			return clampText(JSON.stringify(value ?? null, null, 2), 6400)
		} catch (_) {
			return clampText(String(value ?? ''), 6400)
		}
	}

	function clampText(text, maxLen) {
		const source = String(text || '')
		if (source.length <= maxLen) return source
		return `${source.slice(0, maxLen)}\n...[truncated ${source.length - maxLen} chars]`
	}

	function compactJson(value) {
		try {
			return clampText(JSON.stringify(value ?? {}), 360)
		} catch (_) {
			return clampText(String(value ?? ''), 360)
		}
	}

	function createCopyBtn(label) {
		const btn = document.createElement('button')
		btn.type = 'button'
		btn.className = 'sp-io-copy'
		btn.textContent = label
		btn.dataset.label = label
		return btn
	}

	async function copyText(text) {
		const content = String(text || '')
		if (!content) return
		try {
			await navigator.clipboard.writeText(content)
			return
		} catch (_) {}
		const ta = document.createElement('textarea')
		ta.value = content
		ta.style.position = 'fixed'
		ta.style.left = '-9999px'
		document.body.appendChild(ta)
		ta.focus()
		ta.select()
		try {
			document.execCommand('copy')
		} catch (_) {}
		ta.remove()
	}

	function flashCopyState(button) {
		const original = button?.dataset?.label || button.textContent || ''
		button.textContent = '已复制'
		setTimeout(() => {
			button.textContent = original
		}, 1300)
	}

	function hasExportableSession() {
		if (state.traceItems.length || state.currentTask || currentConversationId) return true
		return state.sessions.length > 0
	}

	async function exportSessionToClipboard(options = {}) {
		const payload = buildSessionExportPayload(options)
		if (!payload) {
			state.activityText = '当前没有可复制的会话信息。'
			render()
			return
		}
		await copyText(formatSessionExportText(payload))
		state.activityText = `会话信息已复制（${payload.session?.traceCount || 0} 条轨迹）。`
		render()
	}

	async function exportSessionToTxt(options = {}) {
		const payload = buildSessionExportPayload(options)
		if (!payload) {
			state.activityText = '当前没有可下载的会话信息。'
			render()
			return
		}
		const text = formatSessionExportText(payload)
		const fileName = buildExportFileName(payload)
		downloadTextFile(fileName, text)
		state.activityText = `会话信息已下载为 TXT（${payload.session?.traceCount || 0} 条轨迹）。`
		render()
	}

	function formatSessionExportText(payload) {
		const sanitizedPayload = sanitizeSessionExportPayload(payload)
		const session = sanitizedPayload?.session || {}
		const lines = [
			'NaturalClick 会话导出',
			`导出时间：${sanitizedPayload?.exportedAt || ''}`,
			`扩展版本：${sanitizedPayload?.extensionVersion || ''}`,
			'',
			'任务信息',
			`任务：${session.latestTask || session.task || ''}`,
			`状态：${formatExportStatus(session.status)}`,
			`创建时间：${session.createdAt ? new Date(session.createdAt).toLocaleString() : ''}`,
			`更新时间：${session.updatedAt ? new Date(session.updatedAt).toLocaleString() : ''}`,
			`轨迹数量：${Number(session.traceCount || 0)}`,
			session.activityText ? `当前提示：${session.activityText}` : '',
		].filter((line) => line !== '')
		appendResultSummaryExport(lines, session.resultSummary)
		appendPlanItemsExport(lines, session.planItems)
		appendSessionDiagnosticsExport(lines, session.diagnostics)
		appendTraceSummaryExport(lines, session.traceItems)
		lines.push('', '原始 JSON 附录', JSON.stringify(sanitizedPayload, null, 2))
		return `${lines.join('\n')}\n`
	}

	function appendResultSummaryExport(lines, summary) {
		lines.push('', '结果总结')
		if (!summary || typeof summary !== 'object') {
			lines.push('暂无结构化结果总结。')
			return
		}
		lines.push(`标题：${summary.title || '结果总结'}`)
		lines.push(`状态：${formatResultSummaryStatus(summary.status)}`)
		const sourceLine = getResultSummaryExportSourceLine(summary)
		if (sourceLine) lines.push(sourceLine)
		if (summary.headline) lines.push(`结论：${summary.headline}`)
		const stats = formatResultSummaryStats(summary.stats)
		if (stats) lines.push(`统计：${stats}`)
		for (const group of groupResultDiagnostics(summary.diagnostics)) {
			lines.push(`${group.title}：`)
			for (const diagnostic of group.items) {
				const text = String(diagnostic?.text || '').trim()
				if (text) lines.push(`- ${text}`)
			}
		}
		if (summary.reason) lines.push(`原因：${summary.reason}`)
		const items = Array.isArray(summary.items) ? summary.items : []
		if (items.length) {
			lines.push('字段/项目明细：')
			for (const item of items) lines.push(`- ${formatResultSummaryItemExport(item)}`)
		}
		const issues = Array.isArray(summary.issues) ? summary.issues : []
		if (issues.length) {
			lines.push('重点问题：')
			for (const issue of issues) lines.push(`- ${formatResultIssueExport(issue)}`)
		}
		const skipped = Array.isArray(summary.skipped) ? summary.skipped.filter(Boolean) : []
		if (skipped.length) lines.push(`安全跳过：${skipped.join('、')}`)
		const skippedDetails = Array.isArray(summary.skippedDetails) ? summary.skippedDetails.filter(Boolean) : []
		if (skippedDetails.length) {
			lines.push('安全跳过明细：')
			for (const item of skippedDetails) lines.push(`- ${formatResultSkippedDetailExport(item)}`)
		}
		const remainingDetails = buildResultRemainingDetails(summary)
		if (remainingDetails.length) {
			lines.push('未完成明细：')
			for (const item of remainingDetails) lines.push(`- ${formatResultRemainingDetailExport(item)}`)
		} else {
			const remaining = Array.isArray(summary.remaining) ? summary.remaining.filter(Boolean) : []
			if (remaining.length) lines.push(`未完成：${remaining.join('、')}`)
		}
	}

	function getResultSummarySourceLabel(summary) {
		if (!summary || typeof summary !== 'object' || !summary.fallback) return ''
		const type = String(summary.type || '').trim()
		if (type === 'summary_error') return '总结异常'
		if (type === 'general_fallback') return '轨迹摘要'
		return '兜底摘要'
	}

	function getResultSummaryExportSourceLine(summary) {
		if (!summary || typeof summary !== 'object' || !summary.fallback) return ''
		const type = String(summary.type || '').trim()
		if (type === 'summary_error') {
			return '来源：总结异常兜底（结果总结生成失败；任务轨迹和进度仍可用于排查，不能等同于完整测试结论）'
		}
		if (type === 'general_fallback') {
			return '来源：轨迹兜底摘要（缺少结构化测试明细，不能等同于完整测试结论）'
		}
		return '来源：兜底摘要（缺少完整结构化测试明细，不能等同于完整测试结论）'
	}

	function formatResultSummaryStats(stats) {
		if (!stats || typeof stats !== 'object') return ''
		return getResultSummaryStatEntries()
			.map(([key, label]) => ({ key, label, value: Number(stats[key]) }))
			.filter((item) => shouldShowResultStat(item.key, item.value, stats))
			.map((item) => `${item.label} ${item.value}`)
			.join('，')
	}

	function getResultSummaryStatEntries() {
		return [
			['total', '总数'],
			['tested', '已测'],
			['passed', '通过'],
			['reached', '已到达'],
			['failed', '异常'],
			['clickedUnverified', '点击未确认'],
			['cleanupPassed', '清空完成'],
			['cleanupFailed', '清空异常'],
			['cleanupUnverified', '清空未确认'],
			['candidateDiagnostics', '候选诊断'],
			['dateCandidateOwnership', '日期候选归属'],
			['contextRequestLimit', '上下文补证上限'],
			['verificationRecoveryIncomplete', '校验恢复未完成'],
			['userInputRequired', '需要用户补充'],
			['terminalFailed', '终态异常'],
			['unknown', '未确认'],
			['formFields', '表单字段'],
			['fieldTested', '字段已测'],
			['fieldPassed', '字段通过'],
			['fieldFailed', '字段异常'],
			['fieldUnknown', '字段未确认'],
			['fieldRemaining', '字段未完成'],
			['submitted', '已提交'],
			['submitFailed', '提交异常'],
			['submitUnknown', '提交未确认'],
			['submitMissing', '缺少提交'],
			['formCompleted', '表单完成'],
			['completionUnknown', '完成未确认'],
			['revealAttempts', '展开导航'],
			['visionAttempts', '视觉导航'],
			['recoveredFailures', '失败后成功'],
			['retried', '重试'],
			['skipped', '安全跳过'],
			['remaining', '未完成'],
			['completed', '成功动作'],
			['modelErrors', '模型错误'],
			['timeouts', '超时'],
			['loopGuards', '循环保护'],
			['verificationFailures', '校验失败'],
		]
	}

	function shouldShowResultStat(key, value, stats) {
		const numeric = Number(value)
		if (!Number.isFinite(numeric)) return false
		if (numeric !== 0) return true
		return String(key || '') === 'total' && Object.prototype.hasOwnProperty.call(stats || {}, key)
	}

	function groupResultDiagnostics(diagnostics) {
		const items = (Array.isArray(diagnostics) ? diagnostics : [])
			.filter((item) => item && String(item.text || '').trim())
		const diagnosticItems = items.filter((item) => !isResultRecommendation(item))
		const recommendationItems = items.filter(isResultRecommendation)
		return [
			{ kind: 'diagnostics', title: '诊断', items: diagnosticItems },
			{ kind: 'recommendations', title: '建议', items: recommendationItems },
		].filter((group) => group.items.length)
	}

	function isResultRecommendation(item) {
		return String(item?.kind || '').trim() === 'next_step_recommendation'
	}

	function formatResultSummaryItemExport(item) {
		const parts = [
			item?.order ? `${item.order}. ${item.label || item.key || '未命名项'}` : String(item?.label || item?.key || '未命名项'),
			item?.statusLabel || item?.status || '未确认',
				item?.value ? `值=${item.value}` : '',
				item?.sourceLabel ? `${item?.sourceTitle || '依据'}=${item.sourceLabel}` : '',
				item?.valueSourceLabel ? `取值=${item.valueSourceLabel}` : '',
				item?.basis ? `依据说明=${item.basis}` : '',
				item?.clearStatusLabel ? `清空=${item.clearStatusLabel}` : '',
				item?.neededEvidence ? `需要补充=${item.neededEvidence}` : '',
			item?.attempts ? `尝试=${item.attempts}` : '',
			item?.failedAttempts ? `失败尝试=${item.failedAttempts}` : '',
			item?.summary ? `说明=${item.summary}` : '',
		].filter(Boolean)
		return parts.join('；')
	}

	function formatResultIssueExport(issue) {
		return [
			issue?.label || '未命名项',
			issue?.statusLabel || issue?.status || '',
			issue?.clearStatusLabel ? `清空=${issue.clearStatusLabel}` : '',
			issue?.neededEvidence ? `需要补充=${issue.neededEvidence}` : '',
			issue?.summary || '',
		].filter(Boolean).join('；')
	}

	function formatResultSkippedDetailExport(item) {
		return [
			item?.label || '未命名字段',
			item?.statusLabel || item?.status || '未确认',
			item?.sourceLabel ? `${item?.sourceTitle || '依据'}=${item.sourceLabel}` : '',
			item?.basis ? `依据说明=${item.basis}` : '',
			item?.neededEvidence ? `需要补充=${item.neededEvidence}` : '',
			item?.summary || '',
		].filter(Boolean).join('；')
	}

	function formatResultRemainingDetailExport(item) {
		return [
			item?.label || '未命名项',
			item?.statusLabel || item?.status || '未完成',
			item?.sourceLabel ? `${item?.sourceTitle || '依据'}=${item.sourceLabel}` : '',
			item?.basis ? `依据说明=${item.basis}` : '',
			item?.neededEvidence ? `需要补充=${item.neededEvidence}` : '',
			item?.summary || '',
		].filter(Boolean).join('；')
	}

	function appendPlanItemsExport(lines, planItems) {
		const items = normalizePlanItems(planItems, { maxTitleLength: 1200 })
		if (!items.length) return
		lines.push('', '当前进度')
		items.slice(0, 12).forEach((item, index) => {
			lines.push(`${index + 1}. [${formatPlanStatus(item.status)}] ${item.title}`)
		})
		if (items.length > 12) lines.push(`另有 ${items.length - 12} 项进度已记录。`)
	}

	function appendSessionDiagnosticsExport(lines, diagnostics) {
		if (!diagnostics || typeof diagnostics !== 'object') return
		const parts = [
			Number.isFinite(Number(diagnostics.modelCallCount)) ? `模型调用 ${Number(diagnostics.modelCallCount)}` : '',
			Number(diagnostics.modelErrorCount) ? `模型错误 ${Number(diagnostics.modelErrorCount)}` : '',
			Number(diagnostics.timeoutCount) ? `超时 ${Number(diagnostics.timeoutCount)}` : '',
			Number(diagnostics.plannerCorrectionCount) ? `规划纠偏 ${Number(diagnostics.plannerCorrectionCount)}` : '',
			Number(diagnostics.loopGuardCount) ? `循环保护 ${Number(diagnostics.loopGuardCount)}` : '',
			Number(diagnostics.verificationFailureCount) ? `校验失败 ${Number(diagnostics.verificationFailureCount)}` : '',
			Number(diagnostics.dateCandidateOwnershipCount) ? `日期候选归属 ${Number(diagnostics.dateCandidateOwnershipCount)}` : '',
			Number(diagnostics.verificationRecoveryIncompleteCount) ? `校验恢复未完成 ${Number(diagnostics.verificationRecoveryIncompleteCount)}` : '',
			Number(diagnostics.contextRequestLimitCount) ? `上下文补证上限 ${Number(diagnostics.contextRequestLimitCount)}` : '',
			Number(diagnostics.userInputRequiredCount) ? `需要用户补充 ${Number(diagnostics.userInputRequiredCount)}` : '',
		].filter(Boolean)
		const lastError = diagnostics.lastError?.detail || diagnostics.lastModelError?.message || ''
		const progressSummary = formatProgressStageSummary(diagnostics)
		const lastPlanningProgress = formatLastProgressExport(diagnostics.lastPlanningProgress)
		const lastRuntimeProgress = formatLastProgressExport(diagnostics.lastRuntimeProgress)
		const plannerCorrectionSummary = formatPlannerCorrectionSummary(diagnostics)
		const lastPlannerCorrection = diagnostics.lastPlannerCorrection || null
		const validationFeedbackSummary = formatStageCountMap(diagnostics.validationFeedbackKindCounts, VALIDATION_FEEDBACK_KIND_LABELS)
		const lastValidationFeedback = diagnostics.lastValidationFeedback || null
		const loopGuardSummary = formatStageCountMap(diagnostics.loopGuardKindCounts, LOOP_GUARD_KIND_LABELS)
		const lastLoopGuard = diagnostics.lastLoopGuard || null
		const modelThoughts = Array.isArray(diagnostics.modelThoughts) ? diagnostics.modelThoughts.filter((item) => item && String(item.thought || '').trim()) : []
		if (!parts.length && !lastError && !progressSummary && !lastPlanningProgress && !lastRuntimeProgress && !plannerCorrectionSummary && !lastPlannerCorrection && !validationFeedbackSummary && !lastValidationFeedback && !loopGuardSummary && !lastLoopGuard && !Array.isArray(diagnostics.candidateDiagnostics) && !modelThoughts.length) return
		lines.push('', '诊断概览')
		if (parts.length) lines.push(parts.join('，'))
		if (progressSummary) lines.push(`进度阶段：${progressSummary}`)
		if (plannerCorrectionSummary) lines.push(`规划纠偏：${plannerCorrectionSummary}`)
		if (lastPlannerCorrection?.detail) lines.push(`最近规划纠偏：${clampText(lastPlannerCorrection.detail, 500)}`)
		if (validationFeedbackSummary) lines.push(`动作校验反馈：${validationFeedbackSummary}`)
		if (lastValidationFeedback?.guidance) lines.push(`最近校验建议：${clampText(lastValidationFeedback.guidance, 500)}`)
		if (loopGuardSummary) lines.push(`循环保护类型：${loopGuardSummary}`)
		if (lastLoopGuard?.guidance) lines.push(`最近循环保护建议：${clampText(lastLoopGuard.guidance, 500)}`)
		if (lastPlanningProgress) lines.push(`最后规划进度：${clampText(lastPlanningProgress, 500)}`)
		if (lastRuntimeProgress) lines.push(`最后运行进度：${clampText(lastRuntimeProgress, 500)}`)
		if (lastError) lines.push(`最后错误：${clampText(lastError, 500)}`)
		if (modelThoughts.length) {
			lines.push('最近模型分析：')
			modelThoughts.slice(-3).forEach((item, index) => {
				const title = String(item.title || '').trim()
				const prefix = title ? `${index + 1}. ${title}` : `${index + 1}. 模型分析`
				lines.push(`${prefix}：${clampText(String(item.thought || ''), 700)}`)
			})
		}
		const candidateDiagnostics = Array.isArray(diagnostics.candidateDiagnostics) ? diagnostics.candidateDiagnostics : []
		if (candidateDiagnostics.length) {
			lines.push('候选定位诊断：')
			candidateDiagnostics.slice(0, 2).forEach((item) => lines.push(clampText(String(item || ''), 700)))
		}
	}

	function formatProgressStageSummary(diagnostics) {
		if (!diagnostics || typeof diagnostics !== 'object') return ''
		const planning = formatStageCountMap(diagnostics.planningStageCounts, PLANNING_STAGE_EXPORT_LABELS)
		const runtime = formatStageCountMap(diagnostics.runtimeStageCounts, RUNTIME_STAGE_EXPORT_LABELS)
		return [
			planning ? `规划 ${planning}` : '',
			runtime ? `运行 ${runtime}` : '',
		].filter(Boolean).join('；')
	}

	function formatPlannerCorrectionSummary(diagnostics) {
		if (!diagnostics || typeof diagnostics !== 'object') return ''
		const counts = diagnostics.plannerCorrectionCounts || {
			invalid_model_output: Number(diagnostics?.planningStageCounts?.invalid_model_output || 0),
			invalid_action_name: Number(diagnostics?.planningStageCounts?.invalid_action_name || 0),
		}
		return formatStageCountMap(counts, {
			invalid_model_output: '模型输出格式',
			invalid_action_name: '工具名',
		})
	}

	function formatLastProgressExport(progress) {
		if (!progress || typeof progress !== 'object') return ''
		const detail = String(progress.detail || '').trim()
		const elapsed = formatProgressElapsedForExport(progress)
		return [elapsed, detail].filter(Boolean).join('：')
	}

	function formatProgressElapsedForExport(progress) {
		const elapsedMs = Math.max(0, Number(progress?.elapsedMs) || 0)
		if (!elapsedMs) return ''
		const timeoutMs = Math.max(0, Number(progress?.timeoutMs) || 0)
		if (timeoutMs) return `耗时 ${formatDurationForExport(elapsedMs)}/${formatDurationForExport(timeoutMs)}`
		return `耗时 ${formatDurationForExport(elapsedMs)}`
	}

	function formatDurationForExport(ms) {
		const seconds = Math.max(1, Math.round(Number(ms || 0) / 1000))
		if (seconds < 60) return `${seconds} 秒`
		const minutes = Math.floor(seconds / 60)
		const rest = seconds % 60
		return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`
	}

	const PLANNING_STAGE_EXPORT_LABELS = {
		observation_summary: '页面观察',
		task_intent_request: '任务理解请求',
		task_intent_heuristic: '本地任务理解',
		workflow_analysis: '工作流分析',
		workflow_decision: '确定性决策',
		model_request: '模型规划',
		model_compact_request: '精简模型规划',
		model_context_round: '上下文补充轮',
		model_wait_heartbeat: '模型等待',
		model_stream_delta: '模型流式输出',
		compact_retry: '压缩重试',
		planning_context_request: '上下文请求',
		planning_context: '上下文结果',
		invalid_model_output: '模型输出纠偏',
		invalid_action_name: '工具名纠偏',
		validation_feedback: '动作校验反馈',
		timeout_recovery: '超时恢复',
		timeout_no_recovery: '超时无恢复',
	}

	const RUNTIME_STAGE_EXPORT_LABELS = {
		observation_heartbeat: '页面观察',
		action_execution_heartbeat: '动作执行',
		execution_recovery: '执行恢复',
		verification_heartbeat: '动作复核',
		verification_recovery: '校验恢复',
	}

	const VALIDATION_FEEDBACK_KIND_LABELS = {
		bad_index: '索引无效',
		control_mismatch: '控件类型不匹配',
		covered_target: '目标被遮挡',
		declared_target_mismatch: '声明目标不匹配',
		invalid_input: '参数不可执行',
		missing_action_context: '缺少动作语义',
		missing_required_parameter: '缺少必填参数',
		repeat_selection_attempt: '重复选择尝试',
		selection_bypass_attempt: '绕过选择归属',
		unowned_selection_candidate: '候选未归属',
	}

	const LOOP_GUARD_KIND_LABELS = {
		hover_no_effect: '悬浮无效果',
		loop_guard: '循环保护',
		repeated_failed_action: '重复失败动作',
		repeated_no_progress_action: '重复无进展动作',
		repeated_wait: '重复等待',
		scroll_no_progress: '滚动无进展',
	}

	function formatStageCountMap(counts, labels) {
		if (!counts || typeof counts !== 'object') return ''
		return Object.entries(counts)
			.filter(([, count]) => Number(count) > 0)
			.map(([stage, count]) => `${labels?.[stage] || stage} ${Number(count)}`)
			.join('，')
	}

	function appendTraceSummaryExport(lines, traceItems) {
		const items = Array.isArray(traceItems) ? traceItems : []
		lines.push('', '执行轨迹摘要')
		if (!items.length) {
			lines.push('暂无轨迹。')
			return
		}
		items.slice(-80).forEach((item, index) => {
			const actionName = item?.action?.name || item?.action || ''
			const output = item?.action?.output || item?.detail || ''
			const title = item?.title || getTraceTypeLabel(item)
			const pieces = [
				`${index + 1}. ${title || '执行步骤'}`,
				actionName ? `动作=${actionName}` : '',
				output ? `结果=${clampText(output, 260)}` : '',
			].filter(Boolean)
			lines.push(pieces.join('；'))
		})
		if (items.length > 80) lines.push(`仅展示最后 80 条轨迹；完整轨迹见 JSON 附录。`)
	}

	function formatExportStatus(status) {
		const code = String(status || '').trim()
		return STATUS_LABELS[code] || code || '未知'
	}

	function downloadTextFile(fileName, text) {
		const blob = new Blob([String(text || '')], { type: 'text/plain;charset=utf-8' })
		const url = URL.createObjectURL(blob)
		const link = document.createElement('a')
		link.href = url
		link.download = fileName
		link.style.display = 'none'
		document.body.appendChild(link)
		link.click()
		link.remove()
		setTimeout(() => URL.revokeObjectURL(url), 1000)
	}

	function buildExportFileName(payload) {
		const session = sanitizeSessionExportPayload(payload)?.session || {}
		const stamp = new Date()
			.toISOString()
			.replace(/[:.]/g, '-')
			.replace('T', '_')
			.replace('Z', '')
		const task = sanitizeFileName(session.latestTask || session.task || 'session').slice(0, 48)
		const id = sanitizeFileName(session.id || 'unknown').slice(0, 28)
		return `naturalclick_${stamp}_${id}_${task}.txt`
	}

	function sanitizeSessionExportPayload(payload) {
		const cloned = cloneJson(payload)
		if (!cloned || typeof cloned !== 'object') return cloned
		const sensitiveValues = collectExportSensitiveValues(cloned)
		return redactExportValue(cloned, sensitiveValues)
	}

	function collectExportSensitiveValues(value) {
		const values = []
		const visit = (node) => {
			if (node === null || node === undefined) return
			if (typeof node === 'string') {
				values.push(...extractSensitiveAssignments(node))
				return
			}
			if (Array.isArray(node)) {
				node.forEach(visit)
				return
			}
			if (typeof node !== 'object') return
			if (isExportSensitiveObject(node)) {
				for (const candidate of [
					node.text,
					node.value,
					node.workflow_test_value,
					node.lastTestValue,
					node.selected_text,
					node.option,
				]) pushSensitiveValue(values, candidate)
				for (const candidate of [
					node.summary,
					node.basis,
					node.reason,
					node.output,
					node.detail,
				]) {
					values.push(...extractSensitiveObjectTextTokens(candidate))
				}
			}
			for (const [key, child] of Object.entries(node)) {
				if (isExportSensitiveKey(key)) pushSensitiveValue(values, child)
				visit(child)
			}
		}
		visit(value)
		return uniqueExportSensitiveValues(values)
	}

	function isExportSensitiveObject(value) {
		if (!value || typeof value !== 'object') return false
		const descriptor = [
			value.target_label,
			value.workflow_field_label,
			value.label,
			value.name,
			value.placeholder,
			value.type,
			value.fieldType,
			value.workflow_field_type,
			value.semanticContainer,
		].map((item) => String(item || '')).join(' ')
		return isExportSensitiveDescriptor(descriptor)
	}

	function isExportSensitiveKey(key) {
		return /(?:api[_-]?key|authorization|bearer|access[_-]?token|refresh[_-]?token|password|passcode|pwd|otp|captcha|verification|secret|token|密码|口令|验证码|校验码|动态码|安全码|密钥|令牌)/i.test(String(key || ''))
	}

	function isExportSensitiveDescriptor(text) {
		return /(?:password|passcode|pwd|otp|captcha|verification|secret|token|密码|口令|验证码|校验码|动态码|安全码|密钥|令牌)/i.test(String(text || ''))
	}

	function extractSensitiveAssignments(text) {
		const out = []
		const source = String(text || '')
		const pattern = /(?:密码|口令|验证码|校验码|动态码|安全码|密钥|令牌|password|passcode|pwd|otp|captcha|verification(?:\s*code)?|secret|token|api[_-]?key)\s*(是|为|=|:|：)?\s*([^\s,，;；。"'<>`]+)/gi
		for (const match of source.matchAll(pattern)) {
			const hasSeparator = !!String(match[1] || '').trim()
			const candidate = String(match[2] || '').trim()
			if (hasSeparator || isLikelyUnseparatedSecretToken(candidate)) pushSensitiveValue(out, candidate)
		}
		return out
	}

	function extractSensitiveObjectTextTokens(text) {
		const source = String(text || '')
		if (!source) return []
		const out = []
		for (const match of source.matchAll(/[A-Za-z0-9!@#$%^&*_=+\-./\\:;?]{4,}/g)) {
			const token = String(match[0] || '').trim()
			if (!token || !isLikelyUnseparatedSecretToken(token)) continue
			pushSensitiveValue(out, token)
		}
		return out
	}

	function isLikelyUnseparatedSecretToken(value) {
		const text = String(value || '').trim()
		if (text.length < 4) return false
		if (/[0-9]/.test(text)) return true
		if (/[^A-Za-z\u4e00-\u9fff]/.test(text)) return true
		if (/^[A-Za-z]{10,}$/.test(text)) return true
		return false
	}

	function pushSensitiveValue(values, value) {
		if (Array.isArray(value)) {
			value.forEach((item) => pushSensitiveValue(values, item))
			return
		}
		if (value === null || value === undefined || typeof value === 'object') return
		const text = String(value).trim()
		if (text.length >= 4 && text !== '已隐藏') values.push(text)
	}

	function uniqueExportSensitiveValues(values) {
		const out = []
		const seen = new Set()
		for (const value of (Array.isArray(values) ? values : [])) {
			const text = String(value || '').trim()
			if (!text || seen.has(text)) continue
			seen.add(text)
			out.push(text)
		}
		return out.sort((a, b) => b.length - a.length)
	}

	function redactExportValue(value, sensitiveValues, parentKey = '') {
		if (typeof value === 'string') return redactExportText(value, sensitiveValues)
		if (Array.isArray(value)) return value.map((item) => redactExportValue(item, sensitiveValues, parentKey))
		if (!value || typeof value !== 'object') {
			return isExportSensitiveKey(parentKey) && String(value ?? '').trim() ? '已隐藏' : value
		}
		const out = {}
		for (const [key, child] of Object.entries(value)) {
			if (isExportSensitiveKey(key) && String(child ?? '').trim()) {
				out[key] = '已隐藏'
				continue
			}
			out[key] = redactExportValue(child, sensitiveValues, key)
		}
		return out
	}

	function redactExportText(text, sensitiveValues) {
		let out = String(text || '')
		for (const value of (Array.isArray(sensitiveValues) ? sensitiveValues : [])) {
			const secret = String(value || '').trim()
			if (secret.length < 4) continue
			out = out.replace(new RegExp(escapeRegExp(secret), 'g'), '已隐藏')
		}
		return out
	}

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	function sanitizeFileName(value) {
		return String(value || '')
			.replace(/[\\/:*?"<>|\n\r\t]+/g, '_')
			.replace(/\s+/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/g, '') || 'session'
	}

	function buildSessionExportPayload(options = {}) {
		const snapshot = resolveSessionSnapshot(options)
		if (!snapshot) return null
		return {
			type: 'naturalclick_session_export',
			version: 1,
			exportedAt: new Date().toISOString(),
			extensionVersion: String(chrome.runtime.getManifest?.().version || ''),
			view: cloneJson(state.view),
			config: sanitizeConfigForExport(currentConfig),
			session: snapshot,
		}
	}

	function resolveSessionSnapshot(options = {}) {
		const fixedSessionId = String(options?.sessionId || '').trim()
		if (fixedSessionId) {
			const found = state.sessions.find((item) => item.id === fixedSessionId)
			return found ? normalizeSessionSnapshot(found, { source: 'history' }) : null
		}

		const hasLive =
			Array.isArray(state.traceItems) && (state.traceItems.length > 0 || String(state.currentTask || '').trim())
		if (hasLive || currentConversationId || currentSessionId) {
			return normalizeSessionSnapshot(
				{
					id: currentConversationId || currentSessionId || createLocalId('live'),
					task: currentConversationTitle || state.currentTask || '',
					latestTask: state.currentTask || currentConversationTitle || '',
					status: state.status,
					createdAt: currentConversationStartedAt || Date.now(),
					updatedAt: Date.now(),
					turnCount: Math.max(currentConversationTurnCount, inferTurnCount({ traceItems: state.traceItems })),
					traceItems: state.traceItems,
					planItems: state.planItems,
					activityText: state.activityText,
					resultSummary: cloneJson(state.resultSummary || null),
					runtimeSessionId: currentSessionId,
				},
				{ source: 'live' }
			)
		}

		if (state.view.name === 'history-detail' && state.view.sessionId) {
			const selected = state.sessions.find((item) => item.id === state.view.sessionId)
			if (selected) return normalizeSessionSnapshot(selected, { source: 'history' })
		}

		if (state.sessions.length) {
			return normalizeSessionSnapshot(state.sessions[0], { source: 'history_latest' })
		}
		return null
	}

	function normalizeSessionSnapshot(session, meta = {}) {
		const traceItems = Array.isArray(session?.traceItems) ? session.traceItems : []
		const diagnostics = buildSessionDiagnostics(traceItems)
		const activityText = String(session?.activityText || state.activityText || '')
		const sensitiveValues = collectExportSensitiveValues({ session, traceItems, diagnostics, activityText })
		const resultSummary = resolveSessionResultSummary(session, traceItems, diagnostics, activityText, { sensitiveValues })
		return {
			source: meta.source || 'unknown',
			id: String(session?.id || ''),
			runtimeSessionId: String(session?.runtimeSessionId || currentSessionId || ''),
			task: String(session?.task || session?.latestTask || ''),
			latestTask: String(session?.latestTask || session?.task || ''),
			status: String(session?.status || state.status || 'unknown'),
			createdAt: Number(session?.createdAt || 0),
			updatedAt: Number(session?.updatedAt || Date.now()),
			turnCount: Number(session?.turnCount || inferTurnCount(session)),
			traceCount: traceItems.length,
			activityText,
			planItems: cloneJson(session?.planItems || []),
			resultSummary,
			diagnostics,
			traceItems: cloneJson(traceItems),
		}
	}

	function resolveSessionResultSummary(session, traceItems, diagnostics, activityText = '', options = {}) {
		const existing = cloneJson(session?.resultSummary || null)
		if (existing && typeof existing === 'object' && String(existing.headline || '').trim()) {
			return mergeSessionDiagnosticsIntoResultSummary(existing, diagnostics, options)
		}
		return mergeSessionDiagnosticsIntoResultSummary(
			buildFallbackResultSummary(session, traceItems, diagnostics, activityText),
			diagnostics,
			options
		)
	}

	function mergeSessionDiagnosticsIntoResultSummary(summary, diagnostics, options = {}) {
		if (!summary || typeof summary !== 'object') return summary
		const additions = buildCandidateDiagnosticResultItems(diagnostics, options)
		if (!additions.length) return summary
		const out = cloneJson(summary) || {}
		const current = Array.isArray(out.diagnostics) ? out.diagnostics : []
		const seen = new Set(current.map((item) => `${String(item?.kind || '')}\n${String(item?.text || '')}`))
		out.diagnostics = [...current]
		for (const item of additions) {
			const key = `${String(item?.kind || '')}\n${String(item?.text || '')}`
			if (seen.has(key)) continue
			seen.add(key)
			out.diagnostics.push(item)
		}
		out.stats = mergeCandidateDiagnosticsStats(out.stats, additions)
		out.headline = appendCandidateDiagnosticsToSummaryHeadline(out.headline, additions)
		out.text = appendMergedDiagnosticsToSummaryText(out.text, additions)
		return out
	}

	function buildCandidateDiagnosticResultItems(diagnostics, options = {}) {
		const sections = Array.isArray(diagnostics?.candidateDiagnostics)
			? diagnostics.candidateDiagnostics.map(formatCandidateDiagnosticSnippet).filter(Boolean)
			: []
		if (!sections.length) return []
		const sensitiveValues = options.sensitiveValues || []
		const text = redactExportText(`候选定位诊断：${sections.slice(0, 2).join('；')}`, sensitiveValues)
		const recommendation = redactExportText('建议：复查目标候选是否被索引、是否被遮挡、是否归属当前字段或弹层；必要时重新观察页面，或请求对应区域/候选上下文后再动作。', sensitiveValues)
		return [
			{
				kind: 'candidate_diagnostics',
				severity: 'warning',
				count: sections.length,
				text,
			},
			{
				kind: 'next_step_recommendation',
				severity: 'info',
				count: 1,
				text: recommendation,
			},
		]
	}

	function mergeCandidateDiagnosticsStats(stats, additions) {
		const count = getMergedCandidateDiagnosticCount(additions)
		if (!count) return stats
		const out = { ...(stats && typeof stats === 'object' ? stats : {}) }
		out.candidateDiagnostics = Math.max(Number(out.candidateDiagnostics || 0), count)
		return out
	}

	function appendCandidateDiagnosticsToSummaryHeadline(headline, additions) {
		const base = String(headline || '').trim()
		if (/候选诊断/.test(base)) return base
		const count = getMergedCandidateDiagnosticCount(additions)
		if (!count) return base
		const suffix = `候选诊断：候选定位 ${count} 条。`
		return base ? `${base} ${suffix}` : suffix
	}

	function getMergedCandidateDiagnosticCount(additions) {
		const candidate = (Array.isArray(additions) ? additions : [])
			.find((item) => String(item?.kind || '').trim() === 'candidate_diagnostics')
		return Math.max(0, Number(candidate?.count || 0))
	}

	function appendMergedDiagnosticsToSummaryText(text, additions) {
		const lines = String(text || '')
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
		const seen = new Set(lines)
		for (const item of (Array.isArray(additions) ? additions : [])) {
			const detail = String(item?.text || '').trim()
			if (!detail) continue
			const line = `诊断：${detail}`
			if (seen.has(line)) continue
			seen.add(line)
			lines.push(line)
		}
		return lines.join('\n')
	}

	function formatCandidateDiagnosticSnippet(value) {
		return clampText(
			String(value || '')
				.replace(/<\/?candidate_diagnostics[^>]*>/gi, ' ')
				.replace(/<[^>]+>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim(),
			260
		)
	}

	function buildFallbackResultSummary(session, traceItems, diagnostics, activityText = '') {
		const status = String(session?.status || state.status || '').trim()
		const items = Array.isArray(traceItems) ? traceItems : []
		const sensitiveValues = collectExportSensitiveValues({
			session,
			traceItems,
			diagnostics,
			activityText,
		})
		const issue = redactExportText(pickFallbackResultIssue(status, diagnostics, activityText), sensitiveValues)
		if (!status && !items.length && !issue) return null
		const mappedStatus = status === 'completed'
			? 'inconclusive'
			: status === 'running'
				? 'running'
				: status === 'stopped'
					? 'stopped'
					: status === 'error'
						? (Number(diagnostics?.userInputRequiredCount || 0) ? 'inconclusive' : 'failed')
						: 'inconclusive'
		const stats = {
			total: items.length,
			modelErrors: Number(diagnostics?.modelErrorCount || 0),
			timeouts: Number(diagnostics?.timeoutCount || 0),
			plannerCorrections: Number(diagnostics?.plannerCorrectionCount || 0),
			loopGuards: Number(diagnostics?.loopGuardCount || 0),
			verificationFailures: Number(diagnostics?.verificationFailureCount || 0),
			dateCandidateOwnership: Number(diagnostics?.dateCandidateOwnershipCount || 0),
			verificationRecoveryIncomplete: Number(diagnostics?.verificationRecoveryIncompleteCount || 0),
			contextRequestLimit: Number(diagnostics?.contextRequestLimitCount || 0),
			userInputRequired: Number(diagnostics?.userInputRequiredCount || 0),
			terminalFailed: issue && status === 'error' && !Number(diagnostics?.userInputRequiredCount || 0) ? 1 : 0,
		}
		const headline = buildFallbackResultHeadline(status, items.length, stats)
		const fallbackDiagnostics = buildFallbackResultDiagnostics(status, issue, diagnostics, { sensitiveValues })
		const issueLabel = status === 'stopped' ? '终止原因' : '最后问题'
		return {
			type: 'general_fallback',
			title: '任务结果摘要',
			status: mappedStatus,
			headline,
			stats,
			diagnostics: fallbackDiagnostics,
			items: [],
			issues: issue ? [{
				label: issueLabel,
				status: status === 'stopped' ? 'stopped' : 'failed',
				statusLabel: status === 'stopped' ? '已中止' : '失败',
				summary: issue,
			}] : [],
			remaining: [],
			reason: issue,
			text: [
				headline,
				...fallbackDiagnostics.map((item) => `诊断：${item.text}`),
				issue ? `${issueLabel}：${issue}` : '',
			].filter(Boolean).join('\n'),
			fallback: true,
			generatedAt: Date.now(),
		}
	}

	function pickFallbackResultIssue(status, diagnostics, activityText) {
		const values = [
			diagnostics?.lastError?.detail,
			diagnostics?.lastModelError?.message,
			status === 'completed' ? '' : activityText,
		]
		for (const value of values) {
			const text = String(value || '').replace(/\s+/g, ' ').trim()
			if (text) return clampText(text, 500)
		}
		return ''
	}

	function buildFallbackResultHeadline(status, traceCount, stats) {
		const label = status === 'completed'
			? '任务已完成'
			: status === 'running'
				? '任务执行中'
				: status === 'stopped'
					? '任务已中止'
					: status === 'error'
						? '任务未完成'
						: '任务状态未确认'
		const extras = [
			Number(stats.modelErrors) ? `模型错误 ${Number(stats.modelErrors)} 次` : '',
			Number(stats.timeouts) ? `超时 ${Number(stats.timeouts)} 次` : '',
			Number(stats.plannerCorrections) ? `规划纠偏 ${Number(stats.plannerCorrections)} 次` : '',
			Number(stats.loopGuards) ? `循环保护 ${Number(stats.loopGuards)} 次` : '',
			Number(stats.verificationFailures) ? `校验失败 ${Number(stats.verificationFailures)} 次` : '',
			Number(stats.dateCandidateOwnership) ? `日期候选归属 ${Number(stats.dateCandidateOwnership)} 次` : '',
			Number(stats.verificationRecoveryIncomplete) ? `校验恢复未完成 ${Number(stats.verificationRecoveryIncomplete)} 次` : '',
			Number(stats.contextRequestLimit) ? `上下文补证上限 ${Number(stats.contextRequestLimit)} 次` : '',
			Number(stats.userInputRequired) ? `需要用户补充 ${Number(stats.userInputRequired)} 次` : '',
		].filter(Boolean)
		return `${label}：已记录 ${traceCount} 条轨迹${extras.length ? `，${extras.join('，')}` : ''}。`
	}

	function buildFallbackResultDiagnostics(status, issue, diagnostics, options = {}) {
		const out = []
		const text = String(issue || '').trim()
		const userInputRequired = Number(diagnostics?.userInputRequiredCount || 0)
		const modelThoughts = Array.isArray(diagnostics?.modelThoughts)
			? diagnostics.modelThoughts
				.filter((item) => item && String(item.thought || '').trim())
				.slice(-3)
			: []
		if (text && !userInputRequired) {
			out.push({
				kind: status === 'stopped' ? 'task_stopped' : 'task_terminal_failure',
				severity: status === 'stopped' ? 'warning' : 'error',
				count: 1,
				text: status === 'stopped' ? `任务已中止：${text}` : `任务终止：${text}`,
			})
		}
		if (Number(diagnostics?.modelErrorCount || 0)) {
			out.push({
				kind: 'model_error',
				severity: 'error',
				count: Number(diagnostics.modelErrorCount || 0),
				text: `模型调用异常：${Number(diagnostics.modelErrorCount || 0)} 次。`,
			})
		}
		if (Number(diagnostics?.timeoutCount || 0)) {
			out.push({
				kind: 'timeout',
				severity: 'warning',
				count: Number(diagnostics.timeoutCount || 0),
				text: `等待或请求超时：${Number(diagnostics.timeoutCount || 0)} 次。`,
			})
		}
		const plannerCorrectionSummary = formatPlannerCorrectionSummary(diagnostics)
		if (plannerCorrectionSummary) {
			const count = Number(diagnostics?.plannerCorrectionCount || 0) || countMapValues(diagnostics?.plannerCorrectionCounts)
			out.push({
				kind: 'planner_correction',
				severity: 'warning',
				count,
				text: `规划输出纠偏：${plannerCorrectionSummary}；这些纠偏发生在执行页面动作前，Agent 已要求模型按可用工具和 JSON 契约重试。`,
			})
			const detail = String(diagnostics?.lastPlannerCorrection?.detail || '').trim()
			if (detail) {
				out.push({
					kind: 'planner_correction_detail',
					severity: 'info',
					count: 1,
					text: `最近规划纠偏：${clampText(detail, 420)}`,
				})
			}
			out.push({
				kind: 'next_step_recommendation',
				severity: 'info',
				count: 1,
				text: '建议：查看最近模型输出、可用工具列表和规划提示词；若频繁出现，可调小任务拆分粒度，或检查模型与工具 schema 配置。',
			})
		}
		if (Number(diagnostics?.loopGuardCount || 0)) {
			const loopGuardSummary = diagnostics?.loopGuardKindCounts
				? formatStageCountMap(diagnostics.loopGuardKindCounts, LOOP_GUARD_KIND_LABELS)
				: ''
			out.push({
				kind: 'loop_guard',
				severity: 'warning',
				count: Number(diagnostics.loopGuardCount || 0),
				text: `循环保护触发：${Number(diagnostics.loopGuardCount || 0)} 次${loopGuardSummary ? `，类型：${loopGuardSummary}` : ''}。`,
			})
			const guidance = String(diagnostics?.lastLoopGuard?.guidance || '').trim()
			if (guidance) {
				out.push({
					kind: 'next_step_recommendation',
					severity: 'info',
					count: 1,
					text: `建议：${guidance}`,
				})
			}
		}
		const validationFeedbackSummary = diagnostics?.validationFeedbackKindCounts
			? formatStageCountMap(diagnostics.validationFeedbackKindCounts, VALIDATION_FEEDBACK_KIND_LABELS)
			: ''
		if (validationFeedbackSummary) {
			out.push({
				kind: 'validation_feedback',
				severity: 'warning',
				count: countMapValues(diagnostics?.validationFeedbackKindCounts),
				text: `执行前校验拦截：${validationFeedbackSummary}。`,
			})
			const guidance = String(diagnostics?.lastValidationFeedback?.guidance || '').trim()
			if (guidance) {
				out.push({
					kind: 'next_step_recommendation',
					severity: 'info',
					count: 1,
					text: `建议：${guidance}`,
				})
			}
		}
		if (modelThoughts.length) {
			out.push({
				kind: 'recent_model_analysis',
				severity: 'info',
				count: modelThoughts.length,
				text: `最近模型分析：${modelThoughts.map((item) => {
					const title = String(item.title || '').trim()
					const thought = clampText(String(item.thought || ''), 220)
					return title ? `${title}: ${thought}` : thought
				}).filter(Boolean).join('；')}`,
			})
		}
		if (Number(diagnostics?.dateCandidateOwnershipCount || 0)) {
			out.push({
				kind: 'date_candidate_ownership',
				severity: 'warning',
				count: Number(diagnostics.dateCandidateOwnershipCount || 0),
				text: `日期/时间候选归属不足：${Number(diagnostics.dateCandidateOwnershipCount || 0)} 条轨迹显示日期弹层候选没有稳定归属到目标字段。`,
			})
			out.push({
				kind: 'next_step_recommendation',
				severity: 'info',
				count: 1,
				text: '建议：复查日期/时间选择器的弹层归属、当前活动字段和候选坐标，优先让候选稳定归属到对应字段后再选择。',
			})
		}
		if (Number(diagnostics?.verificationRecoveryIncompleteCount || 0)) {
			out.push({
				kind: 'verification_recovery_incomplete',
				severity: 'warning',
				count: Number(diagnostics.verificationRecoveryIncompleteCount || 0),
				text: `校验恢复未完成：${Number(diagnostics.verificationRecoveryIncompleteCount || 0)} 条轨迹包含恢复处理失败、跳过或不适合视觉恢复的原因。`,
			})
			out.push({
				kind: 'next_step_recommendation',
				severity: 'info',
				count: 1,
				text: '建议：不要重复同一失败动作；先重新观察页面状态，确认目标是否被遮挡、候选是否归属当前字段，再换定位或补上下文。',
			})
		}
		if (Number(diagnostics?.contextRequestLimitCount || 0)) {
			out.push({
				kind: 'context_request_limit',
				severity: 'warning',
				count: Number(diagnostics.contextRequestLimitCount || 0),
				text: `上下文补证达到上限：${Number(diagnostics.contextRequestLimitCount || 0)} 条轨迹显示模型连续请求内部上下文仍未形成可执行证据。`,
			})
			out.push({
				kind: 'next_step_recommendation',
				severity: 'info',
				count: 1,
				text: '建议：先查看最后的补充上下文，确认是缺少页面证据、候选归属不稳定，还是目标字段定位不稳定，再重新规划。',
			})
		}
		if (Number(diagnostics?.userInputRequiredCount || 0)) {
			out.push({
				kind: 'user_input_required',
				severity: 'warning',
				count: Number(diagnostics.userInputRequiredCount || 0),
				text: `需要用户补充信息：${Number(diagnostics.userInputRequiredCount || 0)} 条轨迹显示 Agent 已请求用户确认、验证码、缺失账号信息或冲突字段新值。`,
			})
			out.push({
				kind: 'next_step_recommendation',
				severity: 'info',
				count: 1,
				text: '建议：先补充 Agent 请求的验证码、账号、确认信息或替代字段值，再从等待用户回答前的步骤继续。',
			})
		}
		return out.map((item) => ({
			...item,
			text: redactExportText(item.text, options.sensitiveValues),
		}))
	}

	function countMapValues(counts) {
		return Object.values(counts && typeof counts === 'object' ? counts : {})
			.reduce((sum, value) => sum + (Number(value) || 0), 0)
	}

	function buildSessionDiagnostics(traceItems) {
		const items = Array.isArray(traceItems) ? traceItems : []
		const modelItems = items.filter((item) => item?.io)
		const errorItems = items.filter((item) => item?.kind === 'error')
		const modelThoughts = modelItems
			.map((item) => ({
				title: String(item?.title || ''),
				detail: String(item?.detail || ''),
				thought: clampText(String(item?.modelThought || '').trim() || normalizeModelReasoning(item?.io), 520),
			}))
			.filter((item) => item.thought)
			.slice(-6)
		const lastError = [...errorItems].reverse()[0] || null
		const lastModelErrorItem = [...modelItems].reverse().find((item) => getModelErrorSummary(item))
		const plannerCorrectionCounts = countPlannerCorrectionStages(items)
		return {
			modelCallCount: modelItems.length,
			modelErrorCount: modelItems.filter((item) => item.kind === 'error').length,
			timeoutCount: items.filter((item) => /超时|timeout/i.test(`${item?.title || ''} ${item?.detail || ''}`)).length,
			loopGuardCount: items.filter((item) => /循环保护|loop_guard/i.test(`${item?.title || ''} ${item?.detail || ''} ${item?.action?.name || ''}`)).length,
			loopGuardKindCounts: countLoopGuardKinds(items),
			lastLoopGuard: getLastLoopGuardTrace(items),
			verificationFailureCount: items.filter((item) => /校验失败|verify/i.test(`${item?.title || ''} ${item?.detail || ''} ${item?.action?.name || ''}`)).length,
			dateCandidateOwnershipCount: items.filter(isDateCandidateOwnershipTrace).length,
			verificationRecoveryIncompleteCount: items.filter(isVerificationRecoveryIncompleteTrace).length,
			contextRequestLimitCount: items.filter(isContextRequestLimitTrace).length,
			userInputRequiredCount: items.filter(isUserInputRequiredTrace).length,
			planningStageCounts: countProgressStages(items, 'planning'),
			runtimeStageCounts: countProgressStages(items, 'runtime'),
			plannerCorrectionCount: countMapValues(plannerCorrectionCounts),
			plannerCorrectionCounts,
			lastPlannerCorrection: getLastPlannerCorrectionTrace(items),
			validationFeedbackKindCounts: countValidationFeedbackKinds(items),
			lastValidationFeedback: getLastValidationFeedbackTrace(items),
			lastPlanningProgress: getLastProgressTrace(items, 'planning'),
			lastRuntimeProgress: getLastProgressTrace(items, 'runtime'),
			candidateDiagnostics: extractCandidateDiagnostics(modelItems),
			lastError: lastError ? {
				title: String(lastError.title || ''),
				detail: clampText(String(lastError.detail || ''), 800),
				action: String(lastError.action?.name || ''),
			} : null,
			lastModelError: lastModelErrorItem ? getModelErrorSummary(lastModelErrorItem) : null,
			modelThoughts,
		}
	}

	function isContextRequestLimitTrace(item) {
		const input = item?.action?.input && typeof item.action.input === 'object' ? item.action.input : {}
		if (input.planning_context_limit === true) return true
		const text = [
			item?.title,
			item?.detail,
			item?.action?.name,
			item?.action?.output,
			input.text,
			input.reason,
			input.planning_context_diagnostic,
			input.workflow_planning_context_diagnostic,
		].map((value) => String(value || '')).join(' ')
		return /(内部\s*(?:ReAct\s*)?上下文请求次数达到上限|上下文请求次数达到上限|planning_context_limit|context[-_\s]?request[-_\s]?limit|context[-_\s]?round[-_\s]?limit|补充上下文.*上限|上下文补证.*上限)/i.test(text)
	}

	function isUserInputRequiredTrace(item) {
		const input = item?.action?.input && typeof item.action.input === 'object' ? item.action.input : {}
		const action = String(item?.action?.name || '').replace(/\..*$/, '').trim()
		const text = [
			item?.title,
			item?.detail,
			item?.action?.name,
			item?.action?.output,
			input.question,
			input.reason,
			input.purpose,
			input.text,
		].map((value) => String(value || '')).join(' ')
		return action === 'ask_user' || /(ask_user|等待用户回答|用户未提供回答|询问用户失败|用户介入|需要你确认|需要用户|用户确认|验证码|校验码|动态码|短信码|缺少.*(?:账号|手机号|验证码|校验码|动态码|确认|信息)|无法判断.*(?:用户|选项|意图)|确认新值|提供.*新值)/i.test(text)
	}

	function isVerificationRecoveryIncompleteTrace(item) {
		const text = [
			item?.title,
			item?.detail,
			item?.action?.name,
			item?.action?.output,
			item?.action?.input?.workflow_result_summary,
			item?.action?.input?.reason,
		].map((value) => String(value || '')).join(' ')
		return /(恢复处理[:：]|视觉恢复失败|视觉回退失败|不支持视觉恢复|不适合视觉恢复|不做视觉恢复|恢复未完成|recovery\s+failed|verification_recovery.*failed|vision_recovery.*failed)/i.test(text)
	}

	function isDateCandidateOwnershipTrace(item) {
		const input = item?.action?.input && typeof item.action.input === 'object' ? item.action.input : {}
		const text = [
			item?.title,
			item?.detail,
			item?.action?.name,
			item?.action?.output,
			input.text,
			input.reason,
			input.workflow_result_summary,
			input.workflow_skip_reason,
			input.planning_context_diagnostic,
			input.workflow_planning_context_diagnostic,
		].map((value) => String(value || '')).join(' ')
		if (!/(日期|时间|date|time|daterange|datetime|timerange|起止|区间|范围)/i.test(text)) return false
		return /(诊断候选|字段外可见|字段外候选|global_popup_diagnostic|global_selectable_popup_diagnostic|未归属|候选未能与目标字段建立稳定归属|没有稳定归属|未观测到真实候选)/i.test(text)
	}

	function countProgressStages(items, group) {
		const out = {}
		for (const item of (Array.isArray(items) ? items : [])) {
			if (!isProgressTraceGroup(item, group)) continue
			const stage = String(item?.progress?.stage || '').trim()
			if (!stage) continue
			out[stage] = Number(out[stage] || 0) + 1
		}
		return out
	}

	function countValidationFeedbackKinds(items) {
		const out = {}
		for (const item of (Array.isArray(items) ? items : [])) {
			const kind = String(item?.progress?.validationKind || '').trim()
			if (!kind) continue
			out[kind] = Number(out[kind] || 0) + 1
		}
		return out
	}

	function countPlannerCorrectionStages(items) {
		const out = {}
		for (const item of (Array.isArray(items) ? items : [])) {
			const stage = String(item?.progress?.stage || '').trim()
			if (stage !== 'invalid_model_output' && stage !== 'invalid_action_name') continue
			out[stage] = Number(out[stage] || 0) + 1
		}
		return out
	}

	function getLastPlannerCorrectionTrace(items) {
		for (const item of [...(Array.isArray(items) ? items : [])].reverse()) {
			const stage = String(item?.progress?.stage || '').trim()
			if (stage !== 'invalid_model_output' && stage !== 'invalid_action_name') continue
			return {
				stage,
				detail: clampText(String(item?.detail || item?.progress?.detail || ''), 800),
				elapsedMs: Math.max(0, Number(item?.progress?.elapsedMs) || 0),
				timeoutMs: Math.max(0, Number(item?.progress?.timeoutMs) || 0),
			}
		}
		return null
	}

	function countLoopGuardKinds(items) {
		const out = {}
		for (const item of (Array.isArray(items) ? items : [])) {
			const kind = String(item?.action?.loopGuardKind || item?.loopGuardKind || '').trim()
			if (!kind) continue
			out[kind] = Number(out[kind] || 0) + 1
		}
		return out
	}

	function getLastLoopGuardTrace(items) {
		for (const item of [...(Array.isArray(items) ? items : [])].reverse()) {
			const kind = String(item?.action?.loopGuardKind || item?.loopGuardKind || '').trim()
			const guidance = String(item?.action?.loopGuardGuidance || item?.loopGuardGuidance || '').trim()
			if (!kind && !guidance) continue
			return {
				kind,
				guidance: clampText(guidance, 800),
				detail: clampText(String(item?.detail || ''), 800),
			}
		}
		return null
	}

	function getLastValidationFeedbackTrace(items) {
		for (const item of [...(Array.isArray(items) ? items : [])].reverse()) {
			const kind = String(item?.progress?.validationKind || '').trim()
			const guidance = String(item?.progress?.validationGuidance || '').trim()
			if (!kind && !guidance) continue
			return {
				kind,
				guidance: clampText(guidance, 800),
				detail: clampText(String(item?.detail || ''), 800),
			}
		}
		return null
	}

	function getLastProgressTrace(items, group) {
		for (const item of [...(Array.isArray(items) ? items : [])].reverse()) {
			if (!isProgressTraceGroup(item, group)) continue
			return {
				stage: String(item?.progress?.stage || '').trim(),
				title: String(item?.title || ''),
				detail: clampText(String(item?.detail || ''), 800),
				elapsedMs: Math.max(0, Number(item?.progress?.elapsedMs) || 0),
				timeoutMs: Math.max(0, Number(item?.progress?.timeoutMs) || 0),
				validationKind: String(item?.progress?.validationKind || '').trim(),
				validationGuidance: String(item?.progress?.validationGuidance || '').trim(),
			}
		}
		return null
	}

	function isProgressTraceGroup(item, group) {
		const stage = String(item?.progress?.stage || '').trim()
		if (!stage) return false
		if (group === 'runtime') return /_heartbeat$/.test(stage) && stage !== 'model_wait_heartbeat'
		if (group === 'planning') return stage === 'model_wait_heartbeat' || !/_heartbeat$/.test(stage)
		return false
	}

	function extractCandidateDiagnostics(modelItems) {
		const sections = []
		for (const item of [...(Array.isArray(modelItems) ? modelItems : [])].reverse()) {
			const prompt = extractPromptParts(item?.io?.request || {}).user
			const match = String(prompt || '').match(/<candidate_diagnostics>[\s\S]*?<\/candidate_diagnostics>/)
			if (!match) continue
			sections.push(clampText(match[0], 1200))
			if (sections.length >= 2) break
		}
		return sections
	}

	function sanitizeConfigForExport(config) {
		if (!config || typeof config !== 'object') return null
		return {
			textLLM: sanitizeEndpointForExport(config.textLLM),
			multiModalLLM: sanitizeEndpointForExport(config.multiModalLLM),
			visionService: sanitizeEndpointForExport(config.visionService),
			maxSteps: Number(config.maxSteps || 0),
			inputMode: String(config.inputMode || ''),
			experimentalIncludeAllTabs: !!config.experimentalIncludeAllTabs,
			planning: normalizePlanningContextForUi(config.planning),
			visionDisabledDomains: Array.isArray(config.visionDisabledDomains)
				? config.visionDisabledDomains.slice(0, 80)
				: [],
		}
	}

	function sanitizeEndpointForExport(endpoint) {
		return {
			baseURL: String(endpoint?.baseURL || ''),
			model: String(endpoint?.model || ''),
			timeoutMs: Number(endpoint?.timeoutMs || 0),
			stream: endpoint?.stream !== false,
			apiKeyMasked: maskSecret(String(endpoint?.apiKey || '')),
		}
	}

	function maskSecret(secret) {
		if (!secret) return ''
		if (secret.length <= 8) return '*'.repeat(secret.length)
		return `${secret.slice(0, 3)}***${secret.slice(-3)}(len:${secret.length})`
	}

	function cloneJson(value) {
		try {
			return JSON.parse(JSON.stringify(value ?? null))
		} catch (_) {
			return null
		}
	}

	function extractPromptParts(request) {
		const messages = Array.isArray(request?.messages) ? request.messages : []
		const systemMessage = messages.find((msg) => String(msg?.role || '') === 'system')
		const userMessage = [...messages].reverse().find((msg) => String(msg?.role || '') === 'user')
		return {
			system: messageContentToText(systemMessage?.content),
			user: messageContentToText(userMessage?.content),
		}
	}

	function messageContentToText(content) {
		if (typeof content === 'string') return content
		if (!Array.isArray(content)) return ''
		return content
			.map((item) => {
				if (!item || typeof item !== 'object') return ''
				if (typeof item.text === 'string') return item.text
				if (item.type === 'image_url') return '[image]'
				return ''
			})
			.filter(Boolean)
			.join('\n')
	}

	function renderHistoryList() {
		if (state.view.name !== 'history') return
		el.historyList.innerHTML = ''
		if (!state.sessions.length) {
			el.historyList.innerHTML = '<div class="sp-empty">暂无历史会话。</div>'
			return
		}

		state.sessions.forEach((session) => {
			const card = document.createElement('div')
			card.className = 'sp-card sp-history-item'
			card.setAttribute('data-session-id', session.id)
			const safeTask = escapeHtml(session.task || session.latestTask || '')
			const statusCode = String(session.status || 'error')
			const safeStatus = escapeHtml(statusCode)
			const statusLabel = escapeHtml(STATUS_LABELS[statusCode] || statusCode)
			const historyTraceItems = Array.isArray(session.traceItems) ? session.traceItems : []
			const historyDiagnostics = buildSessionDiagnostics(historyTraceItems)
			const historyResultSummary = resolveSessionResultSummary(
				session,
				historyTraceItems,
				historyDiagnostics,
				String(session.activityText || '')
			)
			const steps = historyTraceItems.length
			const turns = Number(session.turnCount || inferTurnCount(session))
			const resultPreview = buildHistoryResultPreview(historyResultSummary)
			const safeResultPreview = escapeHtml(resultPreview)
			card.innerHTML = `
				<div class="sp-history-main" data-action="view">
					<div class="sp-history-title" title="${safeTask}">${safeTask}</div>
					<div class="sp-history-meta">
						<span class="sp-badge ${safeStatus}">${statusLabel}</span>${formatDate(session.createdAt)} · ${turns} 轮 · ${steps} 条
					</div>
					${safeResultPreview ? `<div class="sp-history-result" title="${safeResultPreview}">${safeResultPreview}</div>` : ''}
				</div>
				<div class="sp-history-actions">
					<button class="sp-btn sp-history-action" type="button" data-action="rerun" title="再次执行">再次执行</button>
					<button class="sp-btn sp-history-action danger" type="button" data-action="delete" title="删除">删除</button>
				</div>
			`
			el.historyList.appendChild(card)
		})
	}

	function buildHistoryResultPreview(summary) {
		if (!summary || typeof summary !== 'object') return ''
		const parts = [
			String(summary.headline || '').trim(),
			String(summary.reason || '').trim() ? `原因：${String(summary.reason || '').trim()}` : '',
			formatHistoryIssuePreview(summary.issues),
		].filter(Boolean)
		return clampText(parts.join(' '), 180)
	}

	function formatHistoryIssuePreview(issues) {
		const items = (Array.isArray(issues) ? issues : []).filter((item) => item && (item.summary || item.label))
		if (!items.length) return ''
		return `重点：${items.slice(0, 2).map((item) => [
			String(item.label || '未命名项').trim(),
			String(item.statusLabel || item.status || '').trim(),
			String(item.summary || '').trim(),
		].filter(Boolean).join(' ')).join('；')}`
	}

	function renderHistoryDetail() {
		if (state.view.name !== 'history-detail') return
		const session = state.sessions.find((record) => record.id === state.view.sessionId)
		if (!session) {
			el.copyHistorySession.disabled = true
			el.downloadHistorySession.disabled = true
			state.view = { name: 'history' }
			render()
			return
		}

		el.clearHistoryAllDetail.disabled = !state.sessions.length
		el.copyHistorySession.disabled = false
		el.downloadHistorySession.disabled = false
		const turns = Number(session.turnCount || inferTurnCount(session))
		el.historyDetailTaskValue.textContent = `${session.task || session.latestTask || ''}（${turns} 轮）`
		el.historyDetailList.innerHTML = ''
		const traceItems = Array.isArray(session.traceItems) ? session.traceItems : []
		const historyDiagnostics = buildSessionDiagnostics(traceItems)
		const historyActivityText = String(session.activityText || '')
		const resultSummary = renderResultSummaryCard(
			resolveSessionResultSummary(session, traceItems, historyDiagnostics, historyActivityText, {
				sensitiveValues: collectExportSensitiveValues({ session, traceItems, diagnostics: historyDiagnostics, activityText: historyActivityText }),
			})
		)
		if (resultSummary) el.historyDetailList.appendChild(resultSummary)
		if (!traceItems.length) {
			if (!resultSummary) el.historyDetailList.innerHTML = '<div class="sp-empty">该会话没有轨迹记录。</div>'
			return
		}

		traceItems.forEach((item) => {
			el.historyDetailList.appendChild(renderTraceCard(item))
		})
	}

	async function persistSessionIfNeeded(prev, next, payloadSessionId) {
		const completed =
			prev === 'running' && (next === 'completed' || next === 'error' || next === 'stopped')
		if (!completed) return
		if (!state.currentTask) return
		if (!hasPersistableSessionPayload()) return
		const sessionId = String(payloadSessionId || currentSessionId || '')
		if (sessionId && sessionId === lastPersistedSessionId) return

		if (activeRun?.sessionId === sessionId) {
			activeRun = null
		}
		if (!currentConversationId) {
			ensureConversation(state.currentTask)
		}
		const traceItems = (Array.isArray(state.traceItems) ? state.traceItems : []).slice(-600)
		const diagnostics = buildSessionDiagnostics(traceItems)
		const sensitiveValues = collectExportSensitiveValues({
			session: state,
			traceItems,
			diagnostics,
			activityText: state.activityText,
		})
		const resultSummary = resolveSessionResultSummary(
			{
				status: state.status,
				activityText: state.activityText,
				resultSummary: state.resultSummary,
				traceItems,
			},
			traceItems,
			diagnostics,
			state.activityText,
			{ sensitiveValues }
		)
		const record = {
			id: currentConversationId,
			task: currentConversationTitle || state.currentTask,
			latestTask: state.currentTask,
			status: state.status,
			createdAt: currentConversationStartedAt || Date.now(),
			updatedAt: Date.now(),
			turnCount: Math.max(currentConversationTurnCount, inferTurnCount({ traceItems })),
			runtimeSessionId: sessionId,
			activityText: state.activityText,
			planItems: cloneJson(state.planItems || []),
			resultSummary: cloneJson(resultSummary || null),
			traceItems,
		}
		const existingIndex = state.sessions.findIndex((item) => item.id === record.id)
		if (existingIndex >= 0) {
			state.sessions[existingIndex] = {
				...state.sessions[existingIndex],
				...record,
			}
			state.sessions = sortSessions(state.sessions)
		} else {
			state.sessions = sortSessions([record, ...state.sessions]).slice(0, 120)
		}
		lastPersistedSessionId = sessionId
		await persistSessions()
	}

	function hasPersistableSessionPayload() {
		const hasTraceItems = Array.isArray(state.traceItems) && state.traceItems.length > 0
		const hasResultSummary = !!state.resultSummary && typeof state.resultSummary === 'object'
		const hasPlanItems = Array.isArray(state.planItems) && state.planItems.length > 0
		return hasTraceItems || hasResultSummary || hasPlanItems
	}

	async function loadSessions() {
		const data = await chrome.storage.local.get(STORAGE_KEY_SESSIONS)
		const list = Array.isArray(data[STORAGE_KEY_SESSIONS]) ? data[STORAGE_KEY_SESSIONS] : []
		state.sessions = sortSessions(list)
	}

	async function persistSessions() {
		await chrome.storage.local.set({ [STORAGE_KEY_SESSIONS]: state.sessions })
	}

	function ensureConversation(task) {
		if (currentConversationId) return
		currentConversationId = createLocalId('c')
		currentConversationStartedAt = Date.now()
		currentConversationTitle = String(task || '').trim()
		currentConversationTurnCount = 0
	}

	function resetConversationState() {
		currentConversationId = ''
		currentConversationStartedAt = 0
		currentConversationTitle = ''
		currentConversationTurnCount = 0
		activeRun = null
		lastPersistedSessionId = ''
	}

	function startNewConversation() {
		if (state.status === 'running') {
			state.activityText = '当前任务执行中，请先停止后再新建会话。'
			render()
			return
		}
		resetConversationState()
		currentSessionId = ''
		state.currentTask = ''
		state.traceItems = []
		state.planItems = []
		state.resultSummary = null
		state.status = 'idle'
		state.activityText = '已新建会话，等待任务...'
		state.view = { name: 'chat' }
		render()
	}

	function createLocalId(prefix) {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
	}

	function mergeTraceItemsFromRuntime(payload) {
		if (!Array.isArray(payload?.traceItems)) return state.traceItems
		if (activeRun && payload?.sessionId && payload.sessionId === activeRun.sessionId) {
			const prefix = state.traceItems.slice(0, Math.max(0, activeRun.startIndex))
			return [...prefix, ...payload.traceItems]
		}
		return payload.traceItems
	}

	function inferTurnCount(session) {
		const trace = Array.isArray(session?.traceItems) ? session.traceItems : []
		if (!trace.length) return 0
		const count = trace.filter((item) => item?.kind === 'user').length
		return Math.max(1, count || 1)
	}

	function sortSessions(list) {
		return [...list].sort(
			(a, b) =>
				Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0)
		)
	}

	function renderComposer() {
		const isRunning = state.status === 'running'
		const anyTesting = connectivity.text.testing || connectivity.mm.testing
		const hasInput = String(el.taskInput.value || '').trim().length > 0
		el.sendStop.disabled = anyTesting || taskStopping || (!taskStarting && !isRunning && !hasInput)
		el.taskInput.disabled = isRunning || taskStarting || taskStopping

		if (isRunning || taskStarting || taskStopping) {
			el.sendStop.classList.add('stop')
			el.sendStop.setAttribute('aria-label', '停止任务')
			el.sendStop.innerHTML =
				'<svg id="sp-send-stop-icon" class="sp-icon-svg" viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.6" /></svg>'
			return
		}

		el.sendStop.classList.remove('stop')
		el.sendStop.setAttribute('aria-label', '发送任务')
		el.sendStop.innerHTML =
			'<svg id="sp-send-stop-icon" class="sp-icon-svg" viewBox="0 0 24 24"><path d="M4 12h13" /><path d="m13 5 7 7-7 7" /></svg>'
	}

	function autoResizeTaskInput() {
		el.taskInput.style.height = '88px'
	}

	function renderConnectivity() {
		renderSingleConnectivity('text', el.testTextConn, el.testTextResult)
		renderSingleConnectivity('mm', el.testMmConn, el.testMmResult)
	}

	function renderSingleConnectivity(kind, buttonEl, resultEl) {
		const item = connectivity[kind]
		buttonEl.disabled = state.status === 'running' || item.testing
		buttonEl.textContent = item.testing ? '检测中...' : '检测'
		resultEl.className = `sp-test-result ${item.status || ''}`.trim()
		resultEl.textContent = item.message || ''
	}

	async function testModelConnectivity(kind) {
		await hydrateModelOptions(kind, { force: false })
		const endpoint = getEndpointFromForm(kind)
		if (!isValidHttpUrl(endpoint.baseURL)) {
			setConnectivityResult(kind, 'error', 'Base URL 不合法')
			renderConnectivity()
			return
		}
		if (!endpoint.apiKey) {
			setConnectivityResult(kind, 'error', 'API Key 不能为空')
			renderConnectivity()
			return
		}
		if (!endpoint.model) {
			setConnectivityResult(kind, 'error', '请先选择模型')
			renderConnectivity()
			return
		}

		connectivity[kind].testing = true
		setConnectivityResult(kind, 'pending', '正在检测...')
		renderConnectivity()

		try {
			let summary = ''
			if (kind === 'text') {
				summary = await runTextDialogProbe(endpoint)
			} else {
				summary = await runVisionProbe(endpoint)
			}
			setConnectivityResult(kind, 'success', summary || '检测成功')
		} catch (error) {
			setConnectivityResult(kind, 'error', formatError(error))
		} finally {
			connectivity[kind].testing = false
			renderConnectivity()
		}
	}

	function setConnectivityResult(kind, status, message) {
		const item = connectivity[kind]
		item.status = status || ''
		item.message = normalizeConnectivityMessage(status, message)
		if (item.clearTimer) {
			clearTimeout(item.clearTimer)
			item.clearTimer = 0
		}
		if (status === 'success' || status === 'error') {
			item.clearTimer = setTimeout(() => {
				item.status = ''
				item.message = ''
				item.clearTimer = 0
				renderConnectivity()
			}, 5000)
		}
	}

	function normalizeConnectivityMessage(status, message) {
		const raw = String(message || '').trim()
		if (!raw) return ''
		if (status === 'pending') return '检测中...'
		if (status === 'success') return '检测成功'
		if (status === 'error') {
			const short = raw.replace(/^Error:\s*/i, '').slice(0, 18)
			return short ? `检测失败: ${short}` : '检测失败'
		}
		return raw.slice(0, 22)
	}

	function getEndpointFromForm(kind) {
		const get = (id) => String(document.getElementById(id)?.value || '').trim()
		if (kind === 'text') {
			return {
				baseURL: get('cfg-text-base'),
				model: get('cfg-text-model'),
				apiKey: get('cfg-text-key'),
			}
		}
		return {
			baseURL: get('cfg-mm-base'),
			model: get('cfg-mm-model'),
			apiKey: get('cfg-mm-key'),
		}
	}

	async function fetchModelsList(endpoint) {
		const baseURL = normalizeBaseUrl(endpoint.baseURL)
		const url = `${baseURL}/models`
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), 10000)
		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: { Authorization: `Bearer ${endpoint.apiKey}` },
				signal: controller.signal,
			})
			if (!response.ok) {
				const body = await safeReadText(response)
				const detail = body ? ` ${body.slice(0, 140)}` : ''
				throw new Error(`HTTP ${response.status}${detail}`)
			}
			const data = await response.json()
			return Array.isArray(data?.data)
				? data.data.map((item) => String(item?.id || '').trim()).filter(Boolean)
				: []
		} finally {
			clearTimeout(timer)
		}
	}

	async function hydrateModelOptions(kind, options = {}) {
		const endpoint = getEndpointFromForm(kind)
		if (!isValidHttpUrl(endpoint.baseURL) || !endpoint.apiKey) return
		const key = `${normalizeBaseUrl(endpoint.baseURL)}|${endpoint.apiKey}`
		const bucket = modelCatalog[kind]
		if (bucket.loading) return
		if (!options.force && bucket.cacheKey === key && bucket.items.length) return
		bucket.loading = true
		try {
			const items = await fetchModelsList(endpoint)
			if (!items.length) return
			bucket.cacheKey = key
			bucket.items = items
			applyModelsToSelect(kind, items, endpoint.model)
		} finally {
			bucket.loading = false
		}
	}

	function applyModelsToSelect(kind, modelIds, preferModel) {
		const selectEl = kind === 'text' ? el.cfgTextModel : el.cfgMmModel
		const currentValue = String(preferModel || selectEl.value || '').trim()
		selectEl.innerHTML = ''
		modelIds.forEach((id) => {
			const option = document.createElement('option')
			option.value = id
			option.textContent = id
			selectEl.appendChild(option)
		})
		if (currentValue && !modelIds.includes(currentValue)) {
			const customOption = document.createElement('option')
			customOption.value = currentValue
			customOption.textContent = `${currentValue}（当前）`
			selectEl.appendChild(customOption)
		}
		selectEl.value = currentValue || modelIds[0] || ''
	}

	async function runTextDialogProbe(endpoint) {
		const content = await requestChatCompletion(endpoint, [
			{ role: 'system', content: '你是连通性检测助手。请简短回复“ok”。' },
			{ role: 'user', content: '请回复：ok，并用一句话说明你收到请求。' },
		])
		const text = extractAssistantText(content)
		if (!text) throw new Error('返回内容为空')
		return '检测成功'
	}

	async function runVisionProbe(endpoint) {
		const imageDataUrl = createVisionTestImageDataUrl()
		const content = await requestChatCompletion(endpoint, [
			{ role: 'system', content: '你是图像识别助手，请简洁描述图片。' },
			{
				role: 'user',
				content: [
					{ type: 'text', text: '请描述这张测试图里看到的元素。' },
					{ type: 'image_url', image_url: { url: imageDataUrl } },
				],
			},
		])
		const text = extractAssistantText(content)
		if (!text) throw new Error('图像分析返回为空')
		return '检测成功'
	}

	async function requestChatCompletion(endpoint, messages) {
		const baseURL = normalizeBaseUrl(endpoint.baseURL)
		const url = `${baseURL}/chat/completions`
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), 15000)
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${endpoint.apiKey}`,
				},
				body: JSON.stringify({
					model: endpoint.model,
					messages,
					temperature: 0.2,
				}),
				signal: controller.signal,
			})
			if (!response.ok) {
				const body = await safeReadText(response)
				const detail = body ? ` ${body.slice(0, 180)}` : ''
				throw new Error(`HTTP ${response.status}${detail}`)
			}
			const data = await response.json()
			return data?.choices?.[0]?.message?.content
		} finally {
			clearTimeout(timer)
		}
	}

	function createVisionTestImageDataUrl() {
		const canvas = document.createElement('canvas')
		canvas.width = 240
		canvas.height = 140
		const ctx = canvas.getContext('2d')
		if (!ctx) throw new Error('当前环境不支持 canvas')
		ctx.fillStyle = '#eef6ff'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		ctx.fillStyle = '#0f766e'
		ctx.fillRect(16, 16, 96, 96)
		ctx.fillStyle = '#f59e0b'
		ctx.beginPath()
		ctx.arc(172, 56, 30, 0, Math.PI * 2)
		ctx.fill()
		ctx.fillStyle = '#111827'
		ctx.font = 'bold 32px Arial'
		ctx.fillText('42', 152, 122)
		ctx.fillStyle = '#334155'
		ctx.font = '14px Arial'
		ctx.fillText('Vision Test', 16, 126)
		return canvas.toDataURL('image/png')
	}

	function extractAssistantText(content) {
		if (typeof content === 'string') return content.trim()
		if (Array.isArray(content)) {
			return content
				.map((item) => {
					if (!item) return ''
					if (typeof item.text === 'string') return item.text
					if (item.text && typeof item.text.value === 'string') return item.text.value
					return ''
				})
				.join('\n')
				.trim()
		}
		if (content && typeof content === 'object') {
			if (typeof content.text === 'string') return content.text.trim()
			if (content.text && typeof content.text.value === 'string') return content.text.value.trim()
		}
		return ''
	}

	function getConfigFromForm() {
		const get = (id) => String(document.getElementById(id)?.value || '').trim()
		const maxStepsRaw = Number(get('cfg-max-steps'))
		const textTimeoutMs = normalizeTextModelTimeoutMsForUi(get('cfg-text-timeout-sec'))
		const planning = normalizePlanningContextForUi({
			fullObservationMaxChars: get('cfg-full-observation-max-chars'),
			compactObservationMaxChars: get('cfg-compact-observation-max-chars'),
			compactElementThreshold: get('cfg-compact-element-threshold'),
			compactRawCandidateThreshold: get('cfg-compact-raw-candidate-threshold'),
		})
		const mmConfig = {
			baseURL: get('cfg-mm-base'),
			model: get('cfg-mm-model'),
			apiKey: get('cfg-mm-key'),
		}
		return {
			textLLM: {
				baseURL: get('cfg-text-base'),
				model: get('cfg-text-model'),
				apiKey: get('cfg-text-key'),
				timeoutMs: textTimeoutMs,
				stream: true,
			},
			multiModalLLM: mmConfig,
			// 兼容后台双回退链路：视觉服务默认复用多模态配置
			visionService: { ...mmConfig },
			maxSteps:
				Number.isFinite(maxStepsRaw) && maxStepsRaw > 0
					? Math.max(1, Math.min(200, Math.floor(maxStepsRaw)))
					: 100,
			inputMode: get('cfg-input-mode') === 'standard' ? 'standard' : 'realistic',
			experimentalIncludeAllTabs: get('cfg-all-tabs') === 'true',
			planning,
			visionDisabledDomains: get('cfg-vision-disabled-domains')
				.split(/[\n,，]+/)
				.map((item) => item.trim())
				.filter(Boolean),
		}
	}

	function setConfigToForm(config) {
		setValue('cfg-text-base', config.textLLM?.baseURL || '')
		setValue('cfg-text-key', config.textLLM?.apiKey || '')
		setValue('cfg-text-timeout-sec', String(Math.round(normalizeTextModelTimeoutMsForUi(config.textLLM?.timeoutMs) / 1000)))
		setValue('cfg-mm-base', config.multiModalLLM?.baseURL || '')
		setValue('cfg-mm-key', config.multiModalLLM?.apiKey || '')
		setModelValue(el.cfgTextModel, config.textLLM?.model || '')
		setModelValue(el.cfgMmModel, config.multiModalLLM?.model || '')
		setValue('cfg-max-steps', String(config.maxSteps || 100))
		setValue('cfg-input-mode', config.inputMode === 'standard' ? 'standard' : 'realistic')
		setValue('cfg-all-tabs', config.experimentalIncludeAllTabs ? 'true' : 'false')
		setPlanningContextToForm(normalizePlanningContextForUi(config.planning))
		setValue(
			'cfg-vision-disabled-domains',
			Array.isArray(config.visionDisabledDomains) ? config.visionDisabledDomains.join('\n') : ''
		)
		hydrateModelOptions('text').catch(() => {})
		hydrateModelOptions('mm').catch(() => {})
	}

	function setPlanningContextToForm(planning) {
		const normalized = normalizePlanningContextForUi(planning)
		setValue('cfg-full-observation-max-chars', String(normalized.fullObservationMaxChars))
		setValue('cfg-compact-observation-max-chars', String(normalized.compactObservationMaxChars))
		setValue('cfg-compact-element-threshold', String(normalized.compactElementThreshold))
		setValue('cfg-compact-raw-candidate-threshold', String(normalized.compactRawCandidateThreshold))
	}

	function normalizePlanningContextForUi(planning) {
		const raw = planning && typeof planning === 'object' ? planning : {}
		const full = clampIntegerForUi(
			raw.fullObservationMaxChars,
			DEFAULT_PLANNING_CONTEXT.fullObservationMaxChars,
			PLANNING_CONTEXT_LIMITS.fullObservationMaxChars.min,
			PLANNING_CONTEXT_LIMITS.fullObservationMaxChars.max
		)
		const compact = clampIntegerForUi(
			raw.compactObservationMaxChars,
			DEFAULT_PLANNING_CONTEXT.compactObservationMaxChars,
			PLANNING_CONTEXT_LIMITS.compactObservationMaxChars.min,
			Math.min(PLANNING_CONTEXT_LIMITS.compactObservationMaxChars.max, full)
		)
		const elementThreshold = clampIntegerForUi(
			raw.compactElementThreshold,
			DEFAULT_PLANNING_CONTEXT.compactElementThreshold,
			PLANNING_CONTEXT_LIMITS.compactElementThreshold.min,
			PLANNING_CONTEXT_LIMITS.compactElementThreshold.max
		)
		const rawThreshold = clampIntegerForUi(
			raw.compactRawCandidateThreshold,
			DEFAULT_PLANNING_CONTEXT.compactRawCandidateThreshold,
			PLANNING_CONTEXT_LIMITS.compactRawCandidateThreshold.min,
			PLANNING_CONTEXT_LIMITS.compactRawCandidateThreshold.max
		)
		return {
			fullObservationMaxChars: full,
			compactObservationMaxChars: compact,
			compactElementThreshold: elementThreshold,
			compactRawCandidateThreshold: rawThreshold,
		}
	}

	function normalizeTextModelTimeoutMsForUi(value) {
		const raw = Number(value)
		const ms = raw > 1000 ? raw : raw * 1000
		return clampIntegerForUi(ms, DEFAULT_TEXT_MODEL_TIMEOUT_MS, 8000, 180000)
	}

	function clampIntegerForUi(value, fallback, min, max) {
		const number = Number(value)
		const base = Number.isFinite(number) && number > 0 ? number : Number(fallback)
		return Math.max(min, Math.min(max, Math.floor(base)))
	}

	function setValue(id, value) {
		const node = document.getElementById(id)
		if (node && 'value' in node) node.value = value
	}

	function setModelValue(selectEl, value) {
		const val = String(value || '').trim()
		if (!val) {
			selectEl.value = ''
			return
		}
		const exists = Array.from(selectEl.options).some((opt) => opt.value === val)
		if (!exists) {
			const option = document.createElement('option')
			option.value = val
			option.textContent = `${val}（当前）`
			selectEl.appendChild(option)
		}
		selectEl.value = val
	}

	function toggleSecretInput(inputEl) {
		inputEl.type = inputEl.type === 'password' ? 'text' : 'password'
	}

	function normalizeBaseUrl(url) {
		return String(url || '').trim().replace(/\/+$/, '')
	}

	function isValidHttpUrl(value) {
		try {
			const parsed = new URL(String(value || '').trim())
			return parsed.protocol === 'https:' || parsed.protocol === 'http:'
		} catch (_) {
			return false
		}
	}

	async function safeReadText(response) {
		try {
			return await response.text()
		} catch (_) {
			return ''
		}
	}

	function formatError(error) {
		if (error?.name === 'AbortError') return '请求超时'
		return String(error?.message || error || '未知错误')
	}

	async function getActiveTabContext() {
		try {
			const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
			const tab = tabs[0]
			if (!tab?.id || !tab?.windowId) return null
			return { tabId: tab.id, windowId: tab.windowId }
		} catch (_) {
			return null
		}
	}

	function sendRuntimeMessage(message) {
		return new Promise((resolve) => {
			chrome.runtime.sendMessage(message, (response) => {
				if (chrome.runtime.lastError) {
					resolve({
						ok: false,
						error: chrome.runtime.lastError.message || '消息发送失败。',
					})
					return
				}
				resolve(response)
			})
		})
	}

	function toggle(node, active) {
		node.classList.toggle('active', !!active)
	}

	function mustGet(id) {
		const node = document.getElementById(id)
		if (!node) throw new Error(`missing element: ${id}`)
		return node
	}

	function formatDate(value) {
		const ts = Number(value || 0)
		if (!ts) return '-'
		const d = new Date(ts)
		const yyyy = d.getFullYear()
		const mm = String(d.getMonth() + 1).padStart(2, '0')
		const dd = String(d.getDate()).padStart(2, '0')
		const hh = String(d.getHours()).padStart(2, '0')
		const min = String(d.getMinutes()).padStart(2, '0')
		return `${yyyy}-${mm}-${dd} ${hh}:${min}`
	}

	function escapeHtml(text) {
		return String(text || '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;')
	}
})()
