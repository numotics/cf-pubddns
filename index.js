import sqlite from 'sqlite3';
import express from 'express';

import config from './config.js';

const app = express();

const db = new sqlite.Database('./userdb.db');

if (config.cloudflare_token === undefined || config.cloudflare_zone_id === undefined) {
    console.error('CLOUDFLARE_TOKEN and CLOUDFLARE_ZONE_ID must be set');
    process.exit(1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let server = app.listen(config.port, () => {
    console.log(`Server running at http://${server.address().address}:${server.address().port}`);
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subdomain TEXT NOT NULL,
    recordId TEXT NOT NULL,
    passkey TEXT NOT NULL
)`);

app.post('/update', (req, res) => {
    const { subdomain, password, ip } = req.body;

    // Retrieve the user's API key and record ID from the SQLite database
    db.get(`SELECT recordId, password FROM users WHERE subdomain = ?`, [subdomain], (err, row) => {
        if (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        } else if (row) {
            if (row.password !== password) {
                res.status(401).send('Invalid password');
                return;
            }
            // Use the Cloudflare API to update the DNS record

            fetch(`https://api.cloudflare.com/client/v4/zones/${config.cloudflare_zone_id}/dns_records/${row.recordId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.cloudflare_token}`
                },
                body: JSON.stringify({
                    type: 'A',
                    name: subdomain,
                    content: ip,
                    proxied: true,
                })
            }).then(response => response.json()).then(data => {
                if (!data.success) { throw new Error(data.errors[0].message); }
                res.status(200).send("DNS record updated successfully");
            }).catch(error => {
                res.status(500).send('Internal Server Error: could not update DNS record');
            });

        } else {
            res.status(404).send('User not found');
        }
    });
});
