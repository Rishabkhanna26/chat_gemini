# Bugfix Requirements Document

## Introduction

This bugfix addresses multiple critical issues affecting the WhatsApp automation system:

1. **Partial Payment Flow Bug**: When a user is in the product ordering flow at the payment method selection step (PRODUCT_PAYMENT_METHOD), typing "3" to select "Pay Partial Amount Now" incorrectly triggers the order tracking feature instead of proceeding with the partial payment flow. This breaks the checkout process and prevents users from completing partial payment orders.

2. **AI Product Listing Bug**: When users ask to see all products in Hindi/Hinglish (e.g., "or products kya hai", "aur products", "sabhi products"), the AI shows only one product instead of listing all available products. Similarly, when users ask for the cheapest product ("sabse sasta product"), the AI shows the wrong product.

3. **AI Hindi/Hinglish Response Quality Bug**: The AI generates grammatically incorrect and nonsensical Hindi/Hinglish responses (e.g., "Ji, aapka sabse product bataiye bhi hai!" which is meaningless). The responses don't make sense and don't answer the user's question.

4. **AI Unavailable During Guided Flows Bug**: When users are in a guided flow (e.g., product ordering, appointment booking), the AI cannot respond to general questions. Users should be able to ask questions at any time, regardless of which step they're on.

### Root Causes

**Partial Payment Bug**: The global intent detection system (`resolveAiIntent`) extracts the number "3" from user input and maps it to the main menu choice "TRACK_ORDER" (which is position 3 in the main menu). The global TRACK_ORDER handler then executes before the step-specific PRODUCT_PAYMENT_METHOD handler can process the input.

**AI Product Listing Bug**: The AI is not properly detecting catalog list requests in Hindi/Hinglish, or the AI model is not following instructions to list all products when asked.

**AI Response Quality Bug**: The current AI model (anthropic/claude-3.5-sonnet or alternatives) is not generating natural Hindi/Hinglish responses despite detailed examples in the system prompt.

**AI Unavailable Bug**: The code structure prevents AI responses during active guided flows, forcing users to complete the flow before asking questions.

## Bug Analysis

### Current Behavior (Defect)

**Partial Payment Flow:**

1.1 WHEN user is at step "PRODUCT_PAYMENT_METHOD" and types "3" THEN the system triggers the global TRACK_ORDER handler and displays order tracking information instead of asking for partial payment amount

1.2 WHEN user is at step "PRODUCT_PAYMENT_METHOD" and types "3" THEN the system interrupts the payment flow and the user cannot complete their partial payment order

1.3 WHEN user is at any active guided flow step and types a number that matches a main menu choice THEN the system may incorrectly trigger the corresponding global intent handler before the step-specific handler can process the input

**AI Product Listing:**

1.4 WHEN user asks "or products kya hai" or "aur products" or "sabhi products" THEN the AI shows only one product (Premium Pack) instead of listing all available products (Starter Pack, Premium Pack, Wellness Kit)

1.5 WHEN user asks "Mujhe aapka sabse sasta product bataiye" (show me your cheapest product) THEN the AI shows Premium Pack (₹2,999) instead of Wellness Kit (₹899)

1.6 WHEN user asks to see all products in Hindi/Hinglish THEN the AI does not list all products with names and prices in a clean format

**AI Response Quality:**

1.7 WHEN user asks "Mujhe aapka sabse sasta product bataiye" THEN the AI responds with nonsensical Hindi like "Ji, aapka sabse product bataiye bhi hai!" which is grammatically incorrect and meaningless

1.8 WHEN user asks questions in Hindi/Hinglish THEN the AI generates responses that don't make sense and don't answer the actual question asked

1.9 WHEN user asks "sabse sasta" (cheapest) THEN the AI responds with "Please reply with 1 for Yes or 2 to view other products" without identifying the cheapest product

**AI Availability:**

1.10 WHEN user is in an active guided flow (e.g., at step "PRODUCT_PAYMENT_METHOD") and asks a general question (e.g., "products kya kya hai") THEN the AI cannot respond and the user is forced to complete the flow first

1.11 WHEN user is in the middle of ordering and wants to ask about other products or services THEN the system does not allow AI to answer, breaking the conversational experience

