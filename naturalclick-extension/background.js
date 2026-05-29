importScripts(
	'shared/protocol.js',
	'shared/action-contract.js',
	'shared/control-semantics.js',
	'background/constants.js',
	'background/utils.js',
	'background/config.js',
	'background/initial-navigation.js',
	'background/tools.js',
	'background/planner-context.js',
	'background/planner-fastpath.js',
	'background/planner-validation.js',
	'background/planner-model-client.js',
	'background/planner-decision.js',
	'background/planner-prompt.js',
	'background/task-intent.js',
	'background/login-workflow.js',
	'background/search-workflow-state.js',
	'background/search-workflow-history.js',
	'background/search-workflow.js',
	'background/workflows.js',
	'background/planner.js',
	'background/confirmation.js',
	'background/vision.js',
	'background/executor.js',
	'background/verifier.js',
	'background/loop-guard.js',
	'background/session-records.js',
	'background/session-recovery.js',
	'background/session-timing.js',
	'background/session-lifecycle.js',
	'background/session-engine.js'
)

const { TYPES: MSG_TYPES, STORAGE_KEY_CONFIG } = globalThis.NC_BG_CONSTANTS
const { loadConfig, normalizeConfig } = globalThis.NC_BG_CONFIG
const { generateId, sendTabMessage, createTabAndWaitLoaded } = globalThis.NC_BG_UTILS
const { runSession, publishSession } = globalThis.NC_BG_SESSION_ENGINE
const { handleConfirmationResponse } = globalThis.NC_BG_CONFIRMATION
const { deriveInitialAutomationTarget, isInitialTargetLocation } = globalThis.NC_BG_INITIAL_NAVIGATION
const CONTENT_SCRIPT_FILES = [
	'shared/protocol.js',
	'shared/action-contract.js',
	'shared/control-semantics.js',
	'content/visual.js',
	'content/semantics.js',
	'content/observer.js',
	'content/verification.js',
	'content/action-state.js',
	'content/action-input.js',
	'content/action-scroll.js',
	'content/action-options.js',
	'content/action-cascader.js',
	'content/action-select.js',
	'content/actions.js',
	'content.js',
]

/** @type {Map<string, any>} */
const sessions = new Map()
let startInFlight = false
let startCancelRequested = false

setupSidePanelBehavior()

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const run = async () => {
		switch (message?.type) {
			case MSG_TYPES.GET_CONFIG: {
				const config = await loadConfig()
				sendResponse({ ok: true, config })
				return
			}
			case MSG_TYPES.SAVE_CONFIG: {
				const config = normalizeConfig(message.config || {})
				await chrome.storage.local.set({ [STORAGE_KEY_CONFIG]: config })
				sendResponse({ ok: true, config })
				return
			}
			case MSG_TYPES.START_TASK: {
				const result = await startTask(message, sender)
				sendResponse(result)
				return
			}
			case MSG_TYPES.STOP_TASK: {
				const result = stopTask(message)
				sendResponse(result)
				return
			}
			case MSG_TYPES.CONFIRM_RESPONSE: {
				const result = handleConfirmationResponse(message.confirmId, message.approved)
				sendResponse(result)
				return
			}
			default:
				sendResponse({ ok: false, error: 'Unknown message type' })
		}
	}

	run().catch((error) => {
		sendResponse({ ok: false, error: String(error) })
	})
	return true
})

