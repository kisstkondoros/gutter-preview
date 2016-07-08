# Gutter Preview - Visual Studio Code Extension

Shows image preview in the gutter

## It looks like this

![Demonstrating svg image preview in a css file](https://raw.githubusercontent.com/kisstkondoros/gutter-preview/master/images/sample.png)

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
 - 0.2.1
   - Readme updated  
 - 0.2.0 
   - code restricted to work on css/scss/less files
   - hacks removed
- 0.1.0
  - Image preview shown on hover as well
- 0.0.3
  - Displayname fixed
- 0.0.2
  - Sample image attached
- 0.0.1
  - Initial project setup

### License

Licensed under MIT
