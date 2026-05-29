;(function (g) {
	const SEARCH_STATE_VERSION = 2

	function createSearchStateHelpers(deps = {}) {
		const getFieldKey = typeof deps.getFieldKey === 'function' ? deps.getFieldKey : () => ''
		const getFieldLabel = typeof deps.getFieldLabel === 'function' ? deps.getFieldLabel : () => ''
		const isTerminalSearchPhase = typeof deps.isTerminalSearchPhase === 'function' ? deps.isTerminalSearchPhase : () => false
		const isFilled = typeof deps.isFilled === 'function' ? deps.isFilled : () => false
		const normalizeText = typeof deps.normalizeText === 'function'
			? deps.normalizeText
			: (value) => String(value || '').replace(/\s+/g, '').trim()

		function syncSearchState(session, fields, seedSearchStateFromHistory) {
			if (!session || typeof session !== 'object') return null
			const keys = fields.map(getFieldKey).filter(Boolean)
			if (!keys.length) return null
			if (!session.workflowState || typeof session.workflowState !== 'object') session.workflowState = {}
			const existing = session.workflowState.search
			const state = existing && typeof existing === 'object' ? existing : createSearchState()
			session.workflowState.search = state
			normalizeSearchStateVersion(state)
			refreshSearchStateFields(state, fields)
			if (!state.seededFromHistory) {
				if (typeof seedSearchStateFromHistory === 'function') {
					seedSearchStateFromHistory(state, session, fields)
				}
				state.seededFromHistory = true
			}
			if (state.activeFieldKey && !getFieldByKey(fields, state.activeFieldKey) && !isTerminalSearchPhase(state.phase)) {
				state.activeFieldKey = ''
				state.phase = state.phase === 'failed' ? 'failed' : 'select_field'
			}
			return state
		}

		function createSearchState() {
			return {
				version: SEARCH_STATE_VERSION,
				phase: 'select_field',
				activeFieldKey: '',
				lastSearchedFieldKey: '',
				fieldOrder: [],
				fields: {},
				completedKeys: [],
				resetCompletedKeys: [],
				failedLabelsByKey: {},
				dropdownOpenAttemptsByKey: {},
				pendingDropdownCandidates: [],
				pendingDropdownOutput: '',
				failedReason: '',
				seededFromHistory: false,
			}
		}

		function normalizeSearchStateVersion(state) {
			if (!state || typeof state !== 'object') return
			if (Number(state.version) === SEARCH_STATE_VERSION) return
			state.version = SEARCH_STATE_VERSION
			const phase = String(state.phase || '').trim()
			if (isTerminalSearchPhase(phase) || phase === 'failed') return
			state.phase = 'select_field'
			state.activeFieldKey = ''
			state.lastSearchedFieldKey = ''
			state.fieldOrder = []
			state.fields = {}
			state.completedKeys = []
			state.resetCompletedKeys = []
			state.failedLabelsByKey = {}
			state.dropdownOpenAttemptsByKey = {}
			state.pendingDropdownCandidates = []
			state.pendingDropdownOutput = ''
			state.failedReason = ''
			state.seededFromHistory = false
		}

		function refreshSearchStateFields(state, fields) {
			const nextFields = {}
			const nextOrder = []
			for (const field of fields || []) {
				const key = getFieldKey(field)
				if (!key || nextFields[key]) continue
				nextOrder.push(key)
				nextFields[key] = {
					...(state.fields?.[key] || {}),
					key,
					index: Number(field.index),
					label: getFieldLabel(field),
					fieldType: String(field?.fieldType || ''),
				}
			}
			state.fieldOrder = nextOrder
			state.fields = nextFields
			state.completedKeys = (Array.isArray(state.completedKeys) ? state.completedKeys : []).filter((key) => !!nextFields[key])
			state.resetCompletedKeys = (Array.isArray(state.resetCompletedKeys) ? state.resetCompletedKeys : []).filter((key) => !!nextFields[key])
			for (const key of Object.keys(state.failedLabelsByKey || {})) {
				if (!nextFields[key]) delete state.failedLabelsByKey[key]
			}
			for (const key of Object.keys(state.dropdownOpenAttemptsByKey || {})) {
				if (!nextFields[key]) delete state.dropdownOpenAttemptsByKey[key]
			}
		}

		function markSearchWorkflowFailed(state, reason) {
			state.phase = 'failed'
			state.failedReason = String(reason || '搜索工作流动作失败')
		}

		function markSearchFieldCompleted(state, key, options = {}) {
			if (!key) return
			if (!Array.isArray(state.completedKeys)) state.completedKeys = []
			if (!state.completedKeys.includes(key)) state.completedKeys.push(key)
			if (options.requiresClear) {
				if (!Array.isArray(state.resetCompletedKeys)) state.resetCompletedKeys = []
				if (!state.resetCompletedKeys.includes(key)) state.resetCompletedKeys.push(key)
			}
		}

		function countCompletedFields(state) {
			return Array.isArray(state?.completedKeys) ? state.completedKeys.length : 0
		}

		function rememberFailedSelectionLabel(state, key, label) {
			const text = normalizeText(label)
			if (!key || !text) return
			if (!state.failedLabelsByKey || typeof state.failedLabelsByKey !== 'object') state.failedLabelsByKey = {}
			if (!Array.isArray(state.failedLabelsByKey[key])) state.failedLabelsByKey[key] = []
			if (!state.failedLabelsByKey[key].includes(text)) state.failedLabelsByKey[key].push(text)
		}

		function incrementDropdownOpenAttempt(state, key) {
			if (!key) return
			if (!state.dropdownOpenAttemptsByKey || typeof state.dropdownOpenAttemptsByKey !== 'object') {
				state.dropdownOpenAttemptsByKey = {}
			}
			state.dropdownOpenAttemptsByKey[key] = Number(state.dropdownOpenAttemptsByKey[key] || 0) + 1
		}

		function getDropdownOpenAttemptCount(state, key) {
			if (!key || !state?.dropdownOpenAttemptsByKey) return 0
			const count = Number(state.dropdownOpenAttemptsByKey[key])
			return Number.isFinite(count) ? count : 0
		}

		function getNextPendingField(state, fields) {
			for (const key of state.fieldOrder || []) {
				if ((state.completedKeys || []).includes(key)) continue
				const field = getFieldByKey(fields, key)
				if (field) return field
			}
			return null
		}

		function hasPendingFieldAfter(state, fields, currentKey) {
			let seenCurrent = false
			for (const key of state.fieldOrder || []) {
				if (key === currentKey) {
					seenCurrent = true
					continue
				}
				if (!seenCurrent || (state.completedKeys || []).includes(key)) continue
				if (getFieldByKey(fields, key)) return true
			}
			return false
		}

		function getLastSearchedField(state, fields) {
			return getFieldByKey(fields, state.lastSearchedFieldKey) || getFieldByKey(fields, state.activeFieldKey)
		}

		function getFieldByKey(fields, key) {
			if (!key) return null
			return (fields || []).find((field) => getFieldKey(field) === key) || null
		}

		function findFieldByIndex(fields, indexValue) {
			const index = Number(indexValue)
			if (!Number.isFinite(index)) return null
			return (fields || []).find((field) => Number(field?.index) === index) || null
		}

		function findKnownFieldKeyByIndex(state, indexValue) {
			const index = Number(indexValue)
			if (!Number.isFinite(index)) return ''
			for (const key of Object.keys(state?.fields || {})) {
				if (Number(state.fields[key]?.index) === index) return key
			}
			return ''
		}

		function findUnclearedCompletedField(state, fields) {
			for (const key of state.resetCompletedKeys || []) {
				const field = getFieldByKey(fields, key)
				if (field && isFilled(field)) return field
			}
			return null
		}

		return {
			SEARCH_STATE_VERSION,
			syncSearchState,
			createSearchState,
			markSearchWorkflowFailed,
			markSearchFieldCompleted,
			countCompletedFields,
			rememberFailedSelectionLabel,
			incrementDropdownOpenAttempt,
			getDropdownOpenAttemptCount,
			getNextPendingField,
			hasPendingFieldAfter,
			getLastSearchedField,
			getFieldByKey,
			findFieldByIndex,
			findKnownFieldKeyByIndex,
			findUnclearedCompletedField,
		}
	}

	g.NC_BG_SEARCH_WORKFLOW_STATE = {
		SEARCH_STATE_VERSION,
		createSearchStateHelpers,
	}
	g.NC_BG_SEARCH_WORKFLOW_STATE_TESTS = {
		SEARCH_STATE_VERSION,
		createSearchStateHelpers,
	}
})(globalThis)
