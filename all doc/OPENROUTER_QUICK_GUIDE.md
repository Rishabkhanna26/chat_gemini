# OpenRouter Quick Reference Guide

## What is OpenRouter?

OpenRouter is an API gateway that provides access to multiple AI models through a single API. It automatically handles:
- Model availability
- Rate limiting
- Fallback routing
- Cost optimization

## Why Use OpenRouter for Your Chatbot?

1. **Multiple Free Models** - Access to 10+ free models
2. **Automatic Fallbacks** - If one model fails, tries the next
3. **No Vendor Lock-in** - Easy to switch models
4. **Unified API** - Same code works with all models

---

## Best FREE Models for Your Use Case

### 🥇 Recommended: Llama 3.3 70B Instruct

```bash
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

**Perfect for:**
- ✅ Customer service chatbots
- ✅ Product/service recommendations
- ✅ Multilingual support (Hindi, English, Hinglish)
- ✅ Staying in scope (refuses off-topic questions)
- ✅ Natural, human-like responses

**Characteristics:**
- Response time: ~2-4 seconds
- Context window: 128K tokens
- Temperature: 0.5-0.7 for conversational
- Max tokens: 240-300 for WhatsApp

---

## Alternative FREE Models

### Option 2: Liquid LFM 2.5 1.2B

```bash
liquid/lfm-2.5-1.2b-instruct:free
```

**Best for:**
- Ultra-fast responses (<1 second)
- Simple queries
- High-volume scenarios
- Fallback when larger models fail

**Trade-offs:**
- Smaller model = less nuanced understanding
- Better for straightforward questions
- May struggle with complex context

---

### Option 3: Arcee Trinity Large

```bash
arcee-ai/trinity-large-preview:free
```

**Best for:**
- Balanced performance
- Good instruction following
- Moderate response times
- Your current default (works well!)

---

### Option 4: Google Gemini 2.0 Flash

```bash
google/gemini-2.0-flash-exp:free
```

**Best for:**
- Complex reasoning
- Multi-turn conversations
- Detailed product explanations
- Good fallback option

---

## How Your Fallback System Works

```
User Message
    ↓
Try: meta-llama/llama-3.3-70b-instruct:free
    ↓ (if fails)
Try: liquid/lfm-2.5-1.2b-instruct:free
    ↓ (if fails)
Try: arcee-ai/trinity-large-preview:free
    ↓ (if fails)
Try: google/gemini-2.0-flash-exp:free
    ↓ (if all fail)
Return: Fallback message
```

---

## Configuration Examples

### Minimal Configuration (Just API Key)

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxx
```

Uses defaults:
- Model: meta-llama/llama-3.3-70b-instruct:free
- Fallbacks: liquid, arcee-trinity, gemini
- Temperature: 0.55
- Max tokens: 240

---

### Optimized for Speed

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENROUTER_MODEL=liquid/lfm-2.5-1.2b-instruct:free
OPENROUTER_FALLBACK_MODELS=meta-llama/llama-3.3-70b-instruct:free
```

Prioritizes fast responses, falls back to quality.

---

### Optimized for Quality

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
OPENROUTER_FALLBACK_MODELS=google/gemini-2.0-flash-exp:free,arcee-ai/trinity-large-preview:free
```

Prioritizes response quality, falls back to alternatives.

---

### Optimized for Multilingual

```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
WHATSAPP_AI_AUTO_LANGUAGE=true
WHATSAPP_AI_HISTORY_LIMIT=6
```

Best for Hindi/Hinglish/English mixed conversations.

---

## Temperature Guide

Temperature controls randomness in responses:

```bash
# Conservative (factual, consistent)
temperature: 0.2 - 0.4
Use for: Pricing, business hours, factual info

# Balanced (natural, conversational)
temperature: 0.5 - 0.7
Use for: Customer service, product recommendations
👉 YOUR CURRENT SETTING: 0.55 (perfect!)

# Creative (varied, expressive)
temperature: 0.8 - 1.0
Use for: Marketing copy, creative content
```

---

## Token Limits Guide

Tokens ≈ words × 1.3 (rough estimate)

```bash
# Short responses (WhatsApp-friendly)
max_tokens: 150-240
Use for: Quick answers, menu options
👉 YOUR CURRENT SETTING: 240 (good!)

# Medium responses (detailed)
max_tokens: 300-500
Use for: Product explanations, multi-part answers

# Long responses (comprehensive)
max_tokens: 500-1000
Use for: Detailed guides, complex queries
```

