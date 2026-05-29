;(function (g) {
	function createSelectActions(deps) {
		const {
			observer,
			humanLikeClick,
			hoverElement,
			isDisabledElement,
			setNativeValue,
			sleep,
			randomBetween,
			appendStateChange,
			createOutcome,
			getElementInteractionState,
			inferInteractionOutcome,
			OUTCOME_KIND,
			waitForVisibleOption,
			listVisibleOptionLabels,
			getVisibleOptionLabel,
			resolveDropdownTrigger,
			resolveNativeSelect,
			listNativeSelectOptionLabels,
			selectOptionByText,
			resolveSelectableClickTarget,
			findCascaderOptionByScrolling,
			bringCascaderOptionIntoView,
			waitForCascaderMenuLevel,
			summarizeCascaderLevel,
		} = deps || {}

		async function selectDropdownOptionAction(input, inputMode) {
			const text = String(input.text || input.label || '').trim()
			const index = Number(input.index)
			if (!text && !Number.isFinite(index)) {
				return { success: false, message: 'select_dropdown_option 缺少 index 或 text。' }
			}
			let field = null
			let before = null
			let option = null
			if (!text && Number.isFinite(index)) {
				field = observer.getElementByIndex(index)
				if (!field) return { success: false, message: `索引 ${index} 不存在。` }
				const nativeSelect = resolveNativeSelect(field)
				const trigger = nativeSelect || resolveDropdownTrigger(field) || field
				if (isDisabledElement(field) && !hasEnabledSelectionTrigger(field, trigger)) {
					return { success: false, message: `索引 ${index} 对应下拉框已禁用。` }
				}
				before = getElementInteractionState(field)
				await humanLikeClick(trigger, null, inputMode)
				const nativeLabels = nativeSelect ? listNativeSelectOptionLabels(nativeSelect, 16) : []
				const visible = nativeLabels.length
					? nativeLabels
					: await waitForVisibleOptionLabels(field, inputMode, 16)
				const after = getElementInteractionState(field)
				const suffix = visible.length
					? ` 当前候选: ${visible.join('、')}`
					: ' 当前尚未检测到可见候选，下一轮应重新观察或等待弹层。'
				return {
					success: true,
					message: appendStateChange(`已展开下拉框索引 ${index}。${suffix}`, before, after),
					meta: {
						before,
						after,
						visibleOptions: visible,
						outcome: createOutcome(visible.length ? OUTCOME_KIND.OPTIONS_VISIBLE : OUTCOME_KIND.NONE, {
							visibleOptions: visible,
						}),
					},
				}
			}
			if (!Number.isFinite(index)) {
				option = await waitForVisibleOption(text, { selectableOnly: false, timeoutMs: 260 })
			}
			if (Number.isFinite(index)) {
				field = observer.getElementByIndex(index)
				if (!field) return { success: false, message: `索引 ${index} 不存在。` }
				const nativeSelect = resolveNativeSelect(field)
				if (nativeSelect) {
					before = getElementInteractionState(field)
					const matched = selectOptionByText(nativeSelect, text)
					if (!matched) {
						const nativeLabels = listNativeSelectOptionLabels(nativeSelect, 20)
						return buildDropdownFailureResult({
							index,
							requestedText: text,
							visibleOptions: nativeLabels,
							reason: `选择失败：select 中没有匹配选项 "${text}"。`,
							source: 'native_select',
						})
					}
					nativeSelect.dispatchEvent(new Event('input', { bubbles: true }))
					nativeSelect.dispatchEvent(new Event('change', { bubbles: true }))
					const after = getElementInteractionState(field)
					return {
						success: true,
						message: appendStateChange(`已选择下拉选项 "${matched.label}"。`, before, after),
						meta: { before, after, outcome: createOutcome(OUTCOME_KIND.VALUE_CHANGED) },
					}
				}
				if (field) {
					before = getElementInteractionState(field)
					option = await waitForVisibleOption(text, {
						selectableOnly: false,
						timeoutMs: 260,
						field,
					})
					if (!option) {
						const trigger = resolveDropdownTrigger(field) || field
						await humanLikeClick(trigger, null, inputMode)
						await sleep(inputMode === 'realistic' ? randomBetween(140, 240) : 120)
						option = await waitForVisibleOption(text, {
							selectableOnly: false,
							timeoutMs: 1800,
							field,
						})
					}
				}
			}
			if (!option && !Number.isFinite(index)) {
				option = await waitForVisibleOption(text, { selectableOnly: false, timeoutMs: 1200 })
			}
			if (!option) {
				const visible = listVisibleOptionLabels(12, field ? { field } : {})
				return buildDropdownFailureResult({
					index: Number.isFinite(index) ? index : null,
					requestedText: text,
					visibleOptions: visible,
					reason: `未找到可见下拉选项 "${text}"。`,
					source: field ? 'field_scoped_popup' : 'global_popup',
				})
			}
			await humanLikeClick(option, null, inputMode)
			const selection = await waitForDropdownSelectionEffect({ field, option, before, inputMode })
			return {
				success: true,
				message: appendStateChange(`已选择下拉选项 "${text}"。`, before, selection.after),
				meta: {
					before,
					after: selection.after,
					optionAfter: selection.optionAfter,
					outcome: selection.outcome,
				},
			}
		}

		async function openDropdownAction(input, inputMode) {
			return selectDropdownOptionAction({
				...(input || {}),
				text: '',
				label: '',
			}, inputMode)
		}

		async function chooseDropdownOptionAction(input, inputMode) {
			const text = String(input?.text || input?.label || '').trim()
			if (!text) return { success: false, message: 'choose_dropdown_option 缺少 text。' }
			const index = Number(input?.index)
			if (!Number.isFinite(index)) {
				return {
					success: false,
					message: 'choose_dropdown_option 缺少目标字段 index；为避免误选其他弹层，必须先 open_dropdown(index) 或 request_options_for(index) 后再选择字段内候选。',
				}
			}
			return selectDropdownOptionAction(input || {}, inputMode)
		}

		async function selectCheckboxOptionAction(input, inputMode) {
			const text = String(input.text || input.label || '').trim()
			if (!text) return { success: false, message: 'select_checkbox_option 缺少 text。' }
			const index = Number(input.index)
			let field = null
			if (Number.isFinite(index)) {
				field = observer.getElementByIndex(index)
				if (!field) return { success: false, message: `索引 ${index} 不存在。` }
				if (field) {
					const trigger = resolveDropdownTrigger(field) || field
					await humanLikeClick(trigger, null, inputMode)
					await sleep(inputMode === 'realistic' ? randomBetween(90, 160) : 90)
				}
			}
			const lookupScope = field ? { field } : {}
			const scopedOption =
				(await waitForVisibleOption(text, { ...lookupScope, selectableOnly: true, timeoutMs: 1400 })) ||
				(await waitForVisibleOption(text, { ...lookupScope, timeoutMs: 900 }))
			const option = scopedOption || (field
				? (await waitForVisibleOption(text, { selectableOnly: true, timeoutMs: 1400 })) ||
					(await waitForVisibleOption(text, { timeoutMs: 700 }))
				: null)
			if (!option) {
				const scopedVisible = listVisibleOptionLabels(12, { ...lookupScope, selectableOnly: true })
				const globalVisible = field ? listVisibleOptionLabels(12, { selectableOnly: true }) : []
				const visible = scopedVisible.length ? scopedVisible : globalVisible
				return buildSelectionFailureResult({
					index: Number.isFinite(index) ? index : null,
					requestedText: text,
					visibleOptions: visible,
					reason: `未找到可见复选项 "${text}"。`,
					source: field && !scopedVisible.length && globalVisible.length ? 'global_selectable_popup_fallback' : (field ? 'field_scoped_selectable_popup' : 'global_selectable_popup'),
					candidateLabel: '当前可见复选候选',
					emptyCandidateText: '当前字段范围内没有检测到可见复选候选。',
					advice: visible.length
						? '下一步建议：从当前复选候选中选择真实 label，或先 request_options_for 当前字段确认候选。'
						: '下一步建议：先展开对应多选字段，等待候选出现，或改用更具体的 checkbox/radio 子项。',
				})
			}
			const before = getElementInteractionState(option)
			const clickTarget = resolveSelectableClickTarget(option) || option
			await humanLikeClick(clickTarget, null, inputMode)
			await sleep(inputMode === 'realistic' ? randomBetween(120, 220) : 100)
			const after = getElementInteractionState(option)
			const selectedLabel = observer.shortText(getVisibleOptionLabel(option) || text, 36) || text
			return {
				success: true,
				message: appendStateChange(`已选择复选项 "${selectedLabel}"。`, before, after),
				meta: { before, after, outcome: inferInteractionOutcome(before, after, OUTCOME_KIND.NONE) },
			}
		}

		async function selectCascaderPathAction(input, inputMode) {
			const path = Array.isArray(input.path)
				? input.path.map((item) => String(item || '').trim()).filter(Boolean)
				: String(input.path || '')
						.split(/[>\/,，]+/)
						.map((item) => item.trim())
						.filter(Boolean)
			if (!path.length) return { success: false, message: 'select_cascader_path 缺少 path。' }

			const index = Number(input.index)
			let field = null
			let before = null
			let finalOption = null
			if (Number.isFinite(index)) {
				field = observer.getElementByIndex(index)
				if (!field) return { success: false, message: `索引 ${index} 不存在。` }
				if (field) {
					before = getElementInteractionState(field)
					await openCascaderField(field, inputMode)
				}
			}

			for (let i = 0; i < path.length; i++) {
				const label = path[i]
				const option = await findCascaderOptionByScrolling(label, i, inputMode)
				if (!option) {
					return buildSelectionFailureResult({
						index: Number.isFinite(index) ? index : null,
						requestedText: label,
						visibleOptions: [],
						reason: `级联选择失败：未找到第 ${i + 1} 级选项 "${label}"。${summarizeCascaderLevel(i)}`,
						source: `cascader_level_${i + 1}`,
						candidateLabel: `第 ${i + 1} 级可见候选`,
						emptyCandidateText: `当前第 ${i + 1} 级没有检测到匹配候选。`,
						advice: '下一步建议：请求当前级联区域上下文，或换用页面真实可见的完整路径。',
					})
				}
				await bringCascaderOptionIntoView(option, inputMode)
				if (i < path.length - 1) {
					await hoverElement(option, inputMode)
					let nextLevelReady = await waitForCascaderMenuLevel(i + 1, inputMode)
					if (!nextLevelReady) {
						await humanLikeClick(option, null, inputMode)
						await sleep(inputMode === 'realistic' ? randomBetween(120, 220) : 120)
						nextLevelReady = await waitForCascaderMenuLevel(i + 1, inputMode)
					}
					if (!nextLevelReady) {
						const nextLabel = path[i + 1] || label
						return buildSelectionFailureResult({
							index: Number.isFinite(index) ? index : null,
							requestedText: nextLabel,
							visibleOptions: [],
							reason: `级联选择失败：已悬浮第 ${i + 1} 级 "${label}"，但第 ${i + 2} 级菜单未展开，停止继续滚动上一级菜单。${summarizeCascaderLevel(i)}`,
							source: `cascader_level_${i + 2}`,
							candidateLabel: `第 ${i + 2} 级可见候选`,
							emptyCandidateText: `当前第 ${i + 2} 级没有展开出候选。`,
							advice: '下一步建议：保持父级悬浮后等待，或选择页面实际存在的父级路径。',
						})
					}
				} else {
					finalOption = option
					await humanLikeClick(option, null, inputMode)
				}
			}
			await sleep(inputMode === 'realistic' ? randomBetween(100, 180) : 90)
			await dismissSelectionPopup(field || finalOption, inputMode)
			const after = field instanceof HTMLElement
				? getElementInteractionState(field)
				: readDropdownSelectionState(null, finalOption)
			const optionAfter = readOptionSelectionState(finalOption)
			const outcome = inferDropdownSelectionOutcome(before, after, optionAfter)
			return {
				success: true,
				message: appendStateChange(`已按路径选择级联选项：${path.join(' > ')}。`, before, after),
				meta: { before, after, optionAfter, outcome },
			}
		}

		async function openCascaderField(field, inputMode) {
			if (!(field instanceof HTMLElement)) return false
			const triggers = []
			const addTrigger = (node) => {
				if (node instanceof HTMLElement && !triggers.includes(node)) triggers.push(node)
			}
			addTrigger(resolveDropdownTrigger(field))
			addTrigger(field)
			try {
				for (const node of Array.from(field.querySelectorAll?.(
					'.el-input__suffix,.el-select__caret,.el-input,[role="combobox"],input,.ant-select-selector,.arco-select-view,.n-base-selection-label'
				) || [])) {
					addTrigger(node)
				}
			} catch (_) {}
			for (const trigger of triggers) {
				await humanLikeClick(trigger, null, inputMode)
				await sleep(inputMode === 'realistic' ? randomBetween(120, 220) : 120)
				if (await waitForCascaderMenuLevel(0, inputMode)) return true
			}
			return !!(await waitForCascaderMenuLevel(0, inputMode))
		}

		async function dismissSelectionPopup(anchor, inputMode) {
			dispatchEscape(anchor)
			await sleep(inputMode === 'realistic' ? randomBetween(80, 140) : 70)
			if (!hasVisibleSelectionPopup()) return
			const point = findSafeBlankPoint(anchor)
			if (point) {
				dispatchPointClick(point.x, point.y)
				await sleep(inputMode === 'realistic' ? randomBetween(80, 140) : 70)
			}
			dispatchEscape(anchor)
			if (anchor instanceof HTMLElement) {
				try {
					anchor.blur?.()
				} catch (_) {}
			}
		}

		function dispatchEscape(anchor) {
			const targets = []
			const active = document.activeElement
			if (active instanceof HTMLElement) targets.push(active)
			if (anchor instanceof HTMLElement && !targets.includes(anchor)) targets.push(anchor)
			if (document.body instanceof HTMLElement && !targets.includes(document.body)) targets.push(document.body)
			for (const target of targets) {
				for (const type of ['keydown', 'keyup']) {
					target.dispatchEvent(new KeyboardEvent(type, {
						key: 'Escape',
						code: 'Escape',
						keyCode: 27,
						which: 27,
						bubbles: true,
						cancelable: true,
					}))
				}
			}
		}

		function hasVisibleSelectionPopup() {
			return Array.from(document.querySelectorAll(
				'.el-popper,.el-select__popper,.el-select-dropdown,.el-cascader-panel,.el-picker-panel,.ant-select-dropdown,.ant-cascader-menus,.arco-trigger-popup,.n-dropdown-menu,[role="listbox"]'
			)).some((node) => {
				if (!(node instanceof HTMLElement)) return false
				const style = window.getComputedStyle(node)
				const rect = node.getBoundingClientRect()
				return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 2 && rect.height > 2
			})
		}

		function findSafeBlankPoint(anchor) {
			const root = anchor instanceof HTMLElement
				? (anchor.closest('[role="dialog"],[aria-modal="true"],dialog,.el-dialog,.ant-modal,.n-modal') || document.body)
				: document.body
			if (!(root instanceof HTMLElement)) return null
			const rect = root.getBoundingClientRect()
			const candidates = [
				{ x: rect.left + 28, y: rect.top + 28 },
				{ x: rect.left + Math.min(rect.width - 28, 180), y: rect.top + 28 },
				{ x: rect.left + 28, y: rect.bottom - 72 },
			]
			for (const point of candidates) {
				const x = Math.max(1, Math.min(window.innerWidth - 1, point.x))
				const y = Math.max(1, Math.min(window.innerHeight - 1, point.y))
				const hit = document.elementFromPoint(x, y)
				if (!(hit instanceof HTMLElement)) continue
				if (hit.closest('.el-popper,.el-select__popper,.el-select-dropdown,.el-cascader-panel,.el-picker-panel,.ant-select-dropdown,.ant-cascader-menus,.arco-trigger-popup,.n-dropdown-menu,[role="listbox"]')) continue
				if (hit.closest('button,a,input,textarea,select,[role="button"],[role="combobox"],[role="checkbox"],[role="radio"]')) continue
				return { x, y }
			}
			return null
		}

		function dispatchPointClick(x, y) {
			const target = document.elementFromPoint(x, y)
			if (!(target instanceof HTMLElement)) return
			const pointerOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				pointerType: 'mouse',
			}
			const mouseOpts = {
				bubbles: true,
				cancelable: true,
				clientX: x,
				clientY: y,
				button: 0,
			}
			target.dispatchEvent(new PointerEvent('pointerdown', pointerOpts))
			target.dispatchEvent(new MouseEvent('mousedown', mouseOpts))
			target.dispatchEvent(new PointerEvent('pointerup', pointerOpts))
			target.dispatchEvent(new MouseEvent('mouseup', mouseOpts))
			target.click()
		}

		async function waitForDropdownSelectionEffect({ field, option, before, inputMode }) {
			const delays = inputMode === 'realistic' ? [90, 180, 320] : [80, 180]
			let after = readDropdownSelectionState(field, option)
			let optionAfter = readOptionSelectionState(option)
			for (const delay of delays) {
				const outcome = inferDropdownSelectionOutcome(before, after, optionAfter)
				if (outcome?.progress) return { after, optionAfter, outcome }
				await sleep(delay)
				after = readDropdownSelectionState(field, option)
				optionAfter = readOptionSelectionState(option)
			}
			return {
				after,
				optionAfter,
				outcome: inferDropdownSelectionOutcome(before, after, optionAfter),
			}
		}

		function readDropdownSelectionState(field, option) {
			if (field instanceof HTMLElement) return getElementInteractionState(field)
			if (option instanceof HTMLElement && option.isConnected) return getElementInteractionState(option)
			return null
		}

		function readOptionSelectionState(option) {
			if (!(option instanceof HTMLElement) || !option.isConnected) return null
			return getElementInteractionState(option)
		}

		async function waitForVisibleOptionLabels(field, inputMode, limit = 16) {
			const timeoutMs = inputMode === 'realistic' ? 1600 : 1000
			const deadline = Date.now() + timeoutMs
			let labels = []
			while (Date.now() <= deadline) {
				labels = listVisibleOptionLabels(limit, { field })
				if (labels.length) return labels
				await sleep(120)
			}
			return labels
		}

		function hasEnabledSelectionTrigger(field, trigger) {
			if (trigger instanceof HTMLElement && trigger !== field && !isDisabledElement(trigger)) return true
			const composite = field?.closest?.(
				'.el-select,.el-cascader,.ant-select,.ant-cascader-picker,.arco-select,.arco-cascader,.n-base-selection,[class*="select-wrapper"],[class*="combobox"],[class*="picker"],[role="combobox"]'
			)
			if (!(composite instanceof HTMLElement) || composite === field) return false
			const disabledText = String(composite.className || '')
			const explicitlyDisabled =
				composite.hasAttribute('disabled') ||
				String(composite.getAttribute('aria-disabled') || '').toLowerCase() === 'true' ||
				/(^|\s)(is-disabled|disabled|el-select--disabled)(\s|$)/i.test(disabledText)
			return !explicitlyDisabled
		}

		function inferDropdownSelectionOutcome(before, after, optionAfter) {
			const fieldOutcome = inferInteractionOutcome(before, after, OUTCOME_KIND.NONE)
			if (fieldOutcome?.progress) return fieldOutcome
			if (optionAfter && (
				optionAfter.selected === true ||
				optionAfter.childSelected === true ||
				optionAfter.checked === true ||
				optionAfter.childChecked === true
			)) {
				return createOutcome(OUTCOME_KIND.STATE_CHANGED)
			}
			return createOutcome(OUTCOME_KIND.NONE)
		}

		function buildDropdownFailureResult({ index, requestedText, visibleOptions, reason, source }) {
			return buildSelectionFailureResult({
				index,
				requestedText,
				visibleOptions,
				reason,
				source,
				candidateLabel: '当前字段候选',
				emptyCandidateText: '当前字段范围内没有检测到可见候选。',
				advice: buildDropdownFailureAdvice(index, visibleOptions),
			})
		}

		function buildDropdownFailureAdvice(index, visibleOptions) {
			const options = Array.isArray(visibleOptions)
				? visibleOptions.map((item) => String(item || '').trim()).filter(Boolean)
				: []
			if (options.length) return '下一步建议：从当前候选中选择真实 label，或先 request_options_for 当前字段确认候选。'
			return Number.isFinite(Number(index))
				? '下一步建议：先对该字段执行 open_dropdown 重新展开，等待或 request_options_for 后再选择。'
				: '下一步建议：先提供目标字段 index，展开对应下拉框后再选择。'
		}

		function buildSelectionFailureResult(params) {
			const {
				index,
				requestedText,
				visibleOptions,
				reason,
				source,
				candidateLabel,
				emptyCandidateText,
				advice,
			} = params || {}
			const options = Array.isArray(visibleOptions)
				? visibleOptions.map((item) => String(item || '').trim()).filter(Boolean)
				: []
			const candidateText = options.length
				? ` ${candidateLabel || '当前字段候选'}: ${options.slice(0, 12).join('、')}。`
				: ` ${emptyCandidateText || '当前字段范围内没有检测到可见候选。'}`
			const targetHint = Number.isFinite(Number(index)) ? ` index=${Number(index)}` : ' 未限定目标字段 index'
			const message = `${reason}${candidateText} 目标:${targetHint}。${advice || '下一步建议：请求更多上下文后再选择。'}`
			return {
				success: false,
				message,
				meta: {
					index: Number.isFinite(Number(index)) ? Number(index) : null,
					requestedText: String(requestedText || ''),
					visibleOptions: options,
					source: String(source || ''),
					outcome: createOutcome(OUTCOME_KIND.FAILED, {
						reason,
						requestedText: String(requestedText || ''),
						visibleOptions: options,
					}),
				},
			}
		}

		return {
			chooseDropdownOptionAction,
			openDropdownAction,
			selectCascaderPathAction,
			selectCheckboxOptionAction,
			selectDropdownOptionAction,
		}
	}

	g.NC_CONTENT_ACTION_SELECT = { createSelectActions }
})(window)
