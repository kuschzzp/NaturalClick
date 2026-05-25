;(function (g) {
	function createVerification({ observer, clampNumber }) {
		function hitTestAtPoint(xRaw, yRaw) {
			const x = clampNumber(Number(xRaw), 0, window.innerWidth, window.innerWidth / 2)
			const y = clampNumber(Number(yRaw), 0, window.innerHeight, window.innerHeight / 2)
			const target = observer.findElementAtPoint(x, y)
			if (!target) {
				return {
					success: false,
					message: '未命中元素',
					hit: {
						ignored: false,
						clickable: false,
						editable: false,
						tag: '',
						text: '',
						value: '',
					},
				}
			}
			const editable = !!observer.resolveEditableTarget(target)
			const clickable = isProbablyClickable(target)
			const ignored = observer.isIgnoredElement(target)
			const value =
				target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : ''
			return {
				success: true,
				message: 'ok',
				hit: {
					ignored,
					clickable,
					editable,
					tag: target.tagName.toLowerCase(),
					text: observer.shortText(observer.getElementText(target), 80),
					value: observer.shortText(value, 120),
				},
			}
		}

		function verifyInputByIndex(indexRaw, expectedTextRaw) {
			const index = Number(indexRaw)
			const expectedText = String(expectedTextRaw || '')
			if (!Number.isFinite(index)) {
				return { success: false, matched: false, message: 'index 参数无效' }
			}
			const element = observer.getElementByIndex(index)
			if (!element || !(element instanceof HTMLElement)) {
				return { success: false, matched: false, message: '索引对应元素不存在' }
			}
			const value = readElementValue(element)
			return {
				success: true,
				matched: normalizeForMatch(value).includes(normalizeForMatch(expectedText)),
				message: 'ok',
				value: observer.shortText(value, 120),
			}
		}

		function verifyInputByPoint(xRaw, yRaw, expectedTextRaw) {
			const x = clampNumber(Number(xRaw), 0, window.innerWidth, window.innerWidth / 2)
			const y = clampNumber(Number(yRaw), 0, window.innerHeight, window.innerHeight / 2)
			const expectedText = String(expectedTextRaw || '')
			const target = observer.findElementAtPoint(x, y)
			if (!target) {
				return { success: false, matched: false, message: '坐标未命中元素' }
			}
			const editable = observer.resolveEditableTarget(target)
			if (!editable) {
				return { success: false, matched: false, message: '命中元素不可输入' }
			}
			const value = readElementValue(editable)
			return {
				success: true,
				matched: normalizeForMatch(value).includes(normalizeForMatch(expectedText)),
				message: 'ok',
				value: observer.shortText(value, 120),
			}
		}

		return {
			hitTestAtPoint,
			verifyInputByIndex,
			verifyInputByPoint,
		}
	}

	function readElementValue(element) {
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
			return String(element.value || '')
		}
		if (element.isContentEditable) return String(element.innerText || '')
		return String(element.textContent || '')
	}

	function normalizeForMatch(text) {
		return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase()
	}

	function isProbablyClickable(element) {
		const tag = element.tagName.toLowerCase()
		if (tag === 'a' || tag === 'button') return true
		if (
			element instanceof HTMLInputElement &&
			['button', 'submit', 'checkbox', 'radio'].includes(element.type)
		)
			return true
		if (element.getAttribute('role') === 'button') return true
		if (typeof element.onclick === 'function') return true
		if (element.hasAttribute('tabindex')) return true
		const style = window.getComputedStyle(element)
		return style.cursor === 'pointer'
	}

	g.NC_CONTENT_VERIFICATION = { createVerification }
})(window)

