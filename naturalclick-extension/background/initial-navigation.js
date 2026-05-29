;(function (g) {
	const PUBLIC_SITE_RULES = [
		{
			name: '百度',
			pattern: /(?:百度|baidu)/i,
			homeUrl: 'https://www.baidu.com/',
			searchUrl: (query) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`,
		},
		{
			name: 'Google',
			pattern: /(?:google|谷歌|谷歌搜索)/i,
			homeUrl: 'https://www.google.com/',
			searchUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
		},
		{
			name: 'Bing',
			pattern: /(?:bing|必应|必应搜索)/i,
			homeUrl: 'https://www.bing.com/',
			searchUrl: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
		},
		{
			name: 'DuckDuckGo',
			pattern: /(?:duckduckgo|duck\s*duck\s*go)/i,
			homeUrl: 'https://duckduckgo.com/',
			searchUrl: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
		},
	]

	function deriveInitialAutomationTarget(taskText) {
		const text = String(taskText || '').trim()
		if (!text) return null
		const explicitUrl = extractTargetUrl(text)
		if (explicitUrl) {
			return {
				url: explicitUrl,
				source: 'explicit-url',
				label: '任务目标页面',
				query: '',
			}
		}
		const publicTarget = derivePublicSiteTarget(text)
		return publicTarget || null
	}

	function derivePublicSiteTarget(taskText) {
		const text = String(taskText || '').trim()
		if (!text) return null
		for (const rule of PUBLIC_SITE_RULES) {
			if (!rule.pattern.test(text)) continue
			const query = extractSearchQueryForRule(text, rule)
			return {
				url: query ? rule.searchUrl(query) : rule.homeUrl,
				source: query ? 'public-search' : 'public-home',
				label: query ? `${rule.name}搜索` : rule.name,
				query,
			}
		}
		return null
	}

	function extractSearchQueryForRule(taskText, rule) {
		let text = String(taskText || '').trim()
		text = stripUrlLikeText(text)
		const siteMatch = text.match(rule.pattern)
		if (!siteMatch) return ''
		text = text.slice(siteMatch.index + siteMatch[0].length)
		text = text
			.replace(/^(?:一下|中|里|上|网站|网页|页面|打开|并|帮我|请|给我|一下子)+/g, '')
			.replace(/^(?:搜索|查找|查询|搜|查|找)\s*/g, '')
			.trim()
		text = text.replace(/^(?:关于|有关|一下|下)\s*/g, '').trim()
		text = text.replace(/[。；;，,、]+$/g, '').trim()
		if (!text || isGenericSearchQuery(text)) return ''
		return text.slice(0, 120)
	}

	function extractTargetUrl(taskText) {
		const match = String(taskText || '').match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i)
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

	function isInitialTargetLocation(url, targetUrl) {
		try {
			const current = new URL(String(url || ''))
			const target = new URL(String(targetUrl || ''))
			if (current.origin !== target.origin) return false
			const targetPath = normalizeUrlPath(target.pathname)
			const currentPath = normalizeUrlPath(current.pathname)
			if (targetPath === '/' && !target.search && !target.hash) return true
			if (currentPath !== targetPath) return false
			if (target.search && current.search !== target.search) return false
			if (target.hash && current.hash !== target.hash) return false
			return true
		} catch (_) {
			return false
		}
	}

	function stripUrlLikeText(value) {
		return String(value || '').replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi, ' ')
	}

	function isGenericSearchQuery(value) {
		return /^(内容|关键词|关键字|东西|信息|一下|下|页面|网页|网站)$/.test(String(value || '').trim())
	}

	function normalizeUrlPath(pathname) {
		const raw = String(pathname || '/').replace(/\/+$/, '')
		return raw || '/'
	}

	g.NC_BG_INITIAL_NAVIGATION = {
		deriveInitialAutomationTarget,
		derivePublicSiteTarget,
		extractSearchQueryForRule,
		extractTargetUrl,
		isInitialTargetLocation,
	}
})(globalThis)
