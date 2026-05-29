;(function (g) {
	function deriveFastPathDecision(session, observation, tabsSummary) {
		const taskText = String(session?.latestTask || session?.task || '')
		const targetUrl = extractTargetUrl(taskText)
		if (!targetUrl || isTaskTargetLocation(observation?.url, targetUrl)) return null
		if (isSameUrlFamily(observation?.url, targetUrl) && hasRecentTargetUrlNavigation(session, targetUrl)) {
			return null
		}
		const targetTab = findTargetTab(tabsSummary, targetUrl)
		if (targetTab && targetTab.id && !targetTab.current) {
			return buildFallbackDecision(
				'当前标签页不是任务目标站点，先切换到已打开的目标标签页。',
				'切换到任务目标页面。',
				'switch_to_tab',
				{ tab_id: targetTab.id }
			)
		}
		if (!targetTab) {
			return buildFallbackDecision(
				'当前页面不是任务目标站点，先打开任务中的目标 URL。',
				'打开任务目标页面。',
				'open_new_tab',
				{ url: targetUrl }
			)
		}
		return null
	}

	function hasRecentTargetUrlNavigation(session, targetUrl) {
		const recent = Array.isArray(session?.history) ? session.history.slice(-6) : []
		return recent.some((item) => {
			if (!item?.success || String(item.action || '') !== 'open_new_tab') return false
			return isSameTaskUrl(item?.input?.url, targetUrl)
		})
	}

	function isSameTaskUrl(a, b) {
		try {
			const left = new URL(String(a || ''))
			const right = new URL(String(b || ''))
			return left.href === right.href
		} catch (_) {
			return String(a || '').trim() === String(b || '').trim()
		}
	}

	function extractTargetUrl(taskText) {
		const match = String(taskText || '').match(/https?:\/\/[^\s，,。；;]+/i)
		if (!match?.[0]) return ''
		return trimTrailingUrlPunctuation(match[0])
	}

	function trimTrailingUrlPunctuation(value) {
		let url = String(value || '').trim()
		while (url && /[)\]}>）】》"'“”‘’.。]+$/.test(url)) {
			const next = url.replace(/[)\]}>）】》"'“”‘’.。]+$/g, '')
			if (!next || next === url) break
			url = next
			try {
				const parsed = new URL(url)
				return parsed.href.replace(/\/$/, parsed.pathname === '/' && !parsed.search && !parsed.hash ? '/' : '')
			} catch (_) {}
		}
		return url
	}

	function findTargetTab(tabsSummary, targetUrl) {
		return (Array.isArray(tabsSummary) ? tabsSummary : []).find((tab) =>
			isTaskTargetLocation(tab?.url, targetUrl)
		) || null
	}

	function isTaskTargetLocation(url, targetUrl) {
		try {
			const current = new URL(String(url || ''))
			const target = new URL(String(targetUrl || ''))
			if (current.origin !== target.origin) return false
			const targetPath = normalizeUrlPath(target.pathname)
			const currentPath = normalizeUrlPath(current.pathname)
			const targetIsSiteRoot = targetPath === '/' && !target.search && !target.hash
			if (targetIsSiteRoot) return true
			if (currentPath !== targetPath) return false
			if (target.search && current.search !== target.search) return false
			if (target.hash && current.hash !== target.hash) return false
			return true
		} catch (_) {
			return false
		}
	}

	function isSameUrlFamily(url, targetUrl) {
		try {
			const current = new URL(String(url || ''))
			const target = new URL(String(targetUrl || ''))
			return current.origin === target.origin
		} catch (_) {
			return false
		}
	}

	function normalizeUrlPath(pathname) {
		const raw = String(pathname || '/').replace(/\/+$/, '')
		return raw || '/'
	}

	function buildFallbackDecision(reason, goal, actionName, input) {
		return {
			evaluation_previous_goal: reason,
			memory: '本步是任务 URL 导航预处理，页面内操作仍交给模型根据观察结果规划。',
			thought: reason,
			next_goal: goal,
			action: {
				name: actionName,
				input,
			},
		}
	}

	g.NC_BG_PLANNER_FASTPATH = {
		deriveFastPathDecision,
		extractTargetUrl,
		hasRecentTargetUrlNavigation,
		isSameUrlFamily,
		isTaskTargetLocation,
	}
})(globalThis)
