;(function (g) {
	const plannerContext = g.NC_BG_PLANNER_CONTEXT
	if (!plannerContext) throw new Error('NC_BG_PLANNER_CONTEXT 未加载。')
	const { shortText } = plannerContext

	async function callOpenAI(endpoint, messages, options = {}) {
		const baseURL = String(endpoint.baseURL || '').replace(/\/+$/, '')
		const url = `${baseURL}/chat/completions`
		const headers = {
			'Content-Type': 'application/json',
		}
		if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`
		const controller = new AbortController()
		const timeoutMs = clampTimeoutMs(options.timeoutMs ?? endpoint.timeoutMs, 60000)
		const timeout = setTimeout(() => controller.abort(), timeoutMs)
		const requestBody = {
			model: endpoint.model,
			messages,
			temperature: 0.2,
			response_format: { type: 'json_object' },
		}
		const requestPreview = buildRequestPreview(url, requestBody, timeoutMs)

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			})
			if (!response.ok) {
				const text = await response.text()
				const error = new Error(`模型请求失败: ${response.status} ${text}`)
				error.io = {
					request: requestPreview,
					response: {
						status: response.status,
						error: shortText(text, 1800),
					},
				}
				throw error
			}
			const data = await response.json()
			const message = data?.choices?.[0]?.message || {}
			const content = message?.content || ''
			if (options?.returnMeta) {
				return {
					content,
					io: {
						request: requestPreview,
						response: buildResponsePreview(data, content),
					},
				}
			}
			return content
		} catch (error) {
			if (error?.name === 'AbortError') {
				const timeoutError = new Error(`模型请求超时（${Math.round(timeoutMs / 1000)}秒）`)
				timeoutError.io = {
					request: requestPreview,
					response: { error: timeoutError.message },
				}
				throw timeoutError
			}
			throw error
		} finally {
			clearTimeout(timeout)
		}
	}

	function isModelTimeoutError(error) {
		return String(error?.message || error || '').includes('模型请求超时')
	}

	function clampTimeoutMs(value, fallback) {
		const raw = Number(value)
		if (!Number.isFinite(raw) || raw <= 0) return fallback
		return Math.max(5000, Math.min(180000, Math.floor(raw)))
	}

	function buildRequestPreview(url, body, timeoutMs) {
		const messages = body?.messages || []
		return {
			url,
			model: body?.model || '',
			temperature: body?.temperature,
			timeoutMs,
			messages: sanitizeMessages(messages),
			diagnostics: buildRequestDiagnostics(messages),
		}
	}

	function buildResponsePreview(data, content) {
		const message = data?.choices?.[0]?.message || {}
		const reasoning =
			message?.reasoning_content ||
			message?.reasoning ||
			message?.thought ||
			data?.reasoning_content ||
			''
		const thought = extractDisplayThought(content)
		const displayThought = combineDisplayThought(thought, reasoning)
		return {
			id: data?.id || '',
			model: data?.model || '',
			content: shortText(content, 2400),
			thought: thought ? shortText(thought, 800) : undefined,
			reasoning: reasoning ? shortText(reasoning, 2400) : undefined,
			displayThought: displayThought ? shortText(displayThought, 2400) : undefined,
			choices: Array.isArray(data?.choices) ? data.choices.length : 0,
			usage: data?.usage || null,
		}
	}

	function combineDisplayThought(thought, reasoning) {
		const visibleThought = String(thought || '').trim()
		const visibleReasoning = String(reasoning || '').trim()
		if (visibleThought && visibleReasoning && visibleReasoning !== visibleThought) {
			return `${visibleThought}\n推理摘要: ${visibleReasoning}`
		}
		return visibleThought || visibleReasoning
	}

	function extractDisplayThought(content) {
		try {
			const parsed = JSON.parse(String(content || ''))
			return String(parsed?.thought || parsed?.reasoning || parsed?.analysis || '').trim()
		} catch (_) {
			return ''
		}
	}

	function buildRequestDiagnostics(messages) {
		const list = Array.isArray(messages) ? messages : []
		const messageStats = list.map((msg, index) => {
			const contentLength = measureContentLength(msg?.content)
			const previewLimit = getMessagePreviewLimit(msg?.role)
			return {
				index,
				role: msg?.role || '',
				contentLength,
				previewLimit,
				truncated: contentLength > previewLimit,
				omittedChars: Math.max(0, contentLength - previewLimit),
			}
		})
		return {
			totalMessageChars: messageStats.reduce((sum, item) => sum + item.contentLength, 0),
			truncatedMessages: messageStats.filter((item) => item.truncated).length,
			messageStats,
			note: 'messages 是日志预览；diagnostics 记录原始消息长度和截断情况，实际请求仍发送完整内容。',
		}
	}

	function sanitizeMessages(messages) {
		return messages.map((msg, index) => {
			const role = msg?.role || ''
			const contentLength = measureContentLength(msg?.content)
			const previewLimit = getMessagePreviewLimit(role)
			return {
				index,
				role,
				content: sanitizeContent(msg?.content, previewLimit),
				contentLength,
				previewLimit,
				truncated: contentLength > previewLimit,
				omittedChars: Math.max(0, contentLength - previewLimit),
			}
		})
	}

	function sanitizeContent(content, maxLen) {
		const limit = Math.max(400, Number(maxLen) || 1800)
		if (typeof content === 'string') return shortText(content, limit)
		if (Array.isArray(content)) {
			return content.map((item) => {
				if (!item || typeof item !== 'object') return item
				if (item.type === 'image_url') {
					return { type: 'image_url', image_url: '[omitted]' }
				}
				if (item.type === 'text' || item.type === 'input_text') {
					return { ...item, text: shortText(item.text || '', Math.min(limit, 3200)) }
				}
				return item
			})
		}
		return content
	}

	function getMessagePreviewLimit(role) {
		const normalized = String(role || '').toLowerCase()
		if (normalized === 'user') return 8000
		if (normalized === 'system') return 4200
		return 2400
	}

	function measureContentLength(content) {
		if (typeof content === 'string') return content.length
		if (Array.isArray(content)) {
			return content.reduce((sum, item) => {
				if (!item || typeof item !== 'object') return sum + String(item || '').length
				if (item.type === 'image_url') return sum
				if (item.type === 'text' || item.type === 'input_text') return sum + String(item.text || '').length
				return sum + JSON.stringify(item).length
			}, 0)
		}
		if (content === undefined || content === null) return 0
		return JSON.stringify(content).length
	}

	g.NC_BG_PLANNER_MODEL_CLIENT = {
		callOpenAI,
		isModelTimeoutError,
		sanitizeMessages,
	}
})(globalThis)
