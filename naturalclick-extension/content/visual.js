;(function (g) {
	function createVisualRuntime() {
		const HOST_ID = 'naturalclick-visual-host'
		const STYLE_ID = 'naturalclick-visual-style'
		const COLORS = [
			'#f97316',
			'#06b6d4',
			'#84cc16',
			'#ec4899',
			'#8b5cf6',
			'#ef4444',
			'#0ea5e9',
			'#14b8a6',
		]

		/** @type {HTMLDivElement | null} */
		let host = null
		/** @type {HTMLDivElement | null} */
		let cursor = null
		/** @type {Array<any>} */
		let overlays = []
		let listening = false
		let rafId = 0
		let cursorHideTimer = 0
		let captureHideDepth = 0
		let hostVisibilityBeforeCapture = ''

		function ensureHost() {
			if (host && document.body.contains(host)) return host
			injectStyle()
			host = document.createElement('div')
			host.id = HOST_ID
			host.setAttribute('data-naturalclick-ignore', 'true')
			host.style.position = 'fixed'
			host.style.inset = '0'
			host.style.pointerEvents = 'none'
			host.style.zIndex = '2147483640'
			document.documentElement.appendChild(host)
			ensureCursor()
			return host
		}

		function injectStyle() {
			if (document.getElementById(STYLE_ID)) return
			const style = document.createElement('style')
			style.id = STYLE_ID
			style.textContent = `
				#${HOST_ID} .nc-index-box{
					position:fixed;
					pointer-events:none;
					box-sizing:border-box;
					border:1px solid color-mix(in srgb, var(--nc-color) 82%, transparent);
					background: color-mix(in srgb, var(--nc-color) 5%, transparent);
					border-radius:5px;
					box-shadow: 0 0 0 1px color-mix(in srgb, var(--nc-color) 14%, transparent);
				}
				#${HOST_ID} .nc-index-label{
					position:fixed;
					pointer-events:none;
					padding:0 5px;
					border-radius:999px;
					font:600 10px/1.25 "SF Mono",Consolas,monospace;
					color:#fff;
					background: var(--nc-color);
					opacity:.88;
					box-shadow:0 1px 4px color-mix(in srgb, var(--nc-color) 24%, transparent);
				}
				#${HOST_ID} .nc-action-box{
					position:fixed;
					pointer-events:none;
					box-sizing:border-box;
					border:1px solid rgba(16,185,129,.7);
					border-radius:7px;
					box-shadow:0 0 0 1px rgba(16,185,129,.1);
					animation:ncActionPulse .34s ease-out forwards;
				}
				@keyframes ncActionPulse{
					0%{opacity:0;transform:scale(.996)}
					20%{opacity:1}
					100%{opacity:0;transform:scale(1.006)}
				}
				#${HOST_ID} .nc-cursor{
					position:fixed;
					left:0;top:0;
					width:20px;
					height:24px;
					margin-left:-2px;
					margin-top:-2px;
					transform-origin:3px 3px;
					filter: drop-shadow(0 1px 4px rgba(15,23,42,.22));
					transition: opacity .04s linear;
					opacity:0;
				}
				#${HOST_ID} .nc-cursor::before{
					content:"";
					position:absolute;
					inset:0;
					border-radius:3px;
					background:#ffffff;
					clip-path: polygon(0 0, 0 100%, 32% 72%, 47% 100%, 61% 93%, 44% 66%, 100% 66%);
					box-shadow: inset 0 0 0 1.4px #17212b;
				}
				#${HOST_ID} .nc-cursor.show{opacity:1}
				#${HOST_ID} .nc-cursor.click{
					animation:ncCursorClick .12s ease-out forwards;
				}
				@keyframes ncCursorClick{
					0%{transform:scale(.96)}
					100%{transform:scale(.82)}
				}
			`
			document.documentElement.appendChild(style)
		}

		function ensureCursor() {
			if (!host) return
			if (cursor && host.contains(cursor)) return
			cursor = document.createElement('div')
			cursor.className = 'nc-cursor'
			cursor.setAttribute('data-naturalclick-ignore', 'true')
			host.appendChild(cursor)
		}

		function renderIndexHighlights(indexedElements) {
			ensureHost()
			clearIndexHighlights()
			if (!Array.isArray(indexedElements) || !indexedElements.length) {
				unbindListeners()
				return
			}

			const limit = Math.min(90, indexedElements.length)
			for (let i = 0; i < limit; i++) {
				const row = indexedElements[i]
				const element = row?.element
				const index = Number(row?.index)
				if (!(element instanceof HTMLElement) || !Number.isFinite(index)) continue

				const color = COLORS[index % COLORS.length]
				const boxes = []
				const rects = Array.from(element.getClientRects())
				for (const rect of rects) {
					if (rect.width < 2 || rect.height < 2) continue
					const box = document.createElement('div')
					box.className = 'nc-index-box'
					box.style.setProperty('--nc-color', color)
					placeBox(box, rect)
					host.appendChild(box)
					boxes.push(box)
				}
				if (!boxes.length) continue

				const label = document.createElement('div')
				label.className = 'nc-index-label'
				label.style.setProperty('--nc-color', color)
				label.textContent = String(index)
				host.appendChild(label)

				overlays.push({ element, boxes, label })
			}

			updateOverlayPositions()
			bindListeners()
		}

		function clearIndexHighlights() {
			for (const item of overlays) {
				item.boxes?.forEach((box) => box.remove())
				item.label?.remove()
			}
			overlays = []
		}

		function setCaptureHidden(hidden) {
			if (!host || !document.documentElement.contains(host)) {
				return { success: true, hidden: false }
			}
			if (hidden) {
				captureHideDepth += 1
				if (captureHideDepth === 1) {
					hostVisibilityBeforeCapture = host.style.visibility || ''
					host.style.visibility = 'hidden'
				}
				return { success: true, hidden: true }
			}
			if (captureHideDepth > 0) captureHideDepth -= 1
			if (captureHideDepth === 0) {
				host.style.visibility = hostVisibilityBeforeCapture
				hostVisibilityBeforeCapture = ''
			}
			return { success: true, hidden: captureHideDepth > 0 }
		}

		function updateOverlayPositions() {
			if (!overlays.length) return
			for (const row of overlays) {
				const element = row.element
				if (!(element instanceof HTMLElement) || !element.isConnected) {
					row.boxes.forEach((box) => (box.style.display = 'none'))
					if (row.label) row.label.style.display = 'none'
					continue
				}
				const rects = Array.from(element.getClientRects())
				row.boxes.forEach((box, i) => {
					const rect = rects[i]
					if (!rect || rect.width < 2 || rect.height < 2) {
						box.style.display = 'none'
						return
					}
					box.style.display = 'block'
					placeBox(box, rect)
				})
				const firstRect = rects[0]
				if (row.label && firstRect) {
					row.label.style.display = 'block'
					placeLabel(row.label, firstRect)
				} else if (row.label) {
					row.label.style.display = 'none'
				}
			}
		}

		function bindListeners() {
			if (listening) return
			listening = true
			window.addEventListener('scroll', onViewportChange, true)
			window.addEventListener('resize', onViewportChange)
		}

		function unbindListeners() {
			if (!listening) return
			listening = false
			window.removeEventListener('scroll', onViewportChange, true)
			window.removeEventListener('resize', onViewportChange)
		}

		function onViewportChange() {
			if (rafId) return
			rafId = requestAnimationFrame(() => {
				rafId = 0
				updateOverlayPositions()
			})
		}

		async function movePointerTo(xRaw, yRaw, opts) {
			ensureHost()
			if (!cursor) return
			const x = clamp(Number(xRaw), 0, window.innerWidth)
			const y = clamp(Number(yRaw), 0, window.innerHeight)
			const waitMs = Math.max(0, Number(opts?.waitMs) || 120)
			cursor.style.left = `${x}px`
			cursor.style.top = `${y}px`
			await sleep(waitMs)
		}

		async function clickPointer(opts) {
			ensureHost()
			if (!cursor) return
			const waitMs = Math.max(0, Number(opts?.waitMs) || 120)
			cursor.classList.remove('click')
			void cursor.offsetHeight
			cursor.classList.add('show')
			cursor.classList.add('click')
			scheduleCursorHide(70)
			await sleep(waitMs)
		}

		function scheduleCursorHide(delayMs) {
			if (!cursor) return
			if (cursorHideTimer) {
				clearTimeout(cursorHideTimer)
				cursorHideTimer = 0
			}
			cursorHideTimer = setTimeout(() => {
				cursorHideTimer = 0
				if (!cursor) return
				cursor.classList.remove('show')
			}, Math.max(40, Number(delayMs) || 0))
		}

		function markActionTarget(element) {
			if (!(element instanceof HTMLElement)) return
			ensureHost()
			const rect = element.getBoundingClientRect()
			if (rect.width < 2 || rect.height < 2) return
			const box = document.createElement('div')
			box.className = 'nc-action-box'
			placeBox(box, rect, 3)
			host.appendChild(box)
			setTimeout(() => box.remove(), 380)
		}

		function placeBox(node, rect, padding = 1) {
			node.style.top = `${Math.max(0, rect.top - padding)}px`
			node.style.left = `${Math.max(0, rect.left - padding)}px`
			node.style.width = `${Math.max(0, rect.width + padding * 2)}px`
			node.style.height = `${Math.max(0, rect.height + padding * 2)}px`
		}

		function placeLabel(label, rect) {
			const width = label.offsetWidth || 26
			const height = label.offsetHeight || 16
			let top = rect.top + 2
			let left = rect.left + rect.width - width - 2
			if (rect.width < width + 4 || rect.height < height + 4) {
				top = rect.top - height - 2
				left = rect.left
			}
			top = Math.max(0, Math.min(top, window.innerHeight - height))
			left = Math.max(0, Math.min(left, window.innerWidth - width))
			label.style.top = `${top}px`
			label.style.left = `${left}px`
		}

		function dispose() {
			clearIndexHighlights()
			unbindListeners()
			if (cursorHideTimer) {
				clearTimeout(cursorHideTimer)
				cursorHideTimer = 0
			}
			if (cursor) cursor.remove()
			cursor = null
			if (host) host.remove()
			host = null
			captureHideDepth = 0
			hostVisibilityBeforeCapture = ''
		}

		return {
			renderIndexHighlights,
			clearIndexHighlights,
			setCaptureHidden,
			movePointerTo,
			clickPointer,
			markActionTarget,
			dispose,
		}
	}

	function clamp(v, min, max) {
		if (!Number.isFinite(v)) return min
		return Math.max(min, Math.min(max, v))
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
	}

	g.NC_CONTENT_VISUAL = {
		createVisualRuntime,
	}
})(window)
