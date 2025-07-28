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

    // Listen for messages from popup and sidebar
    browser.runtime.onMessage.addListener((message) => {
      console.log("Content script received message:", message);
      if (message.type === "TOGGLE_ELEMENT_SELECTION") {
        isElementSelected = message.isElementSelected;
        if (isElementSelected && !popupIsOpen) {
          document.addEventListener("click", handleClick, true);
        } else {
          document.removeEventListener("click", handleClick, true);
          // Remove any existing highlights
          if (currentHoveredElement) {
            removeHighlight(currentHoveredElement);
            currentHoveredElement = null;
          }
        }
      } else if (message.type === "TAKE_ELEMENT_SCREENSHOT") {
        takeScreenshot();
      } else if (message.type === "POPUP_OPENED") {
        console.log("Content script: Popup opened, setting popupIsOpen = true");
        popupIsOpen = true;
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
      } else if (message.type === "SIDEBAR_OPENED") {
        console.log("Content script: Sidebar opened");
        // Enable element selection when sidebar is open
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
        console.log("Content script: Clone code generated", message);
        // show code panel
        // how to send  message to side panel here
        // send message to side panel
        browser.runtime.sendMessage({
          type: "CLONE_CODE_GENERATED",
          code: message.code,
          framework: message.framework,
          description: message.description,
        });
      } else if (message.type === "CLONE_CODE_ERROR") {
        browser.runtime.sendMessage({
          type: "CLONE_CODE_ERROR",
          code: null,
          framework: message.framework,
          description: null,
        });
      }
    });

    async function handleClick(event: MouseEvent) {
      event.stopPropagation();
      const target = event.target as HTMLElement;
      console.log("target", target);
      if (
        target &&
        target.tagName &&
        target !== document.body &&
        target !== document.documentElement &&
        !target.closest("#dommy-code-panel") && // Don't select the code panel itself
        !target.closest("#dommy-camera-btn") // Don't select copy buttons
        // !target.closest("button") && // Don't select any buttons
        // !target.closest("pre") && // Don't select code editor
        // !target.closest("code") && // Don't select code elements
        // !target.closest(".close-btn") // Don't select close button
      ) {
        console.log("Content script: Element clicked");

        // Always remove previous highlight first
        if (currentHoveredElement) {
          removeHighlight(currentHoveredElement);
        }
        removeCodePanel();

        // Add glassmorphism highlight to new element
        highlightElement(target);
        currentHoveredElement = target;

        // Extract element code
        const elementCode = await extractElementCode(target);

        // Send element info to popup
        const elementInfo = getElementInfo(target);

        browser.runtime.sendMessage({
          type: "ELEMENT_CLICKED",
          elementInfo: elementInfo,
          elementCode: elementCode,
        });

        // Show simplified code panel with only HTML
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
      // element.style.backgroundColor = "transparent";
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
          takeScreenshot(true);
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

      // Get element position and screen info
      const rect = element.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const elementCenterX = rect.left + rect.width / 2;
      const elementCenterY = rect.top + rect.height / 2;

      // Smart positioning algorithm
      const position = calculateOptimalPosition(
        rect,
        screenWidth,
        screenHeight,
        isPopupOpen
      );

      // Adaptive sizing based on element and screen
      const size = calculateAdaptiveSize(
        rect,
        screenWidth,
        screenHeight,
        isPopupOpen
      );

      // Determine entry animation based on position
      const animation = determineEntryAnimation(
        position,
        elementCenterX,
        elementCenterY,
        screenWidth,
        screenHeight
      );

      // Create the modern floating panel
      const panel = document.createElement("div");
      panel.style.cssText = `
        position: absolute;
        top: ${position.top}px;
        left: ${position.left}px;
        width: ${size.width}px;
        height: ${size.height}px;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-radius: 16px;
        box-shadow: 
          0 20px 40px rgba(0, 0, 0, 0.1),
          0 8px 16px rgba(0, 0, 0, 0.06),
          0 0 0 1px rgba(255, 255, 255, 0.8);
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Fira Code', monospace;
        font-size: 11px;
        color: #2c3e50;
        pointer-events: auto;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        opacity: 0;
        backdrop-filter: blur(20px);
        transform: ${animation.initialTransform} scale(0.8);
        transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        animation: floatingPanel 4s ease-in-out infinite;
      `;

      // Add connection line to element
      if (position.showConnection) {
        addConnectionLine(panel, rect, position);
      }

      // Add subtle glassmorphism overlay
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, 
          rgba(255, 255, 255, 0.1) 0%, 
          rgba(255, 255, 255, 0.05) 100%);
        pointer-events: none;
        border-radius: 16px;
        z-index: 1;
        animation: panelGlow 3s ease-in-out infinite;
      `;
      panel.appendChild(overlay);

      // Create modern header
      const header = document.createElement("div");
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: rgba(248, 250, 252, 0.95);
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        font-weight: 600;
        font-size: 12px;
        color: #1e293b;
        backdrop-filter: blur(15px);
        position: relative;
        z-index: 2;
        min-height: 40px;
        border-radius: 16px 16px 0 0;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
      `;

      const title = document.createElement("span");
      title.textContent = "Element HTML";
      title.style.color = "#1e293b";
      title.style.fontWeight = "600";

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "×";
      closeBtn.className = "close-btn";
      closeBtn.style.cssText = `
        background: rgba(0, 0, 0, 0.05);
        border: 1px solid rgba(0, 0, 0, 0.1);
        color: #64748b;
        font-size: 16px;
        cursor: pointer;
        padding: 2px 6px;
        width: 20px;
        height: 20px;
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
        closeBtn.style.background = "rgba(0, 0, 0, 0.1)";
        closeBtn.style.transform = "scale(1.1)";
      };
      closeBtn.onmouseout = () => {
        closeBtn.style.background = "rgba(0, 0, 0, 0.05)";
        closeBtn.style.transform = "scale(1)";
      };

      header.appendChild(title);
      header.appendChild(closeBtn);

      // Create content area
      const content = document.createElement("div");
      content.style.cssText = `
        flex: 1;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
      `;

      // Modern code header
      const codeHeader = document.createElement("div");
      codeHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 16px;
        background: rgba(241, 245, 249, 0.95);
        border-bottom: 1px solid rgba(0, 0, 0, 0.04);
        font-size: 10px;
        font-weight: 500;
        color: #475569;
        backdrop-filter: blur(15px);
        position: relative;
        z-index: 2;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
      `;

      const codeTitle = document.createElement("span");
      codeTitle.textContent = "HTML Code";
      codeTitle.style.color = "#475569";
      codeTitle.style.fontWeight = "500";

      // right action buttons container
      const rActionButtonsWrapper = document.createElement("div");
      rActionButtonsWrapper.id = "action-buttons-wrapper";
      rActionButtonsWrapper.style.cssText = `
        display:flex;
        flex-direction:row;
        gap:4px;
      `;
      // Init clone with AI Button
      const toggleSidePanelBtn = document.createElement("button");
      toggleSidePanelBtn.textContent = "Clone with Jamiu Ai";
      toggleSidePanelBtn.style.cssText = `
        background: linear-gradient(135deg,rgb(255, 255, 255), #005a9e);
        color: 005a9e;
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
        toggleSidePanelBtn.addEventListener(event, async (e) => {
          e.stopPropagation();
          e.preventDefault();
          e.stopImmediatePropagation();
          try {
            browser.runtime.sendMessage({
              type: "OPEN_SIDE_PANEL",
            });
            console.log("Message sent to side panel");
          } catch (error) {
            console.error("Failed to send message to side panel:", error);
          }
        });

        console.log(event, "event");
      });

      const copyBtn = document.createElement("button");
      copyBtn.textContent = "📋 Copy";
      copyBtn.setAttribute("data-copy", "HTML");
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

      copyBtn.onmouseover = () => {
        copyBtn.style.background = "linear-gradient(135deg, #005a9e, #004080)";
        copyBtn.style.transform = "translateY(-1px)";
        copyBtn.style.boxShadow =
          "0 4px 12px rgba(0, 122, 204, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)";
      };
      copyBtn.onmouseout = () => {
        copyBtn.style.background = "linear-gradient(135deg, #007acc, #005a9e)";
        copyBtn.style.transform = "translateY(0)";
        copyBtn.style.boxShadow =
          "0 2px 8px rgba(0, 122, 204, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)";
      };

      actionEvents.forEach((event) => {
        copyBtn.addEventListener(event, (e) => {
          e.stopPropagation();
          e.preventDefault();
          e.stopImmediatePropagation();
          copyBtn.style.background = "green";
          setTimeout(() => {
            copyBtn.style.background =
              "linear-gradient(135deg, #007acc, #005a9e)";
          }, 200);
          copyToClipboard(elementCode.html, "HTML");
        });
      });
      rActionButtonsWrapper.appendChild(toggleSidePanelBtn);
      rActionButtonsWrapper.appendChild(copyBtn);
      codeHeader.appendChild(codeTitle);
      codeHeader.appendChild(rActionButtonsWrapper);

      // Create modern code editor
      const codeEditor = document.createElement("pre");
      codeEditor.style.cssText = `
        flex: 1;
        margin: 0;
        padding: 16px 20px;
        background: rgba(255, 255, 255, 0.98);
        color: #334155;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Fira Code', monospace;
        font-size: 10px;
        line-height: 1.4;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        backdrop-filter: blur(15px);
        position: relative;
        border-radius: 0 0 16px 16px;
        max-height: none;
        min-height: 200px;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
      `;

      const code = document.createElement("code");
      code.textContent = elementCode.html;
      codeEditor.appendChild(code);

      // Assemble the panel
      content.appendChild(codeHeader);
      content.appendChild(codeEditor);
      panel.appendChild(header);
      panel.appendChild(content);

      // Add to DOM
      codePanel.appendChild(panel);
      document.body.appendChild(codePanel);

      // Trigger entry animation for orb
      requestAnimationFrame(() => {
        panel.style.opacity = "1";
        panel.style.transform = animation.finalTransform + " scale(1)";
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

      console.log("Smart code panel created and added to DOM");
    }

    // Smart positioning algorithm
    function calculateOptimalPosition(
      rect: DOMRect,
      screenWidth: number,
      screenHeight: number,
      isPopupOpen: boolean
    ) {
      const elementCenterX = rect.left + rect.width / 2;
      const elementCenterY = rect.top + rect.height / 2;
      const elementRight = rect.right;
      const elementBottom = rect.bottom;

      // Base panel dimensions
      const baseWidth = isPopupOpen ? 350 : 500;
      const baseHeight = isPopupOpen ? 250 : 320;
      const margin = 20;

      let position = { top: 0, left: 0, showConnection: true };

      // Check available space in each direction
      const spaceAbove = rect.top - baseHeight - margin;
      const spaceBelow = screenHeight - elementBottom - baseHeight - margin;
      const spaceLeft = rect.left - baseWidth - margin;
      const spaceRight = screenWidth - elementRight - baseWidth - margin;

      // When popup is open, prefer right side
      if (isPopupOpen) {
        position.left = screenWidth - baseWidth - margin;
        position.top = Math.max(
          margin,
          Math.min(rect.top, screenHeight - baseHeight - margin)
        );
        return position;
      }

      // Determine best position based on available space
      if (spaceBelow >= 0 && spaceBelow >= spaceAbove) {
        // Position below element
        position.top = elementBottom + 10;
        position.left = Math.max(
          margin,
          Math.min(
            elementCenterX - baseWidth / 2,
            screenWidth - baseWidth - margin
          )
        );
      } else if (spaceAbove >= 0) {
        // Position above element
        position.top = rect.top - baseHeight - 10;
        position.left = Math.max(
          margin,
          Math.min(
            elementCenterX - baseWidth / 2,
            screenWidth - baseWidth - margin
          )
        );
      } else if (spaceRight >= 0 && spaceRight >= spaceLeft) {
        // Position to the right
        position.left = elementRight + 10;
        position.top = Math.max(
          margin,
          Math.min(
            elementCenterY - baseHeight / 2,
            screenHeight - baseHeight - margin
          )
        );
      } else if (spaceLeft >= 0) {
        // Position to the left
        position.left = rect.left - baseWidth - 10;
        position.top = Math.max(
          margin,
          Math.min(
            elementCenterY - baseHeight / 2,
            screenHeight - baseHeight - margin
          )
        );
      } else {
        // Fallback: center of screen
        position.left = (screenWidth - baseWidth) / 2;
        position.top = (screenHeight - baseHeight) / 2;
        position.showConnection = false;
      }

      return position;
    }

    // Adaptive sizing based on element and screen
    function calculateAdaptiveSize(
      rect: DOMRect,
      screenWidth: number,
      screenHeight: number,
      isPopupOpen: boolean
    ) {
      const elementArea = rect.width * rect.height;
      const screenArea = screenWidth * screenHeight;
      const elementRatio = elementArea / screenArea;

      // Base sizes
      let width = isPopupOpen ? 350 : 500;
      let height = isPopupOpen ? 250 : 320;

      // Adjust based on element size
      if (elementRatio > 0.1) {
        // Large element - make panel bigger
        width = Math.min(width * 1.2, screenWidth * 0.8);
        height = Math.min(height * 1.2, screenHeight * 0.6);
      } else if (elementRatio < 0.01) {
        // Small element - make panel smaller
        width = Math.max(width * 0.8, 300);
        height = Math.max(height * 0.8, 200);
      }

      // Ensure minimum and maximum bounds
      width = Math.max(300, Math.min(width, screenWidth * 0.9));
      height = Math.max(200, Math.min(height, screenHeight * 0.8));

      return { width, height };
    }

    // Determine entry animation based on position
    function determineEntryAnimation(
      position: any,
      elementCenterX: number,
      elementCenterY: number,
      screenWidth: number,
      screenHeight: number
    ) {
      const panelCenterX = position.left + 250; // Approximate panel center
      const panelCenterY = position.top + 160; // Approximate panel center

      // Calculate direction from element to panel
      const deltaX = panelCenterX - elementCenterX;
      const deltaY = panelCenterY - elementCenterY;

      let initialTransform = "scale(0.8) translateY(20px)";
      let finalTransform = "scale(1) translateY(0px)";

      // Determine animation based on relative position
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal movement
        if (deltaX > 0) {
          // Panel is to the right of element
          initialTransform = "scale(0.8) translateX(-30px)";
          finalTransform = "scale(1) translateX(0px)";
        } else {
          // Panel is to the left of element
          initialTransform = "scale(0.8) translateX(30px)";
          finalTransform = "scale(1) translateX(0px)";
        }
      } else {
        // Vertical movement
        if (deltaY > 0) {
          // Panel is below element
          initialTransform = "scale(0.8) translateY(-30px)";
          finalTransform = "scale(1) translateY(0px)";
        } else {
          // Panel is above element
          initialTransform = "scale(0.8) translateY(30px)";
          finalTransform = "scale(1) translateY(0px)";
        }
      }

      return { initialTransform, finalTransform };
    }

    // Add connection line to element
    function addConnectionLine(
      panel: HTMLElement,
      rect: DOMRect,
      position: any
    ) {
      if (!codePanel) return;

      // Calculate positions
      const panelCenterX = position.left + 250;
      const panelCenterY = position.top + 160;
      const elementCenterX = rect.left + rect.width / 2;
      const elementCenterY = rect.top + rect.height / 2;

      const deltaX = panelCenterX - elementCenterX;
      const deltaY = panelCenterY - elementCenterY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Create curved connection line using SVG
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999998;
        overflow: visible;
      `;

      // Calculate control points for smooth curve
      const startX = elementCenterX;
      const startY = elementCenterY;
      const endX = panelCenterX;
      const endY = panelCenterY;

      // Create control points for a smooth curve
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const offset = Math.min(distance * 0.3, 100); // Curve offset

      // Adjust control points based on direction
      let control1X, control1Y, control2X, control2Y;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal movement - curve vertically
        control1X = startX + deltaX * 0.3;
        control1Y = startY - offset;
        control2X = startX + deltaX * 0.7;
        control2Y = endY + offset;
      } else {
        // Vertical movement - curve horizontally
        control1X = startX - offset;
        control1Y = startY + deltaY * 0.3;
        control2X = endX + offset;
        control2Y = startY + deltaY * 0.7;
      }

      // Create the main path with glow effect
      const glowPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      const pathData = `M ${startX} ${startY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${endX} ${endY}`;

      glowPath.setAttribute("d", pathData);
      glowPath.style.cssText = `
        fill: none;
        stroke: url(#glowGradient);
        stroke-width: 8;
        stroke-linecap: round;
        opacity: 0.3;
        filter: blur(3px);
      `;

      // Create the main path
      const mainPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      mainPath.setAttribute("d", pathData);
      mainPath.style.cssText = `
        fill: none;
        stroke: url(#connectionGradient);
        stroke-width: 3;
        stroke-linecap: round;
        filter: drop-shadow(0 2px 4px rgba(1, 152, 246, 0.3));
        animation: connectionFlow 3s ease-in-out infinite;
      `;

      // Create animated particles along the path
      const particles = createParticles(pathData, distance);

      // Create gradients
      const defs = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "defs"
      );

      // Main gradient
      const gradient = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "linearGradient"
      );
      gradient.setAttribute("id", "connectionGradient");

      const stop1 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "stop"
      );
      stop1.setAttribute("offset", "0%");
      stop1.setAttribute("stop-color", "rgba(1, 152, 246, 0.9)");

      const stop2 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "stop"
      );
      stop2.setAttribute("offset", "30%");
      stop2.setAttribute("stop-color", "rgba(1, 152, 246, 0.6)");

      const stop3 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "stop"
      );
      stop3.setAttribute("offset", "70%");
      stop3.setAttribute("stop-color", "rgba(1, 152, 246, 0.3)");

      const stop4 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "stop"
      );
      stop4.setAttribute("offset", "100%");
      stop4.setAttribute("stop-color", "rgba(1, 152, 246, 0.1)");

      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
      gradient.appendChild(stop3);
      gradient.appendChild(stop4);

      // Glow gradient
      const glowGradient = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "linearGradient"
      );
      glowGradient.setAttribute("id", "glowGradient");

      const glowStop1 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "stop"
      );
      glowStop1.setAttribute("offset", "0%");
      glowStop1.setAttribute("stop-color", "rgba(1, 152, 246, 0.4)");

      const glowStop2 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "stop"
      );
      glowStop2.setAttribute("offset", "100%");
      glowStop2.setAttribute("stop-color", "rgba(1, 152, 246, 0.1)");

      glowGradient.appendChild(glowStop1);
      glowGradient.appendChild(glowStop2);

      defs.appendChild(gradient);
      defs.appendChild(glowGradient);

      // Add enhanced connection dots
      const startDot = createEnhancedDot(startX, startY, 5, "start");
      const endDot = createEnhancedDot(endX, endY, 4, "end");

      // Add animations
      const style = document.createElement("style");
      style.textContent = `
        @keyframes connectionFlow {
          0%, 100% { 
            stroke-dasharray: 0 1000;
            opacity: 0.7;
          }
          50% { 
            stroke-dasharray: 1000 0;
            opacity: 1;
          }
        }
        
        @keyframes dotPulse {
          0%, 100% { 
            transform: scale(1);
            opacity: 0.9;
          }
          50% { 
            transform: scale(1.3);
            opacity: 1;
          }
        }
        
        @keyframes particleFloat {
          0% { 
            opacity: 0;
            transform: translateY(0px);
          }
          50% { 
            opacity: 1;
          }
          100% { 
            opacity: 0;
            transform: translateY(-20px);
          }
        }
        
        @keyframes glowPulse {
          0%, 100% { 
            opacity: 0.2;
            stroke-width: 8;
          }
          50% { 
            opacity: 0.4;
            stroke-width: 10;
          }
        }
        
        @keyframes floatingPanel {
          0%, 100% { 
            transform: translateY(0px);
            box-shadow: 
              0 20px 40px rgba(0, 0, 0, 0.1),
              0 8px 16px rgba(0, 0, 0, 0.06),
              0 0 0 1px rgba(255, 255, 255, 0.8);
          }
          50% { 
            transform: translateY(-4px);
            box-shadow: 
              0 24px 48px rgba(0, 0, 0, 0.12),
              0 10px 20px rgba(0, 0, 0, 0.08),
              0 0 0 1px rgba(255, 255, 255, 0.9);
          }
        }
        
        @keyframes panelGlow {
          0%, 100% { 
            opacity: 0.4;
          }
          50% { 
            opacity: 0.6;
          }
        }
      `;
      document.head.appendChild(style);

      // Assemble SVG
      svg.appendChild(defs);
      svg.appendChild(glowPath);
      svg.appendChild(mainPath);

      // Add enhanced dots (they return arrays)
      startDot.forEach((dot) => svg.appendChild(dot));
      endDot.forEach((dot) => svg.appendChild(dot));

      // Add particles
      particles.forEach((particle) => svg.appendChild(particle));

      codePanel.appendChild(svg);
    }

    // Create enhanced connection dots
    function createEnhancedDot(
      x: number,
      y: number,
      radius: number,
      type: string
    ) {
      const dot = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      dot.setAttribute("cx", x.toString());
      dot.setAttribute("cy", y.toString());
      dot.setAttribute("r", radius.toString());

      const isStart = type === "start";
      const delay = isStart ? "0s" : "0.5s";

      dot.style.cssText = `
        fill: ${isStart ? "rgba(1, 152, 246, 0.95)" : "rgba(1, 152, 246, 0.8)"};
        stroke: rgba(255, 255, 255, 0.9);
        stroke-width: ${isStart ? "2.5" : "2"};
        filter: drop-shadow(0 ${
          isStart ? "3px 6px" : "2px 4px"
        } rgba(1, 152, 246, 0.5));
        animation: dotPulse 2s ease-in-out infinite ${delay};
      `;

      // Add inner glow
      const innerGlow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      innerGlow.setAttribute("cx", x.toString());
      innerGlow.setAttribute("cy", y.toString());
      innerGlow.setAttribute("r", (radius * 0.6).toString());
      innerGlow.style.cssText = `
        fill: rgba(255, 255, 255, 0.3);
        filter: blur(1px);
      `;

      return [dot, innerGlow];
    }

    // Create animated particles along the path
    function createParticles(pathData: string, distance: number) {
      const particles: SVGElement[] = [];
      const particleCount = Math.floor(distance / 50); // One particle every 50px

      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle"
        );
        const progress = i / (particleCount - 1);

        // Calculate position along the path (simplified)
        const startX = parseFloat(pathData.match(/M ([\d.]+)/)?.[1] || "0");
        const startY = parseFloat(
          pathData.match(/M ([\d.]+) ([\d.]+)/)?.[2] || "0"
        );
        const endX = parseFloat(
          pathData.match(/C [\d.]+ [\d.]+, [\d.]+ [\d.]+, ([\d.]+)/)?.[1] || "0"
        );
        const endY = parseFloat(
          pathData.match(
            /C [\d.]+ [\d.]+, [\d.]+ [\d.]+, [\d.]+ ([\d.]+)/
          )?.[1] || "0"
        );

        const x = startX + (endX - startX) * progress;
        const y = startY + (endY - startY) * progress;

        particle.setAttribute("cx", x.toString());
        particle.setAttribute("cy", y.toString());
        particle.setAttribute("r", "1");
        particle.style.cssText = `
          fill: rgba(255, 255, 255, 0.8);
          animation: particleFloat 3s ease-in-out infinite ${i * 0.2}s;
        `;

        particles.push(particle);
      }

      return particles;
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

    function removeCodePanel() {
      if (codePanel && codePanel.parentNode) {
        // Remove any connection lines (SVG elements)
        const connectionLines = codePanel.querySelectorAll("svg");
        connectionLines.forEach((line) => line.remove());

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
    // Take screenshot of the element

    async function extractElementCode(element: HTMLElement) {
      if (!element || !element.tagName) {
        return {
          html: "<!-- Invalid element -->",
          css: "/* No styles available */",
          blobURL: null,
        };
      }
      let screenShotUrl: string | null = null;
      try {
        screenShotUrl = await takeScreenshot(false);
      } catch (error) {
        console.error("Error taking screenshot:", error);
      }
      console.log(screenShotUrl);
      return {
        html: extractHTML(element),
        css: extractCSS(element),
        blobURL: screenShotUrl || null,
      };
    }

    function extractHTML(element: HTMLElement): string {
      const elementsToIgnore = ["dommy-camera-btn"];
      if (!element || !element.tagName) {
        return "<!-- Invalid element -->";
      }

      // Get the outer HTML of the element
      let html = element.outerHTML;
      const domParser = new DOMParser();
      const domHtml = domParser.parseFromString(html, "text/html");
      elementsToIgnore.forEach((el) => {
        const els = domHtml.querySelectorAll(`#${el}`);
        els.forEach((_el) => {
          _el.remove();
        });
      });
      // Format the HTML with proper indentation
      html = formatHTML(domHtml.body.outerHTML);
      return html;
    }

    function extractCSS(element: HTMLElement): string {
      if (!element || !element.tagName) {
        return "/* Invalid element */";
      }

      const styles: string[] = [];

      // Get computed styles
      const computedStyle = window.getComputedStyle(element);

      return "/* No JavaScript found for this element */";
    }

    function formatHTML(html: string): string {
      // Simple HTML formatting
      let formatted = html;
      console.log("HTML before formatting:", formatted);
      return formatted;
    }

    function getCSSRulesForElement(element: HTMLElement): string[] {
      const rules: string[] = [];
      return rules;
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

    async function takeScreenshot(
      shouldDownload?: boolean
    ): Promise<string | null> {
      console.log("Taking screenshot", currentHoveredElement);
      if (!currentHoveredElement) {
        console.log("No element selected for screenshot");
        return null;
      }
      let url: string | null = null;

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

        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) {
              const _url = URL.createObjectURL(blob);

              // a.click();
              if (shouldDownload) {
                const a = document.createElement("a");
                a.href = _url;
                a.download = `dommy-screenshot-${Date.now()}.png`;
                URL.revokeObjectURL(_url);
                a.click();
              }
              console.log("Screenshot taken successfully", _url);
              resolve(_url);
            } else {
              console.error("Failed to create blob from canvas");
              resolve(null);
            }
          }, "image/png");
        });
      } catch (error) {
        console.error("Error taking screenshot:", error);
        return null;
      }
    }
  },
});
