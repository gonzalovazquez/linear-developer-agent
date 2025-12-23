import crypto from 'crypto';

export interface LinearWebhookPayload {
  action: string;
  type: string;
  data: {
    id: string;
    identifier: string;
    title: string;
    description?: string;
    state?: {
      name: string;
      type: string;
    };
  };
}

export class LinearWebhookHandler {
  /**
   * Verify webhook signature from Linear
   */
  verifySignature(payload: string, signature: string): boolean {
    const secret = process.env.LINEAR_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('⚠️  LINEAR_WEBHOOK_SECRET not set, skipping signature verification');
      return true;
    }

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const calculatedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature)
    );
  }

  /**
   * Determine if webhook should trigger automation
   * Only process when issue moves to "In Progress"
   */
  shouldProcessWebhook(payload: LinearWebhookPayload): boolean {
    // Check if it's an issue update
    if (payload.type !== 'Issue' || payload.action !== 'update') {
      return false;
    }

    // Check if moved to "In Progress"
    const stateName = payload.data.state?.name?.toLowerCase();
    return stateName === 'in progress';
  }
}
