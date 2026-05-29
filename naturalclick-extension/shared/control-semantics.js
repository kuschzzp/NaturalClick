;(function (g) {
	const DROPDOWN_FIELD_TYPES = new Set([
		'select',
		'platform',
		'role',
		'department',
		'position',
		'region',
		'gender',
		'date',
		'time',
		'daterange',
		'datetime',
	])
	const ALWAYS_SELECTION_FIELD_TYPES = new Set([
		'select',
		'platform',
		'role',
		'department',
		'position',
		'region',
		'gender',
		'status',
		'state',
		'category',
	])
	const DROPDOWN_ROLES = new Set(['combobox', 'listbox'])
	const OPTION_ROLES = new Set(['option', 'treeitem'])
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
		geometryOffset: 1000,
		unknown: Number.MAX_SAFE_INTEGER,
	})

	function describeObservedControl(item, source = '') {
		const role = normalizeToken(item?.role)
		const tag = normalizeToken(item?.tag)
		const control = normalizeToken(item?.selectionControl || item?.control)
		const fieldType = normalizeToken(item?.fieldType)
		const sourceName = normalizeToken(source).split(':')[0]
		const editable = item?.editable === true ? true : item?.editable === false ? false : null
		const hasOptions = Array.isArray(item?.optionLabels) && item.optionLabels.length > 0
		const sourceSelection = SELECTION_SOURCES.has(sourceName)
		const fieldTypeSuggestsDropdown =
			ALWAYS_SELECTION_FIELD_TYPES.has(fieldType) ||
			(DROPDOWN_FIELD_TYPES.has(fieldType) &&
			!(editable === true && role === 'textbox' && !control && !hasOptions)
			)
		const dropdownLike =
			DROPDOWN_CONTROLS.has(control) ||
			DROPDOWN_ROLES.has(role) ||
			tag === 'select' ||
			hasOptions ||
			fieldTypeSuggestsDropdown
		const selectableLike =
			SELECTABLE_CONTROLS.has(control) ||
			SELECTABLE_ROLES.has(role)
		const optionLike =
			sourceSelection ||
			OPTION_ROLES.has(role) ||
			control === 'cascader-leaf'
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
		const controlledIds = extractObservedHintIdRefs(targetItem?.relationHints, ['aria-controls', 'aria-owns'])
		if (controlledIds.length) {
			return observedOptionMatchesControlledPopup(optionItem, controlledIds)
				? OPTION_ASSOCIATION_SCORES.controlledPopup
				: Number.POSITIVE_INFINITY
		}
		const labelledByIds = extractObservedHintIdRefs(optionItem?.popupHints, ['popupLabelledBy'])
		if (labelledByIds.length) {
			const targetIds = getObservedTargetAssociationIds(targetItem)
			return labelledByIds.some((id) => targetIds.includes(id))
				? OPTION_ASSOCIATION_SCORES.popupLabelledBy
				: Number.POSITIVE_INFINITY
		}
		const geometryScore = scoreOptionTargetGeometry(optionItem?.rect, targetItem?.rect)
		if (Number.isFinite(geometryScore)) {
			return geometryScore + OPTION_ASSOCIATION_SCORES.geometryOffset
		}
		return normalizeAssociationScore(unknownScore)
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

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	g.NC_CONTROL_SEMANTICS = {
		DROPDOWN_FIELD_TYPES,
		GEOMETRY_ASSOCIATION,
		OPTION_ASSOCIATION_SCORES,
		describeObservedControl,
		extractObservedHintIdRefs,
		getObservedTargetAssociationIds,
		isOptionTargetGeometryRelated,
		isObservedDropdownLike,
		isObservedPlainEditableText,
		isObservedSelectionLike,
		normalizeRect,
		normalizeToken,
		observedOptionMatchesControlledPopup,
		observedOptionMatchesPopupLabelledByTarget,
		scoreObservedOptionAssociation,
		scoreOptionTargetGeometry,
	}
})(globalThis)
