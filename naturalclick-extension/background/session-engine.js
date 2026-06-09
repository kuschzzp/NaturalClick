;(function (g) {
	const { MAX_CONSECUTIVE_FAILURES } = g.NC_BG_CONSTANTS
	const OBSERVATION_HEARTBEAT_INITIAL_MS = 2200
	const OBSERVATION_HEARTBEAT_INTERVAL_MS = 4500
	const ACTION_EXECUTION_HEARTBEAT_INITIAL_MS = 2500
	const ACTION_EXECUTION_HEARTBEAT_INTERVAL_MS = 5000
	const VERIFICATION_HEARTBEAT_INITIAL_MS = 1800
	const VERIFICATION_HEARTBEAT_INTERVAL_MS = 4000
	const sessionRecords = g.NC_BG_SESSION_RECORDS
	if (!sessionRecords) throw new Error('NC_BG_SESSION_RECORDS 未加载。')
	const sessionRecovery = g.NC_BG_SESSION_RECOVERY
	if (!sessionRecovery) throw new Error('NC_BG_SESSION_RECOVERY 未加载。')
	const sessionTiming = g.NC_BG_SESSION_TIMING
	if (!sessionTiming) throw new Error('NC_BG_SESSION_TIMING 未加载。')
	const sessionLifecycle = g.NC_BG_SESSION_LIFECYCLE
	if (!sessionLifecycle) throw new Error('NC_BG_SESSION_LIFECYCLE 未加载。')
	const loopGuard = g.NC_BG_LOOP_GUARD
	if (!loopGuard) throw new Error('NC_BG_LOOP_GUARD 未加载。')
	const {
		appendExecutionOutcomeSummary,
		appendOutcomeSummary,
		appendVerificationFailureOutcome,
		buildReflection,
		createActionOutcome,
		createVerificationFailureOutcome,
		derivePlanItems,
		getExecutionOutcome,
		recordVerificationSuccess,
		summarizeExecutionOutcome,
	} = sessionRecords
	const {
		attemptExecutionVisionFallback,
		attemptVerificationRecovery,
		buildExecutionVisionFallbackActivityText,
		shouldAttemptExecutionVisionFallback,
		shouldAttemptVisionFallbackForFailure,
	} = sessionRecovery
	const {
		getEffectiveModelRoundTimeoutMs,
		getPlanningTimeoutMs,
		settleAfterAction,
		withTimeout,
	} = sessionTiming
	const {
		appendTrace,
		failSession,
		finalizeIfAborted,
		finalizeStoppedSession,
		publishPlanningProgress,
		publishRuntimeProgress,
		publishSession,
	} = sessionLifecycle
	const {
		classifyLoopGuardReason,
		countRecentLoopGuardFailures,
		detectActionLoop,
		detectRedundantInputRewrite,
		getUnsafeDoneSuccessReason,
		hasVerifiedProgress,
		stableActionInputSignature,
	} = loopGuard

	async function runSession(session, sessions) {
		publishSession(session)
		while (!session.aborted && session.step < session.config.maxSteps) {
			session.step += 1
			session.activityText = `第 ${session.step} 步：观察页面...`
			publishSession(session)

			const observation = await requestObservationWithProgressHeartbeat(session, () =>
				g.NC_BG_EXECUTOR.requestObservation(session.currentTabId)
			)
			if (finalizeIfAborted(session, sessions)) return
			if (!observation?.ok) {
				failSession(session, observation?.error || '无法读取页面状态', sessions)
				return
			}
			session.observedFieldInventory = buildObservedFieldInventory(observation.data)

			session.currentRuntimeProgress = null
			session.planItems = derivePlanItems(session)
			session.activityText = `第 ${session.step} 步：规划动作...`
			publishSession(session)

			let decision = null
			try {
				decision = await withTimeout(
					g.NC_BG_PLANNER.planAction(session, observation.data, {
						onProgress: (event) => publishPlanningProgress(session, event),
					}),
					getPlanningTimeoutMs(session),
					`第 ${session.step} 步规划动作超时`
				)
			} catch (error) {
				failSession(session, `规划动作失败: ${String(error?.message || error || '未知错误')}`, sessions)
				return
			}
			if (finalizeIfAborted(session, sessions)) return
			if (!decision?.action?.name) {
				failSession(session, '模型返回了无效动作', sessions)
				return
			}
			session.currentPlanningProgress = null
			session.planItems = derivePlanItems(session)

			if (decision.action.name === 'done') {
				const unsafeDone = getUnsafeDoneSuccessReason(session, decision)
				const doneSuccess = decision.action.input?.success !== false && !unsafeDone
				session.status = doneSuccess ? 'completed' : 'error'
				const doneText = decision.action.input?.text || '任务完成。'
				session.activityText = unsafeDone ? `${doneText}（已拦截: ${unsafeDone}）` : doneText
				const doneOutcome = doneSuccess
					? null
					: createActionOutcome('no_effect', {
						progress: false,
						reason: unsafeDone || doneText || 'done 失败结束',
					})
				const doneOutput = doneOutcome
					? appendOutcomeSummary(session.activityText, doneOutcome)
					: session.activityText
				session.history.push({
					stepIndex: session.step,
					thought: decision.thought || '',
					evaluationPreviousGoal: decision.evaluation_previous_goal || '',
					memory: decision.memory || '',
					nextGoal: decision.next_goal || '',
					action: 'done',
					input: decision.action.input || {},
					success: doneSuccess,
					output: doneOutput,
					outcome: doneOutcome,
				})
				appendTrace(session, {
					title: `步骤 ${session.step}: done`,
					detail: doneOutput,
					kind: doneSuccess ? 'step' : 'error',
					reflection: buildReflection(decision),
					action: {
						name: 'done',
						input: decision.action.input || {},
						output: doneOutput,
						outcome: doneOutcome,
					},
				})
				recordWorkflowOutcomeAndRefreshPlan(session, decision, {
					success: doneSuccess,
					output: doneOutput,
					outcome: doneOutcome,
					reason: unsafeDone || doneText,
					stage: 'done',
				})
				publishSession(session)
				sessions.delete(session.id)
				return
			}

			const loopGuard = detectActionLoop(session, decision)
			if (loopGuard.blocked) {
				if (recordLoopGuardReplan(session, decision, loopGuard, sessions)) return
				continue
			}

			session.activityText = buildDecisionActivityText(session, decision)
			publishSession(session)

			const danger = g.NC_BG_CONFIRMATION.detectDangerousAction(session, decision)
			if (danger.isDangerous) {
				session.activityText = `高风险动作待确认: ${danger.reason}`
				publishSession(session)
				const approved = await g.NC_BG_CONFIRMATION.requestUserConfirmation(session, {
					title: '危险动作确认',
					description: `任务: ${session.task}\n步骤: ${session.step}\n动作: ${decision.action.name}\n原因: ${danger.reason}\n是否继续执行？`,
				})
				if (finalizeIfAborted(session, sessions)) return
				if (!approved) {
					failSession(session, '用户拒绝了高风险动作，任务已停止。', sessions)
					return
				}
				session.activityText = '已确认高风险动作，继续执行。'
				publishSession(session)
			}

			if (finalizeIfAborted(session, sessions)) return
			let execution = null
			const redundantInput = detectRedundantInputRewrite(session, decision.action)
			if (redundantInput.blocked) {
				execution = {
					success: false,
					message: redundantInput.reason,
				}
			} else {
				execution = await executeActionWithProgressHeartbeat(session, decision.action, () =>
					g.NC_BG_EXECUTOR.executeAction(session, decision.action)
				)
			}
			session.currentRuntimeProgress = null
			if (finalizeIfAborted(session, sessions)) return
			if (shouldAttemptExecutionVisionFallback(decision.action, execution)) {
				publishRuntimeProgress(session, {
					stage: 'execution_recovery',
					text: buildExecutionVisionFallbackActivityText(session, execution),
				})
				if (finalizeIfAborted(session, sessions)) return

				execution = await attemptExecutionVisionFallback(
					session,
					decision,
					observation.data,
					execution
				)
				session.currentRuntimeProgress = null
				if (finalizeIfAborted(session, sessions)) return
			}

			await settleAfterAction(decision.action)
			if (finalizeIfAborted(session, sessions)) return

			if (
				execution?.success === false &&
				g.NC_BG_VERIFIER.shouldVerifyFailedExecution?.(decision.action, execution)
			) {
				session.activityText = `第 ${session.step} 步：动作超时，正在观察页面状态确认是否已生效...`
				publishSession(session)
				const postFailureVerify = await verifyActionWithProgressHeartbeat(
					session,
					decision.action,
					() => g.NC_BG_VERIFIER.verifyExecutionOutcome(
						session,
						decision.action,
						observation.data,
						execution
					),
					{ failedExecution: true }
				)
				session.currentRuntimeProgress = null
				if (finalizeIfAborted(session, sessions)) return
				if (postFailureVerify?.ok) {
					const reason = String(postFailureVerify.reason || '动作后页面状态已满足目标')
					execution = {
						...execution,
						success: true,
						message: `${execution.message || '动作执行超时。'} | 观察复核成功: ${reason}`,
						meta: {
							...(execution.meta || {}),
							verifiedAfterFailure: true,
							outcome: postFailureVerify.outcome || createActionOutcome('input_verified', {
								reason: `动作超时后观察复核成功: ${reason}`,
							}),
						},
					}
				}
			}

			const executionOutput = appendExecutionOutcomeSummary(execution.message, execution)
			const executionOutcome = getExecutionOutcome(execution)
			session.history.push({
				stepIndex: session.step,
				thought: decision.thought || '',
				evaluationPreviousGoal: decision.evaluation_previous_goal || '',
				memory: decision.memory || '',
				nextGoal: decision.next_goal || '',
				action: decision.action.name,
				input: decision.action.input || {},
				success: execution.success,
				output: executionOutput,
				outcome: executionOutcome,
				verifiedAfterFailure: execution?.meta?.verifiedAfterFailure === true,
			})
			appendTrace(session, {
				title: `步骤 ${session.step}: ${decision.action.name}`,
				detail: executionOutput,
				kind: execution.success ? 'step' : 'error',
				reflection: buildReflection(decision),
				action: {
					name: decision.action.name,
					input: decision.action.input || {},
					output: executionOutput,
				},
			})

			if (!execution.success) {
				recordWorkflowOutcomeAndRefreshPlan(session, decision, {
					success: false,
					output: executionOutput,
					outcome: executionOutcome,
					stage: 'execution',
				})
				session.consecutiveFailures += 1
				session.activityText = executionOutput
				publishSession(session)
				if (session.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
					failSession(
						session,
						`连续失败 ${session.consecutiveFailures} 次，任务终止。最后错误: ${executionOutput}`,
						sessions
					)
					return
				}
				continue
			}

			const shouldVerify =
				g.NC_BG_VERIFIER.shouldVerifyAction(decision.action) &&
				!execution?.meta?.verifiedAfterFailure
			if (shouldVerify) {
				if (finalizeIfAborted(session, sessions)) return
				const verify = await verifyActionWithProgressHeartbeat(
					session,
					decision.action,
					() => g.NC_BG_VERIFIER.verifyExecutionOutcome(
						session,
						decision.action,
						observation.data,
						execution
					)
				)
				session.currentRuntimeProgress = null
				if (finalizeIfAborted(session, sessions)) return
				if (!verify.ok) {
					const recovery = await attemptVerificationRecovery(
						session,
						decision,
						observation.data,
						verify.reason,
						{
							onProgress: (text) => {
								publishRuntimeProgress(session, {
									stage: 'verification_recovery',
									text,
								})
							},
						}
					)
					session.currentRuntimeProgress = null
					if (finalizeIfAborted(session, sessions)) return
					if (recovery.success) {
						const recoveryOutput = appendExecutionOutcomeSummary(recovery.message, recovery)
						const recoveryOutcome = getExecutionOutcome(recovery)
						session.history.push({
							stepIndex: `${session.step}.r`,
							thought: 'post-action verification recovery',
							evaluationPreviousGoal: `动作校验失败后已恢复: ${verify.reason}`,
							memory: decision.memory || '',
							nextGoal: decision.next_goal || '继续执行任务',
							action: `${decision.action.name}.vision_recovery`,
							input: decision.action.input || {},
							success: true,
							output: recoveryOutput,
							outcome: recoveryOutcome,
						})
						appendTrace(session, {
							title: `步骤 ${session.step}: 视觉恢复`,
							detail: recoveryOutput,
							kind: 'step',
							reflection: buildReflection(decision),
							action: {
								name: `${decision.action.name}.vision_recovery`,
								input: decision.action.input || {},
								output: recoveryOutput,
							},
						})
						recordWorkflowOutcomeAndRefreshPlan(session, decision, {
							success: true,
							output: recoveryOutput,
							outcome: recoveryOutcome,
							stage: 'verification_recovery',
						})
						session.consecutiveFailures = 0
						session.activityText = recoveryOutput
						publishSession(session)
						continue
					}
					const verifyMsg = appendVerificationFailureOutcome(
						buildVerificationFailureOutput(verify.reason, recovery),
						verify.reason
					)
					const verifyOutcome = createVerificationFailureOutcome(verify.reason)
					session.history.push({
						stepIndex: `${session.step}.v`,
						thought: 'post-action verification',
						evaluationPreviousGoal: verifyMsg,
						memory: decision.memory || '',
						nextGoal: decision.next_goal || 'replan',
						action: decision.action.name,
						input: decision.action.input || {},
						success: false,
						output: verifyMsg,
						outcome: verifyOutcome,
					})
					appendTrace(session, {
						title: `步骤 ${session.step}: 校验失败`,
						detail: verifyMsg,
						kind: 'error',
						action: {
							name: `${decision.action.name}.verify`,
							input: decision.action.input || {},
							output: verifyMsg,
						},
					})
					recordWorkflowOutcomeAndRefreshPlan(session, decision, {
						success: false,
						output: verifyMsg,
						outcome: verifyOutcome,
						reason: verify.reason,
						stage: 'verification',
					})
					session.consecutiveFailures += 1
					session.activityText = verifyMsg
					publishSession(session)
					if (session.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
						failSession(
							session,
							`连续失败 ${session.consecutiveFailures} 次，任务终止。最后错误: ${verifyMsg}`,
							sessions
						)
						return
					}
					continue
				}
				recordVerificationSuccess(session, decision, verify)
				session.activityText = session.history[session.history.length - 1]?.output || session.activityText
			}

			recordWorkflowOutcomeAndRefreshPlan(session, decision, {
				success: true,
				output: session.history[session.history.length - 1]?.output || executionOutput,
				outcome: session.history[session.history.length - 1]?.outcome || executionOutcome,
				stage: shouldVerify ? 'verification' : 'execution',
			})
			session.consecutiveFailures = 0
			publishSession(session)
		}

		if (session.aborted) {
			finalizeStoppedSession(session, sessions)
			return
		}

		if (session.status === 'running') {
			failSession(session, '达到最大步数，任务未完成。', sessions)
			return
		}
		sessions.delete(session.id)
	}

	function recordWorkflowOutcome(session, decision, outcome) {
		const recorder = g.NC_BG_PLANNER_WORKFLOWS?.recordWorkflowOutcome
		if (typeof recorder !== 'function') return
		try {
			recorder(session, decision, outcome)
		} catch (error) {
			appendTrace(session, {
				title: '工作流状态记录失败',
				detail: String(error?.message || error || '未知错误'),
				kind: 'error',
			})
		}
	}

	function recordWorkflowOutcomeAndRefreshPlan(session, decision, outcome) {
		recordWorkflowOutcome(session, decision, outcome)
		session.planItems = derivePlanItems(session)
	}

	function buildDecisionActivityText(session, decision) {
		const step = Number(session?.step) || 0
		const input = decision?.action?.input || {}
		const workflowStep = String(input.workflow_step || '').trim()
		const workflowText = buildWorkflowStepActivityText(workflowStep, input)
		if (workflowText) return `第 ${step} 步：${workflowText}...`
		const goal = cleanActivityFragment(decision?.next_goal)
		if (goal) return `第 ${step} 步：${goal}...`
		const actionName = String(decision?.action?.name || '动作').trim()
		if (actionName === 'wait') {
			const reason = cleanActivityFragment(input.reason || input.purpose)
			if (reason) return `第 ${step} 步：${/^等待/.test(reason) ? reason : `等待${reason}`}...`
		}
		const target = cleanActivityFragment(input.target_label || input.workflow_field_label || input.label || input.text)
		return target
			? `第 ${step} 步：执行 ${actionName}：${target}...`
			: `第 ${step} 步：执行 ${actionName}...`
	}

	function buildWorkflowStepActivityText(workflowStep, input) {
		const label = getWorkflowActivityTitleLabel(workflowStep, input)
		const templates = {
			fill_username: '填写登录账号',
			fill_password: '填写登录密码',
			submit_login: '提交登录表单',
			navigate_to_task_target: '进入目标模块',
			reveal_navigation_options: '展开相关导航',
			expand_search_panel: '展开搜索区域',
			fill_field: '填写搜索字段',
			open_dropdown: '展开搜索字段',
			select_option: '选择搜索候选',
			submit_search: '提交当前搜索',
			reset_filters: '清空当前搜索条件',
			clear_field: '清空搜索字段',
			skip_field: '安全跳过搜索字段',
			view_first_record_detail: '查看列表记录详情',
			return_after_record_view: '返回列表继续后续任务',
			fill_form_field_timeout_recovery: '填写表单字段',
			open_form_dropdown_timeout_recovery: '展开表单选择字段',
			choose_form_dropdown_timeout_recovery: '选择表单候选',
			select_cascader_path_timeout_recovery: '选择级联路径',
			select_visible_cascader_option_timeout_recovery: '选择可见级联候选',
			submit_form_timeout_recovery: '提交表单',
			resolve_duplicate_field_conflict: '替换重复字段内容',
			resolve_field_validation_error: '修正校验失败字段',
			open_create_form_timeout_recovery: '打开创建入口',
			finish_create_after_submit_no_form: '确认创建提交完成',
		}
		const base = templates[workflowStep] || ''
		if (!base) return ''
		const detail = buildWorkflowActivityDetail(workflowStep, input)
		const title = label ? `${base}：${label}` : base
		return `${title}${detail}`
	}

	function getWorkflowActivityTitleLabel(workflowStep, input) {
		const fieldLabel = cleanActivityFragment(input?.workflow_field_label)
		if (fieldLabel && isFieldScopedWorkflowActivity(workflowStep)) return fieldLabel
		if (workflowStep === 'open_create_form_timeout_recovery') {
			return cleanActivityFragment(input?.workflow_create_label || input?.target_label || input?.label || input?.text)
		}
		if (workflowStep === 'submit_form_timeout_recovery') {
			return cleanActivityFragment(input?.workflow_submit_label || input?.target_label || input?.label || input?.text)
		}
		return cleanActivityFragment(input?.target_label || fieldLabel || input?.label || input?.text)
	}

	function isFieldScopedWorkflowActivity(workflowStep) {
		return [
			'fill_field',
			'open_dropdown',
			'select_option',
			'clear_field',
			'skip_field',
			'fill_form_field_timeout_recovery',
			'open_form_dropdown_timeout_recovery',
			'choose_form_dropdown_timeout_recovery',
			'select_cascader_path_timeout_recovery',
			'select_visible_cascader_option_timeout_recovery',
			'resolve_duplicate_field_conflict',
			'resolve_field_validation_error',
		].includes(String(workflowStep || '').trim())
	}

	function buildWorkflowActivityDetail(workflowStep, input) {
		if (!workflowStep || !input || typeof input !== 'object') return ''
		const parts = []
		const value = formatWorkflowActivityValue(input)
		const source = cleanActivityFragment(input.workflow_value_source)
		const basis = cleanActivityFragment(input.workflow_value_basis)
		if (['fill_field', 'select_option'].includes(workflowStep) && value) {
			parts.push(`值=${value}`)
		}
		if (workflowStep === 'submit_search' && value) {
			parts.push(`验证值=${value}`)
		}
		if ([
			'fill_form_field_timeout_recovery',
			'choose_form_dropdown_timeout_recovery',
			'select_visible_cascader_option_timeout_recovery',
			'resolve_duplicate_field_conflict',
			'resolve_field_validation_error',
		].includes(workflowStep) && value) {
			parts.push(`值=${value}`)
		}
		const path = formatActionExecutionPath(input.path, input)
		if (path) {
			parts.push(`路径=${path}`)
		}
		if (source) parts.push(`来源=${formatWorkflowValueSource(source)}`)
		if (basis) parts.push(`依据=${basis}`)
		if (workflowStep === 'reset_filters' && input.workflow_baseline_reset) {
			parts.push('恢复列表基线')
		}
		if (workflowStep === 'clear_field') {
			parts.push(input.workflow_clear_context === 'baseline' ? '字段级恢复基线' : '字段级置空兜底')
		}
		if (workflowStep === 'skip_field') {
			parts.push('缺少真实样本/候选证据')
		}
		if (workflowStep === 'open_create_form_timeout_recovery') {
			parts.push('点击后复核表单是否出现')
		}
		if (workflowStep === 'finish_create_after_submit_no_form') {
			parts.push('提交后表单已消失，避免重复创建')
		}
		const navTarget = cleanActivityFragment(input.workflow_nav_key || input.workflow_nav_alias)
		if (navTarget && !parts.includes(`目标=${navTarget}`)) parts.push(`目标=${navTarget}`)
		const region = cleanActivityFragment(input.target_region || input.region)
		if (region) parts.push(`区域=${region}`)
		const index = Number(input.index)
		if (Number.isFinite(index)) parts.push(`index=${index}`)
		const resultStatus = cleanActivityFragment(input.workflow_result_status)
		if (resultStatus) parts.push(`结果=${resultStatus}`)
		return parts.length ? `（${parts.join('，')}）` : ''
	}

	function formatWorkflowActivityValue(input) {
		const raw = [
			input.workflow_test_value,
			input.workflow_requested_text,
			input.text,
			input.value,
			input.selected_text,
			input.option,
			input.label,
		].map((value) => String(value ?? '').trim()).find(Boolean)
		if (!raw) return ''
		if (isSensitiveActionInput(input)) return '已隐藏'
		return cleanActivityFragment(raw)
	}

	function formatWorkflowValueSource(source) {
		const key = String(source || '').trim()
		const labels = {
			table_sample: '列表样本',
			task_value: '任务文本',
			visible_option: '真实候选',
			option_candidate: '真实候选',
			missing_sample: '缺少样本',
		}
		return labels[key] || key
	}

	function cleanActivityFragment(value) {
		const text = String(value || '').replace(/\s+/g, ' ').trim()
		if (!text) return ''
		return text
			.replace(/[。；;，,.\s]+$/g, '')
			.slice(0, 96)
	}

	async function requestObservationWithProgressHeartbeat(session, requestObservation) {
		const startedAt = Date.now()
		let timer = null
		const initialMs = getObservationHeartbeatInitialMs(session)
		const intervalMs = getObservationHeartbeatIntervalMs(session)
		const publishHeartbeat = () => {
			if (session && !session.aborted && session.status === 'running') {
				const elapsedMs = Date.now() - startedAt
				publishRuntimeProgress(session, {
					stage: 'observation_heartbeat',
					elapsedMs,
					text: buildObservationHeartbeatText(session, elapsedMs),
				})
			}
			timer = setTimeout(publishHeartbeat, intervalMs)
		}
		timer = setTimeout(publishHeartbeat, initialMs)
		try {
			return await requestObservation()
		} finally {
			if (timer) clearTimeout(timer)
		}
	}

	function getObservationHeartbeatInitialMs(session) {
		return normalizeObservationHeartbeatMs(
			session?.config?.observationHeartbeatInitialMs,
			OBSERVATION_HEARTBEAT_INITIAL_MS
		)
	}

	function getObservationHeartbeatIntervalMs(session) {
		return normalizeObservationHeartbeatMs(
			session?.config?.observationHeartbeatIntervalMs,
			OBSERVATION_HEARTBEAT_INTERVAL_MS
		)
	}

	function normalizeObservationHeartbeatMs(value, fallback) {
		const number = Number(value)
		if (!Number.isFinite(number)) return fallback
		return Math.max(0, Math.min(60000, Math.round(number)))
	}

	function buildObservationHeartbeatText(session, elapsedMs = 0) {
		const step = Number(session?.step) || 0
		const seconds = Math.max(1, Math.round(Number(elapsedMs || 0) / 1000))
		return `第 ${step} 步：正在读取页面结构，已等待 ${seconds} 秒；正在提取可交互元素、表单字段、按钮、表格、弹层和候选项，页面较大时会先压缩观察再规划。`
	}

	function buildObservedFieldInventory(observation) {
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		const items = []
		const seen = new Set()
		const addField = (field, form = null) => {
			const item = normalizeObservedFieldInventoryItem(field, form)
			if (!item || seen.has(item.key)) return false
			seen.add(item.key)
			items.push(item)
			return items.length >= 120
		}
		for (const form of forms) {
			for (const field of (Array.isArray(form?.fields) ? form.fields : [])) {
				if (addField(field, form)) return items
			}
		}
		for (const field of collectStandaloneObservedFieldInventorySources(observation)) {
			if (addField(field, null)) return items
		}
		return items
	}

	function collectStandaloneObservedFieldInventorySources(observation) {
		const sources = [
			...(Array.isArray(observation?.elements) ? observation.elements : []),
			...(Array.isArray(observation?.actions) ? observation.actions : []),
			...(Array.isArray(observation?.popups) ? observation.popups : []),
		]
		return sources.filter(isStandaloneObservedFieldInventorySource)
	}

	function isStandaloneObservedFieldInventorySource(item) {
		if (!item || typeof item !== 'object') return false
		if (String(item.actionIntent || '').trim()) return false
		return hasObservedFieldInventorySignal(item)
	}

	function hasObservedFieldInventorySignal(item) {
		if (!item || typeof item !== 'object') return false
		if (item.editable === true) return true
		const role = String(item.role || '').trim().toLowerCase()
		const tag = String(item.tag || '').trim().toLowerCase()
		const type = String(item.type || '').trim().toLowerCase()
		const descriptor = normalizeInventoryText([
			item.kind,
			item.controlKind,
			item.selectionControl,
			item.control,
			item.fieldType,
			role,
			tag,
			type,
		].filter(Boolean).join(' '))
		if (/^(input|textarea|select)$/.test(tag)) return true
		if (/^(textbox|searchbox|combobox|spinbutton|checkbox|radio|switch)$/.test(role)) return true
		if (/^(text|search|email|tel|url|number|password|date|time|datetime-local|month|week)$/.test(type)) return true
		return /(input|textarea|textbox|searchbox|select|dropdown|combobox|tree-?select|cascader|picker|calendar|date|time|checkbox|radio|switch|toggle)/i.test(descriptor)
	}

	function normalizeObservedFieldInventoryItem(field, form) {
		if (!field || typeof field !== 'object') return null
		const role = String(field.role || '').trim().toLowerCase()
		if (/^(button|link|menuitem|tab|option|presentation)$/i.test(role)) return null
		const label = String(
			field.label ||
			field.placeholder ||
			field.name ||
			field.text ||
			''
		).trim()
		const index = Number(field.index)
		if (!label && !Number.isFinite(index)) return null
		const key = Number.isFinite(index)
			? `index:${index}`
			: `label:${normalizeInventoryText(label)}`
		if (!key || key === 'label:') return null
		return {
			key,
			index: Number.isFinite(index) ? index : null,
			label: label || key,
			kind: classifyObservedFieldKind(field),
			role: role || '',
			type: String(field.type || '').trim().toLowerCase(),
			fieldType: String(field.fieldType || '').trim(),
			control: String(field.selectionControl || field.control || field.controlKind || field.kind || '').trim(),
			region: String(field.region || form?.region || '').trim(),
			form: String(form?.name || form?.id || '').trim(),
			valueState: String(field.valueState || '').trim().replace(/:.+$/, ''),
		}
	}

	function classifyObservedFieldKind(field) {
		const role = String(field?.role || '').trim().toLowerCase()
		const tag = String(field?.tag || '').trim().toLowerCase()
		const type = String(field?.type || '').trim().toLowerCase()
		const fieldType = String(field?.fieldType || '').trim().toLowerCase()
		const control = String(field?.selectionControl || field?.control || '').trim().toLowerCase()
		const kind = String(field?.kind || field?.controlKind || '').trim().toLowerCase()
		const combined = `${role} ${tag} ${type} ${fieldType} ${control} ${kind}`
		if (/(checkbox|radio|switch|toggle)/i.test(combined)) {
			if (/radio/i.test(combined)) return 'radio'
			if (/switch|toggle/i.test(combined)) return 'switch'
			return 'checkbox'
		}
		if (/(select|dropdown|combobox|listbox|option|cascader|date|time|picker|calendar|multi)/i.test(combined)) {
			return 'selection'
		}
		if (
			field?.editable === true ||
			tag === 'input' ||
			tag === 'textarea' ||
			role === 'textbox' ||
			/^(text|search|email|tel|url|number|password|textarea)$/i.test(type) ||
			/(input|textarea|textbox|text|name|email|phone|tel|url|number|password|account|username|comment|remark)/i.test(combined)
		) {
			return 'input'
		}
		return 'field'
	}

	function normalizeInventoryText(value) {
		return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
	}

	async function executeActionWithProgressHeartbeat(session, action, executeAction) {
		const startedAt = Date.now()
		let timer = null
		const initialMs = getActionExecutionHeartbeatInitialMs(session)
		const intervalMs = getActionExecutionHeartbeatIntervalMs(session)
		const publishHeartbeat = () => {
			if (session && !session.aborted && session.status === 'running') {
				const elapsedMs = Date.now() - startedAt
				publishRuntimeProgress(session, {
					stage: 'action_execution_heartbeat',
					elapsedMs,
					text: buildActionExecutionHeartbeatText(session, action, elapsedMs),
				})
			}
			timer = setTimeout(publishHeartbeat, intervalMs)
		}
		timer = setTimeout(publishHeartbeat, initialMs)
		try {
			return await executeAction()
		} finally {
			if (timer) clearTimeout(timer)
		}
	}

	function getActionExecutionHeartbeatInitialMs(session) {
		return normalizeActionHeartbeatMs(
			session?.config?.actionExecutionHeartbeatInitialMs,
			ACTION_EXECUTION_HEARTBEAT_INITIAL_MS
		)
	}

	function getActionExecutionHeartbeatIntervalMs(session) {
		return normalizeActionHeartbeatMs(
			session?.config?.actionExecutionHeartbeatIntervalMs,
			ACTION_EXECUTION_HEARTBEAT_INTERVAL_MS
		)
	}

	function normalizeActionHeartbeatMs(value, fallback) {
		const number = Number(value)
		if (!Number.isFinite(number)) return fallback
		return Math.max(0, Math.min(60000, Math.round(number)))
	}

	function buildActionExecutionHeartbeatText(session, action, elapsedMs = 0) {
		const step = Number(session?.step) || 0
		const base = buildDecisionActivityText({ step }, { action }).replace(/\.\.\.$/, '')
		const seconds = Math.max(1, Math.round(Number(elapsedMs || 0) / 1000))
		const detail = buildActionExecutionTargetDetail(action, session)
		return `${base}${detail ? `；目标细节：${detail}` : ''}，仍在执行，已等待 ${seconds} 秒；${buildActionExecutionWaitHint(action)}`
	}

	function buildActionExecutionTargetDetail(action, session = null) {
		const input = action?.input || {}
		if (!input || typeof input !== 'object') return ''
		const parts = []
		const index = Number(input.index ?? input.workflow_field_index)
		if (Number.isFinite(index)) parts.push(`index=${index}`)
		const label = cleanActivityFragment(input.workflow_field_label || input.target_label || input.label || input.name || input.placeholder)
		if (label) parts.push(`字段=${label}`)
		const path = formatActionExecutionPath(input.path, input)
		if (path) parts.push(`路径=${path}`)
		const value = formatActionExecutionValue(input)
		if (value) parts.push(`值=${value}`)
		const source = cleanActivityFragment(input.workflow_value_source || input.value_source)
		if (source) parts.push(`来源=${formatWorkflowValueSource(source)}`)
		const candidates = formatActionExecutionCandidatePreview(action, session)
		if (candidates) parts.push(`候选=${candidates}`)
		return parts.slice(0, 6).join('，')
	}

	function formatActionExecutionCandidatePreview(action, session = null) {
		const input = action?.input || {}
		if (isSensitiveActionInput(input)) return ''
		const direct = collectActionCandidateValues([
			input.workflow_visible_candidates,
			input.visibleOptions,
			input.candidates,
			input.options,
		])
		const candidates = direct.length ? direct : collectSessionPendingCandidatesForAction(action, session)
		if (!candidates.length) return ''
		return candidates.slice(0, 4).join('|')
	}

	function collectActionCandidateValues(values) {
		const out = []
		const seen = new Set()
		for (const value of Array.isArray(values) ? values : []) {
			const items = Array.isArray(value)
				? value
				: String(value || '').split(/\s*(?:\||,|，|、)\s*/g)
			for (const item of items) {
				const text = cleanActivityFragment(item)
				const key = normalizeInventoryText(text)
				if (!key || seen.has(key)) continue
				seen.add(key)
				out.push(text)
			}
		}
		return out
	}

	function collectSessionPendingCandidatesForAction(action, session = null) {
		const input = action?.input || {}
		if (!isSelectionExecutionAction(action)) return []
		const state = session?.workflowState?.search
		if (!state || typeof state !== 'object') return []
		const actionKey = buildActionExecutionFieldKey(input)
		const activeKey = String(state.activeFieldKey || state.lastSearchedFieldKey || '')
		if (actionKey && activeKey && actionKey !== activeKey) return []
		return collectActionCandidateValues([state.pendingDropdownCandidates])
	}

	function isSelectionExecutionAction(action) {
		const name = String(action?.name || '')
		const step = String(action?.input?.workflow_step || '')
		return /dropdown|option|cascader|select|checkbox/i.test(name) ||
			/open_dropdown|select_option|cascader|checkbox/i.test(step)
	}

	function buildActionExecutionFieldKey(input) {
		const index = Number(input?.workflow_field_index ?? input?.index)
		if (Number.isFinite(index)) return `index:${index}`
		const label = normalizeInventoryText(input?.workflow_field_label || input?.target_label || input?.label || '')
		return label ? `label:${label}` : ''
	}

	function formatActionExecutionPath(path, input) {
		const values = Array.isArray(path)
			? path
			: String(path || '').split(/\s*(?:->|→|＞|>|\/|\\|,|，|、|\|)\s*/g)
		const cleaned = values
			.map((item) => cleanActivityFragment(item))
			.filter(Boolean)
			.slice(0, 6)
		if (!cleaned.length) return ''
		if (isSensitiveActionInput(input)) return '已隐藏'
		return cleaned.join(' / ')
	}

	function formatActionExecutionValue(input) {
		const raw = [
			input.workflow_test_value,
			input.workflow_requested_text,
			input.text,
			input.value,
			input.selected_text,
			input.option,
		].map((value) => String(value ?? '').trim()).find(Boolean)
		if (!raw) return ''
		if (isSensitiveActionInput(input)) return '已隐藏'
		return cleanActivityFragment(raw)
	}

	function isSensitiveActionInput(input) {
		const descriptor = [
			input?.target_label,
			input?.workflow_field_label,
			input?.label,
			input?.name,
			input?.placeholder,
			input?.type,
			input?.fieldType,
			input?.workflow_field_type,
			input?.inputMode,
		].filter(Boolean).join(' ')
		return /(password|passwd|pwd|secret|token|api[_-]?key|csrf|otp|verify|verification|captcha|code|密码|口令|密钥|秘钥|令牌|验证码|校验码|动态码|短信码)/i.test(descriptor)
	}

	function buildActionExecutionWaitHint(action) {
		const name = String(action?.name || '').trim()
		const step = String(action?.input?.workflow_step || '').trim()
		if (name === 'locate_by_vision') return '正在等待视觉定位或截图分析结果。'
		if (/cascader/i.test(name) || /cascader/i.test(step)) {
			return '正在等待级联菜单逐级展开、滚动定位真实候选并写入字段。'
		}
		if (/open_dropdown/i.test(name) || step === 'open_dropdown') {
			return '正在等待候选弹层出现，并读取目标字段范围内的真实候选。'
		}
		if (/dropdown|option|select|checkbox/i.test(name) || /select_option|checkbox/i.test(step)) {
			return '正在等待目标字段范围内的候选匹配、滚动查找、归属确认或页面联动完成。'
		}
		if (step === 'clear_field') return '正在等待字段置空并校验清空结果。'
		if (name === 'input_text' || /fill|input/i.test(step)) return '正在等待输入写入和页面校验完成。'
		if (name === 'click_element_by_index' || name === 'click') return '正在等待点击后的页面响应或 DOM 更新。'
		if (name === 'wait') {
			const reason = cleanActivityFragment(action?.input?.reason || action?.input?.purpose)
			return reason ? `正在${/^等待/.test(reason) ? reason : `等待${reason}`}。` : '正在等待页面状态变化。'
		}
		return '页面可能正在处理动作结果。'
	}

	async function verifyActionWithProgressHeartbeat(session, action, verifyAction, options = {}) {
		const startedAt = Date.now()
		let timer = null
		const initialMs = getVerificationHeartbeatInitialMs(session)
		const intervalMs = getVerificationHeartbeatIntervalMs(session)
		const publishHeartbeat = (elapsedMs = Date.now() - startedAt) => {
			if (session && !session.aborted && session.status === 'running') {
				publishRuntimeProgress(session, {
					stage: 'verification_heartbeat',
					elapsedMs,
					text: buildVerificationHeartbeatText(session, action, elapsedMs, options),
				})
			}
		}
		publishHeartbeat(0)
		timer = setTimeout(function tick() {
			publishHeartbeat()
			timer = setTimeout(tick, intervalMs)
		}, initialMs)
		try {
			return await verifyAction()
		} finally {
			if (timer) clearTimeout(timer)
		}
	}

	function getVerificationHeartbeatInitialMs(session) {
		return normalizeVerificationHeartbeatMs(
			session?.config?.verificationHeartbeatInitialMs,
			VERIFICATION_HEARTBEAT_INITIAL_MS
		)
	}

	function getVerificationHeartbeatIntervalMs(session) {
		return normalizeVerificationHeartbeatMs(
			session?.config?.verificationHeartbeatIntervalMs,
			VERIFICATION_HEARTBEAT_INTERVAL_MS
		)
	}

	function normalizeVerificationHeartbeatMs(value, fallback) {
		const number = Number(value)
		if (!Number.isFinite(number)) return fallback
		return Math.max(0, Math.min(60000, Math.round(number)))
	}

	function buildVerificationHeartbeatText(session, action, elapsedMs = 0, options = {}) {
		const step = Number(session?.step) || 0
		const seconds = Math.max(1, Math.round(Number(elapsedMs || 0) / 1000))
		const target = cleanActivityFragment(action?.input?.target_label || action?.input?.workflow_field_label || action?.input?.label || action?.input?.text)
		const prefix = options?.failedExecution
			? '动作执行超时后正在复核是否已生效'
			: '正在复核动作是否真正生效'
		const targetText = target ? `：${target}` : ''
		return `第 ${step} 步：${prefix}${targetText}，已等待 ${seconds} 秒；${buildVerificationWaitHint(action)}`
	}

	function buildVerificationWaitHint(action) {
		const name = String(action?.name || '').trim()
		const step = String(action?.input?.workflow_step || '').trim()
		if (name === 'locate_by_vision') {
			return '正在用动作后的页面观察确认视觉定位结果是否推动了页面状态。'
		}
		if (name === 'input_text' || /fill|input|clear_field/i.test(step)) {
			return '正在重新观察目标字段，确认值是否已写入、修正或清空。'
		}
		if (/open_dropdown/i.test(name) || step === 'open_dropdown') {
			return '正在检查候选弹层或选项列表是否已经出现。'
		}
		if (/dropdown|option|cascader|select|checkbox/i.test(name) || /select_option|cascader/i.test(step)) {
			return '正在检查字段值、选项状态、候选弹层或级联路径是否变化。'
		}
		if (/submit/i.test(step)) {
			return '正在检查 URL、DOM、表单反馈、列表刷新或弹层状态是否变化。'
		}
		if (/scroll/i.test(name)) {
			return '正在检查滚动位置、可见内容或容器状态是否变化。'
		}
		if (name === 'click_element_by_index' || name === 'click' || name === 'keypress' || name === 'hover_element_by_index') {
			return '正在检查 URL、DOM、按钮状态、弹层或页面反馈是否变化。'
		}
		return '正在重新观察页面状态，确认动作是否产生可验证进展。'
	}

	function buildVerificationFailureOutput(reason, recovery) {
		const verifyReason = String(reason || '未知原因').trim()
		const recoveryMessage = String(recovery?.message || '').trim()
		const base = `动作校验失败: ${verifyReason}`
		if (!recoveryMessage) return base
		if (base.includes(recoveryMessage)) return base
		return `${base} | 恢复处理: ${recoveryMessage}`
	}

	function recordLoopGuardReplan(session, decision, loopGuard, sessions) {
		const reason = String(loopGuard?.reason || '检测到可能重复动作，已阻断并要求重规划。')
		const diagnostic = typeof classifyLoopGuardReason === 'function'
			? classifyLoopGuardReason(reason)
			: { kind: 'loop_guard', guidance: '重新观察页面状态，换证据、换目标或换工具。' }
		const loopGuardKind = String(diagnostic?.kind || 'loop_guard').trim()
		const loopGuardGuidance = String(diagnostic?.guidance || '').trim()
		const outcome = createActionOutcome('no_effect', {
			progress: false,
			reason,
		})
		const guidanceText = loopGuardGuidance ? ` 类型=${loopGuardKind}；建议=${loopGuardGuidance}` : ` 类型=${loopGuardKind}`
		const output = appendOutcomeSummary(
			`${reason}${guidanceText} 已记录为失败反馈，下一轮将重新观察并规划不同动作。`,
			outcome
		)
		const replanGoal = '重新规划，避免重复动作'
		session.history.push({
			stepIndex: `${session.step}.loop`,
			thought: decision?.thought || 'loop guard',
			evaluationPreviousGoal: reason,
			memory: decision?.memory || '',
			nextGoal: replanGoal,
			action: `${decision?.action?.name || 'unknown'}.loop_guard`,
			input: decision?.action?.input || {},
			success: false,
			output,
			outcome,
			loopGuardKind,
			loopGuardGuidance,
		})
		appendTrace(session, {
			title: `步骤 ${session.step}: 循环保护`,
			detail: output,
			kind: 'error',
			reflection: buildReflection({
				...decision,
				evaluation_previous_goal: reason,
				next_goal: replanGoal,
			}),
			action: {
				name: `${decision?.action?.name || 'unknown'}.loop_guard`,
				input: decision?.action?.input || {},
				output,
				outcome,
				loopGuardKind,
				loopGuardGuidance,
			},
		})
		recordWorkflowOutcome(session, decision, {
			success: false,
			output,
			outcome,
			reason,
			stage: 'loop_guard',
			loopGuardKind,
			loopGuardGuidance,
		})
		session.planItems = derivePlanItems(session)
		session.consecutiveFailures += 1
		const recentLoopGuardFailures = countRecentLoopGuardFailures(session)
		session.activityText = output
		publishSession(session)
		if (recentLoopGuardFailures >= MAX_CONSECUTIVE_FAILURES) {
			failSession(
				session,
				`短窗口内触发循环保护 ${recentLoopGuardFailures} 次，任务终止。最后原因: ${reason}`,
				sessions
			)
			return true
		}
		if (session.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
			failSession(
				session,
				`连续触发循环保护 ${session.consecutiveFailures} 次，任务终止。最后原因: ${reason}`,
				sessions
			)
			return true
		}
		return false
	}

	g.NC_BG_SESSION_ENGINE = {
		runSession,
		publishSession,
		failSession,
	}
	g.NC_BG_SESSION_ENGINE_TESTS = {
		countRecentLoopGuardFailures,
		detectActionLoop,
		detectRedundantInputRewrite,
		getUnsafeDoneSuccessReason,
		getEffectiveModelRoundTimeoutMs,
		getPlanningTimeoutMs,
		hasVerifiedProgress,
		getExecutionOutcome,
		summarizeExecutionOutcome,
		buildDecisionActivityText,
		buildObservationHeartbeatText,
		buildActionExecutionHeartbeatText,
		buildVerificationHeartbeatText,
		buildActionExecutionWaitHint,
		buildVerificationWaitHint,
		buildObservedFieldInventory,
		getObservationHeartbeatInitialMs,
		getObservationHeartbeatIntervalMs,
		getActionExecutionHeartbeatInitialMs,
		getActionExecutionHeartbeatIntervalMs,
		getVerificationHeartbeatInitialMs,
		getVerificationHeartbeatIntervalMs,
		shouldAttemptVisionFallbackForFailure,
		stableActionInputSignature,
	}
})(globalThis)
