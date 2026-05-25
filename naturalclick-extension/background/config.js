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
			visionDisabledDomains: normalizeDomainList(raw?.visionDisabledDomains),
		}
	}

	function normalizeEndpoint(value, fallback) {
		return {
			baseURL: String(value?.baseURL || fallback.baseURL).trim(),
			model: String(value?.model || fallback.model).trim(),
			apiKey: String(value?.apiKey || '').trim(),
		}
	}

	function normalizeInputMode(value) {
		const mode = String(value || '').trim().toLowerCase()
		return mode === 'standard' ? 'standard' : 'realistic'
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
	}
})(globalThis)
