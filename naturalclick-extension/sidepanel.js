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
		cfgMmBase: mustGet('cfg-mm-base'),
		cfgMmModel: mustGet('cfg-mm-model'),
		cfgMmKey: mustGet('cfg-mm-key'),
		cfgInputMode: mustGet('cfg-input-mode'),
		cfgVisionDisabledDomains: mustGet('cfg-vision-disabled-domains'),
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
			currentConfig = config
			const result = await sendRuntimeMessage({ type: TYPES.SAVE_CONFIG, config })
			if (!result?.ok) {
				state.status = 'error'
				state.activityText = result?.error || '保存配置失败。'
				render()
				return
			}
			state.activityText = '配置已保存。'
			state.view = { name: 'chat' }
			render()
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
				Object.assign(state, {
					status: payload.status || state.status,
					currentTask: payload.currentTask || state.currentTask,
					activityText: payload.activityText || state.activityText,
					planItems: Array.isArray(payload.planItems) ? payload.planItems : state.planItems,
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
		await sendRuntimeMessage({ type: TYPES.CONFIRM_RESPONSE, confirmId, approved: !!approved })
	}

	function showAskUserDialog(payload) {
		if (activeAskResolve) {
			activeAskResolve({ ok: false, error: '新的用户确认请求覆盖了上一条请求。' })
			activeAskResolve = null
		}
		const question = String(payload.question || payload.description || '').trim()
		const title = String(payload.title || 'Agent 需要你确认').trim()
		const placeholder = String(payload.placeholder || '').trim()
		el.askTitle.textContent = title
		el.askDesc.textContent = question
		el.askInput.value = placeholder
		el.askOverlay.style.display = 'flex'
		state.activityText = question ? `等待用户回答：${question}` : '等待用户回答...'
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
		await copyText(JSON.stringify(payload, null, 2))
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
		const text = JSON.stringify(payload, null, 2)
		const fileName = buildExportFileName(payload)
		downloadTextFile(fileName, text)
		state.activityText = `会话信息已下载为 TXT（${payload.session?.traceCount || 0} 条轨迹）。`
		render()
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
		const session = payload?.session || {}
		const stamp = new Date()
			.toISOString()
			.replace(/[:.]/g, '-')
			.replace('T', '_')
			.replace('Z', '')
		const task = sanitizeFileName(session.latestTask || session.task || 'session').slice(0, 48)
		const id = sanitizeFileName(session.id || 'unknown').slice(0, 28)
		return `naturalclick_${stamp}_${id}_${task}.txt`
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
			activityText: String(session?.activityText || state.activityText || ''),
			planItems: cloneJson(session?.planItems || []),
			diagnostics: buildSessionDiagnostics(traceItems),
			traceItems: cloneJson(traceItems),
		}
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
		return {
			modelCallCount: modelItems.length,
			modelErrorCount: modelItems.filter((item) => item.kind === 'error').length,
			timeoutCount: items.filter((item) => /超时|timeout/i.test(`${item?.title || ''} ${item?.detail || ''}`)).length,
			loopGuardCount: items.filter((item) => /循环保护|loop_guard/i.test(`${item?.title || ''} ${item?.detail || ''} ${item?.action?.name || ''}`)).length,
			verificationFailureCount: items.filter((item) => /校验失败|verify/i.test(`${item?.title || ''} ${item?.detail || ''} ${item?.action?.name || ''}`)).length,
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
			visionDisabledDomains: Array.isArray(config.visionDisabledDomains)
				? config.visionDisabledDomains.slice(0, 80)
				: [],
		}
	}

	function sanitizeEndpointForExport(endpoint) {
		return {
			baseURL: String(endpoint?.baseURL || ''),
			model: String(endpoint?.model || ''),
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
			const steps = Array.isArray(session.traceItems) ? session.traceItems.length : 0
			const turns = Number(session.turnCount || inferTurnCount(session))
			card.innerHTML = `
				<div class="sp-history-main" data-action="view">
					<div class="sp-history-title" title="${safeTask}">${safeTask}</div>
					<div class="sp-history-meta">
						<span class="sp-badge ${safeStatus}">${statusLabel}</span>${formatDate(session.createdAt)} · ${turns} 轮 · ${steps} 条
					</div>
				</div>
				<div class="sp-history-actions">
					<button class="sp-btn sp-history-action" type="button" data-action="rerun" title="再次执行">再次执行</button>
					<button class="sp-btn sp-history-action danger" type="button" data-action="delete" title="删除">删除</button>
				</div>
			`
			el.historyList.appendChild(card)
		})
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
		if (!traceItems.length) {
			el.historyDetailList.innerHTML = '<div class="sp-empty">该会话没有轨迹记录。</div>'
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
		if (!Array.isArray(state.traceItems) || !state.traceItems.length) return
		const sessionId = String(payloadSessionId || currentSessionId || '')
		if (sessionId && sessionId === lastPersistedSessionId) return

		if (activeRun?.sessionId === sessionId) {
			activeRun = null
		}
		if (!currentConversationId) {
			ensureConversation(state.currentTask)
		}
		const record = {
			id: currentConversationId,
			task: currentConversationTitle || state.currentTask,
			latestTask: state.currentTask,
			status: state.status,
			createdAt: currentConversationStartedAt || Date.now(),
			updatedAt: Date.now(),
			turnCount: Math.max(currentConversationTurnCount, inferTurnCount({ traceItems: state.traceItems })),
			runtimeSessionId: sessionId,
			activityText: state.activityText,
			planItems: cloneJson(state.planItems || []),
			traceItems: state.traceItems.slice(-600),
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
			visionDisabledDomains: get('cfg-vision-disabled-domains')
				.split(/[\n,，]+/)
				.map((item) => item.trim())
				.filter(Boolean),
		}
	}

	function setConfigToForm(config) {
		setValue('cfg-text-base', config.textLLM?.baseURL || '')
		setValue('cfg-text-key', config.textLLM?.apiKey || '')
		setValue('cfg-mm-base', config.multiModalLLM?.baseURL || '')
		setValue('cfg-mm-key', config.multiModalLLM?.apiKey || '')
		setModelValue(el.cfgTextModel, config.textLLM?.model || '')
		setModelValue(el.cfgMmModel, config.multiModalLLM?.model || '')
		setValue('cfg-max-steps', String(config.maxSteps || 100))
		setValue('cfg-input-mode', config.inputMode === 'standard' ? 'standard' : 'realistic')
		setValue('cfg-all-tabs', config.experimentalIncludeAllTabs ? 'true' : 'false')
		setValue(
			'cfg-vision-disabled-domains',
			Array.isArray(config.visionDisabledDomains) ? config.visionDisabledDomains.join('\n') : ''
		)
		hydrateModelOptions('text').catch(() => {})
		hydrateModelOptions('mm').catch(() => {})
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
