import { Client, GatewayIntentBits, TextChannel } from 'discord.js';

export async function sendMessage(message: string, channelId: string) {
    const discordClient = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });

    await discordClient.login(process.env.DISCORD_TOKEN);

    const channel = (await discordClient.channels.fetch(channelId)) as TextChannel;
    channel.send(message);
    await discordClient.destroy();
}
