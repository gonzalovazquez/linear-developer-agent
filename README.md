# Linear-Claude Automation

Automated SDLC workflow that transforms Linear issues into GitHub Pull Requests using Claude AI.

## 🎯 What It Does

1. **Linear Webhook** → Detects when issue moves to "In Progress"
2. **Claude AI** → Generates implementation based on issue description
3. **GitHub API** → Creates branch, commits code, opens PR
4. **PR Feedback** → Interactive code reviews via GitHub comments

## 📦 Three Automation Versions

### V1: Planning Only
- Generates implementation plan
- No code generation
- Good for validation and understanding

### V2: Full Local Implementation
- Generates and validates code locally
- Runs xcodebuild to verify compilation
- Iterative refinement (up to 3 attempts)
- Requires local repository clone

### V3: Cloud-Native ☁️ (Recommended)
- Operates purely via GitHub API
- No local dependencies
- Stateless and scalable
- Perfect for serverless deployment

Set version in `.env`:
```bash
AUTOMATION_VERSION=v3  # v1, v2, or v3
```

## 💬 Interactive PR Feedback

Comment on any automated PR with `@claude` or `/claude` to chat with Claude:

```
@claude Can you add error handling for network failures?
```

Claude will:
1. Read your feedback
2. Update the code
3. Push new commits
4. Reply to your comment

See [PR-FEEDBACK.md](./PR-FEEDBACK.md) for details.

## 🚀 Quick Start

See [QUICKSTART.md](./QUICKSTART.md) for detailed setup instructions.

### Prerequisites

- Node.js 18+
- GitHub account with Personal Access Token
- Linear account with API key
- Anthropic API key (Claude)

### Installation

```bash
cd automation
npm install
cp .env.example .env
# Edit .env with your credentials
npm run build
```

### Local Development

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Expose with ngrok
ngrok http 3000
```

Configure webhooks:
- **Linear**: Settings → API → Webhooks → Add webhook
- **GitHub**: Repo Settings → Webhooks → Add webhook

### Production Deployment

Deploy to Vercel, Railway, or AWS Lambda:

```bash
# Vercel
vercel deploy

# Railway
railway up

# AWS Lambda
npm run build
zip -r function.zip dist/ node_modules/
aws lambda update-function-code --function-name linear-automation --zip-file fileb://function.zip
```

## 📖 Documentation

- [QUICKSTART.md](./QUICKSTART.md) - Setup guide
- [CLOUD-NATIVE.md](./CLOUD-NATIVE.md) - V3 architecture details
- [PR-FEEDBACK.md](./PR-FEEDBACK.md) - Interactive PR reviews
- [.env.example](./.env.example) - Configuration reference

## 🔧 Environment Variables

```bash
# Linear API
LINEAR_API_KEY=lin_api_xxx
LINEAR_WEBHOOK_SECRET=optional_secret

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxx

# GitHub
GITHUB_TOKEN=ghp_xxx
GITHUB_OWNER=your-username
GITHUB_REPO=your-repo

# Automation Version
AUTOMATION_VERSION=v3  # v1, v2, or v3

# Repository Path (V2 only)
REPO_PATH=/path/to/local/repo

# Server
PORT=3000
NODE_ENV=production
```

## 🎯 Workflow

### Linear → GitHub PR

```
┌─────────────┐
│ Linear Issue│
│ → In Progress│
└──────┬──────┘
       │ Webhook
       ▼
┌─────────────┐
│   Claude    │
│  Generates  │
│    Code     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   GitHub    │
│ Branch + PR │
└─────────────┘
```

### PR Feedback Loop

```
┌─────────────┐
│ You comment │
│   @claude   │
└──────┬──────┘
       │ Webhook
       ▼
┌─────────────┐
│   Claude    │
│ Updates Code│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ New Commits │
│   + Reply   │
└─────────────┘
```

## 🔒 Security

- Webhook signature verification
- Environment-based credentials
- No hardcoded secrets
- Bot comment detection (prevents loops)
- All code changes visible in PR

## 📊 Monitoring

Watch server logs:

```bash
# Local
npm run dev

# Production (Vercel)
vercel logs --follow

# Production (Railway)
railway logs
```

## 🤝 Contributing

This is an internal automation tool. For issues or enhancements, create a Linear ticket.

## 📝 License

ISC
