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
		if (shouldSkipVerificationVisionRecovery(decision?.action, reason)) {
			return { success: false, message: '导航展开动作校验失败后不做视觉恢复，交给重新观察规划。' }
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
		const input = action?.input || {}
		if (String(input.workflow_step || '') !== 'reveal_navigation_options') return false
		const text = String(reason || '')
		if (!text) return true
		return /focused|no_effect|无可见变化|未发现|未展开|没有变化|动作结果:\s*(focused|no_effect)/i.test(text)
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
			'命中插件忽略区域',
			'缺少 index',
			'缺少 text',
			'缺少 path',
			'缺少非空',
			'输入目标不可编辑',
			'对应元素不可输入',
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
		shouldSkipVerificationVisionRecovery,
	}
})(globalThis)
