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
			const editableTarget = observer.resolveEditableTarget(target)
			const editable = !!editableTarget
			const clickable = isProbablyClickable(target)
			const ignored = observer.isIgnoredElement(target)
			const value = editableTarget ? readElementValue(editableTarget) : ''
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
			const editable = observer.resolveEditableTarget(element)
			const value = readElementValue(editable || element)
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
		if (element instanceof HTMLSelectElement) {
			const selected = Array.from(element.selectedOptions || [])
				.map((option) => String(option.label || option.textContent || option.value || '').trim())
				.filter(Boolean)
			return selected.length ? selected.join(' ') : String(element.value || '')
		}
		if (element.isContentEditable) return String(element.innerText || '')
		return String(element.textContent || '')
	}

	function normalizeForMatch(text) {
		return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase()
	}

	function isProbablyClickable(element) {
		const target = resolveClickableTarget(element)
		if (!target) return false
		if (target instanceof HTMLSelectElement) return true
		const tag = target.tagName.toLowerCase()
		if (tag === 'a' || tag === 'button' || tag === 'summary' || tag === 'select') return true
		if (
			target instanceof HTMLInputElement &&
			['button', 'submit', 'checkbox', 'radio', 'file'].includes(target.type)
		)
			return true
		const role = String(target.getAttribute('role') || '').toLowerCase()
		if (['button', 'link', 'menuitem', 'tab', 'combobox', 'option', 'checkbox', 'radio', 'switch'].includes(role)) return true
		if (typeof target.onclick === 'function') return true
		if (target.hasAttribute('tabindex')) return true
		if (target.hasAttribute('aria-expanded') || target.hasAttribute('aria-haspopup') || target.hasAttribute('aria-controls')) return true
		const style = window.getComputedStyle(target)
		return style.cursor === 'pointer'
	}

	function resolveClickableTarget(element) {
		if (!(element instanceof HTMLElement)) return null
		const selector = [
			'a[href]',
			'a',
			'button',
			'summary',
			'select',
			'input[type="button"]',
			'input[type="submit"]',
			'input[type="checkbox"]',
			'input[type="radio"]',
			'input[type="file"]',
			'[role="button"]',
			'[role="link"]',
			'[role="menuitem"]',
			'[role="tab"]',
			'[role="combobox"]',
			'[role="option"]',
			'[role="checkbox"]',
			'[role="radio"]',
			'[role="switch"]',
			'[aria-expanded]',
			'[aria-haspopup]',
			'[aria-controls]',
			'[onclick]',
			'[tabindex]',
		].join(',')
		const closest = element.closest?.(selector)
		return closest instanceof HTMLElement ? closest : element
	}

	g.NC_CONTENT_VERIFICATION = { createVerification }
})(window)
