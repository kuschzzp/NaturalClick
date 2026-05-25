;(() => {
	if (window.top !== window) return
	if (window.NC_CONTENT_BRIDGE_READY || window.NC_CONTENT_BRIDGE_BOOTING) return

	window.NC_CONTENT_BRIDGE_BOOTING = true

	const TYPES = window.NC_PROTOCOL?.TYPES || {
		OBSERVE: 'NC_OBSERVE',
		ACT: 'NC_ACT',
		ACT_COORD: 'NC_ACT_COORD',
		HIT_TEST: 'NC_HIT_TEST',
		VERIFY_INPUT: 'NC_VERIFY_INPUT',
		VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT',
	}

	const MAX_INIT_ATTEMPTS = 30
	const INIT_RETRY_MS = 100
	let initAttempts = 0

	initWhenModulesReady()

	function initWhenModulesReady() {
		if (window.NC_CONTENT_BRIDGE_READY) {
			window.NC_CONTENT_BRIDGE_BOOTING = false
			return
		}

		const modules = getCoreModules()
		if (!modules.ready) {
			initAttempts += 1
			if (initAttempts < MAX_INIT_ATTEMPTS) {
				setTimeout(initWhenModulesReady, INIT_RETRY_MS)
				return
			}
			window.NC_CONTENT_BRIDGE_BOOTING = false
			console.warn('[NaturalClick] content core modules not fully loaded after retry', modules.status)
			return
		}

		startBridge(modules)
	}

	function getCoreModules() {
		const createPageObserver = window.NC_CONTENT_OBSERVER?.createPageObserver
		const createVerification = window.NC_CONTENT_VERIFICATION?.createVerification
		const createActions = window.NC_CONTENT_ACTIONS?.createActions
		const createVisualRuntime =
			window.NC_CONTENT_VISUAL?.createVisualRuntime || createNoopVisualRuntime
		const status = {
			observer: !!createPageObserver,
			verification: !!createVerification,
			actions: !!createActions,
			visual: !!window.NC_CONTENT_VISUAL?.createVisualRuntime,
		}
		return {
			ready: status.observer && status.verification && status.actions,
			status,
			createPageObserver,
			createVerification,
			createActions,
			createVisualRuntime,
		}
	}

	function startBridge(modules) {
		const visual = modules.createVisualRuntime()
		const observer = modules.createPageObserver({ visual })
		const clampNumber = (value, min, max, fallback) => {
			if (!Number.isFinite(value)) return fallback
			return Math.max(min, Math.min(max, Math.floor(value)))
		}
		const verification = modules.createVerification({ observer, clampNumber })
		const actions = modules.createActions({ observer, clampNumber, visual })

		window.addEventListener(
			'beforeunload',
			() => {
				try {
					visual.dispose()
				} catch (_) {}
			},
			{ once: true }
		)

		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			if (!message || typeof message !== 'object') return

			if (message.type === TYPES.OBSERVE) {
				sendResponse(observer.observePage())
				return
			}

			if (message.type === TYPES.ACT) {
				runWithTimeout(
					() => actions.executeAction(message.action),
					getActionTimeoutMs(message.action)
				)
					.then((result) => sendResponse(result))
					.catch((error) =>
						sendResponse({
							success: false,
							message: String(error),
						})
					)
				return true
			}

			if (message.type === TYPES.ACT_COORD) {
				runWithTimeout(
					() => actions.executeCoordinateAction(message.action),
					4500
				)
					.then((result) => sendResponse(result))
					.catch((error) =>
						sendResponse({
							success: false,
							message: String(error),
						})
					)
				return true
			}

			if (message.type === TYPES.HIT_TEST) {
				const payload = message.payload || {}
				sendResponse(verification.hitTestAtPoint(payload.x, payload.y))
				return
			}

			if (message.type === TYPES.VERIFY_INPUT) {
				const payload = message.payload || {}
				sendResponse(verification.verifyInputByIndex(payload.index, payload.text))
				return
			}

			if (message.type === TYPES.VERIFY_INPUT_POINT) {
				const payload = message.payload || {}
				sendResponse(verification.verifyInputByPoint(payload.x, payload.y, payload.text))
				return
			}
		})

		window.NC_CONTENT_BRIDGE_READY = true
		window.NC_CONTENT_BRIDGE_BOOTING = false
	}

	function getActionTimeoutMs(action) {
		const name = String(action?.name || '')
		if (name === 'select_cascader_path') return 16500
		if (name === 'select_dropdown_option' || name === 'select_checkbox_option') return 6200
		if (name === 'input_text' || name === 'type') return 6200
		if (name === 'scroll' || name === 'scroll_horizontally') return 5200
		return 4700
	}

	function runWithTimeout(fn, timeoutMs) {
		return new Promise((resolve, reject) => {
			let settled = false
			const safeTimeout = Math.max(1000, Number(timeoutMs) || 4500)
			const timer = setTimeout(() => {
				if (settled) return
				settled = true
				resolve({
					success: false,
					message: `页面动作超时（${Math.round(safeTimeout / 1000)}秒），已放弃等待。`,
				})
			}, safeTimeout)

			Promise.resolve()
				.then(fn)
				.then((result) => {
					if (settled) return
					settled = true
					clearTimeout(timer)
					resolve(result)
				})
				.catch((error) => {
					if (settled) return
					settled = true
					clearTimeout(timer)
					reject(error)
				})
		})
	}

	function createNoopVisualRuntime() {
		const noop = () => {}
		const asyncNoop = async () => {}
		return {
			renderIndexHighlights: noop,
			clearIndexHighlights: noop,
			movePointerTo: asyncNoop,
			clickPointer: asyncNoop,
			markActionTarget: noop,
			dispose: noop,
		}
	}
})()
