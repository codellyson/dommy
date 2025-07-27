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
  browser.runtime.onMessage.addListener(async (message, sender) => {
    if (
      message.type === "ELEMENT_CLICKED" ||
      message.type === "ELEMENT_UNCLICKED"
    ) {
      // Forward messages to popup if it's open
      browser.runtime.sendMessage(message).catch(() => {
        // Popup might not be open, ignore error
      });
    } else if (message.type === "GENERATE_CLONE_CODE") {
      // Handle AI code generation requests
      try {
        const { elementCode, targetFramework, tabId } = message;

        // Import the AI service dynamically
        const { default: aiService } = await import("./ai-service.ts");

        const response = await aiService.generateCloneCode({
          element: {
            code: elementCode.html,
            blobURL: elementCode.blobURL,
          },
          targetFramework: targetFramework || "html",
          includeStyles: true,
          includeInteractions: true,
        });

        console.log("Background: AI response received:", {
          codeLength: response.code?.length || 0,
          framework: response.framework,
          description: response.description,
        });

        // Send the generated code back to the content script
        console.log("sender tab id", sender.tab?.id, tabId);
        if (tabId) {
          const message = {
            type: "CLONE_CODE_GENERATED",
            code: response.code,
            framework: response.framework,
            description: response.description,
            dependencies: response.dependencies,
          };

          console.log("Background: Sending message to content script:", {
            messageType: message.type,
            codeLength: message.code?.length || 0,
          });

          await browser.tabs.sendMessage(tabId, message);
        }
      } catch (error) {
        console.error("Failed to generate clone code:", error);
        const { tabId } = message;

        // Send error back to content script
        if (tabId) {
          console.log("Sent Ai error response to Content Script");
          await browser.tabs.sendMessage(tabId, {
            type: "CLONE_CODE_ERROR",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else if (message.type === "SET_API_TOKEN") {
      // Handle API token setting
      try {
        const { default: aiService } = await import("./ai-service.ts");
        await aiService.setApiToken(message.token, message.accountId);

        // Send success response
        if (sender.tab?.id) {
          await browser.tabs.sendMessage(sender.tab.id, {
            type: "API_TOKEN_SET_SUCCESS",
          });
        }
      } catch (error) {
        console.error("Failed to set API token:", error);

        if (sender.tab?.id) {
          await browser.tabs.sendMessage(sender.tab.id, {
            type: "API_TOKEN_SET_ERROR",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else if (message.type === "OPEN_SIDE_PANEL") {
      if (sender.tab?.id) {
        await browser.sidePanel.open({
          tabId: sender?.tab.id!,
        });
      }
    }
  });
});
