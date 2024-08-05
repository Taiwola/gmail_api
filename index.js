const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs/promises');
const GmailClient = require('./controller/gmailController');
const app = express();
const port = 3000;

const gmailClient = new GmailClient();

app.use(express.json());

app.post('/authorize', async (req, res) => {
    try {
        const credentials = await gmailClient.loadCredentials();
        const authorization = await gmailClient.authorize(credentials);
        res.status(200).json({
            message: "Authorization is successful",
            authUrl: authorization
        });
    } catch (err) {
        res.status(500).send('Authorization failed.');
    }
});

app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    const credentialsPath = path.join(__dirname, 'credentials.json');


    try {
        const credentialsContent = await fs.readFile(credentialsPath);
        const credentials = JSON.parse(credentialsContent);

        // Destructure client_secret, client_id, and redirect_uris
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        await gmailClient.getAccessToken(oAuth2Client, code);
        res.status(200).json({
            message: "Authorization succussful"
        })
    } catch (error) {
        console.log(error);
        res.status(500).send('Authorization failed.');
    }
})

app.get('/messages', async (req, res) => {
    try {
        const { domain, email } = req.query;
        const filter = {};

        if (domain) {
            filter.domain = domain;
        }
        if (email) {
            filter.email = email;
        }

        const messages = await gmailClient.listMessages(filter);
        res.json(messages);
    } catch (err) {
        res.status(500).json({ message: 'Failed to retrieve messages.', err });
    }
});

app.get('/messages/:id', async (req, res) => {
    try {
        const messageId = req.params.id;
        const message = await gmailClient.getMessage(messageId);
        res.json(message);
    } catch (err) {
        res.status(500).send('Failed to retrieve message.');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
