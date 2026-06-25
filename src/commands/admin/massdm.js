import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ComponentType,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const ALLOWED_USER_IDS = ['710198142934712421', '851642953176842260'];

export default {
  data: new SlashCommandBuilder()
    .setName('massdm')
    .setDescription('Send a DM to all server members')
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Title of the DM message')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The message to send to everyone')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('color')
        .setDescription('Embed color')
        .setRequired(false)
        .addChoices(
          { name: 'Blue (default)', value: '0x3498DB' },
          { name: 'Green', value: '0x2ECC71' },
          { name: 'Red', value: '0xE74C3C' },
          { name: 'Gold', value: '0xF1C40F' },
          { name: 'Purple', value: '0x9B59B6' },
          { name: 'White', value: '0xFFFFFF' },
        )
    ),

  category: 'admin',

  async execute(interaction, config, client) {
    try {
      // Check if user is allowed
      if (!ALLOWED_USER_IDS.includes(interaction.user.id)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xE74C3C)
              .setDescription('❌ You do not have permission to use this command.'),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const title = interaction.options.getString('title');
      const message = interaction.options.getString('message');
      const colorStr = interaction.options.getString('color') || '0x3498DB';

      // Fetch all members
      await interaction.guild.members.fetch();
      const members = interaction.guild.members.cache.filter(m => !m.user.bot);
      const totalCount = members.size;

      // Show confirmation
      const confirmEmbed = new EmbedBuilder()
        .setColor(0xF39C12)
        .setTitle('⚠️ Confirm Mass DM')
        .setDescription(`You are about to DM **${totalCount} members**. This cannot be undone.`)
        .addFields(
          { name: 'Title', value: title, inline: false },
          { name: 'Message', value: message.length > 200 ? message.slice(0, 200) + '...' : message, inline: false },
        )
        .setFooter({ text: 'Click Confirm to send or Cancel to abort.' })
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('massdm_confirm')
          .setLabel('✅ Confirm Send')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('massdm_cancel')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger),
      );

      await InteractionHelper.universalReply(interaction, {
        embeds: [confirmEmbed],
        components: [buttons],
      });

      // Wait for button click
      const collector = interaction.channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: i => i.user.id === interaction.user.id && ['massdm_confirm', 'massdm_cancel'].includes(i.customId),
        time: 30000,
        max: 1,
      });

      collector.on('collect', async btnInteraction => {
        await btnInteraction.deferUpdate();

        if (btnInteraction.customId === 'massdm_cancel') {
          await InteractionHelper.universalReply(interaction, {
            embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Mass DM cancelled.')],
            components: [],
          });
          return;
        }

        // Build the DM embed
        const dmEmbed = new EmbedBuilder()
          .setTitle(`📢 ${title}`)
          .setDescription(message)
          .setColor(parseInt(colorStr, 16))
          .setFooter({ text: `From ${interaction.guild.name}`, iconURL: interaction.guild.iconURL() })
          .setTimestamp();

        // Update to show sending progress
        await InteractionHelper.universalReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x3498DB)
              .setTitle('📨 Sending DMs...')
              .setDescription(`Sending to **${totalCount}** members. This may take a while...`),
          ],
          components: [],
        });

        // Send DMs
        let sent = 0;
        let failed = 0;

        for (const [, member] of members) {
          try {
            await member.send({ embeds: [dmEmbed] });
            sent++;
          } catch {
            failed++;
          }

          // Small delay to avoid rate limits
          if ((sent + failed) % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        // Final report
        await InteractionHelper.universalReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ECC71)
              .setTitle('✅ Mass DM Complete')
              .addFields(
                { name: 'Total Members', value: `${totalCount}`, inline: true },
                { name: 'Successfully Sent', value: `${sent}`, inline: true },
                { name: 'Failed (DMs closed)', value: `${failed}`, inline: true },
              )
              .setTimestamp(),
          ],
          components: [],
        });

        logger.info('Mass DM completed', {
          userId: interaction.user.id,
          guildId: interaction.guildId,
          sent,
          failed,
          total: totalCount,
        });
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          InteractionHelper.universalReply(interaction, {
            embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Mass DM timed out. No messages were sent.')],
            components: [],
          }).catch(() => {});
        }
      });

    } catch (error) {
      logger.error('Mass DM command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'massdm_failed' });
    }
  },
};
