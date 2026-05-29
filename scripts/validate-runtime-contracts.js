#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')
const vm = require('vm')

const repoRoot = path.resolve(__dirname, '..')
const extensionRoot = path.join(repoRoot, 'naturalclick-extension')

const forbiddenBusinessPatterns = [
	/用户管理/,
	/客户管理/,
	/system\/user/,
	/已知业务路由/,
	/登录按钮兜底/,
	/findCandidateByTaskTargets/,
	/shouldClickTaskTarget/,
	/deriveDeterministicDecision/,
	/isKnownTargetPage/,
	/确定性兜底/,
]

const repeatableActions = [
	'scroll',
	'scroll_horizontally',
	'keypress',
]

async function main() {
	const jsFiles = listFiles(extensionRoot).filter((file) => file.endsWith('.js'))
	const checked = []
	for (const file of jsFiles) {
		childProcess.execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
		checked.push(path.relative(repoRoot, file))
	}

	assertNoForbiddenBusinessFallbacks(listFiles(extensionRoot))
	assertPlannerFastPathBehavior()
	await assertPlannerUsesModelDecisionOnTarget()
	await assertPlannerCompactRetryAfterTimeout()
	await assertPlannerStartsCompactForLargeObservation()
	await assertPlannerDoesNotRepeatCompactTimeoutForLargeObservation()
	await assertPlannerPublishesPlanningProgress()
	await assertPlannerModelClientTraceDiagnostics()
	await assertPlannerTimeoutWithoutRecoveryEndsGracefully()
	await assertPlannerHistoryOutcomeGuidesReplanning()
	await assertPlannerRejectsRepeatedFailedDropdownRequest()
	await assertPlannerRejectsRepeatedDropdownOpenAfterVisibleOptions()
	await assertPlannerRejectsInvisibleDropdownTextWhenScopedOptionsVisible()
	await assertPlannerTimeoutRecoveryStopsUnresolvedTaskNavigation()
	await assertPlannerReactContextRound()
	assertPlannerObservationOmissionHints()
	await assertPlannerRequestContextPaginationBounds()
	await assertPlannerInspectIndexCoversFormsOnlyMatch()
	await assertPlannerOptionsContextIncludesNativeSelectOptions()
	await assertPlannerOptionsContextScopesVisibleCandidatesToField()
	await assertPlannerOptionsContextUsesExplicitPopupOwner()
	await assertPlannerOptionsContextUsesPopupLabelledByOwner()
	await assertPlannerDuplicateReactRequestWarnsAndRecovers()
	await assertPlannerInvalidModelOutputReplansBeforeFailing()
	await assertPlannerNormalizesActionOutputVariants()
	await assertPlannerInvalidActionReplansBeforeExecution()
	await assertPlannerInvalidActionInputReplansBeforeExecution()
	await assertPlannerRejectsTextInputOnNonEditableSelectionControl()
	await assertPlannerRejectsTextInputWhenAnySameIndexSourceIsSelectionControl()
	await assertPlannerRejectsDropdownOnPlainEditableInput()
	await assertPlannerAllowsDropdownOpenWithoutOptionText()
	await assertPlannerRejectsUnscopedChooseDropdownOption()
	await assertPlannerAllowsLocateByVisionWithStaleIndex()
	await assertPlannerRejectsLocateByVisionWithoutTargetDescription()
	assertNativeSelectUsesSelectionSemantics()
	assertInputVerificationUsesResolvedEditableTarget()
	assertCompositeSelectDoesNotResolveNestedInput()
	assertReadonlyPickerInputsExposeDropdownSemantics()
	assertCompositePickerWrappersAreObserved()
	assertDropdownActionsUseCompositePickerTriggers()
	assertObserverPreservesNestedNavigationItems()
	assertVisionHitTestClickableSemantics()
	assertVisionCandidatesUseSemanticTargetDescription()
	assertVisionCaptureHidesNaturalClickOverlays()
	assertPlannerBudgetCoversInternalRounds()
	await assertAskUserToolTimesOut()
	await assertExplicitDropdownToolsAreRegisteredAndRouted()
	assertLoopGuardBehavior()
	assertLoopGuardAllowsVerifiedProgressRepeats()
	assertVisionFallbackSkipsSemanticActionFailures()
	await assertNavigationRevealSkipsVerificationVisionRecovery()
	await assertSessionLoopGuardReplansToCompletion()
	await assertSessionStoresVerificationProgress()
	await assertSessionLogsVerificationRecoveryOutcome()
	await assertSessionPublishesPlanningProgress()
	await assertSessionLogsStructuredOutcomeSummary()
	assertSessionAddsFallbackOutcomeForUnstructuredFailure()
	assertSessionLoopGuardRecordsWorkflowOutcome()
	await assertSessionLoopGuardWindowTerminatesAcrossWaits()
	assertLoopGuardWindowResetsAfterSubstantiveSuccess()
	await assertVerificationFailureFeedsLoopGuard()
	await assertSessionDoneFailureIsError()
	await assertSessionDoneRecordsHistoryPlanAndWorkflowOutcome()
	await assertSessionDoneSuccessAfterFailureIsError()
	await assertSessionDoneSuccessAfterFailureAndWaitIsError()
	assertRedundantInputRewriteComparesText()
	assertDropdownOptionSelectionIsScoped()
	assertDropdownFailuresReturnRecoverableContext()
	assertDropdownOptionAssociationUsesExplicitPopupOwner()
	assertCheckboxOptionSelectionIsScoped()
	assertIndexedSelectionActionsFailOnMissingIndex()
	assertScrollActionsReportNoMovement()
	assertScrollActionsRespectExplicitIndex()
	assertExpandedStateIgnoresFocusOnlyClasses()
	assertNestedSelectionControlStateChangesAreVerified()
	await assertVerifierRejectsDropdownSelectionWithoutValueChange()
	await assertVerifierRetriesDropdownSelectionUntilFieldValueChanges()
	await assertLocateByVisionDelegatesToExecutableCoordinateAction()
	assertVisionFallbackPreservesCoordinateActionOutcome()
	assertLocateByVisionRegisteredAsBackgroundTool()
	await assertVerifierChecksLocateByVisionInput()
	await assertVerifierRejectsNoopClick()
	await assertVerifierRejectsFocusOnlyClick()
	await assertVerifierRetriesTransitionObservation()
	await assertVerifierAcceptsDropdownOpenProbe()
	await assertVerifierRetriesDropdownProbeCandidates()
	await assertVerifierRejectsDropdownProbeWithoutCandidates()
	await assertVerifierAcceptsSearchWorkflowSemanticClicks()
	assertRepeatableActionsAreExempted()
	assertSharedActionContractLoadedEverywhere()
	assertSharedControlSemanticsLoadedEverywhere()
	assertSharedControlSemanticsBehavior()
	assertStructuredActionOutcomeContract()
	assertLoopGuardExtractedFromSessionEngine()
	assertSessionRecordsExtractedFromSessionEngine()
	assertSessionRecoveryExtractedFromSessionEngine()
	assertSessionTimingExtractedFromSessionEngine()
	assertSessionLifecycleExtractedFromSessionEngine()
	assertPlannerContextExtractedFromPlanner()
	assertPlannerFastPathExtractedFromPlanner()
	assertPlannerValidationExtractedFromPlanner()
	assertPlannerModelClientExtractedFromPlanner()
	assertPlannerDecisionExtractedFromPlanner()
	assertPlannerPromptExtractedFromPlanner()
	assertLoginWorkflowBehavior()
	assertTaskNavigationWorkflowBehavior()
	assertSearchWorkflowBehavior()
	assertPlannerWorkflowRegistryBehavior()
	assertObserverUsesCentralSemantics()
	assertObserverOptionSnapshotsExposePopupOwner()
	assertActionStateExtractedFromActions()
	assertActionInputExtractedFromActions()
	assertActionScrollExtractedFromActions()
	assertActionOptionsExtractedFromActions()
	assertActionCascaderExtractedFromActions()
	assertActionSelectExtractedFromActions()
	assertActionsReturnStructuredOutcomes()
	assertSelectionFailuresUseStructuredOutcomes()
	await assertVerifierUsesStructuredOutcome()
	assertModelReasoningIsSurfaced()
	assertManifestVersion()

	console.log(`runtime contracts ok (${checked.length} js files checked)`)
}

function listFiles(root) {
	const out = []
	for (const name of fs.readdirSync(root)) {
		const full = path.join(root, name)
		const stat = fs.statSync(full)
		if (stat.isDirectory()) out.push(...listFiles(full))
		else if (stat.isFile()) out.push(full)
	}
	return out
}

function read(relPath) {
	return fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
}

function extractFunctionSource(source, name) {
	const pattern = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`)
	const match = pattern.exec(source)
	if (!match) throw new Error(`function not found: ${name}`)
	let depth = 0
	for (let index = match.index; index < source.length; index += 1) {
		const ch = source[index]
		if (ch === '{') depth += 1
		if (ch === '}') {
			depth -= 1
			if (depth === 0) return source.slice(match.index, index + 1)
		}
	}
	throw new Error(`function source is incomplete: ${name}`)
}

function assertNoForbiddenBusinessFallbacks(files) {
	const targets = files.filter((file) => /\.(js|json|html)$/.test(file))
	for (const file of targets) {
		const text = fs.readFileSync(file, 'utf8')
		for (const pattern of forbiddenBusinessPatterns) {
			if (pattern.test(text)) {
				throw new Error(`business-specific fallback leaked into ${path.relative(repoRoot, file)}: ${pattern}`)
			}
		}
	}
}

function assertPlannerBudgetCoversInternalRounds() {
	const planner = read('naturalclick-extension/background/planner.js')
	const sessionTiming = read('naturalclick-extension/background/session-timing.js')
	const rounds = readNumberConstant(planner, 'MAX_PLANNING_ROUNDS')
	const roundTimeout = readNumberConstant(planner, 'MODEL_ROUND_TIMEOUT_MS')
	const defaultTimingRoundTimeout = readNumberConstant(sessionTiming, 'DEFAULT_MODEL_ROUND_TIMEOUT_MS')
	const maxModelPlanningCalls = readNumberConstant(sessionTiming, 'MAX_MODEL_PLANNING_CALLS')
	const planningOverhead = readNumberConstant(sessionTiming, 'PLANNING_OVERHEAD_MS')
	const minimumBudget = defaultTimingRoundTimeout * maxModelPlanningCalls + planningOverhead
	const expectedBudget = rounds * roundTimeout + planningOverhead
	if (minimumBudget < expectedBudget) {
		throw new Error(
			`planning timeout budget too small: minimumBudgetMs=${minimumBudget}, expected >= ${expectedBudget}`
		)
	}
	if (!planner.includes('function getModelRoundTimeoutMs') || !planner.includes('Math.max(MIN_MODEL_ROUND_TIMEOUT_MS') || !planner.includes('Math.min(MAX_MODEL_ROUND_TIMEOUT_MS')) {
		throw new Error('planner should clamp per-model-round timeout from user config within explicit min/max bounds')
	}
	if (!sessionTiming.includes('function getEffectiveModelRoundTimeoutMs') || !sessionTiming.includes('MAX_MODEL_PLANNING_CALLS') || !sessionTiming.includes('MAX_CONFIGURED_MODEL_ROUND_TIMEOUT_MS')) {
		throw new Error('session planning timeout should be derived from the effective per-round model timeout')
	}
}

function assertNativeSelectUsesSelectionSemantics() {
	const observer = read('naturalclick-extension/content/observer.js')
	const verification = read('naturalclick-extension/content/verification.js')
	const editableTargetFn = extractFunctionSource(observer, 'resolveEditableTarget')
	const editableElementFn = extractFunctionSource(observer, 'isEditableElement')
	const readValueFn = extractFunctionSource(verification, 'readElementValue')
	if (/HTMLSelectElement/.test(editableTargetFn)) {
		throw new Error('native select should not resolve as an editable target for input_text')
	}
	if (/querySelector\([^)]*select/.test(editableTargetFn)) {
		throw new Error('resolveEditableTarget should not pick nested native select for input_text')
	}
	if (/element\s+instanceof\s+HTMLSelectElement/.test(editableElementFn)) {
		throw new Error('native select should be observed as a selection control, not editable input')
	}
	if (!/HTMLSelectElement/.test(readValueFn) || !/selectedOptions/.test(readValueFn)) {
		throw new Error('input verification should read native select selectedOptions instead of all option text')
	}
	const inputTargetFn = extractFunctionSource(read('naturalclick-extension/content/action-input.js'), 'inputToEditableTarget')
	if (/HTMLSelectElement/.test(inputTargetFn)) {
		throw new Error('input_text should not silently select native select options')
	}
	const actionOptions = read('naturalclick-extension/content/action-options.js')
	const selectByTextFn = extractFunctionSource(actionOptions, 'selectOptionByText')
	const nativeMatchFn = extractFunctionSource(actionOptions, 'nativeOptionMatches')
	if (!/stripOptionValueAnnotation\(text\)/.test(selectByTextFn)) {
		throw new Error('native select option matching should accept labels copied with [value=...] annotations')
	}
	if (!/formatNativeOptionLabel\(option\)/.test(nativeMatchFn)) {
		throw new Error('native select option matching should compare against the exposed label[value] format')
	}
}

function assertInputVerificationUsesResolvedEditableTarget() {
	const verification = read('naturalclick-extension/content/verification.js')
	const hitTestFn = extractFunctionSource(verification, 'hitTestAtPoint')
	const verifyIndexFn = extractFunctionSource(verification, 'verifyInputByIndex')
	if (!/const\s+editableTarget\s*=\s*observer\.resolveEditableTarget\(target\)/.test(hitTestFn)) {
		throw new Error('hitTestAtPoint should read nested editable targets for value/editable metadata')
	}
	if (!/observer\.resolveEditableTarget\(element\)/.test(verifyIndexFn)) {
		throw new Error('verifyInputByIndex should verify the resolved nested editable target, not wrapper text')
	}
	if (!/readElementValue\(editable\s*\|\|\s*element\)/.test(verifyIndexFn)) {
		throw new Error('verifyInputByIndex should fall back to wrapper value only when no editable target exists')
	}
}

function assertCompositeSelectDoesNotResolveNestedInput() {
	const observer = read('naturalclick-extension/content/observer.js')
	const editableTargetFn = extractFunctionSource(observer, 'resolveEditableTarget')
	const editableElementFn = extractFunctionSource(observer, 'isEditableElement')
	if (!/isEditableElement\(element\)/.test(editableTargetFn)) {
		throw new Error('resolveEditableTarget should reuse isEditableElement for the root target')
	}
	if (!/isEditableElement\(nested\)/.test(editableTargetFn)) {
		throw new Error('resolveEditableTarget should filter nested inputs through isEditableElement')
	}
	if (!/composite instanceof HTMLElement && composite !== element\) return false/.test(editableElementFn)) {
		throw new Error('isEditableElement should reject inputs nested inside composite selection controls')
	}
	if (/if\s*\(nested instanceof HTMLElement\)\s*return nested/.test(editableTargetFn)) {
		throw new Error('resolveEditableTarget must not blindly return nested inputs')
	}
}

function assertReadonlyPickerInputsExposeDropdownSemantics() {
	const semantics = read('naturalclick-extension/content/semantics.js')
	const observer = read('naturalclick-extension/content/observer.js')
	const readonlyPickerFn = extractFunctionSource(semantics, 'isReadonlyPickerInput')
	const dropdownFn = extractFunctionSource(semantics, 'isDropdownLikeControl')
	const roleFn = extractFunctionSource(observer, 'getElementRole')
	const fieldLikeFn = extractFunctionSource(observer, 'isFieldLikeControl')
	if (!/aria-haspopup/.test(readonlyPickerFn) || !/请选择|select|choose/.test(readonlyPickerFn)) {
		throw new Error('readonly picker inputs should be detected by popup attrs and choose/select placeholders')
	}
	if (!/isReadonlyPickerInput\(element\)/.test(dropdownFn)) {
		throw new Error('dropdown detection should treat readonly picker inputs as dropdown-like controls')
	}
	if (!/isDropdownLikeControl\(element\)\) return 'combobox'/.test(roleFn)) {
		throw new Error('readonly picker inputs should be exposed with role=combobox instead of textbox')
	}
	if (!/isDropdownLikeControl\(element\)\) return true/.test(fieldLikeFn)) {
		throw new Error('readonly picker inputs should remain visible as form fields')
	}
}

function assertCompositePickerWrappersAreObserved() {
	const semantics = read('naturalclick-extension/content/semantics.js')
	const observer = read('naturalclick-extension/content/observer.js')
	const compositeFn = extractFunctionSource(semantics, 'getCompositeFieldContainer')
	const suffixFn = extractFunctionSource(semantics, 'hasReadonlyPickerDescendant')
	const collectFn = extractFunctionSource(observer, 'collectInteractiveCandidates')
	const probablyFn = extractFunctionSource(observer, 'isProbablyInteractive')
	const roleFn = extractFunctionSource(observer, 'getElementRole')
	const primaryControlFn = extractFunctionSource(observer, 'getPrimaryFieldControl')
	for (const expected of ['.el-input--suffix', '.el-date-editor', '.el-select__wrapper', '.avue-select', '.avue-cascader']) {
		if (!semantics.includes(expected) || !observer.includes(expected)) {
			throw new Error(`composite picker observation should cover ${expected}`)
		}
	}
	if (!/isAmbiguousSuffixFieldContainer\(node\).*hasReadonlyPickerDescendant\(node\)/s.test(compositeFn)) {
		throw new Error('composite field detection should keep Element suffix inputs only when they behave like pickers')
	}
	if (!/请选择|select|choose|pick/.test(suffixFn) || !/suffix.*arrow.*caret.*calendar/s.test(suffixFn)) {
		throw new Error('suffix picker detection should use placeholder and icon evidence')
	}
	if (!/isFieldLikeControl\(element\)\) return true/.test(probablyFn)) {
		throw new Error('observer should keep composite field wrappers as interactive candidates')
	}
	if (!/isDropdownLikeControl\(element\)\) return 'combobox'/.test(roleFn)) {
		throw new Error('observer should expose dropdown-like wrappers with combobox role')
	}
	if (!collectFn.includes('.el-input--suffix') || !primaryControlFn.includes('.el-input--suffix')) {
		throw new Error('observer should collect Element suffix picker wrappers and use them for field semantics')
	}
}

function assertDropdownActionsUseCompositePickerTriggers() {
	const actionOptions = read('naturalclick-extension/content/action-options.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const triggerFn = extractFunctionSource(actionOptions, 'resolveDropdownTrigger')
	const enabledTriggerFn = extractFunctionSource(actionSelect, 'hasEnabledSelectionTrigger')
	for (const expected of ['.el-input--suffix', '.el-select__wrapper', '.el-date-editor', '.avue-select', '.avue-cascader']) {
		if (!triggerFn.includes(expected) || !enabledTriggerFn.includes(expected)) {
			throw new Error(`dropdown actions should treat composite picker wrapper ${expected} as a trigger container`)
		}
	}
	if (!triggerFn.includes("'.el-select__caret,.el-input__suffix,.el-input")) {
		throw new Error('dropdown trigger resolution should prefer picker suffix/caret targets before nested readonly inputs')
	}
	if (!/const\s+disabledRoot\s*=/.test(enabledTriggerFn) || !/if\s*\(explicitlyDisabled\)\s*return false/.test(enabledTriggerFn)) {
		throw new Error('dropdown enabled-trigger fallback should reject truly disabled composite controls before clicking child triggers')
	}
	if (!/trigger instanceof HTMLElement && trigger !== field && !isDisabledElement\(trigger\)/.test(enabledTriggerFn)) {
		throw new Error('dropdown enabled-trigger fallback should allow usable wrapper/suffix triggers when the observed field is a readonly picker input')
	}
}

function assertObserverPreservesNestedNavigationItems() {
	const observer = read('naturalclick-extension/content/observer.js')
	const keepFn = extractFunctionSource(observer, 'shouldKeepNestedCandidate')
	const nestedFn = extractFunctionSource(observer, 'shouldKeepNestedNavigationCandidate')
	const navLikeFn = extractFunctionSource(observer, 'isNavigationLikeCandidate')
	if (!keepFn.includes('shouldKeepNestedNavigationCandidate(parent, child)')) {
		throw new Error('observer should check nested navigation items before compacting parent/child candidates')
	}
	if (!nestedFn.includes('parentKey.includes(childKey)') || !nestedFn.includes('childArea > parentArea * 0.92')) {
		throw new Error('nested navigation preservation should keep distinct child menu labels without duplicating full-size parents')
	}
	if (!navLikeFn.includes('menuitem') || !navLikeFn.includes('el-menu-item') || !navLikeFn.includes('el-submenu')) {
		throw new Error('nested navigation preservation should cover common menuitem and Element menu classes')
	}
}

function assertVisionHitTestClickableSemantics() {
	const verification = read('naturalclick-extension/content/verification.js')
	const clickableFn = extractFunctionSource(verification, 'isProbablyClickable')
	const resolverFn = extractFunctionSource(verification, 'resolveClickableTarget')
	for (const expected of [
		'HTMLSelectElement',
		"'summary'",
		"'select'",
		"'menuitem'",
		"'tab'",
		"'combobox'",
		"'option'",
		"'checkbox'",
		"'radio'",
		"'switch'",
		'aria-expanded',
		'aria-haspopup',
		'aria-controls',
	]) {
		if (!clickableFn.includes(expected) && !resolverFn.includes(expected)) {
			throw new Error(`vision hit-test clickable semantics missing ${expected}`)
		}
	}
	if (!/closest\?\.\(selector\)/.test(resolverFn)) {
		throw new Error('vision hit-test should resolve clickable ancestors, not only the raw elementFromPoint target')
	}
}

function assertVisionCandidatesUseSemanticTargetDescription() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/vision.js', {
		NC_BG_CONSTANTS: {
			TYPES: {},
			VISION_CONFIDENCE_THRESHOLD: 0.6,
			MAX_TRACE_ITEMS: 80,
		},
		NC_BG_PLANNER: { callOpenAI: async () => ({ content: '{}', io: {} }) },
		NC_BG_UTILS: {
			sendTabMessage: async () => ({}),
			clamp: (value, min, max) => Math.min(max, Math.max(min, Number(value))),
			safeJsonParse: (value) => {
				try {
					return JSON.parse(value)
				} catch (_) {
					return null
				}
			},
			generateId: () => 'test_id',
		},
	})
	const summary = sandbox.NC_BG_VISION_TESTS.buildVisionCandidateSummary(
		{
			elements: [
				{
					index: 1,
					label: '搜索',
					fieldType: 'search',
					valueState: 'empty',
					rect: { left: 10, top: 10, width: 160, height: 32 },
				},
				{
					index: 2,
					label: '取消',
					valueState: 'unknown',
					rect: { left: 10, top: 60, width: 80, height: 32 },
				},
			],
		},
		{
			next_goal: '视觉定位页面主体中的搜索输入框',
			action: {
				name: 'input_text',
				input: { target_description: '页面主体中的搜索输入框', text: 'hello' },
			},
		}
	)
	if (!summary.includes('[1]') || !summary.includes('target_match=true')) {
		throw new Error(`vision candidate summary should use semantic target_description, got: ${summary}`)
	}
	if (summary.includes('[2]')) {
		throw new Error(`vision candidate summary should not include unrelated elements solely because vision has no index, got: ${summary}`)
	}
}

function assertVisionCaptureHidesNaturalClickOverlays() {
	const protocol = read('naturalclick-extension/shared/protocol.js')
	const content = read('naturalclick-extension/content.js')
	const visual = read('naturalclick-extension/content/visual.js')
	const vision = read('naturalclick-extension/background/vision.js')
	if (!protocol.includes('SET_VISUAL_CAPTURE_MODE')) {
		throw new Error('protocol should expose a visual capture mode message for clean vision screenshots')
	}
	if (!content.includes('TYPES.SET_VISUAL_CAPTURE_MODE') || !content.includes('visual?.setCaptureHidden')) {
		throw new Error('content bridge should route visual capture mode changes to the visual runtime')
	}
	if (!visual.includes('function setCaptureHidden') || !visual.includes("host.style.visibility = 'hidden'")) {
		throw new Error('visual runtime should temporarily hide its overlay host during vision capture')
	}
	if (!vision.includes('setVisualCaptureHidden(session.currentTabId, true)') || !vision.includes('finally')) {
		throw new Error('vision capture should hide NaturalClick overlays before screenshot and restore them in finally')
	}
	if (/border:2px solid var\(--nc-color\)/.test(visual) || /background:\s*color-mix\(in srgb,\s*var\(--nc-color\)\s*16%/.test(visual)) {
		throw new Error('index highlights should stay thin and low-opacity so they do not dominate the page')
	}
}

function assertPlannerFastPathBehavior() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/planner.js', {
		NC_BG_UTILS: {
			safeJsonParse: (value) => {
				try {
					return JSON.parse(value)
				} catch (_) {
					return null
				}
			},
			generateId: () => 'test_id',
		},
	})
	const plannerTests = sandbox.NC_BG_PLANNER_TESTS
	if (!plannerTests?.deriveFastPathDecision) {
		throw new Error('planner test contract is not exported')
	}
	if (!plannerTests.isTaskTargetLocation('http://example.test/app#/current', 'http://example.test/app')) {
		throw new Error('specific target path should match the same path with a SPA hash route')
	}
	if (plannerTests.isTaskTargetLocation('http://example.test/other', 'http://example.test/app')) {
		throw new Error('specific target path should not match a different same-origin page')
	}
	if (!plannerTests.isTaskTargetLocation('http://example.test/other', 'http://example.test/')) {
		throw new Error('root target URL should match any same-origin page after redirects')
	}
	if (!plannerTests.isTaskTargetLocation('http://example.test/#/system/user', 'http://example.test/#/system/user')) {
		throw new Error('SPA hash target should match the same hash route')
	}
	if (plannerTests.isTaskTargetLocation('http://example.test/#/wel/index', 'http://example.test/#/system/user')) {
		throw new Error('SPA hash target should not match a different hash route on the same origin')
	}
	if (plannerTests.extractTargetUrl('打开 (http://example.test/#/system/user)') !== 'http://example.test/#/system/user') {
		throw new Error('target URL extraction should strip trailing closing punctuation')
	}
	if (plannerTests.extractTargetUrl('Open http://example.test/app.') !== 'http://example.test/app') {
		throw new Error('target URL extraction should strip a trailing sentence period')
	}

	const onTarget = plannerTests.deriveFastPathDecision(
		{ task: '打开 http://example.test/app 并完成页面任务。' },
		{ url: 'http://example.test/app#/current' },
		[]
	)
	if (onTarget !== null) {
		throw new Error('planner fast path should not act when current page is already on target origin')
	}

	const openTarget = plannerTests.deriveFastPathDecision(
		{ task: '打开 http://example.test/app 并完成页面任务。' },
		{ url: 'https://start.example/' },
		[]
	)
	assertAction(openTarget, 'open_new_tab')

	const wrongSameOriginPath = plannerTests.deriveFastPathDecision(
		{ task: '打开 http://example.test/app 并完成页面任务。' },
		{ url: 'http://example.test/other' },
		[{ id: 41, url: 'http://example.test/other', current: true }]
	)
	assertAction(wrongSameOriginPath, 'open_new_tab')

	const switchTarget = plannerTests.deriveFastPathDecision(
		{ task: '打开 http://example.test/app 并完成页面任务。' },
		{ url: 'https://start.example/' },
		[{ id: 42, url: 'http://example.test/app#/other', current: false }]
	)
	assertAction(switchTarget, 'switch_to_tab')

	const rootTarget = plannerTests.deriveFastPathDecision(
		{ task: '打开 http://example.test/ 并完成页面任务。' },
		{ url: 'http://example.test/redirected' },
		[]
	)
	if (rootTarget !== null) {
		throw new Error('root task URL should allow same-origin redirected pages to continue with AI planning')
	}

	const wrongSpaHashRoute = plannerTests.deriveFastPathDecision(
		{ task: '打开 http://example.test/#/system/user 并完成页面任务。' },
		{ url: 'http://example.test/#/wel/index' },
		[{ id: 43, url: 'http://example.test/#/wel/index', current: true }]
	)
	assertAction(wrongSpaHashRoute, 'open_new_tab')

	const redirectedAfterTargetOpen = plannerTests.deriveFastPathDecision(
		{
			task: '打开 http://example.test/#/system/user 并完成页面任务。',
			history: [
				{
					action: 'open_new_tab',
					input: { url: 'http://example.test/#/system/user' },
					success: true,
				},
			],
		},
		{ url: 'http://example.test/#/login' },
		[{ id: 44, url: 'http://example.test/#/login', current: true }]
	)
	if (redirectedAfterTargetOpen !== null) {
		throw new Error('planner fast path should hand same-origin auth/SPA redirects back to AI planning after opening target URL once')
	}

	for (const decision of [openTarget, wrongSameOriginPath, switchTarget, wrongSpaHashRoute]) {
		if (/click|input|select/i.test(String(decision?.action?.name || ''))) {
			throw new Error(`planner fast path leaked a page action: ${decision.action.name}`)
		}
	}
}

async function assertPlannerUsesModelDecisionOnTarget() {
	const modelDecision = {
		evaluation_previous_goal: '页面已观察完成。',
		memory: '当前页面有一个搜索输入框。',
		thought: '根据 forms 中的搜索字段执行输入。',
		next_goal: '在搜索框输入查询词。',
		action: { name: 'input_text', input: { index: 3, text: 'hello' } },
	}
	const sandbox = loadBackgroundModule('naturalclick-extension/background/planner.js', {
		NC_BG_UTILS: {
			safeJsonParse: (value) => {
				try {
					return JSON.parse(value)
				} catch (_) {
					return null
				}
			},
			generateId: () => 'test_id',
		},
		NC_BG_CONSTANTS: { MAX_TRACE_ITEMS: 80 },
		NC_BG_TOOLS: {
			getToolPromptLines: () => [
				'- input_text: 向当前观察结果中的可编辑元素输入文本 input={index:number|required,text:string|required}',
				'- click_element_by_index: 点击当前观察结果中的指定元素索引 input={index:number|required}',
				'- select_dropdown_option: 按文本选择下拉选项；只提供 index 时展开下拉框 input={index:number|optional,text:string|optional}',
			],
		},
		chrome: {
			tabs: {
				query: async () => [
					{ id: 1, title: 'Example', url: 'http://example.test/app', current: true },
				],
			},
		},
		fetch: async () => ({
			ok: true,
			json: async () => ({
				id: 'chatcmpl-test',
				model: 'fake-model',
				choices: [{ message: { content: JSON.stringify(modelDecision) } }],
				usage: { total_tokens: 1 },
			}),
		}),
		AbortController,
	})
	const session = {
		windowId: 1,
		currentTabId: 1,
		step: 1,
		task: '打开 http://example.test/app 并在搜索框输入 hello。',
		latestTask: '打开 http://example.test/app 并在搜索框输入 hello。',
		config: {
			textLLM: {
				baseURL: 'http://model.test/v1',
				model: 'fake-model',
				apiKey: '',
			},
		},
		history: [],
		traceItems: [],
	}
	const decision = await sandbox.NC_BG_PLANNER.planAction(
		session,
		{
			url: 'http://example.test/app',
			title: 'Example',
			forms: [
				{
					id: 'page_form',
					name: '页面表单',
					fields: [
						{
							index: 3,
							region: 'content',
							fieldType: 'search',
							label: '搜索',
							valueState: 'empty',
							role: 'textbox',
						},
					],
				},
			],
			actions: [],
			options: [],
			popups: [],
			panels: [],
			elements: [],
			simplifiedDom: ['<field index="3" region="content" fieldType="search" value="empty">搜索</field>'],
			rawCandidates: [],
		}
	)
	assertAction(decision, 'input_text')
	if (Number(decision.action.input.index) !== 3 || decision.action.input.text !== 'hello') {
		throw new Error(`planner did not return the model-chosen page action: ${JSON.stringify(decision.action)}`)
	}
	if (!decision.thought.includes('forms')) {
		throw new Error('planner did not preserve model thought for trace visibility')
	}
	const modelTrace = session.traceItems.find((item) => item.kind === 'model')
	if (!String(modelTrace?.modelThought || '').includes('forms')) {
		throw new Error(`planner model trace should expose displayable thought outside raw IO, got ${JSON.stringify(session.traceItems)}`)
	}
}

async function assertPlannerCompactRetryAfterTimeout() {
	const fetchBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			fetchBodies.push(JSON.parse(init.body))
			if (fetchBodies.length === 1) {
				const error = new Error('abort')
				error.name = 'AbortError'
				throw error
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '完整上下文超时后已重试。',
				memory: '压缩观察可用。',
				thought: '压缩上下文仍保留目标输入框。',
				next_goal: '输入查询词。',
				action: { name: 'input_text', input: { index: 3, text: 'retry-ok' } },
			})
		},
		observation: buildTestObservation({ rawCount: 40 }),
	})
	assertAction(decision.result, 'input_text')
	if (decision.result.action.input.text !== 'retry-ok') {
		throw new Error('compact retry did not return the model retry action')
	}
	if (fetchBodies.length !== 2) {
		throw new Error(`compact retry should call model exactly twice, got ${fetchBodies.length}`)
	}
	const firstUser = getUserMessageText(fetchBodies[0])
	const secondUser = getUserMessageText(fetchBodies[1])
	const firstSystem = getSystemMessageText(fetchBodies[0])
	const secondSystem = getSystemMessageText(fetchBodies[1])
	if (!secondUser.includes('compact_retry')) {
		throw new Error('compact retry request did not use compact observation marker')
	}
	if (secondUser.length >= firstUser.length) {
		throw new Error('compact retry request was not smaller than the initial request')
	}
	if (!secondSystem.includes('紧凑规划器')) {
		throw new Error('compact retry should switch to compact planner system prompt')
	}
	if (secondSystem.length >= firstSystem.length) {
		throw new Error('compact retry system prompt should be smaller than the initial prompt')
	}
}

async function assertPlannerStartsCompactForLargeObservation() {
	const fetchBodies = []
	const events = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			fetchBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '大页面首轮精简上下文。',
				memory: '仍保留搜索输入框。',
				thought: '观察内容很大，先用精简上下文规划。',
				next_goal: '输入查询词。',
				action: { name: 'input_text', input: { index: 3, text: 'large-compact-ok' } },
			})
		},
		observation: buildTestObservation({ rawCount: 140 }),
		planOptions: {
			onProgress: (event) => events.push(event),
		},
	})
	assertAction(decision.result, 'input_text')
	if (decision.result.action.input.text !== 'large-compact-ok') {
		throw new Error(`large observation compact first round did not return model action, got ${JSON.stringify(decision.result)}`)
	}
	if (fetchBodies.length !== 1) {
		throw new Error(`large observation should not require a timeout before compact planning, got ${fetchBodies.length} calls`)
	}
	const firstUser = getUserMessageText(fetchBodies[0])
	const firstSystem = getSystemMessageText(fetchBodies[0])
	if (!firstUser.includes('omitted="large_observation"')) {
		throw new Error(`large observation first request should carry a large_observation compact marker, got ${firstUser}`)
	}
	if (!firstSystem.includes('紧凑规划器')) {
		throw new Error('large observation first request should use compact planner system prompt')
	}
	if (!events.some((event) => event.stage === 'model_compact_request')) {
		throw new Error(`large observation should publish compact first-round progress, got ${JSON.stringify(events)}`)
	}
	const plannerTests = loadBackgroundModule('naturalclick-extension/background/planner.js', {
		NC_BG_UTILS: { safeJsonParse: JSON.parse, generateId: () => 'test_id' },
		NC_BG_CONSTANTS: { MAX_TRACE_ITEMS: 80 },
		NC_BG_TOOLS: { getToolPromptLines: () => [] },
		chrome: { tabs: { query: async () => [] } },
		fetch: async () => fakeJsonResponse({ action: { name: 'done', input: { text: 'ok', success: true } } }),
		AbortController,
	}).NC_BG_PLANNER_TESTS
	if (!plannerTests.shouldStartWithCompactObservation(buildTestObservation({ rawCount: 140 }), 'short')) {
		throw new Error('planner test hook should classify raw-heavy observations as compact-first')
	}
	if (plannerTests.shouldStartWithCompactObservation(buildTestObservation({ rawCount: 2 }), 'short')) {
		throw new Error('planner test hook should keep small observations on full first-round context')
	}
}

async function assertPlannerDoesNotRepeatCompactTimeoutForLargeObservation() {
	const fetchBodies = []
	const events = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			fetchBodies.push(JSON.parse(init.body))
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation({ rawCount: 140 }),
			forms: [],
			actions: [],
			elements: [],
			simplifiedDom: [],
		},
		planOptions: {
			onProgress: (event) => events.push(event),
		},
	})
	assertAction(decision.result, 'done')
	if (decision.result.action.input.success !== false) {
		throw new Error(`large compact timeout should stop safely as done(false), got ${JSON.stringify(decision.result)}`)
	}
	if (fetchBodies.length !== 1) {
		throw new Error(`large compact timeout should not repeat the same compact request, got ${fetchBodies.length} calls`)
	}
	if (events.some((event) => event.stage === 'compact_retry')) {
		throw new Error(`large compact timeout should not publish compact retry, got ${JSON.stringify(events)}`)
	}
	if (!events.some((event) => event.stage === 'timeout_no_recovery')) {
		throw new Error(`large compact timeout should publish timeout_no_recovery, got ${JSON.stringify(events)}`)
	}
}

async function assertPlannerPublishesPlanningProgress() {
	const events = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => fakeJsonResponse({
			evaluation_previous_goal: '已收到观察。',
			memory: '搜索字段可用。',
			thought: '直接输入即可。',
			next_goal: '输入查询词。',
			action: { name: 'input_text', input: { index: 3, text: 'visible-progress' } },
		}),
		observation: buildTestObservation(),
		planOptions: {
			onProgress: (event) => events.push(event),
		},
	})
	assertAction(decision.result, 'input_text')
	if (!events.some((event) => event.stage === 'model_request' && /请求模型规划动作/.test(event.text))) {
		throw new Error(`planner should publish initial model request progress, got ${JSON.stringify(events)}`)
	}

	const retryEvents = []
	await runPlannerWithFakeModel({
		fetchImpl: async () => {
			if (!retryEvents.fetchCount) retryEvents.fetchCount = 0
			retryEvents.fetchCount += 1
			if (retryEvents.fetchCount === 1) {
				const error = new Error('abort')
				error.name = 'AbortError'
				throw error
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '压缩重试成功。',
				memory: '搜索字段可用。',
				thought: '压缩上下文后继续动作。',
				next_goal: '输入查询词。',
				action: { name: 'input_text', input: { index: 3, text: 'compact-progress' } },
			})
		},
		observation: buildTestObservation({ rawCount: 40 }),
		planOptions: {
			onProgress: (event) => retryEvents.push(event),
		},
	})
	if (!retryEvents.some((event) => event.stage === 'compact_retry' && /压缩上下文重试/.test(event.text))) {
		throw new Error(`planner should publish compact retry progress, got ${JSON.stringify(retryEvents)}`)
	}
}

async function assertPlannerModelClientTraceDiagnostics() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/planner-model-client.js', {
		NC_BG_PLANNER_CONTEXT: {
			shortText: (value, maxLen) => {
				const text = String(value || '')
				if (text.length <= maxLen) return text
				return `${text.slice(0, maxLen)} ...[truncated ${text.length - maxLen}]`
			},
		},
		AbortController,
		fetch: async () => ({
			ok: true,
			json: async () => ({
				id: 'chatcmpl-diagnostics',
				model: 'fake-model',
				choices: [
					{
						message: {
							content: JSON.stringify({
								evaluation_previous_goal: 'ok',
								memory: 'ok',
								thought: 'ok',
								next_goal: 'done',
								action: { name: 'done', input: { text: 'ok', success: true } },
							}),
							reasoning_content: '模型内部返回的可展示推理摘要',
						},
					},
				],
				usage: { total_tokens: 1 },
			}),
		}),
	})
	const longUserMessage = '<browser_state>\n' + '候选 '.repeat(3200) + '\n</browser_state>'
	const result = await sandbox.NC_BG_PLANNER_MODEL_CLIENT.callOpenAI(
		{ baseURL: 'http://model.test/v1', model: 'fake-model', apiKey: '' },
		[
			{ role: 'system', content: '系统提示 '.repeat(700) },
			{ role: 'user', content: longUserMessage },
		],
		{ returnMeta: true, timeoutMs: 5000 }
	)
	const request = result.io?.request || {}
	const diagnostics = request.diagnostics || {}
	if (request.timeoutMs !== 5000) {
		throw new Error(`model request trace should include the effective timeoutMs, got ${JSON.stringify(request)}`)
	}
	if (!diagnostics.messageStats || diagnostics.totalMessageChars <= 0) {
		throw new Error(`model request trace should include prompt diagnostics, got ${JSON.stringify(request)}`)
	}
	const userPreview = request.messages?.find((message) => message.role === 'user')
	if (!userPreview?.truncated || userPreview.contentLength !== longUserMessage.length || userPreview.previewLimit < 8000) {
		throw new Error(`user message preview should expose truncation metadata with a larger preview window, got ${JSON.stringify(userPreview)}`)
	}
	if (!String(request.diagnostics.note || '').includes('实际请求仍发送完整内容')) {
		throw new Error(`model request diagnostics should explain preview truncation, got ${JSON.stringify(request.diagnostics)}`)
	}
	if (!String(result.io?.response?.reasoning || '').includes('可展示推理摘要')) {
		throw new Error(`model response preview should preserve provider reasoning content, got ${JSON.stringify(result.io?.response)}`)
	}
	if (!String(result.io?.response?.thought || '').includes('ok')) {
		throw new Error(`model response preview should expose JSON thought separately for trace cards, got ${JSON.stringify(result.io?.response)}`)
	}
	if (
		!String(result.io?.response?.displayThought || '').includes('ok') ||
		!String(result.io?.response?.displayThought || '').includes('可展示推理摘要')
	) {
		throw new Error(`model response preview should combine JSON thought and provider reasoning into displayThought, got ${JSON.stringify(result.io?.response)}`)
	}

	const reasoningOnlyDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => fakeJsonResponse({
			evaluation_previous_goal: '已收到观察。',
			memory: '搜索字段可用。',
			next_goal: '输入查询词。',
			action: { name: 'input_text', input: { index: 3, text: 'reasoning-only' } },
		}, {
			messageExtras: { reasoning_content: '只有供应商推理摘要，没有 JSON thought' },
		}),
		observation: buildTestObservation(),
	})
	const modelTrace = reasoningOnlyDecision.session.traceItems.find((item) => item.kind === 'model')
	if (!String(modelTrace?.modelThought || '').includes('供应商推理摘要')) {
		throw new Error(`planner model trace should promote provider reasoning to top-level modelThought, got ${JSON.stringify(reasoningOnlyDecision.session.traceItems)}`)
	}
}

async function assertPlannerTimeoutWithoutRecoveryEndsGracefully() {
	const events = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			forms: [],
			actions: [],
			elements: [],
			simplifiedDom: [],
		},
		planOptions: {
			onProgress: (event) => events.push(event),
		},
	})
	assertAction(decision.result, 'done')
	if (decision.result.action.input.success !== false) {
		throw new Error(`double model timeout without deterministic recovery should end as done(false), got ${JSON.stringify(decision.result)}`)
	}
	if (!String(decision.result.action.input.text || '').includes('模型连续超时')) {
		throw new Error(`timeout failure should explain the model timeout, got ${JSON.stringify(decision.result.action.input)}`)
	}
	if (!events.some((event) => event.stage === 'timeout_no_recovery')) {
		throw new Error(`timeout without recovery should publish a specific progress event, got ${JSON.stringify(events)}`)
	}
	if (!decision.session.traceItems.some((item) => item.title === '模型调用: 文本规划压缩重试' && item.kind === 'error')) {
		throw new Error(`timeout without recovery should preserve compact retry error trace, got ${JSON.stringify(decision.session.traceItems)}`)
	}
}

async function assertPlannerHistoryOutcomeGuidesReplanning() {
	const requestBodies = []
	await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '看到上次下拉失败。',
				memory: '候选中有企业端。',
				thought: '改选真实候选。',
				next_goal: '选择企业端。',
				action: { name: 'select_dropdown_option', input: { index: 4, text: '企业端' } },
			})
		},
		observation: {
			...buildTestObservation(),
			forms: [
				{
					id: 'page_form',
					name: '页面表单',
					fields: [
						{
							index: 4,
							region: 'content',
							fieldType: 'select',
							label: '用户平台',
							valueState: 'empty',
							role: 'combobox',
							selectionControl: 'dropdown',
						},
					],
				},
			],
			elements: [
				{
					index: 4,
					region: 'content',
					role: 'combobox',
					fieldType: 'select',
					label: '用户平台',
					valueState: 'empty',
					selectionControl: 'dropdown',
				},
			],
		},
		sessionOverrides: {
			history: [
				{
					stepIndex: 7,
					nextGoal: '选择平台 WEB。',
					action: 'select_dropdown_option',
					input: { index: 4, text: 'WEB' },
					success: false,
					evaluationPreviousGoal: '选择用户平台失败，候选中没有 WEB。',
					thought: '需要从真实候选中重新选择。',
					output: '未找到可见下拉选项 "WEB"。当前字段候选: 企业端。',
					outcome: {
						kind: 'failed',
						progress: false,
						requestedText: 'WEB',
						visibleOptions: ['企业端'],
					},
				},
			],
		},
	})
	const firstUser = getUserMessageText(requestBodies[0])
	const systemText = getSystemMessageText(requestBodies[0])
	if (!firstUser.includes('result=动作结果: failed') || !firstUser.includes('requested="WEB"') || !firstUser.includes('candidates="企业端"')) {
		throw new Error(`agent_history should expose structured outcome summary, got: ${firstUser}`)
	}
	if (!firstUser.includes('eval=选择用户平台失败') || !firstUser.includes('thought=需要从真实候选中重新选择')) {
		throw new Error(`agent_history should expose prior evaluation/thought for replanning, got: ${firstUser}`)
	}
	if (!systemText.includes('禁止重复 requested') || !systemText.includes('从 candidates 中选择真实候选')) {
		throw new Error('planner system prompt should instruct how to recover from failed outcome candidates')
	}
}

async function assertPlannerRejectsRepeatedFailedDropdownRequest() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '看到上次选择失败，但仍误选同一文本。',
					memory: '错误地重复了不存在的候选。',
					thought: '重复选择会导致循环。',
					next_goal: '选择平台 WEB。',
					action: { name: 'select_dropdown_option', input: { index: 4, text: 'WEB' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '上一轮参数反馈指出不能重复 WEB。',
				memory: '真实候选包含企业端。',
				thought: '改选历史候选中的真实选项。',
				next_goal: '选择企业端。',
				action: { name: 'select_dropdown_option', input: { index: 4, text: '企业端' } },
			})
		},
		observation: buildDropdownTestObservation('用户平台'),
		sessionOverrides: {
			history: [
				{
					stepIndex: 8,
					nextGoal: '选择平台 WEB。',
					action: 'select_dropdown_option',
					input: { index: 4, text: 'WEB' },
					success: false,
					output: '未找到可见下拉选项 "WEB"。',
					outcome: {
						kind: 'failed',
						progress: false,
						requestedText: 'WEB',
						visibleOptions: ['企业端', '后台端'],
					},
				},
			],
		},
	})
	assertAction(decision.result, 'select_dropdown_option')
	if (decision.result.action.input.text !== '企业端') {
		throw new Error(`repeated failed dropdown request should recover to a real candidate, got ${JSON.stringify(decision.result.action.input)}`)
	}
	if (requestBodies.length !== 2) {
		throw new Error(`repeated failed dropdown request should trigger one replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('禁止重复同一个 requested') || !secondUser.includes('企业端|后台端')) {
		throw new Error(`repeated failed dropdown feedback missing from follow-up planning request: ${secondUser}`)
	}
}

