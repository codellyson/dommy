export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    let isElementSelected = false;
    let currentHoveredElement: HTMLElement | null = null;
    let originalStyles: { [key: string]: string } = {};
    let codePanel: HTMLElement | null = null;
    let activeTab = 0;
    let popupIsOpen = false;
    const actionEvents = ["click", "mousedown"] as const;

    // Load initial state from storage
    browser.storage.local.get(["isElementSelected"]).then((result) => {
      isElementSelected = result.isElementSelected || false;
      if (isElementSelected) {
        document.addEventListener("click", handleClick, true);
      }
    });

    // Listen for messages from popup
    browser.runtime.onMessage.addListener((message) => {
      console.log("Content script received message:", message);
      if (message.type === "TOGGLE_ELEMENT_SELECTION") {
        isElementSelected = message.isElementSelected;
        if (isElementSelected && !popupIsOpen) {
          document.addEventListener("click", handleClick, true);
        } else {
          document.removeEventListener("click", handleClick, true);
          // Remove any existing highlights and code panel
          if (currentHoveredElement) {
            removeHighlight(currentHoveredElement);
            currentHoveredElement = null;
          }
          removeCodePanel();
        }
      } else if (message.type === "TAKE_ELEMENT_SCREENSHOT") {
        takeScreenshot();
      } else if (message.type === "POPUP_OPENED") {
        console.log("Content script: Popup opened, setting popupIsOpen = true");
        popupIsOpen = true;
        // Remove any existing code panel when popup opens
        removeCodePanel();
        // Disable element selection when popup is open
        document.removeEventListener("click", handleClick, true);
      } else if (message.type === "POPUP_CLOSED") {
        console.log(
          "Content script: Popup closed, setting popupIsOpen = false"
        );
        popupIsOpen = false;
        // Re-enable element selection if it was enabled before
        if (isElementSelected) {
          document.addEventListener("click", handleClick, true);
        }
      } else if (message.type === "HIDE_ELEMENT_FROM_SCREENSHOT") {
        if (currentHoveredElement) {
          hideElementFromScreenshot(currentHoveredElement);
        }
      } else if (message.type === "SHOW_ELEMENT_IN_SCREENSHOT") {
        if (currentHoveredElement) {
          showElementInScreenshot(currentHoveredElement);
        }
      } else if (message.type === "HIDE_ELEMENTS_BY_SELECTOR") {
        hideElementsBySelector(message.selector);
      } else if (message.type === "CLONE_CODE_GENERATED") {
        console.log("AI code generated successfully:", {
          framework: message.framework,
          description: message.description,
          codeLength: message.code?.length || 0,
        });
        console.log("Full AI response code:", message.code);
        // Update the Clone with Jamiu tab with generated code
        updateCloneWithJamiuTab(
          message.code,
          message.framework,
          message.description
        );
      } else if (message.type === "CLONE_CODE_ERROR") {
        console.error("AI code generation failed:", message.error);
        // Show error in the Clone with Jamiu tab
        updateCloneWithJamiuTabWithError(message.error);
      }
    });

    function handleClick(event: MouseEvent) {
      // debugger;
      event.stopPropagation();
      const target = event.target as HTMLElement;
      console.log("target", target);
      if (
        target &&
        target.tagName &&
        target !== document.body &&
        target !== document.documentElement &&
        !target.closest("#dommy-code-panel") && // Don't select the code panel itself
        !target.closest(".code-tab") && // Don't select tab elements
        !target.closest(".copy-btn") && // Don't select copy buttons
        !target.closest("button") && // Don't select any buttons
        !target.closest("pre") && // Don't select code editor
        !target.closest("code") && // Don't select code elements
        !target.closest(".close-btn") // Don't select close button
      ) {
        console.log(
          "Content script: Element clicked, popupIsOpen =",
          popupIsOpen
        );

        // Always remove previous highlight first
        if (currentHoveredElement) {
          removeHighlight(currentHoveredElement);
        }
        removeCodePanel();

        // Add glassmorphism highlight to new element
        highlightElement(target);
        currentHoveredElement = target;

        // Extract element code
        const elementCode = extractElementCode(target);

        // Send element info to popup
        const elementInfo = getElementInfo(target);
        browser.runtime.sendMessage({
          type: "ELEMENT_CLICKED",
          elementInfo: elementInfo,
          elementCode: elementCode,
        });

        // Always show content script code panel, but make it smaller when popup is open
        console.log("Content script: Showing code panel");
        showCodePanel(target, elementCode, popupIsOpen).catch((error) => {
          console.error("Failed to show code panel:", error);
        });
      }

      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    function highlightElement(element: HTMLElement) {
      if (!element || !element.tagName) {
        console.warn("Cannot highlight invalid element");
        return;
      }

      // Store original styles
      originalStyles[element.outerHTML] = element.style.cssText;

      // Apply glassmorphism highlight styles
      element.style.outline = "3px solid rgba(1, 152, 246, 0.8)";
      element.style.outlineOffset = "2px";
      element.style.cursor = "crosshair";
      element.style.position = "relative";
      element.style.zIndex = "999999";
      element.style.transform = "scale(1.02)";
      element.style.transition = "all 0.3s ease-in-out";
      element.style.backgroundColor = "transparent";
      element.style.backdropFilter = "blur(10px)";
      element.style.borderRadius = "8px";
      element.style.boxShadow =
        "0 8px 32px rgba(0, 0, 0, 0.3), " +
        "inset 0 1px 0 rgba(255, 255, 255, 0.1), " +
        "0 0 0 1px rgba(255, 255, 255, 0.2)";

      // Add camera button
      const cameraBtn = document.createElement("div");
      cameraBtn.id = "dommy-camera-btn";
      hideElementFromScreenshot(cameraBtn);
      cameraBtn.innerHTML = "📸";
      cameraBtn.style.cssText = `
        position: absolute;
        top: 0;
        right: 0;
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        color: white;
        box-shadow: 0 4px 12px rgba(238, 90, 36, 0.4);
        transition: all 0.3s ease;
        z-index: 999999;
        backdrop-filter: blur(10px);
      `;

      cameraBtn.addEventListener("mouseover", () => {
        cameraBtn.style.transform = "scale(1.1)";
        cameraBtn.style.boxShadow = "0 6px 16px rgba(238, 90, 36, 0.6)";
      });

      cameraBtn.addEventListener("mouseout", () => {
        cameraBtn.style.transform = "scale(1)";
        cameraBtn.style.boxShadow = "0 4px 12px rgba(238, 90, 36, 0.4)";
      });
      actionEvents.forEach((event) => {
        cameraBtn.addEventListener(event, (e) => {
          e.stopPropagation();
          e.preventDefault();
          console.log("Camera button clicked");
          takeScreenshot();
        });
      });
      element.appendChild(cameraBtn);
    }

    function removeHighlight(element: HTMLElement) {
      if (!element || !element.tagName) {
        console.warn("Cannot remove highlight from invalid element");
        return;
      }

      const key = element.outerHTML;
      if (originalStyles[key]) {
        element.style.cssText = originalStyles[key];
        delete originalStyles[key];
      } else {
        element.style.outline = "";
        element.style.outlineOffset = "";
        element.style.cursor = "";
        element.style.position = "";
        element.style.zIndex = "";
        element.style.transform = "";
        element.style.transition = "";
        element.style.backgroundColor = "";
        element.style.backdropFilter = "";
        element.style.borderRadius = "";
        element.style.boxShadow = "";
      }

      // Remove camera button
      const cameraBtn = element.querySelector("#dommy-camera-btn");
      if (cameraBtn) {
        cameraBtn.remove();
      }
    }

    async function showCodePanel(
      element: HTMLElement,
      elementCode: any,
      isPopupOpen: boolean
    ) {
      removeCodePanel();

      // Check if element is still valid
      if (!element || !element.tagName || !element.isConnected) {
        console.warn("Cannot show code panel for invalid element");
        return;
      }

      // Create code panel container
      codePanel = document.createElement("div");
      codePanel.id = "dommy-code-panel";
      codePanel.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000000;
        pointer-events: none;
      `;

      // Get element position
      const rect = element.getBoundingClientRect();

      // Adjust panel size based on popup state - make it more compact
      const panelWidth = isPopupOpen
        ? Math.min(350, window.innerWidth - 40)
        : Math.min(500, window.innerWidth - 40);
      const panelHeight = isPopupOpen ? 250 : 320;

      // Calculate position (below the element)
      let top = rect.bottom + 10;
      let left = rect.left;

      // Adjust if panel would go off screen
      if (top + panelHeight > window.innerHeight) {
        top = rect.top - panelHeight - 10;
      }
      if (left + panelWidth > window.innerWidth) {
        left = window.innerWidth - panelWidth - 20;
      }
      if (left < 20) {
        left = 20;
      }

      // When popup is open, position the panel to avoid popup area
      if (isPopupOpen) {
        // Position on the right side of the screen to avoid popup
        left = window.innerWidth - panelWidth - 20;
        top = Math.max(
          20,
          Math.min(top, window.innerHeight - panelHeight - 20)
        );
      }

      // Create the actual panel
      const panel = document.createElement("div");
      panel.style.cssText = `
        position: absolute;
        top: ${top}px;
        left: ${left}px;
        width: ${panelWidth}px;
        height: ${panelHeight}px;
        background: rgba(40, 40, 40, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        box-shadow: 
          0 8px 32px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 0 0 1px rgba(255, 255, 255, 0.05);
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Fira Code', monospace;
        font-size: 11px;
        color: #e8e8e8;
        pointer-events: auto;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        opacity: ${isPopupOpen ? "0.9" : "1"};
        backdrop-filter: blur(25px);
        position: relative;
      `;

      // Add glassmorphism overlay
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
        pointer-events: none;
        border-radius: 16px;
        z-index: 1;
      `;
      panel.appendChild(overlay);

      // Create header
      const header = document.createElement("div");
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: rgba(30, 30, 30, 0.8);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        font-weight: 600;
        font-size: 12px;
        backdrop-filter: blur(10px);
        position: relative;
        z-index: 2;
        min-height: 36px;
      `;

      const title = document.createElement("span");
      title.textContent = "Element Code";
      title.style.color = "#fff";
      title.style.textShadow = "0 2px 4px rgba(0, 0, 0, 0.3)";

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      closeBtn.className = "close-btn";
      closeBtn.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fff;
        font-size: 16px;
        cursor: pointer;
        padding: 2px 6px;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
      `;

      actionEvents.forEach((event) => {
        closeBtn.addEventListener(event, (e) => {
          e.stopPropagation();
          e.preventDefault();
          e.stopImmediatePropagation();
          removeCodePanel();
          if (currentHoveredElement) {
            removeHighlight(currentHoveredElement);
            currentHoveredElement = null;
          }
        });
      });

      closeBtn.onmouseover = () => {
        closeBtn.style.background = "rgba(255, 255, 255, 0.2)";
        closeBtn.style.transform = "scale(1.1)";
      };
      closeBtn.onmouseout = () => {
        closeBtn.style.background = "rgba(255, 255, 255, 0.1)";
        closeBtn.style.transform = "scale(1)";
      };

      header.appendChild(title);
      header.appendChild(closeBtn);

      // Create tabs
      const tabs = document.createElement("div");
      tabs.style.cssText = `
        display: flex;
        background: rgba(0, 0, 0, 0.3);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        position: relative;
        z-index: 2;
      `;
      // Initialize AI service
      const { default: aiService } = await import("./ai-service.ts");

      // Generate AI clone code with loading state
      let cloneWithJamiu = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center; background: rgba(50, 50, 50, 0.8); border-radius: 8px;">
          <div style="margin-bottom: 16px;">
            <div style="width: 48px; height: 48px; border: 3px solid #007acc; border-top: 3px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
            <style>
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </div>
          <h3 style="margin: 0 0 8px; color: #fff; font-size: 16px; font-weight: 600;">🤖 Jamiu is working...</h3>
          <p style="margin: 0; color: #ccc; font-size: 12px;">Analyzing element and generating code</p>
          <p style="margin: 8px 0 0; color: #999; font-size: 10px;">This may take a few seconds</p>
          <div style="margin-top: 16px; width: 100%; height: 2px; background: rgba(255, 255, 255, 0.1); border-radius: 1px; overflow: hidden;">
            <div style="width: 30%; height: 100%; background: linear-gradient(90deg, #007acc, #005a9e); animation: loading 2s ease-in-out infinite;"></div>
            <style>
              @keyframes loading {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(400%); }
              }
            </style>
          </div>
        </div>
      `;

      // Start AI code generation
      let elementAnalysis: any = null;
      try {
        elementAnalysis = await aiService.analyzeElement(element);

        // Check if AI features are enabled
        const result = await browser.storage.local.get(["aiFeaturesEnabled"]);
        if (result.aiFeaturesEnabled === false) {
          cloneWithJamiu = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center;">
              <div style="margin-bottom: 16px; color: #ff6b6b; font-size: 24px;">🔒</div>
              <h3 style="margin: 0 0 8px; color: #fff; font-size: 16px;">AI Features Disabled</h3>
              <p style="margin: 0; color: #ccc; font-size: 12px;">Enable AI features in settings to use Jamiu</p>
            </div>
          `;
          return;
        }

        // Send request to background script for AI generation
        browser.runtime
          .sendMessage({
            type: "GENERATE_CLONE_CODE",
            elementAnalysis: elementAnalysis,
            targetFramework: "html", // Default to HTML, can be made configurable
          })
          .then(() => {
            // Update loading state to show request sent
            setTimeout(() => {
              updateLoadingState("Request sent to AI service...");
            }, 1000);
          })
          .catch((error) => {
            console.error("Failed to send AI generation request:", error);
            updateCloneWithJamiuTabWithError(
              "Could not send AI generation request"
            );
          });
      } catch (error) {
        console.error("Failed to analyze element:", error);
        cloneWithJamiu = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center;">
            <div style="margin-bottom: 16px; color: #ff6b6b; font-size: 24px;">⚠️</div>
            <h3 style="margin: 0 0 8px; color: #fff; font-size: 16px;">Analysis Failed</h3>
            <p style="margin: 0; color: #ccc; font-size: 12px;">Could not analyze element</p>
          </div>
        `;
      }

      const tabNames = ["Clone with Jamiu 🤖", "HTML"];
      const tabContents = [cloneWithJamiu, elementCode.html];

      // Add framework selector for AI generation
      let currentFramework = "html";

      tabNames.forEach((tabName, index) => {
        const tab = document.createElement("div");
        tab.textContent = tabName;
        tab.className = "code-tab";
        console.log("Creating tab:", tabName, index);

        tab.style.cssText = `
          flex: 1;
          padding: 6px 8px;
          text-align: center;
          cursor: pointer;
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          background: ${
            index === 0
              ? "rgba(255, 255, 255, 0.25)"
              : "rgba(255, 255, 255, 0.05)"
          };
          color: ${index === 0 ? "#fff" : "#ccc"};
          font-weight: ${index === 0 ? "600" : "500"};
          font-size: 10px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          min-height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
        `;

        // Add hover effect overlay
        const tabOverlay = document.createElement("div");
        tabOverlay.style.cssText = `
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          transition: left 0.5s ease;
          pointer-events: none;
        `;
        tab.appendChild(tabOverlay);

        actionEvents.forEach((event) => {
          tab.addEventListener(event, (e) => {
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();

            setTimeout(() => {
              tab.style.background =
                index === 0
                  ? "rgba(255, 255, 255, 0.25)"
                  : "rgba(255, 255, 255, 0.05)";
            }, 200);
            switchTab(index);
            console.log("Tab clicked:", tabName, index, event);
          });
        });

        tab.onmouseover = () => {
          if (index !== 0) {
            tab.style.background = "rgba(255, 255, 255, 0.15)";
            tab.style.transform = "translateY(-1px)";
          }
          tabOverlay.style.left = "100%";
        };
        tab.onmouseout = () => {
          if (index !== 0) {
            tab.style.background = "rgba(255, 255, 255, 0.05)";
            tab.style.transform = "translateY(0)";
          }
          tabOverlay.style.left = "-100%";
        };

        tabs.appendChild(tab);
        console.log("Tab added to DOM:", tabName);
      });

      // Create content area
      const content = document.createElement("div");
      content.style.cssText = `
        flex: 1;
        overflow: hidden;
        position: relative;
      `;

      // Create code blocks
      tabContents.forEach((tabContent, index) => {
        const codeBlock = document.createElement("div");
        codeBlock.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: ${index === 0 ? "flex" : "none"};
          flex-direction: column;
        `;
        codeBlock.setAttribute("data-tab", index.toString());

        // Code header with copy button
        const codeHeader = document.createElement("div");
        codeHeader.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 12px;
          background: rgba(60, 60, 60, 0.9);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 10px;
          font-weight: 500;
          backdrop-filter: blur(10px);
          position: relative;
          z-index: 2;
          min-height: 28px;
        `;

        const codeTitle = document.createElement("span");
        codeTitle.textContent = tabNames[index];

        // Add framework selector for Clone with Jamiu tab
        if (index === 0) {
          const frameworkSelector = document.createElement("select");
          frameworkSelector.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: #fff;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 9px;
            margin-right: 6px;
            cursor: pointer;
            height: 20px;
          `;

          const frameworks = [
            { value: "html", label: "HTML/CSS/JS" },
            { value: "react", label: "React" },
            { value: "vue", label: "Vue" },
            { value: "svelte", label: "Svelte" },
          ];

          frameworks.forEach((framework) => {
            const option = document.createElement("option");
            option.value = framework.value;
            option.textContent = framework.label;
            frameworkSelector.appendChild(option);
          });

          frameworkSelector.addEventListener("change", (e) => {
            const target = e.target as HTMLSelectElement;
            currentFramework = target.value;

            // Show loading state immediately
            updateLoadingState(
              `Generating ${currentFramework.toUpperCase()} code...`
            );

            // Regenerate code with new framework
            if (currentHoveredElement && elementAnalysis) {
              browser.runtime
                .sendMessage({
                  type: "GENERATE_CLONE_CODE",
                  elementAnalysis: elementAnalysis,
                  targetFramework: currentFramework,
                })
                .then(() => {
                  // Update loading state to show request sent
                  setTimeout(() => {
                    updateLoadingState(
                      `Request sent to AI service for ${currentFramework.toUpperCase()}...`
                    );
                  }, 1000);
                })
                .catch((error) => {
                  console.error("Failed to send AI generation request:", error);
                  updateCloneWithJamiuTabWithError(
                    "Could not send AI generation request"
                  );
                });
            }
          });

          codeHeader.appendChild(frameworkSelector);
        }

        const copyBtn = document.createElement("button");
        copyBtn.textContent = "📋 Copy";
        copyBtn.setAttribute("data-copy", tabNames[index]);
        copyBtn.style.cssText = `
          background: linear-gradient(135deg, #007acc, #005a9e);
          color: white;
          border: none;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(0, 122, 204, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
          height: 20px;
        `;

        actionEvents.forEach((event) => {
          copyBtn.addEventListener(event, (e: MouseEvent | MouseEvent) => {
            console.log("Copy button clicked:", event);
            e.stopPropagation();
            e.preventDefault();
            e.stopImmediatePropagation();
            copyBtn.style.background = "green";
            setTimeout(() => {
              copyBtn.style.background =
                "linear-gradient(135deg, #007acc, #005a9e)";
            }, 200);
            copyToClipboard(tabContent, tabNames[index]);
          });
        });

        copyBtn.onmouseover = () => {
          copyBtn.style.background =
            "linear-gradient(135deg, #005a9e, #004080)";
          copyBtn.style.transform = "translateY(-1px)";
          copyBtn.style.boxShadow =
            "0 4px 12px rgba(0, 122, 204, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)";
        };
        copyBtn.onmouseout = () => {
          copyBtn.style.background =
            "linear-gradient(135deg, #007acc, #005a9e)";
          copyBtn.style.transform = "translateY(0)";
          copyBtn.style.boxShadow =
            "0 2px 8px rgba(0, 122, 204, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)";
        };

        codeHeader.appendChild(codeTitle);
        codeHeader.appendChild(copyBtn);

        // Code editor
        const codeEditor = document.createElement("pre");
        codeEditor.style.cssText = `
          flex: 1;
          margin: 0;
          padding: 12px 16px;
          background: rgba(50, 50, 50, 0.8);
          color: #e8e8e8;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Fira Code', monospace;
          font-size: 10px;
          line-height: 1.4;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
          backdrop-filter: blur(10px);
          position: relative;
          border-radius: 0 0 12px 12px;
          max-height: none;
          min-height: 200px;
        `;

        const code = document.createElement("code");
        // Add syntax highlighting
        const highlightedCode = highlightSyntax(tabContent, tabNames[index]);
        code.innerHTML = highlightedCode;
        codeEditor.appendChild(code);

        codeBlock.appendChild(codeHeader);
        codeBlock.appendChild(codeEditor);
        content.appendChild(codeBlock);
      });

      // Add all elements to panel
      panel.appendChild(header);
      panel.appendChild(tabs);
      panel.appendChild(content);
      codePanel.appendChild(panel);
      document.body.appendChild(codePanel);

      // Add event delegation to tabs container as backup
      tabs.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains("code-tab")) {
          e.stopPropagation();
          e.preventDefault();
          const tabIndex = Array.from(
            tabs.querySelectorAll(".code-tab")
          ).indexOf(target);
          console.log(
            "Event delegation: Tab clicked via container, index:",
            tabIndex
          );
          switchTab(tabIndex);
        }
      });

      // Add event delegation for buttons as backup
      panel.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target && target.tagName === "BUTTON") {
          e.stopPropagation();
          e.preventDefault();
          console.log(
            "Event delegation: Button clicked via panel:",
            target.textContent
          );

          // Handle close button
          if (target.textContent === "×") {
            removeCodePanel();
          }

          // Handle copy buttons
          if (target.textContent?.includes("Copy")) {
            const dataCopy = target.getAttribute("data-copy");
            if (dataCopy) {
              const tabIndex = tabNames.indexOf(dataCopy);
              if (tabIndex !== -1) {
                copyToClipboard(tabContents[tabIndex], dataCopy);
              }
            }
          }
        }
      });

      // Add click outside to close
      codePanel.addEventListener("click", (e) => {
        if (e.target === codePanel) {
          removeCodePanel();
        }
      });

      // Prevent code panel clicks from bubbling up
      panel.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // Prevent all clicks within the panel from triggering element selection
      panel.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });

      panel.addEventListener("mouseup", (e) => {
        e.stopPropagation();
      });

      function switchTab(tabIndex: number) {
        console.log("Switching to tab:", tabIndex);
        activeTab = tabIndex;

        // Update tab styles
        const tabElements = tabs.querySelectorAll(".code-tab");
        console.log("Found tab elements:", tabElements.length);

        tabElements.forEach((tab, index) => {
          const isActive = index === tabIndex;
          console.log(`Tab ${index}: active = ${isActive}`);

          (tab as HTMLElement).style.background = isActive
            ? "rgba(255, 255, 255, 0.25)"
            : "rgba(255, 255, 255, 0.05)";
          (tab as HTMLElement).style.color = isActive ? "#fff" : "#ccc";
          (tab as HTMLElement).style.fontWeight = isActive ? "700" : "600";
          (tab as HTMLElement).style.transform = isActive
            ? "translateY(-1px)"
            : "translateY(0)";
          (tab as HTMLElement).style.zIndex = "2";
        });

        // Update content
        const contentBlocks = content.querySelectorAll("[data-tab]");
        console.log("Found content blocks:", contentBlocks.length);

        contentBlocks.forEach((block, index) => {
          const shouldShow = index === tabIndex;
          console.log(`Content block ${index}: show = ${shouldShow}`);
          (block as HTMLElement).style.display = shouldShow ? "flex" : "none";
        });
      }

      function copyToClipboard(text: string, type: string) {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            // Show success feedback
            const buttons = document.querySelectorAll("[data-copy]");
            buttons.forEach((button) => {
              if (button.textContent?.includes(type)) {
                const originalText = button.textContent;
                button.textContent = "Copied!";
                (button as HTMLElement).style.background = "#4CAF50";
                setTimeout(() => {
                  button.textContent = originalText;
                  (button as HTMLElement).style.background =
                    "linear-gradient(135deg, #007acc, #005a9e)";
                }, 1000);
              }
            });
          })
          .catch((err) => {
            console.error("Failed to copy:", err);
          });
      }
    }

    function removeCodePanel() {
      if (codePanel && codePanel.parentNode) {
        codePanel.parentNode.removeChild(codePanel);
        codePanel = null;
      }
    }

    function getElementInfo(element: HTMLElement): string {
      if (!element || !element.tagName) {
        return "Unknown element";
      }

      const tagName = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : "";
      const classes = Array.from(element.classList)
        .map((c) => `.${c}`)
        .join("");
      const text = element.textContent?.trim().substring(0, 30) || "";

      return `${tagName}${id}${classes}${text ? ` "${text}..."` : ""}`;
    }

    function extractElementCode(element: HTMLElement) {
      if (!element || !element.tagName) {
        return {
          html: "<!-- Invalid element -->",
          css: "/* No styles available */",
          javascript: "// No JavaScript available",
        };
      }

      return {
        html: extractHTML(element),
        css: extractCSS(element),
        javascript: extractJavaScript(element),
      };
    }

    function extractHTML(element: HTMLElement): string {
      if (!element || !element.tagName) {
        return "<!-- Invalid element -->";
      }

      // Get the outer HTML of the element
      let html = element.outerHTML;

      // Format the HTML with proper indentation
      html = formatHTML(html);

      return html;
    }

    function extractCSS(element: HTMLElement): string {
      if (!element || !element.tagName) {
        return "/* Invalid element */";
      }

      const styles: string[] = [];

      // Get computed styles
      const computedStyle = window.getComputedStyle(element);
      const importantProperties = [
        "display",
        "position",
        "width",
        "height",
        "margin",
        "padding",
        "background",
        "color",
        "font",
        "border",
        "border-radius",
        "box-shadow",
        "flex",
        "grid",
        "transform",
        "transition",
      ];

      importantProperties.forEach((prop) => {
        const value = computedStyle.getPropertyValue(prop);
        if (
          value &&
          value !== "normal" &&
          value !== "none" &&
          value !== "0px"
        ) {
          styles.push(`  ${prop}: ${value};`);
        }
      });

      // Get element's inline styles
      if (element.style.cssText) {
        styles.push(`  /* Inline styles */`);
        element.style.cssText.split(";").forEach((style) => {
          if (style.trim()) {
            styles.push(`  ${style.trim()};`);
          }
        });
      }

      // Get CSS rules that apply to this element
      const cssRules = getCSSRulesForElement(element);
      if (cssRules.length > 0) {
        styles.push(`  /* Applied CSS rules */`);
        cssRules.forEach((rule) => {
          styles.push(`  ${rule}`);
        });
      }

      return styles.length > 0
        ? styles.join("\n")
        : "/* No specific styles found */";
    }

    function extractJavaScript(element: HTMLElement): string {
      if (!element || !element.tagName) {
        return "// Invalid element";
      }

      const js: string[] = [];

      // Get event listeners (if possible)
      const events = [
        "click",
        "mouseover",
        "mouseout",
        "focus",
        "blur",
        "change",
      ];
      events.forEach((event) => {
        const eventHandler = (element as any)[`on${event}`];
        if (eventHandler) {
          js.push(`element.addEventListener('${event}', function() {`);
          js.push(`  // ${eventHandler}`);
          js.push(`});`);
        }
      });

      // Get data attributes
      const dataAttrs = Array.from(element.attributes)
        .filter((attr) => attr.name.startsWith("data-"))
        .map(
          (attr) => `element.setAttribute('${attr.name}', '${attr.value}');`
        );

      if (dataAttrs.length > 0) {
        js.push(`/* Data attributes */`);
        js.push(dataAttrs.join("\n"));
      }

      // Get element properties
      const properties = ["id", "className", "innerHTML", "textContent"];
      properties.forEach((prop) => {
        const value = (element as any)[prop];
        if (value) {
          js.push(`element.${prop} = '${value}';`);
        }
      });

      return js.length > 0
        ? js.join("\n")
        : "/* No JavaScript found for this element */";
    }

    function formatHTML(html: string): string {
      // Simple HTML formatting
      let formatted = html;
      formatted = formatted.replace(/></g, ">\n<");
      formatted = formatted.replace(/\n\s*\n/g, "\n");

      // Add basic indentation
      const lines = formatted.split("\n");
      let indentLevel = 0;
      const formattedLines = lines.map((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("</")) {
          indentLevel--;
        }
        const indented = "  ".repeat(Math.max(0, indentLevel)) + trimmed;
        if (
          trimmed.startsWith("<") &&
          !trimmed.startsWith("</") &&
          !trimmed.endsWith("/>")
        ) {
          indentLevel++;
        }
        return indented;
      });

      return formattedLines.join("\n");
    }

    function getCSSRulesForElement(element: HTMLElement): string[] {
      const rules: string[] = [];

      // Get all stylesheets
      for (let i = 0; i < document.styleSheets.length; i++) {
        try {
          const sheet = document.styleSheets[i];
          if (sheet.cssRules) {
            for (let j = 0; j < sheet.cssRules.length; j++) {
              const rule = sheet.cssRules[j] as CSSStyleRule;
              if (rule.selectorText && element.matches(rule.selectorText)) {
                rules.push(`${rule.selectorText} {`);
                for (let k = 0; k < rule.style.length; k++) {
                  const property = rule.style[k];
                  const value = rule.style.getPropertyValue(property);
                  rules.push(`  ${property}: ${value};`);
                }
                rules.push(`}`);
              }
            }
          }
        } catch (e) {
          // Skip cross-origin stylesheets
          continue;
        }
      }

      return rules;
    }

    function highlightSyntax(code: string, language: string): string {
      // Basic syntax highlighting
      let highlighted = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

      if (language === "HTML") {
        // HTML highlighting
        highlighted = highlighted
          .replace(
            /(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)([^&]*?)(&gt;)/g,
            '<span style="color: #569cd6;">$1$2</span><span style="color: #d4d4d4;">$3</span><span style="color: #569cd6;">$4</span>'
          )
          .replace(/([a-zA-Z-]+)=/g, '<span style="color: #9cdcfe;">$1</span>=')
          .replace(
            /(&quot;[^&]*&quot;)/g,
            '<span style="color: #ce9178;">$1</span>'
          )
          .replace(
            /(#[a-zA-Z0-9]+)/g,
            '<span style="color: #b5cea8;">$1</span>'
          )
          .replace(
            /(\.[a-zA-Z0-9-]+)/g,
            '<span style="color: #4ec9b0;">$1</span>'
          );
      } else if (language === "CSS") {
        // CSS highlighting
        highlighted = highlighted
          .replace(
            /([a-zA-Z-]+)(?=\s*:)/g,
            '<span style="color: #9cdcfe;">$1</span>'
          )
          .replace(/(:)/g, '<span style="color: #d4d4d4;">$1</span>')
          .replace(/(;)/g, '<span style="color: #d4d4d4;">$1</span>')
          .replace(/(\{)/g, '<span style="color: #d4d4d4;">$1</span>')
          .replace(/(\})/g, '<span style="color: #d4d4d4;">$1</span>')
          .replace(
            /(#[a-fA-F0-9]{3,6})/g,
            '<span style="color: #b5cea8;">$1</span>'
          )
          .replace(
            /(rgba?\([^)]+\))/g,
            '<span style="color: #b5cea8;">$1</span>'
          )
          .replace(
            /(\d+px|\d+em|\d+rem|\d+%)/g,
            '<span style="color: #b5cea8;">$1</span>'
          )
          .replace(
            /(\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/)/g,
            '<span style="color: #6a9955;">$1</span>'
          );
      } else if (language === "JavaScript") {
        // JavaScript highlighting
        highlighted = highlighted
          .replace(
            /\b(function|var|let|const|if|else|for|while|return|new|class|extends|import|export|default|async|await)\b/g,
            '<span style="color: #569cd6;">$1</span>'
          )
          .replace(
            /\b(true|false|null|undefined)\b/g,
            '<span style="color: #569cd6;">$1</span>'
          )
          .replace(/(\d+)/g, '<span style="color: #b5cea8;">$1</span>')
          .replace(
            /(&quot;[^&]*&quot;)/g,
            '<span style="color: #ce9178;">$1</span>'
          )
          .replace(/(\/\/.*)/g, '<span style="color: #6a9955;">$1</span>')
          .replace(
            /(\/\*[\s\S]*?\*\/)/g,
            '<span style="color: #6a9955;">$1</span>'
          );
      }

      return highlighted;
    }

    // Utility function to hide elements from screenshots
    function hideElementFromScreenshot(element: HTMLElement) {
      element.classList.add("dommy-hide-from-screenshot");
      console.log("Element hidden from screenshots:", element);
    }

    // Utility function to show elements in screenshots again
    function showElementInScreenshot(element: HTMLElement) {
      element.classList.remove("dommy-hide-from-screenshot");
      console.log("Element shown in screenshots:", element);
    }

    // Utility function to hide elements by selector
    function hideElementsBySelector(selector: string) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        (el as HTMLElement).classList.add("dommy-hide-from-screenshot");
      });
      console.log(
        `Hidden ${elements.length} elements with selector: ${selector}`
      );
    }

    async function takeScreenshot() {
      if (!currentHoveredElement) {
        console.log("No element selected for screenshot");
        return;
      }

      try {
        // Import html2canvas dynamically
        const html2canvas = (await import("html2canvas")).default;

        // Get element bounds
        const rect = currentHoveredElement.getBoundingClientRect();

        // Take screenshot of the element
        const canvas = await html2canvas(currentHoveredElement, {
          backgroundColor: null,
          scale: 2, // Higher quality
          useCORS: true,
          allowTaint: true,
          width: rect.width,
          height: rect.height,
          // Hide elements with specific classes or attributes
          ignoreElements: (element) => {
            // Hide elements with class 'dommy-hide-from-screenshot'
            if (element.classList.contains("dommy-hide-from-screenshot")) {
              return true;
            }
            // Hide elements with data attribute 'data-dommy-hide'
            if (element.hasAttribute("data-dommy-hide")) {
              return true;
            }
            // Hide elements with specific IDs (customize as needed)
            const hideIds = ["cookie-banner", "ad-banner", "popup-overlay"];
            if (element.id && hideIds.includes(element.id)) {
              return true;
            }
            return false;
          },
          // Additional processing on the cloned DOM
          onclone: (clonedDoc) => {
            // Hide elements with specific selectors
            const selectorsToHide = [
              ".advertisement",
              ".banner",
              ".popup",
              ".modal",
              ".cookie-notice",
              ".newsletter-signup",
              ".social-share",
              ".floating-button",
            ];

            selectorsToHide.forEach((selector) => {
              const elements = clonedDoc.querySelectorAll(selector);
              elements.forEach((el) => {
                (el as HTMLElement).style.display = "none";
              });
            });

            // Hide elements with specific text content
            const textToHide = [
              "cookie",
              "advertisement",
              "subscribe",
              "newsletter",
            ];
            const allElements = clonedDoc.querySelectorAll("*");
            allElements.forEach((el) => {
              const text = el.textContent?.toLowerCase() || "";
              if (textToHide.some((hideText) => text.includes(hideText))) {
                // Only hide if it's a small element (likely a banner/ad)
                const rect = el.getBoundingClientRect();
                if (rect.height < 100 || rect.width < 200) {
                  (el as HTMLElement).style.display = "none";
                }
              }
            });
          },
        });

        // Convert to blob and download
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `dommy-screenshot-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
          }
        }, "image/png");

        console.log("Screenshot taken successfully");
      } catch (error) {
        console.error("Error taking screenshot:", error);
      }
    }

    // Helper function to update the Clone with Jamiu tab with generated code
    function updateCloneWithJamiuTab(
      code: string,
      framework: string,
      description: string
    ) {
      console.log("Updating Clone with Jamiu tab:", {
        codeLength: code?.length || 0,
        framework,
        description,
      });

      const codePanel = document.getElementById("dommy-code-panel");
      if (!codePanel) return;

      const contentBlocks = codePanel.querySelectorAll("[data-tab]");
      const cloneTab = contentBlocks[0]; // First tab is Clone with Jamiu

      if (cloneTab) {
        const codeEditor = cloneTab.querySelector("pre code");
        if (codeEditor) {
          console.log(
            "Code before highlighting:",
            code?.substring(0, 200) + "..."
          );
          // Add syntax highlighting
          const highlightedCode = highlightSyntax(code, framework);
          console.log(
            "Code after highlighting:",
            highlightedCode?.substring(0, 200) + "..."
          );
          codeEditor.innerHTML = highlightedCode;

          // Ensure the code is fully visible
          (codeEditor as HTMLElement).style.whiteSpace = "pre-wrap";
          (codeEditor as HTMLElement).style.wordBreak = "break-word";
          (codeEditor as HTMLElement).style.overflowWrap = "break-word";

          // Update the tab title to show it's loaded
          const tabTitle = cloneTab.querySelector("span");
          if (tabTitle) {
            tabTitle.textContent = `Clone with Jamiu 🤖 (${framework})`;
          }

          // Scroll to top to show the beginning of the code
          const preElement = codeEditor.closest("pre");
          if (preElement) {
            preElement.scrollTop = 0;
          }
        }
      }
    }

    // Helper function to update the loading state with progress
    function updateLoadingState(message: string) {
      const codePanel = document.getElementById("dommy-code-panel");
      if (!codePanel) return;

      const contentBlocks = codePanel.querySelectorAll("[data-tab]");
      const cloneTab = contentBlocks[0]; // First tab is Clone with Jamiu

      if (cloneTab) {
        const codeEditor = cloneTab.querySelector("pre code");
        if (codeEditor) {
          codeEditor.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center; background: rgba(50, 50, 50, 0.8); border-radius: 8px;">
              <div style="margin-bottom: 16px;">
                <div style="width: 48px; height: 48px; border: 3px solid #007acc; border-top: 3px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
                <style>
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                </style>
              </div>
              <h3 style="margin: 0 0 8px; color: #fff; font-size: 16px; font-weight: 600;">🤖 Jamiu is working...</h3>
              <p style="margin: 0; color: #ccc; font-size: 12px;">${message}</p>
              <p style="margin: 8px 0 0; color: #999; font-size: 10px;">This may take a few seconds</p>
              <div style="margin-top: 16px; width: 100%; height: 2px; background: rgba(255, 255, 255, 0.1); border-radius: 1px; overflow: hidden;">
                <div style="width: 30%; height: 100%; background: linear-gradient(90deg, #007acc, #005a9e); animation: loading 2s ease-in-out infinite;"></div>
                <style>
                  @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(400%); }
                  }
                </style>
              </div>
            </div>
          `;
        }
      }
    }

    // Helper function to update the Clone with Jamiu tab with error
    function updateCloneWithJamiuTabWithError(error: string) {
      const codePanel = document.getElementById("dommy-code-panel");
      if (!codePanel) return;

      const contentBlocks = codePanel.querySelectorAll("[data-tab]");
      const cloneTab = contentBlocks[0]; // First tab is Clone with Jamiu

      if (cloneTab) {
        const codeEditor = cloneTab.querySelector("pre code");
        if (codeEditor) {
          codeEditor.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 20px; text-align: center;">
              <div style="margin-bottom: 16px; color: #ff6b6b; font-size: 24px;">❌</div>
              <h3 style="margin: 0 0 8px; color: #fff; font-size: 16px;">Generation Failed</h3>
              <p style="margin: 0; color: #ccc; font-size: 12px; max-width: 200px;">${error}</p>
              <button onclick="location.reload()" 
                onmousedown="location.reload()"
                onmouseup="location.reload()"
                onmouseover="this.style.background = '#005fa3';"
                onmouseout="this.style.background = '#007acc';"
              style="margin-top: 16px; padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry</button>
            </div>
          `;

          // Update the tab title
          const tabTitle = cloneTab.querySelector("span");
          if (tabTitle) {
            tabTitle.textContent = "Clone with Jamiu 🤖 (Error)";
          }
        }
      }
    }
  },
});
