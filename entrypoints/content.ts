export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    let isElementSelected = false;
    let currentHoveredElement: HTMLElement | null = null;
    let originalStyles: { [key: string]: string } = {};
    let codePanel: HTMLElement | null = null;
    let activeTab = 0;

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
        if (isElementSelected) {
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
      }
    });

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (
        target &&
        target !== document.body &&
        target !== document.documentElement
      ) {
        // const elementsToHighlight = [
        //   "div",
        //   "section",
        //   "article",
        //   "header",
        //   "footer",
        //   "main",
        //   "aside",
        //   "nav",
        // ];
        // if (elementsToHighlight.includes(target.tagName.toLowerCase())) {
        // Always remove previous highlight and code panel first
        if (currentHoveredElement) {
          removeHighlight(currentHoveredElement);
        }
        removeCodePanel();

        // Add glassmorphism highlight to new element
        highlightElement(target);
        currentHoveredElement = target;

        // Extract element code and show code panel
        const elementCode = extractElementCode(target);
        showCodePanel(target, elementCode);

        // Send element info to popup
        const elementInfo = getElementInfo(target);
        browser.runtime.sendMessage({
          type: "ELEMENT_CLICKED",
          elementInfo: elementInfo,
          elementCode: elementCode,
        });
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

    function showCodePanel(element: HTMLElement, elementCode: any) {
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
      const panelWidth = Math.min(600, window.innerWidth - 40);
      const panelHeight = 400;

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

      // Create the actual panel
      const panel = document.createElement("div");
      panel.style.cssText = `
        position: absolute;
        top: ${top}px;
        left: ${left}px;
        width: ${panelWidth}px;
        height: ${panelHeight}px;
        background: #1e1e1e;
        border: 2px solid #007acc;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 12px;
        color: #d4d4d4;
        pointer-events: auto;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      `;

      // Create header
      const header = document.createElement("div");
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #2d2d2d;
        border-bottom: 1px solid #404040;
        font-weight: 600;
      `;

      const title = document.createElement("span");
      title.textContent = "Element Code";
      title.style.color = "#fff";

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      closeBtn.style.cssText = `
        background: none;
        border: none;
        color: #fff;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
      `;
      closeBtn.onclick = removeCodePanel;
      closeBtn.onmouseover = () => (closeBtn.style.background = "#404040");
      closeBtn.onmouseout = () => (closeBtn.style.background = "none");

      header.appendChild(title);
      header.appendChild(closeBtn);

      // Create tabs
      const tabs = document.createElement("div");
      tabs.style.cssText = `
        display: flex;
        background: #252526;
        border-bottom: 1px solid #404040;
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
        tab.style.cssText = `
          flex: 1;
          padding: 8px 12px;
          text-align: center;
          cursor: pointer;
          border-right: 1px solid #404040;
          background: ${index === 0 ? "#1e1e1e" : "#252526"};
          color: ${index === 0 ? "#fff" : "#ccc"};
          font-weight: ${index === 0 ? "600" : "400"};
        `;

        tab.onclick = () => switchTab(index);
        tab.onmouseover = () => {
          if (index !== 0) {
            tab.style.background = "#2d2d2d";
          }
        };
        tab.onmouseout = () => {
          if (index !== 0) {
            tab.style.background = "#252526";
          }
        };

        tabs.appendChild(tab);
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
          background: #2d2d2d;
          border-bottom: 1px solid #404040;
          font-size: 11px;
        `;

        const codeTitle = document.createElement("span");
        codeTitle.textContent = tabNames[index];

        const copyBtn = document.createElement("button");
        copyBtn.textContent = "📋 Copy";
        copyBtn.setAttribute("data-copy", tabNames[index]);
        copyBtn.style.cssText = `
          background: #007acc;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 10px;
          cursor: pointer;
        `;
        copyBtn.onclick = () => copyToClipboard(tabContent, tabNames[index]);
        copyBtn.onmouseover = () => (copyBtn.style.background = "#005a9e");
        copyBtn.onmouseout = () => (copyBtn.style.background = "#007acc");

        codeHeader.appendChild(codeTitle);
        codeHeader.appendChild(copyBtn);

        // Code editor
        const codeEditor = document.createElement("pre");
        codeEditor.style.cssText = `
          flex: 1;
          margin: 0;
          padding: 12px;
          background: #1e1e1e;
          color: #d4d4d4;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 11px;
          line-height: 1.4;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-all;
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

      // Add click outside to close
      codePanel.addEventListener("click", (e) => {
        if (e.target === codePanel) {
          removeCodePanel();
        }
      });

      function switchTab(tabIndex: number) {
        activeTab = tabIndex;

        // Update tab styles
        const tabElements = tabs.querySelectorAll("div");
        tabElements.forEach((tab, index) => {
          tab.style.background = index === tabIndex ? "#1e1e1e" : "#252526";
          tab.style.color = index === tabIndex ? "#fff" : "#ccc";
          tab.style.fontWeight = index === tabIndex ? "600" : "400";
        });

        // Update content
        const contentBlocks = content.querySelectorAll("[data-tab]");
        contentBlocks.forEach((block, index) => {
          (block as HTMLElement).style.display =
            index === tabIndex ? "flex" : "none";
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
                  (button as HTMLElement).style.background = "#007acc";
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
