;(function (g) {
	function createPageObserver(options = {}) {
		const selectorMap = new Map()
		const visual = options.visual || null
		const semantics = g.NC_CONTENT_SEMANTICS || null
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
				const fieldSemantics = buildFieldSemantics(element)

				const lineKey = buildLineDedupeKey(element, tag, text)
				if (seenLineKeys.has(lineKey)) continue
				seenLineKeys.add(lineKey)

				selectorMap.set(idx, element)
				indexedElements.push({ index: idx, element })
				const snapshot = buildElementSnapshot(idx, element, tag, text, fieldSemantics)
				snapshot.signature = buildElementSignature(snapshot)
				snapshot.newSinceLastObservation = !previousElementSignatures.has(snapshot.signature)
				elements.push(snapshot)
				lines.push(formatElementLine(snapshot))
				idx += 1
				if (idx >= 240) break
			}
			previousElementSignatures = new Set(elements.map((item) => item.signature).filter(Boolean))
			const forms = buildFormGroups(elements)
			const actions = elements.filter((item) => item.clickable && !item.editable)
			const options = buildOptionCandidates(elements)
			const popups = buildPopupCandidates(elements)
			const panels = buildPanelCandidates(elements)
			const candidateDiagnostics = buildCandidateDiagnostics(indexedElements)
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
				options,
				popups,
				panels,
				candidateDiagnostics,
				elements,
				treeCandidates,
				simplifiedDom,
				rawCandidates,
				content: formatObservationText({
					forms,
					actions,
					options,
					popups,
					panels,
					candidateDiagnostics,
					treeCandidates,
					simplifiedDom,
					rawCandidates,
				}),
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
			if (!(element instanceof HTMLElement)) return null
			if (semantics?.resolveEditableTarget) {
				const resolved = semantics.resolveEditableTarget(element)
				if (resolved instanceof HTMLElement) return resolved
			}
			if (isEditableElement(element)) {
				return element
			}
			const nested = element.querySelector('input, textarea, [contenteditable="true"]')
			if (nested instanceof HTMLElement && isEditableElement(nested)) return nested
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
			'.el-select-v2',
			'.el-select__wrapper',
			'.el-select__tags',
			'.el-select__input',
			'.el-input',
			'.el-input--suffix',
			'.el-input__suffix',
			'.el-input__prefix',
			'.el-select-dropdown__item',
			'.el-cascader',
			'.el-date-editor',
			'.el-cascader-node',
			'.el-cascader-node__label',
			'.el-checkbox',
			'.el-radio',
			'.el-tree-node__content',
			'.ant-select',
			'.ant-select-item-option',
			'.ant-cascader-picker',
			'.ant-cascader-menu-item',
			'.ant-picker',
			'.ant-checkbox-wrapper',
			'.ant-radio-wrapper',
			'.arco-select',
			'.arco-select-option',
			'.arco-picker',
			'.arco-checkbox',
			'.n-base-selection',
			'.n-base-select-option',
			'.n-date-picker',
			'.n-checkbox',
			'.avue-select',
			'.avue-cascader',
			'.avue-date',
			'.avue-time',
		].join(',')

		const extraSelector = [
			'div',
			'span',
			'label',
			'li',
			'p',
			'strong',
			'i',
			'svg',
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
			const text = getElementText(node)
			const maybeButtonLikeClass = /(btn|button|login|register|signup|signin|forgot|submit|dropdown|select|cascader|picker|date-editor|input--suffix|checkbox|radio)/i.test(cls)
			if (
				maybeButtonLikeClass ||
				hasPointerCursor(node) ||
				hasInlineEventHandler(node) ||
				(isCommonCrudActionText(text) && isLikelyTextActionContext(node))
			) {
				addCandidate(node)
			}
		}

		return compactInteractiveCandidates(result)
	}

	function normalizeInteractiveElement(element) {
		if (!(element instanceof HTMLElement)) return null
		const composite = getCompositeFieldContainer(element)
		if (composite instanceof HTMLElement) return composite
		const semantic = element.closest(
			'button,a,input,textarea,select,summary,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[role="combobox"],[role="option"],[role="checkbox"],[role="radio"],[aria-selected],[aria-checked],[aria-expanded],[aria-haspopup],[onclick],[contenteditable="true"],.el-select,.el-select-v2,.el-select__wrapper,.el-select__tags,.el-select__input,.el-input,.el-input--suffix,.el-input__suffix,.el-input__prefix,.el-select-dropdown__item,.el-cascader,.el-date-editor,.el-cascader-node,.el-checkbox,.el-radio,.el-tree-node__content,.ant-select,.ant-select-item-option,.ant-cascader-picker,.ant-cascader-menu-item,.ant-picker,.ant-checkbox-wrapper,.ant-radio-wrapper,.arco-select,.arco-select-option,.arco-picker,.n-base-selection,.n-base-select-option,.n-date-picker,.avue-select,.avue-cascader,.avue-date,.avue-time'
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
		if (isFieldLikeControl(element)) return true

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
		if (isCommonCrudActionText(text) && isLikelyTextActionContext(element) && area > 8 && area <= 16000 && element.childElementCount <= 4) return true
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
		if (shouldKeepNestedNavigationCandidate(parent, child)) return true
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

	function shouldKeepNestedNavigationCandidate(parent, child) {
		if (!(parent instanceof HTMLElement) || !(child instanceof HTMLElement)) return false
		if (!isNavigationLikeCandidate(parent) || !isNavigationLikeCandidate(child)) return false
		const parentText = getElementText(parent)
		const childText = getElementText(child)
		const parentKey = normalizeCompactText(parentText)
		const childKey = normalizeCompactText(childText)
		if (!parentKey || !childKey || parentKey === childKey) return false
		if (!parentKey.includes(childKey)) return false
		const parentRect = parent.getBoundingClientRect()
		const childRect = child.getBoundingClientRect()
		const parentArea = Math.max(0, parentRect.width) * Math.max(0, parentRect.height)
		const childArea = Math.max(0, childRect.width) * Math.max(0, childRect.height)
		if (parentArea > 0 && childArea > parentArea * 0.92) return false
		return true
	}

	function isNavigationLikeCandidate(element) {
		if (!(element instanceof HTMLElement)) return false
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const tag = element.tagName.toLowerCase()
		const cls = String(element.className || '')
		if (['menuitem', 'tab', 'link'].includes(role)) return true
		if (tag === 'a') return true
		return /(menu-item|submenu|nav-item|tab-|tabs__item|el-menu-item|el-submenu)/i.test(cls)
	}

	function normalizeCompactText(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
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
		const normalized = String(text).replace(/\s+/g, ' ').trim()
		if (normalized) return normalized
		return getIconSemanticLabel(element) || '(empty)'
	}

	function getIconSemanticLabel(element) {
		if (!(element instanceof HTMLElement)) return ''
		const iconText = getIconClassText(element)
		if (!iconText) return ''
		if (/search|el-icon-search|icon-search|fa-search|magnify/i.test(iconText)) {
			return isCrudSearchToggle(element) ? '展开搜索' : '搜索'
		}
		if (/refresh|reload|el-icon-refresh|icon-refresh/i.test(iconText)) return '刷新'
		if (/s-operation|setting|settings|column|columns|el-icon-setting/i.test(iconText)) return '列设置'
		if (/plus|add|el-icon-plus|icon-plus/i.test(iconText)) return '新增'
		if (/delete|trash|remove|el-icon-delete|icon-delete/i.test(iconText)) return '删除'
		if (/edit|el-icon-edit|icon-edit/i.test(iconText)) return '编辑'
		if (/view|eye|el-icon-view|icon-view/i.test(iconText)) return '查看'
		if (/download|el-icon-download|icon-download/i.test(iconText)) return '下载'
		if (/upload|el-icon-upload|icon-upload/i.test(iconText)) return '上传'
		if (/close|el-icon-close|icon-close/i.test(iconText)) return '关闭'
		if (/arrow-(up|down)|caret|dropdown/i.test(iconText)) return '展开选项'
		return ''
	}

	function getIconClassText(element) {
		if (!(element instanceof HTMLElement)) return ''
		const nodes = [element]
		try {
			nodes.push(...Array.from(element.querySelectorAll('i,svg,use,[class*="icon"],[class*="Icon"]')).slice(0, 8))
		} catch (_) {}
		return nodes
			.map((node) => {
				if (!(node instanceof Element)) return ''
				return [
					node.getAttribute('class') || '',
					node.getAttribute('aria-label') || '',
					node.getAttribute('title') || '',
					node.getAttribute('href') || '',
					node.getAttribute('xlink:href') || '',
				].join(' ')
			})
			.join(' ')
	}

	function isCrudSearchToggle(element) {
		if (!(element instanceof HTMLElement)) return false
		return !!element.closest('.avue-crud__right,[class*="crud__right"],[class*="crud-right"]')
	}

	function shortText(value, maxLen) {
		const text = String(value || '')
		return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`
	}

	function getFieldLabel(element) {
		return buildFieldSemantics(element).primary || ''
	}

	function buildFieldSemantics(element) {
		if (!(element instanceof HTMLElement) || !canHaveFieldSemantics(element)) {
			return emptyFieldSemantics()
		}
		const control = getPrimaryFieldControl(element) || element
		const candidates = collectLabelEvidence(element, control)
		const ranked = rankLabelCandidates(candidates)
		const primary = ranked[0] || null
		return {
			primary: primary?.text || '',
			source: primary?.source || '',
			confidence: primary ? Number(primary.confidence.toFixed(2)) : 0,
			aliases: ranked.slice(1, 5).map((item) => item.text),
			container: inferFieldContainerName(element),
		}
	}

	function emptyFieldSemantics() {
		return { primary: '', source: '', confidence: 0, aliases: [], container: '' }
	}

	function canHaveFieldSemantics(element) {
		if (!(element instanceof HTMLElement)) return false
		const tag = element.tagName.toLowerCase()
		if (['input', 'textarea', 'select'].includes(tag)) return true
		if (isFieldLikeControl(element)) return true
		return !!element.querySelector?.(
			'input, textarea, select, [role="combobox"], .el-select, .el-select-v2, .el-select__wrapper, .el-cascader, .el-date-editor, .el-input--suffix, .ant-select, .ant-cascader-picker, .ant-picker, .arco-select, .arco-cascader, .arco-picker, .n-base-selection, .n-date-picker, .avue-select, .avue-cascader, .avue-date, .avue-time'
		)
	}

	function getPrimaryFieldControl(element) {
		if (!(element instanceof HTMLElement)) return null
		if (
			element instanceof HTMLInputElement ||
			element instanceof HTMLTextAreaElement ||
			element instanceof HTMLSelectElement
		) {
			return element
		}
		const nested = element.querySelector(
			'input, textarea, select, [role="combobox"], .el-select, .el-select-v2, .el-select__wrapper, .el-cascader, .el-date-editor, .el-input--suffix, .ant-select, .ant-cascader-picker, .ant-picker, .arco-select, .arco-cascader, .arco-picker, .n-base-selection, .n-date-picker, .avue-select, .avue-cascader, .avue-date, .avue-time'
		)
		return nested instanceof HTMLElement ? nested : null
	}

	function collectLabelEvidence(element, control) {
		const list = []
		const target = control instanceof HTMLElement ? control : element

		pushLabelCandidate(list, target.getAttribute('aria-label'), 'aria-label', 0.94)
		for (const text of readIdRefTexts(target, 'aria-labelledby')) {
			pushLabelCandidate(list, text, 'aria-labelledby', 0.97)
		}
		for (const text of readNativeLabelTexts(target)) {
			pushLabelCandidate(list, text, 'native-label', 0.98)
		}
		pushLabelCandidate(list, readLabelForText(target), 'label-for', 0.95)

		const wrappedLabel = target.closest?.('label') || element.closest?.('label')
		if (wrappedLabel instanceof HTMLElement) {
			pushLabelCandidate(list, getElementText(wrappedLabel), 'wrapped-label', 0.92)
		}

		const framework = readFrameworkFormLabel(element)
		if (framework) pushLabelCandidate(list, framework, 'form-item-label', 0.96)

		const spatial = readSpatialLabel(element)
		if (spatial) pushLabelCandidate(list, spatial.text, spatial.source, spatial.confidence)

		pushLabelCandidate(list, target.getAttribute('placeholder'), 'placeholder', 0.72)
		pushLabelCandidate(list, element.getAttribute('placeholder'), 'placeholder', 0.7)
		pushLabelCandidate(list, target.getAttribute('name'), 'name', 0.5)
		pushLabelCandidate(list, target.id, 'id', 0.48)
		pushLabelCandidate(list, element.getAttribute('data-label'), 'data-label', 0.86)
		pushLabelCandidate(list, element.getAttribute('data-name'), 'data-name', 0.62)
		return list
	}

	function pushLabelCandidate(list, raw, source, confidence) {
		const text = cleanLabelText(raw)
		if (!text || text === '(empty)') return
		list.push({ text: shortText(text, 48), source, confidence })
	}

	function cleanLabelText(value) {
		let text = String(value || '').replace(/\s+/g, ' ').trim()
		if (!text) return ''
		text = text.replace(/^[*＊]\s*/, '').replace(/\s*[*＊]$/, '')
		text = text.replace(/[:：]\s*$/, '').trim()
		const promptless = text.replace(/^(请输入|请选择|请填写|请录入|输入|选择)\s*/i, '').trim()
		if (promptless) text = promptless
		return text
	}

	function readNativeLabelTexts(element) {
		const labels = element?.labels
		if (!labels || typeof labels.length !== 'number') return []
		return Array.from(labels)
			.map((label) => (label instanceof HTMLElement ? getElementText(label) : ''))
			.filter(Boolean)
	}

	function readLabelForText(element) {
		const id = String(element?.id || '').trim()
		if (!id) return ''
		try {
			const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
			return label instanceof HTMLElement ? getElementText(label) : ''
		} catch (_) {
			return ''
		}
	}

	function readFrameworkFormLabel(element) {
		if (!(element instanceof HTMLElement)) return ''
		const formItem = element.closest(
			'.el-form-item,.ant-form-item,.arco-form-item,.n-form-item,.avue-form__row,.form-item,[class*="form-item"]'
		)
		if (!(formItem instanceof HTMLElement)) return ''
		const selectors = [
			'.el-form-item__label',
			'.ant-form-item-label label',
			'.arco-form-item-label',
			'.n-form-item-label',
			'label',
			'[class*="form-label"]',
			'[class*="field-label"]',
		].join(',')
		const label = formItem.querySelector(selectors)
		return label instanceof HTMLElement ? getElementText(label) : ''
	}

	function readSpatialLabel(element) {
		if (!(element instanceof HTMLElement)) return null
		const root =
			element.closest('form,.el-form,.ant-form,.arco-form,.n-form,.avue-form,.el-card__body,[role="dialog"]') ||
			element.parentElement
		if (!(root instanceof HTMLElement)) return null
		const targetRect = element.getBoundingClientRect()
		const nodes = Array.from(root.querySelectorAll('label,span,div,p,strong')).slice(0, 120)
		let best = null
		for (const node of nodes) {
			if (!(node instanceof HTMLElement)) continue
			if (node === element || node.contains(element) || element.contains(node)) continue
			if (node.querySelector('input,textarea,select,button,[role="button"]')) continue
			const text = cleanLabelText(getElementText(node))
			if (!text || text.length > 40 || isLikelyCounterText(text)) continue
			const rect = node.getBoundingClientRect()
			if (rect.width < 2 || rect.height < 2) continue
			const sameRow = rect.bottom >= targetRect.top - 8 && rect.top <= targetRect.bottom + 8
			const above = rect.bottom <= targetRect.top && targetRect.top - rect.bottom <= 36
			const left = rect.right <= targetRect.left + 8 && targetRect.left - rect.right <= 180
			if (!((sameRow && left) || above)) continue
			const distance = Math.abs(rect.top - targetRect.top) + Math.max(0, targetRect.left - rect.right)
			const score = (sameRow && left ? 0.78 : 0.7) - Math.min(distance / 1000, 0.2)
			if (!best || score > best.confidence) {
				best = { text, source: sameRow && left ? 'spatial-left' : 'spatial-above', confidence: score }
			}
		}
		return best
	}

	function rankLabelCandidates(candidates) {
		const byText = new Map()
		for (const item of candidates) {
			const text = cleanLabelText(item?.text)
			if (!text) continue
			const existing = byText.get(text)
			if (!existing || Number(item.confidence || 0) > existing.confidence) {
				byText.set(text, { text, source: item.source || 'unknown', confidence: Number(item.confidence || 0) })
			}
		}
		const values = Array.from(byText.values())
		const hasSpecificLabel = values.some((item) => !isGenericFieldLabelText(item.text))
		return values
			.map((item) => hasSpecificLabel && isGenericFieldLabelText(item.text)
				? { ...item, confidence: item.confidence - 0.5 }
				: item)
			.sort((a, b) => b.confidence - a.confidence || a.text.length - b.text.length)
	}

	function isGenericFieldLabelText(text) {
		const normalized = String(text || '').replace(/\s+/g, '').trim().toLowerCase()
		if (!normalized) return true
		return [
			'(empty)',
			'empty',
			'展开选项',
			'展开',
			'选项',
			'请选择',
			'请输入',
			'选择',
			'输入',
			'更多',
		].includes(normalized)
	}

	function inferFieldContainerName(element) {
		if (!(element instanceof HTMLElement)) return ''
		if (element.closest('.avue-crud__search,[class*="crud__search"]')) return '搜索/筛选区域'
		if (element.closest('[role="dialog"],[aria-modal="true"],dialog,.el-dialog,.ant-modal,.n-modal')) return '弹层'
		if (element.closest('.el-pagination,.ant-pagination,.pagination,[class*="pagination"]')) return '分页器'
		if (element.closest('header,.topbar,.navbar,.layout-header,[class*="topbar"],[class*="navbar"]')) return '全局页头'
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

	function isCommonCrudActionText(text) {
		const value = normalizeCompactText(text)
		if (!value || value.length > 18) return false
		return /^(详情|明细|查看|预览|编辑|修改|删除|移除|推送|指派|释放|分配|启用|禁用|保存|提交|确定|确认|取消|关闭|导入|导出|上传|下载|复制|detail|details|view|preview|edit|modify|delete|remove|push|assign|release|enable|disable|save|submit|confirm|ok|cancel|close|import|export|upload|download|copy)$/.test(value)
	}

	function isActionProbeText(text) {
		const value = normalizeCompactText(text)
		if (!value || value.length > 18) return false
		return isCommonCrudActionText(value) || /^(新增|新建|添加|创建|add|new|create)$/.test(value)
	}

	function isLikelyTextActionContext(element) {
		if (!(element instanceof HTMLElement)) return false
		const tag = element.tagName.toLowerCase()
		const role = String(element.getAttribute('role') || '').toLowerCase()
		if (['button', 'a'].includes(tag) || ['button', 'link', 'menuitem'].includes(role)) return true
		if (hasPointerCursor(element) || hasInlineEventHandler(element)) return true
		const clsText = [
			element.className || '',
			element.parentElement?.className || '',
			element.closest?.('[class]')?.className || '',
		].join(' ')
		if (/(operation|operate|action|actions|toolbar|tools|crud|btn|button|link|table|cell|column)/i.test(clsText)) return true
		const tableCell = element.closest?.('td,th,.el-table__cell,.ant-table-cell,.vxe-cell,.ag-cell,[class*="table-cell"],[class*="table__cell"]')
		return tableCell instanceof HTMLElement
	}

	function buildCandidateDiagnostics(indexedElements) {
		const indexedSet = new Set((Array.isArray(indexedElements) ? indexedElements : [])
			.map((item) => item?.element)
			.filter(Boolean))
		const probes = []
		const seen = new Set()
		const selector = [
			'button',
			'a',
			'span',
			'div',
			'i',
			'svg',
			'[role="button"]',
			'[role="link"]',
			'[role="menuitem"]',
			'[onclick]',
			'[tabindex]',
		].join(',')
		for (const node of Array.from(document.querySelectorAll(selector)).slice(0, 900)) {
			if (!(node instanceof HTMLElement)) continue
			if (node.closest('#naturalclick-right-dock-host')) continue
			if (node.hasAttribute('data-naturalclick-ignore')) continue
			const text = getElementText(node)
			if (!isActionProbeText(text)) continue
			const normalized = normalizeInteractiveElement(node)
			const target = normalized instanceof HTMLElement ? normalized : node
			if (!isElementVisibleForDiagnostics(target)) continue
			const key = `${target.tagName}:${getElementText(target)}:${getDomPath(target)}`
			if (seen.has(key)) continue
			seen.add(key)
			const indexed = indexedSet.has(target) || indexedSet.has(node) || Array.from(indexedSet).some((item) =>
				item instanceof HTMLElement && (item.contains(target) || target.contains(item))
			)
			const rect = target.getBoundingClientRect()
			const style = window.getComputedStyle(target)
			probes.push({
				text: shortText(getElementText(target), 28),
				sourceText: shortText(text, 28),
				tag: target.tagName.toLowerCase(),
				sourceTag: node.tagName.toLowerCase(),
				role: shortText(target.getAttribute('role') || '', 24),
				className: shortText(String(target.className || '').replace(/\s+/g, ' '), 80),
				parentClassName: shortText(String(target.parentElement?.className || '').replace(/\s+/g, ' '), 80),
				cursor: String(style.cursor || ''),
				actionContext: isLikelyTextActionContext(target),
				pointer: hasPointerCursor(target),
				inlineHandler: hasInlineEventHandler(target),
				indexed,
				rect: {
					left: Math.round(rect.left),
					top: Math.round(rect.top),
					width: Math.round(rect.width),
					height: Math.round(rect.height),
				},
				html: shortText(String(target.outerHTML || '').replace(/\s+/g, ' '), 220),
			})
		}
		const unindexed = probes.filter((item) => !item.indexed)
		return {
			textActionProbeCount: probes.length,
			indexedTextActionProbeCount: probes.length - unindexed.length,
			unindexedTextActionProbeCount: unindexed.length,
			unindexedTextActionProbes: unindexed.slice(0, 30),
		}
	}

	function isElementVisibleForDiagnostics(element) {
		if (!(element instanceof HTMLElement)) return false
		const rect = element.getBoundingClientRect()
		if (rect.width < 2 || rect.height < 2) return false
		if (rect.bottom <= 0 || rect.right <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false
		const style = window.getComputedStyle(element)
		return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
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

	function inferElementRegion(element) {
		if (!(element instanceof HTMLElement)) return 'unknown'
		if (element.closest('[role="dialog"],[aria-modal="true"],dialog,.el-dialog,.el-drawer,.ant-modal,.ant-drawer,.arco-modal,.n-modal')) {
			return 'dialog'
		}
		if (
			element.closest(
				'.el-popper,.el-popover,.el-select-dropdown,.el-picker-panel,.el-cascader-panel,.el-dropdown-menu,.ant-select-dropdown,.ant-picker-dropdown,.ant-cascader-menus,.arco-trigger-popup,.n-popover,.n-dropdown-menu,[role="listbox"]'
			)
		) {
			return 'popover'
		}
		if (element.closest('.el-pagination,.ant-pagination,.arco-pagination,.n-pagination,.pagination,[class*="pagination"]')) {
			return 'pagination'
		}
		if (
			element.closest(
				'aside,.el-aside,.ant-layout-sider,.sidebar,.side-bar,.sider,.side-menu,.layout-aside,[class*="sidebar"],[class*="side-bar"],[class*="sider"],[class*="layout-aside"],[class*="left-menu"],[class*="nav-menu"],[role="navigation"]'
			)
		) {
			return 'sidebar'
		}
		if (
			element.closest(
				'header,.el-header,.ant-layout-header,.app-header,.layout-header,.topbar,.navbar,.nav-bar,[class~="header"],[class*="app-header"],[class*="layout-header"],[class*="topbar"],[class*="navbar"],[class*="nav-bar"]'
			)
		) {
			return 'header'
		}
		if (element.closest('main,[role="main"],.el-main,.ant-layout-content,.app-main,.page,.page-container,.content,.container,[class*="app-main"],[class*="page-container"],[class*="layout-content"]')) {
			return 'content'
		}

		const rect = element.getBoundingClientRect()
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const path = getDomPath(element).toLowerCase()
		const sidebarWidth = Math.min(280, Math.max(180, window.innerWidth * 0.24))
		if (rect.left >= 0 && rect.left < sidebarWidth && /(menu|nav|aside|sidebar|sider)/i.test(`${path} ${role}`)) {
			return 'sidebar'
		}
		if (/pagination|pager|page-size|page-jump/i.test(path)) return 'pagination'
		const headerHeight = Math.min(112, Math.max(64, window.innerHeight * 0.16))
		if (rect.top >= 0 && rect.top < headerHeight && rect.height <= 84) return 'header'
		return 'content'
	}

	function buildElementSnapshot(index, element, tag, text, fieldSemantics) {
		const role = getElementRole(element, tag)
		const type = String(element.getAttribute('type') || '').toLowerCase()
		const semantic = fieldSemantics || emptyFieldSemantics()
		const label = semantic.primary || getElementAccessibleName(element)
		const placeholder = String(element.getAttribute('placeholder') || '').trim()
		const editable = isEditableElement(element)
		const clickable = isClickableElement(element)
		const fieldLike = editable || isFieldLikeControl(element)
		const labelContext = `${label} ${(semantic.aliases || []).join(' ')}`
		const fieldType = fieldLike ? inferFieldType({ label: labelContext, placeholder, text, type, role }) : ''
		const actionIntent =
			!editable && clickable && !fieldType
				? inferActionIntent({ label, text, role, type, element })
				: ''
		const region = inferElementRegion(element)
		const valueState = getValueState(element)
		const selectionControl = getSelectionControlType(element)
		const relationHints = getRelationHints(element)
		const popupHints = getPopupContainerHints(element)
		const navigationTarget = getNavigationTargetHint(element)
		const snapshot = {
			index,
			stableId: '',
			tag,
			role,
			type,
			label: shortText(label, 48),
			labelSource: semantic.source || '',
			labelConfidence: semantic.confidence || 0,
			aliases: Array.isArray(semantic.aliases) ? semantic.aliases.slice(0, 5).map((item) => shortText(item, 40)) : [],
			semanticContainer: semantic.container || '',
			placeholder: shortText(placeholder, 48),
			text: shortText(text, 80),
			fieldType,
			actionIntent,
			region,
			valueState,
			selectionControl,
			expandedState: getExpandedState(element),
			stateHints: getStateHints(element),
			relationHints,
			popupHints,
			navigationTarget,
			optionLabels: getNativeOptionLabels(element),
			editable,
			clickable,
			required: isRequiredFieldControl(element),
			rect: getElementRect(element),
			selectorHints: getSelectorHints(element),
			domPath: shortText(getDomPath(element), 120),
			confidence: computeElementConfidence({ element, editable, clickable, fieldType, actionIntent, label, text }),
		}
		snapshot.controlKind = getObservedControlKind(snapshot)
		snapshot.stableId = buildStableElementId(snapshot)
		return snapshot
	}

	function isRequiredFieldControl(element) {
		if (!(element instanceof HTMLElement)) return false
		if (element.hasAttribute('required') || element.getAttribute('aria-required') === 'true') return true
		const formItem = element.closest?.('.el-form-item,.ant-form-item,.arco-form-item,.n-form-item,.avue-form__row,.form-item,[class*="form-item"]')
		if (formItem instanceof HTMLElement) {
			const cls = String(formItem.className || '')
			if (/(^|\s)(is-required|required)(\s|$)/i.test(cls)) return true
			const label = formItem.querySelector?.('.el-form-item__label,.ant-form-item-label label,.arco-form-item-label,.n-form-item-label,label,[class*="form-label"],[class*="field-label"]')
			if (label instanceof HTMLElement) {
				const labelText = String(label.innerText || label.textContent || '').trim()
				if (/^[*＊]/.test(labelText) || /[*＊]\s*$/.test(labelText)) return true
				const before = window.getComputedStyle(label, '::before')?.content || ''
				if (/[*＊]/.test(before)) return true
			}
		}
		return false
	}

	function getObservedControlKind(item) {
		const descriptor = g.NC_CONTROL_SEMANTICS?.describeObservedControl?.(item, '')
		const kind = String(descriptor?.kind || '').trim()
		return kind && kind !== 'unknown' ? kind : ''
	}

	function formatElementLine(item) {
		const attrs = []
		if (item.stableId) attrs.push(`sid="${item.stableId}"`)
		if (item.role) attrs.push(`role="${item.role}"`)
		if (item.type) attrs.push(`type="${item.type}"`)
		if (item.label) attrs.push(`label="${shortText(item.label, 24)}"`)
		if (item.labelSource) attrs.push(`labelSource="${item.labelSource}"`)
		if (item.labelConfidence) attrs.push(`labelConf="${item.labelConfidence}"`)
		if (Array.isArray(item.aliases) && item.aliases.length) attrs.push(`aliases="${shortText(item.aliases.join('|'), 48)}"`)
		if (item.semanticContainer) attrs.push(`container="${shortText(item.semanticContainer, 24)}"`)
		if (item.placeholder) attrs.push(`placeholder="${shortText(item.placeholder, 24)}"`)
		if (item.fieldType) attrs.push(`fieldType="${item.fieldType}"`)
		if (item.actionIntent) attrs.push(`intent="${item.actionIntent}"`)
		if (item.region) attrs.push(`region="${item.region}"`)
		if (item.valueState && item.valueState !== 'unknown') attrs.push(`value="${item.valueState}"`)
		if (item.controlKind) attrs.push(`kind="${item.controlKind}"`)
		if (item.selectionControl) attrs.push(`control="${item.selectionControl}"`)
		if (Array.isArray(item.optionLabels) && item.optionLabels.length) attrs.push(`options="${shortText(item.optionLabels.join('|'), 96)}"`)
		if (item.expandedState) attrs.push(`expanded="${item.expandedState}"`)
		if (item.stateHints) attrs.push(`state="${shortText(item.stateHints, 28)}"`)
		if (item.relationHints) attrs.push(`rel="${shortText(item.relationHints, 36)}"`)
		if (item.navigationTarget) attrs.push(`target="${shortText(item.navigationTarget, 48)}"`)
		if (item.popupHints) attrs.push(`popup="${shortText(item.popupHints, 96)}"`)
		if (item.newSinceLastObservation) attrs.push('new="true"')
		if (item.required) attrs.push('required="true"')
		attrs.push(`conf="${item.confidence}"`)
		return `[${item.index}]<${item.tag} ${attrs.join(' ')}>${shortText(item.text, 80)}</${item.tag}>`
	}

	function formatObservationText({ forms, actions, options, popups, panels, candidateDiagnostics, treeCandidates, simplifiedDom, rawCandidates }) {
		const sections = []
		if (Array.isArray(panels) && panels.length) {
			sections.push('<panels>')
			for (const panel of panels.slice(0, 12)) {
				sections.push(formatPanelLine(panel))
			}
			sections.push('</panels>')
		}
		if (forms.length) {
			sections.push('<forms>')
			for (const form of forms) {
				sections.push(`form ${form.id}: ${form.name}`)
				for (const field of form.fields) {
					sections.push(
						`  field index=${field.index} region=${field.region || '-'} fieldType=${field.fieldType || 'unknown'} kind=${field.controlKind || '-'} label="${field.label || field.placeholder || field.text}" source=${field.labelSource || '-'} conf=${field.labelConfidence || '-'} aliases="${(field.aliases || []).join('|')}" container="${field.semanticContainer || '-'}" value=${field.valueState} type=${field.type || '-'} role=${field.role || '-'} control=${field.selectionControl || '-'} options="${Array.isArray(field.optionLabels) ? field.optionLabels.join('|') : ''}" expanded=${field.expandedState || '-'}`
					)
				}
			}
			sections.push('</forms>')
		}
		if (Array.isArray(popups) && popups.length) {
			sections.push('<popups>')
			for (const popup of popups.slice(0, 40)) {
				sections.push(formatOptionLine(popup, 'popup'))
			}
			sections.push('</popups>')
		}
		if (Array.isArray(options) && options.length) {
			sections.push('<options>')
			for (const option of options.slice(0, 80)) {
				sections.push(formatOptionLine(option, 'option'))
			}
			sections.push('</options>')
		}
		if (actions.length) {
			sections.push('<actions>')
			for (const action of actions.slice(0, 60)) {
				sections.push(
					`  action index=${action.index} region=${action.region || '-'} intent=${action.actionIntent || 'unknown'} kind=${action.controlKind || '-'} label="${action.label || action.text}" role=${action.role || '-'} value=${action.valueState || 'unknown'} control=${action.selectionControl || '-'} expanded=${action.expandedState || '-'}`
				)
			}
			sections.push('</actions>')
		}
		if (candidateDiagnostics && Number(candidateDiagnostics.textActionProbeCount || 0) > 0) {
			sections.push(formatCandidateDiagnostics(candidateDiagnostics))
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

	function formatCandidateDiagnostics(candidateDiagnostics) {
		const lines = [
			'<candidate_diagnostics>',
			`text_action_probes total=${Number(candidateDiagnostics.textActionProbeCount || 0)} indexed=${Number(candidateDiagnostics.indexedTextActionProbeCount || 0)} unindexed=${Number(candidateDiagnostics.unindexedTextActionProbeCount || 0)}`,
		]
		for (const probe of (Array.isArray(candidateDiagnostics.unindexedTextActionProbes) ? candidateDiagnostics.unindexedTextActionProbes : []).slice(0, 12)) {
			const rect = probe.rect || {}
			lines.push(
				`  unindexed text="${shortText(probe.text || '', 28)}" tag=${probe.tag || '-'} role=${probe.role || '-'} cursor=${probe.cursor || '-'} context=${probe.actionContext ? 'true' : 'false'} pointer=${probe.pointer ? 'true' : 'false'} rect=${Number(rect.left) || 0},${Number(rect.top) || 0},${Number(rect.width) || 0}x${Number(rect.height) || 0} class="${shortText(probe.className || '', 60)}" html="${shortText(probe.html || '', 140)}"`
			)
		}
		lines.push('</candidate_diagnostics>')
		return lines.join('\n')
	}

	function formatOptionLine(item, kind) {
		return `  ${kind} index=${item.index} sid=${item.stableId || '-'} region=${item.region || '-'} label="${item.label || item.text || ''}" role=${item.role || '-'} value=${item.valueState || 'unknown'} kind=${item.controlKind || '-'} control=${item.selectionControl || '-'} expanded=${item.expandedState || '-'}${item.popupHints ? ` popup="${shortText(item.popupHints, 96)}"` : ''}`
	}

	function formatPanelLine(panel) {
		const fields = Array.isArray(panel.fields) && panel.fields.length
			? ` fields="${panel.fields.slice(0, 12).join(',')}"`
			: ''
		const trigger = Number.isFinite(Number(panel.triggerIndex))
			? ` triggerIndex=${panel.triggerIndex} triggerLabel="${shortText(panel.triggerLabel || '', 32)}"`
			: ''
		return `  panel kind=${panel.kind || 'unknown'} region=${panel.region || '-'} state=${panel.state || 'unknown'} label="${shortText(panel.label || '', 40)}"${trigger}${fields}`
	}

	function buildSimplifiedDom(elements) {
		const sorted = [...elements].sort((a, b) => inferLayerPriority(a) - inferLayerPriority(b) || a.rect.top - b.rect.top || a.rect.left - b.rect.left)
		return sorted.map((item) => {
			const depth = Math.max(0, Math.min(3, inferTreeDepth(item)))
			const tag = getSemanticTagName(item)
			const attrs = [
				`index="${item.index}"`,
				item.stableId ? `sid="${item.stableId}"` : '',
				item.role ? `role="${item.role}"` : '',
				item.fieldType ? `fieldType="${item.fieldType}"` : '',
				item.actionIntent ? `intent="${item.actionIntent}"` : '',
				item.region ? `region="${item.region}"` : '',
				item.labelSource ? `labelSource="${item.labelSource}"` : '',
				item.labelConfidence ? `labelConf="${item.labelConfidence}"` : '',
				Array.isArray(item.aliases) && item.aliases.length ? `aliases="${shortText(item.aliases.join('|'), 64)}"` : '',
				item.semanticContainer ? `container="${shortText(item.semanticContainer, 32)}"` : '',
				item.controlKind ? `kind="${item.controlKind}"` : '',
				item.selectionControl ? `control="${item.selectionControl}"` : '',
				Array.isArray(item.optionLabels) && item.optionLabels.length ? `options="${shortText(item.optionLabels.join('|'), 96)}"` : '',
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
			if (Array.isArray(item.optionLabels) && item.optionLabels.length) flags.push(`options=${item.optionLabels.length}`)
			if (item.expandedState) flags.push(item.expandedState)
			const role = item.fieldType || item.actionIntent || item.role || item.tag
			const label = item.label || item.placeholder || item.text || ''
			const source = item.labelSource ? ` source=${item.labelSource}` : ''
			const aliases = Array.isArray(item.aliases) && item.aliases.length
				? ` aliases="${shortText(item.aliases.join('|'), 48)}"`
				: ''
			const indent = '  '.repeat(depth)
			return {
				index: item.index,
				line: `${indent}${marker}[${item.index}] ${role} region=${item.region || '-'} label="${shortText(label, 44)}"${source}${aliases} value=${item.valueState || 'unknown'} rect=${item.rect.left},${item.rect.top},${item.rect.width}x${item.rect.height}${flags.length ? ` flags=${flags.join('|')}` : ''}`,
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
		return /popper|popover|select-dropdown|picker-panel|cascader-panel|dropdown|listbox|select-option|cascader-option/i.test(text)
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
			item.labelSource,
			Array.isArray(item.aliases) ? item.aliases.join(',') : '',
			item.placeholder,
			item.text,
			item.fieldType,
			item.actionIntent,
			item.region,
			item.selectionControl,
			item.expandedState,
			item.stateHints,
			item.relationHints,
			item.popupHints,
			Math.round((item.rect?.left || 0) / 8),
			Math.round((item.rect?.top || 0) / 8),
			Math.round((item.rect?.width || 0) / 8),
			Math.round((item.rect?.height || 0) / 8),
		].join('|')
	}

	function buildStableElementId(item) {
		const hint = item.selectorHints || {}
		const primary = hint.testId || hint.dataTest || hint.dataCy || hint.id || hint.name || ''
		const label = item.label || item.placeholder || item.text || ''
		const material = [
			primary,
			item.role || item.tag || '',
			item.type || '',
			item.fieldType || item.actionIntent || item.selectionControl || '',
			item.region || '',
			label,
			item.labelSource || '',
			Math.round((item.rect?.left || 0) / 12),
			Math.round((item.rect?.top || 0) / 12),
		].join('|')
		return `e_${hashText(material)}`
	}

	function hashText(value) {
		let hash = 2166136261
		const text = String(value || '')
		for (let i = 0; i < text.length; i++) {
			hash ^= text.charCodeAt(i)
			hash = Math.imul(hash, 16777619)
		}
		return (hash >>> 0).toString(36)
	}

	function buildOptionCandidates(elements) {
		return elements
			.filter(
				(item) => {
					if (!item || typeof item !== 'object') return false
					if (item.selectionControl && item.selectionControl !== 'dropdown') return true
					if (['option', 'treeitem', 'checkbox', 'radio'].includes(item.role)) return true
					if (item.role === 'menuitem') return ['popover', 'dialog'].includes(item.region)
					return item.actionIntent === 'select_option' || item.actionIntent === 'toggle_option'
				}
			)
			.sort((a, b) => inferLayerPriority(a) - inferLayerPriority(b) || a.rect.top - b.rect.top || a.rect.left - b.rect.left)
	}

	function buildPopupCandidates(elements) {
		return elements
			.filter(
				(item) =>
					isLikelyPopupItem(item) ||
					(item.newSinceLastObservation &&
						(item.selectionControl ||
							['option', 'menuitem', 'treeitem', 'checkbox', 'radio'].includes(item.role)))
			)
			.sort((a, b) => inferLayerPriority(a) - inferLayerPriority(b) || a.rect.top - b.rect.top || a.rect.left - b.rect.left)
	}

	function buildPanelCandidates(elements) {
		const panelSelector = [
			'.avue-crud__search',
			'[class*="crud__search"]',
			'[class*="search-panel"]',
			'[class*="search-form"]',
			'[class*="filter-panel"]',
			'[class*="filter-form"]',
			'[class*="query-panel"]',
			'[class*="query-form"]',
		].join(',')
		let nodes = []
		try {
			nodes = Array.from(document.querySelectorAll(panelSelector))
		} catch (_) {
			nodes = []
		}
		const seen = new Set()
		const panels = []
		for (const node of nodes) {
			if (!(node instanceof HTMLElement)) continue
			if (seen.has(node)) continue
			seen.add(node)
			const fields = collectPanelFieldLabels(node)
			const trigger = findPanelTrigger(elements, node)
			panels.push({
				kind: 'filter',
				region: inferPanelRegion(node, trigger),
				state: isElementActuallyVisible(node) ? 'expanded' : 'collapsed',
				label: inferPanelLabel(node),
				triggerIndex: trigger?.index,
				triggerLabel: trigger?.label || trigger?.text || '',
				fields,
			})
		}
		return panels.sort((a, b) => {
			if (a.state !== b.state) return a.state === 'collapsed' ? -1 : 1
			return (a.triggerIndex ?? 9999) - (b.triggerIndex ?? 9999)
		})
	}

	function collectPanelFieldLabels(panel) {
		if (!(panel instanceof HTMLElement)) return []
		let controls = []
		try {
			controls = Array.from(
				panel.querySelectorAll(
					'input, textarea, select, [role="combobox"], .el-select, .el-select-v2, .el-select__wrapper, .el-cascader, .el-date-editor, .el-input--suffix, .ant-select, .ant-cascader-picker, .ant-picker, .arco-select, .arco-cascader, .arco-picker, .n-base-selection, .n-date-picker, .avue-select, .avue-cascader, .avue-date, .avue-time'
				)
			)
		} catch (_) {
			controls = []
		}
		const labels = []
		const seen = new Set()
		for (const control of controls) {
			if (!(control instanceof HTMLElement)) continue
			if (isOptionLike(control) || isSelectableControl(control)) continue
			const semantics = buildFieldSemantics(control)
			const label = semantics.primary || getElementAccessibleName(control) || getElementText(control)
			const normalized = String(label || '').replace(/[:：]\s*$/, '').trim()
			if (!normalized || normalized === '(empty)' || seen.has(normalized)) continue
			seen.add(normalized)
			labels.push(shortText(normalized, 32))
			if (labels.length >= 16) break
		}
		return labels
	}

	function findPanelTrigger(elements, panel) {
		const region = inferElementRegion(panel)
		const requireSameRegion = isElementActuallyVisible(panel) && region && region !== 'unknown'
		const candidates = elements
			.filter((item) => {
				if (!item || typeof item !== 'object') return false
				if (!['open_filter', 'search'].includes(item.actionIntent)) return false
				if (requireSameRegion && item.region && item.region !== region) return false
				return true
			})
			.sort((a, b) => {
				const aOpen = a.actionIntent === 'open_filter' ? 0 : 1
				const bOpen = b.actionIntent === 'open_filter' ? 0 : 1
				return aOpen - bOpen || a.rect.top - b.rect.top || a.rect.left - b.rect.left
			})
		return candidates[0] || null
	}

	function inferPanelRegion(panel, trigger) {
		const triggerRegion = String(trigger?.region || '')
		if (['content', 'dialog', 'popover'].includes(triggerRegion)) return triggerRegion
		if (
			panel?.closest?.(
				'main,[role="main"],.el-main,.ant-layout-content,.app-main,.page,.page-container,.content,.container,[class*="app-main"],[class*="page-container"],[class*="layout-content"]'
			)
		) {
			return 'content'
		}
		return inferElementRegion(panel)
	}

	function inferPanelLabel(panel) {
		if (!(panel instanceof HTMLElement)) return ''
		const cls = String(panel.className || '')
		if (/search|filter|query|crud__search/i.test(cls)) return '搜索/筛选区域'
		const heading = panel.querySelector?.('legend,[role="heading"],.title,[class*="title"],.header,[class*="header"]')
		if (heading instanceof HTMLElement) {
			const text = getElementText(heading)
			if (text && text !== '(empty)') return text
		}
		return '面板'
	}

	function isElementActuallyVisible(element) {
		if (!(element instanceof HTMLElement)) return false
		const rect = element.getBoundingClientRect()
		if (rect.width < 2 || rect.height < 2) return false
		let cursor = element
		while (cursor instanceof HTMLElement) {
			const style = window.getComputedStyle(cursor)
			if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false
			cursor = cursor.parentElement
		}
		return true
	}

	function buildFormGroups(elements) {
		const fields = elements.filter((item) => isFormFieldSnapshot(item) && shouldExposeAsPageFormField(item))
		if (!fields.length) return []
		const groups = new Map()
		for (const field of fields) {
			const key = field.semanticContainer
				? `container_${hashText(field.semanticContainer)}`
				: field.selectorHints.formId || field.selectorHints.formName || 'page_form'
			if (!groups.has(key)) {
				groups.set(key, {
					id: key,
					name: field.semanticContainer || (key === 'page_form' ? inferPageFormName(elements) : key),
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

	function isFormFieldSnapshot(item) {
		if (!item || typeof item !== 'object') return false
		if (item.editable) return true
		if (item.fieldType) return true
		if (item.role === 'combobox') return true
		return item.tag === 'select'
	}

	function shouldExposeAsPageFormField(item) {
		const region = String(item?.region || '')
		if (!region) return true
		return !['header', 'sidebar', 'pagination'].includes(region)
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
		if (/状态|启用|禁用|status|state/.test(haystack)) return 'status'
		if (/类型|分类|类别|category|type/.test(haystack)) return 'category'
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
		const className = element instanceof HTMLElement ? String(element.className || '') : ''
		const iconText = getIconClassText(element)
		const extra = element instanceof HTMLElement
			? [
					element.getAttribute('title') || '',
					element.getAttribute('aria-label') || '',
					element.getAttribute('data-action') || '',
					element.getAttribute('data-testid') || '',
					element.getAttribute('data-test') || '',
					element.getAttribute('name') || '',
					element.id || '',
				].join(' ')
			: ''
		const haystack = `${label} ${text} ${role} ${type} ${className} ${iconText} ${extra}`.toLowerCase()
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
		if (/新增|新建|创建|添加|增加|add|create|new|plus|el-icon-plus|icon-plus/.test(haystack)) return 'create'
		if (isCrudSearchToggle(element) && /搜索|search|el-icon-search|icon-search|fa-search|magnify/.test(haystack)) {
			return 'open_filter'
		}
		if (/高级搜索|更多条件|查询条件|筛选条件|过滤条件|展开搜索|展开查询|展开筛选|open.*filter|more.*filter|advanced.*search/.test(haystack)) {
			return 'open_filter'
		}
		if (/查询|搜索|筛选|过滤|search|query|filter/.test(haystack)) return 'search'
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
			if (isDropdownLikeControl(element)) return 'combobox'
			return 'textbox'
		}
		if (tag === 'textarea') return 'textbox'
		if (tag === 'select') return 'combobox'
		if (isDropdownLikeControl(element)) return 'combobox'
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
		const labelledBy = readIdRefText(element, 'aria-labelledby')
		if (labelledBy) return labelledBy
		const title = String(element.getAttribute('title') || '').trim()
		if (title) return title
		const dataLabel = String(
			element.getAttribute('data-label') ||
				element.getAttribute('data-title') ||
				element.getAttribute('data-name') ||
				''
		).trim()
		if (dataLabel) return dataLabel
		if (isFieldLikeControl(element)) {
			const fieldLabel = getFieldLabel(element)
			if (fieldLabel) return fieldLabel
		}
		const nestedField = element.querySelector?.('input, textarea, select')
		if (nestedField instanceof HTMLElement) {
			const nestedLabel = getFieldLabel(nestedField)
			if (nestedLabel) return nestedLabel
			const nestedPlaceholder = String(nestedField.getAttribute('placeholder') || '').trim()
			if (nestedPlaceholder) return nestedPlaceholder
		}
		return getElementText(element) === '(empty)' ? '' : getElementText(element)
	}

	function readIdRefText(element, attrName) {
		return readIdRefTexts(element, attrName)[0] || ''
	}

	function readIdRefTexts(element, attrName) {
		const refs = String(element.getAttribute(attrName) || '').trim()
		if (!refs) return []
		const values = []
		for (const id of refs.split(/\s+/).filter(Boolean)) {
			const node = document.getElementById(id)
			const text = node instanceof HTMLElement ? getElementText(node) : ''
			if (text && text !== '(empty)') values.push(text)
		}
		return values
	}

	function isFieldLikeControl(element) {
		if (!(element instanceof HTMLElement)) return false
		if (element instanceof HTMLSelectElement) return true
		const role = String(element.getAttribute('role') || '').toLowerCase()
		if (role === 'combobox') return true
		if (isOptionLike(element) || isSelectableControl(element)) return false
		if (isDropdownLikeControl(element)) return true
		return isCompositeFieldControl(element)
	}

	function isCompositeFieldControl(element) {
		return getCompositeFieldContainer(element) === element
	}

	function getCompositeFieldContainer(element) {
		if (!(element instanceof HTMLElement)) return null
		if (g.NC_CONTENT_SEMANTICS?.getCompositeFieldContainer) {
			return g.NC_CONTENT_SEMANTICS.getCompositeFieldContainer(element)
		}
		if (
			element.closest?.(
				'.el-select-dropdown,.el-select__popper,.el-cascader-panel,.el-picker-panel,.el-dropdown-menu,.ant-select-dropdown,.ant-cascader-menus,.ant-picker-dropdown,.arco-trigger-popup,.n-dropdown-menu,[role="listbox"]'
			)
		) {
			return null
		}
		const selector = [
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
		const node = element.closest?.(selector)
		if (!(node instanceof HTMLElement)) return null
		if (node !== element && (isOptionLike(element) || isSelectableControl(element))) return null
		if (/(^|\s)(el-input--suffix|input--suffix)(\s|$)/i.test(String(node.className || ''))) {
			const input = node.querySelector?.('input, textarea, [role="combobox"]')
			const placeholder = String(input?.getAttribute?.('placeholder') || node.getAttribute('placeholder') || '')
			const role = String(input?.getAttribute?.('role') || '').toLowerCase()
			const readonly =
				input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
					? input.readOnly || String(input.getAttribute('readonly') || '').trim() !== ''
					: false
			if (role !== 'combobox' && !readonly && !/(请选择|选择|select|choose|pick)/i.test(placeholder)) return null
		}
		if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
			const cls = String(node.className || '')
			if (!/(select|cascader|picker|combobox)/i.test(cls)) return null
		}
		return node
	}

	function isDropdownLikeControl(element) {
		if (!(element instanceof HTMLElement)) return false
		if (g.NC_CONTENT_SEMANTICS?.isDropdownLikeControl) {
			return g.NC_CONTENT_SEMANTICS.isDropdownLikeControl(element)
		}
		if (element instanceof HTMLSelectElement) return true
		if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
			const composite = getCompositeFieldContainer(element)
			return composite instanceof HTMLElement && composite !== element
		}
		const role = String(element.getAttribute('role') || '').toLowerCase()
		const cls = String(element.className || '')
		return (
			role === 'combobox' ||
			/(^|\s)(el-select|el-select-v2|el-cascader|el-date-editor|ant-select|ant-cascader-picker|ant-picker|arco-select|arco-cascader|arco-picker|n-base-selection|n-date-picker)(\s|$)/i.test(cls) ||
			/(select-wrapper|select__wrapper|combobox|picker|date-editor|time-picker|avue-(select|cascader|date|time))/i.test(cls)
		)
	}

	function isEditableElement(element) {
		if (g.NC_CONTENT_SEMANTICS?.isEditableElement) {
			return g.NC_CONTENT_SEMANTICS.isEditableElement(element)
		}
		if (element instanceof HTMLInputElement) {
			const type = String(element.type || 'text').toLowerCase()
			const composite = getCompositeFieldContainer(element)
			if (composite instanceof HTMLElement && composite !== element) return false
			if (element.readOnly) return false
			return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'].includes(type)
		}
		return (
			element instanceof HTMLTextAreaElement ||
			element.isContentEditable
		)
	}

	function isClickableElement(element) {
		const tag = element.tagName.toLowerCase()
		if (['a', 'button', 'summary'].includes(tag)) return true
		if (element instanceof HTMLInputElement) {
			return ['button', 'submit', 'checkbox', 'radio', 'file'].includes(String(element.type || '').toLowerCase())
		}
		if (isDropdownLikeControl(element)) return true
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
		if (isFieldLikeControl(element)) {
			const value = readCompositeControlValue(element)
			return value ? `selected:${shortText(value, 24)}` : 'empty'
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

	function readCompositeControlValue(element) {
		if (!(element instanceof HTMLElement)) return ''
		const nestedInput = element.querySelector('input, textarea')
		if (nestedInput instanceof HTMLInputElement || nestedInput instanceof HTMLTextAreaElement) {
			const value = String(nestedInput.value || '').trim()
			if (value) return value
			const placeholder = String(nestedInput.getAttribute('placeholder') || '').trim()
			const selectedText = readCompositeSelectedText(element, placeholder)
			if (selectedText) return selectedText
			return ''
		}
		const selectedText = readCompositeSelectedText(element, '')
		if (selectedText) return selectedText
		const selected = element.querySelector('[aria-selected="true"],.is-selected,.selected,[class*="selected"]')
		if (selected instanceof HTMLElement) {
			const text = cleanCompositeValueText(getElementText(selected), '')
			if (text) return text
		}
		return cleanCompositeValueText(getElementText(element), '')
	}

	function readCompositeSelectedText(element, placeholder) {
		if (!(element instanceof HTMLElement)) return ''
		const selectors = [
			'.el-select__tags .el-tag',
			'.el-select__selected-item',
			'.el-select__selection .el-tag',
			'.el-cascader__tags .el-tag',
			'.ant-select-selection-item',
			'.ant-select-selection-overflow-item',
			'.arco-select-view-value',
			'.n-base-selection-tags .n-tag',
			'[data-selected="true"]',
			'[aria-selected="true"]',
		].join(',')
		let candidates = []
		try {
			candidates = Array.from(element.querySelectorAll(selectors)).slice(0, 8)
		} catch (_) {
			candidates = []
		}
		for (const candidate of candidates) {
			if (!(candidate instanceof HTMLElement) || candidate === element) continue
			if (!isElementVisible(candidate)) continue
			const text = cleanCompositeValueText(getElementText(candidate), placeholder)
			if (text) return text
		}
		return ''
	}

	function cleanCompositeValueText(value, placeholder) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		if (!text || text === '(empty)') return ''
		const normalizedPlaceholder = String(placeholder || '').replace(/\s+/g, ' ').trim()
		if (normalizedPlaceholder && text === normalizedPlaceholder) return ''
		if (/^(请选择|请输入|请填写|选择|输入|展开选项)(\s|$)/i.test(text)) return ''
		return text
	}

	function getSelectionControlType(element) {
		if (g.NC_CONTENT_SEMANTICS?.getSelectionControlType) {
			return g.NC_CONTENT_SEMANTICS.getSelectionControlType(element)
		}
		const role = String(element?.getAttribute?.('role') || '').toLowerCase()
		const cascaderNode = element.closest?.('.el-cascader-node,[class*="cascader-node"]')
		const cls = String(element.className || '')
		if (cascaderNode instanceof HTMLElement || /(el-cascader-node)/i.test(cls)) {
			const node = cascaderNode instanceof HTMLElement ? cascaderNode : element
			return hasCascaderChildren(node) ? 'cascader-parent' : 'cascader-leaf'
		}
		if (isDropdownLikeControl(element)) {
			return /cascader/i.test(cls) ? 'cascader-parent' : 'dropdown'
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

	function getNativeOptionLabels(element) {
		if (!(element instanceof HTMLElement)) return []
		const select = element instanceof HTMLSelectElement ? element : element.querySelector?.('select')
		if (!(select instanceof HTMLSelectElement)) return []
		const labels = []
		const seen = new Set()
		for (const option of Array.from(select.options || [])) {
			const label = String(option.label || option.textContent || option.value || '').trim()
			const value = String(option.value || '').trim()
			const normalizedLabel = label.replace(/\s+/g, '').toLowerCase()
			const normalizedValue = value.replace(/\s+/g, '').toLowerCase()
			const text = normalizedValue && normalizedValue !== normalizedLabel
				? `${label || value} [value=${value}]`
				: (label || value)
			const key = text.replace(/\s+/g, '').toLowerCase()
			if (!key || seen.has(key)) continue
			seen.add(key)
			labels.push(shortText(text, 48))
			if (labels.length >= 24) break
		}
		return labels
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
		if (g.NC_CONTENT_SEMANTICS?.readSelectableState) {
			return g.NC_CONTENT_SEMANTICS.readSelectableState(element)
		}
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
		if (g.NC_CONTENT_SEMANTICS?.getExpandedState) {
			return g.NC_CONTENT_SEMANTICS.getExpandedState(element)
		}
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
			if (value) parts.push(`${name}=${shortText(value, getRelationHintLimit(name))}`)
		}
		const popup = String(element.getAttribute('aria-haspopup') || '').trim()
		if (popup) parts.push(`haspopup=${popup}`)
		return parts.join(',')
	}

	function getRelationHintLimit(name) {
		return ['aria-controls', 'aria-owns', 'aria-activedescendant'].includes(String(name || ''))
			? 96
			: 36
	}

	function getNavigationTargetHint(element) {
		if (!(element instanceof HTMLElement)) return ''
		const values = []
		const anchor = element.closest?.('a[href]')
		if (anchor instanceof HTMLAnchorElement) {
			values.push(anchor.getAttribute('href') || '', anchor.href || '')
		}
		for (const name of ['href', 'to', 'index', 'data-index', 'data-path', 'data-route', 'data-url', 'data-href']) {
			values.push(element.getAttribute(name) || '')
		}
		const id = String(element.id || '').trim()
		if (/(^|[-_:])(tab|menu|route|nav)[-_:]/i.test(id) || /(^|[-_:])#?\//.test(id)) values.push(id)
		const seen = new Set()
		const targets = []
		for (const value of values) {
			const normalized = normalizeNavigationTarget(value)
			if (!normalized || seen.has(normalized)) continue
			seen.add(normalized)
			targets.push(normalized)
			if (targets.length >= 3) break
		}
		return shortText(targets.join('|'), 120)
	}

	function normalizeNavigationTarget(value) {
		const raw = String(value || '').trim()
		if (!raw || raw === '#' || /^javascript:/i.test(raw)) return ''
		try {
			const parsed = new URL(raw, location.href)
			if (parsed.hash && /^#\//.test(parsed.hash)) return normalizeRoutePath(parsed.hash.slice(1))
			if (parsed.pathname && parsed.pathname !== '/') return normalizeRoutePath(parsed.pathname)
		} catch (_) {}
		const hashIndex = raw.indexOf('#/')
		if (hashIndex >= 0) return normalizeRoutePath(raw.slice(hashIndex + 1))
		const routeMatch = raw.match(/(?:^|[-_:])((?:\/)[A-Za-z0-9][A-Za-z0-9/_-]{1,})/)
		if (routeMatch?.[1]) return normalizeRoutePath(routeMatch[1])
		return ''
	}

	function normalizeRoutePath(value) {
		const path = String(value || '').trim().split(/[?#]/)[0].replace(/\/+$/, '')
		return path && path !== '/' ? path : ''
	}

	function getPopupContainerHints(element) {
		if (!(element instanceof HTMLElement)) return ''
		const popup = element.closest?.(
			'.el-popper,.el-popover,.el-select-dropdown,.el-picker-panel,.el-cascader-panel,.el-dropdown-menu,.ant-select-dropdown,.ant-picker-dropdown,.ant-cascader-menus,.arco-trigger-popup,.n-popover,.n-dropdown-menu,[role="listbox"]'
		)
		if (!(popup instanceof HTMLElement) || popup === element && !isLikelyPopupNode(popup)) return ''
		const parts = []
		if (popup.id) parts.push(`popupId=${shortText(popup.id, 96)}`)
		const role = String(popup.getAttribute('role') || '').trim()
		if (role) parts.push(`popupRole=${shortText(role, 24)}`)
		const labelledBy = String(popup.getAttribute('aria-labelledby') || '').trim()
		if (labelledBy) parts.push(`popupLabelledBy=${shortText(labelledBy, 96)}`)
		return parts.join(',')
	}

	function isLikelyPopupNode(element) {
		const cls = String(element?.className || '')
		const role = String(element?.getAttribute?.('role') || '').toLowerCase()
		return role === 'listbox' || /(popper|popover|select-dropdown|picker-panel|cascader-panel|dropdown-menu|trigger-popup)/i.test(cls)
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
		const classState = getClassStateHint(element)
		if (classState) parts.push(`classState=${classState}`)
		return parts.join(',')
	}

	function getClassStateHint(element) {
		if (!(element instanceof HTMLElement) || typeof element.className !== 'string') return ''
		const stateClasses = element.className
			.split(/\s+/)
			.map((item) => item.trim())
			.filter((item) => /^(is-)?(active|selected|current|checked|open|opened|expanded)$/i.test(item))
			.slice(0, 6)
		return stateClasses.length ? shortText(stateClasses.join('|'), 48) : ''
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
