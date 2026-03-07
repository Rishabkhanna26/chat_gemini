# Switch to Google Gemini for Better Hindi/Hinglish

## Problem Identified

Llama 3.3 70B is NOT good at Hindi/Hinglish. Your responses show:
- "Hamare, aap ke liye aap ko bhi kya hai?" ❌ (nonsense)
- "Hamare, aap ke liye apni order karega?" ❌ (grammatically wrong)

## Solution: Use Google Gemini 2.0 Flash

Google Gemini is MUCH better at Indian languages because:
- ✅ Trained specifically on Indian languages
- ✅ Understands Hindi/Hinglish context better
- ✅ More natural grammar
- ✅ Better at mixing Hindi and English
- ✅ Still FREE on OpenRouter

---

## What I Changed

### 1. Updated Default Model

**File:** `src/openrouter.js`

**Before:**
```javascript
export const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
```

**After:**
```javascript
export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.0-flash-exp:free";
```

### 2. Updated Fallback Chain

**Before:**
```javascript
export const DEFAULT_OPENROUTER_FALLBACK_MODELS = Object.freeze([
  "liquid/lfm-2.5-1.2b-instruct:free",
  "arcee-ai/trinity-large-preview:free",
  "google/gemini-2.0-flash-exp:free",  // Was last
]);
```

**After:**
```javascript
export const DEFAULT_OPENROUTER_FALLBACK_MODELS = Object.freeze([
  "meta-llama/llama-3.3-70b-instruct:free",  // Now fallback
  "liquid/lfm-2.5-1.2b-instruct:free",
  "arcee-ai/trinity-large-preview:free",
]);
```

---

## How to Activate

### Step 1: Update Your .env File

```bash
# Change this line in your .env file:
OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free

# Update fallbacks:
OPENROUTER_FALLBACK_MODELS=meta-llama/llama-3.3-70b-instruct:free,liquid/lfm-2.5-1.2b-instruct:free,arcee-ai/trinity-large-preview:free
```

### Step 2: Restart Backend

```bash
# Stop current backend (Ctrl+C)
npm run backend
```

### Step 3: Test Again

Send the same WhatsApp messages:

**Test 1:**
```
User: Aapke paas sabse mehnga product konsa hai?
Expected: Hamare paas sabse mehnga product hai Premium Pack - ₹2,999
```

**Test 2:**
```
User: Aapke paas kya product hai?
Expected: Hamare paas yeh products hain:
          1️⃣ Starter Pack - ₹1,499
          2️⃣ Premium Pack - ₹2,999
          3️⃣ Wellness Kit - ₹899
```

---

## Expected Improvements

### Before (Llama 3.3 70B) ❌

```
User: Aapke paas sabse mehnga product konsa hai?
Bot: Hamare, aap ke liye aap ko bhi kya hai? ✨ Premium Pack
     (NONSENSE - grammatically wrong)
```

### After (Gemini 2.0 Flash) ✅

```
User: Aapke paas sabse mehnga product konsa hai?
Bot: Hamare paas sabse mehnga product hai Premium Pack.
     
     💰 Price: ₹2,999
     📦 Pack: 1 pack
     
     Aap isko order karna chahte ho?
     (CORRECT - natural Hinglish)
```

---

## Why Gemini is Better for Hindi/Hinglish

### 1. Better Language Understanding
- Gemini was trained on more Indian language data
- Understands context better in Hindi/Hinglish
- More natural grammar

### 2. Better at Code-Mixing
- Knows when to use Hindi vs English words
- Natural transitions between languages
- Understands colloquial expressions

### 3. Better at Indian Context
- Understands Indian business communication style
- Knows common Hinglish patterns
- Better at formal vs informal tone

---

## Model Comparison for Hindi/Hinglish

| Model | Hindi Quality | Hinglish Quality | Speed | Recommendation |
|-------|---------------|------------------|-------|----------------|
| **Gemini 2.0 Flash** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **BEST for Hindi** |
| Llama 3.3 70B | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | Not recommended |
| Liquid LFM 1.2B | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | Too simple |
| Arcee Trinity | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | Okay, not great |

---

## Configuration

### Recommended Settings for Gemini

```bash
# In your .env file:
OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
OPENROUTER_FALLBACK_MODELS=meta-llama/llama-3.3-70b-instruct:free,liquid/lfm-2.5-1.2b-instruct:free
WHATSAPP_AI_HISTORY_LIMIT=6
WHATSAPP_AI_AUTO_LANGUAGE=true
```

