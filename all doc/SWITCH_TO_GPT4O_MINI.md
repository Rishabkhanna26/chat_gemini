# Switch to GPT-4o-mini for Better Hindi/Hinglish

## Problem
Free models (Gemini, Llama) are producing nonsensical Hindi/Hinglish responses like:
- "Hamare, aap ke liye aap ko bhi kya hai?" ❌ (grammatically wrong)
- Random words that don't make sense

## Solution
Switch to **GPT-4o-mini** - OpenAI's model that's excellent at Hindi/Hinglish.

## Cost Analysis
GPT-4o-mini is VERY cheap:
- Input: $0.15 per 1M tokens (~₹12 per 1M tokens)
- Output: $0.60 per 1M tokens (~₹50 per 1M tokens)

**Real-world cost estimate:**
- Average conversation: ~500 input tokens + 100 output tokens
- Cost per conversation: ~$0.00015 (₹0.01 - less than 1 paisa!)
- 1000 conversations: ~$0.15 (₹12)
- 10,000 conversations: ~$1.50 (₹125)

This is extremely affordable for the quality improvement you'll get.

## Changes Made

### 1. Updated Default Model (`src/openrouter.js`)
```javascript
// Changed from Gemini to GPT-4o-mini
export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

// Updated fallback models (best multilingual models first)
export const DEFAULT_OPENROUTER_FALLBACK_MODELS = Object.freeze([
  "qwen/qwen-2.5-72b-instruct:free",      // Chinese model, good at non-English
  "google/gemini-2.0-flash-exp:free",      // Google's model
  "meta-llama/llama-3.3-70b-instruct:free", // Meta's model
]);
```

### 2. Enhanced System Prompt (`src/whatsapp.js`)
Added more explicit rules for Hindi/Hinglish:
- ALWAYS start with acknowledgment: "Ji haan" or "Bilkul"
- Use "hamare paas" (we have) NOT "aapke paas" (you have)
- Answer the EXACT question asked
- Keep sentences simple and natural
- Mix Hindi and English naturally

### 3. Updated Configuration (`.env.example`)
```env
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_FALLBACK_MODELS=qwen/qwen-2.5-72b-instruct:free,google/gemini-2.0-flash-exp:free,meta-llama/llama-3.3-70b-instruct:free
```

## Setup Instructions

### Step 1: Update Your `.env` File
```bash
# Open your .env file and update these lines:
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_FALLBACK_MODELS=qwen/qwen-2.5-72b-instruct:free,google/gemini-2.0-flash-exp:free,meta-llama/llama-3.3-70b-instruct:free
```

### Step 2: Restart Backend
```bash
npm run backend
```

### Step 3: Test with Hindi/Hinglish
Send these test messages to your WhatsApp bot:

**Test 1: Product inquiry**
```
Aapke paas kya products hain?
```
Expected: "Ji haan, hamare paas yeh products available hain: [list]. Aap kaunsa dekhna chahte ho?"

**Test 2: Price inquiry**
```
Sabse mehnga product konsa hai?
```
Expected: "Hamare paas sabse mehnga product hai Premium Pack - ₹2,999. Aap isko order karna chahte ho?"

**Test 3: Pricing list**
```
Kya aap pricing bta sakte ho?
```
Expected: "Ji haan bilkul! Hamare products ki pricing: [list with prices]. Aur kuch help chahiye?"

## Expected Behavior

### ✅ Good Response (Natural Hinglish)
```
User: "Aapke paas kya product hai"
Bot: "Ji haan, hamare paas yeh products available hain:
- Starter Pack - ₹1,499
- Premium Pack - ₹2,999
- Wellness Kit - ₹899

Aap kaunsa dekhna chahte ho?"
```

### ❌ Bad Response (What we're fixing)
```
User: "Aapke paas kya product hai"
Bot: "Hamare, aap ke liye aap ko bhi kya hai?" ← Nonsense!
```

## Alternative Options

If GPT-4o-mini is still too expensive for you:

### Option 1: Try Qwen 2.5 72B (Free)
```env
OPENROUTER_MODEL=qwen/qwen-2.5-72b-instruct:free
```
- Chinese model, better at non-English languages than Llama/Gemini
- Free to use
- Quality: Better than Gemini for Hindi, but not as good as GPT-4o-mini

### Option 2: Use GPT-3.5-turbo (Cheaper)
```env
OPENROUTER_MODEL=openai/gpt-3.5-turbo
```
- Even cheaper than GPT-4o-mini
- Still good quality for Hindi/Hinglish
- Cost: ~$0.50 per 1M input tokens, $1.50 per 1M output tokens

## Monitoring Costs

To monitor your OpenRouter usage and costs:
1. Go to https://openrouter.ai/activity
2. Log in with your API key
3. View real-time usage and costs

## Why Free Models Don't Work Well

Free models on OpenRouter have limitations:
- **Llama 3.3 70B**: Trained primarily on English, poor Hindi/Hinglish
- **Gemini 2.0 Flash**: Better than Llama but still produces grammatical errors
- **Trinity Large**: Very basic, not good for multilingual

**GPT-4o-mini** is specifically trained on multilingual data including Hindi and understands Indian English (Hinglish) patterns.

## Summary

You've switched from free models to GPT-4o-mini for better Hindi/Hinglish quality. The cost is minimal (~₹0.01 per conversation) and the quality improvement is significant.

**Next steps:**
1. Update your `.env` file with the new model
2. Restart backend: `npm run backend`
3. Test with Hindi/Hinglish queries
4. Monitor costs at https://openrouter.ai/activity

If you want to try the free Qwen model first, just change `OPENROUTER_MODEL=qwen/qwen-2.5-72b-instruct:free` in your `.env` file.
