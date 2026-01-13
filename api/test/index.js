const https = require('https');
const crypto = require('crypto');

module.exports = async function (context, req) {
    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_CONTAINER_NAME || "documents";
        const searchTerm = req.query.q || "";
        
        const parts = {};
        connectionString.split(';').forEach(part => {
            const [key, ...valueParts] = part.split('=');
            if (key && valueParts.length > 0) {
                parts[key] = valueParts.join('=');
            }
        });
        
        const accountName = parts['AccountName'];
        const accountKey = parts['AccountKey'];
        
        const date = new Date().toUTCString();
        const version = '2020-10-02';
        
        const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:${version}\n/${accountName}/${containerName}\ncomp:list\nmaxresults:500\nrestype:container`;
        
        const keyBuffer = Buffer.from(accountKey, 'base64');
        const hmac = crypto.createHmac('sha256', keyBuffer);
        hmac.update(stringToSign, 'utf8');
        const signature = hmac.digest('base64');
        
        const result = await new Promise((resolve, reject) => {
            const options = {
                hostname: `${accountName}.blob.core.windows.net`,
                path: `/${containerName}?restype=container&comp=list&maxresults=500`,
                method: 'GET',
                headers: {
                    'x-ms-date': date,
                    'x-ms-version': version,
                    'Authorization': `SharedKey ${accountName}:${signature}`
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            req.on('error', reject);
            req.end();
        });
        
        // Extract blob names
        const names = [];
        const regex = /<Name>([^<]*)<\/Name>/g;
        let match;
        while ((match = regex.exec(result.data)) !== null) {
            names.push(match[1]);
        }
        
        // Filter by search term
        const filtered = searchTerm 
            ? names.filter(n => n.includes(searchTerm))
            : names.slice(0, 10);
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                searchTerm: searchTerm,
                totalInPage: names.length,
                matchCount: filtered.length,
                files: filtered
            })
        };
    } catch (error) {
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: error.message })
        };
    }
};
```

Commit, push, and test:
```
https://kind-stone-051bf3e1e.6.azurestaticapps.net/api/test?q=250537215
