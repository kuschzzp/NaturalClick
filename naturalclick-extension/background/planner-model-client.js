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
		const useStream = options.stream !== false && endpoint.stream !== false
		const streamState = createStreamState(useStream)
		const timeout = setTimeout(() => controller.abort(), timeoutMs)
		const requestBody = {
			model: endpoint.model,
			messages,
			temperature: 0.2,
			response_format: { type: 'json_object' },
			...(useStream ? { stream: true } : {}),
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
			if (useStream && response.body?.getReader) {
				return await readStreamingChatCompletion(response, requestPreview, options, streamState)
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
				const timeoutError = new Error(buildTimeoutMessage(timeoutMs, streamState))
				timeoutError.io = {
					request: requestPreview,
					response: {
						error: timeoutError.message,
						stream: streamState.enabled,
						partialContent: streamState.content ? shortText(streamState.content, 2400) : undefined,
						partialReasoning: streamState.reasoning ? shortText(streamState.reasoning, 2400) : undefined,
						chunkCount: streamState.chunkCount,
					},
				}
				throw timeoutError
			}
			throw error
		} finally {
			clearTimeout(timeout)
		}
	}

	function isModelTimeoutError(error) {
		return /模型(?:请求|流式响应)超时/.test(String(error?.message || error || ''))
	}

	function clampTimeoutMs(value, fallback) {
		const raw = Number(value)
		if (!Number.isFinite(raw) || raw <= 0) return fallback
		return Math.max(5000, Math.min(180000, Math.floor(raw)))
	}

	async function readStreamingChatCompletion(response, requestPreview, options, streamState) {
		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''
		let lastPayload = null
		let usage = null
		while (true) {
			const { value, done } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })
			const lines = buffer.split(/\r?\n/)
			buffer = lines.pop() || ''
			for (const line of lines) {
				const parsed = parseStreamLine(line)
				if (!parsed) continue
				if (parsed.done) {
					notifyStream(options, streamState, true)
					continue
				}
				lastPayload = parsed.payload || lastPayload
				usage = parsed.payload?.usage || usage
				applyStreamPayload(streamState, parsed.payload)
				notifyStream(options, streamState, false)
			}
		}
		if (buffer.trim()) {
			const parsed = parseStreamLine(buffer)
			if (parsed?.payload) {
				lastPayload = parsed.payload
				usage = parsed.payload?.usage || usage
				applyStreamPayload(streamState, parsed.payload)
			}
		}
		notifyStream(options, streamState, true)
		const data = {
			id: lastPayload?.id || '',
			model: lastPayload?.model || '',
			choices: [
				{
					message: {
						content: streamState.content,
						reasoning_content: streamState.reasoning,
					},
				},
			],
			usage,
		}
		const result = {
			content: streamState.content,
			io: {
				request: requestPreview,
				response: {
					...buildResponsePreview(data, streamState.content),
					stream: true,
					chunkCount: streamState.chunkCount,
				},
			},
		}
		if (!options?.returnMeta) return streamState.content
		return result
	}

	function parseStreamLine(line) {
		const text = String(line || '').trim()
		if (!text || text.startsWith(':')) return null
		const data = text.startsWith('data:') ? text.slice(5).trim() : text
		if (!data) return null
		if (data === '[DONE]') return { done: true }
		try {
			return { payload: JSON.parse(data) }
		} catch (_) {
			return null
		}
	}

	function applyStreamPayload(streamState, payload) {
		const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null
		const delta = choice?.delta || choice?.message || {}
		const contentDelta = String(delta.content || choice?.text || '')
		const reasoningDelta = String(delta.reasoning_content || delta.reasoning || delta.thought || '')
		if (contentDelta || reasoningDelta) {
			streamState.gotFirstChunk = true
			streamState.chunkCount += 1
			streamState.content += contentDelta
			streamState.reasoning += reasoningDelta
		}
	}

	function notifyStream(options, streamState, done) {
		if (typeof options?.onStream !== 'function') return
		try {
			options.onStream({
				content: streamState.content,
				reasoning: streamState.reasoning,
				chunkCount: streamState.chunkCount,
				done,
			})
		} catch (_) {}
	}

	function createStreamState(enabled) {
		return {
			enabled: !!enabled,
			gotFirstChunk: false,
			chunkCount: 0,
			content: '',
			reasoning: '',
		}
	}

	function buildTimeoutMessage(timeoutMs, streamState) {
		const seconds = Math.round(timeoutMs / 1000)
		if (!streamState?.enabled) return `模型请求超时（${seconds}秒）`
		if (!streamState.gotFirstChunk) return `模型请求超时（${seconds}秒，未收到首个流式片段）`
		const chars = String(streamState.content || '').length
		const reasoning = String(streamState.reasoning || '').length
		return `模型流式响应超时（${seconds}秒，已收到正文 ${chars} 字、推理 ${reasoning} 字）`
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
		parseStreamLine,
		sanitizeMessages,
	}
})(globalThis)
