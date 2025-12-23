import express from 'express';
import dotenv from 'dotenv';
import { LinearWebhookHandler } from './linear-webhook-handler';
import { ClaudeAutomation } from './claude-automation';
import { ClaudeAutomationV2 } from './claude-automation-v2';
import { ClaudeAutomationV3 } from './claude-automation-v3';
import { PRFeedbackHandler } from './pr-feedback-handler';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const webhookHandler = new LinearWebhookHandler();
const prFeedbackHandler = new PRFeedbackHandler();
const claudeAutomation = new ClaudeAutomation(); // V1: Planning only
const claudeAutomationV2 = new ClaudeAutomationV2(); // V2: Full local implementation
const claudeAutomationV3 = new ClaudeAutomationV3(); // V3: Cloud-native (GitHub API only)

// Determine which version to use
const automationVersion = process.env.AUTOMATION_VERSION || 'v3'; // Default to cloud-native
const getAutomation = () => {
  switch (automationVersion) {
    case 'v3':
      return claudeAutomationV3;
    case 'v2':
      return claudeAutomationV2;
    case 'v1':
    default:
      return claudeAutomation;
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Linear webhook endpoint
app.post('/webhook/linear', async (req, res) => {
  try {
    console.log('📨 Received Linear webhook:', req.body.type);

    // Verify webhook signature if secret is configured
    const signature = req.headers['linear-signature'] as string;
    if (process.env.LINEAR_WEBHOOK_SECRET) {
      const isValid = webhookHandler.verifySignature(
        JSON.stringify(req.body),
        signature
      );
      if (!isValid) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Process the webhook
    const shouldProcess = webhookHandler.shouldProcessWebhook(req.body);

    if (shouldProcess) {
      const issueId = req.body.data.identifier;
      console.log(`✅ Issue ${issueId} moved to In Progress - starting automation`);

      // Respond quickly to Linear
      res.status(202).json({
        message: 'Webhook received, processing started',
        issueId
      });

      // Process asynchronously
      const automation = getAutomation();
      automation.processIssue(issueId).catch(error => {
        console.error(`❌ Error processing issue ${issueId}:`, error);
      });
    } else {
      res.status(200).json({ message: 'Webhook received but not processed' });
    }
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual trigger endpoint (for testing)
app.post('/trigger/:issueId', async (req, res) => {
  const { issueId } = req.params;
  console.log(`🔧 Manual trigger for issue: ${issueId}`);

  // Send response immediately
  res.status(202).json({
    message: 'Processing started',
    issueId
  });

  // Process asynchronously
  const automation = getAutomation();
  automation.processIssue(issueId).catch(error => {
    console.error(`❌ Error processing issue ${issueId}:`, error);
  });
});

// GitHub PR comment webhook
app.post('/webhook/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];

    // Handle PR comments (issue_comment on pull requests)
    if (event === 'issue_comment') {
      const { action, issue, comment, repository } = req.body;

      // Only process new comments on PRs
      if (action === 'created' && issue.pull_request) {
        const shouldProcess = prFeedbackHandler.shouldProcessComment(
          comment.body,
          comment.user.login
        );

        if (shouldProcess) {
          console.log(`💬 Received PR comment on #${issue.number} from ${comment.user.login}`);

          res.status(202).json({
            message: 'PR feedback received, processing started',
            prNumber: issue.number
          });

          // Process feedback asynchronously
          prFeedbackHandler.processFeedback({
            prNumber: issue.number,
            comment: comment.body,
            author: comment.user.login,
            commentId: comment.id,
          }).catch(error => {
            console.error(`❌ Error processing PR feedback:`, error);
          });
        } else {
          res.status(200).json({ message: 'Comment received but not processed (no @claude or /claude)' });
        }
      } else {
        res.status(200).json({ message: 'Event received but not processed' });
      }
    } else {
      res.status(200).json({ message: `Event ${event} not handled` });
    }
  } catch (error) {
    console.error('❌ GitHub webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const server = app.listen(port, () => {
  const modeDescription = {
    v1: 'Planning Only (local)',
    v2: 'Full Implementation (local)',
    v3: 'Cloud-Native (GitHub API only) ☁️',
  }[automationVersion] || 'Unknown';

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 Linear-Claude Automation Service`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📍 Port: ${port}`);
  console.log(`📍 Linear Webhook: http://localhost:${port}/webhook/linear`);
  console.log(`📍 GitHub Webhook: http://localhost:${port}/webhook/github`);
  console.log(`📍 Manual Trigger: http://localhost:${port}/trigger/:issueId`);
  console.log(`🤖 Version: ${automationVersion.toUpperCase()} - ${modeDescription}`);
  console.log(`💬 PR Feedback: Comment with @claude or /claude on any PR`);
  console.log(`${'='.repeat(80)}\n`);
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  console.log(`\n⚠️  ${signal} received, shutting down gracefully...`);

  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});