async function assertPlannerRejectsRepeatedDropdownOpenAfterVisibleOptions() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '已经展开过候选，但仍想再次展开。',
					memory: '重复展开不会推进任务。',
					thought: '应该选择可见候选，而不是重复打开。',
					next_goal: '再次展开状态下拉。',
					action: { name: 'select_dropdown_option', input: { index: 4 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '上一轮参数反馈指出候选已可见。',
				memory: '真实候选包含启用。',
				thought: '直接选择可见候选。',
				next_goal: '选择启用。',
				action: { name: 'select_dropdown_option', input: { index: 4, text: '启用' } },
			})
		},
		observation: buildDropdownTestObservation('状态'),
		sessionOverrides: {
			history: [
				{
					stepIndex: 5,
					nextGoal: '展开状态下拉。',
					action: 'select_dropdown_option',
					input: { index: 4 },
					success: true,
					output: '下拉候选已展开。',
					outcome: {
						kind: 'options_visible',
						progress: true,
						visibleOptions: ['启用', '禁用'],
					},
				},
			],
		},
	})
	assertAction(decision.result, 'select_dropdown_option')
	if (decision.result.action.input.text !== '启用') {
		throw new Error(`repeated dropdown open should recover to selecting a visible option, got ${JSON.stringify(decision.result.action.input)}`)
	}
	if (requestBodies.length !== 2) {
		throw new Error(`repeated dropdown open should trigger one replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('不要重复只展开同一字段') || !secondUser.includes('启用|禁用')) {
		throw new Error(`repeated dropdown-open feedback missing from follow-up planning request: ${secondUser}`)
	}
}

async function assertPlannerRejectsInvisibleDropdownTextWhenScopedOptionsVisible() {
	const requestBodies = []
	const observation = buildDropdownTestObservation('用户平台')
	observation.options = [
		{
			index: 41,
			region: 'popover',
			role: 'option',
			label: '企业端',
			valueState: 'unknown',
			selectionControl: '',
			rect: { left: 220, top: 64, width: 180, height: 32 },
		},
		{
			index: 42,
			region: 'popover',
			role: 'option',
			label: '后台端',
			valueState: 'unknown',
			selectionControl: '',
			rect: { left: 220, top: 96, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '用户平台候选已经可见。',
					memory: '错误地猜了一个没有出现的候选。',
					thought: '误选 WEB。',
					next_goal: '选择 WEB。',
					action: { name: 'choose_dropdown_option', input: { index: 4, text: 'WEB' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '上一轮参数反馈列出了真实候选。',
				memory: '用户平台候选包含企业端和后台端。',
				thought: '改选可见真实候选。',
				next_goal: '选择企业端。',
				action: { name: 'choose_dropdown_option', input: { index: 4, text: '企业端' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'choose_dropdown_option')
	if (decision.result.action.input.text !== '企业端') {
		throw new Error(`visible scoped options should force model to choose a real candidate, got ${JSON.stringify(decision.result.action.input)}`)
	}
	if (requestBodies.length !== 2) {
		throw new Error(`invalid visible dropdown candidate should trigger one replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('没有 "WEB"') || !secondUser.includes('企业端|后台端')) {
		throw new Error(`visible dropdown candidate validation feedback missing from follow-up planning request: ${secondUser}`)
	}
}

async function assertPlannerTimeoutRecoveryStopsUnresolvedTaskNavigation() {
	const task = '打开 http://example.test/app，找到订单中心并测试搜索条件。'
	const observation = buildTestObservation()
	observation.title = '首页'
	observation.actions = [
		{
			index: 8,
			region: 'header',
			role: 'tab',
			label: '订单中心',
			valueState: 'unknown',
			rect: { left: 320, top: 12, width: 90, height: 36 },
		},
		{
			index: 9,
			region: 'content',
			role: 'button',
			label: '搜索',
			valueState: 'unknown',
			rect: { left: 20, top: 120, width: 72, height: 32 },
		},
	]
	observation.elements = []
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation,
		sessionOverrides: {
			task,
			latestTask: task,
		},
	})
	assertAction(decision.result, 'click_element_by_index')
	if (
		decision.result.action.input.index !== 8 ||
		decision.result.action.input.workflow !== 'task-navigation' ||
		decision.result.action.input.workflow_step !== 'navigate_to_task_target'
	) {
		throw new Error(`planner should take one safe task-navigation workflow action before model timeout handling: ${JSON.stringify(decision.result)}`)
	}
	if (requestBodies.length !== 0) {
		throw new Error(`safe task-navigation workflow should avoid model calls before the first target click, got ${requestBodies.length}`)
	}

	const repeatedRequestBodies = []
	const repeatedDecision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			repeatedRequestBodies.push(JSON.parse(init.body))
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation,
		sessionOverrides: {
			task,
			latestTask: task,
			history: [
				{
					action: 'click_element_by_index',
					input: { index: 8, target_label: '订单中心' },
					nextGoal: '进入目标模块：订单中心',
					success: true,
				},
			],
		},
	})
	assertAction(repeatedDecision.result, 'done')
	if (repeatedDecision.result.action.input.success !== false || !String(repeatedDecision.result.action.input.text || '').includes('模型连续超时')) {
		throw new Error(`timeout recovery should still stop when the same target was already tried: ${JSON.stringify(repeatedDecision.result)}`)
	}
	if (repeatedRequestBodies.length !== 2) {
		throw new Error(`repeated unresolved navigation should try full and compact model planning before stopping, got ${repeatedRequestBodies.length}`)
	}
	const firstUser = getUserMessageText(repeatedRequestBodies[0])
	if (!firstUser.includes('<workflow_hints>') || !firstUser.includes('订单中心') || !firstUser.includes('status="unresolved"')) {
		throw new Error(`planner should expose unresolved task navigation as workflow hints before timeout recovery, got: ${firstUser}`)
	}
}

async function assertPlannerReactContextRound() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '需要查看目标细节。',
					memory: '先检查 index=3。',
					thought: '信息不足，先请求内部上下文。',
					next_goal: '检查搜索框详情。',
					action: { name: 'inspect_index', input: { index: 3 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '已获得 index 详情。',
				memory: 'index=3 是搜索输入框。',
				thought: '根据补充上下文执行输入。',
				next_goal: '输入查询词。',
				action: { name: 'input_text', input: { index: 3, text: 'react-ok' } },
			})
		},
		observation: buildTestObservation(),
	})
	assertAction(decision.result, 'input_text')
	if (decision.result.action.input.text !== 'react-ok') {
		throw new Error('ReAct context round did not return the final page action')
	}
	if (requestBodies.length !== 2) {
		throw new Error(`ReAct context round should call model exactly twice, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('<planning_context>') || !secondUser.includes('<index_detail index="3">')) {
		throw new Error('second ReAct request did not include inspected planning context')
	}
}

function assertPlannerObservationOmissionHints() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/planner-context.js', {})
	const context = sandbox.NC_BG_PLANNER_CONTEXT
	const observation = buildTestObservation({ rawCount: 12 })
	observation.forms = [
		{
			id: 'filter',
			name: '搜索/筛选区域',
			fields: Array.from({ length: 20 }, (_, index) => ({
				index: 300 + index,
				region: 'content',
				fieldType: index === 18 ? 'platform' : 'text',
				label: `搜索字段 ${index}`,
				valueState: 'empty',
				role: index === 18 ? 'combobox' : 'textbox',
			})),
		},
	]
	observation.actions = Array.from({ length: 24 }, (_, index) => ({
		index: 100 + index,
		region: 'content',
		role: 'button',
		label: index === 23 ? '搜索区域' : `动作 ${index}`,
		actionIntent: index === 23 ? undefined : 'unknown',
		rect: { left: index, top: index * 4, width: 80, height: 28 },
	}))
	observation.simplifiedDom = Array.from({ length: 30 }, (_, index) =>
		`<button index="${200 + index}" region="content">简化 ${index}</button>`
	)
	const text = context.buildObservationText(observation, { task: '测试搜索区域' })
	if (!text.includes('<more_context source="forms" cursor="17" limit="40" action="request_context"')) {
		throw new Error(`forms field omission should include an explicit request_context hint, got ${text}`)
	}
	if (!text.includes('"source":"forms","cursor":17,"limit":40')) {
		throw new Error(`forms omission hint should include JSON-like request input, got ${text}`)
	}
	const formsChunk = context.resolvePlanningContextRequest(
		observation,
		{ name: 'request_context', input: { source: 'forms', cursor: 17, limit: 3 } },
		0
	).text
	if (!formsChunk.includes('搜索字段 16') || !formsChunk.includes('搜索字段 18')) {
		throw new Error(`forms request_context should continue from the omitted field cursor, got ${formsChunk}`)
	}
	if (!text.includes('<more_context source="actions" cursor="17" limit="40" action="request_context"')) {
		throw new Error(`actions omission should continue from the first hidden prefix row even when task-relevant actions were promoted, got ${text}`)
	}
	if (!text.includes('"source":"actions","cursor":17,"limit":40')) {
		throw new Error(`actions omission hint should include JSON-like request input, got ${text}`)
	}
	const actionsChunk = context.resolvePlanningContextRequest(
		observation,
		{ name: 'request_context', input: { source: 'actions', cursor: 17, limit: 7 } },
		0
	).text
	if (!actionsChunk.includes('动作 17') || !actionsChunk.includes('搜索区域')) {
		throw new Error(`actions request_context should not skip hidden rows after a promoted task-relevant action, got ${actionsChunk}`)
	}
	const navObservation = buildTestObservation()
	navObservation.forms = []
	navObservation.actions = []
	navObservation.popups = []
	navObservation.options = []
	navObservation.simplifiedDom = Array.from({ length: 30 }, (_, index) =>
		index === 29
			? '<menuitem index="429" role="menuitem" region="sidebar">用户管理</menuitem>'
			: `<menuitem index="${400 + index}" role="menuitem" region="sidebar">菜单 ${index}</menuitem>`
	)
	const compactNavText = context.buildObservationText(navObservation, {
		task: '找到用户管理部分并创建用户',
		compact: true,
		maxChars: 4200,
	})
	if (!compactNavText.includes('index="429"') || !compactNavText.includes('用户管理')) {
		throw new Error(`compact observation should promote simplified_dom rows matching unresolved task targets, got ${compactNavText}`)
	}
	const createObservation = buildTestObservation()
	createObservation.forms = []
	createObservation.panels = []
	createObservation.popups = []
	createObservation.options = []
	createObservation.actions = Array.from({ length: 36 }, (_, index) => ({
		index: 500 + index,
		region: 'content',
		role: index === 28 ? 'button' : 'checkbox',
		label: index === 28 ? '新 增' : (index % 2 ? '详情' : '(empty)'),
		actionIntent: index === 28 ? 'create' : 'toggle_option',
		rect: { left: 20 + index, top: 200 + index * 8, width: 80, height: 28 },
	}))
	const compactCreateText = context.buildObservationText(createObservation, {
		task: '找到客户管理，新建一条客户数据',
		compact: true,
		maxChars: 4200,
	})
	if (!compactCreateText.includes('index=528') || !compactCreateText.includes('新 增')) {
		throw new Error(`compact observation should promote visible create buttons above noisy table actions, got ${compactCreateText}`)
	}
	const createActionsChunk = context.resolvePlanningContextRequest(
		createObservation,
		{ name: 'request_context', input: { source: 'actions', region: 'content', query: '新增 新建 创建', limit: 10 } },
		0
	).text
	if (!createActionsChunk.includes('index=528') || !createActionsChunk.includes('新 增')) {
		throw new Error(`request_context should match any create-query term so the model can recover visible add buttons, got ${createActionsChunk}`)
	}
	if (!text.includes('<more_context source="simplified_dom" cursor="22" limit="40" action="request_context"')) {
		throw new Error(`simplified_dom omission should include an explicit request_context hint, got ${text}`)
	}
	if (!text.includes('<more_context source="raw_candidates" cursor="8" limit="40" action="request_context"')) {
		throw new Error(`raw_candidates omission should include an explicit request_context hint, got ${text}`)
	}
}

async function assertPlannerRequestContextPaginationBounds() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '首屏上下文不足。',
					memory: '需要请求候选列表下一段。',
					thought: '请求一个已经到结尾以外的上下文游标。',
					next_goal: '查看更多候选。',
					action: { name: 'request_context', input: { source: 'raw_candidates', cursor: 99, limit: 2 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '分页上下文已经说明没有更多内容。',
				memory: 'raw_candidates 已经到末尾。',
				thought: '没有更多候选，改为安全失败结束。',
				next_goal: '结束任务。',
				action: { name: 'done', input: { text: '没有更多上下文。', success: false } },
			})
		},
		observation: buildTestObservation({ rawCount: 3 }),
	})
	assertAction(decision.result, 'done')
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('cursor="99"') || !secondUser.includes('nextCursor="-1"')) {
		throw new Error('request_context should preserve out-of-range cursor and report no next page')
	}
	if (!secondUser.includes('(empty)')) {
		throw new Error('request_context out-of-range cursor should return an empty chunk')
	}
	const planningContext = secondUser.slice(secondUser.indexOf('<planning_context>'))
	if (planningContext.includes('noise-2')) {
		throw new Error('request_context out-of-range cursor should not clamp back to the last row')
	}
}

async function assertPlannerInspectIndexCoversFormsOnlyMatch() {
	const requestBodies = []
	const observation = buildTestObservation()
	observation.elements = []
	observation.simplifiedDom = ['<field index="3" region="content" fieldType="search" value="empty">搜索</field>']
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '需要查看字段细节。',
					memory: 'index=3 只出现在 forms 中。',
					thought: '先请求内部索引检查。',
					next_goal: '检查搜索字段详情。',
					action: { name: 'inspect_index', input: { index: 3 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '已获得字段详情。',
				memory: 'index=3 是 forms 中的搜索字段。',
				thought: '根据字段上下文执行输入。',
				next_goal: '输入查询词。',
				action: { name: 'input_text', input: { index: 3, text: 'forms-only-ok' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'input_text')
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('source=forms:page_form') || !secondUser.includes('field index=3')) {
		throw new Error('inspect_index should include form-only index matches in planning context')
	}
	if (secondUser.includes('未找到 index=3')) {
		throw new Error('inspect_index incorrectly reported a form-only index as missing')
	}
}

async function assertPlannerOptionsContextIncludesNativeSelectOptions() {
	const requestBodies = []
	const observation = buildTestObservation()
	const selectField = {
		index: 4,
		region: 'content',
		fieldType: 'select',
		label: '状态',
		valueState: 'empty',
		role: 'combobox',
		tag: 'select',
		selectionControl: 'dropdown',
		optionLabels: ['启用 [value=enabled]', '禁用 [value=disabled]'],
		rect: { left: 20, top: 80, width: 180, height: 36 },
	}
	observation.forms[0].fields.push(selectField)
	observation.elements.push(selectField)
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '需要查看下拉候选。',
					memory: '状态字段是原生选择框。',
					thought: '先请求字段候选项。',
					next_goal: '查看状态候选。',
					action: { name: 'request_options_for', input: { index: 4 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '已经看到原生候选。',
				memory: '状态字段候选包含启用和禁用。',
				thought: '基于真实候选执行选择。',
				next_goal: '选择启用状态。',
				action: { name: 'select_dropdown_option', input: { index: 4, text: '启用' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'select_dropdown_option')
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('<native_options>') || !secondUser.includes('启用 [value=enabled]')) {
		throw new Error('request_options_for did not include native select options in planning context')
	}
}

async function assertPlannerOptionsContextScopesVisibleCandidatesToField() {
	const requestBodies = []
	const observation = buildTestObservation()
	const selectField = {
		index: 4,
		region: 'content',
		fieldType: 'select',
		label: '状态',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		rect: { left: 20, top: 80, width: 180, height: 36 },
	}
	const otherField = {
		index: 5,
		region: 'content',
		fieldType: 'select',
		label: '类型',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		rect: { left: 420, top: 80, width: 180, height: 36 },
	}
	observation.forms[0].fields.push(selectField, otherField)
	observation.elements.push(selectField, otherField)
	observation.options = [
		{
			index: 41,
			region: 'popover',
			role: 'option',
			label: '启用',
			valueState: 'unknown',
			selectionControl: '',
			rect: { left: 20, top: 126, width: 180, height: 32 },
		},
		{
			index: 42,
			region: 'popover',
			role: 'option',
			label: '其他类型',
			valueState: 'unknown',
			selectionControl: '',
			rect: { left: 420, top: 126, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '需要查看状态字段候选。',
					memory: '页面上有多个下拉弹层。',
					thought: '先请求目标字段相关候选。',
					next_goal: '查看状态候选。',
					action: { name: 'request_options_for', input: { index: 4 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '状态候选已经收窄。',
				memory: '状态字段候选包含启用。',
				thought: '选择目标字段相关候选。',
				next_goal: '选择启用。',
				action: { name: 'select_dropdown_option', input: { index: 4, text: '启用' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'select_dropdown_option')
	const secondUser = getUserMessageText(requestBodies[1])
	const planningContext = secondUser.slice(secondUser.indexOf('<planning_context>'))
	if (!planningContext.includes('<visible_options scoped="field"') || !planningContext.includes('label="启用"')) {
		throw new Error(`request_options_for should expose field-scoped visible options, got: ${planningContext}`)
	}
	if (planningContext.includes('其他类型')) {
		throw new Error(`request_options_for should not include options associated with a different field, got: ${planningContext}`)
	}
}

async function assertPlannerOptionsContextUsesExplicitPopupOwner() {
	const requestBodies = []
	const observation = buildTestObservation()
	const popupId = 'status-list-generated-owner-id-with-a-long-framework-suffix-0123456789'
	const selectField = {
		index: 4,
		region: 'content',
		fieldType: 'select',
		label: '状态',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		relationHints: `aria-controls=${popupId},haspopup=listbox`,
		rect: { left: 20, top: 80, width: 180, height: 36 },
	}
	observation.forms[0].fields.push(selectField)
	observation.elements.push(selectField)
	observation.options = [
		{
			index: 41,
			region: 'popover',
			role: 'option',
			label: '启用',
			valueState: 'unknown',
			selectionControl: '',
			popupHints: `popupId=${popupId},popupRole=listbox`,
			rect: { left: 420, top: 126, width: 180, height: 32 },
		},
		{
			index: 42,
			region: 'popover',
			role: 'option',
			label: '其他类型',
			valueState: 'unknown',
			selectionControl: '',
			popupHints: 'popupId=type-list,popupRole=listbox',
			rect: { left: 20, top: 126, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '需要按显式弹层归属查看候选。',
					memory: '目标字段声明 aria-controls=status-list。',
					thought: '先请求目标字段候选。',
					next_goal: '查看状态候选。',
					action: { name: 'request_options_for', input: { index: 4 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '候选已按 owner 收窄。',
				memory: '状态字段候选包含启用。',
				thought: '选择显式归属的候选。',
				next_goal: '选择启用。',
				action: { name: 'select_dropdown_option', input: { index: 4, text: '启用' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'select_dropdown_option')
	const secondUser = getUserMessageText(requestBodies[1])
	const planningContext = secondUser.slice(secondUser.indexOf('<planning_context>'))
	if (!planningContext.includes('<visible_options scoped="explicit"') || !planningContext.includes(`popupId=${popupId}`)) {
		throw new Error(`request_options_for should prefer explicit popup ownership, got: ${planningContext}`)
	}
	if (planningContext.includes('其他类型') || planningContext.includes('popupId=type-list')) {
		throw new Error(`explicit popup ownership should override geometry fallback, got: ${planningContext}`)
	}
}

async function assertPlannerOptionsContextUsesPopupLabelledByOwner() {
	const requestBodies = []
	const observation = buildTestObservation()
	const labelId = 'status-field-label-generated-owner-id-with-long-framework-suffix-abcdef123456'
	const selectField = {
		index: 4,
		region: 'content',
		fieldType: 'select',
		label: '状态',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		relationHints: `aria-labelledby=${labelId},haspopup=listbox`,
		rect: { left: 20, top: 80, width: 180, height: 36 },
	}
	observation.forms[0].fields.push(selectField)
	observation.elements.push(selectField)
	observation.options = [
		{
			index: 41,
			region: 'popover',
			role: 'option',
			label: '启用',
			valueState: 'unknown',
			selectionControl: '',
			popupHints: `popupLabelledBy=${labelId},popupRole=listbox`,
			rect: { left: 420, top: 126, width: 180, height: 32 },
		},
		{
			index: 42,
			region: 'popover',
			role: 'option',
			label: '其他类型',
			valueState: 'unknown',
			selectionControl: '',
			popupHints: 'popupLabelledBy=type-label,popupRole=listbox',
			rect: { left: 20, top: 126, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '需要按弹层 labelledby 归属查看候选。',
					memory: '目标字段和弹层共享 labelledby id。',
					thought: '先请求目标字段候选。',
					next_goal: '查看状态候选。',
					action: { name: 'request_options_for', input: { index: 4 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '候选已按 labelledby 收窄。',
				memory: '状态字段候选包含启用。',
				thought: '选择显式归属的候选。',
				next_goal: '选择启用。',
				action: { name: 'select_dropdown_option', input: { index: 4, text: '启用' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'select_dropdown_option')
	const secondUser = getUserMessageText(requestBodies[1])
	const planningContext = secondUser.slice(secondUser.indexOf('<planning_context>'))
	if (!planningContext.includes('<visible_options scoped="explicit"') || !planningContext.includes(`popupLabelledBy=${labelId}`)) {
		throw new Error(`request_options_for should prefer popup aria-labelledby ownership, got: ${planningContext}`)
	}
	if (planningContext.includes('其他类型') || planningContext.includes('popupLabelledBy=type-label')) {
		throw new Error(`popup aria-labelledby ownership should override geometry fallback, got: ${planningContext}`)
	}
}

async function assertPlannerDuplicateReactRequestWarnsAndRecovers() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length <= 2) {
				return fakeJsonResponse({
					evaluation_previous_goal: requestBodies.length === 1 ? '需要查看目标细节。' : '仍未理解目标。',
					memory: '检查 index=3。',
					thought: '请求同一个内部上下文。',
					next_goal: '检查搜索框详情。',
					action: { name: 'inspect_index', input: { index: 3 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '重复上下文请求已被提示。',
				memory: 'index=3 是搜索输入框。',
				thought: '根据 duplicate_request 反馈改为真实页面动作。',
				next_goal: '输入查询词。',
				action: { name: 'input_text', input: { index: 3, text: 'duplicate-recovered' } },
			})
		},
		observation: buildTestObservation(),
	})
	assertAction(decision.result, 'input_text')
	if (decision.result.action.input.text !== 'duplicate-recovered') {
		throw new Error('duplicate ReAct request did not recover to a page action')
	}
	if (requestBodies.length !== 3) {
		throw new Error(`duplicate ReAct recovery should call model exactly three times, got ${requestBodies.length}`)
	}
	const thirdUser = getUserMessageText(requestBodies[2])
	if (!thirdUser.includes('duplicate_request="true"')) {
		throw new Error('duplicate ReAct request did not inject duplicate_request feedback')
	}
}

async function assertPlannerInvalidActionReplansBeforeExecution() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '想点击目标。',
					memory: '错误地输出了自然语言工具名。',
					thought: '使用了不存在的动作名。',
					next_goal: '点击目标。',
					action: { name: 'click_by_text', input: { text: '提交' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '未知工具已被纠正。',
				memory: '必须使用 available_tools 中的工具名。',
				thought: '改用可用的索引点击工具。',
				next_goal: '点击目标。',
				action: { name: 'click_element_by_index', input: { index: 3 } },
			})
		},
		observation: buildTestObservation(),
	})
	assertAction(decision.result, 'click_element_by_index')
	if (requestBodies.length !== 2) {
		throw new Error(`invalid action recovery should call model exactly twice, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action="true"') || !secondUser.includes('click_by_text')) {
		throw new Error('invalid action feedback was not included in the follow-up planning request')
	}
}

