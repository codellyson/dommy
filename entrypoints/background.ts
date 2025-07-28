export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      const result = await browser.storage.local.get(["isElementSelected"]);
      const newState = !result.isElementSelected;

      await browser.storage.local.set({ isElementSelected: newState });

      await browser.tabs.sendMessage(tab.id, {
        type: "TOGGLE_ELEMENT_SELECTION",
        isElementSelected: newState,
      });
    }
  });

  browser.runtime.onMessage.addListener(async (message, sender) => {
    if (
      message.type === "ELEMENT_CLICKED" ||
      message.type === "ELEMENT_UNCLICKED"
    ) {
      browser.runtime.sendMessage(message).catch(() => {});
    } else if (message.type === "GENERATE_CLONE_CODE") {
      try {
        const { elementCode, targetFramework, tabId } = message;

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

        if (tabId) {
          console.log("Sent Ai error response to Content Script");
          await browser.tabs.sendMessage(tabId, {
            type: "CLONE_CODE_ERROR",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else if (message.type === "SET_AI_PROVIDER") {
      try {
        const { default: aiService } = await import("./ai-service.ts");
        /**
         * This can be the following:
         *  {
         *    aiFeaturesEnabled: true,
         *    aiProvider: "google",
         *    googleApiKey: "",
         *    googleModel: "gemini-1.5-pro",
         *  }
         *
         *  {
         *    aiFeaturesEnabled: true,
         *    aiProvider: "openai",
         *    openaiApiKey: "",
         *    openaiModel: "gpt-4o-mini",
         *  }
         *
         *  {
         *    aiFeaturesEnabled: true,
         *    aiProvider: "anthropic",
         *    anthropicApiKey: "",
         *    anthropicModel: "claude-3-5-sonnet-20240620",
         *  }
         *
         *  {
         *    aiFeaturesEnabled: true,
         *    aiProvider: "cloudflare",
         *    cloudflareApiKey: "",
         *    cloudflareModel: "claude-3-5-sonnet-20240620",
         *  }
         *  {
         *    aiFeaturesEnabled: false,
         *    aiProvider:'huggingface',
         *    huggingfaceApiKey: "",
         *    huggingfaceModel: "google/gemini-2.0-flash-001",
         * }
         *
         */
        await aiService.setAiProvider({
          aiFeaturesEnabled: message.settings.aiFeaturesEnabled,
          aiProvider: message.settings.aiProvider,
          aiToken:
            message.settings.googleApiKey ||
            message.settings.openaiApiKey ||
            message.settings.anthropicApiKey ||
            message.settings.cloudflareApiKey ||
            message.settings.huggingfaceApiKey,
          aiAccountId:
            message.settings.googleAccountId ||
            message.settings.openaiAccountId ||
            message.settings.anthropicAccountId ||
            message.settings.cloudflareAccountId ||
            message.settings.huggingfaceAccountId,
          aiModel:
            message.settings.googleModel ||
            message.settings.openaiModel ||
            message.settings.anthropicModel ||
            message.settings.cloudflareModel ||
            message.settings.huggingfaceModel,
        });

        if (sender.tab?.id) {
          await browser.tabs.sendMessage(sender.tab.id, {
            type: "SET_AI_PROVIDER",
            settings: message.settings,
          });
        }
      } catch (error) {
        console.error("Failed to set API token:", error);

        if (sender.tab?.id) {
          await browser.tabs.sendMessage(sender.tab.id, {
            type: "SET_AI_PROVIDER_ERROR",
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
