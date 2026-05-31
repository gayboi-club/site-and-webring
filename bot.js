const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  EmbedBuilder, StringSelectMenuBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── Load .env file ────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq === -1) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  });
}

// ─── Config ────────────────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const MEMBERS_FILE = path.join(__dirname, 'members.json');

// Admin user IDs — only these users can add/remove/edit members
const ADMINS = new Set([
  '1183135979154976769', // Energyboy
  '972579451466575923',  // Glitchy
]);

// Branding
const ACCENT = 0xCBA6F7; // catppuccin mauve
const WEBRING_URL = 'https://gayboi.club/webring';

// Custom emojis
const EMOJI_RED   = '<:red:1510609701027708928>';
const EMOJI_GREEN = '<:green:1510609663258005536>';
const EMOJI_LOCK  = '<:lock:1510609979890208918>';

// ─── Members helpers ───────────────────────────────────────────────────────────
function readMembers() {
  try {
    return JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeMembers(members) {
  fs.writeFileSync(MEMBERS_FILE, JSON.stringify(members, null, 2), 'utf8');
}

function isAdmin(userId) {
  return ADMINS.has(userId);
}

// ─── Slash commands definition ─────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a new member to the webring (admin only)'),

  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a member from the webring (admin only)')
    .addStringOption(opt =>
      opt.setName('member')
        .setDescription('The member ID to remove')
        .setRequired(true)
        .setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit an existing member (admin only)')
    .addStringOption(opt =>
      opt.setName('member')
        .setDescription('The member ID to edit')
        .setRequired(true)
        .setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all webring members'),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show details about a specific member')
    .addStringOption(opt =>
      opt.setName('member')
        .setDescription('The member ID to look up')
        .setRequired(true)
        .setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName('random')
    .setDescription('Get a random member from the webring'),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show webring statistics'),

  new SlashCommandBuilder()
    .setName('reorder')
    .setDescription('Move a member to a new position (admin only)')
    .addStringOption(opt =>
      opt.setName('member')
        .setDescription('The member ID to move')
        .setRequired(true)
        .setAutocomplete(true))
    .addIntegerOption(opt =>
      opt.setName('position')
        .setDescription('New position (1-based)')
        .setRequired(true)
        .setMinValue(1)),
];

// ─── Register commands ─────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST().setToken(TOKEN);
  try {
    console.log('[bot] Registering slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands.map(c => c.toJSON()),
    });
    console.log('[bot] Slash commands registered.');
  } catch (err) {
    console.error('[bot] Failed to register commands:', err);
  }
}

// ─── Client setup ──────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`[bot] Logged in as ${client.user.tag}`);
  client.user.setActivity('gayboi.club webring', { type: 3 }); // "Watching"
});

// ─── Autocomplete handler ──────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isAutocomplete()) return;

  const members = readMembers();
  const focused = interaction.options.getFocused().toLowerCase();

  const filtered = members
    .filter(m => m.id.toLowerCase().includes(focused) || m.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(m => ({ name: `${m.name} (${m.id})`, value: m.id }));

  await interaction.respond(filtered);
});