async function assertPlannerInvalidModelOutputReplansBeforeFailing() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return {
					ok: true,
					json: async () => ({
						id: 'chatcmpl-invalid-json',
						model: 'fake-model',
						choices: [{ message: { content: '我准备点击搜索框，然后输入 hello。' } }],
						usage: { total_tokens: 1 },
					}),
				}
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '上一轮输出格式错误，已修正。',
				memory: '必须输出 JSON action。',
				thought: '按 schema 输出真实页面动作。',
				next_goal: '输入查询词。',
				action: { name: 'input_text', input: { index: 3, text: 'json-recovered' } },
			})
		},
		observation: buildTestObservation(),
	})
	assertAction(decision.result, 'input_text')
	if (decision.result.action.input.text !== 'json-recovered') {
		throw new Error('invalid model output recovery did not return the corrected page action')
	}
	if (requestBodies.length !== 2) {
		throw new Error(`invalid model output recovery should call model exactly twice, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_model_output="true"') || !secondUser.includes('只输出 JSON 对象')) {
		throw new Error('invalid model output feedback was not included in the follow-up planning request')
	}
}

async function assertPlannerNormalizesActionOutputVariants() {
	const cases = [
		{
			name: 'top-level-tool-arguments',
			decision: {
				evaluation_previous_goal: '准备输入。',
				memory: '模型使用了 tool/arguments 包装。',
				thought: '应归一化为真实页面动作。',
				next_goal: '输入查询词。',
				tool: 'input_text',
				arguments: JSON.stringify({ index: 3, text: 'top-level-tool-ok' }),
			},
			expectedText: 'top-level-tool-ok',
		},
		{
			name: 'top-level-action-string',
			decision: {
				evaluation_previous_goal: '准备输入。',
				memory: '模型把 action 输出为字符串。',
				thought: '应结合顶层 input 归一化。',
				next_goal: '输入查询词。',
				action: 'input_text',
				input: { index: 3, text: 'action-string-ok' },
			},
			expectedText: 'action-string-ok',
		},
		{
			name: 'action-type-inline-input',
			decision: {
				evaluation_previous_goal: '准备输入。',
				memory: '模型把参数直接放在 action 里。',
				thought: '应从 action 剩余字段提取参数。',
				next_goal: '输入查询词。',
				action: { type: 'input_text', index: 3, text: 'inline-action-ok' },
			},
			expectedText: 'inline-action-ok',
		},
		{
			name: 'action-name-delimiters',
			decision: {
				evaluation_previous_goal: '准备输入。',
				memory: '模型输出了带空格和大写的工具名。',
				thought: '工具名应该规范化后再匹配。',
				next_goal: '输入查询词。',
				action: { name: 'Input Text', input: { index: 3, text: 'name-delimiter-ok' } },
			},
			expectedText: 'name-delimiter-ok',
		},
		{
			name: 'tool-calls-function-arguments',
			decision: {
				evaluation_previous_goal: '准备输入。',
				memory: '模型使用了 OpenAI tool_calls 结构。',
				thought: '应从 function.arguments 解析参数。',
				next_goal: '输入查询词。',
				tool_calls: [
					{
						function: {
							name: 'input_text',
							arguments: JSON.stringify({ index: 3, text: 'tool-calls-ok' }),
						},
					},
				],
			},
			expectedText: 'tool-calls-ok',
		},
	]
	for (const item of cases) {
		const result = await runPlannerWithFakeModel({
			fetchImpl: async () => fakeJsonResponse(item.decision),
			observation: buildTestObservation(),
		})
		assertAction(result.result, 'input_text')
		if (result.result.action.input.text !== item.expectedText) {
			throw new Error(`${item.name} was not normalized into executable action input`)
		}
	}
}

async function assertPlannerInvalidActionInputReplansBeforeExecution() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '准备输入。',
					memory: '错误地遗漏了 index。',
					thought: '参数不完整。',
					next_goal: '输入查询词。',
					action: { name: 'input_text', input: { text: 'missing-index' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数错误已被纠正。',
				memory: 'index=3 是可用输入框。',
				thought: '补齐 index 后执行输入。',
				next_goal: '输入查询词。',
				action: { name: 'input_text', input: { index: 3, text: 'valid-input' } },
			})
		},
		observation: buildTestObservation(),
	})
	assertAction(decision.result, 'input_text')
	if (decision.result.action.input.text !== 'valid-input') {
		throw new Error('invalid action input recovery did not return the corrected action')
	}
	if (requestBodies.length !== 2) {
		throw new Error(`invalid action input recovery should call model exactly twice, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('动作索引无效')) {
		throw new Error('invalid action input feedback was not included in the follow-up planning request')
	}
}

async function assertPlannerRejectsTextInputOnNonEditableSelectionControl() {
	const requestBodies = []
	const observation = buildTestObservation()
	const selectLikeField = {
		index: 4,
		region: 'content',
		fieldType: 'platform',
		label: '用户平台',
		valueState: 'empty',
		role: 'combobox',
		tag: 'div',
		type: 'text',
		selectionControl: 'dropdown',
		editable: false,
		rect: { left: 220, top: 20, width: 180, height: 36 },
	}
	observation.forms[0].fields.push(selectLikeField)
	observation.elements.push(selectLikeField)
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '准备测试字段。',
					memory: '误把不可编辑选择器当成输入框。',
					thought: '尝试直接输入文本。',
					next_goal: '在用户平台输入测试文本。',
					action: { name: 'input_text', input: { index: 4, text: '测试平台' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数错误已指出该控件不可编辑。',
				memory: '用户平台是选择控件，应先展开候选。',
				thought: '改用下拉展开动作。',
				next_goal: '展开用户平台候选。',
				action: { name: 'select_dropdown_option', input: { index: 4 } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'select_dropdown_option')
	if (requestBodies.length !== 2) {
		throw new Error(`non-editable selection control should trigger one replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('选择控件')) {
		throw new Error('planner did not explain non-editable selection control input_text misuse')
	}
}

async function assertPlannerRejectsTextInputWhenAnySameIndexSourceIsSelectionControl() {
	const requestBodies = []
	const observation = buildTestObservation()
	const selectLikeField = {
		index: 4,
		region: 'content',
		fieldType: 'platform',
		label: '用户平台',
		valueState: 'empty',
		role: 'combobox',
		tag: 'div',
		type: 'text',
		selectionControl: 'dropdown',
		editable: false,
		rect: { left: 220, top: 20, width: 180, height: 36 },
	}
	const nestedEditableInput = {
		index: 4,
		region: 'content',
		fieldType: '',
		label: '请先选择用户',
		valueState: 'empty',
		role: 'textbox',
		tag: 'input',
		type: 'text',
		selectionControl: '',
		editable: true,
		rect: { left: 228, top: 24, width: 150, height: 28 },
	}
	observation.forms[0].fields.push(selectLikeField)
	observation.elements.push(nestedEditableInput)
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '准备测试字段。',
					memory: '同一个 index 同时有选择器和内部 input 信息。',
					thought: '误信内部 input，尝试输入文本。',
					next_goal: '在用户平台输入测试文本。',
					action: { name: 'input_text', input: { index: 4, text: '测试平台' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数错误已指出同 index 存在选择控件证据。',
				memory: '用户平台应按下拉处理。',
				thought: '改用下拉展开动作。',
				next_goal: '展开用户平台候选。',
				action: { name: 'open_dropdown', input: { index: 4 } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'open_dropdown')
	if (requestBodies.length !== 2) {
		throw new Error(`same-index selection evidence should override nested editable input, got ${requestBodies.length} model calls`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('选择控件') || !secondUser.includes('用户平台')) {
		throw new Error('planner did not explain same-index selection control evidence over editable input')
	}
}

async function assertPlannerRejectsDropdownOnPlainEditableInput() {
	const requestBodies = []
	const observation = buildTestObservation()
	const plainInput = {
		index: 5,
		region: 'content',
		fieldType: 'search',
		label: '登录账号',
		valueState: 'empty',
		role: 'textbox',
		tag: 'input',
		type: 'text',
		selectionControl: '',
		editable: true,
		rect: { left: 20, top: 70, width: 180, height: 36 },
	}
	observation.forms[0].fields.push(plainInput)
	observation.elements.push(plainInput)
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '准备选择搜索条件。',
					memory: '误把普通文本框当成下拉。',
					thought: '尝试用下拉选择。',
					next_goal: '选择登录账号。',
					action: { name: 'select_dropdown_option', input: { index: 5, text: 'admin' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数错误已指出这是普通输入框。',
				memory: '登录账号字段需要输入文本。',
				thought: '改用输入动作。',
				next_goal: '输入登录账号。',
				action: { name: 'input_text', input: { index: 5, text: 'admin' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'input_text')
	if (requestBodies.length !== 2) {
		throw new Error(`plain editable input should trigger one dropdown misuse replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('普通可编辑输入框')) {
		throw new Error('planner did not explain select_dropdown_option misuse on a plain editable input')
	}
}

async function assertPlannerAllowsDropdownOpenWithoutOptionText() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '需要先打开下拉框观察候选。',
				memory: 'index=3 是当前可交互字段。',
				thought: '选项未知时先展开下拉框，而不是臆造选项文本。',
				next_goal: '展开下拉框查看候选。',
				action: { name: 'select_dropdown_option', input: { index: 3 } },
			})
		},
		observation: buildTestObservation(),
	})
	assertAction(decision.result, 'select_dropdown_option')
	if (decision.result.action.input.index !== 3) {
		throw new Error('dropdown open action did not preserve index-only input')
	}
	if (requestBodies.length !== 1) {
		throw new Error(`index-only dropdown open should not trigger invalid-input replan, got ${requestBodies.length} calls`)
	}
}

async function assertPlannerRejectsUnscopedChooseDropdownOption() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '下拉候选已出现。',
					memory: '误以为只按文本就能选择。',
					thought: '尝试全局选择候选。',
					next_goal: '选择企业端。',
					action: { name: 'choose_dropdown_option', input: { text: '企业端' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数错误已指出必须限定字段 index。',
				memory: '下拉选择需要字段范围，避免误选其他弹层。',
				thought: '先展开目标字段候选。',
				next_goal: '展开目标下拉框。',
				action: { name: 'open_dropdown', input: { index: 4 } },
			})
		},
		observation: buildDropdownTestObservation('用户平台'),
	})
	assertAction(decision.result, 'open_dropdown')
	if (requestBodies.length !== 2) {
		throw new Error(`unscoped choose_dropdown_option should trigger one replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('缺少目标字段 index')) {
		throw new Error('planner did not explain choose_dropdown_option missing target index')
	}
}

async function assertPlannerAllowsLocateByVisionWithStaleIndex() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '普通索引动作无法稳定命中。',
				memory: '需要用语义视觉定位搜索输入框。',
				thought: '视觉定位应依赖语义描述，不应被旧 index 阻断。',
				next_goal: '视觉定位并输入查询词。',
				action: {
					name: 'locate_by_vision',
					input: { target_description: '页面主体中的搜索输入框', index: 999, text: 'hello' },
				},
			})
		},
		observation: buildTestObservation(),
	})
	assertAction(decision.result, 'locate_by_vision')
	if (decision.result.action.input.index !== 999) {
		throw new Error('planner should preserve model input while allowing locate_by_vision to ignore stale index at execution')
	}
	if (requestBodies.length !== 1) {
		throw new Error(`stale locate_by_vision index should not trigger invalid-input replan, got ${requestBodies.length}`)
	}
}

async function assertPlannerRejectsLocateByVisionWithoutTargetDescription() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '尝试视觉定位。',
					memory: '漏掉了语义目标描述。',
					thought: '只有文本，没有目标描述会导致盲定位。',
					next_goal: '视觉定位并输入。',
					action: { name: 'locate_by_vision', input: { text: 'hello' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数错误已指出缺少 target_description。',
				memory: '视觉定位必须给出语义目标。',
				thought: '补充语义描述后再调用视觉定位。',
				next_goal: '视觉定位搜索框并输入。',
				action: {
					name: 'locate_by_vision',
					input: { target_description: '页面主体中的搜索输入框', text: 'hello' },
				},
			})
		},
		observation: buildTestObservation(),
	})
	assertAction(decision.result, 'locate_by_vision')
	if (requestBodies.length !== 2) {
		throw new Error(`missing locate_by_vision target_description should trigger one replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('target_description')) {
		throw new Error('planner did not explain missing locate_by_vision target_description')
	}
}

async function assertAskUserToolTimesOut() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/tools.js', {
		NC_BG_CONSTANTS: {
			TYPES: { ACT: 'NC_ACT', ASK_USER_REQUEST: 'NC_ASK_USER_REQUEST', OBSERVE: 'NC_OBSERVE' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: true, message: 'unused' }),
			normalizeUrl: (url) => url,
			createTabAndWaitLoaded: async () => ({ id: 1 }),
			sendRuntimeMessage: async () => new Promise(() => {}),
		},
	})
	const result = await sandbox.NC_BG_TOOLS.executeTool(
		{ id: 'ask-timeout' },
		{ name: 'ask_user', input: { question: '请输入验证码', timeout_ms: 50 } }
	)
	if (result.success || !String(result.message || '').includes('超时')) {
		throw new Error(`ask_user should fail instead of hanging when user response times out, got ${JSON.stringify(result)}`)
	}
	const timeoutMs = sandbox.NC_BG_TOOLS_TESTS.getAskUserTimeoutMs({ timeout_ms: 5 })
	if (timeoutMs < 50) {
		throw new Error(`ask_user timeout should be clamped to a safe minimum, got ${timeoutMs}`)
	}
}

async function assertExplicitDropdownToolsAreRegisteredAndRouted() {
	const pageActions = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/tools.js', {
		NC_BG_CONSTANTS: {
			TYPES: { ACT: 'NC_ACT', ASK_USER_REQUEST: 'NC_ASK_USER_REQUEST', OBSERVE: 'NC_OBSERVE' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async (_tabId, message) => {
				pageActions.push(message.action)
				return { success: true, message: `ran ${message.action?.name}` }
			},
			normalizeUrl: (url) => url,
			createTabAndWaitLoaded: async () => ({ id: 1 }),
			sendRuntimeMessage: async () => ({ ok: true, answer: 'ok' }),
		},
	})
	const names = sandbox.NC_BG_TOOLS.listTools().map((tool) => tool.name)
	for (const name of ['open_dropdown', 'choose_dropdown_option', 'select_dropdown_option']) {
		if (!names.includes(name)) throw new Error(`dropdown tool is not registered: ${name}`)
	}
	const plannerNames = sandbox.NC_BG_TOOLS.listPlannerTools().map((tool) => tool.name)
	if (plannerNames.includes('select_dropdown_option')) {
		throw new Error(`legacy select_dropdown_option should not be exposed through planner-visible tools: ${JSON.stringify(plannerNames)}`)
	}
	const prompt = sandbox.NC_BG_TOOLS.getToolPromptLines().join('\n')
	if (!prompt.includes('open_dropdown') || !prompt.includes('choose_dropdown_option')) {
		throw new Error(`explicit dropdown tools should be visible to the planner: ${prompt}`)
	}
	if (prompt.includes('select_dropdown_option')) {
		throw new Error(`legacy select_dropdown_option should stay executable but hidden from planner prompts: ${prompt}`)
	}
	if (!/choose_dropdown_option:[\s\S]*index:number\|required/.test(prompt)) {
		throw new Error(`choose_dropdown_option should require a scoped field index: ${prompt}`)
	}
	await sandbox.NC_BG_TOOLS.executeTool(
		{ currentTabId: 9, config: { inputMode: 'standard' } },
		{ name: 'open_dropdown', input: { index: 4 } }
	)
	await sandbox.NC_BG_TOOLS.executeTool(
		{ currentTabId: 9, config: { inputMode: 'standard' } },
		{ name: 'choose_dropdown_option', input: { index: 4, text: '企业端' } }
	)
	if (pageActions[0]?.name !== 'open_dropdown' || pageActions[1]?.name !== 'choose_dropdown_option') {
		throw new Error(`explicit dropdown tools should route to matching content actions: ${JSON.stringify(pageActions)}`)
	}
	const contentActions = read('naturalclick-extension/content/actions.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	if (!contentActions.includes("name === 'open_dropdown'") || !contentActions.includes("name === 'choose_dropdown_option'")) {
		throw new Error('content action dispatcher should understand explicit dropdown action names')
	}
	if (!actionSelect.includes('openDropdownAction') || !actionSelect.includes('chooseDropdownOptionAction')) {
		throw new Error('content dropdown implementation should expose explicit open/select wrappers')
	}
	const plannerSandbox = loadBackgroundModule('naturalclick-extension/background/planner.js', {
		NC_BG_UTILS: {
			safeJsonParse: (value) => {
				try {
					return JSON.parse(value)
				} catch (_) {
					return null
				}
			},
			generateId: () => 'test_id',
		},
		NC_BG_CONSTANTS: { MAX_TRACE_ITEMS: 80 },
		NC_BG_TOOLS: {
			listPlannerTools: () => [
				{ name: 'open_dropdown' },
				{ name: 'choose_dropdown_option' },
			],
			listTools: () => [
				{ name: 'open_dropdown' },
				{ name: 'choose_dropdown_option' },
				{ name: 'select_dropdown_option' },
			],
			getToolPromptLines: () => [
				'- open_dropdown: 展开指定 index 的下拉框 input={index:number|required}',
				'- choose_dropdown_option: 选择指定字段候选 input={index:number|required,text:string|required}',
			],
		},
		chrome: { tabs: { query: async () => [] } },
		fetch: async () => fakeJsonResponse({ action: { name: 'done', input: { text: 'ok', success: true } } }),
		AbortController,
	})
	const availableNames = plannerSandbox.NC_BG_PLANNER_TESTS.getAvailableActionNames()
	if (availableNames.has('select_dropdown_option')) {
		throw new Error(`planner should only accept planner-visible tools, got ${JSON.stringify(Array.from(availableNames))}`)
	}
}

async function runPlannerWithFakeModel({ fetchImpl, observation, sessionOverrides = {}, planOptions = {} }) {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/planner.js', {
		NC_BG_UTILS: {
			safeJsonParse: (value) => {
				try {
					return JSON.parse(value)
				} catch (_) {
					return null
				}
			},
			generateId: () => 'test_id',
		},
		NC_BG_CONSTANTS: { MAX_TRACE_ITEMS: 80 },
		NC_BG_TOOLS: {
			getToolPromptLines: () => [
				'- input_text: 向当前观察结果中的可编辑元素输入文本 input={index:number|required,text:string|required}',
				'- click_element_by_index: 点击当前观察结果中的指定元素索引 input={index:number|required}',
				'- open_dropdown: 展开指定 index 的下拉框并返回真实可见候选 input={index:number|required}',
				'- choose_dropdown_option: 在指定字段的已知候选中按真实可见文本选择下拉选项 input={index:number|required,text:string|required,label:string|optional}',
				'- select_dropdown_option: 按文本选择下拉选项；只提供 index 时展开下拉框 input={index:number|optional,text:string|optional}',
				'- locate_by_vision: 按语义描述视觉定位目标并执行输入或点击 input={target_description:string|required,index:number|optional,text:string|optional}',
			],
		},
		chrome: {
			tabs: {
				query: async () => [
					{ id: 1, title: 'Example', url: 'http://example.test/app', current: true },
				],
			},
		},
		fetch: fetchImpl,
		AbortController,
	})
	const baseSession = {
		windowId: 1,
		currentTabId: 1,
		step: 1,
		task: '打开 http://example.test/app 并在搜索框输入 hello。',
		latestTask: '打开 http://example.test/app 并在搜索框输入 hello。',
		config: {
			textLLM: {
				baseURL: 'http://model.test/v1',
				model: 'fake-model',
				apiKey: '',
			},
		},
		history: [],
		traceItems: [],
	}
	const session = {
		...baseSession,
		...sessionOverrides,
		config: {
			...baseSession.config,
			...(sessionOverrides.config || {}),
			textLLM: {
				...baseSession.config.textLLM,
				...(sessionOverrides.config?.textLLM || {}),
			},
		},
	}
	return {
		result: await sandbox.NC_BG_PLANNER.planAction(session, observation, planOptions),
		session,
	}
}

function buildTestObservation(options = {}) {
	const rawCount = Number(options.rawCount || 0)
	return {
		url: 'http://example.test/app',
		title: 'Example',
		forms: [
			{
				id: 'page_form',
				name: '页面表单',
				fields: [
					{
						index: 3,
						region: 'content',
						fieldType: 'search',
						label: '搜索',
						valueState: 'empty',
						role: 'textbox',
						rect: { left: 10, top: 20, width: 180, height: 36 },
					},
				],
			},
		],
		actions: [],
		options: [],
		popups: [],
		panels: [],
		elements: [
			{
				index: 3,
				region: 'content',
				role: 'textbox',
				fieldType: 'search',
				label: '搜索',
				valueState: 'empty',
				rect: { left: 10, top: 20, width: 180, height: 36 },
			},
		],
		simplifiedDom: ['<field index="3" region="content" fieldType="search" value="empty">搜索</field>'],
		rawCandidates: Array.from({ length: rawCount }, (_, index) => `[${index + 10}] button label="noise-${index}"`),
	}
}

function buildDropdownTestObservation(label) {
	const observation = buildTestObservation()
	const selectField = {
		index: 4,
		region: 'content',
		fieldType: 'select',
		label,
		valueState: 'empty',
		role: 'combobox',
		tag: 'div',
		selectionControl: 'dropdown',
		rect: { left: 220, top: 20, width: 180, height: 36 },
	}
	observation.forms[0].fields.push(selectField)
	observation.elements.push(selectField)
	return observation
}

function fakeJsonResponse(decision, options = {}) {
	return {
		ok: true,
		json: async () => ({
			id: 'chatcmpl-test',
			model: 'fake-model',
			choices: [{ message: { content: JSON.stringify(decision), ...(options.messageExtras || {}) } }],
			usage: { total_tokens: 1 },
		}),
	}
}

function getUserMessageText(body) {
	const user = body?.messages?.find((message) => message.role === 'user')
	return String(user?.content || '')
}

function getSystemMessageText(body) {
	const system = body?.messages?.find((message) => message.role === 'system')
	return String(system?.content || '')
}

function assertLoopGuardBehavior() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: {},
		},
		NC_BG_UTILS: { generateId: () => 'test_id' },
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const sessionTests = sandbox.NC_BG_SESSION_ENGINE_TESTS
	if (!sessionTests?.detectActionLoop) {
		throw new Error('session-engine test contract is not exported')
	}

	const repeatedScroll = {
		history: repeatedHistory('scroll', { down: true }, '向下滚动', 5),
	}
	const scrollDecision = {
		next_goal: '向下滚动',
		action: { name: 'scroll', input: { down: true } },
	}
	if (sessionTests.detectActionLoop(repeatedScroll, scrollDecision).blocked) {
		throw new Error('loop guard should not block naturally repeatable scroll actions')
	}

	const repeatedClick = {
		history: repeatedHistory('click_element_by_index', { index: 7 }, '点击目标按钮', 3),
	}
	const clickDecision = {
		next_goal: '点击目标按钮',
		action: { name: 'click_element_by_index', input: { index: 7 } },
	}
	if (!sessionTests.detectActionLoop(repeatedClick, clickDecision).blocked) {
		throw new Error('loop guard should block repeated identical click actions')
	}

	const oneUnverifiedClick = {
		history: repeatedHistory('click_element_by_index', { index: 7 }, '点击目标按钮', 1),
	}
	if (!sessionTests.detectActionLoop(oneUnverifiedClick, clickDecision).blocked) {
		throw new Error('loop guard should block an immediate repeated click when the previous click has no verified progress')
	}

	const repeatedFailedClick = {
		history: repeatedHistory('click_element_by_index', { index: 8 }, '点击提交按钮', 2, false),
	}
	const failedClickDecision = {
		next_goal: '点击提交按钮',
		action: { name: 'click_element_by_index', input: { index: 8 } },
	}
	if (!sessionTests.detectActionLoop(repeatedFailedClick, failedClickDecision).blocked) {
		throw new Error('loop guard should block repeated identical failed click actions before a third execution')
	}

	const equivalentFailedClick = {
		history: [
			{ stepIndex: 1, action: 'click_element_by_index', input: { index: '8' }, nextGoal: '点一次', success: false, output: 'failed' },
			{ stepIndex: 2, action: 'click_element_by_index', input: { index: 8 }, nextGoal: '再点一次', success: false, output: 'failed' },
		],
	}
	const equivalentFailedDecision = {
		next_goal: '第三种说法继续点',
		action: { name: 'click_element_by_index', input: { index: '8' } },
	}
	if (!sessionTests.detectActionLoop(equivalentFailedClick, equivalentFailedDecision).blocked) {
		throw new Error('loop guard should normalize equivalent numeric index inputs before repeat detection')
	}

	const sigA = sessionTests.stableActionInputSignature({
		index: '7',
		text: ' admin ',
		down: 'true',
		nested: { ms: '1000' },
	})
	const sigB = sessionTests.stableActionInputSignature({
		nested: { ms: 1000 },
		down: true,
		text: 'admin',
		index: 7,
	})
	if (sigA !== sigB) {
		throw new Error(`loop guard input signature should canonicalize model output jitter: ${sigA} !== ${sigB}`)
	}

	const loopGuardThenWaitHistory = [
		{
			stepIndex: 1,
			action: 'click_element_by_index',
			input: { index: 8 },
			nextGoal: '点击提交按钮',
			success: false,
			output: '动作校验失败',
		},
		{
			stepIndex: '2.loop',
			action: 'click_element_by_index.loop_guard',
			input: { index: 8 },
			nextGoal: '重新规划，避免重复动作',
			success: false,
			output: '循环保护',
		},
		{
			stepIndex: 3,
			action: 'wait',
			input: { ms: 1000 },
			nextGoal: '等待页面稳定',
			success: true,
			output: 'ok',
		},
	]
	const loopGuardThenWaitDecision = {
		next_goal: '点击提交按钮',
		action: { name: 'click_element_by_index', input: { index: 8 } },
	}
	if (!sessionTests.detectActionLoop({ history: loopGuardThenWaitHistory }, loopGuardThenWaitDecision).blocked) {
		throw new Error('loop guard history should still count as the original blocked action after an intervening wait')
	}

	const repeatedKeypress = {
		history: repeatedHistory('keypress', { key: 'Enter' }, '按回车提交', 3),
	}
	const keypressDecision = {
		next_goal: '按回车提交',
		action: { name: 'keypress', input: { key: 'Enter' } },
	}
	if (!sessionTests.detectActionLoop(repeatedKeypress, keypressDecision).blocked) {
		throw new Error('loop guard should block repeated identical keypress actions')
	}

	const oldDropdownOpenHistory = {
		history: repeatedHistory('select_dropdown_option', { index: 4 }, '展开用户平台下拉', 1),
	}
	const explicitOpenDecision = {
		next_goal: '展开用户平台下拉',
		action: { name: 'open_dropdown', input: { index: 4 } },
	}
	if (!sessionTests.detectActionLoop(oldDropdownOpenHistory, explicitOpenDecision).blocked) {
		throw new Error('loop guard should treat legacy index-only select_dropdown_option as open_dropdown')
	}

	const explicitOpenHistory = {
		history: repeatedHistory('open_dropdown', { index: 4 }, '展开用户平台下拉', 1),
	}
	const legacyOpenDecision = {
		next_goal: '展开用户平台下拉',
		action: { name: 'select_dropdown_option', input: { index: 4 } },
	}
	if (!sessionTests.detectActionLoop(explicitOpenHistory, legacyOpenDecision).blocked) {
		throw new Error('loop guard should treat open_dropdown as legacy index-only select_dropdown_option')
	}

	const oldDropdownChoiceHistory = {
		history: repeatedHistory('select_dropdown_option', { index: 4, text: '企业端' }, '选择用户平台', 1),
	}
	const explicitChoiceDecision = {
		next_goal: '选择用户平台',
		action: { name: 'choose_dropdown_option', input: { index: 4, text: '企业端' } },
	}
	if (!sessionTests.detectActionLoop(oldDropdownChoiceHistory, explicitChoiceDecision).blocked) {
		throw new Error('loop guard should treat legacy text select_dropdown_option as choose_dropdown_option')
	}

	const labelChoiceHistory = {
		history: repeatedHistory('choose_dropdown_option', { index: 4, label: '企业端' }, '选择用户平台', 1),
	}
	const textChoiceDecision = {
		next_goal: '选择用户平台',
		action: { name: 'select_dropdown_option', input: { index: 4, text: '企业端' } },
	}
	if (!sessionTests.detectActionLoop(labelChoiceHistory, textChoiceDecision).blocked) {
		throw new Error('loop guard should canonicalize dropdown choice text/label inputs before repeat detection')
	}

	const repeatedFailedScroll = {
		history: repeatedHistory('scroll', { down: true }, '继续滚动查找内容', 1, false),
	}
	const failedScrollDecision = {
		next_goal: '继续滚动查找内容',
		action: { name: 'scroll', input: { down: true } },
	}
	if (!sessionTests.detectActionLoop(repeatedFailedScroll, failedScrollDecision).blocked) {
		throw new Error('loop guard should block repeated scroll after a no-movement failure')
	}

	const repeatedWait = {
		history: repeatedHistory('wait', { ms: 1000, reason: '等待页面加载' }, '等待页面加载', 2),
	}
	const waitDecision = {
		next_goal: '等待页面加载',
		action: { name: 'wait', input: { ms: 1000, reason: '等待页面加载' } },
	}
	if (!sessionTests.detectActionLoop(repeatedWait, waitDecision).blocked) {
		throw new Error('loop guard should block repeated passive waits before they become a dead loop')
	}

	const variedWaitHistory = [
		{
			stepIndex: 1,
			action: 'wait',
			input: { ms: 800, reason: '等待页面稳定' },
			nextGoal: '等待页面稳定',
			success: true,
			output: 'ok',
		},
		{
			stepIndex: 2,
			action: 'wait',
			input: { ms: 1000, reason: '等待弹层出现' },
			nextGoal: '等待弹层出现',
			success: true,
			output: 'ok',
		},
		{
			stepIndex: 3,
			action: 'wait',
			input: { ms: 1200, reason: '等待数据加载' },
			nextGoal: '等待数据加载',
			success: true,
			output: 'ok',
		},
	]
	const variedWaitDecision = {
		next_goal: '继续等待异步结果',
		action: { name: 'wait', input: { ms: 1400, reason: '继续等待异步结果' } },
	}
	if (!sessionTests.detectActionLoop({ history: variedWaitHistory }, variedWaitDecision).blocked) {
		throw new Error('loop guard should block passive waits even when wait reason/ms changes')
	}

	const repeatedFailedHover = {
		history: repeatedHistory('hover_element_by_index', { index: 5 }, '悬浮展开菜单', 1, false),
	}
	const hoverDecision = {
		next_goal: '悬浮展开菜单',
		action: { name: 'hover_element_by_index', input: { index: 5 } },
	}
	if (!sessionTests.detectActionLoop(repeatedFailedHover, hoverDecision).blocked) {
		throw new Error('loop guard should block repeated hover after it failed to change the page')
	}

	const defaultBudget = sessionTests.getPlanningTimeoutMs({ config: { textLLM: {} } })
	if (defaultBudget < 75000) {
		throw new Error(`default planning timeout is too small: ${defaultBudget}`)
	}
	const longModelBudget = sessionTests.getPlanningTimeoutMs({ config: { textLLM: { timeoutMs: 90000 } } })
	if (longModelBudget < 255000) {
		throw new Error(`planning timeout should cover four clamped long model calls plus overhead, got ${longModelBudget}`)
	}
	if (typeof sessionTests.getEffectiveModelRoundTimeoutMs !== 'function') {
		throw new Error('session timing tests should expose effective model round timeout helper')
	}
	if (sessionTests.getEffectiveModelRoundTimeoutMs({ timeoutMs: 5000 }) !== 8000) {
		throw new Error('effective model round timeout should not go below the planner safe minimum')
	}
}

function assertLoopGuardAllowsVerifiedProgressRepeats() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: {},
		},
		NC_BG_UTILS: { generateId: () => 'test_id' },
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const sessionTests = sandbox.NC_BG_SESSION_ENGINE_TESTS
	if (!sessionTests?.detectActionLoop || !sessionTests?.hasVerifiedProgress) {
		throw new Error('verified progress loop guard test contract is not exported')
	}
	const history = repeatedHistory('click_element_by_index', { index: 7 }, '点击下一页', 3)
	for (const item of history) {
		item.verified = true
		item.verifyReason = 'DOM 摘要已变化'
		item.output = `${item.output} | 校验通过: ${item.verifyReason}`
	}
	if (!history.every((item) => sessionTests.hasVerifiedProgress(item))) {
		throw new Error('verified progress detector should recognize DOM-changing actions')
	}
	const decision = {
		next_goal: '点击下一页',
		action: { name: 'click_element_by_index', input: { index: 7 } },
	}
	if (sessionTests.detectActionLoop({ history }, decision).blocked) {
		throw new Error('loop guard should allow repeated actions that were verified to make progress')
	}

	const structuredHistory = repeatedHistory('click_element_by_index', { index: 7 }, '点击下一页', 3)
	for (const item of structuredHistory) {
		item.output = 'ok'
		item.outcome = { kind: 'value_changed', progress: true, reason: 'page value changed' }
	}
	if (!structuredHistory.every((item) => sessionTests.hasVerifiedProgress(item))) {
		throw new Error('verified progress detector should recognize structured progress outcomes without localized text')
	}
	if (sessionTests.detectActionLoop({ history: structuredHistory }, decision).blocked) {
		throw new Error('loop guard should allow repeated actions with structured progress outcomes')
	}

	const noEffectHistory = repeatedHistory('click_element_by_index', { index: 7 }, '点击下一页', 1)
	noEffectHistory[0].verified = true
	noEffectHistory[0].verifyReason = 'DOM 摘要已变化'
	noEffectHistory[0].outcome = { kind: 'no_effect', progress: false, reason: 'verification found no change' }
	if (sessionTests.hasVerifiedProgress(noEffectHistory[0])) {
		throw new Error('structured no_effect outcome should override stale localized verification text')
	}
	if (!sessionTests.detectActionLoop({ history: noEffectHistory }, decision).blocked) {
		throw new Error('loop guard should still block immediate repeats after a structured no_effect outcome')
	}
}

async function assertSessionStoresVerificationProgress() {
	const decisions = [
		{
			evaluation_previous_goal: '准备点击下一页。',
			memory: '点击后应进入下一页。',
			thought: '根据页面按钮继续推进。',
			next_goal: '点击下一页',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
		{
			evaluation_previous_goal: '已进入下一页。',
			memory: '动作有可见进展。',
			thought: '任务结束。',
			next_goal: '完成任务',
			action: { name: 'done', input: { text: '完成', success: true } },
		},
	]
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example', content: 'page' },
			}),
			executeAction: async (_session, action) => ({
				success: true,
				message: `executed ${action.name}`,
				meta: {
					outcome: { kind: 'no_effect', progress: false, reason: 'initial click only focused' },
				},
			}),
		},
		NC_BG_PLANNER: {
			planAction: async () => {
				const decision = decisions.shift()
				if (!decision) throw new Error('planner called too many times')
				return decision
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => true,
			verifyExecutionOutcome: async () => ({ ok: true, reason: 'DOM 摘要已变化' }),
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
			attemptVisionFallback: async () => ({ success: false, message: 'unused' }),
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const session = {
		id: 'session-verify-progress',
		status: 'running',
		aborted: false,
		step: 0,
		task: '测试校验进展写入历史',
		latestTask: '测试校验进展写入历史',
		currentTabId: 1,
		windowId: 1,
		config: { maxSteps: 4, textLLM: {} },
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	const sessions = new Map([[session.id, session]])

	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)

	const first = session.history[0]
	if (!first?.verified || first.verifyReason !== 'DOM 摘要已变化') {
		throw new Error(`session should store verification progress on history, got ${JSON.stringify(first)}`)
	}
	if (first.outcome?.kind !== 'dom_changed' || first.outcome?.progress !== true) {
		throw new Error(`verification success should replace non-progress execution outcome with progress outcome, got ${JSON.stringify(first.outcome)}`)
	}
	if (!String(first.output || '').includes('校验通过: DOM 摘要已变化')) {
		throw new Error(`session history output should include verification progress, got ${first.output}`)
	}
	if (String(first.output || '').includes('动作结果: no_effect') || !String(first.output || '').includes('动作结果: dom_changed')) {
		throw new Error(`session history output should replace stale no_effect outcome after verification success, got ${first.output}`)
	}
	if (!sandbox.NC_BG_SESSION_ENGINE_TESTS.hasVerifiedProgress(first)) {
		throw new Error(`loop guard should recognize verification-upgraded outcome as progress, got ${JSON.stringify(first)}`)
	}
	if (!session.traceItems.some((item) => String(item.detail || '').includes('校验通过: DOM 摘要已变化'))) {
		throw new Error('session trace should include verification progress')
	}
	if (session.traceItems.some((item) => String(item.detail || '').includes('动作结果: no_effect'))) {
		throw new Error(`session trace should not keep stale no_effect outcome after verification success: ${JSON.stringify(session.traceItems)}`)
	}
}

async function assertSessionLogsVerificationRecoveryOutcome() {
	const decisions = [
		{
			evaluation_previous_goal: '准备点击。',
			memory: '需要用视觉恢复校验失败。',
			thought: '先执行一次点击。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
		{
			evaluation_previous_goal: '视觉恢复已完成。',
			memory: '恢复动作有结构化结果。',
			thought: '结束测试。',
			next_goal: '完成任务',
			action: { name: 'done', input: { text: '完成', success: true } },
		},
	]
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example', content: 'same' },
			}),
			executeAction: async (_session, action) => ({ success: true, message: `executed ${action.name}` }),
		},
		NC_BG_PLANNER: {
			planAction: async () => {
				const decision = decisions.shift()
				if (!decision) throw new Error('planner called too many times')
				return decision
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: (action) => action?.name === 'click_element_by_index',
			verifyExecutionOutcome: async () => ({ ok: false, reason: '点击后页面无可见变化' }),
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => true,
			attemptVisionFallback: async () => ({
				success: true,
				message: '坐标动作已完成。',
				meta: {
					outcome: { kind: 'value_changed', progress: true },
				},
			}),
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const session = {
		id: 'session-verify-recovery-outcome',
		status: 'running',
		aborted: false,
		step: 0,
		task: '测试校验恢复结构化结果',
		latestTask: '测试校验恢复结构化结果',
		currentTabId: 1,
		windowId: 1,
		config: { maxSteps: 4, textLLM: {} },
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	const sessions = new Map([[session.id, session]])

	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)

	const recovery = session.history.find((item) => String(item.action || '').endsWith('.vision_recovery'))
	if (!recovery) throw new Error(`session should record vision recovery, got ${JSON.stringify(session.history)}`)
	if (!String(recovery.output || '').includes('动作结果: value_changed')) {
		throw new Error(`vision recovery output should preserve structured outcome summary, got ${recovery.output}`)
	}
	if (!session.traceItems.some((item) => String(item.detail || '').includes('动作结果: value_changed'))) {
		throw new Error('vision recovery trace should include structured outcome summary')
	}
}

function assertRedundantInputRewriteComparesText() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: {},
		},
		NC_BG_UTILS: { generateId: () => 'test_id' },
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const sessionTests = sandbox.NC_BG_SESSION_ENGINE_TESTS
	if (!sessionTests?.detectRedundantInputRewrite) {
		throw new Error('redundant input rewrite test contract is not exported')
	}

	const variedValuesSession = {
		history: [
			{
				stepIndex: 1,
				action: 'input_text',
				input: { index: 3, text: 'alpha' },
				nextGoal: '测试搜索框 alpha',
				success: true,
				output: 'ok',
			},
			{
				stepIndex: 2,
				action: 'input_text',
				input: { index: 3, text: 'beta' },
				nextGoal: '测试搜索框 beta',
				success: true,
				output: 'ok',
			},
		],
	}
	const variedValuesAction = { name: 'input_text', input: { index: 3, text: 'gamma' } }
	if (sessionTests.detectRedundantInputRewrite(variedValuesSession, variedValuesAction).blocked) {
		throw new Error('redundant input rewrite guard should allow different values for the same input')
	}

	const sameValueSession = {
		history: [
			{
				stepIndex: 1,
				action: 'input_text',
				input: { index: 3, text: 'alpha' },
				nextGoal: '测试搜索框 alpha',
				success: true,
				output: 'ok',
			},
			{
				stepIndex: 2,
				action: 'type',
				input: { index: 3, text: ' alpha ' },
				nextGoal: '再次测试搜索框 alpha',
				success: true,
				output: 'ok',
			},
		],
	}
	const sameValueAction = { name: 'input_text', input: { index: 3, text: 'alpha' } }
	if (!sessionTests.detectRedundantInputRewrite(sameValueSession, sameValueAction).blocked) {
		throw new Error('redundant input rewrite guard should block repeated same text for the same input')
	}
}

