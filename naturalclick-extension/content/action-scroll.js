;(function (g) {
	function createScrollActions({ observer, createOutcome, OUTCOME_KIND, sleep }) {
		if (!observer) throw new Error('action-scroll 缺少 observer。')

		async function scrollAction(input) {
			input = input || {}
			const down = input.down !== false
			const hasIndex = hasExplicitInputValue(input.index)
			const index = hasIndex ? Number(input.index) : null
			if (hasIndex && !Number.isFinite(index)) {
				return { success: false, message: `滚动容器索引无效：${input.index}` }
			}
			const pixels =
				typeof input.pixels === 'number'
					? input.pixels
					: window.innerHeight * (typeof input.num_pages === 'number' ? input.num_pages : 0.8)
			const delta = Math.abs(Number(pixels || 0)) * (down ? 1 : -1)
			if (!delta) return { success: false, message: '滚动距离为 0，未执行滚动。' }
			if (hasIndex) {
				const target = observer.getElementByIndex(index)
				if (!target) return { success: false, message: `索引 ${index} 不存在。` }
				const scrollable = findVerticalScrollable(target, false)
				if (!scrollable) {
					return { success: false, message: `索引 ${index} 对应元素没有可纵向滚动容器。` }
				}
				return performScroll({
					target: scrollable,
					axis: 'y',
					delta,
					successMessage: (moved) => `已滚动容器索引 ${index}：实际移动 ${moved}px。`,
					noMoveMessage: `容器索引 ${index} 未发生纵向滚动，可能已到边界或不是可滚动区域。`,
				})
			}
			return performScroll({
				target: window,
				axis: 'y',
				delta,
				successMessage: (moved) => `已滚动页面：实际移动 ${moved}px。`,
				noMoveMessage: '页面未发生纵向滚动，可能已到顶部/底部或页面没有可滚动区域。',
			})
		}

		async function scrollHorizontalAction(input) {
			input = input || {}
			const right = input.right !== false
			const hasIndex = hasExplicitInputValue(input.index)
			const index = hasIndex ? Number(input.index) : null
			if (hasIndex && !Number.isFinite(index)) {
				return { success: false, message: `横向滚动容器索引无效：${input.index}` }
			}
			const pixels =
				typeof input.pixels === 'number'
					? input.pixels
					: window.innerWidth * (typeof input.num_pages === 'number' ? input.num_pages : 0.65)
			const delta = Math.abs(Number(pixels || 0)) * (right ? 1 : -1)
			if (!delta) return { success: false, message: '横向滚动距离为 0，未执行滚动。' }
			if (hasIndex) {
				const target = observer.getElementByIndex(index)
				if (!target) return { success: false, message: `索引 ${index} 不存在。` }
				const scrollable = findHorizontalScrollable(target)
				if (!scrollable) {
					return { success: false, message: `索引 ${index} 对应元素没有可横向滚动容器。` }
				}
				return performScroll({
					target: scrollable,
					axis: 'x',
					delta,
					successMessage: (moved) => `已横向滚动容器索引 ${index}：实际移动 ${moved}px。`,
					noMoveMessage: `容器索引 ${index} 未发生横向滚动，可能已到边界或不是可滚动区域。`,
				})
			}
			return performScroll({
				target: window,
				axis: 'x',
				delta,
				successMessage: (moved) => `已横向滚动页面：实际移动 ${moved}px。`,
				noMoveMessage: '页面未发生横向滚动，可能已到左/右边界或页面没有横向可滚动区域。',
			})
		}

		async function performScroll(options) {
			const target = options?.target
			const axis = options?.axis
			const delta = options?.delta
			const successMessage = options?.successMessage
			const noMoveMessage = options?.noMoveMessage
			const before = getScrollPosition(target, axis)
			if (target === window) {
				window.scrollBy(axis === 'x' ? { left: delta, behavior: 'auto' } : { top: delta, behavior: 'auto' })
			} else if (axis === 'x') {
				target.scrollBy({ left: delta, behavior: 'auto' })
			} else {
				target.scrollBy({ top: delta, behavior: 'auto' })
			}
			await sleep(90)
			const after = getScrollPosition(target, axis)
			const moved = Math.round(after - before)
			if (!moved) return { success: false, message: noMoveMessage }
			return {
				success: true,
				message: successMessage(moved),
				meta: { outcome: createOutcome(OUTCOME_KIND.SCROLLED, { moved }) },
			}
		}

		function findVerticalScrollable(element, allowGlobal = true) {
			const cursor = element instanceof HTMLElement ? element : null
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

		function findHorizontalScrollable(element) {
			let cursor = element instanceof HTMLElement ? element : null
			while (cursor && cursor !== document.body) {
				if (cursor.scrollWidth > cursor.clientWidth + 4) return cursor
				cursor = cursor.parentElement
			}
			const all = Array.from(document.querySelectorAll('div,section,main,table'))
			return all.find(
				(node) =>
					node instanceof HTMLElement &&
					node.scrollWidth > node.clientWidth + 12 &&
					isVisibleClickTarget(node)
			)
		}

		function getScrollPosition(target, axis) {
			if (target === window) {
				return axis === 'x' ? window.scrollX : window.scrollY
			}
			if (!(target instanceof HTMLElement)) return 0
			return axis === 'x' ? target.scrollLeft : target.scrollTop
		}

		function isVisibleClickTarget(element) {
			const rect = element.getBoundingClientRect()
			const style = window.getComputedStyle(element)
			return rect.width >= 2 && rect.height >= 2 && style.visibility !== 'hidden' && style.display !== 'none'
		}

		function hasExplicitInputValue(value) {
			return value !== undefined && value !== null && value !== ''
		}

		return {
			scrollAction,
			scrollHorizontalAction,
		}
	}

	g.NC_CONTENT_ACTION_SCROLL = { createScrollActions }
})(window)
