export default defineBackground(() => {
  console.log("Dommy extension background script loaded");

  // Handle extension icon click
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      // Toggle hover mode when icon is clicked
      const result = await browser.storage.local.get(["isElementSelected"]);
      const newState = !result.isElementSelected;

      await browser.storage.local.set({ isElementSelected: newState });

      // Send message to content script
      await browser.tabs.sendMessage(tab.id, {
        type: "TOGGLE_ELEMENT_SELECTION",
        isElementSelected: newState,
      });
    }
  });

  // Handle messages from content scripts
  browser.runtime.onMessage.addListener((message, sender) => {
    if (
      message.type === "ELEMENT_CLICKED" ||
      message.type === "ELEMENT_UNCLICKED"
    ) {
      // Forward messages to popup if it's open
      browser.runtime.sendMessage(message).catch(() => {
        // Popup might not be open, ignore error
      });
    }
  });
});
