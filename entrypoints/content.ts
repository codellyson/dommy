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
      }
    });

    function handleClick(event: MouseEvent) {
      // debugger;
      event.stopPropagation();
      const target = event.target as HTMLElement;
      console.log("target", target);
      if (
        target &&
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
        showCodePanel(target, elementCode, popupIsOpen);
      }

      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    function highlightElement(element: HTMLElement) {
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
      element.style.backgroundColor = "rgba(1, 152, 246, 0.1)";
      element.style.backdropFilter = "blur(10px)";
      element.style.borderRadius = "8px";
      element.style.boxShadow =
        "0 8px 32px rgba(0, 0, 0, 0.3), " +
        "inset 0 1px 0 rgba(255, 255, 255, 0.1), " +
        "0 0 0 1px rgba(255, 255, 255, 0.2)";
    }

    function removeHighlight(element: HTMLElement) {
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
    }

    function showCodePanel(
      element: HTMLElement,
      elementCode: any,
      isPopupOpen: boolean
    ) {
      // Remove any existing code panel first
      removeCodePanel();

      // Check if element is still valid
      if (!element || !element.isConnected) {
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

      // Adjust panel size based on popup state
      const panelWidth = isPopupOpen
        ? Math.min(400, window.innerWidth - 40)
        : Math.min(600, window.innerWidth - 40);
      const panelHeight = isPopupOpen ? 300 : 400;

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
        background: rgba(10, 10, 10, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 16px;
        box-shadow: 
          0 8px 32px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          0 0 0 1px rgba(255, 255, 255, 0.05);
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Fira Code', monospace;
        font-size: 12px;
        color: #e8e8e8;
        pointer-events: auto;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        opacity: ${isPopupOpen ? "0.9" : "1"};
        backdrop-filter: blur(20px);
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
        padding: 16px 20px;
        background: rgba(30, 30, 30, 0.8);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        font-weight: 700;
        font-size: 16px;
        backdrop-filter: blur(10px);
        position: relative;
        z-index: 2;
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
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
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

      const tabNames = ["HTML", "CSS", "JavaScript"];
      const tabContents = [
        elementCode.html,
        elementCode.css,
        elementCode.javascript,
      ];

      tabNames.forEach((tabName, index) => {
        const tab = document.createElement("div");
        tab.textContent = tabName;
        tab.className = "code-tab";
        console.log("Creating tab:", tabName, index);

        tab.style.cssText = `
          flex: 1;
          padding: 14px 16px;
          text-align: center;
          cursor: pointer;
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          background: ${
            index === 0
              ? "rgba(255, 255, 255, 0.25)"
              : "rgba(255, 255, 255, 0.05)"
          };
          color: ${index === 0 ? "#fff" : "#ccc"};
          font-weight: ${index === 0 ? "700" : "600"};
          font-size: 13px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
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
          padding: 12px 20px;
          background: rgba(30, 30, 30, 0.8);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 13px;
          font-weight: 600;
          backdrop-filter: blur(10px);
          position: relative;
          z-index: 2;
        `;

        const codeTitle = document.createElement("span");
        codeTitle.textContent = tabNames[index];

        const copyBtn = document.createElement("button");
        copyBtn.textContent = "📋 Copy";
        copyBtn.setAttribute("data-copy", tabNames[index]);
        copyBtn.style.cssText = `
          background: linear-gradient(135deg, #007acc, #005a9e);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(0, 122, 204, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
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
          padding: 20px;
          background: rgba(10, 10, 10, 0.6);
          color: #e8e8e8;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Fira Code', monospace;
          font-size: 12px;
          line-height: 1.5;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-all;
          backdrop-filter: blur(10px);
          position: relative;
          border-radius: 0 0 16px 16px;
        `;

        const code = document.createElement("code");
        code.textContent = tabContent;
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
        if (target.tagName === "BUTTON") {
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
      const tagName = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : "";
      const classes = Array.from(element.classList)
        .map((c) => `.${c}`)
        .join("");
      const text = element.textContent?.trim().substring(0, 30) || "";

      return `${tagName}${id}${classes}${text ? ` "${text}..."` : ""}`;
    }

    function extractElementCode(element: HTMLElement) {
      return {
        html: extractHTML(element),
        css: extractCSS(element),
        javascript: extractJavaScript(element),
      };
    }

    function extractHTML(element: HTMLElement): string {
      // Get the outer HTML of the element
      let html = element.outerHTML;

      // Format the HTML with proper indentation
      html = formatHTML(html);

      return html;
    }

    function extractCSS(element: HTMLElement): string {
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
  },
});
