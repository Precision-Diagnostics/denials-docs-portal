const https = require('https');
const crypto = require('crypto');

module.exports = async function (context, req) {
    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_CONTAINER_NAME || "documents";
        const accessionNumber = req.query.accessionNumber || "";
        
        if (!accessionNumber) {
            context.res = {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Please provide an accessionNumber parameter" })
            };
            return;
        }
        
        const parts = {};
        connectionString.split(';').forEach(part => {
            const idx = part.indexOf('=');
            if (idx > 0) {
                parts[part.substring(0, idx)] = part.substring(idx + 1);
            }
        });
        
        const accountName = parts['AccountName'];
        const accountKey = parts['AccountKey'];
        
        const date = new Date().toUTCString();
        const version = '2020-10-02';
        
        const canonicalizedResource = `/${accountName}/${containerName}\ncomp:list\nmaxresults:100\nprefix:${accessionNumber}\nrestype:container`;
        const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:${version}\n${canonicalizedResource}`;
        
        const keyBuffer = Buffer.from(accountKey, 'base64');
        const hmac = crypto.createHmac('sha256', keyBuffer);
        hmac.update(stringToSign, 'utf8');
        const signature = hmac.digest('base64');
        
        const path = `/${containerName}?restype=container&comp=list&maxresults=100&prefix=${encodeURIComponent(accessionNumber)}`;
        
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
        
        if (result.statusCode !== 200) {
            context.res = {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: `Storage API error: ${result.statusCode}` })
            };
            return;
        }
        
        // Parse blobs from XML
        const blobs = [];
        const blobRegex = /<Blob>[\s\S]*?<\/Blob>/g;
        const matches = result.data.match(blobRegex) || [];
        
        matches.forEach(blobXml => {
            const name = extractValue(blobXml, 'Name');
            const size = extractValue(blobXml, 'Content-Length');
            const lastModified = extractValue(blobXml, 'Last-Modified');
            const contentType = extractValue(blobXml, 'Content-Type');
            
            if (name) {
                blobs.push({
                    name: name,
                    url: `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(name)}`,
                    size: parseInt(size) || 0,
                    lastModified: lastModified,
                    contentType: contentType || 'application/octet-stream'
                });
            }
        });
        
        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: blobs.length,
                accessionNumber: accessionNumber,
                results: blobs
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

function extractValue(xml, tag) {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1] : null;
}
