# ☁️ Cloud-Native Version (V3) - RECOMMENDED

## Why V3 is Better

### ✅ Advantages
- **No local repository needed** - Works anywhere with internet
- **No git conflicts** - All operations via GitHub API
- **Serverless-ready** - Perfect for Vercel, Lambda, Cloud Run
- **Stateless** - Each run is independent
- **Faster** - No git clone/pull overhead
- **Scalable** - Can process multiple issues in parallel

### ❌ V2 Limitations (Local Version)
- Requires local git repository
- Git conflicts between local and remote
- Needs disk space and file I/O
- Can't run in serverless environments
- State management complexity

## How V3 Works

```
Linear Issue
  ↓
GitHub API: Read files from main branch
  ↓
Claude: Generate implementation
  ↓
GitHub API: Create branch
  ↓
GitHub API: Commit files
  ↓
GitHub API: Create PR
  ↓
Done! No local disk touched.
```

## Setup

### 1. Environment Variables

```bash
# .env
AUTOMATION_VERSION=v3  # Use cloud-native version

LINEAR_API_KEY=lin_api_xxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx
GITHUB_TOKEN=ghp_xxxxx  # Needs repo permissions
GITHUB_OWNER=gonzalovazquez
GITHUB_REPO=AWS-Exam-Helper
```

### 2. GitHub Token Permissions

Your GitHub token needs:
- ✅ `repo` - Full repository access
- ✅ `workflow` - If using GitHub Actions

Create at: https://github.com/settings/tokens

### 3. Test Locally

```bash
cd automation
npm install
npm run dev

# You'll see:
🤖 Version: V3 - Cloud-Native (GitHub API only) ☁️
```

### 4. Test an Issue

```bash
curl -X POST http://localhost:3000/trigger/GV-36
```

Watch the cloud-native magic:
```
================================================================================
☁️  CLOUD-NATIVE AUTONOMOUS IMPLEMENTATION
📋 Issue: GV-36
================================================================================

📋 Title: No Input Validation on Auth Forms
🏷️  Labels: ux, security, Bug

🌿 Created branch: gv-36-no-input-validation-on-auth-forms from main

🤖 Claude is analyzing and implementing (cloud-native)...
📚 Found 1 files mentioned in issue
📖 Read file from GitHub: AWSExamHelper/AuthView.swift (12450 chars)
📖 Read 1 files from GitHub for context

🧠 Sending to Claude...
📄 Parsed file: AWSExamHelper/AuthView.swift (15600 chars)

💾 Committing 1 files to GitHub...
✅ Files committed to gv-36-no-input-validation-on-auth-forms

📝 Creating Pull Request...
✅ PR created: https://github.com/gonzalovazquez/AWS-Exam-Helper/pull/123

================================================================================
✅ CLOUD-NATIVE IMPLEMENTATION COMPLETE
📦 Pull Request: https://github.com/gonzalovazquez/AWS-Exam-Helper/pull/123
================================================================================
```

## Deploy to Production

### Vercel (Recommended)

```bash
vercel

# Add environment variables
vercel env add LINEAR_API_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add GITHUB_TOKEN
vercel env add GITHUB_OWNER
vercel env add GITHUB_REPO
vercel env add AUTOMATION_VERSION
# Enter: v3

vercel --prod
```

### AWS Lambda

```yaml
# serverless.yml
functions:
  automation:
    handler: dist/index.handler
    environment:
      AUTOMATION_VERSION: v3
      LINEAR_API_KEY: ${env:LINEAR_API_KEY}
      ANTHROPIC_API_KEY: ${env:ANTHROPIC_API_KEY}
      GITHUB_TOKEN: ${env:GITHUB_TOKEN}
      GITHUB_OWNER: gonzalovazquez
      GITHUB_REPO: AWS-Exam-Helper
```

### Railway/Render

Just set environment variables and deploy - no special configuration needed!

## Version Comparison

| Feature | V1 (Planning) | V2 (Local) | V3 (Cloud) ☁️ |
|---------|--------------|------------|---------------|
| No local repo | ✅ | ❌ | ✅ |
| Code generation | ❌ | ✅ | ✅ |
| Build validation | ❌ | ✅ | ❌* |
| Serverless | ✅ | ❌ | ✅ |
| Scalable | ✅ | ❌ | ✅ |
| Git conflicts | N/A | ❌ | ✅ |
| Speed | Fast | Slow | Fast |
| Disk usage | None | High | None |

*Build validation can be done via GitHub Actions instead

## GitHub Actions Integration

Want build validation with V3? Use GitHub Actions:

```yaml
# .github/workflows/pr-check.yml
name: PR Checks
on: pull_request

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build
        run: xcodebuild -project AWSExamHelper.xcodeproj -scheme AWSExamHelper build
```

Then V3 creates the PR → GitHub Actions runs build → You review!

## Switching Versions

### Use V3 (Cloud-Native - Recommended)
```bash
AUTOMATION_VERSION=v3
```

### Use V2 (Local Implementation)
```bash
AUTOMATION_VERSION=v2
REPO_PATH=/path/to/your/repo
```

### Use V1 (Planning Only)
```bash
AUTOMATION_VERSION=v1
```

## Performance

**V2 (Local):**
- Clone/pull: 5-10s
- Read files: 1-2s
- Build: 30-60s
- **Total: ~60s**

**V3 (Cloud):**
- Read files via API: 2-3s
- Generate code: 10-15s
- Commit via API: 1-2s
- **Total: ~20s**

V3 is **3x faster** and uses **zero disk space**! 🚀

## Troubleshooting

### "403 Forbidden" on GitHub API

- Check your GitHub token has `repo` permissions
- Token might be expired - create a new one

### "Rate limit exceeded"

- GitHub has API rate limits (5000 requests/hour for authenticated)
- V3 uses ~5-10 requests per issue
- Should be fine unless processing 500+ issues/hour

### "File not found"

- Make sure file paths in Linear issue match actual GitHub paths
- Paths are case-sensitive

## Best Practices

1. **Use V3 for production** - Most reliable and scalable
2. **Use V2 for local development** - If you need build validation
3. **Use V1 for testing** - Quick iterations on prompts

---

**Recommendation:** Use V3 for all production deployments. It's faster, more reliable, and works anywhere! ☁️
