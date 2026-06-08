;(function (g) {
	function createCascaderHelpers(deps) {
		const {
			sleep,
			randomBetween,
			normalizeComparableText,
			getVisibleOptionLabel,
			compareOptionCandidate,
			isVisibleClickTarget,
			pulseSustainedHover,
		} = deps || {}

		async function findCascaderOptionByScrolling(text, levelIndex, inputMode) {
			const expected = normalizeComparableText(text)
			if (!expected) return null
			const menu = await waitForCascaderMenuLevel(levelIndex, inputMode)
			if (!menu) return null
			const domMatch = findCascaderOptionInLevelDom(text, levelIndex)
			if (domMatch) {
				await bringCascaderOptionIntoView(domMatch, inputMode)
				return findCascaderOptionInLevel(text, levelIndex) || domMatch
			}
			const deadline = Date.now() + 4200
			let lastSignature = ''
			let stagnantCount = 0
			let resetDone = false

			while (Date.now() <= deadline) {
				const immediate = findCascaderOptionInLevel(text, levelIndex)
				if (immediate) return immediate

				const currentMenu = getVisibleCascaderMenu(levelIndex)
				if (!currentMenu) {
					await waitForCascaderMenuLevel(levelIndex, inputMode)
					continue
				}
				const scrollable = findVerticalScrollable(currentMenu, false)
				if (!scrollable) {
					await sleep(120)
					continue
				}
				if (!resetDone) {
					scrollable.scrollTop = 0
					scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
					resetDone = true
					await sleep(inputMode === 'realistic' ? randomBetween(120, 200) : 100)
					const afterReset = findCascaderOptionInLevel(text, levelIndex)
					if (afterReset) return afterReset
					const afterResetDomMatch = findCascaderOptionInLevelDom(text, levelIndex)
					if (afterResetDomMatch) {
						await bringCascaderOptionIntoView(afterResetDomMatch, inputMode)
						return findCascaderOptionInLevel(text, levelIndex) || afterResetDomMatch
					}
				}

				const beforeTop = Number(scrollable.scrollTop || 0)
				const signature = getVisibleMenuSignature(scrollable)
				if (signature === lastSignature) stagnantCount += 1
				else stagnantCount = 0
				lastSignature = signature

				const step = Math.max(120, Math.min(320, scrollable.clientHeight * 0.82 || 220))
				scrollable.scrollTop = beforeTop + step
				scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
				await sleep(inputMode === 'realistic' ? randomBetween(180, 280) : 160)

				const afterScrollDomMatch = findCascaderOptionInLevelDom(text, levelIndex)
				if (afterScrollDomMatch) {
					await bringCascaderOptionIntoView(afterScrollDomMatch, inputMode)
					return findCascaderOptionInLevel(text, levelIndex) || afterScrollDomMatch
				}

				const afterTop = Number(scrollable.scrollTop || 0)
				const reachedBottom = afterTop <= beforeTop + 2 || afterTop + scrollable.clientHeight >= scrollable.scrollHeight - 3
				if (reachedBottom && stagnantCount >= 1) break
			}

			const finalDomMatch = findCascaderOptionInLevelDom(text, levelIndex)
			if (finalDomMatch) {
				await bringCascaderOptionIntoView(finalDomMatch, inputMode)
				return findCascaderOptionInLevel(text, levelIndex) || finalDomMatch
			}
			return findCascaderOptionInLevel(text, levelIndex)
		}

		async function findCascaderOptionByCompactTarget(targetText, levelIndex, inputMode) {
			const expected = normalizeComparableText(targetText)
			if (!expected) return null
			const menu = await waitForCascaderMenuLevel(levelIndex, inputMode)
			if (!menu) return null
			const immediateExact = findCascaderOptionInLevel(targetText, levelIndex)
			if (immediateExact && normalizeComparableText(getVisibleOptionLabel(immediateExact)) === expected) {
				return {
					option: immediateExact,
					label: getVisibleOptionLabel(immediateExact),
					consumedKey: expected,
				}
			}

			const deadline = Date.now() + 4200
			let lastSignature = ''
			let stagnantCount = 0
			let resetDone = false

			while (Date.now() <= deadline) {
				const immediate = findCompactCascaderOptionInLevel(targetText, levelIndex)
				if (immediate) return immediate

				const currentMenu = getVisibleCascaderMenu(levelIndex)
				if (!currentMenu) {
					await waitForCascaderMenuLevel(levelIndex, inputMode)
					continue
				}
				const scrollable = findVerticalScrollable(currentMenu, false)
				if (!scrollable) {
					await sleep(120)
					continue
				}
				if (!resetDone) {
					scrollable.scrollTop = 0
					scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
					resetDone = true
					await sleep(inputMode === 'realistic' ? randomBetween(120, 200) : 100)
					const afterReset = findCompactCascaderOptionInLevel(targetText, levelIndex)
					if (afterReset) return afterReset
				}

				const beforeTop = Number(scrollable.scrollTop || 0)
				const signature = getVisibleMenuSignature(scrollable)
				if (signature === lastSignature) stagnantCount += 1
				else stagnantCount = 0
				lastSignature = signature

				const step = Math.max(120, Math.min(320, scrollable.clientHeight * 0.82 || 220))
				scrollable.scrollTop = beforeTop + step
				scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
				await sleep(inputMode === 'realistic' ? randomBetween(180, 280) : 160)

				const afterScroll = findCompactCascaderOptionInLevel(targetText, levelIndex)
				if (afterScroll) return afterScroll

				const afterTop = Number(scrollable.scrollTop || 0)
				const reachedBottom = afterTop <= beforeTop + 2 || afterTop + scrollable.clientHeight >= scrollable.scrollHeight - 3
				if (reachedBottom && stagnantCount >= 1) break
			}

			return findCompactCascaderOptionInLevel(targetText, levelIndex)
		}

		async function waitForCascaderMenuLevel(levelIndex, inputMode) {
			const index = Math.max(0, Number(levelIndex) || 0)
			const timeoutMs = index === 0 ? 900 : 1800
			const deadline = Date.now() + timeoutMs
			while (Date.now() <= deadline) {
				const menu = getVisibleCascaderMenu(index)
				if (menu) return menu
				if (typeof pulseSustainedHover === 'function') pulseSustainedHover()
				await sleep(inputMode === 'realistic' ? 90 : 70)
			}
			return getVisibleCascaderMenu(index)
		}

		function findCascaderOptionInLevel(text, levelIndex) {
			const expected = normalizeComparableText(text)
			const menu = getVisibleCascaderMenu(levelIndex)
			if (!menu && Number(levelIndex) > 0) return null
			const scopes = menu ? [menu] : [document]
			for (const scope of scopes) {
				const candidates = Array.from(scope.querySelectorAll(getCascaderOptionSelector()))
					.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node))
					.filter((node) => {
						const cls = String(node.className || '')
						const path = getElementClassPath(node)
						return /cascader|menu|dropdown|popper|select/i.test(`${cls} ${path}`)
					})
					.filter((node) => {
						const label = normalizeComparableText(getVisibleOptionLabel(node))
						return label === expected || label.includes(expected)
					})
				const found = candidates.sort(compareOptionCandidate(text))[0]
				if (found) return found
			}
			return null
		}

		function findCascaderOptionInLevelDom(text, levelIndex) {
			const expected = normalizeComparableText(text)
			if (!expected) return null
			const menu = getVisibleCascaderMenu(levelIndex)
			if (!menu && Number(levelIndex) > 0) return null
			const scopes = menu ? [menu] : getVisibleCascaderMenus()
			const searchScopes = scopes.length ? scopes : [document]
			for (const scope of searchScopes) {
				if (!(scope instanceof HTMLElement) && scope !== document) continue
				const candidates = Array.from(scope.querySelectorAll(getCascaderOptionSelector()))
					.filter((node) => node instanceof HTMLElement && isDomVisibleInActivePopup(node))
					.filter((node) => {
						const cls = String(node.className || '')
						const path = getElementClassPath(node)
						return /cascader|menu|dropdown|popper|select/i.test(`${cls} ${path}`)
					})
					.filter((node) => {
						const label = normalizeComparableText(getVisibleOptionLabel(node))
						return label === expected || label.includes(expected)
					})
				const found = candidates.sort(compareOptionCandidate(text))[0]
				if (found) return found
			}
			return null
		}

		async function bringCascaderOptionIntoView(option, inputMode) {
			if (!(option instanceof HTMLElement)) return
			const menu = option.closest?.(
				'.el-cascader-menu,.ant-cascader-menu,.arco-cascader-panel-column,.n-cascader-menu,[class*="cascader-menu"],[class*="cascader-panel"]'
			)
			const scrollable = findVerticalScrollable(menu, false) || findVerticalScrollable(option.parentElement, false)
			if (scrollable) {
				const before = Number(scrollable.scrollTop || 0)
				const scrollRect = scrollable.getBoundingClientRect()
				const optionRect = option.getBoundingClientRect()
				const offset = optionRect.top - scrollRect.top - scrollable.clientHeight / 2 + optionRect.height / 2
				scrollable.scrollTop = before + offset
				scrollable.dispatchEvent(new Event('scroll', { bubbles: true }))
			}
			try {
				option.scrollIntoView({ block: 'center', inline: 'nearest' })
			} catch (_) {
				option.scrollIntoView()
			}
			await sleep(inputMode === 'realistic' ? randomBetween(120, 220) : 100)
		}

		function isDomVisibleInActivePopup(element) {
			if (!(element instanceof HTMLElement)) return false
			const style = window.getComputedStyle(element)
			if (style.display === 'none' || style.visibility === 'hidden') return false
			const popup = element.closest?.(
				'.el-cascader__dropdown,.el-popper,.ant-cascader-dropdown,.arco-trigger-popup,.n-cascader-menu-wrapper,[class*="cascader"][class*="dropdown"],[class*="popper"]'
			)
			if (popup instanceof HTMLElement) {
				const popupStyle = window.getComputedStyle(popup)
				return popupStyle.display !== 'none' && popupStyle.visibility !== 'hidden'
			}
			const menu = element.closest?.(
				'.el-cascader-menu,.ant-cascader-menu,.arco-cascader-panel-column,.n-cascader-menu,[class*="cascader-menu"],[class*="cascader-panel"]'
			)
			if (menu instanceof HTMLElement) {
				const menuStyle = window.getComputedStyle(menu)
				return menuStyle.display !== 'none' && menuStyle.visibility !== 'hidden'
			}
			return isVisibleClickTarget(element)
		}

		function getVisibleCascaderMenu(levelIndex) {
			const menus = getVisibleCascaderMenus()
			if (!menus.length) return null
			const index = Math.max(0, Number(levelIndex) || 0)
			return menus[index] || null
		}

		function summarizeCascaderLevel(levelIndex) {
			const labels = listCascaderLevelLabels(levelIndex, 12)
			if (!labels.length && !getVisibleCascaderMenu(levelIndex)) {
				return ` 当前可见级联菜单列数: ${getVisibleCascaderMenus().length}。`
			}
			return labels.length ? ` 当前第 ${Number(levelIndex) + 1} 级可见项: ${labels.join('、')}。` : ''
		}

		function listCascaderLevelLabels(levelIndex, limit = 12) {
			const menu = getVisibleCascaderMenu(levelIndex)
			if (!menu) return []
			return getVisibleCascaderLabels(menu).slice(0, Math.max(1, Number(limit) || 12))
		}

		function getVisibleCascaderLabels(menu) {
			if (!(menu instanceof HTMLElement)) return []
			const seen = new Set()
			const labels = []
			for (const node of Array.from(menu.querySelectorAll(getCascaderOptionSelector()))) {
				if (!(node instanceof HTMLElement) || !isVisibleClickTarget(node)) continue
				const label = String(getVisibleOptionLabel(node) || '').trim()
				const normalized = normalizeComparableText(label)
				if (!normalized || seen.has(normalized)) continue
				seen.add(normalized)
				labels.push(label)
			}
			return labels
		}

		function findCompactCascaderOptionInLevel(targetText, levelIndex) {
			const target = normalizeComparableText(targetText)
			if (!target) return null
			const menu = getVisibleCascaderMenu(levelIndex)
			if (!menu && Number(levelIndex) > 0) return null
			const scopes = menu ? [menu] : getVisibleCascaderMenus()
			const matches = []
			for (const scope of scopes.length ? scopes : [document]) {
				const candidates = Array.from(scope.querySelectorAll(getCascaderOptionSelector()))
					.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node))
					.filter((node) => {
						const cls = String(node.className || '')
						const path = getElementClassPath(node)
						return /cascader|menu|dropdown|popper|select/i.test(`${cls} ${path}`)
					})
				for (const node of candidates) {
					const label = getVisibleOptionLabel(node)
					const match = scoreCompactCascaderOption(label, target)
					if (match) matches.push({ node, label, ...match })
				}
			}
			if (!matches.length) return null
			matches.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score
				const byCandidate = compareOptionCandidate(targetText)(a.node, b.node)
				if (byCandidate) return byCandidate
				const ar = a.node.getBoundingClientRect()
				const br = b.node.getBoundingClientRect()
				return ar.left - br.left || ar.top - br.top
			})
			const found = matches[0]
			const runnerUp = matches[1]
			if (runnerUp && isAmbiguousCompactCascaderMatch(found, runnerUp)) return null
			return found ? { option: found.node, label: found.label, consumedKey: found.consumedKey } : null
		}

		function isAmbiguousCompactCascaderMatch(a, b) {
			if (!a || !b) return false
			return Number(a.score) === Number(b.score) &&
				normalizeComparableText(a.consumedKey) === normalizeComparableText(b.consumedKey)
		}

		function scoreCompactCascaderOption(label, normalizedTarget) {
			const candidate = normalizeComparableText(label)
			const target = String(normalizedTarget || '')
			if (!candidate || !target) return null
			if (candidate === target) return { score: 1000 + candidate.length, consumedKey: target }
			if (target.startsWith(candidate) && candidate.length >= 2) return { score: 900 + candidate.length, consumedKey: candidate }
			if (candidate.startsWith(target) && target.length >= Math.min(2, candidate.length)) {
				return { score: 760 + target.length, consumedKey: target }
			}
			const prefixLength = getCommonPrefixLength(candidate, target)
			const minimumPrefix = Math.min(2, candidate.length, target.length)
			if (prefixLength >= minimumPrefix && prefixLength >= 2 && candidate.length <= 4 && target.length > prefixLength) {
				return { score: 620 + prefixLength * 10 - Math.max(0, candidate.length - prefixLength), consumedKey: target.slice(0, prefixLength) }
			}
			return null
		}

		function getCommonPrefixLength(a, b) {
			const left = String(a || '')
			const right = String(b || '')
			let index = 0
			while (index < left.length && index < right.length && left[index] === right[index]) index += 1
			return index
		}

		function getVisibleCascaderMenus() {
			const selectors = [
				'.el-cascader-menu',
				'.ant-cascader-menu',
				'.arco-cascader-panel-column',
				'.n-cascader-menu',
				'[class*="cascader-menu"]',
				'[class*="cascader-panel"] ul',
			].join(',')
			return Array.from(document.querySelectorAll(selectors))
				.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node))
				.filter((node) => {
					const text = normalizeComparableText(node.innerText || node.textContent || '')
					return text.length > 0 && text.length < 3000
				})
				.filter((node, _index, list) => !list.some((other) =>
					other !== node &&
					other instanceof HTMLElement &&
					other.contains(node) &&
					isSameCascaderMenuColumn(other, node)
				))
				.sort((a, b) => {
					const ar = a.getBoundingClientRect()
					const br = b.getBoundingClientRect()
					return ar.left - br.left || ar.top - br.top
				})
		}

		function isSameCascaderMenuColumn(a, b) {
			if (!(a instanceof HTMLElement) || !(b instanceof HTMLElement)) return false
			const ar = a.getBoundingClientRect()
			const br = b.getBoundingClientRect()
			const leftDelta = Math.abs(ar.left - br.left)
			const widthDelta = Math.abs(ar.width - br.width)
			return leftDelta <= 3 && widthDelta <= Math.max(8, ar.width * 0.08)
		}

		function findVerticalScrollable(element, allowGlobal = true) {
			let cursor = element instanceof HTMLElement ? element : null
			const descendants = cursor ? Array.from(cursor.querySelectorAll('*')) : []
			const candidates = [cursor, ...descendants].filter((node) => node instanceof HTMLElement)
			for (const node of candidates) {
				if (node.scrollHeight > node.clientHeight + 8 && isVisibleClickTarget(node)) return node
			}
			if (!allowGlobal) return null
			const globalCandidates = Array.from(
				document.querySelectorAll(
					'.el-scrollbar__wrap,.el-cascader-menu__wrap,.ant-cascader-menu,.arco-scrollbar,.n-scrollbar-container,[class*="scrollbar"],[class*="cascader"]'
				)
			)
			return (
				globalCandidates.find(
					(node) =>
						node instanceof HTMLElement &&
						node.scrollHeight > node.clientHeight + 8 &&
						isVisibleClickTarget(node)
				) || null
			)
		}

		function getVisibleMenuSignature(element) {
			if (!(element instanceof HTMLElement)) return ''
			return Array.from(element.querySelectorAll('.el-cascader-node,.ant-cascader-menu-item,.arco-cascader-option,.n-cascader-option,li'))
				.filter((node) => node instanceof HTMLElement && isVisibleClickTarget(node))
				.slice(0, 8)
				.map((node) => normalizeComparableText(node.innerText || node.textContent || ''))
				.join('|')
		}

		function getCascaderLevelSignature(levelIndex) {
			const menu = getVisibleCascaderMenu(levelIndex)
			return menu ? getVisibleMenuSignature(menu) : ''
		}

		function getElementClassPath(element) {
			const parts = []
			let cursor = element
			while (cursor instanceof HTMLElement && cursor !== document.body && parts.length < 5) {
				parts.push(String(cursor.className || ''))
				cursor = cursor.parentElement
			}
			return parts.join(' ')
		}

		function getCascaderOptionSelector() {
			return [
				'.el-cascader-node',
				'.ant-cascader-menu-item',
				'.arco-cascader-option',
				'.n-cascader-option',
				'[class*="cascader"][role="option"]',
				'[class*="cascader"] [role="option"]',
				'[role="menuitem"]',
				'li',
			].join(',')
		}

		return {
			bringCascaderOptionIntoView,
			findCascaderOptionByCompactTarget,
			findCascaderOptionByScrolling,
			findVerticalScrollable,
			getCascaderLevelSignature,
			isDomVisibleInActivePopup,
			listCascaderLevelLabels,
			summarizeCascaderLevel,
			waitForCascaderMenuLevel,
		}
	}

	g.NC_CONTENT_ACTION_CASCADER = { createCascaderHelpers }
})(window)
