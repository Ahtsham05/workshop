const logger = require('../config/logger');
const { reminderService } = require('../services');
const { Customer, Supplier } = require('../models');
const pushNotificationService = require('../services/pushNotification.service');
const messagingService = require('../services/whatsapp/messaging.service');

const RUN_INTERVAL_MS = 60 * 1000; // reminders are time-sensitive — check every minute

let isRunning = false;

const resolveWhatsappPhone = async (reminder) => {
  if (reminder.whatsappPhone) return reminder.whatsappPhone;
  if (!reminder.relatedType || !reminder.relatedId) return null;
  const Model = reminder.relatedType === 'Supplier' ? Supplier : Customer;
  const related = await Model.findById(reminder.relatedId).select('phone whatsapp').lean();
  return related?.whatsapp || related?.phone || null;
};

const fireReminder = async (reminder) => {
  const channels = reminder.notifyChannels || [];

  if (channels.includes('push')) {
    try {
      await pushNotificationService.sendToUser(reminder.assignedTo, {
        title: `Reminder: ${reminder.title}`,
        body: reminder.description || 'Tap to view details',
        tag: `reminder-${reminder._id}`,
        url: '/reminders',
      });
    } catch (err) {
      logger.warn(`Reminder push failed (${reminder._id}): ${err.message}`);
    }
  }

  if (channels.includes('whatsapp')) {
    try {
      const phone = await resolveWhatsappPhone(reminder);
      const isConnected = phone && (await messagingService.isConnected(reminder.organizationId, reminder.branchId));
      if (phone && isConnected) {
        await messagingService.sendMessage({
          organizationId: reminder.organizationId,
          branchId: reminder.branchId,
          phone,
          text: `Reminder: ${reminder.title}${reminder.description ? `\n${reminder.description}` : ''}`,
          templateCategory: 'reminder',
          source: 'reminder',
        });
      }
    } catch (err) {
      // Best-effort — a missing approved template or closed 24h window must never
      // block the push leg or leave the reminder stuck un-reminded.
      logger.warn(`Reminder WhatsApp send failed (${reminder._id}): ${err.message}`);
    }
  }

  await reminderService.markReminded(reminder._id, { advanceRepeat: reminder.repeat !== 'none' });
};

const tick = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    const due = await reminderService.getDueReminders();
    for (const reminder of due) {
      await fireReminder(reminder);
    }
    if (due.length > 0) {
      logger.info(`Reminder scheduler: fired ${due.length} due reminder(s)`);
    }
  } catch (err) {
    logger.error('Reminder scheduler error:', err.message);
  } finally {
    isRunning = false;
  }
};

const startReminderScheduler = () => {
  tick();
  setInterval(tick, RUN_INTERVAL_MS);
  logger.info('Scheduler started: reminders (every 60s)');
};

module.exports = { startReminderScheduler, runReminderTick: tick };
