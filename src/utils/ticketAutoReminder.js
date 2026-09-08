/**
 * Ticket Auto-Reminder module for Syne (discord.js v14)
 * -------------------------------------------------------
 * Sends an automatic message in a ticket channel if no one with the
 * staff role has replied within a configured time window.
 *
 * HOW IT WORKS
 * 1. When a ticket channel is opened, call startTicketTimer(channel).
 * 2. Every message sent in that channel is checked in messageCreate.
 *    - If the author has the staff role, the timer is cancelled
 *      (staff has responded, no reminder needed).
 * 3. If REMINDER_DELAY_MS passes with no staff message, a reminder
 *    is posted in the channel automatically.
 * 4. When the ticket is closed, call clearTicketTimer(channel.id)
 *    to clean up.
 *
 * INTEGRATION
 * - Import { startTicketTimer, clearTicketTimer, handleMessage } into
 *   your main bot file.
 * - Call startTicketTimer(channel) right after you create a ticket
 *   channel.
 * - Call handleMessage(message) inside your existing messageCreate
 *   event listener.
 * - Call clearTicketTimer(channel.id) wherever you close/delete a
 *   ticket.
 */

// ---------------- CONFIG ----------------
const STAFF_ROLE_ID = "1546638542829125710";
const REMINDER_DELAY_MS = 15 * 1000; // 15 seconds — for testing
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
  // Clear any existing timer for this channel first (avoid duplicates)
  clearTicketTimer(channel.id);

  const timeout = setTimeout(async () => {
    const ticket = activeTickets.get(channel.id);
    if (!ticket || ticket.staffReplied) return; // staff already responded

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
 * Stop tracking a ticket (call on ticket close, or after a reminder
 * has already been handled).
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
 * Call this inside your existing messageCreate listener for every
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
    clearTicketTimer(message.channel.id); // staff responded, cancel reminder
  }
}
