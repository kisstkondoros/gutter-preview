# Image Preview - Visual Studio Code Extension

Shows image preview in the gutter and on hover

## It looks like this

![Demonstrating svg image preview in a css file](https://raw.githubusercontent.com/kisstkondoros/gutter-preview/master/images/sample.png)

## Install

[How to install Visual Studio Code extensions](https://code.visualstudio.com/docs/editor/extension-gallery)

[Direct link to Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=kisstkondoros.vscode-gutter-preview)

### Change Log
 - 0.11.3
   - Add missing protocol check
 - 0.11.2
   - Updated the python regex to account for lines with multiple strings
 - 0.11.1
   - Remove path separator replacements
 - 0.11.0
   - Added a python image filename recognizer
 - 0.10.2
   - Provide fallback for http hosted images
 - 0.10.1
   - Attempt to fix path join on macOS Sierra
 - 0.10.0
   - Add info about image size to hover preview
   - Show hover preview without file type restriction
 - 0.9.1
   - Ignore workspace relative url mapper when there is no workspace at all
 - 0.9.0
   - Support images in markdown files
 - 0.8.0
   - Change Extension name to Image Preview
   - Add option ("showimagepreviewongutter") to disable image preview on the gutter
 - 0.7.2
   - Set image height on supported vscode versions
 - 0.7.1
   - Update changelog
 - 0.7.0
   - Add http scheme for // urls
 - 0.6.2
   - Run recognition also when the activeTextEditor is changed
   - Fix image url detection RegExp
 - 0.6.1
   - Support old and new RenderOptions API
 - 0.6.0
   - Add image src recognizer
 - 0.5.0
   - Added "gutterpreview.sourcefolder" configuration variable
 - 0.4.1
   - Add image hover provider to scss files as well
 - 0.4.0
   - Add html to supported file types
   - Dedupe recognized urls
   - Format source code
   - Add http/https url matcher
   - Fix file url creation
 - 0.3.0
   - Support data URI's in hover widget
 - 0.2.3
   - VSCode engine dependency changed to allow further versions
 - 0.2.2
   - Hack is now unnecessary it was removed from the readme
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
