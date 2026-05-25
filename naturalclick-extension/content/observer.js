;(function (g) {
	function createPageObserver(options = {}) {
		const selectorMap = new Map()
		const visual = options.visual || null
		let previousElementSignatures = new Set()

		function observePage() {
			selectorMap.clear()
			const candidates = collectInteractiveCandidates()
			const lines = []
			const indexedElements = []
			const elements = []
			const seenLineKeys = new Set()

			let idx = 0
			for (const element of candidates) {
				if (!(element instanceof HTMLElement)) continue
				if (!isElementVisible(element)) continue
				if (element.closest('#naturalclick-right-dock-host')) continue
				if (element.hasAttribute('data-naturalclick-ignore')) continue

				const tag = element.tagName.toLowerCase()
				const text = getElementText(element)
				const attrs = []
				if (element.id) attrs.push(`id="${shortText(element.id, 20)}"`)
				if (element.getAttribute('name'))
					attrs.push(`name="${shortText(element.getAttribute('name'), 20)}"`)
				if (element.getAttribute('aria-label'))
					attrs.push(`aria-label="${shortText(element.getAttribute('aria-label'), 24)}"`)
				if (element.getAttribute('placeholder'))
					attrs.push(`placeholder="${shortText(element.getAttribute('placeholder'), 24)}"`)
				if (element.getAttribute('role'))
					attrs.push(`role="${shortText(element.getAttribute('role'), 18)}"`)
				if (element.getAttribute('type'))
					attrs.push(`type="${shortText(element.getAttribute('type'), 12)}"`)
				const fieldLabel = getFieldLabel(element)
				if (fieldLabel) attrs.push(`field="${shortText(fieldLabel, 24)}"`)
				if (element.hasAttribute('required') || element.getAttribute('aria-required') === 'true') {
					attrs.push('required="true"')
				}

				const lineKey = buildLineDedupeKey(element, tag, text)
				if (seenLineKeys.has(lineKey)) continue
				seenLineKeys.add(lineKey)

				selectorMap.set(idx, element)
				indexedElements.push({ index: idx, element })
				const snapshot = buildElementSnapshot(idx, element, tag, text, fieldLabel)
				snapshot.signature = buildElementSignature(snapshot)
				snapshot.newSinceLastObservation = !previousElementSignatures.has(snapshot.signature)
				elements.push(snapshot)
				lines.push(formatElementLine(snapshot))
				idx += 1
				if (idx >= 180) break
			}
			previousElementSignatures = new Set(elements.map((item) => item.signature).filter(Boolean))
			const forms = buildFormGroups(elements)
			const actions = elements.filter((item) => item.clickable && !item.editable)
			const rawCandidates = lines
			const treeCandidates = buildDomTree(elements)
			const simplifiedDom = buildSimplifiedDom(elements)

			try {
				if (visual?.renderIndexHighlights) {
					visual.renderIndexHighlights(indexedElements)
				}
			} catch (_) {}

			return {
				url: location.href,
				title: document.title || '',
				scrollY: window.scrollY || window.pageYOffset || 0,
				activeElement: getActiveElementSummary(),
				viewport: {
					width: window.innerWidth,
					height: window.innerHeight,
				},
				forms,
				actions,
				elements,
				treeCandidates,
				simplifiedDom,
				rawCandidates,
				content: formatObservationText({ forms, actions, treeCandidates, simplifiedDom, rawCandidates }),
			}
		}

		function getElementByIndex(index) {
			return selectorMap.get(index)
		}

		function findElementAtPoint(x, y) {
			const target = document.elementFromPoint(x, y)
			return target instanceof HTMLElement ? target : null
		}

		function isIgnoredElement(element) {
			return !!element?.closest('[data-naturalclick-ignore]')
		}

		function resolveEditableTarget(element) {
			if (
				element instanceof HTMLInputElement ||
				element instanceof HTMLTextAreaElement ||
				element.isContentEditable
			) {
				return element
			}
			const nested = element.querySelector('input, textarea, [contenteditable="true"]')
			if (nested instanceof HTMLElement) return nested
			return null
		}

		return {
			observePage,
			getElementByIndex,
			findElementAtPoint,
			isIgnoredElement,
			resolveEditableTarget,
			getElementText,
			shortText,
			isElementVisible,
			getActiveElementSummary,
		}
	}

	function collectInteractiveCandidates() {
		const primarySelector = [
			'a[href]',
			'a',
			'button',
			'input',
			'textarea',
			'select',
			'summary',
			'[role="button"]',
			'[role="link"]',
			'[role="menuitem"]',
			'[role="tab"]',
			'[role="combobox"]',
			'[role="option"]',
			'[role="checkbox"]',
			'[role="radio"]',
			'[aria-selected]',
			'[aria-checked]',
			'[aria-expanded]',
			'[aria-haspopup]',
			'[aria-controls]',
			'[aria-owns]',
			'[data-state]',
			'[onclick]',
			'[tabindex]',
			'[contenteditable="true"]',
			'label[for]',
			'[data-action]',
			'[data-testid]',
			'[data-test]',
			'[data-cy]',
			'.el-select',
			'.el-input',
			'.el-select-dropdown__item',
			'.el-cascader',
			'.el-cascader-node',
			'.el-cascader-node__label',
			'.el-checkbox',
			'.el-radio',
			'.el-tree-node__content',
			'.ant-select',
			'.ant-select-item-option',
			'.ant-cascader-picker',
			'.ant-cascader-menu-item',
			'.ant-checkbox-wrapper',
			'.ant-radio-wrapper',
			'.arco-select',
			'.arco-select-option',
			'.arco-checkbox',
			'.n-base-selection',
			'.n-base-select-option',
			'.n-checkbox',
		].join(',')

		const extraSelector = [
			'div',
			'span',
			'label',
			'li',
			'p',
			'strong',
		].join(',')

		const seen = new Set()
		const result = []
		const addCandidate = (raw) => {
			if (!(raw instanceof HTMLElement)) return
			if (raw.tagName === 'LABEL' && !shouldKeepLabelCandidate(raw)) return
			const element = normalizeInteractiveElement(raw)
			if (!(element instanceof HTMLElement)) return
			if (seen.has(element)) return
			if (!isProbablyInteractive(element)) return
			seen.add(element)
			result.push(element)
		}

		const primary = Array.from(document.querySelectorAll(primarySelector))
		for (const node of primary) addCandidate(node)

		const extras = Array.from(document.querySelectorAll(extraSelector))
		for (const node of extras) {
			if (!(node instanceof HTMLElement)) continue
			const cls = String(node.className || '')
			const maybeButtonLikeClass = /(btn|button|login|register|signup|signin|forgot|submit|dropdown|select|cascader|checkbox|radio)/i.test(cls)
			if (maybeButtonLikeClass || hasPointerCursor(node) || hasInlineEventHandler(node)) {
				addCandidate(node)
			}
		}

		return compactInteractiveCandidates(result)
	}

	function normalizeInteractiveElement(element) {
		if (!(element instanceof HTMLElement)) return null
		const semantic = element.closest(
			'button,a,input,textarea,select,summary,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[role="combobox"],[role="option"],[role="checkbox"],[role="radio"],[aria-selected],[aria-checked],[aria-expanded],[aria-haspopup],[onclick],[contenteditable="true"],.el-select,.el-input,.el-select-dropdown__item,.el-cascader,.el-cascader-node,.el-checkbox,.el-radio,.el-tree-node__content,.ant-select,.ant-select-item-option,.ant-cascader-picker,.ant-cascader-menu-item,.ant-checkbox-wrapper,.ant-radio-wrapper,.arco-select,.arco-select-option,.n-base-selection,.n-base-select-option'
		)
		return semantic instanceof HTMLElement ? semantic : element
	}

	function isProbablyInteractive(element) {
		if (!(element instanceof HTMLElement)) return false
		const tag = element.tagName.toLowerCase()
		if (['button', 'summary', 'textarea', 'select'].includes(tag)) return true
		if (tag === 'a') {
			const txt = getElementText(element)
			if (txt === '(empty)' && !element.getAttribute('aria-label')) return false
			return true
		}
		if (tag === 'label' && element.hasAttribute('for')) return true
		if (tag === 'input') return true
		if (element.isContentEditable) return true

		const role = String(element.getAttribute('role') || '').toLowerCase()
		if (['button', 'link', 'menuitem', 'tab', 'combobox', 'option', 'checkbox', 'radio', 'switch'].includes(role)) {
			const txt = getElementText(element)
			if (isLikelyCounterText(txt) && tag !== 'button' && tag !== 'input') return false
			if (txt === '(empty)' && !element.getAttribute('aria-label') && !element.getAttribute('title')) {
				return false
			}
			return true
		}
		if (element.hasAttribute('onclick')) return true
		if (element.tabIndex >= 0 && element.tabIndex < 10000) return true
		if (hasInlineEventHandler(element)) return true
		if (hasInteractiveAriaState(element)) return true

		const cls = String(element.className || '')
		const text = getElementText(element)
		if (/(input__count|char-count|word-count)/i.test(cls)) return false
		if (isLikelyCounterText(text)) return false
		const rect = element.getBoundingClientRect()
		const area = Math.max(0, rect.width) * Math.max(0, rect.height)
		const maxArea = window.innerWidth * window.innerHeight * 0.26
		const optionLikeByClass = /(el-select-dropdown__item|el-option|el-cascader-node|el-checkbox|el-radio|el-tree-node__content|dropdown-item|select-option|cascader)/i.test(cls)
		if (optionLikeByClass && area > 8 && area <= maxArea) return true
		const buttonLikeByClass = /(btn|button|login|register|signup|signin|forgot|submit)/i.test(cls)
		if (buttonLikeByClass && text !== '(empty)' && area > 16 && area <= maxArea) return true

		if (hasPointerCursor(element)) {
			if (text !== '(empty)' && text.length <= 40 && area > 16 && area <= maxArea) return true
			if (area > 18 && area <= 12000 && element.childElementCount <= 3) return true
		}

		return false
	}

	function compactInteractiveCandidates(candidates) {
		const sorted = candidates
			.filter((item, index, arr) => arr.indexOf(item) === index)
			.sort((a, b) => getDomOrder(a, b))
		const result = []
		for (const candidate of sorted) {
			const existingIndex = result.findIndex(
				(item) => item !== candidate && (item.contains(candidate) || candidate.contains(item))
			)
			if (existingIndex < 0) {
				result.push(candidate)
				continue
			}
			const existing = result[existingIndex]
			const relation =
				existing.contains(candidate) && existing !== candidate
					? 'existing-parent'
					: candidate.contains(existing) && existing !== candidate
						? 'candidate-parent'
						: ''
			if (relation === 'existing-parent') {
				if (shouldKeepNestedCandidate(existing, candidate)) {
					result.push(candidate)
				} else if (candidateSpecificity(candidate) > candidateSpecificity(existing) + 1) {
					result[existingIndex] = candidate
				}
				continue
			}
			if (relation === 'candidate-parent') {
				if (shouldKeepNestedCandidate(candidate, existing)) {
					result.push(candidate)
				} else if (candidateSpecificity(candidate) > candidateSpecificity(existing) + 1) {
					result[existingIndex] = candidate
				}
			}
		}
		return result
	}

	function shouldKeepNestedCandidate(parent, child) {
		if (!(parent instanceof HTMLElement) || !(child instanceof HTMLElement)) return true
		if (isNativeFormControl(child) || isNativeFormControl(parent)) return true
		if (isOptionLike(child) || isSelectableControl(child)) return true
		if (isOptionLike(parent) && isSelectableControl(child)) return true
		if (isComboboxLike(parent) && isOptionLike(child)) return true
		if (isComboboxLike(parent) && isNativeTextInput(child)) return false
		const parentText = getElementText(parent)
		const childText = getElementText(child)
		if (parentText && childText && parentText !== '(empty)' && parentText === childText) {
			return candidateSpecificity(child) > candidateSpecificity(parent) + 2
		}
		return candidateSpecificity(child) >= candidateSpecificity(parent) + 2
	}

	function candidateSpecificity(element) {
		if (!(element instanceof HTMLElement)) return 0
		let score = 0
		const tag = element.tagName.toLowerCase()
		const role = String(element.getAttribute('role') || '').toLowerCase()
		if (['input', 'textarea', 'select', 'button'].includes(tag)) score += 5
		if (tag === 'a') score += 4
		if (['checkbox', 'radio', 'option', 'combobox', 'button', 'tab'].includes(role)) score += 4
		if (element.id || element.getAttribute('name')) score += 2
		if (element.getAttribute('aria-label') || element.getAttribute('placeholder')) score += 2
		if (element.getAttribute('data-testid') || element.getAttribute('data-test') || element.getAttribute('data-cy')) score += 2
		if (isSelectableControl(element) || isOptionLike(element) || isComboboxLike(element)) score += 3
		if (hasPointerCursor(element)) score += 1
		return score
	}

	function getDomOrder(a, b) {
		if (a === b) return 0
		const pos = a.compareDocumentPosition(b)
		if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
		if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
		return 0
	}

	function hasPointerCursor(element) {
		try {
			return window.getComputedStyle(element).cursor === 'pointer'
		} catch (_) {
			return false
		}
	}

	function hasInlineEventHandler(element) {
		if (!(element instanceof HTMLElement)) return false
		if (typeof element.onclick === 'function' || typeof element.onmousedown === 'function') return true
		return Array.from(element.attributes || []).some((attr) => /^on[a-z]+$/i.test(attr.name))
	}

	function hasInteractiveAriaState(element) {
		if (!(element instanceof HTMLElement)) return false
		return (
			element.hasAttribute('aria-expanded') ||
			element.hasAttribute('aria-haspopup') ||
			element.hasAttribute('aria-controls') ||
			element.hasAttribute('aria-owns') ||
			element.hasAttribute('aria-activedescendant') ||
			element.hasAttribute('data-state')
		)
	}

	function isNativeFormControl(element) {
		return (
			element instanceof HTMLInputElement ||
			element instanceof HTMLTextAreaElement ||
			element instanceof HTMLSelectElement ||
			element instanceof HTMLButtonElement
		)
	}

	function isNativeTextInput(element) {
		if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false
		if (element instanceof HTMLTextAreaElement) return true
		return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(
			String(element.type || '').toLowerCase()
		)
	}

	function isComboboxLike(element) {
		if (!(element instanceof HTMLElement)) return false
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const cls = String(element.className || '')
		return (
			role === 'combobox' ||
			element instanceof HTMLSelectElement ||
			/(select|cascader|dropdown|picker|base-selection)/i.test(cls) ||
			element.hasAttribute('aria-haspopup')
		)
	}

	function isOptionLike(element) {
		if (!(element instanceof HTMLElement)) return false
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const cls = String(element.className || '')
		return (
			['option', 'menuitem', 'treeitem'].includes(role) ||
			element.hasAttribute('aria-selected') ||
			/(option|dropdown__item|cascader-node|menu-item|tree-node__content)/i.test(cls)
		)
	}

	function isSelectableControl(element) {
		if (!(element instanceof HTMLElement)) return false
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const cls = String(element.className || '')
		if (role === 'checkbox' || role === 'radio' || role === 'switch') return true
		if (element instanceof HTMLInputElement) {
			const type = String(element.type || '').toLowerCase()
			return type === 'checkbox' || type === 'radio'
		}
		return /(checkbox|radio|switch)/i.test(cls) || element.hasAttribute('aria-checked')
	}

	function isElementVisible(element) {
		const rect = element.getBoundingClientRect()
		if (rect.width < 2 || rect.height < 2) return false
		const style = window.getComputedStyle(element)
		if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false
		const inViewport =
			rect.bottom > 0 &&
			rect.right > 0 &&
			rect.left < window.innerWidth &&
			rect.top < window.innerHeight
		if (!inViewport) return false
		if (style.pointerEvents === 'none' && !isTextInputControl(element)) return false
		if (!isLikelyRenderedOnTop(element)) return false
		return true
	}

	function getElementText(element) {
		const text =
			element.getAttribute('aria-label') ||
			element.getAttribute('placeholder') ||
			element.innerText ||
			element.textContent ||
			element.getAttribute('value') ||
			''
		return String(text).replace(/\s+/g, ' ').trim() || '(empty)'
	}

	function shortText(value, maxLen) {
		const text = String(value || '')
		return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`
	}

	function getFieldLabel(element) {
		if (!(element instanceof HTMLElement)) return ''
		const tag = element.tagName.toLowerCase()
		if (!['input', 'textarea', 'select'].includes(tag)) return ''

		const ariaLabel = String(element.getAttribute('aria-label') || '').trim()
		if (ariaLabel) return ariaLabel

		const labelledBy = String(element.getAttribute('aria-labelledby') || '').trim()
		if (labelledBy) {
			const ids = labelledBy.split(/\s+/).filter(Boolean)
			for (const id of ids) {
				const node = document.getElementById(id)
				const txt = node ? getElementText(node) : ''
				if (txt && txt !== '(empty)') return txt
			}
		}

		const id = String(element.id || '').trim()
		if (id) {
			try {
				const labelByFor = document.querySelector(`label[for="${CSS.escape(id)}"]`)
				const txt = labelByFor ? getElementText(labelByFor) : ''
				if (txt && txt !== '(empty)') return txt
			} catch (_) {}
		}

		const wrappedLabel = element.closest('label')
		if (wrappedLabel instanceof HTMLElement) {
			const txt = getElementText(wrappedLabel)
			if (txt && txt !== '(empty)') return txt
		}

		const formItem = element.closest('.el-form-item,.form-item,[class*="form-item"],[class*="field"]')
		if (formItem instanceof HTMLElement) {
			const lab = formItem.querySelector('label,.el-form-item__label,[class*="label"]')
			const txt = lab instanceof HTMLElement ? getElementText(lab) : ''
			if (txt && txt !== '(empty)') return txt
		}

		const prevLabel = findNearbyLabel(element)
		if (prevLabel) return prevLabel

		const placeholder = String(element.getAttribute('placeholder') || '').trim()
		if (placeholder) return placeholder
		return ''
	}

	function findNearbyLabel(element) {
		let cursor = element.previousElementSibling
		let depth = 0
		while (cursor && depth < 5) {
			if (cursor instanceof HTMLElement) {
				const tag = cursor.tagName.toLowerCase()
				if (tag === 'label' || /label/i.test(String(cursor.className || ''))) {
					const txt = getElementText(cursor)
					if (txt && txt !== '(empty)') return txt
				}
			}
			cursor = cursor.previousElementSibling
			depth += 1
		}
		return ''
	}

	function shouldKeepLabelCandidate(labelEl) {
		if (!(labelEl instanceof HTMLLabelElement)) return false
		const targetId = String(labelEl.getAttribute('for') || '').trim()
		if (!targetId) return false
		const target = document.getElementById(targetId)
		if (!(target instanceof HTMLElement)) return false
		if (target instanceof HTMLInputElement) {
			const type = String(target.type || 'text').toLowerCase()
			return ['checkbox', 'radio', 'file'].includes(type)
		}
		return false
	}

	function buildLineDedupeKey(element, tag, text) {
		const rect = element.getBoundingClientRect()
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const type = String(element.getAttribute('type') || '').toLowerCase()
		const aria = String(element.getAttribute('aria-label') || '').toLowerCase()
		const placeholder = String(element.getAttribute('placeholder') || '').toLowerCase()
		const normalizedText = String(text || '').toLowerCase()
		const sig = `${tag}|${role}|${type}|${aria}|${placeholder}|${normalizedText}`
		const x = Math.round(rect.left / 8)
		const y = Math.round(rect.top / 8)
		const w = Math.round(rect.width / 8)
		const h = Math.round(rect.height / 8)
		return `${sig}|${x},${y},${w},${h}`
	}

	function isLikelyCounterText(text) {
		const normalized = String(text || '').trim()
		return /^\d+\s*\/\s*\d+$/.test(normalized)
	}

	function isTextInputControl(element) {
		return (
			element instanceof HTMLTextAreaElement ||
			(element instanceof HTMLInputElement &&
				!['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(
					String(element.type || '').toLowerCase()
				))
		)
	}

	function isLikelyRenderedOnTop(element) {
		const rect = element.getBoundingClientRect()
		const points = [
			{ x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 },
			{ x: rect.left + rect.width * 0.25, y: rect.top + rect.height * 0.5 },
			{ x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.5 },
		]
		for (const p of points) {
			if (p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight) continue
			const hit = document.elementFromPoint(p.x, p.y)
			if (!hit) continue
			if (hit === element || element.contains(hit) || hit.contains(element)) return true
		}
		return false
	}

	function getActiveElementSummary() {
		const active = document.activeElement
		if (!active || !(active instanceof HTMLElement)) return '(none)'
		const tag = active.tagName.toLowerCase()
		const id = active.id ? `#${active.id}` : ''
		const cls =
			active.className && typeof active.className === 'string'
				? `.${active.className.split(/\s+/)[0] || ''}`
				: ''
		return `${tag}${id}${cls}`
	}

	function buildElementSnapshot(index, element, tag, text, fieldLabel) {
		const role = getElementRole(element, tag)
		const type = String(element.getAttribute('type') || '').toLowerCase()
		const label = fieldLabel || getElementAccessibleName(element)
		const placeholder = String(element.getAttribute('placeholder') || '').trim()
		const editable = isEditableElement(element)
		const clickable = isClickableElement(element)
		const fieldType = editable ? inferFieldType({ label, placeholder, text, type, role }) : ''
		const actionIntent = !editable && clickable ? inferActionIntent({ label, text, role, type, element }) : ''
		const valueState = getValueState(element)
		const selectionControl = getSelectionControlType(element)
		const relationHints = getRelationHints(element)
		return {
			index,
			tag,
			role,
			type,
			label: shortText(label, 48),
			placeholder: shortText(placeholder, 48),
			text: shortText(text, 80),
			fieldType,
			actionIntent,
			valueState,
			selectionControl,
			expandedState: getExpandedState(element),
			stateHints: getStateHints(element),
			relationHints,
			editable,
			clickable,
			required: element.hasAttribute('required') || element.getAttribute('aria-required') === 'true',
			rect: getElementRect(element),
			selectorHints: getSelectorHints(element),
			domPath: shortText(getDomPath(element), 120),
			confidence: computeElementConfidence({ element, editable, clickable, fieldType, actionIntent, label, text }),
		}
	}

	function formatElementLine(item) {
		const attrs = []
		if (item.role) attrs.push(`role="${item.role}"`)
		if (item.type) attrs.push(`type="${item.type}"`)
		if (item.label) attrs.push(`label="${shortText(item.label, 24)}"`)
		if (item.placeholder) attrs.push(`placeholder="${shortText(item.placeholder, 24)}"`)
		if (item.fieldType) attrs.push(`fieldType="${item.fieldType}"`)
		if (item.actionIntent) attrs.push(`intent="${item.actionIntent}"`)
		if (item.valueState && item.valueState !== 'unknown') attrs.push(`value="${item.valueState}"`)
		if (item.selectionControl) attrs.push(`control="${item.selectionControl}"`)
		if (item.expandedState) attrs.push(`expanded="${item.expandedState}"`)
		if (item.stateHints) attrs.push(`state="${shortText(item.stateHints, 28)}"`)
		if (item.relationHints) attrs.push(`rel="${shortText(item.relationHints, 36)}"`)
		if (item.newSinceLastObservation) attrs.push('new="true"')
		if (item.required) attrs.push('required="true"')
		attrs.push(`conf="${item.confidence}"`)
		return `[${item.index}]<${item.tag} ${attrs.join(' ')}>${shortText(item.text, 80)}</${item.tag}>`
	}

	function formatObservationText({ forms, actions, treeCandidates, simplifiedDom, rawCandidates }) {
		const sections = []
		if (forms.length) {
			sections.push('<forms>')
			for (const form of forms) {
				sections.push(`form ${form.id}: ${form.name}`)
				for (const field of form.fields) {
					sections.push(
						`  field index=${field.index} fieldType=${field.fieldType || 'unknown'} label="${field.label || field.placeholder || field.text}" value=${field.valueState} type=${field.type || '-'} expanded=${field.expandedState || '-'}`
					)
				}
			}
			sections.push('</forms>')
		}
		if (actions.length) {
			sections.push('<actions>')
			for (const action of actions.slice(0, 60)) {
				sections.push(
					`  action index=${action.index} intent=${action.actionIntent || 'unknown'} label="${action.label || action.text}" role=${action.role || '-'} value=${action.valueState || 'unknown'} control=${action.selectionControl || '-'} expanded=${action.expandedState || '-'}`
				)
			}
			sections.push('</actions>')
		}
		if (Array.isArray(treeCandidates) && treeCandidates.length) {
			sections.push('<dom_tree>')
			sections.push(...treeCandidates.slice(0, 80).map((item) => item.line))
			sections.push('</dom_tree>')
		}
		if (Array.isArray(simplifiedDom) && simplifiedDom.length) {
			sections.push('<simplified_dom>')
			sections.push(...simplifiedDom.slice(0, 100))
			sections.push('</simplified_dom>')
		}
		sections.push('<raw_candidates>')
		sections.push(...rawCandidates.slice(0, 80))
		if (rawCandidates.length > 80) {
			sections.push(`... omitted ${rawCandidates.length - 80} raw candidates`)
		}
		sections.push('</raw_candidates>')
		return sections.join('\n') || '(no interactive elements found)'
	}

	function buildSimplifiedDom(elements) {
		const sorted = [...elements].sort((a, b) => inferLayerPriority(a) - inferLayerPriority(b) || a.rect.top - b.rect.top || a.rect.left - b.rect.left)
		return sorted.map((item) => {
			const depth = Math.max(0, Math.min(3, inferTreeDepth(item)))
			const tag = getSemanticTagName(item)
			const attrs = [
				`index="${item.index}"`,
				item.role ? `role="${item.role}"` : '',
				item.fieldType ? `fieldType="${item.fieldType}"` : '',
				item.actionIntent ? `intent="${item.actionIntent}"` : '',
				item.selectionControl ? `control="${item.selectionControl}"` : '',
				item.valueState && item.valueState !== 'unknown' ? `value="${item.valueState}"` : '',
				item.expandedState ? `expanded="${item.expandedState}"` : '',
				item.stateHints ? `state="${shortText(item.stateHints, 32)}"` : '',
				item.relationHints ? `rel="${shortText(item.relationHints, 48)}"` : '',
				item.newSinceLastObservation ? 'new="true"' : '',
			].filter(Boolean)
			const label = shortText(item.label || item.placeholder || item.text || '', 64)
			return `${'  '.repeat(depth)}<${tag} ${attrs.join(' ')}>${label}</${tag}>`
		})
	}

	function getSemanticTagName(item) {
		if (item.fieldType) return 'field'
		if (item.selectionControl === 'cascader-parent') return 'cascader-parent'
		if (item.selectionControl === 'cascader-leaf') return 'cascader-option'
		if (item.selectionControl === 'checkbox') return 'checkbox'
		if (item.selectionControl === 'radio') return 'radio'
		if (item.actionIntent) return 'action'
		return item.role || item.tag || 'node'
	}

	function buildDomTree(elements) {
		const sorted = [...elements].sort((a, b) => {
			const aLayer = inferLayerPriority(a)
			const bLayer = inferLayerPriority(b)
			return aLayer - bLayer || a.rect.top - b.rect.top || a.rect.left - b.rect.left
		})
		return sorted.map((item) => {
			const depth = Math.max(0, Math.min(3, inferTreeDepth(item)))
			const marker = item.newSinceLastObservation ? '*' : ' '
			const flags = []
			if (isLikelyPopupItem(item)) flags.push('popup')
			if (isLikelyScrollableItem(item)) flags.push('scrollable')
			if (item.selectionControl) flags.push(item.selectionControl)
			if (item.expandedState) flags.push(item.expandedState)
			const role = item.fieldType || item.actionIntent || item.role || item.tag
			const label = item.label || item.placeholder || item.text || ''
			const indent = '  '.repeat(depth)
			return {
				index: item.index,
				line: `${indent}${marker}[${item.index}] ${role} label="${shortText(label, 44)}" value=${item.valueState || 'unknown'} rect=${item.rect.left},${item.rect.top},${item.rect.width}x${item.rect.height}${flags.length ? ` flags=${flags.join('|')}` : ''}`,
			}
		})
	}

	function inferTreeDepth(item) {
		const pathDepth = String(item.domPath || '').split('>').filter(Boolean).length
		let depth = Math.max(0, pathDepth - 2)
		if (isLikelyPopupItem(item)) depth = Math.max(1, depth)
		if (item.selectionControl === 'cascader-leaf') depth = Math.max(2, depth)
		if (item.selectionControl === 'cascader-parent') depth = Math.max(1, depth)
		return depth
	}

	function inferLayerPriority(item) {
		if (isLikelyPopupItem(item)) return 0
		return 1
	}

	function isLikelyPopupItem(item) {
		const path = String(item.domPath || '')
		const text = `${path} ${item.role || ''} ${item.selectionControl || ''}`
		return /dropdown|popper|popover|select-dropdown|cascader|menu/i.test(text)
	}

	function isLikelyScrollableItem(item) {
		return item.rect.width > 220 && item.rect.height > 80 && /select|region|department|page_form|unknown/.test(String(item.fieldType || item.actionIntent || ''))
	}

	function buildElementSignature(item) {
		return [
			item.tag,
			item.role,
			item.type,
			item.label,
			item.placeholder,
			item.text,
			item.fieldType,
			item.actionIntent,
			item.selectionControl,
			item.expandedState,
			item.stateHints,
			item.relationHints,
			Math.round((item.rect?.left || 0) / 8),
			Math.round((item.rect?.top || 0) / 8),
			Math.round((item.rect?.width || 0) / 8),
			Math.round((item.rect?.height || 0) / 8),
		].join('|')
	}

	function buildFormGroups(elements) {
		const fields = elements.filter((item) => item.editable)
		if (!fields.length) return []
		const groups = new Map()
		for (const field of fields) {
			const key = field.selectorHints.formId || field.selectorHints.formName || 'page_form'
			if (!groups.has(key)) {
				groups.set(key, {
					id: key,
					name: key === 'page_form' ? inferPageFormName(elements) : key,
					fields: [],
				})
			}
			groups.get(key).fields.push(field)
		}
		return Array.from(groups.values()).map((group) => ({
			...group,
			fields: group.fields.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left),
		}))
	}

	function inferPageFormName(elements) {
		const intents = elements.map((item) => item.actionIntent).filter(Boolean)
		if (intents.includes('register') || intents.includes('signup')) return '注册表单'
		if (intents.includes('login')) return '登录表单'
		if (intents.includes('reset_password')) return '找回密码表单'
		return '页面表单'
	}

	function inferFieldType({ label, placeholder, text, type, role }) {
		const haystack = `${label} ${placeholder} ${text}`.toLowerCase()
		if (/所属部门|部门|组织|机构|dept|department|org/.test(haystack)) return 'department'
		if (/所属岗位|岗位|职位|职务|position|post|job/.test(haystack)) return 'position'
		if (/所属角色|角色|role/.test(haystack)) return 'role'
		if (/用户平台|平台|platform|client/.test(haystack)) return 'platform'
		if (/所属区域|区域|地区|省|市|区|县|region|area|province|city|district/.test(haystack)) return 'region'
		if (/性别|gender|sex/.test(haystack)) return 'gender'
		if (/生日|出生日期|日期|时间|date|birthday|time/.test(haystack)) return 'date'
		if (role === 'combobox' || type === 'select-one' || type === 'select-multiple') return 'select'
		if (/确认密码|重复密码|再次输入密码|confirm\s*password|password\s*confirm|re-?enter/.test(haystack)) {
			return 'confirm_password'
		}
		if (/密码|password|pwd/.test(haystack) || type === 'password') return 'password'
		if (/验证码|校验码|短信码|otp|code|captcha/.test(haystack)) return 'otp'
		if (/手机|手机号|电话|mobile|phone|tel/.test(haystack) || type === 'tel') return 'phone'
		if (/邀请码|邀请|invite|referral/.test(haystack)) return 'invite_code'
		if (/昵称|称呼|nickname|display\s*name/.test(haystack)) return 'nickname'
		if (/用户名|账号|账户|登录名|user\s*name|username|account|login/.test(haystack)) return 'username'
		if (/邮箱|email|mail/.test(haystack) || type === 'email') return 'email'
		if (/姓名|真实姓名|name/.test(haystack)) return 'name'
		if (/搜索|search/.test(haystack) || type === 'search') return 'search'
		return ''
	}

	function inferActionIntent({ label, text, role, type, element }) {
		const haystack = `${label} ${text} ${role} ${type}`.toLowerCase()
		if (['option', 'radio'].includes(role)) return 'select_option'
		if (['checkbox', 'switch'].includes(role)) return 'toggle_option'
		if (element instanceof HTMLInputElement) {
			const inputType = String(element.type || '').toLowerCase()
			if (inputType === 'radio') return 'select_option'
			if (inputType === 'checkbox') return 'toggle_option'
		}
		if (/免费注册|注册|signup|sign up|register|create account/.test(haystack)) return 'register'
		if (/立即登录|登录|signin|sign in|login/.test(haystack)) return 'login'
		if (/忘记密码|找回密码|reset password|forgot/.test(haystack)) return 'reset_password'
		if (/获取验证码|发送验证码|send code|get code|验证码/.test(haystack)) return 'get_otp'
		if (/提交|确认|保存|submit|confirm|save/.test(haystack)) return 'submit'
		if (/下一步|继续|next|continue/.test(haystack)) return 'next'
		if (/取消|关闭|返回|cancel|close|back/.test(haystack)) return 'cancel_or_back'
		if (/企业管理员|超级管理员|管理员|角色|岗位|部门|平台|男|女|启用|禁用|正常|停用|省|市|区|县|北京市|天津市/.test(haystack)) {
			return 'select_option'
		}
		return ''
	}

	function getElementRole(element, tag) {
		const role = String(element.getAttribute('role') || '').trim()
		if (role) return role
		if (tag === 'a') return 'link'
		if (tag === 'button') return 'button'
		if (element instanceof HTMLInputElement) {
			const type = String(element.type || '').toLowerCase()
			if (type === 'checkbox') return 'checkbox'
			if (type === 'radio') return 'radio'
			return 'textbox'
		}
		if (tag === 'textarea') return 'textbox'
		if (tag === 'select') return 'combobox'
		const cls = String(element.className || '')
		if (/(el-cascader-node)/i.test(cls)) return 'option'
		if (/(el-cascader|cascader)/i.test(cls) && !/(node|panel|menu|dropdown)/i.test(cls)) return 'combobox'
		if (/(el-select|select-wrapper|combobox)/i.test(cls) && !/(dropdown__item|option)/i.test(cls)) return 'combobox'
		if (/(el-select-dropdown__item|el-option|dropdown-item|select-option)/i.test(cls)) return 'option'
		if (/(el-checkbox)/i.test(cls)) return 'checkbox'
		if (/(el-radio)/i.test(cls)) return 'radio'
		if (/(el-tree-node__content|tree-node)/i.test(cls)) return 'option'
		return ''
	}

	function getElementAccessibleName(element) {
		const aria = String(element.getAttribute('aria-label') || '').trim()
		if (aria) return aria
		const title = String(element.getAttribute('title') || '').trim()
		if (title) return title
		return getElementText(element) === '(empty)' ? '' : getElementText(element)
	}

	function isEditableElement(element) {
		if (element instanceof HTMLInputElement) {
			const type = String(element.type || 'text').toLowerCase()
			return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(type)
		}
		return (
			element instanceof HTMLTextAreaElement ||
			element instanceof HTMLSelectElement ||
			element.isContentEditable
		)
	}

	function isClickableElement(element) {
		const tag = element.tagName.toLowerCase()
		if (['a', 'button', 'summary'].includes(tag)) return true
		if (element instanceof HTMLInputElement) {
			return ['button', 'submit', 'checkbox', 'radio', 'file'].includes(String(element.type || '').toLowerCase())
		}
		const role = String(element.getAttribute('role') || '').toLowerCase()
		if (['button', 'link', 'menuitem', 'tab', 'combobox', 'option', 'checkbox', 'radio', 'switch'].includes(role)) return true
		return element.hasAttribute('onclick') || hasPointerCursor(element)
	}

	function getValueState(element) {
		const ariaChecked = String(element.getAttribute('aria-checked') || '').trim()
		if (ariaChecked) return ariaChecked === 'true' ? 'checked' : 'unchecked'
		const ariaSelected = String(element.getAttribute('aria-selected') || '').trim()
		if (ariaSelected) return ariaSelected === 'true' ? 'selected' : 'unselected'

		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
			if (element instanceof HTMLInputElement) {
				const inputType = String(element.type || '').toLowerCase()
				if (inputType === 'checkbox' || inputType === 'radio') {
					return element.checked ? 'checked' : 'unchecked'
				}
			}
			const value = String(element.value || '')
			if (!value) return 'empty'
			if (String(element.type || '').toLowerCase() === 'password') return `filled:${value.length}`
			return `filled:${shortText(value, 24)}`
		}
		if (element instanceof HTMLSelectElement) {
			const selected = element.selectedOptions?.[0]
			const label = selected ? getElementText(selected) : ''
			return element.value ? `selected:${shortText(label || element.value, 24)}` : 'empty'
		}
		const cls = String(element.className || '')
		const nestedSelectable = findNestedSelectableControl(element)
		if (nestedSelectable && nestedSelectable !== element) {
			const nestedState = readSelectableState(nestedSelectable)
			if (nestedState) return nestedState
		}
		if (/(is-checked|checked)/i.test(cls)) return 'checked'
		if (/(is-selected|selected)/i.test(cls)) return 'selected'
		if (element.isContentEditable) return String(element.innerText || '').trim() ? 'filled' : 'empty'
		return 'unknown'
	}

	function getSelectionControlType(element) {
		const role = String(element?.getAttribute?.('role') || '').toLowerCase()
		const cascaderNode = element.closest?.('.el-cascader-node,[class*="cascader-node"]')
		const cls = String(element.className || '')
		if (cascaderNode instanceof HTMLElement || /(el-cascader-node)/i.test(cls)) {
			const node = cascaderNode instanceof HTMLElement ? cascaderNode : element
			return hasCascaderChildren(node) ? 'cascader-parent' : 'cascader-leaf'
		}
		if (role === 'checkbox' || role === 'switch') return 'checkbox'
		if (role === 'radio') return 'radio'
		if (element instanceof HTMLInputElement) {
			const type = String(element.type || '').toLowerCase()
			if (type === 'checkbox' || type === 'radio') return type
		}
		if (/(checkbox)/i.test(cls)) return 'checkbox'
		if (/(radio)/i.test(cls)) return 'radio'
		const nested = findNestedSelectableControl(element)
		if (!nested) return ''
		if (nested === element) return ''
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

	function findNestedSelectableControl(element) {
		if (!(element instanceof HTMLElement)) return null
		const selectors = [
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
		if (element.matches?.(selectors) && isVisibleSelectableControl(element)) return element
		const nested = Array.from(element.querySelectorAll(selectors)).find(
			(node) => node instanceof HTMLElement && isVisibleSelectableControl(node)
		)
		return nested instanceof HTMLElement ? nested : null
	}

	function isVisibleSelectableControl(element) {
		const rect = element.getBoundingClientRect()
		const style = window.getComputedStyle(element)
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

	function getExpandedState(element) {
		const ariaExpanded = String(element.getAttribute('aria-expanded') || '').trim()
		if (ariaExpanded) return ariaExpanded === 'true' ? 'expanded' : 'collapsed'
		const cls = String(element.className || '')
		if (/(is-focus|is-opened|is-active)/i.test(cls) && /select|dropdown|cascader/i.test(cls)) return 'expanded'
		return ''
	}

	function getElementRect(element) {
		const rect = element.getBoundingClientRect()
		return {
			left: Math.round(rect.left),
			top: Math.round(rect.top),
			width: Math.round(rect.width),
			height: Math.round(rect.height),
		}
	}

	function getSelectorHints(element) {
		const form = element.closest('form')
		return {
			id: shortText(element.id || '', 48),
			name: shortText(element.getAttribute('name') || '', 48),
			testId: shortText(element.getAttribute('data-testid') || '', 48),
			dataTest: shortText(element.getAttribute('data-test') || '', 48),
			dataCy: shortText(element.getAttribute('data-cy') || '', 48),
			formId: shortText(form?.id || '', 48),
			formName: shortText(form?.getAttribute?.('name') || '', 48),
		}
	}

	function getRelationHints(element) {
		if (!(element instanceof HTMLElement)) return ''
		const parts = []
		for (const name of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant']) {
			const value = String(element.getAttribute(name) || '').trim()
			if (value) parts.push(`${name}=${shortText(value, 28)}`)
		}
		const popup = String(element.getAttribute('aria-haspopup') || '').trim()
		if (popup) parts.push(`haspopup=${popup}`)
		return parts.join(',')
	}

	function getStateHints(element) {
		if (!(element instanceof HTMLElement)) return ''
		const parts = []
		for (const name of ['data-state', 'data-value', 'aria-current', 'aria-pressed', 'aria-disabled', 'disabled']) {
			if (name === 'disabled') {
				if (element.hasAttribute('disabled')) parts.push('disabled=true')
				continue
			}
			const value = String(element.getAttribute(name) || '').trim()
			if (value) parts.push(`${name}=${shortText(value, 24)}`)
		}
		return parts.join(',')
	}

	function getDomPath(element) {
		const parts = []
		let cursor = element
		while (cursor instanceof HTMLElement && cursor !== document.body && parts.length < 5) {
			const tag = cursor.tagName.toLowerCase()
			const id = cursor.id ? `#${cursor.id}` : ''
			const cls =
				!id && typeof cursor.className === 'string' && cursor.className
					? `.${cursor.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
					: ''
			parts.unshift(`${tag}${id}${cls}`)
			cursor = cursor.parentElement
		}
		return parts.join(' > ')
	}

	function computeElementConfidence({ element, editable, clickable, fieldType, actionIntent, label, text }) {
		let score = 0.35
		if (editable) score += 0.2
		if (clickable) score += 0.12
		if (fieldType || actionIntent) score += 0.18
		if (label && label !== '(empty)') score += 0.12
		if (text && text !== '(empty)') score += 0.05
		if (element.id || element.getAttribute('name') || element.getAttribute('data-testid')) score += 0.05
		if (hasInteractiveAriaState(element)) score += 0.05
		if (element.getAttribute('aria-controls') || element.getAttribute('aria-owns')) score += 0.04
		return Math.max(0.1, Math.min(0.99, Number(score.toFixed(2))))
	}

	g.NC_CONTENT_OBSERVER = { createPageObserver }
})(window)
