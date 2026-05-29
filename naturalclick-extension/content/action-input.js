;(function (g) {
	function createInputActions({
		observer,
		humanLikeClick,
		isDisabledElement,
		isReadonlyElement,
		setNativeValue,
		sleep,
		randomBetween,
		createOutcome,
		OUTCOME_KIND,
	}) {
		if (!observer) throw new Error('action-input 缺少 observer。')
		if (typeof humanLikeClick !== 'function') throw new Error('action-input 缺少 humanLikeClick。')
		if (typeof setNativeValue !== 'function') throw new Error('action-input 缺少 setNativeValue。')

		async function inputByIndex(index, text, inputMode) {
			const element = observer.getElementByIndex(index)
			if (!element) {
				return { success: false, message: `索引 ${index} 不存在。` }
			}
			const editable = observer.resolveEditableTarget(element)
			if (!editable) {
				return { success: false, message: `索引 ${index} 对应元素不可输入。` }
			}
			if (isDisabledElement(editable) || isReadonlyElement(editable)) {
				return { success: false, message: `索引 ${index} 对应输入目标不可编辑。` }
			}
			if (inputMode === 'direct') {
				focusDirectInputTarget(editable)
			} else {
				await humanLikeClick(editable, null, inputMode)
			}
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
			if (isDisabledElement(editable) || isReadonlyElement(editable)) {
				return { success: false, message: '坐标命中输入目标不可编辑。' }
			}

			if (inputMode === 'direct') {
				focusDirectInputTarget(editable)
			} else {
				await humanLikeClick(editable, { x, y }, inputMode)
			}
			return inputToEditableTarget(
				editable,
				text,
				inputMode,
				'已通过坐标输入文本。',
				'已在坐标命中的 contenteditable 元素输入文本。'
			)
		}

		function focusDirectInputTarget(element) {
			if (!(element instanceof HTMLElement)) return
			try {
				element.focus({ preventScroll: true })
			} catch (_) {
				try {
					element.focus()
				} catch (_) {}
			}
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
				return {
					success: true,
					message: inputSuccessMessage || '已输入文本。',
					meta: { outcome: createOutcome(OUTCOME_KIND.VALUE_CHANGED) },
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
					meta: { outcome: createOutcome(OUTCOME_KIND.VALUE_CHANGED) },
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

		function typingDelay(ch) {
			const base = randomBetween(14, 42)
			if (/[,.!?;:]/.test(ch)) return base + randomBetween(24, 70)
			if (/\s/.test(ch)) return base + randomBetween(10, 32)
			return base
		}

		return {
			inputByIndex,
			inputByPoint,
			keypressAction,
		}
	}

	g.NC_CONTENT_ACTION_INPUT = { createInputActions }
})(window)
