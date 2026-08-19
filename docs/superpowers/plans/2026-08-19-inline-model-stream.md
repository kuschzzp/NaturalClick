# Inline Model Stream Implementation Plan

1. Add focused tests for accumulated model progress and inline Execution details rendering.
2. Buffer model stream chunks in the background and emit bounded accumulated progress events.
3. Extend the model stream projection with completion/tool-call metadata.
4. Render the stream under the active model-call step with stable scrolling and reduced-motion-safe cursor feedback.
5. Preserve stream scroll position across sidepanel rerenders and auto-open only during active streaming.
6. Raise the version to `0.1.198`, run all unit tests, build the extension, and scan the UI files.
