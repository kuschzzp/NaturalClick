;(function () {
	if (window.__NATURALCLICK_NETWORK_HOOK__) return
	window.__NATURALCLICK_NETWORK_HOOK__ = true

	const SOURCE = 'NaturalClickNetworkHook'
	const MAX_BODY_CHARS = 120000
	const MAX_REQUEST_BODY_CHARS = 20000
	const TEXT_TYPES = /(?:json|text|javascript|xml|x-www-form-urlencoded)/i

	function postResponse(payload) {
		try {
			window.postMessage(
				{
					source: SOURCE,
					type: 'response',
					payload,
				},
				'*'
			)
		} catch (_) {}
	}

	function shouldReadResponse(url, contentType) {
		const target = String(url || '')
		const type = String(contentType || '')
		if (TEXT_TYPES.test(type)) return true
		return /(?:api|ajax|graphql|rest|query|search|filter|list|page|table|data|json|select|option)/i.test(target)
	}

	function trimBody(text) {
		const value = String(text || '')
		return value.length > MAX_BODY_CHARS ? value.slice(0, MAX_BODY_CHARS) : value
	}

	function trimRequestBody(text) {
		const value = String(text || '')
		return value.length > MAX_REQUEST_BODY_CHARS ? value.slice(0, MAX_REQUEST_BODY_CHARS) : value
	}

	function readFetchUrl(input) {
		try {
			if (typeof input === 'string') return input
			if (input instanceof URL) return input.href
			if (input && typeof input.url === 'string') return input.url
		} catch (_) {}
		return ''
	}

	function readFetchMethod(input, init) {
		return String(init?.method || input?.method || 'GET').toUpperCase()
	}

	function readRequestBody(body) {
		try {
			if (body === null || body === undefined) return ''
			if (typeof body === 'string') return trimRequestBody(body)
			if (body instanceof URLSearchParams) return trimRequestBody(body.toString())
			if (typeof FormData !== 'undefined' && body instanceof FormData) {
				const parts = []
				for (const [key, value] of body.entries()) {
					parts.push(`${key}=${typeof value === 'string' ? value : '[file]'}`)
					if (parts.length >= 80) break
				}
				return trimRequestBody(parts.join('&'))
			}
			if (body && typeof body === 'object' && typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
				return ''
			}
			if (body && typeof body === 'object') return trimRequestBody(JSON.stringify(body))
		} catch (_) {}
		return ''
	}

	const originalFetch = window.fetch
	if (typeof originalFetch === 'function') {
		window.fetch = function naturalClickFetch(input, init) {
			const startedAt = Date.now()
			const url = readFetchUrl(input)
			const method = readFetchMethod(input, init)
			const requestBody = readRequestBody(init?.body)
			return originalFetch.apply(this, arguments).then((response) => {
				try {
					const clone = response.clone()
					const contentType = clone.headers?.get?.('content-type') || ''
					if (shouldReadResponse(url || clone.url, contentType)) {
						clone.text()
							.then((body) => {
								postResponse({
									transport: 'fetch',
									method,
									url: url || clone.url || '',
									status: response.status,
									contentType,
									requestBody,
									body: trimBody(body),
									elapsedMs: Date.now() - startedAt,
									capturedAt: Date.now(),
								})
							})
							.catch(() => {})
					}
				} catch (_) {}
				return response
			})
		}
	}

	const OriginalXHR = window.XMLHttpRequest
	if (typeof OriginalXHR === 'function') {
		const originalOpen = OriginalXHR.prototype.open
		const originalSend = OriginalXHR.prototype.send
		OriginalXHR.prototype.open = function naturalClickXhrOpen(method, url) {
			try {
				this.__naturalClickRequest = {
					method: String(method || 'GET').toUpperCase(),
					url: String(url || ''),
				}
			} catch (_) {}
			return originalOpen.apply(this, arguments)
		}
		OriginalXHR.prototype.send = function naturalClickXhrSend(bodyArg) {
			const startedAt = Date.now()
			const requestBody = readRequestBody(bodyArg)
			try {
				this.addEventListener('loadend', () => {
					try {
						const meta = this.__naturalClickRequest || {}
						const contentType = this.getResponseHeader?.('content-type') || ''
						if (!shouldReadResponse(meta.url || this.responseURL, contentType)) return
						let body = ''
						if (typeof this.responseText === 'string') {
							body = this.responseText
						} else if (this.response && typeof this.response === 'object') {
							try {
								body = JSON.stringify(this.response)
							} catch (_) {
								body = ''
							}
						}
						if (!body) return
						postResponse({
							transport: 'xhr',
							method: meta.method || 'GET',
							url: meta.url || this.responseURL || '',
							status: this.status,
							contentType,
							requestBody,
							body: trimBody(body),
							elapsedMs: Date.now() - startedAt,
							capturedAt: Date.now(),
						})
					} catch (_) {}
				})
			} catch (_) {}
			return originalSend.apply(this, arguments)
		}
	}
})()
