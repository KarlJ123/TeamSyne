import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { useMainPlayer } from 'discord-player';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('Song name or URL (YouTube, Spotify, SoundCloud)')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const query = interaction.options.getFocused();
        if (!query) return interaction.respond([]);
        try {
            const player = useMainPlayer();
            const results = await player.search(query, { requestedBy: interaction.user });
            const choices = results.tracks.slice(0, 10).map(t => ({
                name: `${t.title} — ${t.author}`.substring(0, 100),
                value: t.url,
            }));
            await interaction.respond(choices);
        } catch {
            await interaction.respond([]);
        }
    },

    async execute(interaction) {
        await interaction.deferReply();

        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
            return interaction.editReply({
                embeds: [createEmbed({ title: '❌ Not in Voice', description: 'You need to be in a voice channel to play music.', color: 'error' })],
            });
        }

        const botMember = interaction.guild.members.me;
        if (!voiceChannel.permissionsFor(botMember).has(['Connect', 'Speak'])) {
            return interaction.editReply({
                embeds: [createEmbed({ title: '❌ Missing Permissions', description: "I don't have permission to join or speak in your voice channel.", color: 'error' })],
            });
        }

        const player = useMainPlayer();
        let query = interaction.options.getString('query', true);

        // Strip YouTube Mix/radio params — extractor can't handle start_radio or RD* playlists
        try {
            const url = new URL(query);
            const list = url.searchParams.get('list') ?? '';
            if (url.hostname.includes('youtube.com') && (url.searchParams.get('start_radio') || list.startsWith('RD'))) {
                url.searchParams.delete('list');
                url.searchParams.delete('start_radio');
                url.searchParams.delete('pp');
                query = url.toString();
            }
        } catch { /* not a URL, leave as-is */ }

        try {
            const { track } = await player.play(voiceChannel, query, {
                nodeOptions: {
                    metadata: { channel: interaction.channel },
                    volume: 50,
                    leaveOnEmpty: true,
                    leaveOnEmptyCooldown: 30_000,
                    leaveOnEnd: true,
                    leaveOnEndCooldown: 30_000,
                    selfDeaf: true,
                },
                requestedBy: interaction.user,
            });

            const queue = player.nodes.get(interaction.guildId);
            const position = queue ? queue.tracks.size : 0;

            const embed = createEmbed({
                title: position > 0 ? '🎵 Added to Queue' : '🎵 Now Playing',
                description: `**[${track.title}](${track.url})**`,
            })
                .addFields(
                    { name: 'Artist', value: track.author || 'Unknown', inline: true },
                    { name: 'Duration', value: track.duration || 'Unknown', inline: true },
                    { name: 'Requested by', value: `${interaction.user}`, inline: true },
                );

            if (track.thumbnail) embed.setThumbnail(track.thumbnail);
            if (position > 0) embed.addFields({ name: 'Position in queue', value: `#${position}`, inline: true });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Music play error:', { message: error.message, stack: error.stack });
            await interaction.editReply({
                embeds: [createEmbed({
                    title: '❌ Playback Error',
                    description: `\`\`\`${error.message ?? 'Unknown error'}\`\`\``,
                    color: 'error',
                })],
            });
        }
    },
};
