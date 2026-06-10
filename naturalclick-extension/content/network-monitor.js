;(function (g) {
	if (g.NC_CONTENT_NETWORK_READY) return
	g.NC_CONTENT_NETWORK_READY = true

	const HOOK_SOURCE = 'NaturalClickNetworkHook'
	const MAX_RECORDS = 24
	const MAX_FIELDS_PER_RECORD = 80
	const MAX_FIELD_VALUE_CHARS = 96
	const SENSITIVE_KEY_RE = /(?:password|passwd|pwd|passcode|token|access[_-]?token|refresh[_-]?token|authorization|auth|cookie|session|secret|api[_-]?key|captcha|otp|csrf|xsrf|credential|密码|口令|令牌|密钥|验证码|校验码|动态码)/i
	const records = []

	injectPageHook()
	window.addEventListener('message', handlePageMessage)

	function injectPageHook() {
		try {
			const script = document.createElement('script')
			script.src = chrome.runtime.getURL('content/network-page-hook.js')
			script.async = false
			script.onload = () => script.remove()
			;(document.documentElement || document.head || document.body).appendChild(script)
		} catch (_) {}
	}

	function handlePageMessage(event) {
		if (event.source !== window) return
		const data = event.data || {}
		if (!data || data.source !== HOOK_SOURCE || data.type !== 'response') return
		const summary = summarizeNetworkPayload(data.payload || {})
		if (!summary) return
		records.unshift(summary)
		if (records.length > MAX_RECORDS) records.length = MAX_RECORDS
	}

	function summarizeNetworkPayload(payload) {
		const status = Number(payload.status)
		const method = String(payload.method || 'GET').toUpperCase()
		const url = sanitizeUrl(payload.url || '')
		const contentType = String(payload.contentType || '')
		const body = String(payload.body || '')
		const fields = extractNetworkFields(body)
		const textSample = fields
			.slice(0, 12)
			.map((field) => `${field.label || field.key || field.path}=${field.value}`)
			.join(' | ')
		if (!fields.length && !textSample) return null
		return {
			method,
			status: Number.isFinite(status) ? status : 0,
			url,
			contentType,
			ageMs: 0,
			capturedAt: Number(payload.capturedAt) || Date.now(),
			elapsedMs: Number(payload.elapsedMs) || 0,
			fields,
			textSample: shortNetworkText(textSample, 480),
		}
	}

	function collectNetworkSummaries() {
		const now = Date.now()
		return records.map((record) => ({
			...record,
			ageMs: Math.max(0, now - Number(record.capturedAt || now)),
			fields: (Array.isArray(record.fields) ? record.fields : []).slice(0, MAX_FIELDS_PER_RECORD),
		}))
	}

	function extractNetworkFields(body) {
		const parsed = parseResponseBody(body)
		const fields = []
		const seen = new Set()
		if (parsed !== null) {
			visitJsonValue(parsed, [], fields, seen)
		} else {
			visitTextBody(body, fields, seen)
		}
		return fields.slice(0, MAX_FIELDS_PER_RECORD)
	}

	function parseResponseBody(body) {
		const text = String(body || '').trim()
		if (!text) return null
		try {
			return JSON.parse(text)
		} catch (_) {
			return null
		}
	}

	function visitJsonValue(value, path, fields, seen) {
		if (fields.length >= MAX_FIELDS_PER_RECORD) return
		if (Array.isArray(value)) {
			const limit = Math.min(value.length, 12)
			for (let index = 0; index < limit; index += 1) {
				visitJsonValue(value[index], path.concat(String(index)), fields, seen)
				if (fields.length >= MAX_FIELDS_PER_RECORD) return
			}
			return
		}
		if (value && typeof value === 'object') {
			const entries = Object.entries(value).slice(0, 80)
			for (const [key, child] of entries) {
				visitJsonValue(child, path.concat(key), fields, seen)
				if (fields.length >= MAX_FIELDS_PER_RECORD) return
			}
			return
		}
		const key = path[path.length - 1] || ''
		const field = buildNetworkField(path, key, value)
		if (!field) return
		const dedupeKey = `${normalizeNetworkText(field.path)}:${normalizeNetworkText(field.value)}`
		if (!dedupeKey || seen.has(dedupeKey)) return
		seen.add(dedupeKey)
		fields.push(field)
	}

	function visitTextBody(body, fields, seen) {
		const text = String(body || '')
		const pattern = /["']?([\p{L}\p{N}_.$-]{1,64})["']?\s*[:=]\s*["']?([^"',，。；;\n\r]{1,96})/gu
		let match = null
		while ((match = pattern.exec(text)) && fields.length < MAX_FIELDS_PER_RECORD) {
			const key = String(match[1] || '').trim()
			const value = String(match[2] || '').trim()
			const field = buildNetworkField([key], key, value)
			if (!field) continue
			const dedupeKey = `${normalizeNetworkText(field.path)}:${normalizeNetworkText(field.value)}`
			if (seen.has(dedupeKey)) continue
			seen.add(dedupeKey)
			fields.push(field)
		}
	}

	function buildNetworkField(path, key, value) {
		const rawKey = String(key || '').trim()
		const rawPath = (Array.isArray(path) ? path : [])
			.map((item) => String(item || '').trim())
			.filter(Boolean)
			.join('.')
		if (!rawKey && !rawPath) return null
		const valueText = normalizePrimitiveValue(value)
		if (!isUsableNetworkValue(valueText)) return null
		const masked = isSensitiveNetworkField(rawKey, rawPath, valueText)
		return {
			key: shortNetworkText(rawKey, 48),
			path: shortNetworkText(rawPath || rawKey, 96),
			label: shortNetworkText(humanizeNetworkKey(rawKey), 48),
			value: masked ? '***' : shortNetworkText(valueText, MAX_FIELD_VALUE_CHARS),
			masked,
		}
	}

	function normalizePrimitiveValue(value) {
		if (value === null || value === undefined) return ''
		if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim()
		if (typeof value === 'number' || typeof value === 'boolean') return String(value)
		return ''
	}

	function isUsableNetworkValue(value) {
		const text = String(value || '').trim()
		if (!text || text.length > 256) return false
		if (/^(null|undefined|nan|\[object object\])$/i.test(text)) return false
		if (/^\s*[\[{]/.test(text)) return false
		return /[\p{L}\p{N}]/u.test(text)
	}

	function isSensitiveNetworkField(key, path, value) {
		if (SENSITIVE_KEY_RE.test(String(key || '')) || SENSITIVE_KEY_RE.test(String(path || ''))) return true
		const text = String(value || '')
		if (/^bearer\s+[A-Za-z0-9._~+/=-]{12,}$/i.test(text)) return true
		if (/^[A-Za-z0-9._~+/=-]{32,}$/.test(text) && !/\s/.test(text)) return true
		return false
	}

	function humanizeNetworkKey(key) {
		return String(key || '')
			.replace(/[_-]+/g, ' ')
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.trim()
	}

	function sanitizeUrl(value) {
		const raw = String(value || '').trim()
		if (!raw) return ''
		try {
			const url = new URL(raw, location.href)
			for (const key of Array.from(url.searchParams.keys())) {
				if (SENSITIVE_KEY_RE.test(key)) {
					url.searchParams.set(key, '***')
				} else {
					const current = url.searchParams.get(key) || ''
					if (current.length > 32) url.searchParams.set(key, `${current.slice(0, 29)}...`)
				}
			}
			return url.href
		} catch (_) {
			return shortNetworkText(raw.replace(/([?&][^=]*?(?:token|password|pwd|secret|cookie|验证码|密码)[^=]*=)[^&]+/ig, '$1***'), 180)
		}
	}

	function normalizeNetworkText(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
	}

	function shortNetworkText(value, maxLen) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		const limit = Math.max(12, Number(maxLen) || 80)
		return text.length > limit ? `${text.slice(0, limit - 3)}...` : text
	}

	g.NC_CONTENT_NETWORK = {
		collectNetworkSummaries,
	}
})(window)
