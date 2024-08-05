const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');
const fs = require('fs/promises');
const path = require('path');
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

/**
 * Load client secrets from a local file.
 */
async function loadCredentials() {
    try {
        const content = await fs.readFile(CREDENTIALS_PATH);
        return JSON.parse(content);
    } catch (err) {
        console.error('Error loading client secret file:', err);
        throw err;
    }
}

/**
 * Create an OAuth2 client with the given credentials.
 * @param {Object} credentials The authorization client credentials.
 */
async function authorize(credentials) {
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    try {
        const token = await fs.readFile(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(token));
    } catch (err) {
        await getAccessToken(oAuth2Client);
    }

    return oAuth2Client;
}

/**
 * Get and store new token after prompting for user authorization.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 */
async function getAccessToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Enter the code from that page here: ', async (code) => {
        rl.close();
        try {
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);
            await saveCredentials(oAuth2Client);
        } catch (err) {
            console.error('Error retrieving access token', err);
        }
    });
}

/**
 * Save the credentials to disk.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to store token for.
 */
async function saveCredentials(oAuth2Client) {
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: oAuth2Client._clientId,
        client_secret: oAuth2Client._clientSecret,
        refresh_token: oAuth2Client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
    console.log('Token stored to', TOKEN_PATH);
}

/**
 * Load or request authorization to call APIs.
 */
async function main() {
    try {
        const credentials = await loadCredentials();
        const auth = await authorize(credentials);
        await listMessages(auth);
    } catch (err) {
        console.error('Error during authorization:', err);
    }
}

/**
 * Lists the messages in the user's account.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listMessages(auth) {
    const gmail = google.gmail({ version: 'v1', auth });
    try {
        const res = await gmail.users.messages.list({ userId: 'me', maxResults: 10 });
        const messages = res.data.messages;
        if (!messages || messages.length === 0) {
            console.log('No messages found.');
            return;
        }
        console.log('Messages:');
        for (const message of messages) {
            const msg = await getMessage(auth, message.id);
            console.log(`- ${msg.snippet}`);
        }
    } catch (err) {
        console.error('The API returned an error:', err);
    }
}

/**
 * Get the details of a specific message.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {string} messageId The ID of the message to retrieve.
 */
async function getMessage(auth, messageId) {
    const gmail = google.gmail({ version: 'v1', auth });
    try {
        const res = await gmail.users.messages.get({ userId: 'me', id: messageId });
        return res.data;
    } catch (err) {
        console.error('Error retrieving message:', err);
    }
}

main();
