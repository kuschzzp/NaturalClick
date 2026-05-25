;(function (g) {
	function safeJsonParse(text) {
		if (!text) return null
		try {
			return JSON.parse(text)
		} catch (_) {}

		const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
		if (fenced?.[1]) {
			try {
				return JSON.parse(fenced[1])
			} catch (_) {}
		}
		return null
	}

	function normalizeUrl(url) {
		if (/^https?:\/\//i.test(url)) return url
		return `https://${url}`
	}

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value))
	}

	function generateId(prefix) {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
	}

	async function sendTabMessage(tabId, message, options = {}) {
		const maxRetries = Number.isFinite(options.maxRetries) ? Number(options.maxRetries) : 1
		const retryDelayMs = Number.isFinite(options.retryDelayMs) ? Number(options.retryDelayMs) : 180
		const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 5000
		let attempt = 0
		let lastError = null
		while (attempt <= maxRetries) {
			try {
				const result = await sendTabMessageOnce(tabId, message, timeoutMs)
				return result
			} catch (error) {
				lastError = error
				const text = String(error?.message || error || '')
				const shouldRetry = isRetryableTabMessageError(text) && attempt < maxRetries
				if (!shouldRetry) throw error
				await sleep(retryDelayMs)
				attempt += 1
			}
		}
		throw lastError || new Error('页面通信失败')
	}

	function sendTabMessageOnce(tabId, message, timeoutMs) {
		return new Promise((resolve, reject) => {
			let settled = false
			const timer = setTimeout(() => {
				if (settled) return
				settled = true
				reject(new Error('页面通信超时，执行脚本未响应。'))
			}, Math.max(1000, Number(timeoutMs) || 5000))

			chrome.tabs.sendMessage(tabId, message, (response) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				const err = chrome.runtime.lastError
				if (err) {
					reject(new Error(normalizeTabMessageError(err.message)))
					return
				}
				resolve(response)
			})
		})
	}

	function isRetryableTabMessageError(message) {
		const text = String(message || '')
		return (
			text.includes('未连接扩展执行脚本') ||
			text.includes('页面通信超时') ||
			text.includes('message port closed') ||
			text.includes('The message port closed') ||
			text.includes('Could not establish connection')
		)
	}

	function normalizeTabMessageError(message) {
		const text = String(message || '')
		if (text.includes('Receiving end does not exist')) {
			return '当前页面未连接扩展执行脚本，请刷新网页后重试。'
		}
		if (text.includes('The message port closed') || text.includes('message channel closed')) {
			return '页面执行脚本未完成响应，可能正在初始化或已被页面刷新。'
		}
		if (text.includes('Cannot access contents of url') || text.includes('The extensions gallery cannot be scripted')) {
			return '当前页面不支持自动化（如 chrome://、扩展页等），请切换到普通网页。'
		}
		return text || '页面通信失败'
	}

	function sendRuntimeMessage(message) {
		return new Promise((resolve, reject) => {
			chrome.runtime.sendMessage(message, (response) => {
				const err = chrome.runtime.lastError
				if (err) {
					reject(new Error(err.message || 'runtime.sendMessage failed'))
					return
				}
				resolve(response)
			})
		})
	}

	function createTabAndWaitLoaded(windowId, url) {
		return new Promise((resolve, reject) => {
			chrome.tabs.create({ windowId, url, active: true }, (tab) => {
				if (chrome.runtime.lastError || !tab?.id) {
					reject(new Error(chrome.runtime.lastError?.message || '创建标签页失败'))
					return
				}

				const tabId = tab.id
				let timeout = null

				const onUpdated = (updatedTabId, info, updatedTab) => {
					if (updatedTabId !== tabId) return
					if (info.status === 'complete') {
						chrome.tabs.onUpdated.removeListener(onUpdated)
						if (timeout) clearTimeout(timeout)
						resolve(updatedTab)
					}
				}

				timeout = setTimeout(() => {
					chrome.tabs.onUpdated.removeListener(onUpdated)
					resolve(tab)
				}, 15000)

				chrome.tabs.onUpdated.addListener(onUpdated)
			})
		})
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
	}

	g.NC_BG_UTILS = {
		safeJsonParse,
		normalizeUrl,
		clamp,
		generateId,
		sendTabMessage,
		sendRuntimeMessage,
		createTabAndWaitLoaded,
	}
})(globalThis)
