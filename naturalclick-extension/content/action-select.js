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
			findDropdownOptionByScrolling,
			listVisibleOptionLabels,
			getVisibleOptionLabel,
			resolveDropdownTrigger,
			resolveNativeSelect,
			listNativeSelectOptionLabels,
			selectOptionByText,
			resolveSelectableClickTarget,
			findCascaderOptionByScrolling,
			bringCascaderOptionIntoView,
			getCascaderLevelSignature,
			waitForCascaderMenuLevel,
			summarizeCascaderLevel,
		} = deps || {}

		async function selectDropdownOptionAction(input, inputMode) {
			const text = String(input.text || input.label || '').trim()
			const dateSelectionTexts = parseDateSelectionRequest(text)
			const lookupText = dateSelectionTexts[0] || text
			const index = Number(input.index)
			if (!text && !Number.isFinite(index)) {
				return { success: false, message: 'select_dropdown_option 缺少 index 或 text。' }
			}
			if (text && !Number.isFinite(index)) {
				return {
					success: false,
					message: 'select_dropdown_option 选择选项时缺少目标字段 index；为避免误选其他弹层，必须提供 index，或改用 open_dropdown(index) 后 choose_dropdown_option(index,text)。',
				}
			}
			let field = null
			let before = null
			let option = null
			let openedByField = false
			if (!text && Number.isFinite(index)) {
				field = observer.getElementByIndex(index)
				if (!field) return { success: false, message: `索引 ${index} 不存在。` }
				const nativeSelect = resolveNativeSelect(field)
				const trigger = nativeSelect || resolveDropdownTrigger(field) || field
				if (nativeSelect && isDisabledElement(nativeSelect)) {
					return { success: false, message: `索引 ${index} 对应下拉框已禁用。` }
				}
				const disabledLikeComposite =
					!nativeSelect &&
					isDisabledElement(field) &&
					!hasEnabledSelectionTrigger(field, trigger)
				before = getElementInteractionState(field)
				await humanLikeClick(trigger, null, inputMode)
				openedByField = true
				const nativeLabels = nativeSelect ? listNativeSelectOptionLabels(nativeSelect, 16) : []
				const visible = nativeLabels.length
					? nativeLabels
					: await waitForVisibleOptionLabels(field, inputMode, 16, { openedByField })
				const after = getElementInteractionState(field)
				const openOutcome = visible.length
					? createOutcome(OUTCOME_KIND.OPTIONS_VISIBLE, { visibleOptions: visible })
					: inferInteractionOutcome(before, after, OUTCOME_KIND.NONE)
				if (!visible.length && !openOutcome?.progress) {
					return buildDropdownFailureResult({
						index,
						requestedText: '',
						visibleOptions: [],
						reason: `下拉框索引 ${index} 已尝试触发，但字段状态未变化且未检测到可见候选。`,
						source: disabledLikeComposite ? 'disabled_like_composite_probe' : 'open_dropdown_probe',
					})
				}
				const suffix = visible.length
					? ` 当前候选: ${visible.join('、')}`
					: `${disabledLikeComposite ? ' 字段带禁用样式/属性但已尝试点击下拉触发区。' : ''} 当前尚未检测到可见候选，下一轮应重新观察或等待弹层。`
				return {
					success: true,
					message: appendStateChange(`已展开下拉框索引 ${index}。${suffix}`, before, after),
					meta: {
						before,
						after,
						visibleOptions: visible,
						outcome: openOutcome,
					},
				}
			}
			if (Number.isFinite(index)) {
				field = observer.getElementByIndex(index)
				if (!field) return { success: false, message: `索引 ${index} 不存在。` }
				const nativeSelect = resolveNativeSelect(field)
				if (nativeSelect) {
					if (isDisabledElement(nativeSelect)) {
						return { success: false, message: `索引 ${index} 对应下拉框已禁用。` }
					}
					before = getElementInteractionState(field)
					const matched = selectOptionByText(nativeSelect, lookupText)
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
					option = await waitForVisibleOption(lookupText, {
						selectableOnly: false,
						timeoutMs: 260,
						field,
						openedByField: true,
					})
					if (!option) {
						option = await findDropdownOptionByScrolling(lookupText, {
							selectableOnly: false,
							timeoutMs: 1200,
							field,
							openedByField: true,
						})
					}
					if (!option) {
						const trigger = resolveDropdownTrigger(field) || field
						await humanLikeClick(trigger, null, inputMode)
						openedByField = true
						await sleep(inputMode === 'realistic' ? randomBetween(140, 240) : 120)
						option = await waitForVisibleOption(lookupText, {
							selectableOnly: false,
							timeoutMs: 1800,
							field,
							openedByField,
						})
						if (!option) {
							option = await findDropdownOptionByScrolling(lookupText, {
								selectableOnly: false,
								timeoutMs: 2400,
								field,
								openedByField,
							})
						}
					}
				}
			}
			if (!option) {
				const scopedVisible = listVisibleOptionLabels(12, field ? { field, openedByField } : {})
				const globalVisible = field ? listVisibleOptionLabels(12, {}) : []
				const hasGlobalDiagnostic = field && !scopedVisible.length && globalVisible.length
				const visible = scopedVisible.length ? scopedVisible : globalVisible
				return buildDropdownFailureResult({
					index: Number.isFinite(index) ? index : null,
					requestedText: text,
					visibleOptions: visible,
					reason: hasGlobalDiagnostic
						? `未在目标字段范围内找到可见下拉选项 "${text}"，但页面存在字段外可见候选。`
						: `未找到可见下拉选项 "${text}"。`,
					source: hasGlobalDiagnostic ? 'global_popup_diagnostic' : (field ? 'field_scoped_popup' : 'global_popup'),
					candidateLabel: hasGlobalDiagnostic ? '字段外可见下拉候选' : '当前字段候选',
					emptyCandidateText: '当前字段范围内没有检测到可见下拉候选。',
					advice: hasGlobalDiagnostic
						? '下一步建议：先 request_options_for 当前字段确认候选；不要直接选择字段外候选。'
						: undefined,
				})
			}
			await humanLikeClick(option, null, inputMode)
			const completedRange = await maybeCompleteDateRangeSelection({
				field,
				inputMode,
				dateSelectionTexts,
				firstOption: option,
			})
			const selection = await waitForDropdownSelectionEffect({ field, option, before, inputMode })
			const selectedText = completedRange ? `${lookupText} - ${completedRange}` : text
			const rangeStarted = dateSelectionTexts.length >= 2 && !completedRange
			const outcome = completedRange && !selection.outcome?.progress
				? createOutcome(OUTCOME_KIND.STATE_CHANGED, {
					reason: 'date_range_second_option_selected',
					requestedText: text,
				})
				: rangeStarted
					? createOutcome(OUTCOME_KIND.STATE_CHANGED, {
						reason: 'date_range_first_option_selected',
						requestedText: text,
						selectedDate: lookupText,
						pendingText: dateSelectionTexts[1],
					})
					: selection.outcome
			const messageText = rangeStarted
				? `已选择日期范围起点 "${lookupText}"，等待选择结束日期 "${dateSelectionTexts[1]}"。`
				: `已选择下拉选项 "${selectedText}"。`
			return {
				success: true,
				message: appendStateChange(messageText, before, selection.after),
				meta: {
					before,
					after: selection.after,
					optionAfter: selection.optionAfter,
					outcome,
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
			if (!Number.isFinite(index)) {
				return {
					success: false,
					message: 'select_checkbox_option 缺少目标字段 index；为避免误选其他弹层，必须提供 index，或先 open_dropdown(index) / request_options_for(index) 确认候选后再选择。',
				}
			}
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
			const lookupScope = field ? { field, openedByField: field instanceof HTMLElement } : {}
			const scopedOption =
				(await waitForVisibleOption(text, { ...lookupScope, selectableOnly: true, timeoutMs: 1400 })) ||
				(await findDropdownOptionByScrolling(text, { ...lookupScope, selectableOnly: true, timeoutMs: 1800 })) ||
				(await waitForVisibleOption(text, { ...lookupScope, timeoutMs: 900 })) ||
				(await findDropdownOptionByScrolling(text, { ...lookupScope, timeoutMs: 1800 }))
			const option = scopedOption
			if (!option) {
				const scopedVisible = listVisibleOptionLabels(12, { ...lookupScope, selectableOnly: true })
				const globalVisible = field ? listVisibleOptionLabels(12, { selectableOnly: true }) : []
				const visible = scopedVisible.length ? scopedVisible : globalVisible
				return buildSelectionFailureResult({
					index: Number.isFinite(index) ? index : null,
					requestedText: text,
					visibleOptions: visible,
					reason: `未找到可见复选项 "${text}"。`,
					source: field && !scopedVisible.length && globalVisible.length ? 'global_selectable_popup_diagnostic' : (field ? 'field_scoped_selectable_popup' : 'global_selectable_popup'),
					candidateLabel: field && !scopedVisible.length && globalVisible.length ? '字段外可见复选候选' : '当前可见复选候选',
					emptyCandidateText: '当前字段范围内没有检测到可见复选候选。',
					advice: visible.length
						? '下一步建议：先 request_options_for 当前字段确认候选；不要直接选择字段外候选。'
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
			if (!Number.isFinite(index)) {
				return {
					success: false,
					message: 'select_cascader_path 缺少目标字段 index；为避免误选其他级联弹层，必须提供 index，再按该字段范围选择完整路径。',
				}
			}
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
					const nextLevelReady = await expandCascaderParentOption(option, i + 1, inputMode, path[i + 1])
					if (!nextLevelReady) {
						const nextLabel = path[i + 1] || label
						return buildSelectionFailureResult({
							index: Number.isFinite(index) ? index : null,
							requestedText: nextLabel,
							visibleOptions: [],
							reason: `级联选择失败：已尝试悬浮并点击第 ${i + 1} 级 "${label}" 的展开区域/父级行，但第 ${i + 2} 级菜单仍未展开，停止继续滚动上一级菜单。${summarizeCascaderLevel(i)}`,
							source: `cascader_level_${i + 2}`,
							candidateLabel: `第 ${i + 2} 级可见候选`,
							emptyCandidateText: `当前第 ${i + 2} 级没有展开出候选。`,
							advice: '下一步建议：保持当前父级菜单状态后重新观察，或选择页面实际存在的父级路径。',
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

		async function expandCascaderParentOption(option, nextLevelIndex, inputMode, expectedNextLabel = '') {
			if (!(option instanceof HTMLElement)) return false
			const beforeSignature = readCascaderLevelSignature(nextLevelIndex)
			await hoverElement(option, inputMode)
			if (await waitForCascaderNextLevelRefresh(option, nextLevelIndex, beforeSignature, expectedNextLabel, inputMode)) return true

			const expandTarget = resolveCascaderExpandTarget(option)
			if (expandTarget) {
				await dispatchCascaderElementClick(expandTarget, inputMode)
				if (await waitForCascaderNextLevelRefresh(option, nextLevelIndex, beforeSignature, expectedNextLabel, inputMode)) return true
			}

			await dispatchCascaderElementClick(option, inputMode, { rightEdge: true })
			if (await waitForCascaderNextLevelRefresh(option, nextLevelIndex, beforeSignature, expectedNextLabel, inputMode)) return true

			await hoverElement(option, inputMode)
			await sleep(inputMode === 'realistic' ? randomBetween(120, 220) : 120)
			return await waitForCascaderNextLevelRefresh(option, nextLevelIndex, beforeSignature, expectedNextLabel, inputMode)
		}

		async function waitForCascaderNextLevelRefresh(option, nextLevelIndex, previousSignature, expectedNextLabel, inputMode) {
			const hasExpectedNextLabel = !!String(expectedNextLabel || '').trim()
			const deadline = Date.now() + (inputMode === 'realistic' ? 1500 : 1000)
			let sawMenu = false
			let expandedAfterDelay = false
			const startedAt = Date.now()
			while (Date.now() <= deadline) {
				const menu = await waitForCascaderMenuLevel(nextLevelIndex, inputMode)
				if (menu) sawMenu = true
				const signature = readCascaderLevelSignature(nextLevelIndex)
				if (signature && (!previousSignature || signature !== previousSignature)) return true
				if (
					sawMenu &&
					cascaderParentLooksExpanded(option) &&
					Date.now() - startedAt >= (hasExpectedNextLabel ? 260 : 80)
				) {
					expandedAfterDelay = true
					if (!previousSignature || !hasExpectedNextLabel) return true
				}
				await sleep(inputMode === 'realistic' ? randomBetween(80, 140) : 80)
			}
			const finalSignature = readCascaderLevelSignature(nextLevelIndex)
			if (finalSignature && (!previousSignature || finalSignature !== previousSignature)) return true
			return sawMenu && expandedAfterDelay
		}

		function readCascaderLevelSignature(levelIndex) {
			return typeof getCascaderLevelSignature === 'function'
				? String(getCascaderLevelSignature(levelIndex) || '')
				: ''
		}

		function cascaderParentLooksExpanded(option) {
			if (!(option instanceof HTMLElement)) return false
			const attr = String(option.getAttribute('aria-expanded') || '').toLowerCase()
			if (attr === 'true') return true
			const cls = String(option.className || '')
			return /(^|\s|--|__|-)(active|selected|expanded|checked|in-active|is-active|is-expanded)(\s|$)/i.test(cls)
		}

		function resolveCascaderExpandTarget(option) {
			if (!(option instanceof HTMLElement)) return null
			const selector = [
				'.el-cascader-node__postfix',
				'.el-icon-arrow-right',
				'.ant-cascader-menu-item-expand-icon',
				'.arco-cascader-option-expand-icon',
				'.n-cascader-option__suffix',
				'[class*="arrow-right"]',
				'[class*="expand-icon"]',
				'[class*="postfix"]',
				'[class*="suffix"]',
			].join(',')
			try {
				const target = option.querySelector(selector)
				if (target instanceof HTMLElement) return target
				const parent = target?.parentElement
				if (parent instanceof HTMLElement && option.contains(parent)) return parent
			} catch (_) {}
			return null
		}

		async function dispatchCascaderElementClick(element, inputMode, options = {}) {
			if (!(element instanceof HTMLElement)) return
			try {
				element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' })
			} catch (_) {
				element.scrollIntoView()
			}
			const rect = element.getBoundingClientRect()
			if (rect.width <= 1 || rect.height <= 1) return
			const x = options.rightEdge ? rect.left + rect.width * 0.82 : rect.left + rect.width / 2
			const y = rect.top + rect.height / 2
			const clientX = Math.max(1, Math.min(window.innerWidth - 1, x))
			const clientY = Math.max(1, Math.min(window.innerHeight - 1, y))
			const hit = document.elementFromPoint(clientX, clientY)
			const target = hit instanceof Element && element.contains(hit) ? hit : element
			const pointerOpts = {
				bubbles: true,
				cancelable: true,
				clientX,
				clientY,
				pointerType: 'mouse',
			}
			const mouseOpts = {
				bubbles: true,
				cancelable: true,
				clientX,
				clientY,
				button: 0,
			}
			target.dispatchEvent(new PointerEvent('pointerover', pointerOpts))
			target.dispatchEvent(new PointerEvent('pointerenter', { ...pointerOpts, bubbles: false }))
			target.dispatchEvent(new MouseEvent('mouseover', mouseOpts))
			target.dispatchEvent(new MouseEvent('mouseenter', { ...mouseOpts, bubbles: false }))
			target.dispatchEvent(new PointerEvent('pointerdown', pointerOpts))
			target.dispatchEvent(new MouseEvent('mousedown', mouseOpts))
			target.dispatchEvent(new PointerEvent('pointerup', pointerOpts))
			target.dispatchEvent(new MouseEvent('mouseup', mouseOpts))
			if (typeof target.click === 'function') target.click()
			else if (target !== element && typeof element.click === 'function') element.click()
			await sleep(inputMode === 'realistic' ? randomBetween(140, 260) : 140)
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
					'.el-input__suffix,.el-select__caret,.el-input,[role="combobox"],input,.ant-select-selector,.ant-tree-select,.arco-select-view,.n-base-selection-label,.van-dropdown-menu__bar,.van-field__control,.layui-select-title,.ivu-select-selection,.vxe-input,.q-field__control'
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
			if (isDialogAnchoredSelection(anchor)) {
				blurSelectionAnchor(anchor)
				await sleep(inputMode === 'realistic' ? randomBetween(80, 140) : 70)
				return
			}
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

		function isDialogAnchoredSelection(anchor) {
			return !!(anchor instanceof HTMLElement && anchor.closest(
				'[role="dialog"],[aria-modal="true"],dialog,.el-dialog,.ant-modal,.n-modal'
			))
		}

		function blurSelectionAnchor(anchor) {
			const active = document.activeElement
			for (const target of [active, anchor]) {
				if (!(target instanceof HTMLElement)) continue
				try {
					target.blur?.()
				} catch (_) {}
			}
			try {
				const nested = anchor instanceof HTMLElement
					? anchor.querySelector?.('input,textarea,[tabindex]')
					: null
				if (nested instanceof HTMLElement) nested.blur?.()
			} catch (_) {}
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
				'.el-popper,.el-select__popper,.el-select-dropdown,.el-cascader-panel,.el-picker-panel,.ant-select-dropdown,.ant-tree-select-dropdown,.ant-cascader-menus,.arco-trigger-popup,.n-dropdown-menu,.van-popup,.van-picker,.layui-anim,.ivu-select-dropdown,.vxe-table--ignore-clear,[role="listbox"]'
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
				if (hit.closest('.el-popper,.el-select__popper,.el-select-dropdown,.el-cascader-panel,.el-picker-panel,.ant-select-dropdown,.ant-tree-select-dropdown,.ant-cascader-menus,.arco-trigger-popup,.n-dropdown-menu,.van-popup,.van-picker,.layui-anim,.ivu-select-dropdown,.vxe-table--ignore-clear,[role="listbox"]')) continue
				if (hit.closest('button,a,input,textarea,select,[role="button"],[role="combobox"],[role="checkbox"],[role="radio"],[role="switch"]')) continue
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

		async function maybeCompleteDateRangeSelection({ field, inputMode, dateSelectionTexts, firstOption }) {
			if (!Array.isArray(dateSelectionTexts) || dateSelectionTexts.length < 2) return ''
			const secondText = dateSelectionTexts[1]
			if (!secondText || secondText === dateSelectionTexts[0]) return ''
			await sleep(inputMode === 'realistic' ? randomBetween(120, 220) : 100)
			const scoped = field instanceof HTMLElement ? { field, openedByField: true } : {}
			const secondOption = await waitForVisibleOption(secondText, {
				...scoped,
				selectableOnly: false,
				timeoutMs: 1400,
			}) || await findDropdownOptionByScrolling(secondText, {
				...scoped,
				selectableOnly: false,
				timeoutMs: 2200,
			})
			if (!(secondOption instanceof HTMLElement) || secondOption === firstOption) return ''
			await humanLikeClick(secondOption, null, inputMode)
			await sleep(inputMode === 'realistic' ? randomBetween(120, 220) : 100)
			return getVisibleOptionLabel(secondOption) || secondText
		}

		function parseDateSelectionRequest(value) {
			const text = String(value || '')
			const matches = []
			const seen = new Set()
			const pattern = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/g
			for (const match of text.matchAll(pattern)) {
				const normalized = `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`
				if (seen.has(normalized)) continue
				seen.add(normalized)
				matches.push(normalized)
				if (matches.length >= 2) break
			}
			return matches
		}

		function pad2(value) {
			return String(Number(value)).padStart(2, '0')
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

		async function waitForVisibleOptionLabels(field, inputMode, limit = 16, options = {}) {
			const timeoutMs = inputMode === 'realistic' ? 1600 : 1000
			const deadline = Date.now() + timeoutMs
			let labels = []
			while (Date.now() <= deadline) {
				labels = listVisibleOptionLabels(limit, { field, ...(options || {}) })
				if (labels.length) return labels
				await sleep(120)
			}
			return labels
		}

		function hasEnabledSelectionTrigger(field, trigger) {
			const composite = field?.closest?.(
				'.el-select,.el-select-v2,.el-select__wrapper,.el-cascader,.el-date-editor,.el-input--suffix,.ant-select,.ant-select-selector,.ant-tree-select,.ant-cascader-picker,.ant-picker,.arco-select,.arco-cascader,.arco-picker,.n-base-selection,.n-tree-select,.n-date-picker,.van-dropdown-menu,.van-dropdown-item,.van-field,.van-picker,.layui-form-select,.layui-select-title,.ivu-select,.ivu-select-selection,.ivu-date-picker,.vxe-select,.vxe-input,.q-select,.q-field,.avue-select,.avue-cascader,.avue-date,.avue-time,[class*="select-wrapper"],[class*="select__wrapper"],[class*="tree-select"],[class*="date-editor"],[class*="time-picker"],[class*="combobox"],[class*="picker"],[role="combobox"]'
			)
			const disabledRoot = composite instanceof HTMLElement ? composite : field
			const disabledText = String(disabledRoot?.className || '')
			const explicitlyDisabled =
				disabledRoot?.hasAttribute?.('disabled') ||
				String(disabledRoot?.getAttribute?.('aria-disabled') || '').toLowerCase() === 'true' ||
				/(^|\s)(is-disabled|disabled|el-select--disabled)(\s|$)/i.test(disabledText)
			if (explicitlyDisabled) return false
			if (trigger instanceof HTMLElement && trigger !== field && !isDisabledElement(trigger)) return true
			return composite instanceof HTMLElement && composite !== field
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

		function buildDropdownFailureResult({ index, requestedText, visibleOptions, reason, source, candidateLabel, emptyCandidateText, advice }) {
			return buildSelectionFailureResult({
				index,
				requestedText,
				visibleOptions,
				reason,
				source,
				candidateLabel: candidateLabel || '当前字段候选',
				emptyCandidateText: emptyCandidateText || '当前字段范围内没有检测到可见候选。',
				advice: advice || buildDropdownFailureAdvice(index, visibleOptions),
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
						source: String(source || ''),
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
