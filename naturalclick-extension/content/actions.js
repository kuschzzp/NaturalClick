;(function (g) {
	function createActions({ observer, clampNumber, visual }) {
		const actionState = g.NC_CONTENT_ACTION_STATE?.createActionState?.({
			observer,
			contract: g.NC_ACTION_CONTRACT,
		})
		if (!actionState) throw new Error('NC_CONTENT_ACTION_STATE 未加载。')
		const {
			OUTCOME_KIND,
			appendStateChange,
			createOutcome,
			getElementInteractionState,
			inferInteractionOutcome,
		} = actionState
		const inputActions = g.NC_CONTENT_ACTION_INPUT?.createInputActions?.({
			observer,
			humanLikeClick,
			isDisabledElement,
			isReadonlyElement,
			setNativeValue,
			sleep,
			randomBetween,
			createOutcome,
			OUTCOME_KIND,
		})
		if (!inputActions) throw new Error('NC_CONTENT_ACTION_INPUT 未加载。')
		const scrollActions = g.NC_CONTENT_ACTION_SCROLL?.createScrollActions?.({
			observer,
			createOutcome,
			OUTCOME_KIND,
			sleep,
		})
		if (!scrollActions) throw new Error('NC_CONTENT_ACTION_SCROLL 未加载。')
		const optionHelpers = g.NC_CONTENT_ACTION_OPTIONS?.createOptionHelpers?.({
			observer,
			setNativeValue,
			sleep,
			isVisibleClickTarget,
			isTopLayerClickable,
		})
		if (!optionHelpers) throw new Error('NC_CONTENT_ACTION_OPTIONS 未加载。')
		const {
			compareOptionCandidate,
			findNestedSelectableControl,
			getVisibleOptionLabel,
			isCascaderParentOption,
			listNativeSelectOptionLabels,
			listVisibleOptionLabels,
			normalizeComparableText,
			resolveDropdownTrigger,
			resolveNativeSelect,
			resolveSelectableClickTarget,
			selectOptionByText,
			waitForVisibleOption,
		} = optionHelpers
		const cascaderHelpers = g.NC_CONTENT_ACTION_CASCADER?.createCascaderHelpers?.({
			sleep,
			randomBetween,
			normalizeComparableText,
			getVisibleOptionLabel,
			compareOptionCandidate,
			isVisibleClickTarget,
			pulseSustainedHover,
		})
		if (!cascaderHelpers) throw new Error('NC_CONTENT_ACTION_CASCADER 未加载。')
		const {
			bringCascaderOptionIntoView,
			findCascaderOptionByScrolling,
			isDomVisibleInActivePopup,
			summarizeCascaderLevel,
			waitForCascaderMenuLevel,
		} = cascaderHelpers
		const selectActions = g.NC_CONTENT_ACTION_SELECT?.createSelectActions?.({
			observer,
			humanLikeClick,
			hoverElement,
			isDisabledElement,
			setNativeValue,
			sleep,
			randomBetween,
			appendStateChange,
			createOutcome,
			getElementInteractionState,
			inferInteractionOutcome,
			OUTCOME_KIND,
			waitForVisibleOption,
			listVisibleOptionLabels,
			getVisibleOptionLabel,
			resolveDropdownTrigger,
			resolveNativeSelect,
			listNativeSelectOptionLabels,
			selectOptionByText,
			resolveSelectableClickTarget,
			findCascaderOptionByScrolling,
			bringCascaderOptionIntoView,
			waitForCascaderMenuLevel,
			summarizeCascaderLevel,
		})
		if (!selectActions) throw new Error('NC_CONTENT_ACTION_SELECT 未加载。')
		let lastClickedElement = null
		let sustainedHoverElement = null
		let sustainedHoverPoint = null
		let sustainedHoverTimer = 0
		let sustainedHoverExpiresAt = 0
		let lastPointer = {
			x: window.innerWidth * 0.5,
			y: Math.min(window.innerHeight * 0.35, 240),
		}

		async function executeAction(action) {
			const name = action?.name
			const input = action?.input || {}
			const inputMode = getInputMode(action)
			if (!name) return buildActionFailureResult('动作名为空。', 'missing_action_name')

			if (name === 'click_element_by_index' || name === 'click') {
				const index = Number(input.index)
				return clickByIndex(index, inputMode, input)
			}

			if (name === 'input_text' || name === 'type') {
				const index = Number(input.index)
				const text = String(input.text || '')
				return inputActions.inputByIndex(index, text, inputMode)
			}

			if (name === 'scroll') {
				return scrollActions.scrollAction(input)
			}

			if (name === 'keypress') {
				const key = String(input.key || 'Enter')
				return inputActions.keypressAction({
					key,
					ctrlKey: !!input.ctrlKey,
					altKey: !!input.altKey,
					shiftKey: !!input.shiftKey,
					metaKey: !!input.metaKey,
				})
			}

			if (name === 'hover_element_by_index') {
				const index = Number(input.index)
				return hoverByIndex(index, inputMode)
			}

			if (name === 'open_dropdown') {
				return selectActions.openDropdownAction(input, inputMode)
			}

			if (name === 'choose_dropdown_option') {
				return selectActions.chooseDropdownOptionAction(input, inputMode)
			}

			if (name === 'select_dropdown_option') {
				return selectActions.selectDropdownOptionAction(input, inputMode)
			}

			if (name === 'select_checkbox_option') {
				return selectActions.selectCheckboxOptionAction(input, inputMode)
			}

			if (name === 'select_cascader_path') {
				return selectActions.selectCascaderPathAction(input, inputMode)
			}

			if (name === 'scroll_horizontally') {
				return scrollActions.scrollHorizontalAction(input)
			}

			return buildActionFailureResult(`不支持的动作: ${name}`, 'unsupported_action')
		}

		async function executeCoordinateAction(action) {
			const name = action?.name
			const input = action?.input || {}
			const inputMode = getInputMode(action)
			const x = clampNumber(Number(input.x), 0, window.innerWidth, window.innerWidth / 2)
			const y = clampNumber(Number(input.y), 0, window.innerHeight, window.innerHeight / 2)

			if (name === 'click' || name === 'click_element_by_index') {
				return clickByPoint(x, y, inputMode)
			}

			if (name === 'input_text' || name === 'type') {
				return inputActions.inputByPoint(x, y, String(input.text || ''), inputMode)
			}

			return buildActionFailureResult(`坐标动作不支持: ${name}`, 'unsupported_coordinate_action')
		}

		async function clickByIndex(index, inputMode, input = {}) {
			const element = observer.getElementByIndex(index)
			if (!element) {
				return buildActionFailureResult(`索引 ${index} 不存在。`, 'missing_index', { index })
			}
			if (observer.isIgnoredElement(element)) {
				return buildActionFailureResult(`索引 ${index} 命中插件忽略区域。`, 'ignored_extension_region', { index })
			}
			if (isDisabledElement(element)) {
				return buildActionFailureResult(`索引 ${index} 对应元素已禁用。`, 'disabled_target', { index })
			}
			const before = getElementInteractionState(element)
			const clickInfo = await humanLikeClick(element, null, inputMode, input)
			const after = getElementInteractionState(element)
			const clickTargetMessage = formatClickTargetMessage(clickInfo)
			return {
				success: true,
				message: appendStateChange(`已点击索引 ${index}${clickTargetMessage}。`, before, after),
				meta: {
					before,
					after,
					clickTarget: clickInfo?.clickTarget || null,
					hitTarget: clickInfo?.hitTarget || null,
					point: clickInfo?.point || null,
					outcome: inferInteractionOutcome(before, after),
				},
			}
		}

		async function clickByPoint(x, y, inputMode) {
			const target = observer.findElementAtPoint(x, y)
			if (!target) {
				return buildActionFailureResult(
					`坐标(${Math.round(x)}, ${Math.round(y)})未命中可用元素。`,
					'missing_coordinate_target',
					{ point: { x, y } }
				)
			}
			if (observer.isIgnoredElement(target)) {
				return buildActionFailureResult('命中了插件面板区域，坐标无效。', 'ignored_extension_region', { point: { x, y } })
			}
			if (isDisabledElement(target)) {
				return buildActionFailureResult('坐标命中元素已禁用。', 'disabled_target', { point: { x, y } })
			}
			const before = getElementInteractionState(target)
			await humanLikeClick(target, { x, y }, inputMode)
			const after = getElementInteractionState(target)
			return {
				success: true,
				message: appendStateChange(`已点击坐标(${Math.round(x)}, ${Math.round(y)}).`, before, after),
				meta: { before, after, point: { x, y }, outcome: inferInteractionOutcome(before, after) },
			}
		}

		async function hoverByIndex(index, inputMode) {
			const element = observer.getElementByIndex(index)
			if (!element) return buildActionFailureResult(`索引 ${index} 不存在。`, 'missing_index', { index })
			if (isDisabledElement(element)) return buildActionFailureResult(`索引 ${index} 对应元素已禁用。`, 'disabled_target', { index })
			const before = getElementInteractionState(element)
			await hoverElement(element, inputMode)
			const after = getElementInteractionState(element)
			return {
				success: true,
				message: appendStateChange(`已悬浮索引 ${index}。`, before, after),
				meta: { before, after, outcome: inferInteractionOutcome(before, after) },
			}
		}

		function getInputMode(action) {
			const inputMode = String(action?.meta?.inputMode || '').trim()
			return inputMode === 'standard' || inputMode === 'direct' ? inputMode : 'realistic'
		}

		function buildActionFailureResult(message, reason, details) {
			const cleanReason = String(reason || message || 'action_failed')
			const metaDetails = details && typeof details === 'object' ? details : {}
			return {
				success: false,
				message,
				meta: {
					...metaDetails,
					outcome: createOutcome(OUTCOME_KIND.FAILED, {
						reason: cleanReason,
						...metaDetails,
					}),
				},
			}
		}

		async function humanLikeClick(element, point, inputMode, input = {}) {
			const clickElement = resolveClickElement(element, input) || element
			clickElement.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' })
			const rect = clickElement.getBoundingClientRect()
			const preferredPoint = Number.isFinite(point?.x) && Number.isFinite(point?.y)
				? point
				: getPreferredClickPoint(clickElement, rect, input)
			const targetX = clampNumber(
				Number(preferredPoint?.x),
				1,
				window.innerWidth - 1,
				rect.left + rect.width / 2
			)
			const targetY = clampNumber(
				Number(preferredPoint?.y),
				1,
				window.innerHeight - 1,
				rect.top + rect.height / 2
			)
			const x =
				inputMode === 'realistic'
					? clampNumber(targetX + randomBetween(-1.6, 1.6), 1, window.innerWidth - 1, targetX)
					: targetX
			const y =
				inputMode === 'realistic'
					? clampNumber(targetY + randomBetween(-1.6, 1.6), 1, window.innerHeight - 1, targetY)
					: targetY
			await blurLastClickedElement(clickElement)
			lastClickedElement = clickElement
			try {
				visual?.markActionTarget?.(clickElement)
				if (inputMode === 'realistic') {
					await movePointerRealistic(x, y)
					await visual?.movePointerTo?.(x, y, { waitMs: 0 })
					await visual?.clickPointer?.({ waitMs: randomBetween(35, 70) })
				} else {
					await visual?.movePointerTo?.(x, y, { waitMs: 0 })
					await visual?.clickPointer?.({ waitMs: 45 })
					lastPointer = { x, y }
				}
			} catch (_) {}

			// 点击前做命中测试，尽量模拟真实点击目标（最深层元素）
			const doc = clickElement.ownerDocument || document
			const hitTarget = doc.elementFromPoint(x, y)
			const target =
				hitTarget instanceof HTMLElement && clickElement.contains(hitTarget) ? hitTarget : clickElement
			const clickInfo = buildClickInfo(clickElement, hitTarget, target, x, y)

			const pointerOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				pointerType: 'mouse',
			}
			const mouseOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				button: 0,
			}

			target.dispatchEvent(new PointerEvent('pointerover', pointerOpts))
			target.dispatchEvent(new PointerEvent('pointerenter', { ...pointerOpts, bubbles: false }))
			target.dispatchEvent(new MouseEvent('mouseover', mouseOpts))
			target.dispatchEvent(new MouseEvent('mouseenter', { ...mouseOpts, bubbles: false }))
			target.dispatchEvent(new PointerEvent('pointermove', pointerOpts))
			target.dispatchEvent(new MouseEvent('mousemove', mouseOpts))
			if (isCascaderParentOption(clickElement)) {
				if (target !== clickElement) dispatchHoverSequence(clickElement, x, y)
				startSustainedHover(clickElement, x, y)
				lastPointer = { x, y }
				await sleep(inputMode === 'realistic' ? randomBetween(120, 200) : 120)
				return clickInfo
			}
			target.dispatchEvent(new PointerEvent('pointerdown', pointerOpts))
			target.dispatchEvent(new MouseEvent('mousedown', mouseOpts))
			if (inputMode === 'realistic') {
				await sleep(randomBetween(24, 72))
			}
			const focusTarget = getFocusableClickTarget(target, clickElement)
			focusTarget.focus({ preventScroll: true })
			target.dispatchEvent(new PointerEvent('pointerup', pointerOpts))
			target.dispatchEvent(new MouseEvent('mouseup', mouseOpts))
			target.click()
			await sleep(inputMode === 'realistic' ? randomBetween(45, 95) : 70)
			return clickInfo
		}

		async function hoverElement(element, inputMode) {
			if (!(element instanceof HTMLElement)) return
			element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' })
			const rect = element.getBoundingClientRect()
			const preferredPoint = isCascaderParentOption(element)
				? { x: rect.left + rect.width * 0.76, y: rect.top + rect.height / 2 }
				: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
			const x = clampNumber(preferredPoint.x, 1, window.innerWidth - 1, rect.left + rect.width / 2)
			const y = clampNumber(preferredPoint.y, 1, window.innerHeight - 1, rect.top + rect.height / 2)
			try {
				visual?.markActionTarget?.(element)
				await visual?.movePointerTo?.(x, y, { waitMs: 0 })
			} catch (_) {}
			const target = document.elementFromPoint(x, y)
			const hit = isCascaderParentOption(element)
				? element
				: target instanceof HTMLElement && element.contains(target)
					? target
					: element
			dispatchHoverSequence(hit, x, y)
			startSustainedHover(element, x, y)
			lastPointer = { x, y }
			if (inputMode === 'realistic') await sleep(randomBetween(70, 130))
		}

		function dispatchHoverSequence(target, x, y) {
			const pointerOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				pointerType: 'mouse',
			}
			const mouseOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				button: 0,
			}
			target.dispatchEvent(new PointerEvent('pointerover', pointerOpts))
			target.dispatchEvent(new PointerEvent('pointerenter', { ...pointerOpts, bubbles: false }))
			target.dispatchEvent(new MouseEvent('mouseover', mouseOpts))
			target.dispatchEvent(new MouseEvent('mouseenter', { ...mouseOpts, bubbles: false }))
			target.dispatchEvent(new PointerEvent('pointermove', pointerOpts))
			target.dispatchEvent(new MouseEvent('mousemove', mouseOpts))
		}

		function pulseSustainedHover() {
			if (sustainedHoverElement instanceof HTMLElement && sustainedHoverPoint) {
				dispatchHoverSequence(sustainedHoverElement, sustainedHoverPoint.x, sustainedHoverPoint.y)
				dispatchHoverMove(sustainedHoverElement, sustainedHoverPoint.x, sustainedHoverPoint.y)
			}
		}

		function resolveClickElement(element, input = {}) {
			if (!(element instanceof HTMLElement)) return element
			if (isCascaderParentOption(element)) return element
			const actionControl = findNestedActionControl(element, input)
			if (actionControl) return actionControl
			const selectable = resolveSelectableClickTarget(element)
			if (selectable) return selectable
			const labelTarget = resolveLabelTarget(element)
			if (labelTarget) return labelTarget
			return element
		}

		function resolveLabelTarget(element) {
			if (!(element instanceof HTMLElement)) return null
			const label = element instanceof HTMLLabelElement ? element : element.closest?.('label')
			const targetId = String(label?.getAttribute?.('for') || '').trim()
			if (!targetId) return null
			try {
				const target = document.getElementById(targetId)
				return target instanceof HTMLElement && isVisibleClickTarget(target) ? target : null
			} catch (_) {
				return null
			}
		}

		function getPreferredClickPoint(element, rect, input = {}) {
			if (isCascaderParentOption(element)) {
				return {
					x: rect.left + rect.width * 0.76,
					y: rect.top + rect.height / 2,
				}
			}
			const actionTextPoint = findNestedActionTextPoint(element, input)
			if (actionTextPoint) return actionTextPoint
			const selectable = findNestedSelectableControl(element)
			if (selectable) {
				const selectableRect = selectable.getBoundingClientRect()
				if (selectableRect.width >= 2 && selectableRect.height >= 2) {
					return {
						x: selectableRect.left + selectableRect.width / 2,
						y: selectableRect.top + selectableRect.height / 2,
					}
				}
			}
			return {
				x: rect.left + rect.width / 2,
				y: rect.top + rect.height / 2,
			}
		}

		const ACTION_CONTROL_SELECTOR = [
			'button',
			'a[href]',
			'[role="button"]',
			'[role="link"]',
			'.el-button',
			'.ant-btn',
			'.arco-btn',
			'.n-button',
			'.van-button',
			'[class*="btn"]',
			'[class*="button"]',
		].join(',')

		function findNestedActionControl(element, input = {}) {
			if (!(element instanceof HTMLElement)) return null
			if (!shouldPreferNestedActionTarget(element, input)) return null
			const candidates = []
			const closest = element.closest?.(ACTION_CONTROL_SELECTOR)
			if (closest instanceof HTMLElement && closest !== document.body) candidates.push(closest)
			try {
				candidates.push(...element.querySelectorAll(ACTION_CONTROL_SELECTOR))
			} catch (_) {}
			const seen = new Set()
			const scored = []
			for (const candidate of candidates) {
				if (!(candidate instanceof HTMLElement)) continue
				if (seen.has(candidate)) continue
				seen.add(candidate)
				if (!isVisibleClickTarget(candidate) || isDisabledElement(candidate)) continue
				if (candidate !== element && !element.contains(candidate) && !candidate.contains(element)) continue
				const score = scoreNestedActionTarget(candidate, element, input)
				if (score > 0) scored.push({ candidate, score })
			}
			scored.sort((a, b) => b.score - a.score)
			return scored[0]?.candidate || null
		}

		function findNestedActionTextPoint(element, input = {}) {
			if (!(element instanceof HTMLElement)) return null
			if (!shouldPreferNestedActionTarget(element, input)) return null
			const candidates = []
			try {
				candidates.push(
					...element.querySelectorAll('span,i,em,b,strong,svg,use,[aria-label],[title],[class*="icon"],[class*="plus"]')
				)
			} catch (_) {}
			const seen = new Set()
			const scored = []
			for (const candidate of candidates) {
				if (!(candidate instanceof Element)) continue
				if (seen.has(candidate)) continue
				seen.add(candidate)
				if (!element.contains(candidate)) continue
				const rect = candidate.getBoundingClientRect()
				if (rect.width < 2 || rect.height < 2) continue
				const score = scoreNestedActionTarget(candidate, element, input)
				if (score > 0) {
					scored.push({
						point: {
							x: rect.left + rect.width / 2,
							y: rect.top + rect.height / 2,
						},
						score,
					})
				}
			}
			scored.sort((a, b) => b.score - a.score)
			return scored[0]?.point || null
		}

		function shouldPreferNestedActionTarget(element, input = {}) {
			const labels = getActionInputTargetLabels(input)
			if (labels.length) return true
			return containsCreateLikeActionText(getElementActionLabel(element))
		}

		function scoreNestedActionTarget(candidate, root, input = {}) {
			const desiredLabels = getActionInputTargetLabels(input).map(normalizeActionText).filter(Boolean)
			const label = getElementActionLabel(candidate)
			const key = normalizeActionText(label)
			const classText = getElementClassText(candidate)
			const classKey = normalizeActionText(classText)
			const rootKey = normalizeActionText(getElementActionLabel(root))
			const wantsCreate = desiredLabels.some(isCreateLikeActionKey) || containsCreateLikeActionText(rootKey)
			let score = 0
			if (desiredLabels.length) {
				if (desiredLabels.includes(key)) score += 100
				else if (desiredLabels.some((desired) => desired && (key.includes(desired) || desired.includes(key)))) score += 70
			}
			if (wantsCreate) {
				if (isCreateLikeActionKey(key)) score += 80
				else if (containsCreateLikeActionText(key) && key.length <= 16) score += 45
				if (/(plus|add|create|new|el-icon-plus|icon-add|iconplus)/i.test(classText)) score += 20
			}
			if (score <= 0) return 0
			const tag = String(candidate.tagName || '').toLowerCase()
			const role = String(candidate.getAttribute?.('role') || '').toLowerCase()
			if (tag === 'button' || role === 'button' || tag === 'a' || role === 'link') score += 18
			if (/btn|button|el-button|ant-btn|arco-btn|n-button|van-button/i.test(classText)) score += 12
			if (candidate !== root) score += 10
			const rect = candidate.getBoundingClientRect()
			const rootRect = root.getBoundingClientRect()
			const area = Math.max(1, rect.width * rect.height)
			const rootArea = Math.max(1, rootRect.width * rootRect.height)
			if (area > rootArea * 0.8 && candidate !== root) score -= 30
			if (key.length > 24) score -= Math.min(25, Math.floor((key.length - 24) / 4) + 6)
			if (isTopLayerAtCenter(candidate, rect)) score += 6
			if (/switch|checkbox|radio|select|dropdown|cascader/i.test(`${role} ${classKey}`)) score -= 60
			return score
		}

		function getActionInputTargetLabels(input = {}) {
			const values = [
				input.target_label,
				input.workflow_create_label,
				input.label,
				input.text,
				input.target_description,
			]
			const labels = []
			for (const value of values) {
				const text = String(value || '').trim()
				if (!text) continue
				for (const part of text.split(/[、,，;；|/]+/)) {
					const label = part.trim()
					if (label) labels.push(label)
				}
			}
			return [...new Set(labels)]
		}

		function getElementActionLabel(element) {
			if (!(element instanceof Element)) return ''
			const values = [
				element.getAttribute?.('aria-label'),
				element.getAttribute?.('title'),
				element.getAttribute?.('value'),
			]
			if (element instanceof HTMLElement) values.push(observer.getElementText(element))
			return values.map((value) => String(value || '').trim()).filter(Boolean).join(' ')
		}

		function normalizeActionText(value) {
			return String(value || '')
				.replace(/\s+/g, '')
				.trim()
				.toLowerCase()
		}

		function containsCreateLikeActionText(value) {
			return /(新增|新建|创建|添加|增加|\+|add|create|new)/i.test(normalizeActionText(value))
		}

		function isCreateLikeActionKey(value) {
			const key = normalizeActionText(value)
			return /^(新增|新建|创建|添加|增加|\+|add|create|new)$/.test(key)
		}

		function isTopLayerAtCenter(element, rect) {
			const x = rect.left + rect.width / 2
			const y = rect.top + rect.height / 2
			if (x < 1 || y < 1 || x > window.innerWidth - 1 || y > window.innerHeight - 1) return false
			const hit = document.elementFromPoint(x, y)
			return hit instanceof Element && (hit === element || element.contains(hit) || hit.contains(element))
		}

		function buildClickInfo(clickElement, hitTarget, target, x, y) {
			return {
				point: { x: Math.round(x), y: Math.round(y) },
				clickTarget: summarizeClickElement(clickElement),
				hitTarget: summarizeClickElement(hitTarget),
				dispatchTarget: summarizeClickElement(target),
			}
		}

		function summarizeClickElement(element) {
			if (!(element instanceof Element)) return null
			const rect = element.getBoundingClientRect()
			return {
				tag: String(element.tagName || '').toLowerCase(),
				role: String(element.getAttribute?.('role') || ''),
				text: element instanceof HTMLElement ? observer.shortText(observer.getElementText(element), 36) : '',
				className: observer.shortText(getElementClassText(element), 60),
				rect: {
					left: Math.round(rect.left),
					top: Math.round(rect.top),
					width: Math.round(rect.width),
					height: Math.round(rect.height),
				},
			}
		}

		function formatClickTargetMessage(clickInfo) {
			const target = clickInfo?.clickTarget
			if (!target) return ''
			const role = target.role ? ` role=${target.role}` : ''
			const text = target.text ? ` "${target.text}"` : ''
			const point = clickInfo?.point ? ` @${clickInfo.point.x},${clickInfo.point.y}` : ''
			return `，点击目标=${target.tag}${role}${text}${point}`
		}

		function getElementClassText(element) {
			const value = element?.className
			if (typeof value === 'string') return value
			if (typeof value?.baseVal === 'string') return value.baseVal
			return ''
		}

		function isVisibleClickTarget(element) {
			const rect = element.getBoundingClientRect()
			const style = window.getComputedStyle(element)
			return rect.width >= 2 && rect.height >= 2 && style.visibility !== 'hidden' && style.display !== 'none'
		}

		function isDisabledElement(element) {
			if (!(element instanceof HTMLElement)) return false
			if (element.hasAttribute('disabled')) return true
			if (String(element.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return true
			if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement || element instanceof HTMLSelectElement) {
				return !!element.disabled
			}
			if (hasDisabledClassSignal(element)) return true
			const disabledParent = element.closest?.('[disabled],[aria-disabled="true"]')
			if (disabledParent instanceof HTMLElement && disabledParent !== document.body) return true
			let cursor = element.parentElement
			while (cursor instanceof HTMLElement && cursor !== document.body) {
				if (hasDisabledClassSignal(cursor)) return true
				cursor = cursor.parentElement
			}
			return false
		}

		function hasDisabledClassSignal(element) {
			if (!(element instanceof HTMLElement) || typeof element.className !== 'string') return false
			return element.className
				.split(/\s+/)
				.map((item) => item.trim())
				.filter(Boolean)
				.some((token) =>
					/^(is-disabled|disabled)$/i.test(token) ||
					/(^|[-_])(disabled)$/i.test(token) ||
					/(--|__|-|_)disabled$/i.test(token)
				)
		}

		function isReadonlyElement(element) {
			if (!(element instanceof HTMLElement)) return false
			if (element.hasAttribute('readonly')) return true
			if (String(element.getAttribute('aria-readonly') || '').toLowerCase() === 'true') return true
			if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
				return !!element.readOnly
			}
			return false
		}

		function isTopLayerClickable(element) {
			if (!(element instanceof HTMLElement)) return false
			const rect = element.getBoundingClientRect()
			const points = [
				{ x: rect.left + rect.width * 0.18, y: rect.top + rect.height * 0.5 },
				{ x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 },
				{ x: rect.left + rect.width * 0.82, y: rect.top + rect.height * 0.5 },
			]
			return points.some((point) => {
				if (point.x < 0 || point.y < 0 || point.x > window.innerWidth || point.y > window.innerHeight) {
					return false
				}
				const hit = document.elementFromPoint(point.x, point.y)
				return hit instanceof HTMLElement && (hit === element || element.contains(hit) || hit.contains(element))
			})
		}

		function getFocusableClickTarget(target, fallback) {
			if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement || target instanceof HTMLSelectElement) {
				return target
			}
			const focusable = target.closest?.('input,button,select,textarea,[tabindex]')
			return focusable instanceof HTMLElement ? focusable : fallback
		}

		async function movePointerRealistic(targetX, targetY) {
			const startX = clampNumber(lastPointer?.x, 1, window.innerWidth - 1, window.innerWidth / 2)
			const startY = clampNumber(lastPointer?.y, 1, window.innerHeight - 1, window.innerHeight / 2)
			const distance = Math.hypot(targetX - startX, targetY - startY)
			const steps = Math.max(3, Math.min(9, Math.round(distance / 110)))

			for (let i = 1; i <= steps; i++) {
				const t = i / steps
				const eased = 1 - Math.pow(1 - t, 2)
				const wobble = (1 - t) * randomBetween(-4.8, 4.8)
				const x = clampNumber(
					startX + (targetX - startX) * eased + wobble,
					1,
					window.innerWidth - 1,
					targetX
				)
				const y = clampNumber(
					startY + (targetY - startY) * eased + wobble * 0.6,
					1,
					window.innerHeight - 1,
					targetY
				)
				await visual?.movePointerTo?.(x, y, { waitMs: randomBetween(6, 14) })
				dispatchPointerMoveAt(x, y)
				keepSustainedHoverAlive(x, y)
			}
			lastPointer = { x: targetX, y: targetY }
		}

		function dispatchPointerMoveAt(x, y) {
			const target = document.elementFromPoint(x, y)
			if (!(target instanceof HTMLElement)) return
			const pointerOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				pointerType: 'mouse',
			}
			const mouseOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				button: 0,
			}
			target.dispatchEvent(new PointerEvent('pointermove', pointerOpts))
			target.dispatchEvent(new MouseEvent('mousemove', mouseOpts))
		}

		function keepSustainedHoverAlive(x, y) {
			if (!(sustainedHoverElement instanceof HTMLElement) || !sustainedHoverElement.isConnected) {
				clearSustainedHover()
				return
			}
			if (!isDomVisibleInActivePopup(sustainedHoverElement) && !isVisibleClickTarget(sustainedHoverElement)) {
				clearSustainedHover()
				return
			}
			const point = sustainedHoverPoint || { x, y }
			dispatchHoverMove(sustainedHoverElement, point.x, point.y)
		}

		function startSustainedHover(element, x, y, durationMs = 12000) {
			if (!(element instanceof HTMLElement)) return
			sustainedHoverElement = element
			sustainedHoverPoint = { x, y }
			sustainedHoverExpiresAt = Date.now() + durationMs
			dispatchHoverSequence(element, x, y)
			if (sustainedHoverTimer) return
			sustainedHoverTimer = window.setInterval(() => {
				if (
					!(sustainedHoverElement instanceof HTMLElement) ||
					!sustainedHoverElement.isConnected ||
					Date.now() > sustainedHoverExpiresAt
				) {
					clearSustainedHover()
					return
				}
				const point = sustainedHoverPoint || getElementCenter(sustainedHoverElement)
				dispatchHoverMove(sustainedHoverElement, point.x, point.y)
			}, 160)
		}

		function clearSustainedHover() {
			if (sustainedHoverTimer) {
				window.clearInterval(sustainedHoverTimer)
				sustainedHoverTimer = 0
			}
			sustainedHoverElement = null
			sustainedHoverPoint = null
			sustainedHoverExpiresAt = 0
		}

		function getElementCenter(element) {
			const rect = element.getBoundingClientRect()
			return {
				x: clampNumber(rect.left + rect.width / 2, 1, window.innerWidth - 1, window.innerWidth / 2),
				y: clampNumber(rect.top + rect.height / 2, 1, window.innerHeight - 1, window.innerHeight / 2),
			}
		}

		function dispatchHoverMove(target, x, y) {
			const pointerOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				pointerType: 'mouse',
			}
			const mouseOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				button: 0,
			}
			target.dispatchEvent(new PointerEvent('pointermove', pointerOpts))
			target.dispatchEvent(new MouseEvent('mousemove', mouseOpts))
		}

		async function blurLastClickedElement(nextElement) {
			if (!lastClickedElement || !(lastClickedElement instanceof HTMLElement)) return
			const prev = lastClickedElement
			lastClickedElement = null
			if (
				sustainedHoverElement instanceof HTMLElement &&
				(prev === sustainedHoverElement ||
					prev.contains(sustainedHoverElement) ||
					sustainedHoverElement.contains(prev) ||
					(nextElement instanceof HTMLElement && sustainedHoverElement.contains(nextElement)))
			) {
				return
			}
			prev.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))
			prev.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }))
			prev.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
			prev.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
			prev.blur()
			await sleep(18)
		}

		return {
			executeAction,
			executeCoordinateAction,
		}
	}

	function setNativeValue(element, value) {
		const proto = Object.getPrototypeOf(element)
		const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
		if (descriptor?.set) {
			descriptor.set.call(element, value)
		} else {
			element.value = value
		}
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	function randomBetween(min, max) {
		const nMin = Number(min)
		const nMax = Number(max)
		if (!Number.isFinite(nMin) || !Number.isFinite(nMax)) return 0
		return nMin + Math.random() * (nMax - nMin)
	}

	g.NC_CONTENT_ACTIONS = { createActions }
})(window)
