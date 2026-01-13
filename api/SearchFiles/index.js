const https = require('https');

module.exports = async function (context, req) {
    context.log('Search function triggered');
    
    const accessionNumber = req.query.accessionNumber;
    
    if (!accessionNumber) {
        context.res = {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: "Please provide an accessionNumber parameter" })
        };
        return;
    }

    try {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        const containerName = process.env.AZURE_CONTAINER_NAME || "documents";
        
        if (!connectionString) {
            context.res = {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Storage connection not configured" })
            };
            return;
        }

        // Parse connection string
        const config = parseConnectionString(connectionString);
        
        // List blobs using REST API
        const blobs = await listBlobs(config.accountName, config.accountKey, containerName);
        
        // Filter by accession number
        const results = blobs
            .filter(blob => blob.name.includes(accessionNumber))
            .map(blob => ({
                name: blob.name,
                url: `https://${config.accountName}.blob.core.windows.net/${containerName}/${blob.name}`,
                size: blob.contentLength,
                lastModified: blob.lastModified,
                contentType: blob.contentType
            }));

        context.res = {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: results.length,
                accessionNumber: accessionNumber,
                results: results
            })
        };
    } catch (error) {
        context.log.error('Search error:', error);
        context.res = {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                error: `Search failed: ${error.message}`,
                details: error.toString()
            })
        };
    }
};

function parseConnectionString(connectionString) {
    const parts = {};
    connectionString.split(';').forEach(part => {
        const [key, ...valueParts] = part.split('=');
        if (key && valueParts.length > 0) {
            parts[key] = valueParts.join('=');
        }
    });
    return {
        accountName: parts['AccountName'],
        accountKey: parts['AccountKey']
    };
}

async function listBlobs(accountName, accountKey, containerName) {
    const date = new Date().toUTCString();
    const version = '2020-10-02';
    
    const stringToSign = `GET\n\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${date}\nx-ms-version:${version}\n/${accountName}/${containerName}\ncomp:list\nrestype:container`;
    
    const signature = createHmacSignature(accountKey, stringToSign);
    
    const options = {
        hostname: `${accountName}.blob.core.windows.net`,
        path: `/${containerName}?restype=container&comp=list`,
        method: 'GET',
        headers: {
            'x-ms-date': date,
            'x-ms-version': version,
            'Authorization': `SharedKey ${accountName}:${signature}`
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Blob list failed: ${res.statusCode} - ${data}`));
                    return;
                }
                const blobs = parseXmlBlobs(data);
                resolve(blobs);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function createHmacSignature(key, stringToSign) {
    const crypto = require('crypto');
    const keyBuffer = Buffer.from(key, 'base64');
    const hmac = crypto.createHmac('sha256', keyBuffer);
    hmac.update(stringToSign, 'utf8');
    return hmac.digest('base64');
}

function parseXmlBlobs(xml) {
    const blobs = [];
    const blobRegex = /<Blob>[\s\S]*?<\/Blob>/g;
    const matches = xml.match(blobRegex) || [];
    
    matches.forEach(blobXml => {
        const name = extractXmlValue(blobXml, 'Name');
        const contentLength = extractXmlValue(blobXml, 'Content-Length');
        const lastModified = extractXmlValue(blobXml, 'Last-Modified');
        const contentType = extractXmlValue(blobXml, 'Content-Type');
