import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const OFFENCE_KEY = (guildId, userId) => `offences_${guildId}_${userId}`;
const OFFENCE_RESET_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

const ESCALATION_LADDER = [
  { level: 1, label: 'Verbal Warning or Written Warning' },
  { level: 2, label: 'Mute for 30 minutes' },
  { level: 3, label: 'Kick OR Extend Mute by 24 hours' },
  { level: 4, label: 'Temporary Mute for 3 days' },
  { level: 5, label: 'Permanent Mute' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('offences')
    .setDescription('View or manage a member\'s offence history')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)

    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View a member\'s offence history')
        .addUserOption(opt =>
          opt.setName('member')
            .setDescription('The member to check')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Clear a member\'s offence history')
        .addUserOption(opt =>
          opt.setName('member')
            .setDescription('The member to clear offences for')
            .setRequired(true)
        )
    ),

  category: 'moderation',

  async execute(interaction, config, client) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const sub = interaction.options.getSubcommand();
      const user = interaction.options.getUser('member');

      if (sub === 'view') {
        const raw = await getFromDb(OFFENCE_KEY(interaction.guild.id, user.id), { offences: [] });
        const now = Date.now();
        const activeOffences = (raw.offences || []).filter(o => now - new Date(o.date).getTime() < OFFENCE_RESET_MS);
        const expiredOffences = (raw.offences || []).filter(o => now - new Date(o.date).getTime() >= OFFENCE_RESET_MS);

        const nextLevel = Math.min(activeOffences.length + 1, ESCALATION_LADDER.length);
        const nextEscalation = ESCALATION_LADDER[nextLevel - 1];

        const embed = new EmbedBuilder()
          .setColor(activeOffences.length === 0 ? 0x2ECC71 : activeOffences.length >= 4 ? 0xE74C3C : 0xF39C12)
          .setTitle(`📋 Offence History — ${user.username}`)
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'Active Offences', value: `${activeOffences.length} / ${ESCALATION_LADDER.length}`, inline: true },
            { name: 'Expired Offences', value: `${expiredOffences.length}`, inline: true },
            { name: 'Resets After', value: '60 days of no offences', inline: true },
          );

        if (activeOffences.length > 0) {
          embed.addFields({
            name: 'Offence Log',
            value: activeOffences.map((o, i) =>
              `**#${i + 1}** — ${o.type} • Case \`${o.caseCode}\` • <t:${Math.floor(new Date(o.date).getTime() / 1000)}:R>`
            ).join('\n'),
            inline: false,
          });
        } else {
          embed.addFields({ name: 'Offence Log', value: 'No active offences.', inline: false });
        }

        embed.addFields({
          name: 'Next Escalation',
          value: activeOffences.length >= ESCALATION_LADDER.length
            ? '⚠️ Max level reached — Perm Mute'
            : `Level ${nextEscalation.level}: ${nextEscalation.label}`,
          inline: false,
        });

        await InteractionHelper.universalReply(interaction, { embeds: [embed] });

      } else if (sub === 'clear') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          throw new TitanBotError('No permission', ErrorTypes.PERMISSIONS, 'You need Manage Server permission to clear offences.', { subtype: 'missing_permission' });
        }

        await setInDb(OFFENCE_KEY(interaction.guild.id, user.id), { offences: [], lastOffence: null });

        await InteractionHelper.universalReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ECC71)
              .setTitle('✅ Offences Cleared')
              .setDescription(`All offences for <@${user.id}> have been cleared.`)
              .setTimestamp(),
          ],
        });

        logger.info('Offences cleared', {
          userId: interaction.user.id,
          targetId: user.id,
          guildId: interaction.guild.id,
        });
      }

    } catch (error) {
      logger.error('Offences command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'offences_failed' });
    }
  },
};