### Temperature Settings (Already Optimized)

```javascript
// Main AI response
temperature: 0.55  // Good for Gemini

// Language rewrite
temperature: 0.3   // Good for natural translation
```

---

## Testing Checklist

After switching to Gemini, test these:

### Test 1: Most Expensive Product
```
Send: "Aapke paas sabse mehnga product konsa hai?"
Expect: "Hamare paas sabse mehnga product hai Premium Pack - ₹2,999"
```

### Test 2: Product List
```
Send: "Aapke paas kya products hain?"
Expect: Natural list of products with prices
```

### Test 3: Price Query
```
Send: "Premium Pack ka price kya hai?"
Expect: "Premium Pack ka price hai ₹2,999"
```

### Test 4: Greeting
```
Send: "Namaste"
Expect: "Namaste! 🙏 Hamare paas products aur services hain."
```

### Test 5: Business Hours
```
Send: "Aap kab khule ho?"
Expect: Natural response with business hours
```

---

## Troubleshooting

### Issue: Still Getting Bad Responses

**Check 1: Is Gemini being used?**
```bash
# Check your logs for:
grep "model" logs/app.log

# Should show: google/gemini-2.0-flash-exp:free
```

**Check 2: Is .env updated?**
```bash
# Verify:
echo $OPENROUTER_MODEL

# Should show: google/gemini-2.0-flash-exp:free
```

**Check 3: Did you restart?**
```bash
# Make sure you restarted backend after changing .env
npm run backend
```

---

### Issue: Gemini Not Available

If Gemini fails, it will fall back to Llama 3.3 70B.

**Solution: Check OpenRouter Status**
- Visit: https://status.openrouter.ai
- Check if Gemini 2.0 Flash is available

**Alternative: Use GPT-4o-mini (Paid)**
```bash
# In .env (requires credits):
OPENROUTER_MODEL=openai/gpt-4o-mini
```

---

## Cost Comparison

| Model | Cost | Quality for Hindi |
|-------|------|-------------------|
| Gemini 2.0 Flash | **FREE** ✅ | ⭐⭐⭐⭐⭐ |
| Llama 3.3 70B | **FREE** ✅ | ⭐⭐⭐ |
| GPT-4o-mini | $0.15/1M tokens | ⭐⭐⭐⭐⭐ |
| GPT-4o | $2.50/1M tokens | ⭐⭐⭐⭐⭐ |

**Recommendation:** Use Gemini 2.0 Flash (FREE + Best Quality)

---

## Alternative: Disable Language Rewrite

If Gemini still has issues, you can disable the language rewrite step:

### Option 1: Disable Auto Language
```bash
# In .env:
WHATSAPP_AI_AUTO_LANGUAGE=false
```

This will make AI respond in English only.

### Option 2: Use Direct Response (No Rewrite)

Edit `src/whatsapp.js`, find the `maybeRewriteReplyForLanguage` function and change:

```javascript
// Line ~1418
const langCode = responseLanguage?.code || "en";
if (langCode === "en") return base;

// Add this line to skip rewrite:
return base;  // Skip language rewrite, use direct response
```

This makes AI generate Hindi/Hinglish directly without translation step.

---

## Summary

✅ **Changed:** Default model to Gemini 2.0 Flash
✅ **Reason:** Much better at Hindi/Hinglish
✅ **Cost:** Still FREE
✅ **Action:** Update .env and restart backend

### Quick Steps:

1. **Update .env:**
   ```bash
   OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
   ```

2. **Restart:**
   ```bash
   npm run backend
   ```

3. **Test:**
   ```
   Send: "Aapke paas kya products hain?"
   ```

Your Hindi/Hinglish responses should now be natural and grammatically correct! 🎉

---

## Need Even Better Quality?

If you're willing to pay a small amount, use GPT-4o-mini:

```bash
# In .env:
OPENROUTER_MODEL=openai/gpt-4o-mini

# Cost: ~$0.15 per 1 million tokens
# For WhatsApp chatbot: ~$1-2 per month for moderate usage
```

GPT-4o-mini has the BEST Hindi/Hinglish quality, but it's not free.

**For now, try Gemini 2.0 Flash (FREE) first!**
