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
				'[role="switch"]',
				'.el-checkbox__input',
				'.el-checkbox__inner',
				'.el-radio__input',
				'.el-radio__inner',
				'.el-switch',
				'.el-switch__core',
				'.ant-checkbox',
				'.ant-checkbox-inner',
				'.ant-radio',
				'.ant-radio-inner',
				'.ant-switch',
				'.n-checkbox',
				'.n-checkbox-box',
				'.n-switch',
				'.arco-checkbox',
				'.arco-checkbox-mask',
				'.arco-switch',
				'.van-checkbox__icon',
				'.van-switch',
				'.ivu-switch',
			].join(',')
		}

		function findOptionRow(element) {
			if (!(element instanceof HTMLElement)) return null
			const dateCell = getDatePickerCellCandidate(element)
			if (dateCell instanceof HTMLElement) return dateCell
			const row = element.closest?.(
				'[role="option"],[role="menuitem"],[role="treeitem"],[role="checkbox"],[role="radio"],[role="switch"],.el-select-dropdown__item,.el-cascader-node,.el-checkbox,.el-radio,.el-switch,.el-tree-node__content,.el-date-table td.available,.el-month-table td:not(.disabled),.el-year-table td:not(.disabled),.ant-picker-cell:not(.ant-picker-cell-disabled),.ant-select-item-option,.ant-tree-node,.ant-cascader-menu-item,.ant-checkbox-wrapper,.ant-radio-wrapper,.ant-switch,.arco-picker-cell:not(.arco-picker-cell-disabled),.arco-select-option,.arco-tree-node,.arco-switch,.n-date-panel-date,.n-date-panel-month,.n-base-select-option,.n-tree-node,.n-switch,.van-calendar__day:not(.van-calendar__day--disabled),.van-picker-column__item,.van-switch,.layui-laydate-content td:not(.laydate-disabled),.layui-select-tips,.ivu-date-picker-cells-cell:not(.ivu-date-picker-cells-cell-disabled),.ivu-select-item,.ivu-switch,.vxe-date-picker--date td:not(.is--disabled),.vxe-select-option,.q-item,li'
			)
			return row instanceof HTMLElement ? row : null
		}

		function findVisibleOptionByText(text, options = {}) {
			const expected = normalizeComparableText(text)
			if (!expected) return null
			const candidates = getVisibleOptionCandidates(options)
				.map((node) => ({
					node,
					score: scoreVisibleOptionTextMatch(node, text, expected),
				}))
				.filter((item) => Number.isFinite(item.score))
			const fallbackCompare = compareOptionCandidate(text)
			return candidates.sort((a, b) => a.score - b.score || fallbackCompare(a.node, b.node))[0]?.node || null
		}

		function scoreVisibleOptionTextMatch(node, rawText, expected) {
			const label = normalizeComparableText(getVisibleOptionLabel(node))
			if (!label || !expected) return Number.POSITIVE_INFINITY
			if (label === expected) return 0
			if (datePickerOptionMatchesRequest(node, rawText)) return 0
			if (optionTextHasBoundedDecorationMatch(label, expected)) return 1
			if (label.includes(expected)) return 3
			return Number.POSITIVE_INFINITY
		}

		function optionTextHasBoundedDecorationMatch(label, expected) {
			if (!label || !expected) return false
			if (label.startsWith(expected)) {
				const next = label.charAt(expected.length)
				if (isOptionDecorationBoundaryChar(next)) return true
			}
			if (label.endsWith(expected)) {
				const prev = label.charAt(label.length - expected.length - 1)
				if (isOptionDecorationBoundaryChar(prev)) return true
			}
			return false
		}

		function isOptionDecorationBoundaryChar(value) {
			if (!value) return false
			return /[\s()[\]{}（）【】《》<>:：;；,，.。/\\|｜\-_\u2013\u2014+＋#＃]/.test(String(value))
		}

		function datePickerOptionMatchesRequest(node, rawText) {
			const requestedDates = extractRequestedDateTexts(rawText)
			if (!requestedDates.length) return false
			const cell = getDatePickerCellCandidate(node)
			if (!(cell instanceof HTMLElement)) return false
			const labelDate = parseDateText(getDatePickerOptionLabel(cell))
			if (labelDate && requestedDates.includes(labelDate)) return true
			const day = parseDayCellText(observer.getElementText(cell))
			if (!Number.isFinite(day)) return false
			const context = inferDatePickerMonthContext(cell)
			if (!context) return false
			const shifted = adjustDatePickerMonth(context.year, context.month, getDateCellMonthShift(cell))
			const inferredDate = formatDateParts(shifted.year, shifted.month, day)
			return requestedDates.some((date) => date === inferredDate)
		}

		function getVisibleOptionCandidates(options = {}) {
			return querySelectorAllDeep(getOptionCandidateSelector())
				.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node) && (
					isTopLayerClickable(node) || isVisiblePopupOptionCandidate(node)
				))
				.filter((node) => {
					const cls = String(node.className || '')
					if (!isDropdownOptionCandidate(node, options)) return false
					if (options.field && !isOptionAssociatedWithField(node, options.field, options)) return false
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
				'[role="switch"]',
				'[aria-selected]',
				'[aria-checked]',
				'.el-select-dropdown__item',
				'.el-select-dropdown__item *',
				'.el-cascader-node',
				'.el-date-table td.available',
				'.el-date-table td.available span',
				'.el-month-table td:not(.disabled)',
				'.el-year-table td:not(.disabled)',
				'.el-checkbox',
				'.el-checkbox__label',
				'.el-radio',
				'.el-radio__label',
				'.el-tree-node__content',
				'.ant-select-item-option',
				'.ant-picker-cell:not(.ant-picker-cell-disabled)',
				'.ant-picker-cell-inner',
				'.ant-tree-node',
				'.ant-cascader-menu-item',
				'.ant-checkbox-wrapper',
				'.ant-radio-wrapper',
				'.ant-switch',
				'.arco-select-option',
				'.arco-picker-cell:not(.arco-picker-cell-disabled)',
				'.arco-picker-date',
				'.arco-tree-node',
				'.arco-cascader-option',
				'.arco-checkbox',
				'.arco-switch',
				'.n-base-select-option',
				'.n-date-panel-date',
				'.n-date-panel-month',
				'.n-tree-node',
				'.n-cascader-option',
				'.n-checkbox',
				'.n-switch',
				'.van-picker-column__item',
				'.van-calendar__day:not(.van-calendar__day--disabled)',
				'.van-switch',
				'.layui-laydate-content td:not(.laydate-disabled)',
				'.layui-select-tips',
				'.ivu-date-picker-cells-cell:not(.ivu-date-picker-cells-cell-disabled)',
				'.ivu-select-item',
				'.ivu-switch',
				'.vxe-date-picker--date td:not(.is--disabled)',
				'.vxe-select-option',
				'.q-item',
				'[class*="select-option"]',
				'[class*="tree-option"]',
				'[class*="dropdown-item"]',
				'[class*="cascader"]',
				'li',
			].join(',')
		}

		function isDropdownOptionCandidate(node, options) {
			options = options || {}
			if (!(node instanceof HTMLElement)) return false
			const role = String(node.getAttribute('role') || '').toLowerCase()
			const cls = String(node.className || '')
			if (isDatePickerOption(node)) return true
			if (['option', 'treeitem', 'checkbox', 'radio', 'switch'].includes(role)) return true
			if (
				/(el-select-dropdown__item|el-option|el-cascader-node|el-tree-node__content|el-date-table|el-month-table|el-year-table|ant-picker-cell|ant-select-item-option|ant-tree-node|ant-cascader-menu-item|arco-picker-cell|arco-select-option|arco-tree-node|arco-cascader-option|n-date-panel|n-base-select-option|n-tree-node|n-cascader-option|van-calendar__day|van-picker-column__item|layui-laydate|layui-select-tips|ivu-date-picker-cells-cell|ivu-select-item|vxe-date-picker|vxe-select-option|q-item|select-option|tree-option|dropdown-item|cascader)/i.test(cls)
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

		function isOptionAssociatedWithField(option, field, options = {}) {
			if (!(option instanceof HTMLElement) || !(field instanceof HTMLElement)) return false
			if (field.contains(option) || option.contains(field)) return true
			const explicitAssociation = getExplicitOptionFieldAssociation(option, field, options)
			if (explicitAssociation !== null) return explicitAssociation
			const popup = getOptionPopupContainer(option)
			if (!(popup instanceof HTMLElement)) return false
			const activePopupAssociation = getActivePopupFieldAssociation(popup, field, options)
			if (activePopupAssociation !== null) return activePopupAssociation
			const dateOptionAssociation = scoreDomDateOptionFieldAssociation(option, field)
			if (Number.isFinite(dateOptionAssociation)) return true
			const optionRect = (popup instanceof HTMLElement ? popup : option).getBoundingClientRect()
			const fieldRect = field.getBoundingClientRect()
			if (!optionRect.width || !optionRect.height || !fieldRect.width || !fieldRect.height) return false
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

		function scoreDomDateOptionFieldAssociation(option, field) {
			if (typeof controlSemantics?.scoreDateOptionTargetAssociation !== 'function') return Number.POSITIVE_INFINITY
			const cell = getDatePickerCellCandidate(option)
			if (!(cell instanceof HTMLElement) || !(field instanceof HTMLElement)) return Number.POSITIVE_INFINITY
			return controlSemantics.scoreDateOptionTargetAssociation(
				buildDomDateOptionAssociationItem(cell),
				buildDomFieldAssociationItem(field)
			)
		}

		function buildDomDateOptionAssociationItem(cell) {
			const rect = cell.getBoundingClientRect()
			return {
				label: getDatePickerOptionLabel(cell) || observer.shortText(observer.getElementText(cell), 36),
				role: 'option',
				selectionControl: 'date-option',
				rect: toAssociationRect(rect),
			}
		}

		function buildDomFieldAssociationItem(field) {
			const rect = field.getBoundingClientRect()
			const text = collectFieldAssociationText(field)
			return {
				label: text.label,
				placeholder: text.placeholder,
				name: text.name,
				text: text.text,
				role: getFieldAssociationRole(field),
				fieldType: inferDomFieldType(field, text),
				selectionControl: hasSelectionTriggerSignal(field) ? 'dropdown' : '',
				controlKind: String(field.className || ''),
				expandedState: hasExpandedOrOpenSignal(field) ? 'expanded' : '',
				rect: toAssociationRect(rect),
			}
		}

		function collectFieldAssociationText(field) {
			const label = readFieldLabelText(field)
			const control = field.querySelector?.('input,textarea,[role="combobox"],[role="textbox"]')
			const placeholder = String(
				field.getAttribute?.('placeholder') ||
				control?.getAttribute?.('placeholder') ||
				''
			).trim()
			const name = String(
				field.getAttribute?.('name') ||
				control?.getAttribute?.('name') ||
				''
			).trim()
			const aria = String(
				field.getAttribute?.('aria-label') ||
				control?.getAttribute?.('aria-label') ||
				''
			).trim()
			const title = String(
				field.getAttribute?.('title') ||
				control?.getAttribute?.('title') ||
				''
			).trim()
			const value = String(
				field.getAttribute?.('data-value') ||
				control?.getAttribute?.('value') ||
				''
			).trim()
			const text = [label, aria, title, placeholder, name, value, observer.shortText(observer.getElementText(field), 80)]
				.filter(Boolean)
				.join(' ')
			return {
				label: label || aria || title || placeholder || name,
				placeholder,
				name,
				text,
			}
		}

		function readFieldLabelText(field) {
			if (!(field instanceof HTMLElement)) return ''
			const id = String(field.id || field.querySelector?.('[id]')?.id || '').trim()
			if (id) {
				const explicit = document.querySelector?.(`label[for="${cssEscape(id)}"]`)
				if (explicit instanceof HTMLElement) {
					const text = observer.shortText(observer.getElementText(explicit), 60)
					if (text) return text
				}
			}
			const formItem = field.closest?.(
				'.el-form-item,.ant-form-item,.arco-form-item,.n-form-item,.ivu-form-item,.layui-form-item,.form-item,[class*="form-item"],[class*="formItem"]'
			)
			const label = formItem?.querySelector?.(
				'.el-form-item__label,.ant-form-item-label,.arco-form-item-label,.n-form-item-label,.ivu-form-item-label,label,[class*="label"]'
			)
			if (label instanceof HTMLElement) return observer.shortText(observer.getElementText(label), 60)
			return ''
		}

		function getFieldAssociationRole(field) {
			const role = String(field?.getAttribute?.('role') || '').trim()
			if (role) return role
			const control = field?.querySelector?.('[role="combobox"],[role="textbox"],input,textarea,select')
			if (!(control instanceof HTMLElement)) return ''
			return String(control.getAttribute('role') || (control instanceof HTMLSelectElement ? 'combobox' : '')).trim()
		}

		function inferDomFieldType(field, text = {}) {
			const control = field?.querySelector?.('input,textarea,select,[role="combobox"],[role="textbox"]')
			const descriptor = [
				field?.className,
				field?.getAttribute?.('type'),
				field?.getAttribute?.('data-type'),
				field?.getAttribute?.('data-field-type'),
				control?.className,
				control?.getAttribute?.('type'),
				control?.getAttribute?.('data-type'),
				control?.getAttribute?.('data-field-type'),
				text?.label,
				text?.placeholder,
				text?.name,
				text?.text,
			].map((value) => String(value || '')).join(' ')
			const temporalType = inferTemporalDomFieldType(descriptor)
			if (temporalType) return temporalType
			if (/datetime|date[-_\s]?time|日期.*时间/i.test(descriptor)) return 'datetime'
			if (/time|时间/i.test(descriptor)) return 'time'
			if (/date|picker|calendar|日期|日历/i.test(descriptor)) return 'date'
			return ''
		}

		function inferTemporalDomFieldType(descriptor) {
			const text = String(descriptor || '')
			const hasRangeSignal = /(range|区间|范围|起止|开始.{0,24}结束|start.{0,24}end)/i.test(text)
			const hasDateSignal = /daterange|date[-_\s]?range|range[-_\s]?date|(^|[^a-z])date([^a-z]|$)|日期|日历|calendar|birthday|出生日期/i.test(text)
			const hasDateTimeSignal = /datetimerange|date[-_\s]?time[-_\s]?range|datetime.*range|datetime|date[-_\s]?time|日期.*时间|时间.*日期/i.test(text)
			const hasTimeSignal = /timerange|time[-_\s]?range|range[-_\s]?time|(^|[^a-z])time([^a-z]|$)|时间/i.test(text)
			const hasMonthSignal = /monthrange|month[-_\s]?range|range[-_\s]?month|(^|[^a-z])month([^a-z]|$)|月份|按月/i.test(text)
			const hasYearSignal = /yearrange|year[-_\s]?range|range[-_\s]?year|(^|[^a-z])year([^a-z]|$)|年份|年度|按年/i.test(text)
			const hasWeekSignal = /weekrange|week[-_\s]?range|range[-_\s]?week|(^|[^a-z])week([^a-z]|$)|星期|周次|按周|周度/i.test(text)
			if (/datetimerange|date[-_\s]?time[-_\s]?range|datetime.*range|日期.*时间.*(范围|区间|起止)/i.test(text)) return 'datetimerange'
			if (/timerange|time[-_\s]?range|range[-_\s]?time|时间.*(范围|区间|起止)/i.test(text)) return 'timerange'
			if (/monthrange|month[-_\s]?range|range[-_\s]?month|月份.*(范围|区间|起止)/i.test(text)) return 'monthrange'
			if (/yearrange|year[-_\s]?range|range[-_\s]?year|年份.*(范围|区间|起止)|年度.*(范围|区间|起止)/i.test(text)) return 'yearrange'
			if (/weekrange|week[-_\s]?range|range[-_\s]?week|星期.*(范围|区间|起止)|周次.*(范围|区间|起止)|按周.*(范围|区间|起止)|周度.*(范围|区间|起止)/i.test(text)) return 'weekrange'
			if (/daterange|date[-_\s]?range|range[-_\s]?date/i.test(text)) return 'daterange'
			if (hasRangeSignal && hasDateTimeSignal) return 'datetimerange'
			if (hasRangeSignal && hasTimeSignal) return 'timerange'
			if (hasRangeSignal && hasMonthSignal) return 'monthrange'
			if (hasRangeSignal && hasYearSignal) return 'yearrange'
			if (hasRangeSignal && hasWeekSignal) return 'weekrange'
			if (hasRangeSignal && hasDateSignal) return 'daterange'
			return ''
		}

		function toAssociationRect(rect) {
			return {
				left: Number(rect?.left),
				top: Number(rect?.top),
				width: Number(rect?.width),
				height: Number(rect?.height),
			}
		}

		function getExplicitOptionFieldAssociation(option, field, options = {}) {
			const controlledIds = getControlledPopupIds(field)
			if (controlledIds.length) {
				if (isOptionInsideControlledPopup(option, controlledIds)) return true
				if (!shouldIgnoreStaleControlledPopupIds(controlledIds, options)) return false
			}
			return isOptionInsidePopupLabelledByField(option, field)
		}

		function shouldIgnoreStaleControlledPopupIds(controlledIds, options = {}) {
			if (options?.openedByField !== true) return false
			return !hasVisibleControlledPopup(controlledIds)
		}

		function hasVisibleControlledPopup(controlledIds) {
			for (const id of controlledIds || []) {
				const controlled = document.getElementById(id)
				if (controlled instanceof HTMLElement && isVisiblePopup(controlled)) return true
			}
			return false
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
				'.ant-tree-select-dropdown',
				'.ant-picker-dropdown',
				'.ant-cascader-menus',
				'.arco-trigger-popup',
				'.arco-picker-container',
				'.n-date-panel',
				'.n-dropdown-menu',
				'.van-popup',
				'.van-calendar',
				'.van-picker',
				'.layui-anim',
				'.layui-laydate',
				'.ivu-date-picker',
				'.ivu-select-dropdown',
				'.vxe-date-picker--panel',
				'.vxe-table--ignore-clear',
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
			const dateLabel = getDatePickerOptionLabel(element)
			if (dateLabel) return dateLabel
			const preferred = element.querySelector?.(
				'.el-cascader-node__label,.el-select-dropdown__item span,.ant-select-item-option-content,.ant-tree-title,.arco-select-option-content,.arco-tree-node-title,.n-base-select-option__content,.n-tree-node-content__text,.van-ellipsis,.ivu-select-item,.vxe-select-option--label,.q-item__label'
			)
			if (preferred instanceof HTMLElement) return observer.getElementText(preferred)
			return observer.getElementText(element)
		}

		function getDatePickerCellCandidate(element) {
			if (!(element instanceof HTMLElement)) return null
			const selector = [
				'.el-date-table td.available',
				'.el-month-table td:not(.disabled)',
				'.el-year-table td:not(.disabled)',
				'.ant-picker-cell:not(.ant-picker-cell-disabled)',
				'.arco-picker-cell:not(.arco-picker-cell-disabled)',
				'.n-date-panel-date',
				'.n-date-panel-month',
				'.van-calendar__day:not(.van-calendar__day--disabled)',
				'.layui-laydate-content td:not(.laydate-disabled)',
				'.ivu-date-picker-cells-cell:not(.ivu-date-picker-cells-cell-disabled)',
				'.vxe-date-picker--date td:not(.is--disabled)',
				'[role="gridcell"]:not([aria-disabled="true"])',
			].join(',')
			const cell = element.closest?.(selector)
			return cell instanceof HTMLElement && !isDatePickerDisabled(cell) && isInsideDatePickerPopup(cell) ? cell : null
		}

		function isDatePickerOption(element) {
			const cell = getDatePickerCellCandidate(element)
			return cell instanceof HTMLElement && cell === element
		}

		function isInsideDatePickerPopup(element) {
			if (!(element instanceof HTMLElement)) return false
			return !!element.closest?.(
				'.el-picker-panel,.ant-picker-dropdown,.arco-picker-container,.arco-trigger-popup,.n-date-panel,.van-calendar,.layui-laydate,.ivu-date-picker,.ivu-date-picker-transfer,.vxe-date-picker--panel,[class*="date-picker"],[class*="calendar"],[class*="picker-panel"]'
			)
		}

		function isDatePickerDisabled(element) {
			if (!(element instanceof HTMLElement)) return true
			if (String(element.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return true
			if (element.hasAttribute('disabled')) return true
			const cls = String(element.className || '')
			return /(^|\s|--|__|-)(disabled|is-disabled|unavailable|not-allowed)(\s|$)/i.test(cls)
		}

		function getDatePickerOptionLabel(element) {
			const cell = getDatePickerCellCandidate(element)
			if (!(cell instanceof HTMLElement)) return ''
			const direct = readDateAttributeLabel(cell)
			if (direct) return direct
			const text = observer.getElementText(cell)
			const day = parseDayCellText(text)
			if (!Number.isFinite(day)) return text && text !== '(empty)' ? observer.shortText(text, 36) : ''
			const context = inferDatePickerMonthContext(cell)
			if (!context) return String(day)
			const shifted = adjustDatePickerMonth(context.year, context.month, getDateCellMonthShift(cell))
			return formatDateParts(shifted.year, shifted.month, day)
		}

		function readDateAttributeLabel(cell) {
			if (!(cell instanceof HTMLElement)) return ''
			const attrs = ['aria-label', 'title', 'data-date', 'data-day', 'data-value', 'data-time', 'datetime']
			for (const attr of attrs) {
				const parsed = parseDateText(cell.getAttribute(attr))
				if (parsed) return parsed
			}
			return ''
		}

		function inferDatePickerMonthContext(cell) {
			const scope =
				cell.closest?.(
					'.el-date-range-picker__content,.el-date-picker__content,.el-picker-panel__content,.ant-picker-date-panel,.arco-picker-date-panel,.n-date-panel,.ivu-date-picker-cells,.layui-laydate-main,.vxe-date-picker--content'
				) ||
				cell.closest?.('.el-picker-panel,.ant-picker-panel,.arco-picker-panel,.layui-laydate,.ivu-date-picker,.vxe-date-picker--panel')
			const headerText = readDatePickerHeaderText(scope, cell)
			return parseYearMonthText(headerText)
		}

		function readDatePickerHeaderText(scope, cell) {
			const localSelectors = [
				'.el-date-range-picker__header div',
				'.el-date-picker__header-label',
				'.ant-picker-header-view',
				'.arco-picker-header-value',
				'.n-date-panel-month__text',
				'.ivu-date-picker-header-label',
				'.layui-laydate-header',
				'.vxe-date-picker--header',
			].join(',')
			for (const root of [scope, cell?.closest?.('.el-picker-panel,.ant-picker-panel,.arco-picker-panel,.layui-laydate,.ivu-date-picker,.vxe-date-picker--panel')]) {
				if (!(root instanceof HTMLElement)) continue
				for (const node of Array.from(root.querySelectorAll?.(localSelectors) || [])) {
					if (!(node instanceof HTMLElement)) continue
					const parsed = parseYearMonthText(observer.getElementText(node))
					if (parsed) return observer.getElementText(node)
				}
				const parsed = parseYearMonthText(observer.getElementText(root))
				if (parsed) return observer.getElementText(root)
			}
			return ''
		}

		function parseYearMonthText(value) {
			const text = String(value || '').replace(/\s+/g, ' ').trim()
			if (!text) return null
			let match = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月/)
			if (!match) match = text.match(/(\d{4})\s*[-/]\s*(\d{1,2})(?!\s*[-/]\s*\d{1,2})/)
			if (!match) match = text.match(/([A-Za-z]+)\s+(\d{4})/)
			if (match && Number.isFinite(Number(match[1])) && Number.isFinite(Number(match[2]))) {
				return { year: Number(match[1]), month: Number(match[2]) }
			}
			if (match) {
				const month = parseEnglishMonth(match[1])
				const year = Number(match[2])
				if (month && Number.isFinite(year)) return { year, month }
			}
			return null
		}

		function parseEnglishMonth(value) {
			const key = String(value || '').slice(0, 3).toLowerCase()
			return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(key) + 1 || 0
		}

		function parseDateText(value) {
			const text = String(value || '').replace(/\s+/g, ' ').trim()
			if (!text) return ''
			let match = text.match(/(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})/)
			if (!match) match = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)
			if (!match) match = text.match(/\b(\d{4})(\d{2})(\d{2})\b/)
			if (!match) return ''
			return formatDateParts(Number(match[1]), Number(match[2]), Number(match[3]))
		}

		function extractRequestedDateTexts(value) {
			const text = String(value || '').replace(/\s+/g, ' ').trim()
			if (!text) return []
			const dates = []
			const seen = new Set()
			const addDate = (raw) => {
				const parsed = parseDateText(raw)
				if (!parsed || seen.has(parsed)) return
				seen.add(parsed)
				dates.push(parsed)
			}
			for (const match of text.matchAll(/\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2}/g)) addDate(match[0])
			for (const match of text.matchAll(/\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?/g)) addDate(match[0])
			for (const match of text.matchAll(/\b\d{8}\b/g)) addDate(match[0])
			if (!dates.length) addDate(text)
			return dates
		}

		function parseDayCellText(value) {
			const text = String(value || '').replace(/\s+/g, ' ').trim()
			if (!/^\d{1,2}$/.test(text)) return NaN
			const day = Number(text)
			return day >= 1 && day <= 31 ? day : NaN
		}

		function getDateCellMonthShift(cell) {
			const cls = String(cell?.className || '')
			if (/(^|\s)(prev-month|is-prev|prev)(\s|$)/i.test(cls)) return -1
			if (/(^|\s)(next-month|is-next|next)(\s|$)/i.test(cls)) return 1
			return 0
		}

		function adjustDatePickerMonth(year, month, shift) {
			let nextYear = Number(year)
			let nextMonth = Number(month) + Number(shift || 0)
			while (nextMonth < 1) {
				nextMonth += 12
				nextYear -= 1
			}
			while (nextMonth > 12) {
				nextMonth -= 12
				nextYear += 1
			}
			return { year: nextYear, month: nextMonth }
		}

		function formatDateParts(year, month, day) {
			if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return ''
			return `${year}-${pad2(month)}-${pad2(day)}`
		}

		function pad2(value) {
			return String(Number(value)).padStart(2, '0')
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

		async function findDropdownOptionByScrolling(text, options = {}) {
			const timeoutMs = Math.max(300, Number(options.timeoutMs || 2200))
			const deadline = Date.now() + timeoutMs
			let containers = getOptionScrollContainers(options)
			let found = findVisibleOptionByText(text, options)
			if (found) return found
			while (Date.now() <= deadline) {
				if (!containers.length) containers = getOptionScrollContainers(options)
				let moved = false
				for (const container of containers) {
					if (!(container instanceof HTMLElement)) continue
					const before = container.scrollTop
					const step = Math.max(80, Math.floor((container.clientHeight || 120) * 0.82))
					container.scrollTop = Math.min(container.scrollHeight, before + step)
					if (container.scrollTop !== before) {
						moved = true
						container.dispatchEvent(new Event('scroll', { bubbles: true }))
						await sleep(90)
						found = findVisibleOptionByText(text, options)
						if (found) return found
					}
				}
				if (!moved) break
				await sleep(100)
			}
			return findVisibleOptionByText(text, options)
		}

		function getOptionScrollContainers(options = {}) {
			const popups = querySelectorAllDeep(getOptionPopupSelector())
				.filter((node) => node instanceof HTMLElement && isVisiblePopup(node))
				.filter((node) => !options.field || isPopupAssociatedWithField(node, options.field, options))
			const containers = []
			for (const popup of popups) {
				addScrollableContainer(containers, popup)
				for (const node of Array.from(popup.querySelectorAll?.(getOptionScrollContainerSelector()) || [])) {
					addScrollableContainer(containers, node)
				}
				for (const node of Array.from(popup.querySelectorAll?.('*') || [])) {
					if (containers.length >= 24) break
					addScrollableContainer(containers, node)
				}
			}
			return containers
		}

		function getOptionScrollContainerSelector() {
			return [
				'.el-select-dropdown__wrap',
				'.el-scrollbar__wrap',
				'.rc-virtual-list-holder',
				'.cdk-virtual-scroll-viewport',
				'.ant-select-dropdown .rc-virtual-list-holder',
				'.ant-dropdown-menu',
				'.arco-virtual-list',
				'.arco-select-popup-inner',
				'.n-virtual-list',
				'.n-scrollbar-container',
				'.van-picker-column',
				'.van-picker-column__wrapper',
				'.layui-form-select dl',
				'.ivu-select-dropdown-list',
				'.vxe-list',
				'.q-virtual-scroll',
				'[class*="virtual-list"]',
				'[class*="scrollbar"]',
				'[class*="dropdown-list"]',
			].join(',')
		}

		function addScrollableContainer(containers, node) {
			if (!(node instanceof HTMLElement) || containers.includes(node)) return
			if (!isVisiblePopup(node) && !isVisibleClickTarget(node)) return
			if (!isScrollableOptionContainer(node)) return
			containers.push(node)
		}

		function isScrollableOptionContainer(node) {
			if (!(node instanceof HTMLElement)) return false
			const style = window.getComputedStyle(node)
			const overflow = `${style.overflow || ''} ${style.overflowY || ''}`.toLowerCase()
			const canScroll = node.scrollHeight > node.clientHeight + 6
			return canScroll && /(auto|scroll|overlay)/.test(overflow)
		}

		function isVisiblePopup(node) {
			if (!(node instanceof HTMLElement)) return false
			const style = window.getComputedStyle(node)
			if (style.display === 'none' || style.visibility === 'hidden') return false
			const rect = node.getBoundingClientRect()
			return rect.width > 2 && rect.height > 2
		}

		function isPopupAssociatedWithField(popup, field, options = {}) {
			if (!(popup instanceof HTMLElement) || !(field instanceof HTMLElement)) return false
			if (field.contains(popup) || popup.contains(field)) return true
			const controlledIds = getControlledPopupIds(field)
			if (controlledIds.length && controlledIds.some((id) => popup.id === id || popup.querySelector?.(`[id="${cssEscape(id)}"]`))) {
				return true
			}
			if (controlledIds.length && !shouldIgnoreStaleControlledPopupIds(controlledIds, options)) return false
			const labelled = isOptionInsidePopupLabelledByField(popup, field)
			if (labelled !== null) return labelled
			const activePopupAssociation = getActivePopupFieldAssociation(popup, field, options)
			if (activePopupAssociation !== null) return activePopupAssociation
			const popupRect = popup.getBoundingClientRect()
			const fieldRect = field.getBoundingClientRect()
			if (!popupRect.width || !popupRect.height || !fieldRect.width || !fieldRect.height) return false
			if (controlSemantics?.isOptionTargetGeometryRelated) {
				return controlSemantics.isOptionTargetGeometryRelated(popupRect, fieldRect)
			}
			return fallbackOptionTargetGeometryRelated(popupRect, fieldRect)
		}

		function getActivePopupFieldAssociation(popup, field, options = {}) {
			if (!(popup instanceof HTMLElement) || !(field instanceof HTMLElement)) return null
			const openedByField = options?.openedByField === true
			if (openedByField) {
				if (!hasSelectionTriggerSignal(field)) return null
			} else if (!isOpenOrFocusedSelectionField(field)) {
				return null
			}
			const visiblePopups = getVisibleOptionPopupRoots()
			if (visiblePopups.length !== 1) return null
			return isPopupSameOrNested(popup, visiblePopups[0])
		}

		function getVisibleOptionPopupRoots() {
			const popups = querySelectorAllDeep(getOptionPopupSelector())
				.filter((node) => node instanceof HTMLElement && isVisiblePopup(node))
			return popups.filter((popup) => !popups.some(
				(other) => other !== popup && other instanceof HTMLElement && other.contains(popup)
			))
		}

		function isPopupSameOrNested(popup, root) {
			return popup === root || popup.contains(root) || root.contains(popup)
		}

		function isOpenOrFocusedSelectionField(field) {
			if (!(field instanceof HTMLElement)) return false
			if (hasExpandedOrOpenSignal(field)) return true
			const active = document.activeElement
			return active instanceof HTMLElement &&
				field.contains(active) &&
				hasSelectionTriggerSignal(field)
		}

		function hasExpandedOrOpenSignal(field) {
			if (!(field instanceof HTMLElement)) return false
			for (const node of [field, ...Array.from(field.querySelectorAll?.('[aria-expanded],.is-opened,.is-expanded,.open,.opened') || [])]) {
				if (!(node instanceof HTMLElement)) continue
				const expanded = String(node.getAttribute('aria-expanded') || '').toLowerCase()
				if (expanded === 'true') return true
				const cls = String(node.className || '')
				if (/(^|\s)(is-opened|is-expanded|open|opened)(\s|$)/i.test(cls) && hasSelectionTriggerSignal(node)) return true
			}
			return false
		}

		function hasSelectionTriggerSignal(field) {
			if (!(field instanceof HTMLElement)) return false
			const selector = [
				'[aria-haspopup]',
				'[role="combobox"]',
				'select',
				'.el-select',
				'.el-cascader',
				'.el-date-editor',
				'.ant-select',
				'.ant-tree-select',
				'.ant-cascader-picker',
				'.ant-picker',
				'.arco-select',
				'.arco-cascader',
				'.arco-picker',
				'.n-base-selection',
				'.n-tree-select',
				'.n-date-picker',
				'.van-dropdown-menu',
				'.layui-form-select',
				'.ivu-select',
				'.ivu-date-picker',
				'.vxe-select',
				'.q-select',
				'[class*="select-wrapper"]',
				'[class*="combobox"]',
				'[class*="picker"]',
			].join(',')
			return field.matches?.(selector) || !!field.querySelector?.(selector)
		}

		function resolveDropdownTrigger(element) {
			if (!(element instanceof HTMLElement)) return null
			const composite = element.closest?.(
				'.el-select,.el-select-v2,.el-select__wrapper,.el-cascader,.el-date-editor,.el-input--suffix,.ant-select,.ant-select-selector,.ant-tree-select,.ant-cascader-picker,.ant-picker,.arco-select,.arco-cascader,.arco-picker,.n-base-selection,.n-tree-select,.n-date-picker,.van-dropdown-menu,.van-dropdown-item,.van-field,.van-picker,.layui-form-select,.layui-select-title,.ivu-select,.ivu-select-selection,.ivu-date-picker,.vxe-select,.vxe-input,.q-select,.q-field,.avue-select,.avue-cascader,.avue-date,.avue-time,[class*="select-wrapper"],[class*="select__wrapper"],[class*="tree-select"],[class*="date-editor"],[class*="time-picker"],[class*="combobox"],[class*="picker"],[role="combobox"]'
			)
			const target = composite instanceof HTMLElement ? composite : element
			if (
				target.closest?.(
					'.el-select-dropdown,.el-cascader-panel,.el-picker-panel,.ant-select-dropdown,.ant-tree-select-dropdown,.ant-cascader-menus,.arco-trigger-popup,.n-dropdown-menu,.van-popup,.van-picker,.layui-anim,.ivu-select-dropdown,.vxe-table--ignore-clear,[role="listbox"]'
				)
			) {
				return element
			}
			const inner = target.querySelector?.(
				'.el-select__caret,.el-input__suffix,.el-input,.ant-select-selector,.ant-tree-select,.arco-select-view,.n-base-selection-label,.van-dropdown-menu__bar,.van-field__control,.layui-select-title,.ivu-select-selection,.vxe-input,.q-field__control,input'
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
			const date = parseDateText(value)
			if (date) return date
			return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
		}

		function querySelectorAllDeep(selector, root = document) {
			const results = []
			const roots = [root]
			const seenRoots = new Set()
			const seenElements = new Set()
			while (roots.length) {
				const current = roots.shift()
				if (!current || seenRoots.has(current)) continue
				seenRoots.add(current)
				let nodes = []
				try {
					nodes = Array.from(current.querySelectorAll(selector))
				} catch (_) {
					nodes = []
				}
				for (const node of nodes) {
					if (!(node instanceof HTMLElement) || seenElements.has(node)) continue
					seenElements.add(node)
					results.push(node)
				}
				for (const shadowRoot of listOpenShadowRoots(current)) {
					if (!seenRoots.has(shadowRoot)) roots.push(shadowRoot)
				}
			}
			return results
		}

		function listOpenShadowRoots(root) {
			let all = []
			try {
				all = Array.from(root.querySelectorAll('*'))
			} catch (_) {
				all = []
			}
			return all
				.map((node) => node?.shadowRoot)
				.filter((node) => node instanceof ShadowRoot)
		}

		return {
			compareOptionCandidate,
			findNestedSelectableControl,
			findOptionRow,
			findVisibleOptionByText,
			getVisibleOptionLabel,
			isCascaderParentOption,
			isOptionAssociatedWithField,
			findDropdownOptionByScrolling,
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