function assertVisionFallbackSkipsSemanticActionFailures() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: {},
		},
		NC_BG_UTILS: { generateId: () => 'test_id' },
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const shouldAttempt = sandbox.NC_BG_SESSION_ENGINE_TESTS.shouldAttemptVisionFallbackForFailure
	if (typeof shouldAttempt !== 'function') {
		throw new Error('shouldAttemptVisionFallbackForFailure test hook is not exported')
	}
	for (const message of [
		'索引 7 对应输入目标不可编辑。',
		'索引 4 对应下拉框已禁用。',
		'select_dropdown_option 缺少 index 或 text。',
		'检测到同一输入框索引 3 重复写入相同文本。',
		'选择失败：select 中没有匹配选项 "WEB"。',
	]) {
		if (shouldAttempt(message)) {
			throw new Error(`semantic action failure should not trigger vision fallback: ${message}`)
		}
	}
	if (!shouldAttempt('页面动作超时')) {
		throw new Error('action timeout should still allow vision fallback')
	}
	if (!shouldAttempt('坐标未命中可用元素')) {
		throw new Error('positioning failures should still allow vision fallback')
	}
}

async function assertNavigationRevealSkipsVerificationVisionRecovery() {
	let visionCalled = false
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-recovery.js', {
		NC_BG_VISION: {
			canUseVisionFallback: () => true,
			attemptVisionFallback: async () => {
				visionCalled = true
				return { success: true, message: 'should not happen' }
			},
		},
	})
	const recovery = await sandbox.NC_BG_SESSION_RECOVERY.attemptVerificationRecovery(
		{},
		{
			action: {
				name: 'click_element_by_index',
				input: {
					index: 18,
					target_label: '更多',
					target_region: 'header',
					workflow: 'task-navigation',
					workflow_step: 'reveal_navigation_options',
				},
			},
		},
		{},
		'动作结果: focused progress=false'
	)
	if (recovery.success || visionCalled) {
		throw new Error(`navigation reveal verification failure should replan instead of triggering vision recovery: ${JSON.stringify(recovery)}`)
	}
}

async function assertSessionLoopGuardReplansToCompletion() {
	const executedActions = []
	const decisions = [
		{
			evaluation_previous_goal: '上一轮仍在点击同一个目标。',
			memory: '已有重复点击历史。',
			thought: '重复点击应被主循环保护拦截。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
		{
			evaluation_previous_goal: '循环保护已要求换策略。',
			memory: '改用另一个可执行字段验证重规划。',
			thought: '根据失败反馈选择不同动作。',
			next_goal: '输入替代测试值',
			action: { name: 'input_text', input: { index: 9, text: 'ok' } },
		},
		{
			evaluation_previous_goal: '替代动作已成功执行。',
			memory: '主循环已从重复动作中恢复。',
			thought: '任务可以结束。',
			next_goal: '完成任务',
			action: { name: 'done', input: { text: '完成', success: true } },
		},
	]
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example' },
			}),
			executeAction: async (_session, action) => {
				executedActions.push(action)
				return { success: true, message: `executed ${action.name}` }
			},
		},
		NC_BG_PLANNER: {
			planAction: async () => {
				const decision = decisions.shift()
				if (!decision) throw new Error('planner called too many times')
				return decision
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => false,
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
			attemptVisionFallback: async () => ({ success: false, message: 'unused' }),
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const session = {
		id: 'session-loop-guard',
		status: 'running',
		aborted: false,
		step: 0,
		task: '测试主循环循环保护',
		latestTask: '测试主循环循环保护',
		currentTabId: 1,
		windowId: 1,
		config: { maxSteps: 6, textLLM: {} },
		history: repeatedHistory('click_element_by_index', { index: 7 }, '点击目标按钮', 3),
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	const sessions = new Map([[session.id, session]])

	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)

	if (session.status !== 'completed') {
		throw new Error(`session loop guard recovery did not complete: ${session.status}`)
	}
	if (sessions.has(session.id)) {
		throw new Error('completed session was not removed from active sessions')
	}
	if (executedActions.length !== 1 || executedActions[0]?.name !== 'input_text') {
		throw new Error(
			`loop-guarded click should not execute; executed actions: ${executedActions
				.map((action) => action.name)
				.join(',')}`
		)
	}
	const loopGuardHistory = session.history.find((item) => item.action === 'click_element_by_index.loop_guard')
	if (!loopGuardHistory) {
		throw new Error('loop guard recovery did not record a .loop_guard history item')
	}
	if (
		loopGuardHistory.outcome?.kind !== 'no_effect' ||
		loopGuardHistory.outcome?.progress !== false ||
		!String(loopGuardHistory.output || '').includes('动作结果: no_effect')
	) {
		throw new Error(`loop guard history should carry a structured no_effect outcome, got ${JSON.stringify(loopGuardHistory)}`)
	}
	if (!session.traceItems.some((item) => String(item.title || '').includes('循环保护'))) {
		throw new Error('loop guard recovery did not add a visible trace item')
	}
}

async function assertSessionPublishesPlanningProgress() {
	const updates = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example' },
			}),
		},
		NC_BG_PLANNER: {
			planAction: async (_session, _observation, options) => {
				options?.onProgress?.({
					stage: 'model_request',
					round: 1,
					text: '第 1 步：请求模型规划动作...',
				})
				return {
					evaluation_previous_goal: '测试结束。',
					memory: '无需执行页面动作。',
					thought: '返回失败 done 以结束测试。',
					next_goal: '结束测试。',
					action: { name: 'done', input: { text: '测试结束', success: false } },
				}
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
			requestUserConfirmation: async () => true,
		},
		chrome: {
			runtime: {
				sendMessage: (message, callback) => {
					updates.push(message)
					callback?.()
				},
				lastError: null,
			},
		},
	})
	const sessions = new Map()
	const session = {
		id: 'session-progress',
		task: '测试规划进度发布',
		latestTask: '测试规划进度发布',
		currentTabId: 1,
		status: 'running',
		activityText: '启动',
		config: { maxSteps: 2, textLLM: {} },
		step: 0,
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	sessions.set(session.id, session)
	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)
	const activityTexts = updates.map((message) => String(message?.payload?.activityText || ''))
	if (!activityTexts.some((text) => text.includes('请求模型规划动作'))) {
		throw new Error(`session engine should publish planner progress updates, got ${JSON.stringify(activityTexts)}`)
	}
}

async function assertSessionLogsStructuredOutcomeSummary() {
	const decisions = [
		{
			evaluation_previous_goal: '准备选择不存在的选项。',
			memory: '测试结构化失败结果。',
			thought: '执行一个会失败的下拉选择。',
			next_goal: '选择 WEB。',
			action: { name: 'select_dropdown_option', input: { index: 3, text: 'WEB' } },
		},
		{
			evaluation_previous_goal: '下拉选择失败。',
			memory: '候选中只有企业端。',
			thought: '失败后结束测试。',
			next_goal: '结束测试。',
			action: { name: 'done', input: { text: '测试结束', success: false } },
		},
	]
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example' },
			}),
			executeAction: async () => ({
				success: false,
				message: '未找到可见下拉选项 "WEB"。当前字段候选: 企业端。',
				meta: {
					outcome: {
						kind: 'failed',
						progress: false,
						reason: '未找到可见下拉选项 "WEB"。',
						requestedText: 'WEB',
						visibleOptions: ['企业端'],
					},
				},
			}),
		},
		NC_BG_PLANNER: {
			planAction: async () => {
				const decision = decisions.shift()
				if (!decision) throw new Error('planner called too many times')
				return decision
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => false,
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
			attemptVisionFallback: async () => ({ success: false, message: 'unused' }),
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const sessions = new Map()
	const session = {
		id: 'session-outcome-summary',
		task: '测试结构化动作结果日志',
		latestTask: '测试结构化动作结果日志',
		currentTabId: 1,
		windowId: 1,
		status: 'running',
		activityText: '启动',
		config: { maxSteps: 4, textLLM: {} },
		step: 0,
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	sessions.set(session.id, session)
	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)
	const failedHistory = session.history.find((item) => item.action === 'select_dropdown_option')
	if (!failedHistory || !String(failedHistory.output || '').includes('动作结果: failed')) {
		throw new Error(`session history should include structured outcome summary, got ${JSON.stringify(session.history)}`)
	}
	if (
		failedHistory.outcome?.kind !== 'failed' ||
		failedHistory.outcome?.progress !== false ||
		failedHistory.outcome?.requestedText !== 'WEB' ||
		!failedHistory.outcome?.visibleOptions?.includes('企业端')
	) {
		throw new Error(`session history should store the structured outcome object, got ${JSON.stringify(failedHistory.outcome)}`)
	}
	if (!String(failedHistory.output || '').includes('requested="WEB"') || !String(failedHistory.output || '').includes('candidates="企业端"')) {
		throw new Error(`structured outcome summary should include requested text and candidates, got ${failedHistory.output}`)
	}
	const failedTrace = session.traceItems.find((item) => item.action?.name === 'select_dropdown_option')
	if (!failedTrace || !String(failedTrace.detail || '').includes('动作结果: failed')) {
		throw new Error(`session trace should include structured outcome summary, got ${JSON.stringify(session.traceItems)}`)
	}
}

function assertSessionAddsFallbackOutcomeForUnstructuredFailure() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: { requestObservation: async () => ({ ok: true, data: {} }) },
		NC_BG_PLANNER: { planAction: async () => ({ action: { name: 'done', input: { success: false } } }) },
		NC_BG_CONFIRMATION: { detectDangerousAction: () => ({ isDangerous: false }) },
		NC_BG_VERIFIER: { shouldVerifyAction: () => false },
		NC_BG_VISION: { canUseVisionFallback: () => false },
		chrome: { runtime: { sendMessage: () => {}, lastError: null } },
	})
	const summary = sandbox.NC_BG_SESSION_ENGINE_TESTS.summarizeExecutionOutcome({
		success: false,
		message: '索引 27 对应输入目标不可编辑。',
	})
	if (!summary.includes('动作结果: failed') || !summary.includes('progress=false')) {
		throw new Error(`unstructured failures should get a fallback structured outcome, got: ${summary}`)
	}
	if (!summary.includes('reason="索引 27 对应输入目标不可编辑。"')) {
		throw new Error(`fallback structured outcome should include the original failure reason, got: ${summary}`)
	}
	const outcome = sandbox.NC_BG_SESSION_ENGINE_TESTS.getExecutionOutcome({
		success: false,
		message: '索引 27 对应输入目标不可编辑。',
	})
	if (
		outcome?.kind !== 'failed' ||
		outcome?.progress !== false ||
		!String(outcome.reason || '').includes('不可编辑')
	) {
		throw new Error(`unstructured failures should expose fallback outcome objects, got: ${JSON.stringify(outcome)}`)
	}
}

async function assertSessionLoopGuardWindowTerminatesAcrossWaits() {
	const executedActions = []
	const decisions = [
		{
			evaluation_previous_goal: '重复点击仍未推进。',
			memory: '已有重复点击历史。',
			thought: '这次点击应被循环保护拦截。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
		{
			evaluation_previous_goal: '循环保护后等待一下。',
			memory: '等待不能成为重复点击的逃逸通道。',
			thought: '短暂等待页面稳定。',
			next_goal: '等待页面稳定',
			action: { name: 'wait', input: { ms: 200 } },
		},
		{
			evaluation_previous_goal: '等待后又想重复点击。',
			memory: '仍然是同一个无效点击。',
			thought: '这次也应被循环保护拦截。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
		{
			evaluation_previous_goal: '又等待一次。',
			memory: '仍未改变策略。',
			thought: '再次等待。',
			next_goal: '等待页面稳定',
			action: { name: 'wait', input: { ms: 200 } },
		},
		{
			evaluation_previous_goal: '第三次重复点击。',
			memory: '短窗口内多次触发循环保护。',
			thought: '应终止而不是继续拖到 maxSteps。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
	]
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example' },
			}),
			executeAction: async (_session, action) => {
				executedActions.push(action)
				return { success: true, message: `executed ${action.name}` }
			},
		},
		NC_BG_PLANNER: {
			planAction: async () => {
				const decision = decisions.shift()
				if (!decision) throw new Error('planner called too many times')
				return decision
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => false,
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
			attemptVisionFallback: async () => ({ success: false, message: 'unused' }),
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const session = {
		id: 'session-loop-window',
		status: 'running',
		aborted: false,
		step: 0,
		task: '测试 wait 间隔循环保护',
		latestTask: '测试 wait 间隔循环保护',
		currentTabId: 1,
		windowId: 1,
		config: { maxSteps: 10, textLLM: {} },
		history: repeatedHistory('click_element_by_index', { index: 7 }, '点击目标按钮', 3),
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	const sessions = new Map([[session.id, session]])

	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)

	if (session.status !== 'error' || !String(session.activityText || '').includes('短窗口内触发循环保护')) {
		throw new Error(`loop guard window should terminate across intervening waits, got ${session.status}: ${session.activityText}`)
	}
	if (sessions.has(session.id)) {
		throw new Error('error session was not removed from active sessions')
	}
	if (executedActions.some((action) => action.name === 'click_element_by_index')) {
		throw new Error('loop-guarded repeated clicks should not execute')
	}
	if (executedActions.filter((action) => action.name === 'wait').length !== 2) {
		throw new Error(`expected two intervening waits to execute, got ${executedActions.map((action) => action.name).join(',')}`)
	}
}

function assertLoopGuardWindowResetsAfterSubstantiveSuccess() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: {},
		},
		NC_BG_UTILS: { generateId: () => 'test_id' },
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const count = sandbox.NC_BG_SESSION_ENGINE_TESTS.countRecentLoopGuardFailures({
		history: [
			{
				stepIndex: '1.loop',
				action: 'click_element_by_index.loop_guard',
				input: { index: 7 },
				success: false,
				output: '循环保护',
			},
			{
				stepIndex: 2,
				action: 'input_text',
				input: { index: 3, text: 'new-value' },
				success: true,
				output: '输入成功',
			},
			{
				stepIndex: '3.loop',
				action: 'click_element_by_index.loop_guard',
				input: { index: 8 },
				success: false,
				output: '循环保护',
			},
		],
	})
	if (count !== 1) {
		throw new Error(`substantive success should reset loop-guard short window, got ${count}`)
	}
}

async function assertVerificationFailureFeedsLoopGuard() {
	const decisions = [
		{
			evaluation_previous_goal: '准备点击。',
			memory: '目标按钮看起来可点。',
			thought: '先尝试点击目标。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
		{
			evaluation_previous_goal: '上次点击没有可见变化。',
			memory: '不能继续重复无效点击。',
			thought: '循环保护应在本轮执行前拦截重复点击。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
		{
			evaluation_previous_goal: '循环保护已提供失败反馈。',
			memory: '改用不同策略。',
			thought: '结束测试。',
			next_goal: '完成任务',
			action: { name: 'done', input: { text: '完成', success: true } },
		},
	]
	const executedActions = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example', content: 'same', activeElement: 'body' },
			}),
			executeAction: async (_session, action) => {
				executedActions.push(action)
				return { success: true, message: `executed ${action.name}`, meta: {} }
			},
		},
		NC_BG_PLANNER: {
			planAction: async () => {
				const decision = decisions.shift()
				if (!decision) throw new Error('planner called too many times')
				return decision
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: (action) => action?.name === 'click_element_by_index',
			verifyExecutionOutcome: async () => ({ ok: false, reason: '点击后页面无可见变化' }),
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
			attemptVisionFallback: async () => ({ success: false, message: 'unused' }),
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
		setTimeout,
		clearTimeout,
	})
	const session = {
		id: 'session-verify-loop',
		status: 'running',
		aborted: false,
		step: 0,
		task: '测试校验失败后循环保护',
		latestTask: '测试校验失败后循环保护',
		currentTabId: 1,
		windowId: 1,
		config: { maxSteps: 5, textLLM: {} },
		history: [
			{
				stepIndex: 0,
				action: 'click_element_by_index',
				input: { index: 7 },
				nextGoal: '点击目标按钮',
				success: false,
				output: '之前已失败一次',
			},
		],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	const sessions = new Map([[session.id, session]])

	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)

	const clickExecutions = executedActions.filter((action) => action.name === 'click_element_by_index')
	if (clickExecutions.length !== 1) {
		throw new Error(`verification failures should feed loop guard before a second repeated click, got ${clickExecutions.length}`)
	}
	const verifyFailure = session.history.find((item) => item.action === 'click_element_by_index' && item.success === false && String(item.output || '').includes('动作校验失败'))
	if (!verifyFailure) {
		throw new Error('verification failure should be recorded as the original action failure')
	}
	if (!String(verifyFailure.output || '').includes('动作结果: no_effect') || !String(verifyFailure.output || '').includes('progress=false')) {
		throw new Error(`verification failure should include structured no_effect outcome, got ${verifyFailure.output}`)
	}
	if (!session.history.some((item) => item.action === 'click_element_by_index.loop_guard')) {
		throw new Error('repeated verified failure should be converted into a loop_guard entry')
	}
}

async function assertSessionDoneFailureIsError() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example' },
			}),
		},
		NC_BG_PLANNER: {
			planAction: async () => ({
				evaluation_previous_goal: '无法继续。',
				memory: '缺少必要信息。',
				thought: '结束为失败状态。',
				next_goal: '结束任务',
				action: { name: 'done', input: { text: '无法继续', success: false } },
			}),
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => false,
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const session = {
		id: 'session-done-failure',
		status: 'running',
		aborted: false,
		step: 0,
		task: '测试 done 失败终态',
		latestTask: '测试 done 失败终态',
		currentTabId: 1,
		windowId: 1,
		config: { maxSteps: 3, textLLM: {} },
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	const sessions = new Map([[session.id, session]])

	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)

	if (session.status !== 'error') {
		throw new Error(`done success=false should end session as error, got ${session.status}`)
	}
	const doneHistory = session.history.find((item) => item.action === 'done')
	if (!doneHistory || doneHistory.success !== false || doneHistory.outcome?.kind !== 'no_effect') {
		throw new Error(`done success=false should be recorded in history with no_effect outcome, got ${JSON.stringify(session.history)}`)
	}
	if (!session.planItems.some((item) => item.title === '结束任务' && item.status === 'failed')) {
		throw new Error(`done success=false should refresh planItems with failed terminal row, got ${JSON.stringify(session.planItems)}`)
	}
	if (!session.traceItems.some((item) => item.action?.name === 'done' && item.kind === 'error')) {
		throw new Error('done success=false should be recorded as an error trace')
	}
	if (sessions.has(session.id)) {
		throw new Error('done failure session was not removed from active sessions')
	}
}

async function assertSessionDoneRecordsHistoryPlanAndWorkflowOutcome() {
	const recorded = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example' },
			}),
		},
		NC_BG_PLANNER: {
			planAction: async () => ({
				evaluation_previous_goal: '搜索项已经全部测试。',
				memory: '搜索工作流已到终态。',
				thought: '写入终态记录。',
				next_goal: '结束搜索项测试。',
				action: {
					name: 'done',
					input: {
						text: '搜索区域字段测试完成',
						success: true,
						workflow: 'search-fields',
						workflow_step: 'finish_search_fields',
					},
				},
			}),
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => false,
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
		},
		NC_BG_PLANNER_WORKFLOWS: {
			recordWorkflowOutcome: (_session, decision, outcome) => recorded.push({ decision, outcome }),
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const session = {
		id: 'session-done-workflow',
		status: 'running',
		aborted: false,
		step: 0,
		task: '测试搜索工作流 done 终态记录',
		latestTask: '测试搜索工作流 done 终态记录',
		currentTabId: 1,
		windowId: 1,
		config: { maxSteps: 3, textLLM: {} },
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	const sessions = new Map([[session.id, session]])

	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)

	if (session.status !== 'completed') {
		throw new Error(`workflow done success=true should complete session, got ${session.status}`)
	}
	const doneHistory = session.history.find((item) => item.action === 'done')
	if (
		!doneHistory ||
		doneHistory.success !== true ||
		doneHistory.input?.workflow !== 'search-fields' ||
		doneHistory.input?.workflow_step !== 'finish_search_fields'
	) {
		throw new Error(`workflow done should be recorded in session history, got ${JSON.stringify(session.history)}`)
	}
	if (!session.planItems.some((item) => item.title === '结束搜索项测试。' && item.status === 'done')) {
		throw new Error(`workflow done should refresh planItems with a terminal done row, got ${JSON.stringify(session.planItems)}`)
	}
	if (recorded.length !== 1 || recorded[0].outcome?.success !== true || recorded[0].outcome?.stage !== 'done') {
		throw new Error(`workflow done should record workflow outcome exactly once, got ${JSON.stringify(recorded)}`)
	}
	if (sessions.has(session.id)) {
		throw new Error('workflow done session was not removed from active sessions')
	}
}

async function assertSessionDoneSuccessAfterFailureIsError() {
	const decisions = [
		{
			evaluation_previous_goal: '上一轮仍在点击同一个目标。',
			memory: '已有重复点击历史。',
			thought: '重复点击应被主循环保护拦截。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
		{
			evaluation_previous_goal: '循环保护后错误地宣称完成。',
			memory: '实际上没有成功恢复动作。',
			thought: '不应允许 success=true 完成。',
			next_goal: '完成任务',
			action: { name: 'done', input: { text: '完成', success: true } },
		},
	]
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example' },
			}),
			executeAction: async (_session, action) => ({ success: true, message: `executed ${action.name}` }),
		},
		NC_BG_PLANNER: {
			planAction: async () => {
				const decision = decisions.shift()
				if (!decision) throw new Error('planner called too many times')
				return decision
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => false,
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const session = {
		id: 'session-done-after-failure',
		status: 'running',
		aborted: false,
		step: 0,
		task: '测试失败后不能假完成',
		latestTask: '测试失败后不能假完成',
		currentTabId: 1,
		windowId: 1,
		config: { maxSteps: 5, textLLM: {} },
		history: repeatedHistory('click_element_by_index', { index: 7 }, '点击目标按钮', 3),
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	const sessions = new Map([[session.id, session]])

	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)

	if (session.status !== 'error') {
		throw new Error(`done success=true after unresolved failure should be forced to error, got ${session.status}`)
	}
	if (!String(session.activityText || '').includes('已拦截')) {
		throw new Error(`done success=true after failure should explain interception, got ${session.activityText}`)
	}
	if (!session.traceItems.some((item) => item.action?.name === 'done' && item.kind === 'error')) {
		throw new Error('intercepted done success=true should be recorded as an error trace')
	}
	const doneTrace = session.traceItems.find((item) => item.action?.name === 'done')
	if (
		doneTrace?.action?.outcome?.kind !== 'no_effect' ||
		doneTrace.action.outcome?.progress !== false ||
		!String(doneTrace.action.output || '').includes('动作结果: no_effect')
	) {
		throw new Error(`intercepted done trace should carry a structured no_effect outcome, got ${JSON.stringify(doneTrace)}`)
	}
	if (sessions.has(session.id)) {
		throw new Error('intercepted done session was not removed from active sessions')
	}
}

async function assertSessionDoneSuccessAfterFailureAndWaitIsError() {
	const decisions = [
		{
			evaluation_previous_goal: '上一轮仍在点击同一个目标。',
			memory: '已有重复点击历史。',
			thought: '重复点击应被主循环保护拦截。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 7 } },
		},
		{
			evaluation_previous_goal: '循环保护后等待一下。',
			memory: 'wait 不应视为恢复动作。',
			thought: '等待页面稳定。',
			next_goal: '等待页面稳定',
			action: { name: 'wait', input: { ms: 200 } },
		},
		{
			evaluation_previous_goal: '等待后错误地宣称完成。',
			memory: '前面的失败没有被实质恢复。',
			thought: '不应允许 success=true 完成。',
			next_goal: '完成任务',
			action: { name: 'done', input: { text: '完成', success: true } },
		},
	]
	const executedActions = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-engine.js', {
		NC_BG_CONSTANTS: {
			MAX_CONSECUTIVE_FAILURES: 3,
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_test` },
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: { url: 'http://example.test/app', title: 'Example' },
			}),
			executeAction: async (_session, action) => {
				executedActions.push(action)
				return { success: true, message: `executed ${action.name}` }
			},
		},
		NC_BG_PLANNER: {
			planAction: async () => {
				const decision = decisions.shift()
				if (!decision) throw new Error('planner called too many times')
				return decision
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => false,
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
		},
		chrome: {
			runtime: {
				sendMessage: (_message, callback) => callback?.(),
				lastError: null,
			},
		},
	})
	const session = {
		id: 'session-done-after-failure-wait',
		status: 'running',
		aborted: false,
		step: 0,
		task: '测试失败 wait 后不能假完成',
		latestTask: '测试失败 wait 后不能假完成',
		currentTabId: 1,
		windowId: 1,
		config: { maxSteps: 6, textLLM: {} },
		history: repeatedHistory('click_element_by_index', { index: 7 }, '点击目标按钮', 3),
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	const sessions = new Map([[session.id, session]])

	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)

	if (session.status !== 'error') {
		throw new Error(`done success=true after unresolved failure hidden by wait should be forced to error, got ${session.status}`)
	}
	if (!String(session.activityText || '').includes('已拦截')) {
		throw new Error(`done success=true after wait-hidden failure should explain interception, got ${session.activityText}`)
	}
	if (executedActions.length !== 1 || executedActions[0]?.name !== 'wait') {
		throw new Error(`only the intervening wait should execute, got ${executedActions.map((action) => action.name).join(',')}`)
	}
	if (sessions.has(session.id)) {
		throw new Error('intercepted wait-hidden done session was not removed from active sessions')
	}
}

function loadBackgroundModule(relPath, globals) {
	const sandbox = {
		console,
		URL,
		setTimeout,
		clearTimeout,
		...globals,
	}
	sandbox.globalThis = sandbox
	if (relPath === 'naturalclick-extension/background/session-engine.js') {
		if (!sandbox.NC_ACTION_CONTRACT) {
			vm.runInNewContext(read('naturalclick-extension/shared/action-contract.js'), sandbox, {
				filename: 'naturalclick-extension/shared/action-contract.js',
			})
		}
		vm.runInNewContext(read('naturalclick-extension/background/loop-guard.js'), sandbox, {
			filename: 'naturalclick-extension/background/loop-guard.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/session-records.js'), sandbox, {
			filename: 'naturalclick-extension/background/session-records.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/session-recovery.js'), sandbox, {
			filename: 'naturalclick-extension/background/session-recovery.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/session-timing.js'), sandbox, {
			filename: 'naturalclick-extension/background/session-timing.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/session-lifecycle.js'), sandbox, {
			filename: 'naturalclick-extension/background/session-lifecycle.js',
		})
	}
	if (relPath === 'naturalclick-extension/background/planner.js') {
		if (!sandbox.NC_CONTROL_SEMANTICS) {
			vm.runInNewContext(read('naturalclick-extension/shared/control-semantics.js'), sandbox, {
				filename: 'naturalclick-extension/shared/control-semantics.js',
			})
		}
		vm.runInNewContext(read('naturalclick-extension/background/planner-context.js'), sandbox, {
			filename: 'naturalclick-extension/background/planner-context.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/planner-fastpath.js'), sandbox, {
			filename: 'naturalclick-extension/background/planner-fastpath.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/planner-validation.js'), sandbox, {
			filename: 'naturalclick-extension/background/planner-validation.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/planner-model-client.js'), sandbox, {
			filename: 'naturalclick-extension/background/planner-model-client.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/planner-decision.js'), sandbox, {
			filename: 'naturalclick-extension/background/planner-decision.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/planner-prompt.js'), sandbox, {
			filename: 'naturalclick-extension/background/planner-prompt.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/login-workflow.js'), sandbox, {
			filename: 'naturalclick-extension/background/login-workflow.js',
		})
		vm.runInNewContext(read('naturalclick-extension/background/search-workflow-state.js'), sandbox, {
			filename: 'naturalclick-extension/background/search-workflow-state.js',
		})
			vm.runInNewContext(read('naturalclick-extension/background/search-workflow-history.js'), sandbox, {
				filename: 'naturalclick-extension/background/search-workflow-history.js',
			})
			vm.runInNewContext(read('naturalclick-extension/background/search-workflow.js'), sandbox, {
				filename: 'naturalclick-extension/background/search-workflow.js',
			})
		vm.runInNewContext(read('naturalclick-extension/background/workflows.js'), sandbox, {
			filename: 'naturalclick-extension/background/workflows.js',
		})
	}
	if (relPath === 'naturalclick-extension/background/search-workflow.js') {
		if (!sandbox.NC_CONTROL_SEMANTICS) {
			vm.runInNewContext(read('naturalclick-extension/shared/control-semantics.js'), sandbox, {
				filename: 'naturalclick-extension/shared/control-semantics.js',
			})
		}
		if (!sandbox.NC_BG_SEARCH_WORKFLOW_STATE) {
			vm.runInNewContext(read('naturalclick-extension/background/search-workflow-state.js'), sandbox, {
				filename: 'naturalclick-extension/background/search-workflow-state.js',
			})
		}
		if (!sandbox.NC_BG_SEARCH_WORKFLOW_HISTORY) {
			vm.runInNewContext(read('naturalclick-extension/background/search-workflow-history.js'), sandbox, {
				filename: 'naturalclick-extension/background/search-workflow-history.js',
			})
		}
	}
	vm.runInNewContext(read(relPath), sandbox, { filename: relPath })
	return sandbox
}

function repeatedHistory(action, input, nextGoal, count, success = true) {
	return Array.from({ length: count }, (_, index) => ({
		stepIndex: index + 1,
		action,
		input,
		nextGoal,
		success,
		output: success ? 'ok' : 'failed',
	}))
}

function assertAction(decision, expectedName) {
	if (decision?.action?.name !== expectedName) {
		throw new Error(`expected ${expectedName}, got ${decision?.action?.name || '(none)'}`)
	}
}

function readNumberConstant(source, name) {
	const match = source.match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`))
	if (!match) throw new Error(`missing numeric constant: ${name}`)
	return Number(match[1])
}

function assertRepeatableActionsAreExempted() {
	const loopGuard = read('naturalclick-extension/background/loop-guard.js')
	for (const action of repeatableActions) {
		if (!loopGuard.includes(`'${action}'`)) {
			throw new Error(`repeatable action is not exempted from loop guard: ${action}`)
		}
	}
	if (!/NATURALLY_REPEATABLE_ACTIONS\.has\(actionName\)/.test(loopGuard)) {
		throw new Error('loop guard does not consult NATURALLY_REPEATABLE_ACTIONS')
	}
	if (!/MOVEMENT_ACTIONS\.has\(actionName\)/.test(loopGuard)) {
		throw new Error('loop guard does not treat scroll as progress-sensitive movement')
	}
	if (!/TRANSIENT_ACTIONS\.has\(actionName\)/.test(loopGuard)) {
		throw new Error('loop guard does not treat hover as transient progress-sensitive action')
	}
	if (!loopGuard.includes('hasDropdownSelectionText') || !loopGuard.includes('stableActionInputSignatureForAction') || !loopGuard.includes('choose_dropdown_option') || !loopGuard.includes('open_dropdown')) {
		throw new Error('loop guard should canonicalize legacy dropdown actions to explicit open/select action names')
	}
}

