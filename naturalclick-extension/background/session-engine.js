;(function (g) {
	const { MAX_CONSECUTIVE_FAILURES, MAX_TRACE_ITEMS } = g.NC_BG_CONSTANTS
	const { generateId } = g.NC_BG_UTILS

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

			const decision = await g.NC_BG_PLANNER.planAction(session, observation.data)
			if (finalizeIfAborted(session, sessions)) return
			if (!decision?.action?.name) {
				failSession(session, '模型返回了无效动作', sessions)
				return
			}

			if (decision.action.name === 'done') {
				session.status = 'completed'
				session.activityText = decision.action.input?.text || '任务完成。'
				appendTrace(session, {
					title: `步骤 ${session.step}: done`,
					detail: session.activityText,
					kind: 'step',
					reflection: buildReflection(decision),
					action: {
						name: 'done',
						input: decision.action.input || {},
						output: session.activityText,
					},
				})
				publishSession(session)
				sessions.delete(session.id)
				return
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
			if (
				!execution.success &&
				g.NC_BG_VISION.canUseVisionFallback(decision.action) &&
				shouldAttemptVisionFallbackForFailure(execution.message)
			) {
				const domFailureReason = summarizeFailureReason(
					execution?.message || 'DOM 执行失败',
					120
				)
				session.activityText = `第 ${session.step} 步：DOM 失败（${domFailureReason}），尝试视觉回退...`
				publishSession(session)
				if (finalizeIfAborted(session, sessions)) return

				const visionFallback = await g.NC_BG_VISION.attemptVisionFallback(
					session,
					decision,
					observation.data
				)
				if (finalizeIfAborted(session, sessions)) return
				if (visionFallback.success) {
					execution = {
						success: true,
						message: `${execution.message} | 视觉回退成功: ${visionFallback.message}`,
						meta: visionFallback.meta,
					}
				} else {
					execution = {
						success: false,
						message: `${execution.message} | 视觉回退失败: ${visionFallback.message}`,
					}
				}
			}

			await settleAfterAction(decision.action)
			if (finalizeIfAborted(session, sessions)) return

			session.history.push({
				stepIndex: session.step,
				thought: decision.thought || '',
				evaluationPreviousGoal: decision.evaluation_previous_goal || '',
				memory: decision.memory || '',
				nextGoal: decision.next_goal || '',
				action: decision.action.name,
				input: decision.action.input || {},
				success: execution.success,
				output: execution.message,
			})
			appendTrace(session, {
				title: `步骤 ${session.step}: ${decision.action.name}`,
				detail: execution.message,
				kind: execution.success ? 'step' : 'error',
				reflection: buildReflection(decision),
				action: {
					name: decision.action.name,
					input: decision.action.input || {},
					output: execution.message,
				},
			})
			session.planItems = derivePlanItems(session)

			if (!execution.success) {
				session.consecutiveFailures += 1
				session.activityText = execution.message
				publishSession(session)
				if (session.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
					failSession(
						session,
						`连续失败 ${session.consecutiveFailures} 次，任务终止。最后错误: ${execution.message}`,
						sessions
					)
					return
				}
				continue
			}

			if (g.NC_BG_VERIFIER.shouldVerifyAction(decision.action)) {
				if (finalizeIfAborted(session, sessions)) return
				const verify = await g.NC_BG_VERIFIER.verifyExecutionOutcome(
					session,
					decision.action,
					observation.data,
					execution
				)
				if (finalizeIfAborted(session, sessions)) return
				if (!verify.ok) {
					const verifyMsg = `动作校验失败: ${verify.reason}`
					session.history.push({
						stepIndex: `${session.step}.v`,
						thought: 'post-action verification',
						nextGoal: 'replan',
						action: `${decision.action.name}.verify`,
						input: decision.action.input || {},
						success: false,
						output: verifyMsg,
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
			}

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

	function publishSession(session) {
		const payload = {
			sessionId: session.id,
			status: session.status,
			currentTask: session.task,
			activityText: session.activityText,
			currentTabId: session.currentTabId,
			planItems: session.planItems,
			traceItems: session.traceItems,
		}
		chrome.runtime.sendMessage(
			{
				type: g.NC_BG_CONSTANTS.TYPES.SESSION_UPDATE,
				payload,
			},
			() => {
				// Side panel may be closed; consume lastError to avoid noisy MV3 runtime errors.
				void chrome.runtime.lastError
			}
		)
	}

	function failSession(session, errorText, sessions) {
		session.status = 'error'
		session.activityText = errorText
		appendTrace(session, { title: '错误', detail: errorText, kind: 'error' })
		publishSession(session)
		sessions.delete(session.id)
	}

	function finalizeIfAborted(session, sessions) {
		if (!session?.aborted) return false
		finalizeStoppedSession(session, sessions)
		return true
	}

	function finalizeStoppedSession(session, sessions) {
		session.status = 'stopped'
		session.activityText = '任务已中止。'
		if (!session.stopTraceAdded) {
			appendTrace(session, {
				title: '任务中止',
				detail: session.activityText,
				kind: 'step',
			})
			session.stopTraceAdded = true
		}
		publishSession(session)
		sessions.delete(session.id)
	}

	function appendTrace(session, traceItem) {
		session.traceItems.push({ id: generateId('t'), ...traceItem })
		session.traceItems = session.traceItems.slice(-MAX_TRACE_ITEMS)
	}

	function buildReflection(decision) {
		return {
			evaluation_previous_goal: String(decision?.evaluation_previous_goal || '').trim(),
			memory: String(decision?.memory || '').trim(),
			next_goal: String(decision?.next_goal || '').trim(),
		}
	}

	function derivePlanItems(session) {
		if (!session.history.length) {
			return [{ id: 'boot', title: '解析任务与页面状态', status: 'running' }]
		}

		return session.history.map((item, idx) => {
			const isLast = idx === session.history.length - 1
			const title = item.nextGoal || `执行 ${item.action}`
			let status = 'done'
			if (isLast && session.status === 'running') status = 'running'
			if (isLast && !item.success) status = 'failed'
			return {
				id: `p_${item.stepIndex}`,
				title,
				status,
			}
		})
	}

	function summarizeFailureReason(text, maxLen) {
		const raw = String(text || '').replace(/\s+/g, ' ').trim()
		if (!raw) return '未知原因'
		if (raw.length <= maxLen) return raw
		return `${raw.slice(0, Math.max(12, maxLen - 3))}...`
	}

	function shouldAttemptVisionFallbackForFailure(message) {
		const text = String(message || '')
		if (!text) return true
		if (text.includes('页面动作超时')) return true
		return !(
			text.includes('页面通信超时') ||
			text.includes('已放弃等待') ||
			text.includes('执行脚本未响应') ||
			text.includes('message port closed') ||
			text.includes('未连接扩展执行脚本')
		)
	}

	function detectRedundantInputRewrite(session, action) {
		if (!action || !['input_text', 'type'].includes(String(action.name || ''))) {
			return { blocked: false, reason: '' }
		}
		const index = Number(action?.input?.index)
		if (!Number.isFinite(index)) return { blocked: false, reason: '' }
		const text = String(action?.input?.text || '').trim()
		if (!text) return { blocked: false, reason: '' }

		const recent = session.history.slice(-4)
		const consecutiveSameIndexSuccess = recent.filter(
			(item) =>
				item &&
				item.success === true &&
				(item.action === 'input_text' || item.action === 'type') &&
				Number(item?.input?.index) === index
		)
		if (consecutiveSameIndexSuccess.length < 2) {
			return { blocked: false, reason: '' }
		}
		return {
			blocked: true,
			reason: `检测到同一输入框索引 ${index} 连续重复改写，已阻断当前输入并要求重规划。`,
		}
	}

	async function settleAfterAction(action) {
		const name = String(action?.name || '')
		if (!name) return
		if (['open_new_tab', 'switch_to_tab'].includes(name)) {
			await sleep(420)
			return
		}
		if (name === 'select_cascader_path') {
			await sleep(320)
			return
		}
		if (
			[
				'click',
				'click_element_by_index',
				'keypress',
				'close_tab',
				'scroll',
				'scroll_horizontally',
				'hover_element_by_index',
				'select_dropdown_option',
				'select_checkbox_option',
			].includes(name)
		) {
			await sleep(220)
			return
		}
		if (['input_text', 'type'].includes(name)) {
			await sleep(120)
		}
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
	}

	g.NC_BG_SESSION_ENGINE = {
		runSession,
		publishSession,
		failSession,
	}
})(globalThis)