async function startTask(message, sender) {
	const controllerTabId = Number(message?.controllerTabId || sender.tab?.id)
	const windowId = Number(message?.windowId || sender.tab?.windowId)
	if (!controllerTabId || !windowId) {
		return { ok: false, error: '无法识别当前标签页。' }
	}

	const task = String(message.task || '').trim()
	if (!task) {
		return { ok: false, error: '任务不能为空。' }
	}

	if (startInFlight || hasRunningSession()) {
		return { ok: false, error: '已有任务正在启动或执行，请先中止当前任务。' }
	}
	startInFlight = true
	startCancelRequested = false

	try {
		const preparedTab = await prepareControllerTab(controllerTabId, windowId, task)
		if (startCancelRequested) {
			return { ok: false, error: '任务启动已中止。', stopped: true }
		}
		if (!preparedTab.ok) {
			return { ok: false, error: preparedTab.error || '无法准备可自动化页面。' }
		}

		const activeControllerTabId = preparedTab.tabId
		const bridgeReady = await ensureTabBridgeReady(activeControllerTabId)
		if (startCancelRequested) {
			return { ok: false, error: '任务启动已中止。', stopped: true }
		}
		if (!bridgeReady.ok) {
			return { ok: false, error: bridgeReady.error }
		}

		const storedConfig = await loadConfig()
		const overrideConfig = normalizeConfig(message.config || storedConfig)
		const runtimeConfig = overrideConfig

		const sessionId = generateId('s')
		const session = {
			id: sessionId,
			task,
			controllerTabId: activeControllerTabId,
			windowId,
			currentTabId: activeControllerTabId,
			status: 'running',
			activityText: preparedTab.notice || '启动任务...',
			planItems: [],
			traceItems: preparedTab.notice
				? [{ id: generateId('t'), title: '页面准备', detail: preparedTab.notice, kind: 'step' }]
				: [],
			config: runtimeConfig,
			step: 0,
			history: [],
			workflowState: {},
			consecutiveFailures: 0,
			aborted: false,
		}

		sessions.set(sessionId, session)
		runSession(session, sessions).catch((error) => {
			if (!sessions.has(session.id)) return
			if (session.aborted || session.status === 'stopped') {
				session.status = 'stopped'
				session.activityText = '任务已中止。'
			} else {
				session.status = 'error'
				session.activityText = `任务异常: ${String(error)}`
			}
			publishSession(session)
			sessions.delete(session.id)
		})

		return { ok: true, sessionId, notice: preparedTab.notice || '' }
	} finally {
		startInFlight = false
		startCancelRequested = false
	}
}

async function prepareControllerTab(tabId, windowId, taskText = '') {
	let tab
	try {
		tab = await chrome.tabs.get(tabId)
	} catch (_) {
		return { ok: false, error: '无法读取当前标签页信息。' }
	}

	const originalUrl = String(tab?.url || '')
	const initialTarget = deriveInitialAutomationTarget(taskText)
	if (initialTarget?.url && !isInitialTargetLocation(originalUrl, initialTarget.url)) {
		return openInitialAutomationTarget(windowId, originalUrl, initialTarget)
	}
	if (isAutomatablePageUrl(originalUrl)) {
		return { ok: true, tabId }
	}

	if (!initialTarget?.url) {
		return {
			ok: false,
			error: `当前页面不支持自动化（${formatShortUrl(originalUrl)}），且任务中没有可直接打开的网址。请在任务里补充业务系统网址，或先切换到目标网站后重试。`,
		}
	}

	return openInitialAutomationTarget(windowId, originalUrl, initialTarget)
}

async function openInitialAutomationTarget(windowId, originalUrl, target) {
	try {
		const opened = await createTabAndWaitLoaded(windowId, target.url)
		if (!opened?.id) {
			return { ok: false, error: '自动打开任务目标页面失败，请手动切换到目标页面后重试。' }
		}
		await waitForTabAutomatable(opened.id, 20000)
		const notice = buildInitialNavigationNotice(originalUrl, target)
		return { ok: true, tabId: opened.id, notice }
	} catch (error) {
		return {
			ok: false,
			error: `自动打开任务目标页面失败：${String(error?.message || error || '')}`,
		}
	}
}

function buildInitialNavigationNotice(originalUrl, target) {
	const prefix = isAutomatablePageUrl(originalUrl)
		? '已根据任务打开'
		: `检测到受限页面（${formatShortUrl(originalUrl)}），已根据任务打开`
	const label = target?.label || '目标页面'
	if (target?.source === 'public-search') {
		return `${prefix}${label}：${target.query}`
	}
	return `${prefix}${label}。`
}

