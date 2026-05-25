;(function (g) {
	const { TYPES: MSG_TYPES } = g.NC_BG_CONSTANTS
	const { sendTabMessage, normalizeUrl, createTabAndWaitLoaded, sendRuntimeMessage } = g.NC_BG_UTILS

	const registry = new Map()

	function registerTool(tool) {
		if (!tool || typeof tool.name !== 'string' || typeof tool.execute !== 'function') return
		registry.set(tool.name, {
			description: '',
			inputSchema: {},
			target: 'background',
			...tool,
		})
	}

	function getTool(name) {
		return registry.get(String(name || '').trim())
	}

	function listTools() {
		return Array.from(registry.values())
	}

	function hasTool(name) {
		return registry.has(String(name || '').trim())
	}

	function getToolPromptLines() {
		return listTools().map((tool) => {
			const schema = formatSchema(tool.inputSchema)
			return `- ${tool.name}: ${tool.description}${schema ? ` input=${schema}` : ''}`
		})
	}

	async function executeTool(session, action) {
		const tool = getTool(action?.name)
		if (!tool) return { success: false, message: `未知工具: ${action?.name || '(empty)'}` }
		return tool.execute(session, action?.input || {}, action || {})
	}

	function formatSchema(schema) {
		if (!schema || typeof schema !== 'object') return ''
		const entries = Object.entries(schema).map(([key, value]) => `${key}:${value}`)
		return entries.length ? `{${entries.join(', ')}}` : ''
	}

	function pageActionTool(name, description, inputSchema) {
		registerTool({
			name,
			description,
			inputSchema,
			target: 'content',
			execute: async (session, input) => executePageAction(session, name, input),
		})
	}

	async function executePageAction(session, name, input) {
		const inputMode = session?.config?.inputMode === 'standard' ? 'standard' : 'realistic'
		try {
			const timeoutMs = getPageActionTimeoutMs(name)
			const result = await sendTabMessage(session.currentTabId, {
				type: MSG_TYPES.ACT,
				action: {
					name,
					input: input || {},
					meta: { inputMode },
				},
			}, {
				maxRetries: 0,
				timeoutMs,
			})
			return {
				success: !!result?.success,
				message: result?.message || '执行完成',
				meta: result?.meta || null,
			}
		} catch (error) {
			return { success: false, message: `页面动作执行失败: ${String(error)}` }
		}
	}

	function getPageActionTimeoutMs(name) {
		const actionName = String(name || '')
		if (actionName === 'select_cascader_path') return 18000
		if (actionName === 'select_dropdown_option' || actionName === 'select_checkbox_option') return 7000
		if (actionName === 'input_text' || actionName === 'type') return 7000
		if (actionName === 'scroll' || actionName === 'scroll_horizontally') return 6000
		return 5500
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
	}

	registerTool({
		name: 'open_new_tab',
		description: '打开一个新的浏览器标签页并切换到该标签页。',
		inputSchema: { url: 'string|required' },
		execute: async (session, input) => {
			const url = String(input.url || '').trim()
			if (!url) return { success: false, message: 'open_new_tab 缺少 url 参数。' }
			const created = await createTabAndWaitLoaded(session.windowId, normalizeUrl(url))
			session.currentTabId = created.id
			await waitForPageBridgeSoft(created.id)
			return { success: true, message: `已打开新标签页: ${created.id}` }
		},
	})

	registerTool({
		name: 'switch_to_tab',
		description: '切换到指定标签页。',
		inputSchema: { tab_id: 'number|required' },
		execute: async (session, input) => {
			const tabId = Number(input.tab_id)
			if (!Number.isFinite(tabId)) return { success: false, message: 'switch_to_tab 参数无效。' }
			try {
				await chrome.tabs.update(tabId, { active: true })
				session.currentTabId = tabId
				await waitForPageBridgeSoft(tabId)
				return { success: true, message: `已切换到标签页 ${tabId}` }
			} catch (error) {
				return { success: false, message: `切换标签页失败: ${String(error)}` }
			}
		},
	})

	registerTool({
		name: 'close_tab',
		description: '关闭指定标签页。',
		inputSchema: { tab_id: 'number|required' },
		execute: async (session, input) => {
			const tabId = Number(input.tab_id)
			if (!Number.isFinite(tabId)) return { success: false, message: 'close_tab 参数无效。' }
			try {
				await chrome.tabs.remove(tabId)
				if (session.currentTabId === tabId) {
					const tabs = await chrome.tabs.query({ windowId: session.windowId, active: true })
					session.currentTabId = tabs[0]?.id || session.controllerTabId
				}
				return { success: true, message: `已关闭标签页 ${tabId}` }
			} catch (error) {
				return { success: false, message: `关闭标签页失败: ${String(error)}` }
			}
		},
	})

	registerTool({
		name: 'wait',
		description: '等待页面、弹层、下拉结果或异步内容稳定；不要用它替代明确动作。',
		inputSchema: { ms: 'number|optional', reason: 'string|optional' },
		execute: async (_session, input) => {
			const ms = Math.max(200, Math.min(10000, Number(input.ms || input.timeout_ms || 1000)))
			await sleep(ms)
			return { success: true, message: `已等待 ${ms}ms${input.reason ? `：${input.reason}` : '。'}` }
		},
	})

	registerTool({
		name: 'ask_user',
		description: '当缺少验证码、账号、确认信息或出现无法判断的选项时，向用户提问并等待回答。',
		inputSchema: { question: 'string|required', placeholder: 'string|optional' },
		execute: async (session, input) => {
			const question = String(input.question || input.text || '').trim()
			if (!question) return { success: false, message: 'ask_user 缺少 question 参数。' }
			try {
				const response = await sendRuntimeMessage({
					type: MSG_TYPES.ASK_USER_REQUEST,
					payload: {
						sessionId: session.id,
						title: 'Agent 需要你确认',
						question,
						placeholder: String(input.placeholder || ''),
					},
				})
				if (!response?.ok) {
					return { success: false, message: response?.error || '用户未提供回答。' }
				}
				return {
					success: true,
					message: `用户回答: ${String(response.answer || '').trim() || '(empty)'}`,
					meta: { answer: String(response.answer || '') },
				}
			} catch (error) {
				return { success: false, message: `询问用户失败: ${String(error)}` }
			}
		},
	})

	pageActionTool('click_element_by_index', '点击当前观察结果中的指定元素索引。', {
		index: 'number|required',
	})
	pageActionTool('click', 'click_element_by_index 的兼容别名，点击当前观察结果中的指定元素索引。', {
		index: 'number|required',
	})
	pageActionTool('input_text', '向当前观察结果中的可编辑元素输入文本。', {
		index: 'number|required',
		text: 'string|required',
	})
	pageActionTool('type', 'input_text 的兼容别名，向当前观察结果中的可编辑元素输入文本。', {
		index: 'number|required',
		text: 'string|required',
	})
	pageActionTool('scroll', '纵向滚动页面或可滚动容器。', {
		down: 'boolean|optional',
		pixels: 'number|optional',
		index: 'number|optional',
	})
	pageActionTool('keypress', '向当前焦点元素发送键盘事件。', {
		key: 'string|required',
		ctrlKey: 'boolean|optional',
		metaKey: 'boolean|optional',
		shiftKey: 'boolean|optional',
		altKey: 'boolean|optional',
	})
	pageActionTool('hover_element_by_index', '悬浮指定元素索引，用于展开级联选择器、菜单或 tooltip。', {
		index: 'number|required',
	})
	pageActionTool('select_dropdown_option', '打开下拉框后，按可见文本选择匹配的选项。', {
		index: 'number|optional',
		text: 'string|required',
	})
	pageActionTool('select_checkbox_option', '按文本选择多选下拉或列表中的复选项，优先点击左侧复选框。', {
		text: 'string|required',
		index: 'number|optional',
	})
pageActionTool('select_cascader_path', '按路径逐级选择级联选项；父级持续悬浮展开下一列，禁止滚动上一级菜单查找下一级。', {
		path: 'string[]|required',
		index: 'number|optional',
	})
	pageActionTool('scroll_horizontally', '横向滚动页面或指定可滚动容器。', {
		right: 'boolean|optional',
		pixels: 'number|optional',
		index: 'number|optional',
	})
	pageActionTool('locate_by_vision', '手动触发视觉定位回退并执行当前动作。', {
		target_description: 'string|optional',
		index: 'number|optional',
		text: 'string|optional',
	})

	async function waitForPageBridgeSoft(tabId) {
		const deadline = Date.now() + 3200
		while (Date.now() < deadline) {
			try {
				const tab = await chrome.tabs.get(tabId)
				const url = String(tab?.url || '')
				if (!/^https?:\/\//i.test(url)) return
				if (tab?.status !== 'complete') {
					await sleep(180)
					continue
				}
				await sendTabMessage(tabId, { type: MSG_TYPES.OBSERVE }, { maxRetries: 0, timeoutMs: 900 })
				return
			} catch (_) {
				await sleep(220)
			}
		}
	}

	g.NC_BG_TOOLS = {
		registerTool,
		getTool,
		listTools,
		hasTool,
		getToolPromptLines,
		executeTool,
	}
})(globalThis)
