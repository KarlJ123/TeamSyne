/**
 * Ticket Auto-Reminder module for Syne (discord.js v14, ESM)
 * -------------------------------------------------------------
 * Sends an automatic message in a ticket channel if no one with the
 * staff role has replied within a configured time window.
 *
 * PLACE THIS FILE IN: src/utils/ticketAutoReminder.js
 * (NOT in src/events — your event loader auto-registers every file
 * in that folder as a client event, and this module doesn't match
 * that shape.)
 *
 * HOW IT WORKS
 * 1. When a ticket channel is opened (wherever that code lives —
 *    likely ticketButtons.js), call startTicketTimer(channel).
 * 2. Import handleMessage into your messageCreate event file and
 *    call it for every message.
 *    - If the author has the staff role, the timer is cancelled.
 * 3. If REMINDER_DELAY_MS passes with no staff message, a reminder
 *    is posted in the channel automatically.
 * 4. When the ticket is closed, call clearTicketTimer(channel.id).
 */

// ---------------- CONFIG ----------------
const STAFF_ROLE_ID = "1503557152080658445";
const REMINDER_DELAY_MS = 15 * 1000; // currently set for testing (15s) — change to e.g. 10 * 60 * 1000 for production
const REMINDER_MESSAGE =
  "⏰ Tickets will not be answered any time after 12:00 AM EST ANY DAY. Please wait until 12 PM EST for any reponses. Thank you for your patience!";

// Map<channelId, { timeout: NodeJS.Timeout, staffReplied: boolean }>
const activeTickets = new Map();

/**
 * Start tracking a ticket channel. Call this right when the ticket
 * channel is created.
 * @param {import('discord.js').TextChannel} channel
 */
export function startTicketTimer(channel) {
  clearTicketTimer(channel.id); // avoid duplicate timers

  const timeout = setTimeout(async () => {
    const ticket = activeTickets.get(channel.id);
    if (!ticket || ticket.staffReplied) return;

    try {
      await channel.send(REMINDER_MESSAGE);
    } catch (err) {
      console.error(`Failed to send reminder in ${channel.id}:`, err);
    }

    activeTickets.delete(channel.id);
  }, REMINDER_DELAY_MS);

  activeTickets.set(channel.id, { timeout, staffReplied: false });
}

/**
 * Stop tracking a ticket (call on ticket close).
 * @param {string} channelId
 */
export function clearTicketTimer(channelId) {
  const ticket = activeTickets.get(channelId);
  if (ticket) {
    clearTimeout(ticket.timeout);
    activeTickets.delete(channelId);
  }
}

/**
 * Call this inside your messageCreate event's execute() for every
 * message. It only acts on channels currently being tracked.
 * @param {import('discord.js').Message} message
 */
export function handleMessage(message) {
  if (message.author.bot) return;

  const ticket = activeTickets.get(message.channel.id);
  if (!ticket) return; // not a tracked ticket channel

  const isStaff = message.member?.roles.cache.has(STAFF_ROLE_ID);
  if (isStaff) {
    ticket.staffReplied = true;
    clearTicketTimer(message.channel.id);
  }
}
