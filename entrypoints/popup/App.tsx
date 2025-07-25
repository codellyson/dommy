import { useState, useEffect, useRef } from "react";
import "./App.css";

// WXT provides browser API globally
declare const browser: any;

function App() {
  const [isElementSelected, setIsElementSelected] = useState(false);
  const [currentElement, setCurrentElement] = useState<string | null>(null);
  const [elementCode, setElementCode] = useState<{
    html: string;
    css: string;
    javascript: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("html");
  const [isOutOfView, setIsOutOfView] = useState(false);
  const codeBlockRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get initial state from storage
    browser.storage.local.get(["isElementSelected"]).then((result: any) => {
      setIsElementSelected(result.isElementSelected || false);
    });

    // Listen for messages from content script
    browser.runtime.onMessage.addListener((message: any) => {
      if (message.type === "ELEMENT_CLICKED") {
        setCurrentElement(message.elementInfo);
        setElementCode(message.elementCode);
        setActiveTab("html"); // Reset to HTML tab when new element is selected
      } else if (message.type === "ELEMENT_UNCLICKED") {
        setCurrentElement(null);
        setElementCode(null);
      }
    });

    // Notify content script that popup is open
    const notifyPopupOpened = async () => {
      try {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tabs[0]?.id) {
          await browser.tabs.sendMessage(tabs[0].id, {
            type: "POPUP_OPENED",
          });
          console.log("Popup opened notification sent to content script");
        }
      } catch (error) {
        console.error(
          "Failed to notify content script that popup opened:",
          error
        );
      }
    };

    // Send notification after a short delay to ensure popup is fully loaded
    const timeoutId = setTimeout(notifyPopupOpened, 100);

    // Cleanup function to notify when popup closes
    return () => {
      clearTimeout(timeoutId);

      const notifyPopupClosed = async () => {
        try {
          const tabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (tabs[0]?.id) {
            await browser.tabs.sendMessage(tabs[0].id, {
              type: "POPUP_CLOSED",
            });
            console.log("Popup closed notification sent to content script");
          }
        } catch (error) {
          console.error(
            "Failed to notify content script that popup closed:",
            error
          );
        }
      };

      notifyPopupClosed();
    };
  }, []);

  // Collision detection effect
  useEffect(() => {
    const checkCollision = () => {
      if (!codeBlockRef.current || !appRef.current) return;

      const codeBlock = codeBlockRef.current;
      const app = appRef.current;

      const codeBlockRect = codeBlock.getBoundingClientRect();
      const appRect = app.getBoundingClientRect();

      // Check if code block is going out of the app container's view
      const isOutOfBounds =
        codeBlockRect.bottom > appRect.bottom ||
        codeBlockRect.top < appRect.top ||
        codeBlockRect.right > appRect.right ||
        codeBlockRect.left < appRect.left;

      setIsOutOfView(isOutOfBounds);
    };

    // Check collision on mount and when element code changes
    checkCollision();

    // Set up resize observer to monitor size changes
    const resizeObserver = new ResizeObserver(checkCollision);
    if (codeBlockRef.current) {
      resizeObserver.observe(codeBlockRef.current);
    }
    if (appRef.current) {
      resizeObserver.observe(appRef.current);
    }

    // Set up scroll listener for the app container
    const handleScroll = () => {
      setTimeout(checkCollision, 100); // Small delay to ensure DOM updates
    };

    const appElement = appRef.current;
    if (appElement) {
      appElement.addEventListener("scroll", handleScroll);
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      if (appElement) {
        appElement.removeEventListener("scroll", handleScroll);
      }
    };
  }, [elementCode, activeTab]);

  // Keep popup focused effect
  useEffect(() => {
    const keepFocused = () => {
      if (appRef.current) {
        appRef.current.focus();
      }
    };

    // Keep focus on the popup
    const focusInterval = setInterval(keepFocused, 100);

    // Also focus on any click
    const handleWindowClick = () => {
      setTimeout(keepFocused, 10);
    };

    window.addEventListener("click", handleWindowClick);
    window.addEventListener("mousedown", handleWindowClick);

    return () => {
      clearInterval(focusInterval);
      window.removeEventListener("click", handleWindowClick);
      window.removeEventListener("mousedown", handleWindowClick);
    };
  }, []);

  const toggleHoverMode = async () => {
    const newState = !isElementSelected;
    setIsElementSelected(newState);

    // Save to storage
    await browser.storage.local.set({ isElementSelected: newState });

    // Send message to all tabs
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs[0]?.id) {
      await browser.tabs.sendMessage(tabs[0].id, {
        type: "TOGGLE_ELEMENT_SELECTION",
        isElementSelected: newState,
      });
    }
  };

  const takeScreenshot = async () => {
    if (!currentElement) {
      alert("No element selected. Click on an element first.");
      return;
    }

    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs[0]?.id) {
      await browser.tabs.sendMessage(tabs[0].id, {
        type: "TAKE_ELEMENT_SCREENSHOT",
      });
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Show a brief success message
      const button = document.querySelector(
        `[data-copy="${type}"]`
      ) as HTMLButtonElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = "Copied!";
        button.style.background = "#4CAF50";
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = "";
        }, 1000);
      }
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const switchTab = (tabName: string) => {
    console.log("Switching to tab:", tabName);
    setActiveTab(tabName);
  };

  return (
    <div className="app" ref={appRef} tabIndex={0}>
      <div className="header">
        <h1>Dommy</h1>
        <p>DOM Element Developer Tool</p>
      </div>

      <div className="controls">
        <div className="toggle-section">
          <label className="toggle-label">
            <span>Element Selection</span>
            <div className="toggle-switch">
              <input
                type="checkbox"
                checked={isElementSelected}
                onChange={toggleHoverMode}
              />
              <span className="slider"></span>
            </div>
          </label>
          <p className="toggle-description">
            {isElementSelected
              ? "Click on elements to select them"
              : "Enable to start selecting elements"}
          </p>
        </div>

        <div className="screenshot-section">
          <button
            className="screenshot-btn"
            onClick={takeScreenshot}
            disabled={!currentElement}
          >
            📸 Screenshot Element
          </button>
          {currentElement && (
            <div className="element-info">
              <p>
                Selected: <code>{currentElement}</code>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="instructions">
        <h3>How to use:</h3>
        <ol>
          <li>Toggle on "Element Selection"</li>
          <li>Click on any element on the page</li>
          <li>View the element's code in the pane below</li>
          <li>Copy HTML, CSS, or JavaScript as needed</li>
          <li>Click "Screenshot Element" to capture it</li>
        </ol>
      </div>
    </div>
  );
}

export default App;
