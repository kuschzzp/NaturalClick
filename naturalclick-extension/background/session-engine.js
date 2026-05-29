;(function (g) {
	const { MAX_CONSECUTIVE_FAILURES } = g.NC_BG_CONSTANTS
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
		publishSession,
	} = sessionLifecycle
	const {
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

			const observation = await g.NC_BG_EXECUTOR.requestObservation(session.currentTabId)
			if (finalizeIfAborted(session, sessions)) return
			if (!observation?.ok) {
				failSession(session, observation?.error || '无法读取页面状态', sessions)
				return
			}

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
				session.planItems = derivePlanItems(session)
				recordWorkflowOutcome(session, decision, {
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

			session.activityText = `第 ${session.step} 步：执行 ${decision.action.name}...`
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
				execution = await g.NC_BG_EXECUTOR.executeAction(session, decision.action)
			}
			if (finalizeIfAborted(session, sessions)) return
			if (shouldAttemptExecutionVisionFallback(decision.action, execution)) {
				session.activityText = buildExecutionVisionFallbackActivityText(session, execution)
				publishSession(session)
				if (finalizeIfAborted(session, sessions)) return

				execution = await attemptExecutionVisionFallback(
					session,
					decision,
					observation.data,
					execution
				)
				if (finalizeIfAborted(session, sessions)) return
			}

			await settleAfterAction(decision.action)
			if (finalizeIfAborted(session, sessions)) return

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
			session.planItems = derivePlanItems(session)

			if (!execution.success) {
				recordWorkflowOutcome(session, decision, {
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

			const shouldVerify = g.NC_BG_VERIFIER.shouldVerifyAction(decision.action)
			if (shouldVerify) {
				if (finalizeIfAborted(session, sessions)) return
				const verify = await g.NC_BG_VERIFIER.verifyExecutionOutcome(
					session,
					decision.action,
					observation.data,
					execution
				)
				if (finalizeIfAborted(session, sessions)) return
				if (!verify.ok) {
					const recovery = await attemptVerificationRecovery(
						session,
						decision,
						observation.data,
						verify.reason,
						{
							onProgress: (text) => {
								session.activityText = text
								publishSession(session)
							},
						}
					)
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
						session.planItems = derivePlanItems(session)
						recordWorkflowOutcome(session, decision, {
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
					const verifyMsg = appendVerificationFailureOutcome(`动作校验失败: ${verify.reason}`, verify.reason)
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
					recordWorkflowOutcome(session, decision, {
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
			}

			recordWorkflowOutcome(session, decision, {
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
			session.status = 'error'
			session.activityText = '达到最大步数，任务未完成。'
			publishSession(session)
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

	function recordLoopGuardReplan(session, decision, loopGuard, sessions) {
		const reason = String(loopGuard?.reason || '检测到可能重复动作，已阻断并要求重规划。')
		const outcome = createActionOutcome('no_effect', {
			progress: false,
			reason,
		})
		const output = appendOutcomeSummary(
			`${reason} 已记录为失败反馈，下一轮将重新观察并规划不同动作。`,
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
			},
		})
		recordWorkflowOutcome(session, decision, {
			success: false,
			output,
			outcome,
			reason,
			stage: 'loop_guard',
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
		shouldAttemptVisionFallbackForFailure,
		stableActionInputSignature,
	}
})(globalThis)
