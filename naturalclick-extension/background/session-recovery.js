;(function (g) {
	const sessionRecords = g.NC_BG_SESSION_RECORDS || null

	function shouldAttemptExecutionVisionFallback(action, execution) {
		return !!(
			execution &&
			execution.success === false &&
			g.NC_BG_VISION?.canUseVisionFallback?.(action) &&
			shouldAttemptVisionFallbackForFailure(execution.message)
		)
	}

	function buildExecutionVisionFallbackActivityText(session, execution) {
		const domFailureReason = summarizeFailureReason(
			execution?.message || 'DOM 执行失败',
			120
		)
		return `第 ${session?.step || '-'} 步：DOM 失败（${domFailureReason}），尝试视觉回退...`
	}

	async function attemptExecutionVisionFallback(session, decision, observation, execution) {
		const visionFallback = await g.NC_BG_VISION.attemptVisionFallback(
			session,
			decision,
			observation
		)
		if (visionFallback.success) {
			return {
				success: true,
				message: `${execution.message} | 视觉回退成功: ${visionFallback.message}`,
				meta: visionFallback.meta,
			}
		}
		return {
			success: false,
			message: `${execution.message} | 视觉回退失败: ${visionFallback.message}`,
			meta: execution.meta,
		}
	}

	async function attemptVerificationRecovery(session, decision, observation, reason, hooks = {}) {
		const skipReason = getVerificationVisionRecoverySkipReason(decision?.action, reason)
		if (skipReason) {
			return { success: false, message: skipReason }
		}
		if (!g.NC_BG_VISION.canUseVisionFallback(decision?.action)) {
			return { success: false, message: '当前动作不支持视觉恢复。' }
		}
		if (!shouldAttemptVisionFallbackForFailure(reason)) {
			return { success: false, message: '当前失败类型不适合视觉恢复。' }
		}
		const shortReason = summarizeFailureReason(reason || '校验失败', 120)
		hooks.onProgress?.(`动作校验失败（${shortReason}），尝试视觉恢复...`)
		const visionFallback = await g.NC_BG_VISION.attemptVisionFallback(
			session,
			decision,
			observation
		)
		if (!visionFallback.success) {
			return {
				success: false,
				message: `视觉恢复失败: ${visionFallback.message || '未找到可用坐标。'}`,
			}
		}
		return {
			success: true,
			message: `校验失败后视觉恢复成功: ${visionFallback.message}`,
			meta: visionFallback.meta || null,
		}
	}

	function shouldSkipVerificationVisionRecovery(action, reason) {
		return !!getVerificationVisionRecoverySkipReason(action, reason)
	}

	function getVerificationVisionRecoverySkipReason(action, reason) {
		const input = action?.input || {}
		if (isFormSubmitRecoveryAction(action)) {
			return '表单提交动作校验失败后不做视觉恢复，避免提交成功后误点列表页新增/提交按钮；交给重新观察规划。'
		}
		if (String(input.workflow_step || '') !== 'reveal_navigation_options') return ''
		const text = String(reason || '')
		if (!text) return '导航展开动作校验失败后不做视觉恢复，交给重新观察规划。'
		return /focused|no_effect|无可见变化|未发现|未展开|没有变化|动作结果:\s*(focused|no_effect)/i.test(text)
			? '导航展开动作校验失败后不做视觉恢复，交给重新观察规划。'
			: ''
	}

	function isFormSubmitRecoveryAction(action) {
		const input = action?.input || {}
		if (String(input.workflow_step || '') === 'submit_form_timeout_recovery') return true
		const label = String(input.workflow_submit_label || input.target_label || input.label || input.text || '').replace(/\s+/g, '').trim().toLowerCase()
		return /^(保存|提交|确定|完成|确认|save|submit|ok|confirm|done)$/.test(label)
	}

	function shouldAttemptVisionFallbackForFailure(message) {
		const text = String(message || '')
		if (!text) return true
		if (text.includes('页面动作超时')) return true
		if (isSemanticActionFailure(text)) return false
		return !(
			text.includes('页面通信超时') ||
			text.includes('已放弃等待') ||
			text.includes('执行脚本未响应') ||
			text.includes('message port closed') ||
			text.includes('未连接扩展执行脚本')
		)
	}

	function isSemanticActionFailure(text) {
		const normalized = String(text || '')
		return [
			'不可输入',
			'不可编辑',
			'已禁用',
			'只读',
			'readonly',
			'read-only',
			'命中插件忽略区域',
			'缺少 index',
			'缺少 text',
			'缺少 path',
			'缺少非空',
			'输入目标不可编辑',
			'对应元素不可输入',
			'missing_index',
			'missing_coordinate_target',
			'not_editable',
			'readonly_or_disabled',
			'disabled_target',
			'ignored_extension_region',
			'unsupported_input_target',
			'unsupported_action',
			'candidate_mismatch',
			'options_not_visible',
			'create_form_not_opened',
			'dialog_closed',
			'field_scoped',
			'未观察到新增表单',
			'检测到同一输入框索引',
			'select 中没有匹配选项',
		].some((part) => normalized.includes(part))
	}

	function summarizeFailureReason(text, maxLen) {
		if (typeof sessionRecords?.summarizeFailureReason === 'function') {
			return sessionRecords.summarizeFailureReason(text, maxLen)
		}
		const raw = String(text || '').replace(/\s+/g, ' ').trim()
		if (!raw) return '未知原因'
		if (raw.length <= maxLen) return raw
		return `${raw.slice(0, Math.max(12, maxLen - 3))}...`
	}

	g.NC_BG_SESSION_RECOVERY = {
		attemptExecutionVisionFallback,
		attemptVerificationRecovery,
		buildExecutionVisionFallbackActivityText,
		shouldAttemptExecutionVisionFallback,
		shouldAttemptVisionFallbackForFailure,
		getVerificationVisionRecoverySkipReason,
		shouldSkipVerificationVisionRecovery,
	}
})(globalThis)
