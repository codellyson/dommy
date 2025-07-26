// AI Service for Cloudflare AI integration
export interface ElementAnalysis {
  tagName: string;
  className: string;
  id: string;
  attributes: Record<string, string>;
  computedStyles: Record<string, string>;
  textContent: string;
  children: ElementAnalysis[];
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface CloneRequest {
  element: ElementAnalysis;
  targetFramework?: "html" | "react" | "vue" | "svelte" | "vanilla";
  includeStyles?: boolean;
  includeInteractions?: boolean;
}

export interface CloneResponse {
  code: string;
  framework: string;
  description: string;
  dependencies?: string[];
}

class AIService {
  private apiToken: string | null = null;
  private accountId: string | null = null;
  private baseUrl = "https://api.cloudflare.com/client/v4/accounts/";

  constructor() {
    // Load API token from storage
    this.loadApiToken();
  }

  private async loadApiToken() {
    try {
      const result = await browser.storage.local.get([
        "cloudflareApiToken",
        "cloudflareAccountId",
      ]);
      this.apiToken = result.cloudflareApiToken || null;
      this.accountId = result.cloudflareAccountId || null;
    } catch (error) {
      console.error("Failed to load API credentials:", error);
    }
  }

  async setApiToken(token: string, accountId: string) {
    this.apiToken = token;
    this.accountId = accountId;
    await browser.storage.local.set({
      cloudflareApiToken: token,
      cloudflareAccountId: accountId,
    });
  }

  private async makeRequest(model: string, prompt: string): Promise<string> {
    if (!this.apiToken || !this.accountId) {
      throw new Error("Cloudflare API token and Account ID not configured");
    }

    const response = await fetch(
      `${this.baseUrl}${this.accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `AI request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    console.log("AI Response:", data);

    // Parse markdown response to extract clean code
    let cleanResponse = data.result.response;

    // Extract code from markdown code blocks while preserving structure
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const matches = [...cleanResponse.matchAll(codeBlockRegex)];

    if (matches.length > 0) {
      // If we have code blocks, extract and combine them
      cleanResponse = matches
        .map((match) => {
          const language = match[1] || "html";
          const code = match[2].trim();
          return `<!-- ${language.toUpperCase()} Code -->\n${code}`;
        })
        .join("\n\n");
    } else {
      // If no code blocks, just clean up the response
      cleanResponse = cleanResponse
        .replace(/```[\w]*\n/g, "")
        .replace(/```/g, "");
    }

    // Clean up any remaining markdown formatting
    cleanResponse = cleanResponse.replace(
      /^\s*<!--\s*([^>]+)\s*-->\s*$/gm,
      "<!-- $1 -->"
    );

    // Trim extra whitespace
    cleanResponse = cleanResponse.trim();

    console.log("Cleaned response:", cleanResponse.substring(0, 200) + "...");

    return cleanResponse;
  }

  async generateCloneCode(request: CloneRequest): Promise<CloneResponse> {
    if (!request || !request.element) {
      throw new Error("Invalid request: element is required");
    }

    const element = request.element;
    const framework = request.targetFramework || "html";
    console.log({ request, element });

    // Validate element has required properties
    if (
      !element.tagName ||
      !element.attributes ||
      !element.computedStyles ||
      !element.position
    ) {
      throw new Error("Invalid element: missing required properties");
    }

    // Create a detailed prompt for the AI
    const prompt = this.createPrompt(element, framework, request);

    try {
      // Use Cloudflare's @cf/meta/llama-3.1-8b-instruct model
      const response = await this.makeRequest("@cf/qwen/qwq-32b", prompt);

      console.log("AI Response received:", {
        responseLength: response?.length || 0,
        responsePreview: response?.substring(0, 200) + "...",
        isComplete:
          response?.includes("</html>") ||
          response?.includes("}") ||
          response?.includes("</script>"),
      });

      return {
        code: response,
        framework: framework,
        description: `Generated ${framework} code for ${element?.tagName} element`,
        dependencies: this.getDependencies(framework),
      };
    } catch (error) {
      console.error("AI generation failed:", error);
      throw error;
    }
  }

  private createPrompt(
    element: ElementAnalysis,
    framework: string,
    request: CloneRequest
  ): string {
    console.log({ element });
    const elementInfo = `
Element: ${element?.tagName}${element?.id ? `#${element.id}` : ""}${
      element?.className ? `.${element.className}` : ""
    }
Text: ${element?.textContent?.substring(0, 50) || "None"}
Size: ${
      element?.position
        ? `${element.position.width}x${element.position.height}`
        : "Unknown"
    }
Styles: ${
      element?.computedStyles
        ? Object.entries(element.computedStyles)
            .slice(0, 5)
            .map(([k, v]) => `${k}:${v}`)
            .join(", ")
        : "None"
    }
`;

    const frameworkInstructions = this.getFrameworkInstructions(framework);

    return `You are Jamiu, an expert web developer. Generate ${framework.toUpperCase()} code to clone this element:

${elementInfo}

Requirements:
- Generate ONLY the main component code (HTML structure)
- Keep CSS minimal and inline if needed
- Focus on the core structure and functionality
- Make it responsive and accessible
- Add brief comments

${frameworkInstructions}

Provide ONLY the code, no explanations. Keep it concise but complete.`;
  }

  private getFrameworkInstructions(framework: string): string {
    switch (framework) {
      case "react":
        return `
React: Use functional component with hooks, export properly`;

      case "vue":
        return `
Vue: Use Vue 3 Composition API, export properly`;

      case "svelte":
        return `
Svelte: Use modern syntax, export properly`;

      default: // html/vanilla
        return `
HTML: Use semantic elements, tailwind CSS, responsive design`;
    }
  }

  private getDependencies(framework: string): string[] {
    switch (framework) {
      case "react":
        return ["react", "react-dom"];
      case "vue":
        return ["vue"];
      case "svelte":
        return ["svelte"];
      default:
        return [];
    }
  }

  async analyzeElement(element: HTMLElement): Promise<ElementAnalysis> {
    if (!element || !element.tagName) {
      throw new Error("Invalid element provided to analyzeElement");
    }

    const computedStyle = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    // Get all attributes
    const attributes: Record<string, string> = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.name] = attr.value;
    }

    // Get important computed styles
    const importantStyles = [
      "display",
      "position",
      "width",
      "height",
      "margin",
      "padding",
      "background",
      "color",
      "font-family",
      "font-size",
      "font-weight",
      "border",
      "border-radius",
      "box-shadow",
      "flex",
      "grid",
      "transform",
      "transition",
      "opacity",
      "z-index",
    ];

    const computedStyles: Record<string, string> = {};
    importantStyles.forEach((style) => {
      const value = computedStyle.getPropertyValue(style);
      if (value && value !== "normal" && value !== "none" && value !== "0px") {
        computedStyles[style] = value;
      }
    });

    // Analyze children recursively
    const children: ElementAnalysis[] = [];
    for (let i = 0; i < element.children.length; i++) {
      const child = element.children[i] as HTMLElement;
      if (
        child &&
        child.tagName &&
        child.tagName !== "SCRIPT" &&
        child.tagName !== "STYLE"
      ) {
        children.push(await this.analyzeElement(child));
      }
    }

    return {
      tagName: element.tagName.toLowerCase(),
      className: element.className || "",
      id: element.id || "",
      attributes: attributes || {},
      computedStyles: computedStyles || {},
      textContent: element.textContent?.trim() || "",
      children: children || [],
      position: {
        x: rect.left || 0,
        y: rect.top || 0,
        width: rect.width || 0,
        height: rect.height || 0,
      },
    };
  }
}

export default new AIService();
