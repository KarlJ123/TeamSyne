import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import ticketConfig from './modules/ticket_dashboard.js';
import { handlePanelAdd, handlePanelList, handlePanelDelete } from './modules/ticket_panels.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Manages the server's ticket system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)

        // Existing setup subcommand
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Sets up the ticket creation panel in a specified channel.")
                .addChannelOption((option) =>
                    option.setName("panel_channel")
                        .setDescription("The channel where the ticket panel will be sent.")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option.setName("panel_message")
                        .setDescription("The main message/description for the ticket panel.")
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option.setName("button_label")
                        .setDescription("The label for the ticket creation button (default: Create Ticket)")
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option.setName("category")
                        .setDescription("The category where new tickets will be created (optional).")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option.setName("closed_category")
                        .setDescription("The category where closed tickets will be moved (optional).")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option.setName("staff_role")
                        .setDescription("The role that can access tickets (optional).")
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option.setName("max_tickets_per_user")
                        .setDescription("Maximum number of tickets a user can create (default: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option.setName("dm_on_close")
                        .setDescription("Send DM to user when their ticket is closed (default: true)")
                        .setRequired(false),
                ),
        )

        // Existing dashboard subcommand
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Open the interactive ticket system dashboard"),
        )

        // New panel subcommand group
        .addSubcommandGroup((group) =>
            group
                .setName("panel")
                .setDescription("Manage multiple ticket panels")

                // panel add
                .addSubcommand((sub) =>
                    sub.setName("add")
                        .setDescription("Create a new ticket panel in a channel")
                        .addChannelOption((opt) =>
                            opt.setName("panel_channel")
                                .setDescription("Channel to post the panel in")
                                .addChannelTypes(ChannelType.GuildText)
                                .setRequired(true),
                        )
                        .addStringOption((opt) =>
                            opt.setName("panel_message")
                                .setDescription("Description shown on the panel")
                                .setRequired(true),
                        )
                        .addStringOption((opt) =>
                            opt.setName("panel_title")
                                .setDescription("Title of the panel embed (default: Support Tickets)")
                                .setRequired(false),
                        )
                        .addStringOption((opt) =>
                            opt.setName("button_label")
                                .setDescription("Label on the create ticket button (default: Create Ticket)")
                                .setRequired(false),
                        )
                        .addChannelOption((opt) =>
                            opt.setName("category")
                                .setDescription("Category where tickets from this panel will be created")
                                .addChannelTypes(ChannelType.GuildCategory)
                                .setRequired(false),
                        )
                        .addChannelOption((opt) =>
                            opt.setName("closed_category")
                                .setDescription("Category where closed tickets from this panel will go")
                                .addChannelTypes(ChannelType.GuildCategory)
                                .setRequired(false),
                        )
                        .addRoleOption((opt) =>
                            opt.setName("staff_role")
                                .setDescription("Staff role that can access tickets from this panel")
                                .setRequired(false),
                        )
                        .addIntegerOption((opt) =>
                            opt.setName("max_tickets_per_user")
                                .setDescription("Max open tickets per user for this panel (default: 3)")
                                .setMinValue(1)
                                .setMaxValue(10)
                                .setRequired(false),
                        )
                        .addBooleanOption((opt) =>
                            opt.setName("dm_on_close")
                                .setDescription("DM user when ticket closed (default: true)")
                                .setRequired(false),
                        ),
                )

                // panel list
                .addSubcommand((sub) =>
                    sub.setName("list")
                        .setDescription("List all ticket panels for this server"),
                )

                // panel delete
                .addSubcommand((sub) =>
                    sub.setName("delete")
                        .setDescription("Delete a ticket panel")
                        .addStringOption((opt) =>
                            opt.setName("panel_id")
                                .setDescription("The panel ID to delete (get from /ticket panel list)")
                                .setRequired(true),
                        ),
                ),
        ),

    category: "ticket",

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                logger.warn('Ticket command permission denied', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket'
                });
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission for this action.' });
            }

            const subcommand = interaction.options.getSubcommand();
            const subcommandGroup = interaction.options.getSubcommandGroup(false);

            // Handle panel subcommand group
            if (subcommandGroup === 'panel') {
                if (subcommand === 'add') return await handlePanelAdd(interaction, client);
                if (subcommand === 'list') return await handlePanelList(interaction, client);
                if (subcommand === 'delete') return await handlePanelDelete(interaction, client);
                return;
            }

            // Handle existing subcommands
            if (subcommand === "dashboard") {
                return ticketConfig.execute(interaction, config, client);
            }

            if (subcommand === "setup") {
                const existingConfig = await getGuildConfig(client, interaction.guildId);
                if (existingConfig?.ticketPanelChannelId) {
                    return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `This server already has a ticket system set up (panel in <#${existingConfig.ticketPanelChannelId}>).\n\nOnly one ticket system is supported per server. Use \`/ticket dashboard\` to edit or update the existing setup, or select **Delete System** from the dashboard to remove it and start fresh.\n\n💡 To create additional panels, use \`/ticket panel add\`.` });
                }

                const panelChannel = interaction.options.getChannel("panel_channel");
                const categoryChannel = interaction.options.getChannel("category");
                const closedCategoryChannel = interaction.options.getChannel("closed_category");
                const staffRole = interaction.options.getRole("staff_role");
                const panelMessage = interaction.options.getString("panel_message") || "Click the button below to create a support ticket.";
                const buttonLabel = interaction.options.getString("button_label") || "Create Ticket";
                const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
                const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

                const setupEmbed = createEmbed({
                    title: "Support Tickets",
                    description: panelMessage,
                    color: getColor('info')
                });

                const ticketButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("create_ticket")
                        .setLabel(buttonLabel)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("📩"),
                );

                try {
                    const sentPanel = await panelChannel.send({
                        embeds: [setupEmbed],
                        components: [ticketButton],
                    });

                    if (client.db && interaction.guildId) {
                        const currentConfig = existingConfig;
                        currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                        currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                        currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                        currentConfig.ticketPanelChannelId = panelChannel.id;
                        currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                        currentConfig.ticketPanelMessage = panelMessage;
                        currentConfig.ticketButtonLabel = buttonLabel;
                        currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                        currentConfig.dmOnClose = dmOnClose;

                        const { getGuildConfigKey } = await import('../../utils/database.js');
                        const configKey = getGuildConfigKey(interaction.guildId);
                        await client.db.set(configKey, currentConfig);
                        logger.info('Ticket configuration saved', {
                            guildId: interaction.guildId,
                            categoryId: categoryChannel?.id,
                            closedCategoryId: closedCategoryChannel?.id,
                            staffRoleId: staffRole?.id,
                            maxTickets: maxTicketsPerUser,
                            dmOnClose: dmOnClose
                        });
                    }

                    let successMessage = `The ticket creation panel has been sent to ${panelChannel}.`;
                    if (categoryChannel) {
                        successMessage += ` New tickets will be created in the **${categoryChannel.name}** category.`;
                    } else {
                        successMessage += ' New tickets will be created in a new "Tickets" category.';
                    }
                    if (closedCategoryChannel) {
                        successMessage += ` Closed tickets will be moved to **${closedCategoryChannel.name}**.`;
                    }
                    if (staffRole) {
                        successMessage += ` **${staffRole.name}** role will have access to tickets.`;
                    }
                    successMessage += `\n\n**Max Tickets Per User:** ${maxTicketsPerUser}\n**DM on Close:** ${dmOnClose ? 'Enabled' : 'Disabled'}`;
                    successMessage += `\n\n💡 To create additional panels, use \`/ticket panel add\`.`;

                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [successEmbed("Ticket Panel Set Up", successMessage)],
                    });

                    logger.info('Ticket panel setup completed', {
                        userId: interaction.user.id,
                        userTag: interaction.user.tag,
                        guildId: interaction.guildId,
                        panelChannelId: panelChannel.id,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                        commandName: 'ticket_setup'
                    });

                } catch (error) {
                    logger.error('Ticket setup error', {
                        error: error.message,
                        stack: error.stack,
                        userId: interaction.user.id,
                        guildId: interaction.guildId,
                        commandName: 'ticket_setup'
                    });
                    if (interaction.deferred || interaction.replied) {
                        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Could not send the ticket panel or save configuration. Check the bot\'s permissions and database connection.' }).catch(err => {
                            logger.error('Failed to send error reply', { error: err.message, guildId: interaction.guildId });
                        });
                    } else {
                        await handleInteractionError(interaction, error, {
                            commandName: 'ticket_setup',
                            source: 'ticket_setup_command'
                        });
                    }
                }
            }
        } catch (error) {
            logger.error('Error executing ticket command', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'ticket',
                source: 'ticket_command_main'
            });
        }
    }
};
