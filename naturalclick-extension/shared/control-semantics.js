;(function (g) {
	const DROPDOWN_FIELD_TYPES = new Set([
		'select',
		'date',
		'time',
		'daterange',
		'datetimerange',
		'timerange',
		'month',
		'monthrange',
		'year',
		'yearrange',
		'week',
		'weekrange',
		'datetime',
	])
	const ALWAYS_SELECTION_FIELD_TYPES = new Set([
		'select',
	])
	const DROPDOWN_ROLES = new Set(['combobox', 'listbox'])
	const OPTION_ROLES = new Set(['option', 'treeitem'])
	const OPTION_CONTROLS = new Set(['cascader-leaf', 'date-option'])
	const SELECTABLE_ROLES = new Set(['checkbox', 'radio', 'switch'])
	const DROPDOWN_CONTROLS = new Set(['dropdown', 'select', 'cascader', 'cascader-parent', 'cascader-leaf'])
	const SELECTABLE_CONTROLS = new Set(['checkbox', 'radio', 'switch'])
	const SELECTION_SOURCES = new Set(['options', 'popups'])
	const GEOMETRY_ASSOCIATION = Object.freeze({
		minOverlapRatio: 0.18,
		maxVerticalGapPx: 420,
		maxVerticalGapFieldHeights: 12,
		aboveBias: 200,
	})
	const OPTION_ASSOCIATION_SCORES = Object.freeze({
		controlledPopup: 0,
		popupLabelledBy: 100,
		expandedDatePopup: 300,
		geometryOffset: 1000,
		unknown: Number.MAX_SAFE_INTEGER,
	})
	const DATE_OPTION_ASSOCIATION = Object.freeze({
		maxHorizontalDistancePx: 420,
		maxHorizontalDistanceFieldWidths: 3.5,
		maxNearbyHorizontalDistancePx: 960,
		maxNearbyHorizontalDistanceFieldWidths: 8,
		maxVerticalGapPx: 520,
		maxNearbyVerticalGapPx: 680,
		maxExpandedVerticalGapPx: 1100,
		aboveBias: 180,
	})

	function describeObservedControl(item, source = '') {
		const role = normalizeToken(item?.role)
		const tag = normalizeToken(item?.tag)
		const control = normalizeToken(item?.selectionControl || item?.control)
		const fieldType = normalizeToken(item?.fieldType)
		const compactFieldType = compactTypeToken(fieldType)
		const sourceName = normalizeToken(source).split(':')[0]
		const editable = item?.editable === true ? true : item?.editable === false ? false : null
		const hasOptions = Array.isArray(item?.optionLabels) && item.optionLabels.length > 0
		const sourceSelection = SELECTION_SOURCES.has(sourceName)
		const editableComboboxTextEntry = isEditableComboboxTextEntry({
			role,
			tag,
			control,
			fieldType,
			editable,
			hasOptions,
			sourceSelection,
		})
		const fieldTypeSuggestsDropdown =
			!editableComboboxTextEntry && (
				ALWAYS_SELECTION_FIELD_TYPES.has(fieldType) ||
				ALWAYS_SELECTION_FIELD_TYPES.has(compactFieldType) ||
				((DROPDOWN_FIELD_TYPES.has(fieldType) || DROPDOWN_FIELD_TYPES.has(compactFieldType)) &&
				!(editable === true && role === 'textbox' && !control && !hasOptions)
				)
			)
		const dropdownLike =
			!editableComboboxTextEntry && (
				DROPDOWN_CONTROLS.has(control) ||
				DROPDOWN_ROLES.has(role) ||
				tag === 'select' ||
				hasOptions ||
				fieldTypeSuggestsDropdown
			)
		const selectableLike =
			SELECTABLE_CONTROLS.has(control) ||
			SELECTABLE_ROLES.has(role)
		const optionLike =
			sourceSelection ||
			OPTION_ROLES.has(role) ||
			OPTION_CONTROLS.has(control)
		const selectionLike = dropdownLike || selectableLike || optionLike
		const editableTextLike = editable === true && !selectionLike
		return {
			role,
			tag,
			control,
			fieldType,
			source: sourceName,
			editable,
			hasOptions,
			editableComboboxTextEntry,
			dropdownLike,
			selectableLike,
			optionLike,
			selectionLike,
			editableTextLike,
			kind: inferObservedControlKind({
				role,
				tag,
				control,
				fieldType,
				editable,
				dropdownLike,
				selectableLike,
				optionLike,
			}),
		}
	}

	function isEditableComboboxTextEntry(info) {
		if (!info || info.editable !== true) return false
		if (info.sourceSelection || info.hasOptions || info.control) return false
		if (!['input', 'textarea', 'contenteditable'].includes(info.tag)) return false
		const role = info.role || ''
		if (role && !['combobox', 'searchbox', 'textbox'].includes(role)) return false
		return role === 'combobox' || role === 'searchbox' || !info.fieldType || !DROPDOWN_FIELD_TYPES.has(compactTypeToken(info.fieldType))
	}

	function inferObservedControlKind(info) {
		if (info.control === 'cascader' || info.control === 'cascader-parent' || info.control === 'cascader-leaf') {
			return 'cascader'
		}
		if (info.dropdownLike) return 'dropdown'
		if (info.selectableLike) return info.control || info.role || 'selectable'
		if (info.optionLike) return 'option'
		if (info.editable === true) return 'text'
		if (info.editable === false) return 'noneditable'
		return 'unknown'
	}

	function isObservedSelectionLike(item, source = '') {
		return describeObservedControl(item, source).selectionLike
	}

	function isObservedDropdownLike(item, source = '') {
		const info = describeObservedControl(item, source)
		return info.dropdownLike || info.kind === 'dropdown' || info.kind === 'cascader'
	}

	function isObservedPlainEditableText(item, source = '') {
		return describeObservedControl(item, source).editableTextLike
	}

	function scoreOptionTargetGeometry(optionRect, targetRect) {
		const option = normalizeRect(optionRect)
		const target = normalizeRect(targetRect)
		if (!option || !target) return Number.POSITIVE_INFINITY
		const overlap = Math.max(
			0,
			Math.min(option.left + option.width, target.left + target.width) -
				Math.max(option.left, target.left)
		)
		const minimumOverlap = Math.min(option.width, target.width) * GEOMETRY_ASSOCIATION.minOverlapRatio
		const fieldCenterX = target.left + target.width / 2
		const optionCenterX = option.left + option.width / 2
		const horizontallyNear =
			overlap >= minimumOverlap ||
			Math.abs(fieldCenterX - optionCenterX) <= Math.max(target.width, option.width)
		if (!horizontallyNear) return Number.POSITIVE_INFINITY
		const targetBottom = target.top + target.height
		const optionBottom = option.top + option.height
		const verticalGap = Math.min(
			Math.abs(option.top - targetBottom),
			Math.abs(target.top - optionBottom)
		)
		const maxGap = Math.max(
			GEOMETRY_ASSOCIATION.maxVerticalGapPx,
			target.height * GEOMETRY_ASSOCIATION.maxVerticalGapFieldHeights
		)
		if (verticalGap > maxGap) return Number.POSITIVE_INFINITY
		const belowBias = option.top >= target.top ? 0 : GEOMETRY_ASSOCIATION.aboveBias
		return verticalGap * 1000 + Math.abs(fieldCenterX - optionCenterX) + belowBias
	}

	function isOptionTargetGeometryRelated(optionRect, targetRect) {
		return Number.isFinite(scoreOptionTargetGeometry(optionRect, targetRect))
	}

	function scoreObservedOptionAssociation(optionItem, targetItem, options = {}) {
		const unknownScore = options.unknownScore === undefined
			? Number.POSITIVE_INFINITY
			: Number(options.unknownScore)
		if (!optionItem || !targetItem) return normalizeAssociationScore(unknownScore)
		const dateOptionScore = scoreDateOptionTargetAssociation(optionItem, targetItem)
		const controlledIds = extractObservedHintIdRefs(targetItem?.relationHints, ['aria-controls', 'aria-owns'])
		if (controlledIds.length) {
			if (observedOptionMatchesControlledPopup(optionItem, controlledIds)) return OPTION_ASSOCIATION_SCORES.controlledPopup
			if (
				Number.isFinite(dateOptionScore) &&
				isExpandedDateLikeTargetItem(targetItem) &&
				!dateOptionHasAuthoritativeOwnerConflict(optionItem, targetItem, controlledIds)
			) {
				return dateOptionScore
			}
			return Number.POSITIVE_INFINITY
		}
		const labelledByIds = extractObservedHintIdRefs(optionItem?.popupHints, ['popupLabelledBy'])
		if (labelledByIds.length) {
			const targetIds = getObservedTargetAssociationIds(targetItem)
			if (targetIds.length) {
				const matched = labelledByIds.some((id) => targetIds.includes(id))
				if (matched) return OPTION_ASSOCIATION_SCORES.popupLabelledBy
				if (Number.isFinite(dateOptionScore) && isExpandedDateLikeTargetItem(targetItem)) return dateOptionScore
				return Number.POSITIVE_INFINITY
			}
		}
		if (Number.isFinite(dateOptionScore)) return dateOptionScore
		const geometryScore = scoreOptionTargetGeometry(optionItem?.rect, targetItem?.rect)
		if (Number.isFinite(geometryScore)) {
			return geometryScore + OPTION_ASSOCIATION_SCORES.geometryOffset
		}
		return normalizeAssociationScore(unknownScore)
	}

	function collectActiveNewPopupItemsForTargets(items, targetItems) {
		const targets = (Array.isArray(targetItems) ? targetItems : [targetItems]).filter(isExpandedOptionTarget)
		if (!targets.length) return []
		const active = (Array.isArray(items) ? items : [])
			.filter((item) =>
				item?.newSinceLastObservation &&
				isPopupOptionItem(item) &&
				targets.some((target) => !hasPopupLabelOwnerConflict(item, target))
			)
		if (!active.length) return []
		const groups = new Map()
		for (const item of active) {
			const key = getPopupGroupKey(item)
			if (!groups.has(key)) groups.set(key, [])
			groups.get(key).push(item)
		}
		return groups.size === 1 ? active : []
	}

	function isActiveNewPopupItemForTargets(item, targetItems) {
		return collectActiveNewPopupItemsForTargets([item], targetItems).includes(item)
	}

	function isExpandedOptionTarget(item) {
		const text = [
			item?.expandedState,
			item?.stateHints,
			item?.popupHints,
			item?.valueState,
		].map((value) => String(value || '').toLowerCase()).join(' ')
		return /(expanded|open|opened|visible|active|已展开|展开|打开)/i.test(text)
	}

	function isPopupOptionItem(item) {
		const region = String(item?.region || '').toLowerCase()
		const hints = String(item?.popupHints || '').toLowerCase()
		const role = String(item?.role || '').toLowerCase()
		const kind = String(item?.selectionControl || item?.controlKind || '').toLowerCase()
		return region === 'popover' ||
			region === 'popup' ||
			/(popup|popper|listbox|dropdown|picker|calendar|cascader)/i.test(hints) ||
			['option', 'treeitem', 'menuitem'].includes(role) ||
			/(option|dropdown|select|cascader|picker|date|time)/i.test(kind)
	}

	function hasPopupLabelOwnerConflict(item, targetItem) {
		const labelledByIds = extractObservedHintIdRefs(item?.popupHints, ['popupLabelledBy'])
		if (!labelledByIds.length) return false
		const targetIds = [
			String(targetItem?.selectorHints?.id || '').trim(),
			...extractObservedHintIdRefs(targetItem?.relationHints, ['for', 'aria-labelledby', 'aria-describedby']),
		].filter(Boolean)
		if (!targetIds.length) return false
		return !labelledByIds.some((id) => targetIds.includes(id))
	}

	function getPopupGroupKey(item) {
		const ids = [
			...extractObservedHintIdRefs(item?.popupHints, ['popupId']),
			...extractObservedHintIdRefs(item?.popupHints, ['popupLabelledBy']),
		]
		if (ids.length) return ids.join('|')
		const rect = item?.rect || {}
		const region = String(item?.region || 'popover')
		return `${region}:${Math.round(Number(rect.left) || 0)}:${Math.round(Number(rect.width) || 0)}`
	}

	function dateOptionHasAuthoritativeOwnerConflict(optionItem, targetItem, controlledIds = []) {
		if (!isDatePickerOptionItem(optionItem) || !isDateLikeTargetItem(targetItem)) return false
		const popupIds = extractObservedHintIdRefs(optionItem?.popupHints, ['popupId'])
		if (
			popupIds.length &&
			Array.isArray(controlledIds) &&
			controlledIds.length &&
			!popupIds.some((id) => controlledIds.includes(id))
		) {
			return true
		}
		const labelledByIds = extractObservedHintIdRefs(optionItem?.popupHints, ['popupLabelledBy'])
		if (!labelledByIds.length) return false
		const targetIds = getObservedTargetAssociationIds(targetItem)
		if (!targetIds.length) return false
		return !labelledByIds.some((id) => targetIds.includes(id))
	}

	function scoreDateOptionTargetAssociation(optionItem, targetItem) {
		if (!isDatePickerOptionItem(optionItem) || !isDateLikeTargetItem(targetItem)) return Number.POSITIVE_INFINITY
		if (isCollapsedDateLikeTargetItem(targetItem)) return Number.POSITIVE_INFINITY
		const option = normalizeRect(optionItem?.rect)
		const target = normalizeRect(targetItem?.rect)
		if (!option || !target) return Number.POSITIVE_INFINITY
		const expandedScore = scoreExpandedDatePopupAssociation(option, target, targetItem)
		if (Number.isFinite(expandedScore)) return expandedScore
		const targetBottom = target.top + target.height
		const optionBottom = option.top + option.height
		const verticalGap = Math.min(
			Math.abs(option.top - targetBottom),
			Math.abs(target.top - optionBottom)
		)
		if (verticalGap > DATE_OPTION_ASSOCIATION.maxVerticalGapPx) return Number.POSITIVE_INFINITY
		const fieldCenterX = target.left + target.width / 2
		const optionCenterX = option.left + option.width / 2
		const horizontalDistance = Math.abs(fieldCenterX - optionCenterX)
		const maxHorizontalDistance = Math.max(
			DATE_OPTION_ASSOCIATION.maxHorizontalDistancePx,
			target.width * DATE_OPTION_ASSOCIATION.maxHorizontalDistanceFieldWidths
		)
		if (horizontalDistance > maxHorizontalDistance) {
			return scoreNearbyDatePopupAssociation(option, target, targetItem, {
				verticalGap,
				horizontalDistance,
			})
		}
		const aboveBias = option.top >= target.top ? 0 : DATE_OPTION_ASSOCIATION.aboveBias
		return OPTION_ASSOCIATION_SCORES.geometryOffset + verticalGap * 1000 + horizontalDistance + aboveBias
	}

	function scoreNearbyDatePopupAssociation(option, target, targetItem, measurements = {}) {
		if (!isDateLikeTargetItem(targetItem) || isCollapsedDateLikeTargetItem(targetItem)) {
			return Number.POSITIVE_INFINITY
		}
		const verticalGap = Number(measurements.verticalGap)
		const horizontalDistance = Number(measurements.horizontalDistance)
		if (!Number.isFinite(verticalGap) || !Number.isFinite(horizontalDistance)) {
			return Number.POSITIVE_INFINITY
		}
		if (verticalGap > DATE_OPTION_ASSOCIATION.maxNearbyVerticalGapPx) {
			return Number.POSITIVE_INFINITY
		}
		const maxHorizontalDistance = Math.max(
			DATE_OPTION_ASSOCIATION.maxNearbyHorizontalDistancePx,
			target.width * DATE_OPTION_ASSOCIATION.maxNearbyHorizontalDistanceFieldWidths
		)
		if (horizontalDistance > maxHorizontalDistance) return Number.POSITIVE_INFINITY
		const targetBottom = target.top + target.height
		const optionBottom = option.top + option.height
		const optionNearVerticalBand =
			option.top >= target.top - DATE_OPTION_ASSOCIATION.maxVerticalGapPx &&
			target.top <= optionBottom + DATE_OPTION_ASSOCIATION.maxVerticalGapPx
		if (!optionNearVerticalBand) return Number.POSITIVE_INFINITY
		const aboveBias = option.top >= targetBottom ? 0 : DATE_OPTION_ASSOCIATION.aboveBias
		return OPTION_ASSOCIATION_SCORES.geometryOffset + 450 + verticalGap * 600 + horizontalDistance + aboveBias
	}

	function scoreExpandedDatePopupAssociation(option, target, targetItem) {
		if (!isExpandedDateLikeTargetItem(targetItem)) return Number.POSITIVE_INFINITY
		const targetBottom = target.top + target.height
		const optionBottom = option.top + option.height
		const verticalGap = Math.min(
			Math.abs(option.top - targetBottom),
			Math.abs(target.top - optionBottom)
		)
		if (verticalGap > DATE_OPTION_ASSOCIATION.maxExpandedVerticalGapPx) return Number.POSITIVE_INFINITY
		const fieldCenterX = target.left + target.width / 2
		const optionCenterX = option.left + option.width / 2
		const horizontalDistance = Math.abs(fieldCenterX - optionCenterX)
		return OPTION_ASSOCIATION_SCORES.expandedDatePopup +
			Math.min(420, verticalGap / 2) +
			Math.min(220, horizontalDistance / 3)
	}

	function isDatePickerOptionItem(item) {
		const info = describeObservedControl(item, 'popups')
		if (info.control === 'date-option') return true
		const label = String(item?.label || item?.text || '').trim()
		return info.optionLike && /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(label)
	}

	function isDateLikeTargetItem(item) {
		const info = describeObservedControl(item, 'forms')
		if (isDateLikeFieldTypeToken(info.fieldType)) return true
		const text = [
			item?.fieldType,
			item?.label,
			item?.placeholder,
			item?.name,
			item?.text,
			item?.semanticContainer,
			item?.selectionControl,
			item?.controlKind,
		].map((value) => String(value || '')).join(' ')
		return /日期|时间|date|time|range|picker/i.test(text)
	}

	function isDateLikeFieldTypeToken(value) {
		const key = compactTypeToken(value)
		return [
			'date',
			'time',
			'datetime',
			'month',
			'year',
			'week',
			'daterange',
			'datetimerange',
			'timerange',
			'monthrange',
			'yearrange',
			'weekrange',
		].includes(key)
	}

	function isExpandedDateLikeTargetItem(item) {
		if (!isDateLikeTargetItem(item)) return false
		const stateText = [
			item?.expandedState,
			item?.stateHints,
			item?.popupHints,
		].map((value) => String(value || '').toLowerCase()).join(' ')
		return /(expanded|open|opened|visible|active|弹层|展开|已展开)/i.test(stateText)
	}

	function isCollapsedDateLikeTargetItem(item) {
		if (!isDateLikeTargetItem(item)) return false
		const stateText = [
			item?.expandedState,
			item?.stateHints,
			item?.popupHints,
		].map((value) => String(value || '').toLowerCase()).join(' ')
		return /(collapsed|closed|hidden|inactive|收起|关闭|未展开)/i.test(stateText)
	}

	function observedOptionMatchesControlledPopup(optionItem, controlledIds) {
		if (!optionItem || !Array.isArray(controlledIds) || !controlledIds.length) return false
		const popupHints = String(optionItem.popupHints || '')
		const selectorId = String(optionItem.selectorHints?.id || '')
		const relationHints = String(optionItem.relationHints || '')
		return controlledIds.some((id) => {
			const escaped = escapeRegExp(id)
			return (
				selectorId === id ||
				new RegExp(`(?:^|,)popupId=${escaped}(?:,|$)`).test(popupHints) ||
				new RegExp(`(?:^|,)(?:aria-controls|aria-owns|aria-activedescendant)=${escaped}(?:,|$)`).test(relationHints)
			)
		})
	}

	function observedOptionMatchesPopupLabelledByTarget(optionItem, targetItem) {
		const labelledByIds = extractObservedHintIdRefs(optionItem?.popupHints, ['popupLabelledBy'])
		if (!labelledByIds.length) return false
		const targetIds = getObservedTargetAssociationIds(targetItem)
		return labelledByIds.some((id) => targetIds.includes(id))
	}

	function getObservedTargetAssociationIds(item) {
		const ids = [
			String(item?.selectorHints?.id || '').trim(),
			...extractObservedHintIdRefs(String(item?.relationHints || ''), ['for', 'aria-labelledby', 'aria-describedby']),
		].filter(Boolean)
		return [...new Set(ids)]
	}

	function extractObservedHintIdRefs(hints, names) {
		const text = String(hints || '')
		const ids = []
		for (const name of (Array.isArray(names) ? names : [])) {
			const pattern = new RegExp(`${escapeRegExp(name)}=([^,]+)`, 'g')
			for (const match of text.matchAll(pattern)) {
				for (const value of String(match[1] || '').split(/\s+/)) {
					const id = value.trim()
					if (id) ids.push(id)
				}
			}
		}
		return [...new Set(ids)]
	}

	function normalizeRect(rect) {
		if (!rect || typeof rect !== 'object') return null
		const left = Number(rect.left)
		const top = Number(rect.top)
		const width = Number(rect.width)
		const height = Number(rect.height)
		if (!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) return null
		return { left, top, width, height }
	}

	function normalizeAssociationScore(value) {
		return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
	}

	function normalizeToken(value) {
		const raw = String(value || '').trim().toLowerCase()
		return raw === '-' ? '' : raw
	}

	function compactTypeToken(value) {
		return normalizeToken(value).replace(/[-_\s]+/g, '')
	}

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	g.NC_CONTROL_SEMANTICS = {
		DROPDOWN_FIELD_TYPES,
		DATE_OPTION_ASSOCIATION,
		GEOMETRY_ASSOCIATION,
		OPTION_ASSOCIATION_SCORES,
		collectActiveNewPopupItemsForTargets,
		describeObservedControl,
		extractObservedHintIdRefs,
		getObservedTargetAssociationIds,
		isActiveNewPopupItemForTargets,
		isOptionTargetGeometryRelated,
		isDateLikeFieldTypeToken,
		isObservedDropdownLike,
		isObservedPlainEditableText,
		isObservedSelectionLike,
		normalizeRect,
		normalizeToken,
		compactTypeToken,
		observedOptionMatchesControlledPopup,
		observedOptionMatchesPopupLabelledByTarget,
		scoreNearbyDatePopupAssociation,
		scoreExpandedDatePopupAssociation,
		scoreDateOptionTargetAssociation,
		scoreObservedOptionAssociation,
		scoreOptionTargetGeometry,
	}
})(globalThis)
