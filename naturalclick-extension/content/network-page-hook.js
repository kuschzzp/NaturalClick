;(function () {
	if (window.__NATURALCLICK_NETWORK_HOOK__) return
	window.__NATURALCLICK_NETWORK_HOOK__ = true

	const SOURCE = 'NaturalClickNetworkHook'
	const MAX_BODY_CHARS = 120000
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

	const originalFetch = window.fetch
	if (typeof originalFetch === 'function') {
		window.fetch = function naturalClickFetch(input, init) {
			const startedAt = Date.now()
			const url = readFetchUrl(input)
			const method = readFetchMethod(input, init)
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
		OriginalXHR.prototype.send = function naturalClickXhrSend() {
			const startedAt = Date.now()
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
