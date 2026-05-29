;(function (g) {
	function createOptionHelpers(deps) {
		const controlSemantics = g.NC_CONTROL_SEMANTICS || null
		const {
			observer,
			setNativeValue,
			sleep,
			isVisibleClickTarget,
			isTopLayerClickable,
		} = deps || {}

		function selectOptionByText(select, text) {
			const expected = normalizeComparableText(text)
			const expectedWithoutValue = normalizeComparableText(stripOptionValueAnnotation(text))
			const options = Array.from(select.options || [])
			const matched =
				options.find((option) => nativeOptionMatches(option, expected, expectedWithoutValue)) ||
				options.find((option) => {
					const label = normalizeComparableText(option.textContent)
					return label && (label.includes(expected) || label.includes(expectedWithoutValue))
				})
			if (!matched) return null
			setNativeValue(select, matched.value)
			matched.selected = true
			return {
				value: matched.value,
				label: String(matched.label || matched.textContent || matched.value || '').trim(),
			}
		}

		function nativeOptionMatches(option, expected, expectedWithoutValue) {
			const candidates = [
				option.value,
				option.label,
				option.textContent,
				formatNativeOptionLabel(option),
			].map((value) => normalizeComparableText(value))
			return candidates.some(
				(candidate) =>
					candidate &&
					(candidate === expected || candidate === expectedWithoutValue)
			)
		}

		function stripOptionValueAnnotation(text) {
			return String(text || '').replace(/\s*\[value=[^\]]+\]\s*$/i, '')
		}

		function formatNativeOptionLabel(option) {
			const label = String(option?.label || option?.textContent || option?.value || '').trim()
			const value = String(option?.value || '').trim()
			const normalizedLabel = normalizeComparableText(label)
			const normalizedValue = normalizeComparableText(value)
			return normalizedValue && normalizedValue !== normalizedLabel
				? `${label || value} [value=${value}]`
				: (label || value)
		}

		function resolveNativeSelect(element) {
			if (element instanceof HTMLSelectElement) return element
			const nested = element?.querySelector?.('select')
			return nested instanceof HTMLSelectElement ? nested : null
		}

		function listNativeSelectOptionLabels(select, limit = 16) {
			if (!(select instanceof HTMLSelectElement)) return []
			const labels = []
			const seen = new Set()
			for (const option of Array.from(select.options || [])) {
				const raw = observer.shortText(String(option.label || option.textContent || option.value || '').trim(), 36)
				const key = normalizeComparableText(raw)
				if (!key || seen.has(key)) continue
				seen.add(key)
				labels.push(raw)
				if (labels.length >= limit) break
			}
			return labels
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

		function findNestedSelectableControl(element) {
			if (!(element instanceof HTMLElement)) return null
			if (isCascaderParentOption(element)) return null
			const selectors = getSelectableControlSelectors()
			if (element.matches?.(selectors) && isVisibleClickTarget(element)) return element
			const nested = Array.from(element.querySelectorAll(selectors))
				.find((node) => node instanceof HTMLElement && isVisibleClickTarget(node))
			return nested instanceof HTMLElement ? nested : null
		}

		function findSiblingSelectableControl(element) {
			if (!(element instanceof HTMLElement)) return null
			const row = findOptionRow(element) || element.parentElement
			if (!(row instanceof HTMLElement)) return null
			const controls = Array.from(row.querySelectorAll(getSelectableControlSelectors())).filter(
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

		function getSelectableControlSelectors() {
			return [
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
			const candidates = getVisibleOptionCandidates(options).filter((node) => {
				const label = normalizeComparableText(getVisibleOptionLabel(node))
				return label === expected || label.includes(expected)
			})
			return candidates.sort(compareOptionCandidate(text))[0] || null
		}

		function getVisibleOptionCandidates(options = {}) {
			return Array.from(document.querySelectorAll(getOptionCandidateSelector()))
				.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node) && (
					isTopLayerClickable(node) || isVisiblePopupOptionCandidate(node)
				))
				.filter((node) => {
					const cls = String(node.className || '')
					if (!isDropdownOptionCandidate(node, options)) return false
					if (options.field && !isOptionAssociatedWithField(node, options.field)) return false
					if (options.cascaderOnly && !/(cascader)/i.test(cls)) return false
					if (options.selectableOnly && !resolveSelectableClickTarget(node) && !/checkbox|radio/i.test(cls)) {
						return false
					}
					return !!normalizeComparableText(getVisibleOptionLabel(node))
				})
		}

		function getOptionCandidateSelector() {
			return [
				'[role="option"]',
				'[role="menuitem"]',
				'[role="checkbox"]',
				'[role="radio"]',
				'[aria-selected]',
				'[aria-checked]',
				'.el-select-dropdown__item',
				'.el-select-dropdown__item *',
				'.el-cascader-node',
				'.el-checkbox',
				'.el-checkbox__label',
				'.el-radio',
				'.el-radio__label',
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
		}

		function isDropdownOptionCandidate(node, options = {}) {
			if (!(node instanceof HTMLElement)) return false
			const role = String(node.getAttribute('role') || '').toLowerCase()
			const cls = String(node.className || '')
			if (['option', 'treeitem', 'checkbox', 'radio'].includes(role)) return true
			if (
				/(el-select-dropdown__item|el-option|el-cascader-node|ant-select-item-option|ant-cascader-menu-item|arco-select-option|arco-cascader-option|n-base-select-option|n-cascader-option|select-option|dropdown-item|cascader)/i.test(cls)
			) {
				return true
			}
			if (options.selectableOnly && resolveSelectableClickTarget(node)) return true
			return !!node.closest?.(
				getOptionPopupSelector()
			)
		}

		function isVisiblePopupOptionCandidate(node) {
			if (!(node instanceof HTMLElement)) return false
			const popup = getOptionPopupContainer(node)
			if (!(popup instanceof HTMLElement)) return false
			const style = window.getComputedStyle(popup)
			if (style.display === 'none' || style.visibility === 'hidden') return false
			const rect = popup.getBoundingClientRect()
			if (rect.width < 2 || rect.height < 2) return false
			return true
		}

		function isOptionAssociatedWithField(option, field) {
			if (!(option instanceof HTMLElement) || !(field instanceof HTMLElement)) return true
			if (field.contains(option) || option.contains(field)) return true
			const explicitAssociation = getExplicitOptionFieldAssociation(option, field)
			if (explicitAssociation !== null) return explicitAssociation
			const popup = getOptionPopupContainer(option)
			const optionRect = (popup instanceof HTMLElement ? popup : option).getBoundingClientRect()
			const fieldRect = field.getBoundingClientRect()
			if (!optionRect.width || !optionRect.height || !fieldRect.width || !fieldRect.height) return true
			if (controlSemantics?.isOptionTargetGeometryRelated) {
				return controlSemantics.isOptionTargetGeometryRelated(optionRect, fieldRect)
			}
			return fallbackOptionTargetGeometryRelated(optionRect, fieldRect)
		}

		function fallbackOptionTargetGeometryRelated(optionRect, fieldRect) {
			const overlap = Math.max(
				0,
				Math.min(optionRect.right, fieldRect.right) - Math.max(optionRect.left, fieldRect.left)
			)
			const minimumOverlap = Math.min(optionRect.width, fieldRect.width) * 0.18
			const fieldCenterX = fieldRect.left + fieldRect.width / 2
			const optionCenterX = optionRect.left + optionRect.width / 2
			const horizontallyNear =
				overlap >= minimumOverlap ||
				Math.abs(fieldCenterX - optionCenterX) <= Math.max(fieldRect.width, optionRect.width)
			if (!horizontallyNear) return false
			const verticalGap = Math.min(
				Math.abs(optionRect.top - fieldRect.bottom),
				Math.abs(fieldRect.top - optionRect.bottom)
			)
			return verticalGap <= Math.max(420, fieldRect.height * 12)
		}

		function getExplicitOptionFieldAssociation(option, field) {
			const controlledIds = getControlledPopupIds(field)
			if (controlledIds.length) return isOptionInsideControlledPopup(option, controlledIds)
			return isOptionInsidePopupLabelledByField(option, field)
		}

		function getOptionPopupContainer(option) {
			if (!(option instanceof HTMLElement)) return null
			const popup = option.closest?.(getOptionPopupSelector())
			return popup instanceof HTMLElement ? popup : null
		}

		function getOptionPopupSelector() {
			return [
				'.el-popper',
				'.el-select__popper',
				'.el-select-dropdown',
				'.el-cascader-panel',
				'.el-picker-panel',
				'.el-dropdown-menu',
				'.ant-select-dropdown',
				'.ant-picker-dropdown',
				'.ant-cascader-menus',
				'.arco-trigger-popup',
				'.n-dropdown-menu',
				'[role="listbox"]',
				'[class*="select"][class*="popper"]',
				'[class*="dropdown"][class*="popper"]',
			].join(',')
		}

		function getControlledPopupIds(field) {
			if (!(field instanceof HTMLElement)) return []
			const roots = [field]
			for (const child of Array.from(field.querySelectorAll?.('[aria-controls],[aria-owns]') || [])) {
				if (child instanceof HTMLElement) roots.push(child)
			}
			const ids = new Set()
			for (const root of roots) {
				for (const attr of ['aria-controls', 'aria-owns']) {
					for (const id of splitIdRefs(root.getAttribute(attr))) ids.add(id)
				}
			}
			return [...ids]
		}

		function isOptionInsideControlledPopup(option, controlledIds) {
			if (!(option instanceof HTMLElement)) return false
			for (const id of controlledIds) {
				const controlled = document.getElementById(id)
				if (controlled instanceof HTMLElement && (controlled.contains(option) || option.contains(controlled))) {
					return true
				}
				const selector = `[id="${cssEscape(id)}"]`
				if (option.id === id || option.closest?.(selector)) return true
			}
			return false
		}

		function isOptionInsidePopupLabelledByField(option, field) {
			const popup = getOptionPopupContainer(option)
			if (!(popup instanceof HTMLElement) || !(field instanceof HTMLElement)) return null
			const labelledIds = splitIdRefs(popup.getAttribute('aria-labelledby'))
			if (!labelledIds.length) return null
			const fieldIds = getFieldAssociationIds(field)
			if (!fieldIds.length) return null
			return labelledIds.some((id) => fieldIds.includes(id))
		}

		function getFieldAssociationIds(field) {
			if (!(field instanceof HTMLElement)) return []
			const ids = new Set()
			const add = (node) => {
				const id = String(node?.id || '').trim()
				if (id) ids.add(id)
			}
			add(field)
			for (const child of Array.from(field.querySelectorAll?.('[id]') || [])) {
				if (child instanceof HTMLElement) add(child)
			}
			for (const root of [field, ...Array.from(field.querySelectorAll?.('[aria-labelledby],[aria-describedby]') || [])]) {
				if (!(root instanceof HTMLElement)) continue
				for (const attr of ['aria-labelledby', 'aria-describedby']) {
					for (const id of splitIdRefs(root.getAttribute(attr))) ids.add(id)
				}
			}
			for (const id of [...ids]) {
				for (const label of Array.from(document.querySelectorAll?.(`label[for="${cssEscape(id)}"]`) || [])) {
					if (label instanceof HTMLElement) add(label)
				}
			}
			return [...ids]
		}

		function splitIdRefs(value) {
			return String(value || '')
				.split(/\s+/)
				.map((item) => item.trim())
				.filter(Boolean)
		}

		function cssEscape(value) {
			if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value))
			return String(value).replace(/["\\]/g, '\\$&')
		}

		function listVisibleOptionLabels(limit = 12, options = {}) {
			const labels = []
			const seen = new Set()
			for (const node of getVisibleOptionCandidates(options)) {
				const raw = observer.shortText(getVisibleOptionLabel(node), 36)
				const key = normalizeComparableText(raw)
				if (!key || seen.has(key)) continue
				seen.add(key)
				labels.push(raw)
				if (labels.length >= limit) break
			}
			return labels
		}

		function compareOptionCandidate(text) {
			const expected = normalizeComparableText(text)
			return (a, b) => {
				const aLabel = normalizeComparableText(getVisibleOptionLabel(a))
				const bLabel = normalizeComparableText(getVisibleOptionLabel(b))
				const aExact = aLabel === expected ? 0 : 1
				const bExact = bLabel === expected ? 0 : 1
				if (aExact !== bExact) return aExact - bExact
				const aDelta = Math.abs(aLabel.length - expected.length)
				const bDelta = Math.abs(bLabel.length - expected.length)
				if (aDelta !== bDelta) return aDelta - bDelta
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

		function resolveDropdownTrigger(element) {
			if (!(element instanceof HTMLElement)) return null
			const composite = element.closest?.(
				'.el-select,.el-cascader,.ant-select,.ant-cascader-picker,.arco-select,.arco-cascader,.n-base-selection,[class*="select-wrapper"],[class*="combobox"],[class*="picker"],[role="combobox"]'
			)
			const target = composite instanceof HTMLElement ? composite : element
			if (
				target.closest?.(
					'.el-select-dropdown,.el-cascader-panel,.el-picker-panel,.ant-select-dropdown,.ant-cascader-menus,.arco-trigger-popup,.n-dropdown-menu,[role="listbox"]'
				)
			) {
				return element
			}
			const inner = target.querySelector?.(
				'.el-input,.el-select__caret,.el-input__suffix,.ant-select-selector,.arco-select-view,.n-base-selection-label,input'
			)
			return inner instanceof HTMLElement ? inner : target
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

		function normalizeComparableText(value) {
			return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
		}

		return {
			compareOptionCandidate,
			findNestedSelectableControl,
			findOptionRow,
			findVisibleOptionByText,
			getVisibleOptionLabel,
			isCascaderParentOption,
			isOptionAssociatedWithField,
			listNativeSelectOptionLabels,
			listVisibleOptionLabels,
			normalizeComparableText,
			resolveDropdownTrigger,
			resolveNativeSelect,
			resolveSelectableClickTarget,
			selectOptionByText,
			waitForVisibleOption,
		}
	}

	g.NC_CONTENT_ACTION_OPTIONS = { createOptionHelpers }
})(window)
