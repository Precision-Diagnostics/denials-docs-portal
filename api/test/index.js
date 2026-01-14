const https = require('https');
const crypto = require('crypto');

module.exports = async function (context, req) {
    let step = "start";
    try {
        step = "get env";
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_CONTAINER_NAME || "documents";
        const searchTerm = req.query.q || "";
        
        step = "parse connection";
        const parts = {};
        connectionString.split(';').forEach(part => {
            const idx = part.indexOf('=');
            if (idx > 0) {
                parts[part.substring(0, idx)] = part.substring(idx + 1);
            }
        });
        
        const accountName = parts['AccountName'];
        const accountKey = parts['AccountKey'];
        
        step = "build signature";
        const date = new Date().toUTCString();
        const version = '2020-10-02';
        
        const canonicalizedResource = `/${accountName}/${containerName}\ncomp:list\nmaxresults:100\nprefix:${searchTerm}\nrestype:container`;
        const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:${version}\n${canonicalizedResource}`;
        
        step = "create hmac";
        const keyBuffer = Buffer.from(accountKey, 'base64');
        const hmac = crypto.createHmac('sha256', keyBuffer);
        hmac.update(stringToSign, 'utf8');
        const signature = hmac.digest('base64');
        
        step = "make request";
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
            
            const httpsReq = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });
            httpsReq.on('error', (e) => resolve({ statusCode: 0, data: e.message }));
            httpsReq.end();
        });
        
        step = "process response";
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                step: step,
                statusCode: result.statusCode,
                searchTerm: searchTerm,
                responsePreview: result.data.substring(0, 1000)
            })
        };
    } catch (error) {
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                failedAtStep: step,
                error: error.message,
                stack: error.stack
            })
        };
    }
};