async function ensureTabBridgeReady(tabId) {
	let injected = false
	const maxAttempts = 14
	for (let i = 0; i < maxAttempts; i++) {
		if (startCancelRequested) return { ok: false, error: '任务启动已中止。' }
		let tab
		let tabUrl = ''
		try {
			tab = await chrome.tabs.get(tabId)
			tabUrl = String(tab?.url || '')
		} catch (_) {
			return { ok: false, error: '无法读取当前标签页信息。' }
		}

		const isHttpPage = /^https?:\/\//i.test(tabUrl)
		const isComplete = tab?.status === 'complete'
		if (!isHttpPage || !isComplete) {
			if (i < maxAttempts - 1) {
				await delay(260)
				continue
			}
			return { ok: false, error: '页面仍在加载或不支持自动化，请稍后重试。' }
		}

		try {
			await sendTabMessage(tabId, { type: MSG_TYPES.OBSERVE }, { maxRetries: 0, timeoutMs: 1200 })
			return { ok: true }
		} catch (error) {
			const message = String(error?.message || error || '')
			const missingBridge = isMissingBridgeError(message)
			if (!missingBridge) {
				return { ok: false, error: message || '页面连接失败。' }
			}
			if (!injected) {
				const injectedNow = await tryInjectContentBridge(tabId, tabUrl)
				injected = injectedNow
			}
			if (i < maxAttempts - 1) {
				await delay(injected ? 420 : 260)
				continue
			}
			return {
				ok: false,
				error: injected
					? '页面执行脚本自动连接失败，请稍后重试当前任务。'
					: '当前页面未连接扩展执行脚本，且自动注入失败，请切换标签页后重试。',
			}
		}
	}
	return { ok: false, error: '页面连接失败。' }
}

function isAutomatablePageUrl(url) {
	return /^https?:\/\//i.test(String(url || ''))
}

async function waitForTabAutomatable(tabId, timeoutMs = 20000) {
	const deadline = Date.now() + Math.max(2000, Number(timeoutMs) || 0)
	while (Date.now() < deadline) {
		try {
			const tab = await chrome.tabs.get(tabId)
			const url = String(tab?.url || '')
			const isHttpPage = /^https?:\/\//i.test(url)
			const isComplete = tab?.status === 'complete'
			if (isHttpPage && isComplete) return true
		} catch (_) {}
		await delay(220)
	}
	return false
}

function formatShortUrl(url) {
	const raw = String(url || '').trim()
	if (!raw) return '未知页面'
	if (raw.length <= 60) return raw
	return `${raw.slice(0, 57)}...`
}

function isMissingBridgeError(message) {
	const text = String(message || '')
	return (
		text.includes('未连接扩展执行脚本') ||
		text.includes('Receiving end does not exist') ||
		text.includes('Could not establish connection')
	)
}

async function tryInjectContentBridge(tabId, url) {
	if (!/^https?:\/\//i.test(String(url || ''))) return false
	if (!chrome.scripting || typeof chrome.scripting.executeScript !== 'function') return false
	try {
		await chrome.scripting.executeScript({
			target: { tabId, allFrames: false },
			files: CONTENT_SCRIPT_FILES,
		})
		return true
	} catch (_) {
		return false
	}
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

function stopTask(message) {
	const sessionId = String(message?.sessionId || '')
	const session = sessionId ? sessions.get(sessionId) : null
	if (!session) {
		if (startInFlight) {
			startCancelRequested = true
			return { ok: true, stoppedCount: 0, startingCancelled: true }
		}
		const stoppedCount = stopAllRunningSessions()
		if (stoppedCount > 0) return { ok: true, stoppedCount }
		return { ok: true, stoppedCount: 0, noActiveSession: true }
	}
	if (session.status !== 'running') {
		return { ok: true }
	}
	session.aborted = true
	session.status = 'stopped'
	session.activityText = '任务中止中...'
	publishSession(session)
	const stoppedCount = 1 + stopAllRunningSessions()
	return { ok: true, stoppedCount }
}

function hasRunningSession() {
	for (const session of sessions.values()) {
		if (session?.status === 'running' && !session?.aborted) return true
	}
	return false
}

function stopAllRunningSessions() {
	let count = 0
	for (const session of sessions.values()) {
		if (!session || session.status !== 'running') continue
		session.aborted = true
		session.status = 'stopped'
		session.activityText = '任务中止中...'
		publishSession(session)
		count += 1
	}
	return count
}

function setupSidePanelBehavior() {
	const sidePanelApi = chrome.sidePanel
	if (!sidePanelApi || typeof sidePanelApi.setPanelBehavior !== 'function') return
	sidePanelApi.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
}
