import { useState, useEffect, useRef } from "react";
import "./App.css";

// WXT provides browser API globally
declare const browser: any;

function App() {
  const [isElementSelected, setIsElementSelected] = useState(false);
  const [currentElement, setCurrentElement] = useState<string | null>(null);

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
      } else if (message.type === "ELEMENT_UNCLICKED") {
        setCurrentElement(null);
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

  return (
    <div className="app" ref={appRef} tabIndex={0}>
      <div className="header">
        <div className="header-content">
          <div>
            <h1>Dommy</h1>
            <p>DOM Element Developer Tool</p>
          </div>
          <button
            className="settings-link"
            onClick={() =>
              browser.tabs.create({
                url: browser.runtime.getURL("settings.html"),
              })
            }
            title="Open Settings"
          >
            ⚙️
          </button>
        </div>
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
