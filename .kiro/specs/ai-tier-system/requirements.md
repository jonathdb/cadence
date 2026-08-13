# Requirements Document

## Introduction

The AI Tier System introduces a three-tier access model for the Cadence fitness app's AI chat functionality. Free-tier users access rate-limited AI via backend-managed API keys, Pro-tier users unlock higher limits and more capable models via a monthly subscription managed through RevenueCat, and BYOK (Bring Your Own Key) users retain unlimited access with their personal API keys. The system adds server-side rate limiting, subscription lifecycle management, provider preference, and client UI for plan visibility and upgrades.

## Glossary

- **Agent_Chat_Function**: The Supabase Edge Function (`agent-chat`) that processes AI chat requests, enforces rate limits, selects models, and streams responses.
- **RevenueCat_Webhook_Function**: A new Supabase Edge Function (`revenucat-webhook`) that receives and processes subscription lifecycle events from RevenueCat.
- **Rate_Limiter**: The server-side logic within Agent_Chat_Function that checks and increments daily message counts in the `ai_daily_usage` table.
- **Tier_Resolver**: The server-side logic within Agent_Chat_Function that determines a user's effective tier (BYOK, Pro, or Free) based on API key presence and entitlement records.
- **AI_Plan_Card**: The UI component in the Settings screen displaying the user's current tier, daily usage, provider preference, and upgrade options.
- **Chat_Indicator**: The UI element on the chat screen showing remaining daily messages for Free and Pro tier users.
- **User_Settings_Table**: The existing `user_settings` database table storing per-user preferences.
- **AI_Daily_Usage_Table**: A new database table (`ai_daily_usage`) tracking per-user daily message counts.
- **User_Entitlements_Table**: The existing `user_entitlements` table mapping users to entitlement levels with optional expiry.
- **Entitlement_Levels_Table**: The existing `entitlement_levels` table defining tier ranks (free=0, premium=1).
- **BYOK**: Bring Your Own Key — users who have stored a personal API key in Cadence.
- **Free_Tier**: The default tier (rank 0) using backend API keys with a 20 messages/day limit and GPT-4o-mini or Claude Haiku models.
- **Pro_Tier**: The paid tier (rank 1) using backend API keys with a 200 messages/day limit and GPT-4o or Claude Sonnet models.

## Requirements

### Requirement 1: Tier Resolution

**User Story:** As a user, I want the system to automatically determine my AI access tier so that I receive the correct model and rate limits without manual configuration.

#### Acceptance Criteria

1. WHEN a chat request is received and the user has a stored personal API key, THE Tier_Resolver SHALL classify the user as BYOK tier and use the user's personal API key for the AI provider call.
2. WHEN a chat request is received and the user has no personal API key and the User_Entitlements_Table contains a record with rank 1 and a `valid_until` value in the future or null, THE Tier_Resolver SHALL classify the user as Pro_Tier.
3. WHEN a chat request is received and the user has no personal API key and no valid Pro entitlement exists, THE Tier_Resolver SHALL classify the user as Free_Tier.
4. WHEN a user is classified as Free_Tier, THE Agent_Chat_Function SHALL use the backend API key from environment variable `CADENCE_OPENAI_KEY` or `CADENCE_ANTHROPIC_KEY` based on the user's provider preference.
5. WHEN a user is classified as Pro_Tier, THE Agent_Chat_Function SHALL use the backend API key from environment variable `CADENCE_OPENAI_KEY` or `CADENCE_ANTHROPIC_KEY` based on the user's provider preference.

### Requirement 2: Model Selection

**User Story:** As a user, I want the AI model quality to match my subscription tier so that I get better responses when I pay for Pro.

#### Acceptance Criteria