// ─── Command + modal handlers ──────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {

  // ── Modal submissions ──────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {

    // Add member modal
    if (interaction.customId === 'add_member_modal') {
      const id = interaction.fields.getTextInputValue('member_id').trim().toLowerCase().replace(/\s+/g, '-');
      const name = interaction.fields.getTextInputValue('member_name').trim();
      const url = interaction.fields.getTextInputValue('member_url').trim();
      const aliasesRaw = interaction.fields.getTextInputValue('member_aliases').trim();

      // Validate
      if (!id || !name || !url) {
        return interaction.reply({ content: `${EMOJI_RED} **ID, name, and URL are all required.**`, ephemeral: true });
      }

      // Validate URL
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      } catch {
        return interaction.reply({ content: `${EMOJI_RED} **Invalid URL.** Must start with \`http://\` or \`https://\`.`, ephemeral: true });
      }

      const members = readMembers();

      if (members.find(m => m.id === id)) {
        return interaction.reply({ content: `${EMOJI_RED} **Member \`${id}\` already exists.** Use \`/edit\` to modify them.`, ephemeral: true });
      }

      const newMember = { id, name, url };
      if (aliasesRaw) {
        newMember.aliases = aliasesRaw.split(',').map(a => a.trim()).filter(Boolean);
      }

      members.push(newMember);
      writeMembers(members);

      const embed = new EmbedBuilder()
        .setColor(0x40A02B) // green
        .setTitle('Member Added')
        .addFields(
          { name: 'ID', value: `\`${id}\``, inline: true },
          { name: 'Name', value: name, inline: true },
          { name: 'URL', value: url },
        )
        .setFooter({ text: `Added by ${interaction.user.tag}` })
        .setTimestamp();

      if (newMember.aliases?.length) {
        embed.addFields({ name: 'Aliases', value: newMember.aliases.join(', ') });
      }

      return interaction.reply({ embeds: [embed] });
    }

    // Edit member modal
    if (interaction.customId.startsWith('edit_member_modal:')) {
      const targetId = interaction.customId.split(':')[1];
      const members = readMembers();
      const idx = members.findIndex(m => m.id === targetId);

      if (idx === -1) {
        return interaction.reply({ content: `${EMOJI_RED} **Member \`${targetId}\` not found.** They may have been removed.`, ephemeral: true });
      }

      const newName = interaction.fields.getTextInputValue('member_name').trim();
      const newUrl = interaction.fields.getTextInputValue('member_url').trim();
      const aliasesRaw = interaction.fields.getTextInputValue('member_aliases').trim();

      if (newUrl) {
        try {
          const parsed = new URL(newUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
        } catch {
          return interaction.reply({ content: `${EMOJI_RED} **Invalid URL.** Must start with \`http://\` or \`https://\`.`, ephemeral: true });
        }
      }

      const old = { ...members[idx] };

      if (newName) members[idx].name = newName;
      if (newUrl) members[idx].url = newUrl;
      if (aliasesRaw) {
        members[idx].aliases = aliasesRaw.split(',').map(a => a.trim()).filter(Boolean);
      } else {
        delete members[idx].aliases;
      }

      writeMembers(members);

      const embed = new EmbedBuilder()
        .setColor(0xDF8E1D) // yellow
        .setTitle('Member Edited')
        .addFields(
          { name: 'ID', value: `\`${targetId}\``, inline: true },
          { name: 'Name', value: `${old.name} → **${members[idx].name}**`, inline: true },
          { name: 'URL', value: `${old.url} → **${members[idx].url}**` },
        )
        .setFooter({ text: `Edited by ${interaction.user.tag}` })
        .setTimestamp();

      if (members[idx].aliases?.length) {
        embed.addFields({ name: 'Aliases', value: members[idx].aliases.join(', ') });
      }

      return interaction.reply({ embeds: [embed] });
    }

    return;
  }

  // ── Slash commands ─────────────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ── /add ───────────────────────────────────────────────────────────────────
  if (commandName === 'add') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: `${EMOJI_LOCK} **Admin only.** You don't have permission to use this.`, ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId('add_member_modal')
      .setTitle('Add Webring Member');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_id')
          .setLabel('Member ID (short, lowercase, no spaces)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. glitch')
          .setRequired(true)
          .setMaxLength(50),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_name')
          .setLabel('Display Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. Glitchy :3')
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_url')
          .setLabel('Website URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. https://example.com')
          .setRequired(true)
          .setMaxLength(200),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_aliases')
          .setLabel('Aliases (comma-separated, optional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. alt-domain.com, other-domain.net')
          .setRequired(false)
          .setMaxLength(300),
      ),
    );

    return interaction.showModal(modal);
  }

  // ── /remove ────────────────────────────────────────────────────────────────
  if (commandName === 'remove') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: `${EMOJI_LOCK} **Admin only.** You don't have permission to use this.`, ephemeral: true });
    }

    const targetId = interaction.options.getString('member');
    const members = readMembers();
    const idx = members.findIndex(m => m.id === targetId);

    if (idx === -1) {
      return interaction.reply({ content: `${EMOJI_RED} **Member \`${targetId}\` not found.**`, ephemeral: true });
    }

    const removed = members.splice(idx, 1)[0];
    writeMembers(members);

    const embed = new EmbedBuilder()
      .setColor(0xD20F39) // red
      .setTitle('Member Removed')
      .addFields(
        { name: 'ID', value: `\`${removed.id}\``, inline: true },
        { name: 'Name', value: removed.name, inline: true },
        { name: 'URL', value: removed.url },
      )
      .setFooter({ text: `Removed by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ── /edit ──────────────────────────────────────────────────────────────────
  if (commandName === 'edit') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: `${EMOJI_LOCK} **Admin only.** You don't have permission to use this.`, ephemeral: true });
    }

    const targetId = interaction.options.getString('member');
    const members = readMembers();
    const member = members.find(m => m.id === targetId);

    if (!member) {
      return interaction.reply({ content: `${EMOJI_RED} **Member \`${targetId}\` not found.**`, ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`edit_member_modal:${targetId}`)
      .setTitle(`Edit: ${member.name}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_name')
          .setLabel('Display Name')
          .setStyle(TextInputStyle.Short)
          .setValue(member.name)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_url')
          .setLabel('Website URL')
          .setStyle(TextInputStyle.Short)
          .setValue(member.url)
          .setRequired(true)
          .setMaxLength(200),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('member_aliases')
          .setLabel('Aliases (comma-separated, optional)')
          .setStyle(TextInputStyle.Short)
          .setValue(member.aliases?.join(', ') || '')
          .setRequired(false)
          .setMaxLength(300),
      ),
    );

    return interaction.showModal(modal);
  }

  // ── /list ──────────────────────────────────────────────────────────────────
  if (commandName === 'list') {
    const members = readMembers();

    if (members.length === 0) {
      return interaction.reply({ content: 'The webring is empty! Add members with `/add`.', ephemeral: true });
    }

    const list = members.map((m, i) =>
      `**${i + 1}.** [${m.name}](${m.url}) \`${m.id}\``
    ).join('\n');

    const embed = new EmbedBuilder()
      .setColor(ACCENT)
      .setTitle('gayboi.club webring')
      .setDescription(list)
      .setFooter({ text: `${members.length} member${members.length === 1 ? '' : 's'} • ${WEBRING_URL}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ── /info ──────────────────────────────────────────────────────────────────
  if (commandName === 'info') {
    const targetId = interaction.options.getString('member');
    const members = readMembers();
    const member = members.find(m => m.id === targetId);

    if (!member) {
      return interaction.reply({ content: `${EMOJI_RED} **Member \`${targetId}\` not found.**`, ephemeral: true });
    }

    const position = members.indexOf(member) + 1;
    const prevMember = members[(members.indexOf(member) - 1 + members.length) % members.length];
    const nextMember = members[(members.indexOf(member) + 1) % members.length];

    const embed = new EmbedBuilder()
      .setColor(ACCENT)
      .setTitle(`${member.name}`)
      .addFields(
        { name: 'ID', value: `\`${member.id}\``, inline: true },
        { name: 'Position', value: `#${position} of ${members.length}`, inline: true },
        { name: 'URL', value: member.url },
        { name: '← Prev', value: `${prevMember.name} (\`${prevMember.id}\`)`, inline: true },
        { name: 'Next →', value: `${nextMember.name} (\`${nextMember.id}\`)`, inline: true },
      )
      .setTimestamp();

    if (member.aliases?.length) {
      embed.addFields({ name: 'Aliases', value: member.aliases.join(', ') });
    }

    // Build the webring HTML snippet for this member
    const snippet = `<div class="webring">\n  <a href="https://gayboi.club/api/webring/prev?id=${member.id}">← Prev</a>\n  <a href="https://gayboi.club/api/webring/random">Random</a>\n  <a href="https://gayboi.club/api/webring/next?id=${member.id}">Next →</a>\n</div>`;
    embed.addFields({ name: 'Embed Code', value: `\`\`\`html\n${snippet}\n\`\`\`` });

    return interaction.reply({ embeds: [embed] });
  }

  // ── /random ────────────────────────────────────────────────────────────────
  if (commandName === 'random') {
    const members = readMembers();

    if (members.length === 0) {
      return interaction.reply({ content: 'The webring is empty!', ephemeral: true });
    }

    const pick = members[Math.floor(Math.random() * members.length)];

    const embed = new EmbedBuilder()
      .setColor(ACCENT)
      .setTitle('Random Member')
      .setDescription(`**[${pick.name}](${pick.url})**\n\`${pick.id}\``)
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ── /stats ─────────────────────────────────────────────────────────────────
  if (commandName === 'stats') {
    const members = readMembers();
    const stat = fs.statSync(MEMBERS_FILE);

    const uniqueDomains = new Set();
    members.forEach(m => {
      try { uniqueDomains.add(new URL(m.url).hostname); } catch {}
    });

    const totalAliases = members.reduce((sum, m) => sum + (m.aliases?.length || 0), 0);

    const embed = new EmbedBuilder()
      .setColor(ACCENT)
      .setTitle('Webring Stats')
      .addFields(
        { name: 'Total Members', value: `${members.length}`, inline: true },
        { name: 'Unique Domains', value: `${uniqueDomains.size}`, inline: true },
        { name: 'Total Aliases', value: `${totalAliases}`, inline: true },
        { name: 'Last Updated', value: `<t:${Math.floor(stat.mtimeMs / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: WEBRING_URL })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ── /reorder ───────────────────────────────────────────────────────────────
  if (commandName === 'reorder') {
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({ content: `${EMOJI_LOCK} **Admin only.** You don't have permission to use this.`, ephemeral: true });
    }

    const targetId = interaction.options.getString('member');
    const newPos = interaction.options.getInteger('position');
    const members = readMembers();

    const idx = members.findIndex(m => m.id === targetId);
    if (idx === -1) {
      return interaction.reply({ content: `${EMOJI_RED} **Member \`${targetId}\` not found.**`, ephemeral: true });
    }

    if (newPos > members.length) {
      return interaction.reply({ content: `${EMOJI_RED} **Position must be between 1 and ${members.length}.**`, ephemeral: true });
    }

    const [member] = members.splice(idx, 1);
    members.splice(newPos - 1, 0, member);
    writeMembers(members);

    const embed = new EmbedBuilder()
      .setColor(0xDF8E1D)
      .setTitle('Member Reordered')
      .setDescription(`**${member.name}** moved to position **#${newPos}**`)
      .setFooter({ text: `Reordered by ${interaction.user.tag}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────
if (!TOKEN || !CLIENT_ID) {
  console.error('[bot] Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID environment variables.');
  console.error('[bot] Set them in your environment or .env file:');
  console.error('       DISCORD_BOT_TOKEN=your-bot-token');
  console.error('       DISCORD_CLIENT_ID=your-client-id');
  process.exit(1);
}

registerCommands().then(() => {
  client.login(TOKEN);
});
