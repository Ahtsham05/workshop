const messagingService = require('../messaging.service');
const mediaService = require('../media.service');
const voicePipeline = require('./voicePipeline.service');
const queryResolver = require('./queryResolver.service');
const logger = require('../../../config/logger');

async function handleInbound(connection, conversation, messageDoc) {
  let userText = messageDoc.content?.text || '';

  if (messageDoc.type === 'audio' && messageDoc.content?.mediaId) {
    const persisted = await mediaService.persistInboundMedia(connection, messageDoc.content.mediaId);
    if (persisted.mediaUrl) messageDoc.content.mediaUrl = persisted.mediaUrl;
    const transcription = await voicePipeline.transcribeAudio(persisted.mediaUrl);
    if (transcription) {
      userText = transcription;
      messageDoc.content.transcription = transcription;
      await messageDoc.save();
    }
  }

  if (!userText?.trim()) return;

  const language = queryResolver.detectLanguage(userText);
  conversation.preferredLanguage = language;
  await conversation.save();

  const intent = queryResolver.classifyIntent(userText);

  if (!conversation.verifiedParent) {
    if (intent === 'verify') {
      const admissionMatch = userText.match(/\b(\d{3,10})\b/);
      if (admissionMatch) {
        const student = await queryResolver.verifyParentByAdmission(conversation, admissionMatch[1]);
        const reply = student
          ? `Verified! I found ${student.firstName}. Ask me about attendance, fee, result, homework, or timetable.`
          : 'Verification failed. Please send the correct admission number registered with your phone.';
        await sendReply(connection, conversation, reply);
      } else {
        await sendReply(
          connection,
          conversation,
          'Welcome! Please send your child admission number to verify (e.g. "verify 12345").',
        );
      }
    } else {
      await sendReply(
        connection,
        conversation,
        'Assalam-o-Alaikum! Main school assistant hoon. Pehle apna bachay ka admission number bhejein for verification.',
      );
    }
    return;
  }

  const nameHint = queryResolver.extractStudentName(userText);
  const students = await queryResolver.findStudentsForConversation(conversation, nameHint);
  if (!students.length) {
    await sendReply(connection, conversation, 'Which student? Please mention the student name or admission number.');
    return;
  }

  const student = students[0];
  const data = await queryResolver.resolve(intent, student);
  let reply = queryResolver.formatReply(intent, data, language);

  const geminiReply = await queryResolver.callGeminiReply(userText, data, language);
  if (geminiReply) reply = geminiReply;

  await sendReply(connection, conversation, reply);
}

async function sendReply(connection, conversation, text) {
  await messagingService.sendText({
    organizationId: connection.organizationId,
    branchId: connection.branchId,
    phone: conversation.contactPhone,
    text,
    source: 'ai',
    conversationId: conversation._id,
  });
}

module.exports = { handleInbound };
