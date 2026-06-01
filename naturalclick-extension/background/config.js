;(function (g) {
	const { STORAGE_KEY_CONFIG, DEFAULT_CONFIG } = g.NC_BG_CONSTANTS

	async function loadConfig() {
		const data = await chrome.storage.local.get(STORAGE_KEY_CONFIG)
		return normalizeConfig(data[STORAGE_KEY_CONFIG] || DEFAULT_CONFIG)
	}

	function normalizeConfig(raw) {
		const normalizedText = normalizeEndpoint(raw?.textLLM, DEFAULT_CONFIG.textLLM)
		const normalizedMultiModal = normalizeEndpoint(raw?.multiModalLLM, DEFAULT_CONFIG.multiModalLLM)
		const normalizedVision = raw?.visionService
			? normalizeEndpoint(raw?.visionService, normalizedMultiModal)
			: { ...normalizedMultiModal }

		return {
			textLLM: normalizedText,
			multiModalLLM: normalizedMultiModal,
			// 兼容历史字段：未配置 visionService 时默认复用 multiModalLLM
			visionService: normalizedVision,
			maxSteps: Number.isFinite(raw?.maxSteps)
				? Math.max(1, Math.min(200, Math.floor(raw.maxSteps)))
				: DEFAULT_CONFIG.maxSteps,
			experimentalIncludeAllTabs:
				typeof raw?.experimentalIncludeAllTabs === 'boolean'
					? raw.experimentalIncludeAllTabs
					: DEFAULT_CONFIG.experimentalIncludeAllTabs,
			inputMode: normalizeInputMode(raw?.inputMode),
			planning: normalizePlanningConfig(raw?.planning, DEFAULT_CONFIG.planning),
			visionDisabledDomains: normalizeDomainList(raw?.visionDisabledDomains),
		}
	}

	function normalizeEndpoint(value, fallback) {
		const endpoint = {
			baseURL: String(value?.baseURL || fallback.baseURL).trim(),
			model: String(value?.model || fallback.model).trim(),
			apiKey: String(value?.apiKey || '').trim(),
		}
		const configuredTimeout = Number(value?.timeoutMs)
		const fallbackTimeout = Number(fallback?.timeoutMs)
		if (Number.isFinite(configuredTimeout) || Number.isFinite(fallbackTimeout)) {
			endpoint.timeoutMs = clampInteger(
				configuredTimeout,
				Number.isFinite(fallbackTimeout) ? fallbackTimeout : 60000,
				8000,
				180000
			)
		}
		if (typeof value?.stream === 'boolean' || typeof fallback?.stream === 'boolean') {
			endpoint.stream = typeof value?.stream === 'boolean' ? value.stream : fallback.stream !== false
		}
		return endpoint
	}

	function normalizeInputMode(value) {
		const mode = String(value || '').trim().toLowerCase()
		return mode === 'standard' ? 'standard' : 'realistic'
	}

	function normalizePlanningConfig(value, fallback) {
		const defaults = fallback || DEFAULT_CONFIG.planning || {}
		const full = clampInteger(
			value?.fullObservationMaxChars,
			defaults.fullObservationMaxChars || 262144,
			7600,
			1048576
		)
		const compact = clampInteger(
			value?.compactObservationMaxChars,
			defaults.compactObservationMaxChars || 4200,
			1000,
			Math.min(65536, full)
		)
		const elementThreshold = clampInteger(
			value?.compactElementThreshold,
			defaults.compactElementThreshold || 120,
			20,
			10000
		)
		const rawThreshold = clampInteger(
			value?.compactRawCandidateThreshold,
			defaults.compactRawCandidateThreshold || 80,
			20,
			10000
		)
		return {
			fullObservationMaxChars: full,
			compactObservationMaxChars: compact,
			compactElementThreshold: elementThreshold,
			compactRawCandidateThreshold: rawThreshold,
		}
	}

	function clampInteger(value, fallback, min, max) {
		const number = Number(value)
		const base = Number.isFinite(number) && number > 0 ? number : Number(fallback)
		return Math.max(min, Math.min(max, Math.floor(base)))
	}

	function normalizeDomainList(value) {
		const list = Array.isArray(value)
			? value
			: String(value || '')
					.split(/[\n,，]+/)
					.map((item) => item.trim())
		return Array.from(
			new Set(
				list
					.map((item) => String(item || '').trim().toLowerCase())
					.map((item) => item.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
					.filter(Boolean)
			)
		).slice(0, 80)
	}

	g.NC_BG_CONFIG = {
		loadConfig,
		normalizeConfig,
		normalizePlanningConfig,
	}
})(globalThis)
