export interface AtlasFingerprint {
  url: string;
  bodyTextLengthBucket: number;
  interactiveCountBucket: number;
  topSectionCount: number;
}

export interface AtlasControl {
  id: string;
  frameId: number;
  handle: string;
  role: string;
  label: string;
  value?: string;
  expanded?: boolean;
  disabled?: boolean;
  focused?: boolean;
}

export interface AtlasForm {
  id: string;
  frameId: number;
  label: string;
  fields: string[];
  submitControlId?: string;
}

export interface AtlasTarget {
  id: string;
  frameId: number;
  type: "table" | "collection" | "region" | "detail_region";
  label: string;
  confidence: "high" | "medium" | "low";
  summary: string;
  visibleCount?: number;
  estimatedTotal?: number;
}

export interface PageAtlas {
  atlasId: string;
  tabId: number;
  url: string;
  title: string;
  fingerprint: AtlasFingerprint;
  controls: AtlasControl[];
  forms: AtlasForm[];
  targets: AtlasTarget[];
}

export function renderPageAtlas(atlas: PageAtlas): string {
  const controls = atlas.controls.map(
    (control) =>
      `    <control id="${xml(control.id)}" frame_id="${control.frameId}" handle="${xml(control.handle)}" role="${xml(control.role)}" label="${xml(control.label)}"${control.value !== undefined ? ` value="${xml(control.value)}"` : ""}${control.expanded !== undefined ? ` expanded="${control.expanded}"` : ""}${control.disabled ? ` disabled="true"` : ""}${control.focused ? ` focused="true"` : ""} />`
  );
  const forms = atlas.forms.map(
    (form) =>
      `    <form id="${xml(form.id)}" frame_id="${form.frameId}" label="${xml(form.label)}" fields="${xml(form.fields.join(","))}"${form.submitControlId ? ` submit_control_id="${xml(form.submitControlId)}"` : ""} />`
  );
  const targets = atlas.targets.map(
    (target) =>
      `    <target target_id="${xml(target.id)}" frame_id="${target.frameId}" type="${target.type}" label="${xml(target.label)}" confidence="${target.confidence}"${target.visibleCount !== undefined ? ` visible_count="${target.visibleCount}"` : ""}${target.estimatedTotal !== undefined ? ` estimated_total="${target.estimatedTotal}"` : ""}><summary>${xml(target.summary)}</summary></target>`
  );
  return [
    `<page_atlas atlas_id="${xml(atlas.atlasId)}" tab_id="${atlas.tabId}" url="${xml(atlas.url)}" title="${xml(atlas.title)}">`,
    `  <fingerprint body_text_bucket="${atlas.fingerprint.bodyTextLengthBucket}" interactive_bucket="${atlas.fingerprint.interactiveCountBucket}" top_sections="${atlas.fingerprint.topSectionCount}" />`,
    "  <action_surfaces>",
    ...controls,
    "  </action_surfaces>",
    "  <forms>",
    ...forms,
    "  </forms>",
    "  <data_surfaces>",
    ...targets,
    "  </data_surfaces>",
    "</page_atlas>"
  ].join("\n");
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}
