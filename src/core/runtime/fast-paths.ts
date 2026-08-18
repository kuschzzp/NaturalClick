import type { SemanticCommand } from "../commands/commands";
import type { ControlCandidate, FormSnapshot } from "../observation/page-model";
import { createEventId } from "../../shared/ids";
import { commandActionKey } from "./action-key";

export interface FastPathInput {
  taskText: string;
  pageUrl: string;
  controls: ControlCandidate[];
  forms?: FormSnapshot[];
  actionMemory: unknown[];
}

export interface FastPathDecision {
  source:
    | "explicit_url"
    | "explicit_new_tab_url"
    | "web_search"
    | "exact_visible_search_form"
    | "single_search_field_enter"
    | "exact_visible_submit_control"
    | "exact_visible_select"
    | "exact_visible_state_control"
    | "exact_visible_expansion_control"
    | "visible_tab_control"
    | "explicit_read_content"
    | "visible_dismiss_control"
    | "focused_field_clear"
    | "exact_visible_field_clear"
    | "exact_visible_field_enter"
    | "exact_visible_field"
    | "focused_text_entry_enter"
    | "focused_text_entry"
    | "browser_navigation"
    | "visible_refresh_control"
    | "visible_pagination_control"
    | "explicit_key_press"
    | "explicit_scroll"
    | "explicit_wait"
    | "exact_visible_control"
    | "semantic_navigation_control";
  command: SemanticCommand;
  commands?: SemanticCommand[];
  reasoningSummary: string;
}

interface ActionMemoryLike {
  commandType?: unknown;
  targetGoal?: unknown;
  targetRef?: unknown;
  status?: unknown;
  verificationStatus?: unknown;
}