function assertSharedActionContractLoadedEverywhere() {
	const background = read('naturalclick-extension/background.js')
	const manifest = JSON.parse(read('naturalclick-extension/manifest.json'))
	const contentBridge = read('naturalclick-extension/content.js')
	const scripts = manifest.content_scripts?.[0]?.js || []
	for (const file of ['shared/action-contract.js', 'shared/control-semantics.js', 'content/semantics.js', 'content/action-state.js', 'content/action-input.js', 'content/action-scroll.js', 'content/action-options.js', 'content/action-cascader.js', 'content/action-select.js']) {
		if (!scripts.includes(file)) {
			throw new Error(`manifest content script order is missing ${file}`)
		}
		if (!background.includes(file)) {
			throw new Error(`background injection list is missing ${file}`)
		}
	}
	if (scripts.indexOf('content/action-state.js') > scripts.indexOf('content/actions.js')) {
		throw new Error('manifest should load action-state before actions')
	}
	if (background.indexOf('content/action-state.js') > background.indexOf('content/actions.js')) {
		throw new Error('background injection should load action-state before actions')
	}
	if (scripts.indexOf('content/action-options.js') > scripts.indexOf('content/action-select.js')) {
		throw new Error('manifest should load action-options before action-select')
	}
	if (background.indexOf('content/action-options.js') > background.indexOf('content/action-select.js')) {
		throw new Error('background injection should load action-options before action-select')
	}
	if (scripts.indexOf('content/action-options.js') > scripts.indexOf('content/action-cascader.js')) {
		throw new Error('manifest should load action-options before action-cascader')
	}
	if (background.indexOf('content/action-options.js') > background.indexOf('content/action-cascader.js')) {
		throw new Error('background injection should load action-options before action-cascader')
	}
	if (scripts.indexOf('content/action-cascader.js') > scripts.indexOf('content/action-select.js')) {
		throw new Error('manifest should load action-cascader before action-select')
	}
	if (background.indexOf('content/action-cascader.js') > background.indexOf('content/action-select.js')) {
		throw new Error('background injection should load action-cascader before action-select')
	}
	if (scripts.indexOf('content/action-select.js') > scripts.indexOf('content/actions.js')) {
		throw new Error('manifest should load action-select before actions')
	}
	if (background.indexOf('content/action-select.js') > background.indexOf('content/actions.js')) {
		throw new Error('background injection should load action-select before actions')
	}
	if (scripts.indexOf('shared/control-semantics.js') > scripts.indexOf('content/semantics.js')) {
		throw new Error('manifest should load shared control semantics before content semantics')
	}
	if (background.indexOf('shared/control-semantics.js') > background.indexOf('content/semantics.js')) {
		throw new Error('background injection should load shared control semantics before content semantics')
	}
	if (background.indexOf('shared/control-semantics.js') > background.indexOf('background/planner-validation.js')) {
		throw new Error('planner validation should load after shared control semantics')
	}
	if (!background.includes('background/loop-guard.js')) {
		throw new Error('background importScripts should load loop guard before session engine')
	}
	if (background.indexOf('background/loop-guard.js') > background.indexOf('background/session-engine.js')) {
		throw new Error('loop guard must be loaded before session engine')
	}
	if (!background.includes('background/session-records.js')) {
		throw new Error('background importScripts should load session records before session engine')
	}
	if (background.indexOf('background/session-records.js') > background.indexOf('background/session-engine.js')) {
		throw new Error('session records must be loaded before session engine')
	}
	if (!background.includes('background/session-recovery.js')) {
		throw new Error('background importScripts should load session recovery before session engine')
	}
	if (background.indexOf('background/session-recovery.js') < background.indexOf('background/session-records.js')) {
		throw new Error('session recovery must be loaded after session records')
	}
	if (background.indexOf('background/session-recovery.js') > background.indexOf('background/session-engine.js')) {
		throw new Error('session recovery must be loaded before session engine')
	}
	if (!background.includes('background/session-timing.js')) {
		throw new Error('background importScripts should load session timing before session engine')
	}
	if (background.indexOf('background/session-timing.js') < background.indexOf('background/session-recovery.js')) {
		throw new Error('session timing must be loaded after session recovery')
	}
	if (background.indexOf('background/session-timing.js') > background.indexOf('background/session-engine.js')) {
		throw new Error('session timing must be loaded before session engine')
	}
	if (!background.includes('background/session-lifecycle.js')) {
		throw new Error('background importScripts should load session lifecycle before session engine')
	}
	if (background.indexOf('background/session-lifecycle.js') < background.indexOf('background/session-timing.js')) {
		throw new Error('session lifecycle must be loaded after session timing')
	}
	if (background.indexOf('background/session-lifecycle.js') > background.indexOf('background/session-engine.js')) {
		throw new Error('session lifecycle must be loaded before session engine')
	}
	if (!background.includes('background/planner-context.js')) {
		throw new Error('background importScripts should load planner context before planner')
	}
	if (background.indexOf('background/planner-context.js') > background.indexOf('background/planner.js')) {
		throw new Error('planner context must be loaded before planner')
	}
	if (!background.includes('background/planner-fastpath.js')) {
		throw new Error('background importScripts should load planner fast path before planner')
	}
	if (background.indexOf('background/planner-fastpath.js') > background.indexOf('background/planner.js')) {
		throw new Error('planner fast path must be loaded before planner')
	}
	if (!background.includes('background/planner-validation.js')) {
		throw new Error('background importScripts should load planner validation before planner')
	}
	if (background.indexOf('background/planner-validation.js') > background.indexOf('background/planner.js')) {
		throw new Error('planner validation must be loaded before planner')
	}
	if (!background.includes('background/planner-model-client.js')) {
		throw new Error('background importScripts should load planner model client before planner')
	}
	if (background.indexOf('background/planner-model-client.js') > background.indexOf('background/planner.js')) {
		throw new Error('planner model client must be loaded before planner')
	}
	if (!background.includes('background/planner-decision.js')) {
		throw new Error('background importScripts should load planner decision normalizer before planner')
	}
	if (background.indexOf('background/planner-decision.js') > background.indexOf('background/planner.js')) {
		throw new Error('planner decision normalizer must be loaded before planner')
	}
	if (!background.includes('background/planner-prompt.js')) {
		throw new Error('background importScripts should load planner prompt builder before planner')
	}
	if (background.indexOf('background/planner-prompt.js') > background.indexOf('background/planner.js')) {
		throw new Error('planner prompt builder must be loaded before planner')
	}
	if (!background.includes('background/login-workflow.js')) {
		throw new Error('background importScripts should load login workflow before planner workflow registry')
	}
	if (background.indexOf('background/login-workflow.js') > background.indexOf('background/workflows.js')) {
		throw new Error('login workflow must be loaded before planner workflow registry')
	}
	if (!background.includes('background/search-workflow.js')) {
		throw new Error('background importScripts should load search workflow before planner')
	}
	if (background.indexOf('background/search-workflow.js') > background.indexOf('background/planner.js')) {
		throw new Error('search workflow must be loaded before planner')
	}
	if (!background.includes('background/workflows.js')) {
		throw new Error('background importScripts should load planner workflow registry before planner')
	}
	if (background.indexOf('background/workflows.js') < background.indexOf('background/search-workflow.js')) {
		throw new Error('planner workflow registry must be loaded after concrete workflow modules')
	}
	if (background.indexOf('background/workflows.js') > background.indexOf('background/planner.js')) {
		throw new Error('planner workflow registry must be loaded before planner')
	}
	if (!/ready:\s*status\.contract\s*&&\s*status\.controlSemantics\s*&&\s*status\.semantics\s*&&\s*status\.actionState/.test(contentBridge) || !contentBridge.includes('actionOptions') || !contentBridge.includes('actionCascader') || !contentBridge.includes('actionSelect')) {
		throw new Error('content bridge should require contract, control-semantics, semantics, action-state, action-options, action-cascader, and action-select modules before booting')
	}
}

