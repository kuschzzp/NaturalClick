const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

root.innerHTML = `
  <section class="nc-shell">
    <header class="nc-topbar">
      <strong>NaturalClick</strong>
      <span>Idle · balanced</span>
    </header>
    <section class="nc-timeline" aria-live="polite">
      <article class="nc-card">
        <h1>Need model configuration before starting</h1>
        <p>Planner model is required for task understanding and next-action decisions.</p>
        <button type="button">Open model settings</button>
      </article>
    </section>
    <form class="nc-composer">
      <label>
        <span>Task</span>
        <textarea placeholder="Ask the Agent to operate the current page..."></textarea>
      </label>
      <button type="submit">Send</button>
    </form>
  </section>
`;