### Expected Behavior (Correct)

**Partial Payment Flow:**

2.1 WHEN user is at step "PRODUCT_PAYMENT_METHOD" and types "3" THEN the system SHALL recognize this as selecting "Pay Partial Amount Now" option and ask for the partial payment amount

2.2 WHEN user is at step "PRODUCT_PAYMENT_METHOD" and types "3" THEN the system SHALL set user.data.orderPaymentIntent.mode to "partial", transition to step "PRODUCT_PARTIAL_PAYMENT_AMOUNT", and display the partial payment amount prompt

2.3 WHEN user is at any active guided flow step (where hasActiveGuidedFlow is true) and types input that could match a global intent THEN the system SHALL process the input through the step-specific handler first and NOT trigger global intent handlers

**AI Product Listing:**

2.4 WHEN user asks "or products kya hai" or "aur products" or "sabhi products" or similar Hindi/Hinglish phrases THEN the AI SHALL list ALL available products with names and prices in a clean format

2.5 WHEN user asks "Mujhe aapka sabse sasta product bataiye" (show me your cheapest product) THEN the AI SHALL identify and show the Wellness Kit (₹899) as the cheapest product

2.6 WHEN user asks to see all products THEN the AI SHALL respond with: "Ji haan bilkul! Hamare products: 1. Starter Pack - ₹1,499, 2. Premium Pack - ₹2,999, 3. Wellness Kit - ₹899. Aap kaunsa order karna chahte ho?"

**AI Response Quality:**

2.7 WHEN user asks "Mujhe aapka sabse sasta product bataiye" THEN the AI SHALL respond with natural, grammatically correct Hindi/Hinglish like: "Ji haan! Hamare paas sabse sasta product hai Wellness Kit - ₹899. Aap isko order karna chahte ho?"

2.8 WHEN user asks questions in Hindi/Hinglish THEN the AI SHALL generate natural, conversational responses that make sense and directly answer the question asked

2.9 WHEN user asks "sabse sasta" (cheapest) THEN the AI SHALL identify the cheapest product by price and present it clearly with acknowledgment

**AI Availability:**

2.10 WHEN user is in an active guided flow and asks a general question about products/services THEN the AI SHALL respond to the question while maintaining the flow context

2.11 WHEN user is in the middle of ordering and asks about other products THEN the AI SHALL answer the question and then guide the user back to completing their current order or offer to switch

### Unchanged Behavior (Regression Prevention)

**Partial Payment Flow:**

3.1 WHEN user is at step "MENU" or "START" and types "3" THEN the system SHALL CONTINUE TO trigger the TRACK_ORDER handler and display order tracking information

3.2 WHEN user is at step "PRODUCT_PAYMENT_METHOD" and types "1" for Cash on Delivery THEN the system SHALL CONTINUE TO process the COD payment method correctly

3.3 WHEN user is at step "PRODUCT_PAYMENT_METHOD" and types "2" for Pay Full Amount Now THEN the system SHALL CONTINUE TO process the full payment method correctly

3.4 WHEN user is NOT in an active guided flow (hasActiveGuidedFlow is false) and types "3" or track order keywords THEN the system SHALL CONTINUE TO trigger the TRACK_ORDER handler

3.5 WHEN user is at step "PRODUCT_PAYMENT_METHOD" and types invalid input (not 1, 2, or 3) THEN the system SHALL CONTINUE TO re-prompt for payment method selection

3.6 WHEN user completes partial payment flow successfully THEN the system SHALL CONTINUE TO generate payment links and process orders correctly

**AI Behavior:**

3.7 WHEN user asks out-of-scope questions (weather, news, coding help) THEN the AI SHALL CONTINUE TO respond with the out-of-scope message

3.8 WHEN user asks about products in English THEN the AI SHALL CONTINUE TO respond correctly in English

3.9 WHEN user is at step "MENU" or "START" and asks about products THEN the AI SHALL CONTINUE TO list products and guide the user

3.10 WHEN user asks for specific product details THEN the AI SHALL CONTINUE TO provide detailed information about that specific product

3.11 WHEN user completes an order successfully THEN the AI SHALL CONTINUE TO confirm the order and provide next steps
