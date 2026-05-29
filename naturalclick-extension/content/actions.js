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
			if (!name) return { success: false, message: '动作名为空。' }

			if (name === 'click_element_by_index' || name === 'click') {
				const index = Number(input.index)
				return clickByIndex(index, inputMode)
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

			return { success: false, message: `不支持的动作: ${name}` }
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

			return { success: false, message: `坐标动作不支持: ${name}` }
		}

		async function clickByIndex(index, inputMode) {
			const element = observer.getElementByIndex(index)
			if (!element) {
				return { success: false, message: `索引 ${index} 不存在。` }
			}
			if (observer.isIgnoredElement(element)) {
				return { success: false, message: `索引 ${index} 命中插件忽略区域。` }
			}
			if (isDisabledElement(element)) {
				return { success: false, message: `索引 ${index} 对应元素已禁用。` }
			}
			const before = getElementInteractionState(element)
			await humanLikeClick(element, null, inputMode)
			const after = getElementInteractionState(element)
			return {
				success: true,
				message: appendStateChange(`已点击索引 ${index}。`, before, after),
				meta: { before, after, outcome: inferInteractionOutcome(before, after) },
			}
		}

		async function clickByPoint(x, y, inputMode) {
			const target = observer.findElementAtPoint(x, y)
			if (!target) {
				return { success: false, message: `坐标(${Math.round(x)}, ${Math.round(y)})未命中可用元素。` }
			}
			if (observer.isIgnoredElement(target)) {
				return { success: false, message: '命中了插件面板区域，坐标无效。' }
			}
			if (isDisabledElement(target)) {
				return { success: false, message: '坐标命中元素已禁用。' }
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
			if (!element) return { success: false, message: `索引 ${index} 不存在。` }
			if (isDisabledElement(element)) return { success: false, message: `索引 ${index} 对应元素已禁用。` }
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

		async function humanLikeClick(element, point, inputMode) {
			const clickElement = resolveClickElement(element) || element
			clickElement.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' })
			const rect = clickElement.getBoundingClientRect()
			const preferredPoint = Number.isFinite(point?.x) && Number.isFinite(point?.y)
				? point
				: getPreferredClickPoint(clickElement, rect)
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
				return
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

		function resolveClickElement(element) {
			if (!(element instanceof HTMLElement)) return element
			if (isCascaderParentOption(element)) return element
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

		function getPreferredClickPoint(element, rect) {
			if (isCascaderParentOption(element)) {
				return {
					x: rect.left + rect.width * 0.76,
					y: rect.top + rect.height / 2,
				}
			}
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
			const disabledParent = element.closest?.('[disabled],[aria-disabled="true"]')
			return disabledParent instanceof HTMLElement && disabledParent !== document.body
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
