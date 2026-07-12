import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const CONFIG_KEY = (guildId) => `division_status_${guildId}`;

const DIVISIONS = [
  { key: 'fortnite', label: 'Fortnite Division' },
  { key: 'cod', label: 'Call of Duty Division' },
  { key: 'r6siege', label: 'Rainbow Six Siege Division' },
  { key: 'rocketleague', label: 'Rocket League Division' },
  { key: 'csgo', label: 'CSGO Division' },
  { key: 'apex', label: 'Apex Division' },
  { key: 'valorant', label: 'Valorant Division' },
  { key: 'mxbikes', label: 'MX Bikes Division' },
  { key: 'marvelrivals', label: 'Marvel Rivals Division' },
  { key: 'clashroyale', label: 'Clash Royale Division' },
];

async function getConfig(client, guildId) {
  return await getFromDb(CONFIG_KEY(guildId), {
    channelId: null,
    messageId: null,
    statuses: {},
  });
}

async function saveConfig(client, guildId, config) {
  await setInDb(CONFIG_KEY(guildId), config);
}

function ensureStatuses(config) {
  if (!config.statuses) config.statuses = {};
  for (const division of DIVISIONS) {
    if (config.statuses[division.key] !== 'OPEN' && config.statuses[division.key] !== 'CLOSED') {
      config.statuses[division.key] = 'OPEN';
    }
  }
  return config.statuses;
}

function buildBoardEmbed(statuses) {
  const lines = DIVISIONS.map((division) => {
    const status = statuses[division.key] === 'CLOSED' ? 'CLOSED' : 'OPEN';
    return `${division.label}: [**${status}**]`;
  });

  return new EmbedBuilder()
    .setTitle('Division Status')
    .setDescription(lines.join('\n'))
    .setColor(0x5865F2);
}

async function postOrUpdateBoard(interaction, config) {
  if (!config.channelId) {
    return { ok: false, reason: 'no_channel' };
  }

  const channel = interaction.guild.channels.cache.get(config.channelId)
    || await interaction.guild.channels.fetch(config.channelId).catch(() => null);

  if (!channel) {
    return { ok: false, reason: 'channel_missing' };
  }

  const embed = buildBoardEmbed(config.statuses);

  if (config.messageId) {
    const message = await channel.messages.fetch(config.messageId).catch(() => null);
    if (message) {
      await message.edit({ embeds: [embed] });
      return { ok: true, reposted: false, channel };
    }
  }

  const message = await channel.send({ embeds: [embed] });
  config.messageId = message.id;
  return { ok: true, reposted: true, channel };
}

export default {
  data: new SlashCommandBuilder()
    .setName('divisions')
    .setDescription('Manage the division status board')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // /divisions setup
    .addSubcommand((sub) =>
      sub.setName('setup')
        .setDescription('Post (or move) the division status board in a channel')
        .addChannelOption((opt) =>
          opt.setName('channel')
            .setDescription('Channel to post the status board in')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )

    // /divisions set
    .addSubcommand((sub) =>
      sub.setName('set')
        .setDescription('Open or close a division')
        .addStringOption((opt) =>
          opt.setName('division')
            .setDescription('The division to update')
            .setRequired(true)
            .addChoices(...DIVISIONS.map((d) => ({ name: d.label, value: d.key })))
        )
        .addStringOption((opt) =>
          opt.setName('status')
            .setDescription('New status')
            .setRequired(true)
            .addChoices(
              { name: 'Open', value: 'OPEN' },
              { name: 'Closed', value: 'CLOSED' },
            )
        )
    )

    // /divisions view
    .addSubcommand((sub) =>
      sub.setName('view')
        .setDescription('View the current division statuses')
    ),

  category: 'Community',

  async execute(interaction, guildConfig, client) {
    try {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      const config = await getConfig(client, guildId);
      ensureStatuses(config);

      if (sub === 'setup') {
        const channel = interaction.options.getChannel('channel');
        config.channelId = channel.id;
        config.messageId = null;

        const result = await postOrUpdateBoard(interaction, config);
        if (!result.ok) {
          throw new TitanBotError(
            'Could not post division status board',
            ErrorTypes.DISCORD_API,
            `I couldn't post the status board in ${channel}. Make sure I can view and send messages there.`,
            { subtype: 'post_failed' }
          );
        }

        await saveConfig(client, guildId, config);

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed('Division Status Board Posted', `The board has been posted in ${channel} and will update automatically whenever a division's status changes.`)],
        });
        return;
      }

      if (sub === 'set') {
        const divisionKey = interaction.options.getString('division');
        const status = interaction.options.getString('status');
        const division = DIVISIONS.find((d) => d.key === divisionKey);

        config.statuses[divisionKey] = status;

        const result = await postOrUpdateBoard(interaction, config);
        await saveConfig(client, guildId, config);

        let note = '';
        if (!config.channelId) {
          note = '\n\nSet a board channel with `/divisions setup` to display this live.';
        } else if (!result.ok) {
          note = '\n\nThe status board channel is missing — run `/divisions setup` again.';
        }

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed('Division Updated', `**${division.label}** is now **[${status}]**.${note}`)],
        });
        return;
      }

      if (sub === 'view') {
        await InteractionHelper.universalReply(interaction, {
          embeds: [buildBoardEmbed(config.statuses)],
        });
        return;
      }
    } catch (error) {
      logger.error('Divisions command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'divisions_failed' });
    }
  },
};
