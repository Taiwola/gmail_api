const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');
const fs = require('fs/promises');
const GmailClient = require('./controller/gmailController');
const app = express();
const port = 3000;

const gmailClient = new GmailClient();
const serviceAccountKeyPath = path.join(__dirname, 'service_account.json');
const serviceAccountKey = require(serviceAccountKeyPath);

const pubsubClient = new PubSub({
    keyFilename: serviceAccountKeyPath,
});

app.use(express.json());

app.get('/', async (req, res) => {
    res.status(200).json({ message: "Welcome" })
})

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

app.post('/push_notification', async (req, res) => {
    const message = Buffer.from(req.body.message.data, 'base64').toString('utf-8');
    console.log('Push notification received:', message);

    const emailId = message.id;
    const email = await gmailClient.getMessage(emailId);

    const sender = email.payload.headers.find((header) => header.name === 'From').value;

    console.log('Email received from:', sender);

    res.status(204).json({
        message: "Notification recieved",
        status: "success",
        data: email
    });
});

app.listen(port, async () => {
    console.log(`Server running at http://localhost:${port}`);

    try {
        const credentials = await gmailClient.loadCredentials();
        await gmailClient.authorize(credentials);
        await gmailClient.watch();
    } catch (error) {
        console.error('Failed to set up watch:', err);
    }
});