function assertSharedControlSemanticsLoadedEverywhere() {
	const validation = read('naturalclick-extension/background/planner-validation.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	const shared = read('naturalclick-extension/shared/control-semantics.js')
	if (!shared.includes('function describeObservedControl') || !shared.includes('DROPDOWN_FIELD_TYPES')) {
		throw new Error('shared control semantics should expose observed-control classification')
	}
	if (!shared.includes('function scoreObservedOptionAssociation') || !shared.includes('observedOptionMatchesControlledPopup')) {
		throw new Error('shared control semantics should expose observed option-field association')
	}
	if (!shared.includes("'date'") || !shared.includes("'platform'")) {
		throw new Error('shared control semantics should classify common picker/select field types')
	}
	if (!validation.includes('NC_CONTROL_SEMANTICS') || !validation.includes('isObservedPlainEditableText')) {
		throw new Error('planner validation should use shared observed-control semantics')
	}
	if (!plannerContext.includes('scoreObservedOptionAssociation') || plannerContext.includes('function fallbackScoreOptionTargetAssociation')) {
		throw new Error('planner context should reuse shared observed option association instead of duplicating geometry heuristics')
	}
}

function assertSharedControlSemanticsBehavior() {
	const sandbox = {}
	sandbox.globalThis = sandbox
	vm.runInNewContext(read('naturalclick-extension/shared/control-semantics.js'), sandbox, {
		filename: 'naturalclick-extension/shared/control-semantics.js',
	})
	const semantics = sandbox.NC_CONTROL_SEMANTICS
	if (!semantics?.isObservedSelectionLike || !semantics?.isObservedPlainEditableText) {
		throw new Error('shared control semantics did not initialize')
	}
	const platform = { fieldType: 'platform', role: 'textbox', editable: false }
	if (!semantics.isObservedSelectionLike(platform, 'forms')) {
		throw new Error('platform-like noneditable fields should be selection controls')
	}
	const editablePlatform = { fieldType: 'platform', role: 'textbox', editable: true }
	if (!semantics.isObservedSelectionLike(editablePlatform, 'forms')) {
		throw new Error('business categorical fields like platform should remain selection controls even when DOM reports editable textbox')
	}
	const editableDate = { fieldType: 'date', role: 'textbox', editable: true }
	if (!semantics.isObservedPlainEditableText(editableDate, 'forms')) {
		throw new Error('editable date textboxes should remain text-editable')
	}
	const pickerDate = { fieldType: 'date', role: 'textbox', editable: false }
	if (!semantics.isObservedSelectionLike(pickerDate, 'forms')) {
		throw new Error('readonly/observed-noneditable date fields should be selection controls')
	}
	const visibleOption = { role: 'option', label: '企业端' }
	if (!semantics.isObservedSelectionLike(visibleOption, 'options')) {
		throw new Error('visible option rows should be classified as selection controls')
	}
	const nearbyScore = semantics.scoreOptionTargetGeometry(
		{ left: 20, top: 122, width: 180, height: 34 },
		{ left: 20, top: 80, width: 180, height: 36 }
	)
	const farScore = semantics.scoreOptionTargetGeometry(
		{ left: 760, top: 122, width: 180, height: 34 },
		{ left: 20, top: 80, width: 180, height: 36 }
	)
	if (!Number.isFinite(nearbyScore) || Number.isFinite(farScore)) {
		throw new Error('shared control semantics should provide deterministic option-field geometry scoring')
	}
	const controlledScore = semantics.scoreObservedOptionAssociation(
		{ label: '企业端', popupHints: 'popupId=user-platform-list' },
		{ label: '用户平台', relationHints: 'aria-controls=user-platform-list' }
	)
	const wrongControlledScore = semantics.scoreObservedOptionAssociation(
		{ label: '企业端', popupHints: 'popupId=other-list' },
		{ label: '用户平台', relationHints: 'aria-controls=user-platform-list' }
	)
	if (controlledScore !== 0 || Number.isFinite(wrongControlledScore)) {
		throw new Error('observed option association should treat explicit controlled popup ownership as authoritative')
	}
	const labelledScore = semantics.scoreObservedOptionAssociation(
		{ label: '企业端', popupHints: 'popupLabelledBy=user-platform-label' },
		{ label: '用户平台', relationHints: 'aria-labelledby=user-platform-label' }
	)
	if (labelledScore !== 100) {
		throw new Error('observed option association should support popup aria-labelledby ownership')
	}
	const unknownScore = semantics.scoreObservedOptionAssociation(
		{ label: '企业端' },
		{ label: '用户平台' },
		{ unknownScore: Number.MAX_SAFE_INTEGER }
	)
	if (unknownScore !== Number.MAX_SAFE_INTEGER) {
		throw new Error('observed option association should preserve caller-selected unknown score')
	}
}

function assertLoopGuardExtractedFromSessionEngine() {
	const sessionEngine = read('naturalclick-extension/background/session-engine.js')
	const loopGuard = read('naturalclick-extension/background/loop-guard.js')
	if (!sessionEngine.includes('NC_BG_LOOP_GUARD')) {
		throw new Error('session engine should consume the loop guard module')
	}
	for (const fn of ['detectActionLoop', 'detectRedundantInputRewrite', 'getUnsafeDoneSuccessReason']) {
		if (!loopGuard.includes(`function ${fn}`)) {
			throw new Error(`loop guard module is missing ${fn}`)
		}
		const engineFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (engineFnDefinition.test(sessionEngine)) {
			throw new Error(`session engine should not define ${fn}; keep loop policy in background/loop-guard.js`)
		}
	}
}

function assertSessionRecordsExtractedFromSessionEngine() {
	const sessionEngine = read('naturalclick-extension/background/session-engine.js')
	const sessionRecords = read('naturalclick-extension/background/session-records.js')
	if (!sessionRecords.includes('NC_BG_SESSION_RECORDS')) {
		throw new Error('session-records module should expose NC_BG_SESSION_RECORDS')
	}
	if (!sessionEngine.includes('NC_BG_SESSION_RECORDS')) {
		throw new Error('session engine should consume the session records module')
	}
	for (const fn of [
		'buildReflection',
		'appendExecutionOutcomeSummary',
		'appendVerificationFailureOutcome',
		'getExecutionOutcome',
		'derivePlanItems',
		'summarizeFailureReason',
	]) {
		if (!sessionRecords.includes(`function ${fn}`)) {
			throw new Error(`session-records module is missing ${fn}`)
		}
		const engineFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (engineFnDefinition.test(sessionEngine)) {
			throw new Error(`session engine should not define ${fn}; keep record formatting in background/session-records.js`)
		}
	}
}

function assertSessionRecoveryExtractedFromSessionEngine() {
	const sessionEngine = read('naturalclick-extension/background/session-engine.js')
	const sessionRecovery = read('naturalclick-extension/background/session-recovery.js')
	if (!sessionRecovery.includes('NC_BG_SESSION_RECOVERY')) {
		throw new Error('session-recovery module should expose NC_BG_SESSION_RECOVERY')
	}
	if (!sessionEngine.includes('NC_BG_SESSION_RECOVERY')) {
		throw new Error('session engine should consume the session recovery module')
	}
	for (const fn of [
		'shouldAttemptExecutionVisionFallback',
		'attemptExecutionVisionFallback',
		'attemptVerificationRecovery',
		'shouldAttemptVisionFallbackForFailure',
		'isSemanticActionFailure',
	]) {
		if (!sessionRecovery.includes(`function ${fn}`)) {
			throw new Error(`session-recovery module is missing ${fn}`)
		}
		const engineFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (engineFnDefinition.test(sessionEngine)) {
			throw new Error(`session engine should not define ${fn}; keep recovery policy in background/session-recovery.js`)
		}
	}
}

function assertSessionTimingExtractedFromSessionEngine() {
	const sessionEngine = read('naturalclick-extension/background/session-engine.js')
	const sessionTiming = read('naturalclick-extension/background/session-timing.js')
	if (!sessionTiming.includes('NC_BG_SESSION_TIMING')) {
		throw new Error('session-timing module should expose NC_BG_SESSION_TIMING')
	}
	if (!sessionEngine.includes('NC_BG_SESSION_TIMING')) {
		throw new Error('session engine should consume the session timing module')
	}
	for (const fn of ['getPlanningTimeoutMs', 'withTimeout', 'settleAfterAction', 'sleep']) {
		if (!sessionTiming.includes(`function ${fn}`)) {
			throw new Error(`session-timing module is missing ${fn}`)
		}
		const engineFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (engineFnDefinition.test(sessionEngine)) {
			throw new Error(`session engine should not define ${fn}; keep timing policy in background/session-timing.js`)
		}
	}
	if (!sessionTiming.includes("workflowStep === 'submit_login'") || !sessionTiming.includes("workflowStep === 'navigate_to_task_target'")) {
		throw new Error('session timing should give login submit and task navigation actions a longer generic settle window')
	}
}

function assertSessionLifecycleExtractedFromSessionEngine() {
	const sessionEngine = read('naturalclick-extension/background/session-engine.js')
	const sessionLifecycle = read('naturalclick-extension/background/session-lifecycle.js')
	if (!sessionLifecycle.includes('NC_BG_SESSION_LIFECYCLE')) {
		throw new Error('session-lifecycle module should expose NC_BG_SESSION_LIFECYCLE')
	}
	if (!sessionEngine.includes('NC_BG_SESSION_LIFECYCLE')) {
		throw new Error('session engine should consume the session lifecycle module')
	}
	for (const fn of [
		'publishSession',
		'publishPlanningProgress',
		'appendPlanningProgressTrace',
		'appendTrace',
		'failSession',
		'finalizeIfAborted',
		'finalizeStoppedSession',
	]) {
		if (!sessionLifecycle.includes(`function ${fn}`)) {
			throw new Error(`session-lifecycle module is missing ${fn}`)
		}
		const engineFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (engineFnDefinition.test(sessionEngine)) {
			throw new Error(`session engine should not define ${fn}; keep lifecycle policy in background/session-lifecycle.js`)
		}
	}
	if (!sessionLifecycle.includes('TRACEABLE_PLANNING_STAGES') || !sessionLifecycle.includes('lastPlanningProgressTraceKey')) {
		throw new Error('session lifecycle should persist important planning progress in traceItems with dedupe')
	}
	if (!sessionLifecycle.includes('timeout_no_recovery') || !sessionLifecycle.includes('planning_context')) {
		throw new Error('planning progress trace should include timeout and ReAct context-request stages')
	}
}

function assertPlannerContextExtractedFromPlanner() {
	const planner = read('naturalclick-extension/background/planner.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	if (!planner.includes('NC_BG_PLANNER_CONTEXT')) {
		throw new Error('planner should consume the planner context module')
	}
	for (const fn of ['buildObservationText', 'resolvePlanningContextRequest', 'findObservedIndexMatches']) {
		if (!plannerContext.includes(`function ${fn}`)) {
			throw new Error(`planner context module is missing ${fn}`)
		}
		const plannerFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (plannerFnDefinition.test(planner)) {
			throw new Error(`planner should not define ${fn}; keep observation rendering in background/planner-context.js`)
		}
	}
	if (!plannerContext.includes('scoreObservedOptionAssociation')) {
		throw new Error('planner context should use shared popup ownership and option association semantics')
	}
	if (!plannerContext.includes('NC_CONTROL_SEMANTICS')) {
		throw new Error('planner context should use shared option-field geometry scoring')
	}
}

function assertPlannerFastPathExtractedFromPlanner() {
	const planner = read('naturalclick-extension/background/planner.js')
	const fastPath = read('naturalclick-extension/background/planner-fastpath.js')
	if (!planner.includes('NC_BG_PLANNER_FASTPATH')) {
		throw new Error('planner should consume the planner fast path module')
	}
	for (const fn of ['deriveFastPathDecision']) {
		if (!fastPath.includes(`function ${fn}`)) {
			throw new Error(`planner fast path module is missing ${fn}`)
		}
		const plannerFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (plannerFnDefinition.test(planner)) {
			throw new Error(`planner should not define ${fn}; keep navigation fallback policy in background/planner-fastpath.js`)
		}
	}
	if (fastPath.includes('findTaskNavigationCandidate') || planner.includes('findTaskNavigationCandidate')) {
		throw new Error('planner fast path should not include task-navigation page-click candidate generation')
	}
	if (fastPath.includes('deriveModelTimeoutRecoveryDecision') || planner.includes('deriveModelTimeoutRecoveryDecision')) {
		throw new Error('model timeout recovery should be routed through workflow registry, not the old fast-path helper')
	}
}

function assertPlannerValidationExtractedFromPlanner() {
	const planner = read('naturalclick-extension/background/planner.js')
	const validation = read('naturalclick-extension/background/planner-validation.js')
	if (!planner.includes('NC_BG_PLANNER_VALIDATION')) {
		throw new Error('planner should consume the planner validation module')
	}
	for (const fn of ['validateExecutableAction', 'validateActionAgainstHistory', 'validateObservedIndex']) {
		if (!validation.includes(`function ${fn}`)) {
			throw new Error(`planner validation module is missing ${fn}`)
		}
		const plannerFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (plannerFnDefinition.test(planner)) {
			throw new Error(`planner should not define ${fn}; keep executable action validation in background/planner-validation.js`)
		}
	}
}

function assertPlannerModelClientExtractedFromPlanner() {
	const planner = read('naturalclick-extension/background/planner.js')
	const modelClient = read('naturalclick-extension/background/planner-model-client.js')
	if (!planner.includes('NC_BG_PLANNER_MODEL_CLIENT')) {
		throw new Error('planner should consume the planner model client module')
	}
	for (const fn of ['callOpenAI', 'isModelTimeoutError', 'sanitizeMessages']) {
		if (!modelClient.includes(`function ${fn}`)) {
			throw new Error(`planner model client module is missing ${fn}`)
		}
		const plannerFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (plannerFnDefinition.test(planner)) {
			throw new Error(`planner should not define ${fn}; keep model I/O in background/planner-model-client.js`)
		}
	}
}

function assertPlannerDecisionExtractedFromPlanner() {
	const planner = read('naturalclick-extension/background/planner.js')
	const decision = read('naturalclick-extension/background/planner-decision.js')
	if (!planner.includes('NC_BG_PLANNER_DECISION')) {
		throw new Error('planner should consume the planner decision module')
	}
	for (const fn of ['normalizeDecision', 'normalizeAction', 'resolveActionCandidate']) {
		if (!decision.includes(`function ${fn}`)) {
			throw new Error(`planner decision module is missing ${fn}`)
		}
		const plannerFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (plannerFnDefinition.test(planner)) {
			throw new Error(`planner should not define ${fn}; keep model decision normalization in background/planner-decision.js`)
		}
	}
}

function assertPlannerPromptExtractedFromPlanner() {
	const planner = read('naturalclick-extension/background/planner.js')
	const prompt = read('naturalclick-extension/background/planner-prompt.js')
	if (!planner.includes('NC_BG_PLANNER_PROMPT')) {
		throw new Error('planner should consume the planner prompt module')
	}
	for (const fn of ['buildPlannerSystemPrompt', 'buildPlannerUserMessage', 'buildHistoryLine']) {
		if (!prompt.includes(`function ${fn}`)) {
			throw new Error(`planner prompt module is missing ${fn}`)
		}
		const plannerFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (plannerFnDefinition.test(planner)) {
			throw new Error(`planner should not define ${fn}; keep prompt/message construction in background/planner-prompt.js`)
		}
	}
	if (!prompt.includes('workflowContextText') || !prompt.includes('<workflow_hints>')) {
		throw new Error('planner prompt should support lightweight workflow hints as model-visible context')
	}
	if (
		!prompt.includes('支持内部 ReAct 上下文请求') ||
		!prompt.includes('禁止重复 requested') ||
		!prompt.includes('open_dropdown') ||
		!prompt.includes('choose_dropdown_option')
	) {
		throw new Error('planner prompt module is missing ReAct or dropdown recovery guidance')
	}
	if (
		!prompt.includes('通用规划流程') ||
		!prompt.includes('真正的业务页面动作仍需要你结合当前页面元素和用户任务自行判断') ||
		!prompt.includes('request_context source=actions region=content query="新增"') ||
		!prompt.includes('创建/新增类任务应由你')
	) {
		throw new Error('planner prompt should keep business actions model-owned while guiding context requests for create tasks')
	}
}

function assertLoginWorkflowBehavior() {
	const planner = read('naturalclick-extension/background/planner.js')
	const registrySource = read('naturalclick-extension/background/workflows.js')
	const sandbox = loadBackgroundModule('naturalclick-extension/background/login-workflow.js', {})
	const workflow = sandbox.NC_BG_LOGIN_WORKFLOW_TESTS
	if (!workflow?.deriveLoginWorkflowDecision || !workflow?.extractLoginCredentials || !workflow?.recordLoginWorkflowOutcome) {
		throw new Error('login workflow test contract is not exported')
	}
	const credentials = workflow.extractLoginCredentials('打开页面 账号 admin 密码 123456 并完成后续任务')
	if (credentials.username !== 'admin' || credentials.password !== '123456') {
		throw new Error(`login workflow should parse task credentials, got ${JSON.stringify(credentials)}`)
	}
	if (!planner.includes('NC_BG_PLANNER_WORKFLOWS') || !registrySource.includes('deriveLoginWorkflowDecision')) {
		throw new Error('planner should consult login workflow through the workflow registry before model planning')
	}
	const createDialogDecision = workflow.deriveLoginWorkflowDecision(
		{ task: '打开系统 账号 admin 密码 123456 创建一个用户，用户名是 nanobot，密码是 123456', history: [] },
		{
			url: 'https://example.test/#/admin/users',
			title: '用户列表',
			forms: [
				{
					name: '弹层',
					fields: [
						{ index: 3, fieldType: 'username', label: '登录账号', valueState: 'empty' },
						{ index: 4, fieldType: 'password', label: '密码', valueState: 'empty' },
					],
				},
			],
			actions: [{ index: 13, intent: 'create', label: '保存' }],
		}
	)
	if (createDialogDecision !== null) {
		throw new Error(`login workflow should not consume create-dialog username/password fields: ${JSON.stringify(createDialogDecision)}`)
	}
	const usernameDecision = workflow.deriveLoginWorkflowDecision(
		{ task: '登录系统 账号 admin 密码 123456', history: [] },
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'empty' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'empty' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	if (usernameDecision?.action?.name !== 'input_text' || usernameDecision.action.input.index !== 1 || usernameDecision.action.input.text !== 'admin') {
		throw new Error(`login workflow should fill username first, got ${JSON.stringify(usernameDecision)}`)
	}
	if (usernameDecision.action.input.workflow_step !== 'fill_username') {
		throw new Error(`login workflow should tag username action with explicit state metadata, got ${JSON.stringify(usernameDecision)}`)
	}
	if (usernameDecision.action.input.workflow !== 'login') {
		throw new Error(`direct login workflow decisions should carry workflow ownership metadata, got ${JSON.stringify(usernameDecision)}`)
	}
	const stateSession = { task: '登录系统 账号 admin 密码 123456', history: [], workflowState: {} }
	const stateUsernameDecision = workflow.deriveLoginWorkflowDecision(
		stateSession,
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'empty' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'empty' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	workflow.recordLoginWorkflowOutcome(stateSession, stateUsernameDecision, {
		success: true,
		output: '已在索引 1 输入文本。 | 动作结果: value_changed',
	})
	const statePasswordDecision = workflow.deriveLoginWorkflowDecision(
		stateSession,
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'filled:admin' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'empty' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	if (statePasswordDecision?.action?.input?.workflow_step !== 'fill_password' || statePasswordDecision.action.input.index !== 2) {
		throw new Error(`login workflow should advance workflowState from username to password: ${JSON.stringify(statePasswordDecision)}`)
	}
	workflow.recordLoginWorkflowOutcome(stateSession, statePasswordDecision, {
		success: true,
		output: '已在索引 2 输入文本。 | 动作结果: value_changed',
	})
	const stateSubmitDecision = workflow.deriveLoginWorkflowDecision(
		stateSession,
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'filled:admin' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'filled:6' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	if (stateSubmitDecision?.action?.input?.workflow_step !== 'submit_login' || stateSubmitDecision.action.input.index !== 4) {
		throw new Error(`login workflow should advance workflowState from password to submit: ${JSON.stringify(stateSubmitDecision)}`)
	}
	workflow.recordLoginWorkflowOutcome(stateSession, stateSubmitDecision, {
		success: false,
		output: '动作校验失败: click_element_by_index 后页面无可见变化',
	})
	const stateFailedDecision = workflow.deriveLoginWorkflowDecision(
		stateSession,
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'filled:admin' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'filled:6' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	if (stateFailedDecision !== null) {
		throw new Error(`login workflow should stop after explicit workflowState records submit failure: ${JSON.stringify(stateFailedDecision)}`)
	}
	const outcomeFailureSession = { task: '登录系统 账号 admin 密码 123456', history: [], workflowState: {} }
	const outcomeFailureDecision = workflow.deriveLoginWorkflowDecision(
		outcomeFailureSession,
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'empty' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'empty' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	workflow.recordLoginWorkflowOutcome(outcomeFailureSession, outcomeFailureDecision, {
		success: false,
		output: '',
		outcome: { kind: 'no_effect', progress: false, reason: '账号没有写入目标输入框' },
	})
	if (outcomeFailureSession.workflowState.login?.phase !== 'failed' || outcomeFailureSession.workflowState.login?.failedReason !== '账号没有写入目标输入框') {
		throw new Error(`login workflow should record structured failure reasons without output text: ${JSON.stringify(outcomeFailureSession.workflowState.login)}`)
	}
	const passwordDecision = workflow.deriveLoginWorkflowDecision(
		{
			task: '登录系统 账号 admin 密码 123456',
			history: [{ action: 'input_text', input: { index: 1, text: 'admin' }, success: true }],
		},
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'filled:admin' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'empty' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	if (passwordDecision?.action?.name !== 'input_text' || passwordDecision.action.input.index !== 2 || passwordDecision.action.input.text !== '123456') {
		throw new Error(`login workflow should fill password after username, got ${JSON.stringify(passwordDecision)}`)
	}
	const failedUsernameDecision = workflow.deriveLoginWorkflowDecision(
		{
			task: '登录系统 账号 admin 密码 123456',
			history: [
				{ action: 'input_text', input: { index: 1, text: 'admin' }, success: true },
				{ action: 'input_text', input: { index: 1, text: 'admin' }, success: false, output: '动作校验失败: 输入值校验失败' },
			],
		},
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'filled:admin' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'empty' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	if (failedUsernameDecision !== null) {
		throw new Error(`login workflow should stop after username verification failure instead of filling password: ${JSON.stringify(failedUsernameDecision)}`)
	}
	const submitDecision = workflow.deriveLoginWorkflowDecision(
		{
			task: '登录系统 账号 admin 密码 123456',
			history: [
				{ action: 'input_text', input: { index: 1, text: 'admin' }, success: true },
				{ action: 'input_text', input: { index: 2, text: '123456' }, success: true },
			],
		},
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'filled:admin' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'filled:6' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	if (submitDecision?.action?.name !== 'click_element_by_index' || submitDecision.action.input.index !== 4) {
		throw new Error(`login workflow should submit after credentials, got ${JSON.stringify(submitDecision)}`)
	}
	const failedPasswordDecision = workflow.deriveLoginWorkflowDecision(
		{
			task: '登录系统 账号 admin 密码 123456',
			history: [
				{ action: 'input_text', input: { index: 1, text: 'admin' }, success: true },
				{ action: 'input_text', input: { index: 2, text: '123456' }, success: true },
				{ action: 'input_text', input: { index: 2, text: '123456' }, success: false, output: '动作校验失败: 输入值校验失败' },
			],
		},
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'filled:admin' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'filled:6' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	if (failedPasswordDecision !== null) {
		throw new Error(`login workflow should stop after password verification failure instead of submitting: ${JSON.stringify(failedPasswordDecision)}`)
	}
	const failedSubmitDecision = workflow.deriveLoginWorkflowDecision(
		{
			task: '登录系统 账号 admin 密码 123456',
			history: [
				{ action: 'input_text', input: { index: 1, text: 'admin' }, success: true },
				{ action: 'input_text', input: { index: 2, text: '123456' }, success: true },
				{ action: 'click_element_by_index', input: { index: 4, target_label: '登录' }, success: true },
				{ action: 'click_element_by_index', input: { index: 4, target_label: '登录' }, success: false, output: '动作校验失败: click_element_by_index 后页面无可见变化' },
			],
		},
		{
			forms: [
				{
					name: '登录表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'filled:admin' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'filled:6' },
					],
				},
			],
			actions: [{ index: 4, intent: 'login', label: '登录' }],
		}
	)
	if (failedSubmitDecision !== null) {
		throw new Error(`login workflow should stop after login submit verification failure: ${JSON.stringify(failedSubmitDecision)}`)
	}
}

function assertTaskNavigationWorkflowBehavior() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/planner.js', {
		NC_BG_UTILS: {
			safeJsonParse: (value) => {
				try {
					return JSON.parse(value)
				} catch (_) {
					return null
				}
			},
			generateId: () => 'test_id',
		},
		NC_BG_CONSTANTS: { MAX_TRACE_ITEMS: 80 },
		NC_BG_TOOLS: {
			listPlannerTools: () => [],
			getToolPromptLines: () => [],
		},
		chrome: { tabs: { query: async () => [] } },
		fetch: async () => fakeJsonResponse({ action: { name: 'done', input: { success: false } } }),
		AbortController,
	})
	const workflow = sandbox.NC_BG_PLANNER_WORKFLOWS_TESTS
	if (!workflow?.deriveTaskNavigationWorkflowDecision || !workflow?.findNavigationCandidateForKey) {
		throw new Error('task-navigation workflow test contract is not exported')
	}
	const extractedTargets = workflow.extractTaskNavigationTargetKeys({
		task: '打开这个页面 http://example.test/ 找到用户管理部分，测试搜索区域。',
		latestTask: '打开这个页面 http://example.test/ 找到用户管理部分，测试搜索区域。',
	})
	if (extractedTargets.includes('这个') || extractedTargets.includes('这个页面')) {
		throw new Error(`task-navigation should not treat generic page demonstratives as modules: ${JSON.stringify(extractedTargets)}`)
	}
	if (!extractedTargets.includes('用户管理')) {
		throw new Error(`task-navigation should still extract real named modules after filtering generic page phrases: ${JSON.stringify(extractedTargets)}`)
	}
	const createUserTargets = workflow.extractTaskNavigationTargetKeys({
		task: '打开这个页面 http://example.test/ 账号 admin 密码 123456 找到用户管理部分，创建一个用户，用户名是 nanobot，密码是 123456，性别男，江苏南京江宁人，角色为管理员。',
		latestTask: '打开这个页面 http://example.test/ 账号 admin 密码 123456 找到用户管理部分，创建一个用户，用户名是 nanobot，密码是 123456，性别男，江苏南京江宁人，角色为管理员。',
	})
	if (!createUserTargets.includes('用户管理') || createUserTargets.includes('角色为管理')) {
		throw new Error(`task-navigation should ignore field assignment phrases such as role=admin while keeping real modules: ${JSON.stringify(createUserTargets)}`)
	}
	const task = '打开 http://example.test/ 进入订单中心，并测试搜索区域每一个搜索项'
	const observation = {
		url: 'http://example.test/#/wel/index',
		title: '首页',
		forms: [],
		actions: [
			{ index: 8, region: 'header', role: 'tab', label: '订单中心', rect: { left: 200, top: 10, width: 90, height: 32 } },
			{ index: 9, region: 'content', role: 'button', label: '搜索', rect: { left: 20, top: 120, width: 72, height: 32 } },
		],
		elements: [],
	}
	const session = { task, latestTask: task, history: [], workflowState: {} }
	const decision = workflow.derivePreModelWorkflowDecision(session, observation, {
		tabsSummary: [{ id: 1, url: observation.url, current: true }],
	})
	assertAction(decision, 'click_element_by_index')
	if (
		decision.action.input.index !== 8 ||
		decision.action.input.workflow !== 'task-navigation' ||
		decision.action.input.workflow_step !== 'navigate_to_task_target' ||
		decision.action.input.workflow_nav_key !== '订单中心'
	) {
		throw new Error(`task-navigation workflow should click the exact nav item once with workflow metadata: ${JSON.stringify(decision)}`)
	}
	workflow.recordWorkflowOutcome(session, decision, {
		success: false,
		output: '动作校验失败: click_element_by_index 后页面无可见变化',
		outcome: { kind: 'no_effect', progress: false, reason: '没有进入目标模块' },
	})
	const repeated = workflow.derivePreModelWorkflowDecision(session, observation, {
		tabsSummary: [{ id: 1, url: observation.url, current: true }],
	})
	if (repeated !== null) {
		throw new Error(`task-navigation workflow should not repeat an already attempted target: ${JSON.stringify(repeated)}`)
	}
	const reached = workflow.derivePreModelWorkflowDecision(
		{ task, latestTask: task, history: [], workflowState: {} },
		{ ...observation, title: '订单中心-首页' },
		{ tabsSummary: [{ id: 1, url: observation.url, current: true }] }
	)
	if (reached !== null) {
		throw new Error(`task-navigation workflow should not click when target is already reached: ${JSON.stringify(reached)}`)
	}
	const contentButtonOnly = workflow.derivePreModelWorkflowDecision(
		{ task, latestTask: task, history: [], workflowState: {} },
		{
			...observation,
			actions: [
				{ index: 10, region: 'content', role: 'button', label: '订单中心', rect: { left: 20, top: 100, width: 140, height: 40 } },
			],
		},
		{ tabsSummary: [{ id: 1, url: observation.url, current: true }] }
	)
	if (contentButtonOnly !== null) {
		throw new Error(`task-navigation workflow should not click arbitrary content buttons as navigation: ${JSON.stringify(contentButtonOnly)}`)
	}
	const simplifiedTarget = workflow.derivePreModelWorkflowDecision(
		{
			task: '打开 http://example.test/ 找到用户管理部分。',
			latestTask: '打开 http://example.test/ 找到用户管理部分。',
			history: [],
			workflowState: {},
		},
		{
			url: 'http://example.test/#/wel/index',
			title: '首页',
			forms: [],
			actions: [],
			popups: [],
			elements: [],
			simplifiedDom: [
				'<menuitem index="42" role="menuitem" region="sidebar" kind="noneditable" target="/system/user">用户管理</menuitem>',
			],
		},
		{ tabsSummary: [{ id: 1, url: observation.url, current: true }] }
	)
	assertAction(simplifiedTarget, 'click_element_by_index')
	if (simplifiedTarget.action.input.index !== 42 || simplifiedTarget.action.input.workflow_nav_key !== '用户管理') {
		throw new Error(`task-navigation should resolve exact targets from simplified_dom rows: ${JSON.stringify(simplifiedTarget)}`)
	}
	const customerCreateTask = '打开 http://example.test/ 找到客户管理。新建一条客户数据，客户名称是张三。'
	const customerChildDecision = workflow.derivePreModelWorkflowDecision(
		{ task: customerCreateTask, latestTask: customerCreateTask, history: [], workflowState: {} },
		{
			url: 'http://example.test/#/wel/index',
			title: '首页',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '客户管理 线索 客户 商机 公海 合同 销售订单 物料申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded', rect: { left: 0, top: 120, width: 180, height: 44 } },
				{ index: 7, region: 'sidebar', role: 'menuitem', label: '客户', rect: { left: 0, top: 210, width: 180, height: 44 } },
				{ index: 8, region: 'sidebar', role: 'menuitem', label: '商机', rect: { left: 0, top: 250, width: 180, height: 44 } },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/wel/index', current: true }] }
	)
	assertAction(customerChildDecision, 'click_element_by_index')
	if (
		customerChildDecision.action.input.index !== 7 ||
		customerChildDecision.action.input.workflow_nav_key !== '客户管理'
	) {
		throw new Error(`task-navigation should treat the customer submenu as the concrete target for 客户管理 create tasks: ${JSON.stringify(customerChildDecision)}`)
	}
	const attemptedCustomerParentSession = {
		task: customerCreateTask,
		latestTask: customerCreateTask,
		history: [
			{
				action: 'click_element_by_index',
				input: {
					index: 5,
					target_label: '客户管理',
					workflow_step: 'navigate_to_task_target',
					workflow_nav_key: '客户管理',
				},
				success: true,
				output: '已展开客户管理。',
			},
		],
		workflowState: {},
	}
	const attemptedCustomerChildDecision = workflow.derivePreModelWorkflowDecision(
		attemptedCustomerParentSession,
		{
			url: 'http://example.test/#/crm/business',
			title: '商机-CRM',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '客户管理 线索 客户 商机 公海 合同 销售订单 物料申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded', rect: { left: 0, top: 120, width: 180, height: 44 } },
				{ index: 7, region: 'sidebar', role: 'menuitem', label: '客户', rect: { left: 0, top: 210, width: 180, height: 44 } },
				{ index: 8, region: 'sidebar', role: 'menuitem', label: '商机', stateHints: 'classState=is-active', rect: { left: 0, top: 250, width: 180, height: 44 } },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/crm/business', current: true }] }
	)
	assertAction(attemptedCustomerChildDecision, 'click_element_by_index')
	if (attemptedCustomerChildDecision.action.input.index !== 7) {
		throw new Error(`task-navigation should still click the concrete customer submenu after the parent group was attempted: ${JSON.stringify(attemptedCustomerChildDecision)}`)
	}
	const compositeOnlyCustomerDecision = workflow.derivePreModelWorkflowDecision(
		{
			task: customerCreateTask,
			latestTask: customerCreateTask,
			history: attemptedCustomerParentSession.history,
			workflowState: {},
		},
		{
			url: 'http://example.test/#/crm/business',
			title: '商机-CRM',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '客户管理 线索 客户 商机 公海 合同 销售订单 物料申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded', rect: { left: 0, top: 120, width: 180, height: 300 } },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/crm/business', current: true }] }
	)
	assertAction(compositeOnlyCustomerDecision, 'locate_by_vision')
	if (
		compositeOnlyCustomerDecision.action.input.workflow_nav_key !== '客户管理' ||
		compositeOnlyCustomerDecision.action.input.workflow_nav_alias !== '客户' ||
		!String(compositeOnlyCustomerDecision.action.input.target_description || '').includes('客户')
	) {
		throw new Error(`task-navigation should use vision to click a concrete submenu when observation only exposes a merged menu group: ${JSON.stringify(compositeOnlyCustomerDecision)}`)
	}
	const customerReachedHint = workflow.buildWorkflowContextText(
		{ task: customerCreateTask, latestTask: customerCreateTask, history: [], workflowState: {} },
		{
			url: 'http://example.test/#/crm/customer',
			title: '客户-CRM',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '客户管理 线索 客户 商机 公海 合同 销售订单 物料申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded' },
				{ index: 7, region: 'sidebar', role: 'menuitem', label: '客户', valueState: 'selected' },
			],
			popups: [],
			elements: [],
		}
	)
	if (!customerReachedHint.includes('key="客户管理" status="reached"') || customerReachedHint.includes('named task target is unresolved')) {
		throw new Error(`task-navigation should mark 客户管理 reached on the concrete 客户 page, got ${customerReachedHint}`)
	}
	const systemToolHint = workflow.buildWorkflowContextText(
		{ task: '打开 http://example.test/ 找到系统管理部分。', latestTask: '打开 http://example.test/ 找到系统管理部分。', history: [], workflowState: {} },
		{
			url: 'http://example.test/#/system/tool',
			title: '系统工具-CRM',
			forms: [],
			actions: [],
			popups: [],
			elements: [],
		}
	)
	if (!systemToolHint.includes('key="系统管理" status="unresolved"')) {
		throw new Error(`task-navigation aliases should not treat 系统工具 as reaching 系统管理, got ${systemToolHint}`)
	}
	const collapsedNavSession = {
		task: '打开 http://example.test/ 找到用户管理部分。',
		latestTask: '打开 http://example.test/ 找到用户管理部分。',
		history: [],
		workflowState: {},
	}
	const collapsedNavObservation = {
		url: 'http://example.test/#/wel/index',
		title: '首页',
		forms: [],
		actions: [
			{ index: 31, region: 'sidebar', role: 'menuitem', label: '系统管理', expandedState: 'collapsed', rect: { left: 0, top: 180, width: 180, height: 44 } },
		],
		popups: [],
		elements: [],
	}
	const collapsedNavDecision = workflow.derivePreModelWorkflowDecision(collapsedNavSession, collapsedNavObservation, {
		tabsSummary: [{ id: 1, url: observation.url, current: true }],
	})
	assertAction(collapsedNavDecision, 'click_element_by_index')
	if (
		collapsedNavDecision.action.input.index !== 31 ||
		collapsedNavDecision.action.input.workflow !== 'task-navigation' ||
		collapsedNavDecision.action.input.workflow_step !== 'reveal_navigation_options'
	) {
		throw new Error(`task-navigation should reveal collapsed nav containers before calling the model: ${JSON.stringify(collapsedNavDecision)}`)
	}
	workflow.recordWorkflowOutcome(collapsedNavSession, collapsedNavDecision, {
		success: true,
		output: '已展开系统管理。',
		outcome: { kind: 'opened', progress: true },
	})
	const repeatedCollapsedNav = workflow.derivePreModelWorkflowDecision(collapsedNavSession, collapsedNavObservation, {
		tabsSummary: [{ id: 1, url: observation.url, current: true }],
	})
	if (repeatedCollapsedNav !== null) {
		throw new Error(`task-navigation should not repeat the same collapsed nav reveal: ${JSON.stringify(repeatedCollapsedNav)}`)
	}
	const reachedCreateObservation = {
		url: 'http://example.test/#/system/user',
		title: '用户管理-CRM',
		forms: [],
		actions: [
			{ index: 16, region: 'sidebar', role: 'menuitem', label: '用户管理', valueState: 'selected' },
		],
		popups: [
			{ index: 20, region: 'header', role: 'button', label: '更多', rel: 'aria-controls=menu haspopup=list' },
		],
		elements: [],
	}
	const reachedCreateWithoutEntry = workflow.derivePreModelWorkflowDecision(
		{
			task: '打开 http://example.test/ 找到用户管理部分，创建一个用户。',
			latestTask: '打开 http://example.test/ 找到用户管理部分，创建一个用户。',
			history: [],
			workflowState: {},
		},
		reachedCreateObservation,
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/system/user', current: true }] }
	)
	if (reachedCreateWithoutEntry !== null) {
		throw new Error(`create tasks should not perform deterministic page actions before model planning after target arrival: ${JSON.stringify(reachedCreateWithoutEntry)}`)
	}
	const reachedCreateHint = workflow.buildWorkflowContextText(
		{
			task: '打开 http://example.test/ 找到用户管理部分，创建一个用户。',
			latestTask: '打开 http://example.test/ 找到用户管理部分，创建一个用户。',
			history: [],
			workflowState: {},
		},
		reachedCreateObservation
	)
	if (!reachedCreateHint.includes('create_task status="active"') || !reachedCreateHint.includes('request_context source=actions')) {
		throw new Error(`create-task hints should expose model guidance instead of a deterministic action, got ${reachedCreateHint}`)
	}
	const createEntrySession = {
		task: '打开 http://example.test/ 找到用户管理部分，创建一个用户。',
		latestTask: '打开 http://example.test/ 找到用户管理部分，创建一个用户。',
		history: [],
		workflowState: {},
	}
	const createEntryDecision = workflow.derivePreModelWorkflowDecision(
		createEntrySession,
		{
			url: 'http://example.test/#/system/user',
			title: '用户管理-CRM',
			forms: [],
			actions: [
				{ index: 16, region: 'sidebar', role: 'menuitem', label: '用户管理', valueState: 'selected' },
				{ index: 40, region: 'content', role: 'button', label: '新增', actionIntent: 'create', rect: { left: 20, top: 100, width: 72, height: 32 } },
			],
			popups: [
				{ index: 20, region: 'header', role: 'button', label: '更多', rel: 'aria-controls=menu haspopup=list' },
			],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/system/user', current: true }] }
	)
	if (createEntryDecision !== null) {
		throw new Error(`create-task hints should leave visible create entry choice to the model, got ${JSON.stringify(createEntryDecision)}`)
	}
	const createEntryHint = workflow.buildWorkflowContextText(createEntrySession, {
		url: 'http://example.test/#/system/user',
		title: '用户管理-CRM',
		forms: [],
		actions: [
			{ index: 16, region: 'sidebar', role: 'menuitem', label: '用户管理', valueState: 'selected' },
			{ index: 40, region: 'content', role: 'button', label: '新增', actionIntent: 'create', rect: { left: 20, top: 100, width: 72, height: 32 } },
		],
		popups: [],
		elements: [],
	})
	if (!createEntryHint.includes('create_candidates') || !createEntryHint.includes('index=40')) {
		throw new Error(`create-task hints should surface create candidates for model analysis, got ${createEntryHint}`)
	}
	const customerToolbarCreateDecision = workflow.derivePreModelWorkflowDecision(
		{
			task: '打开 http://example.test/ 找到客户管理。你现在帮我新建一条客户数据，客户名称是张三。',
			latestTask: '打开 http://example.test/ 找到客户管理。你现在帮我新建一条客户数据，客户名称是张三。',
			history: [],
			workflowState: {},
		},
		{
			url: 'http://example.test/#/crm/customer',
			title: '客户-CRM',
			forms: [{ id: 'page_form', name: '页面表单', fields: [] }],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '客户管理 线索 客户 商机', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded' },
				{ index: 7, region: 'sidebar', role: 'menuitem', label: '客户', valueState: 'selected' },
				{ index: 28, region: 'content', role: 'button', label: '新 增', actionIntent: 'create', rect: { left: 20, top: 100, width: 82, height: 36 } },
				{ index: 36, region: 'content', role: 'button', label: '展开搜索', actionIntent: 'open_filter' },
				{ index: 58, region: 'content', role: 'button', label: '详情' },
				{ index: 59, region: 'content', role: 'button', label: '删除' },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/crm/customer', current: true }] }
	)
	if (customerToolbarCreateDecision !== null) {
		throw new Error(`customer toolbar add button should be model-chosen, not deterministically clicked: ${JSON.stringify(customerToolbarCreateDecision)}`)
	}
	const repeatedCreateEntryDecision = workflow.derivePreModelWorkflowDecision(
		createEntrySession,
		{
			url: 'http://example.test/#/system/user',
			title: '用户管理-CRM',
			forms: [],
			actions: [
				{ index: 40, region: 'content', role: 'button', label: '新增', actionIntent: 'create' },
			],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/system/user', current: true }] }
	)
	if (repeatedCreateEntryDecision !== null) {
		throw new Error(`create tasks should not run a deterministic repeated create entry before model planning: ${JSON.stringify(repeatedCreateEntryDecision)}`)
	}
	const createFormTask = '打开 http://example.test/ 找到账号管理部分，创建一个用户，用户名是 nanobot，密码是 123456，性别男，江苏南京江宁人，角色为管理员。'
	const createFormObservation = {
		url: 'http://example.test/#/account/manage',
		title: '账号管理-CRM',
		forms: [
			{
				id: 'dialog',
				name: '新增弹层',
				fields: [
					{ index: 3, region: 'dialog', fieldType: 'username', kind: 'text', label: '登录账号', valueState: 'empty', role: 'textbox' },
					{ index: 4, region: 'dialog', fieldType: 'password', kind: 'text', label: '密码', valueState: 'empty', role: 'textbox' },
					{ index: 5, region: 'dialog', fieldType: 'confirm_password', kind: 'text', label: '确认密码', valueState: 'empty', role: 'textbox' },
					{ index: 6, region: 'dialog', fieldType: 'department', kind: 'dropdown', label: '所属部门', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown', required: true },
					{ index: 8, region: 'dialog', fieldType: 'department', kind: 'dropdown', label: '展开选项', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown' },
					{ index: 10, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '所属区域', valueState: 'empty', role: 'combobox', selectionControl: 'cascader-parent' },
					{ index: 13, region: 'dialog', fieldType: 'name', kind: 'text', label: '用户姓名', valueState: 'empty', role: 'textbox' },
					{ index: 14, region: 'dialog', fieldType: 'gender', kind: 'dropdown', label: '用户性别', valueState: 'selected:男 女 未知', role: 'combobox', selectionControl: 'dropdown' },
				],
			},
		],
		actions: [
			{ index: 1, region: 'sidebar', role: 'menuitem', label: '账号管理', valueState: 'selected' },
			{ index: 18, region: 'dialog', role: 'button', label: '保 存', actionIntent: 'submit' },
		],
		popups: [],
		elements: [],
	}
	const createFormSession = { task: createFormTask, latestTask: createFormTask, history: [], workflowState: {} }
	const firstCreateField = workflow.derivePreModelWorkflowDecision(createFormSession, createFormObservation, {
		tabsSummary: [{ id: 1, url: createFormObservation.url, current: true }],
	})
	if (firstCreateField !== null) {
		throw new Error(`create forms should be filled by model-planned actions, not deterministic workflow code: ${JSON.stringify(firstCreateField)}`)
	}
	const timeoutCreateSession = { task: createFormTask, latestTask: createFormTask, history: [], workflowState: {} }
	const timeoutCreateDecision = workflow.deriveTimeoutRecoveryWorkflowDecision(timeoutCreateSession, createFormObservation, {
		tabsSummary: [{ id: 1, url: createFormObservation.url, current: true }],
	})
	if (timeoutCreateDecision !== null) {
		throw new Error(`timeout recovery should not run deterministic create-form filling: ${JSON.stringify(timeoutCreateDecision)}`)
	}
	const inferredParentSession = {
		task: '打开 http://example.test/ 找到用户管理部分。',
		latestTask: '打开 http://example.test/ 找到用户管理部分。',
		history: [],
		workflowState: {},
	}
	const inferredParentObservation = {
		url: 'http://example.test/#/wel/index',
		title: '首页',
		forms: [],
		actions: [
			{ index: 18, region: 'header', role: 'button', label: '更多', rel: 'aria-controls=menu haspopup=list', rect: { left: 900, top: 12, width: 52, height: 32 } },
			{ index: 33, region: 'sidebar', role: 'menuitem', label: '系统工具', rect: { left: 0, top: 260, width: 180, height: 44 } },
		],
		popups: [],
		elements: [],
	}
	const inferredParentDecision = workflow.derivePreModelWorkflowDecision(inferredParentSession, inferredParentObservation, {
		tabsSummary: [{ id: 1, url: inferredParentObservation.url, current: true }],
	})
	assertAction(inferredParentDecision, 'click_element_by_index')
	if (
		inferredParentDecision.action.input.index !== 33 ||
		inferredParentDecision.action.input.workflow !== 'task-navigation' ||
		inferredParentDecision.action.input.workflow_step !== 'reveal_navigation_options'
	) {
		throw new Error(`task-navigation should prefer a likely semantic parent nav over generic overflow: ${JSON.stringify(inferredParentDecision)}`)
	}
	const revealSession = {
		task: '打开 http://example.test/ 在用户管理创建用户。',
		latestTask: '打开 http://example.test/ 在用户管理创建用户。',
		history: [],
		workflowState: {},
	}
	const revealObservation = {
		url: 'http://example.test/#/wel/index',
		title: '首页',
		forms: [],
		actions: [],
		popups: [
			{ index: 18, region: 'header', role: 'button', label: '更多', rel: 'aria-controls=menu haspopup=list', rect: { left: 900, top: 12, width: 52, height: 32 } },
		],
		elements: [],
	}
	const revealDecision = workflow.deriveTimeoutRecoveryWorkflowDecision(revealSession, revealObservation, {
		tabsSummary: [{ id: 1, url: revealObservation.url, current: true }],
	})
	assertAction(revealDecision, 'click_element_by_index')
	if (
		revealDecision.action.input.index !== 18 ||
		revealDecision.action.input.workflow !== 'task-navigation' ||
		revealDecision.action.input.workflow_step !== 'reveal_navigation_options'
	) {
		throw new Error(`timeout recovery should reveal a nav overflow once before failing unresolved navigation: ${JSON.stringify(revealDecision)}`)
	}
	const compositeTimeoutSession = {
		task: customerCreateTask,
		latestTask: customerCreateTask,
		history: attemptedCustomerParentSession.history,
		workflowState: {},
	}
	const compositeTimeoutDecision = workflow.deriveTimeoutRecoveryWorkflowDecision(
		compositeTimeoutSession,
		{
			url: 'http://example.test/#/crm/business',
			title: '商机-CRM',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '客户管理 线索 客户 商机 公海 合同 销售订单 物料申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded', rect: { left: 0, top: 120, width: 180, height: 300 } },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/crm/business', current: true }] }
	)
	assertAction(compositeTimeoutDecision, 'locate_by_vision')
	if (compositeTimeoutDecision.action.input.workflow_nav_alias !== '客户') {
		throw new Error(`timeout recovery should use vision for a merged expanded nav group instead of clicking the group again: ${JSON.stringify(compositeTimeoutDecision)}`)
	}
	workflow.recordWorkflowOutcome(revealSession, revealDecision, {
		success: true,
		output: '已展开更多菜单。',
		outcome: { kind: 'opened', progress: true },
	})
	const revealHintText = workflow.buildWorkflowContextText(revealSession, revealObservation)
	if (revealHintText.includes('key="更多"')) {
		throw new Error(`navigation reveal actions should not become unresolved task targets: ${revealHintText}`)
	}
	const shiftedRevealObservation = {
		...revealObservation,
		popups: [
			{ index: 0, region: 'header', role: 'button', label: '更多', rel: 'aria-controls=another-menu haspopup=list', rect: { left: 900, top: 12, width: 52, height: 32 } },
		],
	}
	const shiftedReveal = workflow.deriveTimeoutRecoveryWorkflowDecision(revealSession, shiftedRevealObservation, {
		tabsSummary: [{ id: 1, url: revealObservation.url, current: true }],
	})
	assertAction(shiftedReveal, 'done')
	if (shiftedReveal.action.input.success !== false) {
		throw new Error(`navigation reveal should be de-duplicated by label+region, not unstable index: ${JSON.stringify(shiftedReveal)}`)
	}
	const repeatedReveal = workflow.deriveTimeoutRecoveryWorkflowDecision(revealSession, revealObservation, {
		tabsSummary: [{ id: 1, url: revealObservation.url, current: true }],
	})
	assertAction(repeatedReveal, 'done')
	if (repeatedReveal.action.input.success !== false) {
		throw new Error(`timeout recovery should not repeat the same nav reveal candidate: ${JSON.stringify(repeatedReveal)}`)
	}
}

function assertSearchWorkflowBehavior() {
	const planner = read('naturalclick-extension/background/planner.js')
	const background = read('naturalclick-extension/background.js')
	const workflowSource = read('naturalclick-extension/background/search-workflow.js')
	const stateSource = read('naturalclick-extension/background/search-workflow-state.js')
	const historySource = read('naturalclick-extension/background/search-workflow-history.js')
	const registrySource = read('naturalclick-extension/background/workflows.js')
	const sandbox = loadBackgroundModule('naturalclick-extension/background/search-workflow.js', {})
	const workflow = sandbox.NC_BG_SEARCH_WORKFLOW_TESTS
	const productionWorkflow = sandbox.NC_BG_SEARCH_WORKFLOW
	if (
		!workflow?.recordSearchWorkflowOutcome ||
		workflow.hasActiveSearchWorkflow ||
		!workflow.buildSearchWorkflowHintLines ||
		!workflow.deriveSearchWorkflowDecision
	) {
		throw new Error('search workflow test contract is not exported')
	}
	if (
		!productionWorkflow?.recordSearchWorkflowOutcome ||
		!productionWorkflow?.buildSearchWorkflowHintLines ||
		!productionWorkflow?.shouldRecordSearchWorkflowOutcome ||
		!productionWorkflow?.deriveSearchWorkflowDecision ||
		productionWorkflow.hasActiveSearchWorkflow
	) {
		throw new Error(`production search workflow API should expose deterministic decisions, hints, and state recording, got ${JSON.stringify(Object.keys(productionWorkflow || {}))}`)
	}
	if (!planner.includes('NC_BG_PLANNER_WORKFLOWS') || !registrySource.includes('recordSearchWorkflowOutcome')) {
		throw new Error('planner should keep search workflow ownership routed through the workflow registry')
	}
	if (!registrySource.includes('deriveSearchWorkflowDecisionIfAllowed') || registrySource.includes('hasUnresolvedTaskNavigationTarget')) {
		throw new Error('workflow registry should run deterministic search only through the explicit guarded workflow entry')
	}
	if (!/function\s+buildSearchWorkflowHintLines\s*\(/.test(workflowSource) || !/function\s+deriveSearchWorkflowDecision\s*\(/.test(workflowSource) || workflowSource.includes('NC_BG_SEARCH_WORKFLOW_FIELDS')) {
		throw new Error('search workflow should provide model-visible hints and the 0.4 deterministic state-machine decision helper')
	}
	for (const forbidden of [
		'function deriveActiveSearchWorkflowDecision',
		'function deriveInactiveSearchWorkflowDecision',
		'function shouldDeferInactiveSearchWorkflow',
	]) {
		if (workflowSource.includes(forbidden)) {
			throw new Error(`search workflow should not retain obsolete auto-runner helper: ${forbidden}`)
		}
	}
	if (!workflowSource.includes('NC_BG_SEARCH_WORKFLOW_STATE') || !stateSource.includes('SEARCH_STATE_VERSION') || !stateSource.includes('normalizeSearchStateVersion')) {
		throw new Error('search workflow should keep persisted search workflow state versioned')
	}
	if (!workflowSource.includes('NC_BG_SEARCH_WORKFLOW_HISTORY') || !historySource.includes('isSearchPanelExpandHistory') || !historySource.includes('normalizeOutcomeObject')) {
		throw new Error('search workflow should route history classification and outcome parsing through search-workflow-history.js')
	}
	if (background.includes('background/search-workflow-fields.js')) {
		throw new Error('background should not load the removed deterministic search field helper')
	}
	if (!registrySource.includes('inferWorkflowNameFromOutcome') || !registrySource.includes('shouldRecordSearchWorkflowOutcome')) {
		throw new Error('workflow registry should infer search ownership for model-planned search actions without reintroducing auto-runner behavior')
	}
	const collapsedHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9, triggerLabel: '展开搜索' },
			],
			forms: [],
			actions: [],
		}
	)
	if (!collapsedHints.join('\n').includes('search_panel') || !collapsedHints.join('\n').includes('triggerIndex="9"')) {
		throw new Error(`search workflow should hint collapsed search panels, got ${JSON.stringify(collapsedHints)}`)
	}
	const collapsedDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9, triggerLabel: '展开搜索' },
			],
			forms: [],
			actions: [],
		}
	)
	assertAction(collapsedDecision, 'click_element_by_index')
	if (
		collapsedDecision.action.input.index !== 9 ||
		collapsedDecision.action.input.workflow_step !== 'expand_search_panel'
	) {
		throw new Error(`search workflow should deterministically expand collapsed panels, got ${JSON.stringify(collapsedDecision)}`)
	}
	const fieldHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项 账号 admin', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,用户姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '用户姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	const fieldHintText = fieldHints.join('\n')
	if (!fieldHintText.includes('search_fields') || !fieldHintText.includes('登录账号[index=2') || !fieldHintText.includes('用户姓名[index=3') || !fieldHintText.includes('submitIndex="8"')) {
		throw new Error(`search workflow should expose generic field and action hints, got ${JSON.stringify(fieldHints)}`)
	}
	const firstFieldDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项 账号 admin', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,用户姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '用户姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	assertAction(firstFieldDecision, 'input_text')
	if (
		firstFieldDecision.action.input.index !== 2 ||
		firstFieldDecision.action.input.text !== 'admin' ||
		firstFieldDecision.action.input.workflow_step !== 'fill_field'
	) {
		throw new Error(`search workflow should deterministically fill the first text search field, got ${JSON.stringify(firstFieldDecision)}`)
	}
	const dropdownHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '平台' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 4, label: '平台', fieldType: 'platform', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	if (!dropdownHints.join('\n').includes('平台[index=4') || !dropdownHints.join('\n').includes('control=selection')) {
		throw new Error(`search workflow should identify selection-like fields for model planning, got ${JSON.stringify(dropdownHints)}`)
	}
	const dropdownDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '平台' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 4, label: '平台', fieldType: 'platform', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	assertAction(dropdownDecision, 'open_dropdown')
	if (dropdownDecision.action.input.index !== 4 || dropdownDecision.action.input.workflow_step !== 'open_dropdown') {
		throw new Error(`search workflow should open selection fields before choosing, got ${JSON.stringify(dropdownDecision)}`)
	}
	const nativeOptionHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '状态' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 5, label: '状态', fieldType: 'status', optionLabels: ['启用', '禁用'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	if (!nativeOptionHints.join('\n').includes('options=启用|禁用')) {
		throw new Error(`search workflow should expose real optionLabels as hints, got ${JSON.stringify(nativeOptionHints)}`)
	}
	const nativeOptionDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '状态' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 5, label: '状态', fieldType: 'status', optionLabels: ['启用', '禁用'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	assertAction(nativeOptionDecision, 'choose_dropdown_option')
	if (nativeOptionDecision.action.input.text !== '启用' || nativeOptionDecision.action.input.workflow_step !== 'select_option') {
		throw new Error(`search workflow should choose only real optionLabels, got ${JSON.stringify(nativeOptionDecision)}`)
	}
	const checkboxOptionHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '角色' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 6, label: '角色', fieldType: 'multi_select', selectionControl: 'checkbox', optionLabels: ['管理员', '普通用户'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	if (!checkboxOptionHints.join('\n').includes('options=管理员|普通用户') || !checkboxOptionHints.join('\n').includes('control=selection')) {
		throw new Error(`search workflow should expose checkbox-like option fields as hints, got ${JSON.stringify(checkboxOptionHints)}`)
	}
	const checkboxOptionDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '角色' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 6, label: '角色', fieldType: 'multi_select', selectionControl: 'checkbox', optionLabels: ['管理员', '普通用户'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	assertAction(checkboxOptionDecision, 'select_checkbox_option')
	if (checkboxOptionDecision.action.input.text !== '管理员' || checkboxOptionDecision.action.input.workflow_step !== 'select_option') {
		throw new Error(`search workflow should use checkbox selection tools for checkbox-like fields, got ${JSON.stringify(checkboxOptionDecision)}`)
	}
	const inferredSearchSubmit = workflow.shouldRecordSearchWorkflowOutcome(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			action: { name: 'click_element_by_index', input: { index: 8, target_label: '搜索' } },
			next_goal: '点击搜索按钮验证当前筛选项',
		},
		{ success: true, output: '已点击搜索。' }
	)
	if (!inferredSearchSubmit) {
		throw new Error('search workflow should infer ownership for model-planned search submit actions')
	}
	const inferredPlainInput = workflow.shouldRecordSearchWorkflowOutcome(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			action: { name: 'input_text', input: { index: 2, text: 'admin' } },
			next_goal: '填写登录账号搜索项。',
		},
		{ success: true, output: '已在索引 2 输入文本。' }
	)
	if (!inferredPlainInput) {
		throw new Error('search workflow should infer ownership for model-planned search field input when goal text is explicit')
	}
	const plainInputOnSearchTask = workflow.shouldRecordSearchWorkflowOutcome(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			action: { name: 'input_text', input: { index: 1, text: 'admin' } },
			next_goal: '填写账号。',
		},
		{ success: true, output: '已在索引 1 输入文本。' }
	)
	if (plainInputOnSearchTask) {
		throw new Error('search workflow should not infer ownership for ambiguous plain input without search-field context')
	}
	const activeStateInput = workflow.shouldRecordSearchWorkflowOutcome(
		{ task: '普通任务', history: [], workflowState: { search: { phase: 'select_field' } } },
		{
			action: { name: 'input_text', input: { index: 2, text: 'admin' } },
			next_goal: '填写登录账号。',
		},
		{ success: true, output: '已在索引 2 输入文本。' }
	)
	if (!activeStateInput) {
		throw new Error('search workflow should continue recording model actions while a non-terminal search state is active')
	}
	const unrelatedInput = workflow.shouldRecordSearchWorkflowOutcome(
		{ task: '普通登录系统', history: [], workflowState: {} },
		{
			action: { name: 'input_text', input: { index: 2, text: 'admin' } },
			next_goal: '填写账号。',
		},
		{ success: true, output: '已在索引 2 输入文本。' }
	)
	if (unrelatedInput) {
		throw new Error('search workflow should not infer ownership for non-search-test tasks')
	}
	const recorderSession = { task: '测试搜索项', history: [], workflowState: {} }
	workflow.recordSearchWorkflowOutcome(
		recorderSession,
		{
			action: {
				name: 'input_text',
				input: {
					workflow: 'search-fields',
					workflow_step: 'fill_field',
					workflow_field_key: '登录账号:username',
					workflow_field_index: 2,
					workflow_field_label: '登录账号',
					index: 2,
					text: 'admin',
				},
			},
			next_goal: '填写登录账号',
		},
		{ success: true, output: '已在索引 2 输入文本。' }
	)
	const searchState = recorderSession.workflowState.search
	if (
		searchState?.phase !== 'awaiting_submit' ||
		searchState.activeFieldKey !== 'index:2' ||
		searchState.fields?.['index:2']?.label !== '登录账号'
	) {
		throw new Error(`search workflow recorder should track filled field state: ${JSON.stringify(searchState)}`)
	}
	workflow.recordSearchWorkflowOutcome(
		recorderSession,
		{
			action: {
				name: 'click_element_by_index',
				input: {
					workflow: 'search-fields',
					workflow_step: 'submit_search',
					workflow_field_key: '登录账号:username',
					workflow_field_index: 2,
					index: 8,
					target_label: '搜索',
				},
			},
			next_goal: '点击搜索验证登录账号',
		},
		{ success: true, output: '已点击搜索。' }
	)
	if (searchState.phase !== 'awaiting_reset' || searchState.lastSearchedFieldKey !== 'index:2') {
		throw new Error(`search workflow recorder should wait for reset after submit: ${JSON.stringify(searchState)}`)
	}
	workflow.recordSearchWorkflowOutcome(
		recorderSession,
		{
			action: {
				name: 'click_element_by_index',
				input: {
					workflow: 'search-fields',
					workflow_step: 'reset_filters',
					index: 9,
					target_label: '重置',
				},
			},
			next_goal: '重置筛选条件',
		},
		{ success: true, output: '已点击重置。' }
	)
	if (searchState.phase !== 'select_field' || !searchState.completedKeys?.includes('index:2')) {
		throw new Error(`search workflow recorder should mark reset-completed fields: ${JSON.stringify(searchState)}`)
	}
	const ambiguousResetSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	workflow.recordSearchWorkflowOutcome(
		ambiguousResetSession,
		{
			action: {
				name: 'input_text',
				input: {
					workflow: 'search-fields',
					workflow_step: 'fill_field',
					workflow_field_index: 2,
					workflow_field_label: '登录账号',
					index: 2,
					text: 'admin',
				},
			},
			next_goal: '填写搜索字段：登录账号',
		},
		{ success: true, output: '已在索引 2 输入文本。' }
	)
	workflow.recordSearchWorkflowOutcome(
		ambiguousResetSession,
		{
			action: {
				name: 'click_element_by_index',
				input: {
					workflow: 'search-fields',
					workflow_step: 'submit_search',
					workflow_field_index: 2,
					index: 8,
					target_label: '搜 索',
				},
			},
			next_goal: '点击搜索验证：登录账号',
		},
		{ success: true, output: '已点击索引 8。 | 动作结果: dom_changed progress=true reason="DOM 摘要已变化"' }
	)
	workflow.recordSearchWorkflowOutcome(
		ambiguousResetSession,
		{
			action: {
				name: 'click_element_by_index',
				input: {
					workflow: 'search-fields',
					workflow_step: 'reset_filters',
					workflow_field_index: 2,
					index: 9,
					target_label: '清 空',
				},
			},
			next_goal: '重置搜索条件：登录账号',
		},
		{ success: true, output: '已点击索引 9。 | 动作结果: value_changed progress=true reason="搜索重置后字段已清空"' }
	)
	const ambiguousResetState = ambiguousResetSession.workflowState.search
	if (ambiguousResetState.phase !== 'select_field' || !ambiguousResetState.completedKeys?.includes('index:2')) {
		throw new Error(`search reset records containing the word 搜索 must be classified as reset, got ${JSON.stringify(ambiguousResetState)}`)
	}
	const nextAfterAmbiguousReset = workflow.deriveSearchWorkflowDecision(
		ambiguousResetSession,
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,用户姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '用户姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 9, actionIntent: 'reset', label: '清 空', region: 'content' },
			],
		}
	)
	assertAction(nextAfterAmbiguousReset, 'input_text')
	if (nextAfterAmbiguousReset.action.input.index !== 3 || nextAfterAmbiguousReset.action.input.workflow_step !== 'fill_field') {
		throw new Error(`search workflow should advance to the next field after reset, got ${JSON.stringify(nextAfterAmbiguousReset)}`)
	}
	const progressHints = workflow.buildSearchWorkflowHintLines(
		recorderSession,
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,用户姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '用户姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 9, actionIntent: 'reset', label: '重置', region: 'content' },
			],
		}
	).join('\n')
	if (
		!progressHints.includes('search_state') ||
		!progressHints.includes('phase="select_field"') ||
		!progressHints.includes('completed="1/2"') ||
		!progressHints.includes('remaining="1"') ||
		!progressHints.includes('completedLabels="登录账号"') ||
		!progressHints.includes('nextIndex="3"') ||
		!progressHints.includes('nextLabel="用户姓名"')
	) {
		throw new Error(`search workflow hints should expose completed and next pending field state, got ${progressHints}`)
	}
	workflow.recordSearchWorkflowOutcome(
		recorderSession,
		{
			action: {
				name: 'done',
				input: {
					workflow: 'search-fields',
					workflow_step: 'finish_search_fields',
					success: false,
					text: '模型停止搜索测试',
				},
			},
		},
		{ success: true, output: '任务已结束。' }
	)
	if (searchState.phase !== 'completed' || searchState.terminalSuccess !== false) {
		throw new Error(`search workflow terminal done should persist inactive terminal state: ${JSON.stringify(searchState)}`)
	}
	const completeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	for (const index of [2, 3]) {
		workflow.recordSearchWorkflowOutcome(
			completeSession,
			{
				action: {
					name: 'input_text',
					input: {
						workflow: 'search-fields',
						workflow_step: 'fill_field',
						workflow_field_index: index,
						workflow_field_label: index === 2 ? '登录账号' : '用户姓名',
						index,
						text: index === 2 ? 'admin' : '测试用户',
					},
				},
				next_goal: index === 2 ? '填写登录账号' : '填写用户姓名',
			},
			{ success: true, output: `已在索引 ${index} 输入文本。` }
		)
		workflow.recordSearchWorkflowOutcome(
			completeSession,
			{
				action: {
					name: 'click_element_by_index',
					input: {
						workflow: 'search-fields',
						workflow_step: 'submit_search',
						workflow_field_index: index,
						index: 8,
						target_label: '搜索',
					},
				},
				next_goal: '点击搜索验证字段',
			},
			{ success: true, output: '已点击搜索。' }
		)
		workflow.recordSearchWorkflowOutcome(
			completeSession,
			{
				action: {
					name: 'click_element_by_index',
					input: {
						workflow: 'search-fields',
						workflow_step: 'reset_filters',
						index: 9,
						target_label: '重置',
					},
				},
				next_goal: '重置筛选条件',
			},
			{ success: true, output: '已点击重置。' }
		)
	}
	const completeHints = workflow.buildSearchWorkflowHintLines(
		completeSession,
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,用户姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '用户姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 9, actionIntent: 'reset', label: '重置', region: 'content' },
			],
		}
	).join('\n')
	if (
		!completeHints.includes('allComplete="true"') ||
		!completeHints.includes('remaining="0"') ||
		!completeHints.includes('completed="2/2"') ||
		completeHints.includes('nextIndex=')
	) {
		throw new Error(`search workflow hints should clearly finish when all fields are tested, got ${completeHints}`)
	}
	const inferredRecorderSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	workflow.recordSearchWorkflowOutcome(
		inferredRecorderSession,
		{
			action: { name: 'input_text', input: { workflow: 'search-fields', index: 2, text: 'admin' } },
			next_goal: '填写登录账号搜索项。',
		},
		{ success: true, output: '已在索引 2 输入文本。' }
	)
	if (inferredRecorderSession.workflowState.search?.phase !== 'awaiting_submit') {
		throw new Error(`search workflow recorder should track model-planned field input after registry annotation: ${JSON.stringify(inferredRecorderSession.workflowState)}`)
	}
}

