import { Events, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getFromDb } from '../utils/database.js';

const CONFIG_KEY = (guildId) => `announcement_config_${guildId}`;

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember, client) {
    try {
      // Check if member just boosted (didn't have premium before, now does)
      const wasBosting = oldMember.premiumSince;
      const isNowBoosting = newMember.premiumSince;
      if (wasBosting || !isNowBoosting) return;

      const config = await getFromDb(CONFIG_KEY(newMember.guild.id), {});
      if (!config.boostChannelId) return;

      const channel = newMember.guild.channels.cache.get(config.boostChannelId)
        || await newMember.guild.channels.fetch(config.boostChannelId).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0xFF73FA)
        .setTitle('🚀 New Server Boost!')
        .setDescription(`<@${newMember.id}> just boosted the server! 🎉\nThanks for supporting **${newMember.guild.name}**!`)
        .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
          { name: 'Booster', value: `<@${newMember.id}>`, inline: true },
          { name: 'Total Boosts', value: `${newMember.guild.premiumSubscriptionCount}`, inline: true },
          { name: 'Boost Level', value: `Level ${newMember.guild.premiumTier}`, inline: true },
        )
        .setTimestamp();

      await channel.send({ content: `🚀 <@${newMember.id}> just boosted the server!`, embeds: [embed] });
    } catch (error) {
      logger.error('Error sending boost announcement:', error);
    }
  },
};
