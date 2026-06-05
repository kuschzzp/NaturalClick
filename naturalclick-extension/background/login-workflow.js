;(function (g) {
	function deriveLoginWorkflowDecision(session, observation) {
		const credentials = extractLoginCredentials(session?.latestTask || session?.task || '')
		if (!credentials.username && !credentials.password) return null
		if (!isLikelyLoginContext(observation)) return null
		const form = findLoginForm(observation)
		if (!form) return null

		const usernameField = findCredentialField(form.fields, 'username')
		const passwordField = findCredentialField(form.fields, 'password')
		const state = syncLoginState(session, {
			usernameField,
			passwordField,
		})
		if (state?.phase === 'failed' || state?.phase === 'submitted') return null
		if (usernameField && credentials.username && !isFilled(usernameField)) {
			state.phase = 'fill_username'
			return buildLoginDecision(
				'当前页面显示登录表单，先填写任务中提供的账号。',
				'填写登录账号。',
				'input_text',
				{
					index: Number(usernameField.index),
					text: credentials.username,
					target_label: getLoginFieldLabel(usernameField, '登录账号'),
					workflow_field_label: getLoginFieldLabel(usernameField, '登录账号'),
				},
				'fill_username'
			)
		}
		if (passwordField && credentials.password && !isFilled(passwordField)) {
			state.phase = 'fill_password'
			return buildLoginDecision(
				'登录账号已填写或无需填写，继续填写任务中提供的密码。',
				'填写登录密码。',
				'input_text',
				{
					index: Number(passwordField.index),
					text: credentials.password,
					target_label: getLoginFieldLabel(passwordField, '登录密码'),
					workflow_field_label: getLoginFieldLabel(passwordField, '登录密码'),
				},
				'fill_password'
			)
		}
		const submit = findLoginSubmitAction(observation)
		if (submit) {
			state.phase = 'submit_login'
			return buildLoginDecision(
				'登录表单的账号和密码已具备，提交表单进入系统。',
				'提交登录表单。',
				'click_element_by_index',
				{ index: Number(submit.index), target_label: submit.label || submit.text || '登录' },
				'submit_login'
			)
		}
		return null
	}

	function syncLoginState(session, fields) {
		if (!session || typeof session !== 'object') return null
		if (!session.workflowState || typeof session.workflowState !== 'object') session.workflowState = {}
		const existing = session.workflowState.login
		const state = existing && typeof existing === 'object' ? existing : createLoginState()
		session.workflowState.login = state
		state.usernameIndex = Number(fields?.usernameField?.index)
		state.passwordIndex = Number(fields?.passwordField?.index)
		if (!state.seededFromHistory) {
			seedLoginStateFromHistory(state, session)
			state.seededFromHistory = true
		}
		return state
	}

	function createLoginState() {
		return {
			version: 1,
			phase: 'fill_username',
			usernameIndex: null,
			passwordIndex: null,
			usernameDone: false,
			passwordDone: false,
			submitted: false,
			failedReason: '',
			seededFromHistory: false,
		}
	}

	function seedLoginStateFromHistory(state, session) {
		const history = Array.isArray(session?.history) ? session.history : []
		for (const item of history) applyLoginHistoryItemToState(state, item)
	}

	function recordLoginWorkflowOutcome(session, decision, outcome) {
		const actionInput = decision?.action?.input || {}
		const isLoginWorkflowAction = String(actionInput.workflow || '') === 'login' ||
			!!actionInput.workflow_step ||
			!!session?.workflowState?.login
		if (!isLoginWorkflowAction) return
		if (session && (!session.workflowState || typeof session.workflowState !== 'object')) session.workflowState = {}
		const state = session?.workflowState?.login || createLoginState()
		if (session) session.workflowState.login = state
		const item = {
			action: decision?.action?.name || '',
			input: actionInput,
			success: outcome?.success !== false,
			output: String(outcome?.output || outcome?.message || ''),
			outcome: normalizeOutcomeObject(outcome?.outcome || outcome?.meta?.outcome),
			evaluationPreviousGoal: String(outcome?.reason || decision?.evaluation_previous_goal || ''),
			nextGoal: String(decision?.next_goal || ''),
		}
		applyLoginHistoryItemToState(state, item)
	}

	function applyLoginHistoryItemToState(state, item) {
		if (!state || !item) return
		const action = normalizeActionName(item.action)
		const input = item.input || {}
		const step = String(input.workflow_step || '')
		if (action === 'input_text' || action === 'type') {
			const index = Number(input.index)
			const isUsername = step === 'fill_username' || Number(state.usernameIndex) === index
			const isPassword = step === 'fill_password' || Number(state.passwordIndex) === index
			if (!isUsername && !isPassword) return
			if (item.success === false) {
				markLoginWorkflowFailed(state, getHistoryFailureReason(item, '登录输入失败'))
				return
			}
			if (isUsername) {
				state.usernameDone = true
				state.phase = 'fill_password'
			}
			if (isPassword) {
				state.passwordDone = true
				state.phase = 'submit_login'
			}
			return
		}
		if (action !== 'click_element_by_index' && action !== 'click') return
		if (!isLoginSubmitHistory(item)) return
		if (item.success === false) {
			markLoginWorkflowFailed(state, getHistoryFailureReason(item, '登录提交失败'))
			return
		}
		state.submitted = true
		state.phase = 'submitted'
	}

	function getHistoryFailureReason(item, fallback) {
		const outcome = normalizeOutcomeObject(item?.outcome || item?.meta?.outcome)
		return String(outcome?.reason || item?.output || item?.evaluationPreviousGoal || fallback || '').trim()
	}

	function normalizeOutcomeObject(outcome) {
		if (!outcome || typeof outcome !== 'object') return null
		const normalized = g.NC_ACTION_CONTRACT?.normalizeOutcome
			? g.NC_ACTION_CONTRACT.normalizeOutcome(outcome)
			: { ...outcome, kind: String(outcome.kind || '').trim().toLowerCase() }
		if (!normalized?.kind || normalized.kind === 'none') return null
		return normalized
	}

	function markLoginWorkflowFailed(state, reason) {
		state.phase = 'failed'
		state.failedReason = String(reason || '登录工作流动作失败')
	}

	function extractLoginCredentials(taskText) {
		return {
			username: matchCredential(taskText, ['账号', '账户', '用户名', 'user', 'username', 'account']),
			password: matchCredential(taskText, ['密码', 'password', 'pwd']),
		}
	}

	function matchCredential(taskText, labels) {
		const source = String(taskText || '')
		for (const label of labels) {
			const pattern = new RegExp(`${escapeRegExp(label)}(\\s*[:：=]\\s*|\\s+)?([^\\s，,；;。]+)`, 'i')
			const match = source.match(pattern)
			if (!match?.[2]) continue
			const separator = String(match[1] || '')
			const candidate = match[2].trim()
			if (!separator && /^[\u4e00-\u9fa5]/.test(candidate)) continue
			return candidate
		}
		return ''
	}

	function findLoginForm(observation) {
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		for (const form of forms) {
			const fields = Array.isArray(form?.fields) ? form.fields : []
			if (isRecordEditingForm(form, fields)) continue
			const hasUsername = !!findCredentialField(fields, 'username')
			const hasPassword = !!findCredentialField(fields, 'password')
			if (hasUsername && hasPassword) return { form, fields }
		}
		return null
	}

	function isRecordEditingForm(form, fields) {
		const formText = normalizeText([
			form?.name,
			form?.label,
			form?.title,
			form?.container,
			form?.region,
		].join(' '))
		if (/(新增|新建|创建|添加|编辑|修改|注册|弹层|dialog|modal|drawer|create|edit|register|signup|sign-up)/i.test(formText)) return true
		const visibleFields = (Array.isArray(fields) ? fields : []).filter((field) => Number.isFinite(Number(field?.index)))
		if (!findCredentialField(visibleFields, 'username') || !findCredentialField(visibleFields, 'password')) return false
		if (visibleFields.some((field) => isPasswordConfirmationField(field))) return true
		const nonLoginFields = visibleFields.filter((field) => isNonLoginFormField(field))
		return nonLoginFields.length >= 2
	}

	function isPasswordConfirmationField(field) {
		const text = getFieldSemanticText(field)
		return /(confirm|confirmation|repeat|again|确认|重复|再次).*(password|pwd|密码)|(password|pwd|密码).*(confirm|confirmation|repeat|again|确认|重复|再次)/i.test(text)
	}

	function isNonLoginFormField(field) {
		if (!field || !Number.isFinite(Number(field.index))) return false
		if (findCredentialField([field], 'username') || findCredentialField([field], 'password')) return false
		if (isLoginAuxiliaryField(field)) return false
		if (isPassiveOrButtonField(field)) return false
		return isEditableOrSelectableField(field)
	}

	function isLoginAuxiliaryField(field) {
		const text = getFieldSemanticText(field)
		return /(captcha|verificationcode|verifycode|authcode|securitycode|otp|totp|mfa|2fa|remember|验证码|校验码|动态码|安全码|记住|自动登录|保持登录)/i.test(text)
	}

	function isPassiveOrButtonField(field) {
		const text = normalizeText([
			field?.role,
			field?.type,
			field?.kind,
			field?.actionIntent,
			field?.intent,
		].join(' '))
		return /(button|submit|reset|hidden|image|file|static|label|textnode)/i.test(text)
	}

	function isEditableOrSelectableField(field) {
		const text = normalizeText([
			field?.role,
			field?.type,
			field?.kind,
			field?.fieldType,
			field?.selectionControl,
		].join(' '))
		return /(textbox|input|textarea|combobox|select|dropdown|cascader|picker|radio|checkbox|switch|date|time|number|email|tel|url|search|text|password)/i.test(text)
	}

	function getFieldSemanticText(field) {
		return normalizeText([
			field?.fieldType,
			field?.label,
			field?.placeholder,
			field?.aliases,
			field?.type,
			field?.role,
			field?.kind,
			field?.selectionControl,
		].join(' '))
	}

	function isLikelyLoginContext(observation) {
		const pageText = normalizeText([observation?.url, observation?.title].join(' '))
		if (/(login|signin|sign-in|登录|登陆)/i.test(pageText)) return true
		const forms = Array.isArray(observation?.forms) ? observation.forms : []
		if (forms.some((form) => /(login|signin|sign-in|登录|登陆)/i.test(normalizeText(form?.name)))) return true
		return !!findLoginSubmitAction(observation)
	}

	function findCredentialField(fields, kind) {
		return (Array.isArray(fields) ? fields : []).find((field) => {
			if (!Number.isFinite(Number(field?.index))) return false
			const text = normalizeText([
				field?.fieldType,
				field?.label,
				field?.placeholder,
				field?.aliases,
				field?.type,
			].join(' '))
			if (kind === 'password') return /(password|pwd|密码)/i.test(text)
			return /(username|account|user|账号|账户|用户名|登录名)/i.test(text)
		}) || null
	}

	function getLoginFieldLabel(field, fallback) {
		return String(field?.label || field?.placeholder || field?.name || fallback || '').trim() || fallback
	}

	function findLoginSubmitAction(observation) {
		const actions = Array.isArray(observation?.actions) ? observation.actions : []
		return actions.find((action) => {
			if (!Number.isFinite(Number(action?.index))) return false
			const text = normalizeText([action?.intent, action?.actionIntent, action?.label, action?.text].join(' '))
			return /(login|signin|submit|登录|登陆|进入系统)/i.test(text)
		}) || null
	}

	function isFilled(field) {
		return /^filled:|^selected:/i.test(String(field?.valueState || field?.value || ''))
	}

	function normalizeActionName(action) {
		return String(action || '').replace(/\.(verify|loop_guard|vision_recovery)$/i, '')
	}

	function isLoginSubmitHistory(item) {
		const action = normalizeActionName(item?.action)
		if (action !== 'click_element_by_index' && action !== 'click') return false
		const text = normalizeText([
			item?.input?.workflow_step,
			item?.input?.target_label,
			item?.input?.label,
			item?.input?.text,
			item?.nextGoal,
			item?.output,
			item?.evaluationPreviousGoal,
		].filter(Boolean).join(' '))
		return /(submit_login|login|signin|submit|登录|登陆|进入系统)/i.test(text)
	}

	function normalizeText(value) {
		return String(value || '').replace(/\s+/g, '').trim()
	}

	function escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	}

	function buildDecision(reason, goal, actionName, input) {
		const actionInput = input && typeof input === 'object'
			? { workflow: 'login', ...input }
			: { workflow: 'login' }
		return {
			evaluation_previous_goal: reason,
			memory: '当前任务包含登录凭据，使用通用登录流程先完成认证，再交给后续页面流程。',
			thought: reason,
			next_goal: goal,
			action: {
				name: actionName,
				input: actionInput,
			},
		}
	}

	function buildLoginDecision(reason, goal, actionName, input, workflowStep) {
		return buildDecision(reason, goal, actionName, {
			...(input || {}),
			workflow_step: workflowStep,
		})
	}

	g.NC_BG_LOGIN_WORKFLOW = {
		deriveLoginWorkflowDecision,
		recordLoginWorkflowOutcome,
	}
	g.NC_BG_LOGIN_WORKFLOW_TESTS = {
		deriveLoginWorkflowDecision,
		extractLoginCredentials,
		recordLoginWorkflowOutcome,
	}
})(globalThis)
