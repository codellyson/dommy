# Dommy - DOM Element Screenshot & AI Clone Tool

A powerful browser extension that helps you capture DOM elements and generate AI-powered clone code using Cloudflare AI.

## Features

### 🎯 Element Screenshot

- Click on any element to capture it
- Glassmorphism highlighting with camera button
- Smart element hiding for clean screenshots
- High-quality PNG export

### 🤖 AI-Powered Code Generation (Jamiu)

- **Clone with Jamiu**: AI-generated code to recreate any DOM element
- Support for multiple frameworks:
  - HTML/CSS/JavaScript (Vanilla)
  - React components
  - Vue components
  - Svelte components
- Intelligent element analysis
- Production-ready, clean code generation

### 📄 Full Page Capture

- Screenshot entire webpages
- Automatic element hiding
- Responsive design support

## Setup

### 1. Install the Extension

1. Clone this repository
2. Run `pnpm install`
3. Run `pnpm dev` to start development mode
4. Load the extension in your browser

### 2. Configure AI Features (Optional)

To use Jamiu's AI code generation:

1. **Get a Cloudflare AI API Token**:

   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
   - Create a new API token with AI permissions
   - Copy the token

2. **Configure in Extension**:
   - Click the Dommy extension icon
   - Click "Settings"
   - Enter your Cloudflare AI API token
   - Enable AI features
   - Test the connection

## Usage

### Basic Element Selection

1. Click the Dommy extension icon to enable element selection
2. Click on any element on the webpage
3. The element will be highlighted with a glassmorphism effect
4. Click the camera button (📸) to take a screenshot

### AI Code Generation

1. Select an element as above
2. A code panel will appear with two tabs:
   - **"Clone with Jamiu 🤖"**: AI-generated code
   - **"HTML"**: Raw HTML code
3. The AI will analyze the element and generate clean, reusable code
4. Copy the generated code to use in your projects

### Screenshot Options

- **Hide Elements**: Right-click elements to hide them from screenshots
- **Full Page**: Use the full page capture tool for entire webpage screenshots
- **Smart Hiding**: Automatically hides ads, banners, and popups

## AI Features

### What Jamiu Can Do

- Analyze DOM structure and styling
- Generate semantic HTML with proper accessibility
- Create responsive CSS using modern features (Flexbox, Grid)
- Add interactive JavaScript when needed
- Generate framework-specific components (React, Vue, Svelte)
- Include helpful comments and best practices

### Supported Frameworks

- **HTML/CSS/JS**: Vanilla web technologies
- **React**: Functional components with hooks
- **Vue**: Vue 3 Composition API
- **Svelte**: Modern Svelte syntax

### Code Quality

- Production-ready code
- Accessibility compliance
- Responsive design
- Modern CSS features
- Clean, maintainable structure
- TypeScript support where applicable

## Development

### Project Structure

```
dommy/
├── entrypoints/
│   ├── background.ts          # Background script
│   ├── content.ts            # Content script
│   ├── ai-service.ts         # AI integration
│   ├── popup/                # Extension popup
│   └── settings.html         # Settings page
├── public/                   # Static assets
└── package.json
```

### Key Technologies

- **WXT**: Web Extension Toolkit
- **React**: Popup UI
- **TypeScript**: Type safety
- **Cloudflare AI**: Code generation
- **html2canvas**: Screenshot functionality

### Commands

```bash
pnpm dev          # Development mode
pnpm build        # Build for production
pnpm zip          # Create extension package
```

## Privacy & Security

- **Local Processing**: Element analysis happens locally in your browser
- **Secure API**: Cloudflare AI API tokens are stored securely in browser storage
- **No Data Collection**: We don't collect or store any of your data
- **Open Source**: Full transparency of code and functionality

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

If you encounter any issues or have questions:

1. Check the settings page for API token configuration
2. Ensure AI features are enabled
3. Try refreshing the page and selecting the element again
4. Check the browser console for error messages

---

**Made with ❤️ by the Dommy team**