1. WHEN a Free_Tier user sends a chat request with provider preference set to `openai`, THE Agent_Chat_Function SHALL use the `gpt-4o-mini` model.
2. WHEN a Free_Tier user sends a chat request with provider preference set to `anthropic`, THE Agent_Chat_Function SHALL use the `claude-haiku-4-5-20251001` model.
3. WHEN a Pro_Tier user sends a chat request with provider preference set to `openai`, THE Agent_Chat_Function SHALL use the `gpt-4o` model.
4. WHEN a Pro_Tier user sends a chat request with provider preference set to `anthropic`, THE Agent_Chat_Function SHALL use the `claude-sonnet-4-20250514` model.
5. WHEN a BYOK user sends a chat request, THE Agent_Chat_Function SHALL use the same models as Pro_Tier for the selected provider.

### Requirement 3: Rate Limiting

**User Story:** As the app owner, I want to limit daily AI messages per user on shared keys so that backend API costs remain predictable.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL enforce a maximum of 20 messages per day for Free_Tier users, with the daily count resetting at midnight UTC.
2. THE Rate_Limiter SHALL enforce a maximum of 200 messages per day for Pro_Tier users, with the daily count resetting at midnight UTC.
3. WHEN a BYOK user sends a chat request, THE Rate_Limiter SHALL skip rate limit enforcement and allow unlimited messages.
4. WHEN a Free_Tier or Pro_Tier user has reached the daily message limit, THE Agent_Chat_Function SHALL return HTTP status 429 with error code `rate_limit_exceeded` and a message indicating the daily limit has been reached.
5. WHEN a chat request is successfully processed for a Free_Tier or Pro_Tier user, THE Rate_Limiter SHALL increment the user's message count in the AI_Daily_Usage_Table for the current UTC date.
6. THE Agent_Chat_Function SHALL include an `X-Rate-Limit-Remaining` response header containing the number of messages remaining for the current day for Free_Tier and Pro_Tier users.

### Requirement 4: Daily Usage Tracking Database

**User Story:** As a developer, I want a dedicated table for tracking AI usage so that rate limits are enforced reliably with atomic operations.

#### Acceptance Criteria

1. THE AI_Daily_Usage_Table SHALL contain columns: `user_id` (uuid, foreign key to auth.users), `usage_date` (date, default CURRENT_DATE), and `message_count` (integer, default 0).
2. THE AI_Daily_Usage_Table SHALL enforce a unique constraint on the combination of `user_id` and `usage_date`.
3. THE AI_Daily_Usage_Table SHALL have Row Level Security enabled with policies allowing users to read only their own usage records.
4. THE AI_Daily_Usage_Table SHALL allow the service role to insert and update records for rate limit enforcement within the Edge Function.

### Requirement 5: Provider Preference

**User Story:** As a user, I want to choose between OpenAI and Anthropic as my AI provider so that I can use my preferred models.

#### Acceptance Criteria

1. THE User_Settings_Table SHALL include a `preferred_ai_provider` column of type text with a default value of `openai` and a CHECK constraint limiting values to `openai` and `anthropic`.
2. WHEN a chat request is received without an explicit provider parameter, THE Agent_Chat_Function SHALL use the value from the user's `preferred_ai_provider` setting.
3. WHEN a user updates the `preferred_ai_provider` setting, THE User_Settings_Table SHALL persist the new value immediately.

### Requirement 6: Subscription Purchase Flow

**User Story:** As a free-tier user, I want to upgrade to Pro via in-app purchase so that I can access better AI models and higher limits.

#### Acceptance Criteria

1. WHEN a user initiates a Pro subscription purchase, THE app SHALL present the RevenueCat native paywall sheet for the Pro tier product ($9.99/month).
2. WHEN a purchase is completed successfully on-device, THE app SHALL reflect the Pro_Tier status in the UI without requiring a manual refresh.
3. IF a purchase fails or is cancelled by the user, THEN THE app SHALL display an appropriate error or cancellation message and retain the user's current tier.

### Requirement 7: Subscription Webhook Processing

**User Story:** As the system, I want to process RevenueCat webhook events so that user entitlements stay synchronized with subscription status.

#### Acceptance Criteria

