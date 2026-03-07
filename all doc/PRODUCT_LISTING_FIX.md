# Product Listing Fix for Hindi/Hinglish Queries

## Problem

When users ask "Or products kya hai" (What other products are there?) in Hindi/Hinglish, the AI was only showing one product (Premium Pack) instead of listing ALL products.

### User Flow (Broken)
```
User: "Or products kya hai"
Bot: ✨ Premium Pack [only one product shown] ❌
```

### Expected Behavior
```
User: "Or products kya hai"
Bot: Here are our products:
     - Starter Pack (₹1,499)
     - Premium Pack (₹2,999)
     - Wellness Kit (₹899) ✅
```

## Root Cause

The system was not detecting Hindi/Hinglish product listing queries because:

1. **Missing Hindi/Hinglish keywords** in `CATALOG_LIST_HINTS`
   - "kya hai" (what is)
   - "or products" (other products)
   - "aur products" (and products)
   - "baki products" (remaining products)

2. **Missing Hindi/Hinglish keywords** in `detectMainIntent` function
   - Only checked for "product", "products", "view products", "buy"
   - Didn't recognize "or products", "aur products", etc.

## Solution

Added Hindi/Hinglish keywords to two places in `src/whatsapp.js`:

### 1. Enhanced CATALOG_LIST_HINTS (Line ~1036)

**Before:**
```javascript
const CATALOG_LIST_HINTS = [
  "show",
  "list",
  "available",
  "catalog",
  "menu",
  "what do you have",
  "which products",
  "which services",
  "products",
  "services",
];
```

**After:**
```javascript
const CATALOG_LIST_HINTS = [
  "show",
  "list",
  "available",
  "catalog",
  "menu",
  "what do you have",
  "which products",
  "which services",
  "products",
  "services",
  // Hindi/Hinglish keywords
  "kya hai",
  "kya kya hai",
  "or products",
  "aur products",
  "baki products",
  "sabhi products",
  "sare products",
  "all products",
  "dikhao",
  "batao",
  "bataiye",
  "dikhaiye",
];
```

### 2. Enhanced detectMainIntent Function (Line ~855)

**Before:**
```javascript
if (
  productChoice &&
  textHasAny(input, [productLabel.toLowerCase(), "product", "products", "view products", "buy"])
) {
  return "PRODUCTS";
}
```

**After:**
```javascript
if (
  productChoice &&
  textHasAny(input, [
    productLabel.toLowerCase(),
    "product",
    "products",
    "view products",
    "buy",
    "or products",  // "other products" in Hinglish
    "aur products", // "and products" in Hindi
    "baki products", // "remaining products" in Hindi
    "sabhi products", // "all products" in Hindi
    "sare products", // "all products" in Hindi
  ])
) {
  return "PRODUCTS";
}
```

## How It Works

### Detection Flow

1. **User sends**: "Or products kya hai"
2. **normalizeComparableText**: Converts to "or products kya hai"
3. **isGenericCatalogQuery**: Checks if it's a catalog listing request
   - ✅ Matches "kya hai" in CATALOG_LIST_HINTS
   - ✅ Matches "or products" in CATALOG_LIST_HINTS
4. **detectMainIntent**: Determines the intent
   - ✅ Matches "or products" → Returns "PRODUCTS"
5. **buildCatalogReplyForIntent**: Builds the response
   - Intent = "PRODUCTS"
   - Returns `automation.productsMenuText` (full product list)
6. **Bot sends**: Full product list with all items

## Supported Queries

### English
- "What products do you have?"
- "Show me all products"
- "List products"
- "View products"

### Hindi/Hinglish
- "Or products kya hai?" (What other products are there?)
- "Aur products kya hai?" (And what products are there?)
- "Baki products dikhao" (Show remaining products)
- "Sabhi products batao" (Tell all products)
- "Sare products kya hai?" (What are all products?)
- "Products kya kya hai?" (What what products are there?)

## Testing

### Test Case 1: Hindi/Hinglish Product Listing
```
User: "Or products kya hai"
Expected: Full product list with all 3 products
```

### Test Case 2: English Product Listing
```
User: "What products do you have?"
Expected: Full product list with all 3 products
```

### Test Case 3: Mixed Language
```
User: "Aur products dikhao"
Expected: Full product list with all 3 products
```

## No Model Change Needed

This fix is **NOT a model issue**. It's a **logic issue** in the keyword detection system. The changes are in the JavaScript code, not the AI model configuration.

**You do NOT need to**:
- ❌ Change the AI model
- ❌ Update `.env` file
- ❌ Modify AI prompts

**You only need to**:
- ✅ Restart the backend: `npm run backend`
- ✅ Test with Hindi/Hinglish queries

## Deployment

1. **Restart backend**:
   ```bash
   npm run backend
   ```

2. **Test queries**:
   - "Or products kya hai"
   - "Aur products dikhao"
   - "Sabhi products batao"

3. **Expected result**: Full product list with all items

## Related Files

- **File modified**: `src/whatsapp.js`
- **Lines changed**: ~1036 (CATALOG_LIST_HINTS), ~855 (detectMainIntent)
- **Functions affected**: `isGenericCatalogQuery`, `detectMainIntent`, `buildCatalogReplyForIntent`

## Summary

Fixed the product listing issue by adding Hindi/Hinglish keywords to the catalog detection system. Users can now ask "Or products kya hai" and get the full product list instead of just one product. This is a logic fix, not a model change.
