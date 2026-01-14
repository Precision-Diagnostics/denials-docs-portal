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
        
        // Query params must be sorted alphabetically in signature
        // comp, maxresults, prefix, restype (alphabetical order)
        const canonicalizedResource = `/${accountName}/${containerName}\ncomp:list\nmaxresults:100\nprefix:${searchTerm}\nrestype:container`;
        
        const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:${version}\n${canonicalizedResource}`;
        
        const keyBuffer = Buffer.from(accountKey, 'base64');
        const hmac = crypto.createHmac('sha256', keyBuffer);
        hmac.update(stringToSign, 'utf8');
        const signature = hmac.digest('base64');
        
        // URL params can be in any order in the actual request
        const path = `/${containerName}?restype=container&comp=list&maxresults=100&prefix=${encodeURIComponent(searchTerm)}`;
        
        const result = await new Promise((resolve, reject) => {
            const options = {
                hostname: `${accountName}.blob.core.windows.net`,
                path: path,
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
            req.on('error', (e) => resolve({ statusCode: 0, data: e.message }));
            req.end();
        });
        
        if (result.statusCode !== 200) {
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    error: `API error ${result.statusCode}`,
                    searchTerm: searchTerm,
                    details: result.data.substring(0, 800)
                })
            };
            return;
        }
        
        // Extract blob names
        const names = [];
        const regex = /<Name>([^<]*)<\/Name>/g;
        let match;
        while ((match = regex.exec(result.data)) !== null) {
            names.push(match[1]);
        }
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                searchTerm: searchTerm,
                count: names.length,
                files: names
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
