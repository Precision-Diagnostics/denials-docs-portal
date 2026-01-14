const https = require('https');
const crypto = require('crypto');

module.exports = async function (context, req) {
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
    
    // Build signature with prefix
    const canonicalizedResource = `/${accountName}/${containerName}\ncomp:list\nmaxresults:100\nprefix:${searchTerm}\nrestype:container`;
    const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:${version}\n${canonicalizedResource}`;
    
    const keyBuffer = Buffer.from(accountKey, 'base64');
    const hmac = crypto.createHmac('sha256', keyBuffer);
    hmac.update(stringToSign, 'utf8');
    const signature = hmac.digest('base64');
    
    const url = `/${containerName}?restype=container&comp=list&maxresults=100&prefix=${encodeURIComponent(searchTerm)}`;
    
    const result = await new Promise((resolve, reject) => {
        const options = {
            hostname: `${accountName}.blob.core.windows.net`,
            path: url,
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
    
    context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            statusCode: result.statusCode,
            stringToSign: stringToSign,
            url: url,
            responsePreview: result.data.substring(0, 1000)
        })
    };
};
