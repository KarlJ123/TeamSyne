import { Events, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getFromDb } from '../utils/database.js';

const CONFIG_KEY = (guildId) => `announcement_config_${guildId}`;

export default {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    try {
      const config = await getFromDb(CONFIG_KEY(member.guild.id), {});
      if (!config.welcomeChannelId) return;

      const channel = member.guild.channels.cache.get(config.welcomeChannelId)
        || await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle(`👋 Welcome to ${member.guild.name}!`)
        .setDescription(`Hey <@${member.id}>, welcome to **${member.guild.name}**! We're glad to have you here.\n\nMake sure to check out the rules and grab your roles!`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
          { name: 'Member', value: `<@${member.id}>`, inline: true },
          { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Member Count', value: `#${member.guild.memberCount}`, inline: true },
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (error) {
      logger.error('Error sending welcome message:', error);
    }
  },
};
