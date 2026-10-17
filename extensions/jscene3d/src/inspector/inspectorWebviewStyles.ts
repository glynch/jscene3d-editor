/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Theme-aware styles for the persistent Inspector webview document. */
export const inspectorWebviewStyles = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
body { color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: var(--vscode-font-size) var(--vscode-font-family); }
button, input, select { font: inherit; }
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.message-shell { position: fixed; inset: 0; display: grid; place-items: center; padding: 28px; text-align: center; }
.message-content { max-width: 260px; color: var(--vscode-descriptionForeground); }
.message-icon { width: 42px; height: 42px; margin: 0 auto 12px; color: var(--vscode-disabledForeground); }
.message-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.25; }
.message-title { margin: 0 0 6px; color: var(--vscode-foreground); font-size: 1.05em; font-weight: 600; }
.message-detail { margin: 0; line-height: 1.45; }
.inspector-shell { position: fixed; inset: 0; min-height: 0; display: grid; grid-template-rows: 35px minmax(0, 1fr); overflow: hidden; }
.inspector-toolbar { display: flex; align-items: center; gap: 8px; padding: 0 10px; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); background: var(--vscode-sideBarSectionHeader-background); }
.inspector-title { min-width: 0; flex: 1; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.inspector-readonly { color: var(--vscode-descriptionForeground); font-size: .86em; }
.inspector-menu, .component-action, .resource-action { display: grid; place-items: center; border: 0; color: var(--vscode-icon-foreground); background: transparent; }
.inspector-menu { width: 24px; height: 24px; font-size: 18px; }
.inspector-menu:disabled, .component-action:disabled, .resource-action:disabled { opacity: .62; }
.inspector-scroll { min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 7px 7px 14px; }
.entity-card { padding: 1px 1px 8px; }
.entity-primary { display: grid; grid-template-columns: 24px 16px minmax(70px, 1fr) auto; gap: 5px; align-items: center; }
.entity-icon, .component-icon { display: grid; place-items: center; color: var(--vscode-icon-foreground); }
.entity-icon { width: 22px; height: 22px; }
.entity-icon svg, .component-icon svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.35; stroke-linecap: round; stroke-linejoin: round; }
.entity-name, .property-input, .deferred-select, .resource-field, .property-component-value, .property-component-input { min-width: 0; height: 24px; border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); }
.entity-name { width: 100%; padding: 2px 6px; font-weight: 600; }
.entity-name[readonly] { color: var(--vscode-foreground); }
.check-label { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.property-checkbox, .deferred-checkbox { width: 15px; height: 15px; margin: 0; accent-color: var(--vscode-checkbox-selectBackground); }
.deferred-control { color: var(--vscode-disabledForeground); opacity: .78; }
.entity-metadata { display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr); gap: 5px; align-items: center; margin-top: 7px; }
.metadata-label { color: var(--vscode-descriptionForeground); }
.deferred-select { width: 100%; padding: 1px 24px 1px 6px; color: var(--vscode-disabledForeground); }
.component-stack { display: grid; gap: 4px; }
.component-card { overflow: hidden; border: 1px solid var(--vscode-sideBarSectionHeader-border); border-radius: 3px; background: color-mix(in srgb, var(--vscode-sideBar-background) 88%, var(--vscode-editor-background)); }
.component-card[open] { box-shadow: 0 1px 2px color-mix(in srgb, var(--vscode-widget-shadow) 35%, transparent); }
.component-header { min-height: 30px; display: grid; grid-template-columns: 10px 18px minmax(0, 1fr) auto; gap: 5px; align-items: center; padding: 3px 3px 3px 6px; color: var(--vscode-foreground); background: var(--vscode-sideBarSectionHeader-background); cursor: pointer; list-style: none; }
.component-header::-webkit-details-marker { display: none; }
.component-disclosure { color: var(--vscode-icon-foreground); font-size: 10px; transform: rotate(-90deg); transition: transform 90ms ease; }
.component-card[open] .component-disclosure { transform: rotate(0deg); }
.component-icon { width: 16px; height: 16px; }
.component-name { min-width: 0; font-size: .96em; font-weight: 600; line-height: 1.2; white-space: normal; overflow-wrap: anywhere; }
.component-actions { display: flex; align-items: center; }
.component-action { width: 20px; height: 20px; padding: 2px; border-radius: 2px; font-size: 13px; }
.component-action:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); }
.component-body { padding: 4px 7px 6px; border-top: 1px solid color-mix(in srgb, var(--vscode-sideBarSectionHeader-border) 65%, transparent); }
.component-warning { margin: 0 0 5px; color: var(--vscode-problemsWarningIcon-foreground); font-size: .9em; }
.property { display: grid; grid-template-columns: clamp(72px, 34%, 108px) minmax(0, 1fr); gap: 6px; align-items: start; min-height: 27px; padding: 2px 0; }
.property.modified { margin: 0 -4px; padding-right: 4px; padding-left: 5px; border-left: 2px solid var(--vscode-settings-modifiedItemIndicator, var(--vscode-focusBorder)); background: color-mix(in srgb, var(--vscode-settings-modifiedItemIndicator, var(--vscode-focusBorder)) 7%, transparent); }
.property:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
.property-label { min-width: 0; padding-top: 3px; color: var(--vscode-foreground); line-height: 1.25; overflow-wrap: anywhere; }
.property-value { min-width: 0; color: var(--vscode-descriptionForeground); text-align: right; overflow-wrap: anywhere; user-select: text; }
.property-input { width: 100%; padding: 2px 5px; }
.property-input.validation-error, .property-component-input.validation-error { border-color: var(--vscode-inputValidation-errorBorder); outline-color: var(--vscode-inputValidation-errorBorder); }
.property-validation { margin-top: 2px; color: var(--vscode-inputValidation-errorForeground); font-size: .85em; line-height: 1.2; text-align: left; }
.property-validation[hidden] { display: none; }
.property-components { display: grid; grid-template-columns: repeat(auto-fit, minmax(38px, 1fr)); gap: 3px; }
.property-component { min-width: 0; display: grid; grid-template-columns: 13px minmax(0, 1fr); align-items: center; }
.property-component-label { color: var(--vscode-descriptionForeground); font-size: .82em; text-align: left; }
.property-component-value { width: 100%; padding: 2px 4px; color: var(--vscode-input-foreground); text-align: right; }
.property-component-input { width: 100%; padding: 2px 4px; text-align: right; }
.property-component .property-validation { grid-column: 1 / -1; }
.resource-control { display: flex; min-width: 0; }
.resource-field { min-width: 0; flex: 1; overflow: hidden; padding: 3px 6px; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.resource-action { width: 24px; height: 24px; margin-left: 3px; border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; }
.badges { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.badge { padding: 1px 4px; border-radius: 2px; font-size: .8em; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); }
.badge.problem { color: var(--vscode-inputValidation-errorForeground); background: var(--vscode-inputValidation-errorBackground); }
.add-component { width: 100%; height: 28px; margin-top: 7px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
.add-component:disabled { color: var(--vscode-disabledForeground); }
@media (max-width: 280px) {
	.entity-primary { grid-template-columns: 22px 16px minmax(48px, 1fr); }
	.entity-static { grid-column: 3; }
	.entity-metadata { grid-template-columns: 34px minmax(0, 1fr); }
}
@media (max-width: 220px) {
	.property { grid-template-columns: 1fr; gap: 2px; }
	.property-label { padding-top: 0; }
}
`;
