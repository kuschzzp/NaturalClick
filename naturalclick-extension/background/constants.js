;(function (g) {
	const PROTOCOL_TYPES = g.NC_PROTOCOL?.TYPES || {
		GET_CONFIG: 'NC_GET_CONFIG',
		SAVE_CONFIG: 'NC_SAVE_CONFIG',
		START_TASK: 'NC_START_TASK',
		STOP_TASK: 'NC_STOP_TASK',
		CONFIRM_RESPONSE: 'NC_CONFIRM_RESPONSE',
		ASK_USER_REQUEST: 'NC_ASK_USER_REQUEST',
		OBSERVE: 'NC_OBSERVE',
		ACT: 'NC_ACT',
		ACT_COORD: 'NC_ACT_COORD',
		HIT_TEST: 'NC_HIT_TEST',
		VERIFY_INPUT: 'NC_VERIFY_INPUT',
		VERIFY_INPUT_POINT: 'NC_VERIFY_INPUT_POINT',
		CONFIRM_REQUEST: 'NC_CONFIRM_REQUEST',
		SESSION_UPDATE: 'NC_SESSION_UPDATE',
	}

	const STORAGE_KEY_CONFIG = 'nc_config_v1'

	const DEFAULT_CONFIG = {
		textLLM: { baseURL: 'https://api.openai.com/v1', model: 'gpt-5.2', apiKey: '' },
		multiModalLLM: { baseURL: 'https://api.openai.com/v1', model: 'gpt-5.2', apiKey: '' },
		visionService: { baseURL: 'https://api.openai.com/v1', model: 'gpt-5.2', apiKey: '' },
		maxSteps: 100,
		experimentalIncludeAllTabs: true,
		inputMode: 'realistic',
		visionDisabledDomains: [],
	}

	const VISION_CONFIDENCE_THRESHOLD = 0.6
	const MAX_CONSECUTIVE_FAILURES = 3
	const MAX_TRACE_ITEMS = 80

	g.NC_BG_CONSTANTS = {
		TYPES: PROTOCOL_TYPES,
		STORAGE_KEY_CONFIG,
		DEFAULT_CONFIG,
		VISION_CONFIDENCE_THRESHOLD,
		MAX_CONSECUTIVE_FAILURES,
		MAX_TRACE_ITEMS,
	}
})(globalThis)
