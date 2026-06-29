const config = require('../../../config/config');
const logger = require('../../../config/logger');
const { WhatsAppMessage, Customer } = require('../../../models');
const messagingService = require('../messaging.service');

const SYSTEM_INSTRUCTION =
  'You are a helpful business assistant for Logix Plus Solutions. Help customers with their ' +
  'invoices, orders, payments and account balance. Keep replies short and friendly, suitable for WhatsApp.';

async function buildHistory(conversationId) {
  const recent = await WhatsAppMessage.find({ conversationId, type: 'text' })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  return recent
    .reverse()
    .map((m) => ({
      role: m.direction === 'inbound' ? 'user' : 'model',
      parts: [{ text: String(m.content?.text || '').slice(0, 2000) }],
    }))
    .filter((m) => m.parts[0].text);
}

async function buildCustomerContext(conversation) {
  if (!conversation.customerId) return '';
  const customer = await Customer.findById(conversation.customerId).select('name balance').lean();
  if (!customer) return '';
  return `\n\nCustomer context: name="${customer.name}", account balance=${Number(customer.balance || 0).toFixed(2)}.`;
}

async function callGemini(history, systemInstruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.chatModel}:generateContent?key=${config.gemini.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: history,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || `Gemini request failed (${res.status})`);
  }
  return body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

async function handleInbound(connection, conversation, messageDoc) {
  const userText = messageDoc.content?.text;
  if (!userText?.trim()) return;

  if (!config.gemini.apiKey) {
    logger.warn('GEMINI_API_KEY is not configured — skipping AI business assistant reply');
    return;
  }

  try {
    const history = await buildHistory(conversation._id);
    const customerContext = await buildCustomerContext(conversation);
    history.push({ role: 'user', parts: [{ text: userText }] });

    const reply = await callGemini(history, SYSTEM_INSTRUCTION + customerContext);
    if (!reply) return;

    await messagingService.sendText({
      organizationId: connection.organizationId,
      branchId: connection.branchId,
      phone: conversation.contactPhone,
      text: reply,
      source: 'ai',
      conversationId: conversation._id,
    });
  } catch (err) {
    logger.error('Gemini business assistant error:', err);
  }
}

module.exports = { handleInbound };
