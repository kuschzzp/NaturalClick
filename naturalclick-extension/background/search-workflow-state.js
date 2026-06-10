;(function (g) {
	const SEARCH_STATE_VERSION = 6

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
				skippedKeys: [],
				resetCompletedKeys: [],
				resultsByKey: {},
				clearRetryAttemptsByKey: {},
				clearFailureDetailsByKey: {},
				evidenceRequestAttemptsByKey: {},
				failedLabelsByKey: {},
				dropdownOpenAttemptsByKey: {},
				pendingDateRangeStartByKey: {},
				pendingDropdownCandidates: [],
				pendingDropdownOutput: '',
				pendingDropdownFieldKey: '',
				baselineResetDone: false,
				terminalFieldKey: '',
				failedReason: '',
				seededFromHistory: false,
			}
		}

		function normalizeSearchStateVersion(state) {
			if (!state || typeof state !== 'object') return
			if (Number(state.version) === SEARCH_STATE_VERSION) {
				if (typeof state.baselineResetDone !== 'boolean') state.baselineResetDone = false
				if (!state.resultsByKey || typeof state.resultsByKey !== 'object') state.resultsByKey = {}
				if (!state.clearRetryAttemptsByKey || typeof state.clearRetryAttemptsByKey !== 'object') state.clearRetryAttemptsByKey = {}
				if (!state.clearFailureDetailsByKey || typeof state.clearFailureDetailsByKey !== 'object') state.clearFailureDetailsByKey = {}
				if (!Array.isArray(state.skippedKeys)) state.skippedKeys = []
				if (!state.evidenceRequestAttemptsByKey || typeof state.evidenceRequestAttemptsByKey !== 'object') state.evidenceRequestAttemptsByKey = {}
				if (!state.pendingDateRangeStartByKey || typeof state.pendingDateRangeStartByKey !== 'object') state.pendingDateRangeStartByKey = {}
				if (typeof state.pendingDropdownFieldKey !== 'string') state.pendingDropdownFieldKey = ''
				if (typeof state.terminalFieldKey !== 'string') state.terminalFieldKey = ''
				return
			}
			state.version = SEARCH_STATE_VERSION
			const phase = String(state.phase || '').trim()
			if (isTerminalSearchPhase(phase) || phase === 'failed') return
			state.phase = 'select_field'
			state.activeFieldKey = ''
			state.lastSearchedFieldKey = ''
			state.fieldOrder = []
			state.fields = {}
			state.completedKeys = []
			state.skippedKeys = []
			state.resetCompletedKeys = []
			state.resultsByKey = {}
			state.clearRetryAttemptsByKey = {}
			state.clearFailureDetailsByKey = {}
			state.evidenceRequestAttemptsByKey = {}
			state.failedLabelsByKey = {}
			state.dropdownOpenAttemptsByKey = {}
			state.pendingDateRangeStartByKey = {}
			state.pendingDropdownCandidates = []
			state.pendingDropdownOutput = ''
			state.pendingDropdownFieldKey = ''
			state.baselineResetDone = false
			state.terminalFieldKey = ''
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
			state.skippedKeys = (Array.isArray(state.skippedKeys) ? state.skippedKeys : []).filter((key) => !!nextFields[key])
			state.resetCompletedKeys = (Array.isArray(state.resetCompletedKeys) ? state.resetCompletedKeys : []).filter((key) => !!nextFields[key])
			if (!state.resultsByKey || typeof state.resultsByKey !== 'object') state.resultsByKey = {}
			for (const key of Object.keys(state.resultsByKey || {})) {
				if (!nextFields[key]) delete state.resultsByKey[key]
			}
			if (!state.clearRetryAttemptsByKey || typeof state.clearRetryAttemptsByKey !== 'object') state.clearRetryAttemptsByKey = {}
			for (const key of Object.keys(state.clearRetryAttemptsByKey || {})) {
				if (!nextFields[key]) delete state.clearRetryAttemptsByKey[key]
			}
			if (!state.clearFailureDetailsByKey || typeof state.clearFailureDetailsByKey !== 'object') state.clearFailureDetailsByKey = {}
			for (const key of Object.keys(state.clearFailureDetailsByKey || {})) {
				if (!nextFields[key]) delete state.clearFailureDetailsByKey[key]
			}
			if (!state.evidenceRequestAttemptsByKey || typeof state.evidenceRequestAttemptsByKey !== 'object') state.evidenceRequestAttemptsByKey = {}
			for (const key of Object.keys(state.evidenceRequestAttemptsByKey || {})) {
				if (!nextFields[key]) delete state.evidenceRequestAttemptsByKey[key]
			}
			for (const key of Object.keys(state.failedLabelsByKey || {})) {
				if (!nextFields[key]) delete state.failedLabelsByKey[key]
			}
			for (const key of Object.keys(state.dropdownOpenAttemptsByKey || {})) {
				if (!nextFields[key]) delete state.dropdownOpenAttemptsByKey[key]
			}
			if (!state.pendingDateRangeStartByKey || typeof state.pendingDateRangeStartByKey !== 'object') state.pendingDateRangeStartByKey = {}
			for (const key of Object.keys(state.pendingDateRangeStartByKey || {})) {
				if (!nextFields[key]) delete state.pendingDateRangeStartByKey[key]
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

		function markSearchFieldSkipped(state, key) {
			if (!key) return
			if (!Array.isArray(state.skippedKeys)) state.skippedKeys = []
			if (!state.skippedKeys.includes(key)) state.skippedKeys.push(key)
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

		function incrementClearRetryAttempt(state, key) {
			if (!key) return 0
			if (!state.clearRetryAttemptsByKey || typeof state.clearRetryAttemptsByKey !== 'object') {
				state.clearRetryAttemptsByKey = {}
			}
			state.clearRetryAttemptsByKey[key] = Number(state.clearRetryAttemptsByKey[key] || 0) + 1
			return state.clearRetryAttemptsByKey[key]
		}

		function getClearRetryAttemptCount(state, key) {
			if (!key || !state?.clearRetryAttemptsByKey) return 0
			const count = Number(state.clearRetryAttemptsByKey[key])
			return Number.isFinite(count) ? count : 0
		}

		function rememberClearFailureDetail(state, key, detail) {
			if (!key || !state || typeof state !== 'object') return
			if (!state.clearFailureDetailsByKey || typeof state.clearFailureDetailsByKey !== 'object') {
				state.clearFailureDetailsByKey = {}
			}
			state.clearFailureDetailsByKey[key] = detail && typeof detail === 'object' ? { ...detail } : {}
		}

		function getClearFailureDetail(state, key) {
			if (!key || !state?.clearFailureDetailsByKey || typeof state.clearFailureDetailsByKey !== 'object') return null
			const detail = state.clearFailureDetailsByKey[key]
			return detail && typeof detail === 'object' ? detail : null
		}

		function incrementEvidenceRequestAttempt(state, key) {
			if (!key) return 0
			if (!state.evidenceRequestAttemptsByKey || typeof state.evidenceRequestAttemptsByKey !== 'object') {
				state.evidenceRequestAttemptsByKey = {}
			}
			state.evidenceRequestAttemptsByKey[key] = Number(state.evidenceRequestAttemptsByKey[key] || 0) + 1
			return state.evidenceRequestAttemptsByKey[key]
		}

		function getEvidenceRequestAttemptCount(state, key) {
			if (!key || !state?.evidenceRequestAttemptsByKey) return 0
			const count = Number(state.evidenceRequestAttemptsByKey[key])
			return Number.isFinite(count) ? count : 0
		}

		function getNextPendingField(state, fields) {
			for (const key of state.fieldOrder || []) {
				if (isSearchFieldDone(state, key)) continue
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
				if (!seenCurrent || isSearchFieldDone(state, key)) continue
				if (getFieldByKey(fields, key)) return true
			}
			return false
		}

		function isSearchFieldDone(state, key) {
			return (Array.isArray(state?.completedKeys) && state.completedKeys.includes(key)) ||
				(Array.isArray(state?.skippedKeys) && state.skippedKeys.includes(key))
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
			markSearchFieldSkipped,
			countCompletedFields,
			rememberFailedSelectionLabel,
			incrementDropdownOpenAttempt,
			getDropdownOpenAttemptCount,
			incrementClearRetryAttempt,
			getClearRetryAttemptCount,
			rememberClearFailureDetail,
			getClearFailureDetail,
			incrementEvidenceRequestAttempt,
			getEvidenceRequestAttemptCount,
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
