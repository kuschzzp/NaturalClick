;(function (g) {
	function createActionState({ observer, contract } = {}) {
		const actionContract = contract || g.NC_ACTION_CONTRACT || null
		const semantics = g.NC_CONTENT_SEMANTICS || null
		const OUTCOME_KIND = actionContract?.OUTCOME_KIND || {
			NONE: 'none',
			FAILED: 'failed',
			NO_EFFECT: 'no_effect',
			FOCUSED: 'focused',
			VALUE_CHANGED: 'value_changed',
			STATE_CHANGED: 'state_changed',
			OPTIONS_VISIBLE: 'options_visible',
			SCROLLED: 'scrolled',
		}

		function createOutcome(kind, extras = {}) {
			if (actionContract?.createOutcome) return actionContract.createOutcome(kind, extras)
			const progressKinds = new Set([
				OUTCOME_KIND.VALUE_CHANGED,
				OUTCOME_KIND.STATE_CHANGED,
				OUTCOME_KIND.OPTIONS_VISIBLE,
				OUTCOME_KIND.SCROLLED,
			])
			return { kind, progress: progressKinds.has(kind), ...extras }
		}

		function inferInteractionOutcome(before, after, fallback = OUTCOME_KIND.NONE) {
			if (!before || !after) return createOutcome(fallback)
			if (before.value !== after.value || before.childValue !== after.childValue) {
				return createOutcome(OUTCOME_KIND.VALUE_CHANGED)
			}
			if (before.text !== after.text) {
				return createOutcome(OUTCOME_KIND.VALUE_CHANGED)
			}
			for (const key of ['checked', 'selected', 'childChecked', 'childSelected', 'expanded']) {
				if (before[key] !== after[key]) return createOutcome(OUTCOME_KIND.STATE_CHANGED)
			}
			if (before.activeElement !== after.activeElement) {
				return createOutcome(OUTCOME_KIND.FOCUSED)
			}
			return createOutcome(fallback)
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
				childValue: '',
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
			if (ariaExpanded === null && hasExpandedClassSignal(element)) {
				state.expanded = true
			}

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
			const nestedValueControl = findNestedValueControl(element)
			if (nestedValueControl && nestedValueControl !== element) {
				state.childValue = readSelectionControlValue(nestedValueControl)
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
			for (const key of ['value', 'text', 'checked', 'selected', 'childChecked', 'childSelected', 'childValue', 'expanded', 'activeElement']) {
				if (before[key] !== after[key]) {
					parts.push(`${key}:${formatStateValue(before[key])}->${formatStateValue(after[key])}`)
				}
			}
			return parts.join(', ')
		}

		function readSelectionControlValue(element) {
			if (element instanceof HTMLInputElement) {
				const type = String(element.type || '').toLowerCase()
				if (type === 'checkbox' || type === 'radio') return ''
				return observer.shortText(element.value || '', 40)
			}
			if (element instanceof HTMLTextAreaElement) {
				return observer.shortText(element.value || '', 40)
			}
			if (element instanceof HTMLSelectElement) {
				const selected = element.selectedOptions?.[0]
				return observer.shortText(selected?.textContent || element.value || '', 40)
			}
			if (element instanceof HTMLElement && element.isContentEditable) {
				return observer.shortText(observer.getElementText(element), 40)
			}
			return ''
		}

		function hasExpandedClassSignal(element) {
			if (semantics?.hasExpandedClassSignal) return semantics.hasExpandedClassSignal(element)
			if (!(element instanceof HTMLElement)) return false
			const cls = String(element.className || '')
			return /(is-opened|is-expanded|open|opened|show|visible)/i.test(cls) && /select|dropdown|cascader|popover|picker/i.test(cls)
		}

		function findNestedSelectableControl(element) {
			if (!(element instanceof HTMLElement)) return null
			const semanticNested = semantics?.findNestedSelectableControl?.(element)
			if (semanticNested instanceof HTMLElement) return semanticNested
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
			if (element.matches?.(selectors) && isVisibleOrHiddenFormValue(element)) return element
			const nested = Array.from(element.querySelectorAll(selectors))
				.find((node) => node instanceof HTMLElement && isVisibleOrHiddenFormValue(node))
			return nested instanceof HTMLElement ? nested : null
		}

		function findNestedValueControl(element) {
			if (!(element instanceof HTMLElement)) return null
			const selectors = [
				'select:not([disabled])',
				'textarea:not([disabled])',
				'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled])',
				'[contenteditable="true"]',
				'[contenteditable=""]',
			]
			const nested = Array.from(element.querySelectorAll(selectors.join(',')))
				.find((node) => node instanceof HTMLElement && isVisibleOrHiddenFormValue(node))
			return nested instanceof HTMLElement ? nested : null
		}

		function isVisibleOrHiddenFormValue(element) {
			if (!(element instanceof HTMLElement)) return false
			if (element instanceof HTMLSelectElement) return true
			const rect = element.getBoundingClientRect()
			if (rect.width >= 1 && rect.height >= 1) return true
			const style = window.getComputedStyle(element)
			return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
		}

		function formatStateValue(value) {
			if (value === null || value === undefined || value === '') return '-'
			return String(value)
		}

		return {
			OUTCOME_KIND,
			appendStateChange,
			createOutcome,
			describeStateChanges,
			getElementInteractionState,
			inferInteractionOutcome,
			readSelectionControlValue,
		}
	}

	g.NC_CONTENT_ACTION_STATE = { createActionState }
})(window)
