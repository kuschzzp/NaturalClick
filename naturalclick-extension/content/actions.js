;(function (g) {
	function createActions({ observer, clampNumber, visual }) {
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
				return inputByIndex(index, text, inputMode)
			}

			if (name === 'scroll') {
				const down = input.down !== false
				const index = Number.isFinite(Number(input.index)) ? Number(input.index) : null
				const pixels =
					typeof input.pixels === 'number'
						? input.pixels
						: window.innerHeight * (typeof input.num_pages === 'number' ? input.num_pages : 0.8)
				return scrollAction({ down, pixels, index })
			}

			if (name === 'keypress') {
				const key = String(input.key || 'Enter')
				return keypressAction({
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

			if (name === 'select_dropdown_option') {
				return selectDropdownOptionAction(input, inputMode)
			}

			if (name === 'select_checkbox_option') {
				return selectCheckboxOptionAction(input, inputMode)
			}

			if (name === 'select_cascader_path') {
				return selectCascaderPathAction(input, inputMode)
			}

			if (name === 'scroll_horizontally') {
				const right = input.right !== false
				const index = Number.isFinite(Number(input.index)) ? Number(input.index) : null
				const pixels =
					typeof input.pixels === 'number'
						? input.pixels
						: window.innerWidth * (typeof input.num_pages === 'number' ? input.num_pages : 0.65)
				return scrollHorizontalAction({ right, pixels, index })
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
				return inputByPoint(x, y, String(input.text || ''), inputMode)
			}

			return { success: false, message: `坐标动作不支持: ${name}` }
		}

		async function clickByIndex(index, inputMode) {
			const element = observer.getElementByIndex(index)
			if (!element) {
				return { success: false, message: `索引 ${index} 不存在。` }
			}
			const before = getElementInteractionState(element)
			await humanLikeClick(element, null, inputMode)
			const after = getElementInteractionState(element)
			return {
				success: true,
				message: appendStateChange(`已点击索引 ${index}。`, before, after),
				meta: { before, after },
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
			const before = getElementInteractionState(target)
			await humanLikeClick(target, { x, y }, inputMode)
			const after = getElementInteractionState(target)
			return {
				success: true,
				message: appendStateChange(`已点击坐标(${Math.round(x)}, ${Math.round(y)}).`, before, after),
				meta: { before, after, point: { x, y } },
			}
		}

		async function hoverByIndex(index, inputMode) {
			const element = observer.getElementByIndex(index)
			if (!element) return { success: false, message: `索引 ${index} 不存在。` }
			await hoverElement(element, inputMode)
			return { success: true, message: `已悬浮索引 ${index}。` }
		}

		async function inputByIndex(index, text, inputMode) {
			const element = observer.getElementByIndex(index)
			if (!element) {
				return { success: false, message: `索引 ${index} 不存在。` }
			}
			const editable = observer.resolveEditableTarget(element) || element
			await humanLikeClick(editable, null, inputMode)
			return inputToEditableTarget(editable, text, inputMode, `已在索引 ${index} 输入文本。`)
		}

		async function inputByPoint(x, y, text, inputMode) {
			const target = observer.findElementAtPoint(x, y)
			if (!target) {
				return { success: false, message: `坐标(${Math.round(x)}, ${Math.round(y)})未命中元素。` }
			}
			if (observer.isIgnoredElement(target)) {
				return { success: false, message: '命中了插件面板区域，坐标无效。' }
			}

			const editable = observer.resolveEditableTarget(target)
			if (!editable) {
				return { success: false, message: '坐标命中元素不可输入。' }
			}

			await humanLikeClick(editable, { x, y }, inputMode)
			return inputToEditableTarget(
				editable,
				text,
				inputMode,
				'已通过坐标输入文本。',
				'已在坐标命中的 contenteditable 元素输入文本。'
			)
		}

		function scrollAction({ down, pixels, index }) {
			const delta = Math.abs(Number(pixels || 0)) * (down ? 1 : -1)
			if (index !== null) {
				const target = observer.getElementByIndex(index)
				if (target?.scrollBy) {
					target.scrollBy({ top: delta, behavior: 'smooth' })
					return { success: true, message: `已滚动容器索引 ${index}。` }
				}
			}
			window.scrollBy({ top: delta, behavior: 'smooth' })
			return { success: true, message: `已滚动页面 ${Math.round(delta)}px。` }
		}

		function scrollHorizontalAction({ right, pixels, index }) {
			const delta = Math.abs(Number(pixels || 0)) * (right ? 1 : -1)
			if (index !== null) {
				const target = observer.getElementByIndex(index)
				const scrollable = findHorizontalScrollable(target)
				if (scrollable) {
					scrollable.scrollBy({ left: delta, behavior: 'smooth' })
					return { success: true, message: `已横向滚动容器索引 ${index}：${Math.round(delta)}px。` }
				}
			}
			window.scrollBy({ left: delta, behavior: 'smooth' })
			return { success: true, message: `已横向滚动页面 ${Math.round(delta)}px。` }
		}

		async function selectDropdownOptionAction(input, inputMode) {
			const text = String(input.text || input.label || '').trim()
			if (!text) return { success: false, message: 'select_dropdown_option 缺少 text。' }
			const index = Number(input.index)
			if (Number.isFinite(index)) {
				const field = observer.getElementByIndex(index)
				if (field) {
					await humanLikeClick(field, null, inputMode)
					await sleep(inputMode === 'realistic' ? randomBetween(90, 160) : 90)
				}
			}
			const option = findVisibleOptionByText(text, { selectableOnly: false })
			if (!option) return { success: false, message: `未找到可见下拉选项 "${text}"。` }
			await humanLikeClick(option, null, inputMode)
			return { success: true, message: `已选择下拉选项 "${text}"。` }
		}

		async function selectCheckboxOptionAction(input, inputMode) {
			const text = String(input.text || input.label || '').trim()
			if (!text) return { success: false, message: 'select_checkbox_option 缺少 text。' }
			const index = Number(input.index)
			if (Number.isFinite(index)) {
				const field = observer.getElementByIndex(index)
				if (field) {
					await humanLikeClick(field, null, inputMode)
					await sleep(inputMode === 'realistic' ? randomBetween(90, 160) : 90)
				}
			}
			const option = findVisibleOptionByText(text, { selectableOnly: true }) || findVisibleOptionByText(text)
			if (!option) return { success: false, message: `未找到可见复选项 "${text}"。` }
			const before = getElementInteractionState(option)
			const clickTarget = resolveSelectableClickTarget(option) || option
			await humanLikeClick(clickTarget, null, inputMode)
			const after = getElementInteractionState(option)
			return {
				success: true,
				message: appendStateChange(`已选择复选项 "${text}"。`, before, after),
				meta: { before, after },
			}
		}

		async function selectCascaderPathAction(input, inputMode) {
			const path = Array.isArray(input.path)
				? input.path.map((item) => String(item || '').trim()).filter(Boolean)
				: String(input.path || '')
						.split(/[>\/,，]+/)
						.map((item) => item.trim())
						.filter(Boolean)
			if (!path.length) return { success: false, message: 'select_cascader_path 缺少 path。' }

			const index = Number(input.index)
			if (Number.isFinite(index)) {
				const field = observer.getElementByIndex(index)
				if (field) {
					await humanLikeClick(field, null, inputMode)
					await sleep(inputMode === 'realistic' ? randomBetween(110, 190) : 120)
				}
			}

			for (let i = 0; i < path.length; i++) {
				const label = path[i]
				const option = await findCascaderOptionByScrolling(label, i, inputMode)
				if (!option) {
					return {
						success: false,
						message: `级联选择失败：未找到第 ${i + 1} 级选项 "${label}"。${summarizeCascaderLevel(i)}`,
					}
				}
				await bringCascaderOptionIntoView(option, inputMode)
				if (i < path.length - 1) {
					await hoverElement(option, inputMode)
					const nextLevelReady = await waitForCascaderMenuLevel(i + 1, inputMode)
					if (!nextLevelReady) {
						return {
							success: false,
							message: `级联选择失败：已悬浮第 ${i + 1} 级 "${label}"，但第 ${i + 2} 级菜单未展开，停止继续滚动上一级菜单。${summarizeCascaderLevel(i)}`,
						}
					}
				} else {
					await humanLikeClick(option, null, inputMode)
				}
			}
			return { success: true, message: `已按路径选择级联选项：${path.join(' > ')}。` }
		}

		async function keypressAction(opts) {
			const target =
				document.activeElement instanceof HTMLElement ? document.activeElement : document.body
			const normalizedKey = String(opts.key || '').toLowerCase()
			const withCommand = !!opts.ctrlKey || !!opts.metaKey

			if (withCommand && normalizedKey === 'a') {
				const selected = selectAllText(target)
				if (selected) {
					return { success: true, message: '已执行全选。' }
				}
			}

			if (withCommand && (normalizedKey === 'c' || normalizedKey === 'x')) {
				const copied = await copySelectionToClipboard(target, normalizedKey === 'x')
				if (copied.ok) {
					return { success: true, message: normalizedKey === 'x' ? '已剪切选中文本。' : '已复制选中文本。' }
				}
				return { success: false, message: copied.error || '复制失败。' }
			}

			if (withCommand && normalizedKey === 'v') {
				const pasted = await pasteClipboardText(target)
				if (pasted.ok) {
					return { success: true, message: '已粘贴剪贴板内容。' }
				}
				return { success: false, message: pasted.error || '粘贴失败。' }
			}

			const eventInit = {
				key: opts.key,
				code: opts.key,
				ctrlKey: !!opts.ctrlKey,
				altKey: !!opts.altKey,
				shiftKey: !!opts.shiftKey,
				metaKey: !!opts.metaKey,
				bubbles: true,
				cancelable: true,
			}
			target.dispatchEvent(new KeyboardEvent('keydown', eventInit))
			target.dispatchEvent(new KeyboardEvent('keyup', eventInit))
			return { success: true, message: `已发送按键 ${opts.key}。` }
		}

		function selectAllText(target) {
			if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
				try {
					target.focus({ preventScroll: true })
					target.setSelectionRange(0, String(target.value || '').length)
					return true
				} catch (_) {
					return false
				}
			}

			if (target instanceof HTMLElement && target.isContentEditable) {
				const selection = window.getSelection()
				if (!selection) return false
				const range = document.createRange()
				range.selectNodeContents(target)
				selection.removeAllRanges()
				selection.addRange(range)
				return true
			}
			return false
		}

		async function copySelectionToClipboard(target, cut) {
			const selectedText = getSelectedText(target)
			if (!selectedText) {
				return { ok: false, error: '没有可复制的选中文本。' }
			}
			try {
				await navigator.clipboard.writeText(selectedText)
			} catch (_) {
				return { ok: false, error: '剪贴板写入失败（浏览器限制）。' }
			}

			if (cut) {
				deleteSelectedText(target)
			}
			return { ok: true }
		}

		async function pasteClipboardText(target) {
			let text = ''
			try {
				text = await navigator.clipboard.readText()
			} catch (_) {
				return { ok: false, error: '剪贴板读取失败（浏览器限制）。' }
			}
			if (!text) return { ok: false, error: '剪贴板为空。' }

			const inserted = insertTextAtSelection(target, text)
			if (!inserted) {
				return { ok: false, error: '当前焦点不支持粘贴。' }
			}
			return { ok: true }
		}

		function getSelectedText(target) {
			if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
				const start = Number.isFinite(target.selectionStart) ? target.selectionStart : 0
				const end = Number.isFinite(target.selectionEnd) ? target.selectionEnd : 0
				if (end <= start) return ''
				return String(target.value || '').slice(start, end)
			}
			const selection = window.getSelection()
			if (!selection || selection.rangeCount === 0) return ''
			return String(selection.toString() || '')
		}

		function deleteSelectedText(target) {
			if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
				const value = String(target.value || '')
				const start = Number.isFinite(target.selectionStart) ? target.selectionStart : value.length
				const end = Number.isFinite(target.selectionEnd) ? target.selectionEnd : value.length
				const next = `${value.slice(0, start)}${value.slice(end)}`
				setNativeValue(target, next)
				target.setSelectionRange(start, start)
				target.dispatchEvent(new Event('input', { bubbles: true }))
				target.dispatchEvent(new Event('change', { bubbles: true }))
				return
			}
			if (target instanceof HTMLElement && target.isContentEditable) {
				const selection = window.getSelection()
				if (!selection || selection.rangeCount === 0) return
				const range = selection.getRangeAt(0)
				range.deleteContents()
				target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteByCut' }))
				target.dispatchEvent(new Event('change', { bubbles: true }))
			}
		}

		function insertTextAtSelection(target, text) {
			if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
				const value = String(target.value || '')
				const start = Number.isFinite(target.selectionStart) ? target.selectionStart : value.length
				const end = Number.isFinite(target.selectionEnd) ? target.selectionEnd : value.length
				const next = `${value.slice(0, start)}${text}${value.slice(end)}`
				setNativeValue(target, next)
				const caret = start + text.length
				target.setSelectionRange(caret, caret)
				target.dispatchEvent(new Event('input', { bubbles: true }))
				target.dispatchEvent(new Event('change', { bubbles: true }))
				return true
			}

			if (target instanceof HTMLElement && target.isContentEditable) {
				const selection = window.getSelection()
				if (!selection || selection.rangeCount === 0) return false
				const range = selection.getRangeAt(0)
				range.deleteContents()
				range.insertNode(document.createTextNode(text))
				range.collapse(false)
				selection.removeAllRanges()
				selection.addRange(range)
				target.dispatchEvent(
					new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text })
				)
				target.dispatchEvent(new Event('change', { bubbles: true }))
				return true
			}
			return false
		}

		function getInputMode(action) {
			return action?.meta?.inputMode === 'standard' ? 'standard' : 'realistic'
		}

		async function inputToEditableTarget(
			element,
			text,
			inputMode,
			inputSuccessMessage,
			contentEditableSuccessMessage
		) {
			if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
				if (inputMode === 'realistic') {
					await typeTextRealisticInFormControl(element, text)
				} else {
					setNativeValue(element, text)
					element.dispatchEvent(new Event('input', { bubbles: true }))
					element.dispatchEvent(new Event('change', { bubbles: true }))
				}
				return { success: true, message: inputSuccessMessage || '已输入文本。' }
			}

			if (element instanceof HTMLSelectElement) {
				const matched = selectOptionByText(element, text)
				if (!matched) {
					return { success: false, message: `选择失败：select 中没有匹配选项 "${text}"。` }
				}
				element.dispatchEvent(new Event('input', { bubbles: true }))
				element.dispatchEvent(new Event('change', { bubbles: true }))
				return {
					success: true,
					message: `${inputSuccessMessage || '已选择下拉选项。'} 匹配选项: ${matched.label}`,
				}
			}

			if (element.isContentEditable) {
				if (inputMode === 'realistic') {
					await typeTextRealisticInContentEditable(element, text)
				} else {
					element.innerText = text
					element.dispatchEvent(
						new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })
					)
					element.dispatchEvent(new Event('change', { bubbles: true }))
				}
				return {
					success: true,
					message: contentEditableSuccessMessage || '已在 contenteditable 元素输入文本。',
				}
			}

			return { success: false, message: '输入失败：目标元素类型不支持。' }
		}

		async function typeTextRealisticInFormControl(element, text) {
			element.focus({ preventScroll: true })
			setNativeValue(element, '')
			try {
				element.setSelectionRange(0, 0)
			} catch (_) {}
			element.dispatchEvent(new Event('input', { bubbles: true }))

			for (const ch of String(text || '')) {
				dispatchKeyboardEvent(element, 'keydown', ch)
				insertCharInFormControl(element, ch)
				dispatchKeyboardEvent(element, 'keyup', ch)
				await sleep(typingDelay(ch))
			}
			element.dispatchEvent(new Event('change', { bubbles: true }))
		}

		async function typeTextRealisticInContentEditable(element, text) {
			element.focus({ preventScroll: true })
			element.innerText = ''
			element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContent' }))

			const selection = window.getSelection()
			if (!selection) return
			const range = document.createRange()
			range.selectNodeContents(element)
			range.collapse(false)
			selection.removeAllRanges()
			selection.addRange(range)

			for (const ch of String(text || '')) {
				dispatchKeyboardEvent(element, 'keydown', ch)
				const activeSelection = window.getSelection()
				if (activeSelection && activeSelection.rangeCount > 0) {
					const activeRange = activeSelection.getRangeAt(0)
					activeRange.deleteContents()
					activeRange.insertNode(document.createTextNode(ch))
					activeRange.collapse(false)
					activeSelection.removeAllRanges()
					activeSelection.addRange(activeRange)
				}
				element.dispatchEvent(
					new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' })
				)
				dispatchKeyboardEvent(element, 'keyup', ch)
				await sleep(typingDelay(ch))
			}

			element.dispatchEvent(new Event('change', { bubbles: true }))
		}

		function dispatchKeyboardEvent(target, type, key) {
			target.dispatchEvent(
				new KeyboardEvent(type, {
					key,
					code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
					bubbles: true,
					cancelable: true,
				})
			)
		}

		function insertCharInFormControl(element, ch) {
			const value = String(element.value || '')
			const start = Number.isFinite(element.selectionStart) ? element.selectionStart : value.length
			const end = Number.isFinite(element.selectionEnd) ? element.selectionEnd : value.length
			const next = `${value.slice(0, start)}${ch}${value.slice(end)}`
			setNativeValue(element, next)
			const caret = start + ch.length
			try {
				element.setSelectionRange(caret, caret)
			} catch (_) {}
			element.dispatchEvent(
				new InputEvent('input', {
					bubbles: true,
					data: ch,
					inputType: 'insertText',
				})
			)
		}

		function selectOptionByText(select, text) {
			const expected = normalizeComparableText(text)
			const options = Array.from(select.options || [])
			const matched =
				options.find((option) => normalizeComparableText(option.value) === expected) ||
				options.find((option) => normalizeComparableText(option.label) === expected) ||
				options.find((option) => normalizeComparableText(option.textContent) === expected) ||
				options.find((option) => normalizeComparableText(option.textContent).includes(expected))
			if (!matched) return null
			setNativeValue(select, matched.value)
			matched.selected = true
			return {
				value: matched.value,
				label: String(matched.label || matched.textContent || matched.value || '').trim(),
			}
		}

		function normalizeComparableText(value) {
			return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
		}

		function getElementInteractionState(element) {
			if (!(element instanceof HTMLElement)) return null
			const role = String(element.getAttribute('role') || '').trim()
			const text = observer.shortText(observer.getElementText(element), 40)
			const state = {
				tag: element.tagName.toLowerCase(),
				role,
				text,
				value: '',
				checked: null,
				selected: null,
				childChecked: null,
				childSelected: null,
				expanded: null,
				activeElement: observer.getActiveElementSummary(),
			}
			if (element instanceof HTMLInputElement) {
				const type = String(element.type || '').toLowerCase()
				state.type = type
				if (type === 'checkbox' || type === 'radio') state.checked = !!element.checked
				else state.value = observer.shortText(element.value || '', 40)
			} else if (element instanceof HTMLTextAreaElement) {
				state.value = observer.shortText(element.value || '', 40)
			} else if (element instanceof HTMLSelectElement) {
				const selected = element.selectedOptions?.[0]
				state.value = observer.shortText(selected?.textContent || element.value || '', 40)
			}
			const ariaChecked = element.getAttribute('aria-checked')
			if (ariaChecked !== null) state.checked = ariaChecked === 'true'
			const ariaSelected = element.getAttribute('aria-selected')
			if (ariaSelected !== null) state.selected = ariaSelected === 'true'
			const ariaExpanded = element.getAttribute('aria-expanded')
			if (ariaExpanded !== null) state.expanded = ariaExpanded === 'true'
			const nestedSelectable = findNestedSelectableControl(element)
			if (nestedSelectable && nestedSelectable !== element) {
				const nestedAriaChecked = nestedSelectable.getAttribute('aria-checked')
				const nestedAriaSelected = nestedSelectable.getAttribute('aria-selected')
				if (nestedSelectable instanceof HTMLInputElement) {
					const nestedType = String(nestedSelectable.type || '').toLowerCase()
					if (nestedType === 'checkbox' || nestedType === 'radio') {
						state.childChecked = !!nestedSelectable.checked
					}
				}
				if (nestedAriaChecked !== null) state.childChecked = nestedAriaChecked === 'true'
				if (nestedAriaSelected !== null) state.childSelected = nestedAriaSelected === 'true'
				const nestedClass = String(nestedSelectable.className || '')
				if (state.childChecked === null && /(is-checked|checked)/i.test(nestedClass)) {
					state.childChecked = true
				}
				if (state.childSelected === null && /(is-selected|selected)/i.test(nestedClass)) {
					state.childSelected = true
				}
			}
			return state
		}

		function appendStateChange(message, before, after) {
			const changes = describeStateChanges(before, after)
			return changes ? `${message} 状态变化: ${changes}` : message
		}

		function describeStateChanges(before, after) {
			if (!before || !after) return ''
			const parts = []
			for (const key of ['value', 'checked', 'selected', 'childChecked', 'childSelected', 'expanded', 'activeElement']) {
				if (before[key] !== after[key]) {
					parts.push(`${key}:${formatStateValue(before[key])}->${formatStateValue(after[key])}`)
				}
			}
			return parts.join(', ')
		}

		function formatStateValue(value) {
			if (value === null || value === undefined || value === '') return '-'
			return String(value)
		}

		function typingDelay(ch) {
			const base = randomBetween(14, 42)
			if (/[,.!?;:]/.test(ch)) return base + randomBetween(24, 70)
			if (/\s/.test(ch)) return base + randomBetween(10, 32)
			return base
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

		function resolveClickElement(element) {
			if (!(element instanceof HTMLElement)) return element
			if (isCascaderParentOption(element)) return element
			const selectable = resolveSelectableClickTarget(element)
			if (selectable) return selectable
			const labelTarget = resolveLabelTarget(element)
			if (labelTarget) return labelTarget
			return element
		}

		function resolveSelectableClickTarget(element) {
			if (!(element instanceof HTMLElement)) return null
			if (isCascaderParentOption(element)) return null
			const nested = findNestedSelectableControl(element)
			if (nested) return nested
			const sibling = findSiblingSelectableControl(element)
			if (sibling) return sibling
			const row = findOptionRow(element)
			if (row && row !== element) {
				const rowControl = findNestedSelectableControl(row)
				if (rowControl) return rowControl
			}
			return null
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

		function findNestedSelectableControl(element) {
			if (!(element instanceof HTMLElement)) return null
			if (isCascaderParentOption(element)) return null
			const selectors = [
				'input[type="checkbox"]:not([disabled])',
				'input[type="radio"]:not([disabled])',
				'[role="checkbox"]',
				'[role="radio"]',
				'.el-checkbox__input',
				'.el-checkbox__inner',
				'.el-radio__input',
				'.el-radio__inner',
				'.ant-checkbox',
				'.ant-checkbox-inner',
				'.ant-radio',
				'.ant-radio-inner',
				'.n-checkbox',
				'.n-checkbox-box',
				'.arco-checkbox',
				'.arco-checkbox-mask',
				'.van-checkbox__icon',
			]
			if (element.matches?.(selectors.join(',')) && isVisibleClickTarget(element)) return element
			const nested = Array.from(element.querySelectorAll(selectors.join(',')))
				.find((node) => node instanceof HTMLElement && isVisibleClickTarget(node))
			return nested instanceof HTMLElement ? nested : null
		}

		function findSiblingSelectableControl(element) {
			if (!(element instanceof HTMLElement)) return null
			const row = findOptionRow(element) || element.parentElement
			if (!(row instanceof HTMLElement)) return null
			const selectors = [
				'input[type="checkbox"]:not([disabled])',
				'input[type="radio"]:not([disabled])',
				'[role="checkbox"]',
				'[role="radio"]',
				'.el-checkbox__input',
				'.el-checkbox__inner',
				'.el-radio__input',
				'.el-radio__inner',
				'.ant-checkbox',
				'.ant-checkbox-inner',
				'.ant-radio',
				'.ant-radio-inner',
				'.n-checkbox',
				'.n-checkbox-box',
				'.arco-checkbox',
				'.arco-checkbox-mask',
				'.van-checkbox__icon',
			].join(',')
			const controls = Array.from(row.querySelectorAll(selectors)).filter(
				(node) => node instanceof HTMLElement && isVisibleClickTarget(node)
			)
			if (!controls.length) return null
			const rowRect = row.getBoundingClientRect()
			return controls
				.sort((a, b) => {
					const ar = a.getBoundingClientRect()
					const br = b.getBoundingClientRect()
					const aInside = ar.left >= rowRect.left - 2 && ar.right <= rowRect.right + 2 ? 0 : 1
					const bInside = br.left >= rowRect.left - 2 && br.right <= rowRect.right + 2 ? 0 : 1
					return aInside - bInside || ar.left - br.left || ar.top - br.top
				})[0]
		}

		function findOptionRow(element) {
			if (!(element instanceof HTMLElement)) return null
			const row = element.closest?.(
				'[role="option"],[role="menuitem"],[role="treeitem"],.el-select-dropdown__item,.el-cascader-node,.el-checkbox,.el-radio,.el-tree-node__content,.ant-select-item-option,.ant-cascader-menu-item,.ant-checkbox-wrapper,.ant-radio-wrapper,.arco-select-option,.n-base-select-option,li'
			)
			return row instanceof HTMLElement ? row : null
		}

		function findVisibleOptionByText(text, options = {}) {
			const expected = normalizeComparableText(text)
			if (!expected) return null
			const selector = [
				'[role="option"]',
				'[role="menuitem"]',
				'[role="checkbox"]',
				'[role="radio"]',
				'[aria-selected]',
				'[aria-checked]',
				'.el-select-dropdown__item',
				'.el-cascader-node',
				'.el-checkbox',
				'.el-radio',
				'.el-tree-node__content',
				'.ant-select-item-option',
				'.ant-cascader-menu-item',
				'.ant-checkbox-wrapper',
				'.ant-radio-wrapper',
				'.arco-select-option',
				'.arco-cascader-option',
				'.arco-checkbox',
				'.n-base-select-option',
				'.n-cascader-option',
				'.n-checkbox',
				'[class*="select-option"]',
				'[class*="dropdown-item"]',
				'[class*="cascader"]',
				'li',
			].join(',')
			const candidates = Array.from(document.querySelectorAll(selector))
				.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node) && isTopLayerClickable(node))
				.filter((node) => {
					const cls = String(node.className || '')
					if (options.cascaderOnly && !/(cascader)/i.test(cls)) return false
					if (options.selectableOnly && !resolveSelectableClickTarget(node) && !/checkbox|radio/i.test(cls)) {
						return false
					}
					const label = normalizeComparableText(getVisibleOptionLabel(node))
					return label === expected || label.includes(expected)
				})
			return candidates.sort(compareOptionCandidate(text))[0] || null
		}

		function compareOptionCandidate(text) {
			const expected = normalizeComparableText(text)
			return (a, b) => {
				const aLabel = normalizeComparableText(getVisibleOptionLabel(a))
				const bLabel = normalizeComparableText(getVisibleOptionLabel(b))
				const aExact = aLabel === expected ? 0 : 1
				const bExact = bLabel === expected ? 0 : 1
				if (aExact !== bExact) return aExact - bExact
				const aHasControl = resolveSelectableClickTarget(a) ? 0 : 1
				const bHasControl = resolveSelectableClickTarget(b) ? 0 : 1
				if (aHasControl !== bHasControl) return aHasControl - bHasControl
				const ar = a.getBoundingClientRect()
				const br = b.getBoundingClientRect()
				return ar.left - br.left || ar.top - br.top
			}
		}

		function getVisibleOptionLabel(element) {
			if (!(element instanceof HTMLElement)) return ''
			const preferred = element.querySelector?.(
				'.el-cascader-node__label,.el-select-dropdown__item span,.ant-select-item-option-content,.arco-select-option-content'
			)
			if (preferred instanceof HTMLElement) return observer.getElementText(preferred)
			return observer.getElementText(element)
		}

		async function waitForVisibleOption(text, options = {}) {
			const timeoutMs = Math.max(100, Number(options.timeoutMs || 800))
			const deadline = Date.now() + timeoutMs
			let found = null
			while (Date.now() <= deadline) {
				found = findVisibleOptionByText(text, options)
				if (found) return found
				await sleep(120)
			}
			return found
		}

		async function findCascaderOptionByScrolling(text, levelIndex, inputMode) {
			const expected = normalizeComparableText(text)
			if (!expected) return null
			const menu = await waitForCascaderMenuLevel(levelIndex, inputMode)
			if (!menu) return null
			const domMatch = findCascaderOptionInLevelDom(text, levelIndex)
			if (domMatch) {
				await bringCascaderOptionIntoView(domMatch, inputMode)
				return findCascaderOptionInLevel(text, levelIndex) || domMatch
			}
			const deadline = Date.now() + 4200
			let lastSignature = ''
			let stagnantCount = 0
			let resetDone = false

			while (Date.now() <= deadline) {
				const immediate = findCascaderOptionInLevel(text, levelIndex)
				if (immediate) return immediate

				const currentMenu = getVisibleCascaderMenu(levelIndex)
				if (!currentMenu) {
					await waitForCascaderMenuLevel(levelIndex, inputMode)
					continue
				}
				const scrollable = findVerticalScrollable(currentMenu, false)
				if (!scrollable) {
					await sleep(120)
					continue
				}
				if (!resetDone) {
					scrollable.scrollTop = 0
					scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
					resetDone = true
					await sleep(inputMode === 'realistic' ? randomBetween(120, 200) : 100)
					const afterReset = findCascaderOptionInLevel(text, levelIndex)
					if (afterReset) return afterReset
					const afterResetDomMatch = findCascaderOptionInLevelDom(text, levelIndex)
					if (afterResetDomMatch) {
						await bringCascaderOptionIntoView(afterResetDomMatch, inputMode)
						return findCascaderOptionInLevel(text, levelIndex) || afterResetDomMatch
					}
				}

				const beforeTop = Number(scrollable.scrollTop || 0)
				const signature = getVisibleMenuSignature(scrollable)
				if (signature === lastSignature) stagnantCount += 1
				else stagnantCount = 0
				lastSignature = signature

				const step = Math.max(120, Math.min(320, scrollable.clientHeight * 0.82 || 220))
				scrollable.scrollTop = beforeTop + step
				scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
				await sleep(inputMode === 'realistic' ? randomBetween(180, 280) : 160)

				const afterScrollDomMatch = findCascaderOptionInLevelDom(text, levelIndex)
				if (afterScrollDomMatch) {
					await bringCascaderOptionIntoView(afterScrollDomMatch, inputMode)
					return findCascaderOptionInLevel(text, levelIndex) || afterScrollDomMatch
				}

				const afterTop = Number(scrollable.scrollTop || 0)
				const reachedBottom = afterTop <= beforeTop + 2 || afterTop + scrollable.clientHeight >= scrollable.scrollHeight - 3
				if (reachedBottom && stagnantCount >= 1) break
			}

			const finalDomMatch = findCascaderOptionInLevelDom(text, levelIndex)
			if (finalDomMatch) {
				await bringCascaderOptionIntoView(finalDomMatch, inputMode)
				return findCascaderOptionInLevel(text, levelIndex) || finalDomMatch
			}
			return findCascaderOptionInLevel(text, levelIndex)
		}

		async function waitForCascaderMenuLevel(levelIndex, inputMode) {
			const index = Math.max(0, Number(levelIndex) || 0)
			const timeoutMs = index === 0 ? 900 : 1800
			const deadline = Date.now() + timeoutMs
			while (Date.now() <= deadline) {
				const menu = getVisibleCascaderMenu(index)
				if (menu) return menu
				if (sustainedHoverElement instanceof HTMLElement && sustainedHoverPoint) {
					dispatchHoverSequence(sustainedHoverElement, sustainedHoverPoint.x, sustainedHoverPoint.y)
					dispatchHoverMove(sustainedHoverElement, sustainedHoverPoint.x, sustainedHoverPoint.y)
				}
				await sleep(inputMode === 'realistic' ? 90 : 70)
			}
			return getVisibleCascaderMenu(index)
		}

		function findCascaderOptionInLevel(text, levelIndex) {
			const expected = normalizeComparableText(text)
			const menu = getVisibleCascaderMenu(levelIndex)
			if (!menu && Number(levelIndex) > 0) return null
			const scopes = menu ? [menu] : [document]
			const selectors = [
				'.el-cascader-node',
				'.ant-cascader-menu-item',
				'.arco-cascader-option',
				'.n-cascader-option',
				'[class*="cascader"][role="option"]',
				'[class*="cascader"] [role="option"]',
				'[role="menuitem"]',
				'li',
			].join(',')
			for (const scope of scopes) {
				const candidates = Array.from(scope.querySelectorAll(selectors))
					.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node))
					.filter((node) => {
						const cls = String(node.className || '')
						const path = getElementClassPath(node)
						return /cascader|menu|dropdown|popper|select/i.test(`${cls} ${path}`)
					})
					.filter((node) => {
						const label = normalizeComparableText(getVisibleOptionLabel(node))
						return label === expected || label.includes(expected)
					})
				const found = candidates.sort(compareOptionCandidate(text))[0]
				if (found) return found
			}
			return null
		}

		function findCascaderOptionInLevelDom(text, levelIndex) {
			const expected = normalizeComparableText(text)
			if (!expected) return null
			const menu = getVisibleCascaderMenu(levelIndex)
			if (!menu && Number(levelIndex) > 0) return null
			const scopes = menu ? [menu] : getVisibleCascaderMenus()
			const searchScopes = scopes.length ? scopes : [document]
			const selectors = [
				'.el-cascader-node',
				'.ant-cascader-menu-item',
				'.arco-cascader-option',
				'.n-cascader-option',
				'[class*="cascader"][role="option"]',
				'[class*="cascader"] [role="option"]',
				'[role="menuitem"]',
				'li',
			].join(',')
			for (const scope of searchScopes) {
				if (!(scope instanceof HTMLElement) && scope !== document) continue
				const candidates = Array.from(scope.querySelectorAll(selectors))
					.filter((node) => node instanceof HTMLElement && isDomVisibleInActivePopup(node))
					.filter((node) => {
						const cls = String(node.className || '')
						const path = getElementClassPath(node)
						return /cascader|menu|dropdown|popper|select/i.test(`${cls} ${path}`)
					})
					.filter((node) => {
						const label = normalizeComparableText(getVisibleOptionLabel(node))
						return label === expected || label.includes(expected)
					})
				const found = candidates.sort(compareOptionCandidate(text))[0]
				if (found) return found
			}
			return null
		}

		async function bringCascaderOptionIntoView(option, inputMode) {
			if (!(option instanceof HTMLElement)) return
			const menu = option.closest?.(
				'.el-cascader-menu,.ant-cascader-menu,.arco-cascader-panel-column,.n-cascader-menu,[class*="cascader-menu"],[class*="cascader-panel"]'
			)
			const scrollable = findVerticalScrollable(menu, false) || findVerticalScrollable(option.parentElement, false)
			if (scrollable) {
				const before = Number(scrollable.scrollTop || 0)
				const scrollRect = scrollable.getBoundingClientRect()
				const optionRect = option.getBoundingClientRect()
				const offset = optionRect.top - scrollRect.top - scrollable.clientHeight / 2 + optionRect.height / 2
				scrollable.scrollTop = before + offset
				scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
			}
			try {
				option.scrollIntoView({ block: 'center', inline: 'nearest' })
			} catch (_) {
				option.scrollIntoView()
			}
			await sleep(inputMode === 'realistic' ? randomBetween(120, 220) : 100)
		}

		function isDomVisibleInActivePopup(element) {
			if (!(element instanceof HTMLElement)) return false
			const style = window.getComputedStyle(element)
			if (style.display === 'none' || style.visibility === 'hidden') return false
			const popup = element.closest?.(
				'.el-cascader__dropdown,.el-popper,.ant-cascader-dropdown,.arco-trigger-popup,.n-cascader-menu-wrapper,[class*="cascader"][class*="dropdown"],[class*="popper"]'
			)
			if (popup instanceof HTMLElement) {
				const popupStyle = window.getComputedStyle(popup)
				return popupStyle.display !== 'none' && popupStyle.visibility !== 'hidden'
			}
			const menu = element.closest?.(
				'.el-cascader-menu,.ant-cascader-menu,.arco-cascader-panel-column,.n-cascader-menu,[class*="cascader-menu"],[class*="cascader-panel"]'
			)
			if (menu instanceof HTMLElement) {
				const menuStyle = window.getComputedStyle(menu)
				return menuStyle.display !== 'none' && menuStyle.visibility !== 'hidden'
			}
			return isVisibleClickTarget(element)
		}

		function getVisibleCascaderMenu(levelIndex) {
			const menus = getVisibleCascaderMenus()
			if (!menus.length) return null
			const index = Math.max(0, Number(levelIndex) || 0)
			return menus[index] || null
		}

		function summarizeCascaderLevel(levelIndex) {
			const menu = getVisibleCascaderMenu(levelIndex)
			if (!menu) return ` 当前可见级联菜单列数: ${getVisibleCascaderMenus().length}。`
			const labels = getVisibleCascaderLabels(menu).slice(0, 12)
			return labels.length ? ` 当前第 ${Number(levelIndex) + 1} 级可见项: ${labels.join('、')}。` : ''
		}

		function getVisibleCascaderLabels(menu) {
			if (!(menu instanceof HTMLElement)) return []
			const selector = [
				'.el-cascader-node',
				'.ant-cascader-menu-item',
				'.arco-cascader-option',
				'.n-cascader-option',
				'[class*="cascader"][role="option"]',
				'[class*="cascader"] [role="option"]',
				'[role="menuitem"]',
				'li',
			].join(',')
			const seen = new Set()
			const labels = []
			for (const node of Array.from(menu.querySelectorAll(selector))) {
				if (!(node instanceof HTMLElement) || !isVisibleClickTarget(node)) continue
				const label = String(getVisibleOptionLabel(node) || '').trim()
				const normalized = normalizeComparableText(label)
				if (!normalized || seen.has(normalized)) continue
				seen.add(normalized)
				labels.push(label)
			}
			return labels
		}

		function getVisibleCascaderMenus() {
			const selectors = [
				'.el-cascader-menu',
				'.ant-cascader-menu',
				'.arco-cascader-panel-column',
				'.n-cascader-menu',
				'[class*="cascader-menu"]',
				'[class*="cascader-panel"] ul',
			].join(',')
			return Array.from(document.querySelectorAll(selectors))
				.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node))
				.filter((node) => {
					const text = normalizeComparableText(node.innerText || node.textContent || '')
					return text.length > 0 && text.length < 3000
				})
				.sort((a, b) => {
					const ar = a.getBoundingClientRect()
					const br = b.getBoundingClientRect()
					return ar.left - br.left || ar.top - br.top
				})
		}

		function findVerticalScrollable(element, allowGlobal = true) {
			let cursor = element instanceof HTMLElement ? element : null
			const descendants = cursor ? Array.from(cursor.querySelectorAll('*')) : []
			const candidates = [cursor, ...descendants].filter((node) => node instanceof HTMLElement)
			for (const node of candidates) {
				if (node.scrollHeight > node.clientHeight + 8 && isVisibleClickTarget(node)) return node
			}
			if (!allowGlobal) return null
			const globalCandidates = Array.from(
				document.querySelectorAll(
					'.el-scrollbar__wrap,.el-cascader-menu__wrap,.ant-cascader-menu,.arco-scrollbar,.n-scrollbar-container,[class*="scrollbar"],[class*="cascader"]'
				)
			)
			return (
				globalCandidates.find(
					(node) =>
						node instanceof HTMLElement &&
						node.scrollHeight > node.clientHeight + 8 &&
						isVisibleClickTarget(node)
				) || null
			)
		}

		function getVisibleMenuSignature(element) {
			if (!(element instanceof HTMLElement)) return ''
			return Array.from(element.querySelectorAll('.el-cascader-node,.ant-cascader-menu-item,.arco-cascader-option,.n-cascader-option,li'))
				.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node))
				.slice(0, 8)
				.map((node) => normalizeComparableText(node.innerText || node.textContent || ''))
				.join('|')
		}

		function getElementClassPath(element) {
			const parts = []
			let cursor = element
			while (cursor instanceof HTMLElement && cursor !== document.body && parts.length < 5) {
				parts.push(String(cursor.className || ''))
				cursor = cursor.parentElement
			}
			return parts.join(' ')
		}

		function findHorizontalScrollable(element) {
			let cursor = element instanceof HTMLElement ? element : null
			while (cursor && cursor !== document.body) {
				if (cursor.scrollWidth > cursor.clientWidth + 4) return cursor
				cursor = cursor.parentElement
			}
			const all = Array.from(document.querySelectorAll('div,section,main,table'))
			return all.find(
				(node) =>
					node instanceof HTMLElement &&
					node.scrollWidth > node.clientWidth + 12 &&
					isVisibleClickTarget(node)
			)
		}

		function isVisibleClickTarget(element) {
			const rect = element.getBoundingClientRect()
			const style = window.getComputedStyle(element)
			return rect.width >= 2 && rect.height >= 2 && style.visibility !== 'hidden' && style.display !== 'none'
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

		function isCascaderParentOption(element) {
			if (!(element instanceof HTMLElement)) return false
			const node = element.closest?.('.el-cascader-node,[class*="cascader-node"]')
			const target = node instanceof HTMLElement ? node : element
			const cls = String(target.className || '')
			if (!/(el-cascader-node|cascader)/i.test(cls)) return false
			if (/(is-expandable|has-children)/i.test(cls)) return true
			if (target.querySelector('.el-cascader-node__postfix,.el-icon-arrow-right,[class*="arrow-right"]')) return true
			const ariaHasPopup = String(target.getAttribute('aria-haspopup') || '').toLowerCase()
			if (ariaHasPopup && ariaHasPopup !== 'false') return true
			const text = String(target.innerText || target.textContent || '').trim()
			return /[›>〉]$/.test(text)
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
