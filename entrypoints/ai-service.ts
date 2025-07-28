export interface ElementAnalysis {
  code: string;
  blobURL: string;
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
  private model: string | null = null;
  private baseUrl = "https://api.cloudflare.com/client/v4/accounts/";
  private provider: string | null = null;

  constructor() {
    this.loadApiToken();
  }
  private createBaseUrl() {
    let url = "";
    switch (this.provider) {
      case "cloudflare":
        url = this.baseUrl;
        break;
      case "openai":
        url = "https://api.openai.com/v1/chat/completions";
        break;
      case "anthropic":
        url = "https://api.anthropic.com/v1/messages";
        break;
      case "google":
        url = "https://generativelanguage.googleapis.com/v1beta/models/";
    }
    return url;
  }

  private async loadApiToken() {
    try {
      const retrieve = async (keys: string[]) =>
        await browser.storage.local.get(keys);

      const { aiProvider, aiToken, aiAccountId, aiModel } = await retrieve([
        "aiProvider",
        "aiToken",
        "aiAccountId",
        "aiModel",
      ]);

      if (!aiProvider && !aiToken && !aiAccountId && !aiModel) {
        console.log("No AI configuration found in storage");
        return;
      }

      this.provider = aiProvider || null;
      this.apiToken = aiToken || null;
      this.accountId = aiAccountId || null;
      this.model = aiModel || null;
      console.log("Loaded configuration:", {
        provider: this.provider,
        apiToken: this.apiToken ? "***" : null,
        accountId: this.accountId,
        model: this.model,
      });

      if (!this.apiToken) {
        console.warn("API token not configured");
      }
    } catch (error) {
      console.error("Failed to load API credentials:", error);
    }
  }

  async setAiProvider(provider: {
    aiFeaturesEnabled: boolean;
    aiProvider: string;
    aiToken: string;
    aiAccountId?: string;
    aiModel?: string;
  }) {
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
    this.provider = provider.aiProvider;
    this.apiToken = provider.aiToken;
    this.accountId = provider.aiAccountId || null;
    this.model = provider.aiModel || null;

    const storageData = {
      aiProvider: provider.aiProvider,
      aiToken: provider.aiToken,
      aiAccountId: provider.aiAccountId || null,
      aiModel: provider.aiModel || null,
    };

    await browser.storage.local.set(storageData);
  }

  private async makeRequest(model: string, prompt: string): Promise<any> {
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
          max_tokens: 10000,
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
    return data;
  }

  async generateCloneCode(request: CloneRequest): Promise<CloneResponse> {
    if (!request || !request.element) {
      throw new Error("Invalid request: element is required");
    }

    const element = request.element;
    const framework = request.targetFramework || "html";
    console.log({ request, element });

    // Create a detailed prompt for the AI
    const prompt = this.createPrompt(element, framework);

    try {
      // Use Cloudflare's @cf/meta/llama-3.1-8b-instruct model
      const response = await this.createRequest(
        "gemini-2.0-flash:generateContent",
        prompt
      );

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
        description: `Generated ${framework} code for ${element?.code}, using ${element.blobURL} as inspiration`,
        dependencies: this.getDependencies(framework),
      };
    } catch (error) {
      console.error("AI generation failed:", error);
      throw error;
    }
  }

  private createPrompt(element: ElementAnalysis, framework: string): string {
    console.log({ element });
    const elementCode = element.code;
    const elementImageInspiration = element.blobURL;
    const frameworkInstructions = this.getFrameworkInstructions(framework);

    return `You are Jamiu, an expert web developer. Generate ${framework.toUpperCase()} code to clone this element:

${elementCode}

Requirements:
- Generate a cloned version of the element, with the same structure and functionality but with a more improved design.
- Keep CSS minimal and inline if needed.
- Focus on the core structure and functionality.
- Make it responsive and accessible.
- Add brief comments.
- Use ${elementImageInspiration} as inspiration for the design

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

  private transformAIResponse(result: any, provider: string): string {
    if (!result) return "";

    switch (provider) {
      case "cloudflare":
        // Cloudflare returns { result: { response: string } }
        if (result.result && result.result.response) {
          return this.cleanResponse(result.result.response);
        }
        return "";

      case "openai":
        // OpenAI returns { choices: [{ message: { content: string } }] }
        if (result.choices && result.choices.length > 0) {
          const content = result.choices[0].message?.content;
          return content ? this.cleanResponse(content) : "";
        }
        return "";

      case "anthropic":
        // Anthropic returns { content: [{ type: "text", text: string }] }
        if (result.content && Array.isArray(result.content)) {
          const textContent = result.content.find(
            (item: any) => item.type === "text"
          );
          return textContent?.text ? this.cleanResponse(textContent.text) : "";
        }
        return "";

      case "google":
        // Google returns array with { content: { parts: [{ text: string }] } }
        if (Array.isArray(result) && result.length > 0) {
          const firstResponse = result[0];
          if (firstResponse.content?.parts?.[0]?.text) {
            return this.cleanResponse(firstResponse.content.parts[0].text);
          }
        }
        // Fallback for different Google response structures
        if (result.candidates && result.candidates.length > 0) {
          const candidate = result.candidates[0];
          if (candidate.content?.parts?.[0]?.text) {
            return this.cleanResponse(candidate.content.parts[0].text);
          }
        }
        return "";

      default:
        return this.cleanResponse(String(result));
    }
  }

  private cleanResponse(response: string): string {
    if (!response) return "";

    // Extract code from markdown code blocks while preserving structure
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const matches = [...response.matchAll(codeBlockRegex)];

    if (matches.length > 0) {
      // If we have code blocks, extract and combine them
      const cleanResponse = matches
        .map((match) => {
          const language = match[1] || "html";
          const code = match[2].trim();
          return `<!-- ${language.toUpperCase()} Code -->\n${code}`;
        })
        .join("\n\n");

      // Clean up any remaining markdown formatting
      return cleanResponse
        .replace(/^\s*<!--\s*([^>]+)\s*-->\s*$/gm, "<!-- $1 -->")
        .trim();
    } else {
      // If no code blocks, just clean up the response
      return response
        .replace(/```[\w]*\n/g, "")
        .replace(/```/g, "")
        .trim();
    }
  }
  // make request for different ai providers
  private async makeCloudflareRequest(
    model: string,
    prompt: string
  ): Promise<string> {
    const rawResponse = await this.makeRequest(model, prompt);
    return this.transformAIResponse(rawResponse, "cloudflare");
  }

  private async makeOpenaiRequest(
    model: string,
    prompt: string
  ): Promise<string> {
    // TODO: Implement OpenAI request
    const rawResponse = await this.makeRequest(model, prompt);
    return this.transformAIResponse(rawResponse, "openai");
  }

  private async makeAnthropicRequest(
    model: string,
    prompt: string
  ): Promise<string> {
    const rawResponse = await this.makeRequest(model, prompt);
    return this.transformAIResponse(rawResponse, "anthropic");
  }

  private async makeGeminiRequest(
    model: string,
    prompt: string
  ): Promise<string> {
    const response = await fetch(`${this.createBaseUrl()}${model}`, {
      method: "POST",
      headers: {
        "x-goog-api-key": `${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });
    const data = await response.json();
    console.log("GEMINI AI Response:", data);
    return this.transformAIResponse(data, "google");
  }
  private async createRequest(model: string, prompt: string): Promise<string> {
    switch (this.provider) {
      case "cloudflare":
        return await this.makeCloudflareRequest(model, prompt);
      case "openai":
        return await this.makeOpenaiRequest(model, prompt);
      case "anthropic":
        return await this.makeAnthropicRequest(model, prompt);
      case "google":
        return await this.makeGeminiRequest(model, prompt);
      default:
        return "";
    }
  }
}

export default new AIService();
