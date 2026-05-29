;(function (g) {
	const POPUP_SELECTOR = [
		'.el-select-dropdown',
		'.el-select__popper',
		'.el-cascader-panel',
		'.el-picker-panel',
		'.el-dropdown-menu',
		'.ant-select-dropdown',
		'.ant-cascader-menus',
		'.ant-picker-dropdown',
		'.arco-trigger-popup',
		'.n-dropdown-menu',
		'[role="listbox"]',
	].join(',')

	const COMPOSITE_FIELD_SELECTOR = [
		'.el-select',
		'.el-select-v2',
		'.el-select__wrapper',
		'.el-cascader',
		'.el-date-editor',
		'.el-input--suffix',
		'.ant-select',
		'.ant-cascader-picker',
		'.ant-picker',
		'.arco-select',
		'.arco-cascader',
		'.arco-picker',
		'.n-base-selection',
		'.n-date-picker',
		'.avue-select',
		'.avue-cascader',
		'.avue-date',
		'.avue-time',
		'[class*="select-wrapper"]',
		'[class*="select__wrapper"]',
		'[class*="date-editor"]',
		'[class*="time-picker"]',
		'[class*="combobox"]',
		'[class*="picker"]',
		'[role="combobox"]',
	].join(',')

	const SELECTABLE_SELECTOR = [
		'input[type="checkbox"]',
		'input[type="radio"]',
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

	function isNativeFormControl(element) {
		return (
			element instanceof HTMLInputElement ||
			element instanceof HTMLTextAreaElement ||
			element instanceof HTMLSelectElement
		)
	}

	function isNativeTextInput(element) {
		if (element instanceof HTMLTextAreaElement) return true
		if (!(element instanceof HTMLInputElement)) return false
		const type = String(element.type || 'text').toLowerCase()
		return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(type)
	}

	function isSelectableControl(element) {
		if (!(element instanceof HTMLElement)) return false
		const role = String(element.getAttribute('role') || '').toLowerCase()
		if (role === 'checkbox' || role === 'radio' || role === 'switch') return true
		if (element instanceof HTMLInputElement) {
			const type = String(element.type || '').toLowerCase()
			return type === 'checkbox' || type === 'radio'
		}
		return /(checkbox|radio)/i.test(String(element.className || ''))
	}

	function isOptionLike(element) {
		if (!(element instanceof HTMLElement)) return false
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const cls = String(element.className || '')
		return (
			['option', 'menuitem', 'treeitem'].includes(role) ||
			/(el-select-dropdown__item|el-option|el-cascader-node|ant-select-item-option|ant-cascader-menu-item|arco-select-option|arco-cascader-option|n-base-select-option|n-cascader-option|select-option|dropdown-item|cascader)/i.test(cls)
		)
	}

	function getCompositeFieldContainer(element) {
		if (!(element instanceof HTMLElement)) return null
		if (element.closest?.(POPUP_SELECTOR)) return null
		const node = element.closest?.(COMPOSITE_FIELD_SELECTOR)
		if (!(node instanceof HTMLElement)) return null
		if (node !== element && (isOptionLike(element) || isSelectableControl(element))) return null
		if (isAmbiguousSuffixFieldContainer(node) && !hasReadonlyPickerDescendant(node)) return null
		if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
			const cls = String(node.className || '')
			if (!/(select|cascader|picker|combobox)/i.test(cls)) return null
		}
		return node
	}

	function isAmbiguousSuffixFieldContainer(element) {
		if (!(element instanceof HTMLElement)) return false
		const cls = String(element.className || '')
		return /(^|\s)(el-input--suffix|input--suffix)(\s|$)/i.test(cls)
	}

	function hasReadonlyPickerDescendant(element) {
		if (!(element instanceof HTMLElement)) return false
		const control =
			element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
				? element
				: element.querySelector?.('input, textarea, [role="combobox"]')
		if (control instanceof HTMLElement) {
			const role = String(control.getAttribute('role') || '').toLowerCase()
			if (role === 'combobox') return true
			if (isReadonlyPickerInput(control)) return true
		}
		const text = [
			element.getAttribute('placeholder') || '',
			control?.getAttribute?.('placeholder') || '',
			element.getAttribute('aria-label') || '',
			element.getAttribute('title') || '',
		].join(' ')
		const suffix = element.querySelector?.(
			'[class*="suffix"],[class*="arrow"],[class*="caret"],[class*="calendar"],[class*="date"],[class*="time"],svg'
		)
		const cls = String(element.className || '')
		if (/(select|cascader|picker|date-editor|time-picker|dropdown|combobox)/i.test(cls)) return true
		return /(请选择|请先选择|选择|select|choose|pick)/i.test(text) && suffix instanceof Element
	}

	function isComboboxLike(element) {
		if (!(element instanceof HTMLElement)) return false
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const cls = String(element.className || '')
		return (
			role === 'combobox' ||
			/(^|\s)(el-select|el-select-v2|el-cascader|el-date-editor|ant-select|ant-cascader-picker|ant-picker|arco-select|arco-cascader|arco-picker|n-base-selection|n-date-picker)(\s|$)/i.test(cls) ||
			/(select-wrapper|select__wrapper|combobox|picker|date-editor|time-picker|avue-(select|cascader|date|time))/i.test(cls) ||
			hasReadonlyPickerDescendant(element)
		)
	}

	function isReadonlyPickerInput(element) {
		if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false
		const readonly =
			element.readOnly ||
			String(element.getAttribute('readonly') || '').trim() !== '' ||
			String(element.getAttribute('aria-readonly') || '').toLowerCase() === 'true'
		if (!readonly) return false
		if (element instanceof HTMLInputElement && !isNativeTextInput(element)) return false
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const cls = String(element.className || '')
		const parentClass = String(element.parentElement?.className || '')
		const placeholder = String(element.getAttribute('placeholder') || '')
		const ariaPopup = String(element.getAttribute('aria-haspopup') || '').toLowerCase()
		const rel = [
			element.getAttribute('aria-controls') || '',
			element.getAttribute('aria-owns') || '',
			element.getAttribute('aria-activedescendant') || '',
			element.getAttribute('data-type') || '',
			element.getAttribute('data-role') || '',
		].join(' ')
		if (role === 'combobox' || ariaPopup && ariaPopup !== 'false') return true
		if (/(select|cascader|picker|dropdown|combobox)/i.test(`${cls} ${parentClass} ${rel}`)) return true
		if (/(请选择|请先选择|选择|select|choose|pick)/i.test(placeholder)) {
			const suffix = element.parentElement?.querySelector?.(
				'[class*="suffix"],[class*="arrow"],[class*="caret"],[class*="icon"],svg'
			)
			return suffix instanceof Element || !!rel.trim()
		}
		return false
	}

	function isDropdownLikeControl(element) {
		if (!(element instanceof HTMLElement)) return false
		if (element instanceof HTMLSelectElement) return true
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
			if (isReadonlyPickerInput(element)) return true
			const composite = getCompositeFieldContainer(element)
			return composite instanceof HTMLElement && composite !== element
		}
		const composite = getCompositeFieldContainer(element)
		if (composite instanceof HTMLElement) return composite === element ? isComboboxLike(element) : true
		return isComboboxLike(element)
	}

	function isEditableElement(element) {
		if (!(element instanceof HTMLElement)) return false
		if (element instanceof HTMLInputElement) {
			const composite = getCompositeFieldContainer(element)
			if (composite instanceof HTMLElement && composite !== element) return false
			if (element.readOnly) return false
			return isNativeTextInput(element)
		}
		return element instanceof HTMLTextAreaElement || element.isContentEditable
	}

	function resolveEditableTarget(element) {
		if (!(element instanceof HTMLElement)) return null
		if (isEditableElement(element)) return element
		const nested = element.querySelector('input, textarea, [contenteditable="true"]')
		if (nested instanceof HTMLElement && isEditableElement(nested)) return nested
		return null
	}

	function readControlValue(element) {
		if (!(element instanceof HTMLElement)) return ''
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
			return String(element.value || '')
		}
		if (element instanceof HTMLSelectElement) {
			const selected = element.selectedOptions?.[0]
			return String(selected?.textContent || element.value || '')
		}
		if (element.isContentEditable) return String(element.innerText || element.textContent || '')
		const nested = element.querySelector?.('input, textarea, select')
		if (nested instanceof HTMLElement) return readControlValue(nested)
		return String(element.innerText || element.textContent || '')
	}

	function findNestedSelectableControl(element) {
		if (!(element instanceof HTMLElement)) return null
		if (element.matches?.(SELECTABLE_SELECTOR) && isVisibleSelectableControl(element)) return element
		const nested = Array.from(element.querySelectorAll(SELECTABLE_SELECTOR)).find(
			(node) => node instanceof HTMLElement && isVisibleSelectableControl(node)
		)
		return nested instanceof HTMLElement ? nested : null
	}

	function isVisibleSelectableControl(element) {
		const rect = element.getBoundingClientRect()
		const style = g.getComputedStyle(element)
		return rect.width >= 2 && rect.height >= 2 && style.visibility !== 'hidden' && style.display !== 'none'
	}

	function readSelectableState(element) {
		if (!(element instanceof HTMLElement)) return ''
		const ariaChecked = String(element.getAttribute('aria-checked') || '').trim()
		if (ariaChecked) return ariaChecked === 'true' ? 'checked' : 'unchecked'
		const ariaSelected = String(element.getAttribute('aria-selected') || '').trim()
		if (ariaSelected) return ariaSelected === 'true' ? 'selected' : 'unselected'
		if (element instanceof HTMLInputElement) {
			const type = String(element.type || '').toLowerCase()
			if (type === 'checkbox' || type === 'radio') return element.checked ? 'checked' : 'unchecked'
		}
		const cls = String(element.className || '')
		if (/(is-checked|checked)/i.test(cls)) return 'checked'
		if (/(is-selected|selected)/i.test(cls)) return 'selected'
		return ''
	}

	function getSelectionControlType(element) {
		if (!(element instanceof HTMLElement)) return ''
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const cascaderNode = element.closest?.('.el-cascader-node,[class*="cascader-node"]')
		const cls = String(element.className || '')
		if (cascaderNode instanceof HTMLElement || /(el-cascader-node)/i.test(cls)) {
			const node = cascaderNode instanceof HTMLElement ? cascaderNode : element
			return hasCascaderChildren(node) ? 'cascader-parent' : 'cascader-leaf'
		}
		if (isDropdownLikeControl(element)) return /cascader/i.test(cls) ? 'cascader-parent' : 'dropdown'
		if (role === 'checkbox' || role === 'switch') return 'checkbox'
		if (role === 'radio') return 'radio'
		if (element instanceof HTMLInputElement) {
			const type = String(element.type || '').toLowerCase()
			if (type === 'checkbox' || type === 'radio') return type
		}
		if (/(checkbox)/i.test(cls)) return 'checkbox'
		if (/(radio)/i.test(cls)) return 'radio'
		const nested = findNestedSelectableControl(element)
		if (!nested || nested === element) return ''
		return getSelectionControlType(nested) || 'checkbox'
	}

	function hasCascaderChildren(element) {
		if (!(element instanceof HTMLElement)) return false
		const node = element.closest?.('.el-cascader-node,[class*="cascader-node"]')
		const target = node instanceof HTMLElement ? node : element
		const ariaHasPopup = String(target.getAttribute('aria-haspopup') || '').toLowerCase()
		const ariaExpanded = String(target.getAttribute('aria-expanded') || '').toLowerCase()
		const cls = String(target.className || '')
		if (ariaHasPopup && ariaHasPopup !== 'false') return true
		if (/(is-expandable|has-children)/i.test(cls)) return true
		if (target.querySelector('.el-cascader-node__postfix,.el-icon-arrow-right,[class*="arrow-right"]')) return true
		const text = String(target.innerText || target.textContent || '')
		return /[›>〉]$/.test(text.trim()) || ariaExpanded === 'true'
	}

	function getExpandedState(element) {
		if (!(element instanceof HTMLElement)) return ''
		const ariaExpanded = String(element.getAttribute('aria-expanded') || '').trim()
		if (ariaExpanded) return ariaExpanded === 'true' ? 'expanded' : 'collapsed'
		if (hasExpandedClassSignal(element)) return 'expanded'
		if (isDropdownLikeControl(element)) return 'collapsed'
		return ''
	}

	function hasExpandedClassSignal(element) {
		if (!(element instanceof HTMLElement)) return false
		const cls = String(element.className || '')
		return /(is-opened|is-expanded|open|opened|show|visible)/i.test(cls) && /select|dropdown|cascader|popover|picker/i.test(cls)
	}

	g.NC_CONTENT_SEMANTICS = {
		isNativeFormControl,
		isNativeTextInput,
		isSelectableControl,
		isOptionLike,
		isComboboxLike,
		isReadonlyPickerInput,
		getCompositeFieldContainer,
		isDropdownLikeControl,
		isEditableElement,
		resolveEditableTarget,
		readControlValue,
		findNestedSelectableControl,
		readSelectableState,
		getSelectionControlType,
		getExpandedState,
		hasExpandedClassSignal,
		hasReadonlyPickerDescendant,
	}
})(window)
