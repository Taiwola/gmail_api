const { google } = require('googleapis');
const fs = require('fs/promises');
const path = require('path');

class GmailClient {
    constructor() {
        this.SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
        this.CREDENTIALS_PATH = path.join(__dirname, '../', 'credentials.json');
        this.TOKEN_PATH = path.join(__dirname, 'token.json');
        this.auth = null;
    }

    async loadCredentials() {
        try {
            const content = await fs.readFile(this.CREDENTIALS_PATH);
            return JSON.parse(content);
        } catch (err) {
            console.error('Error loading client secret file:', err);
            throw err;
        }
    }

    async authorize(credentials) {
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        try {
            const token = await fs.readFile(this.TOKEN_PATH);
            oAuth2Client.setCredentials(JSON.parse(token));
        } catch (err) {
            return await this.getAuthUrl(oAuth2Client);
        }

        this.auth = oAuth2Client;
    }

    async getAuthUrl(oAuth2Client) {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.SCOPES,
            prompt: 'consent'
        });

        return authUrl;
    }

    async getAccessToken(oAuth2Client, code) {
        try {
            const { tokens } = await oAuth2Client.getToken(code);

            oAuth2Client.setCredentials(tokens);
            await this.saveCredentials(oAuth2Client);
        } catch (err) {
            console.error('Error retrieving access token', err);
            throw err;
        }
    }

    async saveCredentials(oAuth2Client) {
        const payload = JSON.stringify({
            type: 'authorized_user',
            client_id: oAuth2Client._clientId,
            client_secret: oAuth2Client._clientSecret,
            refresh_token: oAuth2Client.credentials.refresh_token,
        });
        await fs.writeFile(this.TOKEN_PATH, payload);
        console.log('Token stored to', this.TOKEN_PATH);
    }

    async listMessages(filter = {}) {
        console.log("Fetching messages...");
        const gmail = google.gmail({ version: 'v1', auth: this.auth });
        try {
            const res = await gmail.users.messages.list({ userId: 'me', maxResults: 10 });
            const messages = res.data.messages;
            if (!messages || messages.length === 0) {
                console.log("No messages found.");
                return [];
            }
            const filteredMessages = await Promise.all(messages.map(async (message) => {
                const msg = await this.getMessages(message.id);
                return msg;
            }));

            return filteredMessages.filter((msg) => {
                if (filter.domain && !msg.from.endsWith(filter.domain)) {
                    return false;
                }
                if (filter.email && !msg.from.includes(filter.email)) {
                    return false;
                }
                return true;
            });
        } catch (err) {
            console.error('The API returned an error:', err);
            throw err;
        }
    }

    async getMessages(messageId) {
        const gmail = google.gmail({ version: 'v1', auth: this.auth });
        try {
            const res = await gmail.users.messages.get({ userId: 'me', id: messageId });
            const message = res.data;
            const payload = message.payload || {};
            const headers = payload.headers || [];

            const subjectHeader = headers.find((header) => header.name === 'Subject');
            const fromHeader = headers.find((header) => header.name === 'From');
            const from = fromHeader ? fromHeader.value.match(/<(.+)>/)?.[1] || fromHeader.value : '(no sender)';

            return {
                id: message.id,
                subject: subjectHeader ? subjectHeader.value : '(no subject)',
                from,
                snippet: message.snippet,
            };
        } catch (error) {
            console.error('The API returned an error:', error);
            throw error;
        }
    }

    async getMessage(messageId) {
        const gmail = google.gmail({ version: 'v1', auth: this.auth });
        try {
            const res = await gmail.users.messages.get({ userId: 'me', id: messageId });

            const message = res.data;

            let rawData;
            if (message.payload.mimeType === 'text/html') {
                rawData = message.payload.body.data;
            } else {
                // Extract the raw content from the message payload
                rawData = message.payload.parts[0].body.data;
            }



            // Decode Base64 to UTF-8
            const decodedContent = rawData ? Buffer.from(rawData, 'base64').toString('utf-8') : "";

            return {
                id: message.id,
                subject: message.payload.headers.find((header) => header.name === 'Subject').value,
                body: decodedContent
            };
        } catch (err) {
            console.error('Error retrieving message:', err);
            throw err;
        }
    }
}

module.exports = GmailClient;
