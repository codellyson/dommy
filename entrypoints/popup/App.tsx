import { useState, useEffect } from "react";
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
    setActiveTab(tabName);
  };

  return (
    <div className="app">
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

      {elementCode && (
        <div className="code-pane">
          <h3>Element Code</h3>

          <div className="code-tabs">
            <div
              className={`code-tab ${activeTab === "html" ? "active" : ""}`}
              onClick={() => switchTab("html")}
            >
              HTML
            </div>
            <div
              className={`code-tab ${activeTab === "css" ? "active" : ""}`}
              onClick={() => switchTab("css")}
            >
              CSS
            </div>
            <div
              className={`code-tab ${
                activeTab === "javascript" ? "active" : ""
              }`}
              onClick={() => switchTab("javascript")}
            >
              JavaScript
            </div>
          </div>

          <div className="code-content">
            {activeTab === "html" && (
              <div className="code-block active">
                <div className="code-header">
                  <span>HTML</span>
                  <button
                    className="copy-btn"
                    data-copy="html"
                    onClick={() => copyToClipboard(elementCode.html, "html")}
                  >
                    📋 Copy
                  </button>
                </div>
                <pre className="code-editor">
                  <code>{elementCode.html}</code>
                </pre>
              </div>
            )}

            {activeTab === "css" && (
              <div className="code-block active">
                <div className="code-header">
                  <span>CSS</span>
                  <button
                    className="copy-btn"
                    data-copy="css"
                    onClick={() => copyToClipboard(elementCode.css, "css")}
                  >
                    📋 Copy
                  </button>
                </div>
                <pre className="code-editor">
                  <code>{elementCode.css}</code>
                </pre>
              </div>
            )}

            {activeTab === "javascript" && (
              <div className="code-block active">
                <div className="code-header">
                  <span>JavaScript</span>
                  <button
                    className="copy-btn"
                    data-copy="javascript"
                    onClick={() =>
                      copyToClipboard(elementCode.javascript, "javascript")
                    }
                  >
                    📋 Copy
                  </button>
                </div>
                <pre className="code-editor">
                  <code>{elementCode.javascript}</code>
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

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
