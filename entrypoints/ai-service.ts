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
    return data.result.response;
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
      const response = await this.makeRequest(
        "@cf/meta/llama-3.1-8b-instruct",
        prompt
      );

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
Element Analysis:
- Tag: ${element?.tagName}
- Classes: ${element?.className}
- ID: ${element?.id}
- Text Content: ${element?.textContent?.substring(0, 100)}${
      element?.textContent?.length > 100 ? "..." : ""
    }
- Position: ${
      element?.position
        ? `${element.position.width}x${element.position.height} at (${element.position.x}, ${element.position.y})`
        : "Unknown position"
    }
- Key Styles: ${
      element?.computedStyles
        ? Object.entries(element.computedStyles)
            .slice(0, 10)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ")
        : "No styles"
    }
- Attributes: ${
      element?.attributes
        ? Object.entries(element.attributes)
            .map(([k, v]) => `${k}="${v}"`)
            .join(" ")
        : "No attributes"
    }
- Children: ${element?.children?.length || 0} child elements
`;

    const frameworkInstructions = this.getFrameworkInstructions(framework);

    return `You are Jamiu, an expert web developer and UI/UX specialist. Your task is to generate clean, reusable code to clone the following HTML element.

${elementInfo}

Requirements:
- Generate ${framework.toUpperCase()} code that recreates this element
- Make the code production-ready and well-structured
- Include all necessary styling to match the original appearance
- Add helpful comments explaining the code
- Ensure the code is accessible and follows best practices
- If there are interactions or animations, include them
- Make the code responsive and maintainable

${frameworkInstructions}

Please provide only the code without any explanations before or after. The code should be ready to use immediately.`;
  }

  private getFrameworkInstructions(framework: string): string {
    switch (framework) {
      case "react":
        return `
React Instructions:
- Use functional components with hooks
- Include proper TypeScript types if applicable
- Use modern React patterns (useState, useEffect, etc.)
- Include CSS-in-JS or styled-components for styling
- Make the component reusable and configurable
- Export the component properly`;

      case "vue":
        return `
Vue Instructions:
- Use Vue 3 Composition API
- Include proper TypeScript types if applicable
- Use scoped styles or CSS modules
- Make the component reusable and configurable
- Include proper props and emits
- Export the component properly`;

      case "svelte":
        return `
Svelte Instructions:
- Use modern Svelte syntax
- Include proper TypeScript types if applicable
- Use scoped styles
- Make the component reusable and configurable
- Include proper props and events
- Export the component properly`;

      default: // html/vanilla
        return `
HTML/CSS/JS Instructions:
- Use semantic HTML5 elements
- Include all necessary CSS for styling
- Use modern CSS features (Flexbox, Grid, etc.)
- Include JavaScript for any interactions
- Make the code responsive
- Use BEM or similar naming conventions
- Include proper accessibility attributes`;
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
