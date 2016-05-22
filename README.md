# Gutter Preview - Visual Studio Code Extension

Shows image preview in the gutter

## Hacking the CSS of VSCode
Until [this](https://github.com/Microsoft/vscode/pull/6553) is not merged / fixed in an other way, the following workaround needs to be applied.
  
- Open file C:/Program Files (x86)/Microsoft VS Code/resources/app/out/vs/workbench/workbench.main.css
- Insert this at the end:
```css
.monaco-editor .margin-view-overlays .cgmr {
  background-size: contain !important;
}
``` 

## Install

[How to install Visual Studio Code extensions](https://code.visualstudio.com/docs/editor/extension-gallery)

[Direct link to Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=kisstkondoros.vscode-gutter-preview)

### Change Log
- 0.0.1
  - Initial project setup

### License

Licensed under MIT
