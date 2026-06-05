#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')
const vm = require('vm')

const repoRoot = path.resolve(__dirname, '..')
const extensionRoot = path.join(repoRoot, 'naturalclick-extension')

const forbiddenDomainPatterns = [
	/用户管理/,
	/客户管理/,
	/system\/user/,
	/已知业务路由/,
	/业务系统/,
	/业务模块/,
	/业务目标/,
	/业务菜单/,
	/登录按钮兜底/,
	/findCandidateByTaskTargets/,
	/shouldClickTaskTarget/,
	/deriveDeterministicDecision/,
	/isKnownTargetPage/,
	/确定性兜底/,
	/业务列表/,
	/业务表单/,
	/业务字段/,
	/业务页面/,
	/当前业务/,
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

	assertNoForbiddenDomainFallbacks(listFiles(extensionRoot))
	assertNavigationAndSearchStayDomainNeutral()
	assertPlannerFastPathBehavior()
	assertInitialNavigationBehavior()
	assertTaskIntentBehavior()
	await assertPlannerUsesModelDecisionOnTarget()
	await assertPlannerTaskIntentBeforeNavigation()
	await assertPlannerUsesOperationOnlyHeuristicOnLocalSurface()
	await assertPlannerHeuristicTaskIntentBeforeNavigation()
	await assertPlannerHeuristicSearchTaskIntentBeforeNavigation()
	await assertPlannerCompactRetryAfterTimeout()
	await assertPlannerStartsCompactForLargeObservation()
	await assertPlannerUsesConfiguredObservationLimits()
	await assertPlannerDoesNotRepeatCompactTimeoutForLargeObservation()
	await assertPlannerPublishesPlanningProgress()
	await assertPlannerModelClientTraceDiagnostics()
	await assertPlannerTimeoutWithoutRecoveryEndsGracefully()
	await assertPlannerTimeoutRecoveryOpensCreateEntry()
	await assertPlannerTimeoutRecoverySelectsExplicitCascaderPath()
	await assertPlannerTimeoutRecoveryRetriesFailedCascaderPathAfterReopen()
	await assertPlannerTimeoutRecoveryFillsAssignedTextBeforeCascader()
	await assertPlannerTimeoutRecoveryUpdatesAssignedExistingFields()
	await assertPlannerTimeoutRecoveryCleansDanglingCascaderPunctuation()
	await assertPlannerTimeoutRecoveryClicksVisibleCascaderCandidate()
	await assertPlannerTimeoutRecoverySubmitsAfterFormFillRecovery()
	await assertPlannerPreModelFormFillSkipsModelWhenDeterministic()
	await assertPlannerPreModelFormFillMatchesSpecificNameAlias()
	await assertPlannerPreModelInputFieldTestSkipsModelWhenDeterministic()
	await assertPlannerDuplicateFormConflictAsksForReplacement()
	await assertPlannerAmbiguousDuplicateFormConflictUsesModel()
	await assertPlannerAmbiguousDuplicateAfterReplacementUsesModel()
	await assertPlannerDuplicateFormConflictUsesUserReplacement()
	await assertPlannerDuplicateFormConflictSubmitsAfterReplacement()
	await assertPlannerDuplicateFormConflictIgnoresLoopGuardAfterReplacement()
	await assertPlannerValidationErrorCorrectsForbiddenCharacters()
	await assertPlannerValidationCorrectionSubmits()
	await assertPlannerHistoryOutcomeGuidesReplanning()
	await assertPlannerRejectsRepeatedFailedDropdownRequest()
	await assertPlannerRejectsRepeatedDropdownOpenAfterVisibleOptions()
	await assertPlannerRejectsInvisibleDropdownTextWhenScopedOptionsVisible()
	await assertPlannerTimeoutRecoveryStopsUnresolvedTaskNavigation()
	await assertPlannerReactContextRound()
	assertPlannerObservationOmissionHints()
	assertPlannerObservationIncludesCandidateDiagnostics()
	await assertPlannerRequestContextPaginationBounds()
	await assertPlannerInspectIndexCoversFormsOnlyMatch()
	await assertPlannerOptionsContextIncludesNativeSelectOptions()
	await assertPlannerOptionsContextScopesVisibleCandidatesToField()
	await assertPlannerOptionsContextReportsUnscopedCandidatesAsDiagnostics()
	await assertPlannerRejectsDiagnosticOptionCandidateSelection()
	await assertPlannerRecoversSearchOptionContextLimitAsFieldSkip()
	await assertPlannerRejectsDirectOptionCandidateClick()
	await assertPlannerRejectsDirectCascaderCandidateClick()
	await assertPlannerAllowsDirectPopupMenuCommandClick()
	await assertPlannerOptionsContextUsesExplicitPopupOwner()
	await assertPlannerOptionsContextUsesPopupLabelledByOwner()
	await assertPlannerDuplicateReactRequestWarnsAndRecovers()
	await assertPlannerInvalidModelOutputReplansBeforeFailing()
	await assertPlannerNormalizesActionOutputVariants()
	await assertPlannerInvalidActionReplansBeforeExecution()
	await assertPlannerInvalidActionInputReplansBeforeExecution()
	await assertPlannerRejectsTargetLabelIndexMismatch()
	await assertPlannerPublishesValidationFeedbackForCoveredTargets()
	assertPlannerRejectsCoveredIndexTargets()
	await assertPlannerAllowsSemanticTargetLabelIntentMatch()
	await assertPlannerRejectsTextInputOnNonEditableSelectionControl()
	await assertPlannerRejectsTextInputWhenAnySameIndexSourceIsSelectionControl()
	await assertPlannerRejectsDropdownOnPlainEditableInput()
	await assertPlannerAllowsDropdownOpenWithoutOptionText()
	await assertPlannerRejectsUnscopedChooseDropdownOption()
	await assertPlannerClassifiesMissingCascaderPathAsRequiredParameter()
	await assertPlannerAllowsLocateByVisionWithStaleIndex()
	await assertPlannerRejectsLocateByVisionObservedOptionIndex()
	await assertPlannerRejectsLocateByVisionOptionDescriptionWithoutIndex()
	await assertPlannerRejectsLocateByVisionWithoutTargetDescription()
	assertNativeSelectUsesSelectionSemantics()
	assertInputVerificationUsesResolvedEditableTarget()
	assertDirectInputModeSkipsHumanizedClick()
	assertCompositeSelectDoesNotResolveNestedInput()
	assertReadonlyPickerInputsExposeDropdownSemantics()
	assertCompositePickerWrappersAreObserved()
	assertObserverDatePickerCellsAreObserved()
	assertDropdownActionsUseCompositePickerTriggers()
	assertObserverPreservesNestedNavigationItems()
	assertObserverKeepsCrudTextActionCandidates()
	assertActionsPreferNestedActionClickTargets()
	assertObservationActionLinesExposeRects()
	assertObserverPrefersSpecificNestedTargetsOverBroadContainers()
	assertVisualHighlightsExposeHitState()
	assertVisionHitTestClickableSemantics()
	assertVisionCandidatesUseSemanticTargetDescription()
	assertVisionCaptureHidesNaturalClickOverlays()
	assertPlannerBudgetCoversInternalRounds()
	await assertAskUserToolTimesOut()
	await assertInputTextRetriesDirectAfterTransportTimeout()
	await assertExplicitDropdownToolsAreRegisteredAndRouted()
	assertLoopGuardBehavior()
	assertLoopGuardAllowsVerifiedProgressRepeats()
	assertVisionFallbackSkipsSemanticActionFailures()
	await assertVisionRecoveryPreservesFailedCoordinateMeta()
	await assertNavigationRevealSkipsVerificationVisionRecovery()
	await assertSessionLoopGuardReplansToCompletion()
	await assertSessionStoresVerificationProgress()
	await assertSessionLogsVerificationRecoveryOutcome()
	await assertSessionPublishesPlanningProgress()
	assertRuntimeProgressTraceDedupes()
	await assertSessionPublishesExecutionHeartbeat()
	await assertSessionRecordsVerifiedAfterFailedExecution()
	await assertSessionPublishesExecutionRecoveryProgress()
	await assertSessionPublishesVerificationHeartbeat()
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
	await assertVerifierAcceptsTimedOutSelectionWhenValueIsSatisfied()
	await assertVerifierRejectsDialogCloseAfterFieldSelection()
	await assertVerifierSeparatesSubmitFromCreateEntryVerification()
	await assertLocateByVisionDelegatesToExecutableCoordinateAction()
	await assertVisionFallbackPreservesCoordinateActionOutcome()
	assertLocateByVisionRegisteredAsBackgroundTool()
	await assertVerifierChecksLocateByVisionInput()
	await assertVerifierRejectsNoopClick()
	await assertVerifierRejectsCreateClickWithoutForm()
	assertVerifierCreateEvidenceStaysDomainNeutral()
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
	assertSessionPlanItemsExposeSearchWorkflowProgress()
	assertSessionRecoveryExtractedFromSessionEngine()
	assertSessionRecoveryRecognizesStructuredSemanticFailures()
	assertSessionRecoverySkipsSubmitVerificationVisionRecovery()
	assertSessionTimingExtractedFromSessionEngine()
	assertSessionLifecycleExtractedFromSessionEngine()
	assertResultSummaryBehavior()
	assertResultSummaryFailureFallbackPublished()
	assertPlannerContextExtractedFromPlanner()
	assertPlannerFastPathExtractedFromPlanner()
	assertPlannerValidationExtractedFromPlanner()
	assertPlannerModelClientExtractedFromPlanner()
	assertPlannerDecisionExtractedFromPlanner()
	assertPlannerPromptExtractedFromPlanner()
	assertPlannerPromptHandlesCreateFormNotOpened()
	assertPlannerCompactPromptTrimsTabsAndToolDescriptions()
	assertPlanningContextConfigIsUserConfigurable()
	assertLoginWorkflowBehavior()
	assertTaskNavigationWorkflowBehavior()
	assertSearchWorkflowBehavior()
	assertObserverCapturesTableSummaries()
	assertPlannerWorkflowRegistryBehavior()
	assertObserverUsesCentralSemantics()
	assertObserverFieldInferenceStaysStructural()
	assertObserverSupportsShadowDomAndBroaderControls()
	assertObserverOptionSnapshotsExposePopupOwner()
	assertObserverCapturesFormValidationFeedback()
	assertActionStateExtractedFromActions()
	assertActionInputExtractedFromActions()
	assertActionFailuresUseStructuredOutcomes()
	assertActionScrollExtractedFromActions()
	assertActionOptionsExtractedFromActions()
	assertActionOptionsSupportBroaderControls()
	assertActionOptionsSupportDatePickerCells()
	assertActionOptionsRequireScopedPopupForFieldOptions()
	assertActionCascaderExtractedFromActions()
	assertActionSelectExtractedFromActions()
	assertActionsReturnStructuredOutcomes()
	assertSelectionFailuresUseStructuredOutcomes()
	await assertVerifierUsesStructuredOutcome()
	assertModelReasoningIsSurfaced()
	assertSidepanelExposesPlanningContextSettings()
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
	const bodyStart = match.index + match[0].lastIndexOf('{')
	for (let index = bodyStart; index < source.length; index += 1) {
		const ch = source[index]
		if (ch === '{') depth += 1
		if (ch === '}') {
			depth -= 1
			if (depth === 0) return source.slice(match.index, index + 1)
		}
	}
	throw new Error(`function source is incomplete: ${name}`)
}

function assertNoForbiddenDomainFallbacks(files) {
	const targets = files.filter((file) => /\.(js|json|html)$/.test(file))
	for (const file of targets) {
		const text = fs.readFileSync(file, 'utf8')
		for (const pattern of forbiddenDomainPatterns) {
			if (pattern.test(text)) {
				throw new Error(`domain-specific fallback leaked into ${path.relative(repoRoot, file)}: ${pattern}`)
			}
		}
	}
}

function assertNavigationAndSearchStayDomainNeutral() {
	const workflows = read('naturalclick-extension/background/workflows.js')
	const searchWorkflow = read('naturalclick-extension/background/search-workflow.js')
	const taskIntent = read('naturalclick-extension/background/task-intent.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	const domainTerms = /(客户管理|用户管理|订单中心|销售订单|system\/user|CRM|crm|客户|订单|产品|商品|物料|库存|采购|销售|供应|仓库|线索|商机|合同|回款)/
	for (const [name, source] of [
		['background/workflows.js', workflows],
		['background/search-workflow.js', searchWorkflow],
	]) {
		if (domainTerms.test(source)) {
			throw new Error(`domain-specific navigation/search lexicon leaked into ${name}`)
		}
	}
	for (const term of ['客户管理', '用户管理', '订单中心', '销售订单', 'CRM', 'crm']) {
		if (taskIntent.includes(term)) {
			throw new Error(`task-intent prompt should use generic examples, found ${term}`)
		}
	}
	if (/moduleType|inferModuleType|management\|order\|approval/.test(taskIntent)) {
		throw new Error('task-intent should not carry domain-specific module type classification')
	}
	if (/\$\{[^}]+\}管理/.test(taskIntent)) {
		throw new Error('task-intent should not invent management-suffix aliases for generic navigation targets')
	}
	if (!/const\s+NAVIGATION_PARENT_RELATION_RULES\s*=\s*\[\]/.test(workflows)) {
		throw new Error('task-navigation should not use domain-specific parent/child mapping rules')
	}
	for (const [name, source] of [
		['background/workflows.js', workflows],
		['background/planner-context.js', plannerContext],
		['background/task-intent.js', taskIntent],
	]) {
		if (/targetCore/.test(source)) {
			throw new Error(`${name} target extraction should not rely on a module-suffix targetCore regex`)
		}
	}
	for (const fnName of [
		'isStructuralNavigationContainerLabel',
		'isLikelyNavigationContainerLabel',
		'isNavigationContainerName',
		'isLikelyAppNavigationLabel',
		'isLikelyLeafNavigationLabel',
	]) {
		const fn = extractFunctionSource(workflows, fnName)
		if (domainTerms.test(fn)) {
			throw new Error(`task-navigation function ${fnName} should stay domain-neutral`)
		}
	}
	const deterministicContainerLexicon = /(管理|中心|系统|设置|配置|平台|后台|权限|组织|部门|角色|数据|报表|审批|流程|工具)/
	for (const fnName of [
		'isStructuralNavigationContainerLabel',
		'isLikelyNavigationContainerLabel',
		'isNavigationContainerName',
		'isLikelyAppNavigationLabel',
		'hasStrongNavigationParentRelation',
	]) {
		const fn = extractFunctionSource(workflows, fnName)
		if (deterministicContainerLexicon.test(fn)) {
			throw new Error(`task-navigation function ${fnName} should not classify navigation parents from admin/module lexicons`)
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
	if (!sessionTiming.includes("workflowStep === 'submit_form_timeout_recovery'") || !sessionTiming.includes('await sleep(900)')) {
		throw new Error('form submit actions should settle longer before verification to avoid duplicate recovery clicks')
	}
	if (
		!planner.includes('summarizePlanningContextLimitDiagnostic(planningContext)') ||
		!planner.includes('planning_context_limit: true') ||
		!planner.includes('planning_context_diagnostic: limitDiagnostic') ||
		!planner.includes('最近阻塞原因')
	) {
		throw new Error('planner context-round limit should surface the latest blocking diagnostic instead of a generic done failure')
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
	if (!verification.includes('function matchesExpectedInputValue') || !/if\s*\(!normalizedExpected\)\s*return\s*!normalizedValue/.test(verification)) {
		throw new Error('input verification should require an actually empty value when expected text is empty')
	}
}

function assertDirectInputModeSkipsHumanizedClick() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionInput = read('naturalclick-extension/content/action-input.js')
	const getInputModeFn = extractFunctionSource(actions, 'getInputMode')
	const inputByIndexFn = extractFunctionSource(actionInput, 'inputByIndex')
	const inputByPointFn = extractFunctionSource(actionInput, 'inputByPoint')
	if (!/inputMode\s*===\s*'direct'/.test(getInputModeFn)) {
		throw new Error('content action dispatcher should accept the internal direct input mode')
	}
	for (const [name, fn] of [['inputByIndex', inputByIndexFn], ['inputByPoint', inputByPointFn]]) {
		if (!/inputMode\s*===\s*'direct'/.test(fn) || !/focusDirectInputTarget\(editable\)/.test(fn)) {
			throw new Error(`${name} should focus and set values directly in direct input mode`)
		}
		if (!/await\s+humanLikeClick/.test(fn)) {
			throw new Error(`${name} should keep human-like clicking for normal input modes`)
		}
		if (!/clickInfo\?\.blocked/.test(fn) || !fn.includes('occluded_input_target')) {
			throw new Error(`${name} should fail with occluded_input_target instead of writing through an occluded realistic focus click`)
		}
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

function assertObserverDatePickerCellsAreObserved() {
	const semantics = read('naturalclick-extension/content/semantics.js')
	const observer = read('naturalclick-extension/content/observer.js')
	const collectFn = extractFunctionSource(observer, 'collectInteractiveCandidates')
	const normalizeFn = extractFunctionSource(observer, 'normalizeInteractiveElement')
	const probablyFn = extractFunctionSource(observer, 'isProbablyInteractive')
	const optionFn = extractFunctionSource(observer, 'isOptionLike')
	const keepFn = extractFunctionSource(observer, 'shouldKeepNestedCandidate')
	const equivalentFn = extractFunctionSource(observer, 'isEquivalentNestedOptionCandidate')
	const closestOptionFn = extractFunctionSource(observer, 'getClosestOptionCandidate')
	const roleFn = extractFunctionSource(observer, 'getElementRole')
	const controlFn = extractFunctionSource(observer, 'getSelectionControlType')
	const labelFn = extractFunctionSource(observer, 'getDatePickerOptionLabel')
	const refineFn = extractFunctionSource(observer, 'refineFieldTypeFromControl')
	const temporalTextFn = extractFunctionSource(observer, 'inferTemporalFieldTypeFromText')
	const expandedFn = extractFunctionSource(observer, 'getExpandedState')
	const focusedPopupFn = extractFunctionSource(observer, 'isFocusedSelectionFieldWithVisiblePopup')
	for (const expected of [
		'.el-date-table td.available',
		'.ant-picker-cell:not(.ant-picker-cell-disabled)',
		'.arco-picker-cell:not(.arco-picker-cell-disabled)',
		'.layui-laydate-content td:not(.laydate-disabled)',
		'.ivu-date-picker-cells-cell:not(.ivu-date-picker-cells-cell-disabled)',
	]) {
		if (!observer.includes(expected)) {
			throw new Error(`observer should expose date picker cells for ${expected}`)
		}
	}
	if (!semantics.includes('date-option') || !semantics.includes('getDatePickerCellCandidate')) {
		throw new Error('central content semantics should classify visible date cells as date-option controls')
	}
	if (!collectFn.includes('.el-date-table td.available') || !normalizeFn.includes('getDatePickerCellCandidate(element)')) {
		throw new Error('observer should collect date cells and normalize inner spans to their date cell')
	}
	if (!probablyFn.includes('isDatePickerOption(element)') || !optionFn.includes('isDatePickerOption(element)')) {
		throw new Error('observer should keep date cells as option-like interactive candidates')
	}
	if (!roleFn.includes("return 'option'") || !controlFn.includes("return 'date-option'")) {
		throw new Error('date picker cells should be exposed as option/date-option instead of generic table cells')
	}
	if (!labelFn.includes('formatDateParts') || !labelFn.includes('inferDatePickerMonthContext')) {
		throw new Error('date picker option labels should include normalized full dates when the panel month is readable')
	}
	if (!refineFn.includes("return 'daterange'") || !observer.includes('isDateRangeControl')) {
		throw new Error('observer should classify range date wrappers as daterange fields')
	}
	if (!refineFn.includes('inferTemporalFieldTypeFromControl(element, fieldType)')) {
		throw new Error('observer should preserve specific temporal range field types before falling back to generic daterange')
	}
	for (const expected of ['datetimerange', 'timerange', 'monthrange', 'yearrange', 'weekrange']) {
		if (!temporalTextFn.includes(expected)) {
			throw new Error(`observer temporal field inference should include ${expected}`)
		}
	}
	if (!expandedFn.includes('isFocusedSelectionFieldWithVisiblePopup(element)') || !focusedPopupFn.includes('hasVisibleSelectionPopup()')) {
		throw new Error('focused date/select fields with a visible picker popup should be exposed as expanded for option ownership')
	}
	if (!keepFn.includes('isEquivalentNestedOptionCandidate(parent, child)')) {
		throw new Error('observer should collapse duplicate parent/child candidates for the same option/date visual target')
	}
	for (const expected of ['getDatePickerCellCandidate(parent)', 'getDatePickerCellCandidate(child)', 'isSelectableControl(child)', 'getClosestOptionCandidate', 'hasStrongNestedRectOverlap']) {
		if (!equivalentFn.includes(expected)) {
			throw new Error(`nested option de-duplication should preserve ${expected}, got ${equivalentFn}`)
		}
	}
	for (const expected of ['.el-select-dropdown__item', '.ant-select-item-option', '.vxe-select-option']) {
		if (!closestOptionFn.includes(expected)) {
			throw new Error(`nested option de-duplication should recognize ${expected}`)
		}
	}
}

function assertDropdownActionsUseCompositePickerTriggers() {
	const actionOptions = read('naturalclick-extension/content/action-options.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const triggerFn = extractFunctionSource(actionOptions, 'resolveDropdownTrigger')
	const enabledTriggerFn = extractFunctionSource(actionSelect, 'hasEnabledSelectionTrigger')
	const dropdownFn = extractFunctionSource(actionSelect, 'selectDropdownOptionAction')
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
	if (!/nativeSelect\s*&&\s*isDisabledElement\(nativeSelect\)/.test(dropdownFn)) {
		throw new Error('dropdown disabled guard should still block truly disabled native select elements')
	}
	if (/if\s*\([^)]*isDisabledElement\(field\)[\s\S]{0,220}return\s+\{\s*success:\s*false,[\s\S]{0,120}对应下拉框已禁用/.test(dropdownFn)) {
		throw new Error('open_dropdown must not abort composite picker fields just because the observed inner field looks disabled')
	}
	if (!dropdownFn.includes('字段带禁用样式/属性但已尝试点击下拉触发区')) {
		throw new Error('open_dropdown should report when it continues through a disabled-like composite picker')
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

function assertObserverKeepsCrudTextActionCandidates() {
	const observer = read('naturalclick-extension/content/observer.js')
	const interactiveFn = extractFunctionSource(observer, 'isProbablyInteractive')
	const collectFn = extractFunctionSource(observer, 'collectInteractiveCandidates')
	const crudFn = extractFunctionSource(observer, 'isCommonCrudActionText')
	const diagnosticsFn = extractFunctionSource(observer, 'buildCandidateDiagnostics')
	if (!interactiveFn.includes('isCommonCrudActionText(text)')) {
		throw new Error('observer should keep common CRUD text actions even when frameworks render them as plain spans')
	}
	if (!interactiveFn.includes('isLikelyTextActionContext(element)')) {
		throw new Error('plain CRUD text fallback should be scoped by nearby action/table context')
	}
	if (!collectFn.includes('isCommonCrudActionText(text)')) {
		throw new Error('observer candidate collection should scan common CRUD text spans/divs even without button classes')
	}
	if (!collectFn.includes('isLikelyTextActionContext(node)')) {
		throw new Error('observer should not collect arbitrary CRUD-looking title text without action context')
	}
	for (const label of ['详情', '删除', '推送', '编辑', '查看', '保存']) {
		if (!crudFn.includes(label)) {
			throw new Error(`common CRUD text detection should include ${label}`)
		}
	}
	for (const forbidden of ['新增', '新建', '添加', 'create']) {
		if (crudFn.includes(forbidden)) {
			throw new Error(`plain CRUD text fallback should not include create/title text ${forbidden}`)
		}
	}
	if (!diagnosticsFn.includes('unindexedTextActionProbes') || !diagnosticsFn.includes('outerHTML')) {
		throw new Error('observer should export unindexed text-action diagnostics for copied sessions')
	}
}

function assertActionsPreferNestedActionClickTargets() {
	const actions = read('naturalclick-extension/content/actions.js')
	const executeFn = extractFunctionSource(actions, 'executeAction')
	const clickFn = extractFunctionSource(actions, 'clickByIndex')
	const clickPointFn = extractFunctionSource(actions, 'clickByPoint')
	const resolveFn = extractFunctionSource(actions, 'resolveClickElement')
	const pointFn = extractFunctionSource(actions, 'getPreferredClickPoint')
	if (!/clickByIndex\(index,\s*inputMode,\s*input\)/.test(executeFn)) {
		throw new Error('click_element_by_index should pass action input through to the click executor')
	}
	if (
		!actions.includes('clickTarget: clickInfo?.clickTarget') ||
		!actions.includes('hitTarget: clickInfo?.hitTarget') ||
		!actions.includes('formatClickTargetMessage(clickInfo)')
	) {
		throw new Error('click results should log the resolved click target and hit-test details')
	}
	if (!/const\s+clickInfo\s*=\s*await\s+humanLikeClick\(target,\s*\{\s*x,\s*y\s*\},\s*inputMode\)/.test(clickPointFn)) {
		throw new Error('coordinate click should inspect the human-like click result')
	}
	if (!/clickInfo\?\.blocked/.test(clickPointFn) || !clickPointFn.includes('occluded_click_target')) {
		throw new Error('coordinate click should fail when the visually located target is occluded')
	}
	if (!clickPointFn.includes('clickTarget: clickInfo.clickTarget') || !clickPointFn.includes('hitTarget: clickInfo.hitTarget')) {
		throw new Error('coordinate click occlusion diagnostics should include click/hit target metadata')
	}
	if (
		!actions.includes('resolveVisibleClickPoint(clickElement, x, y)') ||
		!actions.includes('findVisibleInternalClickPoint(element)') ||
		!actions.includes('occluded_click_target') ||
		!actions.includes('isHitWithinClickElement(hit, element)')
	) {
		throw new Error('click execution should not dispatch directly to an indexed element when its click point is occluded')
	}
	if (!actions.includes('findNestedActionControl(element, input)')) {
		throw new Error('click resolution should prefer nested action controls for create/add buttons inside broad containers')
	}
	if (!actions.includes('findNestedActionTextPoint(element, input)')) {
		throw new Error('click targeting should prefer the nested action text point before falling back to container center')
	}
	for (const expected of ['target_label', 'workflow_create_label', 'target_description']) {
		if (!actions.includes(expected)) {
			throw new Error(`nested action targeting/recovery diagnostics should include ${expected}`)
		}
	}
	const tools = read('naturalclick-extension/background/tools.js')
	if (!/pageActionTool\('click_element_by_index'[\s\S]*target_label: 'string\|required'/.test(tools)) {
		throw new Error('click tools should require target_label so index-only clicks can be validated against observed labels')
	}
	if (!/pageActionTool\('input_text'[\s\S]*target_label: 'string\|required'/.test(tools)) {
		throw new Error('input tools should require target_label so index-only text entry can be validated against observed fields')
	}
	if (!/pageActionTool\('hover_element_by_index'[\s\S]*target_label: 'string\|required'/.test(tools)) {
		throw new Error('hover tools should require target_label so index-only hover targets can be validated against observed labels')
	}
	if (!/pageActionTool\('keypress'[\s\S]*target_label: 'string\|required'[\s\S]*reason: 'string\|optional'/.test(tools)) {
		throw new Error('keypress should require target_label and allow reason so focused keyboard actions are explainable')
	}
	if (!/name:\s*'wait'[\s\S]*inputSchema:\s*\{ ms: 'number\|optional', reason: 'string\|required' \}/.test(tools)) {
		throw new Error('wait should require reason so passive waiting is visible and explainable')
	}
	if (!/name:\s*'open_new_tab'[\s\S]*inputSchema:\s*\{ url: 'string\|required', target_label: 'string\|required', reason: 'string\|optional' \}/.test(tools)) {
		throw new Error('open_new_tab should require target_label so URL navigation is explainable')
	}
	if (!/name:\s*'switch_to_tab'[\s\S]*target_label: 'string\|required'[\s\S]*target_url: 'string\|optional'[\s\S]*reason: 'string\|optional'/.test(tools)) {
		throw new Error('switch_to_tab should require target_label and allow target_url/reason for tab context verification')
	}
	if (!/name:\s*'close_tab'[\s\S]*target_label: 'string\|required'[\s\S]*target_url: 'string\|optional'[\s\S]*reason: 'string\|required'/.test(tools)) {
		throw new Error('close_tab should require target_label and reason before closing browser context')
	}
	if (!/name:\s*'ask_user'[\s\S]*inputSchema:\s*\{ question: 'string\|required', reason: 'string\|required'/.test(tools)) {
		throw new Error('ask_user should require reason so user interruptions explain missing context')
	}
	for (const name of ['scroll', 'scroll_horizontally']) {
		const pattern = new RegExp(`pageActionTool\\('${name}'[\\s\\S]*target_label: 'string\\|optional'`)
		if (!pattern.test(tools)) {
			throw new Error(`${name} should allow optional target_label for indexed container scrolling`)
		}
	}
	for (const name of ['open_dropdown', 'choose_dropdown_option', 'select_checkbox_option', 'select_cascader_path']) {
		const pattern = new RegExp(`pageActionTool\\('${name}'[\\s\\S]*target_label: 'string\\|required'`)
		if (!pattern.test(tools)) {
			throw new Error(`${name} should require target_label so field-scoped selection actions can be validated against observed fields`)
		}
	}
}

function assertObservationActionLinesExposeRects() {
	const observer = read('naturalclick-extension/content/observer.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	if (!observer.includes('rect=${formatObservationRect(action.rect)}') || !observer.includes('function formatObservationRect')) {
		throw new Error('observer action lines should include action rect geometry for debugging bad clicks')
	}
	if (!observer.includes('rect=${formatObservationRect(field.rect)}') || !observer.includes('rect=${formatObservationRect(item.rect)}')) {
		throw new Error('observer field and option lines should include rect geometry for debugging bad targets')
	}
	const buildSimplifiedDom = extractFunctionSource(observer, 'buildSimplifiedDom')
	if (!buildSimplifiedDom.includes('rect="${formatObservationRect(item.rect)}"')) {
		throw new Error('observer simplified_dom rows should include rect geometry for compact-context target localization')
	}
	if (
		!observer.includes('function getElementHitState') ||
		!observer.includes('function formatHitState') ||
		!observer.includes('hit="${formatHitState(item)}"') ||
		!observer.includes('hit=${formatHitState(field)}') ||
		!observer.includes('hit=${formatHitState(action)}')
	) {
		throw new Error('observer observation lines should expose generic hit-test state before planning clicks')
	}
		if (!observer.includes('source=${action.labelSource') || !observer.includes('aliases="${(action.aliases || []).join')) {
			throw new Error('observer action lines should expose label source and aliases for icon-only/accessible-name buttons')
		}
		for (const expected of ['readFieldConstraintHints', 'maxLength: constraintHints.maxLength', 'pattern: constraintHints.pattern', 'inputMode: constraintHints.inputMode']) {
			if (!observer.includes(expected)) {
				throw new Error(`observer field snapshots should expose generic input constraint hints for safer field testing: missing ${expected}`)
			}
		}
		const formatActionLine = extractFunctionSource(plannerContext, 'formatActionLine')
		const formatFieldLine = extractFunctionSource(plannerContext, 'formatFieldLine')
		const formatOptionLine = extractFunctionSource(plannerContext, 'formatOptionLine')
	if (!plannerContext.includes('function formatHitState')) {
		throw new Error('planner context should format observer hit-test state for requested/compact context')
	}
	if (!formatActionLine.includes('rect=${formatRect(action.rect)}')) {
		throw new Error('planner context action lines should include rect geometry')
	}
	if (!formatFieldLine.includes('rect=${formatRect(field.rect)}') || !formatOptionLine.includes('rect=${formatRect(option.rect)}')) {
		throw new Error('planner context field and option lines should include rect geometry')
	}
	if (
		!formatActionLine.includes('hit=${formatHitState(action)}') ||
		!formatFieldLine.includes('hit=${formatHitState(field)}') ||
		!formatOptionLine.includes('hit=${formatHitState(option)}')
	) {
		throw new Error('planner context field/action/option lines should preserve hit-test state')
	}
		if (!formatActionLine.includes('action.labelSource') || !formatActionLine.includes('action.aliases') || !formatActionLine.includes('action.semanticContainer')) {
			throw new Error('planner context action lines should preserve action label source, aliases, and container hints')
		}
		if (!plannerContext.includes('function formatFieldConstraintHints') || !formatFieldLine.includes('formatFieldConstraintHints(field)')) {
			throw new Error('planner context field lines should expose generic input constraint hints')
		}
		const scoreObservationItem = extractFunctionSource(plannerContext, 'scoreObservationItem')
	if (!scoreObservationItem.includes('item.aliases') || !scoreObservationItem.includes('item.semanticContainer')) {
		throw new Error('planner context ranking should consider action aliases and semantic containers')
	}
}

function assertObserverPrefersSpecificNestedTargetsOverBroadContainers() {
	const observer = read('naturalclick-extension/content/observer.js')
	const compactFn = extractFunctionSource(observer, 'compactInteractiveCandidates')
	const preferenceFn = extractFunctionSource(observer, 'chooseNestedCandidatePreference')
	const childPreferenceFn = extractFunctionSource(observer, 'shouldPreferChildOverContainer')
	const shellFn = extractFunctionSource(observer, 'isCollectionShellCandidate')
	const descendantFn = extractFunctionSource(observer, 'countIndependentInteractiveDescendants')
	if (!compactFn.includes('chooseNestedCandidatePreference(parent, child)') || !compactFn.includes('remove.add(i)')) {
		throw new Error('observer compaction should compare every nested candidate and remove broad conflicting containers')
	}
	if (!preferenceFn.includes("'child'") || !preferenceFn.includes("'keep-both'") || !preferenceFn.includes("'parent'")) {
		throw new Error('nested candidate preference should explicitly choose child, parent, or keep-both')
	}
	for (const expected of [
		'shouldPreferChildOverContainer(parent, child)',
		'shouldKeepNestedNavigationCandidate(parent, child)',
		'isAtomicInteractiveRoot(parent)',
		'hasMultipleIndependentInteractiveDescendants(parent)',
		'isCollectionShellCandidate(parent)',
		'hasStrongNestedRectOverlap(parent, child)',
	]) {
		if (!childPreferenceFn.includes(expected)) {
			throw new Error(`nested child preference should stay structural and generic: missing ${expected}`)
		}
	}
	for (const expected of ['listbox', 'toolbar', 'popup', 'dropdown', 'calendar', 'wrapper']) {
		if (!shellFn.includes(expected)) {
			throw new Error(`collection shell detection should cover generic container signal ${expected}`)
		}
	}
	for (const expected of ['[role="option"]', '[aria-selected]', '.ant-picker-cell:not(.ant-picker-cell-disabled)', '.vxe-select-option']) {
		if (!descendantFn.includes(expected)) {
			throw new Error(`independent descendant detection should include common structural controls: ${expected}`)
		}
	}
}

function assertVisualHighlightsExposeHitState() {
	const observer = read('naturalclick-extension/content/observer.js')
	const visual = read('naturalclick-extension/content/visual.js')
	const observeFn = extractFunctionSource(observer, 'observePage')
	const renderFn = extractFunctionSource(visual, 'renderIndexHighlights')
	const selectFn = extractFunctionSource(visual, 'selectHighlightRows')
	const scoreFn = extractFunctionSource(visual, 'scoreHighlightRow')
	const hitClassFn = extractFunctionSource(visual, 'getHitClass')
	if (!observeFn.includes('snapshot,') || !observeFn.includes('hitState: snapshot.hitState') || !observeFn.includes('hitPoints: snapshot.hitPoints')) {
		throw new Error('observer should pass snapshot and hit-test state into visual index highlights')
	}
	if (!renderFn.includes('const hitClass = getHitClass(row)') || !renderFn.includes('nc-index-box ${hitClass}')) {
		throw new Error('visual index highlights should style boxes with generic hit-test classes')
	}
	if (!renderFn.includes('selectHighlightRows(indexedElements)') || !visual.includes('MAX_INDEX_HIGHLIGHTS = 160')) {
		throw new Error('visual index highlights should use a ranked highlight subset instead of clipping the first observed elements')
	}
	if (/Math\.min\(90,\s*indexedElements\.length\)/.test(renderFn)) {
		throw new Error('visual index highlights must not drop important high-index popup/content candidates by hard clipping to the first 90 elements')
	}
	for (const expected of ['scoreHighlightRow', 'getHighlightLimit(rows)', 'sort((a, b) => b.score - a.score', 'Number(a.row?.index)']) {
		if (!selectFn.includes(expected)) {
			throw new Error(`visual highlight selection should rank important candidates and then restore index order: missing ${expected}`)
		}
	}
	for (const expected of ["region === 'popover'", "region === 'dialog'", 'snapshot.newSinceLastObservation', 'snapshot.fieldType', 'snapshot.actionIntent', "hit === 'covered'", 'score -= 180']) {
		if (!scoreFn.includes(expected)) {
			throw new Error(`visual highlight scoring should prioritize generic actionable context: missing ${expected}`)
		}
	}
	for (const expected of ['MAX_INDEX_HIGHLIGHTS', 'FOCUS_LAYER_EXTRA_HIGHLIGHTS', 'function getHighlightLimit', 'activeLayerCount + FOCUS_LAYER_EXTRA_HIGHLIGHTS', 'function hasActiveVisualLayer', "region === 'popover' || region === 'dialog'"]) {
		if (!visual.includes(expected)) {
			throw new Error(`visual highlight selection should focus current dialog/popover layers: missing ${expected}`)
		}
	}
	if (!hitClassFn.includes("state === 'covered'") || !hitClassFn.includes("state === 'partial'")) {
		throw new Error('visual hit classes should distinguish covered and partial targets')
	}
	if (!visual.includes('.nc-index-box.nc-hit-covered') || !visual.includes('.nc-index-label.nc-hit-partial')) {
		throw new Error('visual CSS should make covered/partial index highlights visibly different')
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
	if (!plannerTests.isTaskTargetLocation('http://example.test/#/module/account', 'http://example.test/#/module/account')) {
		throw new Error('SPA hash target should match the same hash route')
	}
	if (plannerTests.isTaskTargetLocation('http://example.test/#/wel/index', 'http://example.test/#/module/account')) {
		throw new Error('SPA hash target should not match a different hash route on the same origin')
	}
	if (plannerTests.extractTargetUrl('打开 (http://example.test/#/module/account)') !== 'http://example.test/#/module/account') {
		throw new Error('target URL extraction should strip trailing closing punctuation')
	}
	if (plannerTests.extractTargetUrl('Open http://example.test/app.') !== 'http://example.test/app') {
		throw new Error('target URL extraction should strip a trailing sentence period')
	}
	if (plannerTests.extractTargetUrl('进入http://116.205.97.39:8201/#/login这个网站，登录账号admin') !== 'http://116.205.97.39:8201/#/login') {
		throw new Error('target URL extraction should stop before trailing Chinese task text')
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
	if (openTarget.action.input.target_label !== 'http://example.test/app' || !String(openTarget.action.input.reason || '').includes('任务目标')) {
		throw new Error(`fast path open_new_tab should declare target label and reason, got ${JSON.stringify(openTarget.action.input)}`)
	}

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
	if (
		switchTarget.action.input.target_label !== 'http://example.test/app#/other' ||
		switchTarget.action.input.target_url !== 'http://example.test/app' ||
		!String(switchTarget.action.input.reason || '').includes('任务目标')
	) {
		throw new Error(`fast path switch_to_tab should declare target tab context, got ${JSON.stringify(switchTarget.action.input)}`)
	}

	const rootTarget = plannerTests.deriveFastPathDecision(
		{ task: '打开 http://example.test/ 并完成页面任务。' },
		{ url: 'http://example.test/redirected' },
		[]
	)
	if (rootTarget !== null) {
		throw new Error('root task URL should allow same-origin redirected pages to continue with AI planning')
	}

	const wrongSpaHashRoute = plannerTests.deriveFastPathDecision(
		{ task: '打开 http://example.test/#/module/account 并完成页面任务。' },
		{ url: 'http://example.test/#/wel/index' },
		[{ id: 43, url: 'http://example.test/#/wel/index', current: true }]
	)
	assertAction(wrongSpaHashRoute, 'open_new_tab')

	const redirectedAfterTargetOpen = plannerTests.deriveFastPathDecision(
		{
			task: '打开 http://example.test/#/module/account 并完成页面任务。',
			history: [
				{
					action: 'open_new_tab',
					input: { url: 'http://example.test/#/module/account' },
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

function assertInitialNavigationBehavior() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/initial-navigation.js', {})
	const initial = sandbox.NC_BG_INITIAL_NAVIGATION
	if (!initial?.deriveInitialAutomationTarget || !initial?.isInitialTargetLocation) {
		throw new Error('initial-navigation test contract is not exported')
	}
	const explicit = initial.deriveInitialAutomationTarget('进入http://116.205.97.39:8201/#/login这个网站，登录账号admin')
	if (explicit?.url !== 'http://116.205.97.39:8201/#/login' || explicit.source !== 'explicit-url') {
		throw new Error(`initial navigation should open the explicit user URL before any fallback page, got ${JSON.stringify(explicit)}`)
	}
	const baiduSearch = initial.deriveInitialAutomationTarget('打开百度搜索黄金价格')
	if (
		baiduSearch?.url !== `https://www.baidu.com/s?wd=${encodeURIComponent('黄金价格')}` ||
		baiduSearch.source !== 'public-search'
	) {
		throw new Error(`initial navigation should derive Baidu search URLs for public search tasks, got ${JSON.stringify(baiduSearch)}`)
	}
	const baiduHome = initial.deriveInitialAutomationTarget('打开百度')
	if (baiduHome?.url !== 'https://www.baidu.com/' || baiduHome.source !== 'public-home') {
		throw new Error(`initial navigation should open public home pages without a query, got ${JSON.stringify(baiduHome)}`)
	}
	const unspecifiedAppTask = initial.deriveInitialAutomationTarget('打开数据单据新增页面，帮我新增一条数据')
	if (unspecifiedAppTask !== null) {
		throw new Error(`initial navigation must not guess unspecified app URLs, got ${JSON.stringify(unspecifiedAppTask)}`)
	}
	if (!initial.isInitialTargetLocation('https://www.baidu.com/s?wd=x', 'https://www.baidu.com/')) {
		throw new Error('initial navigation should treat a public-site root target as reached on the same origin')
	}
	const background = read('naturalclick-extension/background.js')
	if (!background.includes('background/initial-navigation.js')) {
		throw new Error('background should load initial navigation before startup page preparation')
	}
	if (background.includes('FALLBACK_AUTOMATION_URL') || background.includes('已自动打开 Google')) {
		throw new Error('startup should not hard-code Google as the restricted-page fallback')
	}
	if (
		!/prepareControllerTab\(controllerTabId,\s*windowId,\s*task\)/.test(background) ||
		!/deriveInitialAutomationTarget\(taskText\)/.test(background)
	) {
		throw new Error('startup should derive the initial target from the user task before opening a fallback tab')
	}
	const taskIntentPrompt = read('naturalclick-extension/background/task-intent.js')
	if (!taskIntentPrompt.includes('公共搜索任务') || !taskIntentPrompt.includes('未明确给出的应用或后台地址禁止猜测')) {
		throw new Error('task-intent prompt should allow public search URLs but forbid guessing unspecified app URLs')
	}
}

function assertTaskIntentBehavior() {
	const source = read('naturalclick-extension/background/task-intent.js')
	const sandbox = loadBackgroundModule('naturalclick-extension/background/task-intent.js', {})
	const taskIntent = sandbox.NC_BG_TASK_INTENT
	if (!taskIntent?.normalizeTaskIntent || !taskIntent?.shouldRequestTaskIntent || !taskIntent?.deriveHeuristicTaskIntent) {
		throw new Error('task-intent test contract is not exported')
	}
	if (taskIntent.TASK_INTENT_VERSION < 13) {
		throw new Error(`task-intent normalization changes should invalidate cached old intents, got version=${taskIntent.TASK_INTENT_VERSION}`)
	}
	const prompt = taskIntent.buildTaskIntentSystemPrompt()
	if (!prompt.includes('navigationTargets 必须为空') || !prompt.includes('recordSelector.entity')) {
		throw new Error('task-intent prompt should tell the model not to turn generic record objects into navigation targets')
	}
	if (!prompt.includes('创建一个 X/新增一条 X/编辑一个 X') || !prompt.includes('X 只是要创建的对象')) {
		throw new Error('task-intent prompt should distinguish create/edit objects from page navigation targets')
	}
	if (!prompt.includes('不要把“每一个/所有/全部/搜索功能/搜索项/筛选条件”当导航目标')) {
		throw new Error('task-intent prompt should tell the model not to turn generic search-test objects into navigation targets')
	}
	if (!prompt.includes('go/open/navigate to X and test/check every filter/search field')) {
		throw new Error('task-intent prompt should cover English navigation-plus-search-test clauses')
	}
	if (!prompt.includes('operationScope') || !prompt.includes('all_matching_controls')) {
		throw new Error('task-intent prompt should expose generic operation coverage scope for all-field search tests')
	}
	if (!prompt.includes('登录账号/密码只用于登录') || !prompt.includes('不要重复放入 formData')) {
		throw new Error('task-intent prompt should keep login credentials out of later formData')
	}
	if (/\/管理\$\/|replace\(\s*\/管理/.test(source)) {
		throw new Error('task-intent should not manufacture navigation aliases from management suffixes; leave suffix matching to generic navigation matching')
	}
	const leakedLoginCredentialForm = taskIntent.normalizeTaskIntent({
		auth: { username: 'admin', password: '123456' },
		navigationTargets: [{ raw: '设置页面', canonical: '设置', aliases: ['设置'] }],
		operation: 'fill_form',
		formData: { 账号: 'admin', 密码: '123456', 手机号: '13800138000' },
	}, '打开 http://example.test 账号 admin 密码 123456，进入设置页面，填写手机号为 13800138000')
	if (
		leakedLoginCredentialForm.formData?.账号 ||
		leakedLoginCredentialForm.formData?.密码 ||
		leakedLoginCredentialForm.formData?.手机号 !== '13800138000'
	) {
		throw new Error(`task-intent should drop login credentials from later formData while preserving explicit page fields, got ${JSON.stringify(leakedLoginCredentialForm.formData)}`)
	}
	const textOnlyLoginCredentialForm = taskIntent.normalizeTaskIntent({
		auth: {},
		navigationTargets: [{ raw: '设置页面', canonical: '设置', aliases: ['设置'] }],
		operation: 'fill_form',
		formData: { 账号: 'admin', 密码: '123456', 手机号: '13800138000' },
	}, '打开 http://example.test 账号 admin 密码 123456，进入设置页面，填写手机号为 13800138000')
	if (textOnlyLoginCredentialForm.auth?.username !== 'admin' || textOnlyLoginCredentialForm.auth?.password !== '123456') {
		throw new Error(`task-intent should extract explicit login credentials into auth, got ${JSON.stringify(textOnlyLoginCredentialForm.auth)}`)
	}
	if (textOnlyLoginCredentialForm.formData?.账号 || textOnlyLoginCredentialForm.formData?.密码) {
		throw new Error(`task-intent should also infer obvious task-login credentials when filtering formData, got ${JSON.stringify(textOnlyLoginCredentialForm.formData)}`)
	}
	const nonAuthCreateCredentialForm = taskIntent.normalizeTaskIntent({
		auth: {},
		operation: 'create',
		formData: { 登录账号: 'nanobot', 密码: 'abc123' },
	}, '打开 http://example.test，进入设置页面，创建一个账号，登录账号是 nanobot，密码是 abc123')
	if (nonAuthCreateCredentialForm.auth?.username || nonAuthCreateCredentialForm.auth?.password) {
		throw new Error(`task-intent should not treat create-form account/password assignments as login auth, got ${JSON.stringify(nonAuthCreateCredentialForm.auth)}`)
	}
	const punctuatedNavigationCreate = taskIntent.deriveHeuristicTaskIntent('打开 http://example.test，进入设置页面，创建一个账号，登录账号是 nanobot，密码是 abc123')
	const punctuatedNavigationSession = {
		task: '打开 http://example.test，进入设置页面，创建一个账号，登录账号是 nanobot，密码是 abc123',
		latestTask: '打开 http://example.test，进入设置页面，创建一个账号，登录账号是 nanobot，密码是 abc123',
		workflowState: {},
	}
	taskIntent.storeTaskIntent(punctuatedNavigationSession, punctuatedNavigationCreate, { model: 'local-heuristic' })
	const punctuatedNavigationKeys = taskIntent.getNavigationTargetKeys(punctuatedNavigationSession)
	if (!punctuatedNavigationKeys.includes('设置') || punctuatedNavigationKeys.some((key) => /^[，。；;、,.!?！？:：]/.test(key))) {
		throw new Error(`task-intent should trim leading punctuation from navigation aliases, got intent=${JSON.stringify(punctuatedNavigationCreate)} keys=${JSON.stringify(punctuatedNavigationKeys)}`)
	}
	const explicitCreateCredentialForm = taskIntent.normalizeTaskIntent({
		auth: { username: 'admin', password: '123456' },
		navigationTargets: [{ raw: '账号设置页面', canonical: '账号设置', aliases: ['账号设置'] }],
		operation: 'create',
		formData: { 登录账号: 'nanobot', 密码: 'abc123' },
	}, '打开 http://example.test 账号 admin 密码 123456，进入账号设置页面，创建一个账号，登录账号是 nanobot，密码是 abc123')
	if (
		explicitCreateCredentialForm.formData?.登录账号 !== 'nanobot' ||
		explicitCreateCredentialForm.formData?.密码 !== 'abc123'
	) {
		throw new Error(`task-intent should preserve explicitly requested non-login account form fields, got ${JSON.stringify(explicitCreateCredentialForm.formData)}`)
	}
	const explicitSameValueCredentialForm = taskIntent.normalizeTaskIntent({
		auth: { username: 'admin', password: '123456' },
		navigationTargets: [{ raw: '账号设置页面', canonical: '账号设置', aliases: ['账号设置'] }],
		operation: 'create',
		formData: { 登录账号: 'admin', 密码: '123456' },
	}, '打开 http://example.test 账号 admin 密码 123456，进入账号设置页面，创建一个账号，登录账号是 admin，密码是 123456')
	if (
		explicitSameValueCredentialForm.formData?.登录账号 !== 'admin' ||
		explicitSameValueCredentialForm.formData?.密码 !== '123456'
	) {
		throw new Error(`task-intent should preserve same-value credentials when the later form assignment is explicit, got ${JSON.stringify(explicitSameValueCredentialForm.formData)}`)
	}
	const task = '打开数据单据新增页面，帮我新增一条数据'
	const normalized = taskIntent.normalizeTaskIntent({
		navigationTargets: [
			{
				raw: '数据单据新增页面',
				canonical: '数据单据新增页面',
				aliases: ['数据单据', '数据单据管理', '单据'],
				entity: '数据单据',
			},
		],
		operation: 'create',
		forbiddenNavigationTargets: ['数据单据新增', '数据单据新增页面', '新增页面'],
	}, task)
	if (normalized.operation !== 'create') {
		throw new Error(`task-intent should preserve create operation, got ${JSON.stringify(normalized)}`)
	}
	if (normalized.navigationTargets.some((target) => Object.prototype.hasOwnProperty.call(target, 'moduleType'))) {
		throw new Error(`task-intent should drop domain moduleType classifications, got ${JSON.stringify(normalized.navigationTargets)}`)
	}
	const session = {
		task,
		latestTask: task,
		workflowState: {},
	}
	taskIntent.storeTaskIntent(session, normalized, { model: 'fake-model' })
	const keys = taskIntent.getNavigationTargetKeys(session)
	const forbidden = taskIntent.getForbiddenNavigationTargetKeys(session)
	if (!keys.includes('数据单据') || keys.includes('数据单据新增')) {
		throw new Error(`task-intent navigation aliases should route to the base module, got keys=${JSON.stringify(keys)}`)
	}
	if (!forbidden.includes('数据单据新增')) {
		throw new Error(`task-intent should keep action-compound labels forbidden, got forbidden=${JSON.stringify(forbidden)}`)
	}
	const heuristic = taskIntent.deriveHeuristicTaskIntent(task)
	if (
		heuristic?.operation !== 'create' ||
		!heuristic.navigationTargets?.some((target) => target.canonical === '数据单据') ||
		!heuristic.forbiddenNavigationTargets?.includes('数据单据新增')
	) {
		throw new Error(`task-intent heuristic should split create-page wording, got ${JSON.stringify(heuristic)}`)
	}
	const documentCreate = taskIntent.deriveHeuristicTaskIntent('打开数据单据页面，创建一个数据单据')
	const documentCreateSession = { task: '打开数据单据页面，创建一个数据单据', latestTask: '打开数据单据页面，创建一个数据单据', workflowState: {} }
	taskIntent.storeTaskIntent(documentCreateSession, documentCreate, { model: 'local-heuristic' })
	const documentCreateKeys = taskIntent.getNavigationTargetKeys(documentCreateSession)
	if (
		documentCreate?.operation !== 'create' ||
		!documentCreateKeys.includes('数据单据') ||
		documentCreateKeys.includes('数据单据管理') ||
		documentCreateKeys.includes('经办') ||
		documentCreateKeys.includes('一个经办') ||
		documentCreateKeys.includes('经办管理')
	) {
		throw new Error(`task-intent heuristic should keep the full compound module without inventing management aliases, got intent=${JSON.stringify(documentCreate)} keys=${JSON.stringify(documentCreateKeys)}`)
	}
	const recordCreateTask = '打开 http://example.test/ 找到资料管理。你现在帮我新建一条资料数据，资料名称是张三。'
	const recordCreate = taskIntent.deriveHeuristicTaskIntent(recordCreateTask)
	const recordCreateSession = { task: recordCreateTask, latestTask: recordCreateTask, workflowState: {} }
	taskIntent.storeTaskIntent(recordCreateSession, recordCreate, { model: 'local-heuristic' })
	const recordCreateKeys = taskIntent.getNavigationTargetKeys(recordCreateSession)
	if (
		recordCreate?.operation !== 'create' ||
		!recordCreateKeys.includes('资料管理') ||
		recordCreateKeys.includes('资料') ||
		recordCreateKeys.some((key) => /现在帮我|一条资料|资料管理管理/.test(key))
	) {
		throw new Error(`task-intent heuristic should ignore helper/count phrases in record create tasks, got intent=${JSON.stringify(recordCreate)} keys=${JSON.stringify(recordCreateKeys)}`)
	}
	const exportedCustomerTask = '打开这个页面 http://116.205.97.39:8201/ 账号 admin 密码 123456 找到资料管理。你现在帮我新建一条资料数据，资料名称是张三，联系方式是145555555 纳税人识别号是IOOO123456 资料等级是核心，资料性质是IT，产品类别是：民品件，资料所在地是江苏省，南京市，江宁区'
	const exportedCustomer = taskIntent.deriveHeuristicTaskIntent(exportedCustomerTask)
	const exportedCustomerSession = { task: exportedCustomerTask, latestTask: exportedCustomerTask, workflowState: {} }
	taskIntent.storeTaskIntent(exportedCustomerSession, exportedCustomer, { model: 'local-heuristic' })
	const exportedCustomerKeys = taskIntent.getNavigationTargetKeys(exportedCustomerSession)
	if (
		exportedCustomer?.operation !== 'create' ||
		exportedCustomer.auth?.username !== 'admin' ||
		exportedCustomer.auth?.password !== '123456' ||
		!exportedCustomerKeys.includes('资料管理') ||
		exportedCustomerKeys.includes('资料') ||
		exportedCustomerKeys.some((key) => /现在帮我|一条资料|地是江苏省|资料管理管理/.test(key))
	) {
		throw new Error(`task-intent heuristic should keep exported record-create task focused on the record module, got intent=${JSON.stringify(exportedCustomer)} keys=${JSON.stringify(exportedCustomerKeys)}`)
	}
	const genericCreate = taskIntent.deriveHeuristicTaskIntent('打开 http://example.test/app，帮我新增一条数据')
	if (genericCreate?.navigationTargets?.length) {
		throw new Error(`task-intent heuristic should not invent a module for generic create-data tasks, got ${JSON.stringify(genericCreate)}`)
	}
	const implicitObjectCreate = taskIntent.deriveHeuristicTaskIntent('创建一个项目，名称是 demo')
	const implicitObjectCreateSession = {
		task: '创建一个项目，名称是 demo',
		latestTask: '创建一个项目，名称是 demo',
		workflowState: {},
	}
	taskIntent.storeTaskIntent(implicitObjectCreateSession, implicitObjectCreate, { model: 'local-heuristic' })
	const implicitObjectCreateKeys = taskIntent.getNavigationTargetKeys(implicitObjectCreateSession)
	if (implicitObjectCreate?.operation !== 'create' || implicitObjectCreateKeys.length !== 0) {
		throw new Error(`task-intent heuristic should not turn create-object names into navigation targets without page context, got intent=${JSON.stringify(implicitObjectCreate)} keys=${JSON.stringify(implicitObjectCreateKeys)}`)
	}
	const pageScopedObjectCreate = taskIntent.deriveHeuristicTaskIntent('打开配置页面，创建一个项目')
	const pageScopedObjectCreateSession = {
		task: '打开配置页面，创建一个项目',
		latestTask: '打开配置页面，创建一个项目',
		workflowState: {},
	}
	taskIntent.storeTaskIntent(pageScopedObjectCreateSession, pageScopedObjectCreate, { model: 'local-heuristic' })
	const pageScopedObjectCreateKeys = taskIntent.getNavigationTargetKeys(pageScopedObjectCreateSession)
	if (
		pageScopedObjectCreate?.operation !== 'create' ||
		!pageScopedObjectCreateKeys.includes('配置') ||
		pageScopedObjectCreateKeys.includes('项目')
	) {
		throw new Error(`task-intent heuristic should keep the explicit page target and drop the create-object target, got intent=${JSON.stringify(pageScopedObjectCreate)} keys=${JSON.stringify(pageScopedObjectCreateKeys)}`)
	}
	const normalizedImplicitObjectCreate = taskIntent.normalizeTaskIntent({
		navigationTargets: [{ raw: '创建一个项目', canonical: '项目', aliases: ['项目'], entity: '项目' }],
		operation: 'create',
	}, '创建一个项目，名称是 demo')
	const normalizedImplicitObjectCreateSession = {
		task: '创建一个项目，名称是 demo',
		latestTask: '创建一个项目，名称是 demo',
		workflowState: {},
	}
	taskIntent.storeTaskIntent(normalizedImplicitObjectCreateSession, normalizedImplicitObjectCreate, { model: 'fake-model' })
	const normalizedImplicitObjectCreateKeys = taskIntent.getNavigationTargetKeys(normalizedImplicitObjectCreateSession)
	if (normalizedImplicitObjectCreateKeys.length !== 0) {
		throw new Error(`task-intent should drop model-provided create-object navigation targets without page context, got intent=${JSON.stringify(normalizedImplicitObjectCreate)} keys=${JSON.stringify(normalizedImplicitObjectCreateKeys)}`)
	}
	const explicitCreatePage = taskIntent.deriveHeuristicTaskIntent('打开项目新增页面，创建一个项目')
	const explicitCreatePageSession = {
		task: '打开项目新增页面，创建一个项目',
		latestTask: '打开项目新增页面，创建一个项目',
		workflowState: {},
	}
	taskIntent.storeTaskIntent(explicitCreatePageSession, explicitCreatePage, { model: 'local-heuristic' })
	const explicitCreatePageKeys = taskIntent.getNavigationTargetKeys(explicitCreatePageSession)
	if (!explicitCreatePageKeys.includes('项目')) {
		throw new Error(`task-intent should preserve explicit create-page navigation targets, got intent=${JSON.stringify(explicitCreatePage)} keys=${JSON.stringify(explicitCreatePageKeys)}`)
	}
	const normalizedGenericRecordDetail = taskIntent.normalizeTaskIntent({
		navigationTargets: [
			{ raw: '查看列表第一条记录详情', canonical: '记录', aliases: ['列表第一条记录', '记录'], entity: '记录' },
		],
		operation: 'view_first_record_detail',
		recordSelector: { position: 'first', entity: '记录' },
	}, '查看列表第一条记录详情')
	const normalizedGenericRecordSession = {
		task: '查看列表第一条记录详情',
		latestTask: '查看列表第一条记录详情',
		workflowState: {},
	}
	taskIntent.storeTaskIntent(normalizedGenericRecordSession, normalizedGenericRecordDetail, { model: 'fake-model' })
	const normalizedGenericRecordKeys = taskIntent.getNavigationTargetKeys(normalizedGenericRecordSession)
	if (
		normalizedGenericRecordDetail?.operation !== 'view_first_record_detail' ||
		normalizedGenericRecordKeys.length !== 0
	) {
		throw new Error(`task-intent should drop model-provided generic record navigation targets when no page/module target is explicit, got intent=${JSON.stringify(normalizedGenericRecordDetail)} keys=${JSON.stringify(normalizedGenericRecordKeys)}`)
	}
	for (const [taskText, intent] of [
		['测试每一个搜索功能是否正常', { navigationTargets: [{ raw: '每一个搜索功能', canonical: '搜索功能', aliases: ['搜索功能', '搜索项'] }], operation: 'search' }],
		['测试所有筛选条件是否正常', { navigationTargets: [{ raw: '所有筛选条件', canonical: '筛选条件', aliases: ['筛选条件'] }], operation: 'search' }],
	]) {
		const normalizedGenericSearch = taskIntent.normalizeTaskIntent(intent, taskText)
		const normalizedGenericSearchSession = { task: taskText, latestTask: taskText, workflowState: {} }
		taskIntent.storeTaskIntent(normalizedGenericSearchSession, normalizedGenericSearch, { model: 'fake-model' })
		const normalizedGenericSearchKeys = taskIntent.getNavigationTargetKeys(normalizedGenericSearchSession)
		if (normalizedGenericSearch.operationScope !== 'all_matching_controls') {
			throw new Error(`task-intent should preserve all-field search coverage scope, got task=${taskText} intent=${JSON.stringify(normalizedGenericSearch)}`)
		}
		if (normalizedGenericSearchKeys.length !== 0) {
			throw new Error(`task-intent should drop model-provided generic search-test navigation targets, got task=${taskText} intent=${JSON.stringify(normalizedGenericSearch)} keys=${JSON.stringify(normalizedGenericSearchKeys)}`)
		}
	}
	const explicitBareRecordPage = taskIntent.deriveHeuristicTaskIntent('进入资料页面，查看第一条资料详情')
	const explicitBareRecordSession = {
		task: '进入资料页面，查看第一条资料详情',
		latestTask: '进入资料页面，查看第一条资料详情',
		workflowState: {},
	}
	taskIntent.storeTaskIntent(explicitBareRecordSession, explicitBareRecordPage, { model: 'local-heuristic' })
	const explicitBareRecordKeys = taskIntent.getNavigationTargetKeys(explicitBareRecordSession)
	if (
		explicitBareRecordPage?.operation !== 'view_first_record_detail' ||
		!explicitBareRecordKeys.includes('资料')
	) {
		throw new Error(`task-intent should preserve explicit short page names like 资料 instead of stripping them as generic suffixes, got intent=${JSON.stringify(explicitBareRecordPage)} keys=${JSON.stringify(explicitBareRecordKeys)}`)
	}
	const normalizedBareRecord = taskIntent.normalizeTaskIntent({
		navigationTargets: [{ raw: '资料页面', canonical: '资料', aliases: ['资料'] }],
		operation: 'view_first_record_detail',
		recordSelector: { position: 'first', entity: '资料' },
	}, '进入资料页面，查看第一条资料详情')
	const normalizedBareRecordSession = {
		task: '进入资料页面，查看第一条资料详情',
		latestTask: '进入资料页面，查看第一条资料详情',
		workflowState: {},
	}
	taskIntent.storeTaskIntent(normalizedBareRecordSession, normalizedBareRecord, { model: 'fake-model' })
	const normalizedBareRecordKeys = taskIntent.getNavigationTargetKeys(normalizedBareRecordSession)
	if (!normalizedBareRecordKeys.includes('资料')) {
		throw new Error(`model-provided short navigation names should be preserved, got intent=${JSON.stringify(normalizedBareRecord)} keys=${JSON.stringify(normalizedBareRecordKeys)}`)
	}
	if (taskIntent.shouldRequestTaskIntent(session)) {
		throw new Error('task-intent should not request the model again after a ready intent for the same task')
	}
	const nextSession = { task, latestTask: `${task}，备注改一下`, workflowState: session.workflowState }
	if (!taskIntent.shouldRequestTaskIntent(nextSession)) {
		throw new Error('task-intent should request again when latestTask changes')
	}
	const plainSession = { task: '打开 http://example.test/app 并在搜索框输入 hello。', latestTask: '打开 http://example.test/app 并在搜索框输入 hello。', workflowState: {} }
	if (taskIntent.shouldRequestTaskIntent(plainSession)) {
		throw new Error('task-intent should skip simple page field tasks that do not need semantic decomposition')
	}
	const genericSearchTask = '测试搜索区域每一个搜索项'
	const genericSearchIntent = taskIntent.deriveHeuristicTaskIntent(genericSearchTask)
	const genericSearchSession = { task: genericSearchTask, latestTask: genericSearchTask, workflowState: {} }
	if (!taskIntent.shouldRequestTaskIntent(genericSearchSession)) {
		throw new Error('task-intent should treat no-target all-search-field testing as a structured local operation task')
	}
	taskIntent.storeTaskIntent(genericSearchSession, genericSearchIntent, { model: 'local-heuristic' })
	const genericSearchKeys = taskIntent.getNavigationTargetKeys(genericSearchSession)
	const genericSearchHints = taskIntent.buildTaskIntentHintLines(genericSearchSession).join('\n')
	if (
		genericSearchIntent?.operation !== 'search' ||
		genericSearchIntent.operationScope !== 'all_matching_controls' ||
		genericSearchKeys.length !== 0 ||
		!genericSearchHints.includes('operation="search"') ||
		!genericSearchHints.includes('scope="all_matching_controls"')
	) {
		throw new Error(`task-intent should preserve operation-only all-field search tests without navigation noise, got intent=${JSON.stringify(genericSearchIntent)} keys=${JSON.stringify(genericSearchKeys)} hints=${genericSearchHints}`)
	}
	const recordSearchTask = '打开这个页面 http://example.test/ 账号 admin 密码 123456 找到资料管理。你现在帮我测试一下资料管理的每一个搜索功能是否正常实现。'
	const recordSearchIntent = taskIntent.deriveHeuristicTaskIntent(recordSearchTask)
	const recordSearchSession = { task: recordSearchTask, latestTask: recordSearchTask, workflowState: {} }
	if (!taskIntent.shouldRequestTaskIntent(recordSearchSession)) {
		throw new Error('task-intent should treat named-module search testing as a structured page task')
	}
	taskIntent.storeTaskIntent(recordSearchSession, recordSearchIntent, { model: 'local-heuristic' })
	const recordSearchKeys = taskIntent.getNavigationTargetKeys(recordSearchSession)
	if (
		recordSearchIntent?.operation !== 'search' ||
		recordSearchIntent.operationScope !== 'all_matching_controls' ||
		!recordSearchKeys.includes('资料管理') ||
		recordSearchKeys.includes('资料') ||
		recordSearchKeys.some((key) => /搜索区域|搜索功能|每一个搜索/.test(key))
	) {
		throw new Error(`task-intent heuristic should recognize named-module search testing without treating search controls as navigation targets, got intent=${JSON.stringify(recordSearchIntent)} keys=${JSON.stringify(recordSearchKeys)}`)
	}
	const recordSearchHints = taskIntent.buildTaskIntentHintLines(recordSearchSession).join('\n')
	if (!recordSearchHints.includes('operation="search"') || !recordSearchHints.includes('scope="all_matching_controls"')) {
		throw new Error(`task-intent hints should expose all-field search coverage scope, got ${recordSearchHints}`)
	}
	if (taskIntent.shouldRequestTaskIntent(recordSearchSession)) {
		throw new Error('task-intent should not request the model again after storing heuristic search-test intent')
	}
	const englishSearchTask = 'test every filter/search field on the report page'
	const englishSearchIntent = taskIntent.deriveHeuristicTaskIntent(englishSearchTask)
	const englishSearchSession = { task: englishSearchTask, latestTask: englishSearchTask, workflowState: {} }
	taskIntent.storeTaskIntent(englishSearchSession, englishSearchIntent, { model: 'local-heuristic' })
	const englishSearchKeys = taskIntent.getNavigationTargetKeys(englishSearchSession)
	if (
		englishSearchIntent?.operation !== 'search' ||
		englishSearchIntent.operationScope !== 'all_matching_controls' ||
		!englishSearchKeys.includes('report') ||
		englishSearchKeys.some((key) => /search|filter|every|field|on/.test(key))
	) {
		throw new Error(`task-intent heuristic should parse generic English all-search-field tasks without search-control navigation noise, got intent=${JSON.stringify(englishSearchIntent)} keys=${JSON.stringify(englishSearchKeys)}`)
	}
	const englishNavThenSearchTask = 'Go to Reports and test every filter'
	const englishNavThenSearchIntent = taskIntent.deriveHeuristicTaskIntent(englishNavThenSearchTask)
	const englishNavThenSearchSession = { task: englishNavThenSearchTask, latestTask: englishNavThenSearchTask, workflowState: {} }
	taskIntent.storeTaskIntent(englishNavThenSearchSession, englishNavThenSearchIntent, { model: 'local-heuristic' })
	const englishNavThenSearchKeys = taskIntent.getNavigationTargetKeys(englishNavThenSearchSession)
	if (
		englishNavThenSearchIntent?.operation !== 'search' ||
		englishNavThenSearchIntent.operationScope !== 'all_matching_controls' ||
		!englishNavThenSearchKeys.includes('reports') ||
		englishNavThenSearchKeys.some((key) => /test|every|filter|search|field|and/.test(key))
	) {
		throw new Error(`task-intent heuristic should split English "go to X and test every filter" clauses, got intent=${JSON.stringify(englishNavThenSearchIntent)} keys=${JSON.stringify(englishNavThenSearchKeys)}`)
	}
	const genericPageTask = 'Open the Pricing page and then go to Settings screen. 进入帮助页面，然后搜索 FAQ。'
	const genericPageIntent = taskIntent.deriveHeuristicTaskIntent(genericPageTask)
	const genericPageSession = { task: genericPageTask, latestTask: genericPageTask, workflowState: {} }
	taskIntent.storeTaskIntent(genericPageSession, genericPageIntent, { model: 'local-heuristic' })
	const genericPageKeys = taskIntent.getNavigationTargetKeys(genericPageSession)
	for (const expected of ['pricing', 'settings', '帮助']) {
		if (!genericPageKeys.includes(expected)) {
			throw new Error(`task-intent heuristic should extract generic page/section target ${expected}, got intent=${JSON.stringify(genericPageIntent)} keys=${JSON.stringify(genericPageKeys)}`)
		}
	}
	if (genericPageKeys.some((key) => /faq|http|password|账号|密码|管理/i.test(key))) {
		throw new Error(`task-intent heuristic should not treat search terms, URLs, credentials, or invented management aliases as navigation targets, got ${JSON.stringify(genericPageKeys)}`)
	}
	const firstDetail = taskIntent.normalizeTaskIntent({
		navigationTargets: [{ raw: '资料管理页面', canonical: '资料管理', aliases: ['资料管理', '资料'] }],
		operation: 'view_first_record_detail',
		recordSelector: { position: 'first', entity: '资料' },
	}, '进入资料管理页面，查看第一条资料详情')
	if (firstDetail.operation !== 'view_first_record_detail' || firstDetail.recordSelector.position !== 'first') {
		throw new Error(`task-intent should normalize first-record detail tasks, got ${JSON.stringify(firstDetail)}`)
	}
	const editTask = '进入资料管理，编辑资料资料'
	const editIntent = taskIntent.deriveHeuristicTaskIntent(editTask)
	const editSession = { task: editTask, latestTask: editTask, workflowState: {} }
	taskIntent.storeTaskIntent(editSession, editIntent, { model: 'local-heuristic' })
	const editKeys = taskIntent.getNavigationTargetKeys(editSession)
	const editForbidden = taskIntent.getForbiddenNavigationTargetKeys(editSession)
	if (editIntent?.operation !== 'edit' || !editKeys.includes('资料管理') || !editForbidden.includes('资料管理编辑')) {
		throw new Error(`task-intent heuristic should split edit tasks into navigation target and operation, got intent=${JSON.stringify(editIntent)} keys=${JSON.stringify(editKeys)} forbidden=${JSON.stringify(editForbidden)}`)
	}
	const fillTask = '进入资料管理，填写资料名称为张三'
	const fillIntent = taskIntent.deriveHeuristicTaskIntent(fillTask)
	const fillSession = { task: fillTask, latestTask: fillTask, workflowState: {} }
	taskIntent.storeTaskIntent(fillSession, fillIntent, { model: 'local-heuristic' })
	const fillKeys = taskIntent.getNavigationTargetKeys(fillSession)
	if (fillIntent?.operation !== 'fill_form' || !fillKeys.includes('资料管理')) {
		throw new Error(`task-intent heuristic should recognize fill-form tasks without treating fields as navigation targets, got intent=${JSON.stringify(fillIntent)} keys=${JSON.stringify(fillKeys)}`)
	}
}

async function assertPlannerUsesModelDecisionOnTarget() {
	const modelDecision = {
		evaluation_previous_goal: '页面已观察完成。',
		memory: '当前页面有一个搜索输入框。',
		thought: '根据 forms 中的搜索字段执行输入。',
		next_goal: '在搜索框输入查询词。',
		action: { name: 'input_text', input: { index: 3, text: 'hello', target_label: '搜索' } },
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
				'- input_text: 向当前观察结果中的可编辑元素输入文本 input={index:number|required,text:string|required,target_label:string|required}',
				'- click_element_by_index: 点击当前观察结果中的指定元素索引 input={index:number|required,target_label:string|required}',
				'- select_dropdown_option: 兼容旧动作；选择时必须提供 index，只有 index 时展开下拉框 input={index:number|optional,text:string|optional}',
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

async function assertPlannerTaskIntentBeforeNavigation() {
	const fetchBodies = []
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
				'- click_element_by_index: 点击当前观察结果中的指定元素索引 input={index:number|required, target_label:string|required}',
			],
		},
		chrome: {
			tabs: {
				query: async () => [
					{ id: 1, title: 'Example', url: 'http://example.test/app', current: true },
				],
			},
		},
		fetch: async (_url, init) => {
			const body = JSON.parse(init.body)
			fetchBodies.push(body)
			return fakeJsonResponse({
				url: null,
				auth: { username: null, password: null },
				navigationTargets: [
					{
						raw: '流程单据',
						canonical: '流程单据',
						aliases: ['流程单据', '流程单据管理'],
						entity: '流程单据',
					},
				],
				operation: 'create',
				recordSelector: { position: null, index: null, entity: null },
				formData: {},
				createEntryLabels: ['新增', '新建', '添加'],
				detailEntryLabels: ['详情', '查看'],
				forbiddenNavigationTargets: ['流程单据新增', '新增页面'],
				notes: '先进入流程单据模块，再新增。',
			})
		},
		AbortController,
	})
	const session = {
		windowId: 1,
		currentTabId: 1,
		step: 1,
		task: '打开 http://example.test/app，请到流程单据按页面规则新增一条数据',
		latestTask: '打开 http://example.test/app，请到流程单据按页面规则新增一条数据',
		config: {
			textLLM: {
				baseURL: 'http://model.test/v1',
				model: 'fake-model',
				apiKey: '',
			},
		},
		history: [],
		traceItems: [],
		workflowState: {},
	}
	const decision = await sandbox.NC_BG_PLANNER.planAction(
		session,
		{
			url: 'http://example.test/app',
			title: '首页',
			forms: [],
			actions: [
				{ index: 9, region: 'sidebar', role: 'menuitem', label: '流程单据', rect: { left: 0, top: 120, width: 160, height: 44 } },
			],
			options: [],
			popups: [],
			panels: [],
			elements: [],
			simplifiedDom: [],
			rawCandidates: [],
		}
	)
	assertAction(decision, 'click_element_by_index')
	if (
		decision.action.input.index !== 9 ||
		decision.action.input.workflow !== 'task-navigation' ||
		decision.action.input.workflow_nav_key !== '流程单据'
	) {
		throw new Error(`planner should use task-intent navigation targets before generic planning, got ${JSON.stringify(decision)}`)
	}
	if (fetchBodies.length !== 1 || !getSystemMessageText(fetchBodies[0]).includes('任务理解器')) {
		throw new Error(`planner should call the task-intent model once before navigation, got ${fetchBodies.length} calls`)
	}
	if (session.workflowState.taskIntent?.status !== 'ready') {
		throw new Error(`planner should store ready task intent state, got ${JSON.stringify(session.workflowState.taskIntent)}`)
	}
	if (!session.traceItems.some((item) => item.title === '模型调用: 任务理解' && item.kind === 'model')) {
		throw new Error(`planner should trace the task-intent call, got ${JSON.stringify(session.traceItems)}`)
	}
}

async function assertPlannerUsesOperationOnlyHeuristicOnLocalSurface() {
	const events = []
	const fetchBodies = []
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
				'- click_element_by_index: 点击当前观察结果中的指定元素索引 input={index:number|required}',
			],
		},
		chrome: {
			tabs: {
				query: async () => [
					{ id: 1, title: 'Example', url: 'http://example.test/app', current: true },
				],
			},
		},
		fetch: async (_url, init) => {
			fetchBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '已看到新增按钮。',
				memory: '点击当前页面新增。',
				thought: '不需要额外任务理解。',
				next_goal: '打开新增表单。',
				action: { name: 'click_element_by_index', input: { index: 21, target_label: '新增' } },
			})
		},
		AbortController,
	})
	const task = '打开 http://example.test/app，帮我新增一条数据'
	const session = {
		windowId: 1,
		currentTabId: 1,
		step: 1,
		task,
		latestTask: task,
		config: {
			textLLM: {
				baseURL: 'http://model.test/v1',
				model: 'fake-model',
				apiKey: '',
			},
		},
		history: [],
		traceItems: [],
		workflowState: {},
	}
	const decision = await sandbox.NC_BG_PLANNER.planAction(
		session,
		{
			url: 'http://example.test/app',
			title: '列表页',
			forms: [],
			actions: [
				{ index: 21, region: 'content', role: 'button', label: '新增', actionIntent: 'create', rect: { left: 20, top: 120, width: 80, height: 32 } },
			],
			options: [],
			popups: [],
			panels: [],
			elements: [],
			simplifiedDom: [],
			rawCandidates: [],
		},
		{ onProgress: (event) => events.push(event) }
	)
	assertAction(decision, 'click_element_by_index')
	if (fetchBodies.length !== 1 || getSystemMessageText(fetchBodies[0]).includes('任务理解器')) {
		throw new Error(`operation-only local surface should skip task-intent model and use normal planner once, got fetchCalls=${fetchBodies.length}`)
	}
	if (
		session.workflowState.taskIntent?.model !== 'local-heuristic' ||
		session.workflowState.taskIntent?.intent?.operation !== 'create' ||
		session.workflowState.taskIntent?.intent?.navigationTargets?.length
	) {
		throw new Error(`operation-only local surface should store a generic local task intent without inventing navigation targets, got ${JSON.stringify(session.workflowState.taskIntent)}`)
	}
	if (!events.some((event) => event.stage === 'task_intent_heuristic' && String(event.text || '').includes('不等待任务理解模型'))) {
		throw new Error(`operation-only local intent should publish progress, got ${JSON.stringify(events)}`)
	}
}

async function assertPlannerHeuristicTaskIntentBeforeNavigation() {
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
				'- click_element_by_index: 点击当前观察结果中的指定元素索引 input={index:number|required}',
			],
		},
		chrome: {
			tabs: {
				query: async () => [
					{ id: 1, title: 'Example', url: 'http://example.test/app', current: true },
				],
			},
		},
		fetch: async () => {
			throw new Error('task-intent model should not be called for obvious create-page wording')
		},
		AbortController,
	})
	const task = '打开 http://example.test/app，打开数据单据新增页面，帮我新增一条数据'
	const session = {
		windowId: 1,
		currentTabId: 1,
		step: 1,
		task,
		latestTask: task,
		config: {
			textLLM: {
				baseURL: 'http://model.test/v1',
				model: 'fake-model',
				apiKey: '',
			},
		},
		history: [],
		traceItems: [],
		workflowState: {},
	}
	const decision = await sandbox.NC_BG_PLANNER.planAction(
		session,
		{
			url: 'http://example.test/app',
			title: '首页',
			forms: [],
			actions: [
				{ index: 11, region: 'sidebar', role: 'menuitem', label: '数据单据', rect: { left: 0, top: 120, width: 160, height: 44 } },
			],
			options: [],
			popups: [],
			panels: [],
			elements: [],
			simplifiedDom: [],
			rawCandidates: [],
		}
	)
	assertAction(decision, 'click_element_by_index')
	if (
		decision.action.input.index !== 11 ||
		decision.action.input.workflow_nav_key !== '数据单据' ||
		session.workflowState.taskIntent?.model !== 'local-heuristic'
	) {
		throw new Error(`planner should use local task-intent heuristic before navigation, got decision=${JSON.stringify(decision)} state=${JSON.stringify(session.workflowState.taskIntent)}`)
	}
	if (!session.traceItems.some((item) => item.title === '模型调用: 任务理解' && item.kind === 'model' && String(item.detail || '').includes('本地启发式'))) {
		throw new Error(`planner should trace local heuristic task-intent, got ${JSON.stringify(session.traceItems)}`)
	}
}

async function assertPlannerHeuristicSearchTaskIntentBeforeNavigation() {
	const events = []
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
				'- click_element_by_index: 点击当前观察结果中的指定元素索引 input={index:number|required}',
			],
		},
		chrome: {
			tabs: {
				query: async () => [
					{ id: 1, title: 'Example', url: 'http://example.test/app', current: true },
				],
			},
		},
		fetch: async () => {
			throw new Error('task-intent model should not be called for obvious named-module search testing')
		},
		AbortController,
	})
	const task = '打开这个页面 http://example.test/ 账号 admin 密码 123456 找到资料管理。你现在帮我测试一下资料管理的每一个搜索功能是否正常实现。'
	const session = {
		windowId: 1,
		currentTabId: 1,
		step: 1,
		task,
		latestTask: task,
		config: {
			textLLM: {
				baseURL: 'http://model.test/v1',
				model: 'fake-model',
				apiKey: '',
			},
		},
		history: [],
		traceItems: [],
		workflowState: {},
	}
	const decision = await sandbox.NC_BG_PLANNER.planAction(
		session,
		{
			url: 'http://example.test/app',
			title: '首页',
			forms: [],
			actions: [
				{ index: 8, region: 'sidebar', role: 'menuitem', label: '资料', rect: { left: 0, top: 120, width: 160, height: 44 } },
				{ index: 23, region: 'content', role: 'button', label: '展开搜索', actionIntent: 'open_filter', rect: { left: 20, top: 120, width: 88, height: 32 } },
			],
			options: [],
			popups: [],
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 23, triggerLabel: '展开搜索' },
			],
			elements: [],
			simplifiedDom: [],
			rawCandidates: [],
		},
		{ onProgress: (event) => events.push(event) }
	)
	assertAction(decision, 'click_element_by_index')
	if (
		decision.action.input.index !== 8 ||
		decision.action.input.workflow !== 'task-navigation' ||
		decision.action.input.workflow_nav_key !== '资料管理' ||
		session.workflowState.taskIntent?.model !== 'local-heuristic' ||
		session.workflowState.taskIntent?.intent?.operation !== 'search'
	) {
		throw new Error(`planner should use local search-test task intent before navigation, got decision=${JSON.stringify(decision)} state=${JSON.stringify(session.workflowState.taskIntent)}`)
	}
	if (!events.some((event) => event.stage === 'task_intent_heuristic' && String(event.text || '').includes('不等待任务理解模型'))) {
		throw new Error(`planner should publish local task-intent heuristic progress, got ${JSON.stringify(events)}`)
	}
	if (!session.traceItems.some((item) => item.title === '模型调用: 任务理解' && item.kind === 'model' && String(item.modelThought || '').includes('operation=search'))) {
		throw new Error(`planner should trace local search-test task intent, got ${JSON.stringify(session.traceItems)}`)
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
				action: { name: 'input_text', input: { index: 3, text: 'retry-ok', target_label: '搜索' } },
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
				action: { name: 'input_text', input: { index: 3, text: 'large-compact-ok', target_label: '搜索' } },
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
	const compactEvent = events.find((event) => event.stage === 'model_compact_request')
	const compactText = String(compactEvent?.text || '')
	for (const expected of ['触发：', 'raw=140/80', '完整≈', '精简≈', '模型=fake-model', '最多等待 60 秒']) {
		if (!compactText.includes(expected)) {
			throw new Error(`large observation compact progress should include ${expected}, got ${compactText}`)
		}
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
	if (plannerTests.shouldStartWithCompactObservation(buildTestObservation({ rawCount: 2 }), 'x'.repeat(8000))) {
		throw new Error('planner should not compact only because observation text is around the previous 7600-char threshold')
	}
	if (plannerTests.shouldStartWithCompactObservation(buildTestObservation({ rawCount: 2 }), 'x'.repeat(102400))) {
		throw new Error('planner should not compact at 102400 chars with the default 262144-char threshold')
	}
	if (!plannerTests.shouldStartWithCompactObservation(buildTestObservation({ rawCount: 2 }), 'x'.repeat(262144))) {
		throw new Error('planner should compact when observation text reaches the default 262144-char safety threshold')
	}
}

async function assertPlannerUsesConfiguredObservationLimits() {
	const fetchBodies = []
	const events = []
	const observation = {
		...buildTestObservation(),
		forms: [],
		actions: [],
		elements: [],
		simplifiedDom: [],
		rawCandidates: Array.from({ length: 36 }, (_, index) => `candidate-${index} ${'x'.repeat(260)}`),
	}
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			fetchBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '配置阈值触发精简上下文。',
				memory: '使用账号配置的规划上下文上限。',
				thought: '观察文本达到账号配置的完整上限，先用精简上下文规划。',
				next_goal: '完成配置测试。',
				action: { name: 'done', input: { text: 'ok', success: true } },
			})
		},
		observation,
		sessionOverrides: {
			config: {
				textLLM: { baseURL: 'http://model.test/v1', model: 'fake-model', apiKey: '' },
				planning: {
					fullObservationMaxChars: 7600,
					compactObservationMaxChars: 1000,
					compactElementThreshold: 999,
					compactRawCandidateThreshold: 30,
				},
			},
		},
		planOptions: {
			onProgress: (event) => events.push(event),
		},
	})
	assertAction(decision.result, 'done')
	if (fetchBodies.length !== 1) {
		throw new Error(`configured observation limits should keep compact-first planning to one request, got ${fetchBodies.length}`)
	}
	const firstUser = getUserMessageText(fetchBodies[0])
	if (!firstUser.includes('omitted="large_observation"')) {
		throw new Error(`configured full observation limit should trigger compact-first planning, got ${firstUser}`)
	}
	const compactText = String(events.find((event) => event.stage === 'model_compact_request')?.text || '')
	if (!compactText.includes('/7600')) {
		throw new Error(`compact progress should report configured full limit, got ${compactText}`)
	}
	if (!compactText.includes('raw=36/30')) {
		throw new Error(`compact progress should report configured raw candidate threshold, got ${compactText}`)
	}
	const plannerTests = loadBackgroundModule('naturalclick-extension/background/planner.js', {
		NC_BG_UTILS: { safeJsonParse: JSON.parse, generateId: () => 'test_id' },
		NC_BG_CONSTANTS: { MAX_TRACE_ITEMS: 80 },
		NC_BG_TOOLS: { getToolPromptLines: () => [] },
		chrome: { tabs: { query: async () => [] } },
		fetch: async () => fakeJsonResponse({ action: { name: 'done', input: { text: 'ok', success: true } } }),
		AbortController,
	}).NC_BG_PLANNER_TESTS
	const configured = plannerTests.getPlanningContextConfig({
		planning: {
			fullObservationMaxChars: 7600,
			compactObservationMaxChars: 999999,
			compactElementThreshold: 12,
			compactRawCandidateThreshold: 20000,
		},
	})
	if (
		configured.fullObservationMaxChars !== 7600 ||
		configured.compactObservationMaxChars !== 7600 ||
		configured.compactElementThreshold !== 20 ||
		configured.compactRawCandidateThreshold !== 10000
	) {
		throw new Error(`planner should clamp compact observation to the full limit when configured too high, got ${JSON.stringify(configured)}`)
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
			action: { name: 'input_text', input: { index: 3, text: 'visible-progress', target_label: '搜索' } },
		}),
		observation: buildTestObservation(),
		planOptions: {
			onProgress: (event) => events.push(event),
		},
	})
	assertAction(decision.result, 'input_text')
	const observationEvent = events.find((event) => event.stage === 'observation_summary')
	const observationText = String(observationEvent?.text || '')
	for (const expected of ['页面观察完成', '字段', '动作', '表格', '上下文≈', '未触发精简']) {
		if (!observationText.includes(expected)) {
			throw new Error(`planner observation summary should expose ${expected}, got ${JSON.stringify(events)}`)
		}
	}
	if (!events.some((event) => event.stage === 'model_request' && /请求模型规划动作/.test(event.text))) {
		throw new Error(`planner should publish initial model request progress, got ${JSON.stringify(events)}`)
	}
	const compactObservationText = decision.sandbox.NC_BG_PLANNER_TESTS.buildObservationSummaryProgressText(
		{ step: 3 },
		buildTestObservation({ rawCount: 130 }),
		'observation text',
		true,
		{ fullObservationMaxChars: 262144, compactObservationMaxChars: 4200, compactElementThreshold: 120, compactRawCandidateThreshold: 80 }
	)
	if (!compactObservationText.includes('将使用精简观察') || !compactObservationText.includes('raw达到')) {
		throw new Error(`planner observation summary should explain compact observation triggers, got ${compactObservationText}`)
	}
	const reasoningOnlyText = decision.sandbox.NC_BG_PLANNER_TESTS.buildModelStreamProgressText(
		{ step: 2 },
		{ content: '', reasoning: '正在分析页面字段和可执行动作', chunkCount: 3 },
		60000
	)
	if (!reasoningOnlyText.includes('仍在推理，尚未输出可执行动作') || !reasoningOnlyText.includes('最多等待 60 秒') || !reasoningOnlyText.includes('页面动作尚未执行')) {
		throw new Error(`planner stream progress should explain why the model still appears busy, got ${reasoningOnlyText}`)
	}
	const heartbeatText = decision.sandbox.NC_BG_PLANNER_TESTS.buildModelWaitHeartbeatText(
		{ step: 2 },
		{
			phase: '模型正在分析页面结构、任务目标和可执行动作',
			elapsedMs: 16000,
			timeoutMs: 60000,
			compact: true,
			contextCount: 1,
			streamSeen: false,
		}
	)
	for (const expected of ['已等待 16/60 秒', '使用精简观察', '已补充 1 段内部上下文', '尚未收到流式片段', '安全检查', '列表样本', '真实候选', '遮挡状态', '避免随机搜索或盲点', '页面动作尚未执行', '仍在等待模型给出可执行 JSON']) {
		if (!heartbeatText.includes(expected)) {
			throw new Error(`planner wait heartbeat should expose ${expected}, got ${heartbeatText}`)
		}
	}
	const workflowHeartbeatText = decision.sandbox.NC_BG_PLANNER_TESTS.buildModelWaitHeartbeatText(
		{
			step: 6,
			workflowState: {
				search: {
					phase: 'awaiting_option',
					activeFieldKey: 'index:31',
					fieldOrder: ['index:25', 'index:31', 'index:37'],
					completedKeys: ['index:25'],
					skippedKeys: [],
					fields: {
						'index:31': {
							label: '状态',
							lastTestValue: '启用',
							lastValueSource: 'table_sample',
						},
					},
				},
			},
		},
		{
			phase: '模型正在确认候选归属和下一步动作',
			elapsedMs: 21000,
			timeoutMs: 60000,
			compact: true,
			contextCount: 2,
			streamSeen: false,
		}
	)
	for (const expected of ['当前搜索工作流', '第 2/3 个搜索项', '字段=状态', '阶段=等待/确认真实候选', '值=启用', '来源=列表样本', '提交后复核并清空', '不猜选项', '页面动作尚未执行']) {
		if (!workflowHeartbeatText.includes(expected)) {
			throw new Error(`planner wait heartbeat should expose active search workflow context with ${expected}, got ${workflowHeartbeatText}`)
		}
	}
	const plannerSource = read('naturalclick-extension/background/planner.js')
	if (
		!plannerSource.includes('MODEL_WAIT_HEARTBEAT_INITIAL_MS = 2500') ||
		!plannerSource.includes('MODEL_WAIT_HEARTBEAT_INTERVAL_MS = 5000') ||
		!plannerSource.includes('function buildWorkflowHeartbeatCheckpoint') ||
		!plannerSource.includes('formatSearchWorkflowHeartbeatPhase')
	) {
		throw new Error('planner should publish model-wait heartbeat early enough that long model calls do not look silent')
	}

	const recordViewBodies = []
	const recordViewEvents = []
	const recordViewDecision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			recordViewBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '缺少列表行证据。',
				memory: '需要先补充列表上下文。',
				thought: '不能直接点击页面上的详情按钮。',
				next_goal: '停止。',
				action: { name: 'done', input: { text: '缺少列表行证据，停止。', success: false } },
			})
		},
		observation: {
			url: 'http://example.test/app#/records',
			title: '列表页',
			forms: [],
			actions: [
				{ index: 50, region: 'content', role: 'button', label: '详情', actionIntent: 'view', rect: { left: 900, top: 220, width: 52, height: 28 } },
			],
			tables: [],
			popups: [],
			elements: [],
		},
		sessionOverrides: {
			task: '查看列表第一条记录详情',
			latestTask: '查看列表第一条记录详情',
			workflowState: {
				taskIntent: {
					operation: 'view_first_record_detail',
					navigationTargets: [],
					recordSelector: { position: 'first', index: null, entity: '' },
				},
			},
		},
		planOptions: {
			onProgress: (event) => recordViewEvents.push(event),
		},
	})
	assertAction(recordViewDecision.result, 'done')
	const recordViewUser = getUserMessageText(recordViewBodies[recordViewBodies.length - 1])
	for (const expected of ['record_view_requirement', 'missing_record_list_evidence', 'request_context source=tables', 'inspect_region content', '不要点击工具栏']) {
		if (!recordViewUser.includes(expected)) {
			throw new Error(`record-view missing list evidence should be model-visible with ${expected}, got ${recordViewUser}`)
		}
	}
	const recordViewAnalysisText = String(recordViewEvents.find((event) => event.stage === 'workflow_analysis')?.text || '')
	for (const expected of ['列表详情任务正在先确认第一条记录', '缺少可见列表/表格行证据', '不会直接点击工具栏']) {
		if (!recordViewAnalysisText.includes(expected)) {
			throw new Error(`record-view missing list evidence should publish visible progress with ${expected}, got ${JSON.stringify(recordViewEvents)}`)
		}
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
				action: { name: 'input_text', input: { index: 3, text: 'compact-progress', target_label: '搜索' } },
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
	const retryCompactEvent = retryEvents.find((event) => event.stage === 'compact_retry')
	const retryCompactText = String(retryCompactEvent?.text || '')
	for (const expected of ['原因：首轮完整上下文超时', '完整≈', '精简≈', '模型=fake-model', '最多等待 60 秒']) {
		if (!retryCompactText.includes(expected)) {
			throw new Error(`compact retry progress should include ${expected}, got ${retryCompactText}`)
		}
	}

	const workflowEvents = []
	let workflowFetchCalls = 0
	const workflowDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			workflowFetchCalls += 1
			throw new Error('model should not be called when deterministic workflow can act')
		},
		observation: {
			...buildTestObservation(),
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9, triggerLabel: '展开搜索' },
			],
			actions: [
				{ index: 9, region: 'content', role: 'button', label: '展开搜索', actionIntent: 'open_filter' },
			],
		},
		sessionOverrides: {
			task: '测试搜索区域每一个搜索项',
			latestTask: '测试搜索区域每一个搜索项',
		},
		planOptions: {
			onProgress: (event) => workflowEvents.push(event),
		},
	})
	assertAction(workflowDecision.result, 'click_element_by_index')
	if (workflowFetchCalls !== 0) {
		throw new Error(`deterministic workflow should avoid model calls, got ${workflowFetchCalls}`)
	}
	const workflowEvent = workflowEvents.find((event) => event.stage === 'workflow_decision')
	const workflowText = String(workflowEvent?.text || '')
	for (const expected of ['正在展开搜索/筛选区域', '展开搜索']) {
		if (!workflowText.includes(expected)) {
			throw new Error(`workflow decision progress should explain deterministic takeover with ${expected}, got ${JSON.stringify(workflowEvents)}`)
		}
	}
	const collapsedAnalysisEvent = workflowEvents.find((event) => event.stage === 'workflow_analysis')
	const collapsedAnalysisText = String(collapsedAnalysisEvent?.text || '')
	for (const expected of ['识别搜索/筛选区域处于折叠状态', '展开搜索', '先展开后再分析字段和列表样本', '不会直接随机测试']) {
		if (!collapsedAnalysisText.includes(expected)) {
			throw new Error(`collapsed search workflow analysis should expose ${expected}, got ${JSON.stringify(workflowEvents)}`)
		}
	}
	const searchFieldProgressEvents = []
	const searchFieldDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			throw new Error('model should not be called when search workflow has table samples')
		},
		observation: {
			...buildTestObservation(),
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,账号姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '账号姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 9, actionIntent: 'reset', label: '重置', region: 'content' },
			],
			tables: [
				{ headers: ['登录账号', '账号姓名'], rows: [['admin', '张三']] },
			],
		},
		sessionOverrides: {
			task: '测试搜索区域每一个搜索项',
			latestTask: '测试搜索区域每一个搜索项',
		},
		planOptions: {
			onProgress: (event) => searchFieldProgressEvents.push(event),
		},
	})
	assertAction(searchFieldDecision.result, 'input_text')
	const searchFieldAnalysisIndex = searchFieldProgressEvents.findIndex((event) => event.stage === 'workflow_analysis')
	const searchFieldDecisionIndex = searchFieldProgressEvents.findIndex((event) => event.stage === 'workflow_decision')
	if (searchFieldAnalysisIndex < 0 || searchFieldDecisionIndex < 0 || searchFieldAnalysisIndex > searchFieldDecisionIndex) {
		throw new Error(`search workflow should publish analysis before deterministic field action, got ${JSON.stringify(searchFieldProgressEvents)}`)
	}
	const searchFieldAnalysisText = String(searchFieldProgressEvents.find((event) => event.stage === 'workflow_analysis')?.text || '')
	for (const expected of ['先分析列表数据', '发现 2 个搜索项', '样本=登录账号:admin', '逐项测试', '先清空条件']) {
		if (!searchFieldAnalysisText.includes(expected)) {
			throw new Error(`sampled search workflow analysis should expose ${expected}, got ${JSON.stringify(searchFieldProgressEvents)}`)
		}
	}
	const searchFieldProgressText = String(searchFieldProgressEvents.find((event) => event.stage === 'workflow_decision')?.text || '')
	for (const expected of ['正在测试第 1/2 个搜索项', '填写「登录账号」', '值=admin', '来源=列表样本']) {
		if (!searchFieldProgressText.includes(expected)) {
			throw new Error(`search workflow progress should expose ${expected}, got ${JSON.stringify(searchFieldProgressEvents)}`)
		}
	}
	const arrivedSearchPreIntentEvents = []
	const arrivedSearchPreIntentDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			throw new Error('model should not be called when arrived search workflow can act before task-intent planning')
		},
		observation: {
			...buildTestObservation(),
			title: '资料管理-样例系统',
			url: 'http://example.test/app#/demo/record',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 35, triggerLabel: '展开搜索' },
			],
			forms: [],
			actions: [
				{ index: 12, region: 'sidebar', role: 'menuitem', label: '资料', valueState: 'selected', rect: { left: 0, top: 120, width: 160, height: 44 } },
				{ index: 35, region: 'content', role: 'button', label: '展开搜索', actionIntent: 'open_filter' },
			],
		},
		sessionOverrides: {
			task: '打开这个页面 http://example.test/ 找到资料管理。你现在帮我测试资料管理的每一个搜索功能是否正常实现。',
			latestTask: '打开这个页面 http://example.test/ 找到资料管理。你现在帮我测试资料管理的每一个搜索功能是否正常实现。',
		},
		planOptions: {
			onProgress: (event) => arrivedSearchPreIntentEvents.push(event),
		},
	})
	assertAction(arrivedSearchPreIntentDecision.result, 'click_element_by_index')
	if (
		arrivedSearchPreIntentDecision.result.action.input.index !== 35 ||
		arrivedSearchPreIntentDecision.result.action.input.workflow !== 'search-fields' ||
		arrivedSearchPreIntentDecision.result.action.input.workflow_step !== 'expand_search_panel'
	) {
		throw new Error(`arrived named-module search workflow should act before task-intent planning, got ${JSON.stringify(arrivedSearchPreIntentDecision.result)}`)
	}
	if (arrivedSearchPreIntentEvents.some((event) => event.stage === 'task_intent_heuristic' || event.stage === 'task_intent_request')) {
		throw new Error(`pre-intent search workflow should not wait for task-intent planning, got ${JSON.stringify(arrivedSearchPreIntentEvents)}`)
	}

	const missingSampleBodies = []
	const missingSampleEvents = []
	const missingSampleDecision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			missingSampleBodies.push(JSON.parse(init.body))
			throw new Error('model should not be called after local table-context preflight proves missing search samples')
		},
		observation: {
			...buildTestObservation(),
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 31, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [],
		},
		sessionOverrides: {
			task: '测试搜索区域每一个搜索项',
			latestTask: '测试搜索区域每一个搜索项',
		},
		planOptions: {
			onProgress: (event) => missingSampleEvents.push(event),
		},
	})
	assertAction(missingSampleDecision.result, 'wait')
	if (
		missingSampleDecision.result.action.input.workflow_step !== 'skip_field' ||
		missingSampleDecision.result.action.input.workflow_missing_table_samples !== true ||
		missingSampleDecision.result.action.input.workflow_context_recovered !== true ||
		missingSampleDecision.result.action.input.workflow_result_status !== 'unknown_missing_sample'
	) {
		throw new Error(`missing search samples should be safely skipped after local table-context prefetch, got ${JSON.stringify(missingSampleDecision.result)}`)
	}
	if (missingSampleBodies.length !== 0) {
		throw new Error(`missing search samples should recover after local table-context preflight without model calls, got ${missingSampleBodies.length} calls`)
	}
	const missingSampleAnalysisEvent = missingSampleEvents.find((event) => event.stage === 'workflow_analysis')
	const missingSampleAnalysisText = String(missingSampleAnalysisEvent?.text || '')
	for (const expected of ['先分析列表数据', '资料名称', '不会随机填写泛化测试词']) {
		if (!missingSampleAnalysisText.includes(expected)) {
			throw new Error(`missing sample workflow analysis progress should expose ${expected}, got ${JSON.stringify(missingSampleEvents)}`)
		}
	}
	if (!missingSampleEvents.some((event) => event.stage === 'task_intent_heuristic' && String(event.text || '').includes('scope=all_matching_controls'))) {
		throw new Error(`operation-only all-field search should publish local task intent progress before model planning, got ${JSON.stringify(missingSampleEvents)}`)
	}
	if (missingSampleEvents.some((event) => event.stage === 'task_intent_request')) {
		throw new Error(`operation-only all-field search should not wait for task-intent model planning, got ${JSON.stringify(missingSampleEvents)}`)
	}
	const missingSampleAnalysisIndex = missingSampleEvents.findIndex((event) => event.stage === 'workflow_analysis')
	const missingSampleContextIndexForOrder = missingSampleEvents.findIndex((event) => event.stage === 'planning_context')
	const missingSampleDecisionIndexForOrder = missingSampleEvents.findIndex((event) => event.stage === 'workflow_decision')
	if (
		missingSampleAnalysisIndex < 0 ||
		missingSampleContextIndexForOrder < 0 ||
		missingSampleDecisionIndexForOrder < 0 ||
		missingSampleAnalysisIndex > missingSampleContextIndexForOrder ||
		missingSampleContextIndexForOrder > missingSampleDecisionIndexForOrder
	) {
		throw new Error(`missing sample analysis/context/decision should be visible before safe skip, got ${JSON.stringify(missingSampleEvents)}`)
	}
	if (missingSampleEvents.some((event) => event.stage === 'model_request' || event.stage === 'model_compact_request')) {
		throw new Error(`missing sample local recovery should avoid model request progress, got ${JSON.stringify(missingSampleEvents)}`)
	}
	const missingSampleContextEvent = missingSampleEvents.find((event) => event.stage === 'planning_context')
	const missingSampleContextText = String(missingSampleContextEvent?.text || '')
	for (const expected of ['本地预检请求内部上下文', 'request_context', 'source=tables', 'limit=10', '搜索测试缺少列表样本', '没有找到匹配上下文', 'reason=no_observed_tables', '建议=当前观察没有表格摘要', '下一步应按建议换证据']) {
		if (!missingSampleContextText.includes(expected)) {
			throw new Error(`planning context progress should expose ${expected}, got ${JSON.stringify(missingSampleEvents)}`)
		}
	}
	const missingSampleContextRequestIndex = missingSampleEvents.findIndex((event) => event.stage === 'planning_context_request')
	const missingSampleContextIndex = missingSampleEvents.findIndex((event) => event.stage === 'planning_context')
	if (missingSampleContextRequestIndex < 0 || missingSampleContextIndex < 0 || missingSampleContextRequestIndex > missingSampleContextIndex) {
		throw new Error(`planning context request progress should appear before the context result, got ${JSON.stringify(missingSampleEvents)}`)
	}
	const missingSampleContextRequestText = String(missingSampleEvents[missingSampleContextRequestIndex]?.text || '')
	for (const expected of ['本地预检准备请求内部上下文', 'request_context', 'source=tables', '搜索测试缺少列表样本', '正在查找表格/列表摘要', '页面保持原状态', '只补充上下文，不操作页面']) {
		if (!missingSampleContextRequestText.includes(expected)) {
			throw new Error(`planning context request progress should expose ${expected}, got ${JSON.stringify(missingSampleEvents)}`)
		}
	}
	const missingSampleDoneText = String(missingSampleDecision.result.action.input.text || '')
	if (
		!missingSampleDoneText.includes('最近补充上下文为空') ||
		!missingSampleDoneText.includes('reason="no_observed_tables"') ||
		!missingSampleDoneText.includes('缺样本时不要填写泛化搜索词') ||
		missingSampleDecision.result.action.input.planning_context_diagnostic === undefined
	) {
		throw new Error(`failure done should preserve empty-context diagnostics, got ${JSON.stringify(missingSampleDecision.result)}`)
	}

	const optionMismatchBodies = []
	const optionMismatchEvents = []
	const optionMismatchDecision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			optionMismatchBodies.push(JSON.parse(init.body))
			throw new Error('model should not be called after local options preflight proves sample/candidate mismatch')
		},
		observation: {
			...buildTestObservation(),
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
			tables: [
				{ headers: ['状态', '名称'], rows: [['停用', '测试账号']] },
			],
		},
		sessionOverrides: {
			task: '测试搜索区域每一个搜索项',
			latestTask: '测试搜索区域每一个搜索项',
		},
		planOptions: {
			onProgress: (event) => optionMismatchEvents.push(event),
		},
	})
	assertAction(optionMismatchDecision.result, 'wait')
	if (
		optionMismatchDecision.result.action.input.workflow_step !== 'skip_field' ||
		optionMismatchDecision.result.action.input.workflow_option_sample_mismatch !== true ||
		optionMismatchDecision.result.action.input.workflow_context_recovered !== true ||
		optionMismatchDecision.result.action.input.workflow_missing_table_samples === true ||
		optionMismatchDecision.result.action.input.workflow_result_status !== 'unknown_missing_sample'
	) {
		throw new Error(`option sample mismatch should be safely skipped after options context is exhausted, got ${JSON.stringify(optionMismatchDecision.result)}`)
	}
	if (optionMismatchBodies.length !== 0) {
		throw new Error(`option sample mismatch should recover after local options preflight without model calls, got ${optionMismatchBodies.length} calls`)
	}
	const optionMismatchAnalysisText = String(optionMismatchEvents.find((event) => event.stage === 'workflow_analysis')?.text || '')
	for (const expected of ['核对列表样本与选择候选', '状态:停用', '可见候选=状态:启用|禁用', '不会选择非匹配候选']) {
		if (!optionMismatchAnalysisText.includes(expected)) {
			throw new Error(`option mismatch analysis progress should expose ${expected}, got ${JSON.stringify(optionMismatchEvents)}`)
		}
	}
	const optionMismatchAnalysisIndex = optionMismatchEvents.findIndex((event) => event.stage === 'workflow_analysis')
	const optionMismatchContextIndexForOrder = optionMismatchEvents.findIndex((event) => event.stage === 'planning_context')
	const optionMismatchDecisionIndexForOrder = optionMismatchEvents.findIndex((event) => event.stage === 'workflow_decision')
	if (
		optionMismatchAnalysisIndex < 0 ||
		optionMismatchContextIndexForOrder < 0 ||
		optionMismatchDecisionIndexForOrder < 0 ||
		optionMismatchAnalysisIndex > optionMismatchContextIndexForOrder ||
		optionMismatchContextIndexForOrder > optionMismatchDecisionIndexForOrder
	) {
		throw new Error(`option mismatch analysis/context/decision should be visible before safe skip, got ${JSON.stringify(optionMismatchEvents)}`)
	}
	if (optionMismatchEvents.some((event) => event.stage === 'model_request' || event.stage === 'model_compact_request')) {
		throw new Error(`option mismatch local recovery should avoid model request progress, got ${JSON.stringify(optionMismatchEvents)}`)
	}
	const optionMismatchContextText = String(optionMismatchEvents.find((event) => event.stage === 'planning_context')?.text || '')
	for (const expected of ['request_options_for', 'index=5', 'label=状态', 'limit=20', '目的=搜索测试发现 状态 的列表样本与候选不匹配']) {
		if (!optionMismatchContextText.includes(expected)) {
			throw new Error(`option mismatch planning context progress should expose ${expected}, got ${JSON.stringify(optionMismatchEvents)}`)
		}
	}
	const optionMismatchContextRequestText = String(optionMismatchEvents.find((event) => event.stage === 'planning_context_request')?.text || '')
	for (const expected of ['本地预检准备请求内部上下文', 'request_options_for', 'index=5', 'label=状态', '正在查找状态 的真实可见候选', '只补充上下文，不操作页面']) {
		if (!optionMismatchContextRequestText.includes(expected)) {
			throw new Error(`option mismatch planning context request progress should expose ${expected}, got ${JSON.stringify(optionMismatchEvents)}`)
		}
	}

	const unobservedOptionBodies = []
	const unobservedOptionEvents = []
	const unobservedOptionDecision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			unobservedOptionBodies.push(JSON.parse(init.body))
			throw new Error('model should not be called after local options preflight proves candidates are unobserved')
		},
		observation: {
			...buildTestObservation(),
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料等级' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 6, label: '资料等级', fieldType: 'select', valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{ headers: ['资料等级', '资料名称'], rows: [['核心', '星火科技有限公司']] },
			],
		},
		sessionOverrides: {
			task: '测试搜索区域每一个搜索项',
			latestTask: '测试搜索区域每一个搜索项',
			history: [
				{
					action: 'open_dropdown',
					input: {
						workflow: 'search-fields',
						workflow_step: 'open_dropdown',
						workflow_field_index: 6,
						workflow_field_label: '资料等级',
						index: 6,
					},
					success: true,
					output: '已展开资料等级，但未捕获候选。',
					meta: {
						outcome: {
							kind: 'options_visible',
							visibleOptions: [],
						},
					},
				},
			],
		},
		planOptions: {
			onProgress: (event) => unobservedOptionEvents.push(event),
		},
	})
	assertAction(unobservedOptionDecision.result, 'wait')
	if (
		unobservedOptionDecision.result.action.input.workflow_step !== 'skip_field' ||
		unobservedOptionDecision.result.action.input.workflow_option_candidates_unobserved !== true ||
		unobservedOptionDecision.result.action.input.workflow_context_recovered !== true ||
		unobservedOptionDecision.result.action.input.workflow_missing_table_samples === true ||
		unobservedOptionDecision.result.action.input.workflow_result_status !== 'unknown_missing_sample'
	) {
		throw new Error(`unobserved option candidates should be safely skipped after options context is exhausted, got ${JSON.stringify(unobservedOptionDecision.result)}`)
	}
	if (unobservedOptionBodies.length !== 0) {
		throw new Error(`unobserved option candidates should recover after local options preflight without model calls, got ${unobservedOptionBodies.length} calls`)
	}
	const unobservedOptionAnalysisText = String(unobservedOptionEvents.find((event) => event.stage === 'workflow_analysis')?.text || '')
	for (const expected of ['已展开选择字段但未观测到候选', '资料等级', '已展开 1 次', '列表样本=资料等级:核心', '不会猜选项']) {
		if (!unobservedOptionAnalysisText.includes(expected)) {
			throw new Error(`unobserved option analysis progress should expose ${expected}, got ${JSON.stringify(unobservedOptionEvents)}`)
		}
	}
	const unobservedOptionContextText = String(unobservedOptionEvents.find((event) => event.stage === 'planning_context')?.text || '')
	for (const expected of ['request_options_for', 'index=6', 'label=资料等级', 'limit=20']) {
		if (!unobservedOptionContextText.includes(expected)) {
			throw new Error(`unobserved option planning context progress should expose ${expected}, got ${JSON.stringify(unobservedOptionEvents)}`)
		}
	}
	const unobservedOptionContextRequestText = String(unobservedOptionEvents.find((event) => event.stage === 'planning_context_request')?.text || '')
	for (const expected of ['本地预检准备请求内部上下文', 'request_options_for', 'index=6', 'label=资料等级', '正在查找资料等级 的真实可见候选', '只补充上下文，不操作页面']) {
		if (!unobservedOptionContextRequestText.includes(expected)) {
			throw new Error(`unobserved option planning context request progress should expose ${expected}, got ${JSON.stringify(unobservedOptionEvents)}`)
		}
	}

	const missingSubmitBodies = []
	const missingSubmitEvents = []
	const missingSubmitDecision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			missingSubmitBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '动作上下文仍没有搜索入口。',
				memory: '当前无法确认搜索按钮。',
				thought: '没有提交入口时不能验证搜索功能。',
				next_goal: '停止搜索测试。',
				action: { name: 'done', input: { text: '没有找到搜索/查询入口，停止。', success: false } },
			})
		},
		observation: {
			...buildTestObservation(),
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'filled:星火科技有限公司', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
			],
			tables: [
				{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
			],
		},
		sessionOverrides: {
			task: '测试搜索区域每一个搜索项',
			latestTask: '测试搜索区域每一个搜索项',
			history: [
				{
					action: 'input_text',
					input: {
						workflow: 'search-fields',
						workflow_step: 'fill_field',
						workflow_field_index: 12,
						workflow_field_label: '公司名称',
						index: 12,
						text: '星火科技有限公司',
						workflow_value_source: 'table_sample',
					},
					success: true,
					output: '已输入公司名称。',
				},
			],
		},
		planOptions: {
			onProgress: (event) => missingSubmitEvents.push(event),
		},
	})
	assertAction(missingSubmitDecision.result, 'done')
	if (missingSubmitBodies.length !== 1) {
		throw new Error(`missing submit controls should prefetch actions context locally before one model round, got ${missingSubmitBodies.length} calls`)
	}
	const missingSubmitUser = getUserMessageText(missingSubmitBodies[0])
	for (const expected of [
		'search_submit_requirement',
		'submit_action_missing',
		'context="after_field_value"',
		'fields="公司名称"',
		'activeIndex="12"',
		'testValue="星火科技有限公司"',
		'request_context source=actions',
		'<planning_context>',
		'source="actions"',
		'query="搜索 查询 筛选 过滤 应用 search query filter apply',
		'不要跳过提交验证',
	]) {
		if (!missingSubmitUser.includes(expected)) {
			throw new Error(`missing submit controls should be model-visible with local actions prefetch before stopping: missing ${expected}, got ${missingSubmitUser}`)
		}
	}
	const missingSubmitAnalysisText = String(missingSubmitEvents.find((event) => event.stage === 'workflow_analysis')?.text || '')
	for (const expected of ['已设置但未观测到搜索/查询按钮', '公司名称', '测试值=星火科技有限公司', '不会跳过提交验证']) {
		if (!missingSubmitAnalysisText.includes(expected)) {
			throw new Error(`missing submit analysis progress should expose ${expected}, got ${JSON.stringify(missingSubmitEvents)}`)
		}
	}
	const missingSubmitAnalysisIndex = missingSubmitEvents.findIndex((event) => event.stage === 'workflow_analysis')
	const missingSubmitModelIndex = missingSubmitEvents.findIndex((event) => event.stage === 'model_request' || event.stage === 'model_compact_request')
	if (missingSubmitAnalysisIndex < 0 || missingSubmitModelIndex < 0 || missingSubmitAnalysisIndex > missingSubmitModelIndex) {
		throw new Error(`missing submit analysis should be visible before the model request starts, got ${JSON.stringify(missingSubmitEvents)}`)
	}
	const missingSubmitContextText = String(missingSubmitEvents.find((event) => event.stage === 'planning_context')?.text || '')
	for (const expected of ['request_context', 'source=actions', 'region=content', 'query=搜索 查询 筛选 过滤 应用 search query filter apply submit', 'limit=20', '下一步应按建议换证据']) {
		if (!missingSubmitContextText.includes(expected)) {
			throw new Error(`missing submit planning context progress should expose ${expected}, got ${JSON.stringify(missingSubmitEvents)}`)
		}
	}
	const missingSubmitContextRequestText = String(missingSubmitEvents.find((event) => event.stage === 'planning_context_request')?.text || '')
	for (const expected of ['本地预检准备请求内部上下文', 'request_context', 'source=actions', 'region=content', '正在查找可点击动作', '页面保持原状态', '只补充上下文，不操作页面']) {
		if (!missingSubmitContextRequestText.includes(expected)) {
			throw new Error(`missing submit planning context request progress should expose ${expected}, got ${JSON.stringify(missingSubmitEvents)}`)
		}
	}

	const missingResetBodies = []
	const missingResetEvents = []
	const missingResetDecision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			missingResetBodies.push(JSON.parse(init.body))
			throw new Error('plain editable missing-reset fallback should not call the model')
		},
		observation: {
			...buildTestObservation(),
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '经办姓名,公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 26, label: '经办姓名', fieldType: 'name', valueState: 'filled:测试经办', role: 'textbox', type: 'text', region: 'content' },
						{ index: 27, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
			],
			tables: [{ headers: ['经办姓名', '公司名称'], rows: [] }],
		},
		sessionOverrides: {
			task: '测试搜索区域每一个搜索项',
			latestTask: '测试搜索区域每一个搜索项',
		},
		planOptions: {
			onProgress: (event) => missingResetEvents.push(event),
		},
	})
	assertAction(missingResetDecision.result, 'input_text')
	if (
		missingResetDecision.result.action.input.workflow_step !== 'clear_field' ||
		missingResetDecision.result.action.input.workflow_clear_context !== 'baseline' ||
		missingResetDecision.result.action.input.text !== ''
	) {
		throw new Error(`plain editable missing-reset fallback should clear the field locally, got ${JSON.stringify(missingResetDecision.result)}`)
	}
	if (missingResetBodies.length !== 0) {
		throw new Error(`plain editable missing-reset fallback should avoid model calls, got ${missingResetBodies.length}`)
	}
	const missingResetDecisionText = String(missingResetEvents.find((event) => event.stage === 'workflow_decision')?.text || '')
	for (const expected of ['未找到清空按钮', '字段级置空', '经办姓名']) {
		if (!missingResetDecisionText.includes(expected)) {
			throw new Error(`field-clear fallback progress should expose ${expected}, got ${JSON.stringify(missingResetEvents)}`)
		}
	}
	const missingSelectionResetBodies = []
	const missingSelectionResetEvents = []
	const missingSelectionResetDecision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			missingSelectionResetBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '动作上下文仍没有重置入口。',
				memory: '选择类搜索字段不能直接置空。',
				thought: '没有清空入口时不能带残留条件继续。',
				next_goal: '停止搜索测试。',
				action: { name: 'done', input: { text: '没有找到清空/重置入口，停止。', success: false } },
			})
		},
		observation: {
			...buildTestObservation(),
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料等级' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 6, label: '资料等级', fieldType: 'select', valueState: 'selected:核心', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' },
			],
			tables: [
				{ headers: ['资料等级', '资料名称'], rows: [['核心', '星火科技有限公司']] },
			],
		},
		sessionOverrides: {
			task: '测试搜索区域每一个搜索项',
			latestTask: '测试搜索区域每一个搜索项',
			workflowState: {
				search: {
					version: 6,
					phase: 'awaiting_reset',
					activeFieldKey: 'index:6',
					lastSearchedFieldKey: 'index:6',
					fieldOrder: ['index:6'],
					fields: {
						'index:6': {
							key: 'index:6',
							index: 6,
							label: '资料等级',
							fieldType: 'select',
							lastTestValue: '核心',
							lastValueSource: 'table_sample',
						},
					},
					completedKeys: [],
					skippedKeys: [],
					resetCompletedKeys: [],
					resultsByKey: {},
					clearRetryAttemptsByKey: {},
					evidenceRequestAttemptsByKey: {},
					failedLabelsByKey: {},
					dropdownOpenAttemptsByKey: {},
					pendingDateRangeStartByKey: {},
					pendingDropdownCandidates: [],
					pendingDropdownOutput: '',
					baselineResetDone: true,
					terminalFieldKey: '',
					failedReason: '',
					seededFromHistory: true,
				},
			},
		},
		planOptions: {
			onProgress: (event) => missingSelectionResetEvents.push(event),
		},
	})
	assertAction(missingSelectionResetDecision.result, 'done')
	if (missingSelectionResetBodies.length !== 1) {
		throw new Error(`non-clearable missing reset should prefetch actions context locally before one model round, got ${missingSelectionResetBodies.length} calls`)
	}
	const missingSelectionResetUser = getUserMessageText(missingSelectionResetBodies[0])
	for (const expected of [
		'search_reset_requirement',
		'reset_action_missing',
		'context="after_submit"',
		'fields="资料等级"',
		'activeIndex="6"',
		'request_context source=actions',
		'<planning_context>',
		'source="actions"',
		'query="重置 清空 清除 清理 取消筛选 reset clear clear filte',
		'不要带残留条件继续测试',
	]) {
		if (!missingSelectionResetUser.includes(expected)) {
			throw new Error(`non-clearable missing reset should be model-visible with local actions prefetch: missing ${expected}, got ${missingSelectionResetUser}`)
		}
	}
	const missingSelectionResetAnalysisText = String(missingSelectionResetEvents.find((event) => event.stage === 'workflow_analysis')?.text || '')
	for (const expected of ['需要清空条件但未观测到重置/清空按钮', '资料等级', '不会带残留条件继续测试']) {
		if (!missingSelectionResetAnalysisText.includes(expected)) {
			throw new Error(`non-clearable missing reset analysis progress should expose ${expected}, got ${JSON.stringify(missingSelectionResetEvents)}`)
		}
	}
	const missingSelectionResetContextRequestText = String(missingSelectionResetEvents.find((event) => event.stage === 'planning_context_request')?.text || '')
	for (const expected of ['本地预检准备请求内部上下文', 'request_context', 'source=actions', 'region=content', '正在查找可点击动作', '只补充上下文，不操作页面']) {
		if (!missingSelectionResetContextRequestText.includes(expected)) {
			throw new Error(`non-clearable missing reset planning context request progress should expose ${expected}, got ${JSON.stringify(missingSelectionResetEvents)}`)
		}
	}

	const unresolvedSearchEvents = []
	const unresolvedSearchDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			throw new Error('task-intent model should not be called for obvious named-module search testing')
		},
		observation: {
			...buildTestObservation(),
			title: '首页',
			url: 'http://example.test/app#/wel/index',
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 31, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 12, region: 'sidebar', role: 'menuitem', label: '资料', rect: { left: 0, top: 120, width: 160, height: 44 } },
				{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' },
			],
			tables: [],
		},
		sessionOverrides: {
			task: '打开这个页面 http://example.test/ 找到资料管理。你现在帮我测试资料管理的每一个搜索功能是否正常实现。',
			latestTask: '打开这个页面 http://example.test/ 找到资料管理。你现在帮我测试资料管理的每一个搜索功能是否正常实现。',
		},
		planOptions: {
			onProgress: (event) => unresolvedSearchEvents.push(event),
		},
	})
	assertAction(unresolvedSearchDecision.result, 'click_element_by_index')
	if (
		unresolvedSearchDecision.result.action.input.index !== 12 ||
		unresolvedSearchDecision.result.action.input.workflow !== 'task-navigation'
	) {
		throw new Error(`unresolved named-module search task should navigate before analyzing the wrong page search form, got ${JSON.stringify(unresolvedSearchDecision.result)}`)
	}
	const unresolvedAnalysisEvent = unresolvedSearchEvents.find((event) => event.stage === 'workflow_analysis')
	const unresolvedAnalysisText = String(unresolvedAnalysisEvent?.text || '')
	for (const expected of ['先定位任务目标模块', '资料管理', '不会测试当前页面的通用搜索/筛选区']) {
		if (!unresolvedAnalysisText.includes(expected)) {
			throw new Error(`workflow analysis should explain unresolved task navigation with ${expected}, got ${JSON.stringify(unresolvedSearchEvents)}`)
		}
	}
	if (/缺少可用列表样本|泛化测试词/.test(unresolvedAnalysisText)) {
		throw new Error(`workflow analysis should not report missing search samples before the named task module is reached, got ${JSON.stringify(unresolvedSearchEvents)}`)
	}
	const unresolvedDecisionText = String(unresolvedSearchEvents.find((event) => event.stage === 'workflow_decision')?.text || '')
	for (const expected of ['任务导航先进入目标页面/模块', '候选「资料」', '目标=资料管理', 'index=12', '不会测试当前页面的通用搜索/表单区域']) {
		if (!unresolvedDecisionText.includes(expected)) {
			throw new Error(`navigation workflow decision progress should expose ${expected}, got ${JSON.stringify(unresolvedSearchEvents)}`)
		}
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
		TextDecoder,
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

	const contentJson = JSON.stringify({
		evaluation_previous_goal: 'stream-ok',
		memory: 'stream-ok',
		thought: 'stream-thought',
		next_goal: 'done',
		action: { name: 'done', input: { text: 'ok', success: true } },
	})
	const streamChunks = [
		{ id: 'chatcmpl-stream', model: 'fake-model', choices: [{ delta: { reasoning_content: '流式推理摘要' } }] },
		{ id: 'chatcmpl-stream', model: 'fake-model', choices: [{ delta: { content: contentJson.slice(0, 32) } }] },
		{ id: 'chatcmpl-stream', model: 'fake-model', choices: [{ delta: { content: contentJson.slice(32) } }], usage: { total_tokens: 2 } },
	]
	const encodedStreamChunks = streamChunks
		.map((payload) => `data: ${JSON.stringify(payload)}\n\n`)
		.concat('data: [DONE]\n\n')
		.map((chunk) => new TextEncoder().encode(chunk))
	let sentStreamBody = null
	let streamReadIndex = 0
	const streamEvents = []
	const streamSandbox = loadBackgroundModule('naturalclick-extension/background/planner-model-client.js', {
		NC_BG_PLANNER_CONTEXT: {
			shortText: (value, maxLen) => {
				const text = String(value || '')
				if (text.length <= maxLen) return text
				return `${text.slice(0, maxLen)} ...[truncated ${text.length - maxLen}]`
			},
		},
		AbortController,
		TextDecoder,
		fetch: async (_url, init) => {
			sentStreamBody = JSON.parse(init.body)
			return {
				ok: true,
				body: {
					getReader: () => ({
						read: async () => {
							if (streamReadIndex >= encodedStreamChunks.length) return { done: true }
							return { done: false, value: encodedStreamChunks[streamReadIndex++] }
						},
					}),
				},
				json: async () => {
					throw new Error('streaming model client should not fall back to response.json() when a reader exists')
				},
			}
		},
	})
	const streamResult = await streamSandbox.NC_BG_PLANNER_MODEL_CLIENT.callOpenAI(
		{ baseURL: 'http://model.test/v1', model: 'fake-model', apiKey: '', stream: true },
		[
			{ role: 'system', content: '系统提示' },
			{ role: 'user', content: '账号观察' },
		],
		{ returnMeta: true, timeoutMs: 60000, onStream: (event) => streamEvents.push(event) }
	)
	if (sentStreamBody?.stream !== true) {
		throw new Error(`model client should request streaming responses by default, got ${JSON.stringify(sentStreamBody)}`)
	}
	if (!String(streamResult.content || '').includes('stream-thought') || streamResult.io?.response?.stream !== true) {
		throw new Error(`streaming model client should concatenate streamed content and mark response stream=true, got ${JSON.stringify(streamResult)}`)
	}
	if (!String(streamResult.io?.response?.displayThought || '').includes('流式推理摘要')) {
		throw new Error(`streaming model response should preserve streamed reasoning in displayThought, got ${JSON.stringify(streamResult.io?.response)}`)
	}
	if (!streamEvents.some((event) => event.done === false && String(event.reasoning || '').includes('流式推理摘要'))) {
		throw new Error(`streaming model client should publish interim stream deltas, got ${JSON.stringify(streamEvents)}`)
	}
	if (!streamEvents.some((event) => event.done === true && String(event.content || '').includes('stream-thought'))) {
		throw new Error(`streaming model client should publish a final stream event, got ${JSON.stringify(streamEvents)}`)
	}
	if (streamSandbox.NC_BG_PLANNER_MODEL_CLIENT.parseStreamLine('data: [DONE]')?.done !== true) {
		throw new Error('streaming model client should parse SSE done sentinels')
	}

	const reasoningOnlyDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => fakeJsonResponse({
			evaluation_previous_goal: '已收到观察。',
			memory: '搜索字段可用。',
			next_goal: '输入查询词。',
			action: { name: 'input_text', input: { index: 3, text: 'reasoning-only', target_label: '搜索' } },
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

async function assertPlannerTimeoutRecoveryOpensCreateEntry() {
	const task = '新建一条资料数据，资料名称是张三。'
	const observation = {
		...buildTestObservation(),
		url: 'http://example.test/app#/demo/record',
		title: '资料管理-资料-示例系统',
		forms: [
			{
				id: 'page_form',
				name: '页面表单',
				fields: [
					{ index: 2, region: 'content', fieldType: 'select', kind: 'dropdown', label: '首页个人信息退出登录', valueState: 'selected:首页个人信息退出登录', role: 'combobox' },
				],
			},
		],
		actions: [
			{ index: 5, region: 'sidebar', role: 'menuitem', label: '资料管理', state: 'classState=is-active|is-opened', valueState: 'unknown' },
			{ index: 7, region: 'sidebar', role: 'menuitem', label: '资料', state: 'classState=is-active', valueState: 'unknown' },
			{ index: 37, region: 'content', label: 'llm自然语言识别新增资料2', actionIntent: 'create', valueState: 'unknown' },
			{ index: 39, region: 'content', label: 'llm自然语言识别新增资料1', actionIntent: 'create', valueState: 'unknown' },
			{ index: 27, region: 'sidebar', role: 'button', label: '新 增', actionIntent: 'create', valueState: 'unknown', rect: { left: 240, top: 130 } },
		],
		elements: [],
		simplifiedDom: [],
	}
	const intentState = {
		version: 4,
		status: 'ready',
		intent: {
			navigationTargets: [
				{ raw: '资料管理', canonical: '资料管理', aliases: ['资料管理'] },
				{ raw: '资料', canonical: '资料', aliases: ['资料'] },
			],
			operation: 'create',
			createEntryLabels: ['新增', '新建', '创建', '添加', '新 增'],
			forbiddenNavigationTargets: ['资料新增', '资料管理新增'],
		},
	}
	const events = []
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
			workflowState: { taskIntent: intentState },
		},
		planOptions: {
			onProgress: (event) => events.push(event),
		},
	})
	assertAction(decision.result, 'click_element_by_index')
	if (
		decision.result.action.input.index !== 27 ||
		decision.result.action.input.workflow !== 'create-task' ||
		decision.result.action.input.workflow_step !== 'open_create_form_timeout_recovery'
	) {
		throw new Error(`timeout recovery should click the strong create entry, got ${JSON.stringify(decision.result)}`)
	}
	if (requestBodies.length !== 2) {
		throw new Error(`create-entry timeout recovery should run only after full and compact model timeouts, got ${requestBodies.length}`)
	}
	if (!events.some((event) => event.stage === 'timeout_recovery')) {
		throw new Error(`create-entry timeout recovery should publish timeout_recovery progress, got ${JSON.stringify(events)}`)
	}

	const repeatedDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation,
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: { taskIntent: intentState },
			history: [
				{
					action: 'click_element_by_index',
					input: {
						index: 27,
						target_label: '新 增',
						workflow: 'create-task',
						workflow_step: 'open_create_form_timeout_recovery',
						workflow_create_label: '新 增',
					},
					success: false,
				},
			],
		},
	})
	assertAction(repeatedDecision.result, 'locate_by_vision')
	if (
		!String(repeatedDecision.result.action.input.target_description || '').includes('工具栏') ||
		!String(repeatedDecision.result.action.input.target_description || '').includes('导入开关') ||
		repeatedDecision.result.action.input.workflow_step !== 'open_create_form_timeout_recovery'
	) {
		throw new Error(`create-entry timeout recovery should use constrained vision after a failed create entry, got ${JSON.stringify(repeatedDecision.result)}`)
	}

	const modelFailedDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation,
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: { taskIntent: intentState },
			history: [
				{
					action: 'click_element_by_index',
					input: { index: 27 },
					output: 'create_form_not_opened: 创建入口点击后未观察到新增表单/弹层字段。',
					success: false,
				},
			],
		},
	})
	assertAction(modelFailedDecision.result, 'locate_by_vision')
	if (modelFailedDecision.result.action.input.action_name !== 'click_element_by_index') {
		throw new Error(`model create-entry failure should recover with executable vision click, got ${JSON.stringify(modelFailedDecision.result)}`)
	}

	const submitThenClosedDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation,
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: { taskIntent: intentState },
			history: [
				{
					action: 'click_element_by_index',
					input: {
						index: 19,
						target_label: '保存',
						workflow: 'form-fill',
						workflow_step: 'submit_form_timeout_recovery',
					},
					output: 'form_submit_failed: 表单提交后观察到错误/校验提示: required',
					success: false,
				},
			],
		},
	})
	assertAction(submitThenClosedDecision.result, 'done')
	if (
		submitThenClosedDecision.result.action.input.success !== true ||
		submitThenClosedDecision.result.action.input.workflow_step !== 'finish_create_after_submit_no_form'
	) {
		throw new Error(`create-entry recovery should not reopen create form after submit made the form disappear, got ${JSON.stringify(submitThenClosedDecision.result)}`)
	}
}

async function assertPlannerTimeoutRecoverySelectsExplicitCascaderPath() {
	const task = '新建一条资料，名称是晨会，配送区域是华东区，江苏省，南京市。'
	const observation = {
		...buildTestObservation(),
		title: '资料-示例系统',
		forms: [
			{
				id: 'dialog',
				name: '新增弹层',
				fields: [
					{ index: 1, region: 'dialog', fieldType: 'name', kind: 'text', label: '名称', valueState: 'filled:晨会', role: 'textbox' },
					{ index: 7, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '配送区域', valueState: 'empty', role: 'combobox', selectionControl: 'cascader-parent' },
					{ index: 8, region: 'dialog', fieldType: 'memo', kind: 'text', label: '备注', valueState: 'empty', role: 'textbox' },
				],
			},
		],
		actions: [
			{ index: 7, region: 'dialog', role: 'combobox', label: '配送区域', valueState: 'empty', kind: 'cascader', selectionControl: 'cascader-parent' },
			{ index: 18, region: 'dialog', role: 'button', label: '保存', actionIntent: 'submit' },
		],
		elements: [],
		simplifiedDom: [
			'<field index="7" role="combobox" region="dialog" kind="cascader" control="cascader-parent" value="empty">配送区域</field>',
		],
	}
	const events = []
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
		planOptions: {
			onProgress: (event) => events.push(event),
		},
	})
	assertAction(decision.result, 'select_cascader_path')
	if (
		decision.result.action.input.index !== 7 ||
		decision.result.action.input.workflow !== 'form-fill' ||
		decision.result.action.input.workflow_step !== 'select_cascader_path_timeout_recovery' ||
		JSON.stringify(decision.result.action.input.path) !== JSON.stringify(['华东区', '江苏省', '南京市'])
	) {
		throw new Error(`timeout recovery should select the explicit cascader path, got ${JSON.stringify(decision.result)}`)
	}
	if (requestBodies.length !== 0) {
		throw new Error(`deterministic cascader form fill should skip model calls, got ${requestBodies.length}`)
	}
	if (events.some((event) => event.stage === 'timeout_recovery')) {
		throw new Error(`deterministic cascader form fill should not be reported as timeout recovery, got ${JSON.stringify(events)}`)
	}

	const repeatedDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
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
					action: 'select_cascader_path',
					input: { index: 7, path: ['华东区', '江苏省', '南京市'] },
					success: false,
				},
			],
		},
	})
	assertAction(repeatedDecision.result, 'done')
	if (repeatedDecision.result.action.input.success !== false) {
		throw new Error(`cascader timeout recovery should not repeat a recently failed same path, got ${JSON.stringify(repeatedDecision.result)}`)
	}
}

async function assertPlannerTimeoutRecoveryRetriesFailedCascaderPathAfterReopen() {
	const task = '编辑当前记录的所在地，修改为江苏省，南京市，江宁区。'
	const path = ['江苏省', '南京市', '江宁区']
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			title: '资料编辑-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '编辑弹层',
					fields: [
						{ index: 10, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '所在地', valueState: 'selected:天津市 / 天津市 / 和平区', role: 'combobox', selectionControl: 'cascader-parent' },
						{ index: 11, region: 'dialog', fieldType: 'tax_no', kind: 'text', label: '纳税人识别号', valueState: 'filled:123456', role: 'textbox' },
					],
				},
			],
			actions: [
				{ index: 10, region: 'dialog', role: 'combobox', label: '所在地', valueState: 'selected:天津市 / 天津市 / 和平区', kind: 'cascader', selectionControl: 'cascader-parent' },
				{ index: 28, region: 'dialog', role: 'button', label: '保存', actionIntent: 'submit' },
			],
			elements: [],
			simplifiedDom: [
				'<field index="10" role="combobox" region="dialog" kind="cascader" control="cascader-parent" value="selected:天津市 / 天津市 / 和平区">所在地</field>',
			],
		},
		sessionOverrides: {
			task,
			latestTask: task,
			history: [
				{
					action: 'select_cascader_path',
					input: { index: 10, target_label: '所在地', path },
					success: false,
					output: '级联选择失败：未找到第 2 级选项 "南京市"。 当前第 2 级可见项: 天津市。 当前第 2 级没有检测到匹配候选。',
				},
				{
					action: 'open_dropdown',
					input: { index: 10, target_label: '所在地' },
					success: true,
					output: '已展开下拉框索引 10。 当前候选: 北京市、天津市、江苏省 | 动作结果: options_visible progress=true candidates="北京市|天津市|江苏省"',
					outcome: { kind: 'options_visible', visibleOptions: ['北京市', '天津市', '江苏省'] },
				},
			],
		},
	})
	assertAction(decision.result, 'select_cascader_path')
	if (
		decision.result.action.input.index !== 10 ||
		decision.result.action.input.workflow !== 'form-fill' ||
		decision.result.action.input.workflow_step !== 'select_cascader_path_timeout_recovery' ||
		decision.result.action.input.workflow_retry_reason !== 'previous_cascader_path_failed_after_reopen' ||
		JSON.stringify(decision.result.action.input.path) !== JSON.stringify(path)
	) {
		throw new Error(`timeout recovery should retry the previously declared cascader path once after reopening the same field, got ${JSON.stringify(decision.result)}`)
	}

	const repeatedDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			forms: [
				{
					id: 'dialog',
					name: '编辑弹层',
					fields: [
						{ index: 10, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '所在地', valueState: 'selected:天津市 / 天津市 / 和平区', role: 'combobox', selectionControl: 'cascader-parent' },
					],
				},
			],
			actions: [
				{ index: 10, region: 'dialog', role: 'combobox', label: '所在地', valueState: 'selected:天津市 / 天津市 / 和平区', kind: 'cascader', selectionControl: 'cascader-parent' },
			],
			elements: [],
		},
		sessionOverrides: {
			task,
			latestTask: task,
			history: [
				{
					action: 'select_cascader_path',
					input: { index: 10, target_label: '所在地', path },
					success: false,
					output: '级联选择失败：未找到第 2 级选项 "南京市"。 当前第 2 级可见项: 天津市。',
				},
				{
					action: 'open_dropdown',
					input: { index: 10, target_label: '所在地' },
					success: true,
					output: '已展开下拉框索引 10。 当前候选: 江苏省 | 动作结果: options_visible progress=true candidates="江苏省"',
					outcome: { kind: 'options_visible', visibleOptions: ['江苏省'] },
				},
				{
					action: 'select_cascader_path',
					input: {
						index: 10,
						target_label: '所在地',
						path,
						workflow: 'form-fill',
						workflow_step: 'select_cascader_path_timeout_recovery',
					},
					success: false,
					output: '级联选择失败：未找到第 2 级选项 "南京市"。',
				},
			],
		},
	})
	assertAction(repeatedDecision.result, 'done')
	if (repeatedDecision.result.action.input.success !== false) {
		throw new Error(`cascader path retry recovery should not loop after one bounded retry, got ${JSON.stringify(repeatedDecision.result)}`)
	}
}

async function assertPlannerTimeoutRecoveryFillsAssignedTextBeforeCascader() {
	const task = '新建资料，资料公司名称是张三，联系方式是145555555，纳税人识别号是IOOO123456，资料等级是核心，资料所在地是江苏省，南京市，江宁区（'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			title: '资料-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '新增弹层',
					fields: [
						{ index: 1, region: 'dialog', fieldType: 'unknown', kind: 'text', label: '资料公司名称', valueState: 'filled:张三', role: 'textbox', type: 'text' },
						{ index: 2, region: 'dialog', fieldType: 'unknown', kind: 'text', label: '联系方式', valueState: 'filled:145555555', role: 'textbox', type: 'text' },
						{ index: 3, region: 'dialog', fieldType: 'unknown', kind: 'text', label: '纳税人识别号', valueState: 'empty', role: 'textbox', type: 'text' },
						{ index: 4, region: 'dialog', fieldType: 'select', kind: 'dropdown', label: '资料等级', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown' },
						{ index: 7, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '资料所在地', valueState: 'empty', role: 'combobox', selectionControl: 'cascader-parent' },
					],
				},
			],
			actions: [
				{ index: 4, region: 'dialog', role: 'combobox', label: '资料等级', valueState: 'empty', kind: 'dropdown', selectionControl: 'dropdown' },
				{ index: 7, region: 'dialog', role: 'combobox', label: '资料所在地', valueState: 'empty', kind: 'cascader', selectionControl: 'cascader-parent' },
			],
			elements: [],
			simplifiedDom: [],
		},
		sessionOverrides: {
			task,
			latestTask: task,
		},
	})
	assertAction(decision.result, 'input_text')
	if (
		decision.result.action.input.index !== 3 ||
		decision.result.action.input.text !== 'IOOO123456' ||
		decision.result.action.input.workflow !== 'form-fill' ||
		decision.result.action.input.workflow_step !== 'fill_form_field_timeout_recovery'
	) {
		throw new Error(`timeout recovery should fill assigned text fields before cascader recovery, got ${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerTimeoutRecoveryUpdatesAssignedExistingFields() {
	const textTask = '编辑当前记录，联系电话，改为13800138000。'
	const textDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			title: '编辑-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '编辑弹层',
					fields: [
						{ index: 12, region: 'dialog', fieldType: 'phone', kind: 'text', label: '联系电话', valueState: 'filled:13100000000', role: 'textbox', type: 'text' },
					],
				},
			],
			actions: [],
			elements: [],
			simplifiedDom: [
				'<field index="12" role="textbox" region="dialog" kind="text" value="filled:13100000000">联系电话</field>',
			],
		},
		sessionOverrides: {
			task: textTask,
			latestTask: textTask,
		},
	})
	assertAction(textDecision.result, 'input_text')
	if (
		textDecision.result.action.input.index !== 12 ||
		textDecision.result.action.input.text !== '13800138000' ||
		textDecision.result.action.input.workflow !== 'form-fill' ||
		textDecision.result.action.input.workflow_step !== 'fill_form_field_timeout_recovery'
	) {
		throw new Error(`timeout recovery should update explicitly assigned existing text fields, got ${JSON.stringify(textDecision.result)}`)
	}

	const cascaderTask = '编辑当前记录，客户所在地，修改为江苏省，南京市，江宁区。'
	const cascaderDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			title: '编辑-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '编辑弹层',
					fields: [
						{ index: 10, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '客户所在地', valueState: 'selected:天津市 / 天津市 / 和平区', role: 'combobox', selectionControl: 'cascader-parent' },
					],
				},
			],
			actions: [
				{ index: 10, region: 'dialog', role: 'combobox', label: '客户所在地', valueState: 'selected:天津市 / 天津市 / 和平区', kind: 'cascader', selectionControl: 'cascader-parent' },
			],
			elements: [],
			simplifiedDom: [
				'<field index="10" role="combobox" region="dialog" kind="cascader" control="cascader-parent" value="selected:天津市 / 天津市 / 和平区">客户所在地</field>',
			],
		},
		sessionOverrides: {
			task: cascaderTask,
			latestTask: cascaderTask,
		},
	})
	assertAction(cascaderDecision.result, 'select_cascader_path')
	if (
		cascaderDecision.result.action.input.index !== 10 ||
		JSON.stringify(cascaderDecision.result.action.input.path) !== JSON.stringify(['江苏省', '南京市', '江宁区']) ||
		cascaderDecision.result.action.input.workflow !== 'form-fill' ||
		cascaderDecision.result.action.input.workflow_step !== 'select_cascader_path_timeout_recovery'
	) {
		throw new Error(`timeout recovery should update explicitly assigned existing cascader fields, got ${JSON.stringify(cascaderDecision.result)}`)
	}
}

async function assertPlannerTimeoutRecoveryCleansDanglingCascaderPunctuation() {
	const task = '新建一条资料，名称是晨会，配送区域是江苏省，南京市，江宁区（'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			title: '资料-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '新增弹层',
					fields: [
						{ index: 1, region: 'dialog', fieldType: 'name', kind: 'text', label: '名称', valueState: 'filled:晨会', role: 'textbox' },
						{ index: 7, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '配送区域', valueState: 'empty', role: 'combobox', selectionControl: 'cascader-parent' },
					],
				},
			],
			actions: [
				{ index: 7, region: 'dialog', role: 'combobox', label: '配送区域', valueState: 'empty', kind: 'cascader', selectionControl: 'cascader-parent' },
			],
			elements: [],
			simplifiedDom: [
				'<field index="7" role="combobox" region="dialog" kind="cascader" control="cascader-parent" value="empty">配送区域</field>',
			],
		},
		sessionOverrides: {
			task,
			latestTask: task,
		},
	})
	assertAction(decision.result, 'select_cascader_path')
	if (JSON.stringify(decision.result.action.input.path) !== JSON.stringify(['江苏省', '南京市', '江宁区'])) {
		throw new Error(`timeout recovery should strip dangling punctuation from cascader path parts, got ${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerTimeoutRecoveryClicksVisibleCascaderCandidate() {
	const task = '新建一条资料，名称是晨会，配送区域是江苏省，南京市，江宁区（'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			title: '资料-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '新增弹层',
					fields: [
						{ index: 1, region: 'dialog', fieldType: 'name', kind: 'text', label: '名称', valueState: 'filled:晨会', role: 'textbox' },
						{ index: 7, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '配送区域', valueState: 'empty', role: 'combobox', selectionControl: 'cascader-parent' },
					],
				},
			],
			actions: [
				{ index: 31, region: 'popover', role: 'menuitem', label: '栖霞区', valueState: 'unknown', kind: 'cascader', selectionControl: 'cascader-leaf' },
				{ index: 33, region: 'popover', role: 'menuitem', label: '江宁区', valueState: 'unknown', kind: 'cascader', selectionControl: 'cascader-leaf' },
			],
			elements: [],
			simplifiedDom: [
				'<cascader-option index="33" role="menuitem" region="popover" kind="cascader" control="cascader-leaf">江宁区</cascader-option>',
			],
		},
		sessionOverrides: {
			task,
			latestTask: task,
			history: [
				{
					action: 'select_cascader_path',
					input: {
						index: 7,
						path: ['江苏省', '南京市', '江宁区（'],
						workflow: 'form-fill',
						workflow_step: 'select_cascader_path_timeout_recovery',
						workflow_field_label: '配送区域',
					},
					success: false,
					output: '级联选择失败：未找到第 3 级选项 "江宁区（"。 当前第 3 级可见项: 栖霞区、江宁区。',
				},
			],
		},
	})
	assertAction(decision.result, 'click_element_by_index')
	if (
		decision.result.action.input.index !== 33 ||
		decision.result.action.input.workflow !== 'form-fill' ||
		decision.result.action.input.workflow_step !== 'select_visible_cascader_option_timeout_recovery'
	) {
		throw new Error(`timeout recovery should click the visible cleaned cascader candidate, got ${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerTimeoutRecoverySubmitsAfterFormFillRecovery() {
	const task = '新建一条资料，名称是晨会，配送区域是华东区，江苏省，南京市。'
	const history = [
		{
			action: 'select_cascader_path',
			input: {
				index: 7,
				path: ['华东区', '江苏省', '南京市'],
				workflow: 'form-fill',
				workflow_step: 'select_cascader_path_timeout_recovery',
			},
			success: true,
		},
	]
	const visibleSubmitDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			title: '资料-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '新增弹层',
					fields: [
						{ index: 1, region: 'dialog', fieldType: 'name', kind: 'text', label: '名称', valueState: 'filled:晨会', role: 'textbox' },
						{ index: 7, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '配送区域', valueState: 'selected:华东区 / 江苏省 / 南京市', role: 'combobox', selectionControl: 'cascader-parent' },
					],
				},
			],
			actions: [
				{ index: 7, region: 'dialog', role: 'combobox', label: '配送区域', valueState: 'selected:华东区 / 江苏省 / 南京市', kind: 'cascader', selectionControl: 'cascader-parent' },
				{ index: 18, region: 'dialog', role: 'button', label: '保 存', actionIntent: 'create' },
				{ index: 19, region: 'dialog', role: 'button', label: '取 消', actionIntent: 'cancel' },
			],
			elements: [],
			simplifiedDom: [
				'<button index="18" role="button" region="dialog" intent="create">保 存</button>',
			],
		},
		sessionOverrides: {
			task,
			latestTask: task,
			history,
		},
	})
	assertAction(visibleSubmitDecision.result, 'click_element_by_index')
	if (
		visibleSubmitDecision.result.action.input.index !== 18 ||
		visibleSubmitDecision.result.action.input.workflow !== 'form-fill' ||
		visibleSubmitDecision.result.action.input.workflow_step !== 'submit_form_timeout_recovery'
	) {
		throw new Error(`timeout recovery should click the visible submit button after form-fill recovery, got ${JSON.stringify(visibleSubmitDecision.result)}`)
	}

	const modelFilledSubmitDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			title: '资料-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '新增弹层',
					fields: [
						{ index: 1, region: 'dialog', fieldType: 'unknown', kind: 'text', label: '资料公司名称', valueState: 'filled:张三', role: 'textbox' },
						{ index: 2, region: 'dialog', fieldType: 'unknown', kind: 'text', label: '联系方式', valueState: 'filled:145555555', role: 'textbox' },
						{ index: 3, region: 'dialog', fieldType: 'unknown', kind: 'text', label: '纳税人识别号', valueState: 'filled:IOOO123456', role: 'textbox' },
						{ index: 4, region: 'dialog', fieldType: 'select', kind: 'dropdown', label: '资料等级', valueState: 'selected:核心', role: 'combobox', selectionControl: 'dropdown' },
						{ index: 5, region: 'dialog', fieldType: 'select', kind: 'dropdown', label: '资料性质', valueState: 'selected:IT', role: 'combobox', selectionControl: 'dropdown' },
						{ index: 6, region: 'dialog', fieldType: 'category', kind: 'dropdown', label: '产品类别', valueState: 'selected:民品件', role: 'combobox', selectionControl: 'dropdown' },
						{ index: 7, region: 'dialog', fieldType: 'region', kind: 'cascader', label: '资料所在地', valueState: 'selected:江苏省 / 南京市 / 江宁区', role: 'combobox', selectionControl: 'cascader-parent' },
						{ index: 8, region: 'dialog', fieldType: 'unknown', kind: 'text', label: '详细地址', valueState: 'empty', role: 'textbox' },
						{ index: 9, region: 'dialog', fieldType: 'select', kind: 'dropdown', label: '税组合', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown' },
					],
				},
			],
			actions: [
				{ index: 19, region: 'dialog', role: 'button', label: '保 存', actionIntent: 'create' },
				{ index: 0, region: 'dialog', role: 'button', label: '保 存', actionIntent: 'create' },
				{ index: 20, region: 'dialog', role: 'button', label: '取 消', actionIntent: 'cancel' },
			],
			elements: [],
			simplifiedDom: [
				'<button index="19" role="button" region="dialog" intent="create">保 存</button>',
				'<button index="0" role="button" region="dialog" intent="create">保 存</button>',
			],
		},
		sessionOverrides: {
			task: '打开页面并新建资料，联系方式是145555555，纳税人识别号是IOOO123456，资料等级是核心，资料性质是IT，产品类别是民品件，资料所在地是江苏省，南京市，江宁区（',
			latestTask: '打开页面并新建资料，联系方式是145555555，纳税人识别号是IOOO123456，资料等级是核心，资料性质是IT，产品类别是民品件，资料所在地是江苏省，南京市，江宁区（',
			history: [
				{ action: 'input_text', input: { index: 1, text: '张三' }, success: true },
				{ action: 'choose_dropdown_option', input: { index: 6, text: '民品件' }, success: true },
				{ action: 'select_cascader_path', input: { index: 7, path: ['江苏省', '南京市', '江宁区'] }, success: true },
			],
		},
	})
	assertAction(modelFilledSubmitDecision.result, 'click_element_by_index')
	if (
		![0, 19].includes(Number(modelFilledSubmitDecision.result.action.input.index)) ||
		modelFilledSubmitDecision.result.action.input.workflow !== 'form-fill' ||
		modelFilledSubmitDecision.result.action.input.workflow_step !== 'submit_form_timeout_recovery'
	) {
		throw new Error(`timeout recovery should submit once model-filled requested fields are satisfied, got ${JSON.stringify(modelFilledSubmitDecision.result)}`)
	}

	const visualSubmitDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			title: '资料-示例系统',
			forms: [
				{
					id: 'page_form',
					name: '页面表单',
					fields: [
						{ index: 2, region: 'content', fieldType: 'select', kind: 'dropdown', label: '首页个人信息退出登录', valueState: 'selected:首页个人信息退出登录', role: 'combobox', selectionControl: 'dropdown' },
					],
				},
			],
			actions: [
				{ index: 28, region: 'sidebar', role: 'button', label: '新 增', actionIntent: 'create' },
				{ index: 36, region: 'content', role: 'button', label: '展开搜索', actionIntent: 'open_filter' },
			],
			elements: [],
			simplifiedDom: [
				'<button index="28" role="button" region="sidebar" intent="create">新 增</button>',
			],
		},
		sessionOverrides: {
			task,
			latestTask: task,
			history,
		},
	})
	assertAction(visualSubmitDecision.result, 'locate_by_vision')
	if (
		visualSubmitDecision.result.action.input.workflow !== 'form-fill' ||
		visualSubmitDecision.result.action.input.workflow_step !== 'submit_form_timeout_recovery' ||
		!/保存|提交|确定/.test(String(visualSubmitDecision.result.action.input.target_description || ''))
	) {
		throw new Error(`timeout recovery should fall back to a constrained submit vision target, got ${JSON.stringify(visualSubmitDecision.result)}`)
	}
	if (Number(visualSubmitDecision.result.action.input.index) === 28) {
		throw new Error(`timeout recovery must not click the create-entry button as a submit action, got ${JSON.stringify(visualSubmitDecision.result)}`)
	}

	const repeatedSubmitDecision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			const error = new Error('abort')
			error.name = 'AbortError'
			throw error
		},
		observation: {
			...buildTestObservation(),
			forms: [],
			actions: [
				{ index: 18, region: 'dialog', role: 'button', label: '保存', actionIntent: 'submit' },
			],
			elements: [],
			simplifiedDom: [],
		},
		sessionOverrides: {
			task,
			latestTask: task,
			history: [
				...history,
				{
					action: 'locate_by_vision',
					input: {
						target_description: '当前打开的表单或弹层底部的保存、提交或确定按钮',
						workflow: 'form-fill',
						workflow_step: 'submit_form_timeout_recovery',
					},
					success: false,
				},
			],
		},
	})
	assertAction(repeatedSubmitDecision.result, 'done')
	if (repeatedSubmitDecision.result.action.input.success !== false) {
		throw new Error(`submit timeout recovery should not repeat after a recent failed submit attempt, got ${JSON.stringify(repeatedSubmitDecision.result)}`)
	}
}

async function assertPlannerPreModelFormFillSkipsModelWhenDeterministic() {
	let requestCount = 0
	const task = '新建一条资料，名称是晨会，类型是会议。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called for deterministic form fill')
		},
		observation: {
			...buildTestObservation(),
			title: '资料-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '新增弹层',
					fields: [
						{ index: 1, region: 'dialog', fieldType: 'name', kind: 'text', label: '名称', valueState: 'empty', role: 'textbox' },
						{ index: 2, region: 'dialog', fieldType: 'select', kind: 'dropdown', label: '类型', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown' },
					],
				},
			],
			actions: [
				{ index: 18, region: 'dialog', role: 'button', label: '保存', actionIntent: 'submit' },
			],
			elements: [],
			simplifiedDom: [],
		},
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: {
				taskIntent: {
						version: 4,
					status: 'ready',
					intent: {
						navigationTargets: [],
						operation: 'create',
						createEntryLabels: ['新增', '新建', '创建', '添加'],
						forbiddenNavigationTargets: [],
					},
				},
			},
		},
	})
	assertAction(decision.result, 'input_text')
	if (requestCount !== 0 || decision.result.action.input.index !== 1 || decision.result.action.input.text !== '晨会') {
		throw new Error(`deterministic form-fill should skip model and fill the first assigned field, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
	if (!String(decision.result.evaluation_previous_goal || '').includes('唯一确定')) {
		throw new Error(`pre-model form-fill decision should not claim a model timeout, got ${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerPreModelFormFillMatchesSpecificNameAlias() {
	let requestCount = 0
	const task = '新建一条主体档案，主体名称是北星科技，联系方式是145555555。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called for deterministic alias form fill')
		},
		observation: {
			...buildTestObservation(),
			title: '主体档案-示例系统',
			forms: [
				{
					id: 'dialog',
					name: '新增弹层',
					fields: [
						{ index: 2, region: 'dialog', fieldType: 'name', kind: 'text', label: '主体公司名称', valueState: 'empty', role: 'textbox' },
						{ index: 3, region: 'dialog', fieldType: 'phone', kind: 'text', label: '联系方式', valueState: 'empty', role: 'textbox' },
					],
				},
			],
			actions: [
				{ index: 18, region: 'dialog', role: 'button', label: '保存', actionIntent: 'submit' },
			],
			elements: [],
			simplifiedDom: [],
		},
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: {
				taskIntent: {
						version: 4,
					status: 'ready',
					intent: {
						navigationTargets: [],
						operation: 'create',
						createEntryLabels: ['新增', '新建', '创建', '添加'],
						forbiddenNavigationTargets: [],
					},
				},
			},
		},
	})
	assertAction(decision.result, 'input_text')
	if (requestCount !== 0 || decision.result.action.input.index !== 2 || decision.result.action.input.text !== '北星科技') {
		throw new Error(`deterministic form-fill should map concise task label to specific organization-name field, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerPreModelInputFieldTestSkipsModelWhenDeterministic() {
	let requestCount = 0
	const task = '测试页面每一个输入框是否正常'
	const observation = {
		...buildTestObservation(),
		title: '通用表单页面',
		forms: [
			{
				id: 'header',
				name: '顶部区域',
				fields: [
					{ index: 1, region: 'header', fieldType: 'search', kind: 'input', label: '请输入搜索内容', type: 'search', role: 'textbox', rect: { left: 80, top: 8, width: 240, height: 32 } },
				],
			},
			{
				id: 'page',
				name: '页面主体表单',
				fields: [
					{ index: 11, region: 'content', fieldType: 'text', kind: 'input', label: '用户名', type: 'text', role: 'textbox', valueState: 'empty', rect: { left: 20, top: 80, width: 180, height: 32 } },
					{ index: 12, region: 'content', fieldType: 'email', kind: 'input', label: '联系邮箱', type: 'email', role: 'textbox', valueState: 'empty', rect: { left: 220, top: 80, width: 180, height: 32 } },
					{ index: 13, region: 'content', fieldType: 'password', kind: 'input', label: '登录密码', type: 'password', role: 'textbox', valueState: 'empty', rect: { left: 20, top: 130, width: 180, height: 32 } },
					{ index: 14, region: 'content', fieldType: 'text', kind: 'input', label: '验证码', type: 'text', role: 'textbox', valueState: 'empty', rect: { left: 220, top: 130, width: 180, height: 32 } },
					{ index: 15, region: 'content', fieldType: 'select', kind: 'dropdown', label: '状态', role: 'combobox', selectionControl: 'dropdown', valueState: 'empty', rect: { left: 20, top: 180, width: 180, height: 32 } },
					{ index: 16, region: 'pagination', fieldType: 'number', kind: 'input', label: '前往页码', type: 'number', role: 'textbox', rect: { left: 420, top: 680, width: 80, height: 28 } },
					{ index: 17, region: 'content', fieldType: 'text', kind: 'input', label: '邮政编码', placeholder: '请输入6位数字', type: 'text', role: 'textbox', valueState: 'empty', maxLength: 6, pattern: '\\d{6}', rect: { left: 20, top: 230, width: 180, height: 32 } },
					{ index: 18, region: 'content', fieldType: 'number', kind: 'input', label: '数量', type: 'number', role: 'textbox', valueState: 'empty', min: '2', max: '9', step: '1', rect: { left: 220, top: 230, width: 180, height: 32 } },
					{ index: 19, region: 'content', fieldType: 'number', kind: 'input', label: '奇数数量', type: 'number', role: 'textbox', valueState: 'empty', min: '1', max: '10', step: '2', rect: { left: 20, top: 280, width: 180, height: 32 } },
				],
			},
		],
		actions: [],
		elements: [],
		simplifiedDom: [],
	}
	const baseSession = {
		task,
		latestTask: task,
		workflowState: {
			taskIntent: {
				version: 4,
				status: 'ready',
				intent: {
					navigationTargets: [],
					operation: '',
					forbiddenNavigationTargets: [],
				},
			},
		},
	}
	const progressEvents = []
	const first = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called for deterministic input-field tests')
		},
		observation,
		sessionOverrides: baseSession,
		planOptions: {
			onProgress: (event) => progressEvents.push(event),
		},
	})
	assertAction(first.result, 'input_text')
	if (
		requestCount !== 0 ||
		first.result.action.input.workflow !== 'field-test' ||
			first.result.action.input.workflow_step !== 'test_input_field' ||
			first.result.action.input.index !== 11 ||
			first.result.action.input.text !== 'NaturalClickTest' ||
			first.result.action.input.workflow_field_total !== 6
		) {
			throw new Error(`deterministic input-field test should fill the first safe content input and skip header/pagination/unsafe controls, calls=${requestCount}, result=${JSON.stringify(first.result)}`)
		}
		const progressText = String(progressEvents.find((event) => event.stage === 'workflow_decision')?.text || '')
		for (const expected of ['正在测试页面输入框第 1/6 个', '填写「用户名」', 'index=11']) {
			if (!progressText.includes(expected)) {
				throw new Error(`input-field workflow progress should expose ${expected}, got ${JSON.stringify(progressEvents)}`)
			}
	}
	const second = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called for the next input-field test')
		},
		observation,
		sessionOverrides: {
			...baseSession,
			history: [
				{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:11', workflow_field_index: 11, workflow_field_label: '用户名', index: 11, text: 'NaturalClickTest' }, success: true },
			],
		},
	})
	assertAction(second.result, 'input_text')
	if (second.result.action.input.index !== 12 || second.result.action.input.text !== 'test@example.com') {
		throw new Error(`deterministic input-field test should continue to the email field with a type-aware value, got ${JSON.stringify(second.result)}`)
	}
	const third = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called for password input-field test')
		},
		observation,
		sessionOverrides: {
			...baseSession,
			history: [
				{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:11', workflow_field_index: 11, workflow_field_label: '用户名', index: 11, text: 'NaturalClickTest' }, success: true },
				{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:12', workflow_field_index: 12, workflow_field_label: '联系邮箱', index: 12, text: 'test@example.com' }, success: true },
			],
		},
	})
	assertAction(third.result, 'input_text')
		if (third.result.action.input.index !== 13 || third.result.action.input.text !== 'NcTest123!' || third.result.action.input.workflow_field_type !== 'password') {
			throw new Error(`deterministic input-field test should include password fields with masked-summary-compatible metadata, got ${JSON.stringify(third.result)}`)
		}
		const fourth = await runPlannerWithFakeModel({
			fetchImpl: async () => {
				requestCount += 1
				throw new Error('model should not be called for constrained text input-field test')
			},
			observation,
			sessionOverrides: {
				...baseSession,
				history: [
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:11', workflow_field_index: 11, workflow_field_label: '用户名', index: 11, text: 'NaturalClickTest' }, success: true },
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:12', workflow_field_index: 12, workflow_field_label: '联系邮箱', index: 12, text: 'test@example.com' }, success: true },
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:13', workflow_field_index: 13, workflow_field_label: '登录密码', index: 13, text: 'NcTest123!', type: 'password' }, success: true },
				],
			},
		})
		assertAction(fourth.result, 'input_text')
		if (
			fourth.result.action.input.index !== 17 ||
			fourth.result.action.input.text !== '111111' ||
			fourth.result.action.input.workflow_value_source !== 'type_constraints' ||
			!String(fourth.result.action.input.workflow_value_basis || '').includes('digits=6') ||
			!String(fourth.result.action.input.workflow_value_basis || '').includes('maxLength=6')
		) {
			throw new Error(`deterministic input-field test should honor pattern/maxLength constraints, got ${JSON.stringify(fourth.result)}`)
		}
		const fifth = await runPlannerWithFakeModel({
			fetchImpl: async () => {
				requestCount += 1
				throw new Error('model should not be called for constrained number input-field test')
			},
			observation,
			sessionOverrides: {
				...baseSession,
				history: [
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:11', workflow_field_index: 11, workflow_field_label: '用户名', index: 11, text: 'NaturalClickTest' }, success: true },
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:12', workflow_field_index: 12, workflow_field_label: '联系邮箱', index: 12, text: 'test@example.com' }, success: true },
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:13', workflow_field_index: 13, workflow_field_label: '登录密码', index: 13, text: 'NcTest123!', type: 'password' }, success: true },
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:17', workflow_field_index: 17, workflow_field_label: '邮政编码', index: 17, text: '111111' }, success: true },
				],
			},
		})
		assertAction(fifth.result, 'input_text')
		if (
			fifth.result.action.input.index !== 18 ||
			fifth.result.action.input.text !== '9' ||
			fifth.result.action.input.workflow_value_source !== 'type_constraints' ||
			!String(fifth.result.action.input.workflow_value_basis || '').includes('max=9')
		) {
			throw new Error(`deterministic input-field test should honor number min/max constraints, got ${JSON.stringify(fifth.result)}`)
		}
		const sixth = await runPlannerWithFakeModel({
			fetchImpl: async () => {
				requestCount += 1
				throw new Error('model should not be called for stepped number input-field test')
			},
			observation,
			sessionOverrides: {
				...baseSession,
				history: [
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:11', workflow_field_index: 11, workflow_field_label: '用户名', index: 11, text: 'NaturalClickTest' }, success: true },
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:12', workflow_field_index: 12, workflow_field_label: '联系邮箱', index: 12, text: 'test@example.com' }, success: true },
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:13', workflow_field_index: 13, workflow_field_label: '登录密码', index: 13, text: 'NcTest123!', type: 'password' }, success: true },
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:17', workflow_field_index: 17, workflow_field_label: '邮政编码', index: 17, text: '111111' }, success: true },
					{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:18', workflow_field_index: 18, workflow_field_label: '数量', index: 18, text: '9' }, success: true },
				],
			},
		})
		assertAction(sixth.result, 'input_text')
		if (
			sixth.result.action.input.index !== 19 ||
			sixth.result.action.input.text !== '9' ||
			sixth.result.action.input.workflow_value_source !== 'type_constraints' ||
			!String(sixth.result.action.input.workflow_value_basis || '').includes('min=1') ||
			!String(sixth.result.action.input.workflow_value_basis || '').includes('max=10') ||
			!String(sixth.result.action.input.workflow_value_basis || '').includes('step=2')
		) {
			throw new Error(`deterministic input-field test should honor number step constraints, got ${JSON.stringify(sixth.result)}`)
		}
		const done = await runPlannerWithFakeModel({
			fetchImpl: async () => {
				requestCount += 1
			throw new Error('model should not be called after all input fields are tested')
		},
		observation,
		sessionOverrides: {
			...baseSession,
			history: [
				{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:11', workflow_field_index: 11, workflow_field_label: '用户名', index: 11, text: 'NaturalClickTest' }, success: true },
				{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:12', workflow_field_index: 12, workflow_field_label: '联系邮箱', index: 12, text: 'test@example.com' }, success: true },
				{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:13', workflow_field_index: 13, workflow_field_label: '登录密码', index: 13, text: 'NcTest123!', type: 'password' }, success: true },
				{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:17', workflow_field_index: 17, workflow_field_label: '邮政编码', index: 17, text: '111111' }, success: true },
				{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:18', workflow_field_index: 18, workflow_field_label: '数量', index: 18, text: '9' }, success: true },
				{ action: 'input_text', input: { workflow: 'field-test', workflow_step: 'test_input_field', workflow_field_key: 'index:19', workflow_field_index: 19, workflow_field_label: '奇数数量', index: 19, text: '9' }, success: true },
			],
		},
	})
	assertAction(done.result, 'done')
	if (
			done.result.action.input.workflow !== 'field-test' ||
			done.result.action.input.workflow_step !== 'finish_field_test' ||
			done.result.action.input.success !== true ||
			done.result.action.input.workflow_field_total !== 6 ||
			requestCount !== 0
	) {
		throw new Error(`deterministic input-field test should finish after all safe inputs are attempted, calls=${requestCount}, result=${JSON.stringify(done.result)}`)
	}
}

async function assertPlannerDuplicateFormConflictAsksForReplacement() {
	let requestCount = 0
	const task = '新建一条主体档案，主体名称是张三。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called for duplicate conflict handling')
		},
		observation: buildDuplicateConflictObservation(),
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: buildCreateIntentState(),
			history: [
				buildDuplicateSubmitFailureHistory('主体名称已存在'),
			],
		},
	})
	assertAction(decision.result, 'ask_user')
	if (
		requestCount !== 0 ||
		decision.result.action.input.workflow_step !== 'resolve_duplicate_field_conflict' ||
		decision.result.action.input.workflow_field_index !== 2 ||
		!/重复|已存在/.test(String(decision.result.action.input.question || '')) ||
		!/重复|已存在|不会推进/.test(String(decision.result.action.input.reason || ''))
	) {
		throw new Error(`duplicate submit conflict should ask the user for a replacement value, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerAmbiguousDuplicateFormConflictUsesModel() {
	let requestCount = 0
	const task = '新建一条主体档案，主体名称是张三，联系方式是145555555。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			return fakeJsonResponse({
				evaluation_previous_goal: '提交后只看到泛化重复提示，无法可靠定位冲突字段。',
				memory: '不要把没有字段名的重复提示默认归因到名称字段。',
				thought: '当前错误缺少字段名，需要交由模型结合页面和历史重新判断。',
				next_goal: '停止并报告字段冲突不明确',
				action: {
					name: 'done',
					input: {
						success: false,
						text: '表单提示重复，但当前观察无法确认是哪个字段冲突。',
					},
				},
			})
		},
		observation: buildDuplicateConflictObservation(),
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: buildCreateIntentState(),
			history: [
				buildDuplicateSubmitFailureHistory('重复'),
			],
		},
	})
	assertAction(decision.result, 'done')
	if (requestCount !== 1 || decision.result.action.input.success !== false) {
		throw new Error(`ambiguous duplicate conflict should be delegated to the model, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerAmbiguousDuplicateAfterReplacementUsesModel() {
	let requestCount = 0
	const task = '新建一条主体档案，主体名称是张三，联系方式是145555555。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			return fakeJsonResponse({
				evaluation_previous_goal: '名称已改写后仍出现泛化重复提示。',
				memory: '上次已经改过名称字段；缺少字段名时不继续猜测同一字段。',
				thought: '重复提示可能来自其他唯一字段，需要重新分析当前页面错误。',
				next_goal: '重新判断冲突字段',
				action: {
					name: 'done',
					input: {
						success: false,
						text: '名称改写后仍提示重复，当前观察无法确认新的冲突字段。',
					},
				},
			})
		},
		observation: buildDuplicateConflictObservation('张三ab12'),
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: buildCreateIntentState(),
			history: [
				buildDuplicateSubmitFailureHistory('主体名称已存在'),
				{
					action: 'ask_user',
					input: {
						workflow_step: 'resolve_duplicate_field_conflict',
						workflow_field_label: '主体名称',
						workflow_field_index: 2,
						workflow_old_value: '张三',
					},
					success: true,
					output: '用户回答: 张三ab12',
				},
				{
					action: 'input_text',
					input: {
						index: 2,
						text: '张三ab12',
						workflow: 'form-fill',
						workflow_step: 'resolve_duplicate_field_conflict',
						workflow_field_label: '主体名称',
						workflow_old_value: '张三',
					},
					success: true,
					output: '已在索引 2 输入文本。 | 动作结果: value_changed progress=true',
				},
				buildDuplicateSubmitFailureHistory('重复'),
			],
		},
	})
	assertAction(decision.result, 'done')
	if (requestCount !== 1 || decision.result.action.input.success !== false) {
		throw new Error(`ambiguous duplicate after replacement should be delegated to the model, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerDuplicateFormConflictUsesUserReplacement() {
	let requestCount = 0
	const task = '新建一条主体档案，主体名称是张三。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called after user supplies duplicate replacement')
		},
		observation: buildDuplicateConflictObservation(),
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: buildCreateIntentState(),
			history: [
				buildDuplicateSubmitFailureHistory('主体名称已存在'),
				{
					action: 'ask_user',
					input: {
						workflow_step: 'resolve_duplicate_field_conflict',
						workflow_field_label: '主体名称',
						workflow_field_index: 2,
						workflow_old_value: '张三',
					},
					success: true,
					output: '用户回答: 张三-2',
				},
			],
		},
	})
	assertAction(decision.result, 'input_text')
	if (
		requestCount !== 0 ||
		decision.result.action.input.index !== 2 ||
		decision.result.action.input.text !== '张三-2' ||
		decision.result.action.input.workflow_step !== 'resolve_duplicate_field_conflict'
	) {
		throw new Error(`duplicate conflict should rewrite the conflicting field with the user replacement, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerDuplicateFormConflictSubmitsAfterReplacement() {
	let requestCount = 0
	const task = '新建一条主体档案，主体名称是张三。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called after duplicate replacement has been written')
		},
		observation: buildDuplicateConflictObservation('张三-2'),
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: buildCreateIntentState(),
			history: [
				buildDuplicateSubmitFailureHistory('主体名称已存在'),
				{
					action: 'ask_user',
					input: {
						workflow_step: 'resolve_duplicate_field_conflict',
						workflow_field_label: '主体名称',
						workflow_field_index: 2,
						workflow_old_value: '张三',
					},
					success: true,
					output: '用户回答: 张三-2',
				},
				{
					action: 'input_text',
					input: {
						index: 2,
						text: '张三-2',
						workflow_step: 'resolve_duplicate_field_conflict',
						workflow_field_label: '主体名称',
						workflow_old_value: '张三',
					},
					success: true,
					output: '已在索引 2 输入文本。 | 动作结果: value_changed progress=true',
				},
			],
		},
	})
	assertAction(decision.result, 'click_element_by_index')
	if (
		requestCount !== 0 ||
		decision.result.action.input.index !== 18 ||
		decision.result.action.input.workflow_step !== 'submit_form_timeout_recovery'
	) {
		throw new Error(`duplicate conflict replacement should be followed by submitting the form, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerDuplicateFormConflictIgnoresLoopGuardAfterReplacement() {
	let requestCount = 0
	const task = '新建一条主体档案，主体名称是张三。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called when recovering from a loop-guarded submit retry')
		},
		observation: buildDuplicateConflictObservation('张三-2'),
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: buildCreateIntentState(),
			history: [
				buildDuplicateSubmitFailureHistory('主体名称已存在'),
				{
					action: 'ask_user',
					input: {
						workflow_step: 'resolve_duplicate_field_conflict',
						workflow_field_label: '主体名称',
						workflow_field_index: 2,
						workflow_old_value: '张三',
					},
					success: true,
					output: '用户回答: 张三-2',
				},
				{
					action: 'input_text',
					input: {
						index: 2,
						text: '张三-2',
						workflow: 'form-fill',
						workflow_step: 'resolve_duplicate_field_conflict',
						workflow_field_label: '主体名称',
						workflow_old_value: '张三',
					},
					success: true,
					output: '已在索引 2 输入文本。 | 动作结果: value_changed progress=true',
					outcome: { kind: 'value_changed', progress: true },
				},
				{
					action: 'click_element_by_index.loop_guard',
					input: {
						index: 18,
						workflow: 'form-fill',
						workflow_step: 'submit_form_timeout_recovery',
						workflow_submit_label: '保存',
					},
					success: false,
					output: '检测到同一失败动作参数重复：click_element_by_index {"index":18,"workflow":"form-fill","workflow_step":"submit_form_timeout_recovery","workflow_submit_label":"保存"}',
				},
			],
		},
	})
	assertAction(decision.result, 'click_element_by_index')
	if (
		requestCount !== 0 ||
		decision.result.action.input.index !== 18 ||
		decision.result.action.input.workflow_step !== 'submit_form_timeout_recovery'
	) {
		throw new Error(`loop-guard repeat feedback should not be treated as duplicate field conflict, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerValidationErrorCorrectsForbiddenCharacters() {
	let requestCount = 0
	const task = '新建一条主体档案，主体名称是张三。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called for deterministic validation correction')
		},
		observation: buildDuplicateConflictObservation('张三-ab12', '主体名称不能包含 - 字符'),
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: buildCreateIntentState(),
			history: [
				buildDuplicateSubmitFailureHistory('主体名称已存在'),
				{
					action: 'ask_user',
					input: {
						workflow_step: 'resolve_duplicate_field_conflict',
						workflow_field_label: '主体名称',
						workflow_field_index: 2,
						workflow_old_value: '张三',
					},
					success: true,
					output: '用户回答: 张三-ab12',
				},
				{
					action: 'input_text',
					input: {
						index: 2,
						text: '张三-ab12',
						workflow: 'form-fill',
						workflow_step: 'resolve_duplicate_field_conflict',
						workflow_field_label: '主体名称',
						workflow_old_value: '张三',
					},
					success: true,
					output: '已在索引 2 输入文本。 | 动作结果: value_changed progress=true',
				},
				buildSubmitFailureHistory('请输入'),
			],
		},
	})
	assertAction(decision.result, 'input_text')
	if (
		requestCount !== 0 ||
		decision.result.action.input.index !== 2 ||
		decision.result.action.input.text !== '张三ab12' ||
		decision.result.action.input.workflow_step !== 'resolve_field_validation_error'
	) {
		throw new Error(`field validation error should be corrected from page feedback, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
}

async function assertPlannerValidationCorrectionSubmits() {
	let requestCount = 0
	const task = '新建一条主体档案，主体名称是张三。'
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async () => {
			requestCount += 1
			throw new Error('model should not be called after validation correction')
		},
		observation: buildDuplicateConflictObservation('张三ab12'),
		sessionOverrides: {
			task,
			latestTask: task,
			workflowState: buildCreateIntentState(),
			history: [
				buildSubmitFailureHistory('请输入'),
				{
					action: 'input_text',
					input: {
						index: 2,
						text: '张三ab12',
						workflow: 'form-fill',
						workflow_step: 'resolve_field_validation_error',
						workflow_field_label: '主体名称',
						workflow_old_value: '张三-ab12',
					},
					success: true,
					output: '已在索引 2 输入文本。 | 动作结果: value_changed progress=true',
				},
			],
		},
	})
	assertAction(decision.result, 'click_element_by_index')
	if (
		requestCount !== 0 ||
		decision.result.action.input.index !== 18 ||
		decision.result.action.input.workflow_step !== 'submit_form_timeout_recovery'
	) {
		throw new Error(`validation correction should be followed by submitting the form, calls=${requestCount}, result=${JSON.stringify(decision.result)}`)
	}
}

function buildDuplicateConflictObservation(nameValue = '张三', validationError = '') {
	const invalid = !!validationError
	return {
		...buildTestObservation(),
		title: '主体档案-示例系统',
		forms: [
			{
				id: 'dialog',
				name: '新增弹层',
				fields: [
					{ index: 2, region: 'dialog', fieldType: 'name', kind: 'text', label: '主体名称', valueState: `filled:${nameValue}`, role: 'textbox', invalid, error: validationError },
					{ index: 3, region: 'dialog', fieldType: 'phone', kind: 'text', label: '联系方式', valueState: 'filled:145555555', role: 'textbox' },
				],
			},
		],
		actions: [
			{ index: 18, region: 'dialog', role: 'button', label: '保存', actionIntent: 'submit' },
		],
		elements: [],
		simplifiedDom: [],
	}
}

function buildCreateIntentState() {
	return {
		taskIntent: {
			version: 4,
			status: 'ready',
			intent: {
				navigationTargets: [],
				operation: 'create',
				createEntryLabels: ['新增', '新建', '创建', '添加'],
				forbiddenNavigationTargets: [],
			},
		},
	}
}

function buildDuplicateSubmitFailureHistory(message) {
	return buildSubmitFailureHistory(message)
}

function buildSubmitFailureHistory(message) {
	return {
		action: 'click_element_by_index',
		input: {
			index: 18,
			workflow: 'form-fill',
			workflow_step: 'submit_form_timeout_recovery',
			workflow_submit_label: '保存',
		},
		success: false,
		output: `动作校验失败: form_submit_failed: 表单提交后观察到错误/校验提示: ${message}`,
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
							label: '账号平台',
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
					label: '账号平台',
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
					evaluationPreviousGoal: '选择账号平台失败，候选中没有 WEB。',
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
	if (!firstUser.includes('eval=选择账号平台失败') || !firstUser.includes('thought=需要从真实候选中重新选择')) {
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
		observation: buildDropdownTestObservation('账号平台'),
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
	if (
		!secondUser.includes('invalid_action_input="true"') ||
		!secondUser.includes('failure_kind="repeat_selection_attempt"') ||
		!secondUser.includes('禁止重复同一个 requested') ||
		!secondUser.includes('企业端|后台端') ||
		!secondUser.includes('candidates')
	) {
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
	if (
		!secondUser.includes('invalid_action_input="true"') ||
		!secondUser.includes('failure_kind="repeat_selection_attempt"') ||
		!secondUser.includes('不要重复只展开同一字段') ||
		!secondUser.includes('启用|禁用') ||
		!secondUser.includes('candidates')
	) {
		throw new Error(`repeated dropdown-open feedback missing from follow-up planning request: ${secondUser}`)
	}
}

async function assertPlannerRejectsInvisibleDropdownTextWhenScopedOptionsVisible() {
	const requestBodies = []
	const observation = buildDropdownTestObservation('账号平台')
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
					evaluation_previous_goal: '账号平台候选已经可见。',
					memory: '错误地猜了一个没有出现的候选。',
					thought: '误选 WEB。',
					next_goal: '选择 WEB。',
					action: { name: 'choose_dropdown_option', input: { index: 4, text: 'WEB', target_label: '账号平台' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '上一轮参数反馈列出了真实候选。',
				memory: '账号平台候选包含企业端和后台端。',
				thought: '改选可见真实候选。',
				next_goal: '选择企业端。',
				action: { name: 'choose_dropdown_option', input: { index: 4, text: '企业端', target_label: '账号平台' } },
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
	const task = '打开 http://example.test/app，找到单据中心并测试搜索条件。'
	const observation = buildTestObservation()
	observation.title = '首页'
	observation.actions = [
		{
			index: 8,
			region: 'header',
			role: 'tab',
			label: '单据中心',
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
					input: { index: 8, target_label: '单据中心' },
					nextGoal: '进入目标模块：单据中心',
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
	if (!firstUser.includes('<workflow_hints>') || !firstUser.includes('单据中心') || !firstUser.includes('status="unresolved"')) {
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
				action: { name: 'input_text', input: { index: 3, text: 'react-ok', target_label: '搜索' } },
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
			? '<menuitem index="429" role="menuitem" region="sidebar">账户中心</menuitem>'
			: `<menuitem index="${400 + index}" role="menuitem" region="sidebar">菜单 ${index}</menuitem>`
	)
	const compactNavText = context.buildObservationText(navObservation, {
		task: '找到账户中心部分并创建账号',
		compact: true,
		maxChars: 4200,
	})
	if (!compactNavText.includes('index="429"') || !compactNavText.includes('账户中心')) {
		throw new Error(`compact observation should promote simplified_dom rows matching unresolved task targets, got ${compactNavText}`)
	}
	const contextTargets = context.extractTaskTargetLabels('打开这个页面 http://example.test/ 找到资料管理。你现在帮我测试资料管理的每一个搜索功能是否正常实现。')
	if (!contextTargets.includes('资料管理') || contextTargets.some((target) => /帮我测试资料管理|测试资料管理|现在帮我/.test(target))) {
		throw new Error(`planner context should normalize task target labels the same way workflows do, got ${JSON.stringify(contextTargets)}`)
	}
	const genericContextTargets = context.extractTaskTargetLabels('Open the Pricing page and then go to Settings screen. 进入帮助页面，然后搜索 FAQ。')
	for (const expected of ['Pricing', 'Settings', '帮助']) {
		if (!genericContextTargets.includes(expected)) {
			throw new Error(`planner context should extract generic page/section target ${expected}, got ${JSON.stringify(genericContextTargets)}`)
		}
	}
	if (genericContextTargets.some((target) => /FAQ|http|password|账号|密码/i.test(target))) {
		throw new Error(`planner context should not extract URLs, search terms, or credentials as task targets, got ${JSON.stringify(genericContextTargets)}`)
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
		task: '找到资料管理，新建一条资料数据',
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
	const fallbackTableObservation = buildTestObservation()
	fallbackTableObservation.tables = []
	fallbackTableObservation.simplifiedDom = [
		'row 1 region="content" table="list" 销售姓名=管理员 | 客户公司名称=星火科技 | 客户编号=KH_001',
	]
	fallbackTableObservation.rawCandidates = []
	const fallbackTablesChunk = context.resolvePlanningContextRequest(
		fallbackTableObservation,
		{ name: 'request_context', input: { source: 'tables', region: 'content', limit: 10 } },
		0
	).text
	if (!fallbackTablesChunk.includes('星火科技') || fallbackTablesChunk.includes('no_observed_tables')) {
		throw new Error(`tables request_context should fall back to table-like raw/list rows when structured tables are missing, got ${fallbackTablesChunk}`)
	}
	if (!text.includes('<more_context source="simplified_dom" cursor="22" limit="40" action="request_context"')) {
		throw new Error(`simplified_dom omission should include an explicit request_context hint, got ${text}`)
	}
	if (!text.includes('<more_context source="raw_candidates" cursor="8" limit="40" action="request_context"')) {
		throw new Error(`raw_candidates omission should include an explicit request_context hint, got ${text}`)
	}
}

function assertPlannerObservationIncludesCandidateDiagnostics() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/planner-context.js', {})
	const context = sandbox.NC_BG_PLANNER_CONTEXT
	const observation = buildTestObservation()
	observation.candidateDiagnostics = {
		textActionProbeCount: 3,
		indexedTextActionProbeCount: 1,
		unindexedTextActionProbeCount: 2,
		unindexedTextActionProbes: [
			{
				text: '详情',
				tag: 'span',
				role: '',
				cursor: 'auto',
				actionContext: true,
				pointer: false,
				rect: { left: 100, top: 200, width: 34, height: 18 },
				className: 'table-action',
				html: '<span class="table-action">详情</span>',
			},
		],
	}
	const text = context.buildObservationText(observation, { task: '检查按钮识别' })
	if (!text.includes('<candidate_diagnostics>') || !text.includes('unindexed text="详情"')) {
		throw new Error(`observation text should include compact candidate diagnostics for copied sessions, got ${text}`)
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
				action: { name: 'input_text', input: { index: 3, text: 'forms-only-ok', target_label: '搜索' } },
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

async function assertPlannerOptionsContextReportsUnscopedCandidatesAsDiagnostics() {
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
	observation.forms[0].fields.push(selectField)
	observation.elements.push(selectField)
	observation.options = [
		{
			index: 91,
			region: 'popover',
			role: 'option',
			label: '远处候选',
			valueState: 'unknown',
			selectionControl: '',
			rect: { left: 760, top: 520, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '需要查看状态字段候选。',
					memory: '页面可能有其他弹层候选。',
					thought: '先请求目标字段候选。',
					next_goal: '查看状态候选。',
					action: { name: 'request_options_for', input: { index: 4 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '候选未能归属目标字段。',
				memory: '不能把全局候选当作状态候选。',
				thought: '停止以避免选错字段候选。',
				next_goal: '停止。',
				action: { name: 'done', input: { text: '候选未归属目标字段。', success: false } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'done')
	const secondUser = getUserMessageText(requestBodies[1])
	const planningContext = secondUser.slice(secondUser.indexOf('<planning_context>'))
	if (planningContext.includes('<visible_options') || planningContext.includes('<visible_popups')) {
		throw new Error(`unscoped candidates should not be advertised as visible field options, got: ${planningContext}`)
	}
	for (const expected of [
		'<diagnostic_options scoped="global_fallback"',
		'候选未能与目标字段建立稳定归属',
		'不要直接选择这些候选',
		'label="远处候选"',
	]) {
		if (!planningContext.includes(expected)) {
			throw new Error(`unscoped candidates should remain diagnostic: missing ${expected}, got ${planningContext}`)
		}
	}
}

async function assertPlannerRejectsDiagnosticOptionCandidateSelection() {
	const dateObservation = buildTestObservation()
	const dateField = {
		index: 27,
		region: 'content',
		fieldType: 'daterange',
		label: '创建时间',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		rect: { left: 917, top: 136, width: 131, height: 33 },
	}
	dateObservation.forms[0].fields.push(dateField)
	dateObservation.elements.push(dateField)
	dateObservation.popups = [
		{
			index: 92,
			region: 'popover',
			role: 'option',
			label: '2026-06-01',
			valueState: 'unknown',
			selectionControl: 'date-option',
			rect: { left: 752, top: 266, width: 41, height: 39 },
		},
	]
	const semanticsSandbox = loadBackgroundModule('naturalclick-extension/shared/control-semantics.js')
	const contextSandbox = loadBackgroundModule('naturalclick-extension/background/planner-context.js', {
		NC_CONTROL_SEMANTICS: semanticsSandbox.NC_CONTROL_SEMANTICS,
	})
	const validationSandbox = loadBackgroundModule('naturalclick-extension/background/planner-validation.js', {
		NC_BG_PLANNER_CONTEXT: contextSandbox.NC_BG_PLANNER_CONTEXT,
		NC_ACTION_CONTRACT: null,
		NC_CONTROL_SEMANTICS: semanticsSandbox.NC_CONTROL_SEMANTICS,
	})
	const mixedTargetObservation = buildTestObservation()
	mixedTargetObservation.elements.push({
		index: 26,
		region: 'content',
		role: 'textbox',
		label: '内部输入',
		valueState: 'empty',
	})
	mixedTargetObservation.forms[0].fields.push({
		index: 26,
		region: 'content',
		fieldType: 'daterange',
		label: '创建时间',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		rect: { left: 917, top: 136, width: 131, height: 33 },
	})
	mixedTargetObservation.popups = [
		{
			index: 90,
			region: 'popover',
			role: 'option',
			label: '2026-06-01',
			valueState: 'unknown',
			selectionControl: 'date-option',
			rect: { left: 752, top: 266, width: 41, height: 39 },
		},
	]
	const mixedTargetContext = contextSandbox.NC_BG_PLANNER_CONTEXT.resolvePlanningContextRequest(
		mixedTargetObservation,
		{ name: 'request_options_for', input: { index: 26 } },
		0
	).text
	if (!mixedTargetContext.includes('<visible_popups scoped="field"') || !mixedTargetContext.includes('source=forms:')) {
		throw new Error(`request_options_for should prefer semantic form targets over skinny same-index elements, got: ${mixedTargetContext}`)
	}
	const dateValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 27, text: '2026-06-01', target_label: '创建时间' } },
		dateObservation,
		[]
	)
	if (dateValidationError) {
		throw new Error(`date picker option should pass field-scoped selection validation, got: ${dateValidationError}`)
	}
	const dateRangeValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 27, text: '2026-06-01..2026-06-02', target_label: '创建时间' } },
		dateObservation,
		[]
	)
	if (dateRangeValidationError) {
		throw new Error(`date range picker selection should pass when the first real date option is field-scoped, got: ${dateRangeValidationError}`)
	}
	const dateRangeEndObservation = {
		...dateObservation,
		popups: [
			{
				index: 94,
				region: 'popover',
				role: 'option',
				label: '2026-06-02',
				valueState: 'unknown',
				selectionControl: 'date-option',
				rect: { left: 795, top: 266, width: 41, height: 39 },
			},
		],
	}
	const dateRangeEndValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 27, text: '2026-06-01..2026-06-02', target_label: '创建时间' } },
		dateRangeEndObservation,
		[]
	)
	if (dateRangeEndValidationError) {
		throw new Error(`date range picker selection should also pass when the visible real candidate is the range end date, got: ${dateRangeEndValidationError}`)
	}
	const staleControlledDateObservation = {
		...dateObservation,
		forms: [
			{
				...dateObservation.forms[0],
				fields: [
					{
						...dateField,
						expandedState: 'expanded',
						relationHints: 'aria-controls=stale-input-popup',
					},
				],
			},
		],
		elements: [
			{
				...dateField,
				expandedState: 'expanded',
				relationHints: 'aria-controls=stale-input-popup',
			},
		],
		popups: [
			{
				index: 95,
				region: 'popover',
				role: 'option',
				label: '2026-06-02',
				valueState: 'unknown',
				selectionControl: 'date-option',
				rect: { left: 795, top: 266, width: 41, height: 39 },
			},
		],
	}
	const staleControlledDateValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 27, text: '2026-06-01..2026-06-02', target_label: '创建时间' } },
		staleControlledDateObservation,
		[]
	)
	if (staleControlledDateValidationError) {
		throw new Error(`expanded date picker validation should tolerate stale aria-controls when real date cells are geometrically scoped, got: ${staleControlledDateValidationError}`)
	}
	const dayOnlyDateObservation = buildTestObservation()
	const dayOnlyDateField = {
		index: 28,
		region: 'content',
		fieldType: 'daterange',
		label: '创建时间',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		expandedState: 'expanded',
		rect: { left: 1180, top: 136, width: 131, height: 33 },
	}
	dayOnlyDateObservation.forms[0].fields.push(dayOnlyDateField)
	dayOnlyDateObservation.elements.push(dayOnlyDateField)
	dayOnlyDateObservation.options = [
		{
			index: 93,
			region: 'popover',
			role: 'option',
			label: '1',
			valueState: 'unknown',
			selectionControl: 'date-option',
			rect: { left: 752, top: 266, width: 41, height: 39 },
		},
	]
	const dayOnlyDateValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 28, text: '2026-06-01', target_label: '创建时间' } },
		dayOnlyDateObservation,
		[]
	)
	if (dayOnlyDateValidationError) {
		throw new Error(`date picker day-only cell should pass date-field validation, got: ${dayOnlyDateValidationError}`)
	}
	const dayOnlyRangeEndObservation = {
		...dayOnlyDateObservation,
		options: [
			{
				index: 94,
				region: 'popover',
				role: 'option',
				label: '2',
				valueState: 'unknown',
				selectionControl: 'date-option',
				rect: { left: 795, top: 266, width: 41, height: 39 },
			},
		],
	}
	const dayOnlyRangeEndValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 28, text: '2026-06-01..2026-06-02', target_label: '创建时间' } },
		dayOnlyRangeEndObservation,
		[]
	)
	if (dayOnlyRangeEndValidationError) {
		throw new Error(`date picker day-only cell should match either boundary of a date range request, got: ${dayOnlyRangeEndValidationError}`)
	}
	const splitPanelDateObservation = buildTestObservation()
	const splitPanelDateField = {
		index: 33,
		region: 'content',
		fieldType: 'daterange',
		label: '创建时间',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		rect: { left: 1090, top: 136, width: 155, height: 33 },
	}
	splitPanelDateObservation.forms[0].fields.push(splitPanelDateField)
	splitPanelDateObservation.elements.push(splitPanelDateField)
	splitPanelDateObservation.options = [
		{
			index: 101,
			region: 'popover',
			role: 'option',
			label: '1',
			valueState: 'unknown',
			selectionControl: 'date-option',
			popupHints: 'popupLabelledBy=left-month-heading,popupRole=dialog',
			rect: { left: 840, top: 266, width: 41, height: 39 },
		},
		{
			index: 102,
			region: 'popover',
			role: 'option',
			label: '16',
			valueState: 'unknown',
			selectionControl: 'date-option',
			popupHints: 'popupLabelledBy=right-month-heading,popupRole=dialog',
			rect: { left: 1460, top: 392, width: 41, height: 39 },
		},
	]
	const splitPanelContext = contextSandbox.NC_BG_PLANNER_CONTEXT.resolvePlanningContextRequest(
		splitPanelDateObservation,
		{ name: 'request_options_for', input: { index: 33, label: '创建时间' } },
		0
	).text
	if (!splitPanelContext.includes('<visible_options scoped="field"') || splitPanelContext.includes('<diagnostic_options')) {
		throw new Error(`split date panels with weak month labels should be field-scoped rather than diagnostic, got: ${splitPanelContext}`)
	}
	const splitPanelDateValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 33, text: '2026-06-01..2026-06-16', target_label: '创建时间' } },
		splitPanelDateObservation,
		[]
	)
	if (splitPanelDateValidationError) {
		throw new Error(`split date panels should validate day-only range candidates without an expanded flag, got: ${splitPanelDateValidationError}`)
	}
	const declaredDateObservation = buildTestObservation()
	const declaredDateField = {
		index: 36,
		region: 'content',
		fieldType: 'select',
		label: '起止范围',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		rect: { left: 1180, top: 136, width: 131, height: 33 },
	}
	declaredDateObservation.forms[0].fields.push(declaredDateField)
	declaredDateObservation.elements.push(declaredDateField)
	declaredDateObservation.options = [
		{
			index: 95,
			region: 'popover',
			role: 'option',
			label: '1',
			valueState: 'unknown',
			selectionControl: 'date-option',
			rect: { left: 752, top: 266, width: 41, height: 39 },
		},
	]
	const declaredDateValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 36, text: '2026-06-01', target_label: '起止范围' } },
		declaredDateObservation,
		[]
	)
	if (declaredDateValidationError) {
		throw new Error(`declared date/time target labels should let date requests match day-only date cells, got: ${declaredDateValidationError}`)
	}
	const controlledDateObservation = buildTestObservation()
	const controlledDateField = {
		index: 37,
		region: 'content',
		fieldType: 'daterange',
		label: '创建时间',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		expandedState: 'expanded',
		relationHints: 'aria-controls=created-range-calendar,haspopup=dialog',
		rect: { left: 1180, top: 136, width: 131, height: 33 },
	}
	controlledDateObservation.forms[0].fields.push(controlledDateField)
	controlledDateObservation.elements.push(controlledDateField)
	controlledDateObservation.options = [
		{
			index: 96,
			region: 'popover',
			role: 'option',
			label: '1',
			valueState: 'unknown',
			selectionControl: 'date-option',
			popupHints: 'popupId=other-calendar,popupRole=dialog',
			rect: { left: 752, top: 266, width: 41, height: 39 },
		},
	]
	const controlledDateValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 37, text: '2026-06-01', target_label: '创建时间' } },
		controlledDateObservation,
		[]
	)
	if (!controlledDateValidationError || !controlledDateValidationError.includes('诊断候选不能直接选择')) {
		throw new Error(`date picker fallback must not accept date cells explicitly owned by a different controlled popup, got: ${controlledDateValidationError}`)
	}
	const ambiguousDateObservation = buildTestObservation()
	const ambiguousDateField = {
		index: 38,
		region: 'content',
		fieldType: 'daterange',
		label: '起止范围',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		expandedState: 'expanded',
		rect: { left: 20, top: 80, width: 131, height: 33 },
	}
	ambiguousDateObservation.forms[0].fields.push(ambiguousDateField)
	ambiguousDateObservation.elements.push(ambiguousDateField)
	ambiguousDateObservation.options = [
		{
			index: 97,
			region: 'popover',
			role: 'option',
			label: '1',
			valueState: 'unknown',
			selectionControl: 'date-option',
			popupHints: 'popupId=start-calendar,popupRole=dialog',
			rect: { left: 1600, top: 2400, width: 41, height: 39 },
		},
		{
			index: 98,
			region: 'popover',
			role: 'option',
			label: '1',
			valueState: 'unknown',
			selectionControl: 'date-option',
			popupHints: 'popupId=end-calendar,popupRole=dialog',
			rect: { left: 1700, top: 2400, width: 41, height: 39 },
		},
	]
	const ambiguousDateValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 38, text: '2026-06-01', target_label: '起止范围' } },
		ambiguousDateObservation,
		[]
	)
	if (!ambiguousDateValidationError || !ambiguousDateValidationError.includes('诊断候选不能直接选择')) {
		throw new Error(`date picker fallback must not accept ambiguous date cells from multiple explicit popup owners, got: ${ambiguousDateValidationError}`)
	}
	const nonDateObservation = buildTestObservation()
	const nonDateField = {
		index: 29,
		region: 'content',
		fieldType: 'select',
		label: '客户等级',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		rect: { left: 1180, top: 136, width: 131, height: 33 },
	}
	nonDateObservation.forms[0].fields.push(nonDateField)
	nonDateObservation.elements.push(nonDateField)
	nonDateObservation.options = dayOnlyDateObservation.options
	const nonDateValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 29, text: '2026-06-01', target_label: '客户等级' } },
		nonDateObservation,
		[]
	)
	if (!nonDateValidationError) {
		throw new Error('day-only date-option fallback must not make non-date fields accept full date requests')
	}
	const numericCandidateObservation = buildTestObservation()
	const numericCandidateField = {
		index: 30,
		region: 'content',
		fieldType: 'select',
		label: '等级码',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		optionLabels: ['1'],
	}
	numericCandidateObservation.forms[0].fields.push(numericCandidateField)
	numericCandidateObservation.elements.push(numericCandidateField)
	const numericExactValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 30, text: '1', target_label: '等级码' } },
		numericCandidateObservation,
		[]
	)
	if (numericExactValidationError) {
		throw new Error(`selection candidate validation should accept exact numeric option matches, got: ${numericExactValidationError}`)
	}
	const numericPartialValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 30, text: '10', target_label: '等级码' } },
		numericCandidateObservation,
		[]
	)
	if (!numericPartialValidationError || !numericPartialValidationError.includes('当前可见候选')) {
		throw new Error(`selection candidate validation should reject unbounded numeric substring matches, got: ${numericPartialValidationError}`)
	}
	const decoratedCandidateObservation = buildTestObservation()
	const decoratedCandidateField = {
		index: 31,
		region: 'content',
		fieldType: 'select',
		label: '类型',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		optionLabels: ['核心 (12)'],
	}
	decoratedCandidateObservation.forms[0].fields.push(decoratedCandidateField)
	decoratedCandidateObservation.elements.push(decoratedCandidateField)
	const decoratedValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 31, text: '核心', target_label: '类型' } },
		decoratedCandidateObservation,
		[]
	)
	if (decoratedValidationError) {
		throw new Error(`selection candidate validation should accept bounded decorated option labels, got: ${decoratedValidationError}`)
	}
	const unsafeCjkCandidateObservation = buildTestObservation()
	const unsafeCjkCandidateField = {
		index: 32,
		region: 'content',
		fieldType: 'select',
		label: '类型',
		valueState: 'empty',
		role: 'combobox',
		selectionControl: 'dropdown',
		optionLabels: ['非核心'],
	}
	unsafeCjkCandidateObservation.forms[0].fields.push(unsafeCjkCandidateField)
	unsafeCjkCandidateObservation.elements.push(unsafeCjkCandidateField)
	const unsafeCjkValidationError = validationSandbox.NC_BG_PLANNER_VALIDATION.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 32, text: '核心', target_label: '类型' } },
		unsafeCjkCandidateObservation,
		[]
	)
	if (!unsafeCjkValidationError || !unsafeCjkValidationError.includes('当前可见候选')) {
		throw new Error(`selection candidate validation should reject unsafe pure CJK substring matches, got: ${unsafeCjkValidationError}`)
	}
	for (const actionName of ['choose_dropdown_option', 'select_checkbox_option']) {
		for (const testCase of [
			{
				text: '远处候选',
				expected: '诊断候选不能直接选择',
				description: 'diagnostic candidate text',
			},
			{
				text: '启用',
				expected: '当前只有未归属到该字段的诊断候选',
				description: 'unobserved text while only diagnostic candidates exist',
			},
		]) {
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
			observation.forms[0].fields.push(selectField)
			observation.elements.push(selectField)
			observation.options = [
				{
					index: 91,
					region: 'popover',
					role: 'option',
					label: '远处候选',
					valueState: 'unknown',
					selectionControl: '',
					rect: { left: 760, top: 520, width: 180, height: 32 },
				},
			]
			const decision = await runPlannerWithFakeModel({
				fetchImpl: async (_url, init) => {
					const body = JSON.parse(init.body)
					requestBodies.push(body)
					if (requestBodies.length === 1) {
						return fakeJsonResponse({
							evaluation_previous_goal: '需要选择状态候选。',
							memory: '错误地把诊断候选当成字段候选。',
							thought: `尝试选择 ${testCase.text}。`,
							next_goal: `选择 ${testCase.text}。`,
							action: { name: actionName, input: { index: 4, text: testCase.text, target_label: '状态' } },
						})
					}
					return fakeJsonResponse({
						evaluation_previous_goal: '上一轮参数反馈说明候选未归属当前字段。',
						memory: '诊断候选不能直接选择。',
						thought: '停止以避免误点其他字段的候选。',
						next_goal: '停止。',
						action: { name: 'done', input: { text: '候选未归属目标字段。', success: false } },
					})
				},
				observation,
			})
			assertAction(decision.result, 'done')
			if (requestBodies.length !== 2) {
				throw new Error(`${actionName} ${testCase.description} should trigger one validation replan, got ${requestBodies.length}`)
			}
			const secondUser = getUserMessageText(requestBodies[1])
			for (const expected of [
				'invalid_action_input="true"',
				'failure_kind="unowned_selection_candidate"',
				testCase.expected,
				'远处候选',
				'request_options_for(index)',
				'scoped="field"',
				'scoped="explicit"',
			]) {
				if (!secondUser.includes(expected)) {
					throw new Error(`${actionName} ${testCase.description} feedback missing ${expected}, got: ${secondUser}`)
				}
			}
		}
	}
}

async function assertPlannerRecoversSearchOptionContextLimitAsFieldSkip() {
	const requestBodies = []
	const observation = {
		url: 'http://example.test/list',
		title: 'Example List',
		panels: [
			{ kind: 'filter', state: 'expanded', label: '筛选区域', fields: '状态' },
		],
		forms: [
			{
				id: 'filter',
				name: '筛选区域',
				fields: [
					{
						index: 31,
						label: '状态',
						fieldType: 'select',
						valueState: 'empty',
						role: 'combobox',
						selectionControl: 'dropdown',
						region: 'content',
						rect: { left: 120, top: 80, width: 180, height: 34 },
					},
				],
			},
		],
		actions: [{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' }],
		popups: [
			{
				index: 91,
				label: '启用',
				role: 'option',
				selectionControl: '',
				region: 'popover',
				rect: { left: 760, top: 520, width: 160, height: 32 },
			},
		],
		options: [],
		elements: [],
	}
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			throw new Error('model should not be called after local option-context preflight exposes only diagnostic candidates')
		},
		observation,
		sessionOverrides: {
			task: '测试筛选区域每一个搜索项是否正常',
			latestTask: '测试筛选区域每一个搜索项是否正常',
			workflowState: {
				search: {
					version: 6,
					phase: 'awaiting_option',
					activeFieldKey: 'index:31',
					lastSearchedFieldKey: '',
					fieldOrder: ['index:31'],
					fields: {
						'index:31': {
							key: 'index:31',
							index: 31,
							label: '状态',
							fieldType: 'select',
						},
					},
					completedKeys: [],
					skippedKeys: [],
					resetCompletedKeys: [],
					resultsByKey: {},
					clearRetryAttemptsByKey: {},
					evidenceRequestAttemptsByKey: {},
					failedLabelsByKey: {},
					dropdownOpenAttemptsByKey: { 'index:31': 1 },
					pendingDateRangeStartByKey: {},
					pendingDropdownCandidates: [],
					pendingDropdownOutput: '已展开下拉框索引 31，但没有稳定归属候选。',
					baselineResetDone: true,
					terminalFieldKey: '',
					failedReason: '',
					seededFromHistory: true,
				},
			},
		},
	})
	assertAction(decision.result, 'wait')
	if (
		decision.result.action.input.workflow_step !== 'skip_field' ||
		decision.result.action.input.workflow_context_recovered !== true ||
		decision.result.action.input.workflow_option_candidates_unobserved !== true ||
		decision.result.action.input.workflow_field_index !== 31 ||
		!String(decision.result.action.input.workflow_skip_reason || '').includes('未观测到真实候选') ||
		!String(decision.result.action.input.planning_context_diagnostic || '').includes('diagnostic_popups') ||
		requestBodies.length !== 0
	) {
		throw new Error(`planner should recover local option-context diagnostics into a field-level safe skip before model loops, got decision=${JSON.stringify(decision.result)} calls=${requestBodies.length}`)
	}
}

async function assertPlannerRejectsDirectOptionCandidateClick() {
	const requestBodies = []
	const observation = buildTestObservation()
	observation.options = [
		{
			index: 91,
			region: 'popover',
			role: 'option',
			label: '候选一',
			valueState: 'unknown',
			selectionControl: '',
			rect: { left: 220, top: 118, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '下拉候选可见。',
					memory: '错误地想直接点击候选行。',
					thought: '尝试直接点击候选。',
					next_goal: '点击候选一。',
					action: { name: 'click_element_by_index', input: { index: 91 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '上一轮参数反馈说明不能普通点击候选。',
				memory: '选择候选需要目标字段 index。',
				thought: '停止以避免绕过候选归属。',
				next_goal: '停止。',
				action: { name: 'done', input: { text: '候选需要归属字段。', success: false } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'done')
	if (requestBodies.length !== 2) {
		throw new Error(`direct option click should trigger one validation replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	for (const expected of ['invalid_action_input="true"', 'failure_kind="selection_bypass_attempt"', '不能用普通点击绕过字段归属校验', 'choose_dropdown_option/select_checkbox_option/select_cascader_path']) {
		if (!secondUser.includes(expected)) {
			throw new Error(`direct option click feedback missing ${expected}, got: ${secondUser}`)
		}
	}

	const cascaderRecovery = await runPlannerWithFakeModel({
		fetchImpl: async () => fakeJsonResponse({
			evaluation_previous_goal: '级联候选已经可见。',
			memory: '这是系统超时恢复路径。',
			thought: '点击当前可见级联候选。',
			next_goal: '选择候选。',
			action: {
				name: 'click_element_by_index',
				input: {
					index: 92,
					workflow: 'form-fill',
					workflow_step: 'select_visible_cascader_option_timeout_recovery',
				},
			},
		}),
		observation: {
			...observation,
			options: [
				{
					index: 92,
					region: 'popover',
					role: 'option',
					label: '候选二',
					valueState: 'unknown',
					selectionControl: 'cascader-leaf',
					rect: { left: 220, top: 152, width: 180, height: 32 },
				},
			],
		},
	})
	assertAction(cascaderRecovery.result, 'click_element_by_index')
}

async function assertPlannerRejectsDirectCascaderCandidateClick() {
	const requestBodies = []
	const observation = buildTestObservation()
	observation.actions = [
		...(Array.isArray(observation.actions) ? observation.actions : []),
		{
			index: 93,
			region: 'popover',
			role: 'menuitem',
			label: '候选三',
			valueState: 'unknown',
			kind: 'cascader',
			selectionControl: 'cascader-leaf',
			rect: { left: 220, top: 188, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '级联候选可见。',
					memory: '错误地把级联候选当成普通菜单项。',
					thought: '尝试直接点击级联候选。',
					next_goal: '点击候选三。',
					action: { name: 'click_element_by_index', input: { index: 93 } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '上一轮参数反馈说明不能普通点击级联候选。',
				memory: '级联候选需要保留字段归属。',
				thought: '停止以避免绕过目标字段。',
				next_goal: '停止。',
				action: { name: 'done', input: { text: '级联候选需要字段归属。', success: false } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'done')
	if (requestBodies.length !== 2) {
		throw new Error(`direct cascader candidate click should trigger one validation replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	for (const expected of ['invalid_action_input="true"', 'failure_kind="selection_bypass_attempt"', 'role=menuitem', 'control=cascader-leaf', 'select_cascader_path']) {
		if (!secondUser.includes(expected)) {
			throw new Error(`direct cascader candidate click feedback missing ${expected}, got: ${secondUser}`)
		}
	}
}

async function assertPlannerAllowsDirectPopupMenuCommandClick() {
	const requestBodies = []
	const observation = buildTestObservation()
	observation.popups = [
		{
			index: 94,
			region: 'popover',
			role: 'menuitem',
			label: '导出',
			actionIntent: 'export',
			valueState: 'unknown',
			rect: { left: 220, top: 224, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '弹出菜单命令可见。',
				memory: '这是普通命令菜单，不是选择候选。',
				thought: '点击弹出菜单命令。',
				next_goal: '执行命令。',
				action: { name: 'click_element_by_index', input: { index: 94, target_label: '导出' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'click_element_by_index')
	if (requestBodies.length !== 1) {
		throw new Error(`direct popup menu command click should not trigger validation replan, got ${requestBodies.length}`)
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
	const progressEvents = []
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
				action: { name: 'input_text', input: { index: 3, text: 'duplicate-recovered', target_label: '搜索' } },
			})
		},
		observation: buildTestObservation(),
		planOptions: {
			onProgress: (event) => progressEvents.push(event),
		},
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
	if (
		!thirdUser.includes('guidance=') ||
		!thirdUser.includes('不要重复 inspect 同一 index') ||
		!thirdUser.includes('inspect_region')
	) {
		throw new Error(`duplicate ReAct feedback should include specific alternate guidance, got ${thirdUser}`)
	}
	const duplicateProgress = progressEvents.find((event) =>
		event?.stage === 'planning_context' &&
		String(event?.text || '').includes('重复请求已拦截')
	)
	if (
		!duplicateProgress ||
		!String(duplicateProgress.text || '').includes('建议=不要重复 inspect 同一 index') ||
		!String(duplicateProgress.text || '').includes('下一步应换证据')
	) {
		throw new Error(`duplicate planning request should be visible in progress with guidance, got ${JSON.stringify(progressEvents)}`)
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
				action: { name: 'click_element_by_index', input: { index: 3, target_label: '搜索' } },
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
				action: { name: 'input_text', input: { index: 3, text: 'json-recovered', target_label: '搜索' } },
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
				arguments: JSON.stringify({ index: 3, text: 'top-level-tool-ok', target_label: '搜索' }),
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
				input: { index: 3, text: 'action-string-ok', target_label: '搜索' },
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
				action: { type: 'input_text', index: 3, text: 'inline-action-ok', target_label: '搜索' },
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
				action: { name: 'Input Text', input: { index: 3, text: 'name-delimiter-ok', target_label: '搜索' } },
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
							arguments: JSON.stringify({ index: 3, text: 'tool-calls-ok', target_label: '搜索' }),
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
				action: { name: 'input_text', input: { index: 3, text: 'valid-input', target_label: '搜索' } },
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

async function assertPlannerRejectsTargetLabelIndexMismatch() {
	const requestBodies = []
	const observation = buildTestObservation()
	observation.actions = [
		{
			index: 8,
			region: 'sidebar',
			role: 'menuitem',
			label: '系统设置',
			valueState: 'unknown',
			rect: { left: 20, top: 160, width: 180, height: 40 },
		},
		{
			index: 9,
			region: 'sidebar',
			role: 'menuitem',
			label: '报表中心',
			valueState: 'unknown',
			rect: { left: 20, top: 210, width: 180, height: 40 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			const body = JSON.parse(init.body)
			requestBodies.push(body)
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '准备进入目标菜单。',
					memory: '误把系统设置的 index 当成报表中心。',
					thought: 'index 和声明目标不一致。',
					next_goal: '点击报表中心。',
					action: { name: 'click_element_by_index', input: { index: 8, target_label: '报表中心' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数反馈指出 index=8 是系统设置。',
				memory: '报表中心真实 index 是 9。',
				thought: '改用与目标标签一致的 index。',
				next_goal: '点击报表中心。',
				action: { name: 'click_element_by_index', input: { index: 9, target_label: '报表中心' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'click_element_by_index')
	if (decision.result.action.input.index !== 9) {
		throw new Error(`target-label mismatch recovery should use corrected index, got ${JSON.stringify(decision.result.action.input)}`)
	}
	if (requestBodies.length !== 2) {
		throw new Error(`target-label/index mismatch should trigger one replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (
		!secondUser.includes('invalid_action_input="true"') ||
		!secondUser.includes('failure_kind="declared_target_mismatch"') ||
		!secondUser.includes('target_label="报表中心"') ||
		!secondUser.includes('index=8') ||
		!secondUser.includes('系统设置') ||
		!secondUser.includes('inspect_index/inspect_region') ||
		!secondUser.includes('不要为了通过校验')
	) {
		throw new Error(`planner did not explain target-label/index mismatch: ${secondUser}`)
	}
}

async function assertPlannerPublishesValidationFeedbackForCoveredTargets() {
	const requestBodies = []
	const progressEvents = []
	const observation = buildTestObservation()
	observation.forms[0].fields[0] = {
		...observation.forms[0].fields[0],
		index: 3,
		label: '开始日期',
		fieldType: 'date',
		editable: true,
		hitState: 'covered',
		hitPoints: '0/5',
		hitRatio: 0,
		hitBlocker: 'div role=dialog text=日期选择器 class=calendar-panel',
	}
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '准备填写日期。',
					memory: '误把被日历弹层遮挡的字段当成可输入字段。',
					thought: '尝试直接输入日期。',
					next_goal: '填写开始日期。',
					action: { name: 'input_text', input: { index: 3, text: '2026-06-01', target_label: '开始日期' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '执行前校验指出目标被遮挡。',
				memory: '不能直接操作被遮挡 index；改用视觉定位当前弹层中的日期候选。',
				thought: '当前需要换策略找可命中的日期候选。',
				next_goal: '定位日期候选。',
				action: { name: 'locate_by_vision', input: { target_description: '当前日期弹层中的 2026-06-01 日期候选' } },
			})
		},
		observation,
		planOptions: {
			onProgress: (event) => progressEvents.push(event),
		},
	})
	assertAction(decision.result, 'locate_by_vision')
	if (requestBodies.length !== 2) {
		throw new Error(`covered target validation should trigger one replan, got ${requestBodies.length}`)
	}
	const validationEvent = progressEvents.find((event) => event.stage === 'validation_feedback')
	if (
		!validationEvent ||
		!String(validationEvent.text || '').includes('执行前校验拦截 input_text') ||
		!String(validationEvent.text || '').includes('当前被遮挡')
	) {
		throw new Error(`covered target validation should publish visible progress, got ${JSON.stringify(progressEvents)}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (
		!secondUser.includes('invalid_action_input="true"') ||
		!secondUser.includes('failure_kind="covered_target"') ||
		!secondUser.includes('下一步建议') ||
		!secondUser.includes('日期选择器') ||
		!secondUser.includes('不要直接操作被遮挡 index')
	) {
		throw new Error(`covered target validation should provide structured follow-up context, got ${secondUser}`)
	}
}

async function assertPlannerAllowsSemanticTargetLabelIntentMatch() {
	const requestBodies = []
	const observation = buildTestObservation()
	observation.actions = [
		{
			index: 40,
			region: 'content',
			role: 'button',
			label: '',
			actionIntent: 'create',
			valueState: 'unknown',
			rect: { left: 20, top: 120, width: 72, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			return fakeJsonResponse({
				evaluation_previous_goal: '需要新增一条资料。',
				memory: '新增按钮是图标按钮，但 actionIntent=create。',
				thought: '语义意图与目标标签一致，可以点击。',
				next_goal: '点击新增。',
				action: { name: 'click_element_by_index', input: { index: 40, target_label: '新增' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'click_element_by_index')
	if (decision.result.action.input.index !== 40) {
		throw new Error(`semantic target-label intent match should preserve index, got ${JSON.stringify(decision.result.action.input)}`)
	}
	if (requestBodies.length !== 1) {
		throw new Error(`semantic target-label intent match should not replan, got ${requestBodies.length}`)
	}
}

async function assertPlannerRejectsTextInputOnNonEditableSelectionControl() {
	const requestBodies = []
	const observation = buildTestObservation()
	const selectLikeField = {
		index: 4,
		region: 'content',
		fieldType: 'platform',
		label: '账号平台',
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
					next_goal: '在账号平台输入测试文本。',
					action: { name: 'input_text', input: { index: 4, text: '测试平台', target_label: '账号平台' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数错误已指出该控件不可编辑。',
				memory: '账号平台是选择控件，应先展开候选。',
				thought: '改用下拉展开动作。',
				next_goal: '展开账号平台候选。',
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
		label: '账号平台',
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
		label: '请先选择账号',
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
					next_goal: '在账号平台输入测试文本。',
					action: { name: 'input_text', input: { index: 4, text: '测试平台', target_label: '账号平台' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数错误已指出同 index 存在选择控件证据。',
				memory: '账号平台应按下拉处理。',
				thought: '改用下拉展开动作。',
				next_goal: '展开账号平台候选。',
				action: { name: 'open_dropdown', input: { index: 4, target_label: '账号平台' } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'open_dropdown')
	if (requestBodies.length !== 2) {
		throw new Error(`same-index selection evidence should override nested editable input, got ${requestBodies.length} model calls`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (!secondUser.includes('invalid_action_input="true"') || !secondUser.includes('选择控件') || !secondUser.includes('账号平台')) {
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
				action: { name: 'input_text', input: { index: 5, text: 'admin', target_label: '登录账号' } },
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
				action: { name: 'open_dropdown', input: { index: 4, target_label: '账号平台' } },
			})
		},
		observation: buildDropdownTestObservation('账号平台'),
	})
	assertAction(decision.result, 'open_dropdown')
	if (requestBodies.length !== 2) {
		throw new Error(`unscoped choose_dropdown_option should trigger one replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	if (
		!secondUser.includes('invalid_action_input="true"') ||
		!secondUser.includes('failure_kind="missing_required_parameter"') ||
		!secondUser.includes('缺少目标字段 index') ||
		!secondUser.includes('补齐当前工具的必填参数')
	) {
		throw new Error('planner did not explain choose_dropdown_option missing target index')
	}
}

async function assertPlannerClassifiesMissingCascaderPathAsRequiredParameter() {
	const requestBodies = []
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '准备选择级联字段。',
					memory: '漏掉了级联路径。',
					thought: '参数不完整。',
					next_goal: '选择区域。',
					action: { name: 'select_cascader_path', input: { index: 3, target_label: '搜索' } },
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '参数反馈说明缺少 path。',
				memory: '级联选择必须提供路径数组。',
				thought: '补齐 path 后重试。',
				next_goal: '选择区域路径。',
				action: { name: 'select_cascader_path', input: { index: 3, target_label: '搜索', path: ['江苏省', '南京市'] } },
			})
		},
		observation: buildTestObservation(),
	})
	assertAction(decision.result, 'select_cascader_path')
	if (requestBodies.length !== 2) {
		throw new Error(`missing cascader path should trigger one replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	for (const expected of [
		'invalid_action_input="true"',
		'failure_kind="missing_required_parameter"',
		'select_cascader_path 缺少 path',
		'级联选择要给 path 数组',
	]) {
		if (!secondUser.includes(expected)) {
			throw new Error(`missing cascader path feedback missing ${expected}, got: ${secondUser}`)
		}
	}
	if (secondUser.includes('failure_kind="selection_bypass_attempt"')) {
		throw new Error(`missing cascader path should not be classified as selection bypass, got: ${secondUser}`)
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

async function assertPlannerRejectsLocateByVisionObservedOptionIndex() {
	const requestBodies = []
	const observation = buildTestObservation()
	observation.options = [
		{
			index: 91,
			region: 'popover',
			role: 'option',
			label: '候选一',
			valueState: 'unknown',
			selectionControl: '',
			rect: { left: 220, top: 118, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '候选行可见。',
					memory: '错误地尝试用视觉定位候选行。',
					thought: '视觉点击仍会绕过字段归属。',
					next_goal: '视觉定位候选一。',
					action: {
						name: 'locate_by_vision',
						input: { target_description: '当前弹层中的候选一', index: 91 },
					},
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '上一轮参数反馈说明 observed option index 不能走视觉点击。',
				memory: '候选选择必须保留目标字段归属。',
				thought: '停止以避免视觉绕过字段候选归属。',
				next_goal: '停止。',
				action: { name: 'done', input: { text: '候选需要归属字段。', success: false } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'done')
	if (requestBodies.length !== 2) {
		throw new Error(`observed option locate_by_vision index should trigger one validation replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	for (const expected of ['invalid_action_input="true"', 'failure_kind="selection_bypass_attempt"', '不能用普通点击绕过字段归属校验', 'choose_dropdown_option/select_checkbox_option/select_cascader_path']) {
		if (!secondUser.includes(expected)) {
			throw new Error(`observed option locate_by_vision feedback missing ${expected}, got: ${secondUser}`)
		}
	}
}

async function assertPlannerRejectsLocateByVisionOptionDescriptionWithoutIndex() {
	const requestBodies = []
	const observation = buildTestObservation()
	observation.options = [
		{
			index: 91,
			region: 'popover',
			role: 'option',
			label: '候选一',
			valueState: 'unknown',
			selectionControl: '',
			rect: { left: 220, top: 118, width: 180, height: 32 },
		},
	]
	const decision = await runPlannerWithFakeModel({
		fetchImpl: async (_url, init) => {
			requestBodies.push(JSON.parse(init.body))
			if (requestBodies.length === 1) {
				return fakeJsonResponse({
					evaluation_previous_goal: '候选行可见。',
					memory: '错误地尝试不用 index、只靠视觉描述点击候选行。',
					thought: '视觉点击仍会绕过字段归属。',
					next_goal: '视觉定位候选一。',
					action: {
						name: 'locate_by_vision',
						input: { target_description: '当前弹层中的候选一选项' },
					},
				})
			}
			return fakeJsonResponse({
				evaluation_previous_goal: '上一轮参数反馈说明可见候选不能走视觉点击。',
				memory: '候选选择必须保留目标字段归属。',
				thought: '停止以避免视觉绕过字段候选归属。',
				next_goal: '停止。',
				action: { name: 'done', input: { text: '候选需要归属字段。', success: false } },
			})
		},
		observation,
	})
	assertAction(decision.result, 'done')
	if (requestBodies.length !== 2) {
		throw new Error(`option-description locate_by_vision should trigger one validation replan, got ${requestBodies.length}`)
	}
	const secondUser = getUserMessageText(requestBodies[1])
	for (const expected of ['invalid_action_input="true"', 'failure_kind="selection_bypass_attempt"', '命中了当前可见的选择候选', '不能用视觉定位绕过字段归属校验', 'open_dropdown/request_options_for/inspect_region']) {
		if (!secondUser.includes(expected)) {
			throw new Error(`option-description locate_by_vision feedback missing ${expected}, got: ${secondUser}`)
		}
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
	if (
		!secondUser.includes('invalid_action_input="true"') ||
		!secondUser.includes('failure_kind="missing_action_context"') ||
		!secondUser.includes('target_description') ||
		!secondUser.includes('不要只换 index')
	) {
		throw new Error('planner did not explain missing locate_by_vision target_description')
	}
}

async function assertAskUserToolTimesOut() {
	let askPayload = null
	const sandbox = loadBackgroundModule('naturalclick-extension/background/tools.js', {
		NC_BG_CONSTANTS: {
			TYPES: { ACT: 'NC_ACT', ASK_USER_REQUEST: 'NC_ASK_USER_REQUEST', OBSERVE: 'NC_OBSERVE' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: true, message: 'unused' }),
			normalizeUrl: (url) => url,
			createTabAndWaitLoaded: async () => ({ id: 1 }),
			sendRuntimeMessage: async (message) => {
				askPayload = message?.payload || null
				return new Promise(() => {})
			},
		},
	})
	const result = await sandbox.NC_BG_TOOLS.executeTool(
		{ id: 'ask-timeout' },
		{ name: 'ask_user', input: { question: '请输入验证码', reason: '当前页面要求验证码后才能继续登录', timeout_ms: 50 } }
	)
	if (result.success || !String(result.message || '').includes('超时')) {
		throw new Error(`ask_user should fail instead of hanging when user response times out, got ${JSON.stringify(result)}`)
	}
	if (askPayload?.reason !== '当前页面要求验证码后才能继续登录') {
		throw new Error(`ask_user should forward reason to the sidepanel payload, got ${JSON.stringify(askPayload)}`)
	}
	const timeoutMs = sandbox.NC_BG_TOOLS_TESTS.getAskUserTimeoutMs({ timeout_ms: 5 })
	if (timeoutMs < 50) {
		throw new Error(`ask_user timeout should be clamped to a safe minimum, got ${timeoutMs}`)
	}
}

async function assertInputTextRetriesDirectAfterTransportTimeout() {
	const pageActions = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/tools.js', {
		NC_BG_CONSTANTS: {
			TYPES: { ACT: 'NC_ACT', ASK_USER_REQUEST: 'NC_ASK_USER_REQUEST', OBSERVE: 'NC_OBSERVE' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async (_tabId, message) => {
				pageActions.push(message.action)
				if (pageActions.length === 1) throw new Error('页面通信超时，执行脚本未响应。')
				return {
					success: true,
					message: 'direct ok',
					meta: { outcome: { kind: 'value_changed', progress: true } },
				}
			},
			normalizeUrl: (url) => url,
			createTabAndWaitLoaded: async () => ({ id: 1 }),
			sendRuntimeMessage: async () => ({ ok: true, answer: 'ok' }),
		},
	})
	const result = await sandbox.NC_BG_TOOLS.executeTool(
		{ currentTabId: 9, config: { inputMode: 'realistic' } },
		{ name: 'input_text', input: { index: 1, text: '张三' } }
	)
	if (!result.success || !String(result.message || '').includes('直接输入重试成功')) {
		throw new Error(`input_text should recover with one direct retry after transport timeout, got ${JSON.stringify(result)}`)
	}
	if (pageActions.length !== 2) {
		throw new Error(`input_text should run exactly two page actions after retry, got ${pageActions.length}`)
	}
	if (pageActions[0]?.meta?.inputMode !== 'realistic' || pageActions[1]?.meta?.inputMode !== 'direct') {
		throw new Error(`input_text retry should switch from realistic to direct mode, got ${JSON.stringify(pageActions)}`)
	}

	const clickActions = []
	const clickSandbox = loadBackgroundModule('naturalclick-extension/background/tools.js', {
		NC_BG_CONSTANTS: {
			TYPES: { ACT: 'NC_ACT', ASK_USER_REQUEST: 'NC_ASK_USER_REQUEST', OBSERVE: 'NC_OBSERVE' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async (_tabId, message) => {
				clickActions.push(message.action)
				throw new Error('页面通信超时，执行脚本未响应。')
			},
			normalizeUrl: (url) => url,
			createTabAndWaitLoaded: async () => ({ id: 1 }),
			sendRuntimeMessage: async () => ({ ok: true, answer: 'ok' }),
		},
	})
	const clickResult = await clickSandbox.NC_BG_TOOLS.executeTool(
		{ currentTabId: 9, config: { inputMode: 'realistic' } },
		{ name: 'click_element_by_index', input: { index: 25 } }
	)
	if (clickResult.success || clickActions.length !== 1) {
		throw new Error(`click actions should not be retried after transport timeout, got ${JSON.stringify({ clickResult, clickActions })}`)
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
	const checkboxTool = sandbox.NC_BG_TOOLS.getTool('select_checkbox_option')
	if (checkboxTool?.inputSchema?.index !== 'number|required') {
		throw new Error(`select_checkbox_option should require a scoped index, got ${JSON.stringify(checkboxTool?.inputSchema)}`)
	}
	const cascaderTool = sandbox.NC_BG_TOOLS.getTool('select_cascader_path')
	if (cascaderTool?.inputSchema?.index !== 'number|required') {
		throw new Error(`select_cascader_path should require a scoped index, got ${JSON.stringify(cascaderTool?.inputSchema)}`)
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
	if (!/open_dropdown:[\s\S]*target_label:string\|required/.test(prompt)) {
		throw new Error(`open_dropdown should require a field target label: ${prompt}`)
	}
	if (!/choose_dropdown_option:[\s\S]*target_label:string\|required/.test(prompt)) {
		throw new Error(`choose_dropdown_option should require a field target label separate from option text: ${prompt}`)
	}
	if (!/select_checkbox_option:[\s\S]*index:number\|required/.test(prompt)) {
		throw new Error(`select_checkbox_option should require a scoped field index: ${prompt}`)
	}
	if (!/select_checkbox_option:[\s\S]*target_label:string\|required/.test(prompt)) {
		throw new Error(`select_checkbox_option should require a field or candidate target label: ${prompt}`)
	}
	if (!/select_cascader_path:[\s\S]*index:number\|required/.test(prompt)) {
		throw new Error(`select_cascader_path should require a scoped field index: ${prompt}`)
	}
	if (!/select_cascader_path:[\s\S]*target_label:string\|required/.test(prompt)) {
		throw new Error(`select_cascader_path should require a field target label: ${prompt}`)
	}
	if (!/keypress:[\s\S]*target_label:string\|required[\s\S]*reason:string\|optional/.test(prompt)) {
		throw new Error(`keypress should expose target_label and optional reason in planner prompts: ${prompt}`)
	}
	if (!/open_new_tab:[\s\S]*target_label:string\|required/.test(prompt)) {
		throw new Error(`open_new_tab should expose target_label in planner prompts: ${prompt}`)
	}
	if (!/switch_to_tab:[\s\S]*target_label:string\|required[\s\S]*target_url:string\|optional/.test(prompt)) {
		throw new Error(`switch_to_tab should expose target tab context in planner prompts: ${prompt}`)
	}
	if (!/close_tab:[\s\S]*target_label:string\|required[\s\S]*reason:string\|required/.test(prompt)) {
		throw new Error(`close_tab should expose required target and reason context in planner prompts: ${prompt}`)
	}
	if (!/ask_user:[\s\S]*question:string\|required[\s\S]*reason:string\|required/.test(prompt)) {
		throw new Error(`ask_user should expose required reason in planner prompts: ${prompt}`)
	}
	await sandbox.NC_BG_TOOLS.executeTool(
		{ currentTabId: 9, config: { inputMode: 'standard' } },
		{ name: 'open_dropdown', input: { index: 4, target_label: '账号平台' } }
	)
	await sandbox.NC_BG_TOOLS.executeTool(
		{ currentTabId: 9, config: { inputMode: 'standard' } },
		{ name: 'choose_dropdown_option', input: { index: 4, text: '企业端', target_label: '账号平台' } }
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
				'- open_dropdown: 展开指定 index 的下拉框 input={index:number|required,target_label:string|required}',
				'- choose_dropdown_option: 选择指定字段候选 input={index:number|required,text:string|required,target_label:string|required}',
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
				'- input_text: 向当前观察结果中的可编辑元素输入文本 input={index:number|required,text:string|required,target_label:string|required}',
				'- click_element_by_index: 点击当前观察结果中的指定元素索引 input={index:number|required}',
				'- open_dropdown: 展开指定 index 的下拉框并返回真实可见候选 input={index:number|required,target_label:string|required}',
				'- choose_dropdown_option: 在指定字段的已知候选中按真实可见文本选择下拉选项 input={index:number|required,text:string|required,target_label:string|required,label:string|optional}',
				'- select_checkbox_option: 在指定字段或候选范围内按真实可见文本选择复选/多选项 input={index:number|required,text:string|required,target_label:string|required,label:string|optional}',
				'- select_dropdown_option: 兼容旧动作；选择时必须提供 index，只有 index 时展开下拉框 input={index:number|optional,text:string|optional}',
				'- select_cascader_path: 按路径逐级选择级联选项 input={path:string[]|required,index:number|required,target_label:string|required}',
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
		sandbox,
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

	const submitAfterFieldChangeHistory = [
		{
			stepIndex: 17,
			action: 'click_element_by_index',
			input: { index: 19, workflow: 'form-fill', workflow_step: 'submit_form_timeout_recovery', workflow_submit_label: '保存' },
			nextGoal: '提交当前表单',
			success: true,
			output: '已点击索引 19。 | 动作结果: none progress=false',
			outcome: { kind: 'none', progress: false },
		},
		{
			stepIndex: '17.v',
			action: 'click_element_by_index.verify',
			input: { index: 19, workflow: 'form-fill', workflow_step: 'submit_form_timeout_recovery', workflow_submit_label: '保存' },
			nextGoal: '提交当前表单',
			success: false,
			output: '动作校验失败: form_submit_failed: 字段重复',
		},
		{
			stepIndex: 18,
			action: 'ask_user',
			input: { workflow: 'form-fill', workflow_step: 'resolve_duplicate_field_conflict' },
			nextGoal: '询问字段的新值',
			success: true,
			output: '用户回答: 张三-2',
		},
		{
			stepIndex: 19,
			action: 'input_text',
			input: { index: 2, text: '张三-2', workflow: 'form-fill', workflow_step: 'resolve_duplicate_field_conflict' },
			nextGoal: '改写字段',
			success: true,
			output: '已在索引 2 输入文本。 | 动作结果: value_changed progress=true',
			outcome: { kind: 'value_changed', progress: true },
		},
	]
	const submitAfterFieldChangeDecision = {
		next_goal: '提交当前表单',
		action: { name: 'click_element_by_index', input: { index: 19, workflow: 'form-fill', workflow_step: 'submit_form_timeout_recovery', workflow_submit_label: '保存' } },
	}
	if (sessionTests.detectActionLoop({ history: submitAfterFieldChangeHistory }, submitAfterFieldChangeDecision).blocked) {
		throw new Error('loop guard should allow re-submitting the same form button after a field value changed')
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
		history: repeatedHistory('select_dropdown_option', { index: 4 }, '展开账号平台下拉', 1),
	}
	const explicitOpenDecision = {
		next_goal: '展开账号平台下拉',
		action: { name: 'open_dropdown', input: { index: 4 } },
	}
	if (!sessionTests.detectActionLoop(oldDropdownOpenHistory, explicitOpenDecision).blocked) {
		throw new Error('loop guard should treat legacy index-only select_dropdown_option as open_dropdown')
	}

	const explicitOpenHistory = {
		history: repeatedHistory('open_dropdown', { index: 4 }, '展开账号平台下拉', 1),
	}
	const legacyOpenDecision = {
		next_goal: '展开账号平台下拉',
		action: { name: 'select_dropdown_option', input: { index: 4 } },
	}
	if (!sessionTests.detectActionLoop(explicitOpenHistory, legacyOpenDecision).blocked) {
		throw new Error('loop guard should treat open_dropdown as legacy index-only select_dropdown_option')
	}

	const oldDropdownChoiceHistory = {
		history: repeatedHistory('select_dropdown_option', { index: 4, text: '企业端' }, '选择账号平台', 1),
	}
	const explicitChoiceDecision = {
		next_goal: '选择账号平台',
		action: { name: 'choose_dropdown_option', input: { index: 4, text: '企业端' } },
	}
	if (!sessionTests.detectActionLoop(oldDropdownChoiceHistory, explicitChoiceDecision).blocked) {
		throw new Error('loop guard should treat legacy text select_dropdown_option as choose_dropdown_option')
	}

	const labelChoiceHistory = {
		history: repeatedHistory('choose_dropdown_option', { index: 4, label: '企业端' }, '选择账号平台', 1),
	}
	const textChoiceDecision = {
		next_goal: '选择账号平台',
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
		history: repeatedHistory('hover_element_by_index', { index: 5, target_label: '更多' }, '悬浮展开菜单', 1, false),
	}
	const hoverDecision = {
		next_goal: '悬浮展开菜单',
		action: { name: 'hover_element_by_index', input: { index: 5, target_label: '更多' } },
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
	const updates = []
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
				sendMessage: (message, callback) => {
					updates.push(message)
					callback?.()
				},
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
	const recoveryProgressTrace = session.traceItems.find((item) => item?.progress?.stage === 'verification_recovery')
	if (
		!recoveryProgressTrace ||
		recoveryProgressTrace.title !== '校验恢复进度' ||
		!String(recoveryProgressTrace.detail || '').includes('尝试视觉恢复')
	) {
		throw new Error(`verification recovery should publish a visible runtime progress trace, got ${JSON.stringify(session.traceItems)}`)
	}
	const activityTexts = updates.map((message) => String(message?.payload?.activityText || ''))
	if (!activityTexts.some((text) => text.includes('动作校验失败') && text.includes('尝试视觉恢复'))) {
		throw new Error(`verification recovery should publish an activity update before running vision fallback, got ${JSON.stringify(activityTexts)}`)
	}
	const runtimePlanUpdates = updates
		.map((message) => message?.payload?.planItems || [])
		.filter((items) => Array.isArray(items) && items.some((item) => item?.id === 'current_runtime_progress'))
	const recoveryPlan = runtimePlanUpdates
		.flat()
		.find((item) =>
			item?.id === 'current_runtime_progress' &&
			String(item?.title || '').includes('校验恢复进度') &&
			String(item?.title || '').includes('尝试视觉恢复')
		)
	if (!recoveryPlan) {
		throw new Error(`verification recovery should publish a visible runtime progress plan item, got ${JSON.stringify(runtimePlanUpdates)}`)
	}
	if (session.currentRuntimeProgress) {
		throw new Error(`verification recovery should clear current runtime progress after recovery finishes, got ${JSON.stringify(session.currentRuntimeProgress)}`)
	}
	const finalPayload = updates[updates.length - 1]?.payload || {}
	if (Array.isArray(finalPayload.planItems) && finalPayload.planItems.some((item) => item?.id === 'current_runtime_progress')) {
		throw new Error(`verification recovery final publish should not leave a stale runtime progress plan item, got ${JSON.stringify(finalPayload.planItems)}`)
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
		'create_form_not_opened: 创建入口点击后未观察到新增表单。',
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
	const recoverySandbox = loadBackgroundModule('naturalclick-extension/background/session-recovery.js', {
		NC_BG_VISION: {
			canUseVisionFallback: (action) => ['click_element_by_index', 'input_text'].includes(action?.name),
		},
	})
	const recovery = recoverySandbox.NC_BG_SESSION_RECOVERY
	if (!recovery.shouldAttemptExecutionVisionFallback(
		{ name: 'input_text', input: { index: 3, text: 'hello' } },
		{
			success: false,
			message: '页面动作失败。',
			meta: { outcome: { kind: 'failed', reason: 'occluded_input_target' } },
		}
	)) {
		throw new Error('structured occluded input failures should trigger execution vision fallback')
	}
	if (!recovery.shouldAttemptExecutionVisionFallback(
		{ name: 'click_element_by_index', input: { index: 7 } },
		{
			success: false,
			message: '页面动作失败。',
			meta: { outcome: { kind: 'failed', reason: 'occluded_click_target' } },
		}
	)) {
		throw new Error('structured occluded click failures should trigger execution vision fallback')
	}
	if (recovery.shouldAttemptExecutionVisionFallback(
		{ name: 'input_text', input: { index: 3, text: 'hello' } },
		{
			success: false,
			message: '页面动作失败。',
			meta: { outcome: { kind: 'failed', reason: 'readonly_or_disabled' } },
		}
	)) {
		throw new Error('structured readonly/disabled input failures should still skip vision fallback')
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
	visionCalled = false
	const searchRecovery = await sandbox.NC_BG_SESSION_RECOVERY.attemptVerificationRecovery(
		{},
		{
			action: {
				name: 'click_element_by_index',
				input: {
					index: 8,
					target_label: '搜索',
					workflow: 'search-fields',
					workflow_step: 'submit_search',
				},
			},
		},
		{},
		'search_submit_no_feedback: 搜索提交后未观察到 URL、DOM、表格/列表摘要或结果反馈变化'
	)
	if (searchRecovery.success || visionCalled) {
		throw new Error(`search submit verification failure should replan instead of triggering vision recovery: ${JSON.stringify(searchRecovery)}`)
	}
}

async function assertVisionRecoveryPreservesFailedCoordinateMeta() {
	const visionMeta = {
		source: 'multi_modal',
		point: { x: 120, y: 88 },
		coordinateOutcome: { kind: 'failed', progress: false, reason: 'occluded_click_target' },
		coordinateAttempts: [
			{
				attempt: 1,
				stage: 'action',
				message: '坐标点击被遮挡',
				point: { x: 120, y: 88 },
				outcome: { kind: 'failed', progress: false, reason: 'occluded_click_target' },
			},
		],
	}
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-recovery.js', {
		NC_BG_VISION: {
			canUseVisionFallback: () => true,
			attemptVisionFallback: async () => ({
				success: false,
				message: 'multi_modal 坐标动作执行失败: 坐标点击被遮挡',
				meta: visionMeta,
			}),
		},
	})
	const recovery = sandbox.NC_BG_SESSION_RECOVERY
	const execution = await recovery.attemptExecutionVisionFallback(
		{},
		{ action: { name: 'click_element_by_index', input: { index: 7 } } },
		{},
		{
			success: false,
			message: 'DOM 点击失败',
			meta: { outcome: { kind: 'failed', reason: 'missing_index' } },
		}
	)
	if (execution.success) {
		throw new Error(`failed vision fallback should keep execution failed, got ${JSON.stringify(execution)}`)
	}
	if (execution.meta?.outcome?.reason !== 'missing_index') {
		throw new Error(`execution recovery should preserve original DOM failure meta, got ${JSON.stringify(execution)}`)
	}
	if (
		execution.meta?.visionCoordinateOutcome?.reason !== 'occluded_click_target' ||
		execution.meta?.visionFallback?.coordinateOutcome?.reason !== 'occluded_click_target' ||
		!Array.isArray(execution.meta?.visionCoordinateAttempts) ||
		execution.meta.visionCoordinateAttempts[0]?.outcome?.reason !== 'occluded_click_target'
	) {
		throw new Error(`execution recovery should preserve failed vision coordinate meta, got ${JSON.stringify(execution)}`)
	}

	const verification = await recovery.attemptVerificationRecovery(
		{},
		{ action: { name: 'click_element_by_index', input: { index: 7 } } },
		{},
		'无可见变化'
	)
	if (verification.success) {
		throw new Error(`failed verification vision recovery should stay failed, got ${JSON.stringify(verification)}`)
	}
	if (verification.meta?.coordinateOutcome?.reason !== 'occluded_click_target') {
		throw new Error(`verification recovery should preserve failed vision coordinate meta, got ${JSON.stringify(verification)}`)
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
			requestObservation: async () => {
				await new Promise((resolve) => setTimeout(resolve, 12))
				return {
					ok: true,
					data: { url: 'http://example.test/app', title: 'Example' },
				}
			},
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
		config: {
			maxSteps: 2,
			textLLM: {},
			observationHeartbeatInitialMs: 1,
			observationHeartbeatIntervalMs: 5,
		},
		step: 0,
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	sessions.set(session.id, session)
	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)
	const activityTexts = updates.map((message) => String(message?.payload?.activityText || ''))
	if (!activityTexts.some((text) => text.includes('正在读取页面结构') && text.includes('表单字段') && text.includes('弹层'))) {
		throw new Error(`session engine should publish observation heartbeat updates during slow page observation, got ${JSON.stringify(activityTexts)}`)
	}
	if (!activityTexts.some((text) => text.includes('请求模型规划动作'))) {
		throw new Error(`session engine should publish planner progress updates, got ${JSON.stringify(activityTexts)}`)
	}
	const progressPlanUpdates = updates
		.map((message) => message?.payload?.planItems || [])
		.filter((items) => Array.isArray(items) && items.some((item) => item?.id === 'current_planning_progress'))
	if (!progressPlanUpdates.length) {
		throw new Error(`session engine should publish planner progress as a visible plan item, got ${JSON.stringify(updates.map((message) => message?.payload?.planItems || []))}`)
	}
	const progressPlan = progressPlanUpdates[0].find((item) => item?.id === 'current_planning_progress')
	if (
		progressPlan?.status !== 'running' ||
		!String(progressPlan?.title || '').includes('请求模型规划') ||
		!String(progressPlan?.title || '').includes('请求模型规划动作')
	) {
		throw new Error(`planner progress plan item should explain the current planning phase, got ${JSON.stringify(progressPlan)}`)
	}
	const finalPayload = updates[updates.length - 1]?.payload || {}
	if (Array.isArray(finalPayload.planItems) && finalPayload.planItems.some((item) => item?.id === 'current_planning_progress')) {
		throw new Error(`planner progress plan item should be cleared after a final decision, got ${JSON.stringify(finalPayload.planItems)}`)
	}
	if (!session.traceItems.some((item) => item?.progress?.stage === 'model_request')) {
		throw new Error(`session engine should keep standard model request progress in traceItems, got ${JSON.stringify(session.traceItems)}`)
	}
	const observationHeartbeatText = sandbox.NC_BG_SESSION_ENGINE_TESTS.buildObservationHeartbeatText({ step: 6 }, 6400)
	for (const expected of ['第 6 步：正在读取页面结构', '已等待 6 秒', '可交互元素', '表格', '候选项', '压缩观察']) {
		if (!observationHeartbeatText.includes(expected)) {
			throw new Error(`session engine should explain slow observation with ${expected}, got ${observationHeartbeatText}`)
		}
	}
	const activityText = sandbox.NC_BG_SESSION_ENGINE_TESTS.buildDecisionActivityText(
		{ step: 7 },
		{
			next_goal: '',
			action: {
				name: 'click_element_by_index',
				input: {
					workflow_step: 'reset_filters',
					target_label: '清空',
					index: 9,
					target_region: 'content',
				},
			},
		}
	)
	if (!activityText.includes('第 7 步：清空当前搜索条件：清空')) {
		throw new Error(`session engine should describe workflow intent instead of only tool names, got ${activityText}`)
	}
	for (const expected of ['区域=content', 'index=9']) {
		if (!activityText.includes(expected)) {
			throw new Error(`session engine should expose generic target diagnostics with ${expected}, got ${activityText}`)
		}
	}
	const searchActivityText = sandbox.NC_BG_SESSION_ENGINE_TESTS.buildDecisionActivityText(
		{ step: 8 },
		{
			next_goal: '填写搜索字段：资料名称',
			action: {
				name: 'input_text',
				input: {
					workflow_step: 'fill_field',
					workflow_field_label: '资料名称',
					text: '测试公司',
					workflow_value_source: 'table_sample',
					workflow_value_basis: '当前列表已有数据',
					index: 31,
					target_region: 'content',
				},
			},
		}
	)
	for (const expected of ['填写搜索字段：资料名称', '值=测试公司', '来源=列表样本', '依据=当前列表已有数据', '区域=content', 'index=31']) {
		if (!searchActivityText.includes(expected)) {
			throw new Error(`session engine should expose search workflow value details with ${expected}, got ${searchActivityText}`)
		}
	}
	const navigationActivityText = sandbox.NC_BG_SESSION_ENGINE_TESTS.buildDecisionActivityText(
		{ step: 9 },
		{
			next_goal: '进入目标模块',
			action: {
				name: 'click_element_by_index',
				input: {
					workflow_step: 'navigate_to_task_target',
					target_label: '资料',
					workflow_nav_key: '资料页',
					index: 12,
					target_region: 'sidebar',
					workflow_result_status: 'candidate',
				},
			},
		}
	)
	for (const expected of ['进入目标模块：资料', '目标=资料页', '区域=sidebar', 'index=12', '结果=candidate']) {
		if (!navigationActivityText.includes(expected)) {
			throw new Error(`session engine should expose generic navigation diagnostics with ${expected}, got ${navigationActivityText}`)
		}
	}
	const heartbeatText = sandbox.NC_BG_SESSION_ENGINE_TESTS.buildActionExecutionHeartbeatText(
		{ step: 9 },
		{
			name: 'select_dropdown_option',
			input: {
				workflow_step: 'select_option',
				workflow_field_label: '资料等级',
				text: '核心',
			},
		},
		6200
	)
	for (const expected of ['第 9 步：选择搜索候选：资料等级', '已等待 6 秒', '候选弹层']) {
		if (!heartbeatText.includes(expected)) {
			throw new Error(`session engine should explain long-running action execution with ${expected}, got ${heartbeatText}`)
		}
	}
	const waitHeartbeatText = sandbox.NC_BG_SESSION_ENGINE_TESTS.buildActionExecutionHeartbeatText(
		{ step: 10 },
		{
			name: 'wait',
			input: {
				ms: 800,
				reason: '等待候选弹层出现',
			},
		},
		4100
	)
	for (const expected of ['第 10 步：等待候选弹层出现', '已等待 4 秒', '正在等待候选弹层出现']) {
		if (!waitHeartbeatText.includes(expected)) {
			throw new Error(`wait heartbeat should surface the declared wait reason with ${expected}, got ${waitHeartbeatText}`)
		}
	}
}

async function assertSessionPublishesExecutionHeartbeat() {
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
			executeAction: async () => {
				await new Promise((resolve) => setTimeout(resolve, 8))
				return {
					success: true,
					message: '已点击搜索。',
					meta: { outcome: { kind: 'dom_changed', progress: true, reason: 'DOM 已变化' } },
				}
			},
		},
		NC_BG_PLANNER: {
			planAction: async (session) => {
				if (!session._heartbeatActionPlanned) {
					session._heartbeatActionPlanned = true
					return {
						evaluation_previous_goal: '准备执行慢点击。',
						memory: '测试动作执行 heartbeat。',
						thought: '点击搜索按钮。',
						next_goal: '点击搜索按钮',
						action: { name: 'click_element_by_index', input: { index: 8, target_label: '搜索' } },
					}
				}
				return {
					evaluation_previous_goal: '点击完成。',
					memory: '测试结束。',
					thought: '结束。',
					next_goal: '结束。',
					action: { name: 'done', input: { text: '测试结束', success: true } },
				}
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
			requestUserConfirmation: async () => true,
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => false,
			shouldVerifyFailedExecution: () => false,
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
			attemptVisionFallback: async () => ({ success: false, message: 'unused' }),
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
		id: 'session-execution-heartbeat',
		task: '测试动作执行进度发布',
		latestTask: '测试动作执行进度发布',
		currentTabId: 1,
		status: 'running',
		activityText: '启动',
		config: {
			maxSteps: 3,
			textLLM: {},
			actionExecutionHeartbeatInitialMs: 1,
			actionExecutionHeartbeatIntervalMs: 50,
		},
		step: 0,
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	sessions.set(session.id, session)
	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)
	const activityTexts = updates.map((message) => String(message?.payload?.activityText || ''))
	if (!activityTexts.some((text) => text.includes('仍在执行') && text.includes('已等待') && text.includes('点击后的页面响应'))) {
		throw new Error(`session engine should publish execution heartbeat updates during slow actions, got ${JSON.stringify(activityTexts)}`)
	}
	const actionTrace = session.traceItems.find((item) => item?.progress?.stage === 'action_execution_heartbeat')
	if (
		!actionTrace ||
		actionTrace.title !== '动作执行进度' ||
		!String(actionTrace.detail || '').includes('仍在执行') ||
		!String(actionTrace.detail || '').includes('点击后的页面响应')
	) {
		throw new Error(`session engine should keep execution heartbeat as a visible trace card, got ${JSON.stringify(session.traceItems)}`)
	}
	const runtimePlanUpdates = updates
		.map((message) => message?.payload?.planItems || [])
		.filter((items) => Array.isArray(items) && items.some((item) => item?.id === 'current_runtime_progress'))
	if (!runtimePlanUpdates.length) {
		throw new Error(`session engine should publish execution heartbeat as a visible plan item, got ${JSON.stringify(updates.map((message) => message?.payload?.planItems || []))}`)
	}
	const runtimePlan = runtimePlanUpdates[0].find((item) => item?.id === 'current_runtime_progress')
	if (
		runtimePlan?.status !== 'running' ||
		!String(runtimePlan?.title || '').includes('动作执行进度') ||
		!String(runtimePlan?.title || '').includes('仍在执行')
	) {
		throw new Error(`runtime progress plan item should explain slow action execution, got ${JSON.stringify(runtimePlan)}`)
	}
	if (sandbox.NC_BG_SESSION_ENGINE_TESTS.getActionExecutionHeartbeatInitialMs(session) !== 1) {
		throw new Error('session engine should allow low test heartbeat initial delay through session config')
	}
}

async function assertSessionPublishesExecutionRecoveryProgress() {
	const updates = []
	const decisions = [
		{
			evaluation_previous_goal: '准备点击被遮挡目标。',
			memory: 'DOM 执行失败后应显示恢复进度。',
			thought: '先点击目标。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 8, target_label: '确认' } },
		},
		{
			evaluation_previous_goal: '视觉回退已完成。',
			memory: '测试结束。',
			thought: '结束。',
			next_goal: '结束。',
			action: { name: 'done', input: { text: '测试结束', success: true } },
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
			executeAction: async () => ({
				success: false,
				message: 'DOM 点击失败: 坐标未命中可用元素',
				meta: { outcome: { kind: 'failed', progress: false, reason: 'occluded_click_target' } },
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
			requestUserConfirmation: async () => true,
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => false,
			shouldVerifyFailedExecution: () => false,
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => true,
			attemptVisionFallback: async () => ({
				success: true,
				message: '坐标动作已完成。',
				meta: { outcome: { kind: 'dom_changed', progress: true, reason: '视觉回退推动页面变化' } },
			}),
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
		id: 'session-execution-recovery-progress',
		task: '测试执行恢复进度发布',
		latestTask: '测试执行恢复进度发布',
		currentTabId: 1,
		status: 'running',
		activityText: '启动',
		config: { maxSteps: 3, textLLM: {} },
		step: 0,
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	sessions.set(session.id, session)
	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)
	const recoveryTrace = session.traceItems.find((item) => item?.progress?.stage === 'execution_recovery')
	if (
		!recoveryTrace ||
		recoveryTrace.title !== '执行恢复进度' ||
		!String(recoveryTrace.detail || '').includes('DOM 失败') ||
		!String(recoveryTrace.detail || '').includes('尝试视觉回退')
	) {
		throw new Error(`execution recovery should publish a visible runtime progress trace, got ${JSON.stringify(session.traceItems)}`)
	}
	const runtimePlanUpdates = updates
		.map((message) => message?.payload?.planItems || [])
		.filter((items) => Array.isArray(items) && items.some((item) => item?.id === 'current_runtime_progress'))
	const recoveryPlan = runtimePlanUpdates
		.flat()
		.find((item) =>
			item?.id === 'current_runtime_progress' &&
			String(item?.title || '').includes('执行恢复进度') &&
			String(item?.title || '').includes('尝试视觉回退')
		)
	if (!recoveryPlan) {
		throw new Error(`execution recovery should publish a visible runtime progress plan item, got ${JSON.stringify(runtimePlanUpdates)}`)
	}
	if (session.currentRuntimeProgress) {
		throw new Error(`execution recovery should clear current runtime progress after fallback finishes, got ${JSON.stringify(session.currentRuntimeProgress)}`)
	}
	const finalPayload = updates[updates.length - 1]?.payload || {}
	if (Array.isArray(finalPayload.planItems) && finalPayload.planItems.some((item) => item?.id === 'current_runtime_progress')) {
		throw new Error(`execution recovery final publish should not leave a stale runtime progress plan item, got ${JSON.stringify(finalPayload.planItems)}`)
	}
}

async function assertSessionRecordsVerifiedAfterFailedExecution() {
	const decisions = [
		{
			evaluation_previous_goal: '准备点击可能超时的目标。',
			memory: '执行失败后应复核页面是否已生效。',
			thought: '先执行一次可能超时的点击。',
			next_goal: '点击目标按钮',
			action: { name: 'click_element_by_index', input: { index: 8, target_label: '确认' } },
		},
		{
			evaluation_previous_goal: '执行失败已由观察复核确认生效。',
			memory: '测试结束。',
			thought: '结束。',
			next_goal: '结束。',
			action: { name: 'done', input: { text: '测试结束', success: true } },
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
				data: { url: 'http://example.test/app', title: 'Example', content: 'before' },
			}),
			executeAction: async () => ({
				success: false,
				message: '动作执行超时。',
				meta: { outcome: { kind: 'failed', progress: false, reason: 'action_timeout' } },
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
			requestUserConfirmation: async () => true,
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => true,
			shouldVerifyFailedExecution: () => true,
			verifyExecutionOutcome: async () => ({
				ok: true,
				reason: '页面已经出现目标结果',
				outcome: { kind: 'dom_changed', progress: true, reason: '页面已经出现目标结果' },
			}),
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
		id: 'session-verified-after-failed-execution',
		task: '测试失败执行后的观察复核记录',
		latestTask: '测试失败执行后的观察复核记录',
		currentTabId: 1,
		status: 'running',
		activityText: '启动',
		config: {
			maxSteps: 3,
			textLLM: {},
			verificationHeartbeatInitialMs: 1,
			verificationHeartbeatIntervalMs: 5,
		},
		step: 0,
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	sessions.set(session.id, session)
	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)
	const clickHistory = session.history.find((item) => item.action === 'click_element_by_index')
	if (
		!clickHistory ||
		clickHistory.success !== true ||
		clickHistory.verifiedAfterFailure !== true ||
		clickHistory.outcome?.kind !== 'dom_changed' ||
		!String(clickHistory.output || '').includes('观察复核成功')
	) {
		throw new Error(`failed execution verified by observation should be recorded as recovered progress, got ${JSON.stringify(session.history)}`)
	}
}

async function assertSessionPublishesVerificationHeartbeat() {
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
			executeAction: async () => ({
				success: true,
				message: '已选择候选。',
				meta: { outcome: { kind: 'state_changed', progress: true, reason: '字段状态已变化' } },
			}),
		},
		NC_BG_PLANNER: {
			planAction: async (session) => {
				if (!session._verificationActionPlanned) {
					session._verificationActionPlanned = true
					return {
						evaluation_previous_goal: '准备选择真实候选。',
						memory: '测试动作复核 heartbeat。',
						thought: '选择候选项后等待复核。',
						next_goal: '选择资料等级候选',
						action: {
							name: 'select_dropdown_option',
							input: {
								index: 3,
								text: '核心',
								workflow_step: 'select_option',
								workflow_field_label: '资料等级',
							},
						},
					}
				}
				return {
					evaluation_previous_goal: '候选选择已校验。',
					memory: '测试结束。',
					thought: '结束。',
					next_goal: '结束。',
					action: { name: 'done', input: { text: '测试结束', success: true } },
				}
			},
		},
		NC_BG_CONFIRMATION: {
			detectDangerousAction: () => ({ isDangerous: false }),
			requestUserConfirmation: async () => true,
		},
		NC_BG_VERIFIER: {
			shouldVerifyAction: () => true,
			shouldVerifyFailedExecution: () => false,
			verifyExecutionOutcome: async () => {
				await new Promise((resolve) => setTimeout(resolve, 12))
				return {
					ok: true,
					reason: '字段值与候选状态已变化',
					outcome: { kind: 'value_changed', progress: true, reason: '字段值与候选状态已变化' },
				}
			},
		},
		NC_BG_VISION: {
			canUseVisionFallback: () => false,
			attemptVisionFallback: async () => ({ success: false, message: 'unused' }),
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
		id: 'session-verification-heartbeat',
		task: '测试动作复核进度发布',
		latestTask: '测试动作复核进度发布',
		currentTabId: 1,
		status: 'running',
		activityText: '启动',
		config: {
			maxSteps: 3,
			textLLM: {},
			verificationHeartbeatInitialMs: 1,
			verificationHeartbeatIntervalMs: 5,
		},
		step: 0,
		history: [],
		traceItems: [],
		planItems: [],
		consecutiveFailures: 0,
	}
	sessions.set(session.id, session)
	await sandbox.NC_BG_SESSION_ENGINE.runSession(session, sessions)
	const activityTexts = updates.map((message) => String(message?.payload?.activityText || ''))
	if (!activityTexts.some((text) => text.includes('正在复核动作是否真正生效') && text.includes('字段值') && text.includes('选项状态'))) {
		throw new Error(`session engine should publish verification heartbeat updates during slow verification, got ${JSON.stringify(activityTexts)}`)
	}
	const verificationTrace = session.traceItems.find((item) => item?.progress?.stage === 'verification_heartbeat')
	if (
		!verificationTrace ||
		verificationTrace.title !== '动作复核进度' ||
		!String(verificationTrace.detail || '').includes('正在复核动作是否真正生效') ||
		!String(verificationTrace.detail || '').includes('字段值')
	) {
		throw new Error(`session engine should keep verification heartbeat as a visible trace card, got ${JSON.stringify(session.traceItems)}`)
	}
	if (!String(session.history.find((item) => item.action === 'select_dropdown_option')?.output || '').includes('校验通过')) {
		throw new Error(`session history should return to the verified action result after heartbeat, got ${JSON.stringify(session.history)}`)
	}
	if (sandbox.NC_BG_SESSION_ENGINE_TESTS.getVerificationHeartbeatInitialMs(session) !== 1) {
		throw new Error('session engine should allow low verification heartbeat initial delay through session config')
	}
	const heartbeatText = sandbox.NC_BG_SESSION_ENGINE_TESTS.buildVerificationHeartbeatText(
		{ step: 10 },
		{
			name: 'select_dropdown_option',
			input: {
				workflow_step: 'select_option',
				workflow_field_label: '资料等级',
				text: '核心',
			},
		},
		6200
	)
	for (const expected of ['第 10 步：正在复核动作是否真正生效：资料等级', '已等待 6 秒', '字段值', '选项状态']) {
		if (!heartbeatText.includes(expected)) {
			throw new Error(`session engine should explain action verification with ${expected}, got ${heartbeatText}`)
		}
	}
	const timeoutText = sandbox.NC_BG_SESSION_ENGINE_TESTS.buildVerificationHeartbeatText(
		{ step: 11 },
		{ name: 'click_element_by_index', input: { target_label: '保存' } },
		0,
		{ failedExecution: true }
	)
	for (const expected of ['第 11 步：动作执行超时后正在复核是否已生效：保存', '已等待 1 秒', '页面反馈']) {
		if (!timeoutText.includes(expected)) {
			throw new Error(`session engine should explain post-timeout verification with ${expected}, got ${timeoutText}`)
		}
	}
}

function assertRuntimeProgressTraceDedupes() {
	const updates = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-lifecycle.js', {
		NC_BG_CONSTANTS: {
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_${updates.length}` },
		NC_BG_SESSION_RECORDS: {
			derivePlanItems: (session) => [
				session.currentRuntimeProgress
					? {
						id: 'current_runtime_progress',
						title: `运行进度：${session.currentRuntimeProgress.text}`,
						status: 'running',
					}
					: null,
				session.currentPlanningProgress
					? {
						id: 'current_planning_progress',
						title: `规划进度：${session.currentPlanningProgress.text}`,
						status: 'running',
					}
					: null,
			].filter(Boolean),
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
	const session = {
		id: 'runtime-progress-dedupe',
		task: '测试运行进度卡去重',
		status: 'running',
		step: 4,
		activityText: '',
		traceItems: [],
		planItems: [],
		currentPlanningProgress: {
			stage: 'model_wait_heartbeat',
			text: '仍在等待模型响应。',
			round: 1,
		},
	}
	sandbox.NC_BG_SESSION_LIFECYCLE.publishRuntimeProgress(session, {
		stage: 'observation_heartbeat',
		elapsedMs: 2300,
		text: '第 4 步：正在读取页面结构，已等待 2 秒。',
	})
	sandbox.NC_BG_SESSION_LIFECYCLE.publishRuntimeProgress(session, {
		stage: 'observation_heartbeat',
		elapsedMs: 6800,
		text: '第 4 步：正在读取页面结构，已等待 7 秒。',
	})
	const traces = session.traceItems.filter((item) => item?.progress?.stage === 'observation_heartbeat')
	if (
		traces.length !== 1 ||
		traces[0]?.title !== '页面观察进度' ||
		!String(traces[0]?.detail || '').includes('已等待 7 秒') ||
		traces[0]?.progress?.elapsedMs !== 6800
	) {
		throw new Error(`runtime progress heartbeat should upsert one visible trace card per step/stage, got ${JSON.stringify(session.traceItems)}`)
	}
	const lastPayload = updates[updates.length - 1]?.payload || {}
	if (
		!String(lastPayload.activityText || '').includes('已等待 7 秒') ||
		!Array.isArray(lastPayload.planItems) ||
		!lastPayload.planItems.some((item) => item?.id === 'current_runtime_progress') ||
		lastPayload.planItems.some((item) => item?.id === 'current_planning_progress') ||
		session.currentPlanningProgress
	) {
		throw new Error(`runtime progress should replace stale planning progress in visible plan items, got session=${JSON.stringify(session)} updates=${JSON.stringify(updates)}`)
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
			action: { name: 'wait', input: { ms: 200, reason: '等待页面稳定' } },
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
			action: { name: 'wait', input: { ms: 200, reason: '等待页面稳定' } },
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
	if (!String(verifyFailure.output || '').includes('恢复处理: 当前动作不支持视觉恢复')) {
		throw new Error(`verification failure should explain skipped/failed recovery attempts in user-visible history, got ${verifyFailure.output}`)
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
				thought: '写入终态资料。',
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
			recordWorkflowOutcome: (_session, decision, outcome) => {
				recorded.push({ decision, outcome })
				_session.workflowState = {
					search: {
						phase: 'completed',
						fieldOrder: ['index:2', 'index:3'],
						completedKeys: ['index:2', 'index:3'],
						fields: {
							'index:2': { label: '登录账号' },
							'index:3': { label: '账号姓名' },
						},
					},
				}
			},
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
		task: '测试搜索工作流 done 终态资料',
		latestTask: '测试搜索工作流 done 终态资料',
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
	if (
		session.planItems[0]?.id !== 'search_workflow_progress' ||
		session.planItems[0]?.status !== 'done' ||
		!String(session.planItems[0]?.title || '').includes('进度 2/2') ||
		!String(session.planItems[0]?.title || '').includes('已完成')
	) {
		throw new Error(`workflow done should refresh aggregate planItems after recording workflow state, got ${JSON.stringify(session.planItems)}`)
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
			action: { name: 'wait', input: { ms: 200, reason: '等待页面稳定' } },
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
		vm.runInNewContext(read('naturalclick-extension/background/task-intent.js'), sandbox, {
			filename: 'naturalclick-extension/background/task-intent.js',
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
		throw new Error(`expected ${expectedName}, got ${decision?.action?.name || '(none)'} decision=${JSON.stringify(decision)}`)
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
	if (!background.includes('background/task-intent.js')) {
		throw new Error('background importScripts should load task intent before planner and workflow registry')
	}
	if (
		background.indexOf('background/task-intent.js') > background.indexOf('background/workflows.js') ||
		background.indexOf('background/task-intent.js') > background.indexOf('background/planner.js')
	) {
		throw new Error('task intent must be loaded before workflows and planner')
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
	const searchWorkflow = read('naturalclick-extension/background/search-workflow.js')
	const shared = read('naturalclick-extension/shared/control-semantics.js')
	if (!shared.includes('function describeObservedControl') || !shared.includes('DROPDOWN_FIELD_TYPES')) {
		throw new Error('shared control semantics should expose observed-control classification')
	}
	if (!shared.includes('function scoreObservedOptionAssociation') || !shared.includes('observedOptionMatchesControlledPopup')) {
		throw new Error('shared control semantics should expose observed option-field association')
	}
	if (!shared.includes("'select'") || !shared.includes("'date'")) {
		throw new Error('shared control semantics should classify structural select and picker field types')
	}
	for (const forbidden of ["'platform'", "'department'", "'position'", "'region'", "'gender'", "'status'", "'state'", "'category'"]) {
		if (shared.includes(forbidden)) {
			throw new Error(`shared control semantics should not classify selection controls from domain/category field names: ${forbidden}`)
		}
	}
	if (!validation.includes('NC_CONTROL_SEMANTICS') || !validation.includes('isObservedPlainEditableText')) {
		throw new Error('planner validation should use shared observed-control semantics')
	}
	const validationSelectionFn = extractFunctionSource(validation, 'isSelectionLikeItem')
	const searchSelectionFn = extractFunctionSource(searchWorkflow, 'isSelectionField')
	for (const forbidden of ['platform', 'department', 'position', 'region', 'gender', 'status', 'state', 'category']) {
		const pattern = new RegExp(`\\b${forbidden}\\b`)
		if (pattern.test(validationSelectionFn) || pattern.test(searchSelectionFn)) {
			throw new Error(`selection fallbacks should not depend on domain/category field names: ${forbidden}`)
		}
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
	const categoricalTextbox = { fieldType: 'platform', role: 'textbox', editable: true }
	if (semantics.isObservedSelectionLike(categoricalTextbox, 'forms') || !semantics.isObservedPlainEditableText(categoricalTextbox, 'forms')) {
		throw new Error('domain/category field names alone should not turn editable textboxes into selection controls')
	}
	const noneditableCategorical = { fieldType: 'department', role: 'textbox', editable: false }
	if (semantics.isObservedSelectionLike(noneditableCategorical, 'forms')) {
		throw new Error('domain/category field names alone should not turn noneditable textboxes into selection controls')
	}
	const structuralDropdown = { fieldType: 'platform', role: 'combobox', editable: true }
	if (!semantics.isObservedSelectionLike(structuralDropdown, 'forms')) {
		throw new Error('observed combobox structure should identify selection controls regardless of field name')
	}
	const optionBackedField = { fieldType: 'status', role: 'textbox', editable: true, optionLabels: ['启用', '禁用'] }
	if (!semantics.isObservedSelectionLike(optionBackedField, 'forms')) {
		throw new Error('real option labels should identify selection controls regardless of field name')
	}
	const editableDate = { fieldType: 'date', role: 'textbox', editable: true }
	if (!semantics.isObservedPlainEditableText(editableDate, 'forms')) {
		throw new Error('editable date textboxes should remain text-editable')
	}
	const pickerDate = { fieldType: 'date', role: 'textbox', editable: false }
	if (!semantics.isObservedSelectionLike(pickerDate, 'forms')) {
		throw new Error('readonly/observed-noneditable date fields should be selection controls')
	}
	const separatedDateRange = { fieldType: 'date-range', role: 'textbox', editable: false }
	if (!semantics.isObservedSelectionLike(separatedDateRange, 'forms')) {
		throw new Error('date-range field type aliases should be selection controls after type-token normalization')
	}
	const underscoredTimeRange = { fieldType: 'time_range', role: 'textbox', editable: false }
	if (!semantics.isObservedSelectionLike(underscoredTimeRange, 'forms')) {
		throw new Error('time_range field type aliases should be selection controls after type-token normalization')
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
		{ label: '账号平台', relationHints: 'aria-controls=user-platform-list' }
	)
	const wrongControlledScore = semantics.scoreObservedOptionAssociation(
		{ label: '企业端', popupHints: 'popupId=other-list' },
		{ label: '账号平台', relationHints: 'aria-controls=user-platform-list' }
	)
	if (controlledScore !== 0 || Number.isFinite(wrongControlledScore)) {
		throw new Error('observed option association should treat explicit controlled popup ownership as authoritative')
	}
	const labelledScore = semantics.scoreObservedOptionAssociation(
		{ label: '企业端', popupHints: 'popupLabelledBy=user-platform-label' },
		{ label: '账号平台', relationHints: 'aria-labelledby=user-platform-label' }
	)
	if (labelledScore !== 100) {
		throw new Error('observed option association should support popup aria-labelledby ownership')
	}
	const expandedDateLabelledScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-01',
			role: 'option',
			selectionControl: 'date-option',
			popupHints: 'popupLabelledBy=picker-heading',
			rect: { left: 480, top: 330, width: 44, height: 36 },
		},
		{
			label: 'Created at',
			fieldType: 'daterange',
			role: 'combobox',
			expandedState: 'expanded',
			rect: { left: 450, top: 170, width: 160, height: 36 },
		}
	)
	if (!Number.isFinite(expandedDateLabelledScore) || expandedDateLabelledScore >= 1000) {
		throw new Error('date picker popup labels that cannot be tied to a field id should still allow expanded date-field ownership scoring')
	}
	const wrongLabelledDateScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-01',
			role: 'option',
			selectionControl: 'date-option',
			popupHints: 'popupLabelledBy=other-field-label',
			rect: { left: 480, top: 330, width: 44, height: 36 },
		},
		{
			label: 'Created at',
			fieldType: 'daterange',
			role: 'combobox',
			relationHints: 'aria-labelledby=created-at-label',
			rect: { left: 450, top: 170, width: 160, height: 36 },
		}
	)
	if (Number.isFinite(wrongLabelledDateScore)) {
		throw new Error('mismatched popup labelled-by ownership should remain authoritative for non-expanded date fields')
	}
	const unknownScore = semantics.scoreObservedOptionAssociation(
		{ label: '企业端' },
		{ label: '账号平台' },
		{ unknownScore: Number.MAX_SAFE_INTEGER }
	)
	if (unknownScore !== Number.MAX_SAFE_INTEGER) {
		throw new Error('observed option association should preserve caller-selected unknown score')
	}
	const wideDatePanelScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-01',
			role: 'option',
			selectionControl: 'date-option',
			rect: { left: 752, top: 266, width: 41, height: 39 },
		},
		{
			label: '创建时间',
			fieldType: 'daterange',
			role: 'combobox',
			selectionControl: 'dropdown',
			rect: { left: 917, top: 136, width: 131, height: 33 },
		}
	)
	const wrongDateTargetScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-01',
			role: 'option',
			selectionControl: 'date-option',
			rect: { left: 752, top: 266, width: 41, height: 39 },
		},
		{
			label: '客户等级',
			fieldType: 'select',
			role: 'combobox',
			selectionControl: 'dropdown',
			rect: { left: 396, top: 191, width: 131, height: 32 },
		}
	)
	if (
		!Number.isFinite(wideDatePanelScore) ||
		wideDatePanelScore < semantics.OPTION_ASSOCIATION_SCORES.geometryOffset ||
		Number.isFinite(wrongDateTargetScore)
	) {
		throw new Error('wide date picker cells should associate with date/daterange fields without becoming generic select candidates')
	}
	const unexpandedWideDatePanelScore = semantics.scoreObservedOptionAssociation(
		{
			label: '16',
			role: 'option',
			selectionControl: 'date-option',
			rect: { left: 1460, top: 392, width: 41, height: 39 },
		},
		{
			label: '创建时间',
			fieldType: 'daterange',
			role: 'combobox',
			selectionControl: 'dropdown',
			rect: { left: 1090, top: 136, width: 155, height: 33 },
		}
	)
	const collapsedWideDatePanelScore = semantics.scoreObservedOptionAssociation(
		{
			label: '16',
			role: 'option',
			selectionControl: 'date-option',
			rect: { left: 1460, top: 392, width: 41, height: 39 },
		},
		{
			label: '创建时间',
			fieldType: 'daterange',
			role: 'combobox',
			selectionControl: 'dropdown',
			expandedState: 'collapsed',
			rect: { left: 1090, top: 136, width: 155, height: 33 },
		}
	)
	if (
		!Number.isFinite(unexpandedWideDatePanelScore) ||
		unexpandedWideDatePanelScore < semantics.OPTION_ASSOCIATION_SCORES.geometryOffset ||
		Number.isFinite(collapsedWideDatePanelScore)
	) {
		throw new Error('nearby wide date panels should associate with date fields even before expanded state is captured, but not with collapsed fields')
	}
	const dateRangeAliasDatePanelScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-01',
			role: 'option',
			selectionControl: 'date-option',
			rect: { left: 224, top: 266, width: 41, height: 39 },
		},
		{
			label: '有效期',
			fieldType: 'date-range',
			role: 'combobox',
			selectionControl: 'dropdown',
			rect: { left: 190, top: 136, width: 150, height: 33 },
		}
	)
	if (!Number.isFinite(dateRangeAliasDatePanelScore)) {
		throw new Error('date picker cells should associate with date-range field type aliases even when the label is domain-neutral')
	}
	const expandedFarDateScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-16',
			role: 'option',
			selectionControl: 'date-option',
			rect: { left: 1240, top: 360, width: 41, height: 39 },
		},
		{
			label: '开始 - 结束',
			fieldType: 'daterange',
			role: 'combobox',
			selectionControl: 'dropdown',
			expandedState: 'expanded',
			rect: { left: 520, top: 140, width: 155, height: 33 },
		}
	)
	const collapsedFarDateScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-16',
			role: 'option',
			selectionControl: 'date-option',
			rect: { left: 1240, top: 360, width: 41, height: 39 },
		},
		{
			label: '开始 - 结束',
			fieldType: 'daterange',
			role: 'combobox',
			selectionControl: 'dropdown',
			expandedState: 'collapsed',
			rect: { left: 520, top: 140, width: 155, height: 33 },
		}
	)
	const expandedDateWithStaleControlsScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-16',
			role: 'option',
			selectionControl: 'date-option',
			rect: { left: 1240, top: 360, width: 41, height: 39 },
		},
		{
			label: '开始 - 结束',
			fieldType: 'daterange',
			role: 'combobox',
			selectionControl: 'dropdown',
			expandedState: 'expanded',
			relationHints: 'aria-controls=stale-input-popup',
			rect: { left: 520, top: 140, width: 155, height: 33 },
		}
	)
	const collapsedDateWithStaleControlsScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-16',
			role: 'option',
			selectionControl: 'date-option',
			rect: { left: 1240, top: 360, width: 41, height: 39 },
		},
		{
			label: '开始 - 结束',
			fieldType: 'daterange',
			role: 'combobox',
			selectionControl: 'dropdown',
			expandedState: 'collapsed',
			relationHints: 'aria-controls=stale-input-popup',
			rect: { left: 520, top: 140, width: 155, height: 33 },
		}
	)
	const expandedDateWithWrongLabelOwnerScore = semantics.scoreObservedOptionAssociation(
		{
			label: '2026-06-16',
			role: 'option',
			selectionControl: 'date-option',
			popupHints: 'popupLabelledBy=other-date-field-label',
			rect: { left: 1240, top: 360, width: 41, height: 39 },
		},
		{
			label: '开始 - 结束',
			fieldType: 'daterange',
			role: 'combobox',
			selectionControl: 'dropdown',
			expandedState: 'expanded',
			relationHints: 'aria-controls=stale-input-popup,aria-labelledby=current-date-field-label',
			rect: { left: 520, top: 140, width: 155, height: 33 },
		}
	)
	if (
		!Number.isFinite(expandedFarDateScore) ||
		expandedFarDateScore >= semantics.OPTION_ASSOCIATION_SCORES.geometryOffset ||
		Number.isFinite(collapsedFarDateScore) ||
		!Number.isFinite(expandedDateWithStaleControlsScore) ||
		expandedDateWithStaleControlsScore >= semantics.OPTION_ASSOCIATION_SCORES.geometryOffset ||
		Number.isFinite(collapsedDateWithStaleControlsScore) ||
		Number.isFinite(expandedDateWithWrongLabelOwnerScore)
	) {
		throw new Error('expanded date-like fields should tolerate visible date popups and stale aria-controls without letting collapsed or explicitly conflicting fields claim far date cells')
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

function assertSessionPlanItemsExposeSearchWorkflowProgress() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-records.js', {})
	const planningPlanItems = sandbox.NC_BG_SESSION_RECORDS.derivePlanItems({
		status: 'running',
		history: [],
		currentPlanningProgress: {
			stage: 'model_wait_heartbeat',
			round: 2,
			text: '第 3 步：模型正在分析页面结构，已等待 12/60 秒；正在核对列表样本、真实下拉候选、可执行按钮和遮挡命中状态，避免随机搜索和盲点。',
		},
	})
	const planningItem = planningPlanItems[0]
	if (
		planningItem?.id !== 'current_planning_progress' ||
		planningItem.status !== 'running' ||
		!String(planningItem.title || '').includes('等待模型响应') ||
		!String(planningItem.title || '').includes('尚未操作页面') ||
		!String(planningItem.title || '').includes('第 2 轮') ||
		!String(planningItem.title || '').includes('模型正在分析页面结构') ||
		!String(planningItem.title || '').includes('避免随机搜索和盲点')
	) {
		throw new Error(`session planItems should expose live planning progress, got ${JSON.stringify(planningPlanItems)}`)
	}
	const clearedPlanningItems = sandbox.NC_BG_SESSION_RECORDS.derivePlanItems({
		status: 'running',
		history: [],
		currentPlanningProgress: null,
	})
	if (clearedPlanningItems.some((item) => item.id === 'current_planning_progress')) {
		throw new Error(`cleared planning progress should not leave a stale plan item, got ${JSON.stringify(clearedPlanningItems)}`)
	}
	const contextRequestPlanItems = sandbox.NC_BG_SESSION_RECORDS.derivePlanItems({
		status: 'running',
		history: [],
		currentPlanningProgress: {
			stage: 'planning_context_request',
			round: 1,
			text: '第 4 步：模型准备请求内部上下文 request_context（source=tables）；正在查找表格/列表摘要，这一步只补充上下文，不操作页面。',
		},
	})
	if (
		contextRequestPlanItems[0]?.id !== 'current_planning_progress' ||
		!String(contextRequestPlanItems[0]?.title || '').includes('请求页面上下文') ||
		!String(contextRequestPlanItems[0]?.title || '').includes('只补证据') ||
		!String(contextRequestPlanItems[0]?.title || '').includes('不操作页面')
	) {
		throw new Error(`session planItems should expose planning-context request progress, got ${JSON.stringify(contextRequestPlanItems)}`)
	}
	const planItems = sandbox.NC_BG_SESSION_RECORDS.derivePlanItems({
		status: 'running',
		history: [
			{
				stepIndex: 1,
				action: 'input_text',
				nextGoal: '填写搜索字段：登录账号',
				success: true,
			},
		],
		workflowState: {
			search: {
				phase: 'awaiting_reset',
				activeFieldKey: 'index:2',
				fieldOrder: ['index:2', 'index:3', 'index:4'],
				completedKeys: ['index:2'],
				fields: {
					'index:2': {
						label: '登录账号',
						lastTestValue: 'admin',
						lastValueSource: 'table_sample',
						lastValueBasis: '当前列表已有数据',
					},
					'index:3': { label: '账号姓名' },
					'index:4': { label: '状态' },
				},
			},
		},
	})
	const first = planItems[0]
	if (
		first?.id !== 'search_workflow_progress' ||
		first.status !== 'running' ||
		!String(first.title || '').includes('搜索项测试') ||
		!String(first.title || '').includes('进度 1/3') ||
		!String(first.title || '').includes('当前：登录账号') ||
		!String(first.title || '').includes('等待清空') ||
		!String(first.title || '').includes('测试值：admin') ||
		!String(first.title || '').includes('依据：列表样本/当前列表已有数据') ||
		!String(first.title || '').includes('清空：待清空')
	) {
		throw new Error(`session planItems should expose aggregate search workflow progress and sample audit first, got ${JSON.stringify(planItems)}`)
	}
	if (!planItems.some((item) => item.id === 'p_1' && item.title === '填写搜索字段：登录账号')) {
		throw new Error(`search workflow progress should preserve existing history plan rows, got ${JSON.stringify(planItems)}`)
	}
	const completedPlanItems = sandbox.NC_BG_SESSION_RECORDS.derivePlanItems({
		status: 'completed',
		history: [],
		workflowState: {
			search: {
				phase: 'completed',
				fieldOrder: ['index:2', 'index:3'],
				completedKeys: ['index:2', 'index:3'],
				fields: {
					'index:2': { label: '登录账号', lastTestValue: 'admin', lastValueSource: 'task_value' },
					'index:3': { label: '账号姓名' },
				},
				resultsByKey: {
					'index:2': { status: 'passed_match' },
				},
			},
		},
	})
	if (
		completedPlanItems[0]?.status !== 'done' ||
		!String(completedPlanItems[0]?.title || '').includes('进度 2/2') ||
		!String(completedPlanItems[0]?.title || '').includes('已完成') ||
		!String(completedPlanItems[0]?.title || '').includes('结果：通过')
	) {
		throw new Error(`completed search workflow plan item should show done aggregate progress, got ${JSON.stringify(completedPlanItems)}`)
	}
	const failedTerminalPlanItems = sandbox.NC_BG_SESSION_RECORDS.derivePlanItems({
		status: 'error',
		history: [],
		workflowState: {
			search: {
				phase: 'completed',
				terminalSuccess: false,
				terminalReason: '搜索字段 "资料名称" 当前没有可用列表样本或任务显式值，继续使用泛化测试词容易得到空结果，已停止以避免无意义测试。',
				fieldOrder: ['index:31'],
				completedKeys: [],
				fields: {
					'index:31': { label: '资料名称' },
				},
			},
		},
	})
	if (
		failedTerminalPlanItems[0]?.status !== 'failed' ||
		!String(failedTerminalPlanItems[0]?.title || '').includes('已停止') ||
		!String(failedTerminalPlanItems[0]?.title || '').includes('原因：') ||
		!String(failedTerminalPlanItems[0]?.title || '').includes('没有可用列表样本')
	) {
		throw new Error(`terminal failed search workflow plan item should show failed aggregate progress and reason, got ${JSON.stringify(failedTerminalPlanItems)}`)
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
		'buildExecutionFailureSignal',
		'mergeRecoveryFailureMeta',
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

function assertSessionRecoveryRecognizesStructuredSemanticFailures() {
	const sessionRecovery = read('naturalclick-extension/background/session-recovery.js')
	const semanticFn = extractFunctionSource(sessionRecovery, 'isSemanticActionFailure')
	for (const expected of [
		'readonly_or_disabled',
		'disabled_target',
		'not_editable',
		'missing_coordinate_target',
		'candidate_mismatch',
		'options_not_visible',
		'field_scoped',
	]) {
		if (!semanticFn.includes(expected)) {
			throw new Error(`session recovery should treat structured semantic failure ${expected} as non-vision recoverable`)
		}
	}
}

function assertSessionRecoverySkipsSubmitVerificationVisionRecovery() {
	const sessionRecovery = read('naturalclick-extension/background/session-recovery.js')
	const skipFn = extractFunctionSource(sessionRecovery, 'getVerificationVisionRecoverySkipReason')
	const submitFn = extractFunctionSource(sessionRecovery, 'isFormSubmitRecoveryAction')
	if (!skipFn.includes('isFormSubmitRecoveryAction(action)') || !skipFn.includes('误点列表页新增')) {
		throw new Error('submit verification failures should not trigger vision recovery that can click create buttons after a successful submit')
	}
	if (!submitFn.includes('submit_form_timeout_recovery') || !submitFn.includes('workflow_submit_label')) {
		throw new Error('submit recovery skip should recognize form-submit workflow actions and submit labels')
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
		'publishRuntimeProgress',
		'appendPlanningProgressTrace',
		'appendRuntimeProgressTrace',
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
	if (
		!sessionLifecycle.includes('currentRuntimeProgress') ||
		!sessionLifecycle.includes('runtimeKey') ||
		!sessionLifecycle.includes('observation_heartbeat') ||
		!sessionLifecycle.includes('action_execution_heartbeat') ||
		!sessionLifecycle.includes('execution_recovery') ||
		!sessionLifecycle.includes('verification_heartbeat') ||
		!sessionLifecycle.includes('verification_recovery')
	) {
		throw new Error('session lifecycle should persist visible runtime heartbeat progress in traceItems with dedupe')
	}
	if (
		!sessionLifecycle.includes('observation_summary') ||
		!sessionLifecycle.includes('task_intent_request') ||
		!sessionLifecycle.includes('task_intent_heuristic') ||
		!sessionLifecycle.includes('workflow_analysis') ||
		!sessionLifecycle.includes('workflow_decision') ||
		!sessionLifecycle.includes('model_request') ||
		!sessionLifecycle.includes('model_wait_heartbeat') ||
		!sessionLifecycle.includes('timeout_no_recovery') ||
		!sessionLifecycle.includes('planning_context_request') ||
		!sessionLifecycle.includes('planning_context') ||
		!sessionLifecycle.includes('validation_feedback')
	) {
		throw new Error('planning progress trace should include timeout and ReAct context-request stages')
	}
	if (!sessionLifecycle.includes('function markTerminalWorkflowState') || !sessionLifecycle.includes('search.terminalReason') || !sessionLifecycle.includes("search.phase = 'failed'")) {
		throw new Error('session lifecycle should persist terminal workflow reasons into active search workflow state')
	}
	if (
		!sessionEngine.includes("failSession(session, '达到最大步数，任务未完成。', sessions)") ||
		sessionEngine.includes("session.activityText = '达到最大步数，任务未完成。'\n\t\t\tpublishSession(session)")
	) {
		throw new Error('session engine should finalize max-step exhaustion through failSession so traces, workflow terminal reasons, and result summaries stay consistent')
	}
	const published = []
	const lifecycleSandbox = loadBackgroundModule('naturalclick-extension/background/session-lifecycle.js', {
		NC_BG_CONSTANTS: {
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: {
			generateId: (prefix) => `${prefix}_test`,
		},
		NC_BG_RESULT_SUMMARY: {
			buildResultSummary: (session) => ({
				type: 'test',
				reason: session?.workflowState?.search?.terminalReason || session?.workflowState?.search?.failedReason || '',
			}),
		},
		chrome: {
			runtime: {
				lastError: null,
				sendMessage: (message, callback) => {
					published.push(message)
					if (typeof callback === 'function') callback()
				},
			},
		},
	})
	const failingSession = {
		id: 'session-fail',
		status: 'running',
		task: '测试搜索区域每一个搜索项',
		activityText: '',
		traceItems: [],
		workflowState: {
			search: {
				phase: 'select_field',
				activeFieldKey: 'index:27',
				lastSearchedFieldKey: 'index:25',
				fieldOrder: ['index:25', 'index:27'],
				fields: {
					'index:27': { label: '创建时间' },
				},
			},
		},
	}
	const failingSessions = new Map([[failingSession.id, failingSession]])
	lifecycleSandbox.NC_BG_SESSION_LIFECYCLE.failSession(failingSession, '连续失败 3 次，任务终止。最后错误: 日期候选未归属。', failingSessions)
	if (
		failingSession.workflowState.search.phase !== 'failed' ||
		failingSession.workflowState.search.failedReason !== '连续失败 3 次，任务终止。最后错误: 日期候选未归属。' ||
		failingSession.workflowState.search.terminalReason !== '连续失败 3 次，任务终止。最后错误: 日期候选未归属。' ||
		failingSession.workflowState.search.terminalFieldKey !== 'index:27' ||
		failingSessions.has(failingSession.id)
	) {
		throw new Error(`failSession should persist terminal search workflow state before publishing, got ${JSON.stringify(failingSession.workflowState.search)}`)
	}
	const stoppedSession = {
		id: 'session-stop',
		status: 'running',
		task: '测试搜索区域每一个搜索项',
		activityText: '',
		traceItems: [],
		workflowState: {
			search: {
				phase: 'awaiting_submit',
				activeFieldKey: 'index:31',
				fieldOrder: ['index:31'],
			},
		},
	}
	const stoppedSessions = new Map([[stoppedSession.id, stoppedSession]])
	lifecycleSandbox.NC_BG_SESSION_LIFECYCLE.finalizeStoppedSession(stoppedSession, stoppedSessions)
	if (
		stoppedSession.status !== 'stopped' ||
		stoppedSession.workflowState.search.phase !== 'awaiting_submit' ||
		stoppedSession.workflowState.search.terminalReason !== '任务已中止。' ||
		stoppedSession.workflowState.search.failedReason
	) {
		throw new Error(`manual stop should keep search phase but persist terminal reason, got ${JSON.stringify(stoppedSession.workflowState.search)}`)
	}
	if (!published.some((message) => message?.payload?.resultSummary?.reason)) {
		throw new Error(`terminal workflow state should be available to published result summaries, got ${JSON.stringify(published)}`)
	}
}

function assertResultSummaryBehavior() {
	const background = read('naturalclick-extension/background.js')
	const lifecycle = read('naturalclick-extension/background/session-lifecycle.js')
	const sessionEngine = read('naturalclick-extension/background/session-engine.js')
	const sidepanel = read('naturalclick-extension/sidepanel.js')
	const sidepanelHtml = read('naturalclick-extension/sidepanel.html')
	const resultSummary = read('naturalclick-extension/background/result-summary.js')
	if (!background.includes("'background/result-summary.js'") || background.indexOf("'background/result-summary.js'") > background.indexOf("'background/session-lifecycle.js'")) {
		throw new Error('background should load result-summary before session-lifecycle publishes sessions')
	}
	if (!lifecycle.includes('buildSessionResultSummary(session)') || !lifecycle.includes('resultSummary: resultSummary || session.resultSummary || null')) {
		throw new Error('session lifecycle should publish a structured resultSummary with every session update')
	}
	if (!sessionEngine.includes('session.observedFieldInventory = buildObservedFieldInventory(observation.data)') || !sessionEngine.includes('function buildObservedFieldInventory')) {
		throw new Error('session engine should keep a compact field inventory so all-field test summaries can report untested observed controls')
	}
	for (const expected of [
		'resultSummary: null',
		'payload.resultSummary',
		'state.resultSummary',
		'hasPayloadResultSummary',
		"Object.prototype.hasOwnProperty.call(payload, 'resultSummary')",
		'renderResultSummaryCard',
		'renderResultDiagnostics',
		'renderResultDiagnosticGroup',
		'renderResultIssueLine',
		'groupResultDiagnostics',
		'isResultRecommendation',
		'buildHistoryResultPreview',
		'formatHistoryIssuePreview',
		'resolveSessionResultSummary',
		'buildFallbackResultSummary',
		'general_fallback',
			'fallback: true',
			'sp-result-source',
			'getResultSummarySourceLabel',
			'getResultSummaryExportSourceLine',
			'轨迹摘要',
			'总结异常',
			'来源：轨迹兜底摘要',
			'来源：总结异常兜底',
			'取值：',
			'依据说明：',
			'sp-result-item-summary',
			'sp-result-diagnostic-title',
			'sp-result-diagnostic-group',
			'recommendation',
		'sp-result-issue-summary',
		'sp-history-result',
			'resultSummary: cloneJson',
			'cleanupFailed',
			'cleanupUnverified',
			'verificationRecoveryIncomplete',
			'verificationRecoveryIncompleteCount',
			'contextRequestLimitCount',
			'isVerificationRecoveryIncompleteTrace',
			'isContextRequestLimitTrace',
			'isDateCandidateOwnershipTrace',
			"'cleanupUnverified', '清空未确认'",
			"'verificationRecoveryIncomplete', '校验恢复未完成'",
			"'terminalFailed', '终态异常'",
		"'modelErrors', '模型错误'",
		"'timeouts', '超时'",
		"'loopGuards', '循环保护'",
		"'verificationFailures', '校验失败'",
		'校验恢复未完成 ${Number(diagnostics.verificationRecoveryIncompleteCount)}',
		'上下文补证上限 ${Number(diagnostics.contextRequestLimitCount)}',
		"'skipped', '安全跳过'",
		"'recoveredFailures', '失败后成功'",
		"'retried', '重试'",
		'formatSessionExportText(payload)',
		'appendResultSummaryExport',
		'appendPlanItemsExport',
		'当前进度',
		'hasPersistableSessionPayload',
		'原始 JSON 附录',
		'字段/项目明细：',
		'安全跳过明细',
		'formatResultSkippedDetailExport',
		'JSON.stringify(sanitizedPayload, null, 2)',
		'sanitizeSessionExportPayload',
		'collectExportSensitiveValues',
		'redactExportValue',
		'extractSensitiveAssignments',
	]) {
		if (!sidepanel.includes(expected)) {
			throw new Error(`sidepanel should receive, render, persist, and export resultSummary: missing ${expected}`)
		}
	}
	if (sidepanel.includes('resultSummary: payload.resultSummary || state.resultSummary')) {
		throw new Error('sidepanel runtime updates must respect payload resultSummary=null instead of retaining stale summaries')
	}
	if (
		!/async function exportSessionToClipboard[\s\S]*copyText\(formatSessionExportText\(payload\)\)/.test(sidepanel) ||
		!/async function exportSessionToTxt[\s\S]*const text = formatSessionExportText\(payload\)/.test(sidepanel)
	) {
		throw new Error('sidepanel session copy/download should export a human-readable report with the structured JSON appendix')
	}
	if (
		!/function formatSessionExportText\(payload\)[\s\S]*const sanitizedPayload = sanitizeSessionExportPayload\(payload\)[\s\S]*appendResultSummaryExport\(lines, session\.resultSummary\)[\s\S]*appendPlanItemsExport\(lines, session\.planItems\)[\s\S]*JSON\.stringify\(sanitizedPayload, null, 2\)/.test(sidepanel) ||
		!/function buildExportFileName\(payload\)[\s\S]*sanitizeSessionExportPayload\(payload\)/.test(sidepanel)
	) {
		throw new Error('sidepanel exports and download filenames should use a sanitized session payload')
	}
	{
		const exportSandbox = {}
		for (const fn of [
			'cloneJson',
			'sanitizeSessionExportPayload',
			'collectExportSensitiveValues',
			'isExportSensitiveObject',
			'isExportSensitiveKey',
			'isExportSensitiveDescriptor',
			'extractSensitiveAssignments',
			'extractSensitiveObjectTextTokens',
			'pushSensitiveValue',
			'uniqueExportSensitiveValues',
			'redactExportValue',
			'redactExportText',
			'isLikelyUnseparatedSecretToken',
			'escapeRegExp',
			'clampText',
			'buildFallbackResultSummary',
			'pickFallbackResultIssue',
			'buildFallbackResultHeadline',
			'buildFallbackResultDiagnostics',
			'isVerificationRecoveryIncompleteTrace',
			'isContextRequestLimitTrace',
			'isDateCandidateOwnershipTrace',
			'getResultSummarySourceLabel',
			'getResultSummaryExportSourceLine',
			'formatResultSummaryItemExport',
			'buildExportFileName',
			'sanitizeFileName',
		]) {
			vm.runInNewContext(`${extractFunctionSource(sidepanel, fn)}\nglobalThis.${fn} = ${fn};`, exportSandbox)
		}
		exportSandbox.state = { status: 'error' }
		const rawPayload = {
			type: 'naturalclick_session_export',
			exportedAt: '2026-06-04T00:00:00.000Z',
			extensionVersion: '0.0.0-test',
			config: {
				textLLM: { apiKeyMasked: 'sk-abc***xyz(len:20)' },
			},
			session: {
				id: 'sess-1',
				task: '打开页面，账号 admin，密码 Secret987!，验证码 246810',
				latestTask: '测试登录密码输入框，密码 Secret987!',
				status: 'error',
				activityText: '提交失败，Secret987! 仍在表单中，验证码 246810 已过期。',
				traceItems: [
					{
						title: '动作执行',
						detail: 'password field inspected；已输入 Secret987!，验证码 246810。',
						action: {
							name: 'input_text',
							input: { index: 12, target_label: '登录密码', text: 'Secret987!', type: 'password' },
							output: '已输入 Secret987!。',
						},
					},
				],
				resultSummary: {
					headline: '输入框测试发现异常',
					reason: 'Secret987! 仍在表单中。',
					items: [{ label: '登录密码', value: 'Secret987!', summary: '密码 Secret987! 已写入。' }],
					skippedDetails: [{
						label: '登录密码',
						statusLabel: '未确认',
						summary: '字段跳过原因包含 Secret987! 但没有显式密码前缀。',
						basis: '最近输入值 Secret987!',
					}],
				},
				diagnostics: {
					lastError: { detail: '密码 Secret987! 导致提交失败。' },
				},
			},
		}
		const sanitized = exportSandbox.sanitizeSessionExportPayload(rawPayload)
		const text = JSON.stringify(sanitized)
		for (const secret of ['Secret987', '246810', 'sk-abc']) {
			if (text.includes(secret)) {
				throw new Error(`sanitized session export payload should not include raw secret ${secret}: ${text}`)
			}
		}
		if (
			sanitized.session.traceItems[0].action.input.text !== '已隐藏' ||
			sanitized.session.resultSummary.skippedDetails[0].summary.includes('Secret987') ||
			sanitized.session.resultSummary.skippedDetails[0].basis.includes('Secret987') ||
			!String(sanitized.session.latestTask || '').includes('登录密码输入框') ||
			!String(sanitized.session.traceItems[0].detail || '').includes('password field inspected') ||
			!String(sanitized.session.task || '').includes('密码 已隐藏') ||
			!String(sanitized.session.activityText || '').includes('验证码 已隐藏') ||
			sanitized.config.textLLM.apiKeyMasked !== '已隐藏'
		) {
			throw new Error(`sanitized session export payload should preserve structure while redacting values, got ${JSON.stringify(sanitized)}`)
		}
		const fileName = exportSandbox.buildExportFileName(rawPayload)
		if (fileName.includes('Secret987') || fileName.includes('246810')) {
			throw new Error(`export filename should be generated from sanitized task text, got ${fileName}`)
		}
		const fallbackSummary = exportSandbox.buildFallbackResultSummary(
			{
				status: 'error',
				task: '测试登录密码输入框',
				activityText: '提交失败，Secret987! 仍在表单中，验证码 246810 已过期。',
			},
			rawPayload.session.traceItems,
			{
				modelErrorCount: 1,
				lastError: { detail: 'password field inspected；密码 Secret987! 导致提交失败。' },
			},
			'验证码 246810 已过期。'
		)
		const fallbackText = JSON.stringify(fallbackSummary)
		if (fallbackText.includes('Secret987') || fallbackText.includes('246810')) {
			throw new Error(`fallback result summaries should redact raw secrets from issue/diagnostics: ${fallbackText}`)
		}
			if (
				!fallbackText.includes('password field inspected') ||
				!fallbackText.includes('已隐藏') ||
				fallbackSummary.status !== 'failed' ||
				!fallbackSummary.fallback
			) {
				throw new Error(`fallback result summaries should preserve useful context while redacting secrets, got ${fallbackText}`)
			}
			const recoveryTrace = {
				title: '步骤 3: 校验失败',
				detail: '动作校验失败: 点击后没有可见变化 | 恢复处理: 当前动作不支持视觉恢复。',
				action: {
					name: 'click_element_by_index.verify',
					output: '动作校验失败: 点击后没有可见变化 | 恢复处理: 当前动作不支持视觉恢复。',
				},
			}
				if (!exportSandbox.isVerificationRecoveryIncompleteTrace(recoveryTrace)) {
					throw new Error('fallback result diagnostics should recognize verification recovery failures from trace text')
				}
				const contextLimitTrace = {
					title: '规划进度',
					detail: '内部上下文请求次数达到上限，任务暂停以避免循环。最近阻塞原因：候选未能与目标字段建立稳定归属。',
					action: {
						name: 'done',
						input: {
							planning_context_limit: true,
							planning_context_diagnostic: '候选未能与目标字段建立稳定归属。',
						},
						output: '内部上下文请求次数达到上限，任务暂停以避免循环。',
					},
				}
				if (!exportSandbox.isContextRequestLimitTrace(contextLimitTrace)) {
					throw new Error('fallback result diagnostics should recognize planning context limit traces')
				}
				const dateOwnershipTrace = {
					title: '步骤 14: done',
					detail: '日期字段创建时间只有未归属到目标字段的诊断候选，不能直接选择。',
					action: {
						name: 'done',
						input: {
							text: '日期候选未归属目标字段。',
							workflow_result_summary: '当前只有未归属到目标字段的诊断候选，不能直接选择。',
						},
						output: '日期候选未归属目标字段。',
					},
				}
				if (!exportSandbox.isDateCandidateOwnershipTrace(dateOwnershipTrace)) {
					throw new Error('fallback result diagnostics should recognize date candidate ownership failures from trace text')
				}
				const recoveryFallback = exportSandbox.buildFallbackResultSummary(
					{
						status: 'completed',
					task: '执行通用页面任务',
					activityText: '任务完成。',
				},
				[recoveryTrace],
				{
					verificationFailureCount: 1,
					verificationRecoveryIncompleteCount: 1,
				},
				''
			)
			if (
				recoveryFallback.stats?.verificationRecoveryIncomplete !== 1 ||
				!String(recoveryFallback.headline || '').includes('校验恢复未完成 1 次') ||
				!recoveryFallback.diagnostics?.some((item) => item.kind === 'verification_recovery_incomplete') ||
				!recoveryFallback.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('不要重复同一失败动作'))
				) {
					throw new Error(`fallback result summaries should preserve incomplete verification recovery diagnostics, got ${JSON.stringify(recoveryFallback)}`)
				}
				const contextLimitFallback = exportSandbox.buildFallbackResultSummary(
					{
						status: 'error',
						task: '执行通用页面任务',
						activityText: '内部上下文请求次数达到上限，任务暂停以避免循环。',
					},
					[contextLimitTrace],
					{
						contextRequestLimitCount: 1,
					},
					'内部上下文请求次数达到上限，任务暂停以避免循环。'
				)
				if (
					contextLimitFallback.stats?.contextRequestLimit !== 1 ||
					!String(contextLimitFallback.headline || '').includes('上下文补证上限 1 次') ||
					!contextLimitFallback.diagnostics?.some((item) => item.kind === 'context_request_limit') ||
					!contextLimitFallback.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('最后的补充上下文'))
				) {
					throw new Error(`fallback result summaries should preserve context request limit diagnostics, got ${JSON.stringify(contextLimitFallback)}`)
				}
				const dateOwnershipFallback = exportSandbox.buildFallbackResultSummary(
					{
						status: 'error',
						task: '测试页面日期字段',
						activityText: '日期候选未归属目标字段。',
					},
					[dateOwnershipTrace],
					{
						dateCandidateOwnershipCount: 1,
					},
					'日期候选未归属目标字段。'
				)
				if (
					dateOwnershipFallback.stats?.dateCandidateOwnership !== 1 ||
					!String(dateOwnershipFallback.headline || '').includes('日期候选归属 1 次') ||
					!dateOwnershipFallback.diagnostics?.some((item) => item.kind === 'date_candidate_ownership') ||
					!dateOwnershipFallback.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('日期/时间选择器的弹层归属'))
				) {
					throw new Error(`fallback result summaries should preserve date candidate ownership diagnostics, got ${JSON.stringify(dateOwnershipFallback)}`)
				}
			if (
				exportSandbox.getResultSummarySourceLabel({ type: 'summary_error', fallback: true }) !== '总结异常' ||
				exportSandbox.getResultSummarySourceLabel({ type: 'general_fallback', fallback: true }) !== '轨迹摘要' ||
				exportSandbox.getResultSummarySourceLabel({ type: 'search_test', fallback: false }) !== '' ||
				!exportSandbox.getResultSummaryExportSourceLine({ type: 'summary_error', fallback: true }).includes('总结异常兜底') ||
				!exportSandbox.getResultSummaryExportSourceLine({ type: 'general_fallback', fallback: true }).includes('轨迹兜底摘要') ||
				!exportSandbox.formatResultSummaryItemExport({ label: '邮政编码', value: '111111', valueSourceLabel: '字段约束', basis: 'maxLength=6 pattern=\\d{6}' }).includes('取值=字段约束') ||
				!exportSandbox.formatResultSummaryItemExport({ label: '邮政编码', value: '111111', valueSourceLabel: '字段约束', basis: 'maxLength=6 pattern=\\d{6}' }).includes('依据说明=maxLength=6')
			) {
				throw new Error('result summary helpers should distinguish fallback sources and export field value evidence')
			}
		}
	if (
		!/async function persistSessionIfNeeded[\s\S]*hasPersistableSessionPayload\(\)/.test(sidepanel) ||
		!/function hasPersistableSessionPayload\(\)[\s\S]*state\.traceItems[\s\S]*state\.resultSummary[\s\S]*state\.planItems[\s\S]*return hasTraceItems \|\| hasResultSummary \|\| hasPlanItems/.test(sidepanel) ||
		!/async function persistSessionIfNeeded[\s\S]*const traceItems = \(Array\.isArray\(state\.traceItems\) \? state\.traceItems : \[\]\)\.slice\(-600\)[\s\S]*const diagnostics = buildSessionDiagnostics\(traceItems\)[\s\S]*const resultSummary = resolveSessionResultSummary\([\s\S]*resultSummary: cloneJson\(resultSummary \|\| null\)/.test(sidepanel)
	) {
		throw new Error('sidepanel should persist terminal sessions with real or fallback result summaries even if traceItems are empty')
	}
	if (
			!/function normalizeSessionSnapshot\(session, meta = \{\}\)[\s\S]*const diagnostics = buildSessionDiagnostics\(traceItems\)[\s\S]*const resultSummary = resolveSessionResultSummary\(session, traceItems, diagnostics, activityText\)[\s\S]*resultSummary,\s*diagnostics,/m.test(sidepanel) ||
			!/function buildFallbackResultSummary\(session, traceItems, diagnostics, activityText = ''\)[\s\S]*status === 'completed'[\s\S]*\? 'inconclusive'[\s\S]*type: 'general_fallback'[\s\S]*fallback: true/m.test(sidepanel) ||
			!/function appendResultSummaryExport[\s\S]*getResultSummaryExportSourceLine\(summary\)/.test(sidepanel)
		) {
			throw new Error('session snapshots should synthesize clearly marked fallback summaries without treating completed fallback records as passed')
		}
	for (const expected of ['sp-result-summary', 'sp-result-stats', 'sp-result-source', 'sp-result-item', 'sp-result-item-summary', 'sp-result-issues', 'sp-result-issue-summary', 'sp-result-diagnostics', 'sp-result-diagnostic', 'sp-result-diagnostic-group', 'sp-result-diagnostic-title', 'sp-history-result']) {
		if (!sidepanelHtml.includes(expected)) {
			throw new Error(`sidepanel should style result summary cards: missing ${expected}`)
		}
	}
	if (
		!/function renderResultDiagnostics\(diagnostics\)[\s\S]*groupResultDiagnostics\(diagnostics\)[\s\S]*renderResultDiagnosticGroup\(group\)/.test(sidepanel) ||
		!/function renderResultDiagnosticGroup\(group\)[\s\S]*group\?\.kind === 'recommendations'/.test(sidepanel) ||
		!/function appendResultSummaryExport\(lines, summary\)[\s\S]*for \(const group of groupResultDiagnostics\(summary\.diagnostics\)\)[\s\S]*lines\.push\(`\$\{group\.title\}：`\)/.test(sidepanel) ||
		!/function groupResultDiagnostics\(diagnostics\)[\s\S]*next_step_recommendation/.test(sidepanel)
	) {
		throw new Error('sidepanel should separate result diagnostics from next-step recommendations in cards and exports')
	}
		if (!/const sourceLabel = getResultSummarySourceLabel\(summary\)[\s\S]*source\.className = 'sp-result-source'[\s\S]*source\.textContent = sourceLabel/.test(sidepanel)) {
			throw new Error('result summary cards should visibly mark fallback summary sources by fallback type')
		}
	if (
		!/const resultPreview = buildHistoryResultPreview\(historyResultSummary\)/.test(sidepanel) ||
		!/const historyResultSummary = resolveSessionResultSummary\(/.test(sidepanel) ||
		!/renderResultSummaryCard\(\s*resolveSessionResultSummary\(session, traceItems, buildSessionDiagnostics\(traceItems\), String\(session\.activityText \|\| ''\)\)\s*\)/.test(sidepanel) ||
		!/function buildHistoryResultPreview\(summary\)[\s\S]*summary\.headline[\s\S]*summary\.reason[\s\S]*formatHistoryIssuePreview\(summary\.issues\)/.test(sidepanel) ||
		!/function formatHistoryIssuePreview\(issues\)[\s\S]*item\.summary/.test(sidepanel)
	) {
		throw new Error('history list/detail should show compact result previews from real or fallback summaries')
	}
	if (
		!/function renderResultIssueLine[\s\S]*issue\?\.summary[\s\S]*sp-result-issue-summary[\s\S]*clampText\(summary, 220\)/.test(sidepanel) ||
		!/issues\.slice\(0, 3\)\.forEach\(\(item\) => issueWrap\.appendChild\(renderResultIssueLine\(item\)\)\)/.test(sidepanel)
	) {
		throw new Error('sidepanel result summary cards should show each key issue summary, not only label and status')
	}
	if (
		!/summary\.skippedDetails[\s\S]*安全跳过明细[\s\S]*renderResultIssueLine/.test(sidepanel) ||
		!/function appendResultSummaryExport[\s\S]*summary\.skippedDetails[\s\S]*安全跳过明细/.test(sidepanel) ||
		!/function formatResultSkippedDetailExport[\s\S]*sourceLabel[\s\S]*basis[\s\S]*summary/.test(sidepanel)
	) {
		throw new Error('sidepanel result summary cards and exports should expose safe-skip details with reasons')
	}
		if (
			!/function renderResultStats[\s\S]*\['cleanupUnverified', '清空未确认'\][\s\S]*\['dateCandidateOwnership', '日期候选归属'\][\s\S]*\['contextRequestLimit', '上下文补证上限'\][\s\S]*\['verificationRecoveryIncomplete', '校验恢复未完成'\][\s\S]*\['terminalFailed', '终态异常'\]/.test(sidepanel) ||
			!/function formatResultSummaryStats[\s\S]*\['cleanupUnverified', '清空未确认'\][\s\S]*\['dateCandidateOwnership', '日期候选归属'\][\s\S]*\['contextRequestLimit', '上下文补证上限'\][\s\S]*\['verificationRecoveryIncomplete', '校验恢复未完成'\][\s\S]*\['terminalFailed', '终态异常'\][\s\S]*\['modelErrors', '模型错误'\][\s\S]*\['timeouts', '超时'\][\s\S]*\['loopGuards', '循环保护'\][\s\S]*\['verificationFailures', '校验失败'\]/.test(sidepanel)
		) {
			throw new Error('exported result summary stats should include terminal failure and fallback diagnostic counts')
		}
	if (!/function appendPlanItemsExport\(lines, planItems\)[\s\S]*normalizePlanItems\(planItems\)[\s\S]*当前进度[\s\S]*formatPlanStatus\(item\.status\)/.test(sidepanel)) {
		throw new Error('session exports should include persisted live plan/progress items for post-run debugging')
	}
	for (const expected of ['buildSearchResultSummary', 'buildFieldActionResultSummary', 'collectFieldActionSummaryItems', 'collectExpectedFieldActionCoverage', 'mergeFieldActionCoverageItems', 'field_action_coverage_incomplete', 'buildSearchSkippedDetails', 'resultsByKey', 'unknown_not_recorded', 'unknown_missing_sample', 'failed_terminal', 'missing_sample_evidence', 'date_candidate_ownership', 'dateCandidateOwnership', 'context_request_limit', 'contextRequestLimit', 'countGenericContextRequestLimit', 'isContextRequestLimitReason', 'verification_recovery_incomplete', 'verificationRecoveryIncomplete', 'countSearchVerificationRecoveryIncomplete', 'countFieldActionVerificationRecoveryIncomplete', 'hasVerificationRecoveryIncompleteDetail', 'task_terminal_failure', 'cleanup_unverified', 'field_action_failed', 'field_action_recovered_failure', 'next_step_recommendation', 'appendNextStepRecommendations', 'diagnostics', 'issues', 'skippedDetails', '搜索测试结果总结', '输入框测试结果总结', 'isSensitiveSearchSummaryField', 'collectSensitiveSearchSummaryValues', 'maskSensitiveValuesInText', 'maskSensitiveSearchSummaryText']) {
		if (!resultSummary.includes(expected)) {
			throw new Error(`result summary module should build structured search reports: missing ${expected}`)
		}
	}
	const sandbox = loadBackgroundModule('naturalclick-extension/background/result-summary.js')
	const summary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '日期候选未归属目标字段。',
		history: [],
		workflowState: {
			search: {
				phase: 'completed',
				terminalSuccess: false,
				terminalReason: '日期候选未归属目标字段。',
				fieldOrder: ['index:25', 'index:27', 'index:29'],
				completedKeys: ['index:25'],
				fields: {
					'index:25': { label: '销售姓名', lastTestValue: '管理员', lastValueSource: 'table_sample', lastValueBasis: '当前列表已有数据' },
					'index:27': { label: '创建时间', lastTestValue: '2026-06-01', lastValueSource: 'table_sample' },
					'index:29': { label: '客户等级' },
				},
				resultsByKey: {
					'index:25': {
						label: '销售姓名',
						value: '管理员',
						source: 'table_sample',
						status: 'passed_match',
						summary: '搜索结果观察：结果列表中仍能看到测试值 "管理员"。',
					},
					'index:27': {
						label: '创建时间',
						value: '2026-06-01',
						source: 'table_sample',
						status: 'failed_value_missing',
						summary: '搜索结果观察：结果列表有数据，但未确认测试值。',
					},
				},
			},
		},
	})
	if (
		summary?.type !== 'search_test' ||
		summary.title !== '搜索测试结果总结' ||
		summary.status !== 'failed' ||
		summary.stats?.total !== 3 ||
		summary.stats?.tested !== 2 ||
		summary.stats?.passed !== 1 ||
		summary.stats?.failed !== 1 ||
		summary.stats?.unknown !== 0 ||
		summary.stats?.remaining !== 1
	) {
		throw new Error(`search result summary should expose aggregate counts, got ${JSON.stringify(summary)}`)
	}
	if (
		!String(summary.headline || '').includes('搜索测试发现异常') ||
		!String(summary.text || '').includes('销售姓名：通过') ||
		!String(summary.text || '').includes('创建时间：失败：结果未包含测试值') ||
		!String(summary.text || '').includes('客户等级：未确认：缺少结果记录') ||
		!String(summary.text || '').includes('诊断：结果不匹配') ||
		!String(summary.text || '').includes('诊断：覆盖未完成') ||
		!String(summary.text || '').includes('建议：核对测试值来源') ||
		!summary.issues.some((item) => item.label === '创建时间') ||
		!summary.diagnostics?.some((item) => item.kind === 'value_missing') ||
		!summary.diagnostics?.some((item) => item.kind === 'coverage_incomplete') ||
		!summary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('搜索实现')) ||
		!summary.remaining.includes('客户等级')
	) {
		throw new Error(`search result summary should include user-readable field outcomes and issues, got ${JSON.stringify(summary)}`)
	}
	const sensitiveSearchSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'completed',
		history: [],
		workflowState: {
			search: {
				phase: 'completed',
				terminalSuccess: true,
				fieldOrder: ['index:35'],
				completedKeys: ['index:35'],
				fields: {
					'index:35': {
						label: '登录密码',
						fieldType: 'password',
						type: 'password',
						lastTestValue: 'Secret123!',
						lastValueSource: 'task_value',
						lastValueBasis: '用户明确指定搜索值 Secret123!',
					},
				},
				resultsByKey: {
					'index:35': {
						label: '登录密码',
						value: 'Secret123!',
						source: 'task_value',
						status: 'passed_match',
						summary: '搜索结果观察：结果列表中仍能看到测试值 "Secret123!"。',
					},
				},
			},
		},
	})
	if (
		sensitiveSearchSummary.status !== 'passed' ||
		sensitiveSearchSummary.items?.[0]?.value !== '已隐藏' ||
		sensitiveSearchSummary.items?.[0]?.sensitive !== true ||
		!String(sensitiveSearchSummary.text || '').includes('测试值=已隐藏') ||
		!String(sensitiveSearchSummary.items?.[0]?.basis || '').includes('已隐藏') ||
		String(sensitiveSearchSummary.text || '').includes('Secret123') ||
		String(sensitiveSearchSummary.items?.[0]?.summary || '').includes('Secret123') ||
		String(sensitiveSearchSummary.items?.[0]?.basis || '').includes('Secret123') ||
		String(sensitiveSearchSummary.issues?.[0]?.summary || '').includes('Secret123') ||
		JSON.stringify(sensitiveSearchSummary).includes('Secret123')
	) {
		throw new Error(`search result summary should hide sensitive search values in structured items and text, got ${JSON.stringify(sensitiveSearchSummary)}`)
	}
	const sensitiveTerminalSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '搜索值 Secret123! 触发接口超时。',
		history: [],
		workflowState: {
			search: {
				phase: 'failed',
				terminalFieldKey: 'index:35',
				terminalReason: '搜索值 Secret123! 触发接口超时。',
				fieldOrder: ['index:35'],
				completedKeys: [],
				fields: {
					'index:35': {
						label: '登录密码',
						fieldType: 'password',
						type: 'password',
						lastTestValue: 'Secret123!',
						lastValueSource: 'task_value',
					},
				},
				resultsByKey: {},
			},
		},
	})
	if (
		sensitiveTerminalSummary.status !== 'failed' ||
		sensitiveTerminalSummary.reason !== '搜索值 已隐藏 触发接口超时。' ||
		sensitiveTerminalSummary.items?.[0]?.value !== '已隐藏' ||
		!String(sensitiveTerminalSummary.text || '').includes('停止原因：搜索值 已隐藏 触发接口超时。') ||
		!String(sensitiveTerminalSummary.text || '').includes('该字段测试终止：搜索值 已隐藏 触发接口超时。') ||
		!sensitiveTerminalSummary.diagnostics?.some((item) => item.kind === 'task_terminal_failure' && String(item.text || '').includes('已隐藏')) ||
		String(sensitiveTerminalSummary.text || '').includes('Secret123') ||
		String(sensitiveTerminalSummary.reason || '').includes('Secret123') ||
		String(sensitiveTerminalSummary.diagnostics?.map((item) => item.text).join('\n') || '').includes('Secret123') ||
		String(sensitiveTerminalSummary.issues?.map((item) => item.summary).join('\n') || '').includes('Secret123')
	) {
		throw new Error(`search result summary should mask sensitive values in terminal reasons and diagnostics, got ${JSON.stringify(sensitiveTerminalSummary)}`)
	}
	const cleanupSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		history: [],
		workflowState: {
			search: {
				phase: 'failed',
				failedReason: '搜索重置失败：搜索重置后已知筛选字段仍未清空',
				activeFieldKey: 'index:27',
				lastSearchedFieldKey: 'index:27',
				fieldOrder: ['index:27'],
				completedKeys: [],
				fields: {
					'index:27': { label: '创建时间', lastTestValue: '2026-06-01', lastValueSource: 'table_sample' },
				},
				resultsByKey: {
					'index:27': {
						label: '创建时间',
						value: '2026-06-01',
						source: 'table_sample',
						status: 'unknown_result_pending',
						summary: '搜索结果观察：已提交测试值，等待提交后列表观察确认。',
					},
				},
			},
		},
	})
	if (
		cleanupSummary.status !== 'failed' ||
		cleanupSummary.stats?.unknown !== 1 ||
		cleanupSummary.stats?.remaining !== 0 ||
		cleanupSummary.stats?.cleanupFailed !== 1 ||
		cleanupSummary.items?.[0]?.clearStatus !== 'cleanup_failed' ||
		!String(cleanupSummary.text || '').includes('清空=清空失败') ||
		!String(cleanupSummary.text || '').includes('诊断：清空/重置异常') ||
		!String(cleanupSummary.text || '').includes('诊断：结果待确认') ||
		!String(cleanupSummary.text || '').includes('建议：优先复查清空/重置按钮识别') ||
		!cleanupSummary.diagnostics?.some((item) => item.kind === 'cleanup_failed') ||
		!cleanupSummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('残留条件')) ||
		!cleanupSummary.issues?.some((item) => item.clearStatus === 'cleanup_failed')
	) {
		throw new Error(`search result summary should separate cleanup failures from untested fields, got ${JSON.stringify(cleanupSummary)}`)
	}
	const cleanupUnverifiedSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'completed',
		history: [],
		workflowState: {
			search: {
				phase: 'completed',
				terminalSuccess: true,
				fieldOrder: ['index:25'],
				completedKeys: ['index:25'],
				resetCompletedKeys: [],
				fields: {
					'index:25': { label: '销售姓名', lastTestValue: '管理员', lastValueSource: 'table_sample' },
				},
				resultsByKey: {
					'index:25': {
						label: '销售姓名',
						value: '管理员',
						source: 'table_sample',
						status: 'passed_match',
						summary: '搜索结果观察：结果列表中仍能看到测试值 "管理员"。',
					},
				},
			},
		},
	})
	if (
		cleanupUnverifiedSummary.status !== 'inconclusive' ||
		cleanupUnverifiedSummary.stats?.cleanupUnverified !== 1 ||
		cleanupUnverifiedSummary.items?.[0]?.clearStatus !== 'pending_or_unverified' ||
		cleanupUnverifiedSummary.items?.[0]?.clearStatusLabel !== '未确认清空' ||
		!String(cleanupUnverifiedSummary.headline || '').includes('清空未确认 1 项') ||
		!String(cleanupUnverifiedSummary.text || '').includes('清空=未确认清空') ||
		!String(cleanupUnverifiedSummary.text || '').includes('诊断：清空待确认') ||
		!cleanupUnverifiedSummary.diagnostics?.some((item) => item.kind === 'cleanup_unverified') ||
		!cleanupUnverifiedSummary.issues?.some((item) => item.clearStatus === 'pending_or_unverified' && String(item.summary || '').includes('清空未确认')) ||
		cleanupUnverifiedSummary.diagnostics?.some((item) => item.kind === 'evidence_complete')
		) {
			throw new Error(`search result summary should use resetCompletedKeys as cleanup evidence, got ${JSON.stringify(cleanupUnverifiedSummary)}`)
		}
		const searchVerificationRecoverySummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
			status: 'error',
			activityText: '动作校验失败: 动作结果: no_effect progress=false | 恢复处理: 当前动作不支持视觉恢复。',
			history: [],
			workflowState: {
				search: {
					phase: 'submit_search',
					activeFieldKey: 'index:25',
					terminalSuccess: false,
					terminalReason: '动作校验失败: 动作结果: no_effect progress=false | 恢复处理: 当前动作不支持视觉恢复。',
					fieldOrder: ['index:25'],
					completedKeys: [],
					fields: {
						'index:25': { label: '搜索条件', lastTestValue: 'Alpha', lastValueSource: 'table_sample' },
					},
					resultsByKey: {},
				},
			},
		})
		if (
			searchVerificationRecoverySummary.status !== 'failed' ||
			searchVerificationRecoverySummary.stats?.verificationRecoveryIncomplete !== 1 ||
			searchVerificationRecoverySummary.items?.[0]?.statusCode !== 'failed_terminal' ||
			!String(searchVerificationRecoverySummary.headline || '').includes('校验恢复未完成 1 项') ||
			!searchVerificationRecoverySummary.diagnostics?.some((item) => item.kind === 'verification_recovery_incomplete') ||
			!searchVerificationRecoverySummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('不要重复同一失败动作')) ||
			!String(searchVerificationRecoverySummary.text || '').includes('校验恢复未完成')
		) {
			throw new Error(`search summaries should promote skipped/failed verification recovery into diagnostics, got ${JSON.stringify(searchVerificationRecoverySummary)}`)
		}
		const missingEvidenceSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
			status: 'error',
			history: [],
		workflowState: {
			search: {
				phase: 'completed',
				terminalSuccess: false,
				terminalFieldKey: 'index:31',
				terminalReason: '搜索字段 "资料名称" 当前没有可用列表样本或任务显式值，继续使用泛化测试词容易得到空结果，已停止以避免无意义测试。',
				fieldOrder: ['index:31'],
				completedKeys: [],
				fields: {
					'index:31': { label: '资料名称' },
				},
				resultsByKey: {},
			},
		},
	})
	if (
		missingEvidenceSummary.status !== 'inconclusive' ||
		missingEvidenceSummary.stats?.skipped !== 1 ||
		missingEvidenceSummary.stats?.remaining !== 0 ||
		missingEvidenceSummary.items?.[0]?.statusCode !== 'unknown_missing_sample' ||
		!String(missingEvidenceSummary.headline || '').includes('安全跳过 1 项') ||
		!String(missingEvidenceSummary.text || '').includes('资料名称：未确认：缺少真实样本/候选证据') ||
		!String(missingEvidenceSummary.text || '').includes('该字段未安全测试') ||
		!String(missingEvidenceSummary.text || '').includes('已安全跳过，未填写随机值') ||
		!String(missingEvidenceSummary.text || '').includes('建议：先观察列表/表格真实样本') ||
		String(missingEvidenceSummary.text || '').includes('已停止以避免随机搜索') ||
		!missingEvidenceSummary.skipped?.includes('资料名称') ||
		missingEvidenceSummary.skippedDetails?.[0]?.label !== '资料名称' ||
		!String(missingEvidenceSummary.skippedDetails?.[0]?.summary || '').includes('没有可用列表样本') ||
		missingEvidenceSummary.skippedDetails?.[0]?.statusLabel !== '未确认：缺少真实样本/候选证据' ||
		missingEvidenceSummary.remaining?.includes('资料名称') ||
		!missingEvidenceSummary.diagnostics?.some((item) => item.kind === 'missing_sample_evidence') ||
		!missingEvidenceSummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('不随机填写')) ||
		missingEvidenceSummary.diagnostics?.some((item) => item.kind === 'coverage_incomplete')
	) {
		throw new Error(`search result summary should explain missing evidence as a deliberate safe stop, got ${JSON.stringify(missingEvidenceSummary)}`)
	}
	const diagnosticCandidateSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '本地上下文补充后仍缺证据：未观测到真实候选：当前只有未归属到目标字段的诊断候选，不能直接选择。',
		history: [],
		workflowState: {
			search: {
				phase: 'completed',
				terminalSuccess: false,
				terminalFieldKey: 'index:27',
				terminalReason: '本地上下文补充后仍缺证据：未观测到真实候选：当前只有未归属到目标字段的诊断候选，不能直接选择。',
				fieldOrder: ['index:27'],
				completedKeys: [],
				fields: {
					'index:27': { label: '创建时间', lastTestValue: '2026-06-01', lastValueSource: 'table_sample' },
				},
				resultsByKey: {},
			},
		},
	})
	if (
		diagnosticCandidateSummary.status !== 'inconclusive' ||
		diagnosticCandidateSummary.stats?.skipped !== 1 ||
		diagnosticCandidateSummary.stats?.failed !== 0 ||
		diagnosticCandidateSummary.stats?.dateCandidateOwnership !== 1 ||
		!String(diagnosticCandidateSummary.headline || '').includes('日期候选归属 1 项') ||
		diagnosticCandidateSummary.items?.[0]?.statusCode !== 'unknown_missing_sample' ||
		!String(diagnosticCandidateSummary.text || '').includes('创建时间：未确认：缺少真实样本/候选证据') ||
		!String(diagnosticCandidateSummary.text || '').includes('诊断候选') ||
		!diagnosticCandidateSummary.diagnostics?.some((item) => item.kind === 'missing_sample_evidence') ||
		!diagnosticCandidateSummary.diagnostics?.some((item) => item.kind === 'date_candidate_ownership' && String(item.text || '').includes('日期/时间候选归属不足')) ||
		!diagnosticCandidateSummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('日期/时间选择器的弹层归属')) ||
		diagnosticCandidateSummary.diagnostics?.some((item) => item.kind === 'task_terminal_failure')
	) {
		throw new Error(`search result summary should classify diagnostic/unowned date candidates as missing evidence rather than terminal failure, got ${JSON.stringify(diagnosticCandidateSummary)}`)
	}
	const fieldExternalCandidateSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '未在目标字段范围内找到可见下拉选项，但页面存在字段外可见候选。global_popup_diagnostic；不要直接选择字段外候选。',
		history: [],
		workflowState: {
			search: {
				phase: 'completed',
				terminalSuccess: false,
				terminalFieldKey: 'index:27',
				terminalReason: '未在目标字段范围内找到可见下拉选项，但页面存在字段外可见候选。global_popup_diagnostic；不要直接选择字段外候选。',
				fieldOrder: ['index:27'],
				completedKeys: [],
				fields: {
					'index:27': { label: '创建时间', lastTestValue: '2026-06-01', lastValueSource: 'table_sample' },
				},
				resultsByKey: {},
			},
		},
	})
	if (
		fieldExternalCandidateSummary.status !== 'inconclusive' ||
		fieldExternalCandidateSummary.stats?.skipped !== 1 ||
		fieldExternalCandidateSummary.stats?.failed !== 0 ||
		fieldExternalCandidateSummary.stats?.dateCandidateOwnership !== 1 ||
		fieldExternalCandidateSummary.items?.[0]?.statusCode !== 'unknown_missing_sample' ||
		!String(fieldExternalCandidateSummary.text || '').includes('字段外可见候选') ||
		!fieldExternalCandidateSummary.diagnostics?.some((item) => item.kind === 'missing_sample_evidence') ||
		!fieldExternalCandidateSummary.diagnostics?.some((item) => item.kind === 'date_candidate_ownership') ||
		fieldExternalCandidateSummary.diagnostics?.some((item) => item.kind === 'task_terminal_failure')
	) {
		throw new Error(`search result summary should classify field-external candidate diagnostics as missing evidence rather than terminal failure, got ${JSON.stringify(fieldExternalCandidateSummary)}`)
	}
	const recordedSkipSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'completed',
		history: [],
		workflowState: {
			search: {
				phase: 'completed',
				terminalSuccess: false,
				fieldOrder: ['index:31'],
				completedKeys: [],
				skippedKeys: ['index:31'],
				fields: {
					'index:31': { label: '资料名称' },
				},
				resultsByKey: {
					'index:31': {
						label: '资料名称',
						value: '',
						source: 'missing_sample',
						status: 'unknown_missing_sample',
						summary: '该字段缺少真实列表样本，已安全跳过。',
					},
				},
			},
		},
	})
	if (
		recordedSkipSummary.stats?.tested !== 0 ||
		recordedSkipSummary.stats?.skipped !== 1 ||
		recordedSkipSummary.stats?.remaining !== 0 ||
		recordedSkipSummary.items?.[0]?.recorded !== false ||
		recordedSkipSummary.items?.[0]?.clearStatus !== 'not_applicable' ||
		!String(recordedSkipSummary.text || '').includes('清空=无需清空')
	) {
		throw new Error(`recorded safe skips should not be counted as tested results, got ${JSON.stringify(recordedSkipSummary)}`)
	}
	const contextLimitSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '内部上下文请求次数达到上限，任务暂停以避免循环。',
		history: [
			{
				action: 'done',
				input: { success: false, text: '内部上下文请求次数达到上限，任务暂停以避免循环。' },
				success: false,
				output: '内部上下文请求次数达到上限，任务暂停以避免循环。 | 动作结果: no_effect progress=false reason="内部 ReAct 上下文请求次数达到上限。"',
			},
		],
		workflowState: {
			search: {
				phase: 'select_field',
				activeFieldKey: 'index:27',
				fieldOrder: ['index:25', 'index:27'],
				completedKeys: ['index:25'],
				fields: {
					'index:25': { label: '销售姓名', lastTestValue: '管理员', lastValueSource: 'table_sample' },
					'index:27': { label: '创建时间', lastTestValue: '2026-06-01', lastValueSource: 'table_sample' },
				},
				resultsByKey: {
					'index:25': {
						label: '销售姓名',
						value: '管理员',
						source: 'table_sample',
						status: 'passed_match',
						summary: '搜索结果观察：结果列表中仍能看到测试值 "管理员"。',
					},
				},
			},
		},
	})
	if (
		contextLimitSummary.type !== 'search_test' ||
		contextLimitSummary.stats?.passed !== 1 ||
			contextLimitSummary.stats?.failed !== 1 ||
			contextLimitSummary.stats?.tested !== 2 ||
			contextLimitSummary.stats?.remaining !== 0 ||
			contextLimitSummary.stats?.contextRequestLimit !== 1 ||
			!String(contextLimitSummary.headline || '').includes('上下文补证上限 1 项') ||
			!String(contextLimitSummary.text || '').includes('停止原因：内部上下文请求次数达到上限') ||
		!String(contextLimitSummary.text || '').includes('创建时间：失败：任务终止') ||
		!String(contextLimitSummary.text || '').includes('该字段测试终止：内部上下文请求次数达到上限') ||
		!String(contextLimitSummary.text || '').includes('诊断：上下文补证达到上限') ||
		!String(contextLimitSummary.text || '').includes('不要继续等待同一轮模型') ||
		!String(contextLimitSummary.text || '').includes('建议：先处理终止原因中的最后失败动作') ||
		!contextLimitSummary.issues?.some((item) => item.label === '创建时间') ||
		!contextLimitSummary.diagnostics?.some((item) => item.kind === 'context_request_limit' && String(item.text || '').includes('request_context/request_options_for')) ||
		!contextLimitSummary.diagnostics?.some((item) => item.kind === 'task_terminal_failure') ||
		!contextLimitSummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('补充上下文')) ||
		!contextLimitSummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('对应字段')) ||
		contextLimitSummary.diagnostics?.some((item) => item.kind === 'coverage_incomplete')
	) {
		throw new Error(`search result summary should preserve session-level terminal failures such as context request limits, got ${JSON.stringify(contextLimitSummary)}`)
	}
	const fieldActionSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'completed',
		task: '测试页面每一个输入框是否正常',
		latestTask: '测试页面每一个输入框是否正常',
		history: [
			{
				action: 'input_text',
				input: { index: 11, target_label: '用户名', text: 'admin' },
				success: true,
				output: '已输入 admin。 | 动作结果: input_verified',
				outcome: { kind: 'input_verified', reason: '字段值已更新。' },
			},
			{
				action: 'input_text',
				input: { index: 12, target_label: '登录密码', text: '123456', type: 'password' },
				success: false,
				output: '输入失败：123456 未写入，目标不可编辑。',
				outcome: { kind: 'semantic_action_failed', reason: '密码 123456 未写入，目标不可编辑。' },
			},
			{
				action: 'input_text',
				input: { index: 12, target_label: '登录密码', text: '654321', type: 'password' },
				success: true,
				output: '已输入 654321。 | 动作结果: input_verified',
				outcome: { kind: 'input_verified', reason: '第二次输入 654321 已验证。' },
			},
		],
	})
	if (
		fieldActionSummary?.type !== 'field_actions' ||
		fieldActionSummary.title !== '输入框测试结果总结' ||
		fieldActionSummary.status !== 'inconclusive' ||
		fieldActionSummary.stats?.total !== 2 ||
		fieldActionSummary.stats?.tested !== 2 ||
		fieldActionSummary.stats?.passed !== 2 ||
		fieldActionSummary.stats?.failed !== 0 ||
		fieldActionSummary.stats?.retried !== 1 ||
		fieldActionSummary.stats?.recoveredFailures !== 1 ||
		fieldActionSummary.items?.[1]?.attempts !== 2 ||
		fieldActionSummary.items?.[1]?.failedAttempts !== 1 ||
		fieldActionSummary.items?.[1]?.value !== '已隐藏' ||
		fieldActionSummary.items?.[0]?.sourceTitle !== '动作' ||
		!String(fieldActionSummary.headline || '').includes('失败后成功 1 项') ||
		!String(fieldActionSummary.headline || '').includes('重试 1 项') ||
		!String(fieldActionSummary.text || '').includes('用户名：通过') ||
		!String(fieldActionSummary.text || '').includes('登录密码：通过') ||
		!String(fieldActionSummary.text || '').includes('尝试=2') ||
		!String(fieldActionSummary.text || '').includes('已隐藏') ||
		String(fieldActionSummary.text || '').includes('123456') ||
		String(fieldActionSummary.text || '').includes('654321') ||
		String(fieldActionSummary.items?.[1]?.summary || '').includes('123456') ||
		String(fieldActionSummary.items?.[1]?.summary || '').includes('654321') ||
		String(fieldActionSummary.issues?.map((item) => item.summary).join('\n') || '').includes('654321') ||
		!String(fieldActionSummary.text || '').includes('建议：关注重试字段') ||
		!fieldActionSummary.issues?.some((item) => item.label === '登录密码') ||
		!fieldActionSummary.diagnostics?.some((item) => item.kind === 'field_action_recovered_failure') ||
		!fieldActionSummary.diagnostics?.some((item) => item.kind === 'field_action_retried') ||
		!fieldActionSummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('定位漂移'))
		) {
			throw new Error(`field action result summary should report input-box outcomes with retries and hidden sensitive values, got ${JSON.stringify(fieldActionSummary)}`)
		}
		const constrainedFieldActionSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
			status: 'completed',
			task: '测试页面每一个输入框是否正常',
			latestTask: '测试页面每一个输入框是否正常',
			history: [
				{
					action: 'input_text',
					input: {
						index: 17,
						target_label: '邮政编码',
						text: '111111',
						workflow: 'field-test',
						workflow_step: 'test_input_field',
						workflow_field_key: 'index:17',
						workflow_field_label: '邮政编码',
						workflow_test_value: '111111',
						workflow_value_source: 'type_constraints',
						workflow_value_basis: 'maxLength=6 pattern=\\d{6} digits=6',
					},
					success: true,
					output: '已输入 111111。 | 动作结果: input_verified',
					outcome: { kind: 'input_verified', reason: '字段值已更新。' },
				},
			],
		})
		if (
			constrainedFieldActionSummary?.type !== 'field_actions' ||
			constrainedFieldActionSummary.items?.[0]?.valueSource !== 'type_constraints' ||
			constrainedFieldActionSummary.items?.[0]?.valueSourceLabel !== '字段约束' ||
			!String(constrainedFieldActionSummary.items?.[0]?.basis || '').includes('maxLength=6') ||
			!String(constrainedFieldActionSummary.text || '').includes('依据=字段约束/maxLength=6') ||
			!String(constrainedFieldActionSummary.text || '').includes('pattern=\\d{6}')
		) {
			throw new Error(`field action summaries should preserve constraint-aware value evidence, got ${JSON.stringify(constrainedFieldActionSummary)}`)
		}
		const fieldCoverageSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'completed',
		task: '测试页面每一个输入框是否正常',
		latestTask: '测试页面每一个输入框是否正常',
			observedFieldInventory: [
				{ key: 'index:1', index: 1, label: '请输入搜索内容', kind: 'input', fieldType: 'search', region: 'header' },
				{ key: 'index:11', index: 11, label: '用户名', kind: 'input', fieldType: 'text' },
				{ key: 'index:12', index: 12, label: '登录密码', kind: 'input', fieldType: 'password' },
				{ key: 'index:13', index: 13, label: '联系邮箱', kind: 'input', fieldType: 'email' },
				{ key: 'index:14', index: 14, label: '状态', kind: 'selection', fieldType: 'select' },
				{ key: 'index:15', index: 15, label: '验证码', kind: 'input', fieldType: 'text', region: 'content' },
				{ key: 'index:16', index: 16, label: '前往页码', kind: 'input', fieldType: 'number', region: 'pagination' },
			],
		history: [
			{
				action: 'input_text',
				input: { index: 11, target_label: '用户名', text: 'admin' },
				success: true,
				output: '已输入 admin。 | 动作结果: input_verified',
				outcome: { kind: 'input_verified', reason: '字段值已更新。' },
			},
		],
	})
	if (
		fieldCoverageSummary?.type !== 'field_actions' ||
		fieldCoverageSummary.title !== '输入框测试结果总结' ||
		fieldCoverageSummary.status !== 'inconclusive' ||
		fieldCoverageSummary.stats?.total !== 3 ||
		fieldCoverageSummary.stats?.tested !== 1 ||
		fieldCoverageSummary.stats?.passed !== 1 ||
		fieldCoverageSummary.stats?.unknown !== 2 ||
		fieldCoverageSummary.stats?.remaining !== 2 ||
		fieldCoverageSummary.items?.length !== 3 ||
		fieldCoverageSummary.items?.[1]?.label !== '登录密码' ||
		fieldCoverageSummary.items?.[1]?.recorded !== false ||
		fieldCoverageSummary.items?.[1]?.statusLabel !== '未测试' ||
		fieldCoverageSummary.remaining?.join('|') !== '登录密码|联系邮箱' ||
		!String(fieldCoverageSummary.headline || '').includes('未测试 2 项') ||
		!String(fieldCoverageSummary.text || '').includes('登录密码：未测试') ||
		!String(fieldCoverageSummary.text || '').includes('联系邮箱：未测试') ||
			!String(fieldCoverageSummary.text || '').includes('字段覆盖未完成') ||
			!fieldCoverageSummary.diagnostics?.some((item) => item.kind === 'field_action_coverage_incomplete') ||
			!fieldCoverageSummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('未测试字段')) ||
			fieldCoverageSummary.items?.some((item) => ['状态', '验证码', '请输入搜索内容', '前往页码'].includes(item.label))
		) {
		throw new Error(`input-box result summary should use observed field inventory to report untested inputs, got ${JSON.stringify(fieldCoverageSummary)}`)
	}
	const sensitiveTerminalFieldActionSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '提交失败，Secret987! 仍在表单中。',
		task: '测试页面每一个输入框是否正常',
		latestTask: '测试页面每一个输入框是否正常',
		history: [
			{
				action: 'input_text',
				input: { index: 12, target_label: '登录密码', text: 'Secret987!', type: 'password' },
				success: true,
				output: '已输入 Secret987!。 | 动作结果: input_verified',
				outcome: { kind: 'input_verified', reason: '密码 Secret987! 已写入。' },
			},
			{
				action: 'done',
				input: { success: false, text: '提交失败，Secret987! 仍在表单中。' },
				success: false,
				output: '提交失败，Secret987! 仍在表单中。',
				outcome: { kind: 'no_effect', reason: '提交失败，Secret987! 仍在表单中。' },
			},
		],
	})
	if (
		sensitiveTerminalFieldActionSummary.status !== 'failed' ||
		sensitiveTerminalFieldActionSummary.items?.[0]?.value !== '已隐藏' ||
		!String(sensitiveTerminalFieldActionSummary.text || '').includes('提交失败，已隐藏 仍在表单中') ||
		String(sensitiveTerminalFieldActionSummary.text || '').includes('Secret987') ||
		String(sensitiveTerminalFieldActionSummary.issues?.map((item) => item.summary).join('\n') || '').includes('Secret987') ||
		String(sensitiveTerminalFieldActionSummary.diagnostics?.map((item) => item.text).join('\n') || '').includes('Secret987')
	) {
		throw new Error(`field action result summary should mask sensitive values in item summaries and terminal issues, got ${JSON.stringify(sensitiveTerminalFieldActionSummary)}`)
	}
	const terminalFailedFieldActionSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '提交按钮未找到，任务无法继续。',
		task: '测试页面每一个输入框是否正常',
		latestTask: '测试页面每一个输入框是否正常',
		history: [
			{
				action: 'input_text',
				input: { index: 11, target_label: '用户名', text: 'admin' },
				success: true,
				output: '已输入 admin。 | 动作结果: input_verified',
				outcome: { kind: 'input_verified', reason: '字段值已更新。' },
			},
			{
				action: 'done',
				input: { success: false, text: '提交按钮未找到，任务无法继续。' },
				success: false,
				output: '提交按钮未找到，任务无法继续。',
				outcome: { kind: 'no_effect', reason: '提交按钮未找到。' },
			},
		],
	})
	if (
		terminalFailedFieldActionSummary?.type !== 'field_actions' ||
		terminalFailedFieldActionSummary.status !== 'failed' ||
		terminalFailedFieldActionSummary.stats?.terminalFailed !== 1 ||
		!String(terminalFailedFieldActionSummary.headline || '').includes('终态异常 1 项') ||
		!terminalFailedFieldActionSummary.diagnostics?.some((item) => item.kind === 'task_terminal_failure') ||
		terminalFailedFieldActionSummary.issues?.[0]?.label !== '任务终态' ||
		!String(terminalFailedFieldActionSummary.text || '').includes('任务终态异常') ||
		!String(terminalFailedFieldActionSummary.text || '').includes('建议：先解决任务终态异常')
	) {
		throw new Error(`field action summary should not report passed when the task ends with a non-field failure, got ${JSON.stringify(terminalFailedFieldActionSummary)}`)
	}
	const preActionInputFailureSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '无法定位任何可测试输入框。',
		task: '测试页面每一个输入框是否正常',
		latestTask: '测试页面每一个输入框是否正常',
		history: [
			{
				action: 'done',
				input: { success: false, text: '无法定位任何可测试输入框。' },
				success: false,
				output: '无法定位任何可测试输入框。',
				outcome: { kind: 'no_effect', reason: '没有发现输入框候选。' },
			},
		],
	})
	if (
		preActionInputFailureSummary?.type !== 'field_actions' ||
		preActionInputFailureSummary.title !== '输入框测试结果总结' ||
		preActionInputFailureSummary.status !== 'failed' ||
		preActionInputFailureSummary.stats?.total !== 0 ||
		preActionInputFailureSummary.stats?.tested !== 0 ||
		preActionInputFailureSummary.stats?.terminalFailed !== 1 ||
		!String(preActionInputFailureSummary.headline || '').includes('终态异常 1 项') ||
		!preActionInputFailureSummary.diagnostics?.some((item) => item.kind === 'task_terminal_failure') ||
		!preActionInputFailureSummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('完整测试结论')) ||
		preActionInputFailureSummary.issues?.[0]?.label !== '任务终态'
		) {
			throw new Error(`input-box test should still produce a field-action summary when it fails before any field action, got ${JSON.stringify(preActionInputFailureSummary)}`)
		}
		const fieldVerificationRecoverySummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
			status: 'error',
			activityText: '动作校验失败: 字段值没有变化 | 恢复处理: 当前动作不支持视觉恢复。',
			task: '测试页面每一个输入框是否正常',
			latestTask: '测试页面每一个输入框是否正常',
			history: [
				{
					action: 'input_text',
					input: { index: 18, target_label: '搜索条件', text: 'Alpha' },
					success: false,
					output: '动作校验失败: 字段值没有变化 | 恢复处理: 当前动作不支持视觉恢复。',
					outcome: { kind: 'no_effect', reason: '字段值没有变化。' },
				},
			],
		})
		if (
			fieldVerificationRecoverySummary?.type !== 'field_actions' ||
			fieldVerificationRecoverySummary.status !== 'failed' ||
			fieldVerificationRecoverySummary.stats?.verificationRecoveryIncomplete !== 1 ||
			!String(fieldVerificationRecoverySummary.headline || '').includes('校验恢复未完成 1 项') ||
			!fieldVerificationRecoverySummary.diagnostics?.some((item) => item.kind === 'verification_recovery_incomplete') ||
			!fieldVerificationRecoverySummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('不要重复同一失败字段动作')) ||
			!String(fieldVerificationRecoverySummary.text || '').includes('校验恢复未完成')
		) {
			throw new Error(`field action summaries should promote skipped/failed verification recovery into diagnostics, got ${JSON.stringify(fieldVerificationRecoverySummary)}`)
		}
		const genericNavigationFailureSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
			status: 'error',
			activityText: '目标页面无法打开。',
		task: '打开目标页面',
		latestTask: '打开目标页面',
		history: [
			{
				action: 'done',
				input: { success: false, text: '目标页面无法打开。' },
				success: false,
				output: '目标页面无法打开。',
			},
		],
	})
	if (genericNavigationFailureSummary?.type === 'field_actions') {
		throw new Error(`non-field terminal tasks should keep the generic result summary, got ${JSON.stringify(genericNavigationFailureSummary)}`)
	}
	if (
		!genericNavigationFailureSummary?.diagnostics?.some((item) => item.kind === 'next_step_recommendation') ||
		!String(genericNavigationFailureSummary.text || '').includes('建议：优先查看最后失败动作')
	) {
		throw new Error(`generic result summaries should include actionable next-step recommendations, got ${JSON.stringify(genericNavigationFailureSummary)}`)
	}
	const toggleFieldActionSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'completed',
		task: '测试页面开关和单选控件是否正常',
		latestTask: '测试页面开关和单选控件是否正常',
		history: [
			{
				action: 'click_element_by_index',
				input: { index: 21, target_label: '启用通知开关' },
				success: true,
				output: '已点击启用通知开关。 | 动作结果: state_changed',
				outcome: { kind: 'state_changed', reason: '开关状态已改变。' },
			},
			{
				action: 'click_element_by_index',
				input: { index: 30, target_label: '提交' },
				success: true,
				output: '已点击提交。 | 动作结果: dom_changed',
				outcome: { kind: 'dom_changed', reason: '表单已提交。' },
			},
		],
	})
	if (
		toggleFieldActionSummary?.type !== 'field_actions' ||
		toggleFieldActionSummary.stats?.total !== 1 ||
		toggleFieldActionSummary.items?.[0]?.label !== '启用通知开关' ||
		toggleFieldActionSummary.items?.[0]?.sourceLabel !== '点击/切换控件' ||
		!String(toggleFieldActionSummary.text || '').includes('启用通知开关：通过') ||
		String(toggleFieldActionSummary.text || '').includes('提交：通过')
	) {
		throw new Error(`field action summary should include toggle-like clicks without counting ordinary command buttons, got ${JSON.stringify(toggleFieldActionSummary)}`)
	}
	const dropdownProbeSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'completed',
		task: '测试页面每一个下拉选择器是否正常',
		latestTask: '测试页面每一个下拉选择器是否正常',
		history: [
			{
				action: 'open_dropdown',
				input: { index: 41, target_label: '状态' },
				success: true,
				output: '已展开下拉框索引 41。 当前候选: 启用、禁用 | 动作结果: options_visible progress=true candidates="启用|禁用"',
				outcome: { kind: 'options_visible', visibleOptions: ['启用', '禁用'], reason: '候选已显示。' },
			},
		],
	})
	if (
		dropdownProbeSummary?.type !== 'field_actions' ||
		dropdownProbeSummary.stats?.total !== 1 ||
		dropdownProbeSummary.items?.[0]?.label !== '状态' ||
		dropdownProbeSummary.items?.[0]?.sourceLabel !== '展开候选' ||
		dropdownProbeSummary.items?.[0]?.value !== '候选 2 项' ||
		!String(dropdownProbeSummary.text || '').includes('状态：通过')
	) {
		throw new Error(`field action summary should report successful dropdown probes with candidate counts, got ${JSON.stringify(dropdownProbeSummary)}`)
	}
	const dropdownThenSelectSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'completed',
		task: '测试页面每一个下拉选择器是否正常',
		latestTask: '测试页面每一个下拉选择器是否正常',
		history: [
			{
				action: 'open_dropdown',
				input: { index: 41, target_label: '状态' },
				success: true,
				output: '已展开下拉框索引 41。 当前候选: 启用、禁用 | 动作结果: options_visible progress=true candidates="启用|禁用"',
				outcome: { kind: 'options_visible', visibleOptions: ['启用', '禁用'], reason: '候选已显示。' },
			},
			{
				action: 'choose_dropdown_option',
				input: { index: 41, target_label: '状态', text: '启用' },
				success: true,
				output: '已选择下拉选项 "启用"。 | 动作结果: value_changed',
				outcome: { kind: 'value_changed', reason: '字段值已更新。' },
			},
		],
	})
	if (
		dropdownThenSelectSummary?.type !== 'field_actions' ||
		dropdownThenSelectSummary.stats?.total !== 1 ||
		dropdownThenSelectSummary.items?.[0]?.sourceLabel !== '选择候选' ||
		dropdownThenSelectSummary.items?.[0]?.value !== '启用' ||
		dropdownThenSelectSummary.items?.[0]?.attempts !== 1 ||
		String(dropdownThenSelectSummary.text || '').includes('动作=展开候选')
	) {
		throw new Error(`field action summary should avoid double-counting dropdown probes once the same field is selected, got ${JSON.stringify(dropdownThenSelectSummary)}`)
	}
	const editCascaderSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		task: '编辑一下客户所在地，修改为江苏省，南京市，江宁区',
		latestTask: '编辑一下客户所在地，修改为江苏省，南京市，江宁区',
		history: [
			{
				action: 'select_cascader_path',
				input: { index: 10, target_label: '客户所在地', path: ['江苏省', '南京市', '江宁区'] },
				success: false,
				output: '级联选择失败：未找到第 2 级选项 "南京市"。',
				outcome: { kind: 'failed', reason: '级联选择失败：未找到第 2 级选项 "南京市"。' },
			},
		],
	})
	if (
		editCascaderSummary?.type !== 'field_actions' ||
		!String(editCascaderSummary.headline || '').includes('字段操作发现异常') ||
		String(editCascaderSummary.headline || '').includes('字段测试') ||
		!String(editCascaderSummary.text || '').includes('客户所在地：失败')
	) {
		throw new Error(`edit field action summary should not use the testing headline, got ${JSON.stringify(editCascaderSummary)}`)
	}
	const generic = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '最后动作失败。',
		history: [
			{ action: 'click_element_by_index', success: true, output: 'ok' },
			{ action: 'done', success: false, output: '最后动作失败。' },
		],
	})
		if (generic?.type !== 'general' || !String(generic.headline || '').includes('任务未完成') || !generic.issues.length) {
			throw new Error(`generic result summary should cover non-search tasks, got ${JSON.stringify(generic)}`)
		}
		const genericVerificationRecoverySummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
			status: 'error',
			activityText: '动作校验失败: 点击后没有可见变化 | 恢复处理: 当前动作不支持视觉恢复。',
			history: [
				{
					action: 'click_element_by_index',
					input: { index: 6, target_label: '打开' },
					success: false,
					output: '动作校验失败: 点击后没有可见变化 | 恢复处理: 当前动作不支持视觉恢复。',
					outcome: { kind: 'no_effect', reason: '点击后没有可见变化。' },
				},
			],
		})
		if (
			genericVerificationRecoverySummary?.type !== 'general' ||
			genericVerificationRecoverySummary.stats?.verificationRecoveryIncomplete !== 1 ||
			!genericVerificationRecoverySummary.diagnostics?.some((item) => item.kind === 'verification_recovery_incomplete') ||
			!genericVerificationRecoverySummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('不要重复同一失败动作')) ||
			!String(genericVerificationRecoverySummary.text || '').includes('校验恢复未完成')
			) {
				throw new Error(`generic summaries should promote skipped/failed verification recovery into diagnostics, got ${JSON.stringify(genericVerificationRecoverySummary)}`)
			}
			const genericContextLimitSummary = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
				status: 'error',
				activityText: '内部上下文请求次数达到上限，任务暂停以避免循环。',
				history: [
					{
						action: 'done',
						input: {
							success: false,
							text: '内部上下文请求次数达到上限，任务暂停以避免循环。',
							planning_context_limit: true,
							planning_context_diagnostic: '候选未能与目标字段建立稳定归属。',
						},
						success: false,
						output: '内部上下文请求次数达到上限，任务暂停以避免循环。',
						outcome: { kind: 'no_effect', reason: '内部 ReAct 上下文请求次数达到上限。' },
					},
				],
			})
			if (
				genericContextLimitSummary?.type !== 'general' ||
				genericContextLimitSummary.stats?.contextRequestLimit !== 1 ||
				!String(genericContextLimitSummary.headline || '').includes('上下文补证上限 1 个') ||
				!genericContextLimitSummary.diagnostics?.some((item) => item.kind === 'context_request_limit') ||
				!genericContextLimitSummary.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('最后的补充上下文'))
			) {
				throw new Error(`generic summaries should preserve context request limit diagnostics, got ${JSON.stringify(genericContextLimitSummary)}`)
			}
			const genericRecovered = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
				status: 'completed',
		activityText: '任务完成。',
		history: [
			{ action: 'click_element_by_index', input: { index: 2, target_label: '打开菜单' }, success: false, output: '索引 2 点击未生效。 | 动作结果: no_effect progress=false' },
			{ action: 'click_element_by_index', input: { index: 3, target_label: '打开菜单' }, success: true, output: '已点击打开菜单。 | 动作结果: dom_changed progress=true' },
			{ action: 'done', input: { text: '任务完成', success: true }, success: true, output: '任务完成。' },
		],
	})
	if (
		genericRecovered?.type !== 'general' ||
		genericRecovered.status !== 'inconclusive' ||
		genericRecovered.stats?.recoveredFailures !== 1 ||
		!String(genericRecovered.headline || '').includes('存在恢复记录') ||
		!String(genericRecovered.text || '').includes('失败后成功') ||
		!String(genericRecovered.text || '').includes('恢复记录') ||
		!genericRecovered.diagnostics?.some((item) => item.kind === 'recovered_action_failure') ||
		!genericRecovered.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('确认恢复不是偶然通过')) ||
		!genericRecovered.issues?.some((item) => item.label === '恢复记录')
		) {
			throw new Error(`generic completed tasks with recovered failures should not be reported as clean pass, got ${JSON.stringify(genericRecovered)}`)
		}
		const genericRecoveredWithIncompleteRecovery = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
			status: 'completed',
			activityText: '任务完成。',
			history: [
				{
					action: 'click_element_by_index',
					input: { index: 2, target_label: '打开菜单' },
					success: false,
					output: '动作校验失败: 点击后没有可见变化 | 恢复处理: 当前动作不支持视觉恢复。',
					outcome: { kind: 'no_effect', progress: false, reason: '点击后没有可见变化。' },
				},
				{ action: 'click_element_by_index', input: { index: 3, target_label: '打开菜单' }, success: true, output: '已点击打开菜单。 | 动作结果: dom_changed progress=true' },
				{ action: 'done', input: { text: '任务完成', success: true }, success: true, output: '任务完成。' },
			],
		})
		if (
			genericRecoveredWithIncompleteRecovery?.type !== 'general' ||
			genericRecoveredWithIncompleteRecovery.status !== 'inconclusive' ||
			genericRecoveredWithIncompleteRecovery.stats?.recoveredFailures !== 1 ||
			genericRecoveredWithIncompleteRecovery.stats?.verificationRecoveryIncomplete !== 1 ||
			!String(genericRecoveredWithIncompleteRecovery.headline || '').includes('校验恢复未完成 1 个') ||
			!genericRecoveredWithIncompleteRecovery.diagnostics?.some((item) => item.kind === 'recovered_action_failure') ||
			!genericRecoveredWithIncompleteRecovery.diagnostics?.some((item) => item.kind === 'verification_recovery_incomplete') ||
			!genericRecoveredWithIncompleteRecovery.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('确认恢复不是偶然通过')) ||
			!genericRecoveredWithIncompleteRecovery.diagnostics?.some((item) => item.kind === 'next_step_recommendation' && String(item.text || '').includes('不要重复同一失败动作'))
		) {
			throw new Error(`generic completed tasks should preserve both recovered-failure and incomplete-recovery diagnostics, got ${JSON.stringify(genericRecoveredWithIncompleteRecovery)}`)
		}
		const genericVerifiedAfterFailure = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
			status: 'completed',
		activityText: '任务完成。',
		history: [
			{
				action: 'click_element_by_index',
				input: { index: 8, target_label: '确认' },
				success: true,
				verifiedAfterFailure: true,
				output: '动作执行超时。 | 观察复核成功: 页面已经出现目标结果 | 动作结果: dom_changed progress=true',
				outcome: { kind: 'dom_changed', progress: true, reason: '页面已经出现目标结果' },
			},
			{ action: 'done', input: { text: '任务完成', success: true }, success: true, output: '任务完成。' },
		],
	})
	if (
		genericVerifiedAfterFailure?.type !== 'general' ||
		genericVerifiedAfterFailure.status !== 'inconclusive' ||
		genericVerifiedAfterFailure.stats?.failed !== 0 ||
		genericVerifiedAfterFailure.stats?.verifiedAfterFailure !== 1 ||
		genericVerifiedAfterFailure.stats?.recoveredFailures !== 1 ||
		!String(genericVerifiedAfterFailure.headline || '').includes('失败后复核 1 个') ||
		!String(genericVerifiedAfterFailure.text || '').includes('复核确认') ||
		!genericVerifiedAfterFailure.diagnostics?.some((item) => item.kind === 'recovered_action_failure')
	) {
		throw new Error(`generic completed tasks verified after failed execution should preserve recovered-risk evidence, got ${JSON.stringify(genericVerifiedAfterFailure)}`)
	}
	const genericPreActionFailure = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'error',
		activityText: '无法读取页面状态：目标标签页不可访问。',
		history: [],
	})
	if (
		genericPreActionFailure?.type !== 'general' ||
		genericPreActionFailure.status !== 'failed' ||
		genericPreActionFailure.stats?.terminalFailed !== 1 ||
		genericPreActionFailure.issues?.[0]?.label !== '最后问题' ||
		!String(genericPreActionFailure.text || '').includes('最后问题：无法读取页面状态') ||
		!genericPreActionFailure.diagnostics?.some((item) => item.kind === 'task_terminal_failure')
	) {
		throw new Error(`generic summary should preserve terminal activityText before any action history exists, got ${JSON.stringify(genericPreActionFailure)}`)
	}
	const genericStopped = sandbox.NC_BG_RESULT_SUMMARY.buildResultSummary({
		status: 'stopped',
		activityText: '任务已中止。',
		history: [],
	})
	if (
		genericStopped?.type !== 'general' ||
		genericStopped.status !== 'stopped' ||
		genericStopped.stats?.terminalFailed !== 0 ||
		genericStopped.issues?.[0]?.label !== '终止原因' ||
		!genericStopped.diagnostics?.some((item) => item.kind === 'task_stopped') ||
		!String(genericStopped.text || '').includes('终止原因：任务已中止。')
	) {
		throw new Error(`generic stopped summary should preserve stop reason without marking it as a terminal failure, got ${JSON.stringify(genericStopped)}`)
	}
}

function assertResultSummaryFailureFallbackPublished() {
	const published = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/session-lifecycle.js', {
		NC_BG_CONSTANTS: {
			MAX_TRACE_ITEMS: 80,
			TYPES: { SESSION_UPDATE: 'NC_SESSION_UPDATE' },
		},
		NC_BG_UTILS: { generateId: (prefix) => `${prefix || 'id'}_${published.length}` },
		NC_BG_RESULT_SUMMARY: {
			buildResultSummary: () => {
				throw new TypeError('summary renderer exploded while counting fields')
			},
		},
		chrome: {
			runtime: {
				sendMessage: (message, callback) => {
					published.push(message)
					callback?.()
				},
				lastError: null,
			},
		},
	})
	const session = {
		id: 'summary-fallback-session',
		status: 'completed',
		task: '测试页面每一个输入框',
		activityText: '任务已完成。',
		currentTabId: 1,
		traceItems: [],
		planItems: [],
		resultSummary: {
			type: 'stale',
			title: '旧总结',
			status: 'passed',
			headline: '旧结果不应继续展示。',
		},
		history: [
			{ action: 'input_text', input: { index: 11, target_label: '名称', text: 'NaturalClickTest' }, success: true },
			{ action: 'input_text', input: { index: 12, target_label: '邮箱', text: 'bad' }, success: false },
		],
	}
	sandbox.NC_BG_SESSION_LIFECYCLE.publishSession(session)
	const summary = published[0]?.payload?.resultSummary
	if (
		summary?.type !== 'summary_error' ||
		summary.title !== '结果总结生成异常' ||
		summary.status !== 'inconclusive' ||
		summary.fallback !== true ||
		summary.stats?.total !== 2 ||
		summary.stats?.completed !== 1 ||
		summary.stats?.failed !== 1 ||
		!String(summary.reason || '').includes('TypeError: summary renderer exploded') ||
		!summary.diagnostics?.some((item) => item.kind === 'summary_generation_failed') ||
		!summary.diagnostics?.some((item) => item.kind === 'next_step_recommendation') ||
		!String(summary.text || '').includes('任务轨迹仍可用于判断执行过程') ||
		String(summary.headline || '').includes('旧结果') ||
		session.resultSummary?.type !== 'summary_error'
	) {
		throw new Error(`session lifecycle should publish a structured fallback when result summary generation throws, got published=${JSON.stringify(published)} session=${JSON.stringify(session)}`)
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
	if (!plannerContext.includes('scoreHitStateForRanking') || !plannerContext.includes("state === 'covered'") || !plannerContext.includes("region === 'popover'")) {
		throw new Error('planner context ranking should prioritize current popup/dialog items and downrank covered targets')
	}
	if (!plannerContext.includes('NC_CONTROL_SEMANTICS')) {
		throw new Error('planner context should use shared option-field geometry scoring')
	}
	if (!plannerContext.includes('classifyInvalidActionInput') || !plannerContext.includes('failure_kind="${classified.kind}"') || !plannerContext.includes('下一步建议')) {
		throw new Error('planner context should classify invalid action inputs and provide model-visible recovery guidance')
	}
	if (
		!plannerContext.includes('unowned_selection_candidate') ||
		!plannerContext.includes('scoped="field"') ||
		!plannerContext.includes('scoped="explicit"') ||
		!plannerContext.includes('diagnostic_options') ||
		!plannerContext.includes('diagnostic_popups')
	) {
		throw new Error('planner context should give specific recovery guidance for unowned diagnostic option/date candidates')
	}
	if (
		!plannerContext.includes('repeat_selection_attempt') ||
		!plannerContext.includes('禁止重复同一个 requested') ||
		!plannerContext.includes('不要重复只展开同一字段') ||
		!plannerContext.includes('历史/outcome 中的 candidates')
	) {
		throw new Error('planner context should give specific recovery guidance for repeated failed selection/open attempts')
	}
	if (
		!plannerContext.includes('missing_action_context') ||
		!plannerContext.includes('不要只换 index 或盲目重试') ||
		!plannerContext.includes('target_description') ||
		!plannerContext.includes('reason 或 purpose')
	) {
		throw new Error('planner context should give specific recovery guidance for missing semantic action context')
	}
	if (
		!plannerContext.includes('declared_target_mismatch') ||
		!plannerContext.includes('声明目标和实际 index/tab_id 指向对象冲突') ||
		!plannerContext.includes('不要为了通过校验') ||
		!plannerContext.includes('tabsSummary')
	) {
		throw new Error('planner context should give specific recovery guidance for declared target/index or tab mismatches')
	}
	if (
		!plannerContext.includes('selection_bypass_attempt') ||
		!plannerContext.includes('不要用普通点击或视觉定位直接点候选') ||
		!plannerContext.includes('必须保留目标字段范围') ||
		!plannerContext.includes('select_cascader_path')
	) {
		throw new Error('planner context should give specific recovery guidance when model tries to bypass field-scoped selection tools')
	}
	if (
		!plannerContext.includes('missing_required_parameter') ||
		!plannerContext.includes('补齐当前工具的必填参数') ||
		!plannerContext.includes('级联选择要给 path 数组') ||
		!plannerContext.includes('缺少\\s*(?:非空')
	) {
		throw new Error('planner context should classify missing required tool parameters separately from selection bypass attempts')
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
	if (!validation.includes('validateIndexHitState') || !validation.includes('hitBlocker') || !validation.includes("hitState || ''")) {
		throw new Error('planner validation should reject covered hit-test targets before executing page actions')
	}
	if (!validation.includes('validateDirectClickTarget') || !validation.includes('不能用普通点击绕过字段归属校验')) {
		throw new Error('planner validation should reject direct clicks on selection candidates before executing page actions')
	}
	if (!validation.includes('validateVisionSelectionDescription') || !validation.includes('不能用视觉定位绕过字段归属校验')) {
		throw new Error('planner validation should reject visual option-description clicks before executing page actions')
	}
}

function assertPlannerRejectsCoveredIndexTargets() {
	const sandbox = loadBackgroundModule('naturalclick-extension/background/planner-validation.js', {
		NC_BG_PLANNER_CONTEXT: {
			shortText: (value, maxLen) => {
				const text = String(value || '')
				return text.length > maxLen ? text.slice(0, maxLen) : text
			},
			findObservedIndexMatches: (observation, index) => {
				const matches = []
				const push = (source, item) => {
					if (item && Number(item.index) === Number(index)) matches.push({ source, item })
				}
				for (const item of (Array.isArray(observation?.elements) ? observation.elements : [])) push('elements', item)
				for (const form of (Array.isArray(observation?.forms) ? observation.forms : [])) {
					for (const field of (Array.isArray(form?.fields) ? form.fields : [])) push(`forms:${form?.id || '-'}`, field)
				}
				for (const item of (Array.isArray(observation?.actions) ? observation.actions : [])) push('actions', item)
				for (const item of (Array.isArray(observation?.options) ? observation.options : [])) push('options', item)
				for (const item of (Array.isArray(observation?.popups) ? observation.popups : [])) push('popups', item)
				return matches
			},
		},
	})
	const validation = sandbox.NC_BG_PLANNER_VALIDATION
	const coveredObservation = {
		forms: [
			{
				id: 'filter',
				fields: [
					{
						index: 28,
						label: '创建时间',
						role: 'textbox',
						editable: true,
						hitState: 'covered',
						hitPoints: '0/5',
						hitRatio: 0,
						hitBlocker: 'div role=dialog text=日期选择器 class=calendar-panel',
					},
				],
			},
		],
	}
	const inputError = validation.validateExecutableAction(
		{ name: 'input_text', input: { index: 28, text: '2026-06-01', target_label: '创建时间' } },
		coveredObservation,
		[]
	)
	if (!String(inputError || '').includes('当前被遮挡') || !String(inputError || '').includes('日期选择器')) {
		throw new Error(`covered input targets should be rejected with blocker guidance, got ${inputError}`)
	}
	const clickError = validation.validateExecutableAction(
		{ name: 'click_element_by_index', input: { index: 28 } },
		coveredObservation,
		[]
	)
	if (!String(clickError || '').includes('当前被遮挡')) {
		throw new Error(`covered click targets should be rejected before execution, got ${clickError}`)
	}
	const partialObservation = {
		actions: [
			{
				index: 31,
				label: '搜索',
				role: 'button',
				hitState: 'partial',
				hitPoints: '2/5',
				hitRatio: 0.4,
			},
		],
	}
	const missingTargetLabelError = validation.validateExecutableAction(
		{ name: 'click_element_by_index', input: { index: 31 } },
		partialObservation,
		[]
	)
	if (!String(missingTargetLabelError || '').includes('缺少 target_label') || !String(missingTargetLabelError || '').includes('只给 index')) {
		throw new Error(`click actions should declare target_label before execution, got ${missingTargetLabelError}`)
	}
	const mismatchedClickAliasError = validation.validateExecutableAction(
		{ name: 'click_element_by_index', input: { index: 31, label: '重置' } },
		partialObservation,
		[]
	)
	if (!String(mismatchedClickAliasError || '').includes('声明 label="重置"') || !String(mismatchedClickAliasError || '').includes('搜索')) {
		throw new Error(`click label aliases should be validated against observed labels, got ${mismatchedClickAliasError}`)
	}
	const matchedClickAliasError = validation.validateExecutableAction(
		{ name: 'click_element_by_index', input: { index: 31, label: '搜索' } },
		partialObservation,
		[]
	)
	if (matchedClickAliasError) {
		throw new Error(`matching click label aliases should remain executable, got ${matchedClickAliasError}`)
	}
	const missingHoverTargetLabelError = validation.validateExecutableAction(
		{ name: 'hover_element_by_index', input: { index: 31 } },
		partialObservation,
		[]
	)
	if (!String(missingHoverTargetLabelError || '').includes('缺少 target_label') || !String(missingHoverTargetLabelError || '').includes('悬浮目标说明')) {
		throw new Error(`hover actions should declare target_label before execution, got ${missingHoverTargetLabelError}`)
	}
	const mismatchedHoverTargetLabelError = validation.validateExecutableAction(
		{ name: 'hover_element_by_index', input: { index: 31, target_label: '重置' } },
		partialObservation,
		[]
	)
	if (!String(mismatchedHoverTargetLabelError || '').includes('声明 target_label="重置"') || !String(mismatchedHoverTargetLabelError || '').includes('搜索')) {
		throw new Error(`hover target labels should be validated against observed labels, got ${mismatchedHoverTargetLabelError}`)
	}
	const matchedHoverTargetLabelError = validation.validateExecutableAction(
		{ name: 'hover_element_by_index', input: { index: 31, target_label: '搜索' } },
		partialObservation,
		[]
	)
	if (matchedHoverTargetLabelError) {
		throw new Error(`matching hover target labels should remain executable, got ${matchedHoverTargetLabelError}`)
	}
	const pageScrollError = validation.validateExecutableAction(
		{ name: 'scroll', input: { down: true } },
		partialObservation,
		[]
	)
	if (pageScrollError) {
		throw new Error(`page-level scroll without index should remain executable, got ${pageScrollError}`)
	}
	const missingScrollTargetLabelError = validation.validateExecutableAction(
		{ name: 'scroll', input: { index: 31, down: true } },
		partialObservation,
		[]
	)
	if (!String(missingScrollTargetLabelError || '').includes('指定了 index=31') || !String(missingScrollTargetLabelError || '').includes('滚动容器目标说明')) {
		throw new Error(`indexed scroll actions should declare target_label before execution, got ${missingScrollTargetLabelError}`)
	}
	const mismatchedScrollTargetLabelError = validation.validateExecutableAction(
		{ name: 'scroll_horizontally', input: { index: 31, right: true, target_label: '重置' } },
		partialObservation,
		[]
	)
	if (!String(mismatchedScrollTargetLabelError || '').includes('声明 target_label="重置"') || !String(mismatchedScrollTargetLabelError || '').includes('搜索')) {
		throw new Error(`indexed scroll target labels should be validated against observed labels, got ${mismatchedScrollTargetLabelError}`)
	}
	const matchedScrollTargetLabelError = validation.validateExecutableAction(
		{ name: 'scroll_horizontally', input: { index: 31, right: true, target_label: '搜索' } },
		partialObservation,
		[]
	)
	if (matchedScrollTargetLabelError) {
		throw new Error(`matching indexed scroll target labels should remain executable, got ${matchedScrollTargetLabelError}`)
	}
	const missingKeypressKeyError = validation.validateExecutableAction(
		{ name: 'keypress', input: { target_label: '搜索框' } },
		partialObservation,
		[]
	)
	if (!String(missingKeypressKeyError || '').includes('缺少 key')) {
		throw new Error(`keypress should require an explicit key, got ${missingKeypressKeyError}`)
	}
	const missingKeypressIntentError = validation.validateExecutableAction(
		{ name: 'keypress', input: { key: 'Enter' } },
		partialObservation,
		[]
	)
	if (!String(missingKeypressIntentError || '').includes('缺少 target_label/reason') || !String(missingKeypressIntentError || '').includes('盲按键')) {
		throw new Error(`bare keypress actions should declare a target or purpose before execution, got ${missingKeypressIntentError}`)
	}
	const labelledKeypressError = validation.validateExecutableAction(
		{ name: 'keypress', input: { key: 'Enter', target_label: '搜索框', reason: '提交当前搜索' } },
		partialObservation,
		[]
	)
	if (labelledKeypressError) {
		throw new Error(`keypress with a declared focus target should remain executable, got ${labelledKeypressError}`)
	}
	const reasonedKeypressError = validation.validateExecutableAction(
		{ name: 'keypress', input: { key: 'Escape', reason: '关闭当前弹层' } },
		partialObservation,
		[]
	)
	if (reasonedKeypressError) {
		throw new Error(`keypress with a declared purpose should remain executable when no stable index exists, got ${reasonedKeypressError}`)
	}
	const missingWaitReasonError = validation.validateExecutableAction(
		{ name: 'wait', input: { ms: 300 } },
		partialObservation,
		[]
	)
	if (!String(missingWaitReasonError || '').includes('wait 缺少 reason') || !String(missingWaitReasonError || '').includes('正在等待什么')) {
		throw new Error(`wait should require a reason before delaying execution, got ${missingWaitReasonError}`)
	}
	const reasonedWaitError = validation.validateExecutableAction(
		{ name: 'wait', input: { ms: 300, reason: '等待候选弹层出现' } },
		partialObservation,
		[]
	)
	if (reasonedWaitError) {
		throw new Error(`wait with a declared reason should remain executable, got ${reasonedWaitError}`)
	}
	const missingAskUserReasonError = validation.validateExecutableAction(
		{ name: 'ask_user', input: { question: '请输入验证码' } },
		partialObservation,
		[]
	)
	if (!String(missingAskUserReasonError || '').includes('ask_user 缺少 reason') || !String(missingAskUserReasonError || '').includes('用户介入')) {
		throw new Error(`ask_user should require a reason before interrupting the user, got ${missingAskUserReasonError}`)
	}
	const reasonedAskUserError = validation.validateExecutableAction(
		{ name: 'ask_user', input: { question: '请输入验证码', reason: '当前页面需要验证码才能继续登录' } },
		partialObservation,
		[]
	)
	if (reasonedAskUserError) {
		throw new Error(`ask_user with declared reason should remain executable, got ${reasonedAskUserError}`)
	}
	const missingOpenTabTargetError = validation.validateExecutableAction(
		{ name: 'open_new_tab', input: { url: 'http://example.test/app' } },
		partialObservation,
		[]
	)
	if (!String(missingOpenTabTargetError || '').includes('缺少 target_label') || !String(missingOpenTabTargetError || '').includes('浏览器上下文')) {
		throw new Error(`open_new_tab should declare a target label before browser navigation, got ${missingOpenTabTargetError}`)
	}
	const labelledOpenTabError = validation.validateExecutableAction(
		{ name: 'open_new_tab', input: { url: 'http://example.test/app', target_label: '任务目标页面', reason: '打开任务目标 URL' } },
		partialObservation,
		[]
	)
	if (labelledOpenTabError) {
		throw new Error(`open_new_tab with declared target context should remain executable, got ${labelledOpenTabError}`)
	}
	const tabSummary = [
		{ id: 12, title: '任务目标页面', url: 'http://example.test/app#/current', current: false },
		{ id: 13, title: '其他页面', url: 'http://example.test/other', current: false },
	]
	const missingSwitchTabTargetError = validation.validateExecutableAction(
		{ name: 'switch_to_tab', input: { tab_id: 12 } },
		partialObservation,
		tabSummary
	)
	if (!String(missingSwitchTabTargetError || '').includes('缺少 target_label') || !String(missingSwitchTabTargetError || '').includes('tab_id')) {
		throw new Error(`switch_to_tab should declare target tab context, got ${missingSwitchTabTargetError}`)
	}
	const mismatchedSwitchTabUrlError = validation.validateExecutableAction(
		{ name: 'switch_to_tab', input: { tab_id: 13, target_label: '任务目标页面', target_url: 'http://example.test/app' } },
		partialObservation,
		tabSummary
	)
	if (!String(mismatchedSwitchTabUrlError || '').includes('声明 target_url') || !String(mismatchedSwitchTabUrlError || '').includes('http://example.test/other')) {
		throw new Error(`switch_to_tab should reject mismatched target_url, got ${mismatchedSwitchTabUrlError}`)
	}
	const matchedSwitchTabUrlError = validation.validateExecutableAction(
		{ name: 'switch_to_tab', input: { tab_id: 12, target_label: '任务目标页面', target_url: 'http://example.test/app' } },
		partialObservation,
		tabSummary
	)
	if (matchedSwitchTabUrlError) {
		throw new Error(`switch_to_tab with matching target tab context should remain executable, got ${matchedSwitchTabUrlError}`)
	}
	const missingCloseTabReasonError = validation.validateExecutableAction(
		{ name: 'close_tab', input: { tab_id: 12, target_label: '任务目标页面' } },
		partialObservation,
		tabSummary
	)
	if (!String(missingCloseTabReasonError || '').includes('缺少 reason') || !String(missingCloseTabReasonError || '').includes('关闭标签页')) {
		throw new Error(`close_tab should require a reason before closing browser context, got ${missingCloseTabReasonError}`)
	}
	const reasonedCloseTabError = validation.validateExecutableAction(
		{ name: 'close_tab', input: { tab_id: 12, target_label: '任务目标页面', target_url: 'http://example.test/app', reason: '关闭重复打开的目标页' } },
		partialObservation,
		tabSummary
	)
	if (reasonedCloseTabError) {
		throw new Error(`close_tab with declared target and reason should remain executable, got ${reasonedCloseTabError}`)
	}
	const inputObservation = {
		forms: [
			{
				id: 'filter',
				fields: [
					{
						index: 32,
						label: '关键字',
						role: 'textbox',
						fieldType: 'search',
						editable: true,
						hitState: 'hittable',
						hitPoints: '5/5',
					},
					{
						index: 33,
						label: '联系电话',
						placeholder: '请输入联系电话',
						role: 'textbox',
						fieldType: 'phone',
						editable: true,
						hitState: 'hittable',
						hitPoints: '5/5',
					},
					{
						index: 34,
						label: '状态',
						role: 'combobox',
						fieldType: 'select',
						selectionControl: 'dropdown',
						editable: false,
						hitState: 'hittable',
						hitPoints: '5/5',
					},
					{
						index: 35,
						label: '角色',
						role: 'combobox',
						fieldType: 'multi_select',
						selectionControl: 'checkbox',
						optionLabels: ['管理员', '普通账号'],
						editable: false,
						hitState: 'hittable',
						hitPoints: '5/5',
					},
				],
			},
		],
	}
	const missingInputTargetLabelError = validation.validateExecutableAction(
		{ name: 'input_text', input: { index: 32, text: 'alpha' } },
		inputObservation,
		[]
	)
	if (!String(missingInputTargetLabelError || '').includes('workflow_field_label') || !String(missingInputTargetLabelError || '').includes('填错字段')) {
		throw new Error(`input actions should declare target_label/workflow_field_label before execution, got ${missingInputTargetLabelError}`)
	}
	const labelledInputError = validation.validateExecutableAction(
		{ name: 'input_text', input: { index: 32, text: 'alpha', target_label: '关键字' } },
		inputObservation,
		[]
	)
	if (labelledInputError) {
		throw new Error(`labelled input targets should remain executable, got ${labelledInputError}`)
	}
	const mismatchedInputAliasError = validation.validateExecutableAction(
		{ name: 'input_text', input: { index: 33, text: 'alpha', label: '关键字' } },
		inputObservation,
		[]
	)
	if (
		!String(mismatchedInputAliasError || '').includes('声明 label="关键字"') ||
		!String(mismatchedInputAliasError || '').includes('联系电话')
	) {
		throw new Error(`input label aliases should be validated against observed fields, got ${mismatchedInputAliasError}`)
	}
	const matchedInputPlaceholderError = validation.validateExecutableAction(
		{ name: 'input_text', input: { index: 33, text: '13800138000', placeholder: '请输入联系电话' } },
		inputObservation,
		[]
	)
	if (matchedInputPlaceholderError) {
		throw new Error(`matching input placeholder aliases should remain executable, got ${matchedInputPlaceholderError}`)
	}
	const missingDropdownTargetLabelError = validation.validateExecutableAction(
		{ name: 'open_dropdown', input: { index: 34 } },
		inputObservation,
		[]
	)
	if (!String(missingDropdownTargetLabelError || '').includes('缺少 target_label/workflow_field_label') || !String(missingDropdownTargetLabelError || '').includes('选择目标说明')) {
		throw new Error(`field-scoped selection actions should declare target_label before execution, got ${missingDropdownTargetLabelError}`)
	}
	const mismatchedDropdownTargetLabelError = validation.validateExecutableAction(
		{ name: 'open_dropdown', input: { index: 34, target_label: '关键字' } },
		inputObservation,
		[]
	)
	if (
		!String(mismatchedDropdownTargetLabelError || '').includes('声明 target_label="关键字"') ||
		!String(mismatchedDropdownTargetLabelError || '').includes('状态')
	) {
		throw new Error(`field-scoped selection target labels should be validated against observed fields, got ${mismatchedDropdownTargetLabelError}`)
	}
	const matchedDropdownTargetLabelError = validation.validateExecutableAction(
		{ name: 'open_dropdown', input: { index: 34, target_label: '状态' } },
		inputObservation,
		[]
	)
	if (matchedDropdownTargetLabelError) {
		throw new Error(`matching field-scoped selection target labels should remain executable, got ${matchedDropdownTargetLabelError}`)
	}
	const missingChooseTargetLabelError = validation.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 34, text: '启用' } },
		inputObservation,
		[]
	)
	if (!String(missingChooseTargetLabelError || '').includes('缺少 target_label/workflow_field_label')) {
		throw new Error(`choose_dropdown_option should require a field target label separate from option text, got ${missingChooseTargetLabelError}`)
	}
	const missingCascaderTargetLabelError = validation.validateExecutableAction(
		{ name: 'select_cascader_path', input: { index: 34, path: ['江苏省', '南京市'] } },
		inputObservation,
		[]
	)
	if (!String(missingCascaderTargetLabelError || '').includes('缺少 target_label/workflow_field_label')) {
		throw new Error(`select_cascader_path should require a field target label separate from path values, got ${missingCascaderTargetLabelError}`)
	}
	const cascaderChooseToolError = validation.validateExecutableAction(
		{ name: 'choose_dropdown_option', input: { index: 36, text: '江苏省', target_label: '所在地' } },
		{
			...inputObservation,
			forms: [
				{
					id: 'dialog',
					fields: [
						{ index: 36, region: 'dialog', label: '所在地', role: 'combobox', fieldType: 'region', kind: 'cascader', selectionControl: 'cascader-parent', valueState: 'selected:天津市 / 天津市 / 和平区' },
					],
				},
			],
			actions: [
				{ index: 36, region: 'dialog', label: '所在地', role: 'combobox', fieldType: 'region', kind: 'cascader', selectionControl: 'cascader-parent', valueState: 'selected:天津市 / 天津市 / 和平区' },
			],
		},
		[]
	)
	if (!String(cascaderChooseToolError || '').includes('级联选择字段') || !String(cascaderChooseToolError || '').includes('select_cascader_path')) {
		throw new Error(`choose_dropdown_option should steer cascader parents to select_cascader_path, got ${cascaderChooseToolError}`)
	}
	const missingCheckboxTargetLabelError = validation.validateExecutableAction(
		{ name: 'select_checkbox_option', input: { index: 35, text: '管理员' } },
		inputObservation,
		[]
	)
	if (!String(missingCheckboxTargetLabelError || '').includes('缺少 target_label/workflow_field_label')) {
		throw new Error(`select_checkbox_option should require a field or candidate target label separate from option text, got ${missingCheckboxTargetLabelError}`)
	}
	const matchedCheckboxTargetLabelError = validation.validateExecutableAction(
		{ name: 'select_checkbox_option', input: { index: 35, text: '管理员', target_label: '角色' } },
		inputObservation,
		[]
	)
	if (matchedCheckboxTargetLabelError) {
		throw new Error(`matching checkbox field target labels should remain executable, got ${matchedCheckboxTargetLabelError}`)
	}
	const partialError = validation.validateExecutableAction(
		{ name: 'click_element_by_index', input: { index: 31, target_label: '搜索' } },
		partialObservation,
		[]
	)
	if (partialError) {
		throw new Error(`partial but hittable targets should remain executable, got ${partialError}`)
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
		!prompt.includes('choose_dropdown_option') ||
		!prompt.includes('<diagnostic_options>') ||
		!prompt.includes('<diagnostic_popups>') ||
		!prompt.includes('不能直接作为 choose_dropdown_option/select_checkbox_option 的候选') ||
		!prompt.includes('也不能用 click_element_by_index 或 locate_by_vision 直接点击/定位') ||
		!prompt.includes('locate_by_vision 不能用于按候选文本直接定位/点击当前可见的下拉') ||
		!prompt.includes('scoped="field" 或 scoped="explicit"') ||
		!prompt.includes('empty_context') ||
		!prompt.includes('按 guidance 更换 source/region/query') ||
		!prompt.includes('done(false) 说明 reason')
	) {
		throw new Error('planner prompt module is missing ReAct or dropdown recovery guidance')
	}
	if (!prompt.includes('hit=covered') || !prompt.includes('points=0/n') || !prompt.includes('hit=partial')) {
		throw new Error('planner prompt should teach the model how to use generic hit-test/occlusion state')
	}
	if (!prompt.includes('hover_element_by_index 必须同时提供当前观察中的 index 和悬浮目标说明 target_label')) {
		throw new Error('planner prompt should require target_label for hover targets')
	}
	if (!prompt.includes('scroll/scroll_horizontally 如果省略 index 表示页面级滚动') || !prompt.includes('指定 index 滚动某个容器，必须提供滚动容器目标说明 target_label')) {
		throw new Error('planner prompt should require target_label only for indexed scroll containers')
	}
	if (!prompt.includes('keypress 必须提供 key、target_label') || !prompt.includes('禁止裸 keypress')) {
		throw new Error('planner prompt should require target and purpose context for keyboard actions')
	}
	if (!prompt.includes('open_new_tab/switch_to_tab/close_tab 必须带 target_label') || !prompt.includes('close_tab 还必须带 reason')) {
		throw new Error('planner prompt should require target and reason context for browser tab actions')
	}
	if (!prompt.includes('ask_user(question,reason)') || !prompt.includes('ask_user 必须带 question 和 reason')) {
		throw new Error('planner prompt should require a reason for user-interruption actions')
	}
	if (!prompt.includes('wait(reason)') || !prompt.includes('禁止无原因等待')) {
		throw new Error('planner prompt should require a reason for wait actions')
	}
	if (
		!prompt.includes('search_data_requirement status="missing_table_samples"') ||
		!prompt.includes('request_context source=tables region=content') ||
		!prompt.includes('禁止 input_text 填泛化词') ||
		!prompt.includes('只有补充上下文仍 empty_context 时才可 done(false)') ||
		!prompt.includes('不要 done，除非 <planning_context> 已证明 empty_context')
	) {
		throw new Error('planner prompt should force evidence collection before missing-sample search testing stops or fills fields')
	}
	if (
		!prompt.includes('通用规划流程') ||
		!prompt.includes('真正的页面内动作仍需要你结合当前页面元素和用户任务自行判断') ||
		!prompt.includes('scope=all_matching_controls') ||
		!prompt.includes('所有匹配的搜索/查询/筛选控件') ||
		!prompt.includes('request_context source=actions region=content query="新增"') ||
		!prompt.includes('创建/新增类任务应由你') ||
		!prompt.includes('task_intent operation=create')
	) {
		throw new Error('planner prompt should keep domain actions model-owned while guiding context requests for create tasks')
	}
	for (const forbidden of ['fieldType=select/platform/role/department', '业务页面字段', '业务字段', '业务列表工具栏']) {
		if (prompt.includes(forbidden)) {
			throw new Error(`planner prompt should use generic target-page wording, found ${forbidden}`)
		}
	}
}

function assertPlannerPromptHandlesCreateFormNotOpened() {
	const prompt = read('naturalclick-extension/background/planner-prompt.js')
	for (const expected of ['create_form_not_opened', '禁止重复同一 index', 'locate_by_vision', '导入开关', '侧边栏菜单']) {
		if (!prompt.includes(expected)) {
			throw new Error(`planner prompt should guide create-entry replanning after failed form opening: missing ${expected}`)
		}
	}
	for (const expected of ['唯一约束', '不要重复提交原值', 'ask_user 确认新值']) {
		if (!prompt.includes(expected)) {
			throw new Error(`planner prompt should guide duplicate form conflict handling: missing ${expected}`)
		}
	}
}

function assertPlannerCompactPromptTrimsTabsAndToolDescriptions() {
	const planner = read('naturalclick-extension/background/planner.js')
	const prompt = read('naturalclick-extension/background/planner-prompt.js')
	if (!planner.includes('compact: useCompactObservation') || !planner.includes('compact: true')) {
		throw new Error('planner should tell the prompt builder when compact context is being used')
	}
	if (!prompt.includes('function formatTabsSummaryForPrompt') || !prompt.includes('current id=') || !prompt.includes('... omitted ${tabs.length - rows.length} tabs')) {
		throw new Error('compact planner prompt should summarize tabs instead of dumping full tab JSON')
	}
	if (!prompt.includes('function formatToolLinesForPrompt') || !prompt.includes('match[1]') || !prompt.includes('input=')) {
		throw new Error('compact planner prompt should trim verbose tool descriptions down to tool schemas')
	}
}

function assertPlanningContextConfigIsUserConfigurable() {
	const constants = read('naturalclick-extension/background/constants.js')
	const config = read('naturalclick-extension/background/config.js')
	const planner = read('naturalclick-extension/background/planner.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	for (const expected of [
		'planning',
		'fullObservationMaxChars',
		'compactObservationMaxChars',
		'compactElementThreshold',
		'compactRawCandidateThreshold',
		'textLLM',
		'timeoutMs',
		'stream',
		'262144',
		'4200',
		'120',
		'80',
		'60000',
	]) {
		if (!constants.includes(expected)) {
			throw new Error(`default config should include planning context ${expected}`)
		}
	}
	if (!config.includes('normalizePlanningConfig') || !config.includes('1048576') || !config.includes('65536') || !config.includes('180000')) {
		throw new Error('config normalization should clamp user planning context and timeout limits')
	}
	if (
		!planner.includes('getPlanningContextConfig(session.config)') ||
		!planner.includes('planningConfig.fullObservationMaxChars') ||
		!planner.includes('planningConfig.compactObservationMaxChars') ||
		!planner.includes('compactElementThreshold') ||
		!planner.includes('compactRawCandidateThreshold')
	) {
		throw new Error('planner should consume user-configured observation limits')
	}
	if (!plannerContext.includes('DEFAULT_FULL_OBSERVATION_MAX_CHARS = 262144') || !plannerContext.includes('DEFAULT_COMPACT_OBSERVATION_MAX_CHARS = 4200')) {
		throw new Error('planner context fallback defaults should match configurable planning context defaults')
	}
	const sandbox = { console }
	sandbox.globalThis = sandbox
	vm.runInNewContext(constants, sandbox, { filename: 'naturalclick-extension/background/constants.js' })
	vm.runInNewContext(config, sandbox, { filename: 'naturalclick-extension/background/config.js' })
	const normalized = sandbox.NC_BG_CONFIG.normalizeConfig({
		textLLM: { baseURL: 'http://model.test/v1', model: 'm', apiKey: 'k', timeoutMs: 999999, stream: false },
		multiModalLLM: { baseURL: 'http://model.test/v1', model: 'mm', apiKey: 'k' },
		planning: {
			fullObservationMaxChars: 2000000,
			compactObservationMaxChars: 999999,
			compactElementThreshold: 1,
			compactRawCandidateThreshold: 999999,
		},
	})
	if (
		normalized.planning.fullObservationMaxChars !== 1048576 ||
		normalized.planning.compactObservationMaxChars !== 65536 ||
		normalized.planning.compactElementThreshold !== 20 ||
		normalized.planning.compactRawCandidateThreshold !== 10000 ||
		normalized.textLLM.timeoutMs !== 180000 ||
		normalized.textLLM.stream !== false
	) {
		throw new Error(`config should clamp large planning and timeout values, got ${JSON.stringify(normalized)}`)
	}
	const fallback = sandbox.NC_BG_CONFIG.normalizeConfig({})
	if (
		fallback.planning.fullObservationMaxChars !== 262144 ||
		fallback.planning.compactObservationMaxChars !== 4200 ||
		fallback.planning.compactElementThreshold !== 120 ||
		fallback.planning.compactRawCandidateThreshold !== 80 ||
		fallback.textLLM.timeoutMs !== 60000 ||
		fallback.textLLM.stream !== true
	) {
		throw new Error(`config should default planning context and timeout values, got ${JSON.stringify(fallback)}`)
	}
}

function assertLoginWorkflowBehavior() {
	const planner = read('naturalclick-extension/background/planner.js')
	const registrySource = read('naturalclick-extension/background/workflows.js')
	const loginSource = read('naturalclick-extension/background/login-workflow.js')
	const sandbox = loadBackgroundModule('naturalclick-extension/background/login-workflow.js', {})
	const workflow = sandbox.NC_BG_LOGIN_WORKFLOW_TESTS
	if (!workflow?.deriveLoginWorkflowDecision || !workflow?.extractLoginCredentials || !workflow?.recordLoginWorkflowOutcome) {
		throw new Error('login workflow test contract is not exported')
	}
	if (/(账号姓名|手机|电话|邮箱|性别|角色|岗位|部门|区域|地区|地址|平台|生日)/.test(loginSource)) {
		throw new Error('login workflow should not reject record forms with a fixed domain-field lexicon')
	}
	if (!loginSource.includes('isNonLoginFormField') || !loginSource.includes('nonLoginFields.length >= 2')) {
		throw new Error('login workflow should classify non-login credential forms by structure, not page-specific words')
	}
	const credentials = workflow.extractLoginCredentials('打开页面 账号 admin 密码 123456 并完成后续任务')
	if (credentials.username !== 'admin' || credentials.password !== '123456') {
		throw new Error(`login workflow should parse task credentials, got ${JSON.stringify(credentials)}`)
	}
	if (!planner.includes('NC_BG_PLANNER_WORKFLOWS') || !registrySource.includes('deriveLoginWorkflowDecision')) {
		throw new Error('planner should consult login workflow through the workflow registry before model planning')
	}
	const createDialogDecision = workflow.deriveLoginWorkflowDecision(
		{ task: '打开系统 账号 admin 密码 123456 创建一个账号，账号名是 nanobot，密码是 123456', history: [] },
		{
			url: 'https://example.test/#/admin/users',
			title: '账号列表',
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
	const neutralRecordDecision = workflow.deriveLoginWorkflowDecision(
		{ task: '登录系统 账号 admin 密码 123456', history: [] },
		{
			title: '控制台',
			forms: [
				{
					name: '数据表单',
					fields: [
						{ index: 1, fieldType: 'username', label: '账号', valueState: 'empty' },
						{ index: 2, fieldType: 'password', label: '密码', valueState: 'empty' },
						{ index: 3, fieldType: 'text', label: '显示标题', role: 'textbox', valueState: 'empty' },
						{ index: 4, fieldType: 'select', label: '可见范围', role: 'combobox', valueState: 'empty' },
					],
				},
			],
			actions: [{ index: 9, intent: 'submit', label: '提交' }],
		}
	)
	if (neutralRecordDecision !== null) {
		throw new Error(`login workflow should not consume credential-looking record forms by fixed page names: ${JSON.stringify(neutralRecordDecision)}`)
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
	if (usernameDecision.action.input.target_label !== '账号' || usernameDecision.action.input.workflow_field_label !== '账号') {
		throw new Error(`login workflow input actions should carry field target labels, got ${JSON.stringify(usernameDecision)}`)
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
		task: '打开这个页面 http://example.test/ 找到账户中心部分，测试搜索区域。',
		latestTask: '打开这个页面 http://example.test/ 找到账户中心部分，测试搜索区域。',
	})
	if (extractedTargets.includes('这个') || extractedTargets.includes('这个页面')) {
		throw new Error(`task-navigation should not treat generic page demonstratives as modules: ${JSON.stringify(extractedTargets)}`)
	}
	if (!extractedTargets.includes('账户中心')) {
		throw new Error(`task-navigation should still extract real named modules after filtering generic page phrases: ${JSON.stringify(extractedTargets)}`)
	}
	const genericPageTargets = workflow.extractTaskNavigationTargetKeys({
		task: '打开 http://example.test/ 进入帮助页面，然后搜索 FAQ。Open the Pricing page and then go to Settings screen.',
		latestTask: '打开 http://example.test/ 进入帮助页面，然后搜索 FAQ。Open the Pricing page and then go to Settings screen.',
	})
	for (const expected of ['帮助', 'pricing', 'settings']) {
		if (!genericPageTargets.includes(expected)) {
			throw new Error(`task-navigation should extract generic page/section targets such as ${expected}, got ${JSON.stringify(genericPageTargets)}`)
		}
	}
	if (genericPageTargets.some((key) => /http|example|faq|账号|密码|password/i.test(key))) {
		throw new Error(`task-navigation should not extract URLs, search terms, or credentials as navigation targets: ${JSON.stringify(genericPageTargets)}`)
	}
	const createUserTargets = workflow.extractTaskNavigationTargetKeys({
		task: '打开这个页面 http://example.test/ 账号 admin 密码 123456 找到账户中心部分，创建一个账号，账号名是 nanobot，密码是 123456，性别男，江苏南京江宁人，角色为管理员。',
		latestTask: '打开这个页面 http://example.test/ 账号 admin 密码 123456 找到账户中心部分，创建一个账号，账号名是 nanobot，密码是 123456，性别男，江苏南京江宁人，角色为管理员。',
	})
	if (!createUserTargets.includes('账户中心') || createUserTargets.includes('角色为管理')) {
		throw new Error(`task-navigation should ignore field assignment phrases such as role=admin while keeping real modules: ${JSON.stringify(createUserTargets)}`)
	}
	const recordDetailTask = '进入http://116.205.97.39:8201 这个网站，登录账号admin 密码123456 然后你进入资料管理页面，帮我找到列表第一条资料，然后查看这个资料的详情'
	const recordDetailTargets = workflow.extractTaskNavigationTargetKeys({
		task: recordDetailTask,
		latestTask: recordDetailTask,
	})
	if (
		!recordDetailTargets.includes('资料管理') ||
		recordDetailTargets.some((key) => /然后|进入|帮我/.test(key))
	) {
		throw new Error(`task-navigation should strip connective text before target modules: ${JSON.stringify(recordDetailTargets)}`)
	}
	const recordSearchTargets = workflow.extractTaskNavigationTargetKeys({
		task: '打开这个页面 http://example.test/ 找到资料管理。你现在帮我测试资料管理的每一个搜索功能是否正常实现。',
		latestTask: '打开这个页面 http://example.test/ 找到资料管理。你现在帮我测试资料管理的每一个搜索功能是否正常实现。',
	})
	if (!recordSearchTargets.includes('资料管理') || recordSearchTargets.some((key) => /测试资料管理|现在帮我/.test(key))) {
		throw new Error(`task-navigation should strip test-action noise from named-module search tasks: ${JSON.stringify(recordSearchTargets)}`)
	}
	const createPageTargets = workflow.extractTaskNavigationTargetKeys({
		task: '打开数据单据新增页面，帮我新增一条数据',
		latestTask: '打开数据单据新增页面，帮我新增一条数据',
	})
	if (!createPageTargets.includes('数据单据') || createPageTargets.includes('数据单据新增')) {
		throw new Error(`task-navigation should split create-page wording into module plus create action: ${JSON.stringify(createPageTargets)}`)
	}
	const missingBusinessUrlDecision = workflow.derivePreModelWorkflowDecision(
		{
			task: '打开数据单据新增页面，帮我新增一条数据',
			latestTask: '打开数据单据新增页面，帮我新增一条数据',
			history: [],
			workflowState: {},
		},
		{
			url: 'https://www.google.com/',
			title: 'Google',
			forms: [],
			actions: [],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'https://www.google.com/', current: true }] }
	)
	assertAction(missingBusinessUrlDecision, 'ask_user')
	if (
		missingBusinessUrlDecision.action.input.workflow_step !== 'request_missing_target_url' ||
		!/数据单据/.test(String(missingBusinessUrlDecision.action.input.question || '')) ||
		!/通用起始|目标网址|数据单据/.test(String(missingBusinessUrlDecision.action.input.reason || ''))
	) {
		throw new Error(`task-navigation should ask for the domain URL instead of model-planning on a generic start page: ${JSON.stringify(missingBusinessUrlDecision)}`)
	}
	const task = '打开 http://example.test/ 进入单据中心，并测试搜索区域每一个搜索项'
	const observation = {
		url: 'http://example.test/#/wel/index',
		title: '首页',
		forms: [],
		actions: [
			{ index: 8, region: 'header', role: 'tab', label: '单据中心', rect: { left: 200, top: 10, width: 90, height: 32 } },
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
		decision.action.input.workflow_nav_key !== '单据中心'
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
		{ ...observation, title: '单据中心-首页' },
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
				{ index: 10, region: 'content', role: 'button', label: '单据中心', rect: { left: 20, top: 100, width: 140, height: 40 } },
			],
		},
		{ tabsSummary: [{ id: 1, url: observation.url, current: true }] }
	)
	if (contentButtonOnly !== null) {
		throw new Error(`task-navigation workflow should not click arbitrary content buttons as navigation: ${JSON.stringify(contentButtonOnly)}`)
	}
	const simplifiedTarget = workflow.derivePreModelWorkflowDecision(
		{
			task: '打开 http://example.test/ 找到账户中心部分。',
			latestTask: '打开 http://example.test/ 找到账户中心部分。',
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
				'<menuitem index="42" role="menuitem" region="sidebar" kind="noneditable" target="/module/account">账户中心</menuitem>',
			],
		},
		{ tabsSummary: [{ id: 1, url: observation.url, current: true }] }
	)
	assertAction(simplifiedTarget, 'click_element_by_index')
	if (simplifiedTarget.action.input.index !== 42 || simplifiedTarget.action.input.workflow_nav_key !== '账户中心') {
		throw new Error(`task-navigation should resolve exact targets from simplified_dom rows: ${JSON.stringify(simplifiedTarget)}`)
	}
	const recordCreateTask = '打开 http://example.test/ 找到资料管理。新建一条资料数据，资料名称是张三。'
	const recordChildDecision = workflow.derivePreModelWorkflowDecision(
		{ task: recordCreateTask, latestTask: recordCreateTask, history: [], workflowState: {} },
		{
			url: 'http://example.test/#/wel/index',
			title: '首页',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '资料管理 入口项 资料 机会项 公海 协议 数据单据 资源申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded', rect: { left: 0, top: 120, width: 180, height: 44 } },
				{ index: 7, region: 'sidebar', role: 'menuitem', label: '资料', rect: { left: 0, top: 210, width: 180, height: 44 } },
				{ index: 8, region: 'sidebar', role: 'menuitem', label: '机会项', rect: { left: 0, top: 250, width: 180, height: 44 } },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/wel/index', current: true }] }
	)
	assertAction(recordChildDecision, 'click_element_by_index')
	if (
		recordChildDecision.action.input.index !== 7 ||
		recordChildDecision.action.input.workflow_nav_key !== '资料管理'
	) {
		throw new Error(`task-navigation should treat the record submenu as the concrete target for 资料管理 create tasks: ${JSON.stringify(recordChildDecision)}`)
	}
	const attemptedCustomerParentSession = {
		task: recordCreateTask,
		latestTask: recordCreateTask,
		history: [
			{
				action: 'click_element_by_index',
				input: {
					index: 5,
					target_label: '资料管理',
					workflow_step: 'navigate_to_task_target',
					workflow_nav_key: '资料管理',
				},
				success: true,
				output: '已展开资料管理。',
			},
		],
		workflowState: {},
	}
	const attemptedCustomerChildDecision = workflow.derivePreModelWorkflowDecision(
		attemptedCustomerParentSession,
		{
			url: 'http://example.test/#/demo/alternate',
			title: '机会项-样例系统',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '资料管理 入口项 资料 机会项 公海 协议 数据单据 资源申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded', rect: { left: 0, top: 120, width: 180, height: 44 } },
				{ index: 7, region: 'sidebar', role: 'menuitem', label: '资料', rect: { left: 0, top: 210, width: 180, height: 44 } },
				{ index: 8, region: 'sidebar', role: 'menuitem', label: '机会项', stateHints: 'classState=is-active', rect: { left: 0, top: 250, width: 180, height: 44 } },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/demo/alternate', current: true }] }
	)
	assertAction(attemptedCustomerChildDecision, 'click_element_by_index')
	if (attemptedCustomerChildDecision.action.input.index !== 7) {
		throw new Error(`task-navigation should still click the concrete record submenu after the parent group was attempted: ${JSON.stringify(attemptedCustomerChildDecision)}`)
	}
	const compositeOnlyCustomerDecision = workflow.derivePreModelWorkflowDecision(
		{
			task: recordCreateTask,
			latestTask: recordCreateTask,
			history: attemptedCustomerParentSession.history,
			workflowState: {},
		},
		{
			url: 'http://example.test/#/demo/alternate',
			title: '机会项-样例系统',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '资料管理 入口项 资料 机会项 公海 协议 数据单据 资源申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded', rect: { left: 0, top: 120, width: 180, height: 300 } },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/demo/alternate', current: true }] }
	)
	assertAction(compositeOnlyCustomerDecision, 'locate_by_vision')
	if (
		compositeOnlyCustomerDecision.action.input.workflow_nav_key !== '资料管理' ||
		compositeOnlyCustomerDecision.action.input.workflow_nav_alias !== '资料' ||
		!String(compositeOnlyCustomerDecision.action.input.target_description || '').includes('资料')
	) {
		throw new Error(`task-navigation should use vision to click a concrete submenu when observation only exposes a merged menu group: ${JSON.stringify(compositeOnlyCustomerDecision)}`)
	}
	const recordReachedHint = workflow.buildWorkflowContextText(
		{ task: recordCreateTask, latestTask: recordCreateTask, history: [], workflowState: {} },
		{
			url: 'http://example.test/#/demo/record',
			title: '资料-样例系统',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '资料管理 入口项 资料 机会项 公海 协议 数据单据 资源申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded' },
				{ index: 7, region: 'sidebar', role: 'menuitem', label: '资料', valueState: 'selected' },
			],
			popups: [],
			elements: [],
		}
	)
	if (!recordReachedHint.includes('key="资料管理" status="reached"') || recordReachedHint.includes('named task target is unresolved')) {
		throw new Error(`task-navigation should mark 资料管理 reached on the concrete 资料 page, got ${recordReachedHint}`)
	}
	const recordDetailHint = workflow.buildWorkflowContextText(
		{ task: recordDetailTask, latestTask: recordDetailTask, history: [], workflowState: {} },
		{
			url: 'http://example.test/#/demo/record',
			title: '资料-样例系统',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '资料管理 入口项 资料 机会项 公海 协议 数据单据 资源申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded' },
				{ index: 7, region: 'sidebar', role: 'menuitem', label: '资料', valueState: 'selected' },
			],
			popups: [],
			elements: [],
		}
	)
	if (
		!recordDetailHint.includes('key="资料管理" status="reached"') ||
		recordDetailHint.includes('key="然后你进入资料管理"') ||
		recordDetailHint.includes('named task target is unresolved')
	) {
		throw new Error(`record detail tasks should not keep connective navigation targets unresolved, got ${recordDetailHint}`)
	}
	const recordSearchTask = '打开 http://example.test/ 找到资料管理。测试资料管理的每一个搜索功能是否正常实现。'
	const searchAfterConcreteCustomerNav = workflow.derivePreModelWorkflowDecision(
		{
			task: recordSearchTask,
			latestTask: recordSearchTask,
			history: [
				{
					action: 'click_element_by_index',
					input: {
						index: 7,
						target_label: '资料',
						workflow: 'task-navigation',
						workflow_step: 'navigate_to_task_target',
						workflow_nav_key: '资料管理',
					},
					success: true,
					output: '已点击资料子菜单。',
				},
			],
			workflowState: {},
		},
		{
			url: 'http://example.test/#/demo/record',
			title: '样例系统',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 35, triggerLabel: '展开搜索' },
			],
			forms: [],
			actions: [
				{ index: 12, region: 'sidebar', role: 'menuitem', label: '数据单据', expandedState: 'collapsed' },
				{ index: 13, region: 'sidebar', role: 'menuitem', label: '业务审批', expandedState: 'collapsed' },
				{ index: 35, region: 'content', role: 'button', label: '展开搜索', actionIntent: 'open_filter' },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/demo/record', current: true }] }
	)
	assertAction(searchAfterConcreteCustomerNav, 'click_element_by_index')
	if (
		searchAfterConcreteCustomerNav.action.input.index !== 35 ||
		searchAfterConcreteCustomerNav.action.input.workflow !== 'search-fields' ||
		searchAfterConcreteCustomerNav.action.input.workflow_step !== 'expand_search_panel'
	) {
		throw new Error(`search workflow should take over after a concrete record submenu succeeds, got ${JSON.stringify(searchAfterConcreteCustomerNav)}`)
	}
	const unrelatedCustomerReveal = workflow.derivePreModelWorkflowDecision(
		{ task: recordSearchTask, latestTask: recordSearchTask, history: [], workflowState: {} },
		{
			url: 'http://example.test/#/wel/index',
			title: '首页',
			forms: [],
			actions: [
				{ index: 12, region: 'sidebar', role: 'menuitem', label: '数据单据', expandedState: 'collapsed' },
				{ index: 13, region: 'sidebar', role: 'menuitem', label: '业务审批', expandedState: 'collapsed' },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/wel/index', current: true }] }
	)
	if (unrelatedCustomerReveal !== null) {
		throw new Error(`task-navigation should not reveal unrelated domain menus while searching for 资料管理: ${JSON.stringify(unrelatedCustomerReveal)}`)
	}
	const recordDetailObservation = {
		url: 'http://116.205.97.39:8201/#/demo/record',
		title: '资料-样例系统',
		forms: [],
		actions: [
			{ index: 5, region: 'sidebar', role: 'menuitem', label: '资料管理 入口项 资料 机会项 公海 协议 数据单据 资源申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded' },
			{ index: 7, region: 'sidebar', role: 'menuitem', label: '资料', valueState: 'selected' },
			{ index: 35, region: 'content', role: 'button', label: '展开搜索', actionIntent: 'open_filter', rect: { left: 20, top: 128, width: 80, height: 32 } },
			{ index: 50, region: 'content', role: 'button', label: '详情', actionIntent: 'view', rect: { left: 900, top: 220, width: 52, height: 28 } },
			{ index: 51, region: 'content', role: 'button', label: '详情', actionIntent: 'view', rect: { left: 900, top: 268, width: 52, height: 28 } },
		],
		tables: [
			{ region: 'content', rect: { left: 280, top: 190, width: 980, height: 360 }, headers: ['资料名称', '联系方式'], rows: [['星火科技有限公司', '13800138000'], ['银河贸易有限公司', '13800138001']] },
		],
		popups: [],
		elements: [],
	}
	const firstRecordDetailDecision = workflow.derivePreModelWorkflowDecision(
		{ task: recordDetailTask, latestTask: recordDetailTask, history: [], workflowState: {} },
		recordDetailObservation,
		{ tabsSummary: [{ id: 1, url: recordDetailObservation.url, current: true }] }
	)
	assertAction(firstRecordDetailDecision, 'click_element_by_index')
	if (
		firstRecordDetailDecision.action.input.index !== 50 ||
		firstRecordDetailDecision.action.input.workflow !== 'record-view' ||
		firstRecordDetailDecision.action.input.workflow_step !== 'view_first_record_detail'
	) {
		throw new Error(`record-view workflow should click the first content detail action, got ${JSON.stringify(firstRecordDetailDecision)}`)
	}
	const toolbarDetailObservation = {
		...recordDetailObservation,
		actions: [
			{ index: 45, region: 'content', role: 'button', label: '详情', actionIntent: 'view', rect: { left: 720, top: 140, width: 52, height: 28 } },
			{ index: 50, region: 'content', role: 'button', label: '详情', actionIntent: 'view', rect: { left: 900, top: 220, width: 52, height: 28 } },
			{ index: 51, region: 'content', role: 'button', label: '详情', actionIntent: 'view', rect: { left: 900, top: 268, width: 52, height: 28 } },
		],
	}
	const toolbarDetailDecision = workflow.derivePreModelWorkflowDecision(
		{ task: recordDetailTask, latestTask: recordDetailTask, history: [], workflowState: {} },
		toolbarDetailObservation,
		{ tabsSummary: [{ id: 1, url: toolbarDetailObservation.url, current: true }] }
	)
	assertAction(toolbarDetailDecision, 'click_element_by_index')
	if (toolbarDetailDecision.action.input.index !== 50) {
		throw new Error(`record-view workflow should ignore detail buttons outside the visible list/table bounds, got ${JSON.stringify(toolbarDetailDecision)}`)
	}
	const noRecordListEvidenceDecision = workflow.derivePreModelWorkflowDecision(
		{ task: recordDetailTask, latestTask: recordDetailTask, history: [], workflowState: {} },
		{
			...recordDetailObservation,
			tables: [{ region: 'content', rect: { left: 280, top: 190, width: 980, height: 360 }, headers: ['资料名称', '联系方式'], rows: [] }],
			actions: [
				{ index: 50, region: 'content', role: 'button', label: '详情', actionIntent: 'view', rect: { left: 900, top: 220, width: 52, height: 28 } },
			],
		},
		{ tabsSummary: [{ id: 1, url: recordDetailObservation.url, current: true }] }
	)
	if (noRecordListEvidenceDecision !== null) {
		throw new Error(`record-view workflow should not click detail buttons without visible record/list row evidence, got ${JSON.stringify(noRecordListEvidenceDecision)}`)
	}
	const firstRecordWithoutDetailTask = '进入http://116.205.97.39:8201 这个网站，然后你进入资料管理页面，帮我找到列表第一条资料'
	const noDetailIntentDecision = workflow.derivePreModelWorkflowDecision(
		{ task: firstRecordWithoutDetailTask, latestTask: firstRecordWithoutDetailTask, history: [], workflowState: {} },
		recordDetailObservation,
		{ tabsSummary: [{ id: 1, url: recordDetailObservation.url, current: true }] }
	)
	if (noDetailIntentDecision !== null) {
		throw new Error(`record-view workflow should not click details unless the task asks to view details: ${JSON.stringify(noDetailIntentDecision)}`)
	}
	const completedRecordViewDecision = workflow.derivePreModelWorkflowDecision(
		{
			task: recordDetailTask,
			latestTask: recordDetailTask,
			history: [
				{
					action: 'click_element_by_index',
					input: { index: 50, workflow: 'record-view', workflow_step: 'view_first_record_detail' },
					success: true,
					output: '已点击详情。',
				},
			],
			workflowState: {},
		},
		{ ...recordDetailObservation, title: '资料详情-样例系统', actions: [] },
		{ tabsSummary: [{ id: 1, url: 'http://116.205.97.39:8201/#/demo/record/detail/1', current: true }] }
	)
	assertAction(completedRecordViewDecision, 'done')
	if (
		completedRecordViewDecision.action.input.success !== true ||
		completedRecordViewDecision.action.input.workflow !== 'record-view' ||
		completedRecordViewDecision.action.input.workflow_step !== 'finish_record_view'
	) {
		throw new Error(`record-view workflow should finish after a successful detail click, got ${JSON.stringify(completedRecordViewDecision)}`)
	}
	const systemToolHint = workflow.buildWorkflowContextText(
		{ task: '打开 http://example.test/ 找到系统管理部分。', latestTask: '打开 http://example.test/ 找到系统管理部分。', history: [], workflowState: {} },
		{
			url: 'http://example.test/#/system/tool',
			title: '系统工具-样例系统',
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
		task: '打开 http://example.test/ 找到账户中心部分。',
		latestTask: '打开 http://example.test/ 找到账户中心部分。',
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
		tabsSummary: [{ id: 1, url: collapsedNavObservation.url, current: true }],
	})
	if (collapsedNavDecision !== null) {
		throw new Error(`task-navigation should not reveal unrelated collapsed module-label containers from admin lexicons: ${JSON.stringify(collapsedNavDecision)}`)
	}
	const structuralCollapsedNavObservation = {
		...collapsedNavObservation,
		actions: [
			{ index: 32, region: 'sidebar', role: 'menuitem', label: '更多', expandedState: 'collapsed', rect: { left: 0, top: 180, width: 180, height: 44 } },
		],
	}
	const structuralCollapsedNavDecision = workflow.derivePreModelWorkflowDecision(collapsedNavSession, structuralCollapsedNavObservation, {
		tabsSummary: [{ id: 1, url: structuralCollapsedNavObservation.url, current: true }],
	})
	assertAction(structuralCollapsedNavDecision, 'click_element_by_index')
	if (
		structuralCollapsedNavDecision.action.input.index !== 32 ||
		structuralCollapsedNavDecision.action.input.workflow !== 'task-navigation' ||
		structuralCollapsedNavDecision.action.input.workflow_step !== 'reveal_navigation_options'
	) {
		throw new Error(`task-navigation should reveal structural menu containers before calling the model: ${JSON.stringify(structuralCollapsedNavDecision)}`)
	}
	workflow.recordWorkflowOutcome(collapsedNavSession, structuralCollapsedNavDecision, {
		success: true,
		output: '已展开更多。',
		outcome: { kind: 'opened', progress: true },
	})
	const repeatedCollapsedNav = workflow.derivePreModelWorkflowDecision(collapsedNavSession, structuralCollapsedNavObservation, {
		tabsSummary: [{ id: 1, url: structuralCollapsedNavObservation.url, current: true }],
	})
	if (repeatedCollapsedNav !== null) {
		throw new Error(`task-navigation should not repeat the same collapsed nav reveal: ${JSON.stringify(repeatedCollapsedNav)}`)
	}
	const reachedCreateObservation = {
		url: 'http://example.test/#/module/account',
		title: '账户中心-样例系统',
		forms: [],
		actions: [
			{ index: 16, region: 'sidebar', role: 'menuitem', label: '账户中心', valueState: 'selected' },
		],
		popups: [
			{ index: 20, region: 'header', role: 'button', label: '更多', rel: 'aria-controls=menu haspopup=list' },
		],
		elements: [],
	}
	const reachedCreateWithoutEntry = workflow.derivePreModelWorkflowDecision(
		{
			task: '打开 http://example.test/ 找到账户中心部分，创建一个账号。',
			latestTask: '打开 http://example.test/ 找到账户中心部分，创建一个账号。',
			history: [],
			workflowState: {},
		},
		reachedCreateObservation,
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/module/account', current: true }] }
	)
	if (reachedCreateWithoutEntry !== null) {
		throw new Error(`create tasks should not perform deterministic page actions before model planning after target arrival: ${JSON.stringify(reachedCreateWithoutEntry)}`)
	}
	const reachedCreateHint = workflow.buildWorkflowContextText(
		{
			task: '打开 http://example.test/ 找到账户中心部分，创建一个账号。',
			latestTask: '打开 http://example.test/ 找到账户中心部分，创建一个账号。',
			history: [],
			workflowState: {},
		},
		reachedCreateObservation
	)
	if (!reachedCreateHint.includes('create_task status="active"') || !reachedCreateHint.includes('request_context source=actions')) {
		throw new Error(`create-task hints should expose model guidance instead of a deterministic action, got ${reachedCreateHint}`)
	}
	const createEntrySession = {
		task: '打开 http://example.test/ 找到账户中心部分，创建一个账号。',
		latestTask: '打开 http://example.test/ 找到账户中心部分，创建一个账号。',
		history: [],
		workflowState: {},
	}
	const createEntryDecision = workflow.derivePreModelWorkflowDecision(
		createEntrySession,
		{
			url: 'http://example.test/#/module/account',
			title: '账户中心-样例系统',
			forms: [],
			actions: [
				{ index: 16, region: 'sidebar', role: 'menuitem', label: '账户中心', valueState: 'selected' },
				{ index: 40, region: 'content', role: 'button', label: '新增', actionIntent: 'create', rect: { left: 20, top: 100, width: 72, height: 32 } },
			],
			popups: [
				{ index: 20, region: 'header', role: 'button', label: '更多', rel: 'aria-controls=menu haspopup=list' },
			],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/module/account', current: true }] }
	)
	if (createEntryDecision !== null) {
		throw new Error(`create-task hints should leave visible create entry choice to the model, got ${JSON.stringify(createEntryDecision)}`)
	}
	const createEntryHint = workflow.buildWorkflowContextText(createEntrySession, {
		url: 'http://example.test/#/module/account',
		title: '账户中心-样例系统',
		forms: [],
		actions: [
			{ index: 16, region: 'sidebar', role: 'menuitem', label: '账户中心', valueState: 'selected' },
			{ index: 40, region: 'content', role: 'button', label: '新增', actionIntent: 'create', rect: { left: 20, top: 100, width: 72, height: 32 } },
		],
		popups: [],
		elements: [],
	})
	if (!createEntryHint.includes('create_candidates') || !createEntryHint.includes('index=40')) {
		throw new Error(`create-task hints should surface create candidates for model analysis, got ${createEntryHint}`)
	}
	const intentCreateSession = {
		task: '打开数据单据新增页面，帮我新增一条数据',
		latestTask: '打开数据单据新增页面，帮我新增一条数据',
		history: [],
		workflowState: {
			taskIntent: {
				status: 'ready',
				version: 13,
				taskText: '打开数据单据新增页面，帮我新增一条数据',
				intent: {
					navigationTargets: [
						{ raw: '数据单据新增页面', canonical: '数据单据', aliases: ['数据单据', '数据单据管理'], entity: '数据单据' },
					],
					operation: 'create',
					createEntryLabels: ['新增', '新建', '添加'],
					detailEntryLabels: ['详情', '查看'],
					forbiddenNavigationTargets: ['数据单据新增', '新增页面'],
				},
			},
		},
	}
	const intentCreateHint = workflow.buildWorkflowContextText(intentCreateSession, {
		url: 'http://example.test/#/demo/document',
		title: '数据单据-样例系统',
		forms: [],
		actions: [
			{ index: 11, region: 'sidebar', role: 'menuitem', label: '数据单据', valueState: 'selected' },
			{ index: 40, region: 'content', role: 'button', label: '新增', actionIntent: 'create', rect: { left: 20, top: 100, width: 72, height: 32 } },
		],
		popups: [],
		elements: [],
	})
	if (
		!intentCreateHint.includes('key="数据单据" status="reached"') ||
		intentCreateHint.includes('key="数据单据新增"') ||
		!intentCreateHint.includes('task_intent status="ready" operation="create"') ||
		!intentCreateHint.includes('create_candidates')
	) {
		throw new Error(`task-intent create hints should separate module navigation from create action, got ${intentCreateHint}`)
	}
	const recordToolbarCreateDecision = workflow.derivePreModelWorkflowDecision(
		{
			task: '打开 http://example.test/ 找到资料管理。你现在帮我新建一条资料数据，资料名称是张三。',
			latestTask: '打开 http://example.test/ 找到资料管理。你现在帮我新建一条资料数据，资料名称是张三。',
			history: [],
			workflowState: {},
		},
		{
			url: 'http://example.test/#/demo/record',
			title: '资料-样例系统',
			forms: [{ id: 'page_form', name: '页面表单', fields: [] }],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '资料管理 入口项 资料 机会项', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded' },
				{ index: 7, region: 'sidebar', role: 'menuitem', label: '资料', valueState: 'selected' },
				{ index: 28, region: 'content', role: 'button', label: '新 增', actionIntent: 'create', rect: { left: 20, top: 100, width: 82, height: 36 } },
				{ index: 36, region: 'content', role: 'button', label: '展开搜索', actionIntent: 'open_filter' },
				{ index: 58, region: 'content', role: 'button', label: '详情' },
				{ index: 59, region: 'content', role: 'button', label: '删除' },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/demo/record', current: true }] }
	)
	if (recordToolbarCreateDecision !== null) {
		throw new Error(`record toolbar add button should be model-chosen, not deterministically clicked: ${JSON.stringify(recordToolbarCreateDecision)}`)
	}
	const repeatedCreateEntryDecision = workflow.derivePreModelWorkflowDecision(
		createEntrySession,
		{
			url: 'http://example.test/#/module/account',
			title: '账户中心-样例系统',
			forms: [],
			actions: [
				{ index: 40, region: 'content', role: 'button', label: '新增', actionIntent: 'create' },
			],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/module/account', current: true }] }
	)
	if (repeatedCreateEntryDecision !== null) {
		throw new Error(`create tasks should not run a deterministic repeated create entry before model planning: ${JSON.stringify(repeatedCreateEntryDecision)}`)
	}
	const createFormTask = '打开 http://example.test/ 找到账号管理部分，创建一个账号，账号名是 nanobot，密码是 123456，性别男，江苏南京江宁人，角色为管理员。'
	const createFormObservation = {
		url: 'http://example.test/#/account/manage',
		title: '账号管理-样例系统',
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
					{ index: 13, region: 'dialog', fieldType: 'name', kind: 'text', label: '账号姓名', valueState: 'empty', role: 'textbox' },
					{ index: 14, region: 'dialog', fieldType: 'gender', kind: 'dropdown', label: '账号性别', valueState: 'selected:男 女 未知', role: 'combobox', selectionControl: 'dropdown' },
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
		task: '打开 http://example.test/ 找到系统工具管理部分。',
		latestTask: '打开 http://example.test/ 找到系统工具管理部分。',
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
		!['reveal_navigation_options', 'navigate_to_task_target'].includes(inferredParentDecision.action.input.workflow_step)
	) {
		throw new Error(`task-navigation should prefer a structurally related nav item over generic overflow: ${JSON.stringify(inferredParentDecision)}`)
	}
	const revealSession = {
		task: '打开 http://example.test/ 在账户中心创建账号。',
		latestTask: '打开 http://example.test/ 在账户中心创建账号。',
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
		task: recordCreateTask,
		latestTask: recordCreateTask,
		history: attemptedCustomerParentSession.history,
		workflowState: {},
	}
	const compositeTimeoutDecision = workflow.deriveTimeoutRecoveryWorkflowDecision(
		compositeTimeoutSession,
		{
			url: 'http://example.test/#/demo/alternate',
			title: '机会项-样例系统',
			forms: [],
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '资料管理 入口项 资料 机会项 公海 协议 数据单据 资源申请', stateHints: 'classState=is-active|is-opened', expandedState: 'expanded', rect: { left: 0, top: 120, width: 180, height: 300 } },
			],
			popups: [],
			elements: [],
		},
		{ tabsSummary: [{ id: 1, url: 'http://example.test/#/demo/alternate', current: true }] }
	)
	assertAction(compositeTimeoutDecision, 'locate_by_vision')
	if (compositeTimeoutDecision.action.input.workflow_nav_alias !== '资料') {
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
	const registrySandbox = loadBackgroundModule('naturalclick-extension/background/planner.js', {
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
	const plannerWorkflows = registrySandbox.NC_BG_PLANNER_WORKFLOWS_TESTS
	if (
		!workflow?.recordSearchWorkflowOutcome ||
		workflow.hasActiveSearchWorkflow ||
		!workflow.buildSearchWorkflowHintLines ||
		!workflow.deriveSearchWorkflowDecision ||
		!workflow.isSearchWorkflowTask
	) {
		throw new Error('search workflow test contract is not exported')
	}
	if (
		!productionWorkflow?.recordSearchWorkflowOutcome ||
		!productionWorkflow?.buildSearchWorkflowHintLines ||
		!productionWorkflow?.shouldRecordSearchWorkflowOutcome ||
		!productionWorkflow?.deriveSearchWorkflowDecision ||
		!productionWorkflow?.deriveSearchPostContextDecision ||
		!productionWorkflow?.deriveSearchPostValidationDecision ||
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
	const historyHelpers = sandbox.NC_BG_SEARCH_WORKFLOW_HISTORY_TESTS?.createSearchWorkflowHistoryHelpers?.()
	if (!historyHelpers) {
		throw new Error('search workflow history helper tests should be available')
	}
	if (!historyHelpers.isSearchSubmitHistory({
		action: 'click_element_by_index',
		success: true,
		input: { workflow_step: 'submit_search', target_label: '提交订单' },
	})) {
		throw new Error('explicit submit_search workflow metadata should classify submit history even when the button text is domain-specific')
	}
	if (historyHelpers.isSearchSubmitHistory({
		action: 'click_element_by_index',
		success: true,
		input: { target_label: '提交订单' },
		nextGoal: '提交当前订单',
		output: '已点击提交订单。',
	})) {
		throw new Error('plain domain submit buttons should not be inferred as search submit history without search/filter context')
	}
	if (historyHelpers.isSearchSubmitFailureHistory({
		action: 'click_element_by_index',
		success: false,
		input: { target_label: 'Submit order' },
		nextGoal: 'Submit order',
		evaluationPreviousGoal: 'The order submit button failed.',
		output: 'failed',
	})) {
		throw new Error('failed non-search submit buttons should not be inferred as search submit failures')
	}
	if (!historyHelpers.isSearchSubmitHistory({
		action: 'click_element_by_index',
		success: true,
		input: { target_label: '应用' },
		nextGoal: '提交筛选条件',
		output: '已应用筛选条件。',
	})) {
		throw new Error('legacy model-planned filter apply clicks should remain compatible when search/filter context is explicit')
	}
	if (!historyHelpers.isResetHistory({
		action: 'click_element_by_index',
		success: true,
		input: { workflow_step: 'reset_filters', target_label: '清空缓存' },
	})) {
		throw new Error('explicit reset_filters workflow metadata should classify reset history even when the button text is domain-specific')
	}
	if (historyHelpers.isResetHistory({
		action: 'click_element_by_index',
		success: true,
		input: { target_label: '清空缓存' },
		nextGoal: '清空页面缓存',
		output: '已清空缓存。',
	})) {
		throw new Error('plain clear-cache buttons should not be inferred as search reset history without search/filter context')
	}
	if (!historyHelpers.isResetHistory({
		action: 'click_element_by_index',
		success: true,
		input: { target_label: '重置' },
		nextGoal: '清空搜索条件并测试下一个字段',
		output: '已重置搜索条件。',
	})) {
		throw new Error('legacy model-planned reset clicks should remain compatible when search context is explicit')
	}
	if (
		!planner.includes('derivePostContextWorkflowDecision') ||
		!planner.includes('recordPlanningContextDeferral') ||
		!planner.includes('postContextWorkflowRecovery') ||
		!registrySource.includes('derivePostContextWorkflowDecision') ||
		!registrySource.includes('recordPlanningContextDeferral') ||
		!workflowSource.includes('deriveSearchPostContextDecision') ||
		!planner.includes('derivePostValidationWorkflowDecision') ||
		!registrySource.includes('derivePostValidationWorkflowDecision') ||
		!workflowSource.includes('deriveSearchPostValidationDecision')
	) {
		throw new Error('search workflow should recover evidence-related context and validation failures before entering repeated model context loops')
	}
	if (!/function\s+buildSearchWorkflowHintLines\s*\(/.test(workflowSource) || !/function\s+deriveSearchWorkflowDecision\s*\(/.test(workflowSource) || workflowSource.includes('NC_BG_SEARCH_WORKFLOW_FIELDS')) {
		throw new Error('search workflow should provide model-visible hints and the 0.4 deterministic state-machine decision helper')
	}
	if (!/function\s+buildFieldClearFallbackDecision\s*\(/.test(workflowSource) || !/function\s+canClearSearchFieldByInput\s*\(/.test(workflowSource)) {
		throw new Error('search workflow should provide a generic field-level clear fallback for plain editable search fields')
	}
	if (!plannerWorkflows?.recordPlanningContextDeferral) {
		throw new Error('planner workflow registry should expose planning-context deferral recording for tests')
	}
	const modelContextDeferralSession = {
		task: '测试搜索区域每一个搜索项',
		history: [],
		workflowState: {
			search: {
				version: 6,
				phase: 'awaiting_option',
				activeFieldKey: 'index:6',
				fieldOrder: ['index:6'],
				fields: {
					'index:6': { key: 'index:6', index: 6, label: '资料等级', fieldType: 'select' },
				},
				evidenceRequestAttemptsByKey: {},
			},
		},
	}
	plannerWorkflows.recordPlanningContextDeferral(modelContextDeferralSession, {
		action: { name: 'request_options_for', input: { index: 6, limit: 20 } },
	})
	plannerWorkflows.recordPlanningContextDeferral(modelContextDeferralSession, {
		action: { name: 'request_context', input: { source: 'actions', limit: 20 } },
	})
	plannerWorkflows.recordPlanningContextDeferral(modelContextDeferralSession, {
		action: { name: 'request_context', input: { source: 'tables', limit: 10 } },
	})
	if (modelContextDeferralSession.workflowState.search.evidenceRequestAttemptsByKey?.['index:6'] !== 2) {
		throw new Error(`model-requested table/options context should be recorded as search evidence attempts without counting unrelated action context, got ${JSON.stringify(modelContextDeferralSession.workflowState.search)}`)
	}
	if (/generic_fallback|semantic_fallback/.test(workflowSource) || /text:\s*['"]测试['"]/.test(workflowSource)) {
		throw new Error('search workflow must not manufacture fallback search values; missing samples should stop as missing_sample')
	}
	if (!workflowSource.includes("source: 'missing_sample'") || !workflowSource.includes("text: ''")) {
		throw new Error('search workflow should represent missing search evidence as an empty missing_sample value')
	}
	const contextRecoverySession = {
		task: '测试搜索区域每一个搜索项',
		history: [],
		workflowState: {
			search: {
				version: 6,
				phase: 'awaiting_option',
				activeFieldKey: 'index:7',
				lastSearchedFieldKey: '',
				fieldOrder: ['index:7', 'index:8'],
				completedKeys: [],
				skippedKeys: [],
				fields: {
					'index:7': { key: 'index:7', index: 7, label: '创建时间', fieldType: 'daterange' },
					'index:8': { key: 'index:8', index: 8, label: '联系方式', fieldType: 'phone' },
				},
				resultsByKey: {},
				evidenceRequestAttemptsByKey: { 'index:7': 1 },
			},
		},
	}
	const contextRecoveryDecision = workflow.deriveSearchPostContextDecision(
		contextRecoverySession,
		[
			'<workflow_hints>',
			'- search_option_requirement status="option_candidates_unobserved" fields="创建时间" activeIndex="7" samples="创建时间:2026-06-01" attempts="1" guidance="选择字段已尝试展开但未观测到候选；先 request_options_for 或 inspect_region popups/content 确认弹层候选，不要猜选项。"',
			'</workflow_hints>',
		].join('\n'),
		[
			{
				name: 'request_options_for',
				input: { index: 7, label: '创建时间', limit: 20 },
				text: [
					'<context_response seq="1" request="request_options_for">',
					'<options_for index="7">',
					'<target_matches>',
					'forms:filter field index=7 label="创建时间" role=combobox type=- fieldType=daterange state=empty',
					'</target_matches>',
					'<diagnostic_popups scoped="global_fallback" total="2" guidance="候选未能与目标字段建立稳定归属，仅供定位/排查；不要直接选择这些候选，先重新 open_dropdown 或 inspect_region popover/content。">',
					'popup index=91 label="2026-06-01" role=option control=date-option',
					'popup index=92 label="2026-06-02" role=option control=date-option',
					'</diagnostic_popups>',
					'</options_for>',
					'</context_response>',
				].join('\n'),
			},
		]
	)
	assertAction(contextRecoveryDecision, 'wait')
	if (
		contextRecoveryDecision.action.input.workflow_step !== 'skip_field' ||
		contextRecoveryDecision.action.input.workflow_context_recovered !== true ||
		contextRecoveryDecision.action.input.workflow_option_candidates_unobserved !== true ||
		!String(contextRecoveryDecision.action.input.workflow_planning_context_diagnostic || '').includes('diagnostic_popups') ||
		!String(contextRecoveryDecision.action.input.workflow_skip_reason || '').includes('未观测到真实候选')
	) {
		throw new Error(`search context recovery should convert diagnostic date candidates into field-level skip decisions before model loops, got ${JSON.stringify(contextRecoveryDecision)}`)
	}
	const textContextRecoveryDecision = workflow.deriveSearchPostContextDecision(
		{
			task: '测试搜索区域每一个搜索项',
			history: [],
			workflowState: {
				search: {
					version: 6,
					phase: 'select_field',
					activeFieldKey: 'index:31',
					lastSearchedFieldKey: '',
					fieldOrder: ['index:31'],
					completedKeys: [],
					skippedKeys: [],
					fields: {
						'index:31': { key: 'index:31', index: 31, label: '资料名称', fieldType: 'text' },
					},
					resultsByKey: {},
					evidenceRequestAttemptsByKey: { 'index:31': 1 },
				},
			},
		},
		'- search_data_requirement status="missing_table_samples" fields="资料名称" activeIndex="31"',
		[
			{
				name: 'request_context',
				input: { source: 'tables', limit: 10 },
				text: [
					'<context_response seq="1" request="request_context">',
					'<context_chunk source="tables" cursor="0" limit="10" total="1">',
					'table region="content" headers="资料名称|联系方式"',
					'  row 1: 资料名称=星火科技有限公司 | 联系方式=13800138000',
					'</context_chunk>',
					'</context_response>',
				].join('\n'),
			},
		]
	)
	assertAction(textContextRecoveryDecision, 'input_text')
	if (
		textContextRecoveryDecision.action.input.text !== '星火科技有限公司' ||
		textContextRecoveryDecision.action.input.workflow_context_recovered !== true ||
		textContextRecoveryDecision.action.input.workflow_value_source !== 'table_sample' ||
		!String(textContextRecoveryDecision.action.input.workflow_value_basis || '').includes('补充表格上下文')
	) {
		throw new Error(`search post-context recovery should use returned table samples for text fields before asking the model again, got ${JSON.stringify(textContextRecoveryDecision)}`)
	}
	const dateContextRecoveryDecision = workflow.deriveSearchPostContextDecision(
		{
			task: '测试搜索区域每一个搜索项',
			history: [],
			workflowState: {
				search: {
					version: 6,
					phase: 'awaiting_option',
					activeFieldKey: 'index:27',
					lastSearchedFieldKey: '',
					fieldOrder: ['index:27'],
					completedKeys: [],
					skippedKeys: [],
					fields: {
						'index:27': { key: 'index:27', index: 27, label: '创建时间', fieldType: 'daterange' },
					},
					resultsByKey: {},
					evidenceRequestAttemptsByKey: { 'index:27': 1 },
				},
			},
		},
		'- search_option_requirement status="option_candidates_unobserved" fields="创建时间" activeIndex="27"',
		[
			{
				name: 'request_context',
				input: { source: 'tables', limit: 10 },
				text: [
					'<context_response seq="1" request="request_context">',
					'<context_chunk source="tables" cursor="0" limit="10" total="1">',
					'table region="content" headers="创建时间|客户名称"',
					'  row 1: 创建时间=2026-06-02 | 客户名称=星火科技有限公司',
					'</context_chunk>',
					'</context_response>',
				].join('\n'),
			},
			{
				name: 'request_options_for',
				input: { index: 27, label: '创建时间', limit: 20 },
				text: [
					'<context_response seq="2" request="request_options_for">',
					'<options_for index="27">',
					'<visible_options scoped="field" total="3">',
					'option index=90 label="2026-06-02" role=option control=date-option',
					'option index=91 label="2026-06-03" role=option control=date-option',
					'option index=92 label="2026-06-04" role=option control=date-option',
					'</visible_options>',
					'</options_for>',
					'</context_response>',
				].join('\n'),
			},
		]
	)
	assertAction(dateContextRecoveryDecision, 'choose_dropdown_option')
	if (
		dateContextRecoveryDecision.action.input.text !== '2026-06-02..2026-06-03' ||
		dateContextRecoveryDecision.action.input.workflow_context_recovered !== true ||
		dateContextRecoveryDecision.action.input.workflow_value_source !== 'table_sample' ||
		!String(dateContextRecoveryDecision.action.input.workflow_value_basis || '').includes('补充表格上下文')
	) {
		throw new Error(`search post-context recovery should pair returned table date samples with scoped date candidates, got ${JSON.stringify(dateContextRecoveryDecision)}`)
	}
	const fieldExternalPostModelDecision = workflow.deriveSearchPostModelDecision(
		{
			task: '测试搜索区域每一个搜索项',
			history: [],
			workflowState: {
				search: {
					version: 6,
					phase: 'awaiting_option',
					activeFieldKey: 'index:7',
					lastSearchedFieldKey: '',
					fieldOrder: ['index:7', 'index:8'],
					completedKeys: [],
					skippedKeys: [],
					fields: {
						'index:7': { key: 'index:7', index: 7, label: '创建时间', fieldType: 'daterange' },
						'index:8': { key: 'index:8', index: 8, label: '联系方式', fieldType: 'phone' },
					},
					resultsByKey: {},
					evidenceRequestAttemptsByKey: { 'index:7': 1 },
				},
			},
		},
		{
			evaluation_previous_goal: '字段内候选为空。',
			memory: 'global_popup_diagnostic 暴露了字段外可见候选。',
			thought: '不要直接选择字段外候选，需要安全跳过当前字段。',
			next_goal: '安全跳过当前字段',
			action: {
				name: 'done',
				input: {
					text: '未在目标字段范围内找到可见下拉选项，但页面存在字段外可见候选。下一步建议：先 request_options_for 当前字段确认候选；不要直接选择字段外候选。',
					success: false,
				},
			},
		},
		{}
	)
	assertAction(fieldExternalPostModelDecision, 'wait')
	if (
		fieldExternalPostModelDecision.action.input.workflow_step !== 'skip_field' ||
		fieldExternalPostModelDecision.action.input.workflow_model_failure_recovered !== true ||
		fieldExternalPostModelDecision.action.input.workflow_option_candidates_unobserved !== true ||
		!String(fieldExternalPostModelDecision.action.input.workflow_skip_reason || '').includes('未观测到真实候选')
	) {
		throw new Error(`search post-model recovery should treat field-external candidate diagnostics as missing option evidence, got ${JSON.stringify(fieldExternalPostModelDecision)}`)
	}
	const positiveScopedEvidenceDecision = workflow.deriveSearchPostModelDecision(
		{
			task: '测试搜索区域每一个搜索项',
			history: [],
			workflowState: {
				search: {
					version: 6,
					phase: 'awaiting_option',
					activeFieldKey: 'index:7',
					lastSearchedFieldKey: '',
					fieldOrder: ['index:7'],
					completedKeys: [],
					skippedKeys: [],
					fields: {
						'index:7': { key: 'index:7', index: 7, label: '创建时间', fieldType: 'daterange' },
					},
					resultsByKey: {},
					evidenceRequestAttemptsByKey: { 'index:7': 1 },
				},
			},
		},
		{
			evaluation_previous_goal: '字段候选已经可用。',
			memory: 'visible_options 已返回字段内真实候选，候选已稳定归属到该字段。',
			thought: '等待模型执行字段内真实候选选择，而不是把归属成功当作失败。',
			next_goal: '选择字段内真实候选。',
			action: {
				name: 'done',
				input: {
					text: 'visible_options 已返回字段内真实候选，候选已稳定归属到该字段。',
					success: false,
				},
			},
		},
		{}
	)
	if (positiveScopedEvidenceDecision) {
		throw new Error(`search evidence classifier should not treat positive scoped ownership as missing candidates, got ${JSON.stringify(positiveScopedEvidenceDecision)}`)
	}
	const contextRecoveryWithoutEvidence = workflow.deriveSearchPostContextDecision(
		{
			task: '测试搜索区域每一个搜索项',
			history: [],
			workflowState: {
				search: {
					version: 6,
					phase: 'awaiting_option',
					activeFieldKey: 'index:7',
					fieldOrder: ['index:7'],
					fields: { 'index:7': { key: 'index:7', index: 7, label: '创建时间', fieldType: 'daterange' } },
					resultsByKey: {},
					evidenceRequestAttemptsByKey: {},
				},
			},
		},
		'- search_option_requirement status="option_candidates_unobserved" fields="创建时间" activeIndex="7"',
		[{ name: 'request_options_for', input: { index: 7, label: '创建时间' }, text: '<diagnostic_popups>2026-06-01</diagnostic_popups>' }]
	)
	if (contextRecoveryWithoutEvidence) {
		throw new Error(`search context recovery should wait until an evidence preflight has been recorded, got ${JSON.stringify(contextRecoveryWithoutEvidence)}`)
	}
	const contextLimitRecoverySession = {
		task: '测试搜索区域每一个搜索项',
		history: [],
		workflowState: {
			search: {
				version: 6,
				phase: 'awaiting_option',
				activeFieldKey: 'index:7',
				lastSearchedFieldKey: '',
				fieldOrder: ['index:7', 'index:8'],
				completedKeys: [],
				skippedKeys: [],
				fields: {
					'index:7': { key: 'index:7', index: 7, label: '创建时间', fieldType: 'daterange' },
					'index:8': { key: 'index:8', index: 8, label: '联系方式', fieldType: 'phone' },
				},
				resultsByKey: {},
				evidenceRequestAttemptsByKey: {},
			},
		},
	}
	const contextLimitRecoveryDecision = workflow.deriveSearchPostModelDecision(
		contextLimitRecoverySession,
		{
			evaluation_previous_goal: '已多次请求上下文，但仍未形成可执行页面动作。',
			memory: '',
			thought: '内部 ReAct 上下文请求次数达到上限：diagnostic_popups 候选未能与目标字段建立稳定归属。',
			next_goal: '暂停并暴露阻塞原因',
			action: {
				name: 'done',
				input: {
					text: '内部上下文请求次数达到上限，任务暂停以避免循环。最近阻塞原因：diagnostic_popups 候选未能与目标字段建立稳定归属。',
					success: false,
					planning_context_limit: true,
					planning_context_diagnostic: 'diagnostic_popups 候选未能与目标字段建立稳定归属。',
				},
			},
		},
		{
			planningContext: [
				{ name: 'request_options_for', input: { index: 7 }, text: '<diagnostic_popups>2026-06-01</diagnostic_popups>' },
				{ name: 'request_options_for', input: { index: 7 }, text: '<duplicate_request />' },
			],
		}
	)
	assertAction(contextLimitRecoveryDecision, 'wait')
	if (
		contextLimitRecoveryDecision.action.input.workflow_step !== 'skip_field' ||
		contextLimitRecoveryDecision.action.input.workflow_context_limit_recovered !== true ||
		contextLimitRecoveryDecision.action.input.workflow_model_failure_recovered !== true ||
		contextLimitRecoveryDecision.action.input.workflow_option_candidates_unobserved !== true ||
		contextLimitRecoveryDecision.action.input.workflow_field_index !== 7 ||
		contextLimitRecoveryDecision.action.input.workflow_context_rounds !== 2 ||
		!String(contextLimitRecoveryDecision.action.input.workflow_skip_reason || '').includes('未观测到真实候选')
	) {
		throw new Error(`search post-model context-limit recovery should field-skip diagnostic candidates even without prior evidence attempts, got ${JSON.stringify(contextLimitRecoveryDecision)}`)
	}
	const contextLimitVisibleCandidateSession = {
		task: '测试搜索区域每一个搜索项',
		history: [],
		workflowState: {
			search: {
				version: 6,
				phase: 'awaiting_option',
				activeFieldKey: 'index:7',
				lastSearchedFieldKey: '',
				fieldOrder: ['index:7'],
				completedKeys: [],
				skippedKeys: [],
				fields: {
					'index:7': { key: 'index:7', index: 7, label: '创建时间', fieldType: 'daterange' },
				},
				resultsByKey: {},
				evidenceRequestAttemptsByKey: {},
			},
		},
	}
	const contextLimitVisibleCandidateDecision = workflow.deriveSearchPostModelDecision(
		contextLimitVisibleCandidateSession,
		{
			evaluation_previous_goal: '已多次请求上下文，但仍未形成可执行页面动作。',
			memory: '',
			thought: '内部 ReAct 上下文请求次数达到上限：visible_options 已返回字段内真实候选。',
			next_goal: '暂停并暴露阻塞原因',
			action: {
				name: 'done',
				input: {
					text: '内部上下文请求次数达到上限，但最近 request_options_for 已返回字段内真实候选。',
					success: false,
					planning_context_limit: true,
					planning_context_diagnostic: 'visible_options 已返回字段内真实候选。',
				},
			},
		},
		{
			observation: {
				panels: [{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '创建时间' }],
				forms: [
					{
						id: 'filter',
						name: '搜索/筛选区域',
						fields: [
							{ index: 7, label: '创建时间', fieldType: 'daterange', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown', region: 'content' },
						],
					},
				],
				tables: [
					{ headers: ['创建时间', '客户名称'], rows: [['2026-06-02', '星火科技有限公司']] },
				],
			},
			planningContext: [
				{
					name: 'request_options_for',
					input: { index: 7 },
					text: [
						'<context_response seq="1" request="request_options_for">',
						'<options_for index="7">',
						'<visible_options scoped="field" total="3">',
						'option index=90 label="2026-06-02" role=option control=date-option',
						'option index=91 label="2026-06-03" role=option control=date-option',
						'option index=92 label="2026-06-04" role=option control=date-option',
						'</visible_options>',
						'</options_for>',
						'</context_response>',
					].join('\n'),
				},
			],
		}
	)
	assertAction(contextLimitVisibleCandidateDecision, 'choose_dropdown_option')
	if (
		contextLimitVisibleCandidateDecision.action.input.text !== '2026-06-02..2026-06-03' ||
		contextLimitVisibleCandidateDecision.action.input.workflow_context_limit_recovered !== true ||
		contextLimitVisibleCandidateDecision.action.input.workflow_model_failure_recovered !== true ||
		contextLimitVisibleCandidateDecision.action.input.workflow_context_rounds !== 1 ||
		!String(contextLimitVisibleCandidateDecision.action.input.workflow_planning_context_diagnostic || '').includes('visible_options')
	) {
		throw new Error(`search post-model context-limit recovery should execute scoped visible candidates instead of stopping, got ${JSON.stringify(contextLimitVisibleCandidateDecision)}`)
	}
	const mixedDiagnosticCandidateDecision = workflow.deriveSearchPostModelDecision(
		{
			task: '测试搜索区域每一个搜索项',
			history: [],
			workflowState: {
				search: {
					version: 6,
					phase: 'awaiting_option',
					activeFieldKey: 'index:6',
					lastSearchedFieldKey: '',
					fieldOrder: ['index:6'],
					completedKeys: [],
					skippedKeys: [],
					fields: {
						'index:6': { key: 'index:6', index: 6, label: '资料等级', fieldType: 'select' },
					},
					resultsByKey: {},
					evidenceRequestAttemptsByKey: {},
				},
			},
		},
		{
			evaluation_previous_goal: '已多次请求上下文，但仍未形成可执行页面动作。',
			memory: '',
			thought: '内部 ReAct 上下文请求次数达到上限：visible_options 已返回字段内候选，但列表样本和候选不匹配。',
			next_goal: '暂停并暴露阻塞原因',
			action: {
				name: 'done',
				input: {
					text: '内部上下文请求次数达到上限，最近补充上下文显示字段内候选与列表样本不匹配。',
					success: false,
					planning_context_limit: true,
					planning_context_diagnostic: 'visible_options 已返回字段内候选，但列表样本和候选不匹配。',
				},
			},
		},
		{
			observation: {
				panels: [{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料等级' }],
				forms: [
					{
						id: 'filter',
						name: '搜索/筛选区域',
						fields: [
							{ index: 6, label: '资料等级', fieldType: 'select', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown', region: 'content' },
						],
					},
				],
				tables: [
					{ headers: ['资料等级', '资料名称'], rows: [['外部候选', '星火科技有限公司']] },
				],
			},
			planningContext: [
				{
					name: 'request_options_for',
					input: { index: 6 },
					text: [
						'<context_response seq="1" request="request_options_for">',
						'<options_for index="6">',
						'<diagnostic_popups scoped="global_fallback" total="1">',
						'popup index=80 label="外部候选" role=option control=dropdown',
						'</diagnostic_popups>',
						'<visible_options scoped="field" total="2">',
						'option index=90 label="核心" role=option control=dropdown',
						'option index=91 label="潜力" role=option control=dropdown',
						'</visible_options>',
						'</options_for>',
						'</context_response>',
					].join('\n'),
				},
			],
		}
	)
	assertAction(mixedDiagnosticCandidateDecision, 'wait')
	if (
		mixedDiagnosticCandidateDecision.action.input.workflow_step !== 'skip_field' ||
		mixedDiagnosticCandidateDecision.action.input.workflow_context_limit_recovered !== true ||
		mixedDiagnosticCandidateDecision.action.input.workflow_option_sample_mismatch !== true ||
		String(mixedDiagnosticCandidateDecision.action.input.text || '').includes('外部候选')
	) {
		throw new Error(`search context-limit recovery must not import diagnostic candidates from mixed context blocks, got ${JSON.stringify(mixedDiagnosticCandidateDecision)}`)
	}
	const validationRecoverySession = {
		task: '测试搜索区域每一个搜索项',
		history: [],
		workflowState: {
			search: {
				version: 6,
				phase: 'awaiting_option',
				activeFieldKey: 'index:7',
				lastSearchedFieldKey: '',
				fieldOrder: ['index:7', 'index:8'],
				completedKeys: [],
				skippedKeys: [],
				fields: {
					'index:7': { key: 'index:7', index: 7, label: '创建时间', fieldType: 'daterange' },
					'index:8': { key: 'index:8', index: 8, label: '联系方式', fieldType: 'phone' },
				},
				resultsByKey: {},
			},
		},
	}
	const validationRecoveryDecision = workflow.deriveSearchPostValidationDecision(
		validationRecoverySession,
		{
			name: 'choose_dropdown_option',
			input: {
				workflow: 'search-fields',
				workflow_step: 'select_option',
				workflow_field_index: 7,
				workflow_field_label: '创建时间',
				workflow_field_type: 'daterange',
				index: 7,
				text: '2026-06-01',
				target_label: '创建时间',
			},
		},
		'choose_dropdown_option 目标 index=7 只有未归属到该字段的诊断候选 "2026-06-01|2026-06-02" 包含 "2026-06-01"。诊断候选不能直接选择。'
	)
	assertAction(validationRecoveryDecision, 'wait')
	if (
		validationRecoveryDecision.action.input.workflow_step !== 'skip_field' ||
		validationRecoveryDecision.action.input.workflow_validation_recovered !== true ||
		validationRecoveryDecision.action.input.workflow_option_candidates_unobserved !== true ||
		!String(validationRecoveryDecision.action.input.workflow_validation_error || '').includes('诊断候选')
	) {
		throw new Error(`search validation recovery should convert diagnostic option validation failures into field-level skip decisions, got ${JSON.stringify(validationRecoveryDecision)}`)
	}
	workflow.recordSearchWorkflowOutcome(validationRecoverySession, validationRecoveryDecision, {
		success: true,
		output: String(validationRecoveryDecision.action.input.text || ''),
	})
	if (
		!validationRecoverySession.workflowState.search.skippedKeys.includes('index:7') ||
		validationRecoverySession.workflowState.search.phase !== 'select_field'
	) {
		throw new Error(`search validation recovery skip should update workflow state for the failed field, got ${JSON.stringify(validationRecoverySession.workflowState.search)}`)
	}
	const validationRecoveryNext = workflow.deriveSearchWorkflowDecision(validationRecoverySession, {
		panels: [{ kind: 'filter', state: 'expanded', label: '搜索区域', fields: '联系方式' }],
		forms: [
			{
				id: 'filter',
				name: '搜索区域',
				fields: [
					{ index: 7, label: '创建时间', fieldType: 'daterange', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown', region: 'content' },
					{ index: 8, label: '联系方式', fieldType: 'phone', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
		tables: [{ headers: ['联系方式'], rows: [['13800138000']] }],
	})
	assertAction(validationRecoveryNext, 'input_text')
	if (validationRecoveryNext.action.input.workflow_field_index !== 8) {
		throw new Error(`search validation recovery should continue with the next field after skipping one unsafe candidate, got ${JSON.stringify(validationRecoveryNext)}`)
	}
	if (
		!workflowSource.includes('function candidateSampleContainsWithBoundaries') ||
		!workflowSource.includes('function containsWithAsciiDigitBoundary') ||
		!workflowSource.includes('function scoreCandidateSampleTextMatch') ||
		!workflowSource.includes('function optionTextHasBoundedDecorationMatch') ||
		!extractFunctionSource(workflowSource, 'pickCandidateMatchingSample').includes('scoreCandidateSampleTextMatch(key, sampleKey)') ||
		!extractFunctionSource(workflowSource, 'scoreCandidateSampleTextMatch').includes('optionTextHasBoundedDecorationMatch(candidateKey, sampleKey)') ||
		!extractFunctionSource(workflowSource, 'scoreCandidateSampleTextMatch').includes('candidateSampleContainsWithBoundaries(candidateKey, sampleKey)')
	) {
		throw new Error('search workflow should match table samples to options with exact/decorated/boundary-aware logic instead of raw substring matching')
	}
	const actionSearchTextFn = extractFunctionSource(workflowSource, 'getActionSearchText')
	for (const expected of ['selectorHints.testId', 'selectorHints.dataTest', 'selectorHints.className', 'action?.className', 'action?.iconClass']) {
		if (!actionSearchTextFn.includes(expected)) {
			throw new Error(`search workflow should use selector/action hints for icon-only submit/reset controls: missing ${expected}`)
		}
	}
	const actionCueTextFn = extractFunctionSource(workflowSource, 'normalizeActionCueText')
	if (!actionCueTextFn.includes('_\\-') || !actionCueTextFn.includes(':：')) {
		throw new Error('search workflow should normalize separators in action cue text such as clear-filters and reset_query')
	}
	const resultMatchFn = extractFunctionSource(workflowSource, 'tableResultContainsValue')
	if (
		!workflowSource.includes('function searchResultCellMatchesValue') ||
		!workflowSource.includes('function temporalRangeCellMatchesValue') ||
		!workflowSource.includes('function formatInsensitiveResultMatches') ||
		!workflowSource.includes('function normalizeComparableResultToken') ||
		!resultMatchFn.includes('searchResultCellMatchesValue(cells[headerIndex], normalizedValue, value)') ||
		!resultMatchFn.includes('searchResultCellMatchesValue(cell, normalizedValue, value)')
	) {
		throw new Error('search workflow should verify submitted results with exact/boundary-aware, temporal-range-aware, and format-insensitive cell matching instead of raw substring matching')
	}
	const dateRangeCandidateFn = extractFunctionSource(workflowSource, 'pickDateRangeCandidate')
	if (
		!workflowSource.includes('function pickDateRangeFromDayOnlyCandidates') ||
		!workflowSource.includes('function inferFullDateFromMonthDayCandidate') ||
		!workflowSource.includes('function parseMonthDayDateCandidate') ||
		!workflowSource.includes('function monthDayFallsWithinDateRange') ||
		!workflowSource.includes('function parseDayOnlyDateCandidate') ||
		!workflowSource.includes('function shiftDate') ||
		!workflowSource.includes('function inferDateFromDayOnlyHistory') ||
		!workflowSource.includes('function extractDayOnlyDateFromHistoryItem') ||
		!dateRangeCandidateFn.includes('inferFullDateFromMonthDayCandidate(anchorValue, fullDateCandidates)') ||
		!dateRangeCandidateFn.includes('pickDateRangeFromDayOnlyCandidates(candidates, failed, anchorDate)')
	) {
		throw new Error('search workflow should anchor date-range searches to table dates even when table samples omit years or picker cells expose only day numbers')
	}
	const dateHistoryFn = extractFunctionSource(workflowSource, 'extractDateValueFromHistoryItem')
	if (
		!dateHistoryFn.includes('extractDayOnlyDateFromHistoryItem(item)') ||
		!dateHistoryFn.includes('inferDateFromDayOnlyHistory(day, field, state, key)')
	) {
		throw new Error('search workflow should recover direct date-option clicks when action history only contains day numbers')
	}
	for (const expected of ['clearcriteria', 'resetcriteria', 'clearquery', 'resetquery']) {
		if (!workflowSource.includes(expected)) {
			throw new Error(`search workflow should recognize ${expected} as generic search/filter reset text`)
		}
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
	if (!historySource.includes('if (!normalized.source && outcome.source) normalized.source = String(outcome.source || \'\').trim()')) {
		throw new Error('search workflow history should preserve diagnostic outcome source such as global_popup_diagnostic')
	}
	if (background.includes('background/search-workflow-fields.js')) {
		throw new Error('background should not load the removed deterministic search field helper')
	}
	if (!registrySource.includes('inferWorkflowNameFromOutcome') || !registrySource.includes('shouldRecordSearchWorkflowOutcome')) {
		throw new Error('workflow registry should infer search ownership for model-planned search actions without reintroducing auto-runner behavior')
	}
	if (!workflowSource.includes('NC_BG_TASK_INTENT') || !workflowSource.includes('isSearchWorkflowTask(session)')) {
		throw new Error('search workflow should consume structured task intent before falling back to task-text search heuristics')
	}
	const structuredIntentSandbox = loadBackgroundModule('naturalclick-extension/background/search-workflow.js', {
		NC_BG_TASK_INTENT: {
			getTaskIntent: (session) => session?.workflowState?.taskIntent?.intent || null,
		},
	})
	const structuredWorkflow = structuredIntentSandbox.NC_BG_SEARCH_WORKFLOW_TESTS
	const structuredSearchSession = {
		task: 'search FAQ',
		history: [],
		workflowState: {
			taskIntent: {
				intent: {
					operation: 'search',
					operationScope: 'all_matching_controls',
				},
			},
		},
	}
	if (!structuredWorkflow.isSearchWorkflowTask(structuredSearchSession)) {
		throw new Error('search workflow should start from structured search/all_matching_controls intent even when task text is not a search-test phrase')
	}
	const structuredDecision = structuredWorkflow.deriveSearchWorkflowDecision(
		structuredSearchSession,
		{
			panels: [
				{ kind: 'filter', state: 'collapsed', label: 'Filter area', triggerIndex: 9, triggerLabel: 'More filters' },
			],
			forms: [],
			actions: [],
		}
	)
	assertAction(structuredDecision, 'click_element_by_index')
	const singleTargetSearchSession = {
		task: 'search FAQ',
		history: [],
		workflowState: {
			taskIntent: {
				intent: {
					operation: 'search',
					operationScope: 'single_target',
				},
			},
		},
	}
	if (structuredWorkflow.isSearchWorkflowTask(singleTargetSearchSession)) {
		throw new Error('search workflow should not auto-run all-field testing for structured single-target search intent')
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
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,账号姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '账号姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	const fieldHintText = fieldHints.join('\n')
	if (!fieldHintText.includes('search_fields') || !fieldHintText.includes('登录账号[index=2') || !fieldHintText.includes('账号姓名[index=3') || !fieldHintText.includes('submitIndex="8"')) {
		throw new Error(`search workflow should expose generic field and action hints, got ${JSON.stringify(fieldHints)}`)
	}
	const missingSampleHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 31, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	).join('\n')
	if (
		!missingSampleHints.includes('search_data_requirement') ||
		!missingSampleHints.includes('missing_table_samples') ||
		!missingSampleHints.includes('request_context source=tables') ||
		!missingSampleHints.includes('不要填泛化测试词')
	) {
		throw new Error(`search workflow hints should explain missing list samples before stopping generic text fields, got ${missingSampleHints}`)
	}
	const semanticSampleHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '联系方式' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 32, label: '联系方式', fieldType: 'phone', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	).join('\n')
	if (!semanticSampleHints.includes('search_data_requirement') || !semanticSampleHints.includes('fields="联系方式"')) {
		throw new Error(`format-like search fields without samples should require table samples instead of semantic fallback values, got ${semanticSampleHints}`)
	}
	const credentialLikeFirstFieldDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项 账号 admin', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,账号姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '账号姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	assertAction(credentialLikeFirstFieldDecision, 'done')
	if (
		credentialLikeFirstFieldDecision.action.input.success !== false ||
		credentialLikeFirstFieldDecision.action.input.workflow_missing_table_samples !== true ||
		String(credentialLikeFirstFieldDecision.action.input.text || '').includes('admin')
	) {
		throw new Error(`search workflow should not treat account-like task text as a field sample without explicit search wording, got ${JSON.stringify(credentialLikeFirstFieldDecision)}`)
	}
	const sampledFieldObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '经办姓名,公司名称,联系方式' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
		tables: [
			{
				region: 'content',
				headers: ['经办姓名', '公司名称', '联系方式'],
				rows: [
					['王经办', '星火科技有限公司', '13800138000'],
				],
			},
		],
	}
	const sampledFieldHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		sampledFieldObservation
	).join('\n')
	for (const expected of [
		'search_data_samples',
		'status="available"',
		'fields="公司名称"',
		'samples="公司名称:星火科技有限公司"',
		'真实样本逐项测试',
		'提交验证后先清空条件',
	]) {
		if (!sampledFieldHints.includes(expected)) {
			throw new Error(`search workflow should expose matched table samples in hints: missing ${expected}, got ${sampledFieldHints}`)
		}
	}
	const sampledFieldDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		sampledFieldObservation
	)
	assertAction(sampledFieldDecision, 'input_text')
	if (sampledFieldDecision.action.input.text !== '星火科技有限公司') {
		throw new Error(`search workflow should sample text search values from current table rows before generic fallback, got ${JSON.stringify(sampledFieldDecision)}`)
	}
	const truncatedSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					headers: ['公司名称', '联系方式'],
					rows: [
						['星火科技...', '13800138000'],
						['星火科技有限公司', '13800138001'],
					],
				},
			],
		}
	)
	assertAction(truncatedSampleDecision, 'input_text')
	if (truncatedSampleDecision.action.input.text !== '星火科技有限公司') {
		throw new Error(`search workflow should skip visibly truncated table samples and use a complete row value, got ${JSON.stringify(truncatedSampleDecision)}`)
	}
	const onlyTruncatedSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					headers: ['公司名称', '联系方式'],
					rows: [
						['星火科技…', '13800138000'],
					],
				},
			],
		}
	)
	assertAction(onlyTruncatedSampleDecision, 'done')
	if (
		onlyTruncatedSampleDecision.action.input.success !== false ||
		onlyTruncatedSampleDecision.action.input.workflow_missing_table_samples !== true
	) {
		throw new Error(`search workflow should not use visibly truncated table samples as search values, got ${JSON.stringify(onlyTruncatedSampleDecision)}`)
	}
	const nonDataSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					headers: ['公司名称', '联系方式'],
					rows: [
						['暂无数据', '--'],
						['****', '13800138000'],
						['星火科技有限公司', '13800138001'],
					],
				},
			],
		}
	)
	assertAction(nonDataSampleDecision, 'input_text')
	if (nonDataSampleDecision.action.input.text !== '星火科技有限公司') {
		throw new Error(`search workflow should skip placeholder/loading/masked table samples and use a real row value, got ${JSON.stringify(nonDataSampleDecision)}`)
	}
	const onlyNonDataSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					headers: ['公司名称', '联系方式'],
					rows: [
						['暂无数据', '--'],
						['Loading', '13800138000'],
						['****', '13800138001'],
					],
				},
			],
		}
	)
	assertAction(onlyNonDataSampleDecision, 'done')
	if (
		onlyNonDataSampleDecision.action.input.success !== false ||
		onlyNonDataSampleDecision.action.input.workflow_missing_table_samples !== true
	) {
		throw new Error(`search workflow should not use placeholder/loading/masked table samples as search values, got ${JSON.stringify(onlyNonDataSampleDecision)}`)
	}
	const unlabeledTableSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					kind: 'unlabeled-table',
					region: 'content',
					headers: ['col1', 'col2'],
					rows: [
						['星火科技有限公司', '13800138000'],
					],
				},
			],
		}
	)
	assertAction(unlabeledTableSampleDecision, 'done')
	if (
		unlabeledTableSampleDecision.action.input.success !== false ||
		unlabeledTableSampleDecision.action.input.workflow_missing_table_samples !== true
	) {
		throw new Error(`unlabeled table evidence must not be used as a search-field sample, got ${JSON.stringify(unlabeledTableSampleDecision)}`)
	}
	const sampledListDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '名称,联系方式' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 12, label: '名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					kind: 'record-list',
					region: 'content',
					headers: ['名称', '联系方式'],
					rows: [
						['星火科技有限公司', '13800138000'],
						['晨光技术服务', '13900139000'],
					],
				},
			],
		}
	)
	assertAction(sampledListDecision, 'input_text')
	if (
		sampledListDecision.action.input.text !== '星火科技有限公司' ||
		sampledListDecision.action.input.workflow_value_source !== 'table_sample'
	) {
		throw new Error(`search workflow should sample text values from generic record-list summaries, got ${JSON.stringify(sampledListDecision)}`)
	}
	const spacedTextRowDecision = workflow.deriveSearchWorkflowDecision(
		{ task: 'Test every search field in the filter area', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Company' },
			],
			forms: [
				{
					id: 'filter',
					name: 'Filters',
					fields: [
						{ index: 12, label: 'Company', fieldType: 'text', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: 'Search', region: 'content' }],
			rawCandidates: [
				'row table cell Company: Acme Corp LLC | Phone: 555-0100 | Status: Active',
			],
		}
	)
	assertAction(spacedTextRowDecision, 'input_text')
	if (
		spacedTextRowDecision.action.input.text !== 'Acme Corp LLC' ||
		spacedTextRowDecision.action.input.workflow_value_source !== 'table_sample'
	) {
		throw new Error(`search workflow should preserve spaced values from delimited text rows, got ${JSON.stringify(spacedTextRowDecision)}`)
	}
	const uniqueAffixSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '编号' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 13, label: '编号', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					region: 'content',
					headers: ['客户编号', '客户名称'],
					rows: [
						['KH-001', '星火科技有限公司'],
					],
				},
			],
		}
	)
	assertAction(uniqueAffixSampleDecision, 'input_text')
	if (
		uniqueAffixSampleDecision.action.input.text !== 'KH-001' ||
		uniqueAffixSampleDecision.action.input.workflow_value_source !== 'table_sample'
	) {
		throw new Error(`search workflow should use a unique generic-header affix match such as 编号 -> 客户编号, got ${JSON.stringify(uniqueAffixSampleDecision)}`)
	}
	const uniqueNameSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 14, label: '姓名', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					region: 'content',
					headers: ['联系人姓名', '联系方式'],
					rows: [
						['张三', '13800138000'],
					],
				},
			],
		}
	)
	assertAction(uniqueNameSampleDecision, 'input_text')
	if (
		uniqueNameSampleDecision.action.input.text !== '张三' ||
		uniqueNameSampleDecision.action.input.workflow_value_source !== 'table_sample'
	) {
		throw new Error(`search workflow should use a unique generic-header affix match such as 姓名 -> 联系人姓名, got ${JSON.stringify(uniqueNameSampleDecision)}`)
	}
	const ambiguousGenericHeaderDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 15, label: '名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					region: 'content',
					headers: ['客户名称', '项目名称'],
					rows: [
						['星火科技有限公司', '二期工程'],
					],
				},
			],
		}
	)
	assertAction(ambiguousGenericHeaderDecision, 'done')
	if (
		ambiguousGenericHeaderDecision.action.input.success !== false ||
		ambiguousGenericHeaderDecision.action.input.workflow_missing_table_samples !== true ||
		String(ambiguousGenericHeaderDecision.action.input.text || '').includes('星火科技有限公司')
	) {
		throw new Error(`search workflow should not pick the first column when a generic label matches multiple headers, got ${JSON.stringify(ambiguousGenericHeaderDecision)}`)
	}
	const ambiguousStrippedHeaderDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '对象' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 16, label: '对象', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{
					region: 'content',
					headers: ['对象名称', '对象等级'],
					rows: [
						['星火科技有限公司', '核心'],
					],
				},
			],
		}
	)
	assertAction(ambiguousStrippedHeaderDecision, 'done')
	if (
		ambiguousStrippedHeaderDecision.action.input.success !== false ||
		ambiguousStrippedHeaderDecision.action.input.workflow_missing_table_samples !== true ||
		String(ambiguousStrippedHeaderDecision.action.input.text || '').includes('星火科技有限公司')
	) {
		throw new Error(`search workflow should not let stripped header suffixes hide ambiguous same-prefix columns, got ${JSON.stringify(ambiguousStrippedHeaderDecision)}`)
	}
	const prefilledResetDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '经办姓名,公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 26, label: '经办姓名', fieldType: 'name', valueState: 'filled:测试经办', role: 'textbox', type: 'text', region: 'content' },
						{ index: 27, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
			tables: [{ headers: ['经办姓名', '公司名称'], rows: [] }],
		}
	)
	assertAction(prefilledResetDecision, 'click_element_by_index')
	if (
		prefilledResetDecision.action.input.index !== 45 ||
		prefilledResetDecision.action.input.workflow_step !== 'reset_filters' ||
		prefilledResetDecision.action.input.workflow_baseline_reset !== true ||
		prefilledResetDecision.action.input.workflow_field_index !== 26 ||
		prefilledResetDecision.action.input.workflow_filled_field_indexes !== '26' ||
		prefilledResetDecision.action.input.workflow_filled_fields !== '经办姓名'
	) {
		throw new Error(`search workflow should clear prefilled filters before sampling list data, got ${JSON.stringify(prefilledResetDecision)}`)
	}
	const clearConditionResetDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '经办姓名,公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 26, label: '经办姓名', fieldType: 'name', valueState: 'filled:测试经办', role: 'textbox', type: 'text', region: 'content' },
						{ index: 27, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 46, actionIntent: 'button', label: '清除条件', region: 'content' },
			],
			tables: [{ headers: ['经办姓名', '公司名称'], rows: [] }],
		}
	)
	assertAction(clearConditionResetDecision, 'click_element_by_index')
	if (
		clearConditionResetDecision.action.input.index !== 46 ||
		clearConditionResetDecision.action.input.target_label !== '清除条件' ||
		clearConditionResetDecision.action.input.workflow_step !== 'reset_filters' ||
		clearConditionResetDecision.action.input.workflow_baseline_reset !== true
	) {
		throw new Error(`search workflow should recognize generic clear-condition reset buttons, got ${JSON.stringify(clearConditionResetDecision)}`)
	}
	const englishClearFiltersDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: 'Search filters', fields: 'Owner,Company' },
			],
			forms: [
				{
					id: 'filter',
					name: 'Search filters',
					fields: [
						{ index: 26, label: 'Owner', fieldType: 'name', valueState: 'filled:Alice', role: 'textbox', type: 'text', region: 'content' },
						{ index: 27, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: 'Apply filters', region: 'content' },
				{ index: 47, actionIntent: 'button', label: 'Clear filters', region: 'content' },
			],
			tables: [{ headers: ['Owner', 'Company'], rows: [] }],
		}
	)
	assertAction(englishClearFiltersDecision, 'click_element_by_index')
	if (
		englishClearFiltersDecision.action.input.index !== 47 ||
		englishClearFiltersDecision.action.input.target_label !== 'Clear filters' ||
		englishClearFiltersDecision.action.input.workflow_step !== 'reset_filters' ||
		englishClearFiltersDecision.action.input.workflow_baseline_reset !== true
	) {
		throw new Error(`search workflow should recognize English clear-filter reset buttons, got ${JSON.stringify(englishClearFiltersDecision)}`)
	}
	const englishResetAllFiltersDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: 'Search filters', fields: 'Owner,Company' },
			],
			forms: [
				{
					id: 'filter',
					name: 'Search filters',
					fields: [
						{ index: 26, label: 'Owner', fieldType: 'name', valueState: 'filled:Alice', role: 'textbox', type: 'text', region: 'content' },
						{ index: 27, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: 'Apply filters', region: 'content' },
				{ index: 51, actionIntent: 'button', label: 'Reset all filters', region: 'content' },
			],
			tables: [{ headers: ['Owner', 'Company'], rows: [] }],
		}
	)
	assertAction(englishResetAllFiltersDecision, 'click_element_by_index')
	if (
		englishResetAllFiltersDecision.action.input.index !== 51 ||
		englishResetAllFiltersDecision.action.input.target_label !== 'Reset all filters' ||
		englishResetAllFiltersDecision.action.input.workflow_step !== 'reset_filters' ||
		englishResetAllFiltersDecision.action.input.workflow_baseline_reset !== true
	) {
		throw new Error(`search workflow should recognize English reset-all-filters buttons, got ${JSON.stringify(englishResetAllFiltersDecision)}`)
	}
	const resetQueryDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: 'Search filters', fields: 'Keyword,Company' },
			],
			forms: [
				{
					id: 'filter',
					name: 'Search filters',
					fields: [
						{ index: 26, label: 'Keyword', fieldType: 'text', valueState: 'filled:invoice', role: 'textbox', type: 'text', region: 'content' },
						{ index: 27, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: 'Run query', region: 'content' },
				{ index: 52, actionIntent: 'button', label: 'Reset query', region: 'content' },
			],
			tables: [{ headers: ['Keyword', 'Company'], rows: [] }],
		}
	)
	assertAction(resetQueryDecision, 'click_element_by_index')
	if (
		resetQueryDecision.action.input.index !== 52 ||
		resetQueryDecision.action.input.target_label !== 'Reset query' ||
		resetQueryDecision.action.input.workflow_step !== 'reset_filters' ||
		resetQueryDecision.action.input.workflow_baseline_reset !== true
	) {
		throw new Error(`search workflow should recognize English reset-query buttons as filter reset actions, got ${JSON.stringify(resetQueryDecision)}`)
	}
	const removeFiltersDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: 'Search filters', fields: 'Status' },
			],
			forms: [
				{
					id: 'filter',
					name: 'Search filters',
					fields: [
						{ index: 28, label: 'Status', fieldType: 'select', valueState: 'selected:Active', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: 'Apply filters', region: 'content' },
				{ index: 48, actionIntent: 'button', label: 'Remove filters', region: 'content' },
			],
			tables: [{ headers: ['Status'], rows: [] }],
		}
	)
	assertAction(removeFiltersDecision, 'click_element_by_index')
	if (
		removeFiltersDecision.action.input.index !== 48 ||
		removeFiltersDecision.action.input.target_label !== 'Remove filters' ||
		removeFiltersDecision.action.input.workflow_step !== 'reset_filters'
	) {
		throw new Error(`search workflow should recognize explicit remove-filter reset buttons, got ${JSON.stringify(removeFiltersDecision)}`)
	}
	const unsafeResetObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: 'Search filters', fields: 'Status' },
		],
		forms: [
			{
				id: 'filter',
				name: 'Search filters',
				fields: [
					{ index: 28, label: 'Status', fieldType: 'select', valueState: 'selected:Active', role: 'combobox', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 44, actionIntent: 'search', label: 'Apply filters', region: 'content' },
			{ index: 49, actionIntent: 'button', label: 'Clear cache', region: 'content' },
			{ index: 50, actionIntent: 'button', label: 'Remove item', region: 'content' },
		],
		tables: [{ headers: ['Status'], rows: [] }],
	}
	const unsafeResetHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		unsafeResetObservation
	).join('\n')
	if (unsafeResetHints.includes('resetIndex="49"') || unsafeResetHints.includes('resetIndex="50"')) {
		throw new Error(`search workflow should not advertise unsafe non-filter clear/remove actions as reset buttons, got ${unsafeResetHints}`)
	}
	const unsafeResetDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		unsafeResetObservation
	)
	assertAction(unsafeResetDecision, 'done')
	if (
		unsafeResetDecision.action.input.success !== false ||
		unsafeResetDecision.action.input.workflow_reset_action_missing !== true ||
		unsafeResetDecision.action.input.workflow_reset_context !== 'baseline'
	) {
		throw new Error(`search workflow should reject unsafe non-filter clear/remove actions as reset buttons, got ${JSON.stringify(unsafeResetDecision)}`)
	}
	const farGenericResetObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: 'Search filters', fields: 'Keyword' },
		],
		forms: [
			{
				id: 'filter',
				name: 'Search filters',
				fields: [
					{
						index: 28,
						label: 'Keyword',
						fieldType: 'text',
						valueState: 'filled:invoice',
						role: 'textbox',
						type: 'text',
						region: 'content',
						rect: { left: 80, top: 60, width: 180, height: 32 },
					},
				],
			},
		],
		actions: [
			{ index: 44, actionIntent: 'search', label: 'Search', region: 'content', rect: { left: 270, top: 60, width: 80, height: 32 } },
			{ index: 49, actionIntent: 'reset', label: 'Clear', region: 'content', rect: { left: 760, top: 620, width: 90, height: 32 } },
		],
		tables: [{ headers: ['Keyword'], rows: [] }],
	}
	const farGenericResetDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		farGenericResetObservation
	)
	assertAction(farGenericResetDecision, 'input_text')
	if (
		farGenericResetDecision.action.input.index !== 28 ||
		farGenericResetDecision.action.input.text !== '' ||
		farGenericResetDecision.action.input.workflow_step !== 'clear_field' ||
		farGenericResetDecision.action.input.workflow_clear_context !== 'baseline'
	) {
		throw new Error(`search workflow should not treat far generic Clear buttons as filter resets, got ${JSON.stringify(farGenericResetDecision)}`)
	}
	const missingBaselineResetObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '经办姓名,公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 26, label: '经办姓名', fieldType: 'name', valueState: 'filled:测试经办', role: 'textbox', type: 'text', region: 'content' },
					{ index: 27, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
		],
		tables: [{ headers: ['经办姓名', '公司名称'], rows: [] }],
	}
	const missingBaselineResetHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		missingBaselineResetObservation
	).join('\n')
	for (const expected of [
		'search_reset_requirement',
		'status="field_clear_fallback_available"',
		'context="baseline"',
		'fields="经办姓名"',
		'clearableFields="经办姓名"',
		'字段级置空兜底',
		'不要猜测清空',
	]) {
		if (!missingBaselineResetHints.includes(expected)) {
			throw new Error(`search workflow should expose missing reset controls before baseline reset: missing ${expected}, got ${missingBaselineResetHints}`)
		}
	}
	const missingBaselineResetDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		missingBaselineResetObservation
	)
	assertAction(missingBaselineResetDecision, 'input_text')
	if (
		missingBaselineResetDecision.action.input.index !== 26 ||
		missingBaselineResetDecision.action.input.text !== '' ||
		missingBaselineResetDecision.action.input.workflow_step !== 'clear_field' ||
		missingBaselineResetDecision.action.input.workflow_field_clear !== true ||
		missingBaselineResetDecision.action.input.workflow_clear_context !== 'baseline' ||
		missingBaselineResetDecision.action.input.workflow_filled_fields !== '经办姓名' ||
		!/普通可编辑文本字段/.test(String(missingBaselineResetDecision.evaluation_previous_goal || ''))
	) {
		throw new Error(`search workflow should clear plain text fields when baseline reset is missing, got ${JSON.stringify(missingBaselineResetDecision)}`)
	}
	const ineffectiveBaselineResetSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const ineffectiveBaselineResetObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '关键字,状态' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 26, label: '关键字', fieldType: 'text', valueState: 'filled:legacy', role: 'textbox', type: 'text', region: 'content' },
					{ index: 27, label: '状态', fieldType: 'select', valueState: 'empty', role: 'combobox', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [{ headers: ['关键字'], rows: [['legacy']] }],
	}
	const ineffectiveBaselineResetClick = workflow.deriveSearchWorkflowDecision(ineffectiveBaselineResetSession, ineffectiveBaselineResetObservation)
	assertAction(ineffectiveBaselineResetClick, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(ineffectiveBaselineResetSession, ineffectiveBaselineResetClick, {
		success: false,
		output: 'search_reset_field_not_cleared: 搜索重置后已知筛选字段仍未清空',
		outcome: { kind: 'no_effect', reason: 'search_reset_field_not_cleared' },
	})
	const ineffectiveBaselineFallback = workflow.deriveSearchWorkflowDecision(ineffectiveBaselineResetSession, ineffectiveBaselineResetObservation)
	assertAction(ineffectiveBaselineFallback, 'input_text')
	if (
		ineffectiveBaselineFallback.action.input.index !== 26 ||
		ineffectiveBaselineFallback.action.input.text !== '' ||
		ineffectiveBaselineFallback.action.input.workflow_step !== 'clear_field' ||
		ineffectiveBaselineFallback.action.input.workflow_clear_context !== 'baseline' ||
		ineffectiveBaselineFallback.action.input.workflow_reset_ineffective !== true ||
		ineffectiveBaselineFallback.action.input.workflow_reset_action_index !== 45 ||
		!/按钮复核未通过/.test(String(ineffectiveBaselineFallback.evaluation_previous_goal || ''))
	) {
		throw new Error(`search workflow should field-clear plain text filters after an ineffective baseline reset button, got ${JSON.stringify(ineffectiveBaselineFallback)}`)
	}
	const missingSelectionBaselineResetDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '状态,公司名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 28, label: '状态', fieldType: 'select', valueState: 'selected:启用', role: 'combobox', region: 'content' },
						{ index: 29, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	assertAction(missingSelectionBaselineResetDecision, 'done')
	if (
		missingSelectionBaselineResetDecision.action.input.success !== false ||
		missingSelectionBaselineResetDecision.action.input.workflow_reset_action_missing !== true ||
		missingSelectionBaselineResetDecision.action.input.workflow_reset_context !== 'baseline'
	) {
		throw new Error(`search workflow should not field-clear selection controls when reset is missing, got ${JSON.stringify(missingSelectionBaselineResetDecision)}`)
	}
	const noSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 31, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
			tables: [{ headers: ['资料名称', '联系方式'], rows: [] }],
		}
	)
	assertAction(noSampleDecision, 'done')
	if (
		noSampleDecision.action.input.success !== false ||
		noSampleDecision.action.input.workflow_missing_table_samples !== true ||
		!String(noSampleDecision.action.input.text || '').includes('没有可用列表样本')
	) {
		throw new Error(`search workflow should stop instead of using generic random text when visible tables are empty, got ${JSON.stringify(noSampleDecision)}`)
	}
	const skipAfterEvidenceSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const skipAfterEvidenceObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称,联系方式' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 31, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					{ index: 32, label: '联系方式', fieldType: 'phone', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [{ headers: ['联系方式'], rows: [['13800138000']] }],
	}
	const firstMissingEvidence = workflow.deriveSearchWorkflowDecision(skipAfterEvidenceSession, skipAfterEvidenceObservation)
	assertAction(firstMissingEvidence, 'done')
	workflow.recordSearchWorkflowDeferral(skipAfterEvidenceSession, firstMissingEvidence)
	const skipMissingEvidence = workflow.deriveSearchWorkflowDecision(skipAfterEvidenceSession, skipAfterEvidenceObservation)
	assertAction(skipMissingEvidence, 'wait')
	if (
		skipMissingEvidence.action.input.workflow_step !== 'skip_field' ||
		skipMissingEvidence.action.input.workflow_field_index !== 31 ||
		skipMissingEvidence.action.input.workflow_result_status !== 'unknown_missing_sample' ||
		!String(skipMissingEvidence.action.input.workflow_skip_reason || '').includes('已安全跳过') ||
		String(skipMissingEvidence.action.input.workflow_skip_reason || '').includes('已停止')
	) {
		throw new Error(`search workflow should record a field-level safe skip after evidence was requested, got ${JSON.stringify(skipMissingEvidence)}`)
	}
	workflow.recordSearchWorkflowOutcome(skipAfterEvidenceSession, skipMissingEvidence, {
		success: true,
		output: '已记录搜索字段安全跳过。',
	})
	const nextAfterSkip = workflow.deriveSearchWorkflowDecision(skipAfterEvidenceSession, skipAfterEvidenceObservation)
	assertAction(nextAfterSkip, 'input_text')
	if (
		nextAfterSkip.action.input.index !== 32 ||
		nextAfterSkip.action.input.text !== '13800138000' ||
		!skipAfterEvidenceSession.workflowState.search?.skippedKeys?.includes('index:31') ||
		skipAfterEvidenceSession.workflowState.search?.resultsByKey?.['index:31']?.status !== 'unknown_missing_sample'
	) {
		throw new Error(`search workflow should continue to the next testable field after safe skip, got ${JSON.stringify({ decision: nextAfterSkip, state: skipAfterEvidenceSession.workflowState.search })}`)
	}
	const unrelatedTableSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 32, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
			tables: [{ headers: ['联系人', '联系方式'], rows: [['张三', '13800138000']] }],
		}
	)
	assertAction(unrelatedTableSampleDecision, 'done')
	if (
		unrelatedTableSampleDecision.action.input.success !== false ||
		unrelatedTableSampleDecision.action.input.workflow_missing_table_samples !== true ||
		!String(unrelatedTableSampleDecision.action.input.text || '').includes('没有可用列表样本')
	) {
		throw new Error(`search workflow should not use generic text when tables exist but lack a field-specific sample, got ${JSON.stringify(unrelatedTableSampleDecision)}`)
	}
	const noTableSampleDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 32, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
		}
	)
	assertAction(noTableSampleDecision, 'done')
	if (
		noTableSampleDecision.action.input.success !== false ||
		noTableSampleDecision.action.input.workflow_missing_table_samples !== true ||
		!String(noTableSampleDecision.action.input.text || '').includes('没有可用列表样本')
	) {
		throw new Error(`search workflow should stop instead of using generic random text when no table summaries are available, got ${JSON.stringify(noTableSampleDecision)}`)
	}
	const credentialSearchDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '打开 http://example.test/ 账号 admin 密码 123456，测试搜索区域每一个搜索项', latestTask: '打开 http://example.test/ 账号 admin 密码 123456，测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '账号' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 34, label: '账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
		}
	)
	assertAction(credentialSearchDecision, 'done')
	if (
		credentialSearchDecision.action.input.success !== false ||
		credentialSearchDecision.action.input.workflow_missing_table_samples !== true ||
		String(credentialSearchDecision.action.input.workflow_test_value || '').includes('admin') ||
		String(credentialSearchDecision.action.input.text || '').includes('admin')
	) {
		throw new Error(`search workflow should not reuse login credentials as search samples, got ${JSON.stringify(credentialSearchDecision)}`)
	}
	const credentialPasswordSearchDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '打开 http://example.test/ 账号 admin 密码 123456，测试搜索区域每一个搜索项', latestTask: '打开 http://example.test/ 账号 admin 密码 123456，测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '密码' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 35, label: '密码', fieldType: 'password', valueState: 'empty', role: 'textbox', type: 'password', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
		}
	)
	assertAction(credentialPasswordSearchDecision, 'done')
	if (
		credentialPasswordSearchDecision.action.input.success !== false ||
		credentialPasswordSearchDecision.action.input.workflow_missing_table_samples !== true ||
		String(credentialPasswordSearchDecision.action.input.workflow_test_value || '').includes('123456') ||
		String(credentialPasswordSearchDecision.action.input.text || '').includes('123456')
	) {
		throw new Error(`search workflow should not reuse login passwords as search samples, got ${JSON.stringify(credentialPasswordSearchDecision)}`)
	}
	const explicitAccountAfterLoginDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '打开 http://example.test/ 账号 admin 密码 123456，测试搜索区域每一个搜索项，搜索账号是 admin', latestTask: '打开 http://example.test/ 账号 admin 密码 123456，测试搜索区域每一个搜索项，搜索账号是 admin', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '账号' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 34, label: '账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
		}
	)
	assertAction(explicitAccountAfterLoginDecision, 'input_text')
	if (
		explicitAccountAfterLoginDecision.action.input.text !== 'admin' ||
		explicitAccountAfterLoginDecision.action.input.workflow_value_source !== 'task_value'
	) {
		throw new Error(`search workflow should skip login credentials and keep later explicit account search values, got ${JSON.stringify(explicitAccountAfterLoginDecision)}`)
	}
	const explicitAccountSearchDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项，搜索账号是 admin', latestTask: '测试搜索区域每一个搜索项，搜索账号是 admin', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '账号' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 34, label: '账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
		}
	)
	assertAction(explicitAccountSearchDecision, 'input_text')
	if (
		explicitAccountSearchDecision.action.input.text !== 'admin' ||
		explicitAccountSearchDecision.action.input.workflow_value_source !== 'task_value'
	) {
		throw new Error(`search workflow should still use explicitly requested account search values, got ${JSON.stringify(explicitAccountSearchDecision)}`)
	}
	const explicitPasswordSearchDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项，搜索密码是 123456', latestTask: '测试搜索区域每一个搜索项，搜索密码是 123456', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '密码' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 35, label: '密码', fieldType: 'password', valueState: 'empty', role: 'textbox', type: 'password', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
		}
	)
	assertAction(explicitPasswordSearchDecision, 'input_text')
	if (
		explicitPasswordSearchDecision.action.input.text !== '123456' ||
		explicitPasswordSearchDecision.action.input.workflow_value_source !== 'task_value'
	) {
		throw new Error(`search workflow should still use explicitly requested password search values, got ${JSON.stringify(explicitPasswordSearchDecision)}`)
	}
	const explicitPasswordAfterLoginDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '打开 http://example.test/ 账号 admin 密码 123456，测试搜索区域每一个搜索项，搜索密码是 123456', latestTask: '打开 http://example.test/ 账号 admin 密码 123456，测试搜索区域每一个搜索项，搜索密码是 123456', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '密码' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 35, label: '密码', fieldType: 'password', valueState: 'empty', role: 'textbox', type: 'password', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
		}
	)
	assertAction(explicitPasswordAfterLoginDecision, 'input_text')
	if (
		explicitPasswordAfterLoginDecision.action.input.text !== '123456' ||
		explicitPasswordAfterLoginDecision.action.input.workflow_value_source !== 'task_value'
	) {
		throw new Error(`search workflow should skip login passwords and keep later explicit password search values, got ${JSON.stringify(explicitPasswordAfterLoginDecision)}`)
	}
	const phoneCredentialSearchDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '打开 http://example.test/ 登录手机号 13800138000 验证码 246810，测试搜索区域每一个搜索项', latestTask: '打开 http://example.test/ 登录手机号 13800138000 验证码 246810，测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '联系方式' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 36, label: '联系方式', fieldType: 'phone', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
		}
	)
	assertAction(phoneCredentialSearchDecision, 'done')
	if (
		phoneCredentialSearchDecision.action.input.success !== false ||
		phoneCredentialSearchDecision.action.input.workflow_missing_table_samples !== true ||
		String(phoneCredentialSearchDecision.action.input.workflow_test_value || '').includes('13800138000') ||
		String(phoneCredentialSearchDecision.action.input.text || '').includes('13800138000')
	) {
		throw new Error(`search workflow should not reuse phone-login credentials as contact search samples, got ${JSON.stringify(phoneCredentialSearchDecision)}`)
	}
	const explicitContactAfterLoginDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '打开 http://example.test/ 登录手机号 13800138000 验证码 246810，测试搜索区域每一个搜索项，搜索联系方式是 13800138000', latestTask: '打开 http://example.test/ 登录手机号 13800138000 验证码 246810，测试搜索区域每一个搜索项，搜索联系方式是 13800138000', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '联系方式' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 36, label: '联系方式', fieldType: 'phone', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 45, actionIntent: 'reset', label: '清空', region: 'content' },
			],
		}
	)
	assertAction(explicitContactAfterLoginDecision, 'input_text')
	if (
		explicitContactAfterLoginDecision.action.input.text !== '13800138000' ||
		explicitContactAfterLoginDecision.action.input.workflow_value_source !== 'task_value'
	) {
		throw new Error(`search workflow should skip phone-login values and keep later explicit contact search values, got ${JSON.stringify(explicitContactAfterLoginDecision)}`)
	}
	const semanticFallbackDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '联系方式' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 33, label: '联系方式', fieldType: 'phone', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
			],
		}
	)
	assertAction(semanticFallbackDecision, 'done')
	if (
		semanticFallbackDecision.action.input.success !== false ||
		semanticFallbackDecision.action.input.workflow_missing_table_samples !== true
	) {
		throw new Error(`format-like search fields should stop without table/task evidence instead of using semantic fallback values, got ${JSON.stringify(semanticFallbackDecision)}`)
	}
	for (const scenario of [
		{ task: '测试所有状态筛选条件是否正常', label: '状态', leaked: '筛选条件是否正常' },
		{ task: '测试名称每一个搜索项是否正常', label: '名称', leaked: '每一个搜索项是否正常' },
		{ task: '验证标题搜索功能是否正常', label: '标题', leaked: '搜索功能是否正常' },
		{ task: '测试搜索区域姓名输入框是否正常', label: '姓名', leaked: '输入框是否正常' },
		{ task: '测试搜索区域部门字段是否可用', label: '部门', leaked: '字段是否可用' },
		{ task: '测试搜索区域状态控件是否实现', label: '状态', leaked: '控件是否实现' },
	]) {
		const instructionFragmentDecision = workflow.deriveSearchWorkflowDecision(
			{ task: scenario.task, latestTask: scenario.task, history: [], workflowState: {} },
			{
				panels: [
					{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: scenario.label },
				],
				forms: [
					{
						id: 'filter',
						name: '搜索/筛选区域',
						fields: [
							{ index: 37, label: scenario.label, fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						],
					},
				],
				actions: [
					{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
				],
			}
		)
		assertAction(instructionFragmentDecision, 'done')
		if (
			instructionFragmentDecision.action.input.success !== false ||
			instructionFragmentDecision.action.input.workflow_missing_table_samples !== true ||
			String(instructionFragmentDecision.action.input.workflow_test_value || '').includes(scenario.leaked) ||
			String(instructionFragmentDecision.action.input.text || '').includes(scenario.leaked)
		) {
			throw new Error(`search workflow should not treat task instruction fragments as explicit search values, got ${JSON.stringify(instructionFragmentDecision)}`)
		}
	}
	const explicitInstructionLikeValueDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项，标题是搜索功能', latestTask: '测试搜索区域每一个搜索项，标题是搜索功能', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '标题' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 38, label: '标题', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
			],
		}
	)
	assertAction(explicitInstructionLikeValueDecision, 'input_text')
	if (
		explicitInstructionLikeValueDecision.action.input.text !== '搜索功能' ||
		explicitInstructionLikeValueDecision.action.input.workflow_value_source !== 'task_value'
	) {
		throw new Error(`search workflow should still use instruction-like values when the user explicitly assigns them, got ${JSON.stringify(explicitInstructionLikeValueDecision)}`)
	}
	const explicitPhoneDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项，联系方式是145555555', latestTask: '测试搜索区域每一个搜索项，联系方式是145555555', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '联系方式' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 33, label: '联系方式', fieldType: 'phone', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 44, actionIntent: 'search', label: '搜索', region: 'content' },
			],
		}
	)
	assertAction(explicitPhoneDecision, 'input_text')
	if (
		explicitPhoneDecision.action.input.text !== '145555555' ||
		explicitPhoneDecision.action.input.workflow_value_source !== 'task_value'
	) {
		throw new Error(`format-like search fields should use explicit task values when provided, got ${JSON.stringify(explicitPhoneDecision)}`)
	}
	const applyFilterSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const applyFilterObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'button', label: '应用筛选', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const applyFilterFillDecision = workflow.deriveSearchWorkflowDecision(applyFilterSession, applyFilterObservation)
	assertAction(applyFilterFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(applyFilterSession, applyFilterFillDecision, { success: true, output: '已输入。' })
	const applyFilterSubmitDecision = workflow.deriveSearchWorkflowDecision(applyFilterSession, applyFilterObservation)
	assertAction(applyFilterSubmitDecision, 'click_element_by_index')
	if (
		applyFilterSubmitDecision.action.input.index !== 18 ||
		applyFilterSubmitDecision.action.input.target_label !== '应用筛选' ||
		applyFilterSubmitDecision.action.input.workflow_step !== 'submit_search'
	) {
		throw new Error(`search workflow should recognize apply-filter buttons as search submit actions, got ${JSON.stringify(applyFilterSubmitDecision)}`)
	}
	const compactApplySession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const compactApplyObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Company' },
		],
		forms: [
			{
				id: 'filter',
				name: 'Filters',
				fields: [
					{ index: 12, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content', rect: { left: 80, top: 40, width: 180, height: 32 } },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'button', label: 'Apply', region: 'content', rect: { left: 280, top: 42, width: 76, height: 32 } },
			{ index: 19, actionIntent: 'reset', label: 'Clear filters', region: 'content', rect: { left: 364, top: 42, width: 108, height: 32 } },
		],
		tables: [
			{ headers: ['Company', 'Phone'], rows: [['Acme Corp LLC', '13800138000']] },
		],
	}
	const compactApplyFillDecision = workflow.deriveSearchWorkflowDecision(compactApplySession, compactApplyObservation)
	assertAction(compactApplyFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(compactApplySession, compactApplyFillDecision, { success: true, output: '已输入。' })
	const compactApplySubmitDecision = workflow.deriveSearchWorkflowDecision(compactApplySession, compactApplyObservation)
	assertAction(compactApplySubmitDecision, 'click_element_by_index')
	if (
		compactApplySubmitDecision.action.input.index !== 18 ||
		compactApplySubmitDecision.action.input.target_label !== 'Apply' ||
		compactApplySubmitDecision.action.input.workflow_step !== 'submit_search'
	) {
		throw new Error(`search workflow should recognize compact Apply buttons near filter fields as submit actions, got ${JSON.stringify(compactApplySubmitDecision)}`)
	}
	for (const label of ['确定', 'OK']) {
		const confirmSubmitSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
		const confirmSubmitObservation = {
			panels: [
				{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Company' },
			],
			forms: [
				{
					id: 'filter',
					name: 'Filters',
					fields: [
						{ index: 12, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content', rect: { left: 80, top: 40, width: 180, height: 32 } },
					],
				},
			],
			actions: [
				{ index: 18, actionIntent: 'button', label, region: 'content', rect: { left: 280, top: 42, width: 76, height: 32 } },
				{ index: 19, actionIntent: 'reset', label: 'Clear filters', region: 'content', rect: { left: 364, top: 42, width: 108, height: 32 } },
			],
			tables: [
				{ headers: ['Company', 'Phone'], rows: [['Acme Corp LLC', '13800138000']] },
			],
		}
		const confirmSubmitFillDecision = workflow.deriveSearchWorkflowDecision(confirmSubmitSession, confirmSubmitObservation)
		assertAction(confirmSubmitFillDecision, 'input_text')
		workflow.recordSearchWorkflowOutcome(confirmSubmitSession, confirmSubmitFillDecision, { success: true, output: '已输入。' })
		const confirmSubmitDecision = workflow.deriveSearchWorkflowDecision(confirmSubmitSession, confirmSubmitObservation)
		assertAction(confirmSubmitDecision, 'click_element_by_index')
		if (
			confirmSubmitDecision.action.input.index !== 18 ||
			confirmSubmitDecision.action.input.target_label !== label ||
			confirmSubmitDecision.action.input.workflow_step !== 'submit_search'
		) {
			throw new Error(`search workflow should recognize spatially scoped ${label} buttons as submit actions, got ${JSON.stringify(confirmSubmitDecision)}`)
		}
	}
	for (const label of ['查找', '检索', 'Go', 'Run', '提交']) {
		const compactVerbSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
		const compactVerbObservation = {
			panels: [
				{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Company' },
			],
			forms: [
				{
					id: 'filter',
					name: 'Filters',
					fields: [
						{ index: 12, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content', rect: { left: 80, top: 40, width: 180, height: 32 } },
					],
				},
			],
			actions: [
				{ index: 18, actionIntent: 'button', label, region: 'content', rect: { left: 280, top: 42, width: 76, height: 32 } },
				{ index: 19, actionIntent: 'reset', label: 'Clear filters', region: 'content', rect: { left: 364, top: 42, width: 108, height: 32 } },
			],
			tables: [
				{ headers: ['Company', 'Phone'], rows: [['Acme Corp LLC', '13800138000']] },
			],
		}
		const compactVerbFillDecision = workflow.deriveSearchWorkflowDecision(compactVerbSession, compactVerbObservation)
		assertAction(compactVerbFillDecision, 'input_text')
		workflow.recordSearchWorkflowOutcome(compactVerbSession, compactVerbFillDecision, { success: true, output: '已输入。' })
		const compactVerbSubmitDecision = workflow.deriveSearchWorkflowDecision(compactVerbSession, compactVerbObservation)
		assertAction(compactVerbSubmitDecision, 'click_element_by_index')
		if (
			compactVerbSubmitDecision.action.input.index !== 18 ||
			compactVerbSubmitDecision.action.input.target_label !== label ||
			compactVerbSubmitDecision.action.input.workflow_step !== 'submit_search'
		) {
			throw new Error(`search workflow should recognize compact ${label} buttons near filter fields as submit actions, got ${JSON.stringify(compactVerbSubmitDecision)}`)
		}
	}
	const applyCouponSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const applyCouponObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Company' },
		],
		forms: [
			{
				id: 'filter',
				name: 'Filters',
				fields: [
					{ index: 12, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content', rect: { left: 80, top: 40, width: 180, height: 32 } },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'button', label: 'Apply coupon', region: 'content', rect: { left: 280, top: 42, width: 120, height: 32 } },
			{ index: 19, actionIntent: 'reset', label: 'Clear filters', region: 'content', rect: { left: 408, top: 42, width: 108, height: 32 } },
		],
		tables: [
			{ headers: ['Company', 'Phone'], rows: [['Acme Corp LLC', '13800138000']] },
		],
	}
	const applyCouponFillDecision = workflow.deriveSearchWorkflowDecision(applyCouponSession, applyCouponObservation)
	assertAction(applyCouponFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(applyCouponSession, applyCouponFillDecision, { success: true, output: '已输入。' })
	const applyCouponSubmitDecision = workflow.deriveSearchWorkflowDecision(applyCouponSession, applyCouponObservation)
	assertAction(applyCouponSubmitDecision, 'done')
	if (
		applyCouponSubmitDecision.action.input.success !== false ||
		applyCouponSubmitDecision.action.input.workflow_submit_action_missing !== true
	) {
		throw new Error(`search workflow should not treat unrelated Apply-* buttons as search submit actions, got ${JSON.stringify(applyCouponSubmitDecision)}`)
	}
	const dangerousConfirmSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const dangerousConfirmObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Company' },
		],
		forms: [
			{
				id: 'filter',
				name: 'Filters',
				fields: [
					{ index: 12, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content', rect: { left: 80, top: 40, width: 180, height: 32 } },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'button', label: '确认删除', region: 'content', rect: { left: 280, top: 42, width: 96, height: 32 } },
			{ index: 19, actionIntent: 'reset', label: 'Clear filters', region: 'content', rect: { left: 384, top: 42, width: 108, height: 32 } },
		],
		tables: [
			{ headers: ['Company', 'Phone'], rows: [['Acme Corp LLC', '13800138000']] },
		],
	}
	const dangerousConfirmFillDecision = workflow.deriveSearchWorkflowDecision(dangerousConfirmSession, dangerousConfirmObservation)
	assertAction(dangerousConfirmFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(dangerousConfirmSession, dangerousConfirmFillDecision, { success: true, output: '已输入。' })
	const dangerousConfirmSubmitDecision = workflow.deriveSearchWorkflowDecision(dangerousConfirmSession, dangerousConfirmObservation)
	assertAction(dangerousConfirmSubmitDecision, 'done')
	if (
		dangerousConfirmSubmitDecision.action.input.success !== false ||
		dangerousConfirmSubmitDecision.action.input.workflow_submit_action_missing !== true
	) {
		throw new Error(`search workflow should not treat dangerous confirmation buttons as search submit actions, got ${JSON.stringify(dangerousConfirmSubmitDecision)}`)
	}
	const navigationGoSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const navigationGoObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Company' },
		],
		forms: [
			{
				id: 'filter',
				name: 'Filters',
				fields: [
					{ index: 12, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content', rect: { left: 80, top: 40, width: 180, height: 32 } },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'button', label: 'Go to details', region: 'content', rect: { left: 280, top: 42, width: 120, height: 32 } },
			{ index: 19, actionIntent: 'reset', label: 'Clear filters', region: 'content', rect: { left: 408, top: 42, width: 108, height: 32 } },
		],
		tables: [
			{ headers: ['Company', 'Phone'], rows: [['Acme Corp LLC', '13800138000']] },
		],
	}
	const navigationGoFillDecision = workflow.deriveSearchWorkflowDecision(navigationGoSession, navigationGoObservation)
	assertAction(navigationGoFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(navigationGoSession, navigationGoFillDecision, { success: true, output: '已输入。' })
	const navigationGoSubmitDecision = workflow.deriveSearchWorkflowDecision(navigationGoSession, navigationGoObservation)
	assertAction(navigationGoSubmitDecision, 'done')
	if (
		navigationGoSubmitDecision.action.input.success !== false ||
		navigationGoSubmitDecision.action.input.workflow_submit_action_missing !== true
	) {
		throw new Error(`search workflow should not treat navigational Go-* buttons as search submit actions, got ${JSON.stringify(navigationGoSubmitDecision)}`)
	}
	const titleSubmitSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const titleSubmitObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'button', label: '', title: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'button', label: '', ariaLabel: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const titleSubmitFillDecision = workflow.deriveSearchWorkflowDecision(titleSubmitSession, titleSubmitObservation)
	assertAction(titleSubmitFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(titleSubmitSession, titleSubmitFillDecision, { success: true, output: '已输入。' })
	const titleSubmitDecision = workflow.deriveSearchWorkflowDecision(titleSubmitSession, titleSubmitObservation)
	assertAction(titleSubmitDecision, 'click_element_by_index')
	if (
		titleSubmitDecision.action.input.index !== 18 ||
		titleSubmitDecision.action.input.target_label !== '搜索' ||
		titleSubmitDecision.action.input.workflow_step !== 'submit_search'
	) {
		throw new Error(`search workflow should recognize icon-only/title-labelled submit buttons, got ${JSON.stringify(titleSubmitDecision)}`)
	}
	const criteriaResetSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const criteriaResetObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Company' },
		],
		forms: [
			{
				id: 'filter',
				name: 'Filters',
				fields: [
					{ index: 12, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content', rect: { left: 80, top: 40, width: 180, height: 32 } },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'button', label: 'Search', region: 'content', rect: { left: 280, top: 42, width: 76, height: 32 } },
			{ index: 19, actionIntent: 'button', label: 'Clear criteria', region: 'content', rect: { left: 364, top: 42, width: 118, height: 32 } },
		],
		tables: [
			{ headers: ['Company', 'Phone'], rows: [['Acme Corp LLC', '13800138000']] },
		],
	}
	const criteriaFillDecision = workflow.deriveSearchWorkflowDecision(criteriaResetSession, criteriaResetObservation)
	assertAction(criteriaFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(criteriaResetSession, criteriaFillDecision, { success: true, output: '已输入。' })
	const criteriaSubmitDecision = workflow.deriveSearchWorkflowDecision(criteriaResetSession, criteriaResetObservation)
	assertAction(criteriaSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(criteriaResetSession, criteriaSubmitDecision, { success: true, output: '已搜索。' })
	const criteriaResetDecision = workflow.deriveSearchWorkflowDecision(criteriaResetSession, criteriaResetObservation)
	assertAction(criteriaResetDecision, 'click_element_by_index')
	if (
		criteriaResetDecision.action.input.index !== 19 ||
		criteriaResetDecision.action.input.target_label !== 'Clear criteria' ||
		criteriaResetDecision.action.input.workflow_step !== 'reset_filters'
	) {
		throw new Error(`search workflow should recognize clear/reset criteria controls as filter reset actions, got ${JSON.stringify(criteriaResetDecision)}`)
	}
	const hintedResetSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const hintedResetObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Company' },
		],
		forms: [
			{
				id: 'filter',
				name: 'Filters',
				fields: [
					{ index: 12, label: 'Company', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content', rect: { left: 80, top: 40, width: 180, height: 32 } },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: 'Search', region: 'content', rect: { left: 280, top: 42, width: 76, height: 32 } },
			{
				index: 19,
				actionIntent: 'button',
				label: '',
				text: '',
				region: 'content',
				rect: { left: 364, top: 42, width: 36, height: 32 },
				selectorHints: {
					testId: 'clear-filters',
					className: 'toolbar-icon clear-filters',
				},
			},
		],
		tables: [
			{ headers: ['Company', 'Phone'], rows: [['Acme Corp LLC', '13800138000']] },
		],
	}
	const hintedFillDecision = workflow.deriveSearchWorkflowDecision(hintedResetSession, hintedResetObservation)
	assertAction(hintedFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(hintedResetSession, hintedFillDecision, { success: true, output: '已输入。' })
	const hintedSubmitDecision = workflow.deriveSearchWorkflowDecision(hintedResetSession, hintedResetObservation)
	assertAction(hintedSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(hintedResetSession, hintedSubmitDecision, { success: true, output: '已搜索。' })
	const hintedResetDecision = workflow.deriveSearchWorkflowDecision(hintedResetSession, hintedResetObservation)
	assertAction(hintedResetDecision, 'click_element_by_index')
	if (
		hintedResetDecision.action.input.index !== 19 ||
		hintedResetDecision.action.input.workflow_step !== 'reset_filters'
	) {
		throw new Error(`search workflow should recognize icon-only clear/reset controls from selector hints, got ${JSON.stringify(hintedResetDecision)}`)
	}
	const missingSubmitSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const missingSubmitObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const missingSubmitFillDecision = workflow.deriveSearchWorkflowDecision(missingSubmitSession, missingSubmitObservation)
	assertAction(missingSubmitFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(missingSubmitSession, missingSubmitFillDecision, { success: true, output: '已输入。' })
	const missingSubmitHints = workflow.buildSearchWorkflowHintLines(missingSubmitSession, missingSubmitObservation).join('\n')
	for (const expected of [
		'search_submit_requirement',
		'status="submit_action_missing"',
		'context="after_field_value"',
		'fields="公司名称"',
		'testValue="星火科技有限公司"',
		'request_context source=actions',
		'不要跳过提交验证',
	]) {
		if (!missingSubmitHints.includes(expected)) {
			throw new Error(`search workflow should expose missing submit controls after field value is set: missing ${expected}, got ${missingSubmitHints}`)
		}
	}
	const missingSubmitDecision = workflow.deriveSearchWorkflowDecision(missingSubmitSession, missingSubmitObservation)
	assertAction(missingSubmitDecision, 'done')
	if (
		missingSubmitDecision.action.input.success !== false ||
		missingSubmitDecision.action.input.workflow_submit_action_missing !== true ||
		missingSubmitDecision.action.input.workflow_submit_context !== 'after_field_value' ||
		missingSubmitDecision.action.input.workflow_test_value !== '星火科技有限公司' ||
		!String(missingSubmitDecision.action.input.text || '').includes('提交验证')
	) {
		throw new Error(`search workflow should stop with structured missing-submit diagnostics after field value is set, got ${JSON.stringify(missingSubmitDecision)}`)
	}
	const missingResetAfterSubmitSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const missingResetAfterSubmitObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const missingResetFillDecision = workflow.deriveSearchWorkflowDecision(missingResetAfterSubmitSession, missingResetAfterSubmitObservation)
	assertAction(missingResetFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(missingResetAfterSubmitSession, missingResetFillDecision, { success: true, output: '已输入。' })
	const missingResetSubmitDecision = workflow.deriveSearchWorkflowDecision(missingResetAfterSubmitSession, missingResetAfterSubmitObservation)
	assertAction(missingResetSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(missingResetAfterSubmitSession, missingResetSubmitDecision, { success: true, output: '已搜索。' })
	const missingResetAfterSubmitHints = workflow.buildSearchWorkflowHintLines(missingResetAfterSubmitSession, missingResetAfterSubmitObservation).join('\n')
	for (const expected of [
		'search_reset_requirement',
		'status="field_clear_fallback_available"',
		'context="after_submit"',
		'fields="公司名称"',
		'clearableFields="公司名称"',
		'字段级置空兜底',
		'不要猜测清空',
	]) {
		if (!missingResetAfterSubmitHints.includes(expected)) {
			throw new Error(`search workflow should expose missing reset controls after submit: missing ${expected}, got ${missingResetAfterSubmitHints}`)
		}
	}
	const missingResetAfterSubmitDecision = workflow.deriveSearchWorkflowDecision(missingResetAfterSubmitSession, missingResetAfterSubmitObservation)
	assertAction(missingResetAfterSubmitDecision, 'input_text')
	if (
		missingResetAfterSubmitDecision.action.input.index !== 12 ||
		missingResetAfterSubmitDecision.action.input.text !== '' ||
		missingResetAfterSubmitDecision.action.input.workflow_step !== 'clear_field' ||
		missingResetAfterSubmitDecision.action.input.workflow_field_clear !== true ||
		missingResetAfterSubmitDecision.action.input.workflow_clear_context !== 'after_submit' ||
		missingResetAfterSubmitDecision.action.input.workflow_filled_fields !== '公司名称' ||
		missingResetAfterSubmitDecision.action.input.workflow_result_status !== 'passed_match'
	) {
		throw new Error(`search workflow should clear a plain text field when reset is missing after submit, got ${JSON.stringify(missingResetAfterSubmitDecision)}`)
	}
	workflow.recordSearchWorkflowOutcome(missingResetAfterSubmitSession, missingResetAfterSubmitDecision, { success: true, output: '已字段级清空。' })
	const missingResetDoneDecision = workflow.deriveSearchWorkflowDecision(missingResetAfterSubmitSession, missingResetAfterSubmitObservation)
	assertAction(missingResetDoneDecision, 'done')
	if (
		missingResetDoneDecision.action.input.success !== true ||
		!String(missingResetDoneDecision.action.input.workflow_result_summary || '').includes('公司名称=通过')
	) {
		throw new Error(`search workflow should mark field-clear fallback as completing the current search field, got ${JSON.stringify(missingResetDoneDecision)}`)
	}
	const ineffectiveResetAfterSubmitSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const ineffectiveResetInitialObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const ineffectiveResetAfterSubmitObservation = {
		...ineffectiveResetInitialObservation,
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'filled:星火科技有限公司', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
	}
	const ineffectiveResetFillDecision = workflow.deriveSearchWorkflowDecision(ineffectiveResetAfterSubmitSession, ineffectiveResetInitialObservation)
	assertAction(ineffectiveResetFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(ineffectiveResetAfterSubmitSession, ineffectiveResetFillDecision, { success: true, output: '已输入。' })
	const ineffectiveResetSubmitDecision = workflow.deriveSearchWorkflowDecision(ineffectiveResetAfterSubmitSession, ineffectiveResetInitialObservation)
	assertAction(ineffectiveResetSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(ineffectiveResetAfterSubmitSession, ineffectiveResetSubmitDecision, { success: true, output: '已搜索。' })
	const ineffectiveResetClickDecision = workflow.deriveSearchWorkflowDecision(ineffectiveResetAfterSubmitSession, ineffectiveResetAfterSubmitObservation)
	assertAction(ineffectiveResetClickDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(ineffectiveResetAfterSubmitSession, ineffectiveResetClickDecision, {
		success: false,
		output: 'search_reset_field_not_cleared: 搜索重置后已知筛选字段仍未清空',
		outcome: { kind: 'no_effect', reason: 'search_reset_field_not_cleared' },
	})
	const ineffectiveResetFallbackDecision = workflow.deriveSearchWorkflowDecision(ineffectiveResetAfterSubmitSession, ineffectiveResetAfterSubmitObservation)
	assertAction(ineffectiveResetFallbackDecision, 'input_text')
	if (
		ineffectiveResetFallbackDecision.action.input.index !== 12 ||
		ineffectiveResetFallbackDecision.action.input.text !== '' ||
		ineffectiveResetFallbackDecision.action.input.workflow_step !== 'clear_field' ||
		ineffectiveResetFallbackDecision.action.input.workflow_clear_context !== 'clear_retry' ||
		ineffectiveResetFallbackDecision.action.input.workflow_reset_ineffective !== true ||
		ineffectiveResetFallbackDecision.action.input.workflow_reset_action_index !== 19 ||
		ineffectiveResetFallbackDecision.action.input.workflow_result_status !== 'passed_match' ||
		!/按钮复核未通过/.test(String(ineffectiveResetFallbackDecision.evaluation_previous_goal || ''))
	) {
		throw new Error(`search workflow should field-clear plain text filters after an ineffective reset button, got ${JSON.stringify(ineffectiveResetFallbackDecision)}`)
	}
	const resultSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const resultObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const resultFillDecision = workflow.deriveSearchWorkflowDecision(resultSession, resultObservation)
	assertAction(resultFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(resultSession, resultFillDecision, { success: true, output: '已输入。' })
	const resultSubmitDecision = workflow.deriveSearchWorkflowDecision(resultSession, resultObservation)
	assertAction(resultSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(resultSession, resultSubmitDecision, { success: true, output: '已搜索。' })
	const resultResetDecision = workflow.deriveSearchWorkflowDecision(resultSession, resultObservation)
	assertAction(resultResetDecision, 'click_element_by_index')
	if (!String(resultResetDecision.memory || '').includes('仍能看到测试值 "星火科技有限公司"')) {
		throw new Error(`search workflow should summarize observed search result before reset, got ${JSON.stringify(resultResetDecision)}`)
	}
	if (resultResetDecision.action.input.workflow_result_status !== 'passed_match') {
		throw new Error(`search workflow should mark matched table-sample results as passed before reset, got ${JSON.stringify(resultResetDecision)}`)
	}
	const formattedResultSession = {
		task: 'Test every search field in the filter area',
		history: [],
		workflowState: {
			search: {
				version: 6,
				phase: 'awaiting_reset',
				activeFieldKey: 'index:21',
				lastSearchedFieldKey: 'index:21',
				fieldOrder: ['index:21'],
				completedKeys: [],
				fields: {
					'index:21': {
						key: 'index:21',
						index: 21,
						label: 'Phone',
						lastTestValue: '5550100',
						lastValueSource: 'table_sample',
					},
				},
				resultsByKey: {},
			},
		},
	}
	const formattedResultObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: 'Filters', fields: 'Phone' },
		],
		forms: [
			{
				id: 'filter',
				name: 'Filters',
				fields: [
					{ index: 21, label: 'Phone', fieldType: 'phone', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 31, actionIntent: 'search', label: 'Search', region: 'content' },
			{ index: 32, actionIntent: 'reset', label: 'Clear', region: 'content' },
		],
		tables: [
			{ headers: ['Phone', 'Company'], rows: [['555-0100', 'Acme Corp LLC']] },
		],
	}
	const formattedResultResetDecision = workflow.deriveSearchWorkflowDecision(formattedResultSession, formattedResultObservation)
	assertAction(formattedResultResetDecision, 'click_element_by_index')
	if (
		formattedResultResetDecision.action.input.workflow_result_status !== 'passed_match' ||
		formattedResultResetDecision.action.input.index !== 32
	) {
		throw new Error(`search workflow should verify formatted numeric/code results before reset, got ${JSON.stringify(formattedResultResetDecision)}`)
	}
	const formattedMismatchSession = JSON.parse(JSON.stringify(formattedResultSession))
	const formattedMismatchObservation = {
		...formattedResultObservation,
		tables: [
			{ headers: ['Phone', 'Company'], rows: [['555-0101', 'Acme Corp LLC']] },
		],
	}
	const formattedMismatchResetDecision = workflow.deriveSearchWorkflowDecision(formattedMismatchSession, formattedMismatchObservation)
	assertAction(formattedMismatchResetDecision, 'click_element_by_index')
	if (formattedMismatchResetDecision.action.input.workflow_result_status === 'passed_match') {
		throw new Error(`search workflow format-insensitive matching should not pass adjacent mismatched values, got ${JSON.stringify(formattedMismatchResetDecision)}`)
	}
	const rawTextRowResultSession = {
		task: '测试搜索区域每一个搜索项',
		history: [],
		workflowState: {
			search: {
				version: 6,
				phase: 'awaiting_reset',
				activeFieldKey: 'index:12',
				lastSearchedFieldKey: 'index:12',
				fieldOrder: ['index:12'],
				completedKeys: [],
				fields: {
					'index:12': {
						key: 'index:12',
						index: 12,
						label: '公司名称',
						lastTestValue: 'llm自然语言识别新增客户2',
						lastValueSource: 'table_sample',
					},
				},
				resultsByKey: {},
			},
		},
	}
	const rawTextRowResultObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [],
		rawCandidates: [
			'<div class="el-table__row"><span class="cell">公司名称：llm自然语言识别新增客户2</span><span class="cell">操作 详情 删除</span></div>',
		],
	}
	const rawTextRowResetDecision = workflow.deriveSearchWorkflowDecision(rawTextRowResultSession, rawTextRowResultObservation)
	assertAction(rawTextRowResetDecision, 'click_element_by_index')
	if (
		rawTextRowResetDecision.action.input.workflow_result_status !== 'passed_match' ||
		!String(rawTextRowResetDecision.action.input.workflow_result_summary || '').includes('未拿到结构化表格摘要') ||
		!String(rawTextRowResetDecision.action.input.workflow_result_summary || '').includes('llm自然语言识别新增客户2')
	) {
		throw new Error(`search workflow should treat table-like raw rows as evidence even when data text contains create/action words, got ${JSON.stringify(rawTextRowResetDecision)}`)
	}
	const dateRangeResultSession = {
		task: '测试搜索区域每一个搜索项',
		history: [],
		workflowState: {
			search: {
				version: 6,
				phase: 'awaiting_reset',
				activeFieldKey: 'index:27',
				lastSearchedFieldKey: 'index:27',
				fieldOrder: ['index:27'],
				completedKeys: [],
				fields: {
					'index:27': {
						key: 'index:27',
						index: 27,
						label: '创建时间',
						fieldType: 'daterange',
						lastTestValue: '2026-06-01..2026-06-03',
						lastValueSource: 'table_sample',
					},
				},
				resultsByKey: {},
			},
		},
	}
	const dateRangeResultObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '创建时间' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 27, label: '创建时间', fieldType: 'daterange', valueState: 'selected:2026-06-01 - 2026-06-03', role: 'combobox', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['创建时间', '公司名称'], rows: [['2026-06-02 09:10:00', '星火科技有限公司']] },
		],
	}
	const dateRangeResetDecision = workflow.deriveSearchWorkflowDecision(dateRangeResultSession, dateRangeResultObservation)
	assertAction(dateRangeResetDecision, 'click_element_by_index')
	if (
		dateRangeResetDecision.action.input.workflow_result_status !== 'passed_match' ||
		!String(dateRangeResetDecision.action.input.workflow_result_summary || '').includes('2026-06-01..2026-06-03')
	) {
		throw new Error(`date range search results should pass when a result date falls inside the submitted range, got ${JSON.stringify(dateRangeResetDecision)}`)
	}
	const outOfRangeResultSession = JSON.parse(JSON.stringify(dateRangeResultSession))
	const outOfRangeResultObservation = {
		...dateRangeResultObservation,
		tables: [
			{ headers: ['创建时间', '公司名称'], rows: [['2026-06-08 09:10:00', '星火科技有限公司']] },
		],
	}
	const outOfRangeResetDecision = workflow.deriveSearchWorkflowDecision(outOfRangeResultSession, outOfRangeResultObservation)
	assertAction(outOfRangeResetDecision, 'click_element_by_index')
	if (outOfRangeResetDecision.action.input.workflow_result_status === 'passed_match') {
		throw new Error(`date range search results should not pass when visible result dates are outside the submitted range, got ${JSON.stringify(outOfRangeResetDecision)}`)
	}
	workflow.recordSearchWorkflowOutcome(resultSession, resultResetDecision, { success: true, output: '已清空。' })
	const resultDoneDecision = workflow.deriveSearchWorkflowDecision(resultSession, resultObservation)
	assertAction(resultDoneDecision, 'done')
	if (
		resultDoneDecision.action.input.success !== true ||
		!String(resultDoneDecision.action.input.text || '').includes('共 1 项') ||
		!String(resultDoneDecision.action.input.text || '').includes('通过 1 项') ||
		!String(resultDoneDecision.action.input.text || '').includes('结果汇总') ||
		!String(resultDoneDecision.action.input.workflow_result_summary || '').includes('公司名称=通过') ||
		!String(resultDoneDecision.action.input.workflow_result_summary || '').includes('值=星火科技有限公司') ||
		!String(resultDoneDecision.action.input.workflow_result_summary || '').includes('来源=列表样本')
	) {
		throw new Error(`search workflow should finish with a passing evidence-rich per-field summary, got ${JSON.stringify(resultDoneDecision)}`)
	}
	const missingResultSession = {
		task: '测试搜索区域每一个搜索项',
		history: [],
		workflowState: {
			search: {
				version: 6,
				phase: 'select_field',
				baselineResetDone: true,
				fieldOrder: ['index:12', 'index:13'],
				completedKeys: ['index:12', 'index:13'],
				resetCompletedKeys: ['index:12', 'index:13'],
				fields: {
					'index:12': { key: 'index:12', index: 12, label: '公司名称' },
					'index:13': { key: 'index:13', index: 13, label: '联系方式' },
				},
				resultsByKey: {
					'index:12': {
						key: 'index:12',
						label: '公司名称',
						value: '星火科技有限公司',
						source: 'table_sample',
						status: 'passed_match',
						summary: '搜索结果观察：结果列表中仍能看到测试值 "星火科技有限公司"。',
					},
				},
				clearRetryAttemptsByKey: {},
				failedLabelsByKey: {},
				dropdownOpenAttemptsByKey: {},
			},
		},
	}
	const missingResultObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称 联系方式' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					{ index: 13, label: '联系方式', fieldType: 'phone', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const compositePanelFields = workflow.collectSearchFields(missingResultObservation)
	if (
		compositePanelFields.map((field) => field.searchLabel || field.label).join('|') !== '公司名称|联系方式'
	) {
		throw new Error(`search workflow should not let a composite panel label overwrite individual field labels, got ${JSON.stringify(compositePanelFields)}`)
	}
	const missingResultDoneDecision = workflow.deriveSearchWorkflowDecision(missingResultSession, missingResultObservation)
	assertAction(missingResultDoneDecision, 'done')
	if (
		missingResultDoneDecision.action.input.success !== false ||
		missingResultDoneDecision.action.input.workflow_result_status !== 'inconclusive' ||
		!String(missingResultDoneDecision.action.input.text || '').includes('未确认 1 项') ||
		!String(missingResultDoneDecision.action.input.text || '').includes('重点问题') ||
		!String(missingResultDoneDecision.action.input.workflow_result_summary || '').includes('联系方式=未确认:缺少结果记录') ||
		!String(missingResultDoneDecision.action.input.workflow_result_summary || '').includes('未记录提交后结果')
	) {
		throw new Error(`search workflow should fail inconclusively when any completed field lacks a result record, got ${JSON.stringify(missingResultDoneDecision)}`)
	}
	const wrongColumnResultSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const wrongColumnBeforeObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '备注'], rows: [['星火科技有限公司', '老资料']] },
		],
	}
	const wrongColumnAfterObservation = {
		...wrongColumnBeforeObservation,
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'filled:星火科技有限公司', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		tables: [
			{ headers: ['公司名称', '备注'], rows: [['银河贸易有限公司', '星火科技有限公司']] },
		],
	}
	const wrongColumnFillDecision = workflow.deriveSearchWorkflowDecision(wrongColumnResultSession, wrongColumnBeforeObservation)
	assertAction(wrongColumnFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(wrongColumnResultSession, wrongColumnFillDecision, { success: true, output: '已输入。' })
	const wrongColumnSubmitDecision = workflow.deriveSearchWorkflowDecision(wrongColumnResultSession, wrongColumnBeforeObservation)
	assertAction(wrongColumnSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(wrongColumnResultSession, wrongColumnSubmitDecision, { success: true, output: '已搜索。' })
	const wrongColumnResetDecision = workflow.deriveSearchWorkflowDecision(wrongColumnResultSession, wrongColumnAfterObservation)
	assertAction(wrongColumnResetDecision, 'click_element_by_index')
	if (
		wrongColumnResetDecision.action.input.workflow_result_status !== 'failed_value_missing' ||
		!String(wrongColumnResetDecision.memory || '').includes('未在可读表格摘要中确认测试值')
	) {
		throw new Error(`search workflow should require matched-column results when table headers identify the field, got ${JSON.stringify(wrongColumnResetDecision)}`)
	}
	const numericResultSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const numericBeforeObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '编号' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 22, label: '编号', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['编号', '名称'], rows: [['10', '样例']] },
		],
	}
	const numericAfterObservation = {
		...numericBeforeObservation,
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 22, label: '编号', fieldType: 'unknown', valueState: 'filled:10', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		tables: [
			{ headers: ['编号', '名称'], rows: [['110', '样例']] },
		],
	}
	const numericFillDecision = workflow.deriveSearchWorkflowDecision(numericResultSession, numericBeforeObservation)
	assertAction(numericFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(numericResultSession, numericFillDecision, { success: true, output: '已输入。' })
	const numericSubmitDecision = workflow.deriveSearchWorkflowDecision(numericResultSession, numericBeforeObservation)
	assertAction(numericSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(numericResultSession, numericSubmitDecision, { success: true, output: '已搜索。' })
	const numericResetDecision = workflow.deriveSearchWorkflowDecision(numericResultSession, numericAfterObservation)
	assertAction(numericResetDecision, 'click_element_by_index')
	if (
		numericResetDecision.action.input.workflow_result_status !== 'failed_value_missing' ||
		String(numericResetDecision.memory || '').includes('仍能看到测试值 "10"')
	) {
		throw new Error(`search result verification should not pass numeric substring matches such as 10 in 110, got ${JSON.stringify(numericResetDecision)}`)
	}
	const unclearedResetSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const unclearedBaseObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const unclearedFilledObservation = {
		...unclearedBaseObservation,
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'filled:星火科技有限公司', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
	}
	const unclearedFillDecision = workflow.deriveSearchWorkflowDecision(unclearedResetSession, unclearedBaseObservation)
	assertAction(unclearedFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(unclearedResetSession, unclearedFillDecision, { success: true, output: '已输入。' })
	const unclearedSubmitDecision = workflow.deriveSearchWorkflowDecision(unclearedResetSession, unclearedBaseObservation)
	assertAction(unclearedSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(unclearedResetSession, unclearedSubmitDecision, { success: true, output: '已搜索。' })
	const unclearedResetDecision = workflow.deriveSearchWorkflowDecision(unclearedResetSession, unclearedBaseObservation)
	assertAction(unclearedResetDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(unclearedResetSession, unclearedResetDecision, { success: true, output: '已清空。' })
	const retryClearDecision = workflow.deriveSearchWorkflowDecision(unclearedResetSession, unclearedFilledObservation)
	assertAction(retryClearDecision, 'click_element_by_index')
	if (
		retryClearDecision.action.input.workflow_clear_retry !== true ||
		retryClearDecision.action.input.workflow_clear_retry_count !== 1 ||
		!String(retryClearDecision.memory || '').includes('仍未清空')
	) {
		throw new Error(`search workflow should retry reset when completed filters remain filled, got ${JSON.stringify(retryClearDecision)}`)
	}
	workflow.recordSearchWorkflowOutcome(unclearedResetSession, retryClearDecision, { success: true, output: '已再次清空。' })
	const retryClearDecision2 = workflow.deriveSearchWorkflowDecision(unclearedResetSession, unclearedFilledObservation)
	assertAction(retryClearDecision2, 'input_text')
	if (
		retryClearDecision2.action.input.index !== 12 ||
		retryClearDecision2.action.input.text !== '' ||
		retryClearDecision2.action.input.workflow_step !== 'clear_field' ||
		retryClearDecision2.action.input.workflow_clear_context !== 'clear_retry' ||
		retryClearDecision2.action.input.workflow_reset_ineffective !== true ||
		retryClearDecision2.action.input.workflow_clear_retry_count !== 1
	) {
		throw new Error(`search workflow should switch to field-level clear after a reset button leaves a plain text field filled, got ${JSON.stringify(retryClearDecision2)}`)
	}
	workflow.recordSearchWorkflowOutcome(unclearedResetSession, retryClearDecision2, { success: true, output: '已字段级清空。' })
	const unclearedFailureDecision = workflow.deriveSearchWorkflowDecision(unclearedResetSession, unclearedBaseObservation)
	assertAction(unclearedFailureDecision, 'done')
	if (
		unclearedFailureDecision.action.input.success !== true ||
		!String(unclearedFailureDecision.action.input.workflow_result_summary || '').includes('公司名称=通过')
	) {
		throw new Error(`search workflow should complete after field-level clear recovers an uncleared plain text field, got ${JSON.stringify(unclearedFailureDecision)}`)
	}
	const failedResetRetrySession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const failedResetFillDecision = workflow.deriveSearchWorkflowDecision(failedResetRetrySession, unclearedBaseObservation)
	assertAction(failedResetFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(failedResetRetrySession, failedResetFillDecision, { success: true, output: '已输入。' })
	const failedResetSubmitDecision = workflow.deriveSearchWorkflowDecision(failedResetRetrySession, unclearedBaseObservation)
	assertAction(failedResetSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(failedResetRetrySession, failedResetSubmitDecision, { success: true, output: '已搜索。' })
	const failedResetDecision = workflow.deriveSearchWorkflowDecision(failedResetRetrySession, unclearedBaseObservation)
	assertAction(failedResetDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(failedResetRetrySession, failedResetDecision, {
		success: false,
		output: '动作校验失败: search_reset_field_not_cleared: 搜索重置后已知筛选字段仍未清空',
	})
	const failedResetRetryDecision = workflow.deriveSearchWorkflowDecision(failedResetRetrySession, unclearedFilledObservation)
	assertAction(failedResetRetryDecision, 'input_text')
	if (
		failedResetRetryDecision.action.input.index !== 12 ||
		failedResetRetryDecision.action.input.text !== '' ||
		failedResetRetryDecision.action.input.workflow_step !== 'clear_field' ||
		failedResetRetryDecision.action.input.workflow_clear_context !== 'clear_retry' ||
		failedResetRetryDecision.action.input.workflow_reset_ineffective !== true ||
		failedResetRetryDecision.action.input.workflow_clear_retry !== true ||
		failedResetRetryDecision.action.input.workflow_clear_retry_count !== 1 ||
		!/按钮复核未通过/.test(String(failedResetRetryDecision.evaluation_previous_goal || ''))
	) {
		throw new Error(`failed reset verification should field-clear recoverable plain text filters, got ${JSON.stringify(failedResetRetryDecision)}`)
	}
	workflow.recordSearchWorkflowOutcome(failedResetRetrySession, failedResetRetryDecision, { success: true, output: '已字段级清空。' })
	const failedResetTerminalDecision = workflow.deriveSearchWorkflowDecision(failedResetRetrySession, unclearedBaseObservation)
	assertAction(failedResetTerminalDecision, 'done')
	if (
		failedResetTerminalDecision.action.input.success !== true ||
		!String(failedResetTerminalDecision.action.input.workflow_result_summary || '').includes('公司名称=通过')
	) {
		throw new Error(`failed reset verification should complete after field-level clear recovery, got ${JSON.stringify(failedResetTerminalDecision)}`)
	}
	const failingResultSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const failingBeforeSearchObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' },
			{ index: 19, actionIntent: 'reset', label: '清空', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const failingAfterSearchObservation = {
		...failingBeforeSearchObservation,
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 12, label: '公司名称', fieldType: 'unknown', valueState: 'filled:星火科技有限公司', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [] },
		],
	}
	const failingFillDecision = workflow.deriveSearchWorkflowDecision(failingResultSession, failingBeforeSearchObservation)
	assertAction(failingFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(failingResultSession, failingFillDecision, { success: true, output: '已输入。' })
	const failingSubmitDecision = workflow.deriveSearchWorkflowDecision(failingResultSession, failingBeforeSearchObservation)
	assertAction(failingSubmitDecision, 'click_element_by_index')
	workflow.recordSearchWorkflowOutcome(failingResultSession, failingSubmitDecision, { success: true, output: '已搜索。' })
	const failingResetDecision = workflow.deriveSearchWorkflowDecision(failingResultSession, failingAfterSearchObservation)
	assertAction(failingResetDecision, 'click_element_by_index')
	if (
		failingResetDecision.action.input.workflow_result_status !== 'failed_empty_result' ||
		!String(failingResetDecision.memory || '').includes('结果列表为空')
	) {
		throw new Error(`search workflow should record empty table-sample search results as failures before reset, got ${JSON.stringify(failingResetDecision)}`)
	}
	workflow.recordSearchWorkflowOutcome(failingResultSession, failingResetDecision, { success: true, output: '已清空。' })
	const failingDoneDecision = workflow.deriveSearchWorkflowDecision(failingResultSession, failingBeforeSearchObservation)
	assertAction(failingDoneDecision, 'done')
	if (
		failingDoneDecision.action.input.success !== false ||
		failingDoneDecision.action.input.workflow_result_status !== 'failed' ||
		!String(failingDoneDecision.action.input.text || '').includes('异常 1 项') ||
		!String(failingDoneDecision.action.input.text || '').includes('重点问题') ||
		!String(failingDoneDecision.action.input.workflow_result_summary || '').includes('公司名称=失败:结果为空') ||
		!String(failingDoneDecision.action.input.workflow_result_summary || '').includes('值=星火科技有限公司') ||
		!String(failingDoneDecision.action.input.workflow_result_summary || '').includes('来源=列表样本') ||
		!String(failingDoneDecision.action.input.workflow_result_failures || '').includes('结果列表为空')
	) {
		throw new Error(`search workflow should finish with a failure summary after all fields are tested, got ${JSON.stringify(failingDoneDecision)}`)
	}
	const scopedActionSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const scopedActionObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 22, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content', rect: { left: 420, top: 156, width: 180, height: 32 } },
				],
			},
		],
		actions: [
			{ index: 4, actionIntent: 'search', label: '搜索', region: 'content', rect: { left: 840, top: 24, width: 72, height: 32 } },
			{ index: 5, actionIntent: 'reset', label: '清空', region: 'content', rect: { left: 920, top: 24, width: 72, height: 32 } },
			{ index: 44, actionIntent: 'search', label: '搜索', region: 'content', rect: { left: 760, top: 156, width: 72, height: 32 } },
			{ index: 45, actionIntent: 'reset', label: '清空', region: 'content', rect: { left: 840, top: 156, width: 72, height: 32 } },
		],
		tables: [
			{ headers: ['公司名称', '联系方式'], rows: [['星火科技有限公司', '13800138000']] },
		],
	}
	const scopedFillDecision = workflow.deriveSearchWorkflowDecision(scopedActionSession, scopedActionObservation)
	assertAction(scopedFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(scopedActionSession, scopedFillDecision, { success: true, output: '已输入。' })
	const scopedSubmitDecision = workflow.deriveSearchWorkflowDecision(scopedActionSession, scopedActionObservation)
	assertAction(scopedSubmitDecision, 'click_element_by_index')
	if (scopedSubmitDecision.action.input.index !== 44) {
		throw new Error(`search workflow should choose the search button nearest to scoped filter fields, got ${JSON.stringify(scopedSubmitDecision)}`)
	}
	workflow.recordSearchWorkflowOutcome(scopedActionSession, scopedSubmitDecision, { success: true, output: '已搜索。' })
	const scopedResetDecision = workflow.deriveSearchWorkflowDecision(scopedActionSession, scopedActionObservation)
	assertAction(scopedResetDecision, 'click_element_by_index')
	if (scopedResetDecision.action.input.index !== 45) {
		throw new Error(`search workflow should choose the reset button nearest to scoped filter fields, got ${JSON.stringify(scopedResetDecision)}`)
	}
	const ambiguousNoGeometrySubmitSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const ambiguousNoGeometrySubmitObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 22, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
		actions: [
			{ index: 88, actionIntent: 'submit', label: '确定', region: 'content' },
		],
		tables: [
			{ headers: ['公司名称'], rows: [['星火科技有限公司']] },
		],
	}
	const ambiguousNoGeometryFillDecision = workflow.deriveSearchWorkflowDecision(ambiguousNoGeometrySubmitSession, ambiguousNoGeometrySubmitObservation)
	assertAction(ambiguousNoGeometryFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(ambiguousNoGeometrySubmitSession, ambiguousNoGeometryFillDecision, { success: true, output: '已输入。' })
	const ambiguousNoGeometrySubmitDecision = workflow.deriveSearchWorkflowDecision(ambiguousNoGeometrySubmitSession, ambiguousNoGeometrySubmitObservation)
	assertAction(ambiguousNoGeometrySubmitDecision, 'done')
	if (
		ambiguousNoGeometrySubmitDecision.action.input.success !== false ||
		ambiguousNoGeometrySubmitDecision.action.input.workflow_submit_action_missing !== true ||
		!String(ambiguousNoGeometrySubmitDecision.action.input.text || '').includes('没有找到可点击的搜索/查询/筛选/应用筛选按钮')
	) {
		throw new Error(`generic confirm/submit buttons without geometry should not be treated as search submit actions, got ${JSON.stringify(ambiguousNoGeometrySubmitDecision)}`)
	}
	const explicitNoGeometrySubmitSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const explicitNoGeometrySubmitObservation = {
		...ambiguousNoGeometrySubmitObservation,
		actions: [
			{ index: 89, actionIntent: 'search', label: '搜索', region: 'content' },
		],
	}
	const explicitNoGeometryFillDecision = workflow.deriveSearchWorkflowDecision(explicitNoGeometrySubmitSession, explicitNoGeometrySubmitObservation)
	assertAction(explicitNoGeometryFillDecision, 'input_text')
	workflow.recordSearchWorkflowOutcome(explicitNoGeometrySubmitSession, explicitNoGeometryFillDecision, { success: true, output: '已输入。' })
	const explicitNoGeometrySubmitDecision = workflow.deriveSearchWorkflowDecision(explicitNoGeometrySubmitSession, explicitNoGeometrySubmitObservation)
	assertAction(explicitNoGeometrySubmitDecision, 'click_element_by_index')
	if (explicitNoGeometrySubmitDecision.action.input.index !== 89) {
		throw new Error(`explicit search labels should still be accepted without geometry, got ${JSON.stringify(explicitNoGeometrySubmitDecision)}`)
	}
	const scopedFields = workflow.collectSearchFields({
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '经办姓名,公司名称' },
		],
		forms: [
			{
				id: 'page_form',
				name: '页面表单',
				fields: [
					{ index: 2, label: '首页个人信息退出登录', fieldType: 'select', valueState: 'selected:admin', role: 'combobox', region: 'content' },
					{ index: 50, label: '核心', fieldType: 'unknown', valueState: 'unknown', role: 'combobox', region: 'popover' },
				],
			},
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 26, label: '经办姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					{ index: 27, label: '公司名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
				],
			},
		],
	})
	if (scopedFields.length !== 2 || scopedFields.some((field) => Number(field.index) < 20)) {
		throw new Error(`search workflow should only collect fields scoped to the expanded page search panel, got ${JSON.stringify(scopedFields)}`)
	}
	const cleanedLabelHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '公司名称,等级' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 11, label: '-', placeholder: '请输入 公司名称', fieldType: 'text', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 12, label: '-', placeholder: '-', fieldType: 'text', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 13, label: '展开选项', placeholder: '请选择', fieldType: 'select', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown', region: 'content' },
						{ index: 14, label: '请选择 等级', fieldType: 'select', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown', region: 'content' },
						{ index: 15, label: '详细地址', labelSource: 'spatial-left', labelConfidence: 0.78, fieldType: 'text', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 16, label: '详细地址', labelSource: 'spatial-above', labelConfidence: 0.52, fieldType: 'select', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{ headers: ['公司名称', '等级', '详细地址'], rows: [['星火科技有限公司', '核心', '上海市浦东新区']] },
			],
		}
	).join('\n')
	if (
		!cleanedLabelHints.includes('公司名称[index=11') ||
		!cleanedLabelHints.includes('等级[index=14') ||
		!cleanedLabelHints.includes('详细地址[index=15') ||
		cleanedLabelHints.includes('-[index=12') ||
		cleanedLabelHints.includes('展开选项[index=13') ||
		cleanedLabelHints.includes('详细地址[index=16')
	) {
		throw new Error(`search workflow should clean placeholder labels, reject generic labels, and drop duplicate weak spatial labels, got ${cleanedLabelHints}`)
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
						{ index: 4, label: '平台', fieldType: 'unknown', valueState: 'empty', role: 'combobox', type: 'text', selectionControl: 'dropdown', region: 'content' },
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
						{ index: 4, label: '平台', fieldType: 'unknown', valueState: 'empty', role: 'combobox', type: 'text', selectionControl: 'dropdown', region: 'content' },
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
	const plainCategoricalHints = workflow.buildSearchWorkflowHintLines(
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
						{ index: 4, label: '平台', fieldType: 'platform', valueState: 'empty', role: 'textbox', type: 'text', editable: true, region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	const plainCategoricalHintText = plainCategoricalHints.join('\n')
	if (plainCategoricalHintText.includes('control=selection') || !plainCategoricalHintText.includes('control=text')) {
		throw new Error(`search workflow should not infer selection controls from domain/category field names alone, got ${plainCategoricalHintText}`)
	}
	const filteredCandidate = workflow.pickOptionCandidateForField(
		{
			pendingDropdownCandidates: ['成单资料导入', '(empty)', '搜索内容', '首页个人信息退出登录', '资料等级', '核心'],
			fields: {
				'index:4': { label: '资料等级' },
				'index:5': { label: '联系方式' },
			},
			failedLabelsByKey: {},
		},
		{ index: 4, label: '资料等级', fieldType: 'select', role: 'combobox', region: 'content' }
	)
	if (filteredCandidate !== '核心') {
		throw new Error(`search workflow should ignore global/navigation/dropdown-field labels in option candidates, got ${filteredCandidate}`)
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
	const nativeOptionHintText = nativeOptionHints.join('\n')
	if (!nativeOptionHintText.includes('options=启用|禁用')) {
		throw new Error(`search workflow should expose real optionLabels as hints, got ${JSON.stringify(nativeOptionHints)}`)
	}
	for (const expected of ['search_data_requirement', 'selectionFields="状态"', 'visibleCandidates="状态:启用|禁用"', '不要随意选择第一个候选']) {
		if (!nativeOptionHintText.includes(expected)) {
			throw new Error(`search workflow should warn models not to choose visible options without field-specific evidence: missing ${expected}, got ${nativeOptionHintText}`)
		}
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
	assertAction(nativeOptionDecision, 'done')
	if (
		nativeOptionDecision.action.input.success !== false ||
		nativeOptionDecision.action.input.workflow_missing_table_samples !== true ||
		!String(nativeOptionDecision.action.input.text || '').includes('没有可用列表样本')
	) {
		throw new Error(`selection search fields should not choose a real option without table/task evidence, got ${JSON.stringify(nativeOptionDecision)}`)
	}
	const taskOptionDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项，状态为启用', latestTask: '测试搜索区域每一个搜索项，状态为启用', history: [], workflowState: {} },
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
	assertAction(taskOptionDecision, 'choose_dropdown_option')
	if (
		taskOptionDecision.action.input.text !== '启用' ||
		taskOptionDecision.action.input.workflow_value_source !== 'task_value'
	) {
		throw new Error(`selection search fields should use task-explicit option values, got ${JSON.stringify(taskOptionDecision)}`)
	}
	const sampledNativeOptionDecision = workflow.deriveSearchWorkflowDecision(
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
			tables: [
				{ headers: ['状态', '名称'], rows: [['禁用', '测试账号']] },
			],
		}
	)
	assertAction(sampledNativeOptionDecision, 'choose_dropdown_option')
	if (
		sampledNativeOptionDecision.action.input.text !== '禁用' ||
		sampledNativeOptionDecision.action.input.workflow_value_source !== 'table_sample'
	) {
		throw new Error(`selection search fields should prefer a real option matching current table data, got ${JSON.stringify(sampledNativeOptionDecision)}`)
	}
	const decoratedOptionDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '类别' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 16, label: '类别', fieldType: 'select', optionLabels: ['非核心', '核心 (12)', '潜力'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{ headers: ['类别', '名称'], rows: [['核心', '样例']] },
			],
		}
	)
	assertAction(decoratedOptionDecision, 'choose_dropdown_option')
	if (
		decoratedOptionDecision.action.input.text !== '核心 (12)' ||
		decoratedOptionDecision.action.input.workflow_value_source !== 'table_sample'
	) {
		throw new Error(`selection sample matching should prefer bounded decorated labels over broad substring matches, got ${JSON.stringify(decoratedOptionDecision)}`)
	}
	const unsafeCjkPartialOptionDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '类别' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 16, label: '类别', fieldType: 'select', optionLabels: ['非核心'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{ headers: ['类别', '名称'], rows: [['核心', '样例']] },
			],
		}
	)
	assertAction(unsafeCjkPartialOptionDecision, 'done')
	if (
		unsafeCjkPartialOptionDecision.action.input.success !== false ||
		unsafeCjkPartialOptionDecision.action.input.workflow_option_sample_mismatch !== true ||
		unsafeCjkPartialOptionDecision.action.input.workflow_table_sample !== '核心'
	) {
		throw new Error(`selection sample matching should reject unsafe pure CJK substring candidates, got ${JSON.stringify(unsafeCjkPartialOptionDecision)}`)
	}
	const numericExactOptionDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '等级码' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 15, label: '等级码', fieldType: 'select', optionLabels: ['1', '110', '10'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{ headers: ['等级码', '名称'], rows: [['10', '样例']] },
			],
		}
	)
	assertAction(numericExactOptionDecision, 'choose_dropdown_option')
	if (numericExactOptionDecision.action.input.text !== '10') {
		throw new Error(`numeric option sample matching should prefer exact candidate 10 over 1/110, got ${JSON.stringify(numericExactOptionDecision)}`)
	}
	const numericPartialOptionDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '等级码' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 15, label: '等级码', fieldType: 'select', optionLabels: ['1', '110'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [
				{ headers: ['等级码', '名称'], rows: [['10', '样例']] },
			],
		}
	)
	assertAction(numericPartialOptionDecision, 'done')
	if (
		numericPartialOptionDecision.action.input.success !== false ||
		numericPartialOptionDecision.action.input.workflow_option_sample_mismatch !== true ||
		numericPartialOptionDecision.action.input.workflow_table_sample !== '10'
	) {
		throw new Error(`numeric option sample matching should not treat 1/110 as a match for sample 10, got ${JSON.stringify(numericPartialOptionDecision)}`)
	}
	const mismatchedOptionObservation = {
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
		tables: [
			{ headers: ['状态', '名称'], rows: [['停用', '测试账号']] },
		],
	}
	const mismatchedOptionHints = workflow.buildSearchWorkflowHintLines(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		mismatchedOptionObservation
	)
	const mismatchedOptionHintText = mismatchedOptionHints.join('\n')
	for (const expected of [
		'search_option_requirement',
		'status="option_sample_mismatch"',
		'fields="状态"',
		'activeIndex="5"',
		'samples="状态:停用"',
		'visibleCandidates="状态:启用|禁用"',
		'request_options_for',
		'不要选择非匹配候选',
	]) {
		if (!mismatchedOptionHintText.includes(expected)) {
			throw new Error(`search workflow should explain mismatched table samples and option candidates: missing ${expected}, got ${mismatchedOptionHintText}`)
		}
	}
	const mismatchedOptionDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		mismatchedOptionObservation
	)
	assertAction(mismatchedOptionDecision, 'done')
	if (
		mismatchedOptionDecision.action.input.success !== false ||
		mismatchedOptionDecision.action.input.workflow_option_sample_mismatch !== true ||
		mismatchedOptionDecision.action.input.workflow_table_sample !== '停用' ||
		mismatchedOptionDecision.action.input.workflow_visible_candidates !== '启用|禁用' ||
		!String(mismatchedOptionDecision.action.input.text || '').includes('列表样本') ||
		!String(mismatchedOptionDecision.action.input.text || '').includes('可见候选')
	) {
		throw new Error(`selection search fields should stop when table samples do not match visible options, got ${JSON.stringify(mismatchedOptionDecision)}`)
	}
	const sampledDropdownSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const sampledDropdownObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料等级' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 6, label: '资料等级', fieldType: 'select', valueState: 'empty', role: 'combobox', region: 'content' },
				],
			},
		],
		actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		tables: [
			{ headers: ['资料等级', '资料名称'], rows: [['核心', '星火科技有限公司']] },
		],
	}
	const sampledDropdownOpen = workflow.deriveSearchWorkflowDecision(sampledDropdownSession, sampledDropdownObservation)
	assertAction(sampledDropdownOpen, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(sampledDropdownSession, sampledDropdownOpen, {
		success: true,
		output: '已展开资料等级。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['重要', '核心', '潜力'],
			},
		},
	})
	const sampledDropdownChoice = workflow.deriveSearchWorkflowDecision(sampledDropdownSession, sampledDropdownObservation)
	assertAction(sampledDropdownChoice, 'choose_dropdown_option')
	if (
		sampledDropdownChoice.action.input.text !== '核心' ||
		sampledDropdownChoice.action.input.workflow_value_source !== 'table_sample'
	) {
		throw new Error(`visible dropdown candidates should prefer the option matching current table data, got ${JSON.stringify(sampledDropdownChoice)}`)
	}
	workflow.recordSearchWorkflowOutcome(sampledDropdownSession, sampledDropdownChoice, {
		success: false,
		output: '未在目标字段范围内找到可见下拉选项 "核心"，但页面存在字段外可见候选。 字段外可见下拉候选: 核心。 目标: index=6。下一步建议：先 request_options_for 当前字段确认候选；不要直接选择字段外候选。',
		meta: {
			outcome: {
				kind: 'failed',
				reason: '未在目标字段范围内找到可见下拉选项 "核心"，但页面存在字段外可见候选。',
				requestedText: '核心',
				visibleOptions: ['核心'],
				source: 'global_popup_diagnostic',
			},
		},
	})
	const sampledDropdownState = sampledDropdownSession.workflowState.search
	if (
		!sampledDropdownState?.skippedKeys?.includes('index:6') ||
		sampledDropdownState.phase !== 'select_field' ||
		sampledDropdownState.resultsByKey?.['index:6']?.status !== 'unknown_missing_sample' ||
		!String(sampledDropdownState.resultsByKey?.['index:6']?.summary || '').includes('安全跳过')
	) {
		throw new Error(`field-external dropdown diagnostic failures should be recorded as safe skipped search fields, got ${JSON.stringify(sampledDropdownState)}`)
	}
	const sampledDropdownAfterFailure = workflow.deriveSearchWorkflowDecision(sampledDropdownSession, sampledDropdownObservation)
	assertAction(sampledDropdownAfterFailure, 'done')
	if (
		sampledDropdownAfterFailure.action.input.success !== false ||
		sampledDropdownAfterFailure.action.input.workflow_result_status !== 'inconclusive' ||
		!String(sampledDropdownAfterFailure.action.input.workflow_result_summary || '').includes('未确认:缺少真实样本/候选证据')
	) {
		throw new Error(`search workflow should finish as inconclusive after safely skipping field-external dropdown diagnostics, got ${JSON.stringify(sampledDropdownAfterFailure)}`)
	}
	const observedScopedDropdownDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料等级' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 6, label: '资料等级', fieldType: 'select', valueState: 'empty', role: 'combobox', region: 'content', rect: { left: 100, top: 100, width: 180, height: 32 } },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			options: [
				{ index: 90, label: '重要', role: 'option', region: 'popover', rect: { left: 100, top: 140, width: 180, height: 28 } },
				{ index: 91, label: '核心', role: 'option', region: 'popover', rect: { left: 100, top: 168, width: 180, height: 28 } },
				{ index: 92, label: '潜力', role: 'option', region: 'popover', rect: { left: 100, top: 196, width: 180, height: 28 } },
			],
			tables: [
				{ headers: ['资料等级', '资料名称'], rows: [['核心', '星火科技有限公司']] },
			],
		}
	)
	assertAction(observedScopedDropdownDecision, 'choose_dropdown_option')
	if (
		observedScopedDropdownDecision.action.input.text !== '核心' ||
		observedScopedDropdownDecision.action.input.workflow_value_source !== 'table_sample'
	) {
		throw new Error(`search workflow should use field-scoped options already visible in the current observation, got ${JSON.stringify(observedScopedDropdownDecision)}`)
	}
	const unobservedOptionSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const unobservedOptionObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料等级' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 6, label: '资料等级', fieldType: 'select', valueState: 'empty', role: 'combobox', region: 'content' },
				],
			},
		],
		actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		tables: [
			{ headers: ['资料等级', '资料名称'], rows: [['核心', '星火科技有限公司']] },
		],
	}
	const unobservedOptionOpen = workflow.deriveSearchWorkflowDecision(unobservedOptionSession, unobservedOptionObservation)
	assertAction(unobservedOptionOpen, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(unobservedOptionSession, unobservedOptionOpen, {
		success: true,
		output: '已展开资料等级，但未捕获候选。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: [],
			},
		},
	})
	const unobservedOptionHints = workflow.buildSearchWorkflowHintLines(unobservedOptionSession, unobservedOptionObservation).join('\n')
	for (const expected of [
		'search_option_requirement',
		'status="option_candidates_unobserved"',
		'fields="资料等级"',
		'activeIndex="6"',
		'samples="资料等级:核心"',
		'request_options_for',
		'不要猜选项',
	]) {
		if (!unobservedOptionHints.includes(expected)) {
			throw new Error(`search workflow should explain opened selection fields with no observed options: missing ${expected}, got ${unobservedOptionHints}`)
		}
	}
	const unobservedOptionDecision = workflow.deriveSearchWorkflowDecision(unobservedOptionSession, unobservedOptionObservation)
	assertAction(unobservedOptionDecision, 'done')
	if (
		unobservedOptionDecision.action.input.success !== false ||
		unobservedOptionDecision.action.input.workflow_option_candidates_unobserved !== true ||
		unobservedOptionDecision.action.input.workflow_dropdown_attempts !== 1 ||
		unobservedOptionDecision.action.input.workflow_table_sample !== '核心' ||
		unobservedOptionDecision.action.input.workflow_expected_value !== '核心' ||
		!String(unobservedOptionDecision.action.input.text || '').includes('没有检测到真实候选')
	) {
		throw new Error(`opened selection fields with no observed options should stop with structured diagnostics, got ${JSON.stringify(unobservedOptionDecision)}`)
	}
	const dateRangeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const dateRangeObservation = {
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '创建时间' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 7, label: '创建时间', fieldType: 'daterange', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown', region: 'content' },
				],
			},
		],
		actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
	}
	const dateTimeRangeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const dateTimeRangeObservation = {
		...dateRangeObservation,
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '更新时间' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 17, label: '更新时间', fieldType: 'datetimerange', valueState: 'empty', region: 'content' },
				],
			},
		],
		actions: [{ index: 18, actionIntent: 'search', label: '搜索', region: 'content' }],
	}
	const dateTimeRangeOpenDecision = workflow.deriveSearchWorkflowDecision(dateTimeRangeSession, dateTimeRangeObservation)
	assertAction(dateTimeRangeOpenDecision, 'open_dropdown')
	if (
		dateTimeRangeOpenDecision.action.input.index !== 17 ||
		dateTimeRangeOpenDecision.action.input.workflow_field_type !== 'datetimerange'
	) {
		throw new Error(`datetimerange search fields should be treated as selection/date-range controls even without role/control hints, got ${JSON.stringify(dateTimeRangeOpenDecision)}`)
	}
	const timeRangeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const timeRangeObservation = {
		...dateRangeObservation,
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '时间段' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 18, label: '时间段', fieldType: 'timerange', valueState: 'empty', region: 'content' },
				],
			},
		],
		actions: [{ index: 28, actionIntent: 'search', label: '搜索', region: 'content' }],
		tables: [
			{ headers: ['时间段', '名称'], rows: [['09:00', '样本记录']] },
		],
	}
	const timeRangeOpenDecision = workflow.deriveSearchWorkflowDecision(timeRangeSession, timeRangeObservation)
	assertAction(timeRangeOpenDecision, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(timeRangeSession, timeRangeOpenDecision, {
		success: true,
		output: '已展开下拉框索引 18。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['09:00', '10:00'],
			},
		},
	})
	const timeRangeChoiceDecision = workflow.deriveSearchWorkflowDecision(timeRangeSession, timeRangeObservation)
	assertAction(timeRangeChoiceDecision, 'choose_dropdown_option')
	if (
		timeRangeChoiceDecision.action.input.text !== '09:00' ||
		timeRangeChoiceDecision.action.input.workflow_value_source !== 'table_sample' ||
		String(timeRangeChoiceDecision.action.input.workflow_test_value || '').includes('..')
	) {
		throw new Error(`timerange fields should match real time candidates from table samples instead of being forced into date-range selection, got ${JSON.stringify(timeRangeChoiceDecision)}`)
	}
	const separatedDateRangeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const separatedDateRangeObservation = {
		...dateRangeObservation,
		panels: [
			{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '有效期' },
		],
		forms: [
			{
				id: 'filter',
				name: '搜索/筛选区域',
				fields: [
					{ index: 19, label: '有效期', fieldType: 'date-range', valueState: 'empty', region: 'content' },
				],
			},
		],
		actions: [{ index: 20, actionIntent: 'search', label: '搜索', region: 'content' }],
	}
	const separatedDateRangeOpenDecision = workflow.deriveSearchWorkflowDecision(separatedDateRangeSession, separatedDateRangeObservation)
	assertAction(separatedDateRangeOpenDecision, 'open_dropdown')
	if (
		separatedDateRangeOpenDecision.action.input.index !== 19 ||
		separatedDateRangeOpenDecision.action.input.workflow_field_type !== 'date-range'
	) {
		throw new Error(`date-range aliases should be treated as selection/date-range controls even without role/control hints, got ${JSON.stringify(separatedDateRangeOpenDecision)}`)
	}
	const dateOpenDecision = workflow.deriveSearchWorkflowDecision(dateRangeSession, dateRangeObservation)
	assertAction(dateOpenDecision, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(dateRangeSession, dateOpenDecision, {
		success: true,
		output: '已展开下拉框索引 7。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['2026-06-02', '2026-06-03', '2026-06-04'],
			},
		},
	})
	const dateRangeDecision = workflow.deriveSearchWorkflowDecision(dateRangeSession, dateRangeObservation)
	assertAction(dateRangeDecision, 'done')
	if (
		dateRangeDecision.action.input.success !== false ||
		dateRangeDecision.action.input.workflow_missing_table_samples !== true
	) {
		throw new Error(`daterange search fields should not choose arbitrary visible dates without table/task evidence, got ${JSON.stringify(dateRangeDecision)}`)
	}
	const pseudoDateSampleSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const pseudoDateSampleObservation = {
		...dateRangeObservation,
		rawCandidates: [
			'row table cell 创建时间: active 资料名称: 星火科技有限公司',
		],
	}
	const pseudoDateOpenDecision = workflow.deriveSearchWorkflowDecision(pseudoDateSampleSession, pseudoDateSampleObservation)
	assertAction(pseudoDateOpenDecision, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(pseudoDateSampleSession, pseudoDateOpenDecision, {
		success: true,
		output: '已展开下拉框索引 7。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['2026-06-02', '2026-06-03', '2026-06-04'],
			},
		},
	})
	const pseudoDateRangeDecision = workflow.deriveSearchWorkflowDecision(pseudoDateSampleSession, pseudoDateSampleObservation)
	assertAction(pseudoDateRangeDecision, 'done')
	if (
		pseudoDateRangeDecision.action.input.success !== false ||
		pseudoDateRangeDecision.action.input.workflow_missing_table_samples !== true ||
		pseudoDateRangeDecision.action.input.workflow_option_sample_mismatch === true
	) {
		throw new Error(`daterange fields should ignore DOM state pseudo-samples such as active, got ${JSON.stringify(pseudoDateRangeDecision)}`)
	}
	const sampledDateRangeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const sampledDateRangeObservation = {
		...dateRangeObservation,
		tables: [
			{ headers: ['创建时间', '资料名称'], rows: [['2026-06-02', '星火科技有限公司']] },
		],
	}
	const sampledDateOpenDecision = workflow.deriveSearchWorkflowDecision(sampledDateRangeSession, sampledDateRangeObservation)
	assertAction(sampledDateOpenDecision, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(sampledDateRangeSession, sampledDateOpenDecision, {
		success: true,
		output: '已展开下拉框索引 7。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['2026-06-02', '2026-06-03', '2026-06-04'],
			},
		},
	})
	const sampledDateRangeDecision = workflow.deriveSearchWorkflowDecision(sampledDateRangeSession, sampledDateRangeObservation)
	assertAction(sampledDateRangeDecision, 'choose_dropdown_option')
	if (
		sampledDateRangeDecision.action.input.text !== '2026-06-02..2026-06-03' ||
		sampledDateRangeDecision.action.input.workflow_value_source !== 'table_sample' ||
		!String(sampledDateRangeDecision.action.input.workflow_value_basis || '').includes('2026-06-02')
	) {
		throw new Error(`daterange search fields should form a real range anchored to table date samples, got ${JSON.stringify(sampledDateRangeDecision)}`)
	}
	const monthDayDateRangeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const monthDayDateRangeObservation = {
		...dateRangeObservation,
		tables: [
			{ headers: ['创建时间', '资料名称'], rows: [['06-02', '星火科技有限公司']] },
		],
	}
	const monthDayDateOpenDecision = workflow.deriveSearchWorkflowDecision(monthDayDateRangeSession, monthDayDateRangeObservation)
	assertAction(monthDayDateOpenDecision, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(monthDayDateRangeSession, monthDayDateOpenDecision, {
		success: true,
		output: '已展开下拉框索引 7。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['2026-06-01', '2026-06-02', '2026-06-03'],
			},
		},
	})
	const monthDayDateRangeDecision = workflow.deriveSearchWorkflowDecision(monthDayDateRangeSession, monthDayDateRangeObservation)
	assertAction(monthDayDateRangeDecision, 'choose_dropdown_option')
	if (
		monthDayDateRangeDecision.action.input.text !== '2026-06-02..2026-06-03' ||
		monthDayDateRangeDecision.action.input.workflow_value_source !== 'table_sample' ||
		!String(monthDayDateRangeDecision.action.input.workflow_value_basis || '').includes('06-02')
	) {
		throw new Error(`daterange fields should infer the year for month/day table samples from visible real date candidates, got ${JSON.stringify(monthDayDateRangeDecision)}`)
	}
	const zhMonthDayDateRangeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const zhMonthDayDateRangeObservation = {
		...dateRangeObservation,
		tables: [
			{ headers: ['创建时间', '资料名称'], rows: [['6月2日', '星火科技有限公司']] },
		],
	}
	const zhMonthDayDateOpenDecision = workflow.deriveSearchWorkflowDecision(zhMonthDayDateRangeSession, zhMonthDayDateRangeObservation)
	assertAction(zhMonthDayDateOpenDecision, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(zhMonthDayDateRangeSession, zhMonthDayDateOpenDecision, {
		success: true,
		output: '已展开下拉框索引 7。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['2026-06-01', '2026-06-02', '2026-06-03'],
			},
		},
	})
	const zhMonthDayDateRangeDecision = workflow.deriveSearchWorkflowDecision(zhMonthDayDateRangeSession, zhMonthDayDateRangeObservation)
	assertAction(zhMonthDayDateRangeDecision, 'choose_dropdown_option')
	if (
		zhMonthDayDateRangeDecision.action.input.text !== '2026-06-02..2026-06-03' ||
		zhMonthDayDateRangeDecision.action.input.workflow_value_source !== 'table_sample' ||
		!String(zhMonthDayDateRangeDecision.action.input.workflow_value_basis || '').includes('6月2日')
	) {
		throw new Error(`daterange fields should infer the year for Chinese month/day table samples from visible real date candidates, got ${JSON.stringify(zhMonthDayDateRangeDecision)}`)
	}
	const partialDateRangeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const partialDateOpenDecision = workflow.deriveSearchWorkflowDecision(partialDateRangeSession, sampledDateRangeObservation)
	assertAction(partialDateOpenDecision, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(partialDateRangeSession, partialDateOpenDecision, {
		success: true,
		output: '已展开下拉框索引 7。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['2026-06-02', '2026-06-03', '2026-06-04'],
			},
		},
	})
	const partialDateRangeDecision = workflow.deriveSearchWorkflowDecision(partialDateRangeSession, sampledDateRangeObservation)
	assertAction(partialDateRangeDecision, 'choose_dropdown_option')
	workflow.recordSearchWorkflowOutcome(partialDateRangeSession, partialDateRangeDecision, {
		success: true,
		output: '已选择日期范围起点 "2026-06-02"，等待选择结束日期 "2026-06-03"。',
		meta: {
			outcome: {
				kind: 'state_changed',
				progress: true,
				reason: 'date_range_first_option_selected',
				requestedText: '2026-06-02..2026-06-03',
				selectedDate: '2026-06-02',
				pendingText: '2026-06-03',
			},
		},
	})
	const partialDateState = partialDateRangeSession.workflowState.search
	if (
		partialDateState?.phase !== 'awaiting_option' ||
		partialDateState.pendingDateRangeStartByKey?.['index:7'] !== '2026-06-02' ||
		partialDateState.fields?.['index:7']?.lastTestValue !== '2026-06-02'
	) {
		throw new Error(`partial daterange selection should keep workflow awaiting the second date, got ${JSON.stringify(partialDateState)}`)
	}
	const partialDateCompletionDecision = workflow.deriveSearchWorkflowDecision(partialDateRangeSession, sampledDateRangeObservation)
	assertAction(partialDateCompletionDecision, 'choose_dropdown_option')
	if (
		partialDateCompletionDecision.action.input.workflow_date_range_completion !== true ||
		partialDateCompletionDecision.action.input.text !== '2026-06-03' ||
		partialDateCompletionDecision.action.input.workflow_test_value !== '2026-06-02..2026-06-03'
	) {
		throw new Error(`partial daterange selection should be completed with the second date before submit, got ${JSON.stringify(partialDateCompletionDecision)}`)
	}
	const dayOnlyDateRangeSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const dayOnlyDateOpenDecision = workflow.deriveSearchWorkflowDecision(dayOnlyDateRangeSession, sampledDateRangeObservation)
	assertAction(dayOnlyDateOpenDecision, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(dayOnlyDateRangeSession, dayOnlyDateOpenDecision, {
		success: true,
		output: '已展开下拉框索引 7。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['1', '2', '3'],
			},
		},
	})
	const dayOnlyDateRangeDecision = workflow.deriveSearchWorkflowDecision(dayOnlyDateRangeSession, sampledDateRangeObservation)
	assertAction(dayOnlyDateRangeDecision, 'choose_dropdown_option')
	if (
		dayOnlyDateRangeDecision.action.input.text !== '2026-06-02..2026-06-03' ||
		dayOnlyDateRangeDecision.action.input.workflow_value_source !== 'table_sample' ||
		!String(dayOnlyDateRangeDecision.action.input.workflow_value_basis || '').includes('2026-06-02')
	) {
		throw new Error(`daterange search fields should map day-only picker cells back to the table date sample, got ${JSON.stringify(dayOnlyDateRangeDecision)}`)
	}
	const observedDayOnlyDateRangeDecision = workflow.deriveSearchWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			...sampledDateRangeObservation,
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 7, label: '创建时间', fieldType: 'daterange', valueState: 'empty', role: 'combobox', selectionControl: 'dropdown', region: 'content', rect: { left: 120, top: 100, width: 200, height: 32 } },
					],
				},
			],
			options: [
				{ index: 90, label: '1', role: 'option', selectionControl: 'date-option', region: 'popover', rect: { left: 140, top: 210, width: 36, height: 28 } },
				{ index: 91, label: '2', role: 'option', selectionControl: 'date-option', region: 'popover', rect: { left: 180, top: 210, width: 36, height: 28 } },
				{ index: 92, label: '3', role: 'option', selectionControl: 'date-option', region: 'popover', rect: { left: 220, top: 210, width: 36, height: 28 } },
			],
		}
	)
	assertAction(observedDayOnlyDateRangeDecision, 'choose_dropdown_option')
	if (
		observedDayOnlyDateRangeDecision.action.input.text !== '2026-06-02..2026-06-03' ||
		observedDayOnlyDateRangeDecision.action.input.workflow_value_source !== 'table_sample'
	) {
		throw new Error(`daterange fields should use visible field-scoped day cells from the current observation, got ${JSON.stringify(observedDayOnlyDateRangeDecision)}`)
	}
	const directDateClickSession = { task: '测试搜索区域每一个搜索项', history: [], workflowState: {} }
	const directDateOpenDecision = workflow.deriveSearchWorkflowDecision(directDateClickSession, sampledDateRangeObservation)
	assertAction(directDateOpenDecision, 'open_dropdown')
	workflow.recordSearchWorkflowOutcome(directDateClickSession, directDateOpenDecision, {
		success: true,
		output: '已展开下拉框索引 7。',
		meta: {
			outcome: {
				kind: 'options_visible',
				visibleOptions: ['2026-06-02', '2026-06-03', '2026-06-04'],
			},
		},
	})
	const directDateClickDecision = {
		action: { name: 'click_element_by_index', input: { index: 93, target_label: '2' } },
		next_goal: '点击日期选项 2 作为日期范围起点。',
	}
	if (!workflow.shouldRecordSearchWorkflowOutcome(directDateClickSession, directDateClickDecision, {
		success: true,
		output: '已点击索引 93，点击目标=td "2"。 | 动作结果: dom_changed',
	})) {
		throw new Error('search workflow should record model-planned date-option clicks while a date range field is active')
	}
	workflow.recordSearchWorkflowOutcome(directDateClickSession, directDateClickDecision, {
		success: true,
		output: '已点击索引 93，点击目标=td "2"。 | 动作结果: dom_changed',
	})
	if (
		directDateClickSession.workflowState.search?.phase !== 'awaiting_option' ||
		directDateClickSession.workflowState.search?.pendingDateRangeStartByKey?.['index:7'] !== '2026-06-02'
	) {
		throw new Error(`direct date-option click should keep daterange fields awaiting the second date, got ${JSON.stringify(directDateClickSession.workflowState.search)}`)
	}
	const directDateCompletionDecision = workflow.deriveSearchWorkflowDecision(directDateClickSession, sampledDateRangeObservation)
	assertAction(directDateCompletionDecision, 'choose_dropdown_option')
	if (
		directDateCompletionDecision.action.input.workflow_date_range_completion !== true ||
		directDateCompletionDecision.action.input.text !== '2026-06-03' ||
		directDateCompletionDecision.action.input.workflow_test_value !== '2026-06-02..2026-06-03'
	) {
		throw new Error(`daterange direct clicks should be completed with a second real date before submit, got ${JSON.stringify(directDateCompletionDecision)}`)
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
						{ index: 6, label: '角色', fieldType: 'multi_select', selectionControl: 'checkbox', optionLabels: ['管理员', '普通账号'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	if (!checkboxOptionHints.join('\n').includes('options=管理员|普通账号') || !checkboxOptionHints.join('\n').includes('control=selection')) {
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
						{ index: 6, label: '角色', fieldType: 'multi_select', selectionControl: 'checkbox', optionLabels: ['管理员', '普通账号'], valueState: 'empty', role: 'combobox', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
		}
	)
	assertAction(checkboxOptionDecision, 'done')
	if (
		checkboxOptionDecision.action.input.success !== false ||
		checkboxOptionDecision.action.input.workflow_missing_table_samples !== true
	) {
		throw new Error(`checkbox-like search fields should not choose arbitrary options without table/task evidence, got ${JSON.stringify(checkboxOptionDecision)}`)
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
	if (
		searchState.resultsByKey?.['index:2']?.status !== 'unknown_result_pending' ||
		searchState.resultsByKey?.['index:2']?.value !== 'admin'
	) {
		throw new Error(`search workflow recorder should keep a provisional submitted result before cleanup: ${JSON.stringify(searchState)}`)
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
	const modelSubmitSession = {
		task: '测试搜索区域每一个搜索项',
		history: [],
		workflowState: {
			search: {
				phase: 'awaiting_submit',
				activeFieldKey: 'index:2',
				lastSearchedFieldKey: '',
				fieldOrder: ['index:2'],
				fields: {
					'index:2': {
						key: 'index:2',
						index: 2,
						label: '登录账号',
						lastTestValue: 'admin',
						lastValueSource: 'table_sample',
					},
				},
				completedKeys: [],
				resetCompletedKeys: [],
				resultsByKey: {},
				clearRetryAttemptsByKey: {},
				failedLabelsByKey: {},
				dropdownOpenAttemptsByKey: {},
			},
		},
	}
	workflow.recordSearchWorkflowOutcome(
		modelSubmitSession,
		{
			action: {
				name: 'click_element_by_index',
				input: { index: 8, target_label: '搜索' },
			},
			next_goal: '点击搜索验证当前字段',
		},
		{ success: true, output: '已点击搜索。' }
	)
	const modelSubmitState = modelSubmitSession.workflowState.search
	if (
		modelSubmitState.lastSearchedFieldKey !== 'index:2' ||
		modelSubmitState.fields?.['index:8'] ||
		modelSubmitState.resultsByKey?.['index:2']?.value !== 'admin'
	) {
		throw new Error(`model-planned submit clicks should inherit active field instead of using button index as a field: ${JSON.stringify(modelSubmitState)}`)
	}
	const clearFallbackRecorderSession = { task: '测试搜索项', history: [], workflowState: {} }
	workflow.recordSearchWorkflowOutcome(
		clearFallbackRecorderSession,
		{
			action: {
				name: 'input_text',
				input: {
					workflow: 'search-fields',
					workflow_step: 'fill_field',
					workflow_field_index: 2,
					workflow_field_label: '名称',
					index: 2,
					text: 'alpha',
				},
			},
		},
		{ success: true, output: '已输入。' }
	)
	workflow.recordSearchWorkflowOutcome(
		clearFallbackRecorderSession,
		{
			action: {
				name: 'click_element_by_index',
				input: {
					workflow: 'search-fields',
					workflow_step: 'submit_search',
					workflow_field_index: 2,
					index: 8,
					target_label: '搜索',
				},
			},
		},
		{ success: true, output: '已搜索。' }
	)
	workflow.recordSearchWorkflowOutcome(
		clearFallbackRecorderSession,
		{
			action: {
				name: 'input_text',
				input: {
					workflow: 'search-fields',
					workflow_step: 'clear_field',
					workflow_field_index: 2,
					workflow_field_label: '名称',
					index: 2,
					text: '',
					workflow_field_clear: true,
					workflow_clear_context: 'after_submit',
				},
			},
		},
		{ success: true, output: '已字段级清空。' }
	)
	const clearFallbackState = clearFallbackRecorderSession.workflowState.search
	if (clearFallbackState.phase !== 'select_field' || !clearFallbackState.completedKeys?.includes('index:2')) {
		throw new Error(`search workflow recorder should treat field-level clear fallback as completing the submitted field: ${JSON.stringify(clearFallbackState)}`)
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
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,账号姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '账号姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [
				{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' },
				{ index: 9, actionIntent: 'reset', label: '清 空', region: 'content' },
			],
			tables: [
				{ headers: ['登录账号', '账号姓名'], rows: [['admin', '张三']] },
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
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,账号姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '账号姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
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
		!progressHints.includes('nextLabel="账号姓名"')
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
					workflow_field_index: 3,
					workflow_field_label: '账号姓名',
					success: false,
					text: '模型停止搜索测试',
				},
			},
		},
		{ success: true, output: '任务已结束。' }
	)
	if (searchState.phase !== 'completed' || searchState.terminalSuccess !== false || searchState.terminalFieldKey !== 'index:3') {
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
						workflow_field_label: index === 2 ? '登录账号' : '账号姓名',
						index,
						text: index === 2 ? 'admin' : '测试账号',
					},
				},
				next_goal: index === 2 ? '填写登录账号' : '填写账号姓名',
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
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,账号姓名' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 2, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
						{ index: 3, label: '账号姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
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

function assertObserverCapturesTableSummaries() {
	const observer = read('naturalclick-extension/content/observer.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	if (!observer.includes('collectTableSummaries') || !observer.includes('buildTableSummary')) {
		throw new Error('observer should extract visible table/list summaries for search workflow sampling')
	}
	if (!observer.includes('collectRecordListSummaries') || !observer.includes('buildRecordListSummary')) {
		throw new Error('observer should extract repeated record-list/card summaries when no standard table is available')
	}
	for (const expected of ['.el-table', '.ant-table', '.vxe-table', '[role="grid"]']) {
		if (!observer.includes(expected)) {
			throw new Error(`observer table summaries should cover common data grid selector ${expected}`)
		}
	}
	for (const expected of ['.avue-crud', '.el-table__inner-wrapper', '.el-table__body-wrapper', 'normalizeTableSummaryRoot', '.el-table__row']) {
		if (!observer.includes(expected)) {
			throw new Error(`observer table summaries should normalize common wrapped table selector ${expected}`)
		}
	}
	for (const expected of ['[class*="data-grid"]', '[class*="table-wrapper"]', '[class*="table-container"]', '[class*="crud-table"]']) {
		if (!observer.includes(expected)) {
			throw new Error(`observer table summaries should include generic wrapped/virtual grid selector ${expected}`)
		}
	}
	const normalizeTableRootFn = extractFunctionSource(observer, 'normalizeTableSummaryRoot')
	if (
		!normalizeTableRootFn.includes('frameworkRoot') ||
		!normalizeTableRootFn.includes('[role="table"],[role="grid"],[class*="data-table"]') ||
		!normalizeTableRootFn.includes('[class*="data-grid"]') ||
		!normalizeTableRootFn.includes('table')
	) {
		throw new Error('table root normalization should prefer framework grid containers before falling back to native table roots')
	}
	const frameworkRootMatch = normalizeTableRootFn.match(/node\.closest\?\.\(\s*(['"])([\s\S]*?)\1\s*\)/)
	const frameworkRootTokens = frameworkRootMatch
		? frameworkRootMatch[2].split(',').map((item) => item.trim()).filter(Boolean)
		: []
	if (
		!frameworkRootTokens.length ||
		frameworkRootTokens.includes('table') ||
		frameworkRootTokens.includes('[role="table"]') ||
		frameworkRootTokens.includes('[role="grid"]')
	) {
			throw new Error(`framework table root lookup should not include native table selector that splits header/body tables, got ${normalizeTableRootFn}`)
	}
	const buildTableSummaryFn = extractFunctionSource(observer, 'buildTableSummary')
	if (!buildTableSummaryFn.includes('collectVisualTableRows(root, realHeaders.length)')) {
		throw new Error('observer should fall back to visual/geometric table rows when standard row/cell selectors miss visible data')
	}
	for (const fnName of ['collectVisualTableRows', 'getTableBodyRoot', 'normalizeVisualTableCell', 'groupVisualTableCellsIntoRows']) {
		if (!observer.includes(`function ${fnName}`)) {
			throw new Error(`observer table summaries should keep generic visual-grid fallback helper ${fnName}`)
		}
	}
	const visualRowsFn = extractFunctionSource(observer, 'collectVisualTableRows')
	for (const expected of ['.el-table__body-wrapper .cell', '[role="row"] [role="gridcell"]', '[data-label]', '[class*="row"] [class*="cell"]']) {
		if (!visualRowsFn.includes(expected)) {
			throw new Error(`visual table row fallback should cover ${expected}`)
		}
	}
	for (const expected of ['[role="list"]', '[role="feed"]', '[class*="record-list"]', '[class*="card-list"]', '.ant-list', '.el-card']) {
		if (!observer.includes(expected)) {
			throw new Error(`observer record-list summaries should cover structural list/card selector ${expected}`)
		}
	}
	if (!observer.includes("kind: 'record-list'") || !observer.includes('extractRecordPairsFromTextLines')) {
		throw new Error('record-list summaries should expose a generic kind and parse structural label/value pairs')
	}
	if (!observer.includes('<tables>') || !observer.includes('formatTableLine')) {
		throw new Error('observer formatted observations should expose table headers and rows')
	}
	if (
		!/const\s+realHeaders\s*=\s*collectTableHeaders/.test(buildTableSummaryFn) ||
		!buildTableSummaryFn.includes('inferFallbackTableHeaders(rows)') ||
		!buildTableSummaryFn.includes("kind: realHeaders.length ? undefined : 'unlabeled-table'")
	) {
		throw new Error('observer should keep table/list evidence when a virtual grid has rows but no readable header')
	}
	if (!observer.includes('function inferFallbackTableHeaders') || !observer.includes('`col${index + 1}`')) {
		throw new Error('observer should synthesize neutral colN headers for unlabeled table evidence')
	}
	if (!plannerContext.includes('<tables>') || !plannerContext.includes("table: 'tables'")) {
		throw new Error('planner context should expose table summaries and allow request_context source=tables')
	}
	if (!plannerContext.includes('collectFallbackTableContextRows') || !plannerContext.includes('collectFallbackTableContextRows(observation, region)')) {
		throw new Error('planner context should fall back to table-like raw/list rows when structured table summaries are missing')
	}
	const workflowSource = read('naturalclick-extension/background/search-workflow.js')
	if (!workflowSource.includes('pickSearchFieldSampleText') || !workflowSource.includes('pickTableSampleForField')) {
		throw new Error('search workflow should prefer observed table/list samples for text search fields')
	}
	if (!workflowSource.includes('function isTruncatedTableSample') || !extractFunctionSource(workflowSource, 'isUsableTableSample').includes('isTruncatedTableSample(text)')) {
		throw new Error('search workflow should reject visibly truncated table/list samples before using them as search values')
	}
	if (!workflowSource.includes('function isNonDataTableSample') || !extractFunctionSource(workflowSource, 'isUsableTableSample').includes('isNonDataTableSample(text)')) {
		throw new Error('search workflow should reject placeholder/loading/masked table samples before using them as search values')
	}
	if (!workflowSource.includes('NC_CONTROL_SEMANTICS') || !workflowSource.includes('function collectObservedOptionCandidatesForField') || !workflowSource.includes('collectUsableOptionCandidates(state, field, observation)')) {
		throw new Error('search workflow should reuse generic control semantics to collect field-scoped visible options from the current observation')
	}
	if (!workflowSource.includes('textRowResultContainsValue') || !workflowSource.includes('unknown_result_pending')) {
		throw new Error('search workflow should record submitted results and verify fallback table-like text rows')
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
	if (!/const\s+PRE_INTENT_WORKFLOWS\s*=\s*\[[\s\S]*PRE_MODEL_WORKFLOWS\[4\]/.test(registry)) {
		throw new Error('workflow registry should allow safe search-field decisions before task-intent model planning')
	}
	for (const forbidden of [
		'deriveActiveSearchWorkflowDecision',
		'deriveInactiveSearchWorkflowDecision',
		'deriveTaskNavigationDecision',
		'shouldDeferInactiveSearchWorkflow',
		'hasNavigationReserved',
	]) {
		if (registry.includes(`function ${forbidden}`)) {
			throw new Error(`workflow registry should not keep obsolete deterministic domain-action helper ${forbidden}`)
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
			task: '找到账户中心部分，找出搜索区域',
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
	if (!hintText.includes('<workflow_hints>') || !hintText.includes('账户中心') || !hintText.includes('status="unresolved"') || !hintText.includes('search_state')) {
		throw new Error(`workflow context hints should expose unresolved target and reference-only search state, got: ${hintText}`)
	}
	if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: 'fill_username' } } }) !== 'login') {
		throw new Error('workflow registry should infer login ownership from workflow_step')
	}
	if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: 'finish_search_fields' } } }) !== 'search-fields') {
		throw new Error('workflow registry should infer search ownership from workflow_step')
	}
	if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: 'clear_field' } } }) !== 'search-fields') {
		throw new Error('workflow registry should infer field-level search clear fallback ownership from workflow_step')
	}
		if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: 'skip_field' } } }) !== 'search-fields') {
			throw new Error('workflow registry should infer field-level safe skips from workflow_step')
		}
		if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: 'test_input_field' } } }) !== 'field-test') {
			throw new Error('workflow registry should infer generic input-field test ownership from workflow_step')
		}
		if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: 'finish_field_test' } } }) !== 'field-test') {
			throw new Error('workflow registry should infer input-field test completion ownership from workflow_step')
		}
		if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_nav_key: '账户中心' } } }) !== 'task-navigation') {
			throw new Error('workflow registry should infer navigation ownership from workflow_nav_key')
		}
	for (const createStep of ['open_create_entry', 'fill_create_field', 'select_create_option', 'select_create_cascader', 'open_create_required_field', 'select_create_required_option', 'submit_create_record']) {
		if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: createStep } } })) {
			throw new Error(`workflow registry should not infer deterministic create workflow ownership from workflow_step ${createStep}`)
		}
	}
	if (plannerTests.resolveDecisionWorkflowName({ action: { input: { workflow_step: 'open_create_form_timeout_recovery' } } }) !== 'create-task') {
		throw new Error('workflow registry should route the generic create-entry timeout recovery step')
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
	const missingSamplePreModel = plannerTests.derivePreModelWorkflowDecision(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 31, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			url: 'http://example.test/app',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app' }] }
	)
	if (missingSamplePreModel) {
		throw new Error(`pre-model search workflow should defer missing table samples to model/context planning, got ${JSON.stringify(missingSamplePreModel)}`)
	}
	const missingSampleHint = plannerTests.buildWorkflowContextText(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 31, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			url: 'http://example.test/app',
		}
	)
	if (!missingSampleHint.includes('search_data_requirement') || !missingSampleHint.includes('request_context source=tables')) {
		throw new Error(`missing table sample deferral should leave model-visible data requirement hints, got ${missingSampleHint}`)
	}
	const unrelatedTableSampleHint = plannerTests.buildWorkflowContextText(
		{ task: '测试搜索区域每一个搜索项', history: [], workflowState: {} },
		{
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '资料名称' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 31, label: '资料名称', fieldType: 'unknown', valueState: 'empty', role: 'textbox', type: 'text', region: 'content' },
					],
				},
			],
			actions: [{ index: 8, actionIntent: 'search', label: '搜索', region: 'content' }],
			tables: [{ headers: ['联系人', '联系方式'], rows: [['张三', '13800138000']] }],
			url: 'http://example.test/app',
		}
	)
	if (!unrelatedTableSampleHint.includes('search_data_requirement') || !unrelatedTableSampleHint.includes('fields="资料名称"')) {
		throw new Error(`field-specific sample deferral should remain model-visible even when unrelated table rows exist, got ${unrelatedTableSampleHint}`)
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
		{ task: '找到账户中心部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
		{
			title: '首页',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [
				{ index: 18, role: 'menuitem', region: 'sidebar', label: '账户中心', valueState: 'unknown' },
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
		{ task: '找到账户中心部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
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
		{ task: '找到账户中心部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
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
		!String(wrongPageTimeoutDecision.action.input.text || '').includes('账户中心')
	) {
		throw new Error(`timeout recovery should stop instead of testing the wrong page when a named module is unresolved: ${JSON.stringify(wrongPageTimeoutDecision)}`)
	}
	const activeSearchPriorityDecision = plannerTests.derivePreModelWorkflowDecision(
		{
			task: '找到账户中心部分，找出搜索区域，测试每一个搜索项功能是否正常',
			history: [
				{ action: 'click_element_by_index', input: { workflow: 'search-fields', target_label: '展开搜索' }, success: true },
			],
			workflowState: { search: { phase: 'select_field' } },
		},
		{
			title: '样例系统',
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,账号姓名,账号平台' },
			],
			forms: [
				{
					id: 'filter',
					name: '搜索/筛选区域',
					fields: [
						{ index: 25, label: '登录账号', fieldType: 'username', valueState: 'empty', role: 'textbox', editable: true },
						{ index: 26, label: '账号姓名', fieldType: 'name', valueState: 'empty', role: 'textbox', editable: true },
					],
				},
			],
			actions: [
				{ index: 18, role: 'tab', region: 'header', label: '账户中心', valueState: 'unknown' },
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '账户中心', valueState: 'unknown' },
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
		{ task: '找到账户中心部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
		{
			title: '账户中心-样例系统',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 35, triggerLabel: '展开搜索' },
			],
			forms: [],
			actions: [
				{ index: 18, role: 'tab', region: 'header', label: '账户中心', valueState: 'unknown' },
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '账户中心', valueState: 'unknown' },
			],
			url: 'http://example.test/app#/module/account',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/module/account' }] }
	)
	assertAction(searchAfterArrivedDecision, 'click_element_by_index')
	if (
		searchAfterArrivedDecision.action.input.index !== 35 ||
		searchAfterArrivedDecision.action.input.workflow !== 'search-fields' ||
		searchAfterArrivedDecision.action.input.workflow_step !== 'expand_search_panel'
	) {
		throw new Error(`arrived domain page should let deterministic search workflow expand the filter panel, got ${JSON.stringify(searchAfterArrivedDecision)}`)
	}
	const arrivedSearchHint = plannerTests.buildWorkflowContextText(
		{ task: '找到账户中心部分，找出搜索区域，测试每一个搜索项功能是否正常', history: [] },
		{
			title: '账户中心-样例系统',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 35, triggerLabel: '展开搜索' },
			],
			forms: [],
			actions: [],
			url: 'http://example.test/app#/module/account',
		}
	)
	if (!arrivedSearchHint.includes('search_panel') || !arrivedSearchHint.includes('triggerIndex="35"')) {
		throw new Error(`arrived domain page should expose search expansion as hints, got ${arrivedSearchHint}`)
	}
	const navStateSession = {
		task: '找到账户中心部分，找出搜索区域，测试每一个搜索项功能是否正常',
		history: [],
		workflowState: {},
	}
	const navStateDecision = plannerTests.derivePreModelWorkflowDecision(
		navStateSession,
		{
			title: '首页',
			actions: [
				{ index: 18, role: 'tab', region: 'header', label: '账户中心', valueState: 'unknown' },
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '账户中心', valueState: 'unknown' },
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
	if (!navStateSession.workflowState.navigation?.plannedKeys?.includes('账户中心')) {
		throw new Error(`pre-model navigation should reserve the planned target to prevent immediate repeats: ${JSON.stringify(navStateSession.workflowState)}`)
	}
	const repeatedPlannedNavDecision = plannerTests.derivePreModelWorkflowDecision(
		navStateSession,
		{
			title: '首页',
			actions: [
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '账户中心', valueState: 'unknown' },
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
			title: '账户中心-样例系统',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [
				{ index: 9, role: 'button', region: 'content', label: '展开搜索', actionIntent: 'open_filter' },
			],
			elements: [],
			url: 'http://example.test/app#/module/account',
		},
		{ tabsSummary: [{ id: 1, current: true, url: 'http://example.test/app#/module/account' }] }
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
			title: '账户中心-样例系统',
			panels: [
				{ kind: 'filter', state: 'collapsed', label: '搜索/筛选区域', triggerIndex: 9 },
			],
			forms: [],
			actions: [],
			elements: [],
			url: 'http://example.test/app#/module/account',
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
				workflow_nav_key: '账户中心',
				target_label: '账户中心',
			},
		},
		next_goal: '进入目标模块：账户中心',
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
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '账户中心', valueState: 'unknown' },
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
	const inferredNavSession = { task: '找到账户中心部分', history: [], workflowState: {} }
	plannerTests.recordWorkflowOutcome(
		inferredNavSession,
		{
			action: {
				name: 'click_element_by_index',
				input: { workflow_step: 'navigate_to_task_target', workflow_nav_key: '账户中心', target_label: '账户中心' },
			},
		},
		{ success: false, output: '循环保护拦截' }
	)
	if (!inferredNavSession.workflowState.navigation?.failedKeys?.includes('账户中心')) {
		throw new Error(`workflow registry should route workflow_step-only navigation outcomes to navigation state: ${JSON.stringify(inferredNavSession.workflowState)}`)
	}
	const navBlockedSession = {
		task: '找到账户中心部分，找出搜索区域',
		history: [],
		workflowState: {},
	}
	const navBlockedDecision = {
		action: {
			name: 'click_element_by_index',
			input: {
				workflow: 'task-navigation',
				workflow_step: 'navigate_to_task_target',
				workflow_nav_key: '账户中心',
				target_label: '账户中心',
			},
		},
		next_goal: '进入目标模块：账户中心',
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
				{ index: 19, role: 'menuitem', region: 'sidebar', label: '账户中心', valueState: 'unknown' },
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
			task: '打开 http://example.test/app，进入单据中心并测试搜索项。',
			history: [],
		},
		{
			title: '首页',
			actions: [
				{ index: 5, region: 'sidebar', role: 'menuitem', label: '单据中心', valueState: 'unknown' },
			],
			elements: [],
		}
	)
	if (
		navDecision?.action?.name !== 'done' ||
		navDecision.action.input.success !== false ||
		!String(navDecision.action.input.text || '').includes('单据中心')
	) {
		throw new Error(`timeout recovery should stop instead of auto-clicking domain navigation, got ${JSON.stringify(navDecision)}`)
	}
	const timeoutActiveSearchDecision = plannerTests.deriveTimeoutRecoveryWorkflowDecision(
		{
			task: '找到账户中心部分，找出搜索区域，测试每一个搜索项功能是否正常',
			history: [
				{ action: 'click_element_by_index', input: { workflow: 'search-fields', workflow_step: 'expand_search_panel', target_label: '展开搜索' }, success: true },
			],
			workflowState: { search: { phase: 'select_field' } },
		},
		{
			title: '样例系统',
			panels: [
				{ kind: 'filter', state: 'expanded', label: '搜索/筛选区域', fields: '登录账号,账号姓名' },
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
				{ index: 18, region: 'sidebar', role: 'menuitem', label: '账户中心', valueState: 'unknown' },
				{ index: 30, intent: 'search', label: '搜索', region: 'content' },
			],
			url: 'http://example.test/app#/wel/index',
		}
	)
	if (
		timeoutActiveSearchDecision?.action?.name !== 'done' ||
		timeoutActiveSearchDecision.action.input.success !== false ||
		!String(timeoutActiveSearchDecision.action.input.text || '').includes('账户中心')
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
	const spatialLabelFn = extractFunctionSource(observer, 'readSpatialLabel')
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
	if (
		!spatialLabelFn.includes('isLikelySpatialLabelNode') ||
		!spatialLabelFn.includes('isSpatialAboveLabelAligned') ||
		!spatialLabelFn.includes('hasIntermediateSpatialFieldControl')
	) {
		throw new Error('observer spatial labels should reject cross-column form text and require aligned above labels')
	}
	for (const helper of ['function isLikelySpatialLabelNode', 'function isSpatialAboveLabelAligned', 'function hasIntermediateSpatialFieldControl']) {
		if (!observer.includes(helper)) {
			throw new Error(`observer should include spatial-label helper ${helper}`)
		}
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

function assertObserverFieldInferenceStaysStructural() {
	const observer = read('naturalclick-extension/content/observer.js')
	const inferFieldTypeFn = extractFunctionSource(observer, 'inferFieldType')
	const inferActionIntentFn = extractFunctionSource(observer, 'inferActionIntent')
	const scrollableFn = extractFunctionSource(observer, 'isLikelyScrollableItem')
	for (const forbidden of [
		'账号平台',
		'所属部门',
		'所属岗位',
		'所属角色',
		'企业管理员',
		'超级管理员',
		'管理员',
		'北京市',
		'天津市',
	]) {
		if (inferFieldTypeFn.includes(forbidden) || inferActionIntentFn.includes(forbidden)) {
			throw new Error(`observer should not infer controls from domain/admin option lexicon: ${forbidden}`)
		}
	}
	for (const forbiddenReturn of ["return 'platform'", "return 'department'", "return 'position'", "return 'role'", "return 'gender'", "return 'status'", "return 'category'"]) {
		if (inferFieldTypeFn.includes(forbiddenReturn)) {
			throw new Error(`observer field type inference should not assign categorical field types from labels: ${forbiddenReturn}`)
		}
	}
	if (!inferFieldTypeFn.includes("role === 'combobox'") || !inferFieldTypeFn.includes("type === 'select-one'") || !inferFieldTypeFn.includes("type === 'select-multiple'")) {
		throw new Error('observer should infer select fields from DOM control structure')
	}
	if (/select_option/.test(inferActionIntentFn) && /管理员|部门|岗位|平台|男|女/.test(inferActionIntentFn)) {
		throw new Error('observer action intent should not classify options from domain/admin words')
	}
	if (!observer.includes('function isResetActionIntentText') || !inferActionIntentFn.includes("return 'reset'")) {
		throw new Error('observer should classify generic clear/reset controls with a reset action intent')
	}
	if (!extractFunctionSource(observer, 'normalizeCompactText').includes('_\\-')) {
		throw new Error('observer compact action text should normalize separators in icon/test-id action cues')
	}
	if (!observer.includes('resetpassword') || !observer.includes('delete|remove|trash')) {
		throw new Error('observer reset intent guard should exclude password-reset and dangerous non-filter actions')
	}
	if (!observer.includes('resetallfilters') || !observer.includes('clearallfilters') || !observer.includes('removeallfilters')) {
		throw new Error('observer should classify English reset-all/clear-all filter controls as generic reset intent')
	}
	if (!extractFunctionSource(observer, 'getSelectorHints').includes('className')) {
		throw new Error('observer selector hints should expose short class names for icon-only action diagnostics')
	}
	for (const expected of ['clearcriteria', 'resetcriteria', 'clearquery', 'resetquery']) {
		if (!observer.includes(expected)) {
			throw new Error(`observer should classify ${expected} as generic search/filter reset intent`)
		}
	}
	if (/department|region|platform|gender|status|category/.test(scrollableFn)) {
		throw new Error('observer scrollable candidate inference should stay structural instead of using domain/category field names')
	}
}

function assertObserverSupportsShadowDomAndBroaderControls() {
	const observer = read('naturalclick-extension/content/observer.js')
	const collectFn = extractFunctionSource(observer, 'collectInteractiveCandidates')
	const deepQueryFn = extractFunctionSource(observer, 'querySelectorAllDeep')
	const topLayerFn = extractFunctionSource(observer, 'isLikelyRenderedOnTop')
	const hitStateFn = extractFunctionSource(observer, 'getElementHitState')
	const composedHitFn = extractFunctionSource(observer, 'isComposedHitRelated')
	const tagNameFn = extractFunctionSource(observer, 'getSemanticTagName')
	const panelFn = extractFunctionSource(observer, 'buildPanelCandidates')
	const selectionFn = extractFunctionSource(observer, 'getSelectionControlType')
	const popupFn = extractFunctionSource(observer, 'getPopupContainerHints')
	const popupSelectorFn = extractFunctionSource(observer, 'getSelectionPopupSelector')
	const optionFn = extractFunctionSource(observer, 'isOptionLike')
	if (!collectFn.includes('querySelectorAllDeep(primarySelector)') || !collectFn.includes('querySelectorAllDeep(extraSelector)')) {
		throw new Error('observer candidate collection should scan open shadow roots as well as document DOM')
	}
	if (!deepQueryFn.includes('listOpenShadowRoots') || !observer.includes('function listOpenShadowRoots')) {
		throw new Error('observer should provide a reusable open Shadow DOM query helper')
	}
	if (!topLayerFn.includes('getElementHitState(element).hits > 0') || !hitStateFn.includes('isComposedHitRelated(element, hit)') || !composedHitFn.includes('ShadowRoot')) {
		throw new Error('observer visibility hit testing should account for open Shadow DOM hosts')
	}
	for (const expected of ['.ant-tree-select', '.van-picker', '.layui-form-select', '.ivu-select', '.vxe-select', '.q-select', '.ant-switch']) {
		if (!observer.includes(expected)) {
			throw new Error(`observer should recognize broader framework control ${expected}`)
		}
	}
	if (!tagNameFn.includes("item.selectionControl === 'switch'") || !selectionFn.includes("return 'switch'")) {
		throw new Error('observer should expose switch controls distinctly from checkboxes')
	}
	if (!panelFn.includes('querySelectorAllDeep(panelSelector)')) {
		throw new Error('observer should detect filter/search panels inside open shadow roots')
	}
	if (!popupFn.includes('getSelectionPopupSelector()') || !popupSelectorFn.includes('.ant-tree-select-dropdown') || !popupSelectorFn.includes('.van-popup') || !optionFn.includes('vxe-select-option')) {
		throw new Error('observer popup/option attribution should cover common non-Element UI libraries')
	}
}

function assertObserverOptionSnapshotsExposePopupOwner() {
	const observer = read('naturalclick-extension/content/observer.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	const snapshotFn = extractFunctionSource(observer, 'buildElementSnapshot')
	const optionLineFn = extractFunctionSource(observer, 'formatOptionLine')
	const simplifiedFn = extractFunctionSource(observer, 'buildSimplifiedDom')
	const fieldLineFn = extractFunctionSource(plannerContext, 'formatFieldLine')
	const actionLineFn = extractFunctionSource(plannerContext, 'formatActionLine')
	const popupHintsFn = extractFunctionSource(observer, 'getPopupContainerHints')
	const popupSelectorFn = extractFunctionSource(observer, 'getSelectionPopupSelector')
	const relationHintsFn = extractFunctionSource(observer, 'getRelationHints')
	const relationLimitFn = extractFunctionSource(observer, 'getRelationHintLimit')
	if (!snapshotFn.includes('popupHints')) {
		throw new Error('observer snapshots should preserve popup owner hints for option attribution')
	}
	if (!optionLineFn.includes('popupHints')) {
		throw new Error('observer option/popup lines should expose popup owner hints')
	}
	if (!simplifiedFn.includes('item.popupHints') || !simplifiedFn.includes('popup="${shortText(item.popupHints, 96)}"')) {
		throw new Error('observer simplified_dom rows should preserve popup owner hints for compact planning')
	}
	if (!fieldLineFn.includes('field.popupHints') || !actionLineFn.includes('action.popupHints')) {
		throw new Error('planner context field/action lines should preserve popup owner hints for compact planning')
	}
	if (!popupHintsFn.includes('popupId=') || !popupHintsFn.includes('getSelectionPopupSelector()') || !popupSelectorFn.includes('[role="listbox"]')) {
		throw new Error('popup owner hints should include popup id and listbox-like popup containers')
	}
	if (!relationHintsFn.includes('getRelationHintLimit(name)') || !relationLimitFn.includes('aria-controls') || !relationLimitFn.includes('96')) {
		throw new Error('observer should preserve long popup owner idrefs in relation hints')
	}
	if (!popupHintsFn.includes('shortText(popup.id, 96)')) {
		throw new Error('popup owner hints should preserve long generated popup ids')
	}
}

function assertObserverCapturesFormValidationFeedback() {
	const observer = read('naturalclick-extension/content/observer.js')
	const verifier = read('naturalclick-extension/background/verifier.js')
	const plannerContext = read('naturalclick-extension/background/planner-context.js')
	const snapshotFn = extractFunctionSource(observer, 'buildElementSnapshot')
	const observeFn = extractFunctionSource(observer, 'observePage')
	const collectValidationFn = extractFunctionSource(observer, 'collectValidationMessages')
	const collectFeedbackFn = extractFunctionSource(observer, 'collectPageFeedbackMessages')
	const formatElementFn = extractFunctionSource(observer, 'formatElementLine')
	const feedbackFn = extractFunctionSource(verifier, 'collectObservationFeedbackText')
	const fieldLineFn = extractFunctionSource(plannerContext, 'formatFieldLine')
	for (const expected of ['validationMessage', 'validationSource', 'invalid']) {
		if (!snapshotFn.includes(expected)) {
			throw new Error(`observer snapshots should include structured validation feedback: missing ${expected}`)
		}
	}
	for (const expected of ['aria-invalid', 'aria-errormessage', 'aria-describedby', 'validationMessage']) {
		if (!observer.includes(expected)) {
			throw new Error(`observer should collect generic field validation source: missing ${expected}`)
		}
	}
	for (const expected of ['.el-form-item__error', '.ant-form-item-explain-error', '.invalid-feedback', 'role="alert"', '[class*="error"]']) {
		if (!collectValidationFn.includes(expected)) {
			throw new Error(`observer should recognize common validation message nodes: missing ${expected}`)
		}
	}
	if (!formatElementFn.includes('error="') || !formatElementFn.includes('invalid="true"')) {
		throw new Error('raw observer candidates should expose validation error text and invalid state')
	}
	if (!observer.includes('invalid=${field.invalid') || !observer.includes('error="${field.validationMessage')) {
		throw new Error('form observation text should expose per-field validation errors')
	}
	if (!fieldLineFn.includes('validationMessage') || !fieldLineFn.includes('invalid=${field.invalid')) {
		throw new Error('planner context field lines should preserve validation errors in compact/requested context')
	}
	if (!feedbackFn.includes('validationMessage') || !feedbackFn.includes('field?.error')) {
		throw new Error('submit verifier should consume structured observer validation feedback')
	}
	if (!observeFn.includes('collectPageFeedbackMessages()') || !observer.includes('<feedback>')) {
		throw new Error('observer should include global feedback/toast messages in observation text')
	}
	for (const expected of ['.el-message', '.ant-message-notice-content', '.n-message', 'role="alert"', 'aria-live="assertive"']) {
		if (!collectFeedbackFn.includes(expected)) {
			throw new Error(`observer should collect common global feedback source: missing ${expected}`)
		}
	}
	if (!feedbackFn.includes('observation?.feedback')) {
		throw new Error('submit verifier should consume global feedback/toast messages')
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
	const executeFn = extractFunctionSource(actions, 'executeAction')
	const keypressFn = extractFunctionSource(actionInput, 'keypressAction')
	const keypressResultFn = extractFunctionSource(actionInput, 'buildKeypressSuccessResult')
	if (!/target_label:\s*input\.target_label/.test(executeFn) || !/reason:\s*input\.reason/.test(executeFn)) {
		throw new Error('content actions should forward keypress target_label and reason into the input module')
	}
	for (const expected of ['buildKeypressSuccessResult', 'formatKeypressCombo', 'getKeypressTargetLabel', 'getKeypressReason']) {
		if (!actionInput.includes(`function ${expected}`)) {
			throw new Error(`keypress logging should include ${expected}`)
		}
	}
	if (!keypressFn.includes('buildKeypressSuccessResult') || !keypressResultFn.includes('targetLabel') || !keypressResultFn.includes('reason')) {
		throw new Error('keypress results should include declared target and purpose context in the user-visible message/meta')
	}
}

function assertActionFailuresUseStructuredOutcomes() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionInput = read('naturalclick-extension/content/action-input.js')
	const actionFailureFn = extractFunctionSource(actions, 'buildActionFailureResult')
	const inputFailureFn = extractFunctionSource(actionInput, 'buildInputFailureResult')
	const disabledFn = extractFunctionSource(actions, 'isDisabledElement')
	const disabledClassFn = extractFunctionSource(actions, 'hasDisabledClassSignal')
	for (const [name, fn] of [['actions', actionFailureFn], ['action-input', inputFailureFn]]) {
		if (!fn.includes('OUTCOME_KIND.FAILED') || !fn.includes('createOutcome') || !fn.includes('reason')) {
			throw new Error(`${name} failure results should include structured failed outcomes with reason metadata`)
		}
	}
	for (const reason of ['missing_index', 'not_editable', 'readonly_or_disabled', 'missing_coordinate_target', 'occluded_input_target']) {
		if (!actionInput.includes(reason)) {
			throw new Error(`input failures should expose reason code ${reason}`)
		}
	}
	if (!disabledFn.includes('hasDisabledClassSignal') || !disabledClassFn.includes('is-disabled') || !disabledClassFn.includes('disabled')) {
		throw new Error('click/input guards should recognize framework disabled class signals')
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

function assertActionOptionsSupportBroaderControls() {
	const actionOptions = read('naturalclick-extension/content/action-options.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const candidateSelectorFn = extractFunctionSource(actionOptions, 'getOptionCandidateSelector')
	const popupSelectorFn = extractFunctionSource(actionOptions, 'getOptionPopupSelector')
	const selectableSelectorFn = extractFunctionSource(actionOptions, 'getSelectableControlSelectors')
	const triggerFn = extractFunctionSource(actionOptions, 'resolveDropdownTrigger')
	const deepQueryFn = extractFunctionSource(actionOptions, 'querySelectorAllDeep')
	const enabledTriggerFn = extractFunctionSource(actionSelect, 'hasEnabledSelectionTrigger')
	if (!actionOptions.includes('querySelectorAllDeep(getOptionCandidateSelector())') || !deepQueryFn.includes('listOpenShadowRoots')) {
		throw new Error('option discovery should scan open Shadow DOM roots')
	}
	for (const expected of ['.ant-tree-node', '.van-picker-column__item', '.layui-select-tips', '.ivu-select-item', '.vxe-select-option', '.q-item']) {
		if (!candidateSelectorFn.includes(expected)) {
			throw new Error(`option candidate selector should include ${expected}`)
		}
	}
	for (const expected of ['[role="switch"]', '.ant-switch', '.n-switch', '.van-switch', '.ivu-switch']) {
		if (!selectableSelectorFn.includes(expected)) {
			throw new Error(`selectable control selector should include ${expected}`)
		}
	}
	for (const expected of ['.ant-tree-select-dropdown', '.van-popup', '.layui-anim', '.ivu-select-dropdown', '.vxe-table--ignore-clear']) {
		if (!popupSelectorFn.includes(expected) || !actionSelect.includes(expected)) {
			throw new Error(`selection popup handling should include ${expected}`)
		}
	}
	for (const expected of ['.ant-tree-select', '.layui-select-title', '.ivu-select-selection', '.vxe-input', '.q-field__control']) {
		if (!triggerFn.includes(expected) && !enabledTriggerFn.includes(expected)) {
			throw new Error(`dropdown trigger resolution should include ${expected}`)
		}
	}
}

function assertActionOptionsSupportDatePickerCells() {
	const actionOptions = read('naturalclick-extension/content/action-options.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const shared = read('naturalclick-extension/shared/control-semantics.js')
	const candidateSelectorFn = extractFunctionSource(actionOptions, 'getOptionCandidateSelector')
	const popupSelectorFn = extractFunctionSource(actionOptions, 'getOptionPopupSelector')
	const optionCandidateFn = extractFunctionSource(actionOptions, 'isDropdownOptionCandidate')
	const findOptionByTextFn = extractFunctionSource(actionOptions, 'findVisibleOptionByText')
	const matchScoreFn = extractFunctionSource(actionOptions, 'scoreVisibleOptionTextMatch')
	const decorationMatchFn = extractFunctionSource(actionOptions, 'optionTextHasBoundedDecorationMatch')
	const decorationBoundaryFn = extractFunctionSource(actionOptions, 'isOptionDecorationBoundaryChar')
	const dateRequestMatchFn = extractFunctionSource(actionOptions, 'datePickerOptionMatchesRequest')
	const labelFn = extractFunctionSource(actionOptions, 'getVisibleOptionLabel')
	const rowFn = extractFunctionSource(actionOptions, 'findOptionRow')
	const comparableFn = extractFunctionSource(actionOptions, 'normalizeComparableText')
	const parseDateTextFn = extractFunctionSource(actionOptions, 'parseDateText')
	const requestedDateTextsFn = extractFunctionSource(actionOptions, 'extractRequestedDateTexts')
	const associationFn = extractFunctionSource(actionOptions, 'isOptionAssociatedWithField')
	const dateDomAssociationFn = extractFunctionSource(actionOptions, 'scoreDomDateOptionFieldAssociation')
	const fieldAssociationFn = extractFunctionSource(actionOptions, 'buildDomFieldAssociationItem')
	const inferDomFieldTypeFn = extractFunctionSource(actionOptions, 'inferDomFieldType')
	const inferTemporalDomFieldTypeFn = extractFunctionSource(actionOptions, 'inferTemporalDomFieldType')
	const activePopupAssociationFn = extractFunctionSource(actionOptions, 'getActivePopupFieldAssociation')
	const explicitAssociationFn = extractFunctionSource(actionOptions, 'getExplicitOptionFieldAssociation')
	const staleControlledFn = extractFunctionSource(actionOptions, 'shouldIgnoreStaleControlledPopupIds')
	const selectFn = extractFunctionSource(actionSelect, 'selectDropdownOptionAction')
	for (const expected of [
		'.el-date-table td.available',
		'.ant-picker-cell:not(.ant-picker-cell-disabled)',
		'.arco-picker-cell:not(.arco-picker-cell-disabled)',
		'.n-date-panel-date',
		'.layui-laydate-content td:not(.laydate-disabled)',
		'.ivu-date-picker-cells-cell:not(.ivu-date-picker-cells-cell-disabled)',
		'.vxe-date-picker--date td:not(.is--disabled)',
	]) {
		if (!candidateSelectorFn.includes(expected)) {
			throw new Error(`date picker option discovery should include ${expected}`)
		}
	}
	for (const expected of ['.el-picker-panel', '.ant-picker-dropdown', '.n-date-panel', '.layui-laydate', '.vxe-date-picker--panel']) {
		if (!popupSelectorFn.includes(expected)) {
			throw new Error(`date picker popup discovery should include ${expected}`)
		}
	}
	if (!optionCandidateFn.includes('isDatePickerOption(node)')) {
		throw new Error('dropdown option discovery should treat date cells as option candidates')
	}
	if (!labelFn.includes('getDatePickerOptionLabel(element)') || !actionOptions.includes('formatDateParts')) {
		throw new Error('date picker option labels should be normalized before generic text extraction')
	}
	if (!comparableFn.includes('parseDateText(value)') || !parseDateTextFn.includes('(\\d{4})(\\d{2})(\\d{2})')) {
		throw new Error('date picker option matching should normalize common date text formats before comparing candidates')
	}
	if (
		!findOptionByTextFn.includes('scoreVisibleOptionTextMatch') ||
		!matchScoreFn.includes('datePickerOptionMatchesRequest(node, rawText)') ||
		!matchScoreFn.includes('optionTextHasBoundedDecorationMatch(label, expected)') ||
		!dateRequestMatchFn.includes('extractRequestedDateTexts(rawText)') ||
		!dateRequestMatchFn.includes('getDatePickerCellCandidate(node)') ||
		!dateRequestMatchFn.includes('inferDatePickerMonthContext(cell)') ||
		!dateRequestMatchFn.includes('requestedDates.some')
	) {
		throw new Error('date picker option matching should match full date requests against day-only date cells using the active picker month context')
	}
	if (
		!requestedDateTextsFn.includes('matchAll') ||
		!requestedDateTextsFn.includes('parseDateText(raw)') ||
		!requestedDateTextsFn.includes('\\d{4}\\s*[-/]') ||
		!requestedDateTextsFn.includes('\\b\\d{8}\\b')
	) {
		throw new Error('date picker option matching should extract every requested date from ranges instead of only parsing the first date token')
	}
	if (
		!decorationMatchFn.includes('label.startsWith(expected)') ||
		!decorationMatchFn.includes('label.endsWith(expected)') ||
		!decorationMatchFn.includes('isOptionDecorationBoundaryChar') ||
		!decorationBoundaryFn.includes('（）') ||
		!decorationBoundaryFn.includes('\\-') ||
		!/optionTextHasBoundedDecorationMatch\(label, expected\)[\s\S]*return 1[\s\S]*label\.includes\(expected\)[\s\S]*return 3/.test(matchScoreFn)
	) {
		throw new Error('option matching should prioritize bounded decorated labels such as value(count) over broad substring matches')
	}
	if (!rowFn.includes('getDatePickerCellCandidate(element)')) {
		throw new Error('option row resolution should click the date cell instead of an inner span')
	}
	if (!selectFn.includes('parseDateSelectionRequest(text)') || !selectFn.includes('maybeCompleteDateRangeSelection')) {
		throw new Error('dropdown selection should support two real date candidates for date-range pickers')
	}
	if (
		!selectFn.includes('openedByField = true') ||
		!selectFn.includes('waitForVisibleOptionLabels(field, inputMode, 16, { openedByField })') ||
		!selectFn.includes('openedByField,') ||
		!associationFn.includes('options = {}') ||
		!associationFn.includes('getActivePopupFieldAssociation(popup, field, options)') ||
		!activePopupAssociationFn.includes('options?.openedByField === true') ||
		!activePopupAssociationFn.includes('visiblePopups.length !== 1') ||
		!explicitAssociationFn.includes('shouldIgnoreStaleControlledPopupIds(controlledIds, options)') ||
		!staleControlledFn.includes('options?.openedByField !== true') ||
		!staleControlledFn.includes('!hasVisibleControlledPopup(controlledIds)')
	) {
		throw new Error('dropdown/date selection should temporarily associate the unique freshly opened popup with the target field while ignoring only stale invisible controlled-popup ids')
	}
	if (
		!selectFn.includes('date_range_first_option_selected') ||
		!selectFn.includes('pendingText: dateSelectionTexts[1]') ||
		!selectFn.includes('date_range_second_option_selected') ||
		!/completedRange\s*&&\s*!selection\.outcome\?\.progress/.test(selectFn) ||
		!selectFn.includes('OUTCOME_KIND.STATE_CHANGED')
	) {
		throw new Error('date-range selection should report structured progress for both first and second real date options')
	}
	if (!shared.includes('date-option') || !shared.includes('OPTION_CONTROLS')) {
		throw new Error('shared control semantics should classify date-option as an option-like selection')
	}
	if (!shared.includes('scoreDateOptionTargetAssociation') || !shared.includes('DATE_OPTION_ASSOCIATION')) {
		throw new Error('shared control semantics should associate wide date picker cells with date/daterange fields')
	}
	if (
		!associationFn.includes('scoreDomDateOptionFieldAssociation(option, field)') ||
		!dateDomAssociationFn.includes('controlSemantics.scoreDateOptionTargetAssociation') ||
		!dateDomAssociationFn.includes('buildDomDateOptionAssociationItem(cell)') ||
		!dateDomAssociationFn.includes('buildDomFieldAssociationItem(field)') ||
		!fieldAssociationFn.includes("selectionControl: hasSelectionTriggerSignal(field) ? 'dropdown' : ''") ||
		!fieldAssociationFn.includes("expandedState: hasExpandedOrOpenSignal(field) ? 'expanded' : ''") ||
		!inferDomFieldTypeFn.includes('inferTemporalDomFieldType(descriptor)') ||
		!inferTemporalDomFieldTypeFn.includes('datetimerange') ||
		!inferTemporalDomFieldTypeFn.includes('daterange') ||
		!inferDomFieldTypeFn.includes('calendar')
	) {
		throw new Error('content action option association should reuse shared date-option scoring so wide date pickers are not treated as field-external candidates')
	}
	for (const expected of ['datetimerange', 'timerange', 'monthrange', 'yearrange', 'weekrange']) {
		if (!inferTemporalDomFieldTypeFn.includes(expected)) {
			throw new Error(`content action option association should preserve ${expected} DOM field types`)
		}
	}
	if (!/hasRangeSignal\s*&&\s*hasDateSignal/.test(inferTemporalDomFieldTypeFn) || /起止\|区间\|范围\|开始\.\*结束/.test(inferDomFieldTypeFn)) {
		throw new Error('DOM field type inference should not classify every generic range/interval field as a date range')
	}
}

function assertActionOptionsRequireScopedPopupForFieldOptions() {
	const actionOptions = read('naturalclick-extension/content/action-options.js')
	const associationFn = extractFunctionSource(actionOptions, 'isOptionAssociatedWithField')
	if (!/const\s+popup\s*=\s*getOptionPopupContainer\(option\)/.test(associationFn)) {
		throw new Error('field-scoped option association should inspect the popup container')
	}
	if (!/if\s*\(!\(popup instanceof HTMLElement\)\)\s*return false/.test(associationFn)) {
		throw new Error('field-scoped option lookup should reject unrelated global/page options that are not in a popup or explicitly associated')
	}
	if (!associationFn.includes('getExplicitOptionFieldAssociation(option, field, options)')) {
		throw new Error('field-scoped option lookup should still allow explicit aria owner/label associations')
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
		'getCascaderLevelSignature',
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
	if (!actionSelect.includes('waitForVisibleOptionLabels') || !/await\s+waitForVisibleOptionLabels\(field,\s*inputMode,\s*16,\s*\{ openedByField \}\)/.test(dropdownFn)) {
		throw new Error('index-only dropdown open should wait briefly for delayed popup candidates before reporting none')
	}
	if (!dropdownFn.includes('openOutcome') || !dropdownFn.includes('!visible.length && !openOutcome?.progress') || !dropdownFn.includes('字段状态未变化且未检测到可见候选')) {
		throw new Error('index-only dropdown open should fail when no candidates appear and the field state did not change')
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
	if (!dismissFn.includes('isDialogAnchoredSelection') || !dismissFn.includes('blurSelectionAnchor')) {
		throw new Error('cascader popup dismissal should avoid Escape/blank clicks for dialog-anchored fields')
	}
	if (!dismissFn.includes('dispatchEscape') || !dismissFn.includes('dispatchPointClick')) {
		throw new Error('non-dialog cascader dropdown dismissal should keep Escape plus a safe blank click fallback')
	}
	if (!actionSelect.includes('function openCascaderField') || !/openCascaderField\(field,\s*inputMode\)/.test(cascaderFn) || !/resolveDropdownTrigger\(field\)/.test(actionSelect)) {
		throw new Error('cascader path selection should explicitly open the field trigger before searching menu levels')
	}
	if (!/expandCascaderParentOption\(option,\s*i \+ 1,\s*inputMode,\s*path\[i \+ 1\]\)/.test(cascaderFn)) {
		throw new Error('cascader path selection should pass the expected child label to the shared parent expansion helper before searching child levels')
	}
	const cascaderExpandFn = extractFunctionSource(actionSelect, 'expandCascaderParentOption')
	if (!cascaderExpandFn.includes('resolveCascaderExpandTarget(option)') || !cascaderExpandFn.includes('dispatchCascaderElementClick(expandTarget') || !cascaderExpandFn.includes('dispatchCascaderElementClick(option, inputMode, { rightEdge: true })')) {
		throw new Error('cascader parent expansion should fall back from hover to arrow click and then parent row click')
	}
	if (!actionSelect.includes('waitForCascaderNextLevelRefresh') || !actionSelect.includes('readCascaderLevelSignature') || !actionSelect.includes('getCascaderLevelSignature')) {
		throw new Error('cascader parent expansion should verify that an existing child column refreshed instead of treating any old column as ready')
	}
	if (!actions.includes('getCascaderLevelSignature')) {
		throw new Error('content actions should pass cascader level signatures into action-select')
	}
	const cascaderExpandTargetFn = extractFunctionSource(actionSelect, 'resolveCascaderExpandTarget')
	for (const expected of ['.el-cascader-node__postfix', 'arrow-right', 'expand-icon', 'postfix', 'suffix']) {
		if (!cascaderExpandTargetFn.includes(expected)) {
			throw new Error(`cascader parent expansion target should include generic selector ${expected}`)
		}
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
	if (!actions.includes('findDropdownOptionByScrolling') || !actionSelect.includes('findDropdownOptionByScrolling(lookupText')) {
		throw new Error('select_dropdown_option should scroll field-scoped dropdown popups when the requested option is not currently visible')
	}
	const scrollingFn = extractFunctionSource(actionOptions, 'findDropdownOptionByScrolling')
	const scrollContainerSelectorFn = extractFunctionSource(actionOptions, 'getOptionScrollContainerSelector')
	if (!scrollingFn.includes('findVisibleOptionByText(text, options)') || !scrollingFn.includes("container.dispatchEvent(new Event('scroll'")) {
		throw new Error('dropdown scrolling lookup should repeatedly search visible candidates after scrolling popup containers')
	}
	for (const expected of ['.rc-virtual-list-holder', '.cdk-virtual-scroll-viewport', '.el-select-dropdown__wrap', '[class*="virtual-list"]']) {
		if (!scrollContainerSelectorFn.includes(expected)) {
			throw new Error(`dropdown scrolling lookup should cover virtualized popup container ${expected}`)
		}
	}
	if (!/options\.field && !isOptionAssociatedWithField/.test(actionOptions)) {
		throw new Error('visible option candidates are not filtered by field association')
	}
	if (!actionOptions.includes('isOptionTargetGeometryRelated') || actionOptions.includes('window.innerHeight * 0.55')) {
		throw new Error('content option association should use shared geometry semantics instead of a separate viewport heuristic')
	}
	const fn = extractFunctionSource(actionSelect, 'selectDropdownOptionAction')
	if (/if\s*\(!option && !Number\.isFinite\(index\)\)/.test(fn)) {
		throw new Error('select_dropdown_option should not use global option lookup without a target field index')
	}
	if (!fn.includes('select_dropdown_option 选择选项时缺少目标字段 index')) {
		throw new Error('select_dropdown_option should fail text selection without a target field index')
	}
}

function assertDropdownFailuresReturnRecoverableContext() {
	const actions = read('naturalclick-extension/content/actions.js')
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const dropdownFn = extractFunctionSource(actionSelect, 'selectDropdownOptionAction')
	const failureFn = extractFunctionSource(actionSelect, 'buildDropdownFailureResult')
	const selectionFailureFn = extractFunctionSource(actionSelect, 'buildSelectionFailureResult')
	if (!dropdownFn.includes('buildDropdownFailureResult')) {
		throw new Error('select_dropdown_option failures should use a shared recoverable failure result')
	}
	for (const expected of ['visibleOptions', 'requestedText', 'source']) {
		if (!failureFn.includes(expected)) {
			throw new Error(`dropdown failure result should include ${expected}`)
		}
	}
	if (!selectionFailureFn.includes('source: String(source || \'\')')) {
		throw new Error('dropdown failure structured outcome should preserve diagnostic source, not only message text')
	}
	if (!actionSelect.includes('createOutcome(OUTCOME_KIND.FAILED')) {
		throw new Error('dropdown failure result should use failed structured outcome')
	}
	for (const expected of ['当前字段候选', '字段外可见下拉候选', 'global_popup_diagnostic', '不要直接选择字段外候选', '下一步建议', 'request_options_for']) {
		if (!actionSelect.includes(expected)) {
			throw new Error(`dropdown failure message should guide replanning with ${expected}`)
		}
	}
	if (!dropdownFn.includes('const scopedVisible = listVisibleOptionLabels(12, field ? { field, openedByField } : {})') ||
		!dropdownFn.includes('const globalVisible = field ? listVisibleOptionLabels(12, {}) : []') ||
		!dropdownFn.includes('const hasGlobalDiagnostic = field && !scopedVisible.length && globalVisible.length')
	) {
		throw new Error('dropdown failure should expose field-external visible candidates as diagnostic-only context')
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
	const popupAssociationFn = extractFunctionSource(actionOptions, 'isPopupAssociatedWithField')
	const popupSelectorFn = extractFunctionSource(actionOptions, 'getOptionPopupSelector')
	const labelledFn = extractFunctionSource(actionOptions, 'isOptionInsidePopupLabelledByField')
	const fieldIdsFn = extractFunctionSource(actionOptions, 'getFieldAssociationIds')
	const activeAssociationFn = extractFunctionSource(actionOptions, 'getActivePopupFieldAssociation')
	const visiblePopupRootsFn = extractFunctionSource(actionOptions, 'getVisibleOptionPopupRoots')
	const activeFieldFn = extractFunctionSource(actionOptions, 'isOpenOrFocusedSelectionField')
	if (!actionOptions.includes('isVisiblePopupOptionCandidate(node)')) {
		throw new Error('visible option discovery should allow visible popup candidates even when elementFromPoint hits an inner overlay')
	}
	if (!selectorFn.includes('.el-checkbox__label') || !selectorFn.includes('.el-select-dropdown__item *')) {
		throw new Error('option candidate selector should include Element checkbox labels and nested select option text')
	}
	if (!associationFn.includes('getExplicitOptionFieldAssociation(option, field, options)')) {
		throw new Error('dropdown option association should check explicit field-popup ownership before geometry')
	}
	if (!/!\(option instanceof HTMLElement\) \|\| !\(field instanceof HTMLElement\)\)\s*return false/.test(associationFn)) {
		throw new Error('field-scoped option lookup must not default-accept when the option or target field element is missing')
	}
	if (/!\s*optionRect\.width[\s\S]*return true/.test(associationFn) || /!\s*fieldRect\.width[\s\S]*return true/.test(associationFn)) {
		throw new Error('field-scoped option lookup must not accept candidates when popup/field geometry is missing')
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
	if (!associationFn.includes('getActivePopupFieldAssociation(popup, field, options)') || !popupAssociationFn.includes('getActivePopupFieldAssociation(popup, field, options)')) {
		throw new Error('field-scoped option lookup should use the active open/focused field when a single visible popup has no explicit owner')
	}
	if (/!\s*popupRect\.width[\s\S]*return true/.test(popupAssociationFn) || /!\s*fieldRect\.width[\s\S]*return true/.test(popupAssociationFn)) {
		throw new Error('field-scoped popup lookup must not accept candidates when popup/field geometry is missing')
	}
	if (!activeAssociationFn.includes('isOpenOrFocusedSelectionField(field)') || !activeAssociationFn.includes('options?.openedByField === true') || !activeAssociationFn.includes('visiblePopups.length !== 1') || !activeAssociationFn.includes('isPopupSameOrNested')) {
		throw new Error('active popup association should only bind one visible popup to the currently open/focused selection field')
	}
	if (!visiblePopupRootsFn.includes('other.contains(popup)')) {
		throw new Error('active popup association should collapse nested popup/listbox nodes before checking uniqueness')
	}
	if (!activeFieldFn.includes('hasExpandedOrOpenSignal(field)') || !activeFieldFn.includes('document.activeElement') || !activeFieldFn.includes('hasSelectionTriggerSignal(field)')) {
		throw new Error('active popup association should be driven by structural open/focus selection signals')
	}
}

function assertCheckboxOptionSelectionIsScoped() {
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const match = actionSelect.match(/async function selectCheckboxOptionAction[\s\S]*?async function selectCascaderPathAction/)
	const fn = match?.[0] || ''
	if (!fn) throw new Error('selectCheckboxOptionAction source not found')
	if (!fn.includes('select_checkbox_option 缺少目标字段 index')) {
		throw new Error('select_checkbox_option should fail text selection without a scoped field index')
	}
	if (!/let field = null/.test(fn) || !/field = observer\.getElementByIndex\(index\)/.test(fn)) {
		throw new Error('select_checkbox_option should keep the target field for scoped option lookup')
	}
	if (!/const lookupScope = field \? \{ field, openedByField: field instanceof HTMLElement \} : \{\}/.test(fn)) {
		throw new Error('select_checkbox_option should build a field-scoped lookup scope')
	}
	if (!/waitForVisibleOption\(text, \{ \.\.\.lookupScope, selectableOnly: true/.test(fn)) {
		throw new Error('select_checkbox_option should pass the target field into selectable option lookup')
	}
	if (/waitForVisibleOption\(text, \{ selectableOnly: true/.test(fn) || /findDropdownOptionByScrolling\(text, \{ selectableOnly: true/.test(fn)) {
		throw new Error('select_checkbox_option should not choose unscoped global selectable options when a target field index is known')
	}
	if (!fn.includes('global_selectable_popup_diagnostic') || !fn.includes('不要直接选择字段外候选')) {
		throw new Error('select_checkbox_option should expose global selectable candidates only as diagnostics, not as clickable fallbacks')
	}
	if (!/listVisibleOptionLabels\(12, \{ \.\.\.lookupScope, selectableOnly: true \}\)/.test(fn)) {
		throw new Error('select_checkbox_option failure message should list field-scoped candidates')
	}
}

function assertIndexedSelectionActionsFailOnMissingIndex() {
	const actionSelect = read('naturalclick-extension/content/action-select.js')
	const validation = read('naturalclick-extension/background/planner-validation.js')
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
	if (!validation.includes('select_dropdown_option 选择选项时缺少目标字段 index')) {
		throw new Error('planner validation should reject legacy dropdown text selection without a scoped field index')
	}
	if (!validation.includes('select_checkbox_option 缺少目标字段 index')) {
		throw new Error('planner validation should reject checkbox selection without a scoped field index')
	}
	if (!validation.includes('select_cascader_path 缺少目标字段 index')) {
		throw new Error('planner validation should reject cascader path selection without a scoped field index')
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
								{ index: 4, label: '账号平台', valueState: 'empty', value: 'empty' },
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
						{ index: 4, label: '账号平台', valueState: 'empty', value: 'empty' },
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
										label: '账号平台',
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
						{ index: 4, label: '账号平台', valueState: 'empty', value: 'empty' },
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

async function assertVerifierAcceptsTimedOutSelectionWhenValueIsSatisfied() {
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
					content: 'dialog-still-open',
					forms: [
						{
							id: 'dialog',
							name: '弹层',
							fields: [
								{
									index: 8,
									region: 'dialog',
									label: '所在地',
									valueState: 'selected:江苏省 / 南京市 / 江宁区',
									role: 'combobox',
									selectionControl: 'cascader-parent',
								},
							],
						},
					],
				},
			}),
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'select_cascader_path', input: { index: 8, path: ['江苏省', '南京市', '江宁区'] } },
		{
			url: 'http://example.test/app',
			content: 'dialog-open-empty',
			forms: [
				{
					id: 'dialog',
					name: '弹层',
					fields: [
						{ index: 8, region: 'dialog', label: '所在地', valueState: 'empty', role: 'combobox', selectionControl: 'cascader-parent' },
					],
				},
			],
		},
		{
			success: false,
			message: '页面动作超时（17秒），已放弃等待。',
			meta: { outcome: { kind: 'failed', progress: false, reason: '页面动作超时（17秒），已放弃等待。' } },
		}
	)
	if (!result.ok || !String(result.reason || '').includes('字段值已')) {
		throw new Error(`timed-out selection should pass when observation satisfies the requested value, got ${JSON.stringify(result)}`)
	}
}

async function assertVerifierRejectsDialogCloseAfterFieldSelection() {
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
					url: 'http://example.test/record',
					content: 'record-list-page',
					forms: [
						{
							id: 'page_form',
							name: '页面表单',
							fields: [
								{ index: 2, region: 'content', label: '首页个人信息退出登录', valueState: 'selected:首页个人信息退出登录' },
							],
						},
					],
					actions: [
						{ index: 25, region: 'content', label: '新 增', role: 'button' },
					],
				},
			}),
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'select_cascader_path', input: { index: 8, path: ['江苏省', '南京市', '江宁区'] } },
		{
			url: 'http://example.test/record',
			content: 'dialog-open',
			forms: [
				{
					id: 'container_1oa9ete',
					name: '弹层',
					fields: [
						{ index: 8, region: 'dialog', label: '资料所在地', valueState: 'empty', selectionControl: 'cascader-parent' },
					],
				},
			],
		},
		{
			success: true,
			message: '已按路径选择级联选项：江苏省 > 南京市 > 江宁区。',
			meta: {
				before: { value: '', text: '请选择资料所在地', childValue: '', expanded: false },
				after: { value: '', text: '江苏省 / 南京市 / 江宁区', childValue: '江苏省 / 南京市 / 江宁区', expanded: false },
				outcome: { kind: 'value_changed', progress: true },
			},
		}
	)
	if (result.ok || !String(result.reason || '').includes('弹层消失')) {
		throw new Error(`field selection that closes the dialog should fail verification, got ${JSON.stringify(result)}`)
	}
}

async function assertVerifierSeparatesSubmitFromCreateEntryVerification() {
	const baseSandbox = {
		NC_BG_CONSTANTS: {
			TYPES: { VERIFY_INPUT: 'NC_VERIFY_INPUT', VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT' },
		},
		NC_BG_UTILS: {
			sendTabMessage: async () => ({ success: false, matched: false }),
		},
	}
	const preObservation = {
		url: 'http://example.test/app',
		content: 'dialog-before',
		forms: [
			{
				id: 'dialog',
				name: '弹层',
				fields: [
					{ index: 2, region: 'dialog', label: '名称', valueState: 'filled:晨会', role: 'textbox' },
				],
			},
		],
		actions: [
			{ index: 19, region: 'dialog', role: 'button', label: '保 存', actionIntent: 'create' },
		],
	}
	const noFeedbackSandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		...baseSandbox,
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					...preObservation,
					content: 'dialog-before',
				},
			}),
		},
	})
	const rejected = await noFeedbackSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'click_element_by_index',
			input: {
				index: 19,
				workflow_step: 'submit_form_timeout_recovery',
				workflow_submit_label: '保存',
			},
		},
		preObservation,
		{
			success: true,
			message: '已点击索引 19。',
			meta: { outcome: { kind: 'none', progress: false } },
		}
	)
	if (rejected.ok || !String(rejected.reason || '').includes('form_submit_dialog_still_open') || String(rejected.reason || '').includes('create_form_not_opened')) {
		throw new Error(`submit click with no feedback should fail as submit, not create-entry, got ${JSON.stringify(rejected)}`)
	}

	const validationFeedbackSandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		...baseSandbox,
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					...preObservation,
					content: 'dialog-before',
					forms: [
						{
							id: 'dialog',
							name: '弹层',
							fields: [
								{
									index: 2,
									region: 'dialog',
									label: '名称',
									valueState: 'empty',
									role: 'textbox',
									invalid: true,
									validationMessage: '请输入名称',
								},
							],
						},
					],
				},
			}),
		},
	})
	const rejectedValidation = await validationFeedbackSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'click_element_by_index',
			input: {
				index: 19,
				workflow_step: 'submit_form_timeout_recovery',
				workflow_submit_label: '保存',
			},
		},
		preObservation,
		{
			success: true,
			message: '已点击索引 19。',
			meta: { outcome: { kind: 'none', progress: false } },
		}
	)
	if (
		rejectedValidation.ok ||
		!String(rejectedValidation.reason || '').includes('form_submit_failed') ||
		!String(rejectedValidation.reason || '').includes('请输入')
	) {
		throw new Error(`submit click should fail with structured validation feedback, got ${JSON.stringify(rejectedValidation)}`)
	}

	const duplicateFeedbackSandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		...baseSandbox,
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					...preObservation,
					content: 'dialog-before',
					feedback: [
						{ kind: 'error', text: '主体名称已存在，请勿重复提交' },
					],
				},
			}),
		},
	})
	const rejectedDuplicate = await duplicateFeedbackSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'click_element_by_index',
			input: {
				index: 19,
				workflow_step: 'submit_form_timeout_recovery',
				workflow_submit_label: '保存',
			},
		},
		preObservation,
		{
			success: true,
			message: '已点击索引 19。',
			meta: { outcome: { kind: 'none', progress: false } },
		}
	)
	if (
		rejectedDuplicate.ok ||
		!String(rejectedDuplicate.reason || '').includes('form_submit_failed') ||
		!String(rejectedDuplicate.reason || '').includes('主体名称已存在，请勿重复提交')
	) {
		throw new Error(`submit click should fail with duplicate/global feedback, got ${JSON.stringify(rejectedDuplicate)}`)
	}

	const changedDialogSandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		...baseSandbox,
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					...preObservation,
					content: 'dialog-after-validation',
				},
			}),
		},
	})
	const rejectedChanged = await changedDialogSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'click_element_by_index',
			input: {
				index: 19,
				workflow_step: 'submit_form_timeout_recovery',
				workflow_submit_label: '保存',
			},
		},
		preObservation,
		{
			success: true,
			message: '已点击索引 19。',
			meta: { outcome: { kind: 'dom_changed', progress: true } },
		}
	)
	if (
		rejectedChanged.ok ||
		!String(rejectedChanged.reason || '').includes('form_submit_dialog_still_open') ||
		String(rejectedChanged.reason || '').includes('DOM 摘要已变化')
	) {
		throw new Error(`submit click should not pass just because DOM changed while dialog is still open, got ${JSON.stringify(rejectedChanged)}`)
	}

	const closedSandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
		...baseSandbox,
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({
				ok: true,
				data: {
					url: 'http://example.test/app',
					content: 'list-after-submit\nfield index=2 required=false invalid=false error="" progress=false',
					forms: [],
					actions: [],
				},
			}),
		},
	})
	const accepted = await closedSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'click_element_by_index',
			input: {
				index: 19,
				workflow_step: 'submit_form_timeout_recovery',
				workflow_submit_label: '保存',
			},
		},
		preObservation,
		{
			success: true,
			message: '已点击索引 19。',
			meta: { outcome: { kind: 'none', progress: false } },
		}
	)
	if (!accepted.ok || !String(accepted.reason || '').includes('弹层已关闭')) {
		throw new Error(`submit click should pass when the dialog closes, got ${JSON.stringify(accepted)}`)
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

async function assertVerifierRejectsCreateClickWithoutForm() {
	let observations = 0
	const preObservation = {
		url: 'http://example.test/app#/demo/record',
		content: 'record-list-before',
		forms: [
			{
				id: 'page_form',
				name: '页面表单',
				fields: [
					{ index: 2, region: 'content', fieldType: 'select', kind: 'dropdown', label: '首页个人信息退出登录', valueState: 'selected:首页个人信息退出登录', role: 'combobox' },
				],
			},
		],
		actions: [
			{ index: 27, region: 'sidebar', role: 'button', label: '新 增', actionIntent: 'create' },
		],
	}
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
					data: {
						...preObservation,
						content: 'record-list-after',
					},
				}
			},
		},
	})
	const result = await sandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'click_element_by_index', input: { index: 27 } },
		preObservation,
		{
			success: true,
			message: '视觉回退成功 | 动作结果: dom_changed progress=true reason="DOM 摘要已变化"',
			meta: { outcome: { kind: 'dom_changed', progress: true, reason: 'DOM 摘要已变化' } },
		}
	)
	if (!observations || observations < 3) {
		throw new Error(`create-click verifier should wait for a form-bearing observation despite dom_changed, got ${observations}`)
	}
	if (result.ok || !String(result.reason || '').includes('create_form_not_opened')) {
		throw new Error(`create click without form should fail verification with explicit reason, got ${JSON.stringify(result)}`)
	}
	const managementCreateSandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
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
					...preObservation,
					content: 'management-create-click-after',
					actions: [
						{ index: 31, region: 'content', role: 'button', label: '新增管理员', actionIntent: 'create' },
					],
				},
			}),
		},
	})
	const managementCreateResult = await managementCreateSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'click_element_by_index', input: { index: 31, target_label: '新增管理员' } },
		{
			...preObservation,
			actions: [
				{ index: 31, region: 'content', role: 'button', label: '新增管理员', actionIntent: 'create' },
			],
		},
		{
			success: true,
			message: '已点击新增管理员。',
			meta: { outcome: { kind: 'dom_changed', progress: true, reason: 'DOM 摘要已变化' } },
		}
	)
	if (managementCreateResult.ok || !String(managementCreateResult.reason || '').includes('create_form_not_opened')) {
		throw new Error(`create labels containing management words should still require form evidence, got ${JSON.stringify(managementCreateResult)}`)
	}

	const openedSandbox = loadBackgroundModule('naturalclick-extension/background/verifier.js', {
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
					...preObservation,
					content: 'dialog-open',
					forms: [
						...preObservation.forms,
						{
							id: 'dialog',
							name: '新增弹层',
							fields: [
								{ index: 41, region: 'dialog', label: '资料公司名称', valueState: 'empty', role: 'textbox' },
								{ index: 42, region: 'dialog', label: '联系方式', valueState: 'empty', role: 'textbox' },
							],
						},
					],
				},
			}),
		},
	})
	const opened = await openedSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{ name: 'click_element_by_index', input: { index: 27 } },
		preObservation,
		{
			success: true,
			message: '已点击索引 27。',
			meta: { outcome: { kind: 'dom_changed', progress: true } },
		}
	)
	if (!opened.ok || !String(opened.reason || '').includes('创建入口点击后观察到目标状态')) {
		throw new Error(`create click should pass when a create dialog form appears, got ${JSON.stringify(opened)}`)
	}
}

function assertVerifierCreateEvidenceStaysDomainNeutral() {
	const verifier = read('naturalclick-extension/background/verifier.js')
	for (const forbidden of ['businessFields', 'business_fields', 'isBusinessCreateFormField', '首页个人信息退出登录']) {
		if (verifier.includes(forbidden)) {
			throw new Error(`create-entry verification should not use page/domain-specific evidence wording: ${forbidden}`)
		}
	}
	if (!verifier.includes('structuredFields') || !verifier.includes('structured_fields') || !verifier.includes('isStructuredCreateFormField')) {
		throw new Error('create-entry verification should describe generic structured form evidence')
	}
	const createEntryFn = `${extractFunctionSource(verifier, 'isCreateEntryClickAction')}\n${extractFunctionSource(verifier, 'isCreateEntryLabel')}`
	if (/管理|审批/.test(createEntryFn)) {
		throw new Error('create-entry recognition must not reject labels merely because they contain generic module nouns like management/approval')
	}
	if (!verifier.includes('isNonCreateEntryActionLabel')) {
		throw new Error('create-entry recognition should use explicit non-create action labels for fallback filtering')
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
	if (
		delegated[0]?.input?.target_description !== '输入搜索词' ||
		delegated[0]?.input?.target_label !== '输入搜索词' ||
		delegated[1]?.input?.target_description !== '点击确认按钮' ||
		delegated[1]?.input?.target_label !== '点击确认按钮'
	) {
		throw new Error(`locate_by_vision delegated actions should preserve semantic target labels, got ${JSON.stringify(delegated)}`)
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

async function assertVisionFallbackPreservesCoordinateActionOutcome() {
	const vision = read('naturalclick-extension/background/vision.js')
	const fn = extractFunctionSource(vision, 'executeVisionLocatedAction')
	if (!fn.includes('const actionMeta = result?.meta') || !fn.includes('...actionMeta')) {
		throw new Error('vision fallback should merge the coordinate page-action meta into its returned meta')
	}
	if (!fn.includes('coordinateOutcome: actionMeta.outcome')) {
		throw new Error('vision fallback should expose the coordinate action outcome for trace/debug visibility')
	}
	if (!fn.includes('coordinateAttempts') || !fn.includes('outcome: actionMeta.outcome || null')) {
		throw new Error('vision fallback should preserve failed coordinate action attempts with structured outcome details')
	}
	const attemptFn = extractFunctionSource(vision, 'attemptVisionFallback')
	if (!attemptFn.includes('actionAttempts.push(executed)') || !attemptFn.includes('if (executed.success) return executed')) {
		throw new Error('vision fallback should record failed coordinate executions and keep later vision sources available')
	}

	const sent = []
	const sandbox = loadBackgroundModule('naturalclick-extension/background/vision.js', {
		NC_BG_CONSTANTS: {
			TYPES: {
				ACT_COORD: 'NC_ACT_COORD',
				HIT_TEST: 'NC_HIT_TEST',
				SET_VISUAL_CAPTURE_MODE: 'NC_SET_VISUAL_CAPTURE_MODE',
			},
			VISION_CONFIDENCE_THRESHOLD: 0.6,
			MAX_TRACE_ITEMS: 80,
		},
		NC_BG_PLANNER: {
			callOpenAI: async () => ({ content: '{}' }),
		},
		NC_BG_UTILS: {
			sendTabMessage: async (_tabId, message) => {
				sent.push(message)
				if (message?.type === 'NC_HIT_TEST') {
					return {
						success: true,
						hit: { clickable: true, editable: false, ignored: false, text: '确认', tag: 'button' },
					}
				}
				if (message?.type === 'NC_ACT_COORD') {
					return {
						success: false,
						message: '坐标点击被遮挡',
						meta: {
							clickTarget: { tag: 'button', text: '确认' },
							hitTarget: { tag: 'div', text: '浮层' },
							point: { x: message.action.input.x, y: message.action.input.y },
							outcome: { kind: 'failed', progress: false, reason: 'occluded_click_target' },
						},
					}
				}
				return { success: true }
			},
			clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
			safeJsonParse: (text) => {
				try {
					return JSON.parse(text)
				} catch (_) {
					return null
				}
			},
			generateId: (prefix) => `${prefix}_test`,
		},
		NC_BG_EXECUTOR: {
			requestObservation: async () => ({ ok: false }),
		},
	})
	const result = await sandbox.NC_BG_VISION_TESTS.executeVisionLocatedAction(
		{ currentTabId: 1, config: { inputMode: 'standard' } },
		{ name: 'click_element_by_index', input: { target_label: '确认', target_description: '确认按钮' } },
		{
			centerX: 100,
			centerY: 80,
			viewportWidth: 500,
			viewportHeight: 400,
			wRatio: 0.08,
			hRatio: 0.06,
			confidence: 0.91,
			candidates: [],
			meta: { label: '确认', targetType: 'button' },
		},
		'multi_modal'
	)
	if (result.success) {
		throw new Error(`vision coordinate failure should keep the overall action failed, got ${JSON.stringify(result)}`)
	}
	if (result.meta?.coordinateOutcome?.reason !== 'occluded_click_target') {
		throw new Error(`vision coordinate failure should expose occlusion outcome, got ${JSON.stringify(result)}`)
	}
	if (!Array.isArray(result.meta?.coordinateAttempts) || !result.meta.coordinateAttempts.some((attempt) => attempt?.stage === 'action' && attempt?.outcome?.reason === 'occluded_click_target')) {
		throw new Error(`vision coordinate failure should retain structured failed attempts, got ${JSON.stringify(result)}`)
	}
	if (!sent.some((message) => message?.type === 'NC_ACT_COORD')) {
		throw new Error('vision coordinate failure test never executed a coordinate page action')
	}
	const coordinateAction = sent.find((message) => message?.type === 'NC_ACT_COORD')?.action
	if (
		coordinateAction?.input?.target_label !== '确认' ||
		coordinateAction?.input?.target_description !== '确认按钮'
	) {
		throw new Error(`vision coordinate action should preserve target semantics, got ${JSON.stringify(coordinateAction)}`)
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
	const unchangedSubmitSandbox = loadVerifier({
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
	const unchangedSubmitResult = await unchangedSubmitSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
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
	if (unchangedSubmitResult.ok || !String(unchangedSubmitResult.reason || '').includes('search_submit_no_feedback')) {
		throw new Error(`search submit without observable result evidence should fail verification, got ${JSON.stringify(unchangedSubmitResult)}`)
	}
	const tableChangedSubmitSandbox = loadVerifier({
		url: 'http://example.test/app',
		content: 'same-dom',
		forms: [
			{
				fields: [
					{ index: 2, label: '登录账号', valueState: 'filled:admin', value: 'admin' },
				],
			},
		],
		tables: [
			{ headers: ['登录账号', '姓名'], rows: [['admin', '管理员']] },
		],
	})
	const tableChangedSubmitResult = await tableChangedSubmitSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
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
			tables: [
				{ headers: ['登录账号', '姓名'], rows: [['guest', '访客']] },
			],
		},
		{ success: true, message: '已点击搜索。', meta: { outcome: { kind: 'none', progress: false } } }
	)
	if (!tableChangedSubmitResult.ok || !String(tableChangedSubmitResult.reason || '').includes('表格/列表摘要已变化')) {
		throw new Error(`search submit should verify when table/list result evidence changes, got ${JSON.stringify(tableChangedSubmitResult)}`)
	}
	const feedbackSubmitSandbox = loadVerifier({
		url: 'http://example.test/app',
		content: 'same-dom',
		feedback: [{ kind: 'info', text: '暂无数据' }],
	})
	const feedbackSubmitResult = await feedbackSubmitSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
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
			feedback: [],
		},
		{ success: true, message: '已点击搜索。', meta: { outcome: { kind: 'none', progress: false } } }
	)
	if (!feedbackSubmitResult.ok || !String(feedbackSubmitResult.reason || '').includes('空结果反馈')) {
		throw new Error(`search submit should verify with explicit result feedback, got ${JSON.stringify(feedbackSubmitResult)}`)
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
	const alreadyEmptyResetSandbox = loadVerifier({
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
	const alreadyEmptyResetResult = await alreadyEmptyResetSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'click_element_by_index',
			input: {
				workflow: 'search-fields',
				workflow_step: 'reset_filters',
				workflow_field_index: 2,
				workflow_filled_field_indexes: '2',
				index: 9,
			},
		},
		{
			url: 'http://example.test/app',
			content: 'same-dom',
			forms: [
				{
					fields: [
						{ index: 2, label: '登录账号', valueState: 'empty', value: '' },
					],
				},
			],
		},
		{ success: true, message: '已点击重置。', meta: { outcome: { kind: 'none', progress: false } } }
	)
	if (!alreadyEmptyResetResult.ok || !String(alreadyEmptyResetResult.reason || '').includes('处于空状态')) {
		throw new Error(`search reset should pass when tracked fields are already empty after reset, got ${JSON.stringify(alreadyEmptyResetResult)}`)
	}
	const dateSelectionSandbox = loadVerifier({
		url: 'http://example.test/app',
		content: 'date-option-selected',
		forms: [
			{
				fields: [
					{ index: 4, label: '创建时间', fieldType: 'daterange', role: 'combobox', valueState: 'empty' },
				],
			},
		],
		options: [
			{ index: 30, label: '2026-06-01', role: 'option', region: 'popover', selected: true, selectionControl: 'date-option' },
		],
	})
	const dateSelectionResult = await dateSelectionSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'choose_dropdown_option',
			input: {
				index: 4,
				text: '2026-06-01..2026-06-02',
				target_label: '创建时间',
				workflow: 'search-fields',
				workflow_step: 'select_option',
			},
		},
		{
			url: 'http://example.test/app',
			content: 'date-picker-open',
			forms: [
				{
					fields: [
						{ index: 4, label: '创建时间', fieldType: 'daterange', role: 'combobox', valueState: 'empty' },
					],
				},
			],
		},
		{ success: true, message: '已选择日期。', meta: { outcome: { kind: 'none', progress: false } } }
	)
	if (!dateSelectionResult.ok || !String(dateSelectionResult.reason || '').includes('日期/时间选择')) {
		throw new Error(`date-range selection should verify date picker progress even before field text settles, got ${JSON.stringify(dateSelectionResult)}`)
	}
	const unchangedResetSandbox = loadVerifier({
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
	const unchangedResetResult = await unchangedResetSandbox.NC_BG_VERIFIER.verifyExecutionOutcome(
		{ currentTabId: 1 },
		{
			name: 'click_element_by_index',
			input: {
				workflow: 'search-fields',
				workflow_step: 'reset_filters',
				workflow_field_index: 2,
				workflow_filled_field_indexes: '2',
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
	if (unchangedResetResult.ok || !String(unchangedResetResult.reason || '').includes('search_reset_field_not_cleared')) {
		throw new Error(`search reset should fail when tracked fields remain filled, got ${JSON.stringify(unchangedResetResult)}`)
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
	for (const expected of [
		'planningStageCounts',
		'runtimeStageCounts',
		'lastPlanningProgress',
		'lastRuntimeProgress',
		'formatProgressStageSummary',
		'进度阶段：${progressSummary}',
		'最后规划进度：${clampText(lastPlanningProgress, 500)}',
		'最后运行进度：${clampText(lastRuntimeProgress, 500)}',
		'execution_recovery',
		'verification_recovery',
		'dateCandidateOwnershipCount',
		'日期候选归属 ${Number(diagnostics.dateCandidateOwnershipCount)}',
		'verificationRecoveryIncompleteCount',
		'校验恢复未完成 ${Number(diagnostics.verificationRecoveryIncompleteCount)}',
	]) {
		if (!sidepanel.includes(expected)) {
			throw new Error(`sidepanel export diagnostics should summarize planning/runtime progress stages: missing ${expected}`)
		}
	}
	if (!sidepanel.includes('getModelErrorSummary') || !sidepanel.includes('lastModelError') || !sidepanel.includes('模型错误:')) {
		throw new Error('sidepanel should surface model request errors directly instead of hiding them only in raw IO')
	}
	if (!sidepanel.includes('extractCandidateDiagnostics') || !sidepanel.includes('candidateDiagnostics')) {
		throw new Error('sidepanel session export diagnostics should include candidate diagnostics for missed UI recognition')
	}
	if (!sidepanel.includes('const reason = String(payload.reason || payload.purpose') || !sidepanel.includes('原因：${reason}') || !sidepanel.includes('等待用户回答：${reason}')) {
		throw new Error('sidepanel should surface ask_user reason in the confirmation dialog and activity text')
	}
	if (!read('naturalclick-extension/sidepanel.html').includes('sp-model-error')) {
		throw new Error('sidepanel should style direct model error summaries')
	}
	if (
		!sidepanel.includes('renderPlanItemsCard') ||
		!sidepanel.includes('renderPlanItemRow') ||
		!sidepanel.includes('const planCard = renderPlanItemsCard(state.planItems)') ||
		!read('naturalclick-extension/sidepanel.html').includes('sp-plan-card')
	) {
		throw new Error('sidepanel should render persisted planItems as a visible live progress card')
	}
	if (
		!/runtimeSessionId:\s*sessionId/.test(sidepanel) ||
		!/activityText:\s*state\.activityText/.test(sidepanel) ||
		!/planItems:\s*cloneJson\(state\.planItems/.test(sidepanel)
	) {
		throw new Error('sidepanel should persist planItems, activityText, and runtimeSessionId for exported history diagnostics')
	}
}

function assertSidepanelExposesPlanningContextSettings() {
	const sidepanel = read('naturalclick-extension/sidepanel.js')
	const html = read('naturalclick-extension/sidepanel.html')
	for (const expected of [
		'cfg-text-timeout-sec',
		'cfg-full-observation-max-chars',
		'cfg-compact-observation-max-chars',
		'cfg-compact-element-threshold',
		'cfg-compact-raw-candidate-threshold',
		'sp-reset-planning-context',
		'文本模型单轮超时（秒）',
		'完整观察最大字符数',
		'精简观察最大字符数',
		'触发精简元素数',
		'触发精简 raw 数',
		'恢复规划默认值',
		'step="1"',
	]) {
		if (!html.includes(expected)) {
			throw new Error(`settings UI should expose planning context control ${expected}`)
		}
	}
	for (const expected of [
		'DEFAULT_TEXT_MODEL_TIMEOUT_MS',
		'DEFAULT_PLANNING_CONTEXT',
		'normalizeTextModelTimeoutMsForUi',
		'normalizePlanningContextForUi',
		'setPlanningContextToForm',
		'cfgTextTimeoutSec',
		'cfgCompactElementThreshold',
		'cfgCompactRawCandidateThreshold',
		'resetPlanningContext.addEventListener',
		'planning: normalizePlanningContextForUi',
		'currentConfig = result.config || config',
	]) {
		if (!sidepanel.includes(expected)) {
			throw new Error(`sidepanel should load/save/reset planning context config: missing ${expected}`)
		}
	}
}

function assertManifestVersion() {
	const manifest = JSON.parse(read('naturalclick-extension/manifest.json'))
	const version = String(manifest.version || '').trim()
	const match = version.match(/^0\.(\d+)\.(\d+)$/)
	if (!match) {
		throw new Error(`unexpected manifest version format: ${manifest.version}`)
	}
	const minor = Number(match[1])
	const patch = Number(match[2])
	if (!Number.isInteger(minor) || minor < 1 || !Number.isInteger(patch) || patch < 1 || patch > 99) {
		throw new Error(`manifest version must keep tail version in 1-99 and carry after 0.X.99, got ${manifest.version}`)
	}
	for (const file of [
		'README.md',
		'README.zh-CN.md',
		'docs/runtime-configuration-and-diagnostics.md',
		'docs/runtime-configuration-and-diagnostics.zh-CN.md',
	]) {
		const text = read(file)
		if (!text.includes(version)) {
			throw new Error(`${file} should mention current manifest version ${version}`)
		}
	}
	const readmeZh = read('README.zh-CN.md')
	if (!readmeZh.includes('0.X.99') || !readmeZh.includes('0.(X+1).1') || !readmeZh.includes('0.X.1') || !readmeZh.includes('push')) {
		throw new Error('README.zh-CN.md should document the carry rule and required commit/push for every 0.X.1 release')
	}
	const readmeEn = read('README.md')
	if (!readmeEn.includes('0.X.99') || !readmeEn.includes('0.(X+1).1') || !readmeEn.includes('0.X.1') || !readmeEn.includes('committed and pushed')) {
		throw new Error('README.md should document the carry rule and required commit/push for every 0.X.1 release')
	}
}

try {
Promise.resolve(main()).catch((error) => {
		console.error(error?.stack || error?.message || error)
		process.exit(1)
	})
} catch (error) {
	console.error(error?.stack || error?.message || error)
	process.exit(1)
}