**Recommendation for WhatsApp:** Keep 240-300 tokens (messages stay readable)

---

## Common Issues & Solutions

### Issue 1: AI Responds Too Slowly

**Solution:**
```bash
# Switch to faster model
OPENROUTER_MODEL=liquid/lfm-2.5-1.2b-instruct:free

# Reduce max tokens
# In src/openrouter.js, change maxOutputTokens to 180
```

---

### Issue 2: AI Goes Off-Topic

**Solution:**
```bash
# Use more instruction-following model
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free

# Reduce temperature for more focused responses
# In src/whatsapp.js, change temperature to 0.4
```

---

### Issue 3: AI Responses Too Generic

**Solution:**
```bash
# Increase temperature for more natural responses
# In src/whatsapp.js, change temperature to 0.65

# Increase max tokens for more detailed responses
# Change maxOutputTokens to 300
```

---

### Issue 4: All Models Failing

**Check:**
1. API key is valid: `echo $OPENROUTER_API_KEY`
2. Internet connectivity
3. OpenRouter service status: https://status.openrouter.ai
4. Rate limits (free tier has limits)

**Temporary Fix:**
```bash
# Your system automatically falls back to:
OPENROUTER_FAILURE_REPLY="Hi, I can help with our products and services..."
```

---

## Testing Your Configuration

### Test 1: Basic Response

```bash
# Send via WhatsApp:
"What products do you have?"

# Expected: List of products from your catalog
# Check logs for: "OpenRouter reply" with model name
```

---

### Test 2: Multilingual

```bash
# Send via WhatsApp:
"Aapke products ke baare mein batao"

# Expected: Response in Hinglish with product info
# Check logs for: language detection
```

---

### Test 3: Out-of-Scope

```bash
# Send via WhatsApp:
"What's the weather today?"

# Expected: "i can only help with our products and services"
# Check logs for: out-of-scope detection
```

---

### Test 4: Fallback

```bash
# Temporarily set invalid primary model:
OPENROUTER_MODEL=invalid-model-name

# Send message, check logs for:
# "OpenRouter fallback model used"
```

---

## Cost Monitoring

### Free Tier Limits

Most free models have:
- **Rate limit:** ~10-20 requests/minute
- **Daily limit:** ~1000-5000 requests/day
- **No credit card required**

### Monitoring Usage

Check OpenRouter dashboard:
1. Go to: https://openrouter.ai/activity
2. View requests per model
3. Monitor rate limit hits

---

## Advanced: Custom Model Selection

### Per-Admin Model Configuration

You can extend your system to allow different models per admin:

```sql
-- Add to admins table
ALTER TABLE admins ADD COLUMN ai_model VARCHAR(100);
ALTER TABLE admins ADD COLUMN ai_fallback_models TEXT;
```

```javascript
// In getAdminAISettings
const settings = {
  ai_enabled: row.ai_enabled,
  ai_prompt: row.ai_prompt,
  ai_model: row.ai_model || OPENROUTER_MODEL,
  ai_fallback_models: row.ai_fallback_models || OPENROUTER_FALLBACK_MODELS,
};
```

---

## Quick Comparison Table

| Model | Speed | Quality | Multilingual | Best For |
|-------|-------|---------|--------------|----------|
| **Llama 3.3 70B** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **Recommended** |
| Liquid LFM 1.2B | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | Speed priority |
| Arcee Trinity | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Balanced |
| Gemini 2.0 Flash | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Complex queries |

---

## Summary

**Your Current Setup (Good!):**
- ✅ Using free models
- ✅ Automatic fallbacks configured
- ✅ Reasonable temperature (0.55)
- ✅ Appropriate token limits (240)

**Recommended Change:**
- 🔄 Switch primary model to Llama 3.3 70B (done!)
- 🔄 Update fallback chain (done!)

**Result:**
- Better instruction following
- More natural responses
- Stronger scope control
- Improved multilingual support

---

## Need Help?

1. **OpenRouter Docs:** https://openrouter.ai/docs
2. **Model Comparison:** https://openrouter.ai/models
3. **Your Implementation:** Check `src/openrouter.js` and `src/whatsapp.js`

Your system is well-designed and ready to use! 🚀