function assertPlannerWorkflowRegistryBehavior() {
	const planner = read('naturalclick-extension/background/planner.js')
	const registry = read('naturalclick-extension/background/workflows.js')
	const sandbox = loadBackgroundModule('naturalclick-extension/background/planner.js', {
		NC_BG_UTILS: {
			safeJsonParse: (value) => {
				try {
					return JSON.parse(value)
				} catch (_) {
					return null
				}
			},
			generateId: () => 'test_id',
		},
	})
	const plannerTests = sandbox.NC_BG_PLANNER_TESTS
	if (!plannerTests?.derivePreModelWorkflowDecision || !plannerTests?.deriveTimeoutRecoveryWorkflowDecision || !plannerTests?.resolveDecisionWorkflowName || !plannerTests?.buildWorkflowContextText) {
		throw new Error('planner should export workflow registry test hooks')
	}
	if (!registry.includes('PRE_MODEL_WORKFLOWS') || !registry.includes('TIMEOUT_RECOVERY_WORKFLOWS')) {
		throw new Error('workflow registry should make pre-model and timeout recovery ordering explicit')
	}
	for (const forbidden of [
		'deriveActiveSearchWorkflowDecision',
		'deriveInactiveSearchWorkflowDecision',
		'deriveTaskNavigationDecision',
		'shouldDeferInactiveSearchWorkflow',
		'hasNavigationReserved',
	]) {
		if (registry.includes(`function ${forbidden}`)) {
			throw new Error(`workflow registry should not keep obsolete deterministic business-action helper ${forbidden}`)
		}
	}
	if (!registry.includes('extractTaskNavigationTargetKeys')) {
		throw new Error('workflow registry should still extract task targets for model-visible hints')
	}
	if (!registry.includes('deriveUnresolvedNavigationTimeoutDecision')) {
		throw new Error('workflow registry should expose explicit unresolved-navigation timeout termination')
	}
	const hintText = plannerTests.buildWorkflowContextText(
		{
			task: '找到用户管理部分，找出搜索区域',
			history: [],
			workflowState: { search: { phase: 'select_field', activeFieldKey: '登录账号:username:index:25', completedKeys: ['账号'] } },
		},
		{
			title: '首页',
			actions: [],
			elements: [],
			url: 'http://example.test/app#/wel/index',
		}
	)
	if (!hintText.includes('<workflow_hints>') || !hintText.includes('用户管理') || !hintText.includes('status="unresolved"') || !hintText.includes('search_state')) {
		throw new Error(`workflow context hints should expose unresolved target and reference-only search state, got: ${hintText}`)
	}
	if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: 'fill_username' } } }) !== 'login') {
		throw new Error('workflow registry should infer login ownership from workflow_step')
	}
	if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: 'finish_search_fields' } } }) !== 'search-fields') {
		throw new Error('workflow registry should infer search ownership from workflow_step')
	}
	if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_nav_key: '用户管理' } } }) !== 'task-navigation') {
		throw new Error('workflow registry should infer navigation ownership from workflow_nav_key')
	}
	for (const createStep of ['open_create_entry', 'fill_create_field', 'select_create_option', 'select_create_cascader', 'open_create_required_field', 'select_create_required_option', 'submit_create_record']) {
		if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: createStep } } })) {
			throw new Error(`workflow registry should not infer deterministic create workflow ownership from workflow_step ${createStep}`)
		}
	}
	if (/deriveFastPathDecision\(session,\s*observation,\s*tabsSummary\)/.test(planner)) {
		throw new Error('planner should not call fast-path policy directly; route it through background/workflows.js')
	}
	if (/deriveSearchWorkflowDecision\(session,\s*observation\)/.test(planner)) {
		throw new Error('planner should not call concrete search workflow directly; route it through background/workflows.js')
	}
	const searchDecision = plannerTests.derivePreModelWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [] },
		{
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [],
			url: 'http://example.test/app',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app' }] }
	)
	assertAction(searchDecision, 'click_element_by_index')
	if (
		searchDecision.action.input.index !== 9 ||
		searchDecision.action.input.workflow !== 'search-fields' ||
		searchDecision.action.input.workflow_step !== 'expand_search_panel'
	) {
		throw new Error(`pre-model workflow should deterministically expand search panels when no named module is unresolved, got ${JSON.stringify(searchDecision)}`)
	}
	const searchHintOnly = plannerTests.buildWorkflowContextText(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [],
			url: 'http://example.test/app',
		}
	)
	if (!searchHintOnly.includes('search_panel') || !searchHintOnly.includes('triggerIndex="9"')) {
		throw new Error(`workflow hints should expose collapsed search panel instead of executing it, got ${searchHintOnly}`)
	}
	const navigationBeforeSearchDecision = plannerTests.derivePreModelWorkflowDecision(
		{ task: '找到用户管理部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
		{
			title: '首页',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [
				{ index: 18, role: 'menuitem', region: 'sidebar', label: '用户管理', valueState: 'unknown' },
			],
			url: 'http://example.test/app#/wel/index',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/wel/index' }] }
	)
	assertAction(navigationBeforeSearchDecision, 'click_element_by_index')
	if (
		navigationBeforeSearchDecision.action.input.index !== 18 ||
		navigationBeforeSearchDecision.action.input.workflow !== 'task-navigation' ||
		navigationBeforeSearchDecision.action.input.workflow_step !== 'navigate_to_task_target'
	) {
		throw new Error(`pre-model workflow should click a high-confidence task navigation target once before search testing, got ${JSON.stringify(navigationBeforeSearchDecision)}`)
	}
	const wrongPageSearchDecision = plannerTests.derivePreModelWorkflowDecision(
		{ task: '找到用户管理部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
		{
			title: '首页',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [
				{ index: 9, role: 'button', region: 'content', label: '展开搜索', actionIntent: 'open_filter' },
			],
			url: 'http://example.test/app#/wel/index',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/wel/index' }] }
	)
	if (wrongPageSearchDecision !== null) {
		throw new Error(`inactive search workflow should not test a generic search area before the named task module is reached: ${JSON.stringify(wrongPageSearchDecision)}`)
	}
	const wrongPageTimeoutDecision = plannerTests.deriveTimeoutRecoveryWorkflowDecision(
		{ task: '找到用户管理部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
		{
			title: '首页',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [
				{ index: 9, role: 'button', region: 'content', label: '展开搜索', actionIntent: 'open_filter' },
			],
			url: 'http://example.test/app#/wel/index',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/wel/index' }] }
	)
	if (
		wrongPageTimeoutDecision?.action?.name !== 'done' ||
		wrongPageTimeoutDecision.action.input.success !== false ||
		!String(wrongPageTimeoutDecision.action.input.text || '').includes('用户管理')
	) {
		throw new Error(`timeout recovery should stop instead of testing the wrong page when a named module is unresolved: ${JSON.stringify(wrongPageTimeoutDecision)}`)
	}
	const activeSearchPriorityDecision = plannerTests.derivePreModelWorkflowDecision(
		{
			task: '找到用户管理部分，找出搜索区域，测试每一个搜索项功能是否正常',
			history: [
				{ action: 'click_element_by_index', input: { workflow: 'search-fields', target_label: '展开搜索' }, success: true },
			],
			workflowState: { search: { phase: 'select_field' } },
		},
		{
			title: 'CRM',
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,用户姓名,用户平台' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 25, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', editable: true },
						{ index: 26, label: '用户姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', editable: true },
					],
				},
			],
			actions: [
				{ index: 18, role: 'tab', region: 'header', label: '用户管理', valueState: 'unknown' },
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '用户管理', valueState: 'unknown' },
				{ index: 30, intent: 'search', label: '搜索', region: 'content' },
			],
			url: 'http://example.test/app#/wel/index',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/wel/index' }] }
	)
	assertAction(activeSearchPriorityDecision, 'click_element_by_index')
	if (
		activeSearchPriorityDecision.action.input.workflow !== 'task-navigation' ||
		activeSearchPriorityDecision.action.input.workflow_step !== 'navigate_to_task_target'
	) {
		throw new Error(`pre-model workflow should resolve named task navigation before continuing hidden search state, got ${JSON.stringify(activeSearchPriorityDecision)}`)
	}
	const searchAfterArrivedDecision = plannerTests.derivePreModelWorkflowDecision(
		{ task: '找到用户管理部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
		{
			title: '用户管理-CRM',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 35, triggerLabel: '展开搜索' },
			],
			forms: [],
			actions: [
				{ index: 18, role: 'tab', region: 'header', label: '用户管理', valueState: 'unknown' },
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '用户管理', valueState: 'unknown' },
			],
			url: 'http://example.test/app#/system/user',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/system/user' }] }
	)
	assertAction(searchAfterArrivedDecision, 'click_element_by_index')
	if (
		searchAfterArrivedDecision.action.input.index !== 35 ||
		searchAfterArrivedDecision.action.input.workflow !== 'search-fields' ||
		searchAfterArrivedDecision.action.input.workflow_step !== 'expand_search_panel'
	) {
		throw new Error(`arrived business page should let deterministic search workflow expand the filter panel, got ${JSON.stringify(searchAfterArrivedDecision)}`)
	}
	const arrivedSearchHint = plannerTests.buildWorkflowContextText(
		{ task: '找到用户管理部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
		{
			title: '用户管理-CRM',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 35, triggerLabel: '展开搜索' },
			],
			forms: [],
			actions: [],
			url: 'http://example.test/app#/system/user',
		}
	)
	if (!arrivedSearchHint.includes('search_panel') || !arrivedSearchHint.includes('triggerIndex="35"')) {
		throw new Error(`arrived business page should expose search expansion as hints, got ${arrivedSearchHint}`)
	}
	const navStateSession = {
		task: '找到用户管理部分，找出搜索区域，测试每一个搜索项功能是否正常',
		history: [],
		workflowState: {},
	}
	const navStateDecision = plannerTests.derivePreModelWorkflowDecision(
		navStateSession,
		{
			title: '首页',
			actions: [
				{ index: 18, role: 'tab', region: 'header', label: '用户管理', valueState: 'unknown' },
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '用户管理', valueState: 'unknown' },
			],
			elements: [],
			url: 'http://example.test/app#/wel/index',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/wel/index' }] }
	)
	assertAction(navStateDecision, 'click_element_by_index')
	if (
		navStateDecision.action.input.index !== 19 ||
		navStateDecision.action.input.workflow !== 'task-navigation' ||
		navStateDecision.action.input.workflow_step !== 'navigate_to_task_target'
	) {
		throw new Error(`pre-model navigation should click one high-confidence target module with workflow metadata, got ${JSON.stringify(navStateDecision)}`)
	}
	if (!navStateSession.workflowState.navigation?.plannedKeys?.includes('用户管理')) {
		throw new Error(`pre-model navigation should reserve the planned target to prevent immediate repeats: ${JSON.stringify(navStateSession.workflowState)}`)
	}
	const repeatedPlannedNavDecision = plannerTests.derivePreModelWorkflowDecision(
		navStateSession,
		{
			title: '首页',
			actions: [
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '用户管理', valueState: 'unknown' },
			],
			elements: [],
			url: 'http://example.test/app#/wel/index',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/wel/index' }] }
	)
	if (repeatedPlannedNavDecision !== null) {
		throw new Error(`planned task navigation should suppress a second same-target decision even before execution outcome: ${JSON.stringify(repeatedPlannedNavDecision)}`)
	}
	const prematureSearchAfterPlannedNavDecision = plannerTests.derivePreModelWorkflowDecision(
		navStateSession,
		{
			title: '首页',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [
				{ index: 9, role: 'button', region: 'content', label: '展开搜索', actionIntent: 'open_filter' },
			],
			elements: [],
			url: 'http://example.test/app#/wel/index',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/wel/index' }] }
	)
	if (prematureSearchAfterPlannedNavDecision !== null) {
		throw new Error(`generic search workflow should not test a wrong page while task navigation is unresolved: ${JSON.stringify(prematureSearchAfterPlannedNavDecision)}`)
	}
	const arrivedSearchAfterPlannedNavDecision = plannerTests.derivePreModelWorkflowDecision(
		navStateSession,
		{
			title: '用户管理-CRM',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [
				{ index: 9, role: 'button', region: 'content', label: '展开搜索', actionIntent: 'open_filter' },
			],
			elements: [],
			url: 'http://example.test/app#/system/user',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/system/user' }] }
	)
	assertAction(arrivedSearchAfterPlannedNavDecision, 'click_element_by_index')
	if (
		arrivedSearchAfterPlannedNavDecision.action.input.index !== 9 ||
		arrivedSearchAfterPlannedNavDecision.action.input.workflow !== 'search-fields'
	) {
		throw new Error(`generic search workflow should resume after a named navigation target is reached: ${JSON.stringify(arrivedSearchAfterPlannedNavDecision)}`)
	}
	const arrivedAfterNavHint = plannerTests.buildWorkflowContextText(
		navStateSession,
		{
			title: '用户管理-CRM',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [],
			elements: [],
			url: 'http://example.test/app#/system/user',
		}
	)
	if (!arrivedAfterNavHint.includes('search_panel') || !arrivedAfterNavHint.includes('triggerIndex="9"')) {
		throw new Error(`workflow hints should resume search context after arrival without executing it, got ${arrivedAfterNavHint}`)
	}
	const directNavDecision = {
		action: {
			name: 'click_element_by_index',
			input: {
				workflow: 'task-navigation',
				workflow_step: 'navigate_to_task_target',
				workflow_nav_key: '用户管理',
				target_label: '用户管理',
			},
		},
		next_goal: '进入目标模块：用户管理',
	}
	plannerTests.recordWorkflowOutcome(navStateSession, directNavDecision, {
		success: true,
		output: '已点击索引 18。 | 校验通过: DOM 摘要已变化',
	})
	const repeatedNavStateDecision = plannerTests.derivePreModelWorkflowDecision(
		navStateSession,
		{
			title: '首页',
			actions: [
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '用户管理', valueState: 'unknown' },
			],
			elements: [],
			url: 'http://example.test/app#/wel/index',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/wel/index' }] }
	)
	if (repeatedNavStateDecision !== null) {
		throw new Error(`task navigation workflowState should suppress repeated same-target navigation attempts: ${JSON.stringify(repeatedNavStateDecision)}`)
	}
	const inferredLoginSession = { task: '登录系统 账号 admin 密码 123456', history: [], workflowState: {} }
	plannerTests.recordWorkflowOutcome(
		inferredLoginSession,
		{ action: { name: 'input_text', input: { workflow_step: 'fill_username', index: 1 } } },
		{ success: false, output: '', outcome: { kind: 'no_effect', progress: false, reason: '账号未写入' } }
	)
	if (inferredLoginSession.workflowState.login?.phase !== 'failed' || inferredLoginSession.workflowState.login?.failedReason !== '账号未写入') {
		throw new Error(`workflow registry should route workflow_step-only login outcomes to login state: ${JSON.stringify(inferredLoginSession.workflowState)}`)
	}
	const inferredSearchSession = { task: '测试搜索项', history: [], workflowState: {} }
	plannerTests.recordWorkflowOutcome(
		inferredSearchSession,
		{ action: { name: 'done', input: { workflow_step: 'finish_search_fields', success: true } } },
		{ success: true, output: '搜索项测试完成' }
	)
	if (inferredSearchSession.workflowState.search?.phase !== 'completed' || inferredSearchSession.workflowState.search?.terminalSuccess !== true) {
		throw new Error(`workflow registry should route workflow_step-only terminal search outcomes to search state: ${JSON.stringify(inferredSearchSession.workflowState)}`)
	}
	const inferredModelSearchSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	plannerTests.recordWorkflowOutcome(
		inferredModelSearchSession,
		{
			action: { name: 'click_element_by_index', input: { index: 9, target_label: '展开搜索' } },
			next_goal: '展开搜索区域',
		},
		{ success: true, output: '已点击展开搜索。' }
	)
	if (inferredModelSearchSession.workflowState.search?.phase !== 'select_field') {
		throw new Error(`workflow registry should infer search ownership for model-planned panel expansion: ${JSON.stringify(inferredModelSearchSession.workflowState)}`)
	}
	plannerTests.recordWorkflowOutcome(
		inferredModelSearchSession,
		{
			action: { name: 'input_text', input: { index: 2, text: 'admin' } },
			next_goal: '填写登录账号搜索字段',
		},
		{ success: true, output: '已在索引 2 输入文本。' }
	)
	if (
		inferredModelSearchSession.workflowState.search?.phase !== 'awaiting_submit' ||
		inferredModelSearchSession.workflowState.search?.activeFieldKey !== 'index:2'
	) {
		throw new Error(`workflow registry should record model-planned search field input without workflow metadata: ${JSON.stringify(inferredModelSearchSession.workflowState)}`)
	}
	const inferredNavSession = { task: '找到用户管理部分', history: [], workflowState: {} }
	plannerTests.recordWorkflowOutcome(
		inferredNavSession,
		{
			action: {
				name: 'click_element_by_index',
				input: { workflow_step: 'navigate_to_task_target', workflow_nav_key: '用户管理', target_label: '用户管理' },
			},
		},
		{ success: false, output: '循环保护拦截' }
	)
	if (!inferredNavSession.workflowState.navigation?.failedKeys?.includes('用户管理')) {
		throw new Error(`workflow registry should route workflow_step-only navigation outcomes to navigation state: ${JSON.stringify(inferredNavSession.workflowState)}`)
	}
	const navBlockedSession = {
		task: '找到用户管理部分，找出搜索区域',
		history: [],
		workflowState: {},
	}
	const navBlockedDecision = {
		action: {
			name: 'click_element_by_index',
			input: {
				workflow: 'task-navigation',
				workflow_step: 'navigate_to_task_target',
				workflow_nav_key: '用户管理',
				target_label: '用户管理',
			},
		},
		next_goal: '进入目标模块：用户管理',
	}
	plannerTests.recordWorkflowOutcome(navBlockedSession, navBlockedDecision, {
		success: false,
		output: '循环保护拦截了重复导航。',
		stage: 'loop_guard',
	})
	const repeatedBlockedDecision = plannerTests.derivePreModelWorkflowDecision(
		navBlockedSession,
		{
			title: '首页',
			actions: [
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '用户管理', valueState: 'unknown' },
			],
			elements: [],
			url: 'http://example.test/app#/wel/index',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/wel/index' }] }
	)
	if (repeatedBlockedDecision !== null) {
		throw new Error(`loop-guarded task navigation should suppress the same target before model planning: ${JSON.stringify(repeatedBlockedDecision)}`)
	}
	const navDecision = plannerTests.deriveTimeoutRecoveryWorkflowDecision(
		{
			task: '打开 http://example.test/app，进入订单中心并测试搜索项。',
			history: [],
		},
		{
			title: '首页',
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '订单中心', valueState: 'unknown' },
			],
			elements: [],
		}
	)
	if (
		navDecision?.action?.name !== 'done' ||
		navDecision.action.input.success !== false ||
		!String(navDecision.action.input.text || '').includes('订单中心')
	) {
		throw new Error(`timeout recovery should stop instead of auto-clicking business navigation, got ${JSON.stringify(navDecision)}`)
	}
	const timeoutActiveSearchDecision = plannerTests.deriveTimeoutRecoveryWorkflowDecision(
		{
			task: '找到用户管理部分，找出搜索区域，测试每一个搜索项功能是否正常',
			history: [
				{ action: 'click_element_by_index', input: { workflow: 'search-fields', workflow_step: 'expand_search_panel', target_label: '展开搜索' }, success: true },
			],
			workflowState: { search: { phase: 'select_field' } },
		},
		{
			title: 'CRM',
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,用户姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 25, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', editable: true },
					],
				},
			],
			actions: [
				{ index: 18, region: 'sidebar', role: 'menuitem', label: '用户管理', valueState: 'unknown' },
				{ index: 30, intent: 'search', label: '搜索', region: 'content' },
			],
			url: 'http://example.test/app#/wel/index',
		}
	)
	if (
		timeoutActiveSearchDecision?.action?.name !== 'done' ||
		timeoutActiveSearchDecision.action.input.success !== false ||
		!String(timeoutActiveSearchDecision.action.input.text || '').includes('用户管理')
	) {
		throw new Error(`timeout recovery should stop unresolved task navigation instead of continuing active search workflow, got ${JSON.stringify(timeoutActiveSearchDecision)}`)
	}
}

function assertSessionLoopGuardRecordsWorkflowOutcome() {
	const engine = read('naturalclick-extension/background/session-engine.js')
	const loopGuardFn = extractFunctionSource(engine, 'recordLoopGuardReplan')
	if (
		!/recordWorkflowOutcome\s*\(\s*session\s*,\s*decision\s*,/.test(loopGuardFn) ||
		!/success:\s*false/.test(loopGuardFn) ||
		!/stage:\s*'loop_guard'/.test(loopGuardFn)
	) {
		throw new Error('loop guard replan should report blocked workflow actions back to the workflow registry')
	}
}

function assertStructuredActionOutcomeContract() {
	const sandbox = loadBackgroundModule('naturalclick-extension/shared/action-contract.js', {})
	const contract = sandbox.NC_ACTION_CONTRACT
	if (!contract?.OUTCOME_KIND || !contract?.createOutcome || !contract?.getOutcome) {
		throw new Error('shared action contract did not expose the expected API')
	}
	const visible = contract.createOutcome(contract.OUTCOME_KIND.OPTIONS_VISIBLE, { visibleOptions: ['A'] })
	if (!visible.progress || !contract.isProgressOutcome(visible.kind)) {
		throw new Error(`options_visible should be treated as verified progress: ${JSON.stringify(visible)}`)
	}
	const focused = contract.createOutcome(contract.OUTCOME_KIND.FOCUSED)
	if (focused.progress || contract.isProgressOutcome(focused.kind)) {
		throw new Error('focused should not be treated as task progress')
	}
	const wrapped = contract.createActionResult({
		success: true,
		message: 'ok',
		kind: contract.OUTCOME_KIND.VALUE_CHANGED,
	})
	if (contract.getOutcome(wrapped)?.kind !== contract.OUTCOME_KIND.VALUE_CHANGED) {
		throw new Error('action contract should preserve structured outcomes in action results')
	}
	const summary = contract.summarizeOutcome({
		kind: contract.OUTCOME_KIND.FAILED,
		progress: false,
		requestedText: 'WEB',
		visibleOptions: ['企业端', '后台端'],
	})
	if (!summary.includes('动作结果: failed') || !summary.includes('requested="WEB"') || !summary.includes('candidates="企业端|后台端"')) {
		throw new Error(`action contract should format structured outcome summaries, got ${summary}`)
	}
}

function assertObserverUsesCentralSemantics() {
	const observer = read('naturalclick-extension/content/observer.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	const fastPath = read('naturalclick-extension/background/planner-fastpath.js')
	const workflows = read('naturalclick-extension/background/workflows.js')
	if (!observer.includes('NC_CONTENT_SEMANTICS')) {
		throw new Error('observer should use the shared content semantics module')
	}
	const resolveFn = extractFunctionSource(observer, 'resolveEditableTarget')
	if (!/semantics\?\.resolveEditableTarget/.test(resolveFn)) {
		throw new Error('resolveEditableTarget should delegate to shared content semantics first')
	}
	const snapshotFn = extractFunctionSource(observer, 'buildElementSnapshot')
	const controlKindFn = extractFunctionSource(observer, 'getObservedControlKind')
	const rankLabelFn = extractFunctionSource(observer, 'rankLabelCandidates')
	const genericLabelFn = extractFunctionSource(observer, 'isGenericFieldLabelText')
	const fieldLineFn = extractFunctionSource(plannerContext, 'formatFieldLine')
	const actionLineFn = extractFunctionSource(plannerContext, 'formatActionLine')
	const optionLineFn = extractFunctionSource(plannerContext, 'formatOptionLine')
	if (!/snapshot\.controlKind\s*=\s*getObservedControlKind\(snapshot\)/.test(snapshotFn)) {
		throw new Error('observer snapshots should expose canonical observed control kind')
	}
	if (!/NC_CONTROL_SEMANTICS\?\.describeObservedControl/.test(controlKindFn)) {
		throw new Error('observer controlKind should come from shared observed-control semantics')
	}
	if (!fieldLineFn.includes('controlKind') || !actionLineFn.includes('controlKind') || !optionLineFn.includes('controlKind')) {
		throw new Error('planner context should surface observer controlKind for fields, actions, and options')
	}
	if (!rankLabelFn.includes('isGenericFieldLabelText') || !rankLabelFn.includes('confidence - 0.5')) {
		throw new Error('observer should demote generic control prompts when real form labels are available')
	}
	if (!genericLabelFn.includes('展开选项') || !genericLabelFn.includes('请选择')) {
		throw new Error('observer generic label detection should recognize common select placeholder text')
	}
	const dropdownFn = extractFunctionSource(observer, 'isDropdownLikeControl')
	if (!/NC_CONTENT_SEMANTICS\?\.isDropdownLikeControl/.test(dropdownFn)) {
		throw new Error('dropdown detection should delegate to shared content semantics')
	}
	if (!observer.includes('classState=') || !observer.includes('getClassStateHint')) {
		throw new Error('observer should expose active/selected class state hints')
	}
	if (!observer.includes('navigationTarget') || !observer.includes('getNavigationTargetHint')) {
		throw new Error('observer should expose navigation target hints for SPA menu/tab items')
	}
	if (!plannerContext.includes('stateHints') || !workflows.includes('stateHints')) {
		throw new Error('planner context and workflow hints should consume observer state hints')
	}
	if (!plannerContext.includes('navigationTarget') || fastPath.includes('navigationTarget')) {
		throw new Error('navigation target hints should remain visible to the model context, not drive planner fast-path page clicks')
	}
}

function assertObserverOptionSnapshotsExposePopupOwner() {
	const observer = read('naturalclick-extension/content/observer.js')
	const snapshotFn = extractFunctionSource(observer, 'buildElementSnapshot')
	const optionLineFn = extractFunctionSource(observer, 'formatOptionLine')
	const popupHintsFn = extractFunctionSource(observer, 'getPopupContainerHints')
	const relationHintsFn = extractFunctionSource(observer, 'getRelationHints')
	const relationLimitFn = extractFunctionSource(observer, 'getRelationHintLimit')
	if (!snapshotFn.includes('popupHints')) {
		throw new Error('observer snapshots should preserve popup owner hints for option attribution')
	}
	if (!optionLineFn.includes('popupHints')) {
		throw new Error('observer option/popup lines should expose popup owner hints')
	}
	if (!popupHintsFn.includes('popupId=') || !popupHintsFn.includes('role="listbox"')) {
		throw new Error('popup owner hints should include popup id and listbox-like popup containers')
	}
	if (!relationHintsFn.includes('getRelationHintLimit(name)') || !relationLimitFn.includes('aria-controls') || !relationLimitFn.includes('96')) {
		throw new Error('observer should preserve long popup owner idrefs in relation hints')
	}
	if (!popupHintsFn.includes('shortText(popup.id, 96)')) {
		throw new Error('popup owner hints should preserve long generated popup ids')
	}
}

function assertActionStateExtractedFromActions() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionState = read('naturalclick-extension/content/action-state.js')
	if (!actionState.includes('NC_CONTENT_ACTION_STATE') || !actionState.includes('createActionState')) {
		throw new Error('content/action-state.js should expose NC_CONTENT_ACTION_STATE.createActionState')
	}
	if (!actions.includes('NC_CONTENT_ACTION_STATE')) {
		throw new Error('content actions should consume the extracted action-state module')
	}
	for (const fn of [
		'getElementInteractionState',
		'appendStateChange',
		'inferInteractionOutcome',
		'describeStateChanges',
		'readSelectionControlValue',
	]) {
		if (!actionState.includes(`function ${fn}`)) {
			throw new Error(`action-state module is missing ${fn}`)
		}
		const actionsFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (actionsFnDefinition.test(actions)) {
			throw new Error(`actions should not define ${fn}; keep action state policy in content/action-state.js`)
		}
	}
}

function assertActionInputExtractedFromActions() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionInput = read('naturalclick-extension/content/action-input.js')
	const manifest = read('naturalclick-extension/manifest.json')
	const background = read('naturalclick-extension/background.js')
	const content = read('naturalclick-extension/content.js')
	if (!actionInput.includes('NC_CONTENT_ACTION_INPUT') || !actionInput.includes('createInputActions')) {
		throw new Error('content/action-input.js should expose NC_CONTENT_ACTION_INPUT.createInputActions')
	}
	if (!actions.includes('NC_CONTENT_ACTION_INPUT')) {
		throw new Error('content actions should consume the extracted action-input module')
	}
	if (!manifest.includes('content/action-input.js') || !background.includes('content/action-input.js')) {
		throw new Error('action-input module should be loaded before content/actions.js')
	}
	if (!content.includes('actionInput')) {
		throw new Error('content bridge should wait for the action-input module before creating actions')
	}
	for (const fn of [
		'inputByIndex',
		'inputByPoint',
		'keypressAction',
		'inputToEditableTarget',
		'typeTextRealisticInFormControl',
		'typeTextRealisticInContentEditable',
	]) {
		if (!actionInput.includes(`function ${fn}`)) {
			throw new Error(`action-input module is missing ${fn}`)
		}
		const actionsFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (actionsFnDefinition.test(actions)) {
			throw new Error(`actions should not define ${fn}; keep input behavior in content/action-input.js`)
		}
	}
}

function assertActionScrollExtractedFromActions() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionScroll = read('naturalclick-extension/content/action-scroll.js')
	const manifest = read('naturalclick-extension/manifest.json')
	const background = read('naturalclick-extension/background.js')
	const content = read('naturalclick-extension/content.js')
	if (!actionScroll.includes('NC_CONTENT_ACTION_SCROLL') || !actionScroll.includes('createScrollActions')) {
		throw new Error('content/action-scroll.js should expose NC_CONTENT_ACTION_SCROLL.createScrollActions')
	}
	if (!actions.includes('NC_CONTENT_ACTION_SCROLL')) {
		throw new Error('content actions should consume the extracted action-scroll module')
	}
	if (!manifest.includes('content/action-scroll.js') || !background.includes('content/action-scroll.js')) {
		throw new Error('action-scroll module should be loaded before content/actions.js')
	}
	if (!content.includes('actionScroll')) {
		throw new Error('content bridge should wait for the action-scroll module before creating actions')
	}
	for (const fn of ['scrollAction', 'scrollHorizontalAction', 'performScroll', 'getScrollPosition']) {
		if (!actionScroll.includes(`function ${fn}`)) {
			throw new Error(`action-scroll module is missing ${fn}`)
		}
		const actionsFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (actionsFnDefinition.test(actions)) {
			throw new Error(`actions should not define ${fn}; keep scroll behavior in content/action-scroll.js`)
		}
	}
}

function assertActionOptionsExtractedFromActions() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionOptions = read('naturalclick-extension/content/action-options.js')
	const manifest = read('naturalclick-extension/manifest.json')
	const background = read('naturalclick-extension/background.js')
	const content = read('naturalclick-extension/content.js')
	if (!actionOptions.includes('NC_CONTENT_ACTION_OPTIONS') || !actionOptions.includes('createOptionHelpers')) {
		throw new Error('content/action-options.js should expose NC_CONTENT_ACTION_OPTIONS.createOptionHelpers')
	}
	if (!actions.includes('NC_CONTENT_ACTION_OPTIONS')) {
		throw new Error('content actions should consume the extracted action-options module')
	}
	if (!manifest.includes('content/action-options.js') || !background.includes('content/action-options.js')) {
		throw new Error('action-options module should be loaded before content/actions.js')
	}
	if (!content.includes('actionOptions')) {
		throw new Error('content bridge should wait for the action-options module before creating actions')
	}
	for (const fn of [
		'selectOptionByText',
		'nativeOptionMatches',
		'resolveNativeSelect',
		'resolveSelectableClickTarget',
		'findVisibleOptionByText',
		'isOptionAssociatedWithField',
		'waitForVisibleOption',
		'resolveDropdownTrigger',
		'isCascaderParentOption',
	]) {
		if (!actionOptions.includes(`function ${fn}`)) {
			throw new Error(`action-options module is missing ${fn}`)
		}
		const actionsFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (actionsFnDefinition.test(actions)) {
			throw new Error(`actions should not define ${fn}; keep option discovery in content/action-options.js`)
		}
	}
}

function assertActionCascaderExtractedFromActions() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionCascader = read('naturalclick-extension/content/action-cascader.js')
	const manifest = read('naturalclick-extension/manifest.json')
	const background = read('naturalclick-extension/background.js')
	const content = read('naturalclick-extension/content.js')
	if (!actionCascader.includes('NC_CONTENT_ACTION_CASCADER') || !actionCascader.includes('createCascaderHelpers')) {
		throw new Error('content/action-cascader.js should expose NC_CONTENT_ACTION_CASCADER.createCascaderHelpers')
	}
	if (!actions.includes('NC_CONTENT_ACTION_CASCADER')) {
		throw new Error('content actions should consume the extracted action-cascader module')
	}
	if (!manifest.includes('content/action-cascader.js') || !background.includes('content/action-cascader.js')) {
		throw new Error('action-cascader module should be loaded before content/actions.js')
	}
	if (!content.includes('actionCascader')) {
		throw new Error('content bridge should wait for the action-cascader module before creating actions')
	}
	for (const fn of [
		'findCascaderOptionByScrolling',
		'waitForCascaderMenuLevel',
		'bringCascaderOptionIntoView',
		'summarizeCascaderLevel',
		'isDomVisibleInActivePopup',
		'findVerticalScrollable',
	]) {
		if (!actionCascader.includes(`function ${fn}`)) {
			throw new Error(`action-cascader module is missing ${fn}`)
		}
		const actionsFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (actionsFnDefinition.test(actions)) {
			throw new Error(`actions should not define ${fn}; keep cascader behavior in content/action-cascader.js`)
		}
	}
}

function assertActionSelectExtractedFromActions() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const manifest = read('naturalclick-extension/manifest.json')
	const background = read('naturalclick-extension/background.js')
	const content = read('naturalclick-extension/content.js')
	if (!actionSelect.includes('NC_CONTENT_ACTION_SELECT') || !actionSelect.includes('createSelectActions')) {
		throw new Error('content/action-select.js should expose NC_CONTENT_ACTION_SELECT.createSelectActions')
	}
	if (!actions.includes('NC_CONTENT_ACTION_SELECT')) {
		throw new Error('content actions should consume the extracted action-select module')
	}
	if (!manifest.includes('content/action-select.js') || !background.includes('content/action-select.js')) {
		throw new Error('action-select module should be loaded before content/actions.js')
	}
	if (!content.includes('actionSelect')) {
		throw new Error('content bridge should wait for the action-select module before creating actions')
	}
	for (const fn of [
		'selectDropdownOptionAction',
		'selectCheckboxOptionAction',
		'selectCascaderPathAction',
		'dismissSelectionPopup',
		'waitForDropdownSelectionEffect',
		'buildDropdownFailureResult',
	]) {
		if (!actionSelect.includes(`function ${fn}`)) {
			throw new Error(`action-select module is missing ${fn}`)
		}
		const actionsFnDefinition = new RegExp(`function\\s+${fn}\\s*\\(`)
		if (actionsFnDefinition.test(actions)) {
			throw new Error(`actions should not define ${fn}; keep selection behavior in content/action-select.js`)
		}
	}
}

