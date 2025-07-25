You're looking to build a Chrome extension that:

Activates on demand (e.g. via a popup toggle or icon click).

Allows hovering over DOM elements on any page, highlighting them visually.

Lets you screenshot the highlighted DOM element.

# Feature Breakdown

1. Toggle Extension
   A popup with a switch/button to enable or disable hover mode.

2. Highlight on Hover
   When enabled, mouseover any element on the page gives it a border (e.g., red outline).

Store the currently hovered element in memory for screenshotting.

3. Screenshot the Element
   Use html2canvas or Chrome’s captureVisibleTab for screenshots.

Limit capture to the bounding box of the hovered DOM element.

This is a developer tool

TODO:

- [ ] For any selected element, show a pane with the element's HTML, CSS, and JavaScript
- [ ] For any selected element, I should be able to click on a button to copy the element's HTML, CSS, and JavaScript to the clipboard
- [ ] The highlight frame shoould have a glassmorphism effect
- [ ] The code frame shoould look like a code editor
