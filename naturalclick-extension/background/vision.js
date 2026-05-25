;(function (g) {
	const { TYPES: MSG_TYPES, VISION_CONFIDENCE_THRESHOLD, MAX_TRACE_ITEMS } = g.NC_BG_CONSTANTS
	const { callOpenAI } = g.NC_BG_PLANNER
	const { sendTabMessage, clamp, safeJsonParse, generateId } = g.NC_BG_UTILS

	function canUseVisionFallback(action) {
		if (!action || typeof action.name !== 'string') return false
		return ['click', 'click_element_by_index', 'input_text', 'type'].includes(action.name)
	}

	async function attemptVisionFallback(session, decision, observation) {
		const latestObservation = await getLatestObservation(session, observation)
		const effectiveObservation = latestObservation?.success ? latestObservation.data : observation
		if (isVisionDisabledForUrl(session?.config, effectiveObservation?.url)) {
			return { success: false, message: '当前域名已配置为禁用视觉截图回退。' }
		}
		const screenshot = await captureCurrentTab(session)
		if (!screenshot.success) return screenshot

		const viewport = effectiveObservation?.viewport || { width: 1280, height: 720 }
		const candidateResults = []

		const mmResult = await locateByVisionModel(
			session,
			session.config.multiModalLLM,
			decision,
			effectiveObservation,
			screenshot.dataUrl,
			viewport,
			'multi_modal'
		)
		candidateResults.push(mmResult)
		if (mmResult.success && mmResult.confidence >= VISION_CONFIDENCE_THRESHOLD) {
			return executeVisionLocatedAction(session, decision.action, mmResult, 'multi_modal')
		}

		if (!isSameVisionEndpoint(session.config.multiModalLLM, session.config.visionService)) {
			const visionResult = await locateByVisionModel(
				session,
				session.config.visionService,
				decision,
				effectiveObservation,
				screenshot.dataUrl,
				viewport,
				'vision_service'
			)
			candidateResults.push(visionResult)
			if (visionResult.success && visionResult.confidence >= VISION_CONFIDENCE_THRESHOLD) {
				return executeVisionLocatedAction(session, decision.action, visionResult, 'vision_service')
			}
		}

		const reason = candidateResults
			.map((r) => `${r.source}: ${r.success ? `confidence=${r.confidence}` : r.message}`)
			.join('; ')
		return { success: false, message: reason || '视觉定位没有返回可用坐标。' }
	}

	async function getLatestObservation(session, fallback) {
		try {
			const latest = await g.NC_BG_EXECUTOR.requestObservation(session.currentTabId)
			if (latest?.ok && latest.data) {
				return { success: true, data: latest.data }
			}
			return { success: false, data: fallback }
		} catch (_) {
			return { success: false, data: fallback }
		}
	}

	async function executeVisionLocatedAction(session, action, located, source) {
		const candidates = buildCandidatePoints(located)
		const errors = []
		const needEditable = ['input_text', 'type'].includes(action?.name)
		const inputMode = session?.config?.inputMode === 'standard' ? 'standard' : 'realistic'

		for (let i = 0; i < candidates.length; i++) {
			const point = candidates[i]
			const hit = await hitTestPoint(session, point.x, point.y)
			if (!hit.success) {
				errors.push(`attempt${i + 1}: hittest failed`)
				continue
			}
			if (hit.hit?.ignored) {
				errors.push(`attempt${i + 1}: hit ignored area`)
				continue
			}
			if (needEditable && !hit.hit?.editable) {
				errors.push(`attempt${i + 1}: target not editable`)
				continue
			}
			if (!needEditable && !hit.hit?.clickable && !hit.hit?.editable) {
				errors.push(`attempt${i + 1}: target not clickable`)
				continue
			}
			if (!isHitCompatibleWithVisionTarget(hit.hit, located, action)) {
				errors.push(`attempt${i + 1}: target mismatch (${hit.hit?.text || hit.hit?.tag || 'unknown'})`)
				continue
			}

			try {
				const result = await sendTabMessage(session.currentTabId, {
					type: MSG_TYPES.ACT_COORD,
					action: {
						name: action.name,
						input: {
							x: point.x,
							y: point.y,
							text: action?.input?.text || '',
						},
						meta: { inputMode },
					},
				}, {
					maxRetries: 0,
					timeoutMs: 4500,
				})
				if (result?.success) {
					return {
						success: true,
						message: `${source} 定位成功并完成动作 (x=${Math.round(point.x)}, y=${Math.round(point.y)}, conf=${located.confidence.toFixed(2)}, attempt=${i + 1})`,
						meta: { point: { x: point.x, y: point.y }, source, vision: located.meta || null },
					}
				}
				errors.push(`attempt${i + 1}: ${result?.message || 'action failed'}`)
			} catch (error) {
				errors.push(`attempt${i + 1}: ${String(error)}`)
			}
		}

		return {
			success: false,
			message: `${source} 坐标动作执行失败: ${errors.join('; ') || 'unknown reason'}`,
		}
	}

	async function locateByVisionModel(session, endpoint, decision, observation, dataUrl, viewport, source) {
		if (!endpoint?.baseURL || !endpoint?.model) {
			return { success: false, message: 'endpoint 未配置', source }
		}

		try {
			const actionName = String(decision?.action?.name || 'click')
			const system = [
				'你是网页自动化视觉定位器，任务是为动作提供最可执行的目标坐标。',
				'必须只输出 JSON 对象，禁止 markdown、解释、代码块。',
				'优先输出可点击/可输入的真实网页元素，避开广告、遮罩、弹层关闭按钮、插件面板。',
				'如果动作是输入类，必须优先定位可编辑输入区域（input/textarea/contenteditable）。',
				'如果 DOM 候选中存在匹配目标，请优先返回对应 index，并让坐标落在该元素真实可点击/可输入区域。',
				'复选框/单选框必须命中小方块或圆点控件本身，不要命中文字中心。',
				'级联选择器父级应命中可触发展开的位置，最终叶子节点应命中文本行或选中控件。',
				'输出字段:',
				'1) x_ratio, y_ratio, w_ratio, h_ratio, confidence, reason, target_type, index, label',
				'2) candidates: 可选数组，按置信度降序，元素字段同上（至少包含 x_ratio,y_ratio,confidence）',
				'所有 ratio 都在 0~1 之间。',
				'若无法可靠定位，仍返回一个最可能点，但 confidence 必须 <= 0.35 并在 reason 说明不确定原因。',
			].join('\n')

			const shortDom = String(observation?.content || '').slice(0, 3600)
			const domCandidates = buildVisionCandidateSummary(observation, decision?.action)
			const actionHint = buildActionHint(actionName, decision?.action?.input)
			const userText = [
				`任务: ${decision?.next_goal || decision?.thought || '定位当前应执行目标'}`,
				`动作: ${actionName}`,
				`动作输入: ${JSON.stringify(decision?.action?.input || {})}`,
				`动作定位约束: ${actionHint}`,
				`当前URL: ${observation?.url || ''}`,
				`当前标题: ${observation?.title || ''}`,
				`视口尺寸: ${viewport.width} x ${viewport.height}`,
				`可交互DOM摘要:\n${shortDom}`,
				`优先候选元素:\n${domCandidates || '(none)'}`,
				'请结合截图和DOM摘要给出主目标坐标，并尽量提供2~3个候选坐标。',
				'输出示例: {"index":12,"label":"确认密码","target_type":"input","x_ratio":0.52,"y_ratio":0.41,"w_ratio":0.12,"h_ratio":0.06,"confidence":0.86,"reason":"...","candidates":[{"index":12,"x_ratio":0.52,"y_ratio":0.41,"confidence":0.86},{"x_ratio":0.55,"y_ratio":0.42,"confidence":0.71}]}',
			].join('\n\n')

			const messages = [
				{ role: 'system', content: system },
				{
					role: 'user',
					content: [
						{ type: 'text', text: userText },
						{ type: 'image_url', image_url: { url: dataUrl } },
					],
				},
			]
			const result = await callOpenAI(endpoint, messages, { returnMeta: true })
			appendModelTrace(session, {
				title: `模型调用: 视觉定位 (${source})`,
				ok: true,
				detail: `${endpoint.model} 请求成功`,
				io: result.io,
			})
			const content = result.content

			const parsed = safeJsonParse(content)
			if (!parsed) {
				return { success: false, message: '模型返回非 JSON', source }
			}

			const normalized = normalizeVisionResult(parsed, viewport)
			if (!normalized.ok) {
				return { success: false, message: normalized.message, source }
			}

			return {
				success: true,
				source,
				centerX: normalized.centerX,
				centerY: normalized.centerY,
				viewportWidth: viewport.width,
				viewportHeight: viewport.height,
				wRatio: normalized.wRatio,
				hRatio: normalized.hRatio,
				confidence: normalized.confidence,
				reason: normalized.reason,
				candidates: normalized.candidates,
				meta: normalized.meta,
			}
		} catch (error) {
			appendModelTrace(session, {
				title: `模型调用: 视觉定位 (${source})`,
				ok: false,
				detail: String(error?.message || error || '视觉模型请求失败'),
				io: error?.io || null,
			})
			return {
				success: false,
				message: String(error?.message || error || '视觉模型请求失败'),
				source,
			}
		}
	}

	function appendModelTrace(session, payload) {
		if (!session || !Array.isArray(session.traceItems)) return
		session.traceItems.push({
			id: generateId('m'),
			title: payload.title,
			detail: payload.detail,
			kind: payload.ok ? 'model' : 'error',
			io: payload.io || undefined,
		})
		session.traceItems = session.traceItems.slice(-MAX_TRACE_ITEMS)
	}

	async function captureCurrentTab(session) {
		try {
			await chrome.tabs.update(session.currentTabId, { active: true })
			const dataUrl = await captureVisibleTab(session.windowId)
			return { success: true, dataUrl }
		} catch (error) {
			return { success: false, message: `截图失败: ${String(error)}` }
		}
	}

	function captureVisibleTab(windowId) {
		return new Promise((resolve, reject) => {
			chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
				if (chrome.runtime.lastError || !dataUrl) {
					reject(new Error(chrome.runtime.lastError?.message || 'captureVisibleTab failed'))
					return
				}
				resolve(dataUrl)
			})
		})
	}

	function buildCandidatePoints(located) {
		const points = []
		const cx = located.centerX
		const cy = located.centerY
		const vx = Number(located.viewportWidth || 1280)
		const vy = Number(located.viewportHeight || 720)
		const preferredCandidates = Array.isArray(located.candidates) ? located.candidates : []
		for (const c of preferredCandidates.slice(0, 6)) {
			points.push({
				x: clamp(Number(c?.x), 1, vx - 1),
				y: clamp(Number(c?.y), 1, vy - 1),
			})
		}
		const spanX = Math.max(14, Math.round(vx * Math.max(0.01, located.wRatio || 0.05) * 0.35))
		const spanY = Math.max(14, Math.round(vy * Math.max(0.01, located.hRatio || 0.05) * 0.35))
		const offsets = [
			[0, 0],
			[spanX, 0],
			[-spanX, 0],
			[0, spanY],
			[0, -spanY],
			[spanX, spanY],
			[-spanX, spanY],
			[spanX, -spanY],
			[-spanX, -spanY],
		]
		for (const [dx, dy] of offsets) {
			points.push({
				x: clamp(cx + dx, 1, vx - 1),
				y: clamp(cy + dy, 1, vy - 1),
			})
		}
		return dedupePoints(points).slice(0, 5)
	}

	function normalizeVisionResult(parsed, viewport) {
		if (!parsed || typeof parsed !== 'object') {
			return { ok: false, message: '视觉模型返回结构无效' }
		}
		const primary = parsed?.target && typeof parsed.target === 'object' ? parsed.target : parsed
		const xRatio = pickRatio(primary, ['x_ratio', 'center_x_ratio', 'x', 'center_x'], viewport.width)
		const yRatio = pickRatio(primary, ['y_ratio', 'center_y_ratio', 'y', 'center_y'], viewport.height)
		if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio)) {
			return { ok: false, message: '坐标比例无效' }
		}

		const wRatio = pickRatio(primary, ['w_ratio', 'width_ratio', 'w', 'width'], viewport.width, 0.05)
		const hRatio = pickRatio(primary, ['h_ratio', 'height_ratio', 'h', 'height'], viewport.height, 0.05)
		const confidence = clamp(Number(primary?.confidence ?? parsed?.confidence ?? 0), 0, 1)
		const reason = String(primary?.reason || parsed?.reason || '').trim()
		const targetType = String(primary?.target_type || primary?.type || parsed?.target_type || '').trim()
		const label = String(primary?.label || primary?.text || parsed?.label || '').trim()
		const index = Number(primary?.index ?? parsed?.index)
		const centerX = clamp(xRatio, 0, 1) * viewport.width
		const centerY = clamp(yRatio, 0, 1) * viewport.height

		const rawCandidates = Array.isArray(parsed?.candidates)
			? parsed.candidates
			: Array.isArray(parsed?.alternatives)
				? parsed.alternatives
				: []
		const candidates = rawCandidates
			.map((item) => {
				if (!item || typeof item !== 'object') return null
				const xr = pickRatio(item, ['x_ratio', 'center_x_ratio', 'x', 'center_x'], viewport.width)
				const yr = pickRatio(item, ['y_ratio', 'center_y_ratio', 'y', 'center_y'], viewport.height)
				if (!Number.isFinite(xr) || !Number.isFinite(yr)) return null
				return {
					x: clamp(xr, 0, 1) * viewport.width,
					y: clamp(yr, 0, 1) * viewport.height,
					confidence: clamp(Number(item?.confidence ?? 0), 0, 1),
					index: Number.isFinite(Number(item?.index)) ? Number(item.index) : null,
					label: String(item?.label || item?.text || '').trim(),
					targetType: String(item?.target_type || item?.type || '').trim(),
				}
			})
			.filter(Boolean)
			.sort((a, b) => b.confidence - a.confidence)

		return {
			ok: true,
			centerX,
			centerY,
			wRatio: clamp(wRatio, 0, 1),
			hRatio: clamp(hRatio, 0, 1),
			confidence,
			reason,
			candidates,
			meta: {
				index: Number.isFinite(index) ? index : null,
				label,
				targetType,
			},
		}
	}

	function pickRatio(obj, keys, viewportSize, fallback = NaN) {
		for (const key of keys) {
			if (!(key in obj)) continue
			const raw = Number(obj[key])
			if (!Number.isFinite(raw)) continue
			if (raw >= 0 && raw <= 1) return raw
			if (raw > 1 && viewportSize > 0) {
				return raw / viewportSize
			}
		}
		return fallback
	}

	function dedupePoints(points) {
		const set = new Set()
		const result = []
		for (const p of points) {
			const x = Math.round(Number(p?.x) || 0)
			const y = Math.round(Number(p?.y) || 0)
			const key = `${x}:${y}`
			if (set.has(key)) continue
			set.add(key)
			result.push({ x, y })
		}
		return result
	}

	function isHitCompatibleWithVisionTarget(hit, located, action) {
		if (!hit) return false
		const targetType = String(located?.meta?.targetType || '').toLowerCase()
		const expectedLabel = normalizeTextForCompare(located?.meta?.label || action?.input?.label || '')
		const hitText = normalizeTextForCompare(hit.text || '')
		if (expectedLabel && hitText && !hitText.includes(expectedLabel) && !expectedLabel.includes(hitText)) {
			if (!['input', 'textarea', 'editable'].includes(targetType)) return false
		}
		if (targetType.includes('input') || targetType.includes('textarea') || targetType.includes('editable')) {
			return !!hit.editable
		}
		if (targetType.includes('checkbox') || targetType.includes('radio')) {
			return !!hit.clickable || /checkbox|radio|input|span|label/i.test(String(hit.tag || ''))
		}
		return true
	}

	function buildVisionCandidateSummary(observation, action) {
		const actionIndex = Number(action?.input?.index)
		const actionText = normalizeTextForCompare(action?.input?.text || action?.input?.label || '')
		const elements = Array.isArray(observation?.elements) ? observation.elements : []
		const rows = []
		for (const item of elements) {
			if (!item || typeof item !== 'object') continue
			const label = String(item.label || item.placeholder || item.text || '')
			const normalizedLabel = normalizeTextForCompare(label)
			const isIndexMatch = Number.isFinite(actionIndex) && Number(item.index) === actionIndex
			const isTextMatch = actionText && normalizedLabel.includes(actionText)
			const isUseful =
				isIndexMatch ||
				isTextMatch ||
				item.fieldType ||
				item.actionIntent ||
				item.selectionControl ||
				item.newSinceLastObservation
			if (!isUseful) continue
			const rect = item.rect || {}
			rows.push(
				`[${item.index}] label="${shortText(label, 48)}" fieldType=${item.fieldType || '-'} intent=${item.actionIntent || '-'} control=${item.selectionControl || '-'} value=${item.valueState || '-'} rect=${rect.left},${rect.top},${rect.width}x${rect.height}${item.newSinceLastObservation ? ' new=true' : ''}`
			)
		}
		return rows.slice(0, 60).join('\n')
	}

	function normalizeTextForCompare(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
	}

	function shortText(value, maxLen) {
		const text = String(value || '')
		return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`
	}

	function buildActionHint(actionName, actionInput) {
		if (actionName === 'input_text' || actionName === 'type') {
			const txt = String(actionInput?.text || '')
			return `必须命中可输入区域，避免按钮与标签。待输入文本长度=${txt.length}`
		}
		return '优先命中主要交互目标，不要命中页面边缘、广告或悬浮遮罩。'
	}

	function isVisionDisabledForUrl(config, url) {
		const rules = Array.isArray(config?.visionDisabledDomains) ? config.visionDisabledDomains : []
		if (!rules.length) return false
		let host = ''
		try {
			host = new URL(String(url || '')).hostname.toLowerCase()
		} catch (_) {
			return false
		}
		return rules.some((rule) => {
			const normalized = String(rule || '').toLowerCase().trim()
			if (!normalized) return false
			return host === normalized || host.endsWith(`.${normalized}`)
		})
	}

	async function hitTestPoint(session, x, y) {
		try {
			const result = await sendTabMessage(session.currentTabId, {
				type: MSG_TYPES.HIT_TEST,
				payload: { x, y },
			}, {
				maxRetries: 0,
				timeoutMs: 2200,
			})
			if (!result) return { success: false, message: 'empty hittest result' }
			return { success: !!result.success, hit: result.hit, message: result.message || '' }
		} catch (error) {
			return { success: false, message: String(error) }
		}
	}

	function isSameVisionEndpoint(a, b) {
		const baseA = String(a?.baseURL || '').replace(/\/+$/, '')
		const baseB = String(b?.baseURL || '').replace(/\/+$/, '')
		const modelA = String(a?.model || '')
		const modelB = String(b?.model || '')
		return !!baseA && baseA === baseB && modelA === modelB
	}

	g.NC_BG_VISION = {
		canUseVisionFallback,
		attemptVisionFallback,
	}
})(globalThis)