function assertActionsReturnStructuredOutcomes() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionInput = read('naturalclick-extension/content/action-input.js')
	const actionScroll = read('naturalclick-extension/content/action-scroll.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const actionState = read('naturalclick-extension/content/action-state.js')
	if (!actions.includes('NC_CONTENT_ACTION_STATE') || !actions.includes('OUTCOME_KIND')) {
		throw new Error('content actions should use the extracted action-state outcome helpers')
	}
	const inputFn = extractFunctionSource(actionInput, 'inputToEditableTarget')
	const dropdownFn = extractFunctionSource(actionSelect, 'selectDropdownOptionAction')
	const scrollFn = extractFunctionSource(actionScroll, 'performScroll')
	if (!inputFn.includes('OUTCOME_KIND.VALUE_CHANGED')) {
		throw new Error('input_text results should report value_changed outcome')
	}
	if (!dropdownFn.includes('OUTCOME_KIND.OPTIONS_VISIBLE') || !dropdownFn.includes('visibleOptions')) {
		throw new Error('dropdown open probes should report options_visible outcome with candidates')
	}
	if (!actionSelect.includes('waitForDropdownSelectionEffect') || !actionSelect.includes('inferDropdownSelectionOutcome')) {
		throw new Error('custom dropdown selection should wait for real field/option state before reporting outcome')
	}
	if (!actionSelect.includes('waitForVisibleOptionLabels') || !/await\s+waitForVisibleOptionLabels\(field,\s*inputMode,\s*16\)/.test(dropdownFn)) {
		throw new Error('index-only dropdown open should wait briefly for delayed popup candidates before reporting none')
	}
	const interactionOutcomeFn = extractFunctionSource(actionState, 'inferInteractionOutcome')
	const stateChangeFn = extractFunctionSource(actionState, 'describeStateChanges')
	if (!/before\.text\s*!==\s*after\.text/.test(interactionOutcomeFn)) {
		throw new Error('interaction outcome should treat visible text changes as value_changed for custom select widgets')
	}
	if (!stateChangeFn.includes("'text'")) {
		throw new Error('state change summaries should include visible text changes')
	}
	if (/message:\s*appendStateChange\(`已选择下拉选项 "\$\{text\}"。`, before, after\),\s*meta:\s*\{\s*before,\s*after,\s*outcome:\s*createOutcome\(OUTCOME_KIND\.VALUE_CHANGED\)\s*\}/.test(dropdownFn)) {
		throw new Error('custom dropdown option clicks must not unconditionally report value_changed')
	}
	const cascaderFn = extractFunctionSource(actionSelect, 'selectCascaderPathAction')
	if (/createOutcome\(OUTCOME_KIND\.STATE_CHANGED\)/.test(cascaderFn)) {
		throw new Error('cascader path selection must not unconditionally report state_changed')
	}
	if (!/inferDropdownSelectionOutcome\(before,\s*after,\s*optionAfter\)/.test(cascaderFn)) {
		throw new Error('cascader path selection should infer progress from real field/option state')
	}
	if (!/dismissSelectionPopup\(field \|\| finalOption,\s*inputMode\)/.test(cascaderFn)) {
		throw new Error('cascader path selection should dismiss the floating panel after selecting the leaf option')
	}
	const dismissFn = extractFunctionSource(actionSelect, 'dismissSelectionPopup')
	if (!dismissFn.includes('Escape') || !dismissFn.includes('dispatchPointClick')) {
		throw new Error('cascader dropdown dismissal should use Escape plus a safe blank click fallback')
	}
	if (!actionSelect.includes('function openCascaderField') || !/openCascaderField\(field,\s*inputMode\)/.test(cascaderFn) || !/resolveDropdownTrigger\(field\)/.test(actionSelect)) {
		throw new Error('cascader path selection should explicitly open the field trigger before searching menu levels')
	}
	const checkboxFn = extractFunctionSource(actionSelect, 'selectCheckboxOptionAction')
	if (/inferInteractionOutcome\(before,\s*after,\s*OUTCOME_KIND\.STATE_CHANGED\)/.test(checkboxFn)) {
		throw new Error('checkbox option selection must not unconditionally report state_changed')
	}
	if (!/inferInteractionOutcome\(before,\s*after,\s*OUTCOME_KIND\.NONE\)/.test(checkboxFn)) {
		throw new Error('checkbox option selection should report none when no state changes are observed')
	}
	if (!scrollFn.includes('OUTCOME_KIND.SCROLLED')) {
		throw new Error('scroll results should report scrolled outcome')
	}
}

function assertSelectionFailuresUseStructuredOutcomes() {
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const validation = read('naturalclick-extension/background/planner-validation.js')
	const checkboxFn = extractFunctionSource(actionSelect, 'selectCheckboxOptionAction')
	const cascaderFn = extractFunctionSource(actionSelect, 'selectCascaderPathAction')
	const failureHelper = extractFunctionSource(actionSelect, 'buildSelectionFailureResult')
	const validationFn = extractFunctionSource(validation, 'validateActionAgainstHistory')
	const selectionNameFn = extractFunctionSource(validation, 'isSelectionActionName')
	if (!failureHelper.includes('OUTCOME_KIND.FAILED') || !failureHelper.includes('requestedText') || !failureHelper.includes('visibleOptions')) {
		throw new Error('selection failures should share a structured failed outcome with requested text and visible candidates')
	}
	if (!checkboxFn.includes('buildSelectionFailureResult') || !checkboxFn.includes('field_scoped_selectable_popup')) {
		throw new Error('select_checkbox_option failures should use the shared structured selection failure result')
	}
	if (!cascaderFn.includes('buildSelectionFailureResult') || !cascaderFn.includes('cascader_level_')) {
		throw new Error('select_cascader_path failures should use the shared structured selection failure result')
	}
	for (const actionName of ['select_checkbox_option', 'select_cascader_path']) {
		if (!selectionNameFn.includes(actionName)) {
			throw new Error(`planner history validation should treat ${actionName} as a selection action`)
		}
	}
	if (!validationFn.includes('getActionSelectionText') || !validationFn.includes('selectionTextMatchesRequested')) {
		throw new Error('planner history validation should compare structured selection failures against future selection inputs')
	}
}

async function assertVerifierUsesStructuredOutcome() {
	const contract = {
		OUTCOME_KIND: {
			FAILED: 'failed',
			NO_EFFECT: 'no_effect',
			FOCUSED: 'focused',
			NONE: 'none',
		},
		getOutcome: (execution) => execution?.meta?.outcome || null,
		isProgressOutcome: (kind) => ['value_changed', 'state_changed', 'options_visible', 'scrolled'].includes(kind),
	}
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_ACTION_CONTRACT: contract,
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					url: 'http://example.test/app',
					content: 'same-dom',
					activeElement: 'body',
				},
			}),
		},
	})
	const accepted = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'select_dropdown_option', input: { index: 3, text: 'A' } },
		{ url: 'http://example.test/app', content: 'same-dom', activeElement: 'body' },
		{
			success: true,
			message: 'selected',
			meta: { outcome: { kind: 'value_changed', progress: true } },
		}
	)
	if (!accepted.ok || !String(accepted.reason || '').includes('动作结果')) {
		throw new Error(`structured progress outcome should pass verification, got ${JSON.stringify(accepted)}`)
	}
	const rejected = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'click_element_by_index', input: { index: 3 } },
		{ url: 'http://example.test/app', content: 'same-dom', activeElement: 'body' },
		{
			success: true,
			message: 'clicked',
			meta: { outcome: { kind: 'no_effect', progress: false, reason: 'no visible effect' } },
		}
	)
	if (rejected.ok || !String(rejected.reason || '').includes('no visible effect')) {
		throw new Error(`structured no_effect outcome should fail verification, got ${JSON.stringify(rejected)}`)
	}
}

function assertDropdownOptionSelectionIsScoped() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionOptions = read('naturalclick-extension/content/action-options.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const observer = read('naturalclick-extension/content/observer.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	if (!actionOptions.includes('isOptionAssociatedWithField')) {
		throw new Error('dropdown option selection is not scoped to the target field')
	}
	if (!observer.includes('getNativeOptionLabels') || !plannerContext.includes('<native_options>')) {
		throw new Error('native select options are not exposed to planning context')
	}
	if (!actionSelect.includes('已展开下拉框索引') || !actionSelect.includes('listNativeSelectOptionLabels')) {
		throw new Error('select_dropdown_option cannot open a dropdown with index-only input')
	}
	if (!/waitForVisibleOption\(text,[\s\S]*field,/.test(actionSelect)) {
		throw new Error('select_dropdown_option does not pass the target field into option lookup')
	}
	if (!/options\.field && !isOptionAssociatedWithField/.test(actionOptions)) {
		throw new Error('visible option candidates are not filtered by field association')
	}
	if (!actionOptions.includes('isOptionTargetGeometryRelated') || actionOptions.includes('window.innerHeight * 0.55')) {
		throw new Error('content option association should use shared geometry semantics instead of a separate viewport heuristic')
	}
	const fn = extractFunctionSource(actionSelect, 'selectDropdownOptionAction')
	if (!/if \(!option && !Number\.isFinite\(index\)\)/.test(fn)) {
		throw new Error('select_dropdown_option should only use global option lookup when no target index is provided')
	}
}

function assertDropdownFailuresReturnRecoverableContext() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const dropdownFn = extractFunctionSource(actionSelect, 'selectDropdownOptionAction')
	const failureFn = extractFunctionSource(actionSelect, 'buildDropdownFailureResult')
	if (!dropdownFn.includes('buildDropdownFailureResult')) {
		throw new Error('select_dropdown_option failures should use a shared recoverable failure result')
	}
	for (const expected of ['visibleOptions', 'requestedText', 'source']) {
		if (!failureFn.includes(expected)) {
			throw new Error(`dropdown failure result should include ${expected}`)
		}
	}
	if (!actionSelect.includes('createOutcome(OUTCOME_KIND.FAILED')) {
		throw new Error('dropdown failure result should use failed structured outcome')
	}
	for (const expected of ['当前字段候选', '下一步建议', 'request_options_for']) {
		if (!actionSelect.includes(expected)) {
			throw new Error(`dropdown failure message should guide replanning with ${expected}`)
		}
	}
	if (!/listNativeSelectOptionLabels\(nativeSelect,\s*20\)/.test(dropdownFn)) {
		throw new Error('native select mismatch should report available native options')
	}
}

function assertDropdownOptionAssociationUsesExplicitPopupOwner() {
	const actionOptions = read('naturalclick-extension/content/action-options.js')
	const selectorFn = extractFunctionSource(actionOptions, 'getOptionCandidateSelector')
	const associationFn = extractFunctionSource(actionOptions, 'isOptionAssociatedWithField')
	const explicitFn = extractFunctionSource(actionOptions, 'getExplicitOptionFieldAssociation')
	const controlledIdsFn = extractFunctionSource(actionOptions, 'getControlledPopupIds')
	const insideFn = extractFunctionSource(actionOptions, 'isOptionInsideControlledPopup')
	const popupFn = extractFunctionSource(actionOptions, 'getOptionPopupContainer')
	const popupSelectorFn = extractFunctionSource(actionOptions, 'getOptionPopupSelector')
	const labelledFn = extractFunctionSource(actionOptions, 'isOptionInsidePopupLabelledByField')
	const fieldIdsFn = extractFunctionSource(actionOptions, 'getFieldAssociationIds')
	if (!actionOptions.includes('isVisiblePopupOptionCandidate(node)')) {
		throw new Error('visible option discovery should allow visible popup candidates even when elementFromPoint hits an inner overlay')
	}
	if (!selectorFn.includes('.el-checkbox__label') || !selectorFn.includes('.el-select-dropdown__item *')) {
		throw new Error('option candidate selector should include Element checkbox labels and nested select option text')
	}
	if (!associationFn.includes('getExplicitOptionFieldAssociation(option, field)')) {
		throw new Error('dropdown option association should check explicit field-popup ownership before geometry')
	}
	if (!/explicitAssociation\s*!==\s*null/.test(associationFn)) {
		throw new Error('explicit popup ownership should be authoritative when present')
	}
	if (!controlledIdsFn.includes('aria-controls') || !controlledIdsFn.includes('aria-owns')) {
		throw new Error('dropdown association should read aria-controls/aria-owns from field and descendants')
	}
	if (!insideFn.includes('document.getElementById') || !insideFn.includes('controlled.contains(option)')) {
		throw new Error('dropdown association should verify options are inside the controlled popup/listbox')
	}
	if (!explicitFn.includes('getControlledPopupIds(field)') || !explicitFn.includes('isOptionInsideControlledPopup')) {
		throw new Error('explicit dropdown ownership should route through the controlled popup matcher')
	}
	if (!explicitFn.includes('isOptionInsidePopupLabelledByField(option, field)')) {
		throw new Error('explicit dropdown ownership should also support popup aria-labelledby pointing back to the field')
	}
	if (!popupSelectorFn.includes('[role="listbox"]') || !popupFn.includes('getOptionPopupSelector()') || !associationFn.includes('getOptionPopupContainer(option)')) {
		throw new Error('dropdown association should use one shared popup container resolver before geometry fallback')
	}
	if (!popupSelectorFn.includes('.el-select__popper') || !popupSelectorFn.includes('[class*="select"][class*="popper"]')) {
		throw new Error('popup resolver should cover Element select popper variants')
	}
	if (!labelledFn.includes('aria-labelledby') || !labelledFn.includes('getFieldAssociationIds(field)')) {
		throw new Error('dropdown association should match popups labelled by the field or nested field controls')
	}
	if (!fieldIdsFn.includes("querySelectorAll?.('[id]')") || !fieldIdsFn.includes('label[for=') || !fieldIdsFn.includes('aria-labelledby')) {
		throw new Error('field association ids should include the field, nested controls, labelledby ids, and external label ids')
	}
}

function assertCheckboxOptionSelectionIsScoped() {
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const match = actionSelect.match(/async function selectCheckboxOptionAction[\s\S]*?async function selectCascaderPathAction/)
	const fn = match?.[0] || ''
	if (!fn) throw new Error('selectCheckboxOptionAction source not found')
	if (!/let field = null/.test(fn) || !/field = observer\.getElementByIndex\(index\)/.test(fn)) {
		throw new Error('select_checkbox_option should keep the target field for scoped option lookup')
	}
	if (!/const lookupScope = field \? \{ field \} : \{\}/.test(fn)) {
		throw new Error('select_checkbox_option should build a field-scoped lookup scope')
	}
	if (!/waitForVisibleOption\(text, \{ \.\.\.lookupScope, selectableOnly: true/.test(fn)) {
		throw new Error('select_checkbox_option should pass the target field into selectable option lookup')
	}
	if (!fn.includes('global_selectable_popup_fallback') || !/waitForVisibleOption\(text, \{ selectableOnly: true/.test(fn)) {
		throw new Error('select_checkbox_option should fall back to the visible selectable popup when field association is too strict')
	}
	if (!/listVisibleOptionLabels\(12, \{ \.\.\.lookupScope, selectableOnly: true \}\)/.test(fn)) {
		throw new Error('select_checkbox_option failure message should list field-scoped candidates')
	}
}

function assertIndexedSelectionActionsFailOnMissingIndex() {
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const missingIndexPattern = /if \(!field\) return \{ success: false, message: `索引 \$\{index\} 不存在。` \}/g
	const dropdownFn = extractFunctionSource(actionSelect, 'selectDropdownOptionAction')
	const chooseFn = extractFunctionSource(actionSelect, 'chooseDropdownOptionAction')
	const checkboxFn = extractFunctionSource(actionSelect, 'selectCheckboxOptionAction')
	const cascaderFn = extractFunctionSource(actionSelect, 'selectCascaderPathAction')
	const dropdownChecks = dropdownFn.match(missingIndexPattern) || []
	if (dropdownChecks.length < 2) {
		throw new Error('select_dropdown_option should fail when an explicit index is missing, including text+index selection')
	}
	if (!/!Number\.isFinite\(index\)/.test(chooseFn) || !chooseFn.includes('缺少目标字段 index')) {
		throw new Error('choose_dropdown_option should require a field index before selecting by text')
	}
	missingIndexPattern.lastIndex = 0
	for (const [name, fn] of [
		['select_checkbox_option', checkboxFn],
		['select_cascader_path', cascaderFn],
	]) {
		if (!missingIndexPattern.test(fn)) {
			throw new Error(`${name} should fail when an explicit index is missing instead of falling back globally`)
		}
		missingIndexPattern.lastIndex = 0
	}
}

function assertScrollActionsReportNoMovement() {
	const actionScroll = read('naturalclick-extension/content/action-scroll.js')
	if (!actionScroll.includes('getScrollPosition')) {
		throw new Error('scroll actions do not measure actual scroll position')
	}
	if (!actionScroll.includes('页面未发生纵向滚动') || !actionScroll.includes('页面未发生横向滚动')) {
		throw new Error('scroll actions do not report no-movement failures')
	}
	if (!actionScroll.includes('实际移动')) {
		throw new Error('scroll actions do not report actual movement distance')
	}
}

function assertScrollActionsRespectExplicitIndex() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionScroll = read('naturalclick-extension/content/action-scroll.js')
	const executeFn = extractFunctionSource(actions, 'executeAction')
	const scrollFn = extractFunctionSource(actionScroll, 'scrollAction')
	const horizontalFn = extractFunctionSource(actionScroll, 'scrollHorizontalAction')
	if (!actionScroll.includes('function hasExplicitInputValue')) {
		throw new Error('scroll actions should distinguish omitted index from explicit invalid index')
	}
	if (!/scrollActions\.scrollAction\(input\)/.test(executeFn)) {
		throw new Error('vertical scroll should delegate to the extracted scroll module')
	}
	if (!/scrollActions\.scrollHorizontalAction\(input\)/.test(executeFn)) {
		throw new Error('horizontal scroll should delegate to the extracted scroll module')
	}
	for (const [name, fn, expected] of [
		['scroll', scrollFn, '可纵向滚动容器'],
		['scroll_horizontally', horizontalFn, '可横向滚动容器'],
	]) {
		if (!/if \(hasIndex\)/.test(fn)) {
			throw new Error(`${name} should treat an explicit index as a hard target`)
		}
		if (!/if \(!target\) return \{ success: false, message: `索引 \$\{index\} 不存在。` \}/.test(fn)) {
			throw new Error(`${name} should fail when an explicit index target is missing`)
		}
		if (!fn.includes(expected)) {
			throw new Error(`${name} should fail when the explicit target is not scrollable`)
		}
		if (/if \(index !== null\)/.test(fn)) {
			throw new Error(`${name} should not use index presence as a loose page-scroll fallback`)
		}
	}
}

function assertExpandedStateIgnoresFocusOnlyClasses() {
	const observer = read('naturalclick-extension/content/observer.js')
	const actionState = read('naturalclick-extension/content/action-state.js')
	const observerExpandedFn = extractFunctionSource(observer, 'getExpandedState')
	const observerExpandedClassFn = extractFunctionSource(observer, 'hasExpandedClassSignal')
	const actionStateFn = extractFunctionSource(actionState, 'getElementInteractionState')
	const actionExpandedClassFn = extractFunctionSource(actionState, 'hasExpandedClassSignal')
	for (const fn of [observerExpandedFn, observerExpandedClassFn, actionStateFn, actionExpandedClassFn]) {
		if (/is-focus/.test(fn)) {
			throw new Error('expanded-state detection must not treat focus-only classes as expanded')
		}
	}
	if (!/is-opened/.test(observerExpandedClassFn) || !/is-opened/.test(actionExpandedClassFn)) {
		throw new Error('expanded-state detection should still recognize real opened classes')
	}
}

function assertNestedSelectionControlStateChangesAreVerified() {
	const actionState = read('naturalclick-extension/content/action-state.js')
	const verifier = read('naturalclick-extension/background/verifier.js')
	const stateFn = extractFunctionSource(actionState, 'getElementInteractionState')
	const describeFn = extractFunctionSource(actionState, 'describeStateChanges')
	const nestedValueFn = extractFunctionSource(actionState, 'findNestedValueControl')
	const visibleValueFn = extractFunctionSource(actionState, 'isVisibleOrHiddenFormValue')
	const readValueFn = extractFunctionSource(actionState, 'readSelectionControlValue')
	const verifierChangeFn = extractFunctionSource(verifier, 'hasExecutionStateChange')
	const verifierDropdownCommitFn = extractFunctionSource(verifier, 'isDropdownSelectionCommitAction')
	if (!/childValue/.test(stateFn) || !/findNestedValueControl\(element\)/.test(stateFn)) {
		throw new Error('action state snapshots should include nested selection control values')
	}
	if (!nestedValueFn.includes('select:not([disabled])') || !visibleValueFn.includes('HTMLSelectElement')) {
		throw new Error('nested value control detection should include native select controls')
	}
	if (!/HTMLInputElement/.test(readValueFn) || !/HTMLTextAreaElement/.test(readValueFn) || !/HTMLSelectElement/.test(readValueFn)) {
		throw new Error('nested value reader should cover input, textarea, and select controls')
	}
	if (!/childValue/.test(describeFn)) {
		throw new Error('state change messages should report nested childValue changes')
	}
	if (!/childValue/.test(verifierChangeFn) || !/text/.test(verifierChangeFn)) {
		throw new Error('post-action verifier should accept nested childValue and visible text changes as progress')
	}
	if (!/select_dropdown_option/.test(verifierDropdownCommitFn) || !/choose_dropdown_option/.test(verifierDropdownCommitFn) || !/input\.text \|\| input\.label/.test(verifierDropdownCommitFn)) {
		throw new Error('post-action verifier should identify dropdown selection commits separately from open probes')
	}
}

async function assertVerifierRejectsDropdownSelectionWithoutValueChange() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					url: 'http://example.test/app',
					content: 'changed-only-because-popup-closed',
					forms: [
						{
							fields: [
								{ index: 4, label: '用户平台', valueState: 'empty', value: 'empty' },
							],
						},
					],
				},
			}),
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'choose_dropdown_option', input: { index: 4, text: '企业端' } },
		{
			url: 'http://example.test/app',
			content: 'popup-open',
			forms: [
				{
					fields: [
						{ index: 4, label: '用户平台', valueState: 'empty', value: 'empty' },
					],
				},
			],
		},
		{
			success: true,
			message: '已选择下拉选项 "企业端"。',
			meta: {
				before: { value: '', text: '请选择', checked: null, selected: null, childChecked: null, childSelected: null, childValue: '', expanded: true },
				after: { value: '', text: '请选择', checked: null, selected: null, childChecked: null, childSelected: null, childValue: '', expanded: true },
				outcome: { kind: 'none', progress: false },
			},
		}
	)
	if (result.ok || !String(result.reason || '').includes('下拉选择后未观察到字段值')) {
		throw new Error(`dropdown selection without value/state change should fail despite DOM changes, got ${JSON.stringify(result)}`)
	}
}

async function assertVerifierRetriesDropdownSelectionUntilFieldValueChanges() {
	let observations = 0
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		setTimeout: (fn) => {
			fn()
			return 0
		},
		clearTimeout: () => {},
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => {
				observations += 1
				const selected = observations >= 2
				return {
					ok: true,
					data: {
						url: 'http://example.test/app',
						content: selected ? 'field-selected' : 'popup-closed',
						forms: [
							{
								fields: [
									{
										index: 4,
										label: '用户平台',
										valueState: selected ? 'selected:企业端' : 'empty',
										value: selected ? '企业端' : 'empty',
									},
								],
							},
						],
					},
				}
			},
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'select_dropdown_option', input: { index: 4, text: '企业端' } },
		{
			url: 'http://example.test/app',
			content: 'popup-open',
			forms: [
				{
					fields: [
						{ index: 4, label: '用户平台', valueState: 'empty', value: 'empty' },
					],
				},
			],
		},
		{
			success: true,
			message: '已选择下拉选项 "企业端"。',
			meta: {
				before: { value: '', text: '请选择', checked: null, selected: null, childChecked: null, childSelected: null, childValue: '', expanded: true },
				after: { value: '', text: '请选择', checked: null, selected: null, childChecked: null, childSelected: null, childValue: '', expanded: true },
				outcome: { kind: 'none', progress: false },
			},
		}
	)
	if (!result.ok || !String(result.reason || '').includes('字段值已变化')) {
		throw new Error(`dropdown selection should wait until the indexed field value changes, got ${JSON.stringify(result)}`)
	}
	if (observations < 2) {
		throw new Error(`dropdown selection verification stopped before the value-changing observation, observations=${observations}`)
	}
}

async function assertVerifierRejectsNoopClick() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					url: 'http://example.test/app',
					content: 'same-dom',
					activeElement: 'body',
				},
			}),
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'click_element_by_index', input: { index: 3 } },
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			activeElement: 'body',
		},
		{
			success: true,
			message: '已点击索引 3。',
			meta: {
				before: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
				after: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
			},
		}
	)
	if (result.ok || !String(result.reason || '').includes('无可见变化')) {
		throw new Error(`noop click should fail verification, got ${JSON.stringify(result)}`)
	}
}

async function assertVerifierRejectsFocusOnlyClick() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					url: 'http://example.test/app',
					content: 'same-dom',
					activeElement: 'input.search',
				},
			}),
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'click_element_by_index', input: { index: 3 } },
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			activeElement: 'body',
		},
		{
			success: true,
			message: '已点击索引 3。 状态变化: activeElement:body->input.search',
			meta: {
				before: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
				after: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
			},
		}
	)
	if (result.ok || !String(result.reason || '').includes('无可见变化')) {
		throw new Error(`focus-only click should fail verification, got ${JSON.stringify(result)}`)
	}
}

async function assertVerifierRetriesTransitionObservation() {
	let observations = 0
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => {
				observations += 1
				return {
					ok: true,
					data: observations === 1
						? {
							url: 'http://example.test/app',
							content: 'same-dom',
							activeElement: 'body',
						}
						: {
							url: 'http://example.test/app#/target',
							content: 'changed-dom',
							activeElement: 'body',
						},
				}
			},
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'click_element_by_index', input: { index: 8, target_label: '目标模块' } },
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			activeElement: 'body',
		},
		{
			success: true,
			message: '已点击索引 8。',
			meta: {
				before: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
				after: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
				outcome: { kind: 'no_effect', progress: false, reason: 'initial click did not show immediate effect' },
			},
		}
	)
	if (!result.ok || !String(result.reason || '').includes('URL 已变化')) {
		throw new Error(`transition click should pass after retry observation, got ${JSON.stringify(result)}`)
	}
	if (observations < 2) {
		throw new Error(`transition verifier should retry post-action observation, got ${observations} observation(s)`)
	}
}

async function assertLocateByVisionDelegatesToExecutableCoordinateAction() {
	const delegated = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/executor.js', {
		NC_BG_CONSTANTS: {
			TYPES: { OBSERVE: 'NC_OBSERVE' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ url: 'http://example.test/app', title: 'Example' }),
		},
		NC_BG_VISION: {
			attemptVisionFallback: async (_session, decision) => {
				delegated.push(decision.action)
				return { success: true, message: `delegated ${decision.action.name}`, meta: { source: 'test' } }
			},
		},
		NC_BG_TOOLS: {
			hasTool: () => false,
			executeTool: async () => ({ success: false, message: 'unused' }),
		},
	})
	const session = { currentTabId: 1 }
	const inputResult = await sandbox.NC_BG_EXECUTOR.executeAction(session, {
		name: 'locate_by_vision',
		input: { target_description: '输入搜索词', index: 3, text: 'hello' },
	})
	const clickResult = await sandbox.NC_BG_EXECUTOR.executeAction(session, {
		name: 'locate_by_vision',
		input: { target_description: '点击确认按钮', index: 7 },
	})
	if (!inputResult.success || !clickResult.success) {
		throw new Error('locate_by_vision delegation should succeed in fake vision executor')
	}
	if (delegated[0]?.name !== 'input_text' || delegated[0]?.input?.text !== 'hello') {
		throw new Error(`locate_by_vision text input should delegate to input_text, got ${JSON.stringify(delegated[0])}`)
	}
	if (delegated[1]?.name !== 'click_element_by_index') {
		throw new Error(`locate_by_vision click should delegate to click_element_by_index, got ${JSON.stringify(delegated[1])}`)
	}
	if (delegated.some((action) => action?.input && Object.prototype.hasOwnProperty.call(action.input, 'index'))) {
		throw new Error(`locate_by_vision delegated coordinate actions must not carry stale index: ${JSON.stringify(delegated)}`)
	}
	if (delegated.some((action) => action?.name === 'locate_by_vision')) {
		throw new Error('locate_by_vision must never be sent as a coordinate page action')
	}
	const missingTarget = await sandbox.NC_BG_EXECUTOR.executeAction(session, {
		name: 'locate_by_vision',
		input: { text: 'hello' },
	})
	if (missingTarget.success || !String(missingTarget.message || '').includes('target_description')) {
		throw new Error(`locate_by_vision should fail without target_description, got ${JSON.stringify(missingTarget)}`)
	}
}

function assertVisionFallbackPreservesCoordinateActionOutcome() {
	const vision = read('naturalclick-extension/background/vision.js')
	const fn = extractFunctionSource(vision, 'executeVisionLocatedAction')
	if (!fn.includes('const actionMeta = result?.meta') || !fn.includes('...actionMeta')) {
		throw new Error('vision fallback should merge the coordinate page-action meta into its returned meta')
	}
	if (!fn.includes('coordinateOutcome: actionMeta.outcome')) {
		throw new Error('vision fallback should expose the coordinate action outcome for trace/debug visibility')
	}
}

function assertLocateByVisionRegisteredAsBackgroundTool() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/tools.js', {
		NC_BG_CONSTANTS: {
			TYPES: { ACT: 'NC_ACT', ASK_USER_REQUEST: 'NC_ASK_USER_REQUEST', OBSERVE: 'NC_OBSERVE' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: true, message: 'unused' }),
			normalizeUrl: (url) => url,
			createTabAndWaitLoaded: async () => ({ id: 1 }),
			sendRuntimeMessage: async () => ({ ok: true, answer: 'ok' }),
		},
	})
	const tools = sandbox.NC_BG_TOOLS.listTools()
	const locateTool = tools.find((tool) => tool.name === 'locate_by_vision')
	if (!locateTool) throw new Error('locate_by_vision tool is not registered')
	if (locateTool.target !== 'background') {
		throw new Error(`locate_by_vision must be a background tool, got ${locateTool.target}`)
	}
	const toolsSource = read('naturalclick-extension/background/tools.js')
	if (/pageActionTool\('locate_by_vision'/.test(toolsSource)) {
		throw new Error('locate_by_vision must not be registered as a page action tool')
	}
}

async function assertVerifierChecksLocateByVisionInput() {
	const verifyRequests = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async (_tabId, message) => {
				verifyRequests.push(message)
				return { success: true, matched: true }
			},
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					url: 'http://example.test/app',
					content: 'same-dom',
					activeElement: 'body',
				},
			}),
		},
	})
	if (!sandbox.NC_BG_VERIFIER.shouldVerifyAction({ name: 'locate_by_vision' })) {
		throw new Error('locate_by_vision should participate in post-action verification')
	}
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'locate_by_vision', input: { target_description: '输入搜索词', text: 'hello' } },
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			activeElement: 'body',
		},
		{
			success: true,
			message: '视觉定位输入成功',
			meta: { point: { x: 120, y: 88 } },
		}
	)
	if (!result.ok || !String(result.reason || '').includes('point')) {
		throw new Error(`locate_by_vision input should verify by point, got ${JSON.stringify(result)}`)
	}
	if (!verifyRequests.some((message) => message?.type === 'NC_VERIFY_INPUT_POINT' && message?.payload?.text === 'hello')) {
		throw new Error('locate_by_vision input did not call point input verifier')
	}
}

async function assertVerifierAcceptsDropdownOpenProbe() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					url: 'http://example.test/app',
					content: 'same-dom',
					activeElement: 'body',
				},
			}),
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'open_dropdown', input: { index: 3 } },
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			activeElement: 'body',
		},
		{
			success: true,
			message: '已展开下拉框索引 3。 当前候选: A、B',
			meta: {
				before: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
				after: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
				visibleOptions: ['A', 'B'],
			},
		}
	)
	if (!result.ok || !String(result.reason || '').includes('候选项')) {
		throw new Error(`dropdown open probe should pass verification, got ${JSON.stringify(result)}`)
	}
	if (!Array.isArray(result.outcome?.visibleOptions) || result.outcome.visibleOptions.join('|') !== 'A|B') {
		throw new Error(`dropdown open verifier should return visible candidates as structured outcome, got ${JSON.stringify(result)}`)
	}
}

async function assertVerifierRetriesDropdownProbeCandidates() {
	let observations = 0
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => {
				observations += 1
				return {
					ok: true,
					data: observations === 1
						? {
							url: 'http://example.test/app',
							content: 'same-dom',
							activeElement: 'body',
							options: [],
							popups: [],
						}
						: {
							url: 'http://example.test/app',
							content: 'same-dom',
							activeElement: 'body',
							options: [
								{
									label: '企业端',
									role: 'option',
									region: 'popover',
									newSinceLastObservation: true,
								},
							],
							popups: [],
						},
				}
			},
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'open_dropdown', input: { index: 3 } },
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			activeElement: 'body',
		},
		{
			success: true,
			message: '已展开下拉框索引 3。 当前尚未检测到可见候选，下一轮应重新观察或等待弹层。',
			meta: {
				before: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
				after: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: true },
				visibleOptions: [],
			},
		}
	)
	if (!result.ok || !String(result.reason || '').includes('候选项')) {
		throw new Error(`dropdown probe should retry until delayed candidates appear, got ${JSON.stringify(result)}`)
	}
	if (!Array.isArray(result.outcome?.visibleOptions) || !result.outcome.visibleOptions.includes('企业端')) {
		throw new Error(`dropdown probe retry should surface delayed candidates in outcome, got ${JSON.stringify(result)}`)
	}
	if (observations < 2) {
		throw new Error(`dropdown probe verifier should retry observations, got ${observations}`)
	}
}

async function assertVerifierRejectsDropdownProbeWithoutCandidates() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					url: 'http://example.test/app',
					content: 'same-dom',
					activeElement: 'body',
					options: [],
					popups: [],
				},
			}),
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'open_dropdown', input: { index: 3 } },
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			activeElement: 'body',
		},
		{
			success: true,
			message: '已展开下拉框索引 3。 当前尚未检测到可见候选，下一轮应重新观察或等待弹层。',
			meta: {
				before: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: null },
				after: { value: '', checked: null, selected: null, childChecked: null, childSelected: null, expanded: true },
				visibleOptions: [],
			},
		}
	)
	if (result.ok || !String(result.reason || '').includes('未发现可见候选项')) {
		throw new Error(`dropdown probe without candidates should fail verification, got ${JSON.stringify(result)}`)
	}
}

async function assertVerifierAcceptsSearchWorkflowSemanticClicks() {
	const loadVerifier = (postObservation) => loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({ ok: true, data: postObservation }),
		},
	})
	const submitSandbox = loadVerifier({
		url: 'http://example.test/app',
		content: 'same-dom',
		forms: [
			{
				fields: [
					{ index: 2, label: '登录账号', valueState: 'filled:admin', value: 'admin' },
				],
			},
		],
	})
	const submitResult = await submitSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'click_element_by_index',
			input: {
				workflow: 'search-fields',
				workflow_step: 'submit_search',
				workflow_field_index: 2,
				index: 8,
			},
		},
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			forms: [
				{
					fields: [
						{ index: 2, label: '登录账号', valueState: 'filled:admin', value: 'admin' },
					],
				},
			],
		},
		{ success: true, message: '已点击搜索。', meta: { outcome: { kind: 'none', progress: false } } }
	)
	if (!submitResult.ok || !String(submitResult.reason || '').includes('搜索提交动作已触发')) {
		throw new Error(`search submit semantic click should verify even without visible DOM change, got ${JSON.stringify(submitResult)}`)
	}
	const resetSandbox = loadVerifier({
		url: 'http://example.test/app',
		content: 'same-dom',
		forms: [
			{
				fields: [
					{ index: 2, label: '登录账号', valueState: 'empty', value: '' },
				],
			},
		],
	})
	const resetResult = await resetSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'click_element_by_index',
			input: {
				workflow: 'search-fields',
				workflow_step: 'reset_filters',
				workflow_field_index: 2,
				index: 9,
			},
		},
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			forms: [
				{
					fields: [
						{ index: 2, label: '登录账号', valueState: 'filled:admin', value: 'admin' },
					],
				},
			],
		},
		{ success: true, message: '已点击重置。', meta: { outcome: { kind: 'none', progress: false } } }
	)
	if (!resetResult.ok || !String(resetResult.reason || '').includes('搜索重置后字段已清空')) {
		throw new Error(`search reset semantic click should verify cleared fields, got ${JSON.stringify(resetResult)}`)
	}
}

function assertModelReasoningIsSurfaced() {
	const modelClient = read('naturalclick-extension/background/planner-model-client.js')
	const sidepanel = read('naturalclick-extension/sidepanel.js')
	if (!modelClient.includes('reasoning_content')) {
		throw new Error('planner model client response preview does not preserve reasoning_content')
	}
	if (!sidepanel.includes('normalizeModelReasoning') || !sidepanel.includes('模型思考')) {
		throw new Error('sidepanel does not surface model reasoning summaries')
	}
	if (!sidepanel.includes('buildSessionDiagnostics') || !sidepanel.includes('modelThoughts') || !sidepanel.includes('loopGuardCount')) {
		throw new Error('sidepanel exports should include compact diagnostics for timeout, loop guard, and model-thought debugging')
	}
	if (!sidepanel.includes('getModelErrorSummary') || !sidepanel.includes('lastModelError') || !sidepanel.includes('模型错误:')) {
		throw new Error('sidepanel should surface model request errors directly instead of hiding them only in raw IO')
	}
	if (!read('naturalclick-extension/sidepanel.html').includes('sp-model-error')) {
		throw new Error('sidepanel should style direct model error summaries')
	}
	if (
		!/runtimeSessionId:\s*sessionId/.test(sidepanel) ||
		!/activityText:\s*state\.activityText/.test(sidepanel) ||
		!/planItems:\s*cloneJson\(state\.planItems/.test(sidepanel)
	) {
		throw new Error('sidepanel should persist planItems, activityText, and runtimeSessionId for exported history diagnostics')
	}
}

function assertManifestVersion() {
	const manifest = JSON.parse(read('naturalclick-extension/manifest.json'))
	if (!/^(?:0\.(?:2|3)\.\d+|0\.4\.[0-9]+)$/.test(String(manifest.version || ''))) {
		throw new Error(`unexpected manifest version: ${manifest.version}`)
	}
}

try {
	Promise.resolve(main()).catch((error) => {
		console.error(error?.message || error)
		process.exit(1)
	})
} catch (error) {
	console.error(error?.message || error)
	process.exit(1)
}