const clickableRoles = new Set(["button", "link", "menuitem", "tab", "listitem", "treeitem"]);
const navigationRoles = new Set(["link", "menuitem", "tab", "listitem", "treeitem"]);
const fieldRoles = new Set(["textbox", "searchbox"]);
const stateControlRoles = new Set(["checkbox", "radio", "switch"]);
const actionIntentPattern = /(?:点击|点开|打开|进入|选择|\bclick\b|\bselect\b)/iu;
const urlNavigationIntentPattern = /(?:打开|进入|访问|浏览|\bopen\b|\bvisit\b|\bbrowse\b|\bgo\s+to\b)/iu;
const newTabIntentPattern = /(?:新标签页|新标签|新的标签页|新的标签|\bnew\s+tab\b)/iu;
const localSearchContextPattern = /(?:当前页|页面内|本页|站内|这个页面|列表|表格|输入框|搜索框|筛选|过滤|\bwithin\s+(?:this\s+)?page\b|\bon\s+this\s+page\b|\bfilter\b|\bsite\s+search\b)/iu;
const negativeIntentPattern =
  /(?:不要|别|无需|不需要)[^。；,.，!?！？]{0,32}(?:点击|点开|打开|进入|选择|选中|填写|填入|键入|输入|录入|设置|切换|修改)|\b(?:do\s+not|don't|dont|without)\s+(?:click|select|choose|type|enter|input|fill|set|change|switch)\b/iu;
const sensitiveFieldPattern = /(?:密码|口令|验证码|动态码|支付|银行卡|password|passcode|otp|token|secret|card|cvv)/iu;
const navigationHintPattern = /(?:menu|submenu|sub-menu|nav|navigation|sidebar|side-menu|tab|dropdown|菜单|导航|侧边栏)/iu;
const destructiveLabelPattern = /(?:删除|移除|清空|注销|退出|delete|remove|clear|logout|sign\s*out)/iu;
const searchFieldPattern = /(?:搜索|查询|查找|检索|筛选|过滤|关键字|关键词|search|query|find|filter)/iu;
const searchSubmitPattern = /(?:搜索|查询|查找|检索|筛选|过滤|确定|search|submit|go|find|filter)/iu;
const submitIntentPattern = /(?:保存|提交|确认|确定|应用|完成|\bsave\b|\bsubmit\b|\bconfirm\b|\bokay?\b|\bapply\b|\bdone\b)/iu;
const negativeSubmitIntentPattern =
  /(?:不要|别|无需|不需要)[^。；,.，!?！？]{0,32}(?:保存|提交|确认|确定|应用|完成)|\b(?:do\s+not|don't|dont|without)\s+(?:save|submit|confirm|ok|okay|apply|done)\b/iu;
const submitControlPattern = /(?:保存|提交|确认|确定|应用|完成|\bsave\b|\bsubmit\b|\bconfirm\b|\bokay?\b|\bapply\b|\bdone\b)/iu;
const submitFastPathBlockPattern =
  /(?:删除|移除|清空|注销|退出|支付|付款|购买|发送|发布|创建|新建|delete|remove|clear|logout|sign\s*out|pay|payment|purchase|buy|send|publish|create)/iu;
const dismissIntentPattern =
  /(?:关闭|关掉|取消|\bclose\b|\bcancel\b|\bdismiss\b)/iu;
const negativeDismissPattern =
  /(?:不要|别|无需|不需要)[^。；,.，!?！？]{0,32}(?:关闭|关掉|取消)|\b(?:do\s+not|don't|dont|without)\s+(?:close|cancel|dismiss)\b/iu;
const dismissControlPattern =
  /(?:关闭|关掉|取消|\bclose\b|\bcancel\b|\bdismiss\b)/iu;
const refreshControlIntentPattern =
  /(?:刷新|重新加载|重试|再试一次|重新尝试|\brefresh\b|\breload\b|\bretry\b|\btry\s+again\b)/iu;
const negativeRefreshControlPattern =
  /(?:不要|别|无需|不需要)[^。；,.，!?！？]{0,32}(?:刷新|重新加载|重试|再试一次)|\b(?:do\s+not|don't|dont|without)\s+(?:refresh|reload|retry|try\s+again)\b/iu;
const refreshControlPattern =
  /(?:刷新|重新加载|重试|再试一次|重新尝试|\brefresh\b|\breload\b|\bretry\b|\btry\s+again\b)/iu;
const scrollIntentPattern = /(?:滚动|滑动|下滑|上滑|翻页|翻一页|下一页|上一页|scroll|page\s*(?:down|up))/iu;
const negativeScrollPattern = /(?:不要|别|无需|不需要)[^。；,.，]*?(?:滚动|滑动|下滑|上滑|翻页)|\b(?:do\s+not|don't|dont|without)\s+(?:scroll|page)\b/iu;
const scrollDownPattern = /(?:向下|往下|下滑|下翻|下一页|下方|底部|scroll\s+down|page\s+down|\bdown\b)/iu;
const scrollUpPattern = /(?:向上|往上|上滑|上翻|上一页|上方|顶部|scroll\s+up|page\s+up|\bup\b)/iu;
const paginationIntentPattern =
  /(?:下一页|下页|后一页|后页|上一页|上页|前一页|前页|\bnext(?:\s+page)?\b|\bprev(?:ious)?(?:\s+page)?\b)/iu;
const negativePaginationPattern =
  /(?:不要|别|无需|不需要)[^。；,.，]*?(?:下一页|下页|上一页|上页|翻页)|\b(?:do\s+not|don't|dont|without)\s+(?:go\s+to\s+)?(?:next|previous|prev)(?:\s+page)?\b/iu;
const paginationControlPattern =
  /(?:下一页|下页|后一页|后页|上一页|上页|前一页|前页|next(?:\s+page)?|previous(?:\s+page)?|prev(?:\s+page)?)/iu;
const expansionIntentPattern =
  /(?:展开|打开|显示|收起|折叠|合起|关闭|\bexpand\b|\bopen\b|\bshow\b|\bcollapse\b|\bclose\b|\bhide\b)/iu;
const negativeExpansionPattern =
  /(?:不要|别|无需|不需要)[^。；,.，!?！？]{0,32}(?:展开|打开|显示|收起|折叠|合起|关闭)|\b(?:do\s+not|don't|dont|without)\s+(?:expand|open|show|collapse|close|hide)\b/iu;
const expansionTargetSuffixPattern =
  /(?:子菜单|折叠面板|菜单|面板|分组|栏目|区域|导航|抽屉|submenu|accordion|menu|panel|section|group|details|drawer)$/iu;
const genericExpansionTargetPattern =
  /^(?:子菜单|折叠面板|菜单|面板|分组|栏目|区域|导航|抽屉|submenu|accordion|menu|panel|section|group|details|drawer)$/iu;
const tabSwitchIntentPattern =
  /(?:切换到|切换至|切到|转到|打开|进入|选择|点击|\bswitch\s+to\b|\bgo\s+to\b|\bopen\b|\bselect\b|\bclick\b)/iu;
const negativeTabSwitchPattern =
  /(?:不要|别|无需|不需要)[^。；,.，!?！？]{0,32}(?:切换到|切换至|切到|转到|打开|进入|选择|点击)|\b(?:do\s+not|don't|dont|without)\s+(?:switch|go\s+to|open|select|click)\b/iu;
const tabTargetSuffixPattern =
  /(?:标签页|标签|页签|选项卡|分段|选段|tab|tabs|section|segment|segmented\s+control)$/iu;
const genericTabTargetPattern = /^(?:标签页|标签|页签|选项卡|分段|选段|tab|tabs|section|segment|segmented\s+control)$/iu;
const readContentIntentPattern =
  /(?:读取|阅读|读一下|读出|查看(?:.+?内容|.+?文本|.+?文字|.+?信息|.+?摘要)?|看一下(?:.+?内容|.+?文本|.+?文字|.+?信息|.+?摘要)?|\bread\b|\binspect\b|\bshow\s+me\b|\bwhat(?:'s|\s+is)\s+on\b)/iu;
const negativeReadContentPattern =
  /(?:不要|别|无需|不需要)[^。；,.，!?！？]{0,32}(?:读取|阅读|读一下|查看|看一下)|\b(?:do\s+not|don't|dont|without)\s+(?:read|inspect|show)\b/iu;
const genericReadTargetPattern =
  /^(?:(?:当前页面|当前页|本页|页面|网页)(?:内容|文本|文字|信息|摘要)?|内容|文本|文字|信息|摘要|page|current\s+page|this\s+page|content|text|information|summary|page\s+content|current\s+page\s+content|this\s+page\s+content)$/iu;
const readTargetSuffixPattern =
  /(?:内容|文本|文字|区域|面板|模块|section|panel|content|text)$/iu;
const waitIntentPattern = /(?:等待|等一下|稍等|稍等一下|暂停|停一下|\bwait\b|\bpause\b)/iu;
const negativeWaitPattern = /(?:不要|别|无需|不需要)[^。；,.，]*?(?:等待|等一下|稍等|暂停|停一下)|\b(?:do\s+not|don't|dont|without)\s+(?:wait|pause)\b/iu;
const browserBackPattern =
  /(?:浏览器)?(?:后退|返回上一页|回到上一页|退回上一页|返回上个页面|回到上个页面)|\b(?:go\s+back|browser\s+back|back\s+one\s+page|previous\s+page)\b/iu;
const browserForwardPattern =
  /(?:浏览器)?(?:前进|前往下一页|回到下一页)|\b(?:go\s+forward|browser\s+forward|forward\s+one\s+page|next\s+history\s+page)\b/iu;
const browserReloadPattern =
  /(?:刷新页面|重新加载页面|重载页面|刷新当前页|重新加载当前页)|\b(?:reload|refresh)\s+(?:this\s+)?(?:page|tab)\b/iu;
const negativeBrowserNavigationPattern =
  /(?:不要|别|无需|不需要)[^。；,.，]*?(?:后退|返回上一页|前进|刷新|重新加载)|\b(?:do\s+not|don't|dont|without)\s+(?:go\s+back|go\s+forward|reload|refresh)\b/iu;
const keyPressIntentPattern = /(?:按下?|敲|键盘|press|hit|tap)/iu;
const negativeKeyPressPattern = /(?:不要|别|无需|不需要)[^。；,.，]*?(?:按|敲|键盘|回车|空格|方向键)|\b(?:do\s+not|don't|dont|without)\s+(?:press|hit|tap)\b/iu;
const compoundTextEntryKeyPattern =
  /(?:输入|填写|填入|键入|录入)[\s\S]{1,120}(?:回车|enter|return)|\b(?:type|input|fill|set)\b[\s\S]{1,120}\b(?:enter|return)\b/iu;
const positiveStatePattern = /(?:勾选|选中|开启|打开|启用|turn\s+on|enable|check|select)/iu;
const negativeStatePattern = /(?:取消勾选|取消选中|关闭|关掉|禁用|停用|turn\s+off|disable|uncheck|deselect)/iu;
const chineseNavigationTerms = ["页面", "列表", "管理", "中心", "模块", "菜单", "功能", "入口", "栏目", "板块", "界面", "面板", "页"];
const englishNavigationTerms = ["page", "pages", "list", "lists", "management", "manager", "center", "menu", "section", "module", "screen", "panel", "view"];
const chineseActionTerms = ["点击", "点开", "打开", "进入", "选择", "查看", "前往", "跳转"];
const englishActionTerms = ["open", "click", "select", "go", "enter", "visit", "show", "view"];

export function detectFastPath(input: FastPathInput): FastPathDecision | undefined {
  const decision = detectFastPathCandidate(input);
  if (!decision) return undefined;
  return isRepeatedFastPathDecision(decision, input.actionMemory) ? undefined : decision;
}

function detectFastPathCandidate(input: FastPathInput): FastPathDecision | undefined {
  const fieldEnter = exactVisibleFieldEnter(input.taskText, input.controls);
  if (fieldEnter) {
    const fillCommand: SemanticCommand = {
      id: createEventId(),
      type: "FillField",
      targetGoal: fieldEnter.control.label || fieldEnter.control.accessibleName || fieldEnter.query,
      inputs: { semanticId: fieldEnter.control.semanticId, label: fieldEnter.query, value: fieldEnter.value },
      expectedOutcome: "The target field contains the requested value.",
      successCriteria: ["control_value_matches"],
      riskHint: "low",
      fallbackHints: []
    };
    const enterCommand: SemanticCommand = {
      id: createEventId(),
      type: "PressKey",
      targetGoal: "Press Enter",
      inputs: { key: "Enter", intent: "submit_field", fieldSemanticId: fieldEnter.control.semanticId },
      expectedOutcome: "Enter is pressed after filling the target field.",
      successCriteria: ["key_pressed"],
      riskHint: "low",
      fallbackHints: []
    };
    return {
      source: "exact_visible_field_enter",
      command: fillCommand,
      commands: [fillCommand, enterCommand],
      reasoningSummary:
        "The task explicitly asks to enter text into one visible non-sensitive field and press Enter, so the runtime can do both without a planner model call."
    };
  }

  const focusedEntryEnter = focusedTextEntryEnter(input.taskText, input.controls);
  if (focusedEntryEnter) {
    const fillCommand: SemanticCommand = {
      id: createEventId(),
      type: "FillField",
      targetGoal: focusedEntryEnter.control.label || focusedEntryEnter.control.accessibleName || "Focused field",
      inputs: {
        semanticId: focusedEntryEnter.control.semanticId,
        label: focusedEntryEnter.control.label || focusedEntryEnter.control.accessibleName,
        value: focusedEntryEnter.value,
        intent: "focused_text_entry"
      },
      expectedOutcome: "The currently focused editable field contains the requested value.",
      successCriteria: ["control_value_matches"],
      riskHint: "low",
      fallbackHints: []
    };
    const enterCommand: SemanticCommand = {
      id: createEventId(),
      type: "PressKey",
      targetGoal: "Press Enter",
      inputs: { key: "Enter", intent: "submit_focused_field", fieldSemanticId: focusedEntryEnter.control.semanticId },
      expectedOutcome: "Enter is pressed after filling the focused field.",
      successCriteria: ["key_pressed"],
      riskHint: "low",
      fallbackHints: []
    };
    return {
      source: "focused_text_entry_enter",
      command: fillCommand,
      commands: [fillCommand, enterCommand],
      reasoningSummary:
        "The task asks to enter text and press Enter, and one visible non-sensitive editable field is currently focused."
    };
  }

  const requestedKey = explicitKeyboardKey(input.taskText);
  if (requestedKey) {
    return {
      source: "explicit_key_press",
      command: {
        id: createEventId(),
        type: "PressKey",
        targetGoal: `Press ${requestedKey}`,
        inputs: { key: requestedKey },
        expectedOutcome: "The requested keyboard key is pressed in the active page context.",
        successCriteria: ["key_pressed"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary: "The task explicitly asks for a simple keyboard key press, so the runtime can dispatch it without a planner model call."
    };
  }

  const explicitUrl = explicitTaskUrl(input.taskText);
  if (explicitUrl && newTabIntentPattern.test(input.taskText)) {
    return {
      source: "explicit_new_tab_url",
      command: {
        id: createEventId(),
        type: "OpenTab",
        targetGoal: `Open ${explicitUrl} in a new tab`,
        inputs: { url: explicitUrl, active: true },
        expectedOutcome: "The browser opens the requested URL in a new active tab.",
        successCriteria: ["page_changed"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary: "The task explicitly asks to open a URL in a new tab, so the runtime can create that tab without a planner model call."
    };
  }
  if (explicitUrl && shouldNavigateToUrl(input.pageUrl, explicitUrl)) {
    return {
      source: "explicit_url",
      command: {
        id: createEventId(),
        type: "NavigateTo",
        targetGoal: `Open ${explicitUrl}`,
        inputs: { url: explicitUrl },
        expectedOutcome: "The browser loads the URL requested by the user.",
        successCriteria: ["page_changed"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary: "The task contains a URL and the current tab is not already at that target URL."
    };
  }

  const searchUrl = webSearchUrl(input.taskText, input.pageUrl, input.controls);
  if (searchUrl && shouldNavigateToUrl(input.pageUrl, searchUrl)) {
    return {
      source: "web_search",
      command: {
        id: createEventId(),
        type: "NavigateTo",
        targetGoal: `Search ${searchQueryForTask(input.taskText) ?? ""}`.trim(),
        inputs: { url: searchUrl },
        expectedOutcome: "The browser opens a web search results page for the user's query.",
        successCriteria: ["page_changed"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task is an explicit web search and the current page does not expose app-specific search controls, so the runtime can navigate directly to search results."
    };
  }

  const searchForm = exactVisibleSearchForm(input.taskText, input.controls, input.forms ?? []);
  if (searchForm) {
    const fillCommand: SemanticCommand = {
      id: createEventId(),
      type: "FillField",
      targetGoal: searchForm.field.label || searchForm.field.accessibleName || "Search",
      inputs: { semanticId: searchForm.field.semanticId, label: searchForm.field.label || searchForm.field.accessibleName, value: searchForm.query },
      expectedOutcome: "The search field contains the requested query.",
      successCriteria: ["control_value_matches"],
      riskHint: "low",
      fallbackHints: []
    };
    const submitLabel = searchForm.submit.label || searchForm.submit.accessibleName || "Search";
    const submitCommand: SemanticCommand = {
      id: createEventId(),
      type: "SubmitCurrentForm",
      targetGoal: submitLabel,
      inputs: {
        semanticId: searchForm.submit.semanticId,
        label: submitLabel,
        formRef: searchForm.field.formRef,
        intent: "search",
        query: searchForm.query
      },
      expectedOutcome: "The page search is submitted and results, page changes, or validation feedback become visible.",
      successCriteria: ["submission_feedback_or_validation"],
      riskHint: "low",
      fallbackHints: []
    };
    return {
      source: "exact_visible_search_form",
      command: fillCommand,
      commands: [fillCommand, submitCommand],
      reasoningSummary:
        "The task is a page-local search, and the page has one clear searchable field plus one clear submit/search control."
    };
  }

  const searchFieldEnter = singleSearchFieldEnter(input.taskText, input.controls);
  if (searchFieldEnter) {
    const fillCommand: SemanticCommand = {
      id: createEventId(),
      type: "FillField",
      targetGoal: searchFieldEnter.field.label || searchFieldEnter.field.accessibleName || "Search",
      inputs: {
        semanticId: searchFieldEnter.field.semanticId,
        label: searchFieldEnter.field.label || searchFieldEnter.field.accessibleName,
        value: searchFieldEnter.query
      },
      expectedOutcome: "The search field contains the requested query.",
      successCriteria: ["control_value_matches"],
      riskHint: "low",
      fallbackHints: []
    };
    const enterCommand: SemanticCommand = {
      id: createEventId(),
      type: "PressKey",
      targetGoal: "Submit search with Enter",
      inputs: { key: "Enter", intent: "search", query: searchFieldEnter.query },
      expectedOutcome: "The page search is submitted from the focused search field.",
      successCriteria: ["key_pressed"],
      riskHint: "low",
      fallbackHints: []
    };
    return {
      source: "single_search_field_enter",
      command: fillCommand,
      commands: [fillCommand, enterCommand],
      reasoningSummary:
        "The task is a page-local search, and the page has one clear searchable field but no unambiguous visible submit control, so the runtime can fill it and press Enter."
    };
  }

  const submitControl = exactVisibleSubmitControl(input.taskText, input.controls, input.forms ?? []);
  if (submitControl) {
    const submitLabel = submitControl.label || submitControl.accessibleName || "Submit";
    return {
      source: "exact_visible_submit_control",
      command: {
        id: createEventId(),
        type: "SubmitCurrentForm",
        targetGoal: submitLabel,
        inputs: {
          semanticId: submitControl.semanticId,
          label: submitLabel,
          ...(submitControl.formRef ? { formRef: submitControl.formRef } : {}),
          intent: "save_submit_confirm"
        },
        expectedOutcome:
          "The requested save, submit, confirm, or apply action is submitted and visible feedback, validation, or state change can be observed.",
        successCriteria: ["submission_feedback_or_validation"],
        riskHint: "medium",
        fallbackHints: []
      },
      reasoningSummary:
        "The task is an explicit save, submit, confirm, or apply request, and one visible submit-like control is the unique safe match."
    };
  }

  const selectOption = exactVisibleSelectOption(input.taskText, input.controls);
  if (selectOption) {
    return {
      source: "exact_visible_select",
      command: {
        id: createEventId(),
        type: "SelectOption",
        targetGoal: selectOption.control.label || selectOption.control.accessibleName || selectOption.query,
        inputs: { semanticId: selectOption.control.semanticId, label: selectOption.query, value: selectOption.value },
        expectedOutcome: "The target selector uses the requested option.",
        successCriteria: ["control_value_matches"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task contains one explicit selector label and option value, and one visible selectable field is the unique low-risk match."
    };
  }

  const stateControl = exactVisibleStateControl(input.taskText, input.controls);
  if (stateControl) {
    const desiredState = stateControl.desiredChecked ? "checked" : "unchecked";
    return {
      source: "exact_visible_state_control",
      command: {
        id: createEventId(),
        type: "ActivateTarget",
        targetGoal: stateControl.control.label || stateControl.control.accessibleName || stateControl.query,
        inputs: {
          semanticId: stateControl.control.semanticId,
          label: stateControl.query,
          desiredState,
          desiredChecked: stateControl.desiredChecked
        },
        expectedOutcome: `The target state control is ${desiredState}.`,
        successCriteria: ["control_state_matches"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task contains one explicit state control label and desired on/off state, and the current observed state shows one safe click will reach it."
    };
  }

  const expansionControl = exactVisibleExpansionControl(input.taskText, input.controls);
  if (expansionControl) {
    const label = expansionControl.control.label || expansionControl.control.accessibleName || expansionControl.query;
    const desiredState = expansionControl.desiredExpanded ? "expanded" : "collapsed";
    const successCriteria = expansionControl.desiredExpanded
      ? (expansionControl.control.childRefs?.length ?? 0) > 0
        ? ["menu_expanded", "child_target_visible"]
        : ["menu_expanded"]
      : ["menu_collapsed"];
    return {
      source: "exact_visible_expansion_control",
      command: {
        id: createEventId(),
        type: "ActivateTarget",
        targetGoal: label,
        inputs: {
          semanticId: expansionControl.control.semanticId,
          label,
          intent: "expand_or_collapse",
          desiredState,
          desiredExpanded: expansionControl.desiredExpanded
        },
        expectedOutcome: expansionControl.desiredExpanded
          ? "The target menu, panel, or disclosure is expanded."
          : "The target menu, panel, or disclosure is collapsed.",
        successCriteria,
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task explicitly asks to expand or collapse one visible control, and the observed expanded state shows one safe click will reach the requested state."
    };
  }

  const tabControl = exactVisibleTabControl(input.taskText, input.controls);
  if (tabControl) {
    const label = tabControl.control.label || tabControl.control.accessibleName || tabControl.query;
    return {
      source: "visible_tab_control",
      command: {
        id: createEventId(),
        type: "ActivateTarget",
        targetGoal: label,
        inputs: {
          semanticId: tabControl.control.semanticId,
          label,
          intent: "tab_switch",
          desiredState: "selected",
          desiredSelected: true
        },
        expectedOutcome: "The requested tab, segment, or page section is selected.",
        successCriteria: ["control_value_matches"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task asks to switch to one visible tab or segmented control, and the runtime found a unique safe match."
    };
  }

  const readContent = explicitReadContent(input.taskText);
  if (readContent) {
    return {
      source: "explicit_read_content",
      command: {
        id: createEventId(),
        type: "ReadContent",
        targetGoal: readContent.query,
        inputs: {
          query: readContent.query,
          intent: "read_content"
        },
        expectedOutcome: "The requested page content is read without changing the page.",
        successCriteria: ["content_read"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task explicitly asks to read visible page content, so the runtime can use the read-only content primitive without a planner model call."
    };
  }

  const dismissControl = exactVisibleDismissControl(input.taskText, input.controls);
  if (dismissControl) {
    const label = dismissControl.label || dismissControl.accessibleName || "Dismiss";
    return {
      source: "visible_dismiss_control",
      command: {
        id: createEventId(),
        type: "ActivateTarget",
        targetGoal: label,
        inputs: {
          semanticId: dismissControl.semanticId,
          label,
          intent: "dismiss"
        },
        expectedOutcome: "The visible dialog, popup, menu, panel, or cancelable surface is dismissed.",
        successCriteria: ["target_not_visible"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task asks to close, cancel, or dismiss a visible surface, and one visible dismiss-like control is the unique safe match."
    };
  }

  const focusedClearField = focusedFieldClear(input.taskText, input.controls);
  if (focusedClearField) {
    return {
      source: "focused_field_clear",
      command: {
        id: createEventId(),
        type: "FillField",
        targetGoal: focusedClearField.control.label || focusedClearField.control.accessibleName || "Focused field",
        inputs: {
          semanticId: focusedClearField.control.semanticId,
          label: focusedClearField.control.label || focusedClearField.control.accessibleName,
          value: "",
          intent: "clear_focused_field"
        },
        expectedOutcome: "The currently focused field is empty.",
        successCriteria: ["control_value_matches"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task asks to clear the current focused input, and one visible non-sensitive editable field is focused."
    };
  }

  const clearField = exactVisibleFieldClear(input.taskText, input.controls);
  if (clearField) {
    return {
      source: "exact_visible_field_clear",
      command: {
        id: createEventId(),
        type: "FillField",
        targetGoal: clearField.control.label || clearField.control.accessibleName || clearField.query || "Field",
        inputs: { semanticId: clearField.control.semanticId, label: clearField.query, value: "", intent: "clear_field" },
        expectedOutcome: "The target field is empty.",
        successCriteria: ["control_value_matches"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task asks to clear one visible non-sensitive editable field, and the runtime found a unique low-risk match."
    };
  }

  const fillField = exactVisibleField(input.taskText, input.controls);
  if (fillField) {
    return {
      source: "exact_visible_field",
      command: {
        id: createEventId(),
        type: "FillField",
        targetGoal: fillField.control.label || fillField.control.accessibleName || fillField.query,
        inputs: { semanticId: fillField.control.semanticId, label: fillField.query, value: fillField.value },
        expectedOutcome: "The target field contains the requested value.",
        successCriteria: ["control_value_matches"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task contains one explicit field label and value, and one visible editable field is the unique low-risk match."
    };
  }

  const focusedEntry = focusedTextEntry(input.taskText, input.controls);
  if (focusedEntry) {
    return {
      source: "focused_text_entry",
      command: {
        id: createEventId(),
        type: "FillField",
        targetGoal: focusedEntry.control.label || focusedEntry.control.accessibleName || "Focused field",
        inputs: {
          semanticId: focusedEntry.control.semanticId,
          label: focusedEntry.control.label || focusedEntry.control.accessibleName,
          value: focusedEntry.value,
          intent: "focused_text_entry"
        },
        expectedOutcome: "The currently focused editable field contains the requested value.",
        successCriteria: ["control_value_matches"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task only asks to enter text, and one visible non-sensitive editable field is currently focused."
    };
  }

  const browserNavigation = explicitBrowserNavigation(input.taskText);
  if (browserNavigation) {
    const label =
      browserNavigation.action === "back" ? "Go back" : browserNavigation.action === "forward" ? "Go forward" : "Reload page";
    return {
      source: "browser_navigation",
      command: {
        id: createEventId(),
        type: "BrowserNavigation",
        targetGoal: label,
        inputs: { action: browserNavigation.action },
        expectedOutcome:
          browserNavigation.action === "reload"
            ? "The current page reloads."
            : "The browser history navigates in the requested direction.",
        successCriteria: browserNavigation.action === "reload" ? ["navigation_completed"] : ["page_changed"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task is an explicit browser history/navigation command, so the runtime can execute it without a planner model call."
    };
  }

  const refreshControl = exactVisibleRefreshControl(input.taskText, input.controls);
  if (refreshControl) {
    const label = refreshControl.label || refreshControl.accessibleName || "Refresh";
    return {
      source: "visible_refresh_control",
      command: {
        id: createEventId(),
        type: "ActivateTarget",
        targetGoal: label,
        inputs: {
          semanticId: refreshControl.semanticId,
          label,
          intent: "refresh_or_retry"
        },
        expectedOutcome: "The visible refresh, reload, or retry control is activated.",
        successCriteria: ["target_visible"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task asks to refresh or retry a page surface, and one visible refresh-like control is the unique safe match."
    };
  }

  const paginationControl = exactVisiblePaginationControl(input.taskText, input.controls);
  if (paginationControl) {
    const label = paginationControl.control.label || paginationControl.control.accessibleName || paginationControl.direction;
    return {
      source: "visible_pagination_control",
      command: {
        id: createEventId(),
        type: "ActivateTarget",
        targetGoal: label,
        inputs: {
          semanticId: paginationControl.control.semanticId,
          label,
          intent: "pagination",
          direction: paginationControl.direction
        },
        expectedOutcome: `The ${paginationControl.direction} pagination control is activated.`,
        successCriteria: ["target_visible"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task asks for next or previous page, and one visible pagination control is the unique match, so the runtime can click it before falling back to viewport scrolling."
    };
  }

  const scroll = explicitScroll(input.taskText);
  if (scroll) {
    return {
      source: "explicit_scroll",
      command: {
        id: createEventId(),
        type: "ScrollRegion",
        targetGoal: scroll.direction === "down" ? "Scroll down" : "Scroll up",
        inputs: { direction: scroll.direction, amount: scroll.amount },
        expectedOutcome: "The viewport scroll position changes in the requested direction.",
        successCriteria: ["viewport_scrolled"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task is a simple page scroll request, so the runtime can scroll without a planner model call."
    };
  }

  const wait = explicitWait(input.taskText);
  if (wait) {
    return {
      source: "explicit_wait",
      command: {
        id: createEventId(),
        type: "WaitForChange",
        targetGoal: "Wait",
        inputs: { milliseconds: wait.milliseconds },
        expectedOutcome: "The browser waits for the requested duration.",
        successCriteria: ["wait_completed"],
        riskHint: "low",
        fallbackHints: []
      },
      reasoningSummary:
        "The task is a simple wait request, so the runtime can wait without a planner model call."
    };
  }

  const exactControl = exactVisibleControl(input.taskText, input.controls);
  if (exactControl) {
    return activationDecision({
      source: "exact_visible_control",
      control: exactControl,
      expectedOutcome: "The target control is activated.",
      reasoningSummary: "The task names one exact visible control, so the runtime can bind it without a planner model call while preserving policy risk checks."
    });
  }

  const semanticNavigationControl = semanticNavigationControlFor(input.taskText, input.controls);
  if (!semanticNavigationControl) return undefined;

  return activationDecision({
    source: "semantic_navigation_control",
    control: semanticNavigationControl,
    expectedOutcome: "The target navigation control is activated.",
    reasoningSummary:
      "The task names a navigation destination with generic page words, and one visible navigation control is the unique semantic match."
  });
}

function exactVisiblePaginationControl(
  taskText: string,
  controls: ControlCandidate[]
): { control: ControlCandidate; direction: "next" | "previous" } | undefined {
  const direction = paginationDirectionForTask(taskText);
  if (!direction) return undefined;

  const candidates = controls
    .filter((control) => isFastPaginationControl(control, direction))
    .map((control) => ({
      control,
      labelKey: normalize(control.label || control.accessibleName),
      score: paginationControlScore(control, direction)
    }))
    .filter((candidate) => candidate.score >= 0.78)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(best.score - second.score) < 0.12) return undefined;
  if (candidates.filter((candidate) => candidate.labelKey && candidate.labelKey === best.labelKey).length > 1) return undefined;
  return { control: best.control, direction };
}

function paginationDirectionForTask(taskText: string): "next" | "previous" | undefined {
  const trimmed = taskText.trim();
  if (!trimmed || !paginationIntentPattern.test(trimmed)) return undefined;
  if (negativeIntentPattern.test(trimmed) || negativeScrollPattern.test(trimmed) || negativePaginationPattern.test(trimmed)) return undefined;
  if (browserBackPattern.test(trimmed) || browserForwardPattern.test(trimmed) || browserReloadPattern.test(trimmed)) return undefined;

  const wantsNext = /(?:下一页|下页|后一页|后页|\bnext(?:\s+page)?\b)/iu.test(trimmed);
  const wantsPrevious = /(?:上一页|上页|前一页|前页|\bprev(?:ious)?(?:\s+page)?\b)/iu.test(trimmed);
  if (wantsNext === wantsPrevious) return undefined;
  return wantsNext ? "next" : "previous";
}

function isFastPaginationControl(control: ControlCandidate, direction: "next" | "previous"): boolean {
  if (!isFastClickable(control)) return false;
  if (destructiveLabelPattern.test(fieldText(control))) return false;
  return paginationControlTextPattern(direction).test(fieldText(control));
}

function paginationControlScore(control: ControlCandidate, direction: "next" | "previous"): number {
  const pattern = paginationControlTextPattern(direction);
  const label = control.label || "";
  const accessibleName = control.accessibleName || "";
  const hints = control.interactionHints.join(" ");
  if (pattern.test(label) || pattern.test(accessibleName)) return 1;
  if (paginationControlPattern.test(label) || paginationControlPattern.test(accessibleName)) return 0.86;
  if (pattern.test(hints)) return 0.82;
  if (/pagination|pager|分页/u.test(hints) && paginationControlPattern.test(fieldText(control))) return 0.78;
  return 0;
}

function paginationControlTextPattern(direction: "next" | "previous"): RegExp {
  return direction === "next"
    ? /(?:下一页|下页|后一页|后页|\bnext(?:\s+page)?\b)/iu
    : /(?:上一页|上页|前一页|前页|\bprev(?:ious)?(?:\s+page)?\b)/iu;
}

function exactVisibleDismissControl(taskText: string, controls: ControlCandidate[]): ControlCandidate | undefined {
  if (!parseDismissRequest(taskText)) return undefined;

  const candidates = controls
    .filter(isFastDismissControl)
    .map((control) => ({
      control,
      labelKey: normalize(control.label || control.accessibleName),
      score: dismissControlScore(control)
    }))
    .filter((candidate) => candidate.score >= 0.78)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(best.score - second.score) < 0.12) return undefined;
  if (candidates.filter((candidate) => candidate.labelKey && candidate.labelKey === best.labelKey).length > 1) return undefined;
  return best.control;
}

function explicitReadContent(taskText: string): { query: string } | undefined {
  const trimmed = taskText.trim();
  if (!trimmed || !readContentIntentPattern.test(trimmed)) return undefined;
  if (negativeIntentPattern.test(trimmed) || negativeReadContentPattern.test(trimmed)) return undefined;
  if (submitIntentPattern.test(trimmed) || scrollIntentPattern.test(trimmed)) return undefined;

  const patterns: Array<{ pattern: RegExp; queryIndex: number }> = [
    { pattern: /^(?:请|帮我|麻烦你?)?\s*(?:读取|阅读|读一下|读出)\s*(.+?)\s*$/iu, queryIndex: 1 },
    { pattern: /^(?:请|帮我|麻烦你?)?\s*(?:查看|看一下)\s*(.+?)\s*(?:内容|文本|文字|信息|摘要)\s*$/iu, queryIndex: 1 },
    { pattern: /^(?:please\s+)?(?:read|inspect)\s+(?:the\s+)?(.+?)\s*$/iu, queryIndex: 1 },
    { pattern: /^(?:please\s+)?(?:show\s+me|what(?:'s|\s+is)\s+on)\s+(?:the\s+)?(.+?)\s*$/iu, queryIndex: 1 }
  ];

  for (const item of patterns) {
    const match = trimmed.match(item.pattern);
    if (!match) continue;
    const query = cleanReadContentTarget(match[item.queryIndex] ?? "");
    if (query) return { query };
  }
  return undefined;
}

function isRepeatedFastPathDecision(decision: FastPathDecision, actionMemory: unknown[]): boolean {
  if (actionMemory.length === 0) return false;
  const commands = decision.commands?.length ? decision.commands : [decision.command];
  const recentSuccessfulActions = actionMemory.slice(-8).filter(isSuccessfulActionMemory);
  if (recentSuccessfulActions.length === 0) return false;
  return commands.every((command) => recentSuccessfulActions.some((item) => actionMemoryMatchesCommand(item, command)));
}

function isSuccessfulActionMemory(value: unknown): value is ActionMemoryLike {
  if (!value || typeof value !== "object") return false;
  const item = value as ActionMemoryLike;
  return item.status === "success" && (item.verificationStatus === "success" || item.verificationStatus === "partial");
}

function actionMemoryMatchesCommand(item: ActionMemoryLike, command: SemanticCommand): boolean {
  if (item.commandType !== command.type) return false;
  const inputs = command.inputs && typeof command.inputs === "object" ? (command.inputs as Record<string, unknown>) : {};
  const commandRef = inputs.controlId ?? inputs.semanticId ?? inputs.controlRef ?? inputs.url ?? inputs.href ?? inputs.key;
  if (typeof item.targetRef === "string" && item.targetRef.trim()) {
    return typeof commandRef === "string" && normalize(commandRef) === normalize(item.targetRef);
  }
  if (typeof item.targetGoal === "string" && item.targetGoal.trim()) {
    return normalize(item.targetGoal) === normalize(command.targetGoal);
  }
  return commandActionKey(command).length > 0 && commandActionKey(command) === commandActionKey({ type: item.commandType, targetGoal: item.targetGoal });
}

function cleanReadContentTarget(value: string): string | undefined {
  const raw = value
    .replace(/^[\s:：,，"'“”]+/u, "")
    .replace(/[\s。？！?!,，；;：:"'“”]+$/u, "")
    .trim();
  if (!raw) return undefined;
  if (genericReadTargetPattern.test(raw)) return "当前页面";
  const cleaned = raw
    .replace(/^(?:当前|这个|此|the|this)\s*/iu, "")
    .replace(readTargetSuffixPattern, "")
    .replace(/[\s。？！?!,，；;：:"'“”]+$/u, "")
    .trim();
  if (!cleaned || genericReadTargetPattern.test(cleaned)) return "当前页面";
  return cleaned;
}

function exactVisibleTabControl(
  taskText: string,
  controls: ControlCandidate[]
): { control: ControlCandidate; query: string } | undefined {
  const request = parseTabControlRequest(taskText);
  if (!request) return undefined;

  const queryKey = normalize(request.query);
  if (queryKey.length < 1) return undefined;

  const candidates = controls
    .filter(isFastTabControl)
    .filter((control) => control.valueState !== "selected")
    .map((control) => ({
      control,
      labelKey: normalize(control.label || control.accessibleName),
      score: fieldMatchScore(control, queryKey)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(second.score - best.score) < 0.08) return undefined;
  if (candidates.filter((candidate) => candidate.labelKey && candidate.labelKey === best.labelKey).length > 1) return undefined;
  return { control: best.control, query: request.query };
}

function parseTabControlRequest(taskText: string): { query: string } | undefined {
  const trimmed = taskText.trim();
  if (!trimmed || !tabSwitchIntentPattern.test(trimmed)) return undefined;
  if (negativeIntentPattern.test(trimmed) || negativeTabSwitchPattern.test(trimmed)) return undefined;

  const patterns: Array<{ pattern: RegExp; queryIndex: number; requireTabWord?: boolean }> = [
    { pattern: /^(?:请|帮我|麻烦你?)?\s*(?:切换到|切换至|切到|转到)\s*(.+)$/iu, queryIndex: 1 },
    { pattern: /^(?:请|帮我|麻烦你?)?\s*(?:打开|进入|选择|点击)\s*(.+?)\s*(?:标签页|标签|页签|选项卡|分段|选段)\s*$/iu, queryIndex: 1, requireTabWord: true },
    { pattern: /^(?:please\s+)?(?:switch\s+to|go\s+to)\s+(?:the\s+)?(.+)$/iu, queryIndex: 1 },
    { pattern: /^(?:please\s+)?(?:open|select|click)\s+(?:the\s+)?(.+?)\s+(?:tab|section|segment|segmented\s+control)$/iu, queryIndex: 1, requireTabWord: true }
  ];

  for (const item of patterns) {
    const match = trimmed.match(item.pattern);
    if (!match) continue;
    if (item.requireTabWord && !tabTargetSuffixPattern.test(trimmed)) continue;
    const query = cleanTabControlText(match[item.queryIndex] ?? "");
    if (query) return { query };
  }
  return undefined;
}

function cleanTabControlText(value: string): string | undefined {
  const raw = value
    .replace(/^[\s:：,，"'“”]+/u, "")
    .replace(/[\s。？！?!,，；;：:"'“”]+$/u, "")
    .trim();
  if (!raw || genericTabTargetPattern.test(raw)) return undefined;
  const cleaned = raw
    .replace(/^(?:当前|这个|此|the|this)\s*/iu, "")
    .replace(tabTargetSuffixPattern, "")
    .replace(/[\s。？！?!,，；;：:"'“”]+$/u, "")
    .trim();
  if (!cleaned || genericTabTargetPattern.test(cleaned)) return undefined;
  return cleaned;
}

function exactVisibleExpansionControl(
  taskText: string,
  controls: ControlCandidate[]
): { control: ControlCandidate; query: string; desiredExpanded: boolean } | undefined {
  const request = parseExpansionControlRequest(taskText);
  if (!request) return undefined;

  const queryKey = normalize(request.query);
  if (queryKey.length < 1) return undefined;

  const candidates = controls
    .filter(isFastExpansionControl)
    .map((control) => ({ control, current: expandedStateForControl(control), score: fieldMatchScore(control, queryKey) }))
    .filter((candidate) => candidate.current !== undefined)
    .filter((candidate) => candidate.current !== request.desiredExpanded)
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(second.score - best.score) < 0.08) return undefined;
  return { control: best.control, query: request.query, desiredExpanded: request.desiredExpanded };
}

function parseExpansionControlRequest(taskText: string): { query: string; desiredExpanded: boolean } | undefined {
  const trimmed = taskText.trim();
  if (!trimmed || !expansionIntentPattern.test(trimmed)) return undefined;
  if (negativeIntentPattern.test(trimmed) || negativeExpansionPattern.test(trimmed)) return undefined;

  const patterns: Array<{ pattern: RegExp; queryIndex: number; desiredExpanded: boolean }> = [
    { pattern: /^(?:请|帮我|麻烦你?)?\s*(?:展开|打开|显示)\s*(?:一下|这个|此|当前)?\s*(.+)$/iu, queryIndex: 1, desiredExpanded: true },
    { pattern: /^(?:请|帮我|麻烦你?)?\s*(?:收起|折叠|合起|关闭)\s*(?:一下|这个|此|当前)?\s*(.+)$/iu, queryIndex: 1, desiredExpanded: false },
    { pattern: /^(?:please\s+)?(?:expand|open|show)\s+(?:the\s+)?(.+)$/iu, queryIndex: 1, desiredExpanded: true },
    { pattern: /^(?:please\s+)?(?:collapse|close|hide)\s+(?:the\s+)?(.+)$/iu, queryIndex: 1, desiredExpanded: false }
  ];

  for (const item of patterns) {
    const match = trimmed.match(item.pattern);
    const query = cleanExpansionControlText(match?.[item.queryIndex] ?? "");
    if (query) return { query, desiredExpanded: item.desiredExpanded };
  }
  return undefined;
}

function cleanExpansionControlText(value: string): string | undefined {
  const raw = value
    .replace(/^[\s:：,，"'“”]+/u, "")
    .replace(/[\s。？！?!,，；;：:"'“”]+$/u, "")
    .trim();
  if (!raw || genericExpansionTargetPattern.test(raw)) return undefined;
  const cleaned = raw
    .replace(/^(?:当前|这个|此|the|this)\s*/iu, "")
    .replace(expansionTargetSuffixPattern, "")
    .replace(/[\s。？！?!,，；;：:"'“”]+$/u, "")
    .trim();
  if (!cleaned || genericExpansionTargetPattern.test(cleaned)) return undefined;
  return cleaned;
}

function parseDismissRequest(taskText: string): boolean {
  const trimmed = taskText.trim();
  if (!trimmed || !dismissIntentPattern.test(trimmed)) return false;
  if (negativeIntentPattern.test(trimmed) || negativeDismissPattern.test(trimmed)) return false;
  if (destructiveLabelPattern.test(trimmed)) return false;

  return (
    /^(?:请|帮我|麻烦你?)?\s*(?:关闭|关掉|取消)\s*(?:一下|当前|这个|此)?\s*(?:弹窗|弹出框|对话框|窗口|提示|提示框|浮层|模态框|面板|侧边栏|抽屉|菜单)?\s*$/iu.test(trimmed) ||
    /^(?:please\s+)?(?:close|cancel|dismiss)(?:\s+(?:this|it|the\s+)?(?:dialog|modal|popup|toast|banner|panel|drawer|menu|window|prompt|notice))?\s*$/iu.test(trimmed)
  );
}

function isFastDismissControl(control: ControlCandidate): boolean {
  if (!isFastClickable(control)) return false;
  const text = fieldText(control);
  if (destructiveLabelPattern.test(text)) return false;
  return dismissControlPattern.test(text) || dismissIconText(control.label) || dismissIconText(control.accessibleName);
}

function dismissControlScore(control: ControlCandidate): number {
  const label = control.label || "";
  const accessibleName = control.accessibleName || "";
  const hints = control.interactionHints.join(" ");
  if (dismissControlPattern.test(label) || dismissControlPattern.test(accessibleName)) return 1;
  if (dismissIconText(label) || dismissIconText(accessibleName)) return 0.9;
  if (dismissControlPattern.test(hints)) return 0.82;
  return 0;
}

function dismissIconText(value: string): boolean {
  return /^[×✕x]$/iu.test(value.trim());
}

function exactVisibleRefreshControl(taskText: string, controls: ControlCandidate[]): ControlCandidate | undefined {
  if (!parseRefreshControlRequest(taskText)) return undefined;

  const candidates = controls
    .filter(isFastRefreshControl)
    .map((control) => ({
      control,
      labelKey: normalize(control.label || control.accessibleName),
      score: refreshControlScore(control)
    }))
    .filter((candidate) => candidate.score >= 0.78)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(best.score - second.score) < 0.12) return undefined;
  if (candidates.filter((candidate) => candidate.labelKey && candidate.labelKey === best.labelKey).length > 1) return undefined;
  return best.control;
}

function parseRefreshControlRequest(taskText: string): boolean {
  const trimmed = taskText.trim();
  if (!trimmed || !refreshControlIntentPattern.test(trimmed)) return false;
  if (negativeIntentPattern.test(trimmed) || negativeRefreshControlPattern.test(trimmed)) return false;
  if (destructiveLabelPattern.test(trimmed)) return false;

  return (
    /^(?:请|帮我|麻烦你?)?\s*(?:刷新|重新加载|重试|再试一次|重新尝试)\s*(?:一下|当前|这个|此)?\s*(?:列表|表格|数据|内容|结果|面板|卡片|区域|请求|加载|当前列表|当前页面)?\s*$/iu.test(trimmed) ||
    /^(?:please\s+)?(?:refresh|reload|retry|try\s+again)(?:\s+(?:this|it|the\s+)?(?:list|table|data|content|results?|panel|section|request|load|page))?\s*$/iu.test(trimmed)
  );
}

function isFastRefreshControl(control: ControlCandidate): boolean {
  if (!isFastClickable(control)) return false;
  const text = fieldText(control);
  if (destructiveLabelPattern.test(text)) return false;
  return refreshControlPattern.test(text);
}

function refreshControlScore(control: ControlCandidate): number {
  const label = control.label || "";
  const accessibleName = control.accessibleName || "";
  const hints = control.interactionHints.join(" ");
  if (refreshControlPattern.test(label) || refreshControlPattern.test(accessibleName)) return 1;
  if (refreshControlPattern.test(hints)) return 0.82;
  return 0;
}

function explicitBrowserNavigation(taskText: string): { action: "back" | "forward" | "reload" } | undefined {
  const trimmed = taskText.trim();
  if (!trimmed || negativeIntentPattern.test(trimmed) || negativeBrowserNavigationPattern.test(trimmed)) return undefined;
  const wantsBack = browserBackPattern.test(trimmed);
  const wantsForward = browserForwardPattern.test(trimmed);
  const wantsReload = browserReloadPattern.test(trimmed) || /^(?:reload|refresh)$/iu.test(trimmed);
  const matches = [wantsBack, wantsForward, wantsReload].filter(Boolean).length;
  if (matches !== 1) return undefined;
  if (wantsBack) return { action: "back" };
  if (wantsForward) return { action: "forward" };
  return { action: "reload" };
}

function explicitWait(taskText: string): { milliseconds: number } | undefined {
  const trimmed = taskText.trim();
  if (
    !waitIntentPattern.test(trimmed) ||
    actionIntentPattern.test(trimmed) ||
    negativeIntentPattern.test(trimmed) ||
    negativeWaitPattern.test(trimmed)
  ) {
    return undefined;
  }
  return { milliseconds: waitMilliseconds(trimmed) };
}

function waitMilliseconds(taskText: string): number {
  const millisecondMatch = taskText.match(/(\d+(?:\.\d+)?)\s*(?:毫秒|ms|milliseconds?)/iu);
  if (millisecondMatch) return clampWaitMilliseconds(Number(millisecondMatch[1]));

  const secondMatch = taskText.match(/(\d+(?:\.\d+)?)\s*(?:秒|s|seconds?)/iu);
  if (secondMatch) return clampWaitMilliseconds(Number(secondMatch[1]) * 1000);

  if (/(?:半秒|half\s+a?\s*second)/iu.test(taskText)) return 500;
  if (/(?:一秒|1秒|one\s+second)/iu.test(taskText)) return 1000;
  if (/(?:两秒|二秒|2秒|two\s+seconds?)/iu.test(taskText)) return 2000;
  if (/(?:三秒|3秒|three\s+seconds?)/iu.test(taskText)) return 3000;
  if (/(?:久一点|多等|longer)/iu.test(taskText)) return 3000;
  return 1000;
}

function clampWaitMilliseconds(value: number): number {
  if (!Number.isFinite(value)) return 1000;
  return Math.max(50, Math.min(10_000, Math.round(value)));
}

function explicitScroll(taskText: string): { direction: "up" | "down"; amount: number } | undefined {
  const trimmed = taskText.trim();
  if (!scrollIntentPattern.test(trimmed) || negativeIntentPattern.test(trimmed) || negativeScrollPattern.test(trimmed) || negativeBrowserNavigationPattern.test(trimmed)) return undefined;
  const wantsDown = scrollDownPattern.test(trimmed);
  const wantsUp = scrollUpPattern.test(trimmed);
  if (wantsDown === wantsUp) return undefined;
  return { direction: wantsUp ? "up" : "down", amount: scrollAmount(trimmed) };
}

function scrollAmount(taskText: string): number {
  if (/(?:一点|少量|稍微|a\s+little|slightly)/iu.test(taskText)) return 360;
  if (/(?:半页|half\s+page)/iu.test(taskText)) return 480;
  return 720;
}

function focusedTextEntry(taskText: string, controls: ControlCandidate[]): { control: ControlCandidate; value: string } | undefined {
  if (negativeIntentPattern.test(taskText)) return undefined;
  const value = parseFocusedTextEntryValue(taskText);
  if (!value) return undefined;
  const candidates = controls
    .filter((control) => control.focused === true)
    .filter(isFastEditableField)
    .filter((control) => !sensitiveFieldPattern.test(fieldText(control)));
  if (candidates.length !== 1) return undefined;
  return { control: candidates[0], value };
}

function focusedTextEntryEnter(taskText: string, controls: ControlCandidate[]): { control: ControlCandidate; value: string } | undefined {
  if (negativeIntentPattern.test(taskText)) return undefined;
  const value = parseFocusedTextEntryEnterValue(taskText);
  if (!value) return undefined;
  const candidates = controls
    .filter((control) => control.focused === true)
    .filter(isFastEditableField)
    .filter((control) => !sensitiveFieldPattern.test(fieldText(control)));
  if (candidates.length !== 1) return undefined;
  return { control: candidates[0], value };
}

function focusedFieldClear(taskText: string, controls: ControlCandidate[]): { control: ControlCandidate } | undefined {
  if (negativeIntentPattern.test(taskText)) return undefined;
  if (!parseFocusedFieldClearRequest(taskText)) return undefined;
  const candidates = controls
    .filter((control) => control.focused === true)
    .filter(isFastEditableField)
    .filter((control) => !sensitiveFieldPattern.test(fieldText(control)));
  if (candidates.length !== 1) return undefined;
  return { control: candidates[0] };
}

function exactVisibleSearchForm(
  taskText: string,
  controls: ControlCandidate[],
  forms: FormSnapshot[]
): { field: ControlCandidate; submit: ControlCandidate; query: string } | undefined {
  const query = searchQueryForTask(taskText);
  if (!query || negativeIntentPattern.test(taskText)) return undefined;

  const visibleEditableFields = controls
    .filter(isFastEditableField)
    .filter((control) => !sensitiveFieldPattern.test(fieldText(control)));
  if (visibleEditableFields.length === 0) return undefined;

  const fields = visibleEditableFields
    .map((control) => ({ control, score: searchFieldScore(control, visibleEditableFields.length) }))
    .filter((candidate) => candidate.score >= 0.62)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [field, secondField] = fields;
  if (!field) return undefined;
  if (secondField && Math.abs(field.score - secondField.score) < 0.1) return undefined;

  const submit = uniqueSearchSubmitControl(field.control, controls, forms);
  if (!submit) return undefined;

  return { field: field.control, submit, query };
}

function singleSearchFieldEnter(taskText: string, controls: ControlCandidate[]): { field: ControlCandidate; query: string } | undefined {
  const query = searchQueryForTask(taskText);
  if (!query || negativeIntentPattern.test(taskText)) return undefined;

  const visibleEditableFields = controls
    .filter(isFastEditableField)
    .filter((control) => !sensitiveFieldPattern.test(fieldText(control)));
  if (visibleEditableFields.length === 0) return undefined;

  const fields = visibleEditableFields
    .map((control) => ({ control, score: searchFieldScore(control, visibleEditableFields.length) }))
    .filter((candidate) => candidate.score >= 0.82)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [field, secondField] = fields;
  if (!field) return undefined;
  if (secondField && Math.abs(field.score - secondField.score) < 0.1) return undefined;

  const possibleSubmitControls = controls.filter(isFastSearchSubmitControl);
  if (possibleSubmitControls.length > 1) return undefined;
  if (possibleSubmitControls.length === 1 && possibleSubmitControls[0].formRef !== field.control.formRef) return undefined;

  return { field: field.control, query };
}

function exactVisibleSubmitControl(
  taskText: string,
  controls: ControlCandidate[],
  forms: FormSnapshot[]
): ControlCandidate | undefined {
  const action = parseSubmitControlAction(taskText);
  if (!action) return undefined;

  const formSubmitRefs = new Set(forms.flatMap((form) => form.submitControlRefs));
  const candidates = controls
    .filter((control) => isFastSubmitControl(control, formSubmitRefs))
    .map((control) => ({
      control,
      labelKey: normalize(control.label || control.accessibleName),
      score: genericSubmitControlScore(control, action, formSubmitRefs)
    }))
    .filter((candidate) => candidate.score >= 0.78)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(best.score - second.score) < 0.12) return undefined;
  if (candidates.filter((candidate) => candidate.labelKey && candidate.labelKey === best.labelKey).length > 1) return undefined;
  return best.control;
}

function parseSubmitControlAction(taskText: string): string | undefined {
  const trimmed = taskText.trim();
  if (!trimmed || !submitIntentPattern.test(trimmed)) return undefined;
  if (negativeIntentPattern.test(trimmed) || negativeSubmitIntentPattern.test(trimmed)) return undefined;
  if (submitFastPathBlockPattern.test(trimmed)) return undefined;

  const chinese = trimmed.match(
    /^(?:请|帮我|麻烦你?)?\s*(?:点击|点|按|选择)?\s*(保存|提交|确认|确定|应用|完成)\s*(?:一下|更改|修改|设置|配置|内容|表单|当前表单|当前页面|页面|信息|数据|改动|变化|变更)?\s*$/iu
  );
  if (chinese?.[1]) return chinese[1];

  const english = trimmed.match(
    /^(?:please\s+)?(?:(?:click|press|tap)\s+)?(save|submit|confirm|ok|okay|apply|done)(?:\s+(?:changes?|settings?|config(?:uration)?|form|this\s+form|current\s+form|page|data|details?))?\s*$/iu
  );
  if (english?.[1]) return english[1];

  return undefined;
}

function isFastSubmitControl(control: ControlCandidate, formSubmitRefs: Set<string>): boolean {
  const role = control.role.toLowerCase();
  const type = (control.controlType ?? "").toLowerCase();
  const hints = control.interactionHints.map((hint) => hint.toLowerCase());
  const text = fieldText(control);
  if (submitFastPathBlockPattern.test(text)) return false;

  const clickable =
    control.visibility === "visible" &&
    !control.disabled &&
    control.confidence >= 0.75 &&
    (role === "button" ||
      role === "menuitem" ||
      type === "submit" ||
      type === "button" ||
      hints.includes("button") ||
      hints.includes("submit"));
  if (!clickable) return false;
  return submitControlPattern.test(text) || type === "submit" || hints.includes("submit") || formSubmitRefs.has(control.semanticId);
}

function genericSubmitControlScore(control: ControlCandidate, action: string, formSubmitRefs: Set<string>): number {
  const actionKey = normalize(action);
  const labelKey = normalize(control.label);
  const accessibleKey = normalize(control.accessibleName);
  const type = (control.controlType ?? "").toLowerCase();
  const hints = control.interactionHints.join(" ");
  let score = 0;

  if (labelKey === actionKey || accessibleKey === actionKey) score = 1;
  else if ((labelKey && labelKey.includes(actionKey)) || (accessibleKey && accessibleKey.includes(actionKey))) score = 0.9;
  else if (submitControlPattern.test(control.label) || submitControlPattern.test(control.accessibleName)) score = 0.82;
  else if (type === "submit" || submitControlPattern.test(hints)) score = 0.74;

  if (formSubmitRefs.has(control.semanticId)) score += 0.12;
  if (control.formRef) score += 0.04;
  return Math.min(score, 1.08);
}

function parseFocusedTextEntryValue(taskText: string): string | undefined {
  const trimmed = taskText.trim();
  if (!trimmed || sensitiveFieldPattern.test(trimmed)) return undefined;
  const patterns = [
    /^(?:请|帮我)?\s*(?:直接)?(?:输入|填写|填入|键入|录入)\s*[“"']?(.+?)[”"']?$/iu,
    /^(?:please\s+)?(?:type|enter|input)\s+["']?(.+?)["']?$/iu
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const value = cleanInputValue(match?.[1] ?? "");
    if (!value) continue;
    if (/(?:到|至|进|在|into|in|to)\s*.+$/iu.test(value)) return undefined;
    return value;
  }
  return undefined;
}

function parseFocusedTextEntryEnterValue(taskText: string): string | undefined {
  const trimmed = taskText.trim();
  if (!trimmed || sensitiveFieldPattern.test(trimmed)) return undefined;
  const enterSuffix = String.raw`(?:并|然后|再|之后|,|，|\s+and\s+|\s+then\s+)?\s*(?:按下?|敲|press|hit)?\s*(?:回车|enter|return)\s*(?:键)?`;
  const patterns = [
    new RegExp(String.raw`^(?:请|帮我)?\s*(?:直接)?(?:输入|填写|填入|键入|录入)\s*[“"']?(.+?)[”"']?\s*${enterSuffix}$`, "iu"),
    /^(?:please\s+)?(?:type|enter|input)\s+["']?(.+?)["']?\s+(?:and\s+|then\s+)?(?:press|hit)?\s*(?:enter|return)$/iu
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const value = cleanInputValue(match?.[1] ?? "");
    if (!value) continue;
    if (/(?:到|至|进|在|into|in|to)\s*.+$/iu.test(value)) return undefined;
    return value;
  }
  return undefined;
}

function exactVisibleSelectOption(taskText: string, controls: ControlCandidate[]): { control: ControlCandidate; query: string; value: string } | undefined {
  if (negativeIntentPattern.test(taskText)) return undefined;
  const request = parseSelectOptionRequest(taskText);
  if (!request) return undefined;

  const queryKey = normalize(request.query);
  if (queryKey.length < 1 || request.value.trim().length === 0) return undefined;

  const candidates = controls
    .filter(isFastSelectableField)
    .map((control) => ({ control, score: fieldMatchScore(control, queryKey) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(second.score - best.score) < 0.08) return undefined;
  return { control: best.control, query: request.query, value: request.value };
}

function exactVisibleStateControl(taskText: string, controls: ControlCandidate[]): { control: ControlCandidate; query: string; desiredChecked: boolean } | undefined {
  if (negativeIntentPattern.test(taskText)) return undefined;
  const request = parseStateControlRequest(taskText);
  if (!request) return undefined;

  const queryKey = normalize(request.query);
  if (queryKey.length < 1) return undefined;

  const candidates = controls
    .filter(isFastStateControl)
    .map((control) => ({ control, current: checkedStateForControl(control), score: fieldMatchScore(control, queryKey) }))
    .filter((candidate) => candidate.current !== undefined)
    .filter((candidate) => candidate.current !== request.desiredChecked)
    .filter((candidate) => request.desiredChecked || candidate.control.role.toLowerCase() !== "radio")
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(second.score - best.score) < 0.08) return undefined;
  return { control: best.control, query: request.query, desiredChecked: request.desiredChecked };
}

function exactVisibleField(taskText: string, controls: ControlCandidate[]): { control: ControlCandidate; query: string; value: string } | undefined {
  if (negativeIntentPattern.test(taskText)) return undefined;
  const request = parseFieldFillRequest(taskText);
  if (!request) return undefined;

  const queryKey = normalize(request.query);
  if (queryKey.length < 2 || request.value.trim().length === 0) return undefined;
  if (sensitiveFieldPattern.test(request.query)) return undefined;

  const candidates = controls
    .filter(isFastEditableField)
    .filter((control) => !sensitiveFieldPattern.test(fieldText(control)))
    .map((control) => ({ control, score: fieldMatchScore(control, queryKey) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(second.score - best.score) < 0.08) return undefined;
  return { control: best.control, query: request.query, value: request.value };
}

function exactVisibleFieldClear(taskText: string, controls: ControlCandidate[]): { control: ControlCandidate; query: string } | undefined {
  if (negativeIntentPattern.test(taskText)) return undefined;
  const request = parseFieldClearRequest(taskText);
  if (!request) return undefined;
  if (request.query && sensitiveFieldPattern.test(request.query)) return undefined;

  const visibleFields = controls
    .filter(isFastEditableField)
    .filter((control) => !sensitiveFieldPattern.test(fieldText(control)));
  if (!visibleFields.length) return undefined;

  if (!request.query) {
    if (visibleFields.length !== 1) return undefined;
    return { control: visibleFields[0], query: "" };
  }

  const queryKey = normalize(request.query);
  if (!queryKey) return undefined;
  const candidates = visibleFields
    .map((control) => ({ control, score: fieldMatchScore(control, queryKey) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(second.score - best.score) < 0.08) return undefined;
  return { control: best.control, query: request.query };
}

function exactVisibleFieldEnter(taskText: string, controls: ControlCandidate[]): { control: ControlCandidate; query: string; value: string } | undefined {
  if (negativeIntentPattern.test(taskText)) return undefined;
  const request = parseFieldEnterRequest(taskText);
  if (!request) return undefined;

  const queryKey = normalize(request.query);
  if (queryKey.length < 2 || request.value.trim().length === 0) return undefined;
  if (sensitiveFieldPattern.test(request.query)) return undefined;

  const candidates = controls
    .filter(isFastEditableField)
    .filter((control) => !sensitiveFieldPattern.test(fieldText(control)))
    .map((control) => ({ control, score: fieldMatchScore(control, queryKey) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && Math.abs(second.score - best.score) < 0.08) return undefined;
  return { control: best.control, query: request.query, value: request.value };
}

function parseStateControlRequest(taskText: string): { query: string; desiredChecked: boolean } | undefined {
  const trimmed = taskText.trim();
  if (!trimmed) return undefined;

  const negativePrefix = trimmed.match(/^(?:请|帮我)?\s*(?:取消勾选|取消选中|关闭|关掉|禁用|停用)\s*(.+)$/iu);
  if (negativePrefix?.[1]) return stateControlRequest(negativePrefix[1], false);

  const positivePrefix = trimmed.match(/^(?:请|帮我)?\s*(?:勾选|选中|开启|打开|启用)\s*(.+)$/iu);
  if (positivePrefix?.[1]) return stateControlRequest(positivePrefix[1], true);

  const chineseTargetState = trimmed.match(/^(?:请|帮我)?\s*(?:把|将)?\s*(.+?)\s*(?:设置为|切换为|设为|改为)?\s*(开启|打开|启用|选中|勾选|关闭|关掉|禁用|停用|取消勾选|取消选中)$/iu);
  if (chineseTargetState?.[1] && chineseTargetState[2]) {
    const desiredChecked = !negativeStatePattern.test(chineseTargetState[2]);
    return stateControlRequest(chineseTargetState[1], desiredChecked);
  }

  const englishPrefix = trimmed.match(/^(?:please\s+)?(?:turn\s+(on|off)|enable|disable|check|uncheck|select|deselect)\s+(.+)$/iu);
  if (englishPrefix) {
    const action = englishPrefix[1] ?? trimmed.split(/\s+/u)[0] ?? "";
    return stateControlRequest(englishPrefix[2], !negativeStatePattern.test(action || trimmed));
  }

  const englishTargetState = trimmed.match(/^(?:set|change|switch)\s+(.+?)\s+to\s+(on|off|enabled|disabled|checked|unchecked|selected|deselected)$/iu);
  if (englishTargetState?.[1] && englishTargetState[2]) {
    return stateControlRequest(englishTargetState[1], !negativeStatePattern.test(englishTargetState[2]));
  }

  if (!positiveStatePattern.test(trimmed) && !negativeStatePattern.test(trimmed)) return undefined;
  return undefined;
}

function stateControlRequest(rawQuery: string, desiredChecked: boolean): { query: string; desiredChecked: boolean } | undefined {
  const query = cleanStateControlText(rawQuery);
  return query ? { query, desiredChecked } : undefined;
}

function cleanStateControlText(value: string): string | undefined {
  const cleaned = value
    .replace(/^[\s:：,，"'“”]+/u, "")
    .replace(/(?:开关|复选框|单选框|选项|checkbox|radio|switch|toggle)$/iu, "")
    .replace(/[\s。？！?!,，；;：:"'“”]+$/u, "")
    .trim();
  return cleaned || undefined;
}

function parseSelectOptionRequest(taskText: string): { query: string; value: string } | undefined {
  const trimmed = taskText.trim();
  const patterns: Array<{ pattern: RegExp; queryIndex: number; valueIndex: number }> = [
    { pattern: /^(?:请|帮我)?\s*(?:把|将)?\s*(.+?)\s*(?:选择为|设置为|切换为|选为|设为|改为|选择)\s*[“"']?(.+?)[”"']?$/iu, queryIndex: 1, valueIndex: 2 },
    { pattern: /^(?:请|帮我)?\s*(?:在|从)?\s*(.+?)\s*(?:下拉框|选择框|列表|菜单)?(?:中|里)?\s*(?:选择|选中)\s*[“"']?(.+?)[”"']?$/iu, queryIndex: 1, valueIndex: 2 },
    { pattern: /^(?:select|choose|set)\s+["']?(.+?)["']?\s+(?:in|from|for|on)\s+(.+)$/iu, queryIndex: 2, valueIndex: 1 },
    { pattern: /^(?:set|change|switch)\s+(.+?)\s+to\s+["']?(.+?)["']?$/iu, queryIndex: 1, valueIndex: 2 }
  ];
  for (const item of patterns) {
    const match = trimmed.match(item.pattern);
    if (!match) continue;
    const query = cleanFieldText(match[item.queryIndex] ?? "");
    const value = cleanInputValue(match[item.valueIndex] ?? "");
    if (query && value) return { query, value };
  }
  return undefined;
}

function parseFieldFillRequest(taskText: string): { query: string; value: string } | undefined {
  const trimmed = taskText.trim();
  const patterns: Array<{ pattern: RegExp; queryIndex: number; valueIndex: number }> = [
    { pattern: /^(?:请|帮我)?\s*把\s*[“"']?(.+?)[”"']?\s*(?:输入|填写|填入|键入)(?:到|至|进|在)\s*(.+)$/iu, queryIndex: 2, valueIndex: 1 },
    { pattern: /^(?:请|帮我)?\s*(?:在|往|向)?\s*(.+?)\s*(?:中|里)?(?:输入|填写|填入|键入)\s*[“"']?(.+?)[”"']?$/iu, queryIndex: 1, valueIndex: 2 },
    { pattern: /^(?:type|enter|input)\s+["']?(.+?)["']?\s+(?:into|in|to)\s+(.+)$/iu, queryIndex: 2, valueIndex: 1 },
    { pattern: /^(?:fill(?:\s+in)?|set)\s+(.+?)\s+(?:to|with)\s+["']?(.+?)["']?$/iu, queryIndex: 1, valueIndex: 2 }
  ];
  for (const item of patterns) {
    const match = trimmed.match(item.pattern);
    if (!match) continue;
    const query = cleanFieldText(match[item.queryIndex] ?? "");
    const value = cleanInputValue(match[item.valueIndex] ?? "");
    if (query && value) return { query, value };
  }
  return undefined;
}

function parseFieldClearRequest(taskText: string): { query: string } | undefined {
  const trimmed = taskText.trim();
  const patterns: Array<{ pattern: RegExp; queryIndex: number }> = [
    { pattern: /^(?:请|帮我)?\s*(?:清空|清除|清理|擦除)\s*(.+?)\s*$/iu, queryIndex: 1 },
    { pattern: /^(?:please\s+)?(?:clear|empty|erase)\s+(?:the\s+)?(.+?)\s*$/iu, queryIndex: 1 }
  ];
  for (const item of patterns) {
    const match = trimmed.match(item.pattern);
    if (!match) continue;
    const raw = (match[item.queryIndex] ?? "").trim();
    const query = cleanFieldText(raw) ?? "";
    const genericField = /^(?:输入框|文本框|字段|框|field|input|textbox)$/iu.test(raw);
    if (query || genericField) return { query };
  }
  return undefined;
}

function parseFocusedFieldClearRequest(taskText: string): boolean {
  const trimmed = taskText.trim();
  if (!trimmed) return false;
  return /^(?:请|帮我)?\s*(?:清空|清除|清理|擦除)\s*(?:当前|这个|此|已聚焦|聚焦的|正在编辑的|当前聚焦的)?\s*(?:输入框|文本框|字段|框)\s*$/iu.test(trimmed) ||
    /^(?:please\s+)?(?:clear|empty|erase)\s+(?:the\s+)?(?:current|focused|active|this)\s+(?:field|input|textbox)$/iu.test(trimmed);
}

function parseFieldEnterRequest(taskText: string): { query: string; value: string } | undefined {
  const trimmed = taskText.trim();
  const enterSuffix = String.raw`(?:并|然后|再|之后|,|，|\s+and\s+|\s+then\s+)?\s*(?:按下?|敲|press|hit)?\s*(?:回车|enter|return)\s*(?:键)?`;
  const patterns: Array<{ pattern: RegExp; queryIndex: number; valueIndex: number }> = [
    {
      pattern: new RegExp(String.raw`^(?:请|帮我)?\s*把\s*[“"']?(.+?)[”"']?\s*(?:输入|填写|填入|键入)(?:到|至|进|在)\s*(.+?)\s*${enterSuffix}$`, "iu"),
      queryIndex: 2,
      valueIndex: 1
    },
    {
      pattern: new RegExp(String.raw`^(?:请|帮我)?\s*(?:在|往|向)?\s*(.+?)\s*(?:中|里)?(?:输入|填写|填入|键入)\s*[“"']?(.+?)[”"']?\s*${enterSuffix}$`, "iu"),
      queryIndex: 1,
      valueIndex: 2
    },
    {
      pattern: /^(?:type|enter|input)\s+["']?(.+?)["']?\s+(?:into|in|to)\s+(.+?)\s+(?:and\s+|then\s+)?(?:press|hit)?\s*(?:enter|return)$/iu,
      queryIndex: 2,
      valueIndex: 1
    },
    {
      pattern: /^(?:fill(?:\s+in)?|set)\s+(.+?)\s+(?:to|with)\s+["']?(.+?)["']?\s+(?:and\s+|then\s+)?(?:press|hit)?\s*(?:enter|return)$/iu,
      queryIndex: 1,
      valueIndex: 2
    }
  ];
  for (const item of patterns) {
    const match = trimmed.match(item.pattern);
    if (!match) continue;
    const query = cleanFieldText(match[item.queryIndex] ?? "");
    const value = cleanInputValue(match[item.valueIndex] ?? "");
    if (query && value) return { query, value };
  }
  return undefined;
}

function cleanFieldText(value: string): string | undefined {
  const cleaned = value.replace(/^(?:在|到|the|a|an)\s+/iu, "").replace(/(?:字段|输入框|文本框|框|field|input|textbox)$/iu, "").trim();
  return cleaned.length >= 1 ? cleaned : undefined;
}

function cleanInputValue(value: string): string | undefined {
  const cleaned = value
    .replace(/^[\s:：,，"'“”]+/u, "")
    .replace(/[\s。？！?!,，；;：:"'“”]+$/u, "")
    .trim();
  return cleaned || undefined;
}

function isFastEditableField(control: ControlCandidate): boolean {
  const role = control.role.toLowerCase();
  const hints = control.interactionHints.map((hint) => hint.toLowerCase());
  const type = (control.controlType ?? "").toLowerCase();
  const editable = fieldRoles.has(role) || hints.includes("editable") || hints.includes("textarea") || type === "text" || type === "search";
  return control.visibility === "visible" && !control.disabled && control.confidence >= 0.78 && editable;
}

function isFastSelectableField(control: ControlCandidate): boolean {
  const role = control.role.toLowerCase();
  const hints = control.interactionHints.map((hint) => hint.toLowerCase());
  const type = (control.controlType ?? "").toLowerCase();
  const selectable =
    role === "combobox" ||
    role === "listbox" ||
    type === "select-one" ||
    type === "select-multiple" ||
    hints.includes("select") ||
    hints.includes("select-one") ||
    hints.includes("combobox");
  return control.visibility === "visible" && !control.disabled && control.confidence >= 0.78 && selectable;
}

function isFastStateControl(control: ControlCandidate): boolean {
  const role = control.role.toLowerCase();
  const type = (control.controlType ?? "").toLowerCase();
  const hints = control.interactionHints.map((hint) => hint.toLowerCase());
  const stateful =
    stateControlRoles.has(role) ||
    type === "checkbox" ||
    type === "radio" ||
    hints.includes("checkbox") ||
    hints.includes("radio") ||
    hints.includes("switch") ||
    hints.includes("toggle");
  return control.visibility === "visible" && !control.disabled && control.confidence >= 0.78 && stateful;
}

function isFastExpansionControl(control: ControlCandidate): boolean {
  if (!isFastClickable(control)) return false;
  if (destructiveLabelPattern.test(fieldText(control))) return false;
  return expandedStateForControl(control) !== undefined;
}

function isFastTabControl(control: ControlCandidate): boolean {
  if (!isFastClickable(control)) return false;
  if (destructiveLabelPattern.test(fieldText(control))) return false;
  const role = control.role.toLowerCase();
  const hints = control.interactionHints.map((hint) => hint.toLowerCase());
  return role === "tab" || hints.includes("tab") || hints.includes("tabs") || hints.includes("segment") || hints.includes("segmented");
}

function checkedStateForControl(control: ControlCandidate): boolean | undefined {
  if (typeof control.checked === "boolean") return control.checked;
  if (control.valueState === "checked" || control.valueState === "selected") return true;
  if (control.valueState === "unchecked") return false;
  return undefined;
}

function expandedStateForControl(control: ControlCandidate): boolean | undefined {
  if (control.expandedState === "expanded") return true;
  if (control.expandedState === "collapsed") return false;
  return undefined;
}

function searchFieldScore(control: ControlCandidate, visibleEditableCount: number): number {
  const role = control.role.toLowerCase();
  const type = (control.controlType ?? "").toLowerCase();
  const hints = control.interactionHints.join(" ");
  if (role === "searchbox" || type === "search" || searchFieldPattern.test(hints)) return 1;
  if (searchFieldPattern.test(fieldText(control))) return 0.86;
  return visibleEditableCount === 1 ? 0.64 : 0;
}

function uniqueSearchSubmitControl(
  field: ControlCandidate,
  controls: ControlCandidate[],
  forms: FormSnapshot[]
): ControlCandidate | undefined {
  const form = field.formRef ? forms.find((candidate) => candidate.semanticId === field.formRef) : undefined;
  const formSubmitRefs = new Set(form?.submitControlRefs ?? []);
  const sameFormControls = controls.filter((control) => field.formRef && control.formRef === field.formRef);
  const searchButtons = controls
    .filter(isFastSearchSubmitControl)
    .map((control) => ({
      control,
      score:
        submitControlScore(control) +
        (formSubmitRefs.has(control.semanticId) ? 0.5 : 0) +
        (field.formRef && control.formRef === field.formRef ? 0.36 : 0) +
        (!field.formRef && sameFormControls.length === 0 ? proximityScore(field, control) : 0)
    }))
    .filter((candidate) => candidate.score >= 0.74)
    .sort((left, right) => right.score - left.score || right.control.confidence - left.control.confidence);

  const [best, second] = searchButtons;
  if (!best) return undefined;
  if (second && Math.abs(best.score - second.score) < 0.12) return undefined;
  return best.control;
}

function isFastSearchSubmitControl(control: ControlCandidate): boolean {
  const role = control.role.toLowerCase();
  const type = (control.controlType ?? "").toLowerCase();
  const hints = control.interactionHints.join(" ");
  const clickable =
    control.visibility === "visible" &&
    !control.disabled &&
    control.confidence >= 0.75 &&
    (role === "button" || type === "submit" || type === "button" || control.interactionHints.some((hint) => hint.toLowerCase() === "submit"));
  return clickable && (searchSubmitPattern.test(fieldText(control)) || searchSubmitPattern.test(hints) || type === "submit");
}

function submitControlScore(control: ControlCandidate): number {
  const type = (control.controlType ?? "").toLowerCase();
  const hints = control.interactionHints.join(" ");
  if (searchSubmitPattern.test(control.label) || searchSubmitPattern.test(control.accessibleName)) return 1;
  if (type === "submit" || searchSubmitPattern.test(hints)) return 0.82;
  return 0.62;
}

function proximityScore(field: ControlCandidate, submit: ControlCandidate): number {
  if (!field.bounds || !submit.bounds) return 0;
  const fieldCenterY = field.bounds.y + field.bounds.height / 2;
  const submitCenterY = submit.bounds.y + submit.bounds.height / 2;
  const verticalDistance = Math.abs(fieldCenterY - submitCenterY);
  if (verticalDistance > Math.max(field.bounds.height, submit.bounds.height) * 1.6) return 0;
  const submitIsNearRight = submit.bounds.x >= field.bounds.x + field.bounds.width - 8;
  return submitIsNearRight ? 0.28 : 0.16;
}

function fieldMatchScore(control: ControlCandidate, queryKey: string): number {
  const exactParts = [control.label, control.accessibleName, control.description ?? ""].map(normalize).filter(Boolean);
  if (exactParts.some((part) => part === queryKey)) return 1;
  if (exactParts.some((part) => part.includes(queryKey) || queryKey.includes(part))) return 0.86;

  const locatorScore = control.locatorHints
    .map((hint) => ({ text: normalize(hint.value), confidence: hint.confidence ?? 0.6 }))
    .filter((hint) => hint.text.length > 0)
    .reduce((best, hint) => {
      const matched = hint.text === queryKey ? 0.76 : hint.text.includes(queryKey) || queryKey.includes(hint.text) ? 0.62 : 0;
      return Math.max(best, matched * hint.confidence);
    }, 0);
  return locatorScore;
}

function fieldText(control: ControlCandidate): string {
  return `${control.label} ${control.accessibleName} ${control.description ?? ""} ${control.controlType ?? ""} ${control.interactionHints.join(" ")}`;
}

function webSearchUrl(taskText: string, pageUrl: string, controls: ControlCandidate[]): string | undefined {
  const query = searchQueryForTask(taskText);
  if (!query) return undefined;
  if (localSearchContextPattern.test(taskText)) return undefined;
  if (!canUsePageLevelSearch(pageUrl, controls)) return undefined;

  const encoded = encodeURIComponent(query);
  const lower = taskText.toLowerCase();
  if (/百度|baidu/iu.test(taskText)) return `https://www.baidu.com/s?wd=${encoded}`;
  if (/必应|\bbing\b/iu.test(taskText)) return `https://www.bing.com/search?q=${encoded}`;
  if (/谷歌|\bgoogle\b/iu.test(lower)) return `https://www.google.com/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

function searchQueryForTask(taskText: string): string | undefined {
  const trimmed = taskText.trim();
  const patterns = [
    /^(?:帮我|请)?\s*(?:(?:在|用)\s*)?(?:百度|谷歌|google|必应|bing)?\s*(?:搜索|搜一下|搜|查询|查一下|查查|检索)\s*(.+)$/iu,
    /^(?:please\s+)?(?:search(?:\s+the\s+web)?(?:\s+for)?|google|bing|look\s+up)\s+(.+)$/iu
  ];
  for (const pattern of patterns) {
    const query = trimmed.match(pattern)?.[1];
    const normalized = cleanSearchQuery(query ?? "");
    if (normalized) return normalized;
  }
  return undefined;
}

function cleanSearchQuery(value: string): string | undefined {
  const cleaned = value
    .replace(/^[\s:：,，]+/u, "")
    .replace(/[\s。？！?!,，；;：:]+$/u, "")
    .trim();
  if (cleaned.length < 2) return undefined;
  if (explicitTaskUrl(cleaned)) return undefined;
  return cleaned;
}

function canUsePageLevelSearch(pageUrl: string, controls: ControlCandidate[]): boolean {
  if (isBrowserInternalUrl(pageUrl)) return true;
  return controls.filter((control) => control.visibility === "visible" && !control.disabled).length === 0;
}

function isBrowserInternalUrl(pageUrl: string): boolean {
  try {
    const current = new URL(pageUrl);
    return current.protocol === "chrome:" || current.protocol === "edge:" || current.protocol === "about:" || current.protocol === "devtools:";
  } catch {
    return true;
  }
}

function activationDecision(input: {
  source: FastPathDecision["source"];
  control: ControlCandidate;
  expectedOutcome: string;
  reasoningSummary: string;
}): FastPathDecision {
  const targetGoal = input.control.label || input.control.accessibleName;
  const expandable = isExpandableActivationTarget(input.control);
  const riskHint = activationRiskHint(input.control);
  return {
    source: input.source,
    command: {
      id: createEventId(),
      type: "ActivateTarget",
      targetGoal,
      inputs: { semanticId: input.control.semanticId, label: targetGoal },
      expectedOutcome: expandable ? "The target navigation menu is expanded and reveals its child targets." : input.expectedOutcome,
      successCriteria: expandable ? ["menu_expanded", "child_target_visible"] : ["target_visible"],
      riskHint,
      fallbackHints: []
    },
    reasoningSummary: input.reasoningSummary
  };
}

function activationRiskHint(control: ControlCandidate): SemanticCommand["riskHint"] {
  return destructiveLabelPattern.test(fieldText(control)) ? "high" : "low";
}

function isExpandableActivationTarget(control: ControlCandidate): boolean {
  if ((control.childRefs?.length ?? 0) > 0) return true;
  if (control.expandedState === "collapsed") return true;
  if (control.expandedState === "unknown" && isFastNavigationClickable(control)) return true;
  return false;
}

function explicitTaskUrl(taskText: string): string | undefined {
  const match = taskText.match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i)?.[0];
  if (match) return normalizedHttpUrl(match);

  const bare = bareTaskUrl(taskText);
  if (!bare) return undefined;
  return normalizedHttpUrl(`https://${bare}`);
}

function explicitKeyboardKey(taskText: string): string | undefined {
  if (!keyPressIntentPattern.test(taskText) || negativeKeyPressPattern.test(taskText)) return undefined;
  if (compoundTextEntryKeyPattern.test(taskText)) return undefined;
  const normalized = taskText.toLowerCase();
  if (/(回车|enter|return)/iu.test(normalized)) return "Enter";
  if (/(esc|escape|退出键|取消键)/iu.test(normalized)) return "Escape";
  if (/(tab|制表键?)/iu.test(normalized)) return "Tab";
  if (/(空格|space(?:bar)?)/iu.test(normalized)) return " ";
  if (/(上箭头|向上键|arrow\s*up)/iu.test(normalized)) return "ArrowUp";
  if (/(下箭头|向下键|arrow\s*down)/iu.test(normalized)) return "ArrowDown";
  if (/(左箭头|向左键|arrow\s*left)/iu.test(normalized)) return "ArrowLeft";
  if (/(右箭头|向右键|arrow\s*right)/iu.test(normalized)) return "ArrowRight";
  return undefined;
}

function normalizedHttpUrl(value: string): string | undefined {
  const trimmed = value.replace(/[\u3001\u3002\uff0c\uff1b\uff1a.,;:)\]}]+$/u, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function bareTaskUrl(taskText: string): string | undefined {
  const match = taskText.match(
    /(?:^|[\s\u3000（(：:])((?:localhost|\d{1,3}(?:\.\d{1,3}){3}|(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,})(?::\d{2,5})?(?:\/[^\s\u3000）),，。；;]*)?)/iu
  )?.[1];
  if (!match) return undefined;

  const trimmedTask = taskText.trim();
  const taskIsOnlyUrl = normalize(trimmedTask) === normalize(match);
  if (!taskIsOnlyUrl && !urlNavigationIntentPattern.test(taskText)) return undefined;
  return match.replace(/[\u3001\u3002\uff0c\uff1b\uff1a.,;:)\]}]+$/u, "");
}

function shouldNavigateToUrl(pageUrl: string, targetUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const current = new URL(pageUrl);
    const browserInternalPage = current.protocol === "chrome:" || current.protocol === "edge:" || current.protocol === "about:" || current.protocol === "devtools:";
    return browserInternalPage || current.href !== target.href;
  } catch {
    return true;
  }
}

function exactVisibleControl(taskText: string, controls: ControlCandidate[]): ControlCandidate | undefined {
  if (!actionIntentPattern.test(taskText) || negativeIntentPattern.test(taskText)) return undefined;

  const taskKey = normalize(taskText);
  const candidates = controls
    .filter(isFastClickable)
    .map((control) => ({ control, labelKey: normalize(control.label || control.accessibleName) }))
    .filter((candidate) => candidate.labelKey.length >= 2 && taskKey.includes(candidate.labelKey))
    .sort((left, right) => right.labelKey.length - left.labelKey.length || right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second && second.labelKey.length === best.labelKey.length) return undefined;
  if (candidates.filter((candidate) => candidate.labelKey === best.labelKey).length > 1) return undefined;
  return best.control;
}

function semanticNavigationControlFor(taskText: string, controls: ControlCandidate[]): ControlCandidate | undefined {
  if (!actionIntentPattern.test(taskText) || negativeIntentPattern.test(taskText)) return undefined;

  const taskCore = navigationCore(taskText);
  if (taskCore.length < 2) return undefined;

  const candidates = controls
    .filter(isFastNavigationClickable)
    .filter((control) => !destructiveLabelPattern.test(control.label || control.accessibleName))
    .map((control) => ({ control, labelCore: navigationCore(control.label || control.accessibleName) }))
    .filter((candidate) => candidate.labelCore.length >= 2 && candidate.labelCore === taskCore)
    .sort((left, right) => right.control.confidence - left.control.confidence);

  const [best, second] = candidates;
  if (!best) return undefined;
  if (second) return undefined;
  return best.control;
}

function isFastClickable(control: ControlCandidate): boolean {
  return (
    control.visibility === "visible" &&
    !control.disabled &&
    control.confidence >= 0.75 &&
    clickableRoles.has(control.role.toLowerCase())
  );
}

function isFastNavigationClickable(control: ControlCandidate): boolean {
  if (!isFastClickable(control)) return false;
  const role = control.role.toLowerCase();
  if (navigationRoles.has(role)) return true;
  if (control.regionRef === "sidebar" || control.regionRef === "navigation") return true;
  if (control.expandedState && control.expandedState !== "unknown") return true;
  return control.interactionHints.some((hint) => navigationHintPattern.test(hint));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").trim();
}

function navigationCore(value: string): string {
  let text = value.toLowerCase();
  for (const term of chineseActionTerms) {
    text = text.replace(new RegExp(escapeRegExp(term), "giu"), " ");
  }
  for (const term of englishActionTerms) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, "giu"), " ");
  }
  for (const term of chineseNavigationTerms) {
    text = text.replace(new RegExp(escapeRegExp(term), "gu"), " ");
  }
  for (const term of englishNavigationTerms) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(term)}\\b`, "giu"), " ");
  }
  return normalize(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