1. WHEN the RevenueCat_Webhook_Function receives an `INITIAL_PURCHASE` or `RENEWAL` event, THE RevenueCat_Webhook_Function SHALL upsert a record in User_Entitlements_Table with `level_id` set to the Pro entitlement level and `valid_until` set to the subscription expiry date from the event payload.
2. WHEN the RevenueCat_Webhook_Function receives a `CANCELLATION` or `EXPIRATION` event, THE RevenueCat_Webhook_Function SHALL update the User_Entitlements_Table record to set `valid_until` to the current timestamp, causing the user to fall back to Free_Tier on the next tier resolution.
3. WHEN the RevenueCat_Webhook_Function receives a webhook request, THE RevenueCat_Webhook_Function SHALL validate the request using the `REVENUCAT_WEBHOOK_SECRET` environment variable before processing.
4. IF the webhook signature validation fails, THEN THE RevenueCat_Webhook_Function SHALL return HTTP status 401 and discard the event without modifying any data.

### Requirement 8: AI Plan Settings UI

**User Story:** As a user, I want to see my current AI plan details in settings so that I understand my tier, usage, and upgrade options.

#### Acceptance Criteria

1. THE AI_Plan_Card SHALL display the user's current tier name (Free, Pro, or BYOK).
2. WHILE a user is on Free_Tier or Pro_Tier, THE AI_Plan_Card SHALL display current daily usage in the format "X / Y messages today" where X is messages used and Y is the daily limit.
3. WHILE a user is on BYOK tier, THE AI_Plan_Card SHALL display "Unlimited" instead of a usage count.
4. THE AI_Plan_Card SHALL include a toggle for selecting `preferred_ai_provider` between OpenAI and Anthropic.
5. WHILE a user is on Free_Tier, THE AI_Plan_Card SHALL display an "Upgrade to Pro" button that initiates the subscription purchase flow.
6. WHILE a user is on Pro_Tier, THE AI_Plan_Card SHALL display a "Manage Subscription" button that opens the platform's subscription management interface.

### Requirement 9: Chat Screen Usage Indicator

**User Story:** As a user, I want to see my remaining messages while chatting so that I know when I'm approaching the daily limit.

#### Acceptance Criteria

1. WHILE a Free_Tier or Pro_Tier user is on the chat screen, THE Chat_Indicator SHALL display the number of remaining messages for the current day.
2. THE Chat_Indicator SHALL update the remaining count after each message is sent, using the value from the `X-Rate-Limit-Remaining` response header.
3. WHEN a Free_Tier or Pro_Tier user reaches the daily message limit, THE chat screen SHALL disable the message input field.
4. WHEN a Free_Tier or Pro_Tier user reaches the daily message limit, THE chat screen SHALL display the message "Daily limit reached. Upgrade to Pro or add your own API key."
5. WHILE a user is on BYOK tier, THE Chat_Indicator SHALL not be displayed.

### Requirement 10: Subscription Expiry Handling

**User Story:** As a user whose subscription has lapsed, I want to automatically fall back to the free tier so that I still have basic AI access.

#### Acceptance Criteria

1. WHEN the Tier_Resolver checks a user's entitlement and the `valid_until` timestamp is in the past, THE Tier_Resolver SHALL treat the user as Free_Tier regardless of the stored level.
2. WHEN a user's tier changes from Pro to Free due to expiry, THE AI_Plan_Card SHALL update to reflect Free_Tier status, usage limits, and display the upgrade button on the next app session.

### Requirement 11: Environment Configuration

**User Story:** As a developer, I want all required secrets configured as Edge Function environment variables so that the backend can access AI providers and validate webhooks.

#### Acceptance Criteria

1. THE Agent_Chat_Function SHALL read the backend OpenAI API key from the `CADENCE_OPENAI_KEY` environment variable.
2. THE Agent_Chat_Function SHALL read the backend Anthropic API key from the `CADENCE_ANTHROPIC_KEY` environment variable.
3. THE RevenueCat_Webhook_Function SHALL read the webhook validation secret from the `REVENUCAT_WEBHOOK_SECRET` environment variable.
4. IF a required environment variable is missing at function startup, THEN THE Edge Function SHALL log an error indicating the missing configuration.
